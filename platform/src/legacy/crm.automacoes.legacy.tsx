// SLIM_BOT_METRICS_V1
import {useSlimAutomationMetrics,slimBotMetric} from "@/hooks/use-slim-automation-metrics";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeLazy as lazy } from "@/lib/safe-lazy";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Upload, Download, Copy, Trash2, X, Search, Zap, Settings2, Pencil, ChevronDown, ChevronRight, Instagram, Facebook, MessageCircle, Sparkles, Users, UserPlus, UserMinus, ShieldCheck, Clock, AtSign, Link2, AlertTriangle, Image as ImageIcon, Linkedin, Music2, BarChart3, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { DuplicateNameDialog } from "@/components/automations/DuplicateNameDialog";
import { toast } from "sonner";


import {
 saveSalesbots,
 newId,
 GATILHO_CATALOG,
 GATILHO_AREA_LABEL,
 describeGatilho,
 isGatilhoConfigured,
 isGatilhoEmBreve,
 BLOCK_CATALOG,
 type Salesbot,
 type Gatilho,
 type GatilhoKind,
 type GatilhoArea,
} from "@/lib/salesbot-types";
import { syncSalesbotFromLocal, listSalesbotsFull, getSalesbotGraph, setSalesbotActive, deleteSalesbotByLocalId } from "@/lib/salesbots.functions";
import { clearSalesbotSync, enqueueSalesbotSync, waitForSalesbotSync } from "@/lib/salesbot-sync-queue";
import { useAllFunnels } from "@/hooks/use-all-funnels";
import { useWorkspaceChannels } from "@/hooks/use-workspace-channels";
import { useQuery } from "@tanstack/react-query";
import { listForms, type FormRecord } from "@/lib/forms.functions";
import { listTrackingSites } from "@/lib/tracking.functions";
import { listDistinctEventNames } from "@/lib/tracking-live.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";
import { listLeadCustomFields } from "@/lib/leads.functions";
import { toPortableBot, remapPortableRefs } from "@/lib/salesbot-portability";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { getMktonBootstrapState, provisionMktonFull } from "@/lib/mkton-full-provision.functions";
import { provisionMktonLeadEntry } from "@/lib/mkton-admin-provision.functions";

const SalesbotBuilder = lazy(() =>
 import("@/components/automations/SalesbotBuilder").then((m) => ({ default: m.SalesbotBuilder })),
);
const SalesbotTemplatePicker = lazy(() =>
 import("@/components/automations/SalesbotTemplatePicker").then((m) => ({ default: m.SalesbotTemplatePicker })),
);
const CentralDeGrupos = lazy(() =>
 import("@/components/automations/CentralDeGrupos").then((m) => ({ default: m.CentralDeGrupos })),
);
const ConversationAgentsPanel = lazy(() =>
 import("@/components/automations/ConversationAgentsPanel").then((m) => ({ default: m.ConversationAgentsPanel })),
);
const ConsolidatedReportsTab = lazy(() =>
 import("@/components/automations/ConsolidatedReportsTab").then((m) => ({ default: m.ConsolidatedReportsTab })),
);

export const Route = createFileRoute("/crm/automacoes")({
 head: () => ({
  meta: [
   { title: "Automações · CRM · Vanessa Simoni" },
   { name: "description", content: "Sales bots e automações do CRM Vanessa Simoni." },
  ],
 }),
 component: AutomacoesPage,
 errorComponent: AutomacoesRouteError,
 notFoundComponent: AutomacoesNotFound,
});

function AutomacoesRouteError({ error, reset }: { error: Error; reset: () => void }) {
 const router = useRouter();
 return (
  <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
   <AppSidebar />
   <main className="flex-1 overflow-y-auto bg-background p-6">
    <div className="max-w-2xl rounded-lg border border-destructive/30 bg-card p-5 text-sm">
     <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
       <h1 className="text-base font-semibold text-card-foreground">Automações não carregaram</h1>
       <p className="mt-1 text-muted-foreground">A página encontrou um erro interno, mas não vai mais derrubar o sistema inteiro.</p>
       <p className="mt-2 break-words text-xs text-muted-foreground">{error.message}</p>
       <div className="mt-4 flex flex-wrap gap-2">
        <button
         type="button"
         onClick={() => {
          router.invalidate();
          reset();
         }}
         className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
         Tentar novamente
        </button>
        <Link
         to="/painel"
         className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
         Ir para Dashboard
        </Link>
       </div>
      </div>
     </div>
    </div>
   </main>
  </div>
 );
}

function AutomacoesNotFound() {
 return (
  <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
   <AppSidebar />
   <main className="flex-1 overflow-y-auto bg-background p-6">
    <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">Aba de automações não encontrada.</div>
   </main>
  </div>
 );
}

function AutomacoesPage() {
 const liveBotMetrics=useSlimAutomationMetrics(null,false);
 const [bots, setBots] = useState<Salesbot[]>([]);
 const [openBuilder, setOpenBuilder] = useState(false);
 const [editId, setEditId] = useState<string | null>(null);
 const [autoCreate, setAutoCreate] = useState(false);
 const [builderScope, setBuilderScope] = useState<"individual" | "grupo">("individual");
 const [search, setSearch] = useState("");
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [gatilhoFor, setGatilhoFor] = useState<{ botId: string; editing?: Gatilho } | null>(null);
 const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
 const [activeView, setActiveView] = useState<"bots" | "agentes" | "grupos" | "relatorios">("bots");
 

 const fetchRemoteBots = useServerFn(listSalesbotsFull);
 const { isSuperAdmin, loaded: roleLoaded } = useIsSuperAdmin();
 const getMktonStateFn = useServerFn(getMktonBootstrapState);
 const repairLeadEntryFn = useServerFn(provisionMktonLeadEntry);
 const repairFullFn = useServerFn(provisionMktonFull);
 const [mktonRepair, setMktonRepair] = useState<{ running: boolean; message: string; error?: boolean }>({ running: false, message: "" });

 async function refreshRemoteBots() {
  const res = (await fetchRemoteBots()) as unknown as { bots: Salesbot[] };
  if (!Array.isArray(res?.bots)) return;
  const remote = [...res.bots].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  saveSalesbots(remote);
  setBots(remote);
 }

 async function repairMktonMaterialization() {
  setMktonRepair({ running: true, message: "Auditando configuração Vanessa Simoni…" });
  try {
   const before = await getMktonStateFn();
   if (!before.allowed) throw new Error(`Bootstrap bloqueado: ${before.reason ?? "sem permissão"} · workspace ${before.workspace?.slug ?? "desconhecido"}`);
   if (!before.leadEntryReady) await repairLeadEntryFn();
   if (!before.fullOperationReady || !before.productsReady) await repairFullFn();
   const after = await getMktonStateFn();
   await refreshRemoteBots();
   const lead = after.completeness?.leadEntry;
   const full = after.completeness?.fullOperation;
   const ready = after.leadEntryReady && after.fullOperationReady && after.productsReady;
   const message = ready ? `Configuração materializada: ${(lead?.foundBots ?? 0) + (full?.foundBots ?? 0)} bots, ${(lead?.foundAgents ?? 0) + (full?.foundAgents ?? 0)} agentes e ${full?.foundBriefings ?? 0} formulários.` : `Configuração incompleta: entrada ${lead?.foundBots ?? 0}/${lead?.expectedBots ?? 4} bots; operação ${full?.foundBots ?? 0}/${full?.expectedBots ?? 24} bots; formulários ${full?.foundBriefings ?? 0}/${full?.expectedBriefings ?? 10}.`;
   setMktonRepair({ running: false, message, error: !ready });
   if (ready) toast.success(message); else toast.warning(message, { duration: 10000 });
  } catch (err) {
   const message = err instanceof Error ? err.message : String(err);
   setMktonRepair({ running: false, message: `Falha ao materializar Vanessa Simoni: ${message}`, error: true });
   toast.error(`Falha ao materializar Vanessa Simoni: ${message}`, { duration: 15000 });
  }
 }

 useEffect(() => {
  if (!roleLoaded || !isSuperAdmin) return;
  void repairMktonMaterialization();
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [roleLoaded, isSuperAdmin]);

 // Alvos usados para religar o bot importado ao workspace atual.
 const importFunnelsQ = useAllFunnels();
 const listFieldsFn = useServerFn(listLeadCustomFields);
 const importFieldsQ = useQuery({
  queryKey: ["salesbot-import-fields"],
  queryFn: async () => (await listFieldsFn()) as unknown as { fields: Array<{ id: string; name: string }> },
  staleTime: 5 * 60_000,
 });
 const listFormsFn = useServerFn(listForms);
 const importFormsQ = useQuery<FormRecord[]>({
  queryKey: ["forms-list"],
  queryFn: async () => (await listFormsFn()) as unknown as FormRecord[],
  staleTime: 5 * 60_000,
 });

 useEffect(() => {
  setBots([]);
  let cancelled = false;
  (async () => {
   try {
    const res = (await fetchRemoteBots()) as unknown as { bots: Salesbot[] };
    if (cancelled || !Array.isArray(res?.bots)) return;
    const remote = [...res.bots].sort(
      (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
    saveSalesbots(remote);
    setBots(remote);
   } catch {
    if (!cancelled) toast.error("Não foi possível carregar os SalesBots desta conta.");
   }
  })();
  return () => { cancelled = true; };
 }, [openBuilder, fetchRemoteBots]);

 // Auto-abre construtor no modo grupo quando chamado da Central de Grupos.
 useEffect(() => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const botParam = params.get("bot");
  if (botParam) {
   setEditId(botParam);
   setOpenBuilder(true);
   const url = new URL(window.location.href);
   url.searchParams.delete("bot");
   window.history.replaceState({}, "", url.toString());
   return;
  }
  if (params.get("novo") === "1" && params.get("escopo") !== "grupo") {
   setBuilderScope("individual");
   setEditId(null);
   setTemplatePickerOpen(true);
   const url = new URL(window.location.href);
   url.searchParams.delete("novo");
   window.history.replaceState({}, "", url.toString());
   return;
  }
  if (params.get("escopo") === "grupo" && params.get("novo") === "1") {
   setBuilderScope("grupo");
   setEditId(null);
   setTemplatePickerOpen(true);
   // limpa a query pra não reabrir em navegações internas
   const url = new URL(window.location.href);
   url.searchParams.delete("escopo");
   url.searchParams.delete("novo");
   window.history.replaceState({}, "", url.toString());
  }
 }, []);

 const syncFn = useServerFn(syncSalesbotFromLocal);
 const getBotGraphFn = useServerFn(getSalesbotGraph);
 const setBotActiveFn = useServerFn(setSalesbotActive);
 const deleteBotFn = useServerFn(deleteSalesbotByLocalId);

 async function loadCompleteForMutation(localId: string) {
  const loaded = (await getBotGraphFn({ data: { localId } } as never)) as unknown as {
   bot: Salesbot;
   revision: number;
   blockCount: number;
   baseBlockLocalIds: string[];
   complete: boolean;
  };
  if (
   loaded?.complete !== true
   || !loaded?.bot
   || !Number.isFinite(Number(loaded.revision))
   || !Array.isArray(loaded.baseBlockLocalIds)
   || loaded.baseBlockLocalIds.length !== Number(loaded.blockCount)
  ) {
   throw new Error("salesbot_incomplete_read");
  }
  return loaded;
 }

  const botName = (bot: Pick<Salesbot, "nome">) =>
   typeof bot.nome === "string" && bot.nome.trim() ? bot.nome : "Bot sem nome";

 // Renomear direto na lista, sem precisar abrir o bot.
 const [renamingId, setRenamingId] = useState<string | null>(null);
 const [renameValue, setRenameValue] = useState("");
 // Bot alvo do diálogo "Duplicar" (escolha do nome da cópia).
 const [dupTarget, setDupTarget] = useState<Salesbot | null>(null);

 async function commitRename(id: string) {
  const nome = renameValue.trim();
  setRenamingId(null);
  const target = bots.find((b) => b.id === id);
  if (!target || !nome || nome === botName(target)) return;
  const next = bots.map((b) => (b.id === id ? { ...b, nome, updatedAt: new Date().toISOString() } : b));
  try {
   await persist(next, [id]);
   toast.success("Nome atualizado.");
  } catch {
   setBots(bots);
   saveSalesbots(bots);
   toast.error("Não foi possível renomear o bot. Tente de novo.");
  }
 }


  function persist(next: Salesbot[], syncIds?: string[]) {
   setBots(next);
   saveSalesbots(next);
   return syncBots(next, syncIds);
  }

  async function toggleActive(id: string) {
   const target = bots.find((b) => b.id === id);
   if (!target) return;
   const nextActive = !(target.isActive ?? false);
   try {
    await waitForSalesbotSync(id);
    let revision = Number((target as Salesbot & { revision?: number }).revision);
    if (!Number.isFinite(revision) || revision <= 0) {
     const loaded = await loadCompleteForMutation(id);
     revision = Number(loaded.revision);
    }
    const result = (await setBotActiveFn({ data: {
     localId: id,
     expectedRevision: revision,
     isActive: nextActive,
    } } as never)) as unknown as { revision: number; isActive: boolean };
    const next = bots.map((b) => b.id === id
     ? { ...b, isActive: result.isActive, revision: Number(result.revision) } as Salesbot
     : b);
    setBots(next);
    saveSalesbots(next);
    toast.success(nextActive ? "Bot ativado!" : "Bot desativado.");
   } catch {
    toast.error("Falha ao alterar estado do bot. Recarregue a lista e tente novamente.");
   }
  }

 /** Envia bots ao banco sem jamais tratar metadata da lista como grafo completo. */
 function syncBots(next: Salesbot[], syncIds?: string[]) {
  const wanted = syncIds ? new Set(syncIds) : new Set(next.map((b) => b.id));
  const jobs = next.filter((x) => wanted.has(x.id)).map((b) =>
   enqueueSalesbotSync(b.id, async () => {
    const knownRevision = Number((b as Salesbot & { revision?: number }).revision);
    if (Number.isFinite(knownRevision) && knownRevision > 0) {
     const loaded = await loadCompleteForMutation(b.id);
     const full = loaded.bot;
     return syncFn({ data: { bot: {
      id: b.id,
      nome: botName(b),
      escopo: b.escopo ?? full.escopo ?? "individual",
      startBlockId: full.startBlockId ?? null,
      gatilhos: (b.gatilhos ?? full.gatilhos ?? []) as unknown[],
      maxInteracoes: b.maxInteracoes ?? full.maxInteracoes,
      startPosition: full.startPosition,
      blocks: (full.blocks ?? []) as unknown[],
     },
     expectedRevision: loaded.revision,
     baseBlockLocalIds: loaded.baseBlockLocalIds,
     source: "automation-central",
    } } as never);
    }
    return syncFn({ data: { bot: {
     id: b.id,
     nome: botName(b),
     escopo: b.escopo ?? "individual",
     startBlockId: b.startBlockId ?? null,
     gatilhos: (b.gatilhos ?? []) as unknown[],
     maxInteracoes: b.maxInteracoes,
     startPosition: b.startPosition,
     blocks: (b.blocks ?? []) as unknown[],
    },
    expectedRevision: null,
    baseBlockLocalIds: [],
    source: "automation-central-create",
   } } as never);
   }),
  );
  return Promise.all(jobs);
 }

 /** Exclui de verdade: apaga no banco antes de remover da tela/cache. */
 async function removeBots(ids: string[]) {
  const before = bots;
  const next = bots.filter((b) => !ids.includes(b.id));
  setBots(next);
  saveSalesbots(next);
  try {
   for (const id of ids) {
     // Um salvamento antigo que termine depois do DELETE recriaria o bot.
     // Aguarda a fila desse bot e só então confirma a exclusão definitiva.
     await waitForSalesbotSync(id);
    const target = before.find((b) => b.id === id);
    let revision = Number((target as (Salesbot & { revision?: number }) | undefined)?.revision);
    if (!Number.isFinite(revision) || revision <= 0) {
     const loaded = await loadCompleteForMutation(id);
     revision = Number(loaded.revision);
    }
    await deleteBotFn({ data: { localId: id, expectedRevision: revision } } as never);
     clearSalesbotSync(id);
   }
  } catch {
   setBots(before);
   saveSalesbots(before);
   toast.error("Não foi possível excluir o SalesBot. Tente de novo.");
  }
 }


 // Aba "Bots" mostra apenas bots 1-a-1. Bots de grupo aparecem na Central de Grupos.
 const filtered = useMemo(
   () => bots
    .filter((b) => (b.escopo ?? "individual") !== "grupo")
    .filter((b) => botName(b).toLowerCase().includes(search.toLowerCase())),
  [bots, search],
 );


 function openNew() {
  setBuilderScope("individual");
  setTemplatePickerOpen(true);
 }

 function startBlankBot() {
  setTemplatePickerOpen(false);
  setEditId(null);
  setAutoCreate(true);
  setOpenBuilder(true);
 }

 function startFromTemplate(bot: Salesbot) {
  const next = [bot, ...bots];
  void persist(next, [bot.id]).catch(() => toast.error("Não foi possível salvar o SalesBot na sua conta. Tente de novo."));
  setTemplatePickerOpen(false);
  setEditId(bot.id);
  setAutoCreate(false);
  setOpenBuilder(true);
 }

 function openEdit(id: string) {
  const bot = bots.find((b) => b.id === id);
  setBuilderScope((bot?.escopo ?? "individual") === "grupo" ? "grupo" : "individual");
  setEditId(id);
  setAutoCreate(false);
  setOpenBuilder(true);
 }

 function importBots(file: File) {
  const reader = new FileReader();
  reader.onload = async () => {
   try {
    const parsed = JSON.parse(String(reader.result));
    const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const validKinds = new Set(BLOCK_CATALOG.map((c) => c.kind as string));
    const pendencias: string[] = [];

    const normalized: Salesbot[] = arr
     .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
     .map((raw) => {
      const b = raw as Record<string, unknown>;
      const rawBlocks: unknown[] = Array.isArray(b.blocks) ? (b.blocks as unknown[]) : [];

      // Regenera IDs de blocos e remapeia nextBlockId + refs em roleta/pausas.
      const idMap = new Map<string, string>();
      const cleanBlocks = rawBlocks
       .filter((bl): bl is Record<string, unknown> => !!bl && typeof bl === "object")
       .filter((bl) => typeof bl.kind === "string" && validKinds.has(bl.kind as string));

      for (const bl of cleanBlocks) {
       const oldId = typeof bl.id === "string" ? bl.id : "";
       idMap.set(oldId, newId("blk"));
      }

      const remap = (v: unknown): string | undefined => {
       if (typeof v !== "string") return undefined;
       return idMap.get(v) ?? undefined;
      };
      const remapBranches = (v: unknown) =>
       Array.isArray(v)
        ? v.map((item) =>
           item && typeof item === "object"
            ? { ...(item as Record<string, unknown>), nextBlockId: remap((item as Record<string, unknown>).nextBlockId) }
            : item,
          )
        : v;

      const blocks = cleanBlocks.map((bl) => {
       const next: Record<string, unknown> = { ...bl };
       next.id = idMap.get(typeof bl.id === "string" ? bl.id : "")!;
       next.nextBlockId = remap(bl.nextBlockId);
       if ("falseNextBlockId" in next) next.falseNextBlockId = remap(next.falseNextBlockId);
       if ("roleta" in next) next.roleta = remapBranches(next.roleta);
       if ("pausas" in next) next.pausas = remapBranches(next.pausas);
       if ("condicoes" in next) next.condicoes = remapBranches(next.condicoes);
       if ("validacaoRegras" in next) next.validacaoRegras = remapBranches(next.validacaoRegras);
       return next;
      });

      const startId = typeof b.startBlockId === "string" ? idMap.get(b.startBlockId) : undefined;

      // Religa nomes (etapa, campo personalizado, formulário, agente IA) aos IDs deste workspace.
      const { bot: reconnected, unresolved } = remapPortableRefs(
       { ...(b as Record<string, unknown>), blocks, gatilhos: Array.isArray(b.gatilhos) ? b.gatilhos : [] },
       {
        funnels: importFunnelsQ.data ?? [],
        customFields: importFieldsQ.data?.fields ?? [],
        forms: importFormsQ.data ?? [],
       },
      );
      pendencias.push(...unresolved);

      const { _mktonExport: _meta, ...clean } = reconnected as Record<string, unknown>;

      return {
       ...clean,
       id: newId("bot"),
       updatedAt: new Date().toISOString(),
       startBlockId: startId,
       gatilhos: (reconnected.gatilhos as unknown[]).map((g) => ({
        ...(g as Record<string, unknown>),
        id: newId("gat"),
        ativo: false,
       })),
       totalLancado: 0,
       sessoesAtivas: 0,
       conversao: 0,
       nome: typeof b.nome === "string" && b.nome ? `${b.nome} (importado)` : "Bot importado",
      } as unknown as Salesbot;
     });

    if (normalized.length === 0) {
     alert("Nenhum bot válido foi encontrado no arquivo.");
     return;
    }
    const merged = [...normalized, ...bots];
    setBots(merged);
    saveSalesbots(merged);
    const t = toast.loading("Importando bot…");
    try {
     await syncBots(merged, normalized.map((b) => b.id));
     const res = (await fetchRemoteBots()) as unknown as { bots: Salesbot[] };
     if (Array.isArray(res?.bots)) {
      const remote = [...res.bots].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      saveSalesbots(remote);
      setBots(remote);
     }
     toast.success("Bot importado e salvo na sua conta.", { id: t });
     if (pendencias.length > 0) {
      toast.warning(
       `Revise no bot: ${[...new Set(pendencias)].slice(0, 4).join(", ")}${pendencias.length > 4 ? "…" : ""}`,
       { duration: 8000 },
      );
     }
    } catch {
     setBots(bots);
     saveSalesbots(bots);
     toast.error("Não foi possível salvar o bot importado. Tente de novo.", { id: t });
    }
   } catch (err) {
    console.error("[import bots]", err);
    alert("JSON inválido ou incompatível.");
   }
  };
  reader.onerror = () => alert("Não foi possível ler o arquivo.");
  reader.readAsText(file);
 }


 async function exportBot(bot: Salesbot) {
  // A lista contém somente metadata; exportação precisa do grafo completo.
  const loaded = await loadCompleteForMutation(bot.id);
  const source = loaded.bot;
  // Mantém só a definição portátil: remove métricas e IDs do workspace de origem,
  // preservando os nomes para religar na importação em qualquer conta.
  const payload = toPortableBot(source as unknown as Record<string, unknown>);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = botName(source).replace(/[^a-z0-9\-_]+/gi, "_").toLowerCase();
  a.href = url;
  a.download = `${safeName}.saude-slimbot.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
 }

 /** Duplica um bot inteiro (blocos + ligações + gatilhos desligados) com o nome escolhido. */
 async function duplicateBot(bot: Salesbot, nome: string) {
  // A lista carrega somente metadata; duplicação precisa buscar o grafo completo
  // do bot escolhido antes de clonar qualquer bloco.
  const loaded = await loadCompleteForMutation(bot.id);
  const source = loaded.bot;
  const rawBlocks = (source.blocks ?? []) as unknown as Record<string, unknown>[];
  const idMap = new Map<string, string>();
  for (const bl of rawBlocks) idMap.set(String(bl.id ?? ""), newId("blk"));
  const remap = (v: unknown) => (typeof v === "string" ? idMap.get(v) : undefined);
  const remapBranches = (v: unknown) =>
   Array.isArray(v)
    ? v.map((item) =>
       item && typeof item === "object"
        ? { ...(item as Record<string, unknown>), nextBlockId: remap((item as Record<string, unknown>).nextBlockId) }
        : item,
      )
    : v;
  const blocks = rawBlocks.map((bl) => {
   const next: Record<string, unknown> = { ...bl };
   next.id = idMap.get(String(bl.id ?? ""));
   next.nextBlockId = remap(bl.nextBlockId);
   if ("falseNextBlockId" in next) next.falseNextBlockId = remap(next.falseNextBlockId);
   if ("roleta" in next) next.roleta = remapBranches(next.roleta);
   if ("pausas" in next) next.pausas = remapBranches(next.pausas);
   if ("condicoes" in next) next.condicoes = remapBranches(next.condicoes);
   if ("validacaoRegras" in next) next.validacaoRegras = remapBranches(next.validacaoRegras);
   return next;
  });

  const copia = {
   ...source,
   id: newId("bot"),
   nome: nome.slice(0, 80),
   blocks,
   startBlockId: source.startBlockId ? idMap.get(source.startBlockId) : undefined,
   isActive: false, // Força desligado na duplicação para revisão
   // Gatilhos nascem desligados para o usuário revisar antes de ativar.
   gatilhos: (source.gatilhos ?? []).map((g) => ({ ...g, id: newId("gat"), ativo: false })),
   totalLancado: 0,
   sessoesAtivas: 0,
   conversao: 0,
   updatedAt: new Date().toISOString(),
  } as unknown as Salesbot;

  const t = toast.loading("Duplicando bot…");
  try {
   await persist([copia, ...bots], [copia.id]);
   toast.success("Bot duplicado.", { id: t });
  } catch {
   setBots(bots);
   saveSalesbots(bots);
   toast.error("Não foi possível duplicar o bot. Tente de novo.", { id: t });
  }
 }


 function toggleSel(id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSelected(next);
 }

 function deleteSelected() {
  if (!selected.size) return;
  if (!confirm(`Excluir ${selected.size} bot(s)?`)) return;
  void removeBots([...selected]);
  setSelected(new Set());
 }

 function updateGatilhos(botId: string, gatilhos: Gatilho[]) {
  void persist(bots.map((b) => (b.id === botId ? { ...b, gatilhos } : b)), [botId]).catch(() => toast.error("Não foi possível salvar o SalesBot na sua conta. Tente de novo."));
 }

 function upsertGatilho(botId: string, g: Gatilho) {
  const bot = bots.find((b) => b.id === botId);
  const list = bot?.gatilhos ?? [];
  const exists = list.some((x) => x.id === g.id);
  const next = exists ? list.map((x) => (x.id === g.id ? g : x)) : [...list, g];
  updateGatilhos(botId, next);
 }

 function removeGatilho(botId: string, gid: string) {
  const bot = bots.find((b) => b.id === botId);
  updateGatilhos(botId, (bot?.gatilhos ?? []).filter((x) => x.id !== gid));
 }

 return (
  <div data-automation-page className="flex h-screen w-full bg-background text-foreground overflow-hidden">
   <AppSidebar />
   <main className="flex-1 overflow-y-auto bg-background">
      <header className="min-h-14 border-b border-border flex flex-wrap items-center justify-between gap-2 pl-14 pr-3 md:px-5 py-2 sticky top-0 bg-background/95 backdrop-blur z-10">
       <div className="flex items-center gap-4">
        <h1 className="text-sm font-bold uppercase tracking-widest text-foreground">Central de Automações</h1>
        {isSuperAdmin && (
         <div className="flex items-center gap-2">
          {mktonRepair.message && <span className={`hidden xl:inline text-[10px] ${mktonRepair.error ? "text-destructive" : "text-muted-foreground"}`}>{mktonRepair.message}</span>}
          <button type="button" onClick={() => void repairMktonMaterialization()} disabled={mktonRepair.running} className="rounded-md border border-border px-2.5 py-1.5 text-[10px] font-semibold hover:bg-muted disabled:opacity-50">{mktonRepair.running ? "Materializando…" : "Reparar configuração Vanessa Simoni"}</button>
         </div>
        )}
        <div className="h-4 w-px bg-border hidden md:block" />
        <div className="flex items-center gap-1 overflow-x-auto max-w-full scrollbar-hidden">
         <button
          onClick={() => setActiveView("bots")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${
           activeView === "bots"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
          }`}
         >
          SalesBots
          </button>
         <button
          onClick={() => setActiveView("agentes")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors inline-flex items-center gap-1.5 ${
           activeView === "agentes"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
          }`}
          title="Agentes IA que atendem o cliente 1-a-1 no chat (diferente do Agente IA do CRM, que só executa comandos internos)"
         >
          <Sparkles className="w-3.5 h-3.5" /> Agentes IA
         </button>
         <button
          onClick={() => setActiveView("grupos")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors inline-flex items-center gap-1.5 ${
           activeView === "grupos"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
          }`}
         >
          <Users className="w-3.5 h-3.5" /> Grupos
         </button>
          <button
           onClick={() => setActiveView("relatorios")}
           className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors inline-flex items-center gap-1.5 ${
            activeView === "relatorios"
             ? "bg-primary text-primary-foreground"
             : "text-muted-foreground hover:text-foreground"
           }`}
          >
           <BarChart3 className="w-3.5 h-3.5" /> Relatórios
          </button>
        </div>
       </div>
       <div className="flex items-center gap-2">
         {activeView === "bots" && selected.size > 0 && (
          <button
           onClick={deleteSelected}
           className="inline-flex items-center gap-1.5 text-xs text-destructive hover:opacity-80 px-3 py-1.5 border border-destructive/30 rounded"
          >
           <Trash2 className="w-3.5 h-3.5" /> Excluir ({selected.size})
          </button>
         )}
         {activeView === "bots" && (
          <>
           <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold uppercase tracking-wider text-foreground hover:text-primary px-3 py-1.5 border border-border rounded bg-card">
            <Upload className="w-3.5 h-3.5" /> Importar
            <input
             type="file"
             accept="application/json"
             className="hidden"
             onChange={(e) => e.target.files?.[0] && importBots(e.target.files[0])}
            />
           </label>
           <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground px-3 py-1.5 bg-primary hover:opacity-90 rounded"
           >
            <Plus className="w-3.5 h-3.5" /> Criar bot
           </button>
          </>
         )}
        </div>
      </header>

     <div className="p-5">
      {activeView === "bots" ? (
       <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
         <div className="px-5 py-4 border-b border-border flex flex-wrap items-start justify-between gap-4">
          <div>
           <h1 className="text-base font-semibold text-card-foreground">Listagem de Salesbots</h1>
           <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
             Gerencie seus bots sem código. Clique para editar fluxos, gatilhos e integrações. Métricas de todo o histórico, atualizadas a cada 10 segundos.
           </p>
          </div>
         <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
           value={search}
           onChange={(e) => setSearch(e.target.value)}
           placeholder="Buscar bot..."
           className="bg-background border border-border rounded pl-7 pr-2 py-1.5 text-xs text-foreground w-56"
          />
         </div>
        </div>

        {liveBotMetrics.error && <p role="alert" className="px-5 py-3 text-xs text-destructive">Métricas indisponíveis. Os valores não foram substituídos por zeros.</p>}
        <div className="overflow-x-auto">
         <table className="w-full text-sm">
          <thead>
           <tr className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-border">
            <th className="px-4 py-2.5 w-8">
             <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((b) => selected.has(b.id))}
              onChange={(e) =>
               setSelected(e.target.checked ? new Set(filtered.map((b) => b.id)) : new Set())
              }
             />
             </th>
             <th className="px-2 py-2.5 w-12 text-center">Ativo</th>
             <th className="px-2 py-2.5 text-left">Nome</th>
            <th className="px-2 py-2.5 text-left">Gatilhos</th>
            <th className="px-2 py-2.5 text-right">Taxa de conversão</th>
            <th className="px-2 py-2.5 text-right">Total lançado</th>
            <th className="px-4 py-2.5 text-right">Sessões ativas</th>
           </tr>
          </thead>
          <tbody>
           {filtered.length === 0 && (
            <tr>
             <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum bot criado ainda. Clique em{" "}
              <button onClick={openNew} className="text-primary hover:underline">
               Criar bot
              </button>{" "}
              para começar.
             </td>
            </tr>
           )}
           {filtered.map((b) => (
            <tr key={b.id} className="group border-b border-border hover:bg-muted/50 transition-colors">
             <td className="px-4 py-2.5">
              <input
               type="checkbox"
               checked={selected.has(b.id)}
               onChange={() => toggleSel(b.id)}
              />
              </td>
              <td className="px-2 py-2.5">
               <div className="flex justify-center">
                <Switch 
                  checked={b.isActive ?? false} 
                  onCheckedChange={() => toggleActive(b.id)}
                  className="scale-75"
                />
               </div>
              </td>
               <td className="px-2 py-2.5">
               <div className="inline-flex items-center gap-1.5">
                {renamingId === b.id ? (
                 <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(b.id)}
                  onKeyDown={(e) => {
                   if (e.key === "Enter") { e.preventDefault(); void commitRename(b.id); }
                   if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
                  }}
                  maxLength={80}
                  className="bg-background border border-primary rounded px-2 py-1 text-xs font-semibold text-foreground w-56"
                 />
                ) : (
                 <>
                  <button
                   onClick={() => { setRenamingId(b.id); setRenameValue(botName(b)); }}
                   className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5"
                   title="Renomear bot"
                  >
                   <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                   onClick={() => openEdit(b.id)}
                   className="text-xs font-semibold uppercase tracking-wider text-primary hover:opacity-80"
                  >
                   {botName(b)}
                  </button>
                 </>
                )}

                <button
                 onClick={() => { void exportBot(b).catch(() => toast.error("Não foi possível exportar o bot.")); }}
                 className="text-muted-foreground hover:text-primary"
                 title="Exportar bot"
                >
                 <Download className="w-3.5 h-3.5" />
                </button>
                <button
                 onClick={() => setDupTarget(b)}
                 className="text-muted-foreground hover:text-primary"
                 title="Duplicar bot"
                >
                 <Copy className="w-3.5 h-3.5" />
                </button>
               </div>
              </td>
             <td className="px-2 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
               {(b.gatilhos ?? []).map((g) => {
                const configured = isGatilhoConfigured(g);
                return (
                 <span
                  key={g.id}
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                   configured
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-warning/10 text-warning border-warning/30"
                  }`}
                 >
                  <Zap className="w-3 h-3" />
                  <span title={describeGatilho(g)}>{describeGatilho(g)}</span>
                  <button
                   onClick={() => setGatilhoFor({ botId: b.id, editing: g })}
                   className="hover:text-foreground ml-0.5"
                   title="Configurar"
                  >
                   <Settings2 className="w-3 h-3" />
                  </button>
                  <button
                   onClick={() => removeGatilho(b.id, g.id)}
                   className="hover:text-destructive ml-0.5"
                   title="Remover"
                  >
                   <X className="w-3 h-3" />
                  </button>
                 </span>
                );
               })}
               <button
                onClick={() => setGatilhoFor({ botId: b.id })}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary px-2 py-0.5 rounded"
               >
                <Plus className="w-3 h-3" /> Gatilho
               </button>
              </div>
             </td>
             <td className="px-2 py-2.5 text-right text-xs text-foreground tabular-nums">
              {slimBotMetric(liveBotMetrics.data,b.id,"conversionRate",liveBotMetrics.error)}
             </td>
             <td className="px-2 py-2.5 text-right text-xs text-foreground tabular-nums">
              {slimBotMetric(liveBotMetrics.data,b.id,"launched",liveBotMetrics.error)}
             </td>
             <td className="px-4 py-2.5 text-right text-xs text-foreground tabular-nums">
              {slimBotMetric(liveBotMetrics.data,b.id,"activeNow",liveBotMetrics.error)}
             </td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       </div>
      ) : activeView === "agentes" ? (
       <AutomationChunkBoundary>
        <Suspense fallback={<AutomationOverlayLoader label="Carregando agentes IA…" />}>
         <ConversationAgentsPanel />
        </Suspense>
       </AutomationChunkBoundary>
       ) : activeView === "grupos" ? (
        <AutomationChunkBoundary>
         <Suspense fallback={<AutomationOverlayLoader label="Carregando grupos…" />}>
          <CentralDeGrupos />
         </Suspense>
        </AutomationChunkBoundary>
       ) : (
        <AutomationChunkBoundary>
         <Suspense fallback={<AutomationOverlayLoader label="Carregando relatórios…" />}>
          <ConsolidatedReportsTab />
         </Suspense>
        </AutomationChunkBoundary>
       )}
    </div>
   </main>


    <AutomationChunkBoundary>
     <Suspense fallback={openBuilder ? <AutomationOverlayLoader label="Abrindo editor…" /> : null}>
       {openBuilder && (
        <SalesbotBuilder
         open={openBuilder}
         onClose={() => {
          setOpenBuilder(false);
          setEditId(null);
          setAutoCreate(false);
          setBuilderScope("individual");
         }}
         initialBotId={editId}
         autoCreate={autoCreate}
         escopo={builderScope}
        />
       )}
      </Suspense>
     </AutomationChunkBoundary>

     <AutomationChunkBoundary>
      <Suspense fallback={templatePickerOpen ? <AutomationOverlayLoader label="Carregando modelos…" /> : null}>
       {templatePickerOpen && (
         <SalesbotTemplatePicker
          onClose={() => setTemplatePickerOpen(false)}
          onPickBlank={startBlankBot}
          onPickTemplate={startFromTemplate}
          scope={builderScope}
         />
       )}
      </Suspense>
     </AutomationChunkBoundary>

   {gatilhoFor && (
    <GatilhoModal
     initial={gatilhoFor.editing}
     scope={(bots.find((b) => b.id === gatilhoFor.botId)?.escopo ?? "individual") === "grupo" ? "grupo" : "individual"}
     onClose={() => setGatilhoFor(null)}
     onSave={(g) => {
      upsertGatilho(gatilhoFor.botId, g);
      setGatilhoFor(null);
     }}
    />
   )}

   <DuplicateNameDialog
    open={!!dupTarget}
    originalName={dupTarget ? botName(dupTarget) : ""}
    title="Duplicar bot"
    maxLength={80}
    onCancel={() => setDupTarget(null)}
    onConfirm={async (nome) => {
     const target = dupTarget;
     setDupTarget(null);
     if (target) await duplicateBot(target, nome);
    }}
   />
  </div>
 );
}

function AutomationOverlayLoader({ label }: { label: string }) {
 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
   <div className="rounded-lg border border-border bg-popover px-4 py-3 text-xs font-semibold text-popover-foreground shadow-2xl">
    {label}
   </div>
  </div>
 );
}

class AutomationChunkBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
 state: { error: Error | null } = { error: null };

 static getDerivedStateFromError(error: Error) {
  return { error };
 }

 render() {
  if (this.state.error) {
   return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
     <div className="max-w-md rounded-lg border border-destructive/30 bg-popover p-4 text-sm shadow-2xl">
      <div className="font-semibold text-popover-foreground">Não consegui abrir essa parte da automação.</div>
      <div className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</div>
      <button
       type="button"
       onClick={() => this.setState({ error: null })}
       className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
      >
       Tentar novamente
      </button>
     </div>
    </div>
   );
  }
  return this.props.children;
 }
}

/* ============ Gatilho Modal (kind picker + config) ============ */

function GatilhoModal({
 initial,
 scope,
 onClose,
 onSave,
}: {
 initial?: Gatilho;
 scope?: "individual" | "grupo";
 onClose: () => void;
 onSave: (g: Gatilho) => void;
}) {
 const [gatilho, setGatilho] = useState<Gatilho>(
  initial ?? { id: newId("gat"), kind: scope === "grupo" ? "grupo-palavra-chave" : "qualquer-conversa" },
 );

 function update(patch: Partial<Gatilho>) {
  setGatilho((prev) => ({ ...prev, ...patch }));
 }

 function pickKind(kind: GatilhoKind) {
  // preserva id, reseta config
  setGatilho({ id: gatilho.id, kind });
 }

 const canSave = isGatilhoConfigured(gatilho);

 return (
  <div
   className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
   onClick={onClose}
  >
   <div
    className="bg-popover text-popover-foreground border border-border rounded-lg w-[560px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
    onClick={(e) => e.stopPropagation()}
   >
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
     <div className="text-xs font-semibold uppercase tracking-wider text-popover-foreground">
      {initial ? "Editar gatilho" : "Adicionar gatilho"}
     </div>
     <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
      <X className="w-4 h-4" />
     </button>
    </div>

    <div className="p-4 space-y-4 overflow-y-auto">
     <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
       Tipo de gatilho
      </div>
      <GatilhoTipoAccordion selected={gatilho.kind} onPick={pickKind} scope={scope} />
     </div>


     <div className="border-t border-border pt-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
       Configuração
      </div>
      {isGatilhoEmBreve(gatilho.kind) ? (
       <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded px-3 py-2">
         Este gatilho está em breve. Você pode salvá-lo agora para deixar o fluxo pronto. O disparo automático será ativado assim que essa fonte de eventos ficar disponível.
       </div>
      ) : (
       <GatilhoConfig gatilho={gatilho} onChange={update} />
      )}
     </div>

     <GatilhoScopeEditor gatilho={gatilho} onChange={update} />
     <GatilhoDelayEditor gatilho={gatilho} onChange={update} />
    </div>


    <div className="p-3 border-t border-border flex justify-end gap-2">
     <button
      onClick={onClose}
      className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
     >
      Cancelar
     </button>
     <button
      disabled={!canSave}
      onClick={() => onSave(gatilho)}
      className="bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground text-xs px-3 py-1.5 rounded"
     >
      {initial ? "Salvar" : "Adicionar"}
     </button>
    </div>
   </div>
  </div>
 );
}

function GatilhoConfig({
 gatilho,
 onChange,
}: {
 gatilho: Gatilho;
 onChange: (patch: Partial<Gatilho>) => void;
}) {
 const funnelsQuery = useAllFunnels();
 const funnels = funnelsQuery.data ?? [];

 switch (gatilho.kind) {
  case "qualquer-conversa":
  case "mensagem-recebida":
  case "primeira-mensagem":
   return <CanalPicker gatilho={gatilho} onChange={onChange} />;

  case "palavra-chave":
   return (
    <div className="space-y-2">
     <div className="grid grid-cols-[1fr_140px] gap-2">
      <div>
       <label className="text-[11px] text-muted-foreground">Palavra ou frase</label>
       <input
        value={gatilho.palavraChave ?? ""}
        onChange={(e) => onChange({ palavraChave: e.target.value })}
        placeholder="ex.: orçamento"
        className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
       />
      </div>
      <div>
       <label className="text-[11px] text-muted-foreground">Modo</label>
       <select
        value={gatilho.palavraChaveModo ?? "contem"}
        onChange={(e) => onChange({ palavraChaveModo: e.target.value as Gatilho["palavraChaveModo"] })}
        className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
       >
        <option value="contem">Contém</option>
        <option value="igual">Igual a</option>
        <option value="comeca">Começa com</option>
        <option value="regex">Regex</option>
       </select>
      </div>
     </div>
     <CanalPicker gatilho={gatilho} onChange={onChange} />
    </div>
   );

  case "midia-recebida":
   return (
    <div className="space-y-2">
     <div>
      <label className="text-[11px] text-muted-foreground">Tipo de mídia</label>
      <select
       value={gatilho.midiaTipo ?? "qualquer"}
       onChange={(e) => onChange({ midiaTipo: e.target.value as Gatilho["midiaTipo"] })}
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
      >
       <option value="qualquer">Qualquer mídia</option>
       <option value="audio">Áudio</option>
       <option value="imagem">Imagem</option>
       <option value="video">Vídeo</option>
       <option value="documento">Documento</option>
      </select>
     </div>
     <CanalPicker gatilho={gatilho} onChange={onChange} />
    </div>
   );


  case "movido-etapa": {
   const currentPipeline = funnels.find((f) => f.id === gatilho.pipelineId);
   return (
    <div className="grid grid-cols-2 gap-2">
     <div>
      <label className="text-[11px] text-muted-foreground">Funil</label>
      <select
       value={gatilho.pipelineId ?? ""}
       onChange={(e) => {
        const p = funnels.find((f) => f.id === e.target.value);
        onChange({
         pipelineId: p?.id,
         pipelineNome: p?.name,
         stageId: undefined,
         stageNome: undefined,
        });
       }}
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
      >
       <option value="">
        {funnelsQuery.isLoading ? "Carregando…" : funnels.length === 0 ? "Nenhum funil" : "Selecione…"}
       </option>
       {funnels.map((f) => (
        <option key={f.id} value={f.id}>
         {f.name}
        </option>
       ))}
      </select>
     </div>
     <div>
      <label className="text-[11px] text-muted-foreground">Etapa</label>
      <select
       value={gatilho.stageId ?? ""}
       onChange={(e) => {
        const s = currentPipeline?.stages.find((x) => x.id === e.target.value);
        onChange({ stageId: s?.id, stageNome: s?.name });
       }}
       disabled={!currentPipeline}
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs disabled:opacity-50"
      >
       <option value="">Selecione…</option>
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

  case "sem-resposta":
   return (
    <div>
     <label className="text-[11px] text-muted-foreground">Horas sem resposta</label>
     <input
      type="number"
      min={1}
      value={gatilho.horasSemResposta ?? 24}
      onChange={(e) => onChange({ horasSemResposta: Number(e.target.value) || 0 })}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     />
    </div>
   );

  case "tag-adicionada":
   return (
    <div>
     <label className="text-[11px] text-muted-foreground">Tag</label>
     <input
      value={gatilho.tag ?? ""}
      onChange={(e) => onChange({ tag: e.target.value })}
      placeholder="ex.: qualificado"
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     />
    </div>
   );

  case "campo-alterado":
   return (
    <div className="grid grid-cols-2 gap-2">
     <div>
      <label className="text-[11px] text-muted-foreground">Nome do campo</label>
      <input
       value={gatilho.campoNome ?? ""}
       onChange={(e) => onChange({ campoNome: e.target.value })}
       placeholder="ex.: origem"
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
      />
     </div>
     <div>
      <label className="text-[11px] text-muted-foreground">Valor (opcional)</label>
      <input
       value={gatilho.campoValor ?? ""}
       onChange={(e) => onChange({ campoValor: e.target.value })}
       placeholder="dispara qualquer valor se vazio"
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
      />
     </div>
    </div>
   );

  case "formulario-enviado":
   return <FormularioGatilhoConfig gatilho={gatilho} onChange={onChange} />;

  case "tracking-conversao":
  case "tracking-visita-quente":
  case "tracking-primeiro-acesso":
  case "tracking-abandono-formulario":
   return <TrackingGatilhoConfig gatilho={gatilho} onChange={onChange} />;


  case "webhook":
   return (
    <div>
     <label className="text-[11px] text-muted-foreground">URL do webhook</label>
     <input
      value={gatilho.webhookUrl ?? ""}
      onChange={(e) => onChange({ webhookUrl: e.target.value })}
      placeholder="https://…"
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     />
    </div>
   );

  case "webhook-enviado":
   return (
    <div>
     <label className="text-[11px] text-muted-foreground">URL de destino do webhook</label>
     <input
      value={gatilho.webhookUrl ?? ""}
      onChange={(e) => onChange({ webhookUrl: e.target.value })}
      placeholder="https://…"
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     />
    </div>
    );


  default:
   return (
    <div className="text-[11px] text-muted-foreground">
     Sem configuração adicional para este tipo de gatilho.
    </div>
   );
 }
}

/* ============ Gatilho: tracking (pixel do site) ============ */

function TrackingGatilhoConfig({
 gatilho,
 onChange,
}: {
 gatilho: Gatilho;
 onChange: (patch: Partial<Gatilho>) => void;
}) {
 const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
 const workspaceId = (ws as { id?: string } | undefined)?.id ?? "";

 const { data: sites = [] } = useQuery({
  queryKey: ["tracking-sites", workspaceId],
  queryFn: () => listTrackingSites({ data: { workspaceId } }),
  enabled: !!workspaceId,
  staleTime: 60_000,
 });
 const { data: eventNames = [] } = useQuery({
  queryKey: ["tracking-event-names", workspaceId],
  queryFn: () => listDistinctEventNames({ data: { workspaceId } }),
  enabled: !!workspaceId,
  staleTime: 60_000,
 });

 const siteList = (sites ?? []) as Array<{ id: string; name: string; domain: string }>;
 const nomes = (eventNames ?? []) as string[];
 const isConversao = gatilho.kind === "tracking-conversao";

 return (
  <div className="space-y-2">
   <div>
    <label className="text-[11px] text-muted-foreground">Site monitorado</label>
    <select
     value={gatilho.trackingSiteId ?? ""}
     onChange={(e) => {
      const s = siteList.find((x) => x.id === e.target.value);
      onChange({ trackingSiteId: s?.id, trackingSiteNome: s ? `${s.name}` : undefined });
     }}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="">Qualquer site do workspace</option>
     {siteList.map((s) => (
      <option key={s.id} value={s.id}>{s.name} · {s.domain}</option>
     ))}
    </select>
    {siteList.length === 0 && (
     <p className="mt-1 text-[10px] text-muted-foreground">
      Nenhum site com pixel instalado ainda. Instale o pixel Vanessa Simoni em Tracking.
     </p>
    )}
   </div>

   <div>
    <label className="text-[11px] text-muted-foreground">
     {isConversao ? "Evento de conversão" : "Evento (opcional)"}
    </label>
    <input
     list="mkton-tracking-events"
     value={gatilho.trackingEvento ?? ""}
     onChange={(e) => onChange({ trackingEvento: e.target.value })}
     placeholder={isConversao ? "ex.: lead, form_submit, purchase" : "deixe vazio para qualquer evento"}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    />
    <datalist id="mkton-tracking-events">
     {nomes.map((n) => <option key={n} value={n} />)}
    </datalist>
   </div>

   <div className="grid grid-cols-2 gap-2">
    <div>
     <label className="text-[11px] text-muted-foreground">Valor mínimo (opcional)</label>
     <input
      type="number"
      min={0}
      value={gatilho.trackingValorMin ?? ""}
      onChange={(e) => onChange({ trackingValorMin: e.target.value === "" ? undefined : Number(e.target.value) })}
      placeholder="ex.: 500"
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     />
    </div>
    <div>
     <label className="text-[11px] text-muted-foreground">Página contém (opcional)</label>
     <input
      value={gatilho.trackingUrlContem ?? ""}
      onChange={(e) => onChange({ trackingUrlContem: e.target.value })}
      placeholder="ex.: /checkout"
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     />
    </div>
   </div>

   <p className="text-[10px] text-muted-foreground leading-relaxed">
    O disparo só acontece quando o visitante é identificado (o pixel envia e-mail,
    telefone ou lead_id em <code>props</code>, ou o visitante já foi identificado antes).
    O bot recebe as variáveis <code>{"{{tracking_evento}}"}</code>, <code>{"{{tracking_valor}}"}</code> e{" "}
    <code>{"{{tracking_url}}"}</code>.
   </p>
  </div>
 );
}

/* ============ Gatilho: formulário enviado ============ */

function FormularioGatilhoConfig({
 gatilho,
 onChange,
}: {
 gatilho: Gatilho;
 onChange: (patch: Partial<Gatilho>) => void;
}) {
 const list = useServerFn(listForms);
 const q = useQuery<FormRecord[]>({
  queryKey: ["forms-list"],
  queryFn: () => list({}) as Promise<FormRecord[]>,
  staleTime: 60_000,
 });
 const forms = q.data ?? [];
 const origem = gatilho.formularioOrigem ?? "qualquer";
 const visiveis = origem === "qualquer" ? forms : forms.filter((f) => f.origem === origem);

 return (
  <div className="space-y-2">
   <div>
    <label className="text-[11px] text-muted-foreground">Origem do formulário</label>
    <select
     value={origem}
     onChange={(e) =>
      onChange({
       formularioOrigem: e.target.value as Gatilho["formularioOrigem"],
       formularioId: undefined,
       formularioNome: undefined,
      })
     }
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="qualquer">Qualquer origem</option>
     <option value="mkton">Formulário Vanessa Simoni (página pública)</option>
     <option value="externo">Formulário do site do cliente</option>
     <option value="meta">Formulário do Meta (Lead Ads)</option>
    </select>
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Formulário</label>
    <select
     value={gatilho.formularioId ?? ""}
     onChange={(e) => {
      const f = visiveis.find((x) => x.id === e.target.value);
      onChange({ formularioId: f?.id, formularioNome: f?.nome });
     }}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="">
      {q.isLoading ? "Carregando…" : "Qualquer formulário"}
     </option>
     {visiveis.map((f) => (
      <option key={f.id} value={f.id}>
       {f.nome}
      </option>
     ))}
    </select>
    <p className="text-[10px] text-muted-foreground mt-1">
     Cadastre e conecte formulários em CRM → Formulários. O gatilho dispara com o lead
     identificado (ou criado) a partir da resposta.
    </p>
   </div>
  </div>
 );
}

/* ============ Escopo universal (funil / etapa / canal) ============ */

function GatilhoScopeEditor({
 gatilho,
 onChange,
}: {
 gatilho: Gatilho;
 onChange: (patch: Partial<Gatilho>) => void;
}) {
 const funnelsQuery = useAllFunnels();
 const funnels = funnelsQuery.data ?? [];
 const currentPipeline = funnels.find((f) => f.id === gatilho.pipelineId);
 return (
  <div className="border-t border-border pt-4">
   <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
    Escopo (opcional)
   </div>
   <p className="text-[10px] text-muted-foreground mb-2">
    Deixe em branco para o bot funcionar em qualquer funil ou etapa do workspace. O canal é definido nas configurações do gatilho.
   </p>
   <div className="grid grid-cols-2 gap-2">
    <div>
     <label className="text-[11px] text-muted-foreground">Funil</label>
     <select
      value={gatilho.pipelineId ?? ""}
      onChange={(e) => {
       const p = funnels.find((f) => f.id === e.target.value);
       onChange({ pipelineId: p?.id, pipelineNome: p?.name, stageId: undefined, stageNome: undefined });
      }}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     >
      <option value="">Qualquer</option>
      {funnels.map((f) => (
       <option key={f.id} value={f.id}>{f.name}</option>
      ))}
     </select>
    </div>
    <div>
     <label className="text-[11px] text-muted-foreground">Etapa</label>
     <select
      value={gatilho.stageId ?? ""}
      disabled={!currentPipeline}
      onChange={(e) => {
       const s = currentPipeline?.stages.find((x) => x.id === e.target.value);
       onChange({ stageId: s?.id, stageNome: s?.name });
      }}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs disabled:opacity-50"
     >
      <option value="">Qualquer</option>
      {currentPipeline?.stages.map((s) => (
       <option key={s.id} value={s.id}>{s.name}</option>
      ))}
     </select>
    </div>
   </div>
  </div>
 );
}

/* ============ Atraso universal ============ */

function GatilhoDelayEditor({
 gatilho,
 onChange,
}: {
 gatilho: Gatilho;
 onChange: (patch: Partial<Gatilho>) => void;
}) {
 return (
  <div className="border-t border-border pt-4">
   <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
    Atraso para iniciar (opcional)
   </div>
   <p className="text-[10px] text-muted-foreground mb-2">
    Deixe zerado para o bot começar imediatamente após o gatilho.
   </p>
   <div className="grid grid-cols-4 gap-2">
    {(["atrasoDias", "atrasoHoras", "atrasoMin", "atrasoSeg"] as const).map((key, i) => {
     const labels = ["Dias", "Horas", "Minutos", "Segundos"];
     return (
      <div key={key}>
       <label className="text-[11px] text-muted-foreground">{labels[i]}</label>
       <input
        type="number"
        min={0}
        value={Number(gatilho[key] ?? 0)}
        onChange={(e) => onChange({ [key]: Math.max(0, Number(e.target.value) || 0) } as Partial<Gatilho>)}
        className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
       />
      </div>
     );
    })}
   </div>
  </div>
 );
}


/* ============ Accordion de tipos de gatilho ============ */

function GatilhoTipoAccordion({
 selected,
 onPick,
 scope,
}: {
 selected: GatilhoKind;
 onPick: (k: GatilhoKind) => void;
 scope?: "individual" | "grupo";
}) {
 const areas: GatilhoArea[] = scope === "grupo"
  ? ["grupo"]
  : ["conversa", "crm", "trafego", "calendario", "tracking", "webhooks"];
 const selectedArea = GATILHO_CATALOG.find((c) => c.kind === selected)?.area ?? (scope === "grupo" ? "grupo" : "conversa");
 const [open, setOpen] = useState<GatilhoArea | null>(selectedArea);

 return (
  <div className="border border-border rounded overflow-hidden divide-y divide-border">
   {areas.map((area) => {
    const items = GATILHO_CATALOG.filter((c) => c.area === area);
    if (!items.length) return null;
    const isOpen = open === area;
    const count = items.length;
    const hasSelected = items.some((i) => i.kind === selected);
    return (
     <div key={area}>
      <button
       type="button"
       onClick={() => setOpen(isOpen ? null : area)}
       className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 ${
        hasSelected ? "bg-primary/5" : ""
       }`}
      >
       <span className="flex items-center gap-2 font-medium">
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {GATILHO_AREA_LABEL[area]}
        <span className="text-[10px] text-muted-foreground">({count})</span>
       </span>
       {hasSelected && (
        <span className="text-[10px] uppercase tracking-wider text-primary">Selecionado</span>
       )}
      </button>
      {isOpen && (
       <div className="p-2 grid grid-cols-2 gap-1.5 bg-muted/20">
        {items.map((opt) => (
         <button
          key={opt.kind}
          onClick={() => onPick(opt.kind)}
          className={`text-left px-3 py-2 rounded text-xs border ${
           selected === opt.kind
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-background hover:border-primary/40"
          }`}
          title={opt.desc}
         >
          <div className="font-semibold flex items-center gap-1.5">
           <Zap className="w-3 h-3 flex-shrink-0" />
           <span className="truncate">{opt.label}</span>
           {opt.emBreve && (
            <span className="ml-auto text-[9px] uppercase tracking-wider text-warning bg-warning/10 border border-warning/30 rounded px-1 py-0.5">
             Em breve
            </span>
           )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</div>
         </button>
        ))}
       </div>
      )}
     </div>
    );
   })}
  </div>
 );
}

/* ============ Canal + conta específica ============ */

function CanalPicker({
 gatilho,
 onChange,
 inline,
}: {
 gatilho: Gatilho;
 onChange: (patch: Partial<Gatilho>) => void;
 inline?: boolean;
}) {
 const channelsQ = useWorkspaceChannels();
 const canal = gatilho.canal ?? "whatsapp";
 const channels = channelsQ.data;
 const accounts =
  canal === "whatsapp" ? channels?.whatsapp :
  canal === "instagram" ? channels?.instagram :
  canal === "facebook" ? channels?.facebook :
  canal === "email" ? channels?.email : undefined;

 // Garante que 'canal' fique persistido (não é mais opcional).
 useEffect(() => {
  if (!gatilho.canal) onChange({ canal: "whatsapp" });
 }, [gatilho.canal, onChange]);

 // Auto-seleciona a conta quando só existe uma opção.
 useEffect(() => {
  if (!gatilho.canalId && accounts && accounts.length === 1) {
   onChange({ canalId: accounts[0].id, canalNome: accounts[0].label });
  }
 }, [accounts, gatilho.canalId, onChange]);

 return (
  <div className={inline ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2"}>
   <div>
    <label className="text-[11px] text-muted-foreground">Canal <span className="text-destructive">*</span></label>
    <select
     value={canal}
     onChange={(e) => onChange({
      canal: e.target.value as Gatilho["canal"],
      canalId: undefined,
      canalNome: undefined,
     })}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="whatsapp">WhatsApp</option>
     <option value="instagram">Instagram</option>
     <option value="facebook">Facebook</option>
     <option value="email">E-mail</option>
    </select>
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Conta <span className="text-destructive">*</span></label>
    <select
     value={gatilho.canalId ?? ""}
     onChange={(e) => {
      const acc = accounts?.find((a) => a.id === e.target.value);
      onChange({ canalId: acc?.id, canalNome: acc?.label });
     }}
     disabled={!accounts || accounts.length === 0}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs disabled:opacity-50"
    >
     <option value="">
      {channelsQ.isLoading
       ? "Carregando…"
       : !accounts || accounts.length === 0
       ? "Nenhuma conta conectada"
       : "Selecione uma conta"}
     </option>
     {accounts?.map((a) => (
      <option key={a.id} value={a.id}>
       {a.label}
       {a.subtitle ? ` · ${a.subtitle}` : ""}
      </option>
     ))}
    </select>
   </div>
  </div>
 );
}


