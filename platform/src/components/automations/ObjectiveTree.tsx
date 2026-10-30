import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, GitBranch, Target, Check, Sprout, BookOpen, Package, X, Flag, Zap, AlertTriangle, Percent, ChevronUp, ChevronDown, Bot, Clock, Save, Radar, Filter, MessageSquare, ClipboardList } from "lucide-react";
import { AgentOutcomeEditor, emptyOutcome, normalizeOutcome, type AgentOutcome, type AgentOutcomeStep } from "./AgentOutcomeEditor";
import { AgentSourcesEditor, type AgentSource } from "./AgentSourcesEditor";
import { AgentLinksEditor, type AgentLink } from "./AgentLinksEditor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProductCatalogs, type DbCatalog } from "@/lib/products.functions";
import { ObjectiveCanvas } from "./ObjectiveCanvas";
import { ActionBlockEditor, ConditionBlockEditor, TrackingBlockEditor } from "./ObjectiveBlockEditors";

type ProductCatalog = DbCatalog;

const rid = () => Math.random().toString(36).slice(2, 10);

export type ObjectiveNodeMode = "strict" | "free";

export type ObjectiveLink = {
  id: string;
  label: string;
  url: string;
  when?: string;
  targetUrl?: string;
  trackedSlug?: string;
};

export type ObjectiveFallbackKind =
  | "inatividade"
  | "negativa"
  | "palavra-chave"
  | "limite-interacoes"
  | "desvio-repetido";

export type ObjectiveFallbackGoTo = "ficar" | "proximo" | "encerrar";

export type ObjectiveFallback = {
  id: string;
  kind: ObjectiveFallbackKind;
  minutes?: number;
  attempts?: number;
  keywords?: string[];
  times?: number;
  message?: string;
  actions?: AgentOutcomeStep[];
  goTo?: ObjectiveFallbackGoTo;
};

const MiniRemoveButton = ({ onRemove }: { onRemove: () => void }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onRemove();
    }}
    className="absolute -top-1 -right-1 z-10 p-1 bg-destructive text-white rounded-full shadow-md hover:scale-110 active:scale-90 transition-all"
    title="Remover este bloco"
  >
    <Trash2 className="w-2.5 h-2.5" />
  </button>
);


export type ObjectiveBlockKind = "objetivo" | "acao" | "condicao" | "tracking";

export type ObjectiveTracking = {
  siteId?: string;
  event: string;
  customEvent?: string;
  match?: string;
  everyMinutes?: number;
  initialDelayMinutes?: number;
  retryAttempts?: number;
  forMinutes?: number;
  onFoundMessage?: string;
  onTimeout?: "ficar" | "proximo" | "encerrar";
};

export type ObjectiveConditionRow = {
  id: string;
  field: string;
  op: string;
  value?: string;
  /** ID do campo personalizado quando `field === "campo"`. */
  fieldId?: string;
};

export type ObjectiveNode = {
  id: string;
  block?: ObjectiveBlockKind;
  say: string;
  expected: string;
  when?: string;
  allowBranch?: boolean;
  returnAfter?: boolean;
  mode?: ObjectiveNodeMode;
  questions?: string[];
  links?: ObjectiveLink[];
  minTurns?: number;
  maxTurns?: number;
  keepOnTrack?: boolean;
  actions?: AgentOutcomeStep[];
  fallbacks?: ObjectiveFallback[];
  conditions?: ObjectiveConditionRow[];
  conditionLogic?: "e" | "ou";
  tracking?: ObjectiveTracking;
  children: ObjectiveNode[];
};

export type ObjectiveProductRef = {
  id: string;
  catalogId: string;
  productId?: string;
  note?: string;
};

export type ObjectiveDiscount = {
  id: string;
  label: string;
  kind: "fixo" | "faixa";
  unit: "reais" | "percent";
  value?: number;
  min?: number;
  max?: number;
  when?: string;
};

export type ObjectiveTree = {
  root: ObjectiveNode;
  outcome?: AgentOutcome;
  endFrom?: string[];
  context?: string;
  sources?: AgentSource[];
  allowedLinks?: string[];
  forbiddenLinks?: string[];
  products?: ObjectiveProductRef[];
  discounts?: ObjectiveDiscount[];
  positions?: Record<string, { x: number; y: number }>;
  pitch?: {
    minTurns?: number;
    maxTurns?: number;
    what?: string;
  };
};

export type PathEvent =
  | { type: "visit"; nodeId: string; at: string; message?: string }
  | { type: "deviation"; fromNodeId: string; at: string; leadSaid?: string; label?: string }
  | { type: "recovery"; fromNodeId: string; toNodeId: string; at: string; iaSaid?: string };


function cloneNode(node: ObjectiveNode): ObjectiveNode {
  return {
    ...node,
    id: rid(),
    children: node.children.map(cloneNode),
  };
}

export function emptyTree(): ObjectiveTree {
  const rootId = rid();
  return {
    root: {
      id: rootId,
      say: "Contexto Geral",
      expected: "",
      mode: "free",
      questions: [],
      children: [],
    },
    outcome: emptyOutcome(),
    context: "",
    sources: [],
    products: [],
    positions: {
      [CONTEXT_ID]: { x: 0, y: 200 },
      [rootId]: { x: 300, y: 200 }
    }
  };
}

function updateNode(node: ObjectiveNode, id: string, patch: Partial<ObjectiveNode>): ObjectiveNode {
  if (node.id === id) return { ...node, ...patch };
  return { ...node, children: node.children.map((c) => updateNode(c, id, patch)) };
}

function addChild(node: ObjectiveNode, parentId: string, child: ObjectiveNode): ObjectiveNode {
  if (node.id === parentId) return { ...node, children: [...node.children, child] };
  return { ...node, children: node.children.map((c) => addChild(c, parentId, child)) };
}

function removeNode(node: ObjectiveNode, id: string): ObjectiveNode | null {
  if (node.id === id) return null;
  return {
    ...node,
    children: node.children
      .map((c) => removeNode(c, id))
      .filter((c): c is ObjectiveNode => c !== null),
  };
}

function findNode(node: ObjectiveNode, id: string): ObjectiveNode | null {
  if (node.id === id) return node;
  for (const c of node.children) {
    const r = findNode(c, id);
    if (r) return r;
  }
  return null;
}

function findParentId(node: ObjectiveNode, id: string): string | null {
  for (const c of node.children) {
    if (c.id === id) return node.id;
    const r = findParentId(c, id);
    if (r) return r;
  }
  return null;
}

const CONTEXT_ID = "__context__";
const END_ID = "__end__";

export function ObjectiveTreeEditor({
  value,
  onChange,
  scope = "individual",
  fullscreen = false,
  workspaceId = null,
  onTest,
}: {
  value: ObjectiveTree;
  onChange: (t: ObjectiveTree) => void;
  scope?: "individual" | "grupo";
  fullscreen?: boolean;
  workspaceId?: string | null;
  onTest?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(value.root.id);
  const [panelOpen, setPanelOpen] = useState(true);
  const [history, setHistory] = useState<ObjectiveTree[]>([value]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const pushHistory = (next: ObjectiveTree) => {
    const newHistory = history.slice(0, historyIdx + 1);
    newHistory.push(next);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    onChange(next);
  };

  const undo = useCallback(() => {
    if (historyIdx > 0) {
      const prev = history[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      onChange(prev);
    }
  }, [history, historyIdx, onChange]);

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const next = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      onChange(next);
    }
  }, [history, historyIdx, onChange]);

  const duplicateNode = (id: string) => {
    const node = findNode(value.root, id);
    if (!node || node.id === value.root.id) return;
    const parentId = findParentId(value.root, id);
    if (!parentId) return;
    const clone = cloneNode(node);
    pushHistory({ ...value, root: addChild(value.root, parentId, clone) });
    setSelectedId(clone.id);
  };

  const copyToClipboard = (id: string) => {
    const node = findNode(value.root, id);
    if (!node) return;
    localStorage.setItem("mkton_objective_clipboard", JSON.stringify(node));
  };

  const pasteFromClipboard = (parentId: string) => {
    const raw = localStorage.getItem("mkton_objective_clipboard");
    if (!raw) return;
    try {
      const node = JSON.parse(raw) as ObjectiveNode;
      const clone = cloneNode(node);
      pushHistory({ ...value, root: addChild(value.root, parentId, clone) });
      setSelectedId(clone.id);
    } catch (e) {
      console.error("Failed to paste objective node", e);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (isMod && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (isMod && e.key === "d" && selectedId !== value.root.id) {
        e.preventDefault();
        duplicateNode(selectedId);
      }
      if (isMod && e.key === "c") {
        copyToClipboard(selectedId);
      }
      if (isMod && e.key === "v") {
        pasteFromClipboard(selectedId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, selectedId, value.root.id, duplicateNode]);


  const selectedNode = useMemo(
    () => {
      if (selectedId === CONTEXT_ID) return null;
      if (selectedId === END_ID) return null;
      const found = findNode(value.root, selectedId);
      // Se não encontrar o nó pelo ID (ex: CONTEXT_ID que é virtual), retorna null
      return found || null;
    },
    [value, selectedId],
  );

  const qc = useQueryClient();
  const loadCatalogsFn = useServerFn(listProductCatalogs);
  const catalogsQ = useQuery({
    queryKey: ["product-catalogs", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => loadCatalogsFn(),
    staleTime: 30_000,
  });
  const catalogs = (catalogsQ.data ?? []) as DbCatalog[];

  const patchNode = (patch: Partial<ObjectiveNode>) => {
    if (!selectedNode) return;
    if (patch.id === "REMOVED") {
      removeSelected();
      return;
    }
    pushHistory({ ...value, root: updateNode(value.root, selectedNode.id, patch) });
  };



  const newBlock = (kind: ObjectiveBlockKind = "objetivo"): ObjectiveNode => ({
    id: rid(),
    block: kind,
    say: "",
    expected: "",
    mode: "free",
    questions: [],
    actions: [],
    ...(kind === "condicao" ? { conditions: [{ id: rid(), field: "mensagem", op: "contem", value: "" }], conditionLogic: "e" as const } : {}),
    ...(kind === "tracking" ? { tracking: { event: "", everyMinutes: 5, retryAttempts: 3, initialDelayMinutes: 0, forMinutes: 1440, onTimeout: "ficar" as const } } : {}),
    children: [],
  });

  const addChildTo = (parentId: string, kind: ObjectiveBlockKind = "objetivo", when?: string) => {
    const child = { ...newBlock(kind), ...(when?.trim() ? { when: when.trim() } : {}) };
    pushHistory({ ...value, root: addChild(value.root, parentId, child) });
    setSelectedId(child.id);
    setPanelOpen(true);
  };

  const connectEnd = (fromId: string, pos?: { x: number; y: number } | null) => {
    const list = value.endFrom ?? [];
    if (list.includes(fromId)) {
      setSelectedId(END_ID);
      return;
    }
    pushHistory({
      ...value,
      endFrom: [...list, fromId],
      ...(pos ? { positions: { ...(value.positions ?? {}), [END_ID]: pos } } : {}),
    });
    setSelectedId(END_ID);
  };

  const removeEnd = () => {
    pushHistory({ ...value, endFrom: [] });
    setSelectedId(value.root.id);
  };


  const addSiblingOf = (nodeId: string) => {
    const parentId = findParentId(value.root, nodeId);
    addChildTo(parentId ?? value.root.id);
  };

  const removeSelected = () => {
    if (!selectedNode) return;
    // O nó raiz é o "Contexto Geral", não permitimos remover a raiz da árvore logicamente,
    // mas se for o bloco de Objetivo que é filho da raiz, permitimos.
    const next = removeNode(value.root, selectedNode.id);
    if (next) {
      pushHistory({ ...value, root: next });
      setSelectedId(value.root.id);
    } else {
      // Se next for null, tentou remover a própria root (o que removeNode retorna null se match)
      // Não fazemos nada ou resetamos se necessário.
    }
  };


  const disconnect = (fromId: string, toId: string) => {
    // "Desconectar" um bloco no fluxo de árvore significa movê-lo de volta para a raiz do fluxo
    // ou apenas remover a ligação se for um encerramento (o encerramento já é tratado no Canvas).
    if (toId === value.root.id) return;
    const child = findNode(value.root, toId);
    if (!child) return;
    const without = removeNode(value.root, toId);
    if (!without) return;
    // Move o bloco desconectado para ser filho da raiz (desvincula do pai atual)
    pushHistory({ ...value, root: addChild(without, value.root.id, child) });
  };

  const reconnect = (fromId: string, childId: string) => {
    if (childId === value.root.id || fromId === childId) return;
    const child = findNode(value.root, childId);
    if (!child) return;
    const without = removeNode(value.root, childId);
    if (!without) return;
    pushHistory({ ...value, root: addChild(without, fromId, child) });
    setSelectedId(childId);
  };


  const createFrom = (
    fromId: string,
    pos: { x: number; y: number },
    kind: ObjectiveBlockKind = "objetivo",
    when?: string,
  ) => {
    const child = { ...newBlock(kind), ...(when?.trim() ? { when: when.trim() } : {}) };
    pushHistory({
      ...value,
      root: addChild(value.root, fromId, child),
      positions: { ...(value.positions ?? {}), [child.id]: pos },
    });
    setSelectedId(child.id);
    setPanelOpen(true);
  };


  return (
    <div className="relative flex-1 bg-background/20 h-full overflow-hidden">
      <div className="absolute inset-0">
        <ObjectiveCanvas
          tree={value}
          selectedId={selectedId}
          onSelect={(id, additive) => {
            console.log("Canvas onSelect:", id);
            setSelectedId(id);
            setPanelOpen(true);
          }}
          onAddChild={addChildTo}
          onRemoveNode={removeSelected}
          onMove={(id, pos) => pushHistory({ ...value, positions: { ...(value.positions ?? {}), [id]: pos } })}
          onMoveMany={(moves) => {
            const nextPos = { ...(value.positions ?? {}) };
            moves.forEach((m) => {
              nextPos[m.id] = m.pos;
            });
            pushHistory({ ...value, positions: nextPos });
          }}
          onConnect={reconnect}
          onDisconnect={disconnect}
          onCreateFrom={createFrom}
          onConnectEnd={connectEnd}
          outcomeCount={normalizeOutcome(value.outcome).length}
          fullscreen={fullscreen}
          onTest={onTest}
        />
      </div>



      {!panelOpen ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute right-4 bottom-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-border bg-card shadow-lg px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <Zap className="w-3.5 h-3.5 text-primary" /> Configurar
        </button>
      ) : (
        <div className="absolute right-3 top-3 bottom-3 z-30 w-[420px] rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl p-4 flex flex-col space-y-4 overflow-hidden animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between shrink-0 pb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-bold leading-none">
                  {selectedNode?.block === 'acao' ? 'Configurar Ação' : 
                   selectedNode?.block === 'tracking' ? 'Configurar Tracking' :
                   selectedNode?.block === 'condicao' ? 'Configurar Condição' :
                   selectedId === CONTEXT_ID ? 'Contexto Geral' : 
                   selectedNode?.id === value.root.id ? 'Contexto Geral' : 'Configurar Objetivo'}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium">
                  {selectedId === CONTEXT_ID ? 'Inteligência Estratégica' : (selectedNode?.block ? `Bloco: ${selectedNode.block}` : 'Etapa do Fluxo')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                title="Fechar painel"
                className="p-1.5 hover:bg-muted rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-5 custom-scrollbar min-h-0">
            {/* Contexto Geral e Objetivo Final (Etapa Única) */}
            {(selectedId === CONTEXT_ID || selectedId === null) && (
              <div className="space-y-5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="space-y-3 mb-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" /> Identificação e Persona
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={value.root.say || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          onChange({
                            ...value,
                            root: { ...value.root, say: val },
                            pitch: { ...(value.pitch || {}), what: val },
                          });
                        }}
                        placeholder="Nome do Agente"
                        className="bg-transparent border-none text-[11px] font-bold text-right focus:ring-0 w-32 outline-none p-0"
                      />
                    </div>
                  </div>
                  <div className="h-px bg-primary/10" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
                    <Target className="w-3 h-3" /> Contexto Geral Estratégico
                  </label>
                  <textarea
                    value={value.context || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange({ ...value, context: val });
                    }}
                    placeholder="Defina a persona, tom de voz e contexto do negócio que o agente deve seguir em todo o fluxo."
                    className="w-full bg-background border border-primary/20 rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-primary/30 outline-none"
                    rows={4}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
                    <Flag className="w-3 h-3" /> Objetivo Final do Agente
                  </label>
                  <textarea
                    value={value.root.expected || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange({ ...value, root: { ...value.root, expected: val } });
                    }}
                    placeholder="Qual o resultado final esperado deste agente? (Ex: Marcar uma reunião, vender um produto...)"
                    className="w-full bg-background border border-primary/20 rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-primary/30 outline-none"
                    rows={3}
                  />
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    O contexto é a base estratégica. O objetivo final define a persistência do robô até o encerramento automático.
                  </p>
                </div>

                {/* Limites de Conversa (Pitch) */}
                <div className="space-y-2 pt-1 border-t border-primary/10">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Limites de Conversa
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] text-muted-foreground uppercase">Mín. turnos</span>
                      <input
                        type="number"
                        min={1}
                        value={value.pitch?.minTurns ?? 1}
                        onChange={(e) => onChange({ ...value, pitch: { ...(value.pitch || {}), minTurns: Number(e.target.value) } })}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-muted-foreground uppercase">Máx. turnos</span>
                      <input
                        type="number"
                        min={1}
                        value={value.pitch?.maxTurns ?? 20}
                        onChange={(e) => onChange({ ...value, pitch: { ...(value.pitch || {}), maxTurns: Number(e.target.value) } })}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground leading-relaxed italic">
                    O robô tenta cumprir o objetivo entre o mínimo e o máximo de turnos configurados.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-primary/10">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70 flex items-center gap-1.5">
                      <Check className="w-3 h-3" /> Links Permitidos
                    </label>
                    <textarea
                      value={(value.allowedLinks ?? []).join("\n")}
                      onChange={(e) => onChange({ ...value, allowedLinks: e.target.value.split("\n").filter(l => l.trim()) })}
                      placeholder="URLs que a IA pode enviar..."
                      className="w-full bg-background border border-emerald-500/20 rounded-lg px-2.5 py-2 text-[11px] focus:ring-1 focus:ring-emerald-500/30 outline-none font-mono"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-rose-600/70 flex items-center gap-1.5">
                      <X className="w-3 h-3" /> Links Proibidos
                    </label>
                    <textarea
                      value={(value.forbiddenLinks ?? []).join("\n")}
                      onChange={(e) => onChange({ ...value, forbiddenLinks: e.target.value.split("\n").filter(l => l.trim()) })}
                      placeholder="URLs proibidas..."
                      className="w-full bg-background border border-rose-500/20 rounded-lg px-2.5 py-2 text-[11px] focus:ring-1 focus:ring-rose-500/30 outline-none font-mono"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-1 border-t border-primary/10">
                   <AgentSourcesEditor
                    value={value.sources ?? []}
                    onChange={(sources) => onChange({ ...value, sources })}
                  />
                </div>

                {/* Produtos e Descontos (Se existir) */}
                {(catalogs.length > 0) && (
                  <div className="space-y-3 pt-1 border-t border-primary/10">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
                      <Package className="w-3 h-3" /> Catálogo de Produtos
                    </label>
                    <p className="text-[9px] text-muted-foreground -mt-1">
                      O agente pode consultar preços e detalhes dos produtos destes catálogos.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {catalogs.map(cat => {
                        const active = value.products?.some(p => p.catalogId === cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              const products = active 
                                ? (value.products ?? []).filter(p => p.catalogId !== cat.id)
                                : [...(value.products ?? []), { id: `ref-${cat.id}`, catalogId: cat.id }];
                              onChange({ ...value, products });
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                              active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="h-px bg-border/50" />



            <div className="h-px bg-border/50" />

            {selectedId === END_ID ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1.5 border-b border-border">
                  <Flag className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-[11px] font-bold">Encerrar agente IA</span>
                </div>
                <AgentOutcomeEditor
                  value={value.outcome ?? emptyOutcome()}
                  onChange={(outcome) => onChange({ ...value, outcome })}
                  scope={scope}
                  title="Ações ao encerrar"
                />
                <button type="button" onClick={removeEnd} className="w-full text-[11px] px-2 py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10">
                  Remover bloco de encerramento
                </button>
              </div>
            ) : selectedNode ? (
              <NodeEditor
                node={selectedNode}
                isRoot={selectedNode.id === value.root.id}
                onPatch={patchNode}
                onAddChild={() => addChildTo(selectedNode.id)}
                onAddSibling={() => addSiblingOf(selectedNode.id)}
                onRemove={removeSelected}
                onGoToEnd={() => connectEnd(selectedNode.id)}
                scope={scope}
                workspaceId={workspaceId}
              />
            ) : null}

            <div className="shrink-0 pt-4 mt-auto border-t border-border/50 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                  <Check className="w-2.5 h-2.5 text-emerald-500" /> Sincronizado em tempo real
                </span>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                >
                  Concluir edição
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NodeEditor({
  node,
  isRoot,
  onPatch,
  onAddChild,
  onAddSibling,
  onRemove,
  onGoToEnd,
  scope,
  workspaceId,
}: {
  node: ObjectiveNode;
  isRoot: boolean;
  onPatch: (patch: Partial<ObjectiveNode>) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onRemove: () => void;
  onGoToEnd: () => void;
  scope: "individual" | "grupo";
  workspaceId: string | null;
}) {
  if (node.block === "acao") return <ActionBlockEditor key={node.id} node={node} onPatch={onPatch} scope={scope} />;
  if (node.block === "condicao") return <ConditionBlockEditor key={node.id} node={node} onPatch={onPatch} />;
  if (node.block === "tracking") return <TrackingBlockEditor key={node.id} node={node} onPatch={onPatch} scope={scope} workspaceId={workspaceId} />;

  return (
    <div key={node.id} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-bold">{isRoot ? "Contexto Geral" : "Objetivo da etapa"}</span>
        </div>
        {!isRoot && (
          <button onClick={onRemove} className="p-1 hover:bg-destructive/10 text-destructive rounded-md transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {!isRoot && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">O que a IA conduz</label>
            <textarea
              value={node.say}
              onChange={(e) => onPatch({ say: e.target.value })}
              rows={2}
              className="w-full mt-1.5 bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none"
              placeholder="Ex: Tenta entender a dor do cliente..."
            />
          </div>
        )}

        {!isRoot && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Concluir quando</label>
            <textarea
              value={node.expected}
              onChange={(e) => onPatch({ expected: e.target.value })}
              rows={2}
              className="w-full mt-1.5 bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none"
              placeholder="Ex: O lead confirmou que tem interesse..."
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Links desta etapa</label>
          <button
            type="button"
            onClick={() => onPatch({ links: [...(node.links || []), { id: `lnk-${Date.now()}`, label: "", url: "", when: "" }] })}
            className="p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Adicionar link para enviar nesta etapa"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        
        {node.links && node.links.length > 0 && (
          <AgentLinksEditor
            value={node.links}
            onChange={(links) => onPatch({ links })}
            workspaceId={workspaceId}
            compact
            contextLabel={node.say}
          />
        )}
      </div>

      <div className="h-px bg-border/50" />

      <AgentOutcomeEditor
        value={node.actions || []}
        onChange={(steps) => onPatch({ actions: steps })}
        scope={scope}
        title="Ações ao concluir (opcional)"
        subtitle="O que a IA faz ao bater este objetivo. Se vazio, ela apenas segue o fluxo."
      />

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onAddChild} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-primary text-[11px] font-bold hover:bg-primary/10 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Próxima etapa
        </button>
        <button onClick={onGoToEnd} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground text-[11px] font-medium hover:bg-muted transition-colors">
          <Flag className="w-3.5 h-3.5" /> Encerrar aqui
        </button>
      </div>

      <div className="shrink-0 pt-4 mt-auto border-t border-border/50">
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-[12px] font-bold text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-all"
          onClick={() => {
            const btn = document.querySelector('button[title="Salvar Fluxo"]') as HTMLButtonElement;
            if (btn) btn.click();
          }}
        >
          <Save className="w-4 h-4" />
          Salvar Alterações
        </button>
      </div>
    </div>
  );
}

export function ObjectiveTreeReplay({
  value,
  events,
  fullscreen,
}: {
  value: ObjectiveTree;
  events: PathEvent[];
  fullscreen?: boolean;
}) {
  return (
    <div className={`relative ${fullscreen ? "h-full" : "h-[500px]"} bg-background/20 rounded-xl border border-border overflow-hidden`}>
      <ObjectiveCanvas
        tree={value}
        selectedId=""
        onSelect={() => {}}
        onAddChild={() => {}}
        onMove={() => {}}
        outcomeCount={0}
        fullscreen={fullscreen}
      />
      <div className="absolute bottom-4 left-4 z-20 bg-card/90 backdrop-blur border border-border rounded-lg p-3 max-w-xs shadow-xl">
        <h4 className="text-xs font-bold flex items-center gap-2 mb-2 text-primary">
          <BookOpen className="w-3.5 h-3.5" /> Histórico da Jornada
        </h4>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
          {events.map((ev, i) => (
            <div key={i} className="text-[10px] border-l-2 border-primary/30 pl-2 py-1">
              <span className="text-muted-foreground block text-[9px] uppercase tracking-wider">{new Date(ev.at).toLocaleTimeString()}</span>
              {ev.type === "visit" && <p className="mt-0.5">Entrou no objetivo <b>{ev.nodeId}</b></p>}
              {ev.type === "deviation" && <p className="mt-0.5 text-amber-600 dark:text-amber-400">Desviou do fluxo: "{ev.leadSaid}"</p>}
              {ev.type === "recovery" && <p className="mt-0.5 text-emerald-600 dark:text-emerald-400">IA recuperou o foco: "{ev.iaSaid}"</p>}
            </div>
          ))}
          {events.length === 0 && <p className="text-[10px] text-muted-foreground italic">Nenhuma interação registrada ainda.</p>}
        </div>
      </div>
    </div>
  );
}
