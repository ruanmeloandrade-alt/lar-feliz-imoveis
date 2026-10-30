import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Play, RefreshCw, Trash2, Loader2, CheckCircle2, XCircle, PauseCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listAutomationRules, createAutomationRule, updateAutomationRule,
  toggleAutomationRule, deleteAutomationRule, listAutomationRuns, runAutomationRuleNow,
} from "@/lib/meta-automations.functions";
import { listMetaCampaigns, listMetaAdSets, listMetaAds } from "@/lib/meta.functions";
import { META_KPI_CATALOG } from "@/lib/meta-dashboard-kpis";
import { MetaRuleStatsDialog } from "./MetaRuleStatsDialog";

const METRICS = META_KPI_CATALOG
  .filter((k) => !!k.totalsField && k.unit !== "ranking")
  .map((k) => ({ v: k.key, l: k.label, group: k.group }));
const OPS = [
  { v: "gt", l: ">" }, { v: "gte", l: "≥" }, { v: "lt", l: "<" }, { v: "lte", l: "≤" }, { v: "eq", l: "=" },
] as const;
const WINDOWS = [
  { v: "last_1d", l: "1 dia" }, { v: "last_3d", l: "3 dias" }, { v: "last_7d", l: "7 dias" },
  { v: "last_14d", l: "14 dias" }, { v: "last_30d", l: "30 dias" },
] as const;
const SCOPES = [
  { v: "workspace", l: "Todo o workspace" },
  { v: "ad_account", l: "Conta de anúncios" },
  { v: "campaign", l: "Campanha específica" },
  { v: "adset", l: "Conjunto específico" },
  { v: "ad", l: "Anúncio específico" },
] as const;
const ACTIONS = [
  { v: "pause_campaign", l: "Pausar campanha" },
  { v: "activate_campaign", l: "Ativar campanha" },
  { v: "pause_adset", l: "Pausar conjunto" },
  { v: "activate_adset", l: "Ativar conjunto" },
  { v: "pause_ad", l: "Pausar anúncio" },
  { v: "activate_ad", l: "Ativar anúncio" },
  { v: "increase_budget", l: "Aumentar orçamento" },
  { v: "decrease_budget", l: "Reduzir orçamento" },
  { v: "duplicate_campaign", l: "Duplicar campanha" },
  { v: "duplicate_adset", l: "Duplicar conjunto" },
  { v: "duplicate_ad", l: "Duplicar anúncio" },
  { v: "notify_only", l: "Apenas notificar" },
  { v: "create_workflow_task", l: "Criar tarefa no fluxo de trabalho" },
  { v: "create_calendar_task", l: "Criar tarefa no calendário" },
] as const;

const ACTION_GROUPS: Array<{ label: string; items: Array<{ v: (typeof ACTIONS)[number]["v"]; l: string }> }> = [
  { label: "Campanha", items: [
    { v: "pause_campaign", l: "Pausar campanha" },
    { v: "activate_campaign", l: "Ativar campanha" },
    { v: "duplicate_campaign", l: "Duplicar campanha" },
  ] },
  { label: "Conjunto", items: [
    { v: "pause_adset", l: "Pausar conjunto" },
    { v: "activate_adset", l: "Ativar conjunto" },
    { v: "duplicate_adset", l: "Duplicar conjunto" },
  ] },
  { label: "Anúncio", items: [
    { v: "pause_ad", l: "Pausar anúncio" },
    { v: "activate_ad", l: "Ativar anúncio" },
    { v: "duplicate_ad", l: "Duplicar anúncio" },
  ] },
  { label: "Orçamento", items: [
    { v: "increase_budget", l: "Aumentar orçamento" },
    { v: "decrease_budget", l: "Reduzir orçamento" },
  ] },
  { label: "Time", items: [
    { v: "notify_only", l: "Apenas notificar" },
    { v: "create_workflow_task", l: "Criar tarefa no fluxo de trabalho" },
    { v: "create_calendar_task", l: "Criar tarefa no calendário" },
  ] },
];


const METRIC_UNIT: Record<string, string> = Object.fromEntries(
  META_KPI_CATALOG.map((k) => [k.key, k.unit]),
);
function isCurrencyMetric(k: string) { return METRIC_UNIT[k] === "currency"; }
function isPercentMetric(k: string) { return METRIC_UNIT[k] === "percent"; }
function currencySymbol(cur: string | null | undefined): string {
  const c = (cur ?? "BRL").toUpperCase();
  return c === "BRL" ? "R$" : c === "USD" ? "US$" : c === "EUR" ? "€" : c === "GBP" ? "£" : c === "MXN" ? "MX$" : c === "ARS" ? "AR$" : c;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function InlineLoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">A conexão oscilou ou a integração respondeu fora do esperado.</div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted transition"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}

const INTERVALS = [
  { v: 5, l: "5 min" }, { v: 10, l: "10 min" }, { v: 15, l: "15 min" },
  { v: 20, l: "20 min" }, { v: 30, l: "30 min" }, { v: 60, l: "1 hora" },
  { v: 120, l: "2 horas" }, { v: 240, l: "4 horas" }, { v: 480, l: "8 horas" },
  { v: 720, l: "12 horas" }, { v: 1440, l: "24 horas" },
] as const;

type ConditionRow = {
  key: string;
  metric: (typeof METRICS)[number]["v"];
  operator: (typeof OPS)[number]["v"];
  value: number;
};

type ActionRow = {
  key: string;
  type: (typeof ACTIONS)[number]["v"];
  value: number;
  valueMode: "percent" | "absolute";
  params: Record<string, string | number>;
  /** "Se" da ação: só executa quando estas condições baterem. */
  conditions: ConditionRow[];
  conditionLogic: "and" | "or";
};

type RuleForm = {
  id?: string;
  name: string;
  enabled: boolean;
  scopeType: (typeof SCOPES)[number]["v"];
  /** Seleções em cascata. O escopo final vira scopeId no save. */
  accountId: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  triggerMetric: (typeof METRICS)[number]["v"];
  triggerOperator: (typeof OPS)[number]["v"];
  triggerValue: number;
  triggerWindow: (typeof WINDOWS)[number]["v"];
  /** Condições do gatilho combinadas com E/OU. */
  conditions: ConditionRow[];
  conditionLogic: "and" | "or";
  actions: ActionRow[];
  cooldownMinutes: number;
  scanIntervalMinutes: number;
};

const newConditionRow = (metric: ConditionRow["metric"] = "cpl"): ConditionRow => ({
  key: crypto.randomUUID(), metric, operator: "gt", value: 50,
});

const newActionRow = (type: ActionRow["type"] = "pause_campaign"): ActionRow => ({
  key: crypto.randomUUID(), type, value: 20, valueMode: "percent", params: {},
  conditions: [], conditionLogic: "and",
});

const isDuplicate = (t: string) => t.startsWith("duplicate_");
const isBudget = (t: string) => t === "increase_budget" || t === "decrease_budget";

const defaultForm: RuleForm = {
  name: "", enabled: true,
  scopeType: "workspace", accountId: "", campaignId: "", adsetId: "", adId: "",
  triggerMetric: "cpl", triggerOperator: "gt", triggerValue: 50, triggerWindow: "last_1d",
  conditions: [newConditionRow()],
  conditionLogic: "and",
  actions: [newActionRow()],
  cooldownMinutes: 60, scanIntervalMinutes: 30,
};

/** Devolve o id final que a regra vai observar. */
function resolveScopeId(f: RuleForm): string | null {
  switch (f.scopeType) {
    case "workspace": return null;
    case "ad_account": return f.accountId || null;
    case "campaign": return f.campaignId || null;
    case "adset": return f.adsetId || null;
    case "ad": return f.adId || null;
  }
}

/** Editor de lista de condições (métrica / operador / valor) com combinador E / OU. */
function ConditionListEditor({
  conditions, logic, onChange, onLogicChange, wsSym, max = 5, minRows = 1, compact = false,
}: {
  conditions: ConditionRow[];
  logic: "and" | "or";
  onChange: (rows: ConditionRow[]) => void;
  onLogicChange: (l: "and" | "or") => void;
  wsSym: string;
  max?: number;
  minRows?: number;
  compact?: boolean;
}) {
  const patch = (key: string, upd: Partial<ConditionRow>) =>
    onChange(conditions.map((c) => (c.key === key ? { ...c, ...upd } : c)));

  return (
    <div className="space-y-2">
      {conditions.map((c, i) => {
        const isCur = isCurrencyMetric(c.metric);
        const isPct = isPercentMetric(c.metric);
        return (
          <div key={c.key} className="space-y-1">
            {i > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  {(["and", "or"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`px-2.5 py-0.5 text-[11px] font-semibold ${logic === l ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                      onClick={() => onLogicChange(l)}
                    >
                      {l === "and" ? "E" : "OU"}
                    </button>
                  ))}
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                {i === 0 && !compact && <Label className="text-[11px]">Métrica</Label>}
                <select
                  className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                  value={c.metric}
                  onChange={(e) => patch(c.key, { metric: e.target.value as ConditionRow["metric"] })}
                >
                  {METRICS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
              <div className="w-36 shrink-0">
                {i === 0 && !compact && <Label className="text-[11px]">Condição</Label>}
                <select
                  className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                  value={c.operator}
                  onChange={(e) => patch(c.key, { operator: e.target.value as ConditionRow["operator"] })}
                >
                  {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="w-32 shrink-0">
                {i === 0 && !compact && <Label className="text-[11px]">Valor {isCur ? `(${wsSym})` : isPct ? "(%)" : ""}</Label>}
                <div className="relative">
                  {isCur && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{wsSym}</span>}
                  <Input
                    type="number"
                    step="0.01"
                    className={`h-10 ${isCur ? "pl-8" : ""}`}
                    value={c.value}
                    onChange={(e) => patch(c.key, { value: Number(e.target.value) })}
                  />
                  {isPct && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>}
                </div>
              </div>
              <button
                type="button"
                className="h-10 px-2 rounded-md hover:bg-muted text-destructive disabled:opacity-30"
                title="Remover condição"
                disabled={conditions.length <= minRows}
                onClick={() => onChange(conditions.filter((x) => x.key !== c.key))}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={conditions.length >= max}
        onClick={() => onChange([...conditions, newConditionRow()])}
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar condição ({logic === "or" ? "OU" : "E"})
      </Button>
    </div>
  );
}


export function MetaAutomationsPanel({
  workspaceId,
  selectedAccountIds,
  preset,
}: {
  workspaceId: string;
  selectedAccountIds?: string[];
  preset?: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAutomationRules);
  const createFn = useServerFn(createAutomationRule);
  const updateFn = useServerFn(updateAutomationRule);
  const toggleFn = useServerFn(toggleAutomationRule);
  const deleteFn = useServerFn(deleteAutomationRule);
  const runsFn = useServerFn(listAutomationRuns);
  const runNowFn = useServerFn(runAutomationRuleNow);
  const campaignsFn = useServerFn(listMetaCampaigns);
  const adsetsFn = useServerFn(listMetaAdSets);
  const adsFn = useServerFn(listMetaAds);

  const [open, setOpen] = useState(false);
  const [statsRule, setStatsRule] = useState<null | { id: string; name: string; scan_interval_minutes: number | null; cooldown_minutes: number; last_run_at: string | null; enabled: boolean }>(null);
  const [form, setForm] = useState<RuleForm>(defaultForm);

  const rulesQ = useQuery({
    queryKey: ["meta-automation-rules", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
    retry: 1,
  });
  const runsQ = useQuery({
    queryKey: ["meta-automation-runs", workspaceId],
    queryFn: () => runsFn({ data: { workspaceId, limit: 20 } }),
    retry: 1,
  });

  // Contas de anúncio do workspace, filtradas pelo filtro global se houver.
  const accountsQ = useQuery({
    queryKey: ["automation-accounts", workspaceId, selectedAccountIds?.join(",")],
    queryFn: async () => {
      let q = supabase.from("meta_ad_accounts").select("account_id,name,currency").eq("workspace_id", workspaceId);
      if (selectedAccountIds && selectedAccountIds.length > 0) q = q.in("account_id", selectedAccountIds);
      const { data, error } = await q.order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ account_id: string; name: string | null; currency: string | null }>;
    },
    retry: 1,
  });

  // Campanhas: precisas para os escopos campanha, conjunto e anúncio.
  const needsCampaigns = open && (form.scopeType === "campaign" || form.scopeType === "adset" || form.scopeType === "ad");
  const campaignsQ = useQuery({
    queryKey: ["automation-campaigns", workspaceId, selectedAccountIds?.join(",")],
    queryFn: () => campaignsFn({
      data: {
        workspaceId,
        preset: (preset ?? "last_7d") as "last_7d",
        limit: 200,
        accountIds: selectedAccountIds && selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
      },
    }),
    enabled: needsCampaigns,
    retry: 1,
  });

  // Conjuntos da campanha escolhida.
  const needsAdSets = open && (form.scopeType === "adset" || form.scopeType === "ad") && !!form.campaignId;
  const adsetsQ = useQuery({
    queryKey: ["automation-adsets", workspaceId, form.campaignId],
    queryFn: () => adsetsFn({
      data: {
        workspaceId,
        preset: (preset ?? "last_7d") as "last_7d",
        limit: 200,
        campaignIds: [form.campaignId],
        accountIds: selectedAccountIds && selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
      },
    }),
    enabled: needsAdSets,
    retry: 1,
  });

  // Anúncios do conjunto (ou da campanha, se nenhum conjunto foi escolhido).
  const needsAds = open && form.scopeType === "ad" && !!form.campaignId;
  const adsQ = useQuery({
    queryKey: ["automation-ads", workspaceId, form.campaignId, form.adsetId],
    queryFn: () => adsFn({
      data: {
        workspaceId,
        preset: (preset ?? "last_7d") as "last_7d",
        limit: 200,
        campaignIds: [form.campaignId],
        adsetIds: form.adsetId ? [form.adsetId] : undefined,
        accountIds: selectedAccountIds && selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
      },
    }),
    enabled: needsAds,
    retry: 1,
  });

  const accountOptions = Array.isArray(accountsQ.data) ? accountsQ.data : [];
  const rawCampaigns = Array.isArray(campaignsQ.data?.campaigns) ? campaignsQ.data.campaigns : [];
  const campaignOptions = useMemo(() => rawCampaigns.map((c) => ({
    id: c.id, name: c.name, accountName: c.accountName,
  })), [rawCampaigns]);
  const adsetOptions = useMemo(
    () => (Array.isArray(adsetsQ.data?.adsets) ? adsetsQ.data.adsets : []).map((s) => ({ id: s.id, name: s.name })),
    [adsetsQ.data],
  );
  const adOptions = useMemo(
    () => (Array.isArray(adsQ.data?.ads) ? adsQ.data.ads : []).map((a) => ({ id: a.id, name: a.name })),
    [adsQ.data],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const scopeId = resolveScopeId(form);
      if (form.scopeType !== "workspace" && !scopeId) throw new Error("Selecione o alvo do escopo.");
      if (form.actions.length === 0) throw new Error("Adicione pelo menos uma ação.");
      const actions = form.actions.map((a) => ({
        type: a.type,
        value: isBudget(a.type) ? a.value : null,
        valueMode: a.valueMode,
        params: a.params ?? {},
        conditions: (a.conditions ?? []).map((c) => ({ metric: c.metric, operator: c.operator, value: c.value })),
        conditionLogic: a.conditionLogic ?? "and",
      }));
      const conditions = (form.conditions.length > 0 ? form.conditions : [newConditionRow(form.triggerMetric)])
        .map((c) => ({ metric: c.metric, operator: c.operator, value: c.value }));
      const first = actions[0];
      const firstCond = conditions[0];
      const payload = {
        workspaceId,
        name: form.name,
        enabled: form.enabled,
        scopeType: form.scopeType,
        scopeId,
        triggerMetric: firstCond.metric,
        triggerOperator: firstCond.operator,
        triggerValue: firstCond.value,
        triggerWindow: form.triggerWindow,
        actionType: first.type,
        actionValue: first.value,
        actionValueMode: first.valueMode,
        actions,
        conditions,
        conditionLogic: form.conditionLogic,
        cooldownMinutes: form.cooldownMinutes,
        scanIntervalMinutes: form.scanIntervalMinutes,
        actionConfig: {},
      };
      if (form.id) await updateFn({ data: { ...payload, id: form.id } });
      else await createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Regra salva.");
      setOpen(false); setForm(defaultForm);
      qc.invalidateQueries({ queryKey: ["meta-automation-rules", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const toggleMut = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleFn({ data: { workspaceId, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-automation-rules", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { workspaceId, id } }),
    onSuccess: () => { toast.success("Regra removida."); qc.invalidateQueries({ queryKey: ["meta-automation-rules", workspaceId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const runNowMut = useMutation({
    mutationFn: (id: string) => runNowFn({ data: { workspaceId, id } }),
    onSuccess: (r) => {
      const results = Array.isArray(r?.results) ? r.results : [];
      const matched = results.filter((x) => x.matched).length;
      toast.success(`Regra executada · ${results.length} campanhas · ${matched} bateram o gatilho.`);
      qc.invalidateQueries({ queryKey: ["meta-automation-runs", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rules = Array.isArray(rulesQ.data?.rules) ? rulesQ.data.rules : [];
  const runs = Array.isArray(runsQ.data?.runs) ? runsQ.data.runs : [];

  const accountsForCurrency = accountOptions;
  const workspaceCurrency = accountsForCurrency.find((a) => a.currency)?.currency ?? "BRL";
  const wsSym = currencySymbol(workspaceCurrency);
  const resolveCurrencyForRule = (r: { scope_type: string; scope_id: string | null }) => {
    if (r.scope_type === "ad_account" && r.scope_id) {
      return accountsForCurrency.find((a) => a.account_id === r.scope_id)?.currency ?? workspaceCurrency;
    }
    return workspaceCurrency;
  };


  const readConditionRows = (raw: unknown): ConditionRow[] => {
    if (!Array.isArray(raw)) return [];
    return (raw as Array<{ metric?: string; operator?: string; value?: number }>)
      .filter((c) => c && c.metric)
      .map((c) => ({
        key: crypto.randomUUID(),
        metric: c.metric as ConditionRow["metric"],
        operator: (c.operator ?? "gt") as ConditionRow["operator"],
        value: Number(c.value ?? 0),
      }));
  };

  /** Lê as condições do gatilho (novo formato em action_config.conditions, ou legado). */
  const readRuleConditions = (r: { trigger_metric: string; trigger_operator: string; trigger_value: number | string; action_config?: unknown }) => {
    const cfg = (r.action_config ?? {}) as { conditions?: unknown; conditionLogic?: string };
    const list = readConditionRows(cfg.conditions);
    return {
      conditions: list.length > 0 ? list : [{
        key: crypto.randomUUID(),
        metric: r.trigger_metric as ConditionRow["metric"],
        operator: r.trigger_operator as ConditionRow["operator"],
        value: Number(r.trigger_value),
      }],
      conditionLogic: (cfg.conditionLogic === "or" ? "or" : "and") as "and" | "or",
    };
  };

  /** Lê as ações salvas de uma regra (formato novo em action_config.actions, ou legado). */
  const readRuleActions = (r: { action_type: string; action_value: number | null; action_config?: unknown; }): ActionRow[] => {
    const cfg = (r.action_config ?? {}) as { actions?: Array<{ type?: string; value?: number | null; valueMode?: string; params?: Record<string, string | number>; conditions?: unknown; conditionLogic?: string }> };
    const list = Array.isArray(cfg.actions) ? cfg.actions : [];
    if (list.length > 0) {
      return list.map((a) => ({
        key: crypto.randomUUID(),
        type: (a.type ?? "notify_only") as ActionRow["type"],
        value: Number(a.value ?? 20),
        valueMode: a.valueMode === "absolute" ? "absolute" : "percent",
        params: (a.params && typeof a.params === "object" ? a.params : {}),
        conditions: readConditionRows(a.conditions),
        conditionLogic: (a.conditionLogic === "or" ? "or" : "and") as "and" | "or",
      }));
    }
    return [{
      key: crypto.randomUUID(),
      type: r.action_type as ActionRow["type"],
      value: Number(r.action_value ?? 20),
      valueMode: ((r as { action_value_mode?: string }).action_value_mode === "absolute" ? "absolute" : "percent"),
      params: {},
      conditions: [],
      conditionLogic: "and" as const,
    }];
  };


  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-muted-foreground">
          O robô lê no intervalo definido por regra e respeita o cooldown. Ex.: pausar campanha se CPL &gt; R$ 50 em 3 dias.
        </div>
        <Button size="sm" onClick={() => { setForm(defaultForm); setOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> Nova regra
        </Button>
      </div>

      {rulesQ.isError ? (
        <InlineLoadError label="Não foi possível carregar as regras de automação." onRetry={() => rulesQ.refetch()} />
      ) : rulesQ.isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando regras…</div>
      ) : rules.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((r) => {
            const scopeL = SCOPES.find((s) => s.v === r.scope_type)?.l ?? r.scope_type;
            const ruleCur = resolveCurrencyForRule(r);
            const ruleSym = currencySymbol(ruleCur);
            const ruleActionRows = readRuleActions(r);
            const ruleConds = readRuleConditions(r);
            const condLabel = ruleConds.conditions.map((c) => {
              const mL = METRICS.find((m) => m.v === c.metric)?.l ?? c.metric;
              const oL = OPS.find((o) => o.v === c.operator)?.l ?? c.operator;
              const pre = isCurrencyMetric(c.metric) ? `${ruleSym} ` : "";
              const suf = isCurrencyMetric(c.metric) ? "" : isPercentMetric(c.metric) ? "%" : "";
              return `${mL} ${oL} ${pre}${c.value}${suf}`;
            }).join(ruleConds.conditionLogic === "or" ? " OU " : " E ");
            const actionsLabel = ruleActionRows.map((a) => {
              const label = ACTIONS.find((x) => x.v === a.type)?.l ?? a.type;
              const base = !isBudget(a.type)
                ? label
                : a.valueMode === "absolute" ? `${label} ${ruleSym} ${a.value}` : `${label} ${a.value}%`;
              return (a.conditions?.length ?? 0) > 0 ? `${base} (com "se")` : base;
            }).join(" + ");
            return (
              <div key={r.id} className="py-3 flex items-start gap-3">
                <Switch checked={r.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: r.id, enabled: v })} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Se <span className="font-semibold text-foreground">{condLabel}</span> · escopo: {scopeL}{r.scope_id ? ` (${r.scope_id})` : ""} → <span className="font-semibold text-foreground">{actionsLabel}</span> · leitura {r.scan_interval_minutes ?? 30}min · cooldown {r.cooldown_minutes}min
                  </div>
                  {r.last_run_at && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">Última execução: {formatDate(r.last_run_at)}</div>
                  )}
                </div>
                <button className="p-1.5 rounded hover:bg-muted inline-flex items-center gap-1 text-[11px] font-medium" title="Ver gráficos e relatório" onClick={() => setStatsRule({ id: r.id, name: r.name, scan_interval_minutes: r.scan_interval_minutes ?? null, cooldown_minutes: r.cooldown_minutes, last_run_at: r.last_run_at ?? null, enabled: r.enabled })}>
                  <BarChart3 className="w-3.5 h-3.5" /> Ver gráficos
                </button>
                <button className="p-1.5 rounded hover:bg-muted" title="Testar agora" disabled={runNowMut.isPending} onClick={() => runNowMut.mutate(r.id)}>
                  {runNowMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button className="p-1.5 rounded hover:bg-muted" title="Editar" onClick={() => {
                  const scope = r.scope_type as RuleForm["scopeType"];
                  setForm({
                    id: r.id, name: r.name, enabled: r.enabled,
                    scopeType: scope,
                    accountId: scope === "ad_account" ? (r.scope_id ?? "") : "",
                    campaignId: scope === "campaign" ? (r.scope_id ?? "") : "",
                    adsetId: scope === "adset" ? (r.scope_id ?? "") : "",
                    adId: scope === "ad" ? (r.scope_id ?? "") : "",
                    triggerMetric: r.trigger_metric as RuleForm["triggerMetric"], triggerOperator: r.trigger_operator as RuleForm["triggerOperator"],
                    triggerValue: Number(r.trigger_value), triggerWindow: r.trigger_window as RuleForm["triggerWindow"],
                    ...readRuleConditions(r),
                    actions: ruleActionRows,
                    cooldownMinutes: r.cooldown_minutes,
                    scanIntervalMinutes: r.scan_interval_minutes ?? 30,
                  });
                  setOpen(true);
                }}>

                  <span className="text-[11px] font-medium">Editar</span>
                </button>
                <button className="p-1.5 rounded hover:bg-muted text-destructive" title="Excluir" onClick={() => { if (confirm("Excluir regra?")) deleteMut.mutate(r.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {runsQ.isError && (
        <InlineLoadError label="Não foi possível carregar as últimas execuções." onRetry={() => runsQ.refetch()} />
      )}

      {runs.length > 0 && (
        <div className="pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Últimas execuções</div>
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {runs.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs">
                {r.action_status === "error" ? <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  : r.matched ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                  : <PauseCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {r.matched ? `Ação: ${r.action_taken ?? "-"}` : (r.error_message ?? "Não bateu o gatilho")}
                    {r.metric_value !== null && <span className="text-muted-foreground"> · valor: {Number(r.metric_value).toFixed(2)}</span>}
                    {r.campaign_id && <span className="text-muted-foreground"> · {r.campaign_id}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{formatDate(r.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-[94vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar regra" : "Nova regra de automação"}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div>
              <Label>Nome da automação</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Pausar conjuntos com CPL alto" />
            </div>

            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="text-sm font-semibold">1. Onde a regra atua</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Escopo</Label>
                  <select
                    className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                    value={form.scopeType}
                    onChange={(e) => setForm({ ...form, scopeType: e.target.value as RuleForm["scopeType"], accountId: "", campaignId: "", adsetId: "", adId: "" })}
                  >
                    {SCOPES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>

                {form.scopeType === "ad_account" && (
                  <div>
                    <Label>Conta de anúncios</Label>
                    <select
                      className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                      value={form.accountId}
                      onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                    >
                      <option value="">Selecione…</option>
                      {accountOptions.map((a) => (
                        <option key={a.account_id} value={a.account_id}>{a.name || a.account_id}</option>
                      ))}
                    </select>
                    {accountsQ.isError && <p className="text-[11px] text-destructive mt-1">Não consegui carregar as contas agora.</p>}
                  </div>
                )}

                {(form.scopeType === "campaign" || form.scopeType === "adset" || form.scopeType === "ad") && (
                  <div>
                    <Label>Campanha</Label>
                    <select
                      className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                      value={form.campaignId}
                      onChange={(e) => setForm({ ...form, campaignId: e.target.value, adsetId: "", adId: "" })}
                      disabled={campaignsQ.isLoading}
                    >
                      <option value="">{campaignsQ.isLoading ? "Carregando campanhas…" : "Selecione…"}</option>
                      {campaignOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.accountName ? ` · ${c.accountName}` : ""}</option>
                      ))}
                    </select>
                    {campaignsQ.isError && <p className="text-[11px] text-destructive mt-1">Não consegui carregar as campanhas agora.</p>}
                  </div>
                )}

                {(form.scopeType === "adset" || form.scopeType === "ad") && (
                  <div>
                    <Label>Conjunto de anúncios</Label>
                    <select
                      className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                      value={form.adsetId}
                      onChange={(e) => setForm({ ...form, adsetId: e.target.value, adId: "" })}
                      disabled={!form.campaignId || adsetsQ.isLoading}
                    >
                      <option value="">
                        {!form.campaignId ? "Escolha a campanha primeiro" : adsetsQ.isLoading ? "Carregando conjuntos…" : form.scopeType === "ad" ? "Todos os conjuntos" : "Selecione…"}
                      </option>
                      {adsetOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {form.scopeType === "ad" && (
                  <div>
                    <Label>Anúncio</Label>
                    <select
                      className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                      value={form.adId}
                      onChange={(e) => setForm({ ...form, adId: e.target.value })}
                      disabled={!form.campaignId || adsQ.isLoading}
                    >
                      <option value="">
                        {!form.campaignId ? "Escolha a campanha primeiro" : adsQ.isLoading ? "Carregando anúncios…" : "Selecione…"}
                      </option>
                      {adOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {form.scopeType === "workspace" && "A regra varre todas as contas conectadas neste workspace."}
                {form.scopeType === "ad_account" && "A regra varre todas as campanhas ativas da conta selecionada."}
                {form.scopeType === "campaign" && "A regra atua na campanha selecionada."}
                {form.scopeType === "adset" && "A regra atua no conjunto selecionado dentro da campanha."}
                {form.scopeType === "ad" && "A regra atua no anúncio selecionado."}
              </p>
            </section>

            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="text-sm font-semibold">2. Quando disparar</div>
              <ConditionListEditor
                conditions={form.conditions}
                logic={form.conditionLogic}
                wsSym={wsSym}
                onChange={(rows) => setForm({ ...form, conditions: rows })}
                onLogicChange={(l) => setForm({ ...form, conditionLogic: l })}
              />
              <p className="text-[11px] text-muted-foreground">
                Combine várias condições com <strong>E</strong> (todas precisam bater) ou <strong>OU</strong> (basta uma bater).
                A leitura usa os dados do dia corrente. A frequência da checagem é definida no intervalo de leitura abaixo.
              </p>

            </section>

            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">3. O que fazer</div>
                  <p className="text-[11px] text-muted-foreground">As ações são executadas na ordem, uma após a outra. Ex.: pausar o conjunto e depois duplicá-lo.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={form.actions.length >= 6}
                  onClick={() => setForm({ ...form, actions: [...form.actions, newActionRow("notify_only")] })}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar ação
                </Button>
              </div>

              <div className="space-y-2">
                {form.actions.map((a, idx) => {
                  const patch = (upd: Partial<ActionRow>) => setForm({
                    ...form,
                    actions: form.actions.map((x) => x.key === a.key ? { ...x, ...upd } : x),
                  });
                  const setParam = (k: string, v: string | number) => patch({ params: { ...a.params, [k]: v } });
                  return (
                    <div key={a.key} className="rounded-md border border-border/70 bg-muted/30 p-2 space-y-2">
                      <div className="flex items-end gap-2">
                        <span className="h-10 flex items-center text-xs font-semibold text-muted-foreground w-6">{idx + 1}º</span>
                        <div className="flex-1 min-w-0">
                          <Label className="text-[11px]">Ação</Label>
                          <select
                            className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                            value={a.type}
                            onChange={(e) => patch({ type: e.target.value as ActionRow["type"], params: {} })}
                          >
                            {ACTION_GROUPS.map((g) => (
                              <optgroup key={g.label} label={g.label}>
                                {g.items.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="h-10 px-2 rounded-md hover:bg-muted text-destructive disabled:opacity-40"
                          title="Remover ação"
                          disabled={form.actions.length <= 1}
                          onClick={() => setForm({ ...form, actions: form.actions.filter((x) => x.key !== a.key) })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Parâmetros específicos da ação escolhida */}
                      {isBudget(a.type) && (
                        <div className="grid sm:grid-cols-2 gap-2 pl-8">
                          <div>
                            <Label className="text-[11px]">Modo</Label>
                            <select
                              className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                              value={a.valueMode}
                              onChange={(e) => patch({ valueMode: e.target.value as ActionRow["valueMode"] })}
                            >
                              <option value="percent">Percentual (%)</option>
                              <option value="absolute">Valor fixo ({wsSym})</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-[11px]">{a.valueMode === "absolute" ? `Valor (${wsSym})` : "Percentual (%)"}</Label>
                            <Input
                              type="number" step={a.valueMode === "absolute" ? "0.01" : "1"} className="h-9"
                              value={a.value}
                              onChange={(e) => patch({ value: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                      )}

                      {isDuplicate(a.type) && (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 pl-8">
                          <div className="lg:col-span-2">
                            <Label className="text-[11px]">Sufixo no nome da cópia</Label>
                            <Input
                              className="h-9" placeholder="— Cópia automática"
                              value={String(a.params.nameSuffix ?? "")}
                              onChange={(e) => setParam("nameSuffix", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Status da cópia</Label>
                            <select
                              className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                              value={String(a.params.copyStatus ?? "PAUSED")}
                              onChange={(e) => setParam("copyStatus", e.target.value)}
                            >
                              <option value="PAUSED">Pausada</option>
                              <option value="ACTIVE">Ativa</option>
                            </select>
                          </div>
                          {a.type !== "duplicate_ad" && (
                            <div>
                              <Label className="text-[11px]">Ajustar orçamento da cópia</Label>
                              <div className="flex gap-1">
                                <Input
                                  type="number" step="1" className="h-9" placeholder="0"
                                  value={String(a.params.budgetChange ?? "")}
                                  onChange={(e) => setParam("budgetChange", Number(e.target.value))}
                                />
                                <select
                                  className="h-9 px-1 rounded-md border border-border bg-background text-xs"
                                  value={String(a.params.budgetMode ?? "percent")}
                                  onChange={(e) => setParam("budgetMode", e.target.value)}
                                >
                                  <option value="percent">%</option>
                                  <option value="absolute">{wsSym}</option>
                                </select>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Use negativo para reduzir. 0 = mantém.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {a.type === "notify_only" && (
                        <div className="pl-8">
                          <Label className="text-[11px]">Mensagem da notificação</Label>
                          <Input
                            className="h-9" placeholder="Ex.: CPL estourou, revisar criativos."
                            value={String(a.params.message ?? "")}
                            onChange={(e) => setParam("message", e.target.value)}
                          />
                        </div>
                      )}

                      {(a.type === "create_workflow_task" || a.type === "create_calendar_task") && (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-8">
                          <div className="lg:col-span-2">
                            <Label className="text-[11px]">Título da tarefa</Label>
                            <Input
                              className="h-9" placeholder="Revisar {{campaign_name}}"
                              value={String(a.params.title ?? "")}
                              onChange={(e) => setParam("title", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Prazo (dias)</Label>
                            <Input
                              type="number" min={0} step="1" className="h-9"
                              value={String(a.params.dueInDays ?? 1)}
                              onChange={(e) => setParam("dueInDays", Number(e.target.value))}
                            />
                          </div>
                          {a.type === "create_workflow_task" ? (
                            <div>
                              <Label className="text-[11px]">Prioridade</Label>
                              <select
                                className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                                value={String(a.params.priority ?? "media")}
                                onChange={(e) => setParam("priority", e.target.value)}
                              >
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                              </select>
                            </div>
                          ) : (
                            <>
                              <div>
                                <Label className="text-[11px]">Tipo</Label>
                                <select
                                  className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                                  value={String(a.params.kind ?? "tarefa")}
                                  onChange={(e) => setParam("kind", e.target.value)}
                                >
                                  <option value="tarefa">Tarefa</option>
                                  <option value="reuniao">Reunião</option>
                                  <option value="evento">Evento</option>
                                </select>
                              </div>
                              <div>
                                <Label className="text-[11px]">Duração (min)</Label>
                                <Input
                                  type="number" min={5} step="5" className="h-9"
                                  value={String(a.params.durationMin ?? 30)}
                                  onChange={(e) => setParam("durationMin", Number(e.target.value))}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {!isBudget(a.type) && !isDuplicate(a.type) && a.type !== "notify_only"
                        && a.type !== "create_workflow_task" && a.type !== "create_calendar_task" && (
                        <p className="pl-8 text-[11px] text-muted-foreground">Sem parâmetros: a ação recai exatamente sobre o alvo escolhido na etapa 1.</p>
                      )}

                      {/* "Se" opcional da ação */}
                      <div className="pl-8 pt-1 border-t border-border/60 space-y-2">
                        <div className="flex items-center justify-between gap-2 pt-2">
                          <div className="text-[11px] font-semibold">
                            Só executar se…
                            <span className="ml-1 font-normal text-muted-foreground">
                              {(a.conditions?.length ?? 0) === 0 ? "(sem condição extra — executa sempre que o gatilho bater)" : ""}
                            </span>
                          </div>
                          {(a.conditions?.length ?? 0) === 0 ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => patch({ conditions: [newConditionRow()] })}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar "se"
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => patch({ conditions: [] })}>
                              Remover "se"
                            </Button>
                          )}
                        </div>
                        {(a.conditions?.length ?? 0) > 0 && (
                          <ConditionListEditor
                            compact
                            minRows={1}
                            wsSym={wsSym}
                            conditions={a.conditions}
                            logic={a.conditionLogic ?? "and"}
                            onChange={(rows) => patch({ conditions: rows })}
                            onLogicChange={(l) => patch({ conditionLogic: l })}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </section>


            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Intervalo de leitura</Label>
                <select
                  className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                  value={form.scanIntervalMinutes}
                  onChange={(e) => setForm({ ...form, scanIntervalMinutes: Number(e.target.value) })}
                >
                  {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.l}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">De quanto em quanto tempo o robô abre a regra e checa os dados. Diferente da janela: a janela é o período que ele soma, o intervalo é a frequência com que ele olha.</p>
              </div>
              <div>
                <Label>Cooldown após ação (min)</Label>
                <Input type="number" step="5" min={5} value={form.cooldownMinutes} onChange={(e) => setForm({ ...form, cooldownMinutes: Number(e.target.value) })} />
                <p className="text-[10px] text-muted-foreground mt-1">Tempo mínimo entre disparos.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Label>Regra ativa</Label>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={saveMut.isPending || !form.name.trim()} onClick={() => saveMut.mutate()}>
              {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {form.id ? "Salvar" : "Criar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MetaRuleStatsDialog
        open={!!statsRule}
        onOpenChange={(v) => { if (!v) setStatsRule(null); }}
        workspaceId={workspaceId}
        rule={statsRule}
      />
    </div>
  );
}
