import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFieldDraftKey, readCustomFieldDraft, writeCustomFieldDraft, clearCustomFieldDraft } from "@/lib/custom-field-tab-draft";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
 Plus,
 Copy,
 Trash2,
 X,
 Play,
 Undo2,
 Pencil,
 Search,
 ChevronDown,
 Check,
 Maximize2,
 Minus,
 Mic,
 Square,
 ArrowLeft,
 Eye,
  EyeOff,
  Power,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { listInternalMessageTargets } from "@/lib/team-chat.functions";
import { tutorialForBlock } from "@/lib/salesbot-block-tutorials";

import {
 ACAO_OPCOES,
 BLOCK_CATALOG,
 filterPausaOpcoesByScope,
 GRUPO_MAX_INTERACOES_PADRAO,
 filterAcoesByScope,
 filterBlockCatalogByScope,
 type Block,
 type BlockKind,
 type Condicao,
 type EncerrarAcao,
 type MediaItem,
 type MensagemBotao,
 type RoletaOpcao,
 type PausaEntry,
 type PausaTipo,
 type Salesbot,
 type SalesbotEscopo,
 type ValidacaoTipo,
 loadSalesbots,
 newId,
 saveSalesbots,
} from "@/lib/salesbot-types";
import { LEAD_BUILTIN_FIELDS, COMPANY_BUILTIN_FIELDS } from "@/lib/salesbot-field-targets";
import { useAllFunnels } from "@/hooks/use-all-funnels";
import { VariableTextarea } from "@/components/ui/variable-textarea";

import { useIsSuperAdmin } from "@/hooks/use-roles";
import { listLeadCustomFields, listWorkspaceTags, createLeadCustomField } from "@/lib/leads.functions";
import { listWorkspaceUsers } from "@/lib/crm.functions";
import { listLeadOrigins } from "@/lib/lead-origins.functions";
import { testSalesbotWebhook } from "@/lib/salesbot-webhook.functions";


import { listForms } from "@/lib/forms.functions";
import { uploadSalesbotMedia, getSalesbotMediaSignedUrl, syncSalesbotFromLocal, listSalesbotsFull, getSalesbotGraph, setSalesbotActive, deleteSalesbotByLocalId, listSalesbotPickerOptions } from "@/lib/salesbots.functions";
import {
  clearSalesbotSync,
  enqueueSalesbotSync,
  waitForSalesbotSync,
  scheduleSalesbotSave,
  flushAllSalesbotSaves,
  getSalesbotSaveStatus,
  hasPendingSalesbotSaves,
  hasFailedSalesbotSaves,
  retrySalesbotSave,

  subscribeSalesbotSaveStatus,
  type SalesbotSaveStatus,
} from "@/lib/salesbot-sync-queue";
import { listConversationAgents } from "@/lib/conversation-agents.functions";
import { listWorkflowPipelinesLite } from "@/lib/workflow.functions";
import { listGroupAiAgents } from "@/lib/whatsapp-groups.functions";
import { listProductCatalogs, type DbCatalog } from "@/lib/products.functions";
import { supabase } from "@/integrations/supabase/client";
import { SalesbotTestPhone } from "./SalesbotTestPhone";
import { SalesbotWebhookEditor } from "./SalesbotWebhookEditor";

interface Props {
 open: boolean;
 onClose: () => void;
 initialBotId?: string | null;
 autoCreate?: boolean;
 escopo?: "individual" | "grupo";
}

const BLOCK_W = 320;
const BLOCK_H_EST = 140;
/** Chave usada para copiar/colar blocos entre abas do navegador. */
const BLOCK_CLIPBOARD_KEY = "mkton.salesbot.clipboard.v1";
type PendingConnection = { sourceId: "start" | string; optionId?: string; at: { x: number; y: number } };

function getBotName(bot: Pick<Salesbot, "nome"> | null | undefined) {
 return typeof bot?.nome === "string" && bot.nome.trim() ? bot.nome : "Bot sem nome";
}

/**
 * Registro de posição Y (em coordenadas do canvas, sem zoom) de cada "porta" de
 * saída, usado pra puxar o cabinho da altura real da linha da opção
 * (pausa/validação/round-robin), em vez de um chute fixo.
 *
 * Chave: `${blockId}::${optionId}`. Valor: offset Y do centro da linha dentro
 * do bloco (usando offsetTop chain, então não é afetado pelo zoom do canvas).
 */
type RowRegister = (key: string, y: number | null) => void;
const RowRegistryContext = createContext<RowRegister>(() => {});

function RowMeasure({
  blockId, optionId, children,
}: { blockId: string; optionId: string; children: React.ReactNode }) {
  const register = useContext(RowRegistryContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const key = `${blockId}::${optionId}`;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wrapper = el.closest<HTMLElement>("[data-block-wrapper]");
    if (!wrapper) return;
    const measure = () => {
      // Soma offsetTop até o wrapper (unscaled, imune ao transform do canvas).
      let y = el.offsetHeight / 2;
      let cur: HTMLElement | null = el;
      while (cur && cur !== wrapper) {
        y += cur.offsetTop;
        cur = cur.offsetParent as HTMLElement | null;
      }
      register(key, y);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(wrapper);
    return () => { ro.disconnect(); register(key, null); };
  }, [key, register]);
  return <div ref={ref}>{children}</div>;
}


export function SalesbotBuilder({ open, onClose, initialBotId, autoCreate, escopo }: Props) {
 const [bots, setBots] = useState<Salesbot[]>([]);
 const [activeId, setActiveId] = useState<string | null>(null);
 const [renaming, setRenaming] = useState(false);
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number } | null>(null);
  // Modo tutorial: mostra a explicação de cada bloco embaixo do título.
  const [showTutorials, setShowTutorials] = useState(false);
  useEffect(() => {
    try {
      setShowTutorials(localStorage.getItem("mkton:salesbot-tutorials") === "1");
    } catch { /* storage indisponível */ }
  }, []);
  const toggleTutorials = () => {
    setShowTutorials((v) => {
      const next = !v;
      try { localStorage.setItem("mkton:salesbot-tutorials", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  /** Bloco que será substituído pelo próximo bloco escolhido no seletor ("Voltar" na bolinha de cor). */
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [addDrag, setAddDrag] = useState<{
    sourceId: "start" | string;
    optionId?: string;
    endId: string;
    anchor: { x: number; y: number };
    base: { x: number; y: number };
    origin: { x: number; y: number };
    pos: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  // Deslocamento manual das pontas soltas (arrastar o "+" só reposiciona; clicar abre o picker)
  const [looseEnds, setLooseEnds] = useState<Record<string, { dx: number; dy: number }>>({});

  const [botSwitcher, setBotSwitcher] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const syncFn = useServerFn(syncSalesbotFromLocal);
  const fetchBotGraphFn = useServerFn(getSalesbotGraph);
  const setActiveFn = useServerFn(setSalesbotActive);
  const syncProofRef = useRef(new Map<string, { revision: number; baseBlockLocalIds: string[] }>());
  const autoCreateHandledRef = useRef(false);


 // Canvas transform
 const [scale, setScale] = useState(1);
 const [pan, setPan] = useState({ x: 0, y: 0 });
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
 // Histórico volátil de desfazer: zera ao fechar o builder.
 const historyRef = useRef<Salesbot[][]>([]);
 const [undoDepth, setUndoDepth] = useState(0);

 // Offsets Y reais de cada porta (chave: blockId::optionId), preenchido pelas
 // linhas dos editores via RowMeasure. Usado por computeFlow pra puxar o cabo
 // da altura exata da linha, em vez de um chute fixo (que dessincronizava
 // quando a linha era mais alta que 34px).
 const [rowOffsets, setRowOffsets] = useState<Record<string, number>>({});
 const registerRow = useCallback<RowRegister>((key, y) => {
  setRowOffsets((prev) => {
   if (y == null) {
    if (!(key in prev)) return prev;
    const { [key]: _drop, ...rest } = prev;
    return rest;
   }
   if (Math.abs((prev[key] ?? -1) - y) < 0.5) return prev;
   return { ...prev, [key]: y };
  });
 }, []);

 const canvasRef = useRef<HTMLDivElement>(null);
 const dragRef = useRef<{
 mode: "pan" | "block" | "marquee" | null;
 startX: number;
 startY: number;
 panStart?: { x: number; y: number };
 blockStarts?: Map<string, { x: number; y: number }>;
  blockId?: string;
  /** true depois que o snapshot inicial do arraste já foi salvo no histórico */
  historyPushed?: boolean;
  }>({ mode: null, startX: 0, startY: 0 });

 /* ===== Lifecycle ===== */

 const fetchRemoteBots = useServerFn(listSalesbotsFull);
 const deleteRemoteBot = useServerFn(deleteSalesbotByLocalId);

 async function fetchCompleteBot(localId: string): Promise<Salesbot> {
  const res = (await fetchBotGraphFn({ data: { localId } } as never)) as unknown as {
   bot: Salesbot;
   revision: number;
   blockCount: number;
   baseBlockLocalIds: string[];
   complete: boolean;
  };
  if (
   res?.complete !== true
   || !res?.bot
   || !Number.isFinite(Number(res.revision))
   || !Array.isArray(res.baseBlockLocalIds)
   || res.baseBlockLocalIds.length !== Number(res.blockCount)
  ) {
   throw new Error("salesbot_incomplete_read");
  }
  syncProofRef.current.set(localId, {
   revision: Number(res.revision),
   baseBlockLocalIds: [...res.baseBlockLocalIds],
  });
  return res.bot;
 }

 async function loadBotForEditing(localId: string) {
  await waitForSalesbotSync(localId);
  const full = await fetchCompleteBot(localId);
  setBots((prev) => prev.map((bot) => (bot.id === localId ? full : bot)));
  setActiveId(localId);
  setSelected(new Set());
  setPan({ x: 200, y: 100 });
  setScale(1);
  return full;
 }

 useEffect(() => {
  if (!open) {
   autoCreateHandledRef.current = false;
   syncProofRef.current.clear();
   return;
  }
  setBots([]);
  setActiveId(null);
  syncProofRef.current.clear();
  setPan({ x: 200, y: 100 });
  setScale(1);
  setSelected(new Set());
  historyRef.current = [];
  setUndoDepth(0);

  // O editor precisa renderizar o StartNode imediatamente, mesmo enquanto
  // a criação remota está em andamento. Erros remotos não são ocultados.
  let cancelled = false;
  const creating = Boolean(autoCreate && !autoCreateHandledRef.current);
  const draft: Salesbot | null = creating ? {
   id: newId("bot"),
   nome: escopo === "grupo" ? "Novo bot de grupo" : "Novo bot",
   escopo: escopo ?? "individual",
   blocks: [],
   updatedAt: new Date().toISOString(),
  } : null;
  if (draft) {
   autoCreateHandledRef.current = true;
   setBots([draft]);
   setActiveId(draft.id);
  }
  (async () => {
   try {
    const res = (await fetchRemoteBots()) as unknown as { bots: Salesbot[] };
    if (cancelled) return;
    if (!Array.isArray(res?.bots)) throw new Error("salesbot_list_invalid");
    const remote = [...res.bots].sort(
     (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
    let next = remote;
    let nextActiveId = initialBotId && remote.some((bot) => bot.id === initialBotId)
     ? initialBotId
     : remote[0]?.id ?? null;

    if (draft) {
     const created = (await syncFn({ data: { bot: {
      id: draft.id,
      nome: getBotName(draft),
      escopo: draft.escopo ?? "individual",
      startBlockId: null,
      gatilhos: [],
      blocks: [],
     }, expectedRevision: null, baseBlockLocalIds: [], source: "builder-create" } } as never)) as unknown as {
      revision: number;
      baseBlockLocalIds: string[];
     };
     if (cancelled) return;
     syncProofRef.current.set(draft.id, {
      revision: Number(created.revision),
      baseBlockLocalIds: [...(created.baseBlockLocalIds ?? [])],
     });
     next = [draft, ...remote];
     nextActiveId = draft.id;
    } else if (nextActiveId) {
     const full = await fetchCompleteBot(nextActiveId);
     if (cancelled) return;
     next = remote.map((bot) => (bot.id === nextActiveId ? full : bot));
    }

    // Remote creation must not overwrite edits made while the request ran.
    setBots((prev) => {
     const merged = draft ? [prev.find((bot) => bot.id === draft.id) ?? draft, ...remote] : next;
     saveSalesbots(merged);
     return merged;
    });
    setActiveId(nextActiveId);
   } catch (err) {
    if (!cancelled) {
     toast.error(draft
      ? "O editor abriu, mas o bot não foi salvo no servidor. Não ative este bot antes de corrigir a conexão."
      : err instanceof Error && err.message.includes("salesbot_changed_during_load")
       ? "O bot mudou durante o carregamento. Abra novamente."
       : "Não foi possível carregar o SalesBot com segurança.");
    }
   }
  })();
  return () => { cancelled = true; };
 }, [open, initialBotId, autoCreate, escopo]);

 const active = useMemo(() => bots.find((b) => b.id === activeId)?? null, [bots, activeId]);

 // Escopo efetivo: se o bot tem gatilho de "responder comentário" em rede
 // social (Facebook/Instagram/LinkedIn/TikTok), o catálogo de blocos é
 // restringido, não faz sentido oferecer envio de mensagem 1-a-1, reação,
 // round-robin, etc. num fluxo que roda em cima de um post público.
 const effectiveScope: SalesbotEscopo = useMemo(() => {
  const stored = (active?.escopo ?? escopo ?? "individual") as SalesbotEscopo;
  if (stored === "grupo") return "grupo";
  const gats = active?.gatilhos ?? [];
  const isSocialComentario = gats.some((g) =>
   typeof g?.kind === "string" && g.kind.startsWith("social-comentario-"),
  );
  return isSocialComentario ? "social-comentario" : stored;
 }, [active, escopo]);


 function persist(next: Salesbot[], syncIds?: string[]) {
  setBots(next);
  try { saveSalesbots(next); } catch { /* cache local nunca bloqueia persistência */ }
  const wanted = syncIds ? new Set(syncIds) : null;
  const toSync = wanted
   ? next.filter((b) => wanted.has(b.id))
   : activeId ? next.filter((b) => b.id === activeId) : [];

  for (const b of toSync) {
   scheduleSalesbotSave(b.id, async () => {
    // Lê a prova no instante real da execução. Assim autosave + Salvar usam
    // sempre a revisão devolvida pelo save anterior.
    const proof = syncProofRef.current.get(b.id);
    const result = (await syncFn({ data: {
     bot: {
      id: b.id,
      nome: getBotName(b),
      escopo: b.escopo ?? "individual",
      startBlockId: b.startBlockId ?? null,
      gatilhos: (b.gatilhos ?? []) as unknown[],
      maxInteracoes: b.maxInteracoes,
      startPosition: b.startPosition,
      blocks: (b.blocks ?? []) as unknown[],
     },
     expectedRevision: proof?.revision ?? null,
     baseBlockLocalIds: proof?.baseBlockLocalIds ?? [],
     source: "builder-autosave",
    } } as never)) as unknown as { revision: number; baseBlockLocalIds: string[] };
    syncProofRef.current.set(b.id, {
     revision: Number(result.revision),
     baseBlockLocalIds: [...(result.baseBlockLocalIds ?? [])],
    });
    return result;
   });
  }
 }

 /* ===== Estado de salvamento (Salvando / Salvo / Falha) ===== */
  const [saveStatus, setSaveStatus] = useState<SalesbotSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [closing, setClosing] = useState(false);
  const [activating, setActivating] = useState(false);
  const activationLockRef = useRef(false);
  useEffect(() => subscribeSalesbotSaveStatus((s, err) => {
   setSaveStatus(s);
   setSaveError(err);
   if (s === "saved") setLastSavedAt(new Date());
  }), []);


 // Protege contra fechar/recarregar a aba com alterações ainda não salvas.
 useEffect(() => {
  if (!open) return;
  const handler = (e: BeforeUnloadEvent) => {
   if (!hasPendingSalesbotSaves()) return;
   e.preventDefault();
   e.returnValue = "";
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
 }, [open]);

   /** A fila já limita cada chamada; aqui garantimos que o botão nunca trave. */
   async function flushPendingSaves(): Promise<boolean> {
    try {
     await flushAllSalesbotSaves();
     return !hasPendingSalesbotSaves() && !hasFailedSalesbotSaves()
       && getSalesbotSaveStatus().status !== "error";
    } catch {
     return false;
    }
  }


 /** Salvar sem fechar: força a gravação de tudo que está pendente. */
 async function saveNow(silent = false) {
  if (closing) return;
  setClosing(true);
  try {
    // O botão Salvar deve iniciar uma gravação real, mesmo quando a criação
    // inicial falhou e a fila de autosave está vazia.
    if (active) persist(bots, [active.id]);
    const done = await flushPendingSaves();
    if (!done) {
     toast.error(getSalesbotSaveStatus().error ?? "Não foi possível salvar tudo. Tente novamente.");
    return;
   }
   if (!silent) toast.success("Bot salvo.");
  } finally {
   setClosing(false);
  }
 }

 /** Salva tudo e só então fecha o construtor. */
 async function finishAndClose() {
  if (closing) return;
  setClosing(true);
  try {
    const done = await flushPendingSaves();
    if (!done) {
     toast.error(getSalesbotSaveStatus().error ?? "Não foi possível salvar tudo. Tente novamente.");
    return;
   }
   onClose();
  } finally {
   setClosing(false);
  }
 }


 // Autosave has a single owner: salesbot-sync-queue waits 120_000 ms.
 // Do not add a second interval here: it can save a new edit before two minutes.


 async function cancelAndClose() {
  if (hasPendingSalesbotSaves()) {
   const ok = confirm("Existem alterações ainda não salvas. Deseja salvar antes de sair?");
   if (ok) { await finishAndClose(); return; }
  }
  onClose();
 }

 /** Fluxo único de duplicar/excluir bot: sempre aguarda o banco confirmar
  *  antes de mexer na lista da tela. */
 async function mutateBotList(op: "duplicar" | "excluir", id: string) {
  const src = bots.find((b) => b.id === id);
  if (!src) return;
  // Garante que nada pendente desse bot está no meio do caminho.
  await waitForSalesbotSync(id);

  if (op === "duplicar") {
   // Carrega a fonte completa antes de duplicar. A lista do switcher contém
   // somente metadata e jamais pode ser tratada como um grafo vazio completo.
   const source = await fetchCompleteBot(id);
   // Clona o bot inteiro trocando os ids dos blocos; as ligações são
   // reapontadas por substituição direta no JSON serializado.
   let raw = JSON.stringify(source);
   for (const b of source.blocks ?? []) raw = raw.split(b.id).join(newId("blk"));
   const copy: Salesbot = {
    ...(JSON.parse(raw) as Salesbot),
    id: newId("bot"),
    nome: `${src.nome} (cópia)`,
    isActive: false,
    updatedAt: new Date().toISOString(),
   };
   const next = [copy, ...bots];
   setBots(next);
   try { saveSalesbots(next); } catch { /* ignora */ }
   setActiveId(copy.id);
   setBotSwitcher(false);
   try {
    const created = await enqueueSalesbotSync(copy.id, () => syncFn({ data: { bot: {
     id: copy.id,
     nome: getBotName(copy),
     escopo: copy.escopo ?? "individual",
     startBlockId: copy.startBlockId ?? null,
     gatilhos: (copy.gatilhos ?? []) as unknown[],
     maxInteracoes: copy.maxInteracoes,
     startPosition: copy.startPosition,
     blocks: (copy.blocks ?? []) as unknown[],
    }, expectedRevision: null, baseBlockLocalIds: [], source: "builder-duplicate", isActive: false } } as never) as Promise<unknown>) as unknown as {
     revision: number;
     baseBlockLocalIds: string[];
    };
    syncProofRef.current.set(copy.id, {
     revision: Number(created.revision),
     baseBlockLocalIds: [...(created.baseBlockLocalIds ?? [])],
    });
    toast.success("Bot duplicado.");
   } catch {
    toast.error("Não foi possível duplicar o SalesBot. Tente de novo.");
   }
   return;
  }

  if (!confirm("Excluir este bot?")) return;
  try {
   let proof = syncProofRef.current.get(id);
   if (!proof) {
    await fetchCompleteBot(id);
    proof = syncProofRef.current.get(id);
   }
   if (!proof) throw new Error("salesbot_revision_required");
   await enqueueSalesbotSync(id, () => deleteRemoteBot({
    data: { localId: id, expectedRevision: proof!.revision },
   } as never) as Promise<unknown>);
   clearSalesbotSync(id);
   const next = bots.filter((b) => b.id !== id);
   setBots(next);
   try { saveSalesbots(next); } catch { /* ignora */ }
   if (id === activeId) setActiveId(next[0]?.id ?? null);
   setBotSwitcher(false);
   toast.success("Bot excluído.");
  } catch {
   toast.error("Não foi possível excluir o SalesBot. Tente de novo.");
  }
 }



 /** Histórico de desfazer (Ctrl+Z). Guarda snapshots da lista de bots antes de
  *  cada alteração. É volátil: some quando o builder é fechado. */
 function pushHistory(snapshot: Salesbot[]) {
  historyRef.current = [...historyRef.current.slice(-49), JSON.parse(JSON.stringify(snapshot)) as Salesbot[]];
  setUndoDepth(historyRef.current.length);
 }

 function undo() {
  const prev = historyRef.current.pop();
  setUndoDepth(historyRef.current.length);
  if (!prev) return;
  setSelected(new Set());
  persist(prev);
 }

  function updateActive(mut: (b: Salesbot) => Salesbot, opts?: { history?: boolean }) {
  if (!active) return;
  if (opts?.history !== false) pushHistory(bots);
  persist(
  bots.map((b) => (b.id === active.id? {...mut(b), updatedAt: new Date().toISOString() }: b)),
  );
  }

 /* ===== Blocks ===== */
 function addBlock(kind: BlockKind, at: { x: number; y: number }) {
 const block: Block = { id: newId("blk"), kind, x: at.x, y: at.y };
 if (kind === "condicao") {
 block.condicoes = [
 { id: newId("c"), sujeito: "cliente", operador: "contem", comparador: "entrada-manual", valor: "" },
 ];
 block.condicaoModo = "e";
 }
  if (kind === "pausar") {
   block.pausaTipo = "cronometro";
   block.pausas = [{ id: newId("p"), tipo: "cronometro" }];
  }
  if (kind === "round-robin")
  block.roleta = [
  { id: newId("o"), label: "Opção 1" },
  { id: newId("o"), label: "Opção 2" },
  ];
  if (kind === "validacao")
   block.roleta = [
     { id: newId("r"), label: "Opção 1", tipo: "numero", valor: "1" },
   ];
 updateActive((b) => {
 // Serial persistente: usa nextSerial atual e incrementa. Não reaproveita se um bloco for excluído.
 const currentNextSerial = typeof b.nextSerial === "number"
  ? b.nextSerial
  : (b.blocks.reduce((mx, x) => Math.max(mx, x.serial ?? 0), 0) + 1);
 const numbered: Block = { ...block, serial: currentNextSerial };
 const nextSerial = currentNextSerial + 1;
   // Se veio do "Voltar" da bolinha de cor, o bloco antigo é substituído pelo novo:
   // remove o antigo e repassa todas as ligações que apontavam pra ele.
   const swap = (id?: string) => (replaceTargetId && id === replaceTargetId ? numbered.id : id);
   const base = replaceTargetId
    ? b.blocks
       .filter((x) => x.id !== replaceTargetId)
       .map((x) => ({
        ...x,
        nextBlockId: swap(x.nextBlockId),
        falseNextBlockId: swap(x.falseNextBlockId),
         roleta: x.roleta?.map((o) => ({ ...o, nextBlockId: swap(o.nextBlockId) })),
         pausas: x.pausas?.map((p) => ({ ...p, nextBlockId: swap(p.nextBlockId) })),
         condicoes: x.condicoes?.map((c) => ({ ...c, nextBlockId: swap(c.nextBlockId) })),
         botoes: x.botoes?.map((bt) => ({ ...bt, nextBlockId: swap(bt.nextBlockId) })),
       }))
    : b.blocks;
   const blocks = [...base, numbered];
  const startBlockId = b.startBlockId === replaceTargetId ? numbered.id : b.startBlockId;
  if (!pendingConnection) return {...b, blocks, nextSerial, startBlockId };
  if (pendingConnection.sourceId === "start") return {...b, blocks, nextSerial, startBlockId: numbered.id };
   return {
  ...b,
  nextSerial,
  startBlockId,
   blocks: blocks.map((x) => {
    if (x.id!== pendingConnection.sourceId) return x;
    if (pendingConnection.optionId === "__false__") {
     return { ...x, falseNextBlockId: numbered.id };
    }
    if (pendingConnection.optionId) {
     return {
      ...x,
      roleta: (x.roleta ?? []).map((o) =>
       o.id === pendingConnection.optionId ? { ...o, nextBlockId: numbered.id } : o,
      ),
      pausas: (x.pausas ?? []).map((p) =>
       p.id === pendingConnection.optionId ? { ...p, nextBlockId: numbered.id } : p,
      ),
       condicoes: (x.condicoes ?? []).map((c) =>
        c.id === pendingConnection.optionId ? { ...c, nextBlockId: numbered.id } : c,
       ),
       botoes: x.botoes?.map((bt) =>
        bt.id === pendingConnection.optionId ? { ...bt, nextBlockId: numbered.id } : bt,
       ),
     };
    }
    return {...x, nextBlockId: numbered.id };
   }),
   };
   });
   setPickerAt(null);
   setPendingConnection(null);
   setReplaceTargetId(null);
   }

   /** Conecta uma seta aberta a um bloco JÁ existente (sem abrir o picker). */
   function connectExisting(source: PendingConnection, targetId: string) {
     updateActive((b) => {
       if (source.sourceId === "start") return { ...b, startBlockId: targetId };
       return {
         ...b,
         blocks: b.blocks.map((x) => {
           if (x.id !== source.sourceId) return x;
           if (source.optionId === "__false__") {
             return { ...x, falseNextBlockId: targetId };
           }
           if (source.optionId) {
             return {
               ...x,
               roleta: (x.roleta ?? []).map((o) =>
                 o.id === source.optionId ? { ...o, nextBlockId: targetId } : o,
               ),
               pausas: (x.pausas ?? []).map((p) =>
                 p.id === source.optionId ? { ...p, nextBlockId: targetId } : p,
               ),
                condicoes: (x.condicoes ?? []).map((c) =>
                  c.id === source.optionId ? { ...c, nextBlockId: targetId } : c,
                ),
                botoes: x.botoes?.map((bt) =>
                  bt.id === source.optionId ? { ...bt, nextBlockId: targetId } : bt,
                ),
             };
           }
           return { ...x, nextBlockId: targetId };
         }),
       };
     });
    }

    /** Remove a conexão de saída de um bloco/roleta/pausa (ou do "Iniciar robô"). */
    function disconnectSource(sourceId: "start" | string, optionId?: string) {
      updateActive((b) => {
        if (sourceId === "start") return { ...b, startBlockId: undefined };
        return {
          ...b,
          blocks: b.blocks.map((x) => {
            if (x.id !== sourceId) return x;
            if (optionId === "__false__") {
              return { ...x, falseNextBlockId: undefined };
            }
            if (optionId) {
              if (x.kind === "condicao" && x.condicaoModo === "ou") {
                // Materialize inherited paths before removing one branch. Otherwise
                // its cable immediately reconnects through the shared fallback.
                return {
                  ...x,
                  nextBlockId: undefined,
                  condicoes: (x.condicoes ?? []).map((c) => ({
                    ...c,
                    nextBlockId: c.id === optionId ? undefined : c.nextBlockId ?? x.nextBlockId,
                  })),
                };
              }
              return {
                ...x,
                roleta: (x.roleta ?? []).map((o) =>
                  o.id === optionId ? { ...o, nextBlockId: undefined } : o,
                ),
                pausas: (x.pausas ?? []).map((p) =>
                  p.id === optionId ? { ...p, nextBlockId: undefined } : p,
                ),
                condicoes: (x.condicoes ?? []).map((c) =>
                  c.id === optionId ? { ...c, nextBlockId: undefined } : c,
                ),
                botoes: x.botoes?.map((bt) =>
                  bt.id === optionId ? { ...bt, nextBlockId: undefined } : bt,
                ),
              };
            }
            return { ...x, nextBlockId: undefined };
          }),
        };
      });
    }


 function updateBlock(id: string, patch: Partial<Block>) {
 updateActive((b) => ({...b, blocks: b.blocks.map((x) => (x.id === id? {...x,...patch }: x)) }));
 }
  function removeBlocks(ids: Set<string>) {
  updateActive((b) => ({
 ...b,
  startBlockId: b.startBlockId && ids.has(b.startBlockId)? undefined: b.startBlockId,
  blocks: b.blocks
 .filter((x) =>!ids.has(x.id))
 .map((x) => ({
 ...x,
  nextBlockId: x.nextBlockId && ids.has(x.nextBlockId)? undefined: x.nextBlockId,
  roleta: x.roleta?.map((o) => ({
 ...o,
  nextBlockId: o.nextBlockId && ids.has(o.nextBlockId)? undefined: o.nextBlockId,
  })),
   pausas: x.pausas?.map((p) => ({
    ...p,
    nextBlockId: p.nextBlockId && ids.has(p.nextBlockId) ? undefined : p.nextBlockId,
   })),
   botoes: x.botoes?.map((bt) => ({
    ...bt,
    nextBlockId: bt.nextBlockId && ids.has(bt.nextBlockId) ? undefined : bt.nextBlockId,
   })),
  })),
  }));
  setSelected(new Set());
   }

   /** "Voltar": abre o seletor de blocos para trocar este bloco por outro,
    *  mantendo a posição e as ligações que apontavam pra ele. */
   function replaceBlock(blockId: string) {
    if (!active) return;
    const blk = active.blocks.find((x) => x.id === blockId);
    if (!blk) return;
    const at = { x: blk.x ?? 0, y: blk.y ?? 0 };
    let pending: PendingConnection | null = null;
    if (active.startBlockId === blockId) {
     pending = { sourceId: "start", at };
    } else {
     for (const x of active.blocks) {
      if (x.id === blockId) continue;
      if (x.nextBlockId === blockId) { pending = { sourceId: x.id, at }; break; }
      if (x.falseNextBlockId === blockId) { pending = { sourceId: x.id, optionId: "__false__", at }; break; }
      const opt = [...(x.roleta ?? []), ...(x.pausas ?? []), ...(x.condicoes ?? []), ...(x.botoes ?? [])]
       .find((o) => o.nextBlockId === blockId);
      if (opt) { pending = { sourceId: x.id, optionId: opt.id, at }; break; }
     }
    }
    setReplaceTargetId(blockId);
    setPendingConnection(pending);
    setPickerAt(at);
   }



  /** Duplica um ou vários blocos de uma vez, mantendo as ligações internas do grupo. */
  function duplicateBlocks(ids: Set<string>) {
   if (!ids.size) return;
   const createdIds: string[] = [];
   updateActive((b) => {
    const sources = b.blocks.filter((x) => ids.has(x.id));
    if (!sources.length) return b;
    const idMap = new Map<string, string>();
    for (const s of sources) idMap.set(s.id, newId("blk"));
    let serial = typeof b.nextSerial === "number"
     ? b.nextSerial
     : (b.blocks.reduce((mx, x) => Math.max(mx, x.serial ?? 0), 0) + 1);
    const remap = (target?: string) => (target && idMap.has(target) ? idMap.get(target) : undefined);
    const clones = sources.map((s) => {
     const clone = JSON.parse(JSON.stringify(s)) as Block;
     clone.id = idMap.get(s.id)!;
     clone.serial = serial++;
     clone.x = (s.x ?? 0) + 48;
     clone.y = (s.y ?? 0) + 48;
     clone.nextBlockId = remap(clone.nextBlockId);
     if (clone.roleta)
      clone.roleta = clone.roleta.map((o) => ({ ...o, id: newId("o"), nextBlockId: remap(o.nextBlockId) }));
     if (clone.pausas)
      clone.pausas = clone.pausas.map((p) => ({ ...p, id: newId("p"), nextBlockId: remap(p.nextBlockId) }));
     if (clone.condicoes) clone.condicoes = clone.condicoes.map((c) => ({ ...c, id: newId("c") }));
     if (clone.botoes)
      clone.botoes = clone.botoes.map((bt) => ({ ...bt, id: newId("btn"), nextBlockId: remap(bt.nextBlockId) }));
     createdIds.push(clone.id);
     return clone;
    });
    return { ...b, blocks: [...b.blocks, ...clones], nextSerial: serial };
   });
   setSelected(new Set(createdIds));
  }

  /** Copiar/colar blocos entre abas do navegador (mesmo origin).
   *  Usa a área de transferência do sistema (Ctrl+C / Ctrl+V) e também
   *  espelha em localStorage como fallback quando o navegador bloqueia
   *  a leitura do clipboard. */
  async function copyBlocks(ids: Set<string>) {
   if (!active || !ids.size) return;
   const sources = active.blocks.filter((x) => ids.has(x.id));
   if (!sources.length) return;
   const payload = JSON.stringify({
    __mkton: "salesbot-blocks",
    version: 1,
    blocks: JSON.parse(JSON.stringify(sources)) as Block[],
   });
   try { localStorage.setItem(BLOCK_CLIPBOARD_KEY, payload); } catch { /* ignore */ }
   try {
    await navigator.clipboard.writeText(payload);
   } catch { /* sem permissão: o fallback do localStorage cobre */ }
   toast.success(`${sources.length} bloco(s) copiado(s) — cole com Ctrl+V em qualquer aba`);
  }

  function readClipboardBlocks(text: string): Block[] | null {
   try {
    const parsed = JSON.parse(text) as { __mkton?: string; blocks?: Block[] };
    if (parsed?.__mkton !== "salesbot-blocks" || !Array.isArray(parsed.blocks)) return null;
    return parsed.blocks.filter((b) => b && typeof b === "object" && typeof b.kind === "string");
   } catch { return null; }
  }

  async function pasteBlocks() {
   if (!active) return;
   let source: Block[] | null = null;
   try {
    const text = await navigator.clipboard.readText();
    source = readClipboardBlocks(text);
   } catch { /* sem permissão de leitura */ }
   if (!source) {
    try {
     const local = localStorage.getItem(BLOCK_CLIPBOARD_KEY);
     if (local) source = readClipboardBlocks(local);
    } catch { /* ignore */ }
   }
   if (!source || !source.length) {
    toast.error("Nada de Salesbot na área de transferência. Copie blocos com Ctrl+C primeiro.");
    return;
   }
   const src = source;
   const createdIds: string[] = [];
   updateActive((b) => {
    const idMap = new Map<string, string>();
    for (const s of src) idMap.set(s.id, newId("blk"));
    let serial = typeof b.nextSerial === "number"
     ? b.nextSerial
     : (b.blocks.reduce((mx, x) => Math.max(mx, x.serial ?? 0), 0) + 1);
    const remap = (target?: string) => (target && idMap.has(target) ? idMap.get(target) : undefined);
    const minX = Math.min(...src.map((s) => s.x ?? 0));
    const minY = Math.min(...src.map((s) => s.y ?? 0));
    // Cola perto do centro visível do canvas, mantendo o layout relativo.
    const rect = canvasRef.current?.getBoundingClientRect();
    const anchorX = rect ? (rect.width / 2 - pan.x) / scale - 120 : minX + 64;
    const anchorY = rect ? (rect.height / 2 - pan.y) / scale - 80 : minY + 64;
    const clones = src.map((s) => {
     const clone = JSON.parse(JSON.stringify(s)) as Block;
     clone.id = idMap.get(s.id)!;
     clone.serial = serial++;
     clone.x = anchorX + ((s.x ?? 0) - minX);
     clone.y = anchorY + ((s.y ?? 0) - minY);
     clone.nextBlockId = remap(clone.nextBlockId);
     clone.falseNextBlockId = remap(clone.falseNextBlockId);
     if (clone.roleta)
      clone.roleta = clone.roleta.map((o) => ({ ...o, id: newId("o"), nextBlockId: remap(o.nextBlockId) }));
     if (clone.pausas)
      clone.pausas = clone.pausas.map((p) => ({ ...p, id: newId("p"), nextBlockId: remap(p.nextBlockId) }));
     if (clone.condicoes) clone.condicoes = clone.condicoes.map((c) => ({ ...c, id: newId("c") }));
     if (clone.botoes)
      clone.botoes = clone.botoes.map((bt) => ({ ...bt, id: newId("btn"), nextBlockId: remap(bt.nextBlockId) }));
     createdIds.push(clone.id);
     return clone;
    });
    return { ...b, blocks: [...b.blocks, ...clones], nextSerial: serial };
   });
   setSelected(new Set(createdIds));
   toast.success(`${src.length} bloco(s) colado(s)`);
  }



 /* ===== Atalhos ===== */
 useEffect(() => {
 if (!open) return;
 function onKey(e: KeyboardEvent) {
 const tag = (e.target as HTMLElement)?.tagName;
 const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
 // Ctrl/Cmd+D duplica os blocos selecionados mesmo com o foco em um campo,
 // e precisa vir antes do navegador abrir o "adicionar favorito".
 if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "d") {
 if (selected.size) {
 e.preventDefault();
 e.stopPropagation();
 duplicateBlocks(selected);
 }
 return;
 }
 if (typing) return;
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
 e.preventDefault();
 undo();
 } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
 e.preventDefault();
  if (active) setSelected(new Set(active.blocks.map((b) => b.id)));
   } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
   if (selected.size) {
    e.preventDefault();
    void copyBlocks(selected);
   }
   } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
   e.preventDefault();
   void pasteBlocks();
  } else if (e.key === "Delete" || e.key === "Backspace") {

 if (selected.size) {
 e.preventDefault();
 removeBlocks(selected);
 }
 } else if (e.key === "Escape") {
 setSelected(new Set());
 setPickerAt(null);
 setBotSwitcher(false);
 }
 }
 window.addEventListener("keydown", onKey, { capture: true });
 return () => window.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions);
 }, [open, active, selected]);

  /* ===== Pan/Zoom/Marquee ===== */
  function screenToWorld(sx: number, sy: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (sx - rect.left - pan.x) / scale, y: (sy - rect.top - pan.y) / scale };
  }

  /* ===== Arrasto do botão "+" (ponta de seta aberta) ===== */
  useEffect(() => {
    if (!addDrag) return;
    function onMove(e: MouseEvent) {
      const w = screenToWorld(e.clientX, e.clientY);
      setAddDrag((prev) => {
        if (!prev) return prev;
        const moved = prev.moved || Math.hypot(w.x - prev.origin.x, w.y - prev.origin.y) > 4;
        return { ...prev, pos: w, moved };
      });
    }
    function onUp() {
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
    }


    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [addDrag, pan, scale]);



 function onWheel(e: React.WheelEvent) {
 // Se o ponteiro está sobre uma área rolável do bloco (mensagem, listas,
 // campos de texto), o scroll só rola aquela área — nunca dá zoom no canvas.
 const alvo = e.target as HTMLElement | null;
 if (alvo?.closest("[data-canvas-no-zoom], textarea")) return;
 e.preventDefault();
 const rect = canvasRef.current!.getBoundingClientRect();
 const mx = e.clientX - rect.left;
 const my = e.clientY - rect.top;
 const delta = -e.deltaY * 0.001;
 const newScale = Math.min(2, Math.max(0.25, scale * (1 + delta)));
 const wx = (mx - pan.x) / scale;
 const wy = (my - pan.y) / scale;
 setPan({ x: mx - wx * newScale, y: my - wy * newScale });
 setScale(newScale);
 }

 function onCanvasMouseDown(e: React.MouseEvent) {
 if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
 // pan explícito (botão do meio / direito / alt+esq)
 dragRef.current = {
 mode: "pan",
 startX: e.clientX,
 startY: e.clientY,
 panStart: {...pan },
 };
 e.preventDefault();
 return;
 }
 if (e.button === 0 && e.ctrlKey) {
 // marquee select
 const w = screenToWorld(e.clientX, e.clientY);
 dragRef.current = { mode: "marquee", startX: w.x, startY: w.y };
 setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
 setSelected(new Set());
 e.preventDefault();
 return;
 }
 // clique no fundo vazio → inicia pan + deseleciona
 if (e.button === 0 && (e.target as HTMLElement).dataset.canvasBg === "1") {
 setSelected(new Set());
 dragRef.current = {
 mode: "pan",
 startX: e.clientX,
 startY: e.clientY,
 panStart: {...pan },
 };
 e.preventDefault();
 }
 }

 function onCanvasMouseMove(e: React.MouseEvent) {
 const d = dragRef.current;
 if (d.mode === "pan" && d.panStart) {
 setPan({ x: d.panStart.x + (e.clientX - d.startX), y: d.panStart.y + (e.clientY - d.startY) });
 } else if (d.mode === "block" && d.blockStarts && active) {
 let dx = (e.clientX - d.startX) / scale;
 let dy = (e.clientY - d.startY) / scale;
 // Snap leve: se alguma aresta (left/top) do bloco "principal" alinhar com outro bloco, prende ali.
 const SNAP = 6 / scale;
 const primary = d.blockId? d.blockStarts.get(d.blockId): undefined;
 if (primary) {
 const targetX = primary.x + dx;
 const targetY = primary.y + dy;
 let bestDX: number | null = null;
 let bestDY: number | null = null;
 active.blocks.forEach((b) => {
 if (d.blockStarts!.has(b.id)) return;
 const bx = b.x?? 0;
 const by = b.y?? 0;
 [bx, bx + BLOCK_W].forEach((vx) => {
 [targetX, targetX + BLOCK_W].forEach((tx) => {
 const diff = vx - tx;
 if (Math.abs(diff) < SNAP && (bestDX === null || Math.abs(diff) < Math.abs(bestDX))) bestDX = diff;
 });
 });
 [by, by + BLOCK_H_EST].forEach((vy) => {
 [targetY, targetY + BLOCK_H_EST].forEach((ty) => {
 const diff = vy - ty;
 if (Math.abs(diff) < SNAP && (bestDY === null || Math.abs(diff) < Math.abs(bestDY))) bestDY = diff;
 });
 });
 });
 if (bestDX!== null) dx += bestDX;
 if (bestDY!== null) dy += bestDY;
 }
  // Um arraste inteiro = UMA entrada no histórico (snapshot da posição inicial).
  if (!d.historyPushed) {
  pushHistory(bots);
  d.historyPushed = true;
  }
  updateActive((b) => ({
 ...b,
  blocks: b.blocks.map((x) => {
  const s = d.blockStarts!.get(x.id);
  if (!s) return x;
  return {...x, x: s.x + dx, y: s.y + dy };
  }),
  }), { history: false });
 } else if (d.mode === "marquee") {
 const w = screenToWorld(e.clientX, e.clientY);
 const x = Math.min(d.startX, w.x);
 const y = Math.min(d.startY, w.y);
 const ww = Math.abs(w.x - d.startX);
 const hh = Math.abs(w.y - d.startY);
 setMarquee({ x, y, w: ww, h: hh });
 if (active) {
 const inside = new Set<string>();
 active.blocks.forEach((b) => {
 const bx = b.x?? 0;
 const by = b.y?? 0;
 if (bx + BLOCK_W >= x && bx <= x + ww && by + BLOCK_H_EST >= y && by <= y + hh) {
 inside.add(b.id);
 }
 });
 setSelected(inside);
 }
 }
 }

 function onCanvasMouseUp() {
 dragRef.current = { mode: null, startX: 0, startY: 0 };
 setMarquee(null);
 }

 function startBlockDrag(e: React.MouseEvent, id: string) {
 if (e.button!== 0 || e.altKey || e.ctrlKey) return;
 if ((e.target as HTMLElement).closest("input,textarea,select,button")) return;
 e.stopPropagation();
 if (!selected.has(id)) setSelected(new Set([id]));
 const ids = selected.has(id)? selected: new Set([id]);
 const starts = new Map<string, { x: number; y: number }>();
 active?.blocks.forEach((b) => {
 if (ids.has(b.id)) starts.set(b.id, { x: b.x?? 0, y: b.y?? 0 });
 });
  dragRef.current = {
  mode: "block",
  startX: e.clientX,
  startY: e.clientY,
  blockStarts: starts,
  blockId: id,
  historyPushed: false,
  };
 }

 /* ===== Bounding box for minimap ===== */
 const bbox = useMemo(() => {
 if (!active ||!active.blocks.length) return { x: 0, y: 0, w: 800, h: 600 };
 let minX = Infinity,
 minY = Infinity,
 maxX = -Infinity,
 maxY = -Infinity;
 active.blocks.forEach((b) => {
 const x = b.x?? 0;
 const y = b.y?? 0;
 if (x < minX) minX = x;
 if (y < minY) minY = y;
 if (x + BLOCK_W > maxX) maxX = x + BLOCK_W;
 if (y + BLOCK_H_EST > maxY) maxY = y + BLOCK_H_EST;
 });
 return { x: minX - 80, y: minY - 80, w: maxX - minX + 160, h: maxY - minY + 160 };
 }, [active]);

 function fitToView() {
 if (!canvasRef.current) return;
 const rect = canvasRef.current.getBoundingClientRect();
 const sx = rect.width / bbox.w;
 const sy = rect.height / bbox.h;
 const ns = Math.min(1.5, Math.min(sx, sy) * 0.9);
 setScale(ns);
 setPan({
 x: rect.width / 2 - (bbox.x + bbox.w / 2) * ns,
 y: rect.height / 2 - (bbox.y + bbox.h / 2) * ns,
 });
 }

 function jumpToWorld(wx: number, wy: number) {
 if (!canvasRef.current) return;
 const rect = canvasRef.current.getBoundingClientRect();
 setPan({ x: rect.width / 2 - wx * scale, y: rect.height / 2 - wy * scale });
 }

 if (!open) return null;

 return (
 <RowRegistryContext.Provider value={registerRow}>
 <div data-automation-builder className="fixed inset-0 z-50 bg-background text-foreground flex flex-col">
 {/* Top bar */}
 <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 z-20 bg-background">
 <div className="flex items-center gap-2 relative">
 {active? (
 <>
 {renaming? (
 <input
 autoFocus
  defaultValue={getBotName(active)}
 onBlur={(e) => {
 updateActive((b) => ({...b, nome: e.target.value || b.nome }));
 setRenaming(false);
 }}
 onKeyDown={(e) => {
 if (e.key === "Enter") (e.target as HTMLInputElement).blur();
 if (e.key === "Escape") setRenaming(false);
 }}
 className="bg-slate-800 text-sm px-2 py-1 rounded border border-slate-700 uppercase tracking-wider font-semibold"
 />
 ): (
 <button
 onClick={() => setBotSwitcher((v) =>!v)}
 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider hover:text-sky-400 bg-slate-800/60 px-3 py-1.5 rounded border border-slate-700"
 >
  {getBotName(active)}
 <ChevronDown className="w-3.5 h-3.5 opacity-70" />
 </button>
 )}
 <button
 onClick={() => setRenaming(true)}
 title="Renomear"
 className="text-slate-400 hover:text-white p-1"
 >
 <Pencil className="w-3.5 h-3.5" />
 </button>
 {botSwitcher && (
 <BotSwitcher
 bots={bots}
 activeId={active.id}
 onPick={(id) => {
 setActiveId(id);
 setBotSwitcher(false);
 setSelected(new Set());
 setPan({ x: 200, y: 100 });
 setScale(1);
 }}
 onNew={() => {
 const bot: Salesbot = {
 id: newId("bot"),
 nome: `Novo bot ${bots.length + 1}`,
 blocks: [],
 updatedAt: new Date().toISOString(),
 };
  persist([bot,...bots], [bot.id]);
 setActiveId(bot.id);
 setBotSwitcher(false);
 }}
 onDuplicate={(id) => { void mutateBotList("duplicar", id); }}
 onDelete={(id) => { void mutateBotList("excluir", id); }}

 onClose={() => setBotSwitcher(false)}
 />
 )}
 </>
 ): (
 <span className="text-sm text-slate-400">Nenhum bot</span>
 )}
 </div>
 <div className="flex items-center gap-3">
   {saveStatus === "error" ? (
    <span className="flex items-center gap-2">
     <span
      className="text-xs px-2 py-1 rounded text-rose-300 bg-rose-500/10"
      title={saveError ?? undefined}
     >
      Falha ao salvar
     </span>
     <button
      className="text-xs px-2 py-1 rounded border border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
      onClick={() => { retrySalesbotSave(); void saveNow(); }}
     >
      Tentar novamente
     </button>
    </span>
   ) : saveStatus === "saving" ? (
    <span role="status" className="text-xs text-muted-foreground">Salvando no servidor...</span>
   ) : saveStatus === "dirty" ? (
    <span role="status" className="text-xs text-amber-400">Alterações não salvas</span>
   ) : lastSavedAt ? (
    <span className="text-[11px] text-slate-500" title={`Último salvamento: ${lastSavedAt.toLocaleString("pt-BR")}`}>
     Salvo {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </span>
   ) : null}


 {effectiveScope === "grupo" && (
  <label
   className="flex items-center gap-1.5 text-[11px] text-slate-400 mr-1"
   title="Em grupo o bot deve interagir pouco: ao atingir esse número de interações ele encerra sozinho."
  >
   Máx. interações
   <input
    type="number"
    min={1}
    max={50}
    value={active?.maxInteracoes ?? GRUPO_MAX_INTERACOES_PADRAO}
    onChange={(e) => {
     const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
     updateActive((b) => ({ ...b, maxInteracoes: n }));
    }}
    className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
   />
  </label>
 )}

  <div className="flex items-center gap-1.5 mr-2">
    <span className="text-[10px] uppercase tracking-wider text-slate-500">Robô Ativo</span>
    <Switch
      checked={active?.isActive ?? false}
      disabled={!active || activating || closing}
      aria-label="Robô ativo"
      onCheckedChange={(val: boolean) => {
        if (!active || activationLockRef.current) return;
        if (hasPendingSalesbotSaves()) {
          toast.error("Salve as alterações antes de mudar o estado do robô.");
          return;
        }
        const localId = active.id;
        activationLockRef.current = true;
        setActivating(true);
        void (async () => {
          try {
            const result = await enqueueSalesbotSync(localId, async () => {
              const proof = syncProofRef.current.get(localId);
              if (!proof) throw new Error("Salve o bot antes de ativar.");
              const saved = (await setActiveFn({ data: {
                localId, expectedRevision: proof.revision, isActive: val,
              } } as never)) as unknown as { revision: number; isActive: boolean };
              syncProofRef.current.set(localId, {
                revision: Number(saved.revision),
                baseBlockLocalIds: [...proof.baseBlockLocalIds],
              });
              return saved;
            });
            setBots((prev) => {
              const next = prev.map((bot) => bot.id === localId ? { ...bot, isActive: result.isActive } : bot);
              saveSalesbots(next);
              return next;
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Não foi possível alterar o estado do SalesBot.");
          } finally {
            activationLockRef.current = false;
            setActivating(false);
          }
        })();
      }}
      className="scale-75"
    />
  </div>

  <button
   className="text-sm text-slate-300 hover:text-white px-3 py-1.5"
   onClick={() => { void cancelAndClose(); }}
  >
 Fechar
 </button>
 <button
 className="text-sm bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded disabled:opacity-60"
 disabled={closing}
 onClick={() => { void saveNow(); }}
 >
 {closing ? "Salvando…" : "Salvar"}
 </button>

 </div>

 </header>

 <div className="flex-1 relative min-h-0 overflow-hidden">
 {/* Canvas */}
 <div
 ref={canvasRef}
 data-canvas-bg="1"
          className="absolute inset-0 [background-size:24px_24px] cursor-grab active:cursor-grabbing overflow-hidden select-none"
          style={{ backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--primary) 18%, transparent) 1px, transparent 1px)" }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onWheel={onWheel}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).dataset.canvasBg === "1") e.preventDefault();
          }}
 onDoubleClick={(e) => {
 if ((e.target as HTMLElement).dataset.canvasBg === "1") {
 setPendingConnection(null);
 setPickerAt(screenToWorld(e.clientX, e.clientY));
 }
 }}
 >
 <div
 data-canvas-bg="1"
 style={{
 transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
 transformOrigin: "0 0",
 }}
 className="absolute inset-0"
 >
          {active && (() => {
            const rawFlow = computeFlow(active.blocks, active.startBlockId, rowOffsets);
            // Aplica o deslocamento manual das pontas soltas (arraste do "+")
            const anchors = new Map(rawFlow.lines.map((l) => [l.id, { x: l.x1, y: l.y1 }]));
            const bases = new Map(rawFlow.openEnds.map((e) => [e.id, { x: e.x, y: e.y }]));
            const flow = {
              ...rawFlow,
              openEnds: rawFlow.openEnds.map((e) => {
                const off = looseEnds[e.id];
                return off ? { ...e, x: e.x + off.dx, y: e.y + off.dy } : e;
              }),
              lines: rawFlow.lines.map((l) => {
                const off = looseEnds[l.id];
                if (!off || !l.open) return l;
                const base = bases.get(l.id);
                if (!base) return l;
                return { ...l, x2: base.x + off.dx - 10, y2: base.y + off.dy };
              }),
            };
            const draggingKey =
              addDrag
                ? addDrag.endId
                : null;
            return (
              <>
                <ConnectionLayer lines={flow.lines} />
                {/* Start node */}
                <StartNode
                  connected={Boolean(active.startBlockId)}
                  showTutorials={showTutorials}
                  onToggleTutorials={toggleTutorials}
                />
                {/* Preview da linha enquanto arrasta o "+" */}
                {addDrag && (
                  <>
                    <ConnectionLayer
                      lines={[{
                        id: "add-drag-preview",
                        x1: addDrag.anchor.x,
                        y1: addDrag.anchor.y,
                        x2: addDrag.pos.x,
                        y2: addDrag.pos.y,
                        dashed: true,
                        open: true,
                      }]}
                    />
                    <div
                      style={{ position: "absolute", left: addDrag.pos.x - 10, top: addDrag.pos.y - 10, pointerEvents: "none" }}
                      className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                    >
                      <Plus className="w-3 h-3" />
                    </div>
                  </>
                )}
                {/* Adders nas pontas das setas abertas */}
                {flow.openEnds.map((end) => {
                  if (draggingKey === end.id) return null;
                  return (
                    <ArrowEndAdder
                      key={end.id}
                      x={end.x}
                      y={end.y}
                      onStartDrag={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const base = bases.get(end.id) ?? { x: end.x, y: end.y };
                        setAddDrag({
                          sourceId: end.sourceId,
                          optionId: end.optionId,
                          endId: end.id,
                          anchor: anchors.get(end.id) ?? { x: end.x, y: end.y },
                          base,
                          origin: { x: end.x, y: end.y },
                          pos: { x: end.x, y: end.y },
                          moved: false,
                        });
                      }}
                    />
                  );
                })}

                {/* Botões "×" para desconectar cabos conectados (no início do cabo) */}
                {flow.connectedEnds.map((end) => (
                  <ArrowEndDisconnect
                    key={end.id}
                    x={end.x}
                    y={end.y}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      disconnectSource(end.sourceId, end.optionId);
                    }}
                  />
                ))}
              </>
            );
          })()}


 {active?.blocks.map((block) => (
 <div
 key={block.id}
 data-block-wrapper="1"
 style={{ position: "absolute", left: block.x?? 0, top: block.y?? 0, width: BLOCK_W }}
 onMouseDown={(e) => startBlockDrag(e, block.id)}
 >
 <BlockCard
 block={block}
 allBlocks={active?.blocks ?? []}
 scope={effectiveScope}
 selected={selected.has(block.id)}
 onChange={(patch) => updateBlock(block.id, patch)}
  onRemove={() => removeBlocks(new Set([block.id]))}
  onDuplicate={() => duplicateBlocks(new Set([block.id]))}

 onAddAfter={(optionId) => {
 const at = { x: (block.x?? 0) + BLOCK_W + 80, y: (block.y?? 0) };
 setReplaceTargetId(null);
 setPendingConnection({ sourceId: block.id, optionId, at });
 setPickerAt(at);
 }}
 onReplace={() => replaceBlock(block.id)}
 />
 </div>
 ))}

 {/* Marquee */}
 {marquee && (
 <div
 className="absolute border-2 border-sky-400 bg-sky-400/10 pointer-events-none"
 style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
 />
 )}
 </div>

 {/* Empty state */}
 {active && active.blocks.length === 0 && (
 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
 <button
 className="pointer-events-auto inline-flex items-center gap-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded shadow-lg"
 onClick={() => {
 const rect = canvasRef.current!.getBoundingClientRect();
 const at = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
 setPendingConnection({ sourceId: "start", at });
 setPickerAt(at);
 }}
 >
 <Plus className="w-4 h-4" /> Adicionar primeiro bloco
 </button>
 </div>
 )}
 </div>

 {/* Zoom controls */}
 <div className="absolute top-3 right-3 z-10 flex flex-col bg-slate-900/90 border border-slate-700 rounded-md overflow-hidden">
 <button
 className="p-1.5 hover:bg-slate-800"
 onClick={() => setScale((s) => Math.min(2, s + 0.1))}
 title="Zoom +"
 >
 <Plus className="w-3.5 h-3.5" />
 </button>
 <div className="px-1 text-[10px] text-slate-400 text-center border-y border-slate-700">
 {Math.round(scale * 100)}%
 </div>
 <button
 className="p-1.5 hover:bg-slate-800"
 onClick={() => setScale((s) => Math.max(0.25, s - 0.1))}
 title="Zoom -"
 >
 <Minus className="w-3.5 h-3.5" />
 </button>
 <button className="p-1.5 hover:bg-slate-800" onClick={fitToView} title="Centralizar">
 <Maximize2 className="w-3.5 h-3.5" />
 </button>
 </div>

 {/* Minimap */}
 {active && (
 <Minimap
 blocks={active.blocks}
 bbox={bbox}
 pan={pan}
 scale={scale}
 canvasRef={canvasRef}
 onJump={(wx, wy) => jumpToWorld(wx, wy)}
 />
 )}

    {/* Botão flutuante "Testar bot", ícone de play (mais intuitivo) */}
				{active && !testOpen && (
					<button
						onClick={() => setTestOpen(true)}
						title="Testar bot (simulação interativa)"
						aria-label="Testar bot"
						className="absolute right-4 z-20 w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white shadow-xl ring-2 ring-emerald-300/60 grid place-items-center transition-transform hover:scale-105"
						style={{ bottom: `${Math.round(130 * Math.min(1.4, Math.max(0.5, scale))) + 20}px` }}
					>
						<Play className="w-5 h-5 fill-current" strokeWidth={0} />
					</button>
				)}

				{/* Desfazer (Ctrl + Z): pilha volátil, some ao fechar o bot */}
				{active && !testOpen && (
					<button
						onClick={undo}
						disabled={undoDepth === 0}
						title={undoDepth ? `Desfazer última ação (Ctrl + Z) — ${undoDepth} disponíve${undoDepth > 1 ? "is" : "l"}` : "Nada para desfazer"}
						aria-label="Desfazer"
						className="absolute right-4 z-20 w-11 h-11 rounded-full bg-slate-900/95 border border-slate-700 text-slate-200 shadow-xl grid place-items-center transition-transform hover:scale-105 hover:bg-slate-800 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
						style={{ bottom: `${Math.round(130 * Math.min(1.4, Math.max(0.5, scale))) + 76}px` }}
					>
						<Undo2 className="w-5 h-5" />
					</button>
				)}

				{/* Ações em massa: aparece quando há blocos selecionados (Ctrl + arrastar) */}
				{active && selected.size > 0 && !testOpen && (
					<div
						className="absolute right-[68px] z-20 flex items-center gap-1 rounded-full bg-slate-900/95 border border-slate-700 shadow-xl px-2 py-1.5"
						style={{ bottom: `${Math.round(130 * Math.min(1.4, Math.max(0.5, scale))) + 20}px` }}
					>
						<span className="text-[11px] text-slate-300 px-1.5 whitespace-nowrap">
							{selected.size} selecionado{selected.size > 1 ? "s" : ""}
						</span>
						<button
							onClick={() => duplicateBlocks(selected)}
							title="Duplicar selecionados (Ctrl + D)"
							className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-sky-600 hover:bg-sky-500 text-white"
						>
							<Copy className="w-3.5 h-3.5" /> Duplicar
						</button>
						<button
							onClick={() => void copyBlocks(selected)}
							title="Copiar selecionados (Ctrl + C) — cole em outra aba com Ctrl + V"
							className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-slate-700 hover:bg-slate-600 text-white"
						>
							<Copy className="w-3.5 h-3.5" /> Copiar
						</button>
						<button
							onClick={() => void pasteBlocks()}
							title="Colar blocos copiados (Ctrl + V)"
							className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-slate-700 hover:bg-slate-600 text-white"
						>
							Colar
						</button>
						<button
							onClick={() => removeBlocks(selected)}
							title="Excluir selecionados (Delete)"
							className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white"
						>
							<Trash2 className="w-3.5 h-3.5" /> Excluir
						</button>
						<button
							onClick={() => setSelected(new Set())}
							title="Limpar seleção (Esc)"
							className="text-[11px] px-2 py-1 rounded-full text-slate-400 hover:text-slate-200"
						>
							Limpar
						</button>
					</div>
				)}



 {/* Simulador de conversa (fica sobre o mapa) */}
 <SalesbotTestPhone open={testOpen} onClose={() => setTestOpen(false)} bot={active} />

 {/* Add block via double-click no canvas vazio ou pelos botões "+" nas pontas das setas */}
 </div>

 {pickerAt && (
  <BlockPicker
   scope={effectiveScope}
   onPick={(k) => addBlock(k, pickerAt)}
   onClose={() => { setPickerAt(null); setReplaceTargetId(null); }}
  />
 )}
 </div>
 </RowRegistryContext.Provider>
 );
}

function StartNode({
 connected: _connected,
 showTutorials,
 onToggleTutorials,
}: {
 connected: boolean;
 showTutorials: boolean;
 onToggleTutorials: () => void;
}) {
 return (
 <div
 className="absolute bg-card border border-border text-card-foreground rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-between gap-2 shadow-lg"
 style={{ left: 0, top: -60, width: 230 }}
 >
 <span className="flex items-center gap-2">
  <Play className="w-3.5 h-3.5 text-primary" /> Iniciar robô
 </span>
 <button
  type="button"
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => { e.stopPropagation(); onToggleTutorials(); }}
  title={showTutorials ? "Ocultar as explicações dos blocos" : "Mostrar as explicações dos blocos"}
  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors ${
   showTutorials
    ? "bg-primary/15 border-primary/40 text-primary"
    : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
  }`}
 >
  {showTutorials ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
  Tutorial
 </button>
 </div>
 );
}

/** Botão "+" renderizado na ponta de uma seta pontilhada. Arrastar (mousedown+move) posiciona o próximo bloco; soltar abre o seletor. */
function ArrowEndAdder({ x, y, onStartDrag }: { x: number; y: number; onStartDrag: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onMouseDown={onStartDrag}
      style={{ position: "absolute", left: x - 10, top: y - 10 }}
      className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:scale-110 transition-transform cursor-grab active:cursor-grabbing"
      title="Arraste para posicionar o próximo bloco"
    >
      <Plus className="w-3 h-3" />
    </button>
  );
}

/** Botão "×" renderizado no início de um cabo conectado. Clique remove a conexão de saída. */
function ArrowEndDisconnect({ x, y, onClick }: { x: number; y: number; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: x - 8, top: y - 8 }}
      className="w-4 h-4 rounded-full bg-card border border-border text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive flex items-center justify-center shadow-sm transition-colors"
      title="Desconectar cabo"
    >
      <X className="w-2.5 h-2.5" />
    </button>
  );
}


type FlowLine = { id: string; x1: number; y1: number; x2: number; y2: number; dashed?: boolean; open?: boolean };
type OpenEnd = { id: string; x: number; y: number; sourceId: "start" | string; optionId?: string };
type ConnectedEnd = { id: string; x: number; y: number; sourceId: "start" | string; optionId?: string };

function computeFlow(blocks: Block[], startBlockId?: string, rowOffsets: Record<string, number> = {}): { lines: FlowLine[]; openEnds: OpenEnd[]; connectedEnds: ConnectedEnd[] } {
 const byId = new Map(blocks.map((b) => [b.id, b]));
 const lines: FlowLine[] = [];
 const openEnds: OpenEnd[] = [];
 const connectedEnds: ConnectedEnd[] = [];
 const addLine = (id: string, fromX: number, fromY: number, toId: string | undefined, dashed?: boolean) => {
 if (!toId) return false;
 const to = byId.get(toId);
 if (!to) return false;
 lines.push({ id, x1: fromX, y1: fromY, x2: to.x?? 0, y2: (to.y?? 0) + 44, dashed });
 return true;
 };
 // Retorna a Y real da linha da opção dentro do bloco (medida via RowMeasure);
 // fallback pro chute antigo enquanto o layout não foi medido ainda.
 const rowY = (b: Block, optionId: string, idx: number) => {
   const measured = rowOffsets[`${b.id}::${optionId}`];
   if (typeof measured === "number") return (b.y ?? 0) + measured;
   return (b.y ?? 0) + 88 + idx * 34;
 };
 // Start
 if (!addLine("start", 180, -42, startBlockId)) {
 lines.push({ id: "start-open", x1: 180, y1: -42, x2: 238, y2: -42, dashed: true, open: true });
 openEnds.push({ id: "start-open", x: 248, y: -42, sourceId: "start" });
 } else {
 connectedEnds.push({ id: "start-connected", x: 190, y: -42, sourceId: "start" });
 }
 blocks.forEach((b) => {
 const x = (b.x?? 0) + BLOCK_W;
 const y = (b.y?? 0) + 52;
 if (b.kind === "encerrar-bot") return;
  if (b.kind === "round-robin") {
  b.roleta?.forEach((o, idx) => {
  const oy = rowY(b, o.id, idx);
  if (!addLine(`${b.id}-${o.id}`, x, oy, o.nextBlockId, true)) {
  lines.push({ id: `${b.id}-${o.id}-open`, x1: x, y1: oy, x2: x + 58, y2: oy, dashed: true, open: true });
  openEnds.push({ id: `${b.id}-${o.id}-open`, x: x + 68, y: oy, sourceId: b.id, optionId: o.id });
  } else {
  connectedEnds.push({ id: `${b.id}-${o.id}-connected`, x: x + 10, y: oy, sourceId: b.id, optionId: o.id });
  }
  });
  return;
  }
  if (b.kind === "validacao") {
   const regras = b.roleta ?? [];
   regras.forEach((o, idx) => {
    const oy = rowY(b, o.id, idx);
    if (!addLine(`${b.id}-${o.id}`, x, oy, o.nextBlockId, true)) {
     lines.push({ id: `${b.id}-${o.id}-open`, x1: x, y1: oy, x2: x + 58, y2: oy, dashed: true, open: true });
     openEnds.push({ id: `${b.id}-${o.id}-open`, x: x + 68, y: oy, sourceId: b.id, optionId: o.id });
    } else {
     connectedEnds.push({ id: `${b.id}-${o.id}-connected`, x: x + 10, y: oy, sourceId: b.id, optionId: o.id });
    }
   });
   // Porta "senão" (nenhuma regra passou), sai logo abaixo das regras.
   const fallbackMeasured = rowOffsets[`${b.id}::__else__`];
   const fallbackY = typeof fallbackMeasured === "number"
    ? (b.y ?? 0) + fallbackMeasured
    : (b.y ?? 0) + 88 + Math.max(regras.length, 1) * 34;
   if (!addLine(`${b.id}-else`, x, fallbackY, b.nextBlockId, true)) {
    lines.push({ id: `${b.id}-else-open`, x1: x, y1: fallbackY, x2: x + 58, y2: fallbackY, dashed: true, open: true });
    openEnds.push({ id: `${b.id}-else-open`, x: x + 68, y: fallbackY, sourceId: b.id });
   } else {
    connectedEnds.push({ id: `${b.id}-else-connected`, x: x + 10, y: fallbackY, sourceId: b.id });
   }
   return;
  }
  if (b.kind === "condicao") {
   const conds = b.condicoes ?? [];
   const modoOu = (b.condicaoModo ?? "e") === "ou";
   if (modoOu) {
    // Modo OU: cada condição tem seu próprio caminho.
    conds.forEach((c, idx) => {
     const oy = rowY(b, c.id, idx);
     if (!addLine(`${b.id}-${c.id}`, x, oy, c.nextBlockId ?? b.nextBlockId, true)) {
      lines.push({ id: `${b.id}-${c.id}-open`, x1: x, y1: oy, x2: x + 58, y2: oy, dashed: true, open: true });
      openEnds.push({ id: `${b.id}-${c.id}-open`, x: x + 68, y: oy, sourceId: b.id, optionId: c.id });
     } else {
      connectedEnds.push({ id: `${b.id}-${c.id}-connected`, x: x + 10, y: oy, sourceId: b.id, optionId: c.id });
     }
    });
   } else {
    // Modo E (ou condição única): uma saída "verdadeiro".
    const trueMeasured = rowOffsets[`${b.id}::__true__`];
    const trueY = typeof trueMeasured === "number" ? (b.y ?? 0) + trueMeasured : y;
    if (!addLine(`${b.id}-true`, x, trueY, b.nextBlockId, true)) {
     lines.push({ id: `${b.id}-true-open`, x1: x, y1: trueY, x2: x + 58, y2: trueY, dashed: true, open: true });
     openEnds.push({ id: `${b.id}-true-open`, x: x + 68, y: trueY, sourceId: b.id });
    } else {
     connectedEnds.push({ id: `${b.id}-true-connected`, x: x + 10, y: trueY, sourceId: b.id });
    }
   }
   // Saída "senão" (nenhuma condição bateu).
   const elseMeasured = rowOffsets[`${b.id}::__false__`];
   const elseY = typeof elseMeasured === "number"
    ? (b.y ?? 0) + elseMeasured
    : (b.y ?? 0) + 88 + Math.max(conds.length, 1) * 34;
   if (!addLine(`${b.id}-false`, x, elseY, b.falseNextBlockId, true)) {
    lines.push({ id: `${b.id}-false-open`, x1: x, y1: elseY, x2: x + 58, y2: elseY, dashed: true, open: true });
    openEnds.push({ id: `${b.id}-false-open`, x: x + 68, y: elseY, sourceId: b.id, optionId: "__false__" });
   } else {
    connectedEnds.push({ id: `${b.id}-false-connected`, x: x + 10, y: elseY, sourceId: b.id, optionId: "__false__" });
   }
   return;
  }
   if (b.kind === "pausar" && (b.pausas?.length ?? 0) > 1) {
    // Múltiplas pausas → cada uma tem sua própria saída (a que resolver primeiro define o caminho).
    b.pausas!.forEach((p, idx) => {
     const oy = rowY(b, p.id, idx);
     if (!addLine(`${b.id}-${p.id}`, x, oy, p.nextBlockId, true)) {
      lines.push({ id: `${b.id}-${p.id}-open`, x1: x, y1: oy, x2: x + 58, y2: oy, dashed: true, open: true });
      openEnds.push({ id: `${b.id}-${p.id}-open`, x: x + 68, y: oy, sourceId: b.id, optionId: p.id });
     } else {
      connectedEnds.push({ id: `${b.id}-${p.id}-connected`, x: x + 10, y: oy, sourceId: b.id, optionId: p.id });
     }
    });
    return;
   }
   // Mensagem com botões: cada botão ganha o próprio cabinho (caminho do clique).
   if (b.kind === "enviar-mensagem" && b.useBotoes && (b.botoes?.length ?? 0) > 0) {
    b.botoes!.forEach((bt, idx) => {
     const oy = rowY(b, bt.id, idx);
     if (!addLine(`${b.id}-${bt.id}`, x, oy, bt.nextBlockId, true)) {
      lines.push({ id: `${b.id}-${bt.id}-open`, x1: x, y1: oy, x2: x + 58, y2: oy, dashed: true, open: true });
      openEnds.push({ id: `${b.id}-${bt.id}-open`, x: x + 68, y: oy, sourceId: b.id, optionId: bt.id });
     } else {
      connectedEnds.push({ id: `${b.id}-${bt.id}-connected`, x: x + 10, y: oy, sourceId: b.id, optionId: bt.id });
     }
    });
    // Saída padrão (lead respondeu outra coisa / não clicou em botão).
    if (!addLine(`${b.id}-next`, x, y, b.nextBlockId)) {
     lines.push({ id: `${b.id}-open`, x1: x, y1: y, x2: x + 58, y2: y, dashed: true, open: true });
     openEnds.push({ id: `${b.id}-open`, x: x + 68, y: y, sourceId: b.id });
    } else {
     connectedEnds.push({ id: `${b.id}-connected`, x: x + 10, y: y, sourceId: b.id });
    }
    return;
   }
  if (!addLine(`${b.id}-next`, x, y, b.nextBlockId)) {
  lines.push({ id: `${b.id}-open`, x1: x, y1: y, x2: x + 58, y2: y, dashed: true, open: true });
  openEnds.push({ id: `${b.id}-open`, x: x + 68, y: y, sourceId: b.id });
  } else {
  connectedEnds.push({ id: `${b.id}-connected`, x: x + 10, y: y, sourceId: b.id });
  }
  });
  return { lines, openEnds, connectedEnds };
}

function ConnectionLayer({ lines }: { lines: FlowLine[] }) {
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
 d={`M ${l.x1} ${l.y1} C ${l.x1 + mid} ${l.y1}, ${l.x2 - mid} ${l.y2}, ${l.x2} ${l.y2}`}
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
}

/* ============== Bot switcher ============== */

function BotSwitcher({
 bots,
 activeId,
 onPick,
 onNew,
 onDelete,
 onDuplicate,
 onClose,
}: {
 bots: Salesbot[];
 activeId: string;
 onPick: (id: string) => void;
 onNew: () => void;
 onDelete: (id: string) => void;
 onDuplicate: (id: string) => void;
 onClose: () => void;
}) {
 const [q, setQ] = useState("");
  const list = bots.filter((b) => getBotName(b).toLowerCase().includes(q.toLowerCase()));
 return (
 <>
 <div className="fixed inset-0 z-30" onClick={onClose} />
 <div className="absolute top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-md shadow-2xl z-40 overflow-hidden">
 <div className="p-2 border-b border-slate-800">
 <div className="relative">
 <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
 <input
 autoFocus
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Buscar bot..."
 className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1 text-xs"
 />
 </div>
 </div>
 <div className="max-h-72 overflow-y-auto">
 {list.map((b) => (
 <div
 key={b.id}
 className="group flex items-center justify-between px-3 py-2 hover:bg-slate-800 text-xs cursor-pointer"
 onClick={() => onPick(b.id)}
 >
 <span className="flex items-center gap-2 truncate uppercase tracking-wider">
 {b.id === activeId && <Check className="w-3 h-3 text-sky-400" />}
 <span className="truncate">{getBotName(b)}</span>
 </span>
 <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
 <button
 onClick={(e) => {
 e.stopPropagation();
 onDuplicate(b.id);
 }}
 title="Duplicar bot"
 className="text-slate-400 hover:text-sky-400"
 >
 <Copy className="w-3 h-3" />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 onDelete(b.id);
 }}
 title="Excluir bot"
 className="text-slate-400 hover:text-rose-400"
 >
 <Trash2 className="w-3 h-3" />
 </button>
 </span>
 </div>
 ))}
 {list.length === 0 && (
 <div className="px-3 py-4 text-xs text-slate-500 text-center">Nenhum bot.</div>
 )}
 </div>
 <button
 onClick={onNew}
 className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-sky-400 hover:bg-slate-800 border-t border-slate-800"
 >
 <Plus className="w-3 h-3" /> Criar novo bot
 </button>
 </div>
 </>
 );
}

/* ============== Block card + bodies ============== */

function BlockCard({
 block,
 allBlocks,
 scope,
 showTutorial,
 selected,
 onChange,
 onRemove,
 onDuplicate,
 onAddAfter,
 onReplace,
}: {
 block: Block;
 allBlocks: Block[];
 scope: SalesbotEscopo;
 showTutorial?: boolean;
 selected: boolean;
 onChange: (p: Partial<Block>) => void;
 onRemove: () => void;
 onDuplicate: () => void;
 onAddAfter: (optionId?: string) => void;
 onReplace?: () => void;

}) {
 const metaFound = BLOCK_CATALOG.find((b) => b.kind === block.kind);
 const meta = metaFound ?? { kind: block.kind, label: String(block.kind ?? "bloco"), color: "bg-slate-500", desc: "" };
 const metaColor = meta.color || "bg-slate-500";
 const [showBack, setShowBack] = useState(false);
 return (
 <div
 className={`relative bg-slate-900 border rounded-lg shadow-lg ${
 selected? "border-sky-400 ring-2 ring-sky-400/40": "border-slate-700"
 }`}
 >
 {showBack && (
  <div className="absolute -top-9 left-0 z-30" onMouseDown={(e) => e.stopPropagation()}>
   <button
    onClick={(e) => {
     e.stopPropagation();
     setShowBack(false);
     onReplace?.();
    }}
    className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white shadow-lg border border-sky-400/60"
    title="Voltar ao menu de blocos e trocar este bloco"
   >
    <ArrowLeft className="w-3 h-3" /> Voltar
   </button>
  </div>
 )}
 <div className={`h-1.5 w-full rounded-t-lg ${metaColor}`} />
 <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/80 cursor-move">
 <div className="flex items-center gap-2 text-xs font-semibold">
 <button
  type="button"
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => {
   e.stopPropagation();
   setShowBack((v) => !v);
  }}
  title="Trocar este bloco"
  className={`w-2.5 h-2.5 rounded-full ${metaColor} ${showBack ? "ring-2 ring-sky-400/70" : "hover:scale-125"} transition-transform`}
 />

 {typeof block.serial === "number" && (
  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
   #{block.serial}
  </span>
 )}
 {meta.label}
 </div>
 <div className="flex items-center gap-0.5">
 <button
 onClick={(e) => {
 e.stopPropagation();
 onDuplicate();
 }}
 onMouseDown={(e) => e.stopPropagation()}
 className="text-slate-500 hover:text-sky-400 p-0.5"
 title="Duplicar bloco"
 >
 <Copy className="w-3.5 h-3.5" />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 onRemove();
 }}
 onMouseDown={(e) => e.stopPropagation()}
 className="text-slate-500 hover:text-rose-400 p-0.5"
 title="Remover bloco"
 >
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>
 {showTutorial && tutorialForBlock(block.kind, meta.desc) && (
  <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/40 text-[10px] leading-relaxed text-slate-400">
   {tutorialForBlock(block.kind, meta.desc)}
  </div>
 )}

 <div className="p-3 space-y-2 text-xs cursor-default" onMouseDown={(e) => e.stopPropagation()}>
 <BlockBody block={block} allBlocks={allBlocks} scope={scope} onChange={onChange} onAddAfter={onAddAfter} />
 </div>
 </div>
 );
}

function BlockBody({
 block,
 allBlocks,
 scope,
 onChange,
 onAddAfter,
}: {
 block: Block;
 allBlocks: Block[];
 scope: SalesbotEscopo;
 onChange: (p: Partial<Block>) => void;
 onAddAfter: (optionId?: string) => void;
}) {
 switch (block.kind) {
 case "enviar-mensagem":
 return <EnviarMensagemEditor block={block} scope={scope} onChange={onChange} />;
			case "msg-interna":
				return <MsgInternaEditor block={block} onChange={onChange} />;
			case "comentario": {
				const comentarios = block.comentarios && block.comentarios.length > 0
					? block.comentarios
					: [block.texto ?? ""];
				const updateComentarios = (next: string[]) => {
					onChange({ comentarios: next, texto: next[0] ?? "" });
				};
				return (
					<div className="space-y-1.5">
						{comentarios.map((c, idx) => (
							<div key={idx} className="flex items-start gap-1">
								<VariableTextarea
									wrapperClassName="flex-1"
									value={c}
									onChange={(v) => {
										const next = [...comentarios];
										next[idx] = v;
										updateComentarios(next);
									}}
									placeholder={`Resposta ${idx + 1}...`}
									rows={2}
									className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-none"
								/>


								{comentarios.length > 1 && (
									<button
										type="button"
										onClick={() => updateComentarios(comentarios.filter((_, i) => i !== idx))}
										className="text-slate-500 hover:text-red-400 p-1"
										title="Remover esta variação"
									>
										<X className="w-3 h-3" />
									</button>
								)}
							</div>
						))}
						<button
							type="button"
							onClick={() => updateComentarios([...comentarios, ""])}
							className="w-full text-[11px] rounded border border-dashed border-slate-600 hover:border-fuchsia-500/70 hover:text-fuchsia-400 text-slate-400 py-1 transition"
						>
							+ adicionar variação de comentário
						</button>
						<p className="text-[10px] leading-snug text-slate-400">
							O bot alterna entre estas respostas em <span className="text-slate-300">round-robin</span> (envia a primeira, depois a segunda, e assim por diante. Quando chegar ao fim, volta ao início).
						</p>
						<p className="text-[10px] leading-snug text-slate-400">
							Responde automaticamente comentários de posts no Instagram e Facebook. Requer a integração Meta conectada.
						</p>
					</div>
				);
			}

			case "enviar-dm":
				return (
					<div className="space-y-1.5">
						<VariableTextarea
							value={block.texto ?? ""}
							onChange={(v) => onChange({ texto: v })}
							placeholder="Mensagem enviada no privado (Direct/Messenger) de quem comentou..."
							rows={3}
							className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-none"
						/>

						<p className="text-[10px] leading-snug text-slate-400">
							Envia esta mensagem no <span className="text-slate-300">privado</span> de quem comentou.
							No Instagram usa Direct; no Facebook usa a "resposta privada" (Private Reply) do Messenger.
							Requer conta business Meta conectada e só funciona nas 7 dias após o comentário (janela da Meta).
						</p>
					</div>
				);



		case "reacao": {
			const reacoesSugeridas = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
			const reacaoAtual = block.texto ?? "";
			return (
				<div className="space-y-1.5">
					<div className="flex flex-wrap gap-1">
						{reacoesSugeridas.map((emoji) => {
							const ativo = reacaoAtual === emoji;
							return (
								<button
									key={emoji}
									type="button"
									onClick={() => onChange({ texto: emoji })}
									className={`text-base leading-none rounded px-2 py-1 border transition ${
										ativo
											? "bg-emerald-500/20 border-emerald-400"
											: "bg-slate-800 border-slate-700 hover:border-slate-500"
									}`}
									title={`Reagir com ${emoji}`}
								>
									{emoji}
								</button>
							);
						})}
					</div>
					<input
						value={reacaoAtual}
						onChange={(e) => onChange({ texto: e.target.value.slice(0, 4) })}
						placeholder="Ou digite outro emoji"
						className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
					/>
					<p className="text-[10px] leading-snug text-slate-400">
						O bot reage com este emoji na <span className="text-slate-300">última mensagem do lead</span> na conversa.
						Se ainda não houver mensagem recebida, ele reage na última mensagem enviada pelo bot.
					</p>
					<p className="text-[10px] leading-snug text-amber-400/90">
						⚠️ Funciona apenas no WhatsApp Web (Evolution). Não funciona na API oficial do
						WhatsApp Business nem no Instagram — nesses canais o bloco é ignorado.
					</p>
				</div>
			);
		}


  case "pausar":
   return <PausaEditor block={block} scope={scope} onChange={onChange} onAddAfter={onAddAfter} />;
  case "acao":
   return <AcaoEditor block={block} scope={scope} allBlocks={allBlocks} onChange={onChange} />;
   case "validacao":
    return <ValidacaoEditor block={block} onChange={onChange} onAddAfter={onAddAfter} />;
 case "condicao":
  return <CondicaoEditor block={block} onChange={onChange} />;
 case "ir-etapa":
  return <IrEtapaBlocoPicker block={block} allBlocks={allBlocks} onChange={onChange} />;
  case "iniciar-salesbot":
   return <IniciarSalesbotPicker block={block} scope={scope} onChange={onChange} />;
  case "iniciar-ia":
   return <IniciarIaEditor block={block} scope={scope} onChange={onChange} />;
  case "enquete":
   return <EnqueteEditor block={block} onChange={onChange} />;
 case "round-robin":
 return <RoletaEditor block={block} onChange={onChange} onAddAfter={onAddAfter} />;
 case "encerrar-bot":
 return <EncerrarBotEditor block={block} scope={scope} onChange={onChange} />;
 default:
 return <div className="text-slate-500 italic">Configuração em breve.</div>;
 }
}


function EnviarMensagemEditor({ block, scope, onChange }: { block: Block; scope: SalesbotEscopo; onChange: (p: Partial<Block>) => void }) {
 const { isSuperAdmin } = useIsSuperAdmin();
 const botoes = block.botoes ?? [];

 // Migração transparente: legado single-file → mediaItems.
 const items: MediaItem[] = useMemo(() => {
  if (block.mediaItems && block.mediaItems.length > 0) return block.mediaItems;
  if (block.mediaPath && block.mediaKind) {
   return [{
    id: newId("mi"),
    path: block.mediaPath,
    kind: block.mediaKind,
    mime: block.mediaMime ?? "application/octet-stream",
    filename: block.mediaFilename ?? "arquivo",
   }];
  }
  return [];
 }, [block.mediaItems, block.mediaPath, block.mediaKind, block.mediaMime, block.mediaFilename]);

 const [uploading, setUploading] = useState(false);
 const [uploadError, setUploadError] = useState<string | null>(null);
 const uploadFn = useServerFn(uploadSalesbotMedia);

 function commitItems(next: MediaItem[]) {
  // ao usar mediaItems, zeramos os campos legado
  onChange({ mediaItems: next, mediaPath: undefined, mediaKind: undefined, mediaMime: undefined, mediaFilename: undefined });
 }

 async function handleFile(file: File, opts?: { asVoice?: boolean }) {
  setUploadError(null);
  if (file.size > 20 * 1024 * 1024) { setUploadError("Máx. 20 MB por arquivo."); return; }
  const kind: MediaItem["kind"] = file.type.startsWith("image/") ? "image"
   : file.type.startsWith("video/") ? "video"
   : file.type.startsWith("audio/") ? "audio"
   : "document";
  setUploading(true);
  try {
   const buf = await file.arrayBuffer();
   const bytes = new Uint8Array(buf);
   let bin = "";
   for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
   const base64 = btoa(bin);
   const r = await uploadFn({
    data: { fileName: file.name, mimeType: file.type || "application/octet-stream", kind, base64 },
   });
   const newItem: MediaItem = {
    id: newId("mi"),
    path: r.path,
    kind: r.kind,
    mime: r.mime,
    filename: r.fileName,
    delayMs: 0,
    // Só marca como voz automaticamente quando é uma gravação do microfone.
    // Áudios anexados entram como anexo normal até o usuário converter.
    asVoice: kind === "audio" && opts?.asVoice === true ? true : undefined,
   };
   commitItems([...items, newItem]);
  } catch (e) {
   setUploadError(e instanceof Error ? e.message : "Falha no upload");
  } finally {
   setUploading(false);
  }
 }

 // Gravação de áudio pelo microfone → sobe como mensagem de voz (PTT).
 const [recording, setRecording] = useState(false);
 const recorderRef = useRef<MediaRecorder | null>(null);
 const recStreamRef = useRef<MediaStream | null>(null);
 const recChunksRef = useRef<BlobPart[]>([]);
 async function startRecording() {
  setUploadError(null);
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
   setUploadError("Gravação de áudio não suportada neste navegador.");
   return;
  }
  try {
   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
   recStreamRef.current = stream;
   recChunksRef.current = [];
   const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : MediaRecorder.isTypeSupported("audio/mp4")
    ? "audio/mp4"
    : "";
   const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
   recorderRef.current = rec;
   rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
   rec.onstop = () => {
    const usedMime = rec.mimeType || mime || "audio/webm";
    const ext = usedMime.includes("mp4") ? "m4a" : usedMime.includes("ogg") ? "ogg" : "webm";
    const blob = new Blob(recChunksRef.current, { type: usedMime });
    const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type: usedMime });
    setRecording(false);
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
    recorderRef.current = null;
    if (blob.size < 512) { setUploadError("Gravação muito curta ou vazia."); return; }
    void handleFile(file, { asVoice: true });
   };
   rec.start();
   setRecording(true);
  } catch (e) {
   setUploadError(e instanceof Error ? e.message : "Não foi possível iniciar a gravação.");
  }
 }
 function stopRecording() {
  const rec = recorderRef.current;
  if (rec && rec.state !== "inactive") rec.stop();
 }
 useEffect(() => () => {
  recStreamRef.current?.getTracks().forEach((t) => t.stop());
 }, []);

 function updateItem(id: string, patch: Partial<MediaItem>) {
  commitItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
 }
 function removeItem(id: string) {
  commitItems(items.filter((it) => it.id !== id));
 }
 function moveItem(id: string, dir: -1 | 1) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return;
  const next = [...items];
  const target = idx + dir;
  if (target < 0 || target >= next.length) return;
  [next[idx], next[target]] = [next[target], next[idx]];
  commitItems(next);
 }

 function updateBotao(idx: number, patch: Partial<MensagemBotao>) {
  onChange({ botoes: botoes.map((b, i) => (i === idx ? { ...b, ...patch } : b)) });
 }
 function addBotao() {
  if (botoes.length >= 3) return;
  onChange({ botoes: [...botoes, { id: newId("btn"), label: `Botão ${botoes.length + 1}` }] });
 }
 function removeBotao(idx: number) {
  onChange({ botoes: botoes.filter((_, i) => i !== idx) });
 }

 const textoDelayS = Math.round((block.textoDelayMs ?? 0) / 1000);
 const hasTexto = (block.texto ?? "").trim().length > 0;

 return (
  <div className="space-y-2">
    <MensagemTextoEditor value={block.texto ?? ""} scope={scope} onChange={(v) => onChange({ texto: v })} />

   {scope === "grupo" && (
    <div className="flex items-center gap-1.5 pl-1">
     <span className="text-[10px] text-slate-400">Enviar</span>
     {([
      { v: "grupo", label: "No grupo" },
      { v: "privado", label: "No privado da pessoa" },
     ] as const).map((opt) => (
      <button
       key={opt.v}
       type="button"
       onClick={() => onChange({ destino: opt.v })}
       className={`text-[10px] px-2 py-1 rounded border transition-colors ${
        (block.destino ?? "grupo") === opt.v
         ? "border-sky-500 bg-sky-500/10 text-sky-300"
         : "border-slate-700 text-slate-400 hover:text-slate-200"
       }`}
      >
       {opt.label}
      </button>
     ))}
    </div>
   )}
   {scope === "grupo" && (block.destino ?? "grupo") === "privado" && (
    <p className="text-[10px] text-slate-500 pl-1 leading-snug">
     A mensagem vai no privado de quem entrou no grupo (ou de quem falou por último). Se o número não
     estiver disponível, o envio cai automaticamente no grupo.
    </p>
   )}





   <label className="flex items-center gap-2 text-[10px] text-slate-400 pl-1">
    <span>⏱ Aparecer "digitando…" por</span>
    <input
     type="number" min={0} max={20} step={1}
     value={textoDelayS}
     onChange={(e) => onChange({ textoDelayMs: Math.max(0, Math.min(20, Number(e.target.value) || 0)) * 1000 })}
     className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-center"
    />
    <span>seg. antes do texto</span>
   </label>
   {!hasTexto && (
    <p className="text-[10px] text-slate-500 pl-1">
     O tempo de "digitando…" só é usado quando existe texto acima.
    </p>
   )}

   {items.length > 0 && (
    <p className="text-[10px] leading-snug text-slate-400 pl-1">
     Ordem de envio: <span className="text-slate-300">o texto acima vai primeiro</span>, depois os anexos na
     ordem da lista. Para o texto ir <span className="text-slate-300">junto da imagem</span> (embaixo dela),
     deixe o texto acima vazio e escreva na <span className="text-slate-300">legenda</span> do anexo.
    </p>
   )}


   {/* Anexos em sequência */}
   {items.length > 0 && (
    <div className="space-y-1.5">
     {items.map((it, i) => (
      <MediaItemRow
       key={it.id}
       item={it}
       index={i}
       total={items.length}
       onChange={(patch) => updateItem(it.id, patch)}
       onRemove={() => removeItem(it.id)}
       onMove={(dir) => moveItem(it.id, dir)}
      />
     ))}
    </div>
   )}

   <div className="flex gap-1.5">
    <label className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] rounded border border-dashed px-2 py-2 cursor-pointer ${uploading || recording ? "border-slate-600 text-slate-500 pointer-events-none opacity-60" : "border-slate-600 text-slate-300 hover:border-sky-500 hover:text-sky-300"}`}>
     <input
      type="file"
      accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
      className="hidden"
      disabled={uploading || recording}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
     />
     {uploading ? "Enviando..." : items.length === 0
      ? "📎 Anexar imagem, vídeo, áudio ou documento"
      : "➕ Adicionar mais um anexo"}
    </label>
    <button
     type="button"
     onClick={() => (recording ? stopRecording() : void startRecording())}
     disabled={uploading}
     title={recording ? "Parar gravação" : "Gravar mensagem de voz"}
     className={`flex items-center justify-center gap-1 rounded border px-2 py-2 text-[11px] ${
      recording
       ? "border-rose-500 bg-rose-500/10 text-rose-300 animate-pulse"
       : "border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
     } disabled:opacity-50`}
    >
     {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
     <span>{recording ? "Parar" : "Gravar voz"}</span>
    </button>
   </div>
   {uploadError && <div className="text-[10px] text-rose-400">{uploadError}</div>}

   {items.length > 1 && (
    <p className="text-[10px] text-slate-500 leading-snug pl-1">
     Os anexos são enviados na ordem acima. Ajuste o cronômetro de cada um para simular digitação/gravação de áudio antes do envio.
    </p>
   )}

   {/* WhatsApp não renderiza botões interativos em grupos — opção só no 1-a-1. */}
   {isSuperAdmin && scope !== "grupo" && (
    <>
     <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
      <input
       type="checkbox"
       checked={Boolean(block.useBotoes)}
       onChange={(e) => onChange({ useBotoes: e.target.checked })}
       className="accent-sky-500"
      />
      Mensagem com botões
     </label>
     {block.useBotoes && (
      <div className="space-y-1.5 pl-1 border-l-2 border-slate-700/60">
        <div className="text-[10px] text-slate-400/90">
         Até 3 botões de resposta rápida. Cada botão tem o próprio cabinho à direita: arraste para o bloco que deve rodar quando o lead clicar nele. Sem cabo, o bot segue pela saída padrão do bloco.
        </div>
       {botoes.map((b, i) => (
        <RowMeasure key={b.id} blockId={block.id} optionId={b.id}>
          <div className="flex flex-col gap-1.5 pl-2 pb-1 border-b border-slate-700/40 last:border-0">
           <div className="flex items-center gap-1.5">
            <input
             value={b.label}
             onChange={(e) => updateBotao(i, { label: e.target.value })}
             placeholder={`Botão ${i + 1}`}
             maxLength={20}
             className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            />
            <span className={`text-[9px] px-1 py-0.5 rounded ${b.url ? "bg-emerald-500/15 text-emerald-300" : b.nextBlockId ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/60 text-slate-400"}`}>
             {b.url ? "Link (URL)" : b.nextBlockId ? "com caminho" : "sem caminho"}
            </span>
            <button onClick={() => removeBotao(i)} className="text-slate-500 hover:text-rose-400">
             <X className="w-3.5 h-3.5" />
            </button>
           </div>
           <input
            value={b.url ?? ""}
            onChange={(e) => updateBotao(i, { url: e.target.value, nextBlockId: e.target.value ? undefined : b.nextBlockId })}
            placeholder="Opcional: Link externo (http://...)"
            className="w-full bg-slate-900/50 border border-slate-800 rounded px-2 py-0.5 text-[10px] text-slate-300"
           />
          </div>
        </RowMeasure>
       ))}
       {botoes.length < 3 && (
        <button
         onClick={addBotao}
         className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 pl-2"
        >
         <Plus className="w-3 h-3" /> Adicionar botão
        </button>
       )}
      </div>
     )}
    </>
   )}
  </div>
 );
}

function MediaItemRow({
 item, index, total, onChange, onRemove, onMove,
}: {
 item: MediaItem;
 index: number;
 total: number;
 onChange: (p: Partial<MediaItem>) => void;
 onRemove: () => void;
 onMove: (dir: -1 | 1) => void;
}) {
 const previewFn = useServerFn(getSalesbotMediaSignedUrl);
 const [previewUrl, setPreviewUrl] = useState<string | null>(null);
 useEffect(() => {
  let ignore = false;
  setPreviewUrl(null);
  previewFn({ data: { path: item.path } })
   .then((r) => { if (!ignore) setPreviewUrl(r.url); })
   .catch(() => { if (!ignore) setPreviewUrl(null); });
  return () => { ignore = true; };
 }, [item.path, previewFn]);

 const delayS = Math.round((item.delayMs ?? 0) / 1000);
 const isAudio = item.kind === "audio";
 const presenceLabel = isAudio && item.asVoice ? "gravando áudio…" : "digitando…";

 return (
  <div className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1.5">
   <div className="flex items-center gap-1.5">
    <span className="text-[10px] text-slate-500 font-mono tabular-nums w-4 text-center">{index + 1}</span>
    <div className="flex-1 text-[11px] text-slate-300 truncate">
     <span className="text-slate-500">{item.kind}:</span> {item.filename}
    </div>
    <button
     type="button" onClick={() => onMove(-1)} disabled={index === 0}
     className="text-slate-500 hover:text-slate-200 disabled:opacity-30 text-[10px] px-1"
     title="Mover para cima"
    >▲</button>
    <button
     type="button" onClick={() => onMove(1)} disabled={index === total - 1}
     className="text-slate-500 hover:text-slate-200 disabled:opacity-30 text-[10px] px-1"
     title="Mover para baixo"
    >▼</button>
    <button
     type="button" onClick={onRemove}
     className="text-slate-500 hover:text-rose-400"
     title="Remover anexo"
    ><X className="w-3.5 h-3.5" /></button>
   </div>

   {previewUrl && item.kind === "image" && (
    <img src={previewUrl} alt={item.filename} className="max-h-32 rounded" />
   )}
   {previewUrl && item.kind === "video" && (
    <video src={previewUrl} controls className="max-h-32 w-full rounded" />
   )}
   {previewUrl && item.kind === "audio" && (
    <audio src={previewUrl} controls className="w-full h-8" />
   )}

   {isAudio && (
    <label className="flex items-start gap-1.5 text-[10px] text-slate-300 leading-snug">
     <input
      type="checkbox"
      checked={item.asVoice === true}
      onChange={(e) => onChange({ asVoice: e.target.checked })}
      className="accent-emerald-500 mt-0.5"
     />
     <span>
      Enviar como <b>mensagem de voz</b> (PTT).{" "}
      <span className="text-slate-500">
       {item.asVoice
        ? "Vai como áudio de voz, igual gravado no WhatsApp."
        : "Desmarcado: vai como anexo de áudio (encaminhado)."}
      </span>
     </span>
    </label>
   )}

   {!isAudio && (
    <input
     value={item.caption ?? ""}
     onChange={(e) => onChange({ caption: e.target.value })}
     placeholder="Legenda (opcional)…"
     className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px]"
    />
   )}

   <label className="flex items-center gap-2 text-[10px] text-slate-400">
    <span>⏱ Mostrar "{presenceLabel}" por</span>
    <input
     type="number" min={0} max={20} step={1}
     value={delayS}
     onChange={(e) => onChange({ delayMs: Math.max(0, Math.min(20, Number(e.target.value) || 0)) * 1000 })}
     className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-center"
    />
    <span>seg. antes de enviar</span>
   </label>
  </div>
 );
}


// Ações ocultas para cliente final (só super_admin vê enquanto a integração
// ainda não está pronta). Ex.: envio de e-mail transacional.
const END_CLIENT_HIDDEN_ACOES: ReadonlySet<string> = new Set();

function AcaoEditor({ block, scope, allBlocks, onChange }: { block: Block; scope: SalesbotEscopo; allBlocks: Block[]; onChange: (p: Partial<Block>) => void }) {
 const { isSuperAdmin } = useIsSuperAdmin();
 const baseOpcoes = filterAcoesByScope(scope);
 const opcoes = isSuperAdmin ? baseOpcoes : baseOpcoes.filter((o) => !END_CLIENT_HIDDEN_ACOES.has(o.value));
 return (
  <div className="space-y-2">
   <select
    value={block.acaoTipo ?? ""}
    onChange={(e) => onChange({ acaoTipo: e.target.value as Block["acaoTipo"] })}
    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
   >
    <option value="">Selecione a ação...</option>
    {opcoes.map((o) => (
     <option key={o.value} value={o.value}>{o.label}</option>
    ))}
   </select>
   {block.acaoTipo === "mudar-status-lead" ? (
    <PipelineStagePicker block={block} onChange={onChange} />
   ) : block.acaoTipo === "definir-campo" ? (
    <CustomFieldPicker block={block} onChange={onChange} />
   ) : block.acaoTipo === "mudar-responsavel" ? (
    <ResponsavelPicker block={block} onChange={onChange} />
   ) : block.acaoTipo === "webhook" ? (
    <SalesbotWebhookEditor block={block} allBlocks={allBlocks} onChange={onChange} />
   ) : block.acaoTipo === "tarefa" ? (
    <TarefaEditor block={block} onChange={onChange} />
   ) : block.acaoTipo === "formulario" ? (
    <FormularioPicker block={block} onChange={onChange} />
   ) : block.acaoTipo === "enviar-email" ? (
    <div className="space-y-2">
     <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-slate-500">Assunto</label>
      <input
       value={block.emailSubject ?? ""}
       onChange={(e) => onChange({ emailSubject: e.target.value })}
       placeholder="Assunto do e-mail..."
       maxLength={200}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      />
     </div>
     <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-slate-500">Corpo</label>
      <VariableTextarea
       value={block.acaoConfig ?? ""}
       onChange={(v) => onChange({ acaoConfig: v })}
       placeholder="Escreva o e-mail..."
       rows={5}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-y"
      />
     </div>
     <p className="text-[10px] leading-snug text-slate-400">
      Envia automaticamente para o e-mail do lead usando o remetente configurado na Central de E-mail. Variáveis do SalesBot funcionam no assunto e no corpo.
     </p>
    </div>
   ) : block.acaoTipo === "tags" ? (
     <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
       <button
        type="button"
        onClick={() => onChange({ tagsModo: "adicionar" })}
        className={`rounded border px-2 py-1.5 text-[11px] transition ${
         (block.tagsModo ?? "adicionar") === "adicionar"
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
       >
        Adicionar
       </button>
       <button
        type="button"
        onClick={() => onChange({ tagsModo: "remover" })}
        className={`rounded border px-2 py-1.5 text-[11px] transition ${
         block.tagsModo === "remover"
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
       >
        Remover
       </button>
      </div>
      <TagsAcaoEditor value={block.acaoConfig ?? ""} onChange={(v) => onChange({ acaoConfig: v })} />
     </div>
    ) : block.acaoTipo === "vincular-produto" ? (
     <VincularProdutoEditor block={block} onChange={onChange} />

   ) : block.acaoTipo === "nota" ? (
    <div className="space-y-1">
     <VariableTextarea
      value={block.acaoConfig ?? ""}
      onChange={(v) => onChange({ acaoConfig: v })}
      placeholder="Texto da nota interna..."
      rows={2}
      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-none"
     />
     <p className="text-[10px] leading-snug text-slate-400">
      A nota é gravada no <b>perfil do lead</b> (histórico/atividades do card no CRM e na conversa do Inbox como “Nota interna”). Não vai para o Bloco de notas nem para o cliente.
     </p>
    </div>


   ) : block.acaoTipo === "status-conversa" ? (
    <select
     value={block.acaoConfig ?? ""}
     onChange={(e) => onChange({ acaoConfig: e.target.value })}
     className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="">Selecione um status...</option>
     <option value="aberta">Aberta</option>
     <option value="lida">Lida</option>
     <option value="fechada">Fechada</option>
    </select>
   ) : block.acaoTipo === "completar-tarefa" ? (
    <div className="text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
     Marca como concluídas todas as tarefas pendentes deste lead — tanto no calendário quanto no Fluxo de trabalho (movendo o card para a etapa “Concluído”).
    </div>

   ) : block.acaoTipo ? (
    <input
     value={block.acaoConfig ?? ""}
     onChange={(e) => onChange({ acaoConfig: e.target.value })}
     placeholder="Detalhe..."
     className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    />
   ) : null}
  </div>
 );
}

// Editor de tags da ação "Gerenciar tags": chips + autocomplete de tags
// existentes no workspace + criação de novas ao digitar. Persiste em
// acaoConfig como CSV, formato que o runtime já consome.
function TagsAcaoEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listTags = useServerFn(listWorkspaceTags);
  const tagsQ = useQuery({
    queryKey: ["salesbot-workspace-tags"],
    queryFn: () => listTags(),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const existing: string[] = tagsQ.data?.tags ?? [];

  const current = value.split(",").map((t) => t.trim()).filter(Boolean);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  function commit(tags: string[]) {
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const t of tags) {
      const clean = t.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(clean);
    }
    onChange(uniq.join(", "));
  }
  function addTag(t: string) {
    commit([...current, t]);
    setDraft("");
  }
  function removeTag(t: string) {
    commit(current.filter((x) => x.toLowerCase() !== t.toLowerCase()));
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && current.length) {
      removeTag(current[current.length - 1]);
    }
  }

  const currentLower = new Set(current.map((t) => t.toLowerCase()));
  const draftClean = draft.trim();
  const q = draftClean.toLowerCase();
  // Sugestões: quem começa com o que foi digitado vem primeiro; depois quem
  // apenas contém. Sem nada digitado, mostra as tags mais recentes/ordenadas.
  const suggestions = existing
    .filter((t) => !currentLower.has(t.toLowerCase()))
    .filter((t) => (q ? t.toLowerCase().includes(q) : true))
    .sort((a, b) => {
      if (!q) return 0;
      const sa = a.toLowerCase().startsWith(q) ? 0 : 1;
      const sb = b.toLowerCase().startsWith(q) ? 0 : 1;
      return sa - sb || a.localeCompare(b, "pt-BR");
    })
    .slice(0, 8);
  const canCreate =
    draftClean.length > 0 &&
    !existing.some((t) => t.toLowerCase() === q) &&
    !currentLower.has(q);


  return (
    <div className="space-y-1.5">
      <div
        className="w-full min-h-[36px] bg-slate-800 border border-slate-700 rounded px-2 py-1.5 flex flex-wrap gap-1 items-center focus-within:border-emerald-500/60"
      >
        {current.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.5 text-[11px]">
            {t}
            <button type="button" onClick={() => removeTag(t)} className="hover:text-rose-300" title="Remover tag">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={current.length === 0 ? "Digite pra buscar ou criar tag…" : "Adicionar mais…"}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-xs py-0.5"
        />
      </div>
      {focused && (suggestions.length > 0 || canCreate) && (
        <div className="rounded border border-slate-700 bg-slate-900 overflow-hidden max-h-56 overflow-y-auto">
          {suggestions.length > 0 && (
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500 bg-slate-900/80">
              Tags existentes
            </div>
          )}
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(t); }}
              className="w-full text-left px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800"
            >
              {t}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(draftClean); }}
              className="w-full text-left px-2 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-1 border-t border-slate-800"
            >
              <Plus className="w-3 h-3" /> Criar nova tag: <b>{draftClean}</b>
            </button>
          )}
        </div>
      )}

      <div className="text-[10px] text-slate-500">
        {tagsQ.isLoading ? "Carregando tags do workspace…" : existing.length === 0 ? "Nenhuma tag ainda. Digite e Enter pra criar a primeira." : "Enter/vírgula pra adicionar. Clique no × pra remover."}
      </div>
    </div>
  );
}



// Campos de cronômetro com revelação progressiva: min/seg sempre visíveis,
// horas → dias → semanas → meses → anos aparecem conforme o usuário clica em "+".
const CRONO_UNITS_REVEAL = [
  ["Hora", "horas"],
  ["Dia", "dias"],
  ["Semana", "semanas"],
  ["Mês", "meses"],
] as const;

function CronometroFields({
 pausa,
 block,
 onChange,
}: {
 pausa: PausaEntry;
 block: any;
 onChange: (patch: Partial<PausaEntry>) => void;
}) {
 // Nível inicial: reflete o maior campo já preenchido em edições existentes.
 const initialLevel = (() => {
  let lvl = 0;
  CRONO_UNITS_REVEAL.forEach(([, key], i) => {
   if (((pausa as unknown as Record<string, number | undefined>)[key] ?? 0) > 0) {
    lvl = Math.max(lvl, i + 1);
   }
  });
  return lvl;
 })();
 const [level, setLevel] = useState<number>(initialLevel);

 const revealed = CRONO_UNITS_REVEAL.slice(0, level);
 const nextUnit = CRONO_UNITS_REVEAL[level];

 return (
  <div className="space-y-1.5">
   <div className="grid grid-cols-4 gap-1.5">
    {/* Unidades reveladas (maiores primeiro visualmente) */}
    {[...revealed].reverse().map(([label, key]) => (
     <label key={key} className="flex flex-col gap-0.5">
      <span className="text-slate-400 text-[10px]">{label}</span>
      <input
       type="number"
       min={0}
       value={(pausa[key] as number | undefined) ?? 0}
       onChange={(e) => onChange({ [key]: Number(e.target.value) } as Partial<PausaEntry>)}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
      />
     </label>
    ))}
    {/* Formulário Alvo (Apenas se tipo === "formulario-enviado") */}

    {/* Min e Seg sempre visíveis */}
    <label className="flex flex-col gap-0.5">
     <span className="text-slate-400 text-[10px]">Min</span>
     <input
      type="number"
      min={0}
      value={pausa.min ?? 0}
      onChange={(e) => onChange({ min: Number(e.target.value) })}
      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
     />
    </label>
    <label className="flex flex-col gap-0.5">
     <span className="text-slate-400 text-[10px]">Seg</span>
     <input
      type="number"
      min={0}
      value={pausa.seg ?? 0}
      onChange={(e) => onChange({ seg: Number(e.target.value) })}
      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
     />
    </label>
   </div>
   <div className="flex items-center gap-2">
    {nextUnit ? (
     <button
      type="button"
      onClick={() => setLevel(level + 1)}
      className="text-[10px] px-2 py-1 rounded border border-slate-700 bg-slate-800/60 text-slate-300 hover:border-primary hover:text-primary"
      title={`Adicionar campo de ${nextUnit[0].toLowerCase()}`}
     >
      + {nextUnit[0]}
     </button>
    ) : (
     <span className="text-[10px] text-slate-500">Todas as unidades adicionadas.</span>
    )}
    {level > 0 && (
     <button
      type="button"
      onClick={() => {
       const [, keyRemoved] = CRONO_UNITS_REVEAL[level - 1];
       onChange({ [keyRemoved]: 0 } as Partial<PausaEntry>);
       setLevel(level - 1);
      }}
      className="text-[10px] px-2 py-1 rounded border border-slate-700 bg-slate-800/40 text-slate-400 hover:border-rose-500/50 hover:text-rose-400"
      title="Remover último campo"
     >
      − {CRONO_UNITS_REVEAL[level - 1][0]}
     </button>
    )}
   </div>
  </div>
 );
}

function PausaEditor({
 block,
 scope,
 onChange,
 onAddAfter,
}: {
 block: Block;
 scope: SalesbotEscopo;
 onChange: (p: Partial<Block>) => void;
 onAddAfter: (optionId?: string) => void;
}) {
 const opcoes = filterPausaOpcoesByScope(scope);
 // Migração dos campos antigos para a lista `pausas`
 const pausas: PausaEntry[] =
  block.pausas && block.pausas.length > 0
   ? block.pausas
   : [
     {
      id: newId("p"),
      tipo: block.pausaTipo ?? "cronometro",
      anos: block.pausaAnos,
      meses: block.pausaMeses,
      semanas: block.pausaSemanas,
      dias: block.pausaDias,
      horas: block.pausaHoras,
      min: block.pausaMin,
      seg: block.pausaSeg,
      videoUrl: block.pausaVideoUrl,
      qtdMensagens: block.pausaQtdMensagens,
     },
    ];

 function updatePausas(next: PausaEntry[]) {
  const first = next[0];
  onChange({
   pausas: next,
   pausaTipo: first?.tipo,
   pausaAnos: first?.anos,
   pausaMeses: first?.meses,
   pausaSemanas: first?.semanas,
   pausaDias: first?.dias,
   pausaHoras: first?.horas,
   pausaMin: first?.min,
   pausaSeg: first?.seg,
   pausaVideoUrl: first?.videoUrl,
   pausaQtdMensagens: first?.qtdMensagens,
  });
 }
 function updateAt(idx: number, patch: Partial<PausaEntry>) {
  updatePausas(pausas.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
 }
 // Cada "objetivo" só pode aparecer uma vez por bloco (evita redundância),
 // mas é permitido combinar objetivos diferentes livremente.
 const GRUPO_PAUSA: Record<string, string> = {
  cronometro: "cronometro",
  "msg-recebida": "msg-recebida",
  "lote-msgs": "msg-recebida",
  "ate-expediente": "expediente",
  "ate-fora-expediente": "expediente",
  "exceto-expediente": "exceto-expediente",
  "exceto-fora-expediente": "exceto-expediente",
  "video-aberto": "video",
  "video-fechado": "video",
  "audio-aberto": "audio",
  "audio-fechado": "audio",
 };
 const grupoDe = (t: PausaTipo) => GRUPO_PAUSA[t] ?? t;
 const gruposUsados = new Set(pausas.map((p) => grupoDe(p.tipo)));
 const disponiveis = opcoes.filter((o) => !gruposUsados.has(grupoDe(o.value)));
 function addPausa() {
  const proximoTipo = disponiveis[0]?.value;
  if (!proximoTipo) return;
  updatePausas([...pausas, { id: newId("p"), tipo: proximoTipo as PausaTipo }]);
 }
 function removeAt(idx: number) {
  if (pausas.length <= 1) return;
  updatePausas(pausas.filter((_, i) => i !== idx));
 }
 function changeTipo(idx: number, novo: PausaTipo) {
  // Bloqueia objetivos repetidos/redundantes no mesmo bloco.
  if (pausas.some((p, i) => i !== idx && grupoDe(p.tipo) === grupoDe(novo))) return;
  updateAt(idx, { tipo: novo });
 }

 return (
  <div className="space-y-2">
    {pausas.map((p, idx) => (
     <RowMeasure key={p.id} blockId={block.id} optionId={p.id}>
     <div className="space-y-1.5 rounded border border-slate-700 bg-slate-900/40 p-2">
      <div className="flex items-center gap-1.5">
       <span className="text-[10px] uppercase tracking-wider text-slate-500 flex-1">
        {idx === 0 ? "Aguardar" : "OU aguardar"}
       </span>
        {pausas.length > 1 && (

        <button
         type="button"
         onClick={() => removeAt(idx)}
         className="text-slate-500 hover:text-red-400 text-xs px-1"
         title="Remover esta pausa"
        >
         ×
        </button>
       )}
      </div>
      <select
       value={p.tipo}
       onChange={(e) => changeTipo(idx, e.target.value as PausaTipo)}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      >
       {opcoes.map((opt) => {
        const conflita = pausas.some((pp, i) => i !== idx && grupoDe(pp.tipo) === grupoDe(opt.value));
        return (
         <option key={opt.value} value={opt.value} disabled={conflita}>
          {opt.label}{conflita ? " (já usado neste bloco)" : ""}
         </option>
        );
       })}
      </select>
     {p.tipo === "cronometro" && (
      <CronometroFields
        pausa={p}
        block={block}
        onChange={(patch) => updateAt(idx, patch)}
       />
     )}
     {(p.tipo === "video-aberto" || p.tipo === "video-fechado" || p.tipo === "audio-aberto" || p.tipo === "audio-fechado") && (
      <div className="text-[11px] text-slate-400 leading-snug space-y-1">
       <div>
        Detecta automaticamente {(p.tipo === "audio-aberto" || p.tipo === "audio-fechado")
          ? <>o <span className="text-slate-300">último áudio enviado no chat</span></>
          : <>o <span className="text-slate-300">último vídeo enviado no chat</span></>} antes desta pausa.
        Avança assim que o lead {p.tipo.endsWith("-aberto") ? "abrir" : "fechar"} {p.tipo.startsWith("audio") ? "o áudio" : "o vídeo"}.
       </div>
       <div className="text-[10px] text-slate-500">
        Dica: coloque esta etapa logo depois do bloco que envia {p.tipo.startsWith("audio") ? "o áudio" : "o vídeo"}.
       </div>
       <div className="text-[10px] leading-snug text-amber-400/90">
         ⚠️ Não funciona no WhatsApp Web. O canal não devolve evento de abertura/encerramento de mídia. Disponível apenas no WhatsApp Cloud API (oficial).
       </div>
      </div>
     )}
     {p.tipo === "lote-msgs" && (
      <div className="space-y-1">
       <label className="text-[10px] uppercase tracking-wider text-slate-500">
        Quantas mensagens aguardar
       </label>
       <input
        type="number"
        min={2}
        max={200}
        value={p.qtdMensagens ?? 3}
        onChange={(e) => updateAt(idx, { qtdMensagens: Math.max(2, Math.min(200, Number(e.target.value) || 2)) })}
        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
       />
       <p className="text-[11px] text-slate-400 leading-snug">
        Em grupo o fluxo de mensagens é alto. O bot só avança depois de receber esse
        <span className="text-slate-300"> lote de mensagens</span>, e aí responde uma vez só.
       </p>
      </div>
     )}
     {p.tipo === "msg-recebida" && (
      <div className="text-[11px] text-slate-400">
       Avança quando o lead responder a próxima mensagem.
      </div>
     )}
     {(p.tipo === "exceto-expediente" || p.tipo === "exceto-fora-expediente") && (
      <div className="text-[11px] text-slate-400">
       Pula esta etapa{" "}
       {p.tipo === "exceto-expediente" ? "durante o expediente" : "fora do expediente"}.
      </div>
      )}
     {p.tipo === "formulario-enviado" && (
      <div className="space-y-1.5">
       <div className="text-[11px] text-slate-400">
        Avança assim que o lead preencher e enviar o formulário selecionado.
       </div>
       <FormularioPicker
        block={{ ...block, formularioId: p.formularioId, formularioNome: p.formularioNome }}
        onChange={(patch) => updateAt(idx, {
         formularioId: patch.formularioId,
         formularioNome: patch.formularioNome
        })}
       />
      </div>
     )}
     </div>
     </RowMeasure>
    ))}
   {disponiveis.length > 0 && (
    <button
     type="button"
     onClick={addPausa}
     className="w-full text-xs rounded border border-dashed border-slate-600 hover:border-emerald-500/70 hover:text-emerald-400 text-slate-400 py-1.5 transition"
    >
     + adicionar outra pausa (ou)
    </button>
   )}
   {disponiveis.length === 0 && (
    <p className="text-[10px] leading-snug text-slate-500">
     Todos os tipos de pausa compatíveis já estão neste bloco.
    </p>
   )}
   {pausas.length > 1 && (
    <p className="text-[10px] leading-snug text-slate-500">
      O bot avança pela <span className="text-slate-300">primeira condição que resolver</span>. Cada pausa tem sua própria seta de saída no mapa.
    </p>
   )}
  </div>
 );
}

function RoletaEditor({
 block,
 onChange,
 onAddAfter,
}: {
 block: Block;
 onChange: (p: Partial<Block>) => void;
 onAddAfter: (optionId?: string) => void;
}) {
 const roleta = block.roleta?? [];
 function update(idx: number, patch: Partial<RoletaOpcao>) {
 onChange({ roleta: roleta.map((o, i) => (i === idx? {...o,...patch }: o)) });
 }
 function add() {
 onChange({
 roleta: [...roleta, { id: newId("o"), label: `Opção ${roleta.length + 1}` }],
 });
 }
 function remove(idx: number) {
 onChange({ roleta: roleta.filter((_, i) => i!== idx) });
 }
 return (
 <div className="space-y-1.5">
 <div className="text-[10px] uppercase tracking-wider text-slate-500">
 Distribuição - roleta que reveza igualmente entre as opções
 </div>
 {roleta.map((o, i) => (
 <RowMeasure key={o.id} blockId={block.id} optionId={o.id}>
 <div className="flex items-center gap-1.5">
  <input
  value={o.label}
  onChange={(e) => update(i, { label: e.target.value })}
  placeholder="Opção / vendedor"
  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
  />

 <button onClick={() => remove(i)} className="text-slate-500 hover:text-rose-400">
 <X className="w-3.5 h-3.5" />
 </button>
 </div>
 </RowMeasure>
 ))}
 <button
 onClick={add}
 className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
 >
 <Plus className="w-3 h-3" /> Adicionar opção
 </button>
 </div>
 );
}

// -----------------------------------------------------------------------------
// Validação, regras reais de saída do fluxo
// -----------------------------------------------------------------------------

type ValidacaoTipoStr =
 | "igual" | "igual-lista" | "contem-lista" | "resposta-igual"
 | "contem" | "nao-contem" | "desigual" | "comprimento" | "regex"
 | "numero" | "letra" | "palavra" | "telefone" | "email" | "gama";

const VALIDACAO_META: Record<ValidacaoTipoStr, {
 label: string;
 desc: string;
 group: "Texto" | "Formato" | "Número";
 icon: string; // emoji leve
 value: "none" | "text" | "number" | "regex" | "range" | "list";
 placeholder?: string;
 exemplo?: string;
}> = {
 igual: { label: "É igual a", desc: "O valor precisa ser exatamente o texto informado.", group: "Texto", icon: "=", value: "text", placeholder: "Valor exato" },
 "igual-lista": { label: "É um destes valores", desc: "Passa se o valor for igual a uma das opções. Escreva uma opção por linha.", group: "Texto", icon: "=", value: "list", placeholder: "Uma opção por linha" },
 "contem-lista": { label: "Contém alguma destas frases", desc: "Passa se a mensagem contiver alguma das frases, sem diferenciar maiúsculas. Escreva uma por linha.", group: "Texto", icon: "🔎", value: "list", placeholder: "Uma palavra ou frase por linha" },
 "resposta-igual": { label: "Resposta é", desc: "Compara a resposta inteira, sem diferenciar maiúsculas e ignorando ponto, exclamação e espaços no final.", group: "Texto", icon: "=", value: "text", placeholder: "ex.: sair" },
 contem:       { label: "Contém",              desc: "A resposta deve conter o texto abaixo (sem diferenciar maiúsculas).", group: "Texto",   icon: "🔎", value: "text",   placeholder: "ex.: interessado",     exemplo: "sim, estou interessado" },
 "nao-contem": { label: "Não contém",          desc: "A resposta NÃO pode conter o texto abaixo.",                          group: "Texto",   icon: "🚫", value: "text",   placeholder: "ex.: cancelar",        exemplo: "quero comprar" },
 desigual:     { label: "É diferente de",      desc: "A resposta precisa ser diferente do texto exato abaixo.",             group: "Texto",   icon: "≠",  value: "text",   placeholder: "ex.: não",             exemplo: "sim" },
 comprimento:  { label: "Tem N caracteres",    desc: "A resposta precisa ter exatamente esse número de caracteres.",        group: "Texto",   icon: "📏", value: "number", placeholder: "ex.: 11",              exemplo: "11999998888" },
 regex:        { label: "Expressão regular",   desc: "A resposta precisa casar com a expressão regular abaixo.",            group: "Texto",   icon: "𝑹",  value: "regex",  placeholder: "ex.: ^[A-Z]{3}\\d{4}$", exemplo: "ABC1234" },
 numero:       { label: "Número exato",        desc: "A resposta deve ser exatamente o número informado abaixo.",           group: "Número",  icon: "1️⃣", value: "number", placeholder: "ex.: 1",               exemplo: "1" },
 letra:        { label: "Letra específica",    desc: "A resposta deve ser a letra ou sequência de letras informada.",       group: "Formato", icon: "🔤", value: "text",   placeholder: "ex.: A",               exemplo: "A" },
 palavra:      { label: "Palavra específica",  desc: "A resposta deve ser a palavra informada abaixo.",                    group: "Formato", icon: "🔠", value: "text",   placeholder: "ex.: sim",             exemplo: "sim" },
 telefone:     { label: "Telefone / dígitos",  desc: "A resposta deve ser telefone e conter os dígitos informados.",        group: "Formato", icon: "📞", value: "text",   placeholder: "ex.: 11999998888",     exemplo: "(11) 99999-8888" },
 email:        { label: "E-mail / expressão",  desc: "A resposta deve ser e-mail e conter a expressão informada.",          group: "Formato", icon: "✉️", value: "text",   placeholder: "ex.: @gmail.com ou .com", exemplo: "cliente@empresa.com" },
 gama:         { label: "Está entre X e Y",    desc: "A resposta (número) deve estar entre os valores mínimo e máximo.",    group: "Número",  icon: "↔️", value: "range",                                       exemplo: "25" },
};

const ALVO_LABEL: Record<string, string> = {
  mensagem: "Resposta do cliente",
  nome: "Nome do lead",
  email: "E-mail do lead",
  telefone: "Telefone do lead",
  responsavel: "Responsável",
  etapa: "Etapa do funil",
  empresa: "Empresa do lead",
  campo: "Campo personalizado",
  tag: "Tag do lead",
  "tracking-evento": "Evento de Tracking",
  "tracking-pageview": "Viu página",
  "tracking-tempo": "Tempo na página",
  "social-ativo": "Lead ativo",
  "social-segue": "Segue perfil",
};

/** Rótulo automático da regra: o usuário não precisa escrever nada. */
function describeValidacaoRule(r: RoletaOpcao): string {
  const alvo = r.alvo ?? "mensagem";
  if (alvo === "tag") return `Tem a tag "${r.valor || "..."}"`;
  if (alvo === "tracking-evento") return `Evento Tracking: ${r.valor || "..."}`;
  if (alvo === "tracking-pageview") return `Viu página: ${r.valor || "..."}`;
  if (alvo === "tracking-tempo") return `Tempo na página: ${r.valor || "..."}`;
  if (alvo === "tracking-produto") return `Produto: ${r.valor || "..."}`;
  if (alvo === "social-ativo") return `Social: Lead ativo (DM/Comentário)`;
  if (alvo === "social-segue") return `Social: Lead segue perfil`;
 const base = alvo === "campo" ? (r.campoNome || "Campo personalizado") : (ALVO_LABEL[alvo] ?? "Resposta do cliente");
 const tipo = r.tipo as ValidacaoTipoStr | undefined;
 if (!tipo) return base;
 const meta = VALIDACAO_META[tipo];
 if (!meta) return base;
 const valor = (r.valor ?? "").trim();
 return `${base}: ${meta.label}${valor ? ` "${valor}"` : ""}`;
}

function ValidacaoEditor({
 block,
 onChange,
 onAddAfter,
}: {
 block: Block;
 onChange: (p: Partial<Block>) => void;
 onAddAfter: (optionId?: string) => void;
}) {
 void onAddAfter;
 const regras: RoletaOpcao[] = block.roleta ?? [];

 const listFields = useServerFn(listLeadCustomFields);
 const fieldsQ = useQuery({
  queryKey: ["lead-custom-fields"],
  queryFn: () => listFields(),
  staleTime: 0,
  refetchOnMount: "always",
 });
 const customFields: Array<{ id: string; name: string; fieldType: string; options?: string[] }> =
  fieldsQ.data?.fields ?? [];

 const listTags = useServerFn(listWorkspaceTags);
 const tagsQ = useQuery({
  queryKey: ["salesbot-workspace-tags"],
  queryFn: () => listTags(),
  staleTime: 30_000,
 });
 const existingTags: string[] = tagsQ.data?.tags ?? [];

 function updateRule(id: string, patch: Partial<RoletaOpcao>) {
  onChange({
   roleta: regras.map((r) => {
    if (r.id !== id) return r;
    const merged = { ...r, ...patch };
    return { ...merged, label: describeValidacaoRule(merged) };
   }),
  });
 }
 function addRule() {
  const nova: RoletaOpcao = { id: newId("r"), label: "", alvo: "mensagem", tipo: "contem", valor: "" };
  onChange({ roleta: [...regras, { ...nova, label: describeValidacaoRule(nova) }] });
 }
 function removeRule(id: string) {
  onChange({ roleta: regras.filter((r) => r.id !== id) });
 }

 return (
  <div className="space-y-2.5">
   <p className="text-[10px] leading-snug text-slate-400">
    A validação analisa algo que <b>já existe no sistema</b>. Escolha o que validar (resposta do cliente,
    dado do lead, campo personalizado ou tag) e a regra. A primeira regra que bater sai pelo cabo dela.
   </p>

   {/* Regras */}
   <div className="space-y-2">
    {regras.map((r, idx) => {
     const alvo = r.alvo ?? "mensagem";
     const isTag = alvo === "tag";
     const tipo = (r.tipo ?? "") as ValidacaoTipoStr | "";
     const meta = !isTag && tipo ? VALIDACAO_META[tipo] : null;
     const valor = r.valor ?? "";
     const [rangeMin, rangeMax] = valor.split("-").map((s) => s.trim());
     const campo = customFields.find((f) => f.id === r.campoId);
     const campoOpcoes = campo?.options ?? [];
     return (
      <RowMeasure key={r.id} blockId={block.id} optionId={r.id}>
       <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 space-y-1.5 transition">
        <div className="flex items-center gap-1.5">
         <span className="text-[10px] text-slate-500 w-4 text-center">{idx + 1}</span>
         <span className="flex-1 text-xs text-slate-200 truncate" title={r.label}>
          {r.label || describeValidacaoRule(r)}
         </span>
         <button
          type="button"
          onClick={() => removeRule(r.id)}
          className="text-slate-500 hover:text-rose-400 p-1"
          title="Remover regra"
         >
          <X className="w-3.5 h-3.5" />
         </button>
        </div>

        {/* 1. O que validar */}
        <div className="flex items-stretch gap-1.5">
         <select
          value={alvo}
          onChange={(e) => {
           const novo = e.target.value as RoletaOpcao["alvo"];
           updateRule(r.id, {
            alvo: novo,
            campoId: undefined,
            campoNome: undefined,
            valor: "",
            tipo: novo === "tag" ? undefined : (r.tipo ?? "contem"),
           });
          }}
          className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px] max-w-[46%]"
         >
          <optgroup label="Conversa">
            <option value="mensagem">Resposta do cliente</option>
          </optgroup>
          <optgroup label="Dados do lead">
            <option value="nome">Nome do lead</option>
            <option value="email">E-mail do lead</option>
            <option value="telefone">Telefone do lead</option>
            <option value="empresa">Empresa do lead</option>
            <option value="responsavel">Responsável (ID/Nome)</option>
            <option value="etapa">Etapa do Funil (ID/Nome)</option>
          </optgroup>
          <optgroup label="CRM">
            <option value="campo">Campo personalizado</option>
            <option value="tag">Tag do lead</option>
          </optgroup>
          <optgroup label="Comportamento (Pixel)">
            <option value="tracking-evento">Evento específico</option>
            <option value="tracking-pageview">Viu página (URL)</option>
            <option value="tracking-tempo">Tempo total em página</option>
            <option value="tracking-produto">Produto (Interesse/Compra)</option>
          </optgroup>
          <optgroup label="Redes Sociais">
            <option value="social-ativo">Lead é ativo (DM/Comentário)</option>
            <option value="social-segue">Lead segue perfil</option>
          </optgroup>
         </select>

         {alvo === "tracking-evento" && (
          <input
           value={valor}
           onChange={(e) => updateRule(r.id, { valor: e.target.value })}
           placeholder="evento:minutos (ex: purchase:60)"
           className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
          />
         )}

         {alvo === "tracking-pageview" && (
          <input
           value={valor}
           onChange={(e) => updateRule(r.id, { valor: e.target.value })}
           placeholder="trecho_url:minutos (ex: checkout:30)"
           className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
          />
         )}

         {alvo === "tracking-tempo" && (
          <input
           value={valor}
           onChange={(e) => updateRule(r.id, { valor: e.target.value })}
           placeholder="min_totais:trecho_url (ex: 5:precos)"
           className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
          />
          )}
 
          {alvo === "tracking-produto" && (
           <input
            value={valor}
            onChange={(e) => updateRule(r.id, { valor: e.target.value })}
            placeholder="produto_id:tipo (ex: 123:compra ou 123:interesse)"
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
           />
          )}

         {(alvo === "social-ativo" || alvo === "social-segue") && (
          <div className="flex-1 flex items-center px-2 text-[10px] text-slate-500 italic">
            Validação automática via integração
          </div>
         )}

         {alvo === "campo" && (
          <select
           value={r.campoId ?? ""}
           onChange={(e) => {
            const f = customFields.find((x) => x.id === e.target.value);
            updateRule(r.id, { campoId: f?.id, campoNome: f?.name, valor: "" });
           }}
           className="flex-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
          >
           <option value="">
            {fieldsQ.isLoading ? "Carregando campos..." : customFields.length ? "Escolha o campo..." : "Nenhum campo criado"}
           </option>
           {customFields.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
           ))}
          </select>
         )}

         {isTag && (
          <div className="flex-1 flex items-center gap-1">
           <input
            list={`tags-${r.id}`}
            value={valor}
            onChange={(e) => updateRule(r.id, { valor: e.target.value })}
            placeholder={tagsQ.isLoading ? "Carregando tags..." : "Escolha ou digite a tag"}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
           />
           <datalist id={`tags-${r.id}`}>
            {existingTags.map((t) => <option key={t} value={t} />)}
           </datalist>
          </div>
         )}
        </div>

        {/* 2. Regra + valor (tag e tracking não precisam de operador secundário aqui) */}
        {!isTag && alvo !== "tracking-evento" && alvo !== "tracking-pageview" && alvo !== "tracking-tempo" && alvo !== "tracking-produto" && (
         <div className="flex items-stretch gap-1.5">
          <select
           value={tipo}
           onChange={(e) => updateRule(r.id, { tipo: e.target.value as ValidacaoTipo, valor: "" })}
           className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px] max-w-[46%]"
          >
           <option value="">Regra...</option>
           <optgroup label="Texto">
            <option value="igual">É igual a</option>
            <option value="igual-lista">É um destes valores</option>
            <option value="contem-lista">Contém alguma destas frases</option>
            <option value="resposta-igual">Resposta é</option>
            <option value="contem">Contém</option>
            <option value="nao-contem">Não contém</option>
            <option value="desigual">É diferente de</option>
            <option value="comprimento">Tem N caracteres</option>
            <option value="regex">Expressão regular</option>
           </optgroup>
           <optgroup label="Formato">
            <option value="letra">Letra específica</option>
            <option value="palavra">Palavra específica</option>
            <option value="telefone">Telefone / dígitos</option>
            <option value="email">E-mail / expressão</option>
           </optgroup>
           <optgroup label="Número">
            <option value="numero">Número exato</option>
            <option value="gama">Está entre X e Y</option>
           </optgroup>
          </select>

          {meta?.value === "list" && (
           <textarea
            aria-label={meta.placeholder}
            value={valor}
            onChange={(e) => updateRule(r.id, { valor: e.target.value })}
            placeholder={meta.placeholder}
            rows={4}
            className="flex-1 min-w-0 max-h-40 overflow-y-auto resize-y bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] leading-5"
           />
          )}
          {meta?.value === "text" && campoOpcoes.length > 0 && (
           <select
            value={valor}
            onChange={(e) => updateRule(r.id, { valor: e.target.value })}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
           >
            <option value="">Escolha a opção...</option>
            {campoOpcoes.map((o) => <option key={o} value={o}>{o}</option>)}
           </select>
          )}
          {meta?.value === "text" && campoOpcoes.length === 0 && (
           <input
            value={valor}
            onChange={(e) => updateRule(r.id, { valor: e.target.value })}
            placeholder={meta.placeholder}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
           />
          )}
          {meta?.value === "number" && (
           <input
            type="number"
            min={0}
            value={valor}
            onChange={(e) => updateRule(r.id, { valor: e.target.value })}
            placeholder={meta.placeholder}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
           />
          )}
          {meta?.value === "regex" && (() => {
           let regexOk: boolean | null = null;
           if (valor.trim()) {
            try { new RegExp(valor); regexOk = true; } catch { regexOk = false; }
           }
           return (
            <input
             value={valor}
             onChange={(e) => updateRule(r.id, { valor: e.target.value })}
             placeholder={meta.placeholder}
             spellCheck={false}
             className={`flex-1 font-mono bg-slate-800 border rounded px-2 py-1 text-[11px] ${
              regexOk === false ? "border-rose-500/60" : "border-slate-700"
             }`}
            />
           );
          })()}
          {meta?.value === "range" && (
           <div className="flex-1 flex items-center gap-1">
            <input
             type="number"
             value={rangeMin ?? ""}
             onChange={(e) => updateRule(r.id, { valor: `${e.target.value}-${rangeMax ?? ""}` })}
             placeholder="mín"
             className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
            />
            <span className="text-slate-500 text-[10px]">até</span>
            <input
             type="number"
             value={rangeMax ?? ""}
             onChange={(e) => updateRule(r.id, { valor: `${rangeMin ?? ""}-${e.target.value}` })}
             placeholder="máx"
             className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
            />
           </div>
          )}
          {meta?.value === "none" && (
           <div className="flex-1 text-[10px] text-slate-500 italic self-center px-1">Sem valor de referência.</div>
          )}
          {!meta && (
           <div className="flex-1 text-[10px] text-slate-500 italic self-center px-1">Escolha a regra...</div>
          )}
         </div>
        )}

        {isTag && (
         <div className="text-[10px] text-slate-500 leading-snug">
          Passa quando o lead já tem essa tag no CRM.
         </div>
        )}
        {alvo === "tracking-evento" && (
         <div className="text-[10px] text-slate-500 leading-snug">
          Verifica se o lead realizou este evento (ex: purchase, lead, contact) no período informado (em minutos, padrão 7 dias).
         </div>
        )}
        {!isTag && alvo !== "tracking-evento" && meta && (
         <div className="text-[10px] text-slate-500 leading-snug">{meta.desc}</div>
        )}
       </div>
      </RowMeasure>
     );
    })}

    <button
     type="button"
     onClick={addRule}
     className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
    >
     <Plus className="w-3 h-3" /> Adicionar regra
    </button>
   </div>

   {/* Saída "senão" */}
   <RowMeasure blockId={block.id} optionId="__else__">
    <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 flex items-center gap-2">
     <span className="text-[10px] uppercase tracking-wide text-slate-500 flex-1">
      Senão (nenhuma regra bateu)
     </span>
    </div>
   </RowMeasure>
  </div>
 );
}


function CondicaoEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const condicoes = block.condicoes?? [];
 const funnelsQ = useAllFunnels();
 const funnels = funnelsQ.data ?? [];

 const listOrigins = useServerFn(listLeadOrigins);
 const sourcesQ = useQuery({
  queryKey: ["salesbot-lead-origins"],
  queryFn: () => listOrigins(),
  staleTime: 30_000,
 });
 const origins = sourcesQ.data?.origins ?? [];
 const originGroups = Array.from(new Set(origins.map((o) => o.group)));


 const listFields = useServerFn(listLeadCustomFields);
 const fieldsQ = useQuery({
  queryKey: ["lead-custom-fields"],
  queryFn: () => listFields(),
  staleTime: 0,
  refetchOnMount: "always",
 });
 const customFields: Array<{ id: string; name: string; fieldType: string; options?: string[] }> = fieldsQ.data?.fields ?? [];

 const listTags = useServerFn(listWorkspaceTags);
 const tagsQ = useQuery({
  queryKey: ["salesbot-workspace-tags"],
  queryFn: () => listTags(),
  staleTime: 30_000,
 });
 const existingTags: string[] = tagsQ.data?.tags ?? [];

 function update(idx: number, patch: Partial<Condicao>) {
  onChange({ condicoes: condicoes.map((c, i) => (i === idx? {...c,...patch }: c)) });
 }
 function add() {
  onChange({
   condicoes: [
    ...condicoes,
    { id: newId("c"), sujeito: "cliente", operador: "contem", comparador: "entrada-manual", valor: "" },
   ],
  });
 }
 function remove(idx: number) {
  onChange({ condicoes: condicoes.filter((_, i) => i!== idx) });
 }
 const modo = block.condicaoModo ?? "e";
 const joiner = modo === "ou" ? "Ou" : "E";

 return (
  <div className="space-y-2">
   {condicoes.map((c, idx) => {
    // Operadores permitidos por sujeito
    const opsFor = (s: Condicao["sujeito"]): Array<{ v: Condicao["operador"]; l: string }> => {
     if (s === "etapa" || s === "fonte-leads") return [{ v: "igual", l: "é igual a" }, { v: "desigual", l: "é desigual a" }];
     if (s === "tag") return [{ v: "igual", l: "possui" }, { v: "desigual", l: "não possui" }];
     return [{ v: "igual", l: "é igual a" }, { v: "desigual", l: "é desigual a" }, { v: "contem", l: "contém" }];
    };
    const ops = opsFor(c.sujeito);
    const opValid = ops.some((o) => o.v === c.operador) ? c.operador : ops[0].v;

    return (
    <RowMeasure key={c.id} blockId={block.id} optionId={c.id}>
    <div className="rounded border border-slate-700 bg-slate-800/50 p-2 space-y-1.5">
     <div className="flex items-center gap-1.5">
      <span className="text-slate-400 text-[10px] uppercase">{idx === 0 ? "Se" : joiner}</span>
      <select
       value={c.sujeito}
       onChange={(e) => update(idx, {
        sujeito: e.target.value as Condicao["sujeito"],
        // reset dependent fields quando muda o sujeito
        campo: undefined,
        valor: "",
       })}
       className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
      >
       <option value="cliente">Mensagem do cliente</option>
       <option value="comentario">Comentário do cliente</option>
       <option value="fonte-leads">Fonte do lead</option>
       <option value="tag">Tag do lead</option>
       <option value="etapa">Etapa atual</option>
       <option value="campo-personalizado">Campo personalizado</option>
      </select>
      <button onClick={() => remove(idx)} className="text-slate-500 hover:text-rose-400 ml-auto">
       <X className="w-3.5 h-3.5" />
      </button>
     </div>

     {/* Seletor secundário de "campo" apenas para campo-personalizado */}
     {c.sujeito === "campo-personalizado" && (
      <select
       value={c.campo ?? ""}
       onChange={(e) => update(idx, { campo: e.target.value, valor: "" })}
       className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
      >
       <option value="">
        {fieldsQ.isLoading ? "Carregando campos…" : customFields.length === 0 ? "Nenhum campo cadastrado" : "Escolha o campo…"}
       </option>
       {customFields.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
       ))}
      </select>
     )}

     {/* Operador */}
     <div className="flex items-center gap-1.5">
      <select
       value={opValid}
       onChange={(e) => update(idx, { operador: e.target.value as Condicao["operador"] })}
       className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
      >
       {ops.map((o) => (
        <option key={o.v} value={o.v}>{o.l}</option>
       ))}
      </select>

      {/* Valor contextual */}
      {c.sujeito === "etapa" ? (
       <select
        value={c.valor}
        onChange={(e) => update(idx, { valor: e.target.value })}
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
       >
        <option value="">
         {funnelsQ.isLoading ? "Carregando etapas…" : funnels.length === 0 ? "Nenhuma etapa" : "Escolha a etapa…"}
        </option>
        {funnels.map((f) => (
         <optgroup key={f.id} label={f.name}>
          {f.stages.map((s) => (
           <option key={s.id} value={s.id}>{s.name}</option>
          ))}
         </optgroup>
        ))}
       </select>
      ) : c.sujeito === "fonte-leads" ? (
       <select
        value={c.valor}
        onChange={(e) => update(idx, { valor: e.target.value })}
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs max-w-[160px]"
       >
         <option value="">
          {sourcesQ.isLoading ? "Carregando..." : origins.length === 0 ? "Nenhum canal" : "Escolha..."}
         </option>
         {originGroups.map((g) => (
          <optgroup key={g} label={g}>
           {origins.filter((o) => o.group === g).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
           ))}
          </optgroup>
         ))}
       </select>
      ) : c.sujeito === "tag" ? (
       <div className="flex-1 flex items-center gap-1">
        <input
         list={`tags-datalist-${c.id}`}
         value={c.valor}
         onChange={(e) => update(idx, { valor: e.target.value })}
         placeholder={
          tagsQ.isLoading ? "Carregando tags…" :
          existingTags.length === 0 ? "Digite para criar tag" :
          "Escolha ou digite tag…"
         }
         className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
        />
        <datalist id={`tags-datalist-${c.id}`}>
         {existingTags.map((t) => (
          <option key={t} value={t} />
         ))}
        </datalist>
        {c.valor && (
         <button
          type="button"
          onClick={() => update(idx, { valor: "" })}
          className="text-slate-500 hover:text-rose-400"
          title="Limpar tag"
         >
          <X className="w-3.5 h-3.5" />
         </button>
        )}
       </div>
      ) : c.sujeito === "campo-personalizado" && (customFields.find((f) => f.id === c.campo)?.options?.length ?? 0) > 0 ? (
       <select
        value={c.valor}
        onChange={(e) => update(idx, { valor: e.target.value })}
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
       >
        <option value="">Escolha a opção…</option>
        {(customFields.find((f) => f.id === c.campo)?.options ?? []).map((opt) => (
         <option key={opt} value={opt}>{opt}</option>
        ))}
       </select>
      ) : (
       <input
        value={c.valor}
        onChange={(e) => update(idx, { valor: e.target.value })}
        placeholder={
         c.sujeito === "campo-personalizado" ? "Valor a comparar" :
         "Texto a comparar"
        }
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
       />
      )}
     </div>
     {modo === "ou" && (
      <div className="text-[10px] text-slate-500 leading-snug">
       Esta condição tem o cabo de saída dela. Se bater, o bot segue por este caminho.
      </div>
     )}
    </div>
    </RowMeasure>
    );
   })}
   {modo !== "ou" && (
    <RowMeasure blockId={block.id} optionId="__true__">
     <div className="rounded-md border border-emerald-700/50 bg-emerald-900/10 p-2">
      <span className="text-[10px] uppercase tracking-wide text-emerald-400">
       {modo === "ou" ? "Se bater" : "Se todas baterem"}
      </span>
     </div>
    </RowMeasure>
   )}
   <RowMeasure blockId={block.id} optionId="__false__">
    <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2">
     <span className="text-[10px] uppercase tracking-wide text-slate-500">
      Senão (nenhuma condição bateu)
     </span>
    </div>
   </RowMeasure>
   <div className="flex items-center justify-between gap-2">
    <select
     value={block.condicaoModo?? "e"}
     onChange={(e) => onChange({ condicaoModo: e.target.value as "e" | "ou" })}
     className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
    >
     <option value="e">Todas (E)</option>
     <option value="ou">Qualquer (OU)</option>
    </select>
    <button onClick={add} className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
     <Plus className="w-3 h-3" /> Adicionar condição
    </button>
   </div>
  </div>
 );
}

/* ============== Block picker ============== */

function BlockPicker({ scope, onPick, onClose }: { scope: SalesbotEscopo; onPick: (k: BlockKind) => void; onClose: () => void }) {
 const [q, setQ] = useState("");
 const { isSuperAdmin } = useIsSuperAdmin();
 const catalog = filterBlockCatalogByScope(scope);
 const filtered = catalog.filter((b) => b.label.toLowerCase().includes(q.toLowerCase()));
 return (
 <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
 <div
 className="bg-slate-900 border border-slate-700 rounded-lg w-[440px] max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="p-3 border-b border-slate-800 flex items-center justify-between">
 <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
 Adicionar bloco
 </div>
 <button onClick={onClose} className="text-slate-400 hover:text-white">
 <X className="w-4 h-4" />
 </button>
 </div>
 <div className="p-2 border-b border-slate-800">
 <div className="relative">
 <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
 <input
 autoFocus
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Buscar bloco..."
 className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-xs"
 />
 </div>
 </div>
 <div className="overflow-y-auto p-2 space-y-1">
 {filtered.map((b) => {
  // Super_admin pode adicionar mesmo os "em breve" pra testar; cliente final não.
  const locked = b.emBreve && !isSuperAdmin;
  return (
  <button
  key={b.kind}
  disabled={locked}
  onClick={() => !locked && onPick(b.kind)}
  className={`w-full flex items-start gap-2 text-left px-2 py-2 rounded text-xs ${locked ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-800"}`}
  >
  <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${b.color}`} />
  <span className="min-w-0 flex-1">
   <span className="flex items-center gap-1.5">
    <span className="font-medium text-slate-100">{b.label}</span>
    {b.emBreve && (
     <span className="shrink-0 text-[8px] leading-none uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded px-1 py-0.5">
      em breve
     </span>
    )}
   </span>
   <span className="block text-slate-500 text-[11px] leading-snug mt-0.5">{b.desc}</span>
  </span>
  </button>

 );
 })}
 </div>
 </div>
 </div>
 );
}

/* ============== Minimap ============== */

function Minimap({
 blocks,
 bbox,
 pan,
 scale,
 canvasRef,
 onJump,
}: {
 blocks: Block[];
 bbox: { x: number; y: number; w: number; h: number };
 pan: { x: number; y: number };
 scale: number;
 canvasRef: React.RefObject<HTMLDivElement | null>;
 onJump: (wx: number, wy: number) => void;
}) {
 const [hover, setHover] = useState(false);
 const ref = useRef<HTMLDivElement>(null);
 const draggingRef = useRef(false);
  // Minimap acompanha o zoom do canvas (encolhe quando dá zoom out, cresce no zoom in)
  const zoomFactor = Math.min(1.4, Math.max(0.5, scale));
  const baseW = 180 * zoomFactor;
  const baseH = 130 * zoomFactor;
  const w = hover? baseW * 1.33: baseW;
  const h = hover? baseH * 1.31: baseH;
 const sx = w / bbox.w;
 const sy = h / bbox.h;
 const s = Math.min(sx, sy);

 // Visible viewport in world space
 const rect = canvasRef.current?.getBoundingClientRect();
 const viewW = rect? rect.width / scale: 0;
 const viewH = rect? rect.height / scale: 0;
 const viewX = -pan.x / scale;
 const viewY = -pan.y / scale;

 function jumpTo(e: React.MouseEvent | MouseEvent) {
 if (!ref.current) return;
 const r = ref.current.getBoundingClientRect();
 const mx = e.clientX - r.left;
 const my = e.clientY - r.top;
 // Centraliza a viewport no ponto clicado
 const wx = bbox.x + mx / s - viewW / 2;
 const wy = bbox.y + my / s - viewH / 2;
 onJump(wx + viewW / 2, wy + viewH / 2);
 }

 function handleMouseDown(e: React.MouseEvent) {
 e.stopPropagation();
 e.preventDefault();
 draggingRef.current = true;
 jumpTo(e);
 const move = (ev: MouseEvent) => {
 if (!draggingRef.current) return;
 jumpTo(ev);
 };
 const up = () => {
 draggingRef.current = false;
 window.removeEventListener("mousemove", move);
 window.removeEventListener("mouseup", up);
 };
 window.addEventListener("mousemove", move);
 window.addEventListener("mouseup", up);
 }

 return (
 <div
 ref={ref}
 onMouseEnter={() => setHover(true)}
 onMouseLeave={() => setHover(false)}
 onMouseDown={handleMouseDown}
 style={{ width: w, height: h }}
 className="absolute bottom-3 right-3 z-10 bg-slate-900/95 border border-slate-700 rounded-md overflow-hidden transition-[width,height] duration-200 cursor-grab active:cursor-grabbing shadow-xl select-none"
 >
 <div className="relative w-full h-full">
 {blocks.map((b) => (
 <div
 key={b.id}
 className="absolute bg-slate-400/60 rounded-sm"
 style={{
 left: ((b.x?? 0) - bbox.x) * s,
 top: ((b.y?? 0) - bbox.y) * s,
 width: Math.max(2, BLOCK_W * s),
 height: Math.max(2, BLOCK_H_EST * s),
 }}
 />
 ))}
 <div
 className="absolute border border-sky-400/80 bg-sky-400/5 pointer-events-none rounded-sm"
 style={{
 left: (viewX - bbox.x) * s,
 top: (viewY - bbox.y) * s,
 width: viewW * s,
 height: viewH * s,
 }}
 />
 </div>
 </div>
 );
}

/* ============ Ir para outro bloco ============ */

function IrEtapaBlocoPicker({
 block,
 allBlocks,
 onChange,
}: {
 block: Block;
 allBlocks: Block[];
 onChange: (p: Partial<Block>) => void;
}) {
 const opcoes = allBlocks
  .filter((b) => b.id !== block.id && typeof b.serial === "number")
  .sort((a, b) => (a.serial ?? 0) - (b.serial ?? 0));
 const selecionado = allBlocks.find((b) => b.id === block.nextBlockId);
 return (
  <div className="space-y-1.5">
   <div className="text-[10px] leading-snug text-slate-400">
    Escolha o número do bloco de destino. O fluxo salta para ele em vez de seguir a próxima etapa.
   </div>
   <select
    value={block.nextBlockId ?? ""}
    onChange={(e) => onChange({ nextBlockId: e.target.value || undefined })}
    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
   >
    <option value="">Selecione o bloco de destino...</option>
    {opcoes.map((b) => {
     const meta = BLOCK_CATALOG.find((m) => m.kind === b.kind);
     return (
      <option key={b.id} value={b.id}>
       #{b.serial}: {meta?.label ?? b.kind}
      </option>
     );
    })}
   </select>
   {selecionado && typeof selecionado.serial === "number" && (
    <div className="text-[10px] text-emerald-400">
     → Vai para o bloco #{selecionado.serial}
    </div>
   )}
   {opcoes.length === 0 && (
    <div className="text-[10px] text-amber-400">
     Ainda não há outros blocos para escolher. Adicione blocos e volte aqui.
    </div>
   )}
  </div>
 );
}

/* ============ Pipeline/Stage picker (compartilhado por mudar-status-lead e ir-etapa) ============ */

function PipelineStagePicker({
 block,
 onChange,
}: {
 block: Block;
 onChange: (p: Partial<Block>) => void;
}) {
 const q = useAllFunnels();
 const funnels = q.data ?? [];
 const currentPipeline = funnels.find((f) => f.id === block.destinoPipelineId);

 return (
  <div className="space-y-2">
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Funil</label>
    <select
     value={block.destinoPipelineId ?? ""}
     onChange={(e) => {
      const p = funnels.find((f) => f.id === e.target.value);
      onChange({
       destinoPipelineId: p?.id,
       destinoPipelineNome: p?.name,
       destinoStageId: undefined,
       destinoStageNome: undefined,
      });
     }}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="">
      {q.isLoading ? "Carregando…" : funnels.length === 0 ? "Nenhum funil disponível" : "Selecione o funil…"}
     </option>
     {funnels.map((f) => (
      <option key={f.id} value={f.id}>
       {f.name}
      </option>
     ))}
    </select>
   </div>
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Etapa de destino</label>
    <select
     value={block.destinoStageId ?? ""}
     onChange={(e) => {
      const s = currentPipeline?.stages.find((x) => x.id === e.target.value);
      onChange({
       destinoStageId: s?.id,
       destinoStageNome: s?.name,
       // Mantém compat com campos legados de texto:
       destinoEtapa: s?.name,
       acaoConfig: s ? `${currentPipeline?.name ?? ""} → ${s.name}` : undefined,
      });
     }}
     disabled={!currentPipeline}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs disabled:opacity-50"
    >
     <option value="">Selecione a etapa…</option>
     {currentPipeline?.stages.map((s) => (
      <option key={s.id} value={s.id}>
       {s.name}
      </option>
     ))}
    </select>
   </div>
  </div>
 );
}


// ─────────────────────────────────────────────────────────────
// Encerrar bot: além de finalizar o fluxo, permite empilhar até
// três ações (mudar status da conversa, iniciar outro Salesbot,
// iniciar um Agente IA). Sem nenhuma ação = encerra normalmente.
// ─────────────────────────────────────────────────────────────
function EncerrarBotEditor({
 block,
 scope,
 onChange,
}: {
 block: Block;
 scope: SalesbotEscopo;
 onChange: (p: Partial<Block>) => void;
}) {
 const acoes = block.encerrarAcoes ?? [];
 const bots = useWorkspaceBotOptions(scope);


 const [workspaceId, setWorkspaceId] = useState<string | null>(null);
 useEffect(() => {
  (async () => {
   const { data: u } = await supabase.auth.getUser();
   if (!u.user) return;
   const { data: p } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", u.user.id)
    .maybeSingle();
   setWorkspaceId(p?.current_workspace_id ?? null);
  })();
 }, []);
 const listConvFn = useServerFn(listConversationAgents);
 const listGroupFn = useServerFn(listGroupAiAgents);
 const agentsQ = useQuery({
  queryKey: ["ia-picker", scope, workspaceId],
  enabled: !!workspaceId,
  queryFn: async () => {
   if (scope === "grupo") {
    const rows = (await listGroupFn({ data: { workspaceId: workspaceId! } })) as Array<{ id: string; name: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name }));
   }
   const rows = (await listConvFn({ data: { workspaceId: workspaceId! } })) as Array<{ id: string; name: string }>;
   return rows.map((r) => ({ id: r.id, name: r.name }));
  },
  staleTime: 30_000,
 });
 const agents = agentsQ.data ?? [];

 function setAcoes(next: EncerrarAcao[]) {
  onChange({ encerrarAcoes: next });
 }
 function addAcao(tipo: EncerrarAcao["tipo"]) {
  setAcoes([
   ...acoes,
   {
    id: `ea-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo,
    ...(tipo === "status-conversa" ? { status: "fechada" as const } : {}),
   },
  ]);
 }
 function patchAcao(id: string, patch: Partial<EncerrarAcao>) {
  setAcoes(acoes.map((a) => (a.id === id ? { ...a, ...patch } : a)));
 }
 function removeAcao(id: string) {
  setAcoes(acoes.filter((a) => a.id !== id));
 }

 return (
  <div className="space-y-2">
   <p className="text-[11px] text-slate-400">
    Fluxo finalizado neste ponto. Se quiser, adicione ações que acontecem no
    encerramento — pode combinar quantas precisar.
   </p>

   {acoes.map((a) => (
    <div key={a.id} className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1.5">
     <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">
       {a.tipo === "status-conversa"
        ? "Mudar status da conversa"
        : a.tipo === "iniciar-salesbot"
         ? "Iniciar Salesbot"
         : "Iniciar Agente IA"}
      </span>
      <button
       type="button"
       onClick={() => removeAcao(a.id)}
       className="text-slate-400 hover:text-rose-400"
       aria-label="Remover ação"
       title="Remover ação"
      >
       <Trash2 className="w-3 h-3" />
      </button>
     </div>

     {a.tipo === "status-conversa" && (
      <select
       value={a.status ?? "fechada"}
       onChange={(e) => patchAcao(a.id, { status: e.target.value as EncerrarAcao["status"] })}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      >
       <option value="aberta">Aberta</option>
       <option value="lida">Lida</option>
       <option value="fechada">Fechada</option>
      </select>
     )}

     {a.tipo === "iniciar-salesbot" && (
      <select
       value={a.botId ?? ""}
       onChange={(e) => {
         const b = bots.find((x) => x.id === e.target.value);
         patchAcao(a.id, { botId: b?.id, botNome: b?.nome });
        }}
        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
       >
        <option value="">
         {bots.length === 0 ? "Nenhum bot disponível" : "Selecione o salesbot…"}
        </option>
        {bots.map((b) => (
         <option key={b.id} value={b.id}>{b.nome}</option>
        ))}
      </select>
     )}

     {a.tipo === "iniciar-ia" && (
      <select
       value={a.agentId ?? ""}
       onChange={(e) => {
        const ag = agents.find((x) => x.id === e.target.value);
        patchAcao(a.id, { agentId: ag?.id, agentNome: ag?.name });
       }}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      >
       <option value="">
        {agentsQ.isLoading
         ? "Carregando…"
         : agents.length === 0
          ? "Nenhum agente cadastrado"
          : "Selecione o agente…"}
       </option>
       {agents.map((ag) => (
        <option key={ag.id} value={ag.id}>{ag.name}</option>
       ))}
      </select>
     )}
    </div>
   ))}

   <div className="flex flex-wrap items-center gap-1.5">
    <button
     type="button"
     onClick={() => addAcao("status-conversa")}
     className="text-[11px] rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:border-slate-500"
    >
     + Status da conversa
    </button>
    <button
     type="button"
     onClick={() => addAcao("iniciar-salesbot")}
     className="text-[11px] rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:border-slate-500"
    >
     + Iniciar Salesbot
    </button>
    <button
     type="button"
     onClick={() => addAcao("iniciar-ia")}
     className="text-[11px] rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:border-slate-500"
    >
     + Iniciar Agente IA
    </button>
   </div>
  </div>
 );
}

type BotOption = { id: string; localId: string; nome: string; escopo: SalesbotEscopo };

/** Bots do workspace (banco) — o id retornado é o UUID aceito pelo runtime. */
function useWorkspaceBotOptions(scope: SalesbotEscopo): BotOption[] {
 const listFn = useServerFn(listSalesbotPickerOptions);
 const q = useQuery({
  queryKey: ["salesbot-picker-options"],
  queryFn: async () => (await listFn({} as never)) as { bots: BotOption[] },
  staleTime: 15_000,
 });
 return (q.data?.bots ?? []).filter((b) => b.escopo === scope);
}

function IniciarSalesbotPicker({
 block,
 scope,
 onChange,
}: {
 block: Block;
 scope: SalesbotEscopo;
 onChange: (p: Partial<Block>) => void;
}) {
 const bots = useWorkspaceBotOptions(scope);
 return (
  <select
   value={block.destinoBotId ?? ""}
   onChange={(e) => {
    const b = bots.find((x) => x.id === e.target.value);
    onChange({
     destinoBotId: b?.id,
     destinoBotNome: b?.nome,
     destinoBot: b?.nome,
    });
   }}
   className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
  >
   <option value="">
    {bots.length === 0
     ? "Nenhum bot disponível"
     : scope === "grupo"
      ? "Selecione o bot de grupo…"
      : "Selecione o salesbot…"}
   </option>
   {bots.map((b) => (
    <option key={b.id} value={b.id}>
     {b.nome}
    </option>
   ))}
  </select>
 );
}

function IniciarIaEditor({
 block,
 scope,
 onChange,
}: {
 block: Block;
 scope: SalesbotEscopo;
 onChange: (p: Partial<Block>) => void;
}) {
 const [workspaceId, setWorkspaceId] = useState<string | null>(null);
 useEffect(() => {
  (async () => {
   const { data: u } = await supabase.auth.getUser();
   if (!u.user) return;
   const { data: p } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", u.user.id)
    .maybeSingle();
   setWorkspaceId(p?.current_workspace_id ?? null);
  })();
 }, []);
 const listConvFn = useServerFn(listConversationAgents);
 const listGroupFn = useServerFn(listGroupAiAgents);
 const q = useQuery({
  queryKey: ["ia-picker", scope, workspaceId],
  enabled: !!workspaceId,
  queryFn: async () => {
   if (scope === "grupo") {
    const rows = (await listGroupFn({ data: { workspaceId: workspaceId! } })) as Array<{ id: string; name: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name }));
   }
   const rows = (await listConvFn({ data: { workspaceId: workspaceId! } })) as Array<{ id: string; name: string; enabled?: boolean }>;
   return rows.map((r) => ({ id: r.id, name: r.name }));
  },
  staleTime: 30_000,
 });
 const agents = q.data ?? [];
 return (
  <div className="space-y-2">
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Agente IA de conversa</label>
    <select
     value={block.iaAgentId ?? ""}
     onChange={(e) => {
      const a = agents.find((x) => x.id === e.target.value);
      onChange({ iaAgentId: a?.id, iaAgentNome: a?.name });
     }}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="">
      {q.isLoading
       ? "Carregando…"
       : agents.length === 0
        ? "Nenhum agente cadastrado, crie em Automações › Agente IA"
        : "Selecione o agente…"}
     </option>
     {agents.map((a) => (
      <option key={a.id} value={a.id}>
       {a.name}
      </option>
     ))}
    </select>
   </div>
   <p className="text-[10px] text-slate-500">
    A mensagem de abertura e o limite de interações são configurados dentro do próprio Agente IA. Quando a IA pede handoff, o fluxo segue pelo próximo bloco conectado.
   </p>
  </div>
 );
}

/* ============ EnqueteEditor (apenas em bots de grupo) ============ */
function EnqueteEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const opcoes = block.enqueteOpcoes && block.enqueteOpcoes.length > 0 ? block.enqueteOpcoes : ["", ""];
 const updateOpcoes = (next: string[]) => onChange({ enqueteOpcoes: next });
 return (
  <div className="space-y-2">
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Pergunta</label>
    <input
     type="text"
     value={block.enquetePergunta ?? ""}
     onChange={(e) => onChange({ enquetePergunta: e.target.value })}
     placeholder="Ex.: Qual dia da semana você prefere?"
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    />
   </div>
   <div className="space-y-1">
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Opções</label>
    {opcoes.map((op, idx) => (
     <div key={idx} className="flex items-center gap-1">
      <input
       type="text"
       value={op}
       onChange={(e) => {
        const next = [...opcoes];
        next[idx] = e.target.value;
        updateOpcoes(next);
       }}
       placeholder={`Opção ${idx + 1}`}
       className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      />
      {opcoes.length > 2 && (
       <button
        type="button"
        onClick={() => updateOpcoes(opcoes.filter((_, i) => i !== idx))}
        className="text-slate-500 hover:text-red-400 p-1"
        title="Remover opção"
       >
        <X className="w-3 h-3" />
       </button>
      )}
     </div>
    ))}
    {opcoes.length < 12 && (
     <button
      type="button"
      onClick={() => updateOpcoes([...opcoes, ""])}
      className="w-full text-[11px] rounded border border-dashed border-slate-600 hover:border-teal-500/70 hover:text-teal-400 text-slate-400 py-1 transition"
     >
      + adicionar opção
     </button>
    )}
   </div>
   <label className="flex items-center gap-2 text-[11px] text-slate-300">
    <input
     type="checkbox"
     checked={!!block.enqueteMultipla}
     onChange={(e) => onChange({ enqueteMultipla: e.target.checked })}
    />
    Permitir múltipla escolha
   </label>
   <p className="text-[10px] text-slate-500">
    Enquete nativa do WhatsApp. Só funciona em bots de grupo, o bot não aguarda o resultado, segue para o próximo bloco.
   </p>
  </div>
 );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function CreateCustomFieldDialog({ 
  open, 
  onOpenChange, 
  onCreated,
  draftKey = null,
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onCreated: (field: { id: string; name: string; fieldType: string; options: string[] }) => void;
  draftKey?: string | null;
}) {
  const [restored] = useState(() => readCustomFieldDraft(draftKey, { name: "", type: "text", options: "", id: crypto.randomUUID() }));
  const [name, setName] = useState(restored.name);
  const [type, setType] = useState(restored.type);
  const [options, setOptions] = useState(restored.options);
  const [requestId, setRequestId] = useState(restored.id);
  const createFn = useServerFn(createLeadCustomField);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const createLock = useRef(false);
  useEffect(() => {
    if (open) writeCustomFieldDraft(draftKey, { name, type, options, id: requestId });
  }, [open, draftKey, name, type, options, requestId]);
  const closeDialog = () => {
    if (createLock.current) return;
    clearCustomFieldDraft(draftKey);
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!name.trim() || createLock.current) return;
    const choices = [...new Set(options.split("\n").map(value => value.trim()).filter(Boolean))];
    if (["select", "multiselect"].includes(type) && !choices.length) {
      setSaveError("Adicione as opções do campo de seleção."); return;
    }
    createLock.current = true;
    setSaveError(null);
    setLoading(true);
    try {
      const res = await createFn({ data: { id: requestId, name, fieldType: type, options: choices } });
      onCreated(res.field);
      clearCustomFieldDraft(draftKey);
      onOpenChange(false);
      setName("");
      setType("text");
      setOptions("");
      setRequestId(crypto.randomUUID());
      toast.success("Campo personalizado criado.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erro ao criar campo.");
    } finally {
      createLock.current = false;
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) closeDialog(); }}>
      <DialogContent onPointerDownOutside={event => event.preventDefault()} className="sm:max-w-[400px] bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Novo campo personalizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Nome do campo</label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Ex: CPF, Data de vencimento..." 
              className="bg-slate-950 border-slate-800 focus:border-emerald-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="text">Texto</option>
              <option value="textarea">Texto longo</option>
              <option value="number">Número</option>
              <option value="money">Moeda (R$)</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
              <option value="date">Data</option>
              <option value="url">Link / URL</option>
              <option value="datetime">Data e hora</option>
              <option value="birthday">Data de nascimento</option>
              <option value="cpf">CPF</option>
              <option value="address">Endereço</option>
              <option value="file">Arquivo</option>
              <option value="product">Produto</option>
              <option value="select">Selecionar (1 opção)</option>
              <option value="multiselect">Selecionar múltiplos</option>
            </select>
            {["select", "multiselect"].includes(type) && <label className="mt-2 block text-xs">Opções (uma por linha)<textarea value={options} onChange={event => setOptions(event.target.value)} className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2" rows={4} /></label>}
          </div>
        </div>
        {saveError && <p role="alert" className="text-xs text-red-400">{saveError}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={closeDialog} disabled={loading} className="hover:bg-slate-800 text-slate-400">Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Criando..." : "Criar campo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Picker: Definir campo (lead / empresa) ============ */
 function CustomFieldPicker({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const queryClient = useQueryClient();
  const [showCreateField, setShowCreateField] = useState(false);
  const listFields = useServerFn(listLeadCustomFields);
  const q = useQuery({
   queryKey: ["lead-custom-fields"],
   queryFn: () => listFields(),
   staleTime: 0,
   refetchOnMount: "always",
  });
  const custom: Array<{ id: string; name: string; fieldType: string; options?: string[] }> = q.data?.fields ?? [];
  const fieldDraftKey = q.isFetchedAfterMount
    ? customFieldDraftKey(q.data?.actorId, q.data?.workspaceId, `bot-block:${block.id}`) : null;
  useEffect(() => {
    if (fieldDraftKey && readCustomFieldDraft(fieldDraftKey, null)) setShowCreateField(true);
  }, [fieldDraftKey]);
  const entidade: "lead" | "empresa" = block.campoEntidade ?? "lead";

 type Target = { ref: string; label: string; fieldType: string; options: string[] };
 const leadTargets: Target[] = [
  ...LEAD_BUILTIN_FIELDS.map((f) => ({ ref: f.ref, label: f.label, fieldType: f.fieldType, options: [] })),
  ...custom.map((f) => ({ ref: f.id, label: f.name, fieldType: f.fieldType, options: f.options ?? [] })),
 ];
 const empresaTargets: Target[] = COMPANY_BUILTIN_FIELDS.map((f) => ({
  ref: f.ref, label: f.label, fieldType: f.fieldType, options: [],
 }));
 const targets = entidade === "empresa" ? empresaTargets : leadTargets;
 const selected = targets.find((t) => t.ref === block.campoId);
 const origem = block.campoOrigem ?? "manual";

 const setOrigem = (value: string) => {
  if (value === "manual" || value === "mensagem") {
   onChange({
    campoOrigem: value,
    campoOrigemRef: undefined,
    campoOrigemLabel: value === "mensagem" ? "Mensagem do cliente" : undefined,
    campoValor: value === "mensagem" ? "" : (block.campoValor ?? ""),
    acaoConfig: block.campoNome
     ? `${block.campoNome} = ${value === "mensagem" ? "Mensagem do cliente" : block.campoValor ?? ""}`
     : undefined,
   });
   return;
  }
  const all = [...leadTargets, ...empresaTargets];
  const src = all.find((t) => t.ref === value);
  onChange({
   campoOrigem: "copiar",
   campoOrigemRef: value,
   campoOrigemLabel: src?.label,
   acaoConfig: block.campoNome ? `${block.campoNome} = ${src?.label ?? ""}` : undefined,
  });
 };

 return (
  <div className="space-y-2">
   <div className="grid grid-cols-2 gap-2">
    <div>
     <label className="text-[10px] uppercase tracking-wider text-slate-400">Onde gravar</label>
     <select
      value={entidade}
      onChange={(e) => {
       const ent = e.target.value as "lead" | "empresa";
       onChange({ campoEntidade: ent, campoId: undefined, campoNome: undefined, campoValor: "", acaoConfig: undefined });
      }}
      className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
     >
       <option value="lead">Lead</option>
       <option value="empresa">Empresa</option>
     </select>
    </div>
    <div>
     <label className="text-[10px] uppercase tracking-wider text-slate-400">Campo</label>
     <select
      value={block.campoId ?? ""}
       onChange={(e) => {
        if (e.target.value === "create-new") {
          setShowCreateField(true);
          return;
        }
        const t = targets.find((x) => x.ref === e.target.value);
        onChange({
         campoId: t?.ref,
         campoNome: t?.label,
         campoValor: "",
         acaoConfig: t ? `${t.label} = ` : undefined,
        });
       }}
      className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
     >
      <option value="">
       {q.isLoading ? "Carregando…" : "Selecione o campo…"}
      </option>
      {entidade === "lead" ? (
       <>
        <optgroup label="Dados do lead">
         {LEAD_BUILTIN_FIELDS.map((f) => (
          <option key={f.ref} value={f.ref}>{f.label}</option>
         ))}
        </optgroup>
        <optgroup label="Campos personalizados">
         {custom.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
         ))}
        </optgroup>
       </>
      ) : (
       COMPANY_BUILTIN_FIELDS.map((f) => (
        <option key={f.ref} value={f.ref}>{f.label}</option>
       ))
      )}
       <optgroup label="Ações">
        <option value="create-new">+ Criar novo campo personalizado</option>
       </optgroup>
      </select>
      <CreateCustomFieldDialog 
        key={fieldDraftKey}
        draftKey={fieldDraftKey}
        open={showCreateField} 
        onOpenChange={setShowCreateField} 
        onCreated={(f) => {
          queryClient.setQueryData(["lead-custom-fields"], (previous: typeof q.data) => ({ ...previous, fields: [...(previous?.fields ?? []).filter(field => field.id !== f.id), f] }));
          void q.refetch();
          onChange({
            campoId: f.id,
            campoNome: f.name,
            campoValor: "",
            acaoConfig: `${f.name} = `
          });
        }}
      />
    </div>
   </div>

   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Valor vem de</label>
    <select
     value={origem === "copiar" ? (block.campoOrigemRef ?? "") : origem}
     onChange={(e) => setOrigem(e.target.value)}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="mensagem">Mensagem do cliente</option>
     <option value="manual">Entrada manual</option>
     <optgroup label="Copiar de: Lead">
      {LEAD_BUILTIN_FIELDS.map((f) => (
       <option key={f.ref} value={f.ref}>Lead: {f.label}</option>
      ))}
      {custom.map((f) => (
       <option key={f.id} value={f.id}>Lead: {f.name}</option>
      ))}
     </optgroup>
     <optgroup label="Copiar de: Empresa">
      {COMPANY_BUILTIN_FIELDS.map((f) => (
       <option key={f.ref} value={f.ref}>Empresa: {f.label}</option>
      ))}
     </optgroup>
    </select>
   </div>

   {origem === "manual" && (
    <div className="space-y-2">
     <CustomFieldValueInput
      fieldType={selected?.fieldType ?? "text"}
      options={selected?.options ?? []}
      value={block.campoValor ?? ""}
      onValue={(v) => onChange({ campoValor: v, acaoConfig: block.campoNome ? `${block.campoNome} = ${v}` : v })}
     />
    </div>
   )}
   {origem === "mensagem" && (
    <p className="text-[11px] text-slate-400">
     O bot grava neste campo o conteúdo da última mensagem enviada pelo cliente.
    </p>
   )}
   {origem === "copiar" && (
    <p className="text-[11px] text-slate-400">
     O bot copia o valor de <span className="text-slate-200">{block.campoOrigemLabel}</span> para este campo.
    </p>
   )}
  </div>
 );
}


const FIELD_VALUE_META: Record<string, { label: string; inputType: string; placeholder: string; step?: string }> = {
 text: { label: "Texto", inputType: "text", placeholder: "Escreva o texto…" },
 textarea: { label: "Texto longo", inputType: "textarea", placeholder: "Escreva o conteúdo…" },
 number: { label: "Número", inputType: "number", placeholder: "0" },
 money: { label: "Valor (R$)", inputType: "number", placeholder: "0,00", step: "0.01" },
 email: { label: "E-mail", inputType: "email", placeholder: "cliente@email.com" },
 phone: { label: "Telefone", inputType: "tel", placeholder: "+55 (11) 90000-0000" },
 cpf: { label: "CPF", inputType: "text", placeholder: "000.000.000-00" },
 url: { label: "Link (URL)", inputType: "url", placeholder: "https://…" },
 address: { label: "Endereço", inputType: "text", placeholder: "Rua, nº, bairro, cidade" },
 date: { label: "Data", inputType: "date", placeholder: "" },
 birthday: { label: "Data de nascimento", inputType: "date", placeholder: "" },
 datetime: { label: "Data e hora", inputType: "datetime-local", placeholder: "" },
 file: { label: "Arquivo (link)", inputType: "url", placeholder: "https://link-do-arquivo" },
 product: { label: "Produto / serviço", inputType: "text", placeholder: "Nome do produto" },
};

function CustomFieldValueInput({
 fieldType,
 options,
 value,
 onValue,
}: {
 fieldType: string;
 options: string[];
 value: string;
 onValue: (v: string) => void;
}) {
 const cls = "mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs";
 const meta = FIELD_VALUE_META[fieldType] ?? FIELD_VALUE_META["text"]!;

 if (fieldType === "multiselect" && options.length > 0) {
  const picked = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return (
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Opções (múltipla escolha)</label>
    <div className="mt-1 space-y-1 rounded border border-slate-700 bg-slate-800 p-2 max-h-36 overflow-y-auto">
     {options.map((o) => (
      <label key={o} className="flex items-center gap-2 text-xs text-slate-200">
       <input
        type="checkbox"
        checked={picked.includes(o)}
        onChange={(e) => {
         const next = e.target.checked ? [...picked, o] : picked.filter((p) => p !== o);
         onValue(next.join(", "));
        }}
       />
       {o}
      </label>
     ))}
    </div>
   </div>
  );
 }

 if (options.length > 0) {
  return (
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Opção</label>
    <select value={value} onChange={(e) => onValue(e.target.value)} className={cls}>
     <option value="">Selecione a opção…</option>
     {options.map((o) => (
      <option key={o} value={o}>{o}</option>
     ))}
    </select>
   </div>
  );
 }

 if (meta.inputType === "textarea") {
  return (
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">{meta.label}</label>
    <textarea
     value={value}
     onChange={(e) => onValue(e.target.value)}
     placeholder={meta.placeholder}
     rows={3}
     className={cls + " resize-y"}
    />
   </div>
  );
 }

 const isDateLike = fieldType === "date" || fieldType === "datetime" || fieldType === "birthday";
 const useNow = value === "{{agora}}";

 return (
  <div>
   <label className="text-[10px] uppercase tracking-wider text-slate-400">{meta.label}</label>
   <input
    type={meta.inputType}
    step={meta.step}
    value={useNow ? "" : value}
    disabled={useNow}
    onChange={(e) => onValue(e.target.value)}
    placeholder={meta.placeholder}
    className={cls + (useNow ? " opacity-50" : "")}
   />
   {isDateLike && (
    <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
     <input
      type="checkbox"
      checked={useNow}
      onChange={(e) => onValue(e.target.checked ? "{{agora}}" : "")}
     />
     Usar a data/hora do momento em que o bot executar
    </label>
   )}
  </div>
 );

}


/* ============ Editor: Mensagem interna (Chat da equipe) ============ */
function MsgInternaEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
	const listTargets = useServerFn(listInternalMessageTargets);
	const q = useQuery({
		queryKey: ["salesbot-internal-targets"],
		queryFn: () => listTargets({ data: {} }),
		staleTime: 60_000,
	});
	const tipo = block.msgInternaDestinoTipo ?? "usuario";
	const users = q.data?.users ?? [];
	const sectors = q.data?.sectors ?? [];

	return (
		<div className="space-y-1.5">
			<VariableTextarea
				value={block.texto ?? ""}
				onChange={(v) => onChange({ texto: v })}
				placeholder="Alerta interno para a equipe (o lead não vê)..."
				rows={3}
				className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-none"
			/>
			<div className="space-y-1">
				<span className="text-[10px] uppercase tracking-wider text-slate-500">Enviar para</span>
				<select
					value={tipo}
					onChange={(e) =>
						onChange({
							msgInternaDestinoTipo: e.target.value as "usuario" | "setor" | "admins",
							msgInternaDestinoId: undefined,
						})
					}
					className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
				>
					<option value="usuario">Um colaborador específico</option>
					<option value="setor">Um setor inteiro</option>
					<option value="admins">Administradores / donos da conta</option>
				</select>
				{tipo === "usuario" && (
					<select
						value={block.msgInternaDestinoId ?? ""}
						onChange={(e) => onChange({ msgInternaDestinoId: e.target.value })}
						className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
					>
						<option value="">{q.isLoading ? "Carregando..." : "Selecione o colaborador..."}</option>
						{users.map((u: { id: string; name: string }) => (
							<option key={u.id} value={u.id}>
								{u.name}
							</option>
						))}
					</select>
				)}
				{tipo === "setor" && (
					<select
						value={block.msgInternaDestinoId ?? ""}
						onChange={(e) => onChange({ msgInternaDestinoId: e.target.value })}
						className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
					>
						<option value="">{q.isLoading ? "Carregando..." : "Selecione o setor..."}</option>
						{sectors.map((s: { id: string; name: string }) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				)}
			</div>
			<p className="text-[10px] leading-snug text-slate-400">
				O alerta chega no <b>Chat da equipe</b> de quem você escolher (e no histórico do lead). O cliente nunca recebe.
			</p>
		</div>
	);
}

/* ============ Picker: Mudar responsável ============ */
function ResponsavelPicker({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const listUsers = useServerFn(listWorkspaceUsers);
 const q = useQuery({
  queryKey: ["salesbot-workspace-users"],
  queryFn: () => listUsers(),
  staleTime: 30_000,
 });
 const users: Array<{ id: string; name: string; email: string | null }> = q.data?.users ?? [];
 return (
  <select
   value={block.destinoResponsavelId ?? ""}
   onChange={(e) => {
    const u = users.find((x) => x.id === e.target.value);
    onChange({
     destinoResponsavelId: u?.id,
     destinoResponsavelNome: u?.name,
     acaoConfig: u?.name,
    });
   }}
   className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
  >
   <option value="">
    {q.isLoading
     ? "Carregando…"
     : q.error
       ? "Erro ao carregar usuários"
       : users.length === 0
         ? "Nenhum usuário disponível"
         : "Selecione o responsável…"}
   </option>
   {users.map((u) => (
    <option key={u.id} value={u.id}>{u.name}</option>
   ))}
  </select>
 );
}

/* ============ Editor: Webhook ============ */
function WebhookEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const testFn = useServerFn(testSalesbotWebhook);
 const [testing, setTesting] = useState(false);
 const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
 const url = block.webhookUrl ?? "";

 async function runTest() {
  setTesting(true);
  setResult(null);
  try {
   const r = await testFn({
    data: {
     url,
     method: (block.webhookMethod ?? "POST") as "POST" | "PUT",
     secret: block.webhookSecret || undefined,
    },
   });
   setResult({ ok: r.ok, message: r.message });
  } catch (e) {
   setResult({ ok: false, message: (e as Error).message });
  } finally {
   setTesting(false);
  }
 }

 return (
  <div className="space-y-2">
   <div className="flex gap-2">
    <select
     value={block.webhookMethod ?? "POST"}
     onChange={(e) => onChange({ webhookMethod: e.target.value as "POST" | "PUT" })}
     className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="POST">POST</option>
     <option value="PUT">PUT</option>
    </select>
    <input
     value={url}
     onChange={(e) => onChange({ webhookUrl: e.target.value, acaoConfig: e.target.value })}
     placeholder="https://sua-url.com/webhook"
     className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    />
   </div>
   <input
    value={block.webhookSecret ?? ""}
    onChange={(e) => onChange({ webhookSecret: e.target.value })}
     placeholder="Segredo HMAC (opcional, assina como X-Vanessa Simoni-Signature)"
    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
   />
   <div className="flex items-center gap-2">
    <button
     type="button"
     disabled={testing || !url.trim()}
     onClick={() => { void runTest(); }}
     className="text-[11px] px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
    >
     {testing ? "Enviando teste…" : "Testar envio"}
    </button>
    {result && (
     <span className={"text-[11px] " + (result.ok ? "text-emerald-400" : "text-rose-400")}>
      {result.ok ? "Enviado — " : "Falhou — "}{result.message}
     </span>
    )}
   </div>
   <p className="text-[10px] text-slate-500">
    Payload: <code>{`{ lead_id, workspace_id, salesbot_id, run_id, block_id, variables }`}</code>
   </p>
  </div>
 );
}


/* ============ Editor: Criar tarefa ============ */
function TarefaEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const listPipes = useServerFn(listWorkflowPipelinesLite);
 const q = useQuery({
  queryKey: ["salesbot-workflow-pipes"],
  queryFn: () => listPipes(),
  staleTime: 60_000,
 });
 const pipes = (q.data ?? []) as Array<{ id: string; name: string; members: Array<{ id: string; name: string }>; stages?: Array<{ id: string; name: string }> }>;
 const selectedPipe = pipes.find((p) => p.id === block.tarefaWorkflowPipelineId);
 const members = selectedPipe?.members ?? [];
 const stages = selectedPipe?.stages ?? [];
 return (
  <div className="space-y-2">
   <input
    value={block.tarefaTitulo ?? ""}
    onChange={(e) => onChange({ tarefaTitulo: e.target.value, acaoConfig: e.target.value })}
    placeholder="Título da tarefa (ex: Ligar para o lead)"
    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
   />
   <select
    value={block.tarefaKind ?? "tarefa"}
    onChange={(e) => onChange({ tarefaKind: e.target.value as "tarefa" | "reuniao" | "evento" })}
    className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
   >
    <option value="tarefa">Tarefa</option>
    <option value="reuniao">Reunião</option>
    <option value="evento">Evento</option>
   </select>
   <div className="grid grid-cols-2 gap-1.5">
    <label className="flex min-w-0 flex-col gap-0.5">
     <span className="text-slate-400 text-[10px]">Em (min)</span>
     <input
      type="number"
      min={0}
      value={block.tarefaOffsetMin ?? 60}
      onChange={(e) => onChange({ tarefaOffsetMin: Number(e.target.value) })}
      className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
     />
    </label>
    <label className="flex min-w-0 flex-col gap-0.5">
     <span className="text-slate-400 text-[10px]">Duração (min)</span>
     <input
      type="number"
      min={5}
      value={block.tarefaDuracaoMin ?? 30}
      onChange={(e) => onChange({ tarefaDuracaoMin: Number(e.target.value) })}
      className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
     />
    </label>
   </div>

   <div className="pt-2 mt-1 border-t border-slate-700/60 space-y-1.5">
    <label className="text-slate-400 text-[10px]">Fluxo de trabalho (Kanban)</label>
    <select
     value={block.tarefaWorkflowPipelineId ?? ""}
     onChange={(e) => {
      const id = e.target.value || undefined;
      const pipe = pipes.find((p) => p.id === id);
      onChange({
       tarefaWorkflowPipelineId: id,
       tarefaWorkflowPipelineNome: pipe?.name,
       tarefaWorkflowStageId: undefined,
       tarefaWorkflowStageNome: undefined,
       tarefaWorkflowAssigneeId: undefined,
       tarefaWorkflowAssigneeNome: undefined,
      });
     }}
     className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="">- Calendário (padrão) -</option>
     {pipes.map((p) => (
      <option key={p.id} value={p.id}>{p.name}</option>
     ))}
    </select>
    {block.tarefaWorkflowPipelineId && (
     <>
      <label className="text-slate-400 text-[10px]">Etapa do fluxo</label>
      <select
       value={block.tarefaWorkflowStageId ?? ""}
       onChange={(e) => {
        const id = e.target.value || undefined;
        const st = stages.find((x) => x.id === id);
        onChange({ tarefaWorkflowStageId: id, tarefaWorkflowStageNome: st?.name });
       }}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      >
       <option value="">- Primeira etapa (padrão) -</option>
       {stages.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
       ))}
      </select>
      <label className="text-slate-400 text-[10px]">Responsável</label>
      <select
       value={block.tarefaWorkflowAssigneeId ?? ""}
       onChange={(e) => {
        const id = e.target.value || undefined;
        const m = members.find((x) => x.id === id);
        onChange({ tarefaWorkflowAssigneeId: id, tarefaWorkflowAssigneeNome: m?.name });
       }}
       className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      >
       <option value="">- Sem responsável -</option>
       {members.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
       ))}
      </select>
      {members.length === 0 && (
       <p className="text-[10px] text-amber-400/80">
        Nenhum usuário encontrado neste workspace.
       </p>
      )}

      <select
       value={block.tarefaWorkflowPriority ?? "media"}
       onChange={(e) => onChange({ tarefaWorkflowPriority: e.target.value as "baixa" | "media" | "alta" | "urgente" })}
       className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
      >
       <option value="baixa">Prioridade: Baixa</option>
       <option value="media">Prioridade: Média</option>
       <option value="alta">Prioridade: Alta</option>
       <option value="urgente">Prioridade: Urgente</option>
      </select>
      <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
       <input
        type="checkbox"
        checked={block.tarefaTambemCalendario === true}
        onChange={(e) => onChange({ tarefaTambemCalendario: e.target.checked })}
        className="mt-0.5 accent-emerald-500"
       />
       <span>
        Criar também no calendário padrão
        <span className="block text-[10px] text-slate-500">
         Assim a tarefa também aparece na agenda (e sincroniza com o Google Agenda, se conectado).
        </span>
       </span>
      </label>
     </>
    )}
   </div>
   <p className="text-[10px] text-slate-500">
    {block.tarefaWorkflowPipelineId
     ? `A tarefa será criada no Fluxo de Trabalho "${block.tarefaWorkflowPipelineNome ?? ""}", na etapa ${block.tarefaWorkflowStageNome ?? "inicial"}${block.tarefaTambemCalendario ? " e também no calendário" : ""}, vinculada ao lead.`
     : "A tarefa será criada no calendário, vinculada ao lead."}
   </p>


  </div>
 );
}

/* ============ Picker: Enviar formulário ============ */
function FormularioPicker({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const listFn = useServerFn(listForms);
 const q = useQuery({
  queryKey: ["salesbot-forms"],
  queryFn: () => listFn(),
  staleTime: 30_000,
 });
 const forms: Array<{ id: string; slug: string; nome: string }> = (q.data as Array<{ id: string; slug: string; nome: string }> | undefined) ?? [];

 // Compat: bloco antigo guardava só formularioId
 const selected: Array<{ id: string; nome?: string }> =
  block.formularios && block.formularios.length > 0
   ? block.formularios
   : block.formularioId
    ? [{ id: block.formularioId, nome: block.formularioNome }]
    : [{ id: "" }];

 const commit = (list: Array<{ id: string; nome?: string }>) => {
  const clean = list.filter((x) => x.id);
  onChange({
   formularios: list,
   formularioId: clean[0]?.id,
   formularioNome: clean[0]?.nome,
   acaoConfig: clean.map((x) => x.nome).filter(Boolean).join(" + ") || undefined,
  });
 };

 return (
  <div className="space-y-2">
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Formulários</label>
    <div className="mt-1 space-y-1.5">
     {selected.map((item, i) => (
      <div key={i} className="flex items-center gap-1.5">
       <select
        value={item.id}
        onChange={(e) => {
         const f = forms.find((x) => x.id === e.target.value);
         const next = selected.slice();
         next[i] = { id: f?.id ?? "", nome: f?.nome };
         commit(next);
        }}
        className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
       >
        <option value="">
         {q.isLoading ? "Carregando…" : forms.length === 0 ? "Nenhum formulário cadastrado" : "Selecione o formulário…"}
        </option>
        {forms.map((f) => (
         <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
       </select>
       {selected.length > 1 && (
        <button
         type="button"
         onClick={() => commit(selected.filter((_, j) => j !== i))}
         className="shrink-0 h-7 w-7 rounded border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 text-xs"
         title="Remover formulário"
        >
         ×
        </button>
       )}
      </div>
     ))}
     <button
      type="button"
      onClick={() => commit([...selected, { id: "" }])}
      className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
     >
      + Adicionar outro formulário
     </button>
    </div>
   </div>
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Mensagem enviada</label>
    <VariableTextarea
     value={block.formularioMensagem ?? ""}
     onChange={(v) => onChange({ formularioMensagem: v })}
     placeholder="Olá! Preencha por favor:"
     rows={2}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-none"
    />
    <p className="text-[10px] text-slate-500 mt-1">
     O link {selected.filter((s) => s.id).length > 1 ? "de cada formulário é anexado" : "do formulário é anexado"} automaticamente no final da mensagem.
    </p>
   </div>
  </div>
 );
}




/**
 * Texto do bloco "Enviar mensagem": formato reduzido por padrão (sem barrinha
 * lateral) e botão "Ver mais" que expande a mensagem inteira de uma vez.
 */
function MensagemTextoEditor({
  value,
  scope,
  onChange,
}: {
  value: string;
  scope?: SalesbotEscopo;
  onChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const linhas = value ? value.split("\n").length : 0;
  const longo = linhas > 3 || value.length > 180;
  const rows = expanded ? Math.min(24, Math.max(8, linhas + 1)) : 3;

  return (
    <div className="space-y-1" data-canvas-no-zoom>
      <VariableTextarea
        value={value}
        onChange={onChange}
        mentions={scope === "grupo"}
        placeholder={scope === "grupo" ? "Digite a mensagem... use @ para marcar (@todos, @admins, @bem-vindo) e ( para puxar um campo" : "Digite a mensagem..."}
        rows={rows}
        className={`w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs resize-none ${
          expanded ? "overflow-y-auto" : "overflow-hidden"
        }`}
      />
      {longo && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-sky-400 hover:text-sky-300"
        >
          {expanded ? "Ver menos" : `Ver mais (${linhas} linhas)`}
        </button>
      )}
    </div>
  );
}

/* ============ Editor: Vincular produto ============ */
function VincularProdutoEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
 const listFn = useServerFn(listProductCatalogs);
 const q = useQuery({
  queryKey: ["salesbot-product-catalogs"],
  queryFn: () => listFn(),
  staleTime: 60_000,
 });

 const catalogs = (q.data ?? []) as DbCatalog[];
 const allProducts = catalogs.flatMap(c => c.products);

 return (
  <div className="space-y-2">
   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Produto</label>
    <select
     value={block.productId ?? ""}
     onChange={(e) => {
      const p = allProducts.find((x) => x.id === e.target.value);
      onChange({
       productId: p?.id,
       productNome: p?.name,
       acaoConfig: p ? `${p.name} (${block.productKind ?? "interesse"})` : undefined,
      });
     }}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="">
      {q.isLoading ? "Carregando…" : allProducts.length === 0 ? "Nenhum produto cadastrado" : "Selecione o produto…"}
     </option>
     {catalogs.map(cat => (
      <optgroup key={cat.id} label={cat.name}>
       {cat.products.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
       ))}
      </optgroup>
     ))}
    </select>
   </div>

   <div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400">Tipo de vínculo</label>
    <select
     value={block.productKind ?? "interesse"}
     onChange={(e) => {
      const kind = e.target.value as "interesse" | "comprou";
      onChange({
       productKind: kind,
       acaoConfig: block.productNome ? `${block.productNome} (${kind})` : undefined,
      });
     }}
     className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
    >
     <option value="interesse">Interesse</option>
     <option value="comprou">Comprou</option>
    </select>
   </div>

   <p className="text-[10px] text-slate-500 leading-snug">
    O lead será vinculado ao produto selecionado com o status escolhido. Se o vínculo já existir, ele será atualizado.
   </p>
  </div>
 );
}
