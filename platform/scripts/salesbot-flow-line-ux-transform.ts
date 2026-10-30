function replaceUnique(source: string, anchor: string, replacement: string, label: string): string {
  const first = source.indexOf(anchor);
  if (first < 0) throw new Error(`[salesbot-flow-line-ux] ${label} não encontrado`);
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`[salesbot-flow-line-ux] ${label} ficou ambíguo`);
  }
  return source.replace(anchor, replacement);
}

const SCREEN_TO_WORLD_ANCHOR = `  function screenToWorld(sx: number, sy: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (sx - rect.left - pan.x) / scale, y: (sy - rect.top - pan.y) / scale };
  }`;

const SCREEN_TO_WORLD_WITH_FOCUS = `${SCREEN_TO_WORLD_ANCHOR}

  function focusConnectedBlock(targetId: string) {
    const target = active?.blocks.find((block) => block.id === targetId);
    const canvas = canvasRef.current;
    if (!target || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const element = Array.from(canvas.querySelectorAll<HTMLElement>("[data-block-id]"))
      .find((node) => node.dataset.blockId === targetId);
    const renderedHeight = element ? element.getBoundingClientRect().height / scale : BLOCK_H_EST;
    const centerX = (target.x ?? 0) + BLOCK_W / 2;
    const centerY = (target.y ?? 0) + renderedHeight / 2;
    setSelected(new Set([targetId]));
    setPan({
      x: rect.width / 2 - centerX * scale,
      y: rect.height / 2 - centerY * scale,
    });
  }`;

const MOUSE_UP_ANCHOR = `    function onUp() {
      setAddDrag((prev) => {
        if (!prev) return null;
        // Se soltou em cima de um bloco existente (que não seja o próprio origem), conecta a ele.
        const target = active?.blocks.find((blk) => {
          if (blk.id === prev.sourceId) return false;
          const bx = blk.x ?? 0;
          const by = blk.y ?? 0;
          return prev.pos.x >= bx && prev.pos.x <= bx + BLOCK_W
            && prev.pos.y >= by && prev.pos.y <= by + BLOCK_H_EST;
        });
        if (target) {
          connectExisting({ sourceId: prev.sourceId, optionId: prev.optionId, at: prev.pos }, target.id);
          setLooseEnds((m) => {
            if (!(prev.endId in m)) return m;
            const next = { ...m };
            delete next[prev.endId];
            return next;
          });
          return null;
        }
        if (prev.moved) {
          // Arrastou: só reposiciona a ponta solta, sem abrir o seletor de blocos.
          setLooseEnds((m) => ({
            ...m,
            [prev.endId]: { dx: prev.pos.x - prev.base.x, dy: prev.pos.y - prev.base.y },
          }));
          return null;
        }
        // Clique simples: abre o seletor de blocos.
        const at = { x: prev.origin.x + 40, y: prev.origin.y - 20 };
        setPendingConnection({ sourceId: prev.sourceId, optionId: prev.optionId, at });
        setPickerAt(at);
        return null;
      });
    }`;

const MOUSE_UP_REPLACEMENT = `    function onUp(e: MouseEvent) {
      const prev = addDrag;
      if (!prev) return;
      const dropPos = screenToWorld(e.clientX, e.clientY);
      const moved = prev.moved || Math.hypot(dropPos.x - prev.origin.x, dropPos.y - prev.origin.y) > 4;
      const blockElements = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? []);

      // Hit-test pela área REAL renderizada do bloco. Isso cobre blocos altos e
      // garante a conexão mesmo quando a ponta visual fica por baixo do card.
      const target = active?.blocks.find((blk) => {
        if (blk.id === prev.sourceId) return false;
        const element = blockElements.find((node) => node.dataset.blockId === blk.id);
        if (element) {
          const rect = element.getBoundingClientRect();
          return e.clientX >= rect.left && e.clientX <= rect.right
            && e.clientY >= rect.top && e.clientY <= rect.bottom;
        }
        const bx = blk.x ?? 0;
        const by = blk.y ?? 0;
        return dropPos.x >= bx && dropPos.x <= bx + BLOCK_W
          && dropPos.y >= by && dropPos.y <= by + BLOCK_H_EST;
      });

      if (target) {
        connectExisting({ sourceId: prev.sourceId, optionId: prev.optionId, at: dropPos }, target.id);
        setLooseEnds((current) => {
          if (!(prev.endId in current)) return current;
          const next = { ...current };
          delete next[prev.endId];
          return next;
        });
        setAddDrag(null);
        return;
      }

      if (moved) {
        // Arrastou e soltou fora de um bloco: preserva o comportamento atual,
        // apenas reposicionando a ponta aberta.
        setLooseEnds((current) => ({
          ...current,
          [prev.endId]: { dx: dropPos.x - prev.base.x, dy: dropPos.y - prev.base.y },
        }));
        setAddDrag(null);
        return;
      }

      // Clique simples: abre o seletor de blocos.
      const at = { x: prev.origin.x + 40, y: prev.origin.y - 20 };
      setPendingConnection({ sourceId: prev.sourceId, optionId: prev.optionId, at });
      setPickerAt(at);
      setAddDrag(null);
    }`;

const BLOCK_WRAPPER_ANCHOR = ` key={block.id}
 data-block-wrapper="1"
 style={{ position: "absolute", left: block.x?? 0, top: block.y?? 0, width: BLOCK_W }}`;

const BLOCK_WRAPPER_REPLACEMENT = ` key={block.id}
 data-block-wrapper="1"
 data-block-id={block.id}
 style={{ position: "absolute", left: block.x?? 0, top: block.y?? 0, width: BLOCK_W }}`;

const FLOW_LINE_TYPE_ANCHOR = `type FlowLine = { id: string; x1: number; y1: number; x2: number; y2: number; dashed?: boolean; open?: boolean };`;
const FLOW_LINE_TYPE_REPLACEMENT = `type FlowLine = { id: string; x1: number; y1: number; x2: number; y2: number; dashed?: boolean; open?: boolean; targetId?: string };`;

const CONNECTED_LINE_ANCHOR = ` lines.push({ id, x1: fromX, y1: fromY, x2: to.x?? 0, y2: (to.y?? 0) + 44, dashed });`;
const CONNECTED_LINE_REPLACEMENT = ` lines.push({ id, x1: fromX, y1: fromY, x2: to.x?? 0, y2: (to.y?? 0) + 44, dashed, targetId: toId });`;

const FLOW_LAYER_RENDER_ANCHOR = `                <ConnectionLayer lines={flow.lines} />`;
const FLOW_LAYER_RENDER_REPLACEMENT = `                <ConnectionLayer
                  lines={flow.lines}
                  onLineClick={(line) => {
                    if (line.targetId) focusConnectedBlock(line.targetId);
                  }}
                />`;

const CONNECTION_LAYER_ANCHOR = `function ConnectionLayer({ lines }: { lines: FlowLine[] }) {
 return (
 <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0, width: 1, height: 1 }}>
 <defs>
 <marker id="auto-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
 <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
 </marker>
 </defs>
 {lines.map((l) => {
 const mid = Math.max(40, (l.x2 - l.x1) / 2);
 return (
 <path
 key={l.id}
 d={\`M \${l.x1} \${l.y1} C \${l.x1 + mid} \${l.y1}, \${l.x2 - mid} \${l.y2}, \${l.x2} \${l.y2}\`}
 fill="none"
 stroke="var(--primary)"
 strokeWidth="2"
 strokeDasharray={l.dashed? "6 5": undefined}
 markerEnd={l.open? undefined: "url(#auto-arrow)"}
 />
 );
 })}
 </svg>
 );
}`;

const CONNECTION_LAYER_REPLACEMENT = `function ConnectionLayer({
 lines,
 onLineClick,
}: {
 lines: FlowLine[];
 onLineClick?: (line: FlowLine) => void;
}) {
 return (
 <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0, width: 1, height: 1 }}>
 <defs>
 <marker id="auto-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
 <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
 </marker>
 </defs>
 {lines.map((l) => {
 const mid = Math.max(40, (l.x2 - l.x1) / 2);
 const d = \`M \${l.x1} \${l.y1} C \${l.x1 + mid} \${l.y1}, \${l.x2 - mid} \${l.y2}, \${l.x2} \${l.y2}\`;
 const clickable = Boolean(onLineClick && l.targetId && !l.open);
 return (
 <g key={l.id}>
 {clickable && (
  <path
   d={d}
   fill="none"
   stroke="transparent"
   strokeWidth="14"
   style={{ pointerEvents: "stroke", cursor: "pointer" }}
   onMouseDown={(e) => e.stopPropagation()}
   onClick={(e) => {
    e.stopPropagation();
    onLineClick?.(l);
   }}
  />
 )}
 <path
 d={d}
 fill="none"
 stroke="var(--primary)"
 strokeWidth="2"
 strokeDasharray={l.dashed? "6 5": undefined}
 markerEnd={l.open? undefined: "url(#auto-arrow)"}
 style={{ pointerEvents: "none" }}
 />
 </g>
 );
 })}
 </svg>
 );
}`;

export function applySalesbotFlowLineUxTransform(source: string): string {
  let next = source;
  next = replaceUnique(next, SCREEN_TO_WORLD_ANCHOR, SCREEN_TO_WORLD_WITH_FOCUS, "helper screenToWorld");
  next = replaceUnique(next, MOUSE_UP_ANCHOR, MOUSE_UP_REPLACEMENT, "mouseup da ponta aberta");
  next = replaceUnique(next, BLOCK_WRAPPER_ANCHOR, BLOCK_WRAPPER_REPLACEMENT, "wrapper do bloco");
  next = replaceUnique(next, FLOW_LINE_TYPE_ANCHOR, FLOW_LINE_TYPE_REPLACEMENT, "tipo FlowLine");
  next = replaceUnique(next, CONNECTED_LINE_ANCHOR, CONNECTED_LINE_REPLACEMENT, "linha conectada");
  next = replaceUnique(next, FLOW_LAYER_RENDER_ANCHOR, FLOW_LAYER_RENDER_REPLACEMENT, "render da camada de conexões");
  next = replaceUnique(next, CONNECTION_LAYER_ANCHOR, CONNECTION_LAYER_REPLACEMENT, "ConnectionLayer");
  return next;
}
