import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  GitBranch,
  Target,
  Sprout,
  Flag,
  Zap,
  Check,
  Package,
  BookOpen,
  Maximize2,
  Move,
  Lock,
  AlertTriangle,
  Radar,
  Filter,
  Play,
  Minus,
  Bot,
  Map as MapIcon,
  X,
  ChevronUp,
  ChevronDown,
  Percent,
} from "lucide-react";

import type { ObjectiveBlockKind, ObjectiveNode, ObjectiveTree } from "./ObjectiveTree";

export const CONTEXT_ID = "__context__";
export const END_ID = "__end__";

/** Blocos são círculos: largura = altura = NODE_W. */
const NODE_W = 156;
const COL_GAP = 250;
const ROW_GAP = 186;
/** Os cabos saem/entram no meio do círculo. */
const PORT_Y = NODE_W / 2;

export type NodePos = { x: number; y: number };

/** Aparência e rótulo de cada tipo de bloco do fluxo. */
export const BLOCK_META: Record<ObjectiveBlockKind, { label: string; tone: "neutral" | "amber" | "violet" | "sky"; icon: React.ReactNode; hint: string }> = {
  objetivo: { label: "Objetivo", tone: "neutral", icon: <GitBranch className="w-3 h-3" />, hint: "A IA conduz a conversa até cumprir esta etapa." },
  acao: { label: "Ação", tone: "amber", icon: <Zap className="w-3 h-3" />, hint: "Executa ações no CRM sem falar com o lead." },
  condicao: { label: "Condição", tone: "violet", icon: <Filter className="w-3 h-3" />, hint: "Divide o fluxo em caminho então / senão." },
  tracking: { label: "Tracking", tone: "sky", icon: <Radar className="w-3 h-3" />, hint: "Consulta UTMS e eventos para direcionar melhor o atendimento." },
};

type Placed = {
  id: string;
  x: number;
  y: number;
  kind: "context" | "root" | "node" | "end";
  node?: ObjectiveNode;
  depth: number;
  parentId?: string;
  when?: string;
  /** Cabo fixo (contexto → objetivo final): não pode ser rompido. */
  locked?: boolean;
  /** Cabo tracejado (encerramento). */
  dashed?: boolean;
};

/** Layout automático (esquerda → direita) usado quando o bloco ainda não foi arrastado. */
function autoLayout(tree: ObjectiveTree): Record<string, NodePos> {
  const pos: Record<string, NodePos> = { ...tree.positions };
  let row = 0;
  let maxDepth = 0;

  const walk = (node: ObjectiveNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    if (pos[node.id]) return pos[node.id].y;
    
    if (node.children.length === 0) {
      const y = row * ROW_GAP;
      row += 1;
      pos[node.id] = { x: depth * COL_GAP, y };
      return y;
    }
    const ys = node.children.map((c) => walk(c, depth + 1));
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    pos[node.id] = { x: depth * COL_GAP, y };
    return y;
  };

  const rootY = walk(tree.root, 1);
  if (!pos[CONTEXT_ID]) pos[CONTEXT_ID] = { x: 0, y: rootY };
  if (!pos[END_ID]) pos[END_ID] = { x: (maxDepth + 1) * COL_GAP, y: rootY };
  return pos;
}

function collect(tree: ObjectiveTree, positions: Record<string, NodePos>): Placed[] {
  const auto = autoLayout(tree);
  const at = (id: string) => positions[id] ?? auto[id] ?? { x: 0, y: 0 };
  const out: Placed[] = [{ id: CONTEXT_ID, kind: "context", depth: 0, ...at(CONTEXT_ID) }];
  const walk = (node: ObjectiveNode, depth: number, parentId: string) => {
    out.push({
      id: node.id,
      kind: depth === 1 ? "root" : "node",
      node,
      depth,
      parentId,
      when: node.when,
      locked: false, // contexto → objetivo final é fixo, mas liberado agora
      ...at(node.id),
    });
    node.children.forEach((c) => walk(c, depth + 1, node.id));
  };
  walk(tree.root, 1, CONTEXT_ID);
  // O bloco "Encerrar agente" NÃO é padrão: ele só existe depois que você
  // puxa um cabo até ele (ou cria pelo menu "Criar bloco").
  if ((tree.endFrom ?? []).length > 0) {
    out.push({ id: END_ID, kind: "end", depth: 99, ...at(END_ID) });
  }
  return out;
}


/** ids de todos os descendentes (pra impedir cabo que gera ciclo). */
function descendants(node: ObjectiveNode): string[] {
  return node.children.flatMap((c) => [c.id, ...descendants(c)]);
}

export function ObjectiveCanvas({
  tree,
  selectedId,
  selectedIds = [],
  onSelect,
  onAddChild,
  onRemoveNode,
  onDisconnect,
  onMove,
  onMoveMany,
  onConnect,
  onCreateFrom,
  onConnectEnd,

  outcomeCount,
  fullscreen,
  onTest,
}: {
  tree: ObjectiveTree;
  selectedId: string;
  /** Seleção múltipla (Ctrl/Shift + clique, Ctrl+A ou laço no fundo). */
  selectedIds?: string[];
  onSelect: (id: string, additive?: boolean) => void;
  onAddChild: (parentId: string, kind?: ObjectiveBlockKind, when?: string) => void;
  onMove: (id: string, pos: NodePos) => void;
  /** Move vários blocos de uma vez (arraste com seleção múltipla). */
  onMoveMany?: (moves: Array<{ id: string; pos: NodePos }>) => void;
  /** Reconecta um bloco: `childId` passa a sair de `fromId`. */
  onConnect?: (fromId: string, childId: string) => void;
  /** Solta o cabo no vazio → cria um novo bloco saindo de `fromId` naquela posição. */
  onCreateFrom?: (fromId: string, pos: NodePos, kind?: ObjectiveBlockKind, when?: string) => void;
  /** Liga um bloco ao "Encerrar agente" (cria o bloco de encerramento se ainda não existir). */
  onConnectEnd?: (fromId: string, pos?: NodePos | null) => void;
  onRemoveNode?: (id: string) => void;
  onDisconnect?: (fromId: string, toId: string) => void;
  outcomeCount: number;

  fullscreen?: boolean;
  /** Abre o chat de teste do agente com a configuração atual. */
  onTest?: () => void;
}) {
  const positions = tree.positions ?? {};
  const placed = useMemo(() => collect(tree, positions), [tree, positions]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState<NodePos>({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origin: NodePos;
    group?: Array<{ id: string; origin: NodePos }>;
    isPanning?: boolean;
  } | null>(null);
  /** Laço de seleção (Shift + arraste no fundo). */
  const marqueeRef = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [linking, setLinking] = useState<{ fromId: string; x: number; y: number } | null>(null);

  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  /** Menu "que bloco você quer criar aqui?" (soltou o cabo no vazio ou clicou no +). */
  const [picker, setPicker] = useState<{ fromId: string; pos: NodePos | null; left: number; top: number; branching: boolean } | null>(null);
  /** Condição do caminho quando o bloco de origem já tem saída (ramificação). */
  const [pickerWhen, setPickerWhen] = useState("");

  /** Tamanho visível do canvas (pro retângulo do minimapa). */
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [mapOpen, setMapOpen] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);




  const toCanvas = useCallback(
    (clientX: number, clientY: number): NodePos => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
    },
    [pan, zoom],
  );

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const p = byId.get(id);
      // Se o bloco faz parte da seleção múltipla, arrasta o grupo inteiro.
      const group =
        selectedIds.length > 1 && selectedIds.includes(id)
          ? selectedIds
              .map((sid) => byId.get(sid))
              .filter((n): n is Placed => !!n)
              .map((n) => ({ id: n.id, origin: { x: n.x, y: n.y } }))
          : undefined;
      dragRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: p?.x ?? 0, y: p?.y ?? 0 },
        ...(group ? { group } : {}),
      };
    },
    [byId, selectedIds],
  );

  const onBgPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      // Shift + arraste no fundo OU Ctrl + arraste no fundo = laço de seleção múltipla.
      if (e.shiftKey || isMod) {
        const p = toCanvas(e.clientX, e.clientY);
        marqueeRef.current = p;
        setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        return;
      }
      // Arraste normal (sem modificador) movimenta a tela.
      dragRef.current = { id: null, startX: e.clientX, startY: e.clientY, origin: { ...pan }, isPanning: true };
    },
    [pan, toCanvas],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (marqueeRef.current) {
        const p = toCanvas(e.clientX, e.clientY);
        const s = marqueeRef.current;
        setMarquee({ x1: s.x, y1: s.y, x2: p.x, y2: p.y });
        return;
      }
      if (linking) {
        const p = toCanvas(e.clientX, e.clientY);
        setLinking((l) => (l ? { ...l, x: p.x, y: p.y } : l));
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      if (d.id === null) {
        if (!d.isPanning) return;
        setPan({ x: d.origin.x + dx * zoom, y: d.origin.y + dy * zoom });
      } else if (d.group && onMoveMany) {
        onMoveMany(
          d.group.map((g) => ({
            id: g.id,
            pos: { x: Math.round(g.origin.x + dx), y: Math.round(g.origin.y + dy) },
          })),
        );
      } else {
        onMove(d.id, { x: Math.round(d.origin.x + dx), y: Math.round(d.origin.y + dy) });
      }
    },
    [linking, onMove, onMoveMany, toCanvas, zoom],
  );


  /** Quantos caminhos já saem deste bloco (pra saber se o novo cabo é ramificação). */
  const outCount = useCallback(
    (id: string) => {
      const node = findIn(tree.root, id);
      const kids = node?.children.length ?? 0;
      return kids + ((tree.endFrom ?? []).includes(id) ? 1 : 0);
    },
    [tree.root, tree.endFrom],
  );

  const finishLink = useCallback(
    (e: React.PointerEvent) => {
      // Fecha o laço de seleção: tudo que ficou dentro entra na seleção.
      if (marqueeRef.current) {
        const s = marqueeRef.current;
        const p = toCanvas(e.clientX, e.clientY);
        const x1 = Math.min(s.x, p.x);
        const x2 = Math.max(s.x, p.x);
        const y1 = Math.min(s.y, p.y);
        const y2 = Math.max(s.y, p.y);
        placed
          .filter((n) => n.x + NODE_W > x1 && n.x < x2 && n.y + NODE_W > y1 && n.y < y2)
          .forEach((n) => onSelect(n.id, true));
        marqueeRef.current = null;
        setMarquee(null);
        dragRef.current = null;
        return;
      }
      if (linking) {
        if (hoverTarget && hoverTarget !== linking.fromId) {
          if (hoverTarget === END_ID) onConnectEnd?.(linking.fromId);
          else onConnect?.(linking.fromId, hoverTarget);
        } else if (!hoverTarget) {
          const p = toCanvas(e.clientX, e.clientY);
          const r = wrapRef.current?.getBoundingClientRect();
          setPickerWhen("");
          setPicker({
            fromId: linking.fromId,
            pos: { x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - PORT_Y) },
            left: r ? e.clientX - r.left : 0,
            top: r ? e.clientY - r.top : 0,
            branching: outCount(linking.fromId) > 0,
          });
        }
      }
      setLinking(null);
      setHoverTarget(null);
      dragRef.current = null;
    },
    [hoverTarget, linking, onConnect, onConnectEnd, onSelect, outCount, placed, toCanvas],
  );



  /** Alvos válidos pra receber um cabo (não pode ser o contexto, a raiz, nem descendente da origem). */
  const invalidTargets = useMemo(() => {
    if (!linking) return new Set<string>();
    const set = new Set<string>([CONTEXT_ID, tree.root.id, linking.fromId]);
    const from = findIn(tree.root, linking.fromId);
    if (from) descendants(from).forEach((id) => set.add(id));
    return set;
  }, [linking, tree.root]);

  const edges = placed
    .filter((p) => p.parentId && byId.has(p.parentId))
    .map((p) => ({ from: byId.get(p.parentId!)!, to: p, locked: p.locked, dashed: false, back: false }));

  // Cabos até o bloco de encerramento: só os que VOCÊ ligou (nada é automático).
  const endBlock = byId.get(END_ID);
  const endEdges = endBlock
    ? (tree.endFrom ?? [])
        .map((id) => byId.get(id))
        .filter((p): p is Placed => !!p)
        .map((p) => ({ from: p, to: endBlock, locked: false, dashed: true, back: false }))
    : [];

  // Desvio: o bloco resolve o assunto e devolve o lead pro objetivo de onde saiu.
  const returnEdges = placed
    .filter((p) => p.node?.returnAfter && p.parentId && byId.has(p.parentId))
    .map((p) => ({ from: p, to: byId.get(p.parentId!)!, locked: false, dashed: false, back: true }));



  const bounds = placed.reduce(
    (acc, p) => ({ w: Math.max(acc.w, p.x + NODE_W + 320), h: Math.max(acc.h, p.y + 260) }),
    { w: 900, h: 500 },
  );

  // ---------------------------------------------------------------------------
  // Minimapa: caixa que contém tudo + fator de escala pra caber no quadradinho.
  // ---------------------------------------------------------------------------
  const MM_W = 208;
  const MM_H = 132;
  const MM_PAD = 8;
  const box = placed.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x + NODE_W),
      maxY: Math.max(acc.maxY, p.y + NODE_W),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const boxW = Math.max(1, box.maxX - box.minX);
  const boxH = Math.max(1, box.maxY - box.minY);
  const mmScale = Math.min((MM_W - MM_PAD * 2) / boxW, (MM_H - MM_PAD * 2) / boxH);
  const mmX = (x: number) => MM_PAD + (x - box.minX) * mmScale;
  const mmY = (y: number) => MM_PAD + (y - box.minY) * mmScale;

  /** Centraliza o canvas num ponto (coordenadas do fluxo). */
  const centerOn = useCallback(
    (cx: number, cy: number) => {
      const w = viewSize.w || 800;
      const h = viewSize.h || 500;
      setPan({ x: w / 2 - cx * zoom, y: h / 2 - cy * zoom });
    },
    [viewSize.w, viewSize.h, zoom],
  );

  /** Enquadra o fluxo inteiro na tela. */
  const fitAll = useCallback(() => {
    const w = viewSize.w || 800;
    const h = viewSize.h || 500;
    const z = Math.min(1.2, Math.max(0.4, Math.min((w - 80) / boxW, (h - 80) / boxH)));
    setZoom(+z.toFixed(2));
    setPan({
      x: w / 2 - ((box.minX + box.maxX) / 2) * z,
      y: h / 2 - ((box.minY + box.maxY) / 2) * z,
    });
  }, [viewSize.w, viewSize.h, boxW, boxH, box.minX, box.maxX, box.minY, box.maxY]);

  const onMiniPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const cx = box.minX + (e.clientX - r.left - MM_PAD) / mmScale;
    const cy = box.minY + (e.clientY - r.top - MM_PAD) / mmScale;
    centerOn(cx, cy);
  };

  // Retângulo do que está visível agora, em coordenadas do minimapa.
  const viewRect = {
    x: mmX(-pan.x / zoom),
    y: mmY(-pan.y / zoom),
    w: ((viewSize.w || 0) / zoom) * mmScale,
    h: ((viewSize.h || 0) / zoom) * mmScale,
  };



  return (
    <div
      ref={wrapRef}
      className="relative border border-border rounded-xl bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] [background-size:22px_22px] bg-background/40 overflow-hidden w-full h-full flex flex-col"
      onPointerDown={onBgPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishLink}
      onPointerLeave={finishLink}
    >
      {/* Barra de controle */}
      <div className="absolute z-20 top-2 left-2 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 backdrop-blur px-2 py-1 text-[10px] text-muted-foreground">
        <Move className="w-3 h-3" />
        <span>
          arraste o fundo pra mover · puxe a bolinha da direita pra ligar · <b>Shift ou Ctrl + arraste</b> seleciona vários
        </span>
        {selectedIds.length > 1 && (
          <span className="ml-1 px-1.5 py-[1px] rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold">
            {selectedIds.length} blocos selecionados
          </span>
        )}
      </div>
      <div className="absolute z-20 top-2 right-2 flex items-center gap-1">
        {onTest && (
          <button
            type="button"
            onClick={onTest}
            title="Testar o agente agora"
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            <Bot className="w-3.5 h-3.5" /> Testar Agente
          </button>
        )}
        <CtrlBtn onClick={() => setMapOpen((v) => !v)} title={mapOpen ? "Esconder o mapa" : "Mostrar o mapa"}>
          <MapIcon className={`w-3.5 h-3.5 ${mapOpen ? "text-primary" : ""}`} />
        </CtrlBtn>
        <div className="flex items-center gap-1 p-1 bg-background/60 backdrop-blur-md border border-border rounded-lg shadow-sm">
          <CtrlBtn onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="Reduzir">
            <Minus className="w-3.5 h-3.5" />
          </CtrlBtn>
          <span className="text-[10px] font-mono w-9 text-center tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <CtrlBtn onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))} title="Ampliar">
            <Plus className="w-3.5 h-3.5" />
          </CtrlBtn>
        </div>
        <CtrlBtn onClick={fitAll} title="Enquadrar o fluxo inteiro">
          <Maximize2 className="w-3.5 h-3.5" />
        </CtrlBtn>
      </div>


      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        <svg width={bounds.w} height={bounds.h} className="absolute inset-0 pointer-events-none overflow-visible">
          <defs>
            <marker id="obj-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.2" orient="auto">
              <path d="M0,0 L8,3.2 L0,6.4 z" fill="var(--primary)" />
            </marker>
            <marker id="obj-arrow-soft" markerWidth="10" markerHeight="10" refX="8" refY="3.2" orient="auto">
              <path d="M0,0 L8,3.2 L0,6.4 z" fill="var(--muted-foreground)" opacity="0.6" />
            </marker>
          </defs>
          {[...edges, ...endEdges, ...returnEdges].map(({ from, to, locked, dashed, back }) => {
            const x1 = back ? from.x : from.x + NODE_W;
            const y1 = from.y + PORT_Y;
            const x2 = back ? to.x + NODE_W : to.x;
            const y2 = to.y + PORT_Y;
            const mx = (x1 + x2) / 2;
            const bend = back ? Math.max(90, Math.abs(y2 - y1)) : 0;
            const d = back
              ? `M ${x1} ${y1} C ${x1 - bend} ${y1 + bend}, ${x2 + bend} ${y2 + bend}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
            
            // Renderiza label de condição (Então/Senão) ou Tracking (Sucesso/Falha)
            let conditionLabel = "";
            let labelTone: "emerald" | "rose" | "sky" = "emerald";

            if (!dashed && !back) {
              const children = from.node?.children || [];
              const childIdx = children.findIndex(c => c.id === to.id);

              if (from.node?.block === "condicao") {
                if (childIdx === 0) conditionLabel = "Então";
                else if (childIdx === 1) {
                  conditionLabel = "Senão";
                  labelTone = "rose";
                }
              } else if (from.node?.block === "tracking") {
                labelTone = "sky";
                if (childIdx === 0) conditionLabel = "Sucesso";
                else if (childIdx === 1) {
                  conditionLabel = "Falha";
                  labelTone = "rose";
                }
              }
            }

            return (
              <g key={`${from.id}-${to.id}-${dashed ? "end" : back ? "back" : "flow"}`} className="group/edge">
                <path
                  d={d}
                  fill="none"
                  stroke={dashed || back ? "var(--muted-foreground)" : "var(--primary)"}
                  strokeOpacity={dashed || back ? 0.55 : locked ? 1 : 0.85}
                  strokeWidth={locked ? 3 : 2.5}
                  strokeLinecap="round"
                  strokeDasharray={dashed || back ? "6 6" : undefined}
                  markerEnd={dashed || back ? "url(#obj-arrow-soft)" : "url(#obj-arrow)"}
                />
                
                {/* Área de hover invisível para facilitar o clique */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={15}
                  className="cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                />

                {!locked && (
                  <foreignObject 
                    x={mx - 10} 
                    y={(y1 + y2) / 2 - 10} 
                    width={20} 
                    height={20}
                    className="opacity-0 group-hover/edge:opacity-100 transition-opacity"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (dashed) {
                          // Se for cabo de encerramento, remove da lista endFrom
                          onConnectEnd?.(from.id, null);
                        } else {
                          onDisconnect?.(from.id, to.id);
                        }
                      }}
                      className="w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-all cursor-pointer"
                      title="Excluir ligação"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </foreignObject>
                )}

                {conditionLabel && (
                  <foreignObject x={mx - 25} y={(y1 + y2) / 2 - 12} width={50} height={24}>
                    <div className={`flex items-center justify-center text-[9px] font-bold px-1.5 py-0.5 rounded-md border shadow-sm ${
                      labelTone === "emerald" 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                        : labelTone === "sky"
                          ? "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                    }`}>
                      {conditionLabel}
                    </div>
                  </foreignObject>
                )}

                <circle cx={x1} cy={y1} r={3.5} fill="var(--primary)" fillOpacity={dashed || back ? 0.4 : 0.9} />
                {locked && (
                  <foreignObject x={mx - 26} y={(y1 + y2) / 2 - 11} width={52} height={22}>
                    <div className="flex items-center justify-center gap-0.5 text-[8px] px-1 py-[2px] rounded-full border border-primary/40 bg-card text-primary opacity-50">
                      <Lock className="w-2 h-2" /> fixo
                    </div>
                  </foreignObject>
                )}
                {back && (
                  <foreignObject x={(x1 + x2) / 2 - 40} y={Math.max(y1, y2) + bend / 2 - 10} width={80} height={20}>
                    <div className="text-[8px] text-center px-1 py-[2px] rounded-full border border-border bg-card text-muted-foreground">
                      volta ao fluxo
                    </div>
                  </foreignObject>
                )}
                {!locked && !dashed && !back && !conditionLabel && to.when?.trim() && (
                  <foreignObject x={mx - 70} y={(y1 + y2) / 2 - 38} width={150} height={44}>
                    <div className="text-[9px] leading-tight text-center px-1.5 py-1 rounded-full border border-primary/30 bg-card text-muted-foreground line-clamp-2">
                      {to.when}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Cabo sendo puxado */}
          {linking &&
            (() => {
              const from = byId.get(linking.fromId);
              if (!from) return null;
              const x1 = from.x + NODE_W;
              const y1 = from.y + PORT_Y;
              const mx = (x1 + linking.x) / 2;
              return (
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${linking.y}, ${linking.x} ${linking.y}`}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                />
              );
            })()}
        </svg>


        {marquee && (
          <div
            className="absolute border-2 border-sky-500/70 bg-sky-500/10 rounded pointer-events-none"
            style={{
              left: Math.min(marquee.x1, marquee.x2),
              top: Math.min(marquee.y1, marquee.y2),
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
            }}
          />
        )}

        {placed.map((p) => {
          const isValidDrop = !!linking && !invalidTargets.has(p.id);
          const inMulti = selectedIds.includes(p.id);
          const common = {
            selected: selectedId === p.id,
            multi: inMulti,
            dropActive: isValidDrop,
            dropHover: hoverTarget === p.id && isValidDrop,
            onDropEnter: () => isValidDrop && setHoverTarget(p.id),
            onDropLeave: () => setHoverTarget((h) => (h === p.id ? null : h)),
          };

          return (
            <div
              key={p.id}
              className="absolute"
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_W }}
              onPointerDown={(e) => onNodePointerDown(e, p.id)}
            >
              {p.kind === "context" ? (
                <MiniCard
                  {...common}
                  selected={selectedId === CONTEXT_ID}
                  tone="emerald"
                  icon={<Sprout className="w-3 h-3" />}
                  label="Contexto Geral"
                  title={tree.context?.trim() || "Persona, tom de voz e regras…"}
                  subtitle={tree.root.expected?.trim() || "Objetivo final do agente"}
                  onSelect={() => onSelect(CONTEXT_ID, false)}
                  outPort={{ locked: false }}
                  chips={[
                    { icon: <BookOpen className="w-2.5 h-2.5" />, text: `${(tree.sources ?? []).length} fontes` },
                    { icon: <Package className="w-2.5 h-2.5" />, text: `${(tree.products ?? []).length} produtos` },
                    ...((tree.discounts ?? []).length ? [{ text: `${(tree.discounts ?? []).length} desconto(s)` }] : []),
                  ]}
                />
              ) : p.kind === "end" ? (
                <MiniCard
                  {...common}
                  selected={selectedId === END_ID}
                  tone="rose"
                  icon={<Flag className="w-3 h-3" />}
                  label="Encerrar agente"
                  title={outcomeCount > 0 ? `${outcomeCount} ação(ões) no encerramento` : "Defina o desfecho do lead"}
                  onSelect={() => onSelect(END_ID, false)}
                  inPort
                />
              ) : (
                (() => {
                  const bk: ObjectiveBlockKind = p.kind === "root" ? "objetivo" : p.node?.block ?? "objetivo";
                  const meta = BLOCK_META[bk];
                  const acts = p.node?.actions?.filter((a) => a.action).length ?? 0;
                  const conds = p.node?.conditions?.length ?? 0;
                  const tr = p.node?.tracking;
                  return (
                    <MiniCard
                      {...common}
                      selected={selectedId === p.id}
                      tone={p.kind === "root" ? "primary" : meta.tone}
                      icon={p.kind === "root" ? <Target className="w-3 h-3" /> : meta.icon}
                      label={p.id === tree.root.id ? "Contexto Geral" : meta.label}
                      onRemove={p.kind === "root" ? undefined : () => onRemoveNode?.(p.id)}
                      title={
                        p.node?.say?.trim() ||
                        (bk === "tracking"
                          ? "Consultar UTMs e Eventos →"
                          : bk === "condicao"
                            ? "Defina a condição →"
                            : bk === "acao"
                              ? "Escolha as ações →"
                              : "Descreva o objetivo →")
                      }
                      subtitle={bk === "objetivo" ? p.node?.expected?.trim() : undefined}
                      chips={[
                        ...(bk === "tracking" && tr
                          ? [
                              {
                                icon: <Radar className="w-2.5 h-2.5" />,
                                text: `${tr.event === "custom" ? tr.customEvent || "evento" : tr.event} · ${tr.everyMinutes ?? 5}min`,
                              },
                            ]
                          : []),
                        ...(bk === "condicao"
                          ? [
                              {
                                icon: <Filter className="w-2.5 h-2.5" />,
                                text: `${conds} condição(ões) · ${(p.node?.conditionLogic ?? "e").toUpperCase()}`,
                              },
                            ]
                          : []),
                        ...(acts > 0 ? [{ icon: <Zap className="w-2.5 h-2.5" />, text: `${acts} ação` }] : []),
                        ...((p.node?.fallbacks?.length ?? 0) > 0
                          ? [
                              {
                                icon: <AlertTriangle className="w-2.5 h-2.5" />,
                                text: `${p.node!.fallbacks!.length} gatilho`,
                              },
                            ]
                          : []),
                        ...(p.node?.returnAfter ? [{ text: "desvio · volta ao fluxo" }] : []),
                        ...((p.node?.children.length ?? 0) > 1
                          ? [{ text: bk === "condicao" ? "então / senão" : `${p.node!.children.length} caminhos` }]
                          : []),
                      ]}
                      onSelect={() => onSelect(p.id, false)}
                      onAdd={(e: React.MouseEvent) => {
                        const r = wrapRef.current?.getBoundingClientRect();
                        setPickerWhen("");
                        setPicker({
                          fromId: p.id,
                          pos: null,
                          left: r ? e.clientX - r.left : 0,
                          top: r ? e.clientY - r.top : 0,
                          branching: outCount(p.id) > 0,
                        });
                      }}

                      inPort={p.kind !== "root"}
                      outPort={{
                        locked: false,
                        onStart: (e: React.PointerEvent) => {
                          e.stopPropagation();
                          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                          dragRef.current = null;
                          const pt = toCanvas(e.clientX, e.clientY);
                          setLinking({ fromId: p.id, x: pt.x, y: pt.y });
                        },
                      }}


                    />
                  );
                })()
              )}

            </div>
          );
        })}
      </div>

      {/* Minimapa: visão geral do fluxo inteiro, clique pra pular pro trecho. */}
      {mapOpen && (
        <div
          className="absolute z-20 bottom-2 left-2 rounded-lg border border-border bg-card/95 backdrop-blur shadow-lg overflow-hidden select-none"
          style={{ width: MM_W, height: MM_H + 18 }}
          onPointerDown={onMiniPointer}
          onPointerMove={(e) => {
            if (e.buttons === 1) onMiniPointer(e);
          }}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 px-2 h-[18px] border-b border-border text-[9px] text-muted-foreground">
            <MapIcon className="w-2.5 h-2.5" /> mapa do fluxo · clique pra ir
          </div>
          <svg width={MM_W} height={MM_H} className="block cursor-pointer">
            {[...edges, ...endEdges, ...returnEdges].map(({ from, to, dashed, back }) => (
              <line
                key={`mm-${from.id}-${to.id}-${dashed ? "e" : back ? "b" : "f"}`}
                x1={mmX(from.x + NODE_W / 2)}
                y1={mmY(from.y + NODE_W / 2)}
                x2={mmX(to.x + NODE_W / 2)}
                y2={mmY(to.y + NODE_W / 2)}
                stroke="var(--muted-foreground)"
                strokeOpacity={dashed || back ? 0.25 : 0.45}
                strokeWidth={1}
              />
            ))}
            {placed.map((p) => {
              const tone =
                p.kind === "context"
                  ? "text-emerald-500"
                  : p.kind === "end"
                    ? "text-rose-500"
                    : p.kind === "root"
                      ? "text-primary"
                      : p.node?.block === "acao"
                        ? "text-amber-500"
                        : p.node?.block === "condicao"
                          ? "text-violet-500"
                          : p.node?.block === "tracking"
                            ? "text-sky-500"
                            : "text-muted-foreground";
              const on = selectedId === p.id;
              return (
                <circle
                  key={`mm-n-${p.id}`}
                  cx={mmX(p.x + NODE_W / 2)}
                  cy={mmY(p.y + NODE_W / 2)}
                  r={on ? 5 : 3.5}
                  className={`${tone} fill-current`}
                  fillOpacity={on ? 1 : 0.7}
                  stroke={on ? "var(--foreground)" : "none"}
                  strokeWidth={on ? 1.5 : 0}
                />
              );
            })}
            <rect
              x={viewRect.x}
              y={viewRect.y}
              width={Math.max(6, viewRect.w)}
              height={Math.max(6, viewRect.h)}
              fill="var(--primary)"
              fillOpacity={0.08}
              stroke="var(--primary)"
              strokeOpacity={0.7}
              strokeWidth={1}
              rx={3}
            />
          </svg>
        </div>
      )}

      {/* Seletor de tipo de bloco */}

      {picker && (
        <>
          <div className="absolute inset-0 z-30" onPointerDown={() => setPicker(null)} />
          <div
            className="absolute z-40 w-64 rounded-lg border border-border bg-card shadow-xl p-1"
            style={{ left: Math.max(8, picker.left), top: Math.max(8, picker.top) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Criar bloco
            </p>

            {picker.branching && (
              <div className="px-2 pb-2">
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                  Condição desta ramificação <span className="text-destructive">*</span>
                </label>
                <input
                  autoFocus
                  value={pickerWhen}
                  onChange={(e) => setPickerWhen(e.target.value)}
                  placeholder="Ex: lead pediu preço / disse que é caro"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-[11px]"
                />
                <p className="text-[9px] text-muted-foreground mt-1 leading-snug">
                  Esse bloco já tem outra saída: descreva o que faz o lead seguir por este caminho.
                </p>
              </div>
            )}

            {(Object.keys(BLOCK_META) as ObjectiveBlockKind[]).map((k) => (
              <button
                key={k}
                type="button"
                disabled={picker.branching && !pickerWhen.trim()}
                onClick={() => {
                  const when = picker.branching ? pickerWhen.trim() : undefined;
                  if (picker.pos) onCreateFrom?.(picker.fromId, picker.pos, k, when);
                  else onAddChild(picker.fromId, k, when);
                  setPicker(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-start gap-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="mt-0.5 text-muted-foreground">{BLOCK_META[k].icon}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{BLOCK_META[k].label}</span>
                  <span className="block text-[10px] text-muted-foreground leading-snug">{BLOCK_META[k].hint}</span>
                </span>
              </button>
            ))}

            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                onConnectEnd?.(picker.fromId, picker.pos);
                setPicker(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-start gap-2"
            >
              <span className="mt-0.5 text-rose-500">
                <Flag className="w-3 h-3" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium">Encerrar agente</span>
                <span className="block text-[10px] text-muted-foreground leading-snug">
                  Liga este bloco ao encerramento (só existe se você criar).
                </span>
              </span>
            </button>
          </div>
        </>
      )}

    </div>
  );

}

function findIn(node: ObjectiveNode, id: string): ObjectiveNode | null {
  if (node.id === id) return node;
  for (const c of node.children) {
    const r = findIn(c, id);
    if (r) return r;
  }
  return null;
}

function CtrlBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-card/90 backdrop-blur text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

function MiniCard({
  selected,
  multi,
  tone,
  icon,
  label,
  title,
  subtitle,
  chips,
  onSelect,
  onAdd,
  onRemove,
  inPort,
  outPort,
  dropActive,
  dropHover,
  onDropEnter,
  onDropLeave,

}: {
  selected: boolean;
  multi?: boolean;
  tone: "emerald" | "rose" | "primary" | "neutral" | "amber" | "violet" | "sky";
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle?: string;
  chips?: Array<{ icon?: React.ReactNode; text: string }>;
  onSelect: (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  onAdd?: (e: React.MouseEvent) => void;
  inPort?: boolean;
  outPort?: { locked?: boolean; onStart?: (e: React.PointerEvent) => void };
  onRemove?: () => void;

  dropActive?: boolean;
  dropHover?: boolean;
  onDropEnter?: () => void;
  onDropLeave?: () => void;
}) {

  const TONE: Record<string, { box: string; label: string }> = {
    emerald: { box: "border-emerald-500/40 bg-emerald-500/5", label: "text-emerald-600 dark:text-emerald-400" },
    rose: { box: "border-rose-500/40 bg-rose-500/5", label: "text-rose-600 dark:text-rose-400" },
    primary: { box: "border-primary/50 bg-primary/5", label: "text-primary" },
    amber: { box: "border-amber-500/40 bg-amber-500/5", label: "text-amber-600 dark:text-amber-400" },
    violet: { box: "border-violet-500/40 bg-violet-500/5", label: "text-violet-600 dark:text-violet-400" },
    sky: { box: "border-sky-500/40 bg-sky-500/5", label: "text-sky-600 dark:text-sky-400" },
    neutral: { box: "border-border bg-card", label: "text-muted-foreground" },
  };
  const toneCls = (TONE[tone] ?? TONE["neutral"]!).box;
  const labelCls = (TONE[tone] ?? TONE["neutral"]!).label;

  return (
    <div className="relative group h-full w-full" onPointerEnter={onDropEnter} onPointerLeave={onDropLeave}>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1 -right-1 z-10 p-1 bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-90 transition-all border border-white/20"
          title="Remover este bloco"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            onSelect({ ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
          }
        }}
        className={`h-full w-full rounded-full border-2 px-4 flex flex-col items-center justify-center text-center overflow-hidden cursor-grab active:cursor-grabbing select-none transition shadow-sm ${toneCls} ${
          dropHover
            ? "ring-2 ring-primary border-primary"
            : dropActive
              ? "ring-1 ring-primary/40 border-primary/60"
              : multi
              ? "ring-2 ring-sky-500 border-sky-500"
              : selected
                ? "ring-2 ring-primary/60 border-primary"
                : "hover:border-primary/50"
        }`}
      >
        <div className={`flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider ${labelCls}`}>
          {icon}
          <span className="truncate max-w-[92px]">{label}</span>
        </div>
        <div className="text-[11px] font-medium leading-snug line-clamp-3 mt-1 px-1">{title}</div>
        {subtitle && (
          <div className="mt-1 flex items-center justify-center gap-1 text-[9px] text-muted-foreground leading-snug w-full">
            <Check className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{subtitle}</span>
          </div>
        )}
        {chips && chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1 mt-1 max-w-full">
            {chips.slice(0, 2).map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 max-w-[110px] text-[9px] px-1 py-[1px] rounded-full bg-muted/70 text-muted-foreground"
              >
                {c.icon}
                <span className="truncate">{c.text}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Porta de entrada (cabo chega aqui) */}
      {inPort && (
        <span className="absolute -left-[7px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-primary/60 bg-background" />
      )}

      {/* Porta de saída (puxa o cabo daqui) */}
      {outPort &&
        (outPort.locked ? (
          <span
            title="Cabo fixo: o contexto sempre alimenta o objetivo final"
            className="absolute -right-[7px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-primary bg-primary/40"
          />
        ) : (
          <button
            type="button"
            title="Arraste para ligar este objetivo a outro (ou solte no vazio para criar um novo)"
            onPointerDown={outPort.onStart}
            onClick={(e) => e.stopPropagation()}
            className="absolute -right-[9px] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-primary bg-background hover:bg-primary/30 cursor-crosshair"
          />
        ))}

      {onAdd && (
        <button
          type="button"
          title="Adicionar caminho a partir deste objetivo"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(e);
          }}
          className="absolute right-1 -bottom-1 h-6 w-6 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
