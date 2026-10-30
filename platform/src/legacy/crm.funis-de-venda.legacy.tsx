import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSlimSources, listSlimFunnels, listSlimUsers, moveSlimLead, bulkMoveSlimLeads, updateSlimStage, createSlimStage, renameSlimPipeline, createSlimLead, createSlimFunnel, setDefaultSlimSource, reorderSlimStages } from "@/lib/saude-slim-funnel-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
 Search,
 Filter,
 KanbanSquare,
 List,
 UserPlus,
 Eye,
 Palette,
 RefreshCw,
 Zap,
 Plus,
 ChevronDown,
 ChevronUp,
 MessageCircle,
 Instagram,
 Facebook,
 Phone,
 UserCircle2,
 Mail,
 ListChecks,
 Bot,
 Webhook,
 Sparkles,
 Clock,
 Save,
 X,
 Megaphone,
 MousePointerClick,
 BarChart3,
 Users,
 Tags,
 FileText,
 ArrowRightLeft,
 MoveRight,
 Pencil,
 FolderX,
 UserCog,
 Trash2,
 Copy,
 Database,
 ExternalLink,
 Play,
 CheckCircle2,
 AlertCircle,
 GripVertical as GripV,
 Pin,
 PinOff,
 Lightbulb,
 Check,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
 STAGE_AUTOMATIONS,
 TRIGGER_CATALOG,
 formatBRL,
 summarizeFunnel,
 timeAgo,
 triggerIsImplemented,
 triggerHasConfigUI,
 configKindFor,
 describeAutomationConfig,
 describeExecution,
 isAutomationConfigured,
 WEBHOOK_PRESET_BY_TRIGGER,
 WEBHOOK_PRESET_LABEL,
 WEBHOOK_PRESET_EVENT,
 webhookPreviewPayload,
 type AutomationAction,
 type AutomationConfig,
 type ExecutionConfig,
 type CrmLead,
 type Funnel,
 type FunnelStage,
 type LeadMessageDirection,
 type TriggerCatalogItem,
 type TriggerChannel,
 type WebhookPreset,
} from "@/lib/crm-mock";
import { listCrmSources, listFunnels, moveLead as moveLeadServerFn, createFunnel as createFunnelServerFn, listWorkspaceUsers, listStageAutomations as listStageAutomationsServerFn, saveStageAutomations as saveStageAutomationsServerFn, reorderPipelineStages, setDefaultCrmSource, updatePipelineStage, createPipelineStage, deletePipelineStage, renamePipeline as renamePipelineServerFn, reorderFunnels, deletePipeline as deletePipelineServerFn, listAllPipelineStages, createLead as createLeadServerFn, duplicatePipeline as duplicatePipelineServer, bulkMoveLeads, deleteLead as deleteLeadServerFn, duplicateLead as duplicateLeadServerFn } from "@/lib/crm.functions";
import { updateLead as updateLeadFn, listWorkspaceTags, setLeadCustomFieldValue, listLeadCustomFields, getLeadDetail } from "@/lib/leads.functions";

import { StageTriggerConfigPopover } from "@/components/crm/StageTriggerConfigPopover";
import { SlimFunnelLeadDrawer, type SlimFunnelLeadDrawerHandle } from "@/components/crm/SlimFunnelLeadDrawer";
import { slimFunnelActivationKey, slimFunnelCardAction } from "@/lib/slim-funnel-drawer.core";

 import { listSalesbots } from "@/lib/salesbots.functions";
 import { listProductCatalogs } from "@/lib/products.functions";
import { listActiveWorkspaceConversationAgents } from "@/lib/conversation-agents.functions";
import { listWorkflowPipelinesLite } from "@/lib/workflow.functions";
import { validateFieldValue } from "@/lib/crm-mock";
import { triggerStageAutomations } from "@/lib/stage-automations.functions";
import { listForms, DEFAULT_FORM_MESSAGE_TEMPLATE, type FormRecord } from "@/lib/forms.functions";
import { MessageTemplateEditor } from "@/components/crm/MessageTemplateEditor";
import { FunnelSourcesPopover } from "@/components/crm/FunnelSourcesPopover";
import { toast } from "sonner";
import { stageActionStamp } from "@/lib/stage-execution.core";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { AdminOnlyDot } from "@/components/AdminOnlyDot";



type CrmSource = { id: string; provider: "manual" | "mkton"; display_name: string; is_default: boolean };

export const Route = createFileRoute("/crm/funis-de-venda")({
 validateSearch: (search: Record<string, unknown>): { funnelId?: string; novo?: string } => ({
  funnelId: typeof search.funnelId === "string" ? search.funnelId : undefined,
  novo: search.novo === "1" ? "1" : undefined,
 }),
 head: () => ({
 meta: [
 { title: "Funis de venda · CRM Vanessa Simoni" },
 {
 name: "description",
 content:
 "CRM Vanessa Simoni: pipeline real por funil, detalhamento de leads e automações por etapa.",
 },
 ],
 }),
 component: CrmFunisPage,
});

type View = "kanban" | "lista";
type Mode = "view" | "automatize";
type StageAutomations = Record<string, AutomationAction[]>;
type QuickEditValues = {
  name: string;
  email: string;
  phone: string;
  value: number;
  responsibleId: string;
  pipelineId: string;
  stageId: string;
  customFields: Record<string, string>;
};
type QuickEditBasicValues = {
  name: string;
  email: string | null;
  phone: string | null;
  value: number;
  responsibleId: string | null;
};
type QuickEditCheckpoint = {
  basic: QuickEditBasicValues;
  customFields: Record<string, string>;
  pipelineId: string;
  stageId: string;
  hasConfirmedData: boolean;
};
function quickEditBasicValues(data: QuickEditValues): QuickEditBasicValues {
  return {
    name: data.name ?? "",
    email: data.email || null,
    phone: data.phone || null,
    value: Number(data.value ?? 0),
    responsibleId: data.responsibleId || null,
  };
}
const stageAutomationStorageKey = (pipelineId: string) => `saude-slim.stageAutomations.${pipelineId}`;
const stageAutomationDraftStorageKey = (pipelineId: string) => `saude-slim.stageAutomationsDraft.${pipelineId}`;
const STAGE_COLOR_SWATCHES = [
 "#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b",
 "#ef4444", "#10b981", "#ec4899", "#6b7280",
];

function CrmFunisPage() {
 const navigate = useNavigate();
 const search = Route.useSearch();
 const [sources, setSources] = useState<CrmSource[]>([]);
 const [crmSourceId, setCrmSourceId] = useState<string>("");
  const [quickEditingLead, setQuickEditingLead] = useState<CrmLead | null>(null);
  const funnelDrawerRef = useRef<SlimFunnelLeadDrawerHandle>(null);
  const quickEditCheckpoints = useRef(new Map<string, QuickEditCheckpoint>());
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const onBatchToggleLeads = useCallback((ids: string[], forceState?: boolean) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      const allIncluded = ids.every(id => next.has(id));
      const shouldSelect = forceState !== undefined ? forceState : !allIncluded;
      
      ids.forEach(id => {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }, []);
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);

 const [primarySourceId, setPrimarySourceId] = useState<string>(() => {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem("saude-slim.primaryCrmSourceId") ?? ""; } catch { return ""; }
 });
 const [funnels, setFunnels] = useState<Funnel[]>([]);
 const queryClient = useQueryClient();

 const [funnelId, setFunnelId] = useState<string>("");
 const [bootstrapping, setBootstrapping] = useState(true);
 const [syncMsg] = useState<string | null>(null);
 const [pendingRenameStageId, setPendingRenameStageId] = useState<string | null>(null);
  const [savingAutomations, setSavingAutomations] = useState(false);
   const [duplicatingPipe, setDuplicatingPipe] = useState(false);
   const [workspaceUsers, setWorkspaceUsers] = useState<Array<{ id: string; name: string }>>([]);

   const duplicatePipeFn = useServerFn(duplicatePipelineServer);
    const listUsersFn = listSlimUsers;
    const bulkMoveLeadsFn = bulkMoveSlimLeads;
    const bulkMoveRequest = useRef<{key:string;requestId:string}|null>(null);
    const automationSaveRequest = useRef<string | null>(null);

  const listSources = listSlimSources;
  const listFunnelsServer = listSlimFunnels;
  const moveLeadServer = moveSlimLead;
  const createFunnelServer = createSlimFunnel;
  const setDefaultCrmSourceServer = setDefaultSlimSource;
  const updateStageServer = updateSlimStage;
  const reorderStagesServer = reorderSlimStages;
  const renamePipelineServer = renameSlimPipeline;
  const reorderFunnelsServer = useServerFn(reorderFunnels);
  const deletePipelineServer = useServerFn(deletePipelineServerFn);
  const deleteLead = useServerFn(deleteLeadServerFn);
  const duplicateLead = useServerFn(duplicateLeadServerFn);

  const listStageAutomationsServer = useServerFn(listStageAutomationsServerFn);
  const saveStageAutomationsServer = useServerFn(saveStageAutomationsServerFn);
  const createStageServer = createSlimStage;
  const deleteStageServer = useServerFn(deletePipelineStage);

  useEffect(() => {
    listUsersFn().then(r => setWorkspaceUsers(r.users)).catch(() => {});
  }, [listUsersFn]);


 async function reloadFunnels(sourceId: string) {
 const r = await listFunnelsServer({ data: { crmSourceId: sourceId } });
 const adapted: Funnel[] = r.funnels.map((f) => ({
 id: f.id,
 name: f.name,
 stages: f.stages.map((s) => ({
 id: s.id,
 name: s.name,
 status: s.status as FunnelStage["status"],
 color: (s as { color?: string | null }).color ?? null,
 description: (s as { description?: string | null }).description ?? null,
  leads: s.leads.map((l) => ({
  id: l.id,
  name: l.name,
  value: l.value,
  source: "outro" as CrmLead["source"],
  lastMessageFrom: (l.lastMessageFrom?? "none") as LeadMessageDirection,
  createdAt: l.createdAt,
  companyId: l.companyId,
  tags: l.tags,
  email: (l as any).email ?? null,
  phone: (l as any).phone ?? null,
  pipeline_id: f.id,
  stage_id: s.id,
  })),
 })),

 }));
 setFunnels(adapted);
 const desired = search.funnelId;
 if (desired && adapted.find((f) => f.id === desired)) {
  setFunnelId(desired);
 } else if (adapted.length && !adapted.find((f) => f.id === funnelId)) {
  setFunnelId(adapted[0].id);
 }
 }

 useEffect(() => {
 (async () => {
 try {
   const r = await listSources();
   setSources(r.sources as CrmSource[]);
   // Fonte principal definida exclusivamente no workspace Vanessa Simoni.
    const initial = r.sources.find((s) => s.is_default) ?? r.sources[0];
  if (initial) {
   setPrimarySourceId(initial.id);
    try { localStorage.setItem("saude-slim.primaryCrmSourceId", initial.id); } catch { /* noop */ }
  setCrmSourceId(initial.id);
  await reloadFunnels(initial.id);
  }
 } catch (e) {
 console.error("bootstrap CRM", e);
 } finally {
 setBootstrapping(false);
 }
 })();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Sincroniza funil selecionado com ?funnelId= da URL (deep-link da sidebar).
 useEffect(() => {
  if (search.funnelId && funnels.find((f) => f.id === search.funnelId)) {
   setFunnelId(search.funnelId);
  }
 }, [search.funnelId, funnels]);

 async function pinPrimarySource(id: string) {
  if (!id) return;
  const previous = primarySourceId;
  setPrimarySourceId(id);
  setSources((prev) => prev.map((s) => ({ ...s, is_default: s.id === id })));
  try {
   localStorage.setItem("saude-slim.primaryCrmSourceId", id);
   await setDefaultCrmSourceServer({ data: { crmSourceId: id } });
   const fresh = await listSources();
   setSources(fresh.sources as CrmSource[]);
  } catch (e) {
   setPrimarySourceId(previous);
   setSources((prev) => prev.map((s) => ({ ...s, is_default: s.id === previous })));
   try {
    if (previous) localStorage.setItem("saude-slim.primaryCrmSourceId", previous);
    else localStorage.removeItem("saude-slim.primaryCrmSourceId");
   } catch { /* noop */ }
   console.error("pinPrimarySource", e);
  }
 }

 async function handleSourceChange(id: string) {
 setCrmSourceId(id);
 setBootstrapping(true);
 try { await reloadFunnels(id); } finally { setBootstrapping(false); }
 }




  async function handleCreateDefaultFunnel() {
    if (!crmSourceId) return;
    try {
      const res = await createFunnelServer({ data: { crmSourceId, name: "Funil Comercial" } });
      await reloadFunnels(crmSourceId);
      if (res.pipelineId) setFunnelId(res.pipelineId);
      toast.success("Funil padrão criado");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao criar funil");
    }
  }

 // ----- Criação de novo funil (dialog) -----
 const [newFunnelOpen, setNewFunnelOpen] = useState(false);
 const [newFunnelName, setNewFunnelName] = useState("");
 const [creatingFunnel, setCreatingFunnel] = useState(false);

 useEffect(() => {
  if (search.novo === "1") {
   setNewFunnelOpen(true);
   setNewFunnelName("");
  }
 }, [search.novo]);

 async function handleCreateFunnel() {
  const name = newFunnelName.trim();
  if (!name || !crmSourceId || creatingFunnel) return;
  setCreatingFunnel(true);
  try {
   const r = await createFunnelServer({ data: { crmSourceId, name } });
   await reloadFunnels(crmSourceId);
   const created = (r as { pipelineId?: string } | undefined)?.pipelineId;
   if (created) setFunnelId(created);
   setNewFunnelOpen(false);
   setNewFunnelName("");
   toast.success("Funil criado");
  } catch (e) {
   console.error("createFunnel", e);
   toast.error("Não foi possível criar o funil");
  } finally {
   setCreatingFunnel(false);
  }
  }

  const funnel = useMemo(
    () => funnels.find((f) => f.id === funnelId) ?? funnels[0],
    [funnels, funnelId]
  );

  async function handleDuplicateFunnel() {
    if (!funnel || !crmSourceId) return;
    setDuplicatingPipe(true);
    try {
      const res = await duplicatePipeFn({
        data: {
          pipelineId: funnel.id,
          name: `${funnel.name} (cópia)`,
        }
      });
      toast.success("Funil duplicado com sucesso!");
      await reloadFunnels(crmSourceId);
      if (res.id) setFunnelId(res.id);
      setMode("view");
    } catch (e: any) {
      console.error("duplicatePipe", e);
      toast.error(e.message || "Erro ao duplicar funil");
    } finally {
      setDuplicatingPipe(false);
    }
  }
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "kanban";
    return (localStorage.getItem("saude-slim.crmView") as View) || "kanban";
  });
  const [mode, setMode] = useState<Mode>("view");
  
  useEffect(() => {
    localStorage.setItem("saude-slim.crmView", view);
  }, [view]);
 const [query, setQuery] = useState("");
  const [colorMode, setColorMode] = useState(false);
  const [selectedColorStageId, setSelectedColorStageId] = useState<string | null>(null);

 // Filtros de busca
 const ALL_SOURCES: CrmLead["source"][] = [
 "whatsapp",
 "instagram",
 "facebook",
 "google",
 "indicacao",
 ];
  const [sourceFilters, setSourceFilters] = useState<CrmLead["source"][]>([]);
   const [onlyWaiting, setOnlyWaiting] = useState(false);
   const [onlyWithValue, setOnlyWithValue] = useState(false);
   const [onlyUnread, setOnlyUnread] = useState(false);
   const [tagFilters, setTagFilters] = useState<string[]>([]);
   const [minValue, setMinValue] = useState<string>("");

  // Ocultar "Etapa de leads de entrada" por funil (preferência local do usuário)
  const [hideEntryMap, setHideEntryMap] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("saude-slim.hideEntryStage") || "{}"); } catch { return {}; }
  });
  const hideEntry = funnelId ? !!hideEntryMap[funnelId] : false;
  function toggleHideEntry() {
    if (!funnelId) return;
    setHideEntryMap((prev) => {
      const next = { ...prev, [funnelId]: !prev[funnelId] };
      try { localStorage.setItem("saude-slim.hideEntryStage", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

 // Estado de automações (com snapshot para Cancelar)
 const [automations, setAutomations] = useState<StageAutomations>(STAGE_AUTOMATIONS);
 const [draft, setDraft] = useState<StageAutomations | null>(null);
 const [triggerStage, setTriggerStage] = useState<string | null>(null);
 const [configuring, setConfiguring] = useState<{ stageId: string; actionId: string } | null>(null);

 const summary = funnel? summarizeFunnel(funnel): { total: 0, abertas: 0, emNegociacao: 0, vendas: 0, faturamento: 0, valorAbertas: 0 };

 // Persistência real por funil das automações configuradas
 useEffect(() => {
   if (!funnelId) { setAutomations({}); return; }
   let cancelled = false;
   (async () => {
    try {
     const r = await listStageAutomationsServer({ data: { pipelineId: funnelId } });
     const next = (r.automations ?? {}) as StageAutomations;
     if (!cancelled) setAutomations(next);
     try { localStorage.setItem(stageAutomationStorageKey(funnelId), JSON.stringify(next)); } catch { /* noop */ }
    } catch (e) {
     console.error("listStageAutomations", e);
     try {
      const raw = localStorage.getItem(stageAutomationStorageKey(funnelId));
      if (!cancelled) setAutomations(raw ? (JSON.parse(raw) as StageAutomations) : {});
     } catch {
      if (!cancelled) setAutomations({});
     }
    }
   })();
   return () => { cancelled = true; };
   // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId]);

  // Edição rápida de leads - Already defined above


  const onToggleLeadSelection = useCallback((leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  useEffect(() => {
   if (!funnelId || draft === null) return;
   try {
    localStorage.setItem(stageAutomationDraftStorageKey(funnelId), JSON.stringify(draft));
   } catch (error) {
    console.error("backupStageAutomationsDraft", error);
   }
  }, [draft, funnelId]);


    const filteredFunnel: Funnel | null = useMemo(() => {
      if (!funnel) return null;
      const q = query.trim().toLowerCase();
      const hasSource = sourceFilters.length > 0;
      const hasTags = tagFilters.length > 0;
      const minV = minValue.trim() ? Number(minValue.replace(/[^\d.,-]/g, "").replace(",", ".")) : NaN;
      const stagesBase = hideEntry && funnel.stages.length > 1
        ? funnel.stages.slice(1)
        : funnel.stages;
      return {
        ...funnel,
        stages: stagesBase.map((s) => ({
          ...s,
          leads: s.leads.filter((l) => {
            if (q) {
              const hay = [
                l.name,
                l.company ?? "",
                l.lastMessagePreview ?? "",
                (l.tags ?? []).join(" "),
                l.owner ?? "",
              ].join(" ").toLowerCase();
              if (!hay.includes(q)) return false;
            }
            if (hasSource && !sourceFilters.includes(l.source)) return false;
            if (hasTags && !(l.tags ?? []).some((t) => tagFilters.includes(t))) return false;
            if (onlyWaiting && l.lastMessageFrom !== "lead") return false;
            if (onlyWithValue && l.value <= 0) return false;
            if (onlyUnread && !(l.unreadCount && l.unreadCount > 0)) return false;
            if (!Number.isNaN(minV) && l.value < minV) return false;
            return true;
          }),
        })),
      };
    }, [funnel, query, sourceFilters, tagFilters, onlyWaiting, onlyWithValue, onlyUnread, minValue, hideEntry]);

   const availableTags = useMemo(() => {
     if (!funnel) return [] as string[];
     const set = new Set<string>();
     funnel.stages.forEach((s) => s.leads.forEach((l) => (l.tags ?? []).forEach((t) => set.add(t))));
     return Array.from(set).sort();
   }, [funnel]);



 const activeAutomations = mode === "automatize" && draft? draft: automations;

 /** Move o funil atual uma posição para cima/baixo. A ordem salva vale também
  *  para a sanfona "Funis de venda" do menu lateral. */
 async function moveFunnel(id: string, dir: -1 | 1) {
  const idx = funnels.findIndex((f) => f.id === id);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= funnels.length) return;
  const before = funnels;
  const next = [...funnels];
  const [moved] = next.splice(idx, 1);
  next.splice(target, 0, moved);
  setFunnels(next);
  try {
   await reorderFunnelsServer({ data: { pipelineIds: next.map((f) => f.id) } });
   queryClient.invalidateQueries({ queryKey: ["salesbot-funnels-lite"] });
  } catch {
   setFunnels(before);
   toast.error("Não foi possível reordenar os funis. Tente de novo.");
  }
 }

 /** Exclui um funil — só quando ele não tem nenhum lead dentro. */
 async function removeFunnel(id: string) {
  const alvo = funnels.find((f) => f.id === id);
  if (!alvo) return;
  const leadsNoFunil = alvo.stages.reduce((acc, s) => acc + s.leads.length, 0);
  if (leadsNoFunil > 0) {
   toast.error(`Tem ${leadsNoFunil} lead(s) neste funil. Mova ou exclua os leads antes de apagar.`);
   return;
  }
  if (funnels.length <= 1) {
   toast.error("Você precisa ter pelo menos um funil.");
   return;
  }
  const before = funnels;
  const next = funnels.filter((f) => f.id !== id);
  setFunnels(next);
  if (funnelId === id) setFunnelId(next[0]?.id ?? "");
  try {
   await deletePipelineServer({ data: { pipelineId: id } });
   queryClient.invalidateQueries({ queryKey: ["salesbot-funnels-lite"] });
   toast.success("Funil excluído");
  } catch (e) {
   setFunnels(before);
   setFunnelId(funnelId);
   toast.error(e instanceof Error ? e.message : "Não foi possível excluir o funil.");
  }
 }



 function enterAutomatize() {
  let next = JSON.parse(JSON.stringify(automations)) as StageAutomations;
  if (funnelId) {
   try {
    const savedDraft = localStorage.getItem(stageAutomationDraftStorageKey(funnelId));
    if (savedDraft) {
     const recovered = JSON.parse(savedDraft) as StageAutomations;
     const recoveredCount = Object.values(recovered).reduce((total, actions) => total + actions.length, 0);
     const persistedCount = Object.values(automations).reduce((total, actions) => total + actions.length, 0);
     if (recoveredCount > 0 || persistedCount === 0) {
      next = recovered;
      toast.info(`Rascunho recuperado: ${recoveredCount} gatilho(s).`);
     }
    }
   } catch (error) {
    console.error("recoverStageAutomationsDraft", error);
   }
  }
  setDraft(next);
 setMode("automatize");
 }
 function cancelAutomatize() {
  if (funnelId) {
   try { localStorage.removeItem(stageAutomationDraftStorageKey(funnelId)); } catch { /* noop */ }
  }
 setDraft(null);
 setConfiguring(null);
  setColorMode(false);
  setSelectedColorStageId(null);
 setMode("view");
 }

 function assertAutomationPersistence(expected: StageAutomations, persisted: StageAutomations) {
  const expectedCount = Object.values(expected).reduce((total, actions) => total + actions.length, 0);
  const persistedCount = Object.values(persisted).reduce((total, actions) => total + actions.length, 0);
  if (expectedCount !== persistedCount) {
   throw new Error(`O servidor devolveu ${persistedCount} gatilho(s), mas o rascunho tinha ${expectedCount}.`);
  }

  for (const [stageId, actions] of Object.entries(expected)) {
   const persistedActions = persisted[stageId] ?? [];
   for (const expectedAction of actions) {
    const savedAction = persistedActions.find((item) => item.id === expectedAction.id);
    if (!savedAction) {
     throw new Error(`O gatilho "${expectedAction.title}" não foi encontrado depois do salvamento.`);
    }
    if (stageActionStamp(savedAction.execution ?? {}) !== stageActionStamp(expectedAction.execution ?? {})) {
     throw new Error(`As opções de execução de "${expectedAction.title}" não permaneceram salvas.`);
    }

    const expectedTrigger = expectedAction.execution?.trigger;
    const savedTrigger = savedAction.execution?.trigger;
    if (expectedTrigger && typeof expectedTrigger === "object") {
     const expectedSpec = expectedTrigger as { kind?: string; fieldId?: string; fieldName?: string };
     if (expectedSpec.kind === "field-updated" || expectedSpec.kind === "hours-before-field") {
      const savedSpec = (savedTrigger && typeof savedTrigger === "object" ? savedTrigger : {}) as {
       kind?: string;
       fieldId?: string;
       fieldName?: string;
      };
      if (
       savedSpec.kind !== expectedSpec.kind ||
       String(savedSpec.fieldId ?? "") !== String(expectedSpec.fieldId ?? "") ||
       String(savedSpec.fieldName ?? "") !== String(expectedSpec.fieldName ?? "")
      ) {
       throw new Error(`O campo personalizado do gatilho "${expectedAction.title}" não permaneceu salvo.`);
      }
     }
    }

    const expectedConditions = (expectedAction.execution?.conditions ?? [])
     .filter((condition) => condition.field === "custom-field")
     .map((condition) => ({
      id: condition.customFieldId ?? "",
      name: condition.customFieldNome ?? "",
      op: condition.op,
      value: condition.value,
     }));
    const savedConditions = (savedAction.execution?.conditions ?? [])
     .filter((condition) => condition.field === "custom-field")
     .map((condition) => ({
      id: condition.customFieldId ?? "",
      name: condition.customFieldNome ?? "",
      op: condition.op,
      value: condition.value,
     }));
    if (JSON.stringify(savedConditions) !== JSON.stringify(expectedConditions)) {
     throw new Error(`As condições por campo personalizado de "${expectedAction.title}" não permaneceram salvas.`);
    }
   }
  }
 }

  async function saveAutomatize(nextDraft = draft, keepEditing = false) {
    if (!nextDraft || !funnelId || savingAutomations) throw new Error("Aguarde o salvamento atual.");
    setDraft(nextDraft);
    const requestKey = stageAutomationDraftStorageKey(funnelId)+":apply-request";
    try {
      localStorage.setItem(stageAutomationDraftStorageKey(funnelId),JSON.stringify(nextDraft));
      automationSaveRequest.current ??= sessionStorage.getItem(requestKey) || crypto.randomUUID();
      sessionStorage.setItem(requestKey,automationSaveRequest.current);
    } catch { automationSaveRequest.current ??= crypto.randomUUID(); }
    setSavingAutomations(true);
    try {
      const draftList = Object.entries(nextDraft);
      const expectedCount = draftList.reduce((total, [_, actions]) => total + (actions?.length ?? 0), 0);
      
      const saved = await saveStageAutomationsServer({ 
        data: { 
          pipelineId: funnelId, 
          automations: nextDraft as Record<string, unknown[]>,
          applyRequestId: automationSaveRequest.current
        } 
      });

      if (Number(saved.count ?? 0) !== expectedCount) {
        throw new Error(`O servidor confirmou ${Number(saved.count ?? 0)} gatilho(s), mas deveriam ser ${expectedCount}.`);
      }

      const backfilledTotal = Number(saved.backfilled ?? 0);

      const verified = await listStageAutomationsServer({ data: { pipelineId: funnelId } });
      const persisted = (verified.automations ?? {}) as StageAutomations;
      assertAutomationPersistence(Object.fromEntries(Object.entries(nextDraft).map(([id,actions])=>[id,actions.map(action=>({...action,...(action.execution?{execution:{...action.execution,applyToExisting:false}}:{})}))])), persisted);
      
      setAutomations(persisted);
      
      if (backfilledTotal > 0) {
        toast.success(`${backfilledTotal} lead(s) já existentes entraram na fila do gatilho.`);
      }

      try { 
        localStorage.setItem(stageAutomationStorageKey(funnelId), JSON.stringify(persisted));
        localStorage.removeItem(stageAutomationDraftStorageKey(funnelId)); 
      } catch (e) {
        console.warn("Erro ao atualizar cache local:", e);
      }

      automationSaveRequest.current = null;
      try { sessionStorage.removeItem(requestKey); } catch { /* confirmação já recebida */ }
      setDraft(keepEditing ? persisted : null);
      setConfiguring(null);
      setColorMode(false);
      setSelectedColorStageId(null);
      if (!keepEditing) setMode("view");
      toast.success("Automações salvas com sucesso.");
    } catch (error) {
      console.error("Erro ao salvar automações do CRM:", error);
      toast.error(`${error instanceof Error ? error.message : "Não foi possível salvar as automações."} Seu rascunho continua guardado neste navegador.`);
      if (keepEditing) throw error;
    } finally {
      setSavingAutomations(false);
    }
  }
  function addTrigger(stageId: string, item: TriggerCatalogItem) {
    const newActionId = `${item.id}-${Date.now()}`;
    setDraft((prev) => {
      const base = prev ?? automations;
      const existing = base[stageId] ?? [];
      const kind = configKindFor(item.id);
      
      const initialConfig: AutomationConfig = kind === "webhook"
        ? { kind: "webhook", preset: WEBHOOK_PRESET_BY_TRIGGER[item.id] ?? "custom", method: "POST" }
        : kind === "webhook-inbound"
          ? { kind: "webhook-inbound", createInStageId: stageId, mapName: "name", mapEmail: "email", mapPhone: "phone" }
          : ({ kind } as AutomationConfig);
      
      const next: AutomationAction = {
        id: newActionId,
        triggerId: item.id,
        title: item.title,
        description: item.description,
        channel: item.channel,
        enabled: true,
        config: initialConfig,
        execution: { trigger: { kind: "created-or-moved" } }
      };
      
      const result = { ...base, [stageId]: [...existing, next] };
      if (funnelId) {
        try { localStorage.setItem(stageAutomationDraftStorageKey(funnelId), JSON.stringify(result)); } catch (e) { /* noop */ }
      }
      return result;
    });
    setTriggerStage(null);
    if (triggerHasConfigUI(item.id) && configKindFor(item.id) !== "none") {
      setConfiguring({ stageId, actionId: newActionId });
    }
  }
 function duplicateTrigger(stageId: string, actionId: string) {
 setDraft((prev) => {
  const base = prev ?? automations;
  const list = base[stageId] ?? [];
  const idx = list.findIndex((a) => a.id === actionId);
  if (idx < 0) return base;
  const original = list[idx]!;
  const copy: AutomationAction = {
   ...structuredClone(original),
   id: `${original.triggerId}-${Date.now()}`,
   title: original.title,
  };
  const next = [...list];
  next.splice(idx + 1, 0, copy);
  return { ...base, [stageId]: next };
 });
 toast.success("Gatilho duplicado. Ajuste o que precisar e salve.");
 }
  function removeTrigger(stageId: string, actionId: string) {
    setDraft((prev) => {
      const base = prev ?? automations;
      const next = { ...base, [stageId]: (base[stageId] ?? []).filter((a) => a.id !== actionId) };
      if (funnelId) {
        try { localStorage.setItem(stageAutomationDraftStorageKey(funnelId), JSON.stringify(next)); } catch (e) { /* noop */ }
      }
      return next;
    });
  }
  function updateActionConfig(stageId: string, actionId: string, patch: Partial<AutomationAction>) {
    setDraft((prev) => {
      const base = prev ?? automations;
      const next = {
        ...base,
        [stageId]: (base[stageId] ?? []).map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
      };
      if (funnelId) {
        try { localStorage.setItem(stageAutomationDraftStorageKey(funnelId), JSON.stringify(next)); } catch (e) { /* noop */ }
      }
      return next;
    });
  }
  function toggleTrigger(stageId: string, actionId: string, enabled: boolean) {
    updateActionConfig(stageId, actionId, { enabled });
  }
  function extendTriggerToStage(originStageId: string, actionId: string, targetStageId: string) {
    if (!funnel) return;
    const stages = funnel.stages;
    const originIdx = stages.findIndex((s) => s.id === originStageId);
    const targetIdx = stages.findIndex((s) => s.id === targetStageId);
    if (originIdx < 0 || targetIdx < 0) return;
    const from = Math.min(originIdx, targetIdx);
    const to = Math.max(originIdx, targetIdx);
    const range = stages.slice(from, to + 1).map((s) => s.id);
    updateActionConfig(originStageId, actionId, { stageIds: range });
  }

 // Move um gatilho inteiro de uma etapa para outra (arrastar pra reposicionar).
 function moveTriggerToStage(originStageId: string, actionId: string, targetStageId: string) {
  if (!funnel || originStageId === targetStageId) return;
  const stages = funnel.stages;
  const targetIdx = stages.findIndex((s) => s.id === targetStageId);
  if (targetIdx < 0) return;
  setDraft((prev) => {
   const base = prev ?? automations;
   const origin = base[originStageId] ?? [];
   const action = origin.find((a) => a.id === actionId);
   if (!action) return base;
   // preserva quantas etapas o gatilho cobre, a partir do novo ponto de origem
   const span = Math.max(1, action.stageIds?.length ?? 1);
   const range = stages.slice(targetIdx, targetIdx + span).map((s) => s.id);
   const moved: AutomationAction = {
    ...action,
    stageIds: range.length > 1 ? range : undefined,
   };
   return {
    ...base,
    [originStageId]: origin.filter((a) => a.id !== actionId),
    [targetStageId]: [...(base[targetStageId] ?? []), moved],
   };
  });
 }



 function reorderStages(fromStageId: string, toStageId: string) {
  if (!funnel || fromStageId === toStageId) return;
  const targetFunnelId = funnel.id;
  let nextStageIds: string[] = [];
  setFunnels((prev) =>
   prev.map((f) => {
    if (f.id !== targetFunnelId) return f;
    const next = [...f.stages];
    const fromIdx = next.findIndex((s) => s.id === fromStageId);
    const toIdx = next.findIndex((s) => s.id === toStageId);
    const boundedTo = Math.max(0, Math.min(toIdx, next.length - 1));
    if (fromIdx < 0 || fromIdx >= next.length || boundedTo < 0 || boundedTo >= next.length) return f;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(boundedTo, 0, moved);
    nextStageIds = next.map((s) => s.id);
    return { ...f, stages: next };
   }),
  );
  if (nextStageIds.length) {
   reorderStagesServer({ data: { pipelineId: targetFunnelId, stageIds: nextStageIds } }).catch((e) => {
    console.error("reorderStages", e);
    if (crmSourceId) void reloadFunnels(crmSourceId);
   });
  }
 }

 function renameStage(stageId: string, name: string) {
  if (!funnel) return;
  const targetFunnelId = funnel.id;
  setFunnels((prev) =>
   prev.map((f) =>
    f.id !== targetFunnelId
     ? f
     : { ...f, stages: f.stages.map((s) => (s.id === stageId ? { ...s, name } : s)) },
   ),
  );
  updateStageServer({ data: { stageId, name } }).catch((e) => {
   console.error("renameStage", e);
   if (crmSourceId) void reloadFunnels(crmSourceId);
  });
 }

 function setStageColor(stageId: string, color: string | null) {
  if (!funnel) return;
  const targetFunnelId = funnel.id;
  setFunnels((prev) =>
   prev.map((f) =>
    f.id !== targetFunnelId
     ? f
     : { ...f, stages: f.stages.map((s) => (s.id === stageId ? { ...s, color } : s)) },
   ),
  );
  updateStageServer({ data: { stageId, color } }).catch((e) => {
   console.error("setStageColor", e);
   if (crmSourceId) void reloadFunnels(crmSourceId);
  });
  }

  function setStageDescription(stageId: string, description: string | null) {
   if (!funnel) return;
   const targetFunnelId = funnel.id;
   const next = description && description.trim().length > 0 ? description.trim() : null;
   setFunnels((prev) =>
    prev.map((f) =>
     f.id !== targetFunnelId
      ? f
      : { ...f, stages: f.stages.map((s) => (s.id === stageId ? { ...s, description: next } : s)) },
    ),
   );
   updateStageServer({ data: { stageId, description: next } }).catch((e) => {
    console.error("setStageDescription", e);
    if (crmSourceId) void reloadFunnels(crmSourceId);
   });
  }



 async function addStage(insertAfterIndex?: number) {
  if (!funnel) return;
  try {
   const res = await createStageServer({ data: { pipelineId: funnel.id, name: "Nova etapa" } });
   const newId = (res as { stageId?: string } | undefined)?.stageId;
   if (newId && typeof insertAfterIndex === "number") {
    const currentIds = funnel.stages.map((s) => s.id).filter((id) => id !== newId);
    const insertAt = Math.max(0, Math.min(insertAfterIndex + 1, currentIds.length));
    const nextOrder = [...currentIds.slice(0, insertAt), newId, ...currentIds.slice(insertAt)];
    try {
     await reorderStagesServer({ data: { pipelineId: funnel.id, stageIds: nextOrder } });
    } catch (e) {
     console.error("addStage/reorder", e);
    }
   }
   if (crmSourceId) await reloadFunnels(crmSourceId);
   if (newId) setPendingRenameStageId(newId);
  } catch (e) {
   console.error("addStage", e);
   window.alert((e as Error).message || "Falha ao criar etapa.");
  }
 }


 async function deleteStage(stageId: string) {
  if (!funnel) return;
  const stage = funnel.stages.find((s) => s.id === stageId);
  if (!stage) return;
  const idx = funnel.stages.findIndex((s) => s.id === stageId);
  if (idx <= 0) {
   window.alert("A etapa de entrada de lead não pode ser excluída.");
   return;
  }
  const leadCount = stage.leads.length;
  const msg = leadCount > 0
   ? `Excluir a etapa "${stage.name}"? Os ${leadCount} lead(s) serão movidos para a etapa anterior.`
   : `Excluir a etapa "${stage.name}"?`;
  if (!window.confirm(msg)) return;
  const fallback = funnel.stages[idx - 1]?.id;
  // Remove localmente automações da etapa
  setAutomations((prev) => { const n = { ...prev }; delete n[stageId]; return n; });
  setDraft((prev) => { if (!prev) return prev; const n = { ...prev }; delete n[stageId]; return n; });
  try {
   await deleteStageServer({ data: { stageId, fallbackStageId: fallback } });
   if (crmSourceId) await reloadFunnels(crmSourceId);
  } catch (e) {
   console.error("deleteStage", e);
   window.alert((e as Error).message || "Falha ao excluir etapa.");
   if (crmSourceId) void reloadFunnels(crmSourceId);
  }
 }

 function handleLeadClick(lead: CrmLead) {
  if (selectedLeadIds.size > 0) { onToggleLeadSelection(lead.id); return; }
  funnelDrawerRef.current?.open(lead);
 }

 function moveLead(leadId: string, fromStageId: string, toStageId: string) {
 if (fromStageId === toStageId ||!funnel) return;
 const targetFunnelId = funnel.id;
 setFunnels((prev) =>
 prev.map((f) => {
 if (f.id!== targetFunnelId) return f;
 let moving: CrmLead | undefined;
 const stages = f.stages.map((s) => {
 if (s.id!== fromStageId) return s;
 moving = s.leads.find((l) => l.id === leadId);
 return {...s, leads: s.leads.filter((l) => l.id!== leadId) };
 });
 if (!moving) return f;
 const moved: CrmLead = {...moving}; // Mover etapa não equivale a ler ou responder uma mensagem.
 return {
...f,
 stages: stages.map((s) =>
 s.id === toStageId? {...s, leads: [moved,...s.leads] }: s,
 ),
 };
 }),
 );
 (async () => {
  try {
    const moveResult = (await moveLeadServer({ data: { leadId, toStageId } })) as {
      automations?: Array<{ actionId: string; title: string; ok: boolean; error?: string; skipped?: boolean }>;
      automationQueued?: boolean;
      backendPending?: boolean;
      moved?: boolean;
    };
    // Os gatilhos são enfileirados e executados no servidor — funcionam mesmo
    // com o navegador fechado. Aqui só mostramos o retorno da execução imediata.
    const results = moveResult?.automations ?? [];
    if (moveResult?.backendPending) toast.info("Etapa salva. Gatilhos automáticos ainda dependem da integração de execução.");
    if (moveResult?.automationQueued) toast.success("Etapa atualizada. Gatilhos enviados à fila de execução.");
    if (results.length > 0) {
     const failed = results.filter((r) => !r.ok && !r.skipped);
     if (failed.length > 0) {
      toast.error(`${failed.length} gatilho(s) falharam: ${failed.map((item) => `${item.title}: ${item.error ?? "erro"}`).join(" · ")}`);
     } else {
      const executed = results.filter((r) => r.ok && !r.skipped).length;
      const queued = results.filter((r) => r.skipped).length;
      if (executed > 0) toast.success(`${executed} gatilho(s) executado(s).`);
      if (queued > 0) toast.info(`${queued} gatilho(s) agendado(s) no servidor.`);
     }
    }
    if (crmSourceId) await reloadFunnels(crmSourceId);
  } catch (e) {
   console.error("moveLead", e);
   toast.error(e instanceof Error ? e.message : "Não foi possível confirmar a movimentação. O funil será atualizado.");
   if (crmSourceId) void reloadFunnels(crmSourceId).catch((err) => console.error("moveLead rollback", err));
  }
 })();
 }


   // ---- Novo Lead (dialog) ----
   const createLeadServer = createSlimLead;

  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: "", phone: "", email: "", value: "", stageId: "" });
  const [newLeadSaving, setNewLeadSaving] = useState(false);
  const [newLeadError, setNewLeadError] = useState<string | null>(null);
  const newLeadRequestId = useRef<string | null>(null);

  function openNewLead() {
    if (!crmSourceId || !funnel) return;
    const firstStage = funnel.stages[0]?.id ?? "";
    newLeadRequestId.current = crypto.randomUUID();
    setNewLeadForm({ name: "", phone: "", email: "", value: "", stageId: firstStage });
    setNewLeadError(null);
    setNewLeadOpen(true);
  }

  async function submitNewLead() {
    if (!crmSourceId || !funnel) return;
    const name = newLeadForm.name.trim();
    if (!name) { setNewLeadError("Informe o nome do lead."); return; }
    const stageId = newLeadForm.stageId || funnel.stages[0]?.id;
    if (!stageId) { setNewLeadError("Nenhuma etapa disponível."); return; }
    const rawValue = newLeadForm.value.replace(/[^\d.,-]/g, "").replace(",", ".");
    const numValue = rawValue ? Number(rawValue) : 0;
    if (!newLeadRequestId.current) newLeadRequestId.current = crypto.randomUUID();
    setNewLeadSaving(true);
    setNewLeadError(null);
    try {
      const created = (await createLeadServer({
        data: {
          crmSourceId,
          pipelineId: funnel.id,
          stageId,
          name,
          email: newLeadForm.email.trim(),
          phone: newLeadForm.phone.trim(),
          value: Number.isFinite(numValue) ? numValue : 0,
          requestId: newLeadRequestId.current,
        },
      }));
      newLeadRequestId.current = null;
      setNewLeadOpen(false);
      toast.success(created.automationQueued ? "Cliente criado. Gatilhos registrados para execução." : "Cliente criado com sucesso.");
      try {
        await reloadFunnels(crmSourceId);
      } catch {
        toast.info("Cliente criado. Atualize o funil para ver o cartão.");
      }
    } catch (e) {
      setNewLeadError(e instanceof Error ? e.message : "Falha ao criar lead.");
    } finally {
      setNewLeadSaving(false);
    }
  }

  return (

  <div className="h-screen flex overflow-hidden bg-background text-foreground">
 <AppSidebar />

  <div className="flex-1 flex flex-col min-w-0 min-h-0">
 {/* Header compacto: título + funil + filtros + ações em uma faixa só */}
 <div className="border-b border-border bg-card">
 <div className="px-5 py-2.5 flex flex-wrap items-center gap-2">
 <div className="flex items-center gap-2 min-w-0">
 <span className="text-[10px] font-semibold tracking-widest text-primary/80 uppercase">
 CRM
 </span>
 <span className="text-muted-foreground/40">/</span>
 <h1 className="text-sm font-semibold tracking-tight truncate">
 Funis de venda
 </h1>
 </div>

 <FunnelSelector
  onCreate={() => { setNewFunnelName(""); setNewFunnelOpen(true); }}
  funnels={funnels}
  currentId={funnelId}
  onChange={setFunnelId}
  editable={mode === "automatize"}
  onMove={moveFunnel}
  onDelete={removeFunnel}

  onRename={async (id, name) => {
   setFunnels((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
   try { await renamePipelineServer({ data: { pipelineId: id, name } }); }
   catch (e) { console.error("renamePipeline", e); }
  }}
 />


 <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
 <span className="font-semibold text-foreground">{summary.total}</span> leads
 <span className="text-muted-foreground/40">·</span>
 <span className="font-semibold text-foreground">{summary.abertas}</span> abertas
 <span className="text-muted-foreground/40">·</span>
 <span className="font-semibold text-foreground">{formatBRL(summary.valorAbertas)}</span> em aberto
 {mode === "automatize" && (
 <span className="ml-2 text-primary font-semibold">· modo automações</span>
 )}
 {syncMsg && <span className="ml-2 text-primary">· {syncMsg}</span>}
 </div>


              <div className="flex-1" />

              {mode === "view" && (<>
              <button
                onClick={toggleHideEntry}
                title={hideEntry ? "Mostrar etapa de entrada" : "Ocultar etapa de entrada"}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-[11px] transition-colors",
                  hideEntry
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <FolderX className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{hideEntry ? "Entrada oculta" : "Ocultar entrada"}</span>
              </button>





 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
 <Input
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 placeholder="Buscar nome, empresa, tag ou mensagem"
 className="h-8 w-64 pl-8 text-xs"
 />
 </div>

 <LeadFiltersPopover
 sources={ALL_SOURCES}
 selectedSources={sourceFilters}
 onToggleSource={(s) =>
 setSourceFilters((prev) =>
 prev.includes(s)? prev.filter((x) => x!== s): [...prev, s]
 )
 }
 availableTags={availableTags}
 selectedTags={tagFilters}
 onToggleTag={(t) =>
 setTagFilters((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
 }
 onlyWaiting={onlyWaiting}
 setOnlyWaiting={setOnlyWaiting}
 onlyWithValue={onlyWithValue}
 setOnlyWithValue={setOnlyWithValue}
 onlyUnread={onlyUnread}
 setOnlyUnread={setOnlyUnread}
 minValue={minValue}
 setMinValue={setMinValue}
 onClear={() => {
 setSourceFilters([]);
 setTagFilters([]);
 setOnlyWaiting(false);
 setOnlyWithValue(false);
 setOnlyUnread(false);
 setMinValue("");
 }}
 />

 <ToggleGroup
 value={view}
 onChange={(v) => setView(v as View)}
 options={[
 { value: "kanban", label: "Kanban", icon: KanbanSquare },
 { value: "lista", label: "Lista", icon: List },
 ]}
 />
              </>)}


  {mode === "view" ? (
    <div className="flex items-center gap-2">
      {/* Bulk move button handled in the selection bar below header */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={openNewLead}
        disabled={!funnel || !crmSourceId}
      >
        <UserPlus className="w-3.5 h-3.5" /> Novo Lead
      </Button>
      <Button
        size="sm"
        onClick={enterAutomatize}
        className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Zap className="w-3.5 h-3.5" /> Automatize
      </Button>
    </div>
  ) : (
  <>
   <Button
     variant="outline"
     size="sm"
     onClick={handleDuplicateFunnel}
     disabled={duplicatingPipe || !funnel}
     className="h-8 text-xs gap-1.5"
   >
      <Copy className="w-3.5 h-3.5" /> {duplicatingPipe ? "Duplicando..." : "Duplicar"}
    </Button>
    <Button
   variant="outline"
   size="sm"
   onClick={() => {
    setColorMode((v) => !v);
   setSelectedColorStageId(null);
  }}
  className={cn(
   "h-8 text-xs gap-1.5",
   colorMode && "border-primary/50 bg-primary/10 text-primary",
  )}
  >
 <Palette className="w-3.5 h-3.5" /> Cores
 </Button>
 <Button variant="outline" size="sm" onClick={cancelAutomatize} className="h-8 text-xs gap-1.5">
 <X className="w-3.5 h-3.5" /> Cancelar
 </Button>
 <Button
 size="sm"
 onClick={() => void saveAutomatize()}
  disabled={savingAutomations}
 className="h-8 text-xs gap-1.5 bg-success text-success-foreground hover:bg-success/90"
 >
  <Save className="w-3.5 h-3.5" /> {savingAutomations ? "Salvando..." : "Salvar"}
 </Button>
 </>
 )}

  </div>
  </div>
  
  {mode === "view" && selectedLeadIds.size > 0 && (
    <div className="mx-6 mt-2 flex items-center gap-3 p-2 px-4 rounded-lg bg-primary/5 border border-primary/20 animate-in slide-in-from-top-2">
      <div className="text-[11px] font-semibold text-primary">
        {selectedLeadIds.size} {selectedLeadIds.size === 1 ? "lead selecionado" : "leads selecionados"}
      </div>
      <div className="h-4 w-px bg-primary/20 mx-1" />
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 text-[10px] text-primary hover:bg-primary/10"
        onClick={() => setBulkMoveDialogOpen(true)}
      >
        <ArrowRightLeft className="w-3 h-3 mr-1" /> Mover etapa
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 text-[10px] text-destructive hover:bg-destructive/10"
        onClick={() => {
          if (confirm(`Excluir ${selectedLeadIds.size} leads permanentemente?`)) {
            Promise.all(Array.from(selectedLeadIds).map(id => deleteLead({ data: { leadId: id } })))
              .then(() => {
                toast.success("Leads excluídos");
                setSelectedLeadIds(new Set());
                reloadFunnels(crmSourceId);
              })
              .catch(err => toast.error("Erro ao excluir alguns leads"));
          }
        }}
      >
        <Trash2 className="w-3 h-3 mr-1" /> Excluir
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 text-[10px] hover:bg-accent"
        onClick={() => setSelectedLeadIds(new Set())}
      >
        Desmarcar todos
      </Button>
    </div>
  )}

 {/* Board */}
  <KanbanScrollArea>
 <div className="min-w-max h-full px-6 py-4">
 {!filteredFunnel? (
 <EmptyFunnelState
 bootstrapping={bootstrapping}
 hasSource={!!crmSourceId}
 onCreate={handleCreateDefaultFunnel}
 />
 ): view === "kanban"? (
 <KanbanBoard
 funnel={filteredFunnel}
 mode={mode}
 automations={activeAutomations}
  onLeadClick={handleLeadClick}
  selectedLeadIds={selectedLeadIds}
  onToggleLeadSelection={onToggleLeadSelection}
  onBatchToggleLeads={onBatchToggleLeads}
  onBulkEdit={() => setBulkMoveDialogOpen(true)}
 onOpenTriggers={(stageId) => setTriggerStage(stageId)}
onRemoveTrigger={removeTrigger}
onDuplicateTrigger={duplicateTrigger}
onConfigureTrigger={(stageId, actionId) => setConfiguring({ stageId, actionId })}
 onExtendTrigger={extendTriggerToStage}
 onMoveTrigger={moveTriggerToStage}

 onSaveExecutionTrigger={(stageId, actionId, execution) => {
   const base = draft ?? automations;
   const next = {...base, [stageId]:(base[stageId]??[]).map(a=>a.id===actionId?{...a,execution}:a)};
   return saveAutomatize(next,true);
 }}
 onToggleTrigger={(stageId, actionId, enabled) => updateActionConfig(stageId, actionId, { enabled })}
   onReorderStages={reorderStages}
   onRenameStage={renameStage}
   onStageColor={setStageColor}
   onStageDescription={setStageDescription}
    colorMode={colorMode}
    selectedColorStageId={selectedColorStageId}
    onSelectColorStage={setSelectedColorStageId}
   canReorderStages={mode === "automatize"}
   onLeadDrop={moveLead}
    onAddStage={addStage}
    onDeleteStage={deleteStage}
    pendingRenameStageId={pendingRenameStageId}
     onConsumePendingRename={() => setPendingRenameStageId(null)}
     onQuickEdit={setQuickEditingLead}
   />


 ): (
 <ListBoard
 funnel={filteredFunnel}
 onLeadClick={handleLeadClick}
 />
 )}
 </div>
 </KanbanScrollArea>

  {mode === "automatize" && colorMode && filteredFunnel && (
  <StageColorFloatingPanel
  stages={filteredFunnel.stages}
  selectedStageId={selectedColorStageId}
  onSelectStage={setSelectedColorStageId}
  onPickColor={(stageId: string, color: string | null) => setStageColor(stageId, color)}
  />
  )}



 {/* Footer */}
 <div className="border-t border-border px-6 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-card">
 <div>
 <strong className="text-foreground/80">Vanessa Simoni</strong> · CRM e
 automação para vender com mais clareza.
 </div>
 <div className="flex items-center gap-4">
 <span>Início</span>
 <span>CRM</span>
 <span>Integrações</span>
 </div>
 </div>
 </div>

  <BulkMoveDialog
    open={bulkMoveDialogOpen}
    onClose={() => setBulkMoveDialogOpen(false)}
    funnels={funnels}
    onConfirm={async (targetPipelineId: string, targetStageId: string) => {
      setBulkMoving(true);
      try {
        const leadIds = Array.from(selectedLeadIds).sort();
        const key = JSON.stringify([targetPipelineId,targetStageId,leadIds]);
        if (!bulkMoveRequest.current || bulkMoveRequest.current.key !== key) {
          bulkMoveRequest.current = {key,requestId:crypto.randomUUID()};
        }
        const result = await bulkMoveLeadsFn({
          data: {
            leadIds,
            targetPipelineId,
            targetStageId,
            requestId: bulkMoveRequest.current.requestId,
          }
        });
        bulkMoveRequest.current = null;
        toast.success(result.movedCount > 0
          ? `${result.movedCount} cliente(s) movido(s).${result.unchangedCount ? ` ${result.unchangedCount} já estava(m) na etapa.` : ""}`
          : "Os clientes selecionados já estão nessa etapa.");
        setSelectedLeadIds(new Set());
        setBulkMoveDialogOpen(false);
        try {
          await reloadFunnels(crmSourceId);
        } catch {
          toast.info("Movimentação confirmada. Atualize o funil para ver os cartões.");
        }
      } catch (error) {
        console.error("bulkMoveError", error);
        toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a movimentação.");
      } finally {
        setBulkMoving(false);
      }
    }}
    loading={bulkMoving}
  />

  <TriggerCatalogDialog
  open={triggerStage!== null}
  stageName={
  triggerStage && funnel? funnel.stages.find((s) => s.id === triggerStage)?.name?? "": ""
  }
  onClose={() => setTriggerStage(null)}
  onPick={(item) => triggerStage && addTrigger(triggerStage, item)}
  />

  {configuring && (() => {
   const currentAction = (activeAutomations[configuring.stageId] ?? []).find((a) => a.id === configuring.actionId);
   if (!currentAction) return null;
    return (
     <AutomationConfigDialog
      action={currentAction}
      funnels={funnels}
      sourceStageId={configuring.stageId}
      currentFunnel={funnel}
      onClose={() => setConfiguring(null)}
      onSave={(patch) => {
      updateActionConfig(configuring.stageId, configuring.actionId, patch);
      setConfiguring(null);
     }}
    />
   );
 })()}

 <Dialog open={newFunnelOpen} onOpenChange={(o) => { if (!creatingFunnel) setNewFunnelOpen(o); }}>
   <DialogContent className="sm:max-w-md">
     <DialogHeader>
       <DialogTitle>Novo funil</DialogTitle>
     </DialogHeader>
     <div className="space-y-3">
       <div className="space-y-1.5">
         <label className="text-xs font-medium text-muted-foreground">Nome do funil</label>
         <Input
           autoFocus
           value={newFunnelName}
           onChange={(e) => setNewFunnelName(e.target.value)}
           onKeyDown={(e) => { if (e.key === "Enter") handleCreateFunnel(); }}
           placeholder="Ex.: Funil de Recuperação"
           maxLength={120}
         />
       </div>
       <p className="text-[11px] text-muted-foreground">
         O funil é criado com as etapas padrão. Você pode renomear, colorir e reordenar depois.
       </p>
       <div className="flex justify-end gap-2 pt-1">
         <button
           type="button"
           onClick={() => setNewFunnelOpen(false)}
           disabled={creatingFunnel}
           className="h-8 px-3 rounded-md border border-border text-xs hover:bg-accent transition-colors disabled:opacity-50"
         >
           Cancelar
         </button>
         <button
           type="button"
           onClick={handleCreateFunnel}
           disabled={creatingFunnel || !newFunnelName.trim() || !crmSourceId}
           className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
         >
           {creatingFunnel ? "Criando..." : "Criar funil"}
         </button>
       </div>
     </div>
   </DialogContent>
 </Dialog>

 <Dialog open={newLeadOpen} onOpenChange={(o) => { if (!newLeadSaving) setNewLeadOpen(o); }}>
   <DialogContent className="sm:max-w-md">
     <DialogHeader>
       <DialogTitle>Novo lead</DialogTitle>
     </DialogHeader>
     <div className="space-y-3">
       <div className="space-y-1.5">
         <label className="text-xs font-medium text-muted-foreground">Nome *</label>
         <Input
           value={newLeadForm.name}
           onChange={(e) => setNewLeadForm((f) => ({ ...f, name: e.target.value }))}
           placeholder="Ex: Maria Silva"
           autoFocus
         />
       </div>
       <div className="grid grid-cols-2 gap-2">
         <div className="space-y-1.5">
           <label className="text-xs font-medium text-muted-foreground">Telefone</label>
           <Input
             value={newLeadForm.phone}
             onChange={(e) => setNewLeadForm((f) => ({ ...f, phone: e.target.value }))}
             placeholder="(11) 90000-0000"
           />
         </div>
         <div className="space-y-1.5">
           <label className="text-xs font-medium text-muted-foreground">E-mail</label>
           <Input
             type="email"
             value={newLeadForm.email}
             onChange={(e) => setNewLeadForm((f) => ({ ...f, email: e.target.value }))}
             placeholder="lead@empresa.com"
           />
         </div>
       </div>
       <div className="grid grid-cols-2 gap-2">
         <div className="space-y-1.5">
           <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
           <Input
             inputMode="decimal"
             value={newLeadForm.value}
             onChange={(e) => setNewLeadForm((f) => ({ ...f, value: e.target.value }))}
             placeholder="0,00"
           />
         </div>
         <div className="space-y-1.5">
           <label className="text-xs font-medium text-muted-foreground">Etapa</label>
           <select
             value={newLeadForm.stageId}
             onChange={(e) => setNewLeadForm((f) => ({ ...f, stageId: e.target.value }))}
             className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
           >
             {(funnel?.stages ?? []).map((s) => (
               <option key={s.id} value={s.id}>{s.name}</option>
             ))}
           </select>
         </div>
       </div>
       {newLeadError && <p className="text-xs text-destructive">{newLeadError}</p>}
       <div className="flex justify-end gap-2 pt-2">
         <Button variant="outline" size="sm" onClick={() => setNewLeadOpen(false)} disabled={newLeadSaving}>
           Cancelar
         </Button>
         <Button size="sm" onClick={submitNewLead} disabled={newLeadSaving}>
           {newLeadSaving ? "Criando…" : "Criar lead"}
         </Button>
       </div>
     </div>
   </DialogContent>
 </Dialog>
       <SlimFunnelLeadDrawer ref={funnelDrawerRef} onEdit={setQuickEditingLead} />
       <QuickEditDialog
         lead={quickEditingLead}
         open={!!quickEditingLead}
         onOpenChange={(o: boolean) => { 
           if (!o) {
             if (quickEditingLead) quickEditCheckpoints.current.delete(quickEditingLead.id);
             setQuickEditingLead(null);
             // Garantimos um refresh visual ao fechar, caso algo tenha mudado sem disparar efeito
             void reloadFunnels(crmSourceId).catch(() => toast.info("Atualize o funil para conferir os dados mais recentes."));
           }
         }}
        funnels={funnels}
        users={workspaceUsers}
        onSave={async (data, baseline) => {
          if (!quickEditingLead) return;
          const leadId = quickEditingLead.id;
          let checkpoint = quickEditCheckpoints.current.get(leadId);
          if (!checkpoint) {
            checkpoint = {
              basic: quickEditBasicValues(baseline),
              customFields: {...baseline.customFields},
              pipelineId: baseline.pipelineId,
              stageId: baseline.stageId,
              hasConfirmedData: false,
            };
            quickEditCheckpoints.current.set(leadId, checkpoint);
          }
          let phase: "data" | "stage" = "data";
          try {
            // Somente mudanças reais em relação aos valores carregados ou já confirmados.
            const values = quickEditBasicValues(data);
            const patch = Object.fromEntries(Object.entries(values).filter(([key,value]) =>
              value !== checkpoint.basic[key as keyof QuickEditBasicValues],
            )) as Partial<QuickEditBasicValues>;
            if (Object.keys(patch).length > 0) {
              const { updateLead } = await import("@/lib/leads.functions");
              const result = await updateLead({data:{leadId,patch}});
              if (result?.ok !== true) throw new Error("A gravação dos campos não foi confirmada.");
              if (quickEditCheckpoints.current.get(leadId) !== checkpoint) return;
              checkpoint.basic = {...checkpoint.basic,...patch};
              checkpoint.hasConfirmedData = true;
            }

            const customChanges = Object.entries(data.customFields ?? {}).filter(([fieldId,value]) =>
              String(value ?? "") !== String(checkpoint.customFields[fieldId] ?? ""),
            );
            if (customChanges.length > 0) {
              const { setLeadCustomFieldValue } = await import("@/lib/leads.functions");
              for (const [fieldId,value] of customChanges) {
                const text = String(value ?? "");
                const result = await setLeadCustomFieldValue({data:{leadId,fieldId,value:text}});
                if (result?.ok !== true || result.fieldId !== fieldId || result.value !== text)
                  throw new Error("A gravação de um campo personalizado não foi confirmada.");
                if (quickEditCheckpoints.current.get(leadId) !== checkpoint) return;
                checkpoint.customFields[fieldId] = text;
                checkpoint.hasConfirmedData = true;
              }
            }

            // 3. Mover de etapa se necessário
            phase = "stage";
            if (data.pipelineId && data.stageId && (data.pipelineId !== checkpoint.pipelineId || data.stageId !== checkpoint.stageId)) {
              const result = await moveSlimLead({data:{leadId,toStageId:data.stageId}});
              if (result?.ok !== true) throw new Error("A mudança de etapa não foi confirmada.");
              if (quickEditCheckpoints.current.get(leadId) !== checkpoint) return;
              checkpoint.pipelineId = data.pipelineId;
              checkpoint.stageId = data.stageId;
            }
          } catch (e) {
            if (quickEditCheckpoints.current.get(leadId) !== checkpoint) return;
            console.error("quickEdit error:", e);
            if (phase === "stage") {
              toast.error(checkpoint.hasConfirmedData
                ? "Dados salvos. A mudança de etapa não foi confirmada. O rascunho foi mantido para você conferir e tentar a etapa novamente."
                : "A mudança de etapa não foi confirmada. O rascunho foi mantido para você conferir antes de tentar novamente.");
            } else {
              toast.error(checkpoint.hasConfirmedData
                ? "Há dados já salvos; os demais dados não foram confirmados. Confira antes de repetir. O rascunho foi mantido."
                : "Os dados não foram confirmados. Confira antes de repetir. O rascunho foi mantido.");
            }
            return;
          }

          quickEditCheckpoints.current.delete(leadId);
          setQuickEditingLead(null);
          toast.success("Lead atualizado com sucesso");
          try {
            await queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
            await queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
            await reloadFunnels(crmSourceId);
            if (data.pipelineId && data.pipelineId !== baseline.pipelineId) {
              setFunnelId(data.pipelineId);
              await navigate({ to: "/crm/funis-de-venda", search: { funnelId: data.pipelineId }, replace: true });
            }
          } catch {
            toast.info("Alterações confirmadas. Atualize o funil para ver os dados salvos.");
          }
        }}
        onDelete={async (leadId) => {
          try {
            await deleteLead({ data: { leadId } });
            await queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
            await reloadFunnels(crmSourceId);
            quickEditCheckpoints.current.delete(leadId);
            setQuickEditingLead(null);
            toast.success("Card excluído com sucesso");
          } catch (e) {
            toast.error("Erro ao excluir card");
          }
        }}
        onDuplicate={async (leadId) => {
          try {
            await duplicateLead({ data: { leadId } });
            await queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
            await reloadFunnels(crmSourceId);
            quickEditCheckpoints.current.delete(leadId);
            setQuickEditingLead(null);
            toast.success("Card duplicado com sucesso");
          } catch (e) {
            toast.error("Erro ao duplicar card");
          }
        }}
      />
    </div>
  );
}

function QuickEditDialog({
  lead,
  open,
  onOpenChange,
  funnels,
  users,
  onSave,
  onDelete,
  onDuplicate,
}: {
  lead: CrmLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnels: Funnel[];
  users: Array<{ id: string; name: string }>;
  onSave: (data: QuickEditValues, baseline: QuickEditValues) => Promise<void>;
  onDelete: (leadId: string) => Promise<void>;
  onDuplicate: (leadId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<QuickEditValues>({
    name: "",
    email: "",
    phone: "",
    value: 0,
    responsibleId: "",
    pipelineId: "",
    stageId: "",
    customFields: {},
  });
  const initialValues = useRef<{leadId:string;values:QuickEditValues}|null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingCustomFields, setLoadingCustomFields] = useState(false);
  const [customFieldError, setCustomFieldError] = useState<string | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = useState<Array<{
    id: string;
    name: string;
    fieldType: string;
    options: string[];
  }>>([]);

  const getLeadDetailFn = useServerFn(getLeadDetail);
  const listCustomFieldsFn = useServerFn(listLeadCustomFields);

  useEffect(() => {
    if (!open || !lead) {
      initialValues.current = null;
      setCustomFieldDefs([]);
      setCustomFieldError(null);
      return;
    }

    const initialPipelineId = (lead as any).pipeline_id ?? (lead as any).pipelineId ?? "";
    const initialStageId = (lead as any).stage_id ?? (lead as any).stageId ?? "";
    const initialForm: QuickEditValues = {
      name: lead.name,
      email: (lead as any).email ?? "",
      phone: (lead as any).phone ?? "",
      value: lead.value,
      responsibleId: (lead as any).responsibleId ?? (lead as any).responsible_id ?? "",
      pipelineId: initialPipelineId,
      stageId: initialStageId,
      customFields: {},
    };
    initialValues.current = {leadId:lead.id,values:initialForm};
    setForm(initialForm);

    let cancelled = false;
    setLoadingCustomFields(true);
    setCustomFieldError(null);

    void Promise.all([
      getLeadDetailFn({ data: { leadId: lead.id, includeActivities: false } }),
      listCustomFieldsFn(),
    ])
      .then(([detail, fieldsResult]) => {
        if (cancelled) return;

        const currentValues = new Map(
          (detail.lead.customFields ?? []).map((field) => [field.id, field.displayValue ?? ""] as const),
        );
        const defs = (fieldsResult.fields ?? []).map((field) => ({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType || "text",
          options: field.options ?? [],
        }));

        const loadedValues: QuickEditValues = {
          ...initialForm,
          name: detail.lead.name,
          email: detail.lead.email ?? "",
          phone: detail.lead.phone ?? "",
          value: Number(detail.lead.value ?? 0),
          pipelineId: detail.lead.pipelineId ?? initialPipelineId,
          stageId: detail.lead.stageId ?? initialStageId,
          customFields: Object.fromEntries(defs.map((field) => [field.id, currentValues.get(field.id) ?? ""])),
        };
        initialValues.current = {leadId:lead.id,values:loadedValues};
        setCustomFieldDefs(defs);
        setForm((prev) => ({
          ...prev,
          name: loadedValues.name,
          email: loadedValues.email,
          phone: loadedValues.phone,
          value: loadedValues.value,
          pipelineId: detail.lead.pipelineId ?? prev.pipelineId,
          stageId: detail.lead.stageId ?? prev.stageId,
          customFields: loadedValues.customFields,
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Não foi possível carregar os campos personalizados.";
        setCustomFieldDefs([]);
        setCustomFieldError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingCustomFields(false);
      });

    return () => {
      cancelled = true;
    };
  // As funções de servidor são estáveis para esta montagem; o carregamento
  // deve repetir somente quando o diálogo abre para outro lead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, open]);

  const selectedFunnel = funnels.find(f => f.id === form.pipelineId);

  function customFieldInputType(fieldType: string): string {
    switch (String(fieldType || "text").toLowerCase()) {
      case "datetime": return "datetime-local";
      case "date":
      case "birthday": return "date";
      case "email": return "email";
      case "url": return "url";
      case "money":
      case "number":
      case "numeric":
      case "price": return "number";
      case "phone":
      case "tel": return "tel";
      default: return "text";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edição rápida</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Telefone</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Responsável</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.responsibleId}
                onChange={e => setForm(f => ({ ...f, responsibleId: e.target.value }))}
              >
                <option value="">Sem responsável</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
              <Input 
                type="number" 
                value={form.value} 
                onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Funil</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.pipelineId}
                onChange={e => {
                  const pid = e.target.value;
                  const f = funnels.find(x => x.id === pid);
                  setForm(prev => ({ ...prev, pipelineId: pid, stageId: f?.stages[0]?.id ?? "" }));
                }}
              >
                {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etapa</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.stageId}
              onChange={e => setForm(f => ({ ...f, stageId: e.target.value }))}
            >
              {selectedFunnel?.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* Campos Personalizados */}
          <div className="space-y-3 pt-2 border-t border-border/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Campos Personalizados</p>
            {loadingCustomFields ? (
              <p className="text-xs text-muted-foreground">Carregando campos…</p>
            ) : customFieldError ? (
              <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {customFieldError}
              </div>
            ) : customFieldDefs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum campo personalizado criado nesta conta.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {customFieldDefs.map((cf) => (
                  <div key={cf.id} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{cf.name}</label>
                    {cf.fieldType === "select" && cf.options.length > 0 ? (
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={form.customFields[cf.id] ?? ""}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          customFields: { ...prev.customFields, [cf.id]: e.target.value },
                        }))}
                      >
                        <option value="">Selecione</option>
                        {cf.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : cf.fieldType === "multiselect" && cf.options.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2">
                        {cf.options.map((option) => {
                          const selected = (form.customFields[cf.id] ?? "").split("|").filter(Boolean);
                          const active = selected.includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                              )}
                              onClick={() => {
                                const next = new Set(selected);
                                if (next.has(option)) next.delete(option);
                                else next.add(option);
                                setForm((prev) => ({
                                  ...prev,
                                  customFields: { ...prev.customFields, [cf.id]: Array.from(next).join("|") },
                                }));
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Input
                        type={customFieldInputType(cf.fieldType)}
                        step={["money", "number", "numeric", "price"].includes(cf.fieldType) ? "any" : undefined}
                        value={form.customFields[cf.id] ?? ""}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          customFields: { ...prev.customFields, [cf.id]: e.target.value },
                        }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Excluir card"
              disabled={saving}
              onClick={async () => {
                if (!lead) return;
                if (confirm("Deseja excluir apenas este card? O contato permanecerá no sistema, mas sairá deste funil.")) {
                  setSaving(true);
                  try { await onDelete(lead.id); } finally { setSaving(false); }
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-primary hover:text-primary hover:bg-primary/10"
              title="Duplicar card"
              disabled={saving}
              onClick={async () => {
                if (!lead) return;
                setSaving(true);
                try { await onDuplicate(lead.id); } finally { setSaving(false); }
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button 
              disabled={saving || loadingCustomFields || !!customFieldError || initialValues.current?.leadId !== lead?.id}
              onClick={async () => {
                if (!initialValues.current || initialValues.current.leadId !== lead?.id) return;
                setSaving(true);
                try { await onSave(form, initialValues.current.values); } finally { setSaving(false); }
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




function EmptyFunnelState({
 bootstrapping, hasSource, onCreate,
}: {
 bootstrapping: boolean;
 hasSource: boolean;
 onCreate: () => void;
}) {
 if (bootstrapping) {
 return <p className="text-sm text-muted-foreground py-12 text-center">Carregando funis…</p>;
 }
 return (
 <div className="border border-dashed border-border rounded-lg p-12 text-center max-w-xl mx-auto">
 <KanbanSquare className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
 <h2 className="text-base font-semibold mb-1">Nenhum funil neste CRM</h2>
 <p className="text-sm text-muted-foreground mb-4">
 Crie seu primeiro funil pra começar a organizar os leads.
 </p>
 <div className="flex gap-2 justify-center">
 <Button onClick={onCreate} disabled={!hasSource} className="gap-1.5">
 <Plus className="w-4 h-4" /> Criar funil padrão
 </Button>
 </div>
 </div>
 );
}

/* ============================================================ */
/* Helpers / Subcomponentes */
/* ============================================================ */


function Dot() {
 return <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />;
}

function MiniKpi({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-md border border-border bg-background px-3 py-2">
 <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
 {label}
 </div>
 <div className="text-sm font-semibold mt-0.5 tabular-nums">{value}</div>
 </div>
 );
}

function FunnelSelector({
 funnels,
 currentId,
 onChange,
 editable = false,
 onRename,
 onCreate,
 onMove,
 onDelete,
}: {
 funnels: Funnel[];
 currentId: string;
 onChange: (id: string) => void;
 editable?: boolean;
 onRename?: (id: string, name: string) => void | Promise<void>;
 onCreate?: () => void;
 /** Move um funil na ordem (vale para o CRM e para o menu lateral). */
 onMove?: (id: string, dir: -1 | 1) => void | Promise<void>;
 /** Exclui um funil vazio (sem leads). */
 onDelete?: (id: string) => void | Promise<void>;

}) {
 const current = funnels.find((f) => f.id === currentId);
 const [draft, setDraft] = useState(current?.name ?? "");
 const [open, setOpen] = useState(false);
 const wrapRef = useRef<HTMLDivElement | null>(null);
 useEffect(() => { setDraft(current?.name ?? ""); }, [current?.id, current?.name]);

 useEffect(() => {
  if (!open) return;
  function onDocClick(e: MouseEvent) {
   if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
  }
  function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
  document.addEventListener("mousedown", onDocClick);
  document.addEventListener("keydown", onEsc);
  return () => {
   document.removeEventListener("mousedown", onDocClick);
   document.removeEventListener("keydown", onEsc);
  };
 }, [open]);

 const createButton = onCreate ? (
  <button
   type="button"
   onClick={onCreate}
   title="Adicionar novo funil"
   aria-label="Adicionar novo funil"
   className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-accent transition-colors"
  >
   <Plus className="w-3.5 h-3.5" />
  </button>
 ) : null;

 /** Sanfona com a lista de funis: setinhas de reordenar aparecem no hover de cada linha. */
 const dropdown = (
  <div ref={wrapRef} className="relative">
   <button
    type="button"
    onClick={() => setOpen((v) => !v)}
    className="h-8 inline-flex items-center gap-1.5 rounded-md border border-border bg-background pl-8 pr-2 text-xs font-medium hover:bg-accent transition-colors relative max-w-[13rem]"
    title="Trocar de funil"
   >
    <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary pointer-events-none" />
    <span className="truncate">{current?.name ?? "Funil"}</span>
    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
   </button>

   {open && (
    <div className="absolute left-0 top-full z-50 mt-1 w-[19rem] rounded-md border border-border bg-popover p-1 shadow-lg">
     <div className="max-h-72 overflow-y-auto">
      {funnels.map((f, i) => (
       <div
        key={f.id}
        className={cn(
         "group/row flex items-center gap-1 rounded-md px-1 py-0.5",
         f.id === currentId ? "bg-primary/10" : "hover:bg-accent",
        )}
       >
        <button
         type="button"
         disabled={i === 0 || !onMove}
         onClick={(e) => { e.stopPropagation(); void onMove?.(f.id, -1); }}
         title={i === 0 ? "Já é o primeiro da fila" : "Mover para cima"}
         aria-label="Mover funil para cima"
         className={cn(
          "h-6 w-6 shrink-0 inline-flex items-center justify-center rounded transition-opacity",
          "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
          i === 0 || !onMove
           ? "text-muted-foreground/30 cursor-not-allowed group-hover/row:opacity-40"
           : "text-muted-foreground hover:text-primary hover:bg-accent",
         )}
        >
         <ChevronUp className="w-3.5 h-3.5" />
        </button>

        <button
         type="button"
         onClick={() => { onChange(f.id); setOpen(false); }}
         className="flex-1 min-w-0 text-left px-1 py-1 text-xs font-medium truncate"
        >
         <span className="text-muted-foreground tabular-nums mr-1">{i + 1}.</span>
         {f.name}
        </button>

        <button
         type="button"
         disabled={i === funnels.length - 1 || !onMove}
         onClick={(e) => { e.stopPropagation(); void onMove?.(f.id, 1); }}
         title={i === funnels.length - 1 ? "Já é o último da fila" : "Mover para baixo"}
         aria-label="Mover funil para baixo"
         className={cn(
          "h-6 w-6 shrink-0 inline-flex items-center justify-center rounded transition-opacity",
          "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
          i === funnels.length - 1 || !onMove
           ? "text-muted-foreground/30 cursor-not-allowed group-hover/row:opacity-40"
           : "text-muted-foreground hover:text-primary hover:bg-accent",
         )}
        >
         <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {onDelete && (() => {
         const leadsNoFunil = f.stages.reduce((acc, s) => acc + s.leads.length, 0);
         const ultimo = funnels.length <= 1;
         const bloqueado = leadsNoFunil > 0 || ultimo;
         return (
          <button
           type="button"
           disabled={bloqueado}
           onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm(`Excluir o funil "${f.name}"? Essa ação não pode ser desfeita.`)) return;
            void onDelete(f.id);
           }}
           title={
            ultimo
             ? "Você precisa ter pelo menos um funil"
             : leadsNoFunil > 0
              ? `Tem ${leadsNoFunil} lead(s) neste funil. Mova ou exclua os leads antes de apagar.`
              : "Excluir funil"
           }
           aria-label="Excluir funil"
           className={cn(
            "h-6 w-6 shrink-0 inline-flex items-center justify-center rounded transition-opacity",
            "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
            bloqueado
             ? "text-muted-foreground/30 cursor-not-allowed group-hover/row:opacity-40"
             : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
           )}
          >
           <Trash2 className="w-3.5 h-3.5" />
          </button>
         );
        })()}
       </div>

      ))}
     </div>

     {onCreate && (
      <button
       type="button"
       onClick={() => { setOpen(false); onCreate(); }}
       className="mt-1 w-full inline-flex items-center gap-1.5 rounded-md border-t border-border px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent"
      >
       <Plus className="w-3.5 h-3.5" /> Adicionar novo funil
      </button>
     )}
    </div>
   )}
  </div>
 );

 if (editable && current) {
  const commit = () => {
   const next = draft.trim();
   if (!next || next === current.name) { setDraft(current.name); return; }
   onRename?.(current.id, next);
  };
  return (
   <div className="flex items-center gap-1.5">
    {funnels.length > 1 && dropdown}
    <div className="relative">
     <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary pointer-events-none" />
     <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
       if (e.key === "Enter") { e.currentTarget.blur(); }
       if (e.key === "Escape") { setDraft(current.name); e.currentTarget.blur(); }
      }}
      placeholder="Nome do funil"
      className="h-8 rounded-md border border-primary/40 bg-background pl-8 pr-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
     />
    </div>
    {createButton}
   </div>
  );
 }

 return (
  <div className="flex items-center gap-1.5">
   {dropdown}
   {createButton}
  </div>
 );
}


function CrmSourceSelector({
 sources, currentId, primaryId, onChange, onTogglePrimary,
}: {
 sources: CrmSource[];
 currentId: string;
 primaryId: string;
 onChange: (id: string) => void;
 onTogglePrimary: (id: string) => void;
}) {
 const providerLabel: Record<CrmSource["provider"], string> = {
 mkton: "Vanessa Simoni",
 };
 const isPinned = !!currentId && currentId === primaryId;
 const primaryLabel = primaryId ? providerLabel[sources.find((s) => s.id === primaryId)?.provider ?? "mkton"] : null;
 return (
 <div className="flex items-center gap-1">
  <div className="relative">
  <select
  value={currentId}
  onChange={(e) => onChange(e.target.value)}
  className="h-8 appearance-none rounded-md border border-border bg-background pl-8 pr-7 text-xs font-medium hover:bg-accent transition-colors cursor-pointer"
  >
  {sources.map((s) => (
  <option key={s.id} value={s.id}>
   CRM: {providerLabel[s.provider]}{s.id === primaryId ? " (principal)" : ""}
  </option>
  ))}
  </select>
  <Database className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary pointer-events-none" />
  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
  </div>
  <button
   type="button"
   onClick={() => currentId && onTogglePrimary(currentId)}
   disabled={!currentId}
   title={
    isPinned
      ? "Este é o CRM principal"
     : primaryLabel
      ? `Definir como CRM principal (atual: ${primaryLabel})`
      : "Definir como CRM principal, abre já nele da próxima vez"
   }
   className={cn(
    "h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors",
    isPinned
     ? "border-primary bg-primary/10 text-primary"
     : "border-border text-muted-foreground hover:text-primary hover:border-primary/40",
    !currentId && "opacity-40 cursor-not-allowed",
   )}
    aria-label={isPinned ? "CRM principal" : "Fixar como CRM principal"}
  >
   {isPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <PinOff className="w-3.5 h-3.5" />}
  </button>
 </div>
 );
}


function ToggleGroup({
 value,
 onChange,
 options,
}: {
 value: string;
 onChange: (v: string) => void;
 options: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
 return (
 <div className="inline-flex rounded-md border border-border bg-background p-0.5">
 {options.map((opt) => {
 const Icon = opt.icon;
 const active = value === opt.value;
 return (
 <button
 key={opt.value}
 onClick={() => onChange(opt.value)}
 className={cn(
 "inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-medium transition-colors",
 active
? "bg-primary text-primary-foreground"
: "text-muted-foreground hover:text-foreground"
 )}
 >
 <Icon className="w-3.5 h-3.5" />
 {opt.label}
 </button>
 );
 })}
 </div>
 );
}

function StageColorFloatingPanel({
 stages,
 selectedStageId,
 onSelectStage,
 onPickColor,
}: {
 stages: FunnelStage[];
 selectedStageId: string | null;
 onSelectStage: (stageId: string) => void;
 onPickColor: (stageId: string, color: string | null) => void;
}) {
 const selectedStage = stages.find((s) => s.id === selectedStageId) ?? stages[0];
 return (
  <div className="fixed right-6 top-24 z-50 w-72 rounded-lg border border-border bg-popover shadow-xl p-3" data-no-pan>
   <div className="mb-2 flex items-center justify-between gap-2">
    <div className="text-xs font-semibold text-foreground">Cores das etapas</div>
    <Palette className="h-4 w-4 text-primary" />
   </div>
   <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
    {stages.map((stage) => {
     const active = stage.id === selectedStage.id;
     return (
      <button
       key={stage.id}
       type="button"
       onClick={() => onSelectStage(stage.id)}
       className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
        active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent",
       )}
      >
       <span className="h-3 w-3 rounded-full border border-border" style={{ background: stage.color ?? "transparent" }} />
       <span className="min-w-0 flex-1 truncate">{stage.name}</span>
      </button>
     );
    })}
   </div>
   {selectedStage && (
    <div className="mt-3 border-t border-border pt-3">
     <div className="mb-2 text-[11px] text-muted-foreground truncate">{selectedStage.name}</div>
     <div className="flex flex-wrap gap-1.5">
      {STAGE_COLOR_SWATCHES.map((color) => (
       <button
        key={color}
        type="button"
        onClick={() => onPickColor(selectedStage.id, color)}
        className={cn(
         "h-6 w-6 rounded-full border transition-transform hover:scale-110",
         selectedStage.color === color ? "ring-2 ring-primary border-primary" : "border-border",
        )}
        style={{ background: color }}
        aria-label={`Aplicar cor ${color}`}
       />
      ))}
      <label
        className="relative h-6 w-6 rounded-full border border-dashed border-border cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
        title="Escolher qualquer cor"
        style={{
         background:
          selectedStage.color && !STAGE_COLOR_SWATCHES.includes(selectedStage.color)
           ? selectedStage.color
           : "conic-gradient(from 0deg,#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)",
        }}
       >
        <Plus className="h-3 w-3 text-white mix-blend-difference pointer-events-none" />
        <input
         type="color"
         value={selectedStage.color ?? "#3b82f6"}
         onChange={(e) => onPickColor(selectedStage.id, e.target.value)}
         className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
         aria-label="Selecionar cor personalizada"
        />
       </label>
       <button
        type="button"
        onClick={() => onPickColor(selectedStage.id, null)}
        className="h-6 rounded-md border border-border px-2 text-[10px] text-muted-foreground hover:bg-muted"
       >
        Sem cor
       </button>

     </div>
    </div>
   )}
  </div>
 );
}

/* ----------------------------- Kanban ----------------------- */

function KanbanBoard({
  funnel,
  mode,
  automations,
  onLeadClick,
  onOpenTriggers,
  onRemoveTrigger,
  onDuplicateTrigger,
  onConfigureTrigger,
  onExtendTrigger,
  onMoveTrigger,
  onSaveExecutionTrigger,
  onToggleTrigger,
  onReorderStages,
  onRenameStage,
  onStageColor,
  onStageDescription,
  colorMode,
  selectedColorStageId,
  onSelectColorStage,
  canReorderStages,
  onLeadDrop,
  onAddStage,
  onDeleteStage,
  pendingRenameStageId,
  onConsumePendingRename,
  onQuickEdit,
  selectedLeadIds,
  onToggleLeadSelection,
  onBatchToggleLeads,
  onBulkEdit,
}: {
  funnel: Funnel;
  mode: Mode;
  automations: StageAutomations;
  onLeadClick: (l: CrmLead) => void;
  onOpenTriggers: (stageId: string) => void;
  onRemoveTrigger: (stageId: string, actionId: string) => void;
  onDuplicateTrigger: (stageId: string, actionId: string) => void;
  onConfigureTrigger: (stageId: string, actionId: string) => void;
  onExtendTrigger: (stageId: string, actionId: string, targetStageId: string) => void;
  onMoveTrigger: (stageId: string, actionId: string, targetStageId: string) => void;
  onSaveExecutionTrigger: (stageId: string, actionId: string, execution: ExecutionConfig) => void | Promise<void>;
  onToggleTrigger: (stageId: string, actionId: string, enabled: boolean) => void;
  onReorderStages: (fromStageId: string, toStageId: string) => void;
  onRenameStage: (stageId: string, name: string) => void;
  onStageColor: (stageId: string, color: string | null) => void;
  onStageDescription: (stageId: string, description: string | null) => void;
  colorMode: boolean;
  selectedColorStageId: string | null;
  onSelectColorStage: (stageId: string | null) => void;
  canReorderStages: boolean;
  onLeadDrop: (leadId: string, fromStageId: string, toStageId: string) => void;
  onAddStage: (insertAfterIndex?: number) => void;
  onDeleteStage: (stageId: string) => void;
  pendingRenameStageId: string | null;
  onConsumePendingRename: () => void;
  onQuickEdit?: (lead: CrmLead) => void;
  selectedLeadIds: Set<string>;
  onToggleLeadSelection: (leadId: string) => void;
  onBatchToggleLeads: (ids: string[], forceState?: boolean) => void;
  onBulkEdit: () => void;
}) {




  const [wobble, setWobble] = useState(false);
  const [stageDragDelta, setStageDragDelta] = useState(0);
  const [stageDragging, setStageDragging] = useState(false);
  const [reorderTarget, setReorderTarget] = useState<number | null>(null);
  const dragState = useRef({ active: false, startX: 0, targetIdx: 0 });

  useEffect(() => {
   if (!wobble) return;
   const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setWobble(false); };
   window.addEventListener("keydown", onKey);
   return () => window.removeEventListener("keydown", onKey);
  }, [wobble]);
  // Sai do modo wobble ao trocar de modo (view/automatize)
  useEffect(() => { if (!canReorderStages) setWobble(false); }, [canReorderStages]);

  function activateWobble() { if (canReorderStages) setWobble(true); }

  



 return (
 <>
 <style>{`
   @keyframes saude-slim-wobble { 0%,100% { transform: rotate(-0.6deg); } 50% { transform: rotate(0.6deg); } }
   .saude-slim-wobble { animation: saude-slim-wobble 0.28s ease-in-out infinite; transform-origin: 50% 50%; }
 `}</style>
 {wobble && (
   <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs shadow-lg pointer-events-none">
   Modo edição: arraste para reordenar, clique no nome ou na cor para editar
    <button onClick={() => setWobble(false)} className="ml-1 px-2 py-0.5 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30 text-[11px] font-semibold pointer-events-auto">
    Concluir
   </button>
  </div>
 )}
 <div className="flex gap-3 h-full">
  {funnel.stages.map((stage, idx) => (
 <Fragment key={stage.id}>
  {mode === "automatize" && idx > 0 && (
   <button
    type="button"
    onClick={() => onAddStage(idx - 1)}
    title="Inserir nova etapa aqui"
    aria-label="Inserir nova etapa aqui"
    className="self-center shrink-0 -mx-1.5 w-7 h-7 rounded-full border border-dashed border-primary/50 bg-background text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center justify-center shadow-sm z-10"
   >
    <Plus className="w-3.5 h-3.5" />
   </button>
  )}
  <StageColumn
 stage={stage}
 mode={mode}
 actions={automations[stage.id]?? []}
 stageIndex={idx}
 allStages={funnel.stages}
 wobble={wobble}
 canReorder={canReorderStages}
 onActivateWobble={activateWobble}
 onReorderStages={onReorderStages}
 onRenameStage={onRenameStage}
 onStageColor={onStageColor}
 onStageDescription={onStageDescription}
  colorMode={colorMode}
  selectedForColor={selectedColorStageId === stage.id}
  onSelectForColor={() => onSelectColorStage(selectedColorStageId === stage.id ? null : stage.id)}
 onLeadClick={onLeadClick}
 onOpenTriggers={() => onOpenTriggers(stage.id)}
 onRemoveTrigger={(id) => onRemoveTrigger(stage.id, id)}
 onDuplicateTrigger={(id) => onDuplicateTrigger(stage.id, id)}
 onConfigureTrigger={(id) => onConfigureTrigger(stage.id, id)}
 onExtendTrigger={(actionId, targetStageId) => onExtendTrigger(stage.id, actionId, targetStageId)}
 onMoveTrigger={(actionId, targetStageId) => onMoveTrigger(stage.id, actionId, targetStageId)}

  onSaveExecutionTrigger={(actionId, execution) => onSaveExecutionTrigger(stage.id, actionId, execution)}
   onToggleTrigger={(actionId, enabled) => onToggleTrigger(stage.id, actionId, enabled)}
   onLeadDrop={onLeadDrop}
    onQuickEdit={onQuickEdit}
    selectedLeadIds={selectedLeadIds}
    onToggleLeadSelection={onToggleLeadSelection}
    onBatchToggleLeads={onBatchToggleLeads}
    onBulkEdit={onBulkEdit}
    onDelete={mode === "automatize" && idx > 0 ? () => onDeleteStage(stage.id) : undefined}
    autoRename={pendingRenameStageId === stage.id}
    onConsumeAutoRename={onConsumePendingRename}
   />
 </Fragment>
 ))}
   {mode === "automatize" && (
    <button
     type="button"
     onClick={() => onAddStage()}
     title="Adicionar nova etapa no final"
     aria-label="Adicionar nova etapa no final"
     className="self-center shrink-0 -ml-1.5 w-7 h-7 rounded-full border border-dashed border-primary/50 bg-background text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center justify-center shadow-sm z-10"
    >
     <Plus className="w-3.5 h-3.5" />
    </button>
   )}
  </div>
  </>
 );
}

function StageColumn({
 stage,
 mode,
 actions,
 stageIndex,
 allStages,
 wobble,
 canReorder,
 onActivateWobble,
 onReorderStages,
 onRenameStage,
 onStageColor,
 onStageDescription,
 colorMode,
 selectedForColor,
 onSelectForColor,
 onLeadClick,
 onOpenTriggers,
 onRemoveTrigger,
 onDuplicateTrigger,
 onConfigureTrigger,
 onExtendTrigger,
 onMoveTrigger,

 onSaveExecutionTrigger,
 onToggleTrigger,
 onLeadDrop,
 onDelete,
 autoRename,
  onConsumeAutoRename,
    onQuickEdit,
    selectedLeadIds,
    onToggleLeadSelection,
    onBatchToggleLeads,
    onBulkEdit,
}: {
  stage: FunnelStage;
  mode: Mode;
  actions: AutomationAction[];
  stageIndex: number;
  allStages: FunnelStage[];
  wobble: boolean;
  canReorder: boolean;
  onActivateWobble: () => void;
  onReorderStages: (fromStageId: string, toStageId: string) => void;
  onRenameStage: (stageId: string, name: string) => void;
  onStageColor: (stageId: string, color: string | null) => void;
  onStageDescription: (stageId: string, description: string | null) => void;
  colorMode: boolean;
  selectedForColor: boolean;
  onSelectForColor: () => void;
  onLeadClick: (l: CrmLead) => void;
  onOpenTriggers: () => void;
  onRemoveTrigger: (id: string) => void;
  onDuplicateTrigger: (id: string) => void;
  onConfigureTrigger: (id: string) => void;
  onExtendTrigger: (actionId: string, targetStageId: string) => void;
  onMoveTrigger: (actionId: string, targetStageId: string) => void;
  onSaveExecutionTrigger: (actionId: string, execution: ExecutionConfig) => void | Promise<void>;
  onToggleTrigger: (actionId: string, enabled: boolean) => void;
  onLeadDrop: (leadId: string, fromStageId: string, toStageId: string) => void;
  onDelete?: () => void;
  autoRename?: boolean;
  onConsumeAutoRename?: () => void;
  onQuickEdit?: (lead: CrmLead) => void;
  selectedLeadIds: Set<string>;
  onToggleLeadSelection: (leadId: string) => void;
  onBatchToggleLeads: (ids: string[], forceState?: boolean) => void;
  onBulkEdit: () => void;
}) {




 const [dragOver, setDragOver] = useState(false);
 const total = stage.leads.reduce((s, l) => s + l.value, 0);

 const isAutomatize = mode === "automatize";

 // Duplo clique ativa o modo "editar etapas" (vibrar/renomear/cor/reordenar).
 function handleHeaderDoubleClick() {
  if (canReorder && !wobble) onActivateWobble();
 }

 // Rename inline (só quando wobble está ativo)
 const [renaming, setRenaming] = useState(false);
 const [nameDraft, setNameDraft] = useState(stage.name);
 useEffect(() => { setNameDraft(stage.name); }, [stage.name]);
 useEffect(() => { if (!wobble && mode !== "automatize") setRenaming(false); }, [wobble, mode]);
 useEffect(() => {
  if (autoRename) {
   setNameDraft(stage.name);
   setRenaming(true);
   onConsumeAutoRename?.();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [autoRename]);
 function commitRename() {
  const next = nameDraft.trim();
  if (next && next !== stage.name) onRenameStage(stage.id, next);
  else setNameDraft(stage.name);
  setRenaming(false);
 }

 // Color picker popover
 const [colorOpen, setColorOpen] = useState(false);
 // Dica (descricao da etapa)
 const [hintOpen, setHintOpen] = useState(false);
 const [hintDraft, setHintDraft] = useState(stage.description ?? "");
 useEffect(() => { setHintDraft(stage.description ?? ""); }, [stage.description]);
 function commitHint() {
  const next = hintDraft.trim();
  if (next !== (stage.description ?? "")) onStageDescription(stage.id, next || null);
  setHintOpen(false);
 }
 useEffect(() => { if (!wobble) setColorOpen(false); }, [wobble]);
  // Reordenar por pointer drag, mais confiável que HTML5 draggable pra coluna inteira.
  const [reorderTarget, setReorderTarget] = useState<number | null>(null);
  const [stageDragDelta, setStageDragDelta] = useState(0);
  const [stageDragging, setStageDragging] = useState(false);
  const dragState = useRef<{ active: boolean; startX: number; targetIdx: number }>({
   active: false,
   startX: 0,
   targetIdx: stageIndex,
  });

  function handleStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
   if (renaming || colorOpen || colorMode) return;
   if (e.button !== 0) return;
   const target = e.target as HTMLElement;
   if (target.closest("button, input, textarea, select, a")) return;
   // No modo Automatize a coluna só é arrastada pelo cabeçalho,
   // pra não conflitar com o arraste dos gatilhos.
   if (isAutomatize) {
    if (!target.closest("[data-stage-drag-handle]")) return;
   } else if (!wobble) {
    return;
   }

   e.preventDefault();
   dragState.current = { active: true, startX: e.clientX, targetIdx: stageIndex };
   setStageDragDelta(0);
   setReorderTarget(stageIndex);
   e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleStagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
   if (!dragState.current.active) return;
   const delta = e.clientX - dragState.current.startX;
   setStageDragDelta(delta);
   if (Math.abs(delta) > 8) setStageDragging(true);
   const nextTarget = Math.max(0, Math.min(allStages.length - 1, stageIndex + Math.round(delta / 292)));
   dragState.current.targetIdx = nextTarget;
   setReorderTarget(nextTarget);
  }

  function handleStagePointerUp(e: React.PointerEvent<HTMLDivElement>) {
   if (!dragState.current.active) return;
   const targetIdx = dragState.current.targetIdx;
   dragState.current.active = false;
   try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
   setStageDragDelta(0);
   setStageDragging(false);
   setReorderTarget(null);
   const targetStage = allStages[targetIdx];
   if (targetIdx !== stageIndex && targetStage) onReorderStages(stage.id, targetStage.id);
  }

 function handleDragOver(e: React.DragEvent) {
  const types = Array.from(e.dataTransfer.types?? []);
  if (isAutomatize) return;
  if (!types.includes("application/x-saude-slim-lead")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (!dragOver) setDragOver(true);
 }
 function handleDragLeave() {
  if (dragOver) setDragOver(false);
 }
 function handleDrop(e: React.DragEvent) {
  if (isAutomatize) return;
  e.preventDefault();
  setDragOver(false);
  const payload = e.dataTransfer.getData("application/x-saude-slim-lead");
  if (!payload) return;
  try {
   const { leadId, fromStageId } = JSON.parse(payload);
   if (leadId && fromStageId) onLeadDrop(leadId, fromStageId, stage.id);
  } catch {
   /* ignore */
  }
 }

 return (
 <div
   {...(isAutomatize || wobble || colorMode ? { "data-no-pan": true } : {})}
 className={cn(
  "w-[280px] shrink-0 rounded-lg border bg-card flex flex-col group/column transition-colors relative max-h-full",
 isAutomatize
? "border-primary/40"
: dragOver
? "border-primary ring-2 ring-primary/30"
: "border-border",
  wobble && !stageDragging && "saude-slim-wobble cursor-grab",
  stageDragging && "z-30 cursor-grabbing shadow-xl ring-2 ring-primary/60",
  colorMode && "cursor-pointer",
  selectedForColor && "ring-2 ring-primary border-primary",
 )}
  style={stageDragging ? { transform: `translateX(${stageDragDelta}px)` } : undefined}
  onPointerDown={handleStagePointerDown}
  onPointerMove={handleStagePointerMove}
  onPointerUp={handleStagePointerUp}
  onPointerCancel={handleStagePointerUp}
 onDragOver={handleDragOver}
 onDragLeave={handleDragLeave}
 onDrop={handleDrop}
 >
  {reorderTarget !== null && reorderTarget !== stageIndex && (
   <div className={cn(
    "absolute inset-y-0 z-20 w-1 rounded-full bg-primary ring-4 ring-primary/20",
    reorderTarget > stageIndex ? "-right-2" : "-left-2",
   )} />
  )}
 {/* Barra de cor da etapa */}
 {stage.color && (
  <div className="h-1 rounded-t-lg" style={{ background: stage.color }} />
 )}
 {/* Header */}
 <div
   data-stage-drag-handle
   className={cn("p-3 border-b border-border", canReorder && !wobble && "cursor-pointer select-none", isAutomatize && !stageDragging && "cursor-grab select-none", stageDragging && "cursor-grabbing", colorMode && "hover:bg-primary/5")}
   onPointerDownCapture={() => { if (colorMode) onSelectForColor(); }}
   onClick={(e) => { if (colorMode) e.stopPropagation(); }}
   onDoubleClick={handleHeaderDoubleClick}
   title={colorMode ? "Selecionar etapa para trocar cor" : isAutomatize ? "Arraste o cabeçalho para reposicionar a etapa" : canReorder && !wobble ? "Clique duplo para editar as etapas" : undefined}

 >
  <div className="flex items-center justify-between gap-2">
    {!isAutomatize && !wobble && !colorMode && (
      <Checkbox 
        checked={stage.leads.length > 0 && stage.leads.every(l => selectedLeadIds.has(l.id))}
        onCheckedChange={(checked) => onBatchToggleLeads(stage.leads.map(l => l.id), !!checked)}
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-opacity opacity-40 group-hover/column:opacity-100",
          stage.leads.some(l => selectedLeadIds.has(l.id)) && !stage.leads.every(l => selectedLeadIds.has(l.id)) && "opacity-100"
        )}
      />
    )}
   {wobble || mode === "automatize" ? (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
     <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setColorOpen((v) => !v); }}
      className="w-4 h-4 rounded-full border border-border shrink-0"
      style={{ background: stage.color ?? "transparent" }}
      title="Trocar cor"
     />
     {renaming ? (
      <input
       autoFocus
       onFocus={(e) => e.currentTarget.select()}
       value={nameDraft}
       onChange={(e) => setNameDraft(e.target.value)}
       onBlur={commitRename}
       onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitRename(); }
        if (e.key === "Escape") { setNameDraft(stage.name); setRenaming(false); }
       }}
       className="text-sm font-semibold bg-background border border-primary/40 rounded px-1.5 py-0.5 flex-1 min-w-0"
      />
     ) : (
       <button
        type="button"
        onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
        onClick={(e) => { 
          if (colorMode) { e.stopPropagation(); onSelectForColor(); }
        }}
        className="text-[11px] font-bold text-left truncate hover:text-primary flex-1 min-w-0 uppercase tracking-tight"
        title={colorMode ? "Selecionar para trocar cor" : "Clique duplo para renomear"}
       >
       {stage.name}
      </button>
     )}
    </div>
   ) : (
    <div className="flex items-center gap-2">
      {mode === "view" && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Checkbox 
            checked={stage.leads.length > 0 && stage.leads.every(l => selectedLeadIds.has(l.id))}
            onCheckedChange={() => onBatchToggleLeads(stage.leads.map(l => l.id))}
            className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          {stage.leads.length > 0 && stage.leads.every(l => selectedLeadIds.has(l.id)) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBulkEdit();
              }}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
              title="Ações em massa para esta etapa"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="text-sm font-semibold truncate flex-1">{stage.name}</div>
    </div>
   )}
   {onDelete && (
    <button
     type="button"
     onClick={(e) => { e.stopPropagation(); onDelete(); }}
     className="opacity-0 group-hover/column:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
     title="Excluir etapa"
     aria-label="Excluir etapa"
    >
     <Trash2 className="w-3.5 h-3.5" />
    </button>
   )}
 </div>
  {(isAutomatize || (stage.description ?? "").trim().length > 0) && (
   <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setHintOpen((v) => !v); }}
    className={cn(
     "mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
     hintOpen
      ? "border-primary/50 bg-primary/10 text-primary"
      : "border-border bg-muted/40 text-muted-foreground hover:text-primary hover:border-primary/40",
    )}
    title={isAutomatize ? "Escrever a dica desta etapa" : "Ver a dica desta etapa"}
   >
    <Lightbulb className="w-3 h-3" /> Dica
   </button>
  )}
  {hintOpen && (
   <div
    className="mt-2 p-2 rounded-md border border-border bg-popover shadow-sm"
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
   >
    {isAutomatize ? (
     <>
      <textarea
       value={hintDraft}
       onChange={(e) => setHintDraft(e.target.value)}
       maxLength={2000}
       rows={4}
       placeholder="Explique para que serve esta etapa: o que fazer aqui, quando mover o lead para a proxima..."
       className="w-full text-xs bg-background border border-border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center justify-between gap-2 mt-1.5">
       <span className="text-[10px] text-muted-foreground">{hintDraft.length}/2000</span>
       <div className="flex items-center gap-1.5">
        <button
         type="button"
         onClick={() => { setHintDraft(stage.description ?? ""); setHintOpen(false); }}
         className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted"
        >
         Cancelar
        </button>
        <button
         type="button"
         onClick={commitHint}
         className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
        >
         Salvar dica
        </button>
       </div>
      </div>
     </>
    ) : (
     <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
      {stage.description}
     </p>
    )}
   </div>
  )}
  {((colorOpen && (wobble || mode === "automatize")) || (colorMode && selectedForColor)) && (
  <div className="mt-2 p-2 rounded-md border border-border bg-popover shadow-sm flex flex-wrap gap-1.5">
    {STAGE_COLOR_SWATCHES.map((c) => (
    <button
     key={c}
     type="button"
      onClick={(e) => { e.stopPropagation(); onStageColor(stage.id, c); setColorOpen(false); }}
     className={cn(
      "w-5 h-5 rounded-full border transition-transform hover:scale-110",
      stage.color === c ? "ring-2 ring-primary border-primary" : "border-border",
     )}
     style={{ background: c }}
     title={c}
    />
   ))}
   <label
     className="relative w-5 h-5 rounded-full border border-dashed border-border cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
     title="Escolher qualquer cor"
     onClick={(e) => e.stopPropagation()}
     style={{
      background:
       stage.color && !STAGE_COLOR_SWATCHES.includes(stage.color)
        ? stage.color
        : "conic-gradient(from 0deg,#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)",
     }}
    >
     <Plus className="h-2.5 w-2.5 text-white mix-blend-difference pointer-events-none" />
     <input
      type="color"
      value={stage.color ?? "#3b82f6"}
      onChange={(e) => { e.stopPropagation(); onStageColor(stage.id, e.target.value); }}
      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
      aria-label="Selecionar cor personalizada"
     />
    </label>
    <button
     type="button"
     onClick={(e) => { e.stopPropagation(); onStageColor(stage.id, null); setColorOpen(false); }}
     className="text-[10px] px-1.5 rounded border border-border hover:bg-muted"
    >
     Sem cor
    </button>

  </div>
 )}
 <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
 {isAutomatize
? `${actions.length} ${actions.length === 1? "gatilho": "gatilhos"}`
: `${stage.leads.length} leads · ${formatBRL(total)}`}
 </div>
 </div>


 {/* Body */}
  <div className={cn("flex-1 p-2 space-y-2 min-h-0 slim-funnel-scrollbar", isAutomatize ? "overflow-visible" : "overflow-y-auto")}>
 {isAutomatize? (
 <>
 {actions.length === 0? (
 <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
 Nenhum gatilho ainda. Passe o mouse sobre a coluna e clique em
 <strong className="text-foreground/80"> Adicionar gatilho</strong>.
 </div>
 ): (
 actions.map((a) => {
  const covered = (a.stageIds && a.stageIds.length > 0) ? a.stageIds : [stage.id];
  const originIdx = allStages.findIndex((s) => s.id === covered[0]);
  const endIdx = allStages.findIndex((s) => s.id === covered[covered.length - 1]);
  // renderiza uma vez, na etapa de origem, esticando pra direita
  if (originIdx !== stageIndex) return null;
  const extraCols = Math.max(0, endIdx - originIdx);
  const maxExtraCols = allStages.length - 1 - stageIndex;
  return (
  <AutomationRow
   key={a.id}
   action={a}
   extraCols={extraCols}
   maxExtraCols={maxExtraCols}
   allStages={allStages}
   stageIndex={stageIndex}
   onRemove={() => onRemoveTrigger(a.id)}
   onDuplicate={() => onDuplicateTrigger(a.id)}
   onConfigure={() => onConfigureTrigger(a.id)}
    onExtend={(targetStageId) => onExtendTrigger(a.id, targetStageId)}
    onMove={(targetStageId) => onMoveTrigger(a.id, targetStageId)}

    onSaveExecution={(execution) => onSaveExecutionTrigger(a.id, execution)}
     onToggleEnabled={(enabled) => onToggleTrigger(a.id, enabled)}
  />
  );
 })
 )}
 <button
 onClick={onOpenTriggers}
 className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 text-primary text-[11px] font-medium py-2 hover:bg-primary/10 transition-all opacity-60 group-hover/column:opacity-100"
 >
 <Plus className="w-3.5 h-3.5" /> Adicionar gatilho
 </button>
 </>
 ): stage.leads.length === 0? (
 <div
 className={cn(
 "rounded-md border border-dashed p-3 text-[11px] transition-colors",
 dragOver
? "border-primary bg-primary/5 text-primary"
: "border-border text-muted-foreground",
 )}
 >
 <div className="font-semibold tracking-wider text-[9px] uppercase mb-1 text-foreground/60">
 Leads desta etapa
 </div>
 {dragOver? "Solte para mover para esta etapa.": "Nenhum lead nesta etapa. Arraste leads de outras etapas ou use \"Novo Lead\"."}
 </div>
 ): (
 stage.leads.map((lead) => (
   <LeadCard
   key={lead.id}
   lead={lead}
   stageId={stage.id}
   onClick={() => onLeadClick(lead)}
   onQuickEdit={onQuickEdit}
    isSelected={selectedLeadIds.has(lead.id)}
    onToggleSelection={() => onToggleLeadSelection(lead.id)}
    selectedLeadIds={selectedLeadIds}
    />

 ))
 )}
 </div>
 </div>
 );
}

function LeadCard({
  lead,
  stageId,
  onClick,
  onQuickEdit,
  isSelected,
  onToggleSelection,
  selectedLeadIds,
}: {
  lead: CrmLead;
  stageId: string;
  onClick: () => void;
  onQuickEdit?: (l: CrmLead) => void;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  selectedLeadIds: Set<string>;
}) {
 const waiting = lead.lastMessageFrom === "lead";
 const SourceIcon = sourceIcon(lead.source);
 const [dragging, setDragging] = useState(false);
 const dragSuppressedUntil = useRef(0);

 function handleDragStart(e: React.DragEvent) {
  dragSuppressedUntil.current = Number.POSITIVE_INFINITY;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(
   "application/x-saude-slim-lead",
   JSON.stringify({ leadId: lead.id, fromStageId: stageId }),
  );
  setDragging(true);
 }

 return (
   <div
    draggable
    onDragStart={handleDragStart}
    onDragEnd={() => { dragSuppressedUntil.current = Date.now() + 400; setDragging(false); }}
    className={cn(
     "relative w-full group rounded-md border transition-all hover:shadow-sm",
     isSelected
      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
      : waiting
      ? "border-success/40 bg-success/5 hover:bg-success/10 hover:border-success/60"
      : "border-border bg-background hover:bg-accent/40",
     dragging && "opacity-50",
    )}
   >
    {/* Seleção em massa */}
    <div className={cn(
      "absolute top-2 left-2 z-20 transition-opacity",
      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    )}>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => {
          if (onToggleSelection) onToggleSelection();
        }}
        className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
    </div>

    <div
     role="button"
     tabIndex={0}
     aria-label={`Abrir ficha de ${lead.name}`}
     onKeyDown={(event) => {
       if (event.target !== event.currentTarget || !slimFunnelActivationKey(event.key)) return;
       event.preventDefault();
       const action = slimFunnelCardAction(selectedLeadIds.size, Date.now() < dragSuppressedUntil.current);
       if (action === 'select') onToggleSelection?.();
       if (action === 'open') onClick();
     }}
     onClick={(e) => {
       const action = slimFunnelCardAction(selectedLeadIds.size, Date.now() < dragSuppressedUntil.current);
       if (action === 'select') onToggleSelection?.();
       if (action === 'open') onClick();
     }}
     className={cn(
       "w-full text-left p-2.5 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
       (isSelected || !waiting || selectedLeadIds.size > 0) && "pl-8"
     )}
    >
    <div className="flex items-start gap-2">
     <div
      className={cn(
       "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
       waiting ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
      )}
     >
      {initials(lead.name)}
     </div>
     <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
       <div className="text-sm font-semibold truncate">{lead.name}</div>
       {waiting && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
      </div>
      {lead.company && <div className="text-[11px] text-muted-foreground truncate">{lead.company}</div>}
     </div>
     <SourceIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
    </div>

    {lead.lastMessagePreview && (
     <div
      className={cn(
       "mt-2 text-[11px] line-clamp-2 rounded px-2 py-1.5",
       waiting ? "bg-success/10 text-foreground/80 border border-success/20" : "bg-muted/60 text-muted-foreground",
      )}
     >
      <span className={cn("font-semibold mr-1", waiting ? "text-success" : "text-foreground/60")}>
       {waiting ? "Lead:" : "Você:"}
      </span>
      {lead.lastMessagePreview}
     </div>
    )}

    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
     <div className="flex items-center gap-1.5">
      <Clock className="w-3 h-3" />
      {timeAgo(lead.lastMessageAt ?? lead.createdAt)}
      {waiting && lead.unreadCount ? (
       <span className="ml-1 px-1.5 py-0.5 rounded-full bg-success text-success-foreground font-bold">
        {lead.unreadCount}
       </span>
      ) : null}
     </div>
     <div className="font-semibold tabular-nums text-foreground/80">{formatBRL(lead.value)}</div>
    </div>
    </div>

   {/* Botão de Edição Rápida */}
   <button
    onClick={(e) => {
     e.stopPropagation();
     if (selectedLeadIds.has(lead.id)) {
       // Se o lead está selecionado, o comportamento padrão do usuário é editar apenas esse lead
       // Mas ele mencionou "se eu clicar na edição rápida de um dos cards, mesmo com todos selecionados, ele vai editar só aquele card"
       // O que já é o comportamento do setQuickEditingLead
       onQuickEdit?.(lead);
     } else {
       onQuickEdit?.(lead);
     }
    }}
    className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-background border border-border shadow-sm hover:bg-accent text-muted-foreground hover:text-primary z-10"
    title="Edição rápida"
   >
    <Pencil className="w-3.5 h-3.5" />
   </button>
  </div>
 );
}


/* --------------------------- Automatize --------------------- */

function AutomationRow({
 action,
 extraCols,
 maxExtraCols,
 allStages,
 stageIndex,
 onRemove,
 onDuplicate,
 onConfigure,
 onExtend,
 onMove,
 onSaveExecution,
 onToggleEnabled,
}: {
 action: AutomationAction;
 extraCols: number;
 maxExtraCols: number;
 allStages: FunnelStage[];
 stageIndex: number;
 onRemove: () => void;
 onDuplicate: () => void;
 onConfigure: () => void;
 onExtend: (targetStageId: string) => void;
 onMove: (targetStageId: string) => void;

 onSaveExecution: (execution: ExecutionConfig) => void | Promise<void>;
 onToggleEnabled: (enabled: boolean) => void;
}) {
 const implemented = triggerIsImplemented(action.triggerId);
 const { isSuperAdmin } = useIsSuperAdmin();

 const hasConfigUI = triggerHasConfigUI(action.triggerId);
 const enabled = action.enabled !== false;
 const configured = isAutomationConfigured(action);
 const configLabel = describeAutomationConfig(action.config);
 const execLabel = describeExecution(action.execution);
 const [popoverOpen, setPopoverOpen] = useState(false);

 const Icon = channelIcon(action.channel);
 const webhookReady = action.config?.kind === "webhook" && !!action.config.url;

 // Stride entre colunas: w-[280px] + gap-3 (12px) = 292px
 const STRIDE = 292;
 const [dragExtra, setDragExtra] = useState<number | null>(null);
 const dragExtraRef = useRef(0);
 // Arrastar o gatilho pra outra etapa (reposicionar)
 const [moveOffset, setMoveOffset] = useState<number | null>(null);
 const moveOffsetRef = useRef(0);
 const suppressClickRef = useRef(false);

 // Alça direita: estica o gatilho por várias etapas
 function handleResizeStart(e: React.MouseEvent) {
  e.stopPropagation();
  if (maxExtraCols <= 0) return;
  const startX = e.clientX;
  let moved = false;
  dragExtraRef.current = extraCols;
  const onMoveEv = (ev: MouseEvent) => {
   const delta = ev.clientX - startX;
   if (!moved) {
    if (Math.abs(delta) < 4) return;
    moved = true;
    setDragExtra(extraCols);
   }
   const nextExtra = Math.max(0, Math.min(maxExtraCols, extraCols + Math.round(delta / STRIDE)));
   dragExtraRef.current = nextExtra;
   setDragExtra(nextExtra);
  };
  const onUp = () => {
   window.removeEventListener("mousemove", onMoveEv);
   window.removeEventListener("mouseup", onUp);
   if (!moved) return;
   suppressClickRef.current = true;
   const finalExtra = dragExtraRef.current;
   setDragExtra(null);
   const targetStage = allStages[stageIndex + finalExtra];
   if (targetStage) onExtend(targetStage.id);
  };
  window.addEventListener("mousemove", onMoveEv);
  window.addEventListener("mouseup", onUp);
 }

 // Corpo do card: move o gatilho de etapa (pra esquerda ou pra direita)
 function handleMoveStart(e: React.MouseEvent) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, [role='switch'], input, textarea, select, a, [data-resize-handle]")) return;
  if (allStages.length <= 1) return;
  const startX = e.clientX;
  const minOffset = -stageIndex;
  const maxOffset = allStages.length - 1 - stageIndex;
  let moved = false;
  moveOffsetRef.current = 0;
  const onMoveEv = (ev: MouseEvent) => {
   const delta = ev.clientX - startX;
   if (!moved) {
    if (Math.abs(delta) < 6) return;
    moved = true;
   }
   const next = Math.max(minOffset, Math.min(maxOffset, Math.round(delta / STRIDE)));
   moveOffsetRef.current = next;
   setMoveOffset(delta);
  };
  const onUp = () => {
   window.removeEventListener("mousemove", onMoveEv);
   window.removeEventListener("mouseup", onUp);
   setMoveOffset(null);
   if (!moved) return;
   suppressClickRef.current = true;
   const offset = moveOffsetRef.current;
   const targetStage = allStages[stageIndex + offset];
   if (offset !== 0 && targetStage) onMove(targetStage.id);
  };
  window.addEventListener("mousemove", onMoveEv);
  window.addEventListener("mouseup", onUp);
 }

 const shownExtra = dragExtra ?? extraCols;
 const spanning = shownExtra > 0;
 const isResizing = dragExtra !== null;
 const isMoving = moveOffset !== null;

 // Gatilho ainda em integração: só o super admin enxerga.
 if (!implemented && !isSuperAdmin) return null;

  return (
   <div
    onMouseDown={handleMoveStart}
    onClick={(e) => {
     if (suppressClickRef.current) { suppressClickRef.current = false; return; }
     if ((e.target as HTMLElement).closest("button,[role='switch'],[data-resize-handle]")) return;
     setPopoverOpen(true);
    }}
    title="Clique para configurar · arraste para mover de etapa"
    className={cn(
     "relative rounded border p-2 flex items-start gap-2 group/row transition-colors select-none cursor-grab active:cursor-grabbing",
     spanning && "shadow-md",
     (isResizing || isMoving) && "ring-2 ring-primary/60",
     isMoving && "z-30 shadow-xl opacity-90",
     !implemented && !hasConfigUI
      ? "border-dashed border-border/70 bg-muted/30 opacity-70"
      : configured || webhookReady
       ? "border-border bg-background"
       : "border-warning/40 bg-warning/5",
    )}
    style={{
     ...(spanning ? { width: `calc(100% + ${shownExtra * STRIDE}px)`, zIndex: 20 } : {}),
     ...(isMoving ? { transform: `translateX(${moveOffset}px)` } : {}),
    }}
   >
   {maxExtraCols > 0 && (
    <div
     data-resize-handle
     onMouseDown={handleResizeStart}
     title="Arraste para esticar o gatilho por várias etapas"
     className="absolute right-0 inset-y-0 w-2 cursor-ew-resize rounded-r opacity-0 group-hover/row:opacity-100 bg-primary/30 hover:bg-primary/60 transition-opacity"
    />
   )}

   <div className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
    <Icon className="w-3.5 h-3.5" />
   </div>
   <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5 flex-wrap">
     {!implemented && <AdminOnlyDot title="Em integração. Visível só para você (super admin); o cliente final não vê este gatilho." />}
     <div className="text-[11px] font-semibold truncate">{action.title}</div>

     {implemented && !configured && (
      <Badge className="text-[9px] px-1 py-0 h-3.5 bg-warning/20 text-warning border border-warning/40">
       configurar
      </Badge>
     )}
     {!implemented && hasConfigUI && !webhookReady && (
      <Badge className="text-[9px] px-1 py-0 h-3.5 bg-warning/20 text-warning border border-warning/40">
       configurar
      </Badge>
     )}
     {spanning && (
      <Badge className="text-[9px] px-1 py-0 h-3.5 bg-primary/15 text-primary border border-primary/40">
       cobre {shownExtra + 1} etapas
      </Badge>
     )}
    </div>
    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
     {(implemented || webhookReady) && configLabel ? configLabel : action.description}
    </div>
    {execLabel && (
     <div className="text-[10px] text-primary/80 leading-tight mt-0.5 truncate">
      ⚡ {execLabel}
     </div>
    )}
   </div>
   <div className="flex flex-col items-end gap-1">
    <Switch
     checked={enabled}

      onCheckedChange={(checked) => onToggleEnabled(!!checked)}
     className="scale-75"
    />
    <div className="flex items-center gap-0.5">
     <StageTriggerConfigPopover
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      action={action}
      anchor={<span aria-hidden className="block w-0 h-0" />}
      onSave={onSaveExecution}
      onRemove={onRemove}
      onEditAction={hasConfigUI ? onConfigure : undefined}
     />

     <button
      onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
      className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
      aria-label="Duplicar gatilho"
      title="Duplicar gatilho (mantém toda a configuração)"
     >
      <Copy className="w-3 h-3" />
     </button>

     <button
      onClick={onRemove}
      className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      aria-label="Remover gatilho"
     >
      <Trash2 className="w-3 h-3" />
     </button>
    </div>
   </div>

  </div>
 );
}

function TriggerCatalogDialog({
 open,
 stageName,
 onClose,
 onPick,
}: {
 open: boolean;
 stageName: string;
 onClose: () => void;
 onPick: (item: TriggerCatalogItem) => void;
}) {
 const [q, setQ] = useState("");
 const { isSuperAdmin } = useIsSuperAdmin();
 const groups = useMemo(() => {
 const filtered = TRIGGER_CATALOG.filter((t) =>
 t.title.toLowerCase().includes(q.toLowerCase())
 // Gatilhos ainda em integração aparecem só para o super admin.
 && (triggerIsImplemented(t.id) || isSuperAdmin)
 );
 const byGroup: Record<string, TriggerCatalogItem[]> = {};
 filtered.forEach((t) => {
 (byGroup[t.group]??= []).push(t);
 });
 return byGroup;
 }, [q, isSuperAdmin]);


 return (
 <Dialog open={open} onOpenChange={(o) =>!o && onClose()}>
 <DialogContent className="max-w-3xl">
 <DialogHeader>
 <DialogTitle className="text-base">
 Adicionar gatilho{stageName? ` · ${stageName}`: ""}
 </DialogTitle>
 </DialogHeader>
 <div className="relative mb-3">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <Input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Busca e filtro"
 className="pl-9 h-9"
 autoFocus
 />
 </div>
 <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
 {Object.entries(groups).map(([group, items]) => (
 <section key={group}>
 <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">
 {group}
 </div>
 <div className="grid grid-cols-3 gap-2">
 {items.map((item) => {
 const Icon = channelIcon(item.channel);
 return (
 <button
 key={item.id}
  type="button"
  aria-label={`Adicionar gatilho ${item.title}`}
 onClick={() => onPick(item)}
 className="rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all p-3 text-left group"
 >
 <div className="flex items-center gap-2 mb-1">
 <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center">
 <Icon className="w-4 h-4" />
 </div>
 <div className="text-xs font-semibold flex items-center gap-1.5">
  {!triggerIsImplemented(item.id) && <AdminOnlyDot title="Em integração. Visível só para você (super admin)." />}
  {item.title}
 </div>

 </div>
 <div className="text-[11px] text-muted-foreground leading-tight">
 {item.description}
 </div>
 <div className="mt-2 text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
 <Plus className="w-3 h-3" /> Adicionar
 </div>
 </button>
 );
 })}
 </div>
 </section>
 ))}
 {Object.keys(groups).length === 0 && (
 <div className="text-sm text-muted-foreground text-center py-8">
 Nenhum gatilho encontrado para "{q}".
 </div>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}

/* ----------------------------- Lista ------------------------ */

function ListBoard({
 funnel,
 onLeadClick,
}: {
 funnel: Funnel;
 onLeadClick: (l: CrmLead) => void;
}) {
 const rows = funnel.stages.flatMap((s) =>
 s.leads.map((l) => ({ stage: s, lead: l }))
 );
 return (
 <div className="rounded-lg border border-border bg-card overflow-hidden">
 <table className="w-full text-xs">
 <thead className="bg-muted/40 text-muted-foreground">
 <tr className="text-left">
 <th className="px-3 py-2 font-semibold">Lead</th>
 <th className="px-3 py-2 font-semibold">Etapa</th>
 <th className="px-3 py-2 font-semibold">Última mensagem</th>
 <th className="px-3 py-2 font-semibold">Origem</th>
 <th className="px-3 py-2 font-semibold text-right">Valor</th>
 </tr>
 </thead>
 <tbody>
 {rows.map(({ stage, lead }) => {
 const waiting = lead.lastMessageFrom === "lead";
 return (
 <tr
 key={lead.id}
 role="button"
 tabIndex={0}
 aria-label={`Abrir ficha de ${lead.name}`}
 onKeyDown={(event) => {
   if (event.target !== event.currentTarget || !slimFunnelActivationKey(event.key)) return;
   event.preventDefault();
   onLeadClick(lead);
 }}
 onClick={() => onLeadClick(lead)}
 className={cn(
 "border-t border-border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
 waiting? "bg-success/5 hover:bg-success/10": "hover:bg-accent/40"
 )}
 >
 <td className="px-3 py-2">
 <div className="flex items-center gap-2">
 {waiting && (
 <span className="w-1.5 h-1.5 rounded-full bg-success" />
 )}
 <div>
 <div className="font-semibold">{lead.name}</div>
 {lead.company && (
 <div className="text-muted-foreground text-[11px]">
 {lead.company}
 </div>
 )}
 </div>
 </div>
 </td>
 <td className="px-3 py-2 text-muted-foreground">{stage.name}</td>
 <td className="px-3 py-2 text-muted-foreground">
 {lead.lastMessagePreview?? " - "}
 </td>
 <td className="px-3 py-2 capitalize text-muted-foreground">
 {lead.source}
 </td>
 <td className="px-3 py-2 text-right tabular-nums font-semibold">
 {formatBRL(lead.value)}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 );
}

/* --------------------------- Filtros ------------------------ */

function LeadFiltersPopover({
 disabled,
 sources,
 selectedSources,
 onToggleSource,
 availableTags,
 selectedTags,
 onToggleTag,
 onlyWaiting,
 setOnlyWaiting,
 onlyWithValue,
 setOnlyWithValue,
 onlyUnread,
 setOnlyUnread,
 minValue,
 setMinValue,
 onClear,
}: {
 disabled?: boolean;
 sources: CrmLead["source"][];
 selectedSources: CrmLead["source"][];
 onToggleSource: (s: CrmLead["source"]) => void;
 availableTags: string[];
 selectedTags: string[];
 onToggleTag: (t: string) => void;
 onlyWaiting: boolean;
 setOnlyWaiting: (v: boolean) => void;
 onlyWithValue: boolean;
 setOnlyWithValue: (v: boolean) => void;
 onlyUnread: boolean;
 setOnlyUnread: (v: boolean) => void;
 minValue: string;
 setMinValue: (v: string) => void;
 onClear: () => void;
}) {
 const activeCount =
 selectedSources.length +
 selectedTags.length +
 (onlyWaiting ? 1 : 0) +
 (onlyWithValue ? 1 : 0) +
 (onlyUnread ? 1 : 0) +
 (minValue.trim() ? 1 : 0);
 return (
 <Popover>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 disabled={disabled}
 className="h-8 text-xs gap-1.5"
 >
 <Filter className="w-3.5 h-3.5" /> Filtros
 {activeCount > 0 && (
 <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
 {activeCount}
 </Badge>
 )}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-80 p-3 max-h-[70vh] overflow-y-auto" align="end">
 <div className="flex items-center justify-between mb-3">
 <div className="text-xs font-semibold">Filtrar leads</div>
 <button
 onClick={onClear}
 className="text-[11px] text-primary hover:underline"
 >
 Limpar
 </button>
 </div>

 <div className="space-y-3">
 <div>
 <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-1.5">
 Origem
 </div>
 <div className="grid grid-cols-2 gap-1.5">
 {sources.map((s) => (
 <label
 key={s}
 className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground"
 >
 <Checkbox
 checked={selectedSources.includes(s)}
 onCheckedChange={() => onToggleSource(s)}
 />
 <span className="capitalize">{s}</span>
 </label>
 ))}
 </div>
 </div>

 {availableTags.length > 0 && (
 <div className="border-t border-border pt-3">
 <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-1.5">
 Tags
 </div>
 <div className="flex flex-wrap gap-1.5">
 {availableTags.map((t) => {
 const active = selectedTags.includes(t);
 return (
 <button
 key={t}
 onClick={() => onToggleTag(t)}
 className={cn(
 "h-6 px-2 rounded-full border text-[11px] transition-colors",
 active
 ? "border-primary/40 bg-primary/10 text-primary"
 : "border-border bg-background text-muted-foreground hover:text-foreground",
 )}
 >
 {t}
 </button>
 );
 })}
 </div>
 </div>
 )}

 <div className="border-t border-border pt-3 space-y-2">
 <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
 Estado
 </div>
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <Checkbox
 checked={onlyWaiting}
 onCheckedChange={(v) => setOnlyWaiting(Boolean(v))}
 />
 <span>Apenas aguardando resposta</span>
 </label>
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <Checkbox
 checked={onlyUnread}
 onCheckedChange={(v) => setOnlyUnread(Boolean(v))}
 />
 <span>Apenas com mensagens não lidas</span>
 </label>
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <Checkbox
 checked={onlyWithValue}
 onCheckedChange={(v) => setOnlyWithValue(Boolean(v))}
 />
 <span>Com valor estimado</span>
 </label>
 </div>

 <div className="border-t border-border pt-3 space-y-1.5">
 <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
 Valor mínimo (R$)
 </div>
 <Input
 value={minValue}
 onChange={(e) => setMinValue(e.target.value)}
 placeholder="Ex.: 500"
 inputMode="decimal"
 className="h-8 text-xs"
 />
 </div>
 </div>
 </PopoverContent>
 </Popover>
 );
}

/* ----------------------------- utils ------------------------ */

function initials(name: string) {
 return name
.split(" ")
.slice(0, 2)
.map((n) => n[0])
.join("")
.toUpperCase();
}

function sourceIcon(s: CrmLead["source"]) {
 switch (s) {
 case "whatsapp":
 return MessageCircle;
 case "instagram":
 return Instagram;
 case "facebook":
 return Facebook;
 case "google":
 return Search;
 case "indicacao":
 return UserCircle2;
 default:
 return Phone;
 }
}

function channelIcon(c: TriggerChannel): React.ComponentType<{ className?: string }> {
 const map: Record<TriggerChannel, React.ComponentType<{ className?: string }>> = {
 whatsapp: MessageCircle,
 email: Mail,
 tarefa: ListChecks,
 ia: Bot,
 webhook: Webhook,
 meta: Megaphone,
 facebook: Facebook,
 tiktok: MousePointerClick,
 google: BarChart3,
 lead: Users,
 tags: Tags,
 campo: Pencil,
 form: FileText,
 etapa: ArrowRightLeft,
 user: UserCog,
 arquivo: FolderX,
 };
 return map[c]?? Zap;
}

// ============================================================
// KanbanScrollArea - pan horizontal arrastando o fundo + auto-pan
// durante drag de leads + minimapa flutuante no canto inferior direito.
// ============================================================
function KanbanScrollArea({ children }: { children: React.ReactNode }) {
 const scrollRef = useRef<HTMLDivElement | null>(null);
 const contentRef = useRef<HTMLDivElement | null>(null);
 const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 1, clientWidth: 1 });
 const panState = useRef<{ active: boolean; startX: number; startScroll: number }>({
 active: false, startX: 0, startScroll: 0,
 });
 const autoPanRaf = useRef<number | null>(null);
 const autoPanDir = useRef(0);

 function updateMetrics() {
 const el = scrollRef.current;
 if (!el) return;
 setMetrics({
 scrollLeft: el.scrollLeft,
 scrollWidth: el.scrollWidth,
 clientWidth: el.clientWidth,
 });
 }

 useEffect(() => {
 updateMetrics();
 const ro = new ResizeObserver(updateMetrics);
 if (scrollRef.current) ro.observe(scrollRef.current);
 if (contentRef.current) ro.observe(contentRef.current);
 return () => ro.disconnect();
 }, []);

 // Pan arrastando o fundo (apenas botão esquerdo, fora de cards/botões)
 function onPointerDown(e: React.PointerEvent) {
 if (e.button!== 0) return;
 const target = e.target as HTMLElement;
 // não inicia pan se clicou em um lead/botão/link/input
 if (target.closest("button, a, input, textarea, select, [draggable='true'], [data-no-pan]")) return;
 const el = scrollRef.current;
 if (!el) return;
 panState.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft };
 el.setPointerCapture(e.pointerId);
 el.style.cursor = "grabbing";
 }
 function onPointerMove(e: React.PointerEvent) {
 if (!panState.current.active) return;
 const el = scrollRef.current;
 if (!el) return;
 const dx = e.clientX - panState.current.startX;
 el.scrollLeft = panState.current.startScroll - dx;
 updateMetrics();
 }
 function endPan(e: React.PointerEvent) {
 if (!panState.current.active) return;
 panState.current.active = false;
 const el = scrollRef.current;
 if (el) {
 try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
 el.style.cursor = "";
 }
 }

 // Auto-pan enquanto arrasta lead próximo das bordas
 function ensureAutoPanLoop() {
 if (autoPanRaf.current!= null) return;
 const step = () => {
 const el = scrollRef.current;
 const dir = autoPanDir.current;
 if (el && dir!== 0) {
 el.scrollLeft += dir * 18;
 updateMetrics();
 autoPanRaf.current = requestAnimationFrame(step);
 } else {
 autoPanRaf.current = null;
 }
 };
 autoPanRaf.current = requestAnimationFrame(step);
 }
 function onDragOver(e: React.DragEvent) {
 const types = Array.from(e.dataTransfer.types?? []);
 if (!types.includes("application/x-saude-slim-lead")) return;
 const el = scrollRef.current;
 if (!el) return;
 const rect = el.getBoundingClientRect();
 const edge = 80;
 const x = e.clientX - rect.left;
 if (x < edge) autoPanDir.current = -1;
 else if (x > rect.width - edge) autoPanDir.current = 1;
 else autoPanDir.current = 0;
 if (autoPanDir.current!== 0) ensureAutoPanLoop();
 }
 function stopAutoPan() {
 autoPanDir.current = 0;
 }

 // Minimapa
 const minimapWidth = 140;
 const ratio = metrics.scrollWidth > 0? metrics.clientWidth / metrics.scrollWidth: 1;
 const thumbWidth = Math.max(20, minimapWidth * ratio);
 const thumbLeft =
 metrics.scrollWidth > metrics.clientWidth
? (metrics.scrollLeft / (metrics.scrollWidth - metrics.clientWidth)) *
 (minimapWidth - thumbWidth)
: 0;
 const showMinimap = metrics.scrollWidth > metrics.clientWidth + 4;

 const minimapDrag = useRef<{ active: boolean; startX: number; startScroll: number }>({
 active: false, startX: 0, startScroll: 0,
 });
 function onThumbDown(e: React.PointerEvent) {
 e.stopPropagation();
 const el = scrollRef.current;
 if (!el) return;
 minimapDrag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft };
 (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
 }
 function onThumbMove(e: React.PointerEvent) {
 if (!minimapDrag.current.active) return;
 const el = scrollRef.current;
 if (!el) return;
 const dx = e.clientX - minimapDrag.current.startX;
 const denom = Math.max(1, minimapWidth - thumbWidth);
 const scrollDelta = (dx / denom) * (metrics.scrollWidth - metrics.clientWidth);
 el.scrollLeft = minimapDrag.current.startScroll + scrollDelta;
 updateMetrics();
 }
 function onThumbUp(e: React.PointerEvent) {
 minimapDrag.current.active = false;
 try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
 }
 function onTrackClick(e: React.MouseEvent) {
 const track = e.currentTarget as HTMLElement;
 const rect = track.getBoundingClientRect();
 const x = e.clientX - rect.left - thumbWidth / 2;
 const denom = Math.max(1, minimapWidth - thumbWidth);
 const ratioPos = Math.max(0, Math.min(1, x / denom));
 const el = scrollRef.current;
 if (!el) return;
 el.scrollLeft = ratioPos * (metrics.scrollWidth - metrics.clientWidth);
 updateMetrics();
 }

 return (
  <div className="relative flex-1 min-h-0 overflow-hidden">
 <div
 ref={scrollRef}
 className="h-full overflow-x-auto overflow-y-hidden cursor-grab select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
 onScroll={updateMetrics}
 onPointerDown={onPointerDown}
 onPointerMove={onPointerMove}
 onPointerUp={endPan}
 onPointerCancel={endPan}
 onDragOver={onDragOver}
 onDragLeave={stopAutoPan}
 onDrop={stopAutoPan}
 onDragEnd={stopAutoPan}
 >
 <div ref={contentRef} className="h-full">
 {children}
 </div>
 </div>

  {showMinimap && (
 <div
  className="fixed bottom-5 right-6 z-50 rounded-full border border-border bg-card/95 backdrop-blur shadow-md px-3 py-2"
 data-no-pan
 >
 <div
  className="relative h-2 rounded-full bg-muted cursor-pointer"
 style={{ width: minimapWidth }}
 onMouseDown={onTrackClick}
 >
 <div
 role="slider"
 aria-label="Navegar pelo funil"
 className="absolute top-0 h-2 rounded-full bg-primary/80 hover:bg-primary cursor-grab active:cursor-grabbing"
 style={{ width: thumbWidth, left: thumbLeft }}
 onPointerDown={onThumbDown}
 onPointerMove={onThumbMove}
 onPointerUp={onThumbUp}
 onPointerCancel={onThumbUp}
 />
 </div>
 </div>
 )}
 </div>
 );
}


/* --------------------- AutomationConfigDialog --------------------- */

function AutomationConfigDialog({
 action,
 funnels,
 sourceStageId,
 currentFunnel,
 onClose,
 onSave,
}: {
 action: AutomationAction;
 funnels: Funnel[];
 sourceStageId: string;
 currentFunnel: Funnel | null;
 onClose: () => void;
 onSave: (patch: Partial<AutomationAction>) => void;
}) {
 const [config, setConfig] = useState<AutomationConfig>(action.config ?? ({ kind: "none" } as AutomationConfig));
 const [enabled, setEnabled] = useState<boolean>(action.enabled !== false);
 const [stageIds, setStageIds] = useState<string[]>(
  action.stageIds && action.stageIds.length > 0 ? action.stageIds : [sourceStageId],
 );

 function updateCfg<K extends AutomationConfig>(patch: Partial<K>) {
  setConfig((prev) => ({ ...prev, ...patch } as AutomationConfig));
 }

 const canSave = (() => {
  const draftAction: AutomationAction = { ...action, config, stageIds };
  return isAutomationConfigured(draftAction);
 })();

 // Etapas contíguas: alça esquerda/direita a partir da etapa de origem.
 const stages = currentFunnel?.stages ?? [];
 const originIdx = stages.findIndex((s) => s.id === sourceStageId);
 const coveredIdxs = stageIds
  .map((id) => stages.findIndex((s) => s.id === id))
  .filter((i) => i >= 0)
  .sort((a, b) => a - b);
 const startIdx = coveredIdxs[0] ?? originIdx;
 const endIdx = coveredIdxs[coveredIdxs.length - 1] ?? originIdx;
 function extendTo(targetIdx: number) {
  if (originIdx < 0 || targetIdx < 0) return;
  const from = Math.min(originIdx, targetIdx);
  const to = Math.max(originIdx, targetIdx);
  const range = stages.slice(from, to + 1).map((s) => s.id);
  setStageIds(range);
 }

 return (
  <Dialog open onOpenChange={(o) => !o && onClose()}>
   <DialogContent className="max-w-lg">
    <DialogHeader>
     <DialogTitle className="text-base">Configurar: {action.title}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">


     <ConfigBody config={config} onChange={updateCfg} funnels={funnels} />

     <div className="flex items-center justify-between pt-3 border-t border-border">
      <div className="flex items-center gap-2">
       <Switch checked={enabled} onCheckedChange={setEnabled} />
       <span className="text-xs text-muted-foreground">Ativa</span>
      </div>
      <div className="flex items-center gap-2">
       <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
       <Button
        size="sm"
        disabled={!canSave}
        onClick={() => onSave({ config, enabled, stageIds })}
       >
        Salvar
       </Button>
      </div>
     </div>
    </div>
   </DialogContent>
  </Dialog>
 );
}

function ConfigBody({
 config,
 onChange,
 funnels,
}: {
 config: AutomationConfig;
 onChange: (patch: Partial<AutomationConfig>) => void;
 funnels: Funnel[];
}) {
 const listUsersFn = useServerFn(listWorkspaceUsers);
 const listCustomFieldsFn = useServerFn(listLeadCustomFields);
 const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
 const [customFields, setCustomFields] = useState<Array<{ id: string; name: string; fieldType: string }>>([]);
 useEffect(() => {
  if (config.kind === "alterar-user" || config.kind === "msg-interna") {
   listUsersFn().then((r) => setUsers(r.users)).catch(() => setUsers([]));
  }
  if (config.kind === "alterar-campo") {
   listCustomFieldsFn().then((r) => setCustomFields(r.fields)).catch(() => setCustomFields([]));
  }
 }, [config.kind, listUsersFn, listCustomFieldsFn]);

 switch (config.kind) {
  case "mudar-etapa": {
   const currentFunnel = funnels.find((f) => f.id === config.pipelineId);
   return (
    <div className="grid grid-cols-2 gap-3">
     <div>
      <label className="text-[11px] text-muted-foreground">Funil de destino</label>
      <select
       value={config.pipelineId ?? ""}
       onChange={(e) => {
        const f = funnels.find((x) => x.id === e.target.value);
        onChange({
         pipelineId: f?.id,
         pipelineNome: f?.name,
         stageId: undefined,
         stageNome: undefined,
        } as Partial<AutomationConfig>);
       }}
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
      >
       <option value="">Selecione…</option>
       {funnels.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
       ))}
      </select>
     </div>
     <div>
      <label className="text-[11px] text-muted-foreground">Etapa de destino</label>
      <select
       value={config.stageId ?? ""}
       onChange={(e) => {
        const s = currentFunnel?.stages.find((x) => x.id === e.target.value);
        onChange({ stageId: s?.id, stageNome: s?.name } as Partial<AutomationConfig>);
       }}
       disabled={!currentFunnel}
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs disabled:opacity-50"
      >
       <option value="">Selecione…</option>
       {currentFunnel?.stages.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
       ))}
      </select>
     </div>
    </div>
   );
  }

  case "editar-tags": {
   const addStr = (config.add ?? []).join(", ");
   const remStr = (config.remove ?? []).join(", ");
   return (
    <div className="space-y-2">
     <div>
      <label className="text-[11px] text-muted-foreground">Adicionar tags (separadas por vírgula)</label>
      <Input
       value={addStr}
       onChange={(e) => onChange({ add: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } as Partial<AutomationConfig>)}
       placeholder="qualificado, quente"
       className="mt-1 h-8 text-xs"
      />
     </div>
     <div>
      <label className="text-[11px] text-muted-foreground">Remover tags (separadas por vírgula)</label>
      <Input
       value={remStr}
       onChange={(e) => onChange({ remove: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } as Partial<AutomationConfig>)}
       placeholder="frio"
       className="mt-1 h-8 text-xs"
      />
     </div>
    </div>
   );
  }

  case "alterar-user":
   return (
    <div>
     <label className="text-[11px] text-muted-foreground">Novo responsável</label>
     <select
      value={config.userId ?? ""}
      onChange={(e) => {
       const u = users.find((x) => x.id === e.target.value);
       onChange({ userId: u?.id, userNome: u?.name } as Partial<AutomationConfig>);
      }}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     >
      <option value="">{users.length === 0 ? "Carregando…" : "Selecione um usuário…"}</option>
      {users.map((u) => (
       <option key={u.id} value={u.id}>{u.name}</option>
      ))}
     </select>
    </div>
   );

  case "alterar-campo": {
   const selectedKey = config.campo === "custom" ? `custom:${config.customFieldId ?? ""}` : (config.campo ?? "");
   const effectiveType = config.campo === "custom"
    ? (config.customFieldType ?? "text")
    : (config.campo ?? "text");
   const validation = config.valor
    ? validateFieldValue(config.campo ?? "", config.valor, config.customFieldType)
    : { ok: true as const };
   const inputType =
    effectiveType === "email" ? "email"
    : effectiveType === "phone" || effectiveType === "tel" ? "tel"
    : effectiveType === "value" || effectiveType === "number" || effectiveType === "numeric" || effectiveType === "price" ? "text"
    : effectiveType === "date" ? "date"
    : effectiveType === "url" ? "url"
    : "text";
   const placeholder =
    config.campo === "name" ? "Ex.: João Silva"
    : effectiveType === "email" ? "cliente@dominio.com"
    : effectiveType === "phone" || effectiveType === "tel" ? "(11) 98888-7777"
    : config.campo === "value" || effectiveType === "number" || effectiveType === "numeric" || effectiveType === "price" ? "Ex.: 1500 ou 1.500,50"
    : effectiveType === "url" ? "https://…"
    : effectiveType === "date" ? "AAAA-MM-DD"
    : "Novo valor";
   return (
    <div className="space-y-2">
     <div className="grid grid-cols-2 gap-3">
      <div>
       <label className="text-[11px] text-muted-foreground">Campo</label>
       <select
        value={selectedKey}
        onChange={(e) => {
         const v = e.target.value;
         if (v.startsWith("custom:")) {
          const id = v.slice(7);
          const cf = customFields.find((x) => x.id === id);
          onChange({
           campo: "custom",
           customFieldId: id,
           customFieldNome: cf?.name,
           customFieldType: cf?.fieldType,
           valor: "",
          } as Partial<AutomationConfig>);
         } else {
          onChange({
           campo: (v || undefined) as "name" | "email" | "phone" | "value" | undefined,
           customFieldId: undefined,
           customFieldNome: undefined,
           customFieldType: undefined,
           valor: "",
          } as Partial<AutomationConfig>);
         }
        }}
        className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
       >
        <option value="">Selecione…</option>
        <optgroup label="Padrão do lead">
         <option value="name">Nome</option>
         <option value="email">E-mail</option>
         <option value="phone">Telefone</option>
         <option value="value">Valor (R$)</option>
        </optgroup>
        {customFields.length > 0 && (
         <optgroup label="Campos personalizados">
          {customFields.map((cf) => (
           <option key={cf.id} value={`custom:${cf.id}`}>
            {cf.name} {cf.fieldType ? `(${cf.fieldType})` : ""}
           </option>
          ))}
         </optgroup>
        )}
       </select>
       {config.campo === undefined || config.campo === null ? null : customFields.length === 0 && config.campo !== "name" && config.campo !== "email" && config.campo !== "phone" && config.campo !== "value" ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
         Nenhum campo personalizado cadastrado nesta workspace.
        </p>
       ) : null}
      </div>
      <div>
       <label className="text-[11px] text-muted-foreground">Novo valor</label>
       <Input
        type={inputType}
        value={config.valor ?? ""}
        onChange={(e) => {
         let v = e.target.value;
         // Sanitização leve conforme o tipo, evita entrada obviamente errada.
         if (effectiveType === "phone" || effectiveType === "tel") {
          v = v.replace(/[^\d\s()+.-]/g, "");
         } else if (config.campo === "value" || effectiveType === "number" || effectiveType === "numeric" || effectiveType === "price") {
          v = v.replace(/[^\d.,\s]/g, "");
         }
         onChange({ valor: v } as Partial<AutomationConfig>);
        }}
        placeholder={placeholder}
        className="mt-1 h-8 text-xs"
        disabled={!config.campo}
       />
      </div>
     </div>
     {config.valor && !validation.ok ? (
      <p className="text-[11px] text-destructive">⚠ {validation.error}</p>
     ) : null}
    </div>
   );
  }


  case "tarefa":
   return <TarefaConfigForm config={config} onChange={onChange} />;


  case "tarefa-concluida":
   return <TaskScopeForm kind="concluir" config={config} onChange={onChange} />;

  case "excluir-tarefas":
   return <TaskScopeForm kind="excluir" config={config} onChange={onChange} />;

  case "excluir-lead":
   return (
    <p className="text-xs text-destructive/90 leading-relaxed">
     ⚠️ Ao entrar nesta etapa, o lead será <strong>excluído permanentemente</strong>. Use com cuidado.
    </p>
   );

  case "duplicar-lead":
   return <DuplicarLeadForm config={config} onChange={onChange} funnels={funnels} />;

  case "salesbot":
   return <SalesbotPickerForm config={config} onChange={onChange} />;

  case "executar-ia":
   return <AgenteIaPickerForm config={config} onChange={onChange} />;

  case "pausar-ia":
   return (
    <p className="text-xs text-muted-foreground">
     Ao entrar nesta etapa, o <strong>Agente de IA</strong> ativo neste lead será pausado.
    </p>
   );

  case "msg-interna":
   return <MsgInternaForm config={config} onChange={onChange} users={users} />;

  case "gerar-form":
   return <GerarFormForm config={config} onChange={onChange} />;

  case "deletar-arquivos":
   return <DeletarArquivosForm config={config} onChange={onChange} />;

  case "meta-ads":
   return <MetaAdsForm config={config} onChange={onChange} />;

  case "webhook":
   return <WebhookConfigForm config={config} onChange={onChange} />;

  case "webhook-inbound":
   return <WebhookInboundConfigForm config={config} onChange={onChange} />;




  case "vincular-produto":
   return <VincularProdutoForm config={config} onChange={onChange} />;

  case "none":
  default:
   return (
    <p className="text-xs text-muted-foreground">
     Este gatilho ainda não é executável, em breve.
    </p>
   );
 }
}

/* --------------------- WebhookConfigForm --------------------- */
/**
 * Formulário unificado pra família de gatilhos "Webhook · …".
 * Front-end apenas: valida URL, gera segredo, mostra prévia do payload e "onde eu cadastro essa URL".
 * A execução real acontecerá quando o backend for plugado.
 */
function WebhookConfigForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "webhook" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const [showPayload, setShowPayload] = useState(false);
 const [showHelp, setShowHelp] = useState(false);
 const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
 const [testing, setTesting] = useState(false);

 const preset = config.preset;
 const presetLabel = WEBHOOK_PRESET_LABEL[preset];
 const eventName = WEBHOOK_PRESET_EVENT[preset];

 // Validação básica de URL
 const urlOk = (() => {
  if (!config.url) return null;
  try {
   const u = new URL(config.url);
   return u.protocol === "http:" || u.protocol === "https:";
  } catch {
   return false;
  }
 })();

 function generateSecret() {
  const rand = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
  const secret = `whsec_${rand.replace(/-/g, "").slice(0, 32)}`;
  onChange({ secret } as Partial<AutomationConfig>);
 }

 function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
 }

 async function runTest() {
  if (!urlOk || !config.url) return;
  setTesting(true);
  setTestResult(null);
  // Front-end only: simulação. Backend fará o POST real depois.
  setTimeout(() => {
   setTestResult({ ok: true, msg: "Simulado ✓, quando o backend estiver pronto, um POST real será enviado com o payload abaixo." });
   setTesting(false);
  }, 700);
 }

 const payload = webhookPreviewPayload(config);
 const payloadJson = JSON.stringify(payload, null, 2);

 return (
  <div className="space-y-3">
   {/* Cabeçalho preset */}
   <div className="rounded border border-primary/30 bg-primary/5 p-2.5">
    <div className="text-[11px] font-semibold text-primary">🔗 {presetLabel}</div>
    <div className="text-[10px] text-muted-foreground mt-0.5">
     Evento disparado: <code className="text-[10px] bg-background border border-border rounded px-1 py-0.5">{eventName}</code>
    </div>
   </div>

   {/* URL */}
   <div>
    <label className="text-[11px] text-muted-foreground">URL de destino</label>
    <div className="flex gap-1.5 mt-1">
     <Input
      type="url"
      value={config.url ?? ""}
      onChange={(e) => onChange({ url: e.target.value } as Partial<AutomationConfig>)}
      placeholder="https://hooks.zapier.com/hooks/catch/..."
      className={cn(
       "h-8 text-xs flex-1",
       urlOk === false && "border-destructive focus-visible:ring-destructive/40",
      )}
     />
     <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1 text-[11px]"
      disabled={!urlOk || testing}
      onClick={runTest}
      title="Enviar um POST de teste com o payload de exemplo"
     >
      <Play className="w-3 h-3" />
      Testar
     </Button>
    </div>
    {urlOk === false && (
     <p className="text-[10px] text-destructive mt-1">URL inválida, precisa começar com http:// ou https://</p>
    )}
    {testResult && (
     <div className={cn(
      "text-[10px] mt-1 flex items-start gap-1",
      testResult.ok ? "text-green-600" : "text-destructive",
     )}>
      {testResult.ok ? <CheckCircle2 className="w-3 h-3 mt-0.5" /> : <AlertCircle className="w-3 h-3 mt-0.5" />}
      <span>{testResult.msg}</span>
     </div>
    )}
   </div>

   {/* Extras específicos por preset */}
   {preset === "remarketing" && (
    <div>
     <label className="text-[11px] text-muted-foreground">Nome da audiência (opcional)</label>
     <Input
      value={config.audienceName ?? ""}
      onChange={(e) => onChange({ audienceName: e.target.value } as Partial<AutomationConfig>)}
      placeholder="Ex.: perdidos-30d"
      className="mt-1 h-8 text-xs"
     />
    </div>
   )}
   {preset === "sale-lost" && (
    <div>
     <label className="text-[11px] text-muted-foreground">Motivo padrão (opcional)</label>
     <Input
      value={config.motivoPadrao ?? ""}
      onChange={(e) => onChange({ motivoPadrao: e.target.value } as Partial<AutomationConfig>)}
      placeholder="Ex.: sem retorno"
      className="mt-1 h-8 text-xs"
     />
    </div>
   )}
   {preset === "billing" && (
    <div className="grid grid-cols-2 gap-2">
     <div>
      <label className="text-[11px] text-muted-foreground">Valor padrão (R$)</label>
      <Input
       value={config.valorPadrao ?? ""}
       onChange={(e) => onChange({ valorPadrao: e.target.value.replace(/[^\d.,]/g, "") } as Partial<AutomationConfig>)}
       placeholder="1500"
       className="mt-1 h-8 text-xs"
      />
     </div>
     <div>
      <label className="text-[11px] text-muted-foreground">Método</label>
      <select
       value={config.metodo ?? "pix"}
       onChange={(e) => onChange({ metodo: e.target.value } as Partial<AutomationConfig>)}
       className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs h-8"
      >
       <option value="pix">Pix</option>
       <option value="boleto">Boleto</option>
       <option value="cartao">Cartão</option>
       <option value="link">Link de pagamento</option>
      </select>
     </div>
    </div>
   )}

   {/* Segredo */}
   <div>
    <label className="text-[11px] text-muted-foreground flex items-center justify-between">
     <span>Segredo de assinatura (opcional)</span>
     <button
      type="button"
      onClick={generateSecret}
      className="text-[10px] text-primary hover:underline"
     >
      {config.secret ? "Regenerar" : "Gerar automaticamente"}
     </button>
    </label>
    <div className="flex gap-1.5 mt-1">
     <Input
      value={config.secret ?? ""}
      onChange={(e) => onChange({ secret: e.target.value } as Partial<AutomationConfig>)}
      placeholder="whsec_… (usado pelo destinatário para validar a origem)"
      className="h-8 text-xs flex-1 font-mono"
     />
     {config.secret && (
      <Button
       size="sm"
       variant="outline"
       className="h-8 px-2"
       onClick={() => copyToClipboard(config.secret!)}
       title="Copiar segredo"
      >
       <Copy className="w-3 h-3" />
      </Button>
     )}
    </div>
    <p className="text-[10px] text-muted-foreground mt-1">
     Enviado no header <code className="bg-muted rounded px-1">X-Saude-Slim-Signature</code> (HMAC-SHA256 do corpo).
    </p>
   </div>

   {/* Prévia do payload */}
   <div className="rounded border border-border overflow-hidden">
    <button
     type="button"
     onClick={() => setShowPayload((s) => !s)}
     className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/40 hover:bg-muted/60 text-[11px] font-medium"
    >
     <span>📦 Prévia do JSON enviado</span>
     <ChevronDown className={cn("w-3 h-3 transition-transform", showPayload && "rotate-180")} />
    </button>
    {showPayload && (
     <div className="relative">
      <pre className="text-[10px] leading-relaxed p-2.5 bg-background overflow-x-auto max-h-56 font-mono">
{payloadJson}
      </pre>
      <button
       type="button"
       onClick={() => copyToClipboard(payloadJson)}
       className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-primary bg-background/80 border border-border rounded p-1"
       title="Copiar JSON"
      >
       <Copy className="w-3 h-3" />
      </button>
     </div>
    )}
   </div>

   {/* Ajuda */}
   <div className="rounded border border-border overflow-hidden">
    <button
     type="button"
     onClick={() => setShowHelp((s) => !s)}
     className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/40 hover:bg-muted/60 text-[11px] font-medium"
    >
     <span>❓ Onde cadastro essa URL?</span>
     <ChevronDown className={cn("w-3 h-3 transition-transform", showHelp && "rotate-180")} />
    </button>
    {showHelp && (
     <div className="p-2.5 space-y-2 text-[10.5px] text-muted-foreground bg-background">
      <HelpLink
       label="Zapier"
       hint="Crie um Zap com trigger 'Webhooks by Zapier → Catch Hook' e copie a URL."
       href="/blog/integrar-saude-slim-com-zapier"
      />
      <HelpLink
       label="Make (Integromat)"
       hint="Módulo 'Webhooks → Custom webhook', copie o endereço gerado."
       href="/blog/integrar-saude-slim-com-make"
      />
      <HelpLink
       label="n8n"
       hint="Nó 'Webhook' com método POST, use a URL de produção."
       href="/blog/integrar-saude-slim-com-n8n"
      />
      <HelpLink
       label="Slack"
       hint="App Settings → Incoming Webhooks → Add New."
       href="/blog/notificar-slack-nova-venda"
      />
      <HelpLink
       label="Discord"
       hint="Server Settings → Integrations → Webhooks → New Webhook."
       href="/blog/notificar-discord-nova-venda"
      />
      <div className="mt-2 pt-2 border-t border-border">
       <a
        href="/blog/como-enviar-webhook-do-crm"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
       >
        📖 Ver guia completo: Como enviar um webhook do CRM
        <ExternalLink className="w-2.5 h-2.5" />
       </a>
      </div>
     </div>
    )}
   </div>

   {/* Aviso backend */}
   <div className="rounded border border-warning/40 bg-warning/5 p-2 text-[10px] text-warning-foreground/80">
    ⚙️ Interface pronta. A execução real (POST + assinatura HMAC + logs) será plugada no backend logo em seguida, a configuração salva aqui será reaproveitada.
   </div>
  </div>
 );
}

function HelpLink({ label, hint, href }: { label: string; hint: string; href: string }) {
 return (
  <div className="flex items-start gap-1.5">
   <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary hover:underline inline-flex items-center gap-0.5 shrink-0 font-medium"
   >
    {label} <ExternalLink className="w-2.5 h-2.5" />
   </a>
   <span>- {hint}</span>
  </div>
 );
}

/* --------------------- WebhookInboundConfigForm --------------------- */
/**
 * Recebe webhooks externos: cada workspace tem uma URL única.
 * Front-end only por enquanto, a URL exibida é um preview; o backend real será plugado depois.
 */
function WebhookInboundConfigForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "webhook-inbound" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const [showCurl, setShowCurl] = useState(false);
 const [showHelp, setShowHelp] = useState(false);

 // Placeholder, o backend gerará a URL real com workspace_id + secret assinado.
 const previewUrl = `https://app.saudeslim.local/api/public/webhook/inbound/{workspace}/{secret}`;

 function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
 }

 function rotateSecret() {
  onChange({ secretRotated: new Date().toISOString() } as Partial<AutomationConfig>);
 }

 const curlExample = `curl -X POST ${previewUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "${config.mapName ?? "name"}": "Lead de teste",
    "${config.mapEmail ?? "email"}": "teste@exemplo.com",
    "${config.mapPhone ?? "phone"}": "5511999990000"${config.mapValue ? `,\n    "${config.mapValue}": 1500` : ""}${config.mapTags ? `,\n    "${config.mapTags}": ["origem-externa"]` : ""}
  }'`;

 return (
  <div className="space-y-3">
   {/* Cabeçalho */}
   <div className="rounded border border-primary/30 bg-primary/5 p-2.5">
    <div className="text-[11px] font-semibold text-primary">📥 URL de entrada</div>
    <div className="text-[10px] text-muted-foreground mt-0.5">
     Todo POST recebido nesta URL vira um lead novo nesta etapa.
    </div>
   </div>

   {/* URL única */}
   <div>
    <label className="text-[11px] text-muted-foreground flex items-center justify-between">
     <span>URL exclusiva desta workspace</span>
     <button
      type="button"
      onClick={rotateSecret}
      className="text-[10px] text-primary hover:underline"
      title="Gerar novo segredo (invalida URLs anteriores)"
     >
      Rotacionar segredo
     </button>
    </label>
    <div className="flex gap-1.5 mt-1">
     <Input
      readOnly
      value={previewUrl}
      className="h-8 text-xs flex-1 font-mono text-muted-foreground"
     />
     <Button
      size="sm"
      variant="outline"
      className="h-8 px-2"
      onClick={() => copy(previewUrl)}
      title="Copiar URL"
     >
      <Copy className="w-3 h-3" />
     </Button>
    </div>
    <p className="text-[10px] text-muted-foreground mt-1">
     ⚙️ URL final (com o secret real) será gerada quando o backend for plugado.
    </p>
   </div>

   {/* Rótulo de origem */}
   <div>
    <label className="text-[11px] text-muted-foreground">Rótulo da origem (opcional)</label>
    <Input
     value={config.sourceLabel ?? ""}
     onChange={(e) => onChange({ sourceLabel: e.target.value } as Partial<AutomationConfig>)}
     placeholder="Ex.: Meta Ads · Formulário LP · Checkout Hotmart"
     className="mt-1 h-8 text-xs"
    />
    <p className="text-[10px] text-muted-foreground mt-1">
     Aparece na origem do lead no CRM pra você identificar de onde veio.
    </p>
   </div>

   {/* Mapeamento de campos */}
   <div>
    <div className="text-[11px] font-medium mb-1.5">Mapeamento de campos</div>
    <p className="text-[10px] text-muted-foreground mb-2">
     Qual chave do JSON recebido corresponde a cada campo do lead? Use notação de ponto pra objetos aninhados (ex.: <code className="bg-muted rounded px-1">contact.name</code>).
    </p>
    <div className="grid grid-cols-2 gap-2">
     <MapField label="Nome" value={config.mapName} onChange={(v) => onChange({ mapName: v } as Partial<AutomationConfig>)} placeholder="name" />
     <MapField label="E-mail" value={config.mapEmail} onChange={(v) => onChange({ mapEmail: v } as Partial<AutomationConfig>)} placeholder="email" />
     <MapField label="Telefone" value={config.mapPhone} onChange={(v) => onChange({ mapPhone: v } as Partial<AutomationConfig>)} placeholder="phone" />
     <MapField label="Valor (opcional)" value={config.mapValue} onChange={(v) => onChange({ mapValue: v } as Partial<AutomationConfig>)} placeholder="value" />
     <MapField label="Tags (opcional)" value={config.mapTags} onChange={(v) => onChange({ mapTags: v } as Partial<AutomationConfig>)} placeholder="tags" />
    </div>
   </div>

   {/* Exemplo curl */}
   <div className="rounded border border-border overflow-hidden">
    <button
     type="button"
     onClick={() => setShowCurl((s) => !s)}
     className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/40 hover:bg-muted/60 text-[11px] font-medium"
    >
     <span>🧪 Testar com curl</span>
     <ChevronDown className={cn("w-3 h-3 transition-transform", showCurl && "rotate-180")} />
    </button>
    {showCurl && (
     <div className="relative">
      <pre className="text-[10px] leading-relaxed p-2.5 bg-background overflow-x-auto max-h-56 font-mono">
{curlExample}
      </pre>
      <button
       type="button"
       onClick={() => copy(curlExample)}
       className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-primary bg-background/80 border border-border rounded p-1"
       title="Copiar comando"
      >
       <Copy className="w-3 h-3" />
      </button>
     </div>
    )}
   </div>

   {/* Ajuda */}
   <div className="rounded border border-border overflow-hidden">
    <button
     type="button"
     onClick={() => setShowHelp((s) => !s)}
     className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/40 hover:bg-muted/60 text-[11px] font-medium"
    >
     <span>❓ Onde cadastro essa URL de entrada?</span>
     <ChevronDown className={cn("w-3 h-3 transition-transform", showHelp && "rotate-180")} />
    </button>
    {showHelp && (
     <div className="p-2.5 space-y-2 text-[10.5px] text-muted-foreground bg-background">
      <HelpLink
       label="Meta Lead Ads"
       hint="Business Manager → Integrações → adicionar Webhook, cole a URL acima."
       href="/blog/como-receber-webhook-no-crm"
      />
      <HelpLink
       label="Checkout (Hotmart, Kirvano, Kiwify)"
       hint="Postbacks / Webhooks → adicionar novo → cole a URL e escolha o evento 'compra aprovada'."
       href="/blog/como-receber-webhook-no-crm"
      />
      <HelpLink
       label="Typeform / Tally"
       hint="Configurações do formulário → Integrações → Webhook → cole a URL."
       href="/blog/como-receber-webhook-no-crm"
      />
      <div className="mt-2 pt-2 border-t border-border">
       <a
        href="/blog/como-receber-webhook-no-crm"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
       >
        📖 Guia completo: Como receber webhooks no CRM
        <ExternalLink className="w-2.5 h-2.5" />
       </a>
      </div>
     </div>
    )}
   </div>

   {/* Aviso backend */}
   <div className="rounded border border-warning/40 bg-warning/5 p-2 text-[10px] text-warning-foreground/80">
    ⚙️ Interface pronta. Backend (URL real com secret, mapeamento executado, criação automática do lead) será plugado logo em seguida, o mapeamento salvo aqui será reaproveitado.
   </div>
  </div>
 );
}

function MapField({
 label, value, onChange, placeholder,
}: { label: string; value?: string; onChange: (v: string) => void; placeholder: string }) {
 return (
  <div>
   <label className="text-[10px] text-muted-foreground">{label}</label>
   <Input
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="mt-0.5 h-7 text-[11px] font-mono"
   />
  </div>
 );
}

/* ============ Novos forms de config (front-end) ============ */

function TarefaConfigForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "tarefa" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const listPipes = useServerFn(listWorkflowPipelinesLite);
 const q = useQuery({
  queryKey: ["workflow-pipes-lite"],
  queryFn: () => listPipes(),
  staleTime: 60_000,
 });
 const pipes = (q.data ?? []) as Array<{ id: string; name: string; members: Array<{ id: string; name: string }>; stages?: Array<{ id: string; name: string }> }>;
 const selectedPipe = pipes.find((p) => p.id === config.workflowPipelineId);
 const members = selectedPipe?.members ?? [];
 const stages = selectedPipe?.stages ?? [];
 const destino = config.destino ?? (config.workflowPipelineId ? "fluxo" : "calendario");
 const prazoUnidade = config.prazoUnidade ?? "dias";
 const prazoValor = config.prazoValor ?? config.diasAdiante ?? 1;


 return (
  <div className="space-y-2">
   <div>
    <label className="text-[11px] text-muted-foreground">Título</label>
    <Input
     value={config.titulo ?? ""}
     onChange={(e) => onChange({ titulo: e.target.value } as Partial<AutomationConfig>)}
     placeholder="Ligar para o lead"
     className="mt-1 h-8 text-xs"
    />
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Descrição (opcional)</label>
    <Input
     value={config.descricao ?? ""}
     onChange={(e) => onChange({ descricao: e.target.value } as Partial<AutomationConfig>)}
     className="mt-1 h-8 text-xs"
    />
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Prazo</label>
    <div className="mt-1 flex items-center gap-2">
     <Input
      type="number"
      min={0}
      value={prazoValor}
      onChange={(e) => onChange({ prazoValor: Math.max(0, Number(e.target.value) || 0), diasAdiante: undefined } as Partial<AutomationConfig>)}
      className="h-8 text-xs w-20"
     />
     <select
      value={prazoUnidade}
      onChange={(e) => onChange({ prazoUnidade: e.target.value as "minutos" | "horas" | "dias", prazoValor, diasAdiante: undefined } as Partial<AutomationConfig>)}
      className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs"
     >
      <option value="minutos">minuto(s)</option>
      <option value="horas">hora(s)</option>
      <option value="dias">dia(s)</option>
     </select>
    </div>
    <p className="mt-1 text-[10px] text-muted-foreground">
     Use <strong>0</strong> para vencimento imediato. Ex.: 15 minutos, 2 horas ou 3 dias a partir da execução.
    </p>
   </div>
   <div className="pt-2 border-t border-border/60">
    <label className="text-[11px] text-muted-foreground">Onde criar a tarefa</label>
    <select
     value={destino}
     onChange={(e) => {
      const d = e.target.value as "calendario" | "fluxo" | "ambos";
      onChange({
       destino: d,
       ...(d === "calendario" ? { workflowPipelineId: undefined, workflowPipelineNome: undefined, workflowStageId: undefined, workflowStageNome: undefined, workflowAssigneeId: undefined, workflowAssigneeNome: undefined } : {}),
      } as Partial<AutomationConfig>);
     }}
     className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
    >
     <option value="calendario">Somente no Calendário</option>
     <option value="fluxo">Somente no Fluxo de Trabalho</option>
     <option value="ambos">Nos dois (Calendário + Fluxo)</option>
    </select>
   </div>
   {destino !== "calendario" && (
    <>
     <div>
      <label className="text-[11px] text-muted-foreground">Fluxo de trabalho (Kanban)</label>
      <select
       value={config.workflowPipelineId ?? ""}
       onChange={(e) => {
        const id = e.target.value || undefined;
        const pipe = pipes.find((p) => p.id === id);
        onChange({
         workflowPipelineId: id,
         workflowPipelineNome: pipe?.name,
         workflowStageId: undefined,
         workflowStageNome: undefined,
         workflowAssigneeId: undefined,
         workflowAssigneeNome: undefined,
        } as Partial<AutomationConfig>);
       }}
       className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
      >
       <option value="">- Selecione o fluxo -</option>
       {pipes.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
       ))}
      </select>
     </div>
     {config.workflowPipelineId && (
      <>
       <div>
        <label className="text-[11px] text-muted-foreground">Etapa do fluxo</label>
        <select
         value={config.workflowStageId ?? ""}
         onChange={(e) => {
          const id = e.target.value || undefined;
          const st = stages.find((s) => s.id === id);
          onChange({ workflowStageId: id, workflowStageNome: st?.name } as Partial<AutomationConfig>);
         }}
         className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
        >
         <option value="">- Primeira etapa -</option>
         {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
         ))}
        </select>
       </div>
       <div>
        <label className="text-[11px] text-muted-foreground">Responsável</label>
        <select
         value={config.workflowAssigneeId ?? ""}
         onChange={(e) => {
          const id = e.target.value || undefined;
          const m = members.find((x) => x.id === id);
          onChange({ workflowAssigneeId: id, workflowAssigneeNome: m?.name } as Partial<AutomationConfig>);
         }}
         className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
        >
         <option value="">- Sem responsável -</option>
         {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
         ))}
        </select>
        {members.length === 0 && (
         <p className="mt-1 text-[10px] text-muted-foreground">Este fluxo não tem setor com membros; a tarefa entra sem responsável.</p>
        )}
       </div>
       <div>
        <label className="text-[11px] text-muted-foreground">Prioridade</label>
        <select
         value={config.workflowPriority ?? "media"}
         onChange={(e) => onChange({ workflowPriority: e.target.value as "baixa" | "media" | "alta" | "urgente" } as Partial<AutomationConfig>)}
         className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
        >
         <option value="baixa">Baixa</option>
         <option value="media">Média</option>
         <option value="alta">Alta</option>
         <option value="urgente">Urgente</option>
        </select>
       </div>
      </>
     )}
    </>
   )}

  </div>
 );
}

function TaskScopeForm({
 kind,
 config,
 onChange,
}: {
 kind: "concluir" | "excluir";
 config: Extract<AutomationConfig, { kind: "tarefa-concluida" | "excluir-tarefas" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const escopo = config.escopo ?? "todas";
 const verb = kind === "concluir" ? "concluir" : "excluir";
 return (
  <div className="space-y-2">
   <label className="text-[11px] text-muted-foreground">O que fazer?</label>
   <div className="flex gap-2">
    <button
     type="button"
     onClick={() => onChange({ escopo: "todas", taskId: undefined, taskTitulo: undefined } as Partial<AutomationConfig>)}
     className={cn("flex-1 px-3 py-2 rounded border text-xs", escopo === "todas" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent")}
    >Todas as tarefas</button>
    <button
     type="button"
     onClick={() => onChange({ escopo: "especifica" } as Partial<AutomationConfig>)}
     className={cn("flex-1 px-3 py-2 rounded border text-xs", escopo === "especifica" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent")}
    >Uma tarefa específica</button>
   </div>
   {escopo === "especifica" && (
    <div>
     <label className="text-[11px] text-muted-foreground">Título da tarefa a {verb}</label>
     <Input
      value={config.taskTitulo ?? ""}
      onChange={(e) => onChange({ taskId: `title:${e.target.value}`, taskTitulo: e.target.value } as Partial<AutomationConfig>)}
      placeholder="Ex.: Ligar para o lead"
      className="mt-1 h-8 text-xs"
     />
     <p className="mt-1 text-[10px] text-muted-foreground">Casa por título exato (case-insensitive) entre as tarefas pendentes.</p>
    </div>
   )}
  </div>
 );
}

function DuplicarLeadForm({
 config,
 onChange,
 funnels,
}: {
 config: Extract<AutomationConfig, { kind: "duplicar-lead" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
 funnels: Funnel[];
}) {
 const allStages = funnels.flatMap((f) => f.stages.map((s) => ({ id: s.id, label: `${f.name} · ${s.name}` })));
 return (
  <div className="space-y-2">
   <div className="flex items-center gap-2">
    <Switch
     checked={config.manterEtapa !== false && !config.toStageId}
     onCheckedChange={(v) => onChange({ manterEtapa: v, toStageId: v ? undefined : config.toStageId, toStageNome: v ? undefined : config.toStageNome } as Partial<AutomationConfig>)}
    />
    <span className="text-xs">Duplicar na mesma etapa</span>
   </div>
   {!(config.manterEtapa !== false && !config.toStageId) && (
    <div>
     <label className="text-[11px] text-muted-foreground">Etapa de destino da cópia</label>
     <select
      value={config.toStageId ?? ""}
      onChange={(e) => {
       const opt = allStages.find((s) => s.id === e.target.value);
       onChange({ manterEtapa: false, toStageId: opt?.id, toStageNome: opt?.label } as Partial<AutomationConfig>);
      }}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     >
      <option value="">Selecione…</option>
      {allStages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
     </select>
    </div>
   )}
  </div>
 );
}

function SalesbotPickerForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "salesbot" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const listFn = useServerFn(listSalesbots);
 const botsQ = useQuery({
  queryKey: ["salesbots"],
  queryFn: () => listFn(),
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
 });
 const bots = (botsQ.data?.bots ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
 const loading = botsQ.isLoading;
 return (
  <div>
   <label className="text-[11px] text-muted-foreground">Qual SalesBot enviar?</label>
   <select
    value={config.botId ?? ""}
    onChange={(e) => {
     const b = bots.find((x) => x.id === e.target.value);
     onChange({ botId: b?.id, botNome: b?.name } as Partial<AutomationConfig>);
    }}
    className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
   >
    <option value="">{loading ? "Carregando…" : bots.length === 0 ? "Nenhum SalesBot criado" : "Selecione…"}</option>
    {bots.map((b) => (
     <option key={b.id} value={b.id}>{b.name}{b.is_active ? "" : " (inativo)"}</option>
    ))}
   </select>
   {!loading && bots.length === 0 && (
    <p className="mt-1 text-[10px] text-muted-foreground">Crie um SalesBot na tela de Bots antes de usar este gatilho.</p>
   )}
  </div>
 );
}

function AgenteIaPickerForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "executar-ia" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
  const listFn = useServerFn(listActiveWorkspaceConversationAgents);
  const agentsQ = useQuery({
   queryKey: ["conversation-agents", "active-workspace"],
   queryFn: () => listFn(),
   staleTime: 0,
   refetchOnMount: "always",
   refetchOnWindowFocus: true,
  });
  const agents = (agentsQ.data?.agents ?? []) as Array<{ id: string; name: string; enabled: boolean }>;
 return (
  <div>
   <label className="text-[11px] text-muted-foreground">Qual Agente IA executar?</label>
   <select
    value={config.agentId ?? ""}
    onChange={(e) => {
     const a = agents.find((x) => x.id === e.target.value);
     onChange({ agentId: a?.id, agentNome: a?.name } as Partial<AutomationConfig>);
    }}
    className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
   >
     <option value="">{agentsQ.isLoading ? "Carregando…" : agents.length === 0 ? "Nenhum agente criado" : "Selecione…"}</option>
     {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.enabled ? "" : " (disponível por automação)"}</option>)}
   </select>
    <p className="mt-1 text-[10px] text-muted-foreground">O agente selecionado assume as próximas mensagens do lead ao entrar nesta etapa.</p>
  </div>
 );
}

function MsgInternaForm({
 config,
 onChange,
 users,
}: {
 config: Extract<AutomationConfig, { kind: "msg-interna" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
 users: Array<{ id: string; name: string }>;
}) {
 return (
  <div className="space-y-2">
   <div>
    <label className="text-[11px] text-muted-foreground">Destinatário</label>
    <select
     value={config.toUserId ?? ""}
     onChange={(e) => {
      const u = users.find((x) => x.id === e.target.value);
      onChange({ toUserId: u?.id, toUserNome: u?.name } as Partial<AutomationConfig>);
     }}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="">{users.length === 0 ? "Carregando…" : "Selecione…"}</option>
     {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Mensagem interna</label>
    <textarea
     value={config.mensagem ?? ""}
     onChange={(e) => onChange({ mensagem: e.target.value } as Partial<AutomationConfig>)}
     rows={3}
     placeholder="Ex.: Lead entrou em negociação, dar prioridade hoje."
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    />
   </div>
  </div>
 );
}

function GerarFormForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "gerar-form" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
  const canal = config.canal ?? "link";
  const mensagem = config.mensagem ?? DEFAULT_FORM_MESSAGE_TEMPLATE;
  const loadForms = useServerFn(listForms);
  const formsQ = useQuery<FormRecord[]>({
    queryKey: ["forms-list"],
    queryFn: () => loadForms({}) as Promise<FormRecord[]>,
    staleTime: 60_000,
  });
  const forms: FormRecord[] = formsQ.data ?? [];
  return (
   <div className="space-y-2">
    <div>
     <label className="text-[11px] text-muted-foreground">Formulário</label>
     <select
      value={config.formId ?? ""}
      onChange={(e) => {
       const opt = e.target.selectedOptions[0];
       onChange({ formId: e.target.value || undefined, formNome: opt?.text } as Partial<AutomationConfig>);
      }}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     >
      <option value="">{formsQ.isLoading ? "Carregando…" : "Selecione…"}</option>
      {forms.map((f) => (
       <option key={f.id} value={f.id}>{f.nome}</option>
      ))}
     </select>
    <p className="mt-1 text-[10px] text-muted-foreground">
     Gerencie e crie formulários em <a href="/crm/formularios" className="text-primary underline">CRM → Formulários</a>.
    </p>
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Enviar por</label>
    <select
     value={canal}
     onChange={(e) => onChange({ canal: e.target.value as "whatsapp" | "email" | "link" } as Partial<AutomationConfig>)}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="whatsapp">Enviar por WhatsApp</option>
     <option value="link">Só gerar o link (registrar como nota no lead)</option>
     
    </select>
   </div>
    {canal === "whatsapp" && (
     <div>
      <label className="text-[11px] text-muted-foreground">Mensagem</label>
      <MessageTemplateEditor
       value={mensagem}
       onChange={(v: string) => onChange({ mensagem: v } as Partial<AutomationConfig>)}
       rows={3}
       placeholder={DEFAULT_FORM_MESSAGE_TEMPLATE}
       helper={<>
        Digite <code className="px-1 rounded bg-muted">{"{"}</code> ou clique em <span className="font-mono">{"{ }"}</span> pra inserir variáveis (nome, telefone, campos personalizados, etc.). O <code className="px-1 rounded bg-muted">{`{{link}}`}</code> já traz o <code className="px-1 rounded bg-muted">leadId</code>. Envio via WhatsApp Web, precisa de sessão conectada em Integrações.
       </>}
      />
     </div>
    )}
  </div>
 );
}

function DeletarArquivosForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "deletar-arquivos" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const escopo = config.escopo ?? "todos";
 return (
  <div className="space-y-2">
   <label className="text-[11px] text-muted-foreground">Quais arquivos apagar?</label>
   <select
    value={escopo}
    onChange={(e) => onChange({ escopo: e.target.value as "todos" | "descartados" | "por-tipo" | "por-tag" } as Partial<AutomationConfig>)}
    className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
   >
    <option value="todos">Todos os arquivos do lead</option>
    <option value="descartados">Só os marcados como “descartar”</option>
    <option value="por-tipo">Por tipo (imagem/áudio/PDF…)</option>
    <option value="por-tag">Por tag</option>
   </select>
   {escopo === "por-tipo" && (
    <Input value={config.tipo ?? ""} onChange={(e) => onChange({ tipo: e.target.value } as Partial<AutomationConfig>)} placeholder="Ex.: image, audio, application/pdf" className="h-8 text-xs" />
   )}
   {escopo === "por-tag" && (
    <Input value={config.tag ?? ""} onChange={(e) => onChange({ tag: e.target.value } as Partial<AutomationConfig>)} placeholder="Ex.: comprovante" className="h-8 text-xs" />
   )}
   <p className="text-[10px] text-muted-foreground">
    Classifique e defina regras em <a href="/crm/arquivos" className="text-primary underline">CRM → Arquivos</a>.
   </p>
  </div>
 );
}

function VincularProdutoForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "vincular-produto" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const listFn = useServerFn(listProductCatalogs);
 const q = useQuery({
  queryKey: ["crm-automation-products"],
  queryFn: async () => (await listFn()) as any[],
 });
 const catalogs = q.data ?? [];

 return (
  <div className="space-y-3">
   <div>
    <label className="text-[11px] text-muted-foreground">Produto do catálogo</label>
    <select
     value={config.productId ?? ""}
     onChange={(e) => {
      let name = "";
      for (const c of catalogs) {
       const p = c.products?.find((x: any) => x.id === e.target.value);
       if (p) {
        name = p.name;
        break;
       }
      }
      onChange({ productId: e.target.value, productNome: name });
     }}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="">Selecione um produto…</option>
     {catalogs.map((c) => (
      <optgroup key={c.id} label={c.name}>
       {(c.products ?? []).map((p: any) => (
        <option key={p.id} value={p.id}>{p.name}</option>
       ))}
      </optgroup>
     ))}
    </select>
   </div>
   <div>
    <label className="text-[11px] text-muted-foreground">Tipo de vínculo</label>
    <select
     value={config.productKind ?? "interesse"}
     onChange={(e) => onChange({ productKind: e.target.value as "interesse" | "comprou" })}
     className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
    >
     <option value="interesse">Declarou interesse</option>
     <option value="comprou">Comprou o produto</option>
    </select>
   </div>
   {q.isLoading && <p className="text-[10px] text-muted-foreground animate-pulse">Carregando catálogo…</p>}
  </div>
 );
}


function MetaAdsForm({
 config,
 onChange,
}: {
 config: Extract<AutomationConfig, { kind: "meta-ads" }>;
 onChange: (patch: Partial<AutomationConfig>) => void;
}) {
 const modo = config.modo ?? "enviar";
 const ev = config.eventName ?? "Lead";
 const origin = typeof window !== "undefined" ? window.location.origin : "";
 const snippetSrc = `${origin}/api/public/track/meta-snippet`;
 const snippet = `<script src="${snippetSrc}"\n  data-pixel-id="${config.pixelId ?? "SEU_PIXEL_ID"}"\n  data-saude-slim-origin="${origin}"></script>`;
 const formHint = `<form data-saude-slim-lead-id="{{leadId}}"> ... </form>`;
 return (
  <div className="space-y-2">
   <div>
    <label className="text-[11px] text-muted-foreground">Modo</label>
    <div className="mt-1 flex gap-2">
     <button type="button" onClick={() => onChange({ modo: "enviar" } as Partial<AutomationConfig>)} className={cn("flex-1 px-3 py-2 rounded border text-xs", modo === "enviar" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent")}>
      Enviar evento (Conversions API)
     </button>
     <button type="button" onClick={() => onChange({ modo: "capturar" } as Partial<AutomationConfig>)} className={cn("flex-1 px-3 py-2 rounded border text-xs", modo === "capturar" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent")}>
      Capturar (marca a origem)
     </button>
    </div>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <div>
     <label className="text-[11px] text-muted-foreground">Pixel ID (Conjunto de Dados)</label>
     <Input value={config.pixelId ?? ""} onChange={(e) => onChange({ pixelId: e.target.value } as Partial<AutomationConfig>)} placeholder="Ex.: 1234567890" className="h-8 text-xs" />
    </div>
    <div>
     <label className="text-[11px] text-muted-foreground">Evento</label>
     <select
      value={ev}
      onChange={(e) => onChange({ eventName: e.target.value as "Lead" | "Purchase" | "LeadLost" | "CompleteRegistration" | "Contact" | "Schedule" | "custom" } as Partial<AutomationConfig>)}
      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
     >
      <option value="Lead">Lead (lead gerado)</option>
      <option value="Purchase">Purchase (venda ganha)</option>
      <option value="LeadLost">LeadLost (lead perdido)</option>
      <option value="CompleteRegistration">CompleteRegistration</option>
      <option value="Contact">Contact</option>
      <option value="Schedule">Schedule</option>
      <option value="custom">Custom…</option>
     </select>
    </div>
   </div>
   {ev === "custom" && (
    <Input value={config.customEventName ?? ""} onChange={(e) => onChange({ customEventName: e.target.value } as Partial<AutomationConfig>)} placeholder="Nome do evento custom" className="h-8 text-xs" />
   )}
   {modo === "enviar" && (
    <>
     <div className="grid grid-cols-2 gap-2">
      <div>
       <label className="text-[11px] text-muted-foreground">Valor padrão</label>
       <Input value={config.valorPadrao ?? ""} onChange={(e) => onChange({ valorPadrao: e.target.value } as Partial<AutomationConfig>)} placeholder="usa o valor do lead" className="h-8 text-xs" />
      </div>
      <div>
       <label className="text-[11px] text-muted-foreground">Moeda (opcional)</label>
       <Input
        value={config.moeda ?? ""}
        onChange={(e) => onChange({ moeda: (e.target.value.toUpperCase() || undefined) as "BRL" | "USD" | "EUR" | undefined } as Partial<AutomationConfig>)}
        placeholder="usa moeda do workspace"
        maxLength={3}
        className="h-8 text-xs uppercase"
       />
      </div>
     </div>
     <div>
      <label className="text-[11px] text-muted-foreground">Test Event Code (opcional)</label>
      <Input
       value={config.testEventCode ?? ""}
       onChange={(e) => onChange({ testEventCode: e.target.value || undefined } as Partial<AutomationConfig>)}
       placeholder="Ex.: TEST12345, pega no Gerenciador de Eventos"
       className="h-8 text-xs"
      />
      <p className="text-[10px] text-muted-foreground mt-0.5">Enquanto tiver preenchido, o evento aparece só na aba <b>Testar eventos</b> da Meta, não vai pra produção.</p>
     </div>
    </>
   )}
   {modo === "capturar" && (
    <div className="rounded border border-dashed border-border bg-muted/30 p-2 space-y-1.5">
     <p className="text-[11px] font-medium">Snippet pro site do cliente</p>
     <p className="text-[10px] text-muted-foreground">Cole antes do <code>&lt;/head&gt;</code>. Formulários que representarem um lead devem incluir <code>{formHint}</code>.</p>
     <pre className="text-[10px] bg-background border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
     <button
      type="button"
      onClick={() => { try { navigator.clipboard.writeText(snippet); } catch {} }}
      className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
     >Copiar snippet</button>
    </div>
   )}
   <p className="text-[10px] text-muted-foreground">
    Token: usa o <b>System User Token</b> configurado em Integrações → Meta → Conversions API. Sem ele, cai no token OAuth do usuário conectado.
   </p>
  </div>
 );
}
function BulkMoveDialog({
 open,
 onClose,
 funnels,
 onConfirm,
 loading,
}: {
 open: boolean;
 onClose: () => void;
 funnels: Funnel[];
 onConfirm: (pipelineId: string, stageId: string) => Promise<void>;
 loading: boolean;
}) {
 const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
 const [selectedStageId, setSelectedStageId] = useState<string>("");

 const selectedPipeline = funnels.find((p) => p.id === selectedPipelineId);

 return (
  <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
   <DialogContent className="sm:max-w-[400px]">
    <DialogHeader>
     <DialogTitle className="flex items-center gap-2">
      <MoveRight className="w-5 h-5 text-primary" />
      Mover Leads em Massa
     </DialogTitle>
     <DialogDescription>
      Escolha o destino para os leads selecionados.
     </DialogDescription>
    </DialogHeader>

    <div className="py-4 space-y-4">
     <div className="space-y-2">
      <label className="text-sm font-medium">Pipeline de destino</label>
      <Select
       value={selectedPipelineId}
       onValueChange={(val: string) => {
        setSelectedPipelineId(val);
        setSelectedStageId("");
       }}
      >
       <SelectTrigger>
        <SelectValue placeholder="Selecione a pipeline" />
       </SelectTrigger>
       <SelectContent>
        {funnels.map((p) => (
         <SelectItem key={p.id} value={p.id}>
          {p.name}
         </SelectItem>
        ))}
       </SelectContent>
      </Select>
     </div>

     {selectedPipeline && (
      <div className="space-y-2">
       <label className="text-sm font-medium">Etapa de destino</label>
       <Select value={selectedStageId} onValueChange={setSelectedStageId}>
        <SelectTrigger>
         <SelectValue placeholder="Selecione a etapa" />
        </SelectTrigger>
        <SelectContent>
         {selectedPipeline.stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
           {s.name}
          </SelectItem>
         ))}
        </SelectContent>
       </Select>
      </div>
     )}
    </div>

    <DialogFooter>
     <Button variant="ghost" onClick={onClose} disabled={loading}>
      Cancelar
     </Button>
     <Button
      disabled={!selectedPipelineId || !selectedStageId || loading}
      onClick={() => onConfirm(selectedPipelineId, selectedStageId)}
     >
      {loading ? "Movendo..." : "Confirmar Movimentação"}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 );
}

