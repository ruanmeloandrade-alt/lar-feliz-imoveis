import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AiAgentChat } from "@/components/ai-agent/AiAgentChat";
import {
  listStrategies,
  upsertStrategy,
  deleteStrategy,
  listStrategyChannelsForAdAccount,
  type MetaStrategy,
} from "@/lib/meta-strategies.functions";
import { listPersonas } from "@/lib/meta-personas.functions";
import { listMetaSyncedAdAccounts } from "@/lib/meta.functions";
import { OBJECTIVES, DESTINATIONS_BY_OBJECTIVE, type MetaObjective } from "@/lib/meta-objectives";
import { PLAYBOOKS, materializePlaybookRules, type Playbook } from "@/lib/meta-strategy-playbooks";

type Rule = {
  id?: string;
  name: string;
  enabled: boolean;
  scope_level: "campaign" | "adset" | "ad";
  trigger_metric: string;
  trigger_operator: "gt" | "gte" | "lt" | "lte" | "eq";
  trigger_value: number;
  trigger_window: "last_1d" | "last_3d" | "last_7d" | "last_14d" | "last_30d";
  action_type: string;
  action_value: number | null;
  cooldown_minutes: number;
  interval_minutes: number;
};

type StrategyRow = {
  id: string;
  name: string;
  description: string;
  ad_account_id: string | null;
  default_objective: string | null;
  budget_mode: "daily" | "lifetime" | null;
  budget_amount: number | null;
  budget_level: "campaign" | "adset" | null;
  bid_strategy: string | null;
  optimization_goal: string | null;
  persona_id: string | null;
  placements: Record<string, unknown>;
  schedule: Record<string, unknown>;
  targeting_hints: Record<string, unknown>;
  copy_guidelines: string;
  automation_rules: Rule[];
  enabled: boolean;
};

const METRICS = [
  ["cpl", "CPL (custo por lead)"], ["cost_per_purchase", "Custo por compra"], ["cost_per_result", "Custo por resultado"],
  ["roas", "ROAS"], ["ctr", "CTR"], ["ctr_link", "CTR do link"], ["cpc", "CPC"], ["cpm", "CPM"],
  ["spend", "Investimento (R$)"], ["frequency", "Frequência"], ["purchases", "Compras"], ["results", "Resultados"],
  ["clicks", "Cliques"], ["link_clicks", "Cliques no link"], ["reach", "Alcance"], ["impressions", "Impressões"],
] as const;

const ACTIONS = [
  ["pause_campaign", "Pausar campanha"], ["activate_campaign", "Ativar campanha"],
  ["pause_adset", "Pausar conjunto"], ["activate_adset", "Ativar conjunto"],
  ["pause_ad", "Pausar anúncio"], ["activate_ad", "Ativar anúncio"],
  ["increase_budget", "Aumentar orçamento (%)"], ["decrease_budget", "Diminuir orçamento (%)"],
  ["duplicate_campaign", "Duplicar campanha"], ["duplicate_adset", "Duplicar conjunto"], ["duplicate_ad", "Duplicar anúncio"],
  ["notify_only", "Só notificar"],
] as const;


const EMPTY: MetaStrategy = {
  workspaceId: "",
  name: "",
  description: "",
  adAccountId: null,
  defaultObjective: null,
  budgetMode: "daily",
  budgetAmount: 30,
  budgetLevel: "adset",
  bidStrategy: null,
  optimizationGoal: null,
  personaId: null,
  placements: {},
  schedule: {},
  targetingHints: {},
  copyGuidelines: "",
  automationRules: [],
  linkedPageIds: [],
  linkedIgIds: [],
  linkedWaPhoneIds: [],
  enabled: true,
};

function rowToForm(row: StrategyRow, workspaceId: string): MetaStrategy {
  return {
    id: row.id,
    workspaceId,
    name: row.name,
    description: row.description ?? "",
    adAccountId: row.ad_account_id,
    defaultObjective: row.default_objective,
    budgetMode: row.budget_mode,
    budgetAmount: row.budget_amount,
    budgetLevel: row.budget_level,
    bidStrategy: row.bid_strategy,
    optimizationGoal: row.optimization_goal,
    personaId: row.persona_id,
    placements: row.placements ?? {},
    schedule: row.schedule ?? {},
    targetingHints: row.targeting_hints ?? {},
    copyGuidelines: row.copy_guidelines ?? "",
    automationRules: (row.automation_rules ?? []).map((r) => ({
      ...r,
      id: r.id ?? crypto.randomUUID(),
      cooldown_minutes: r.cooldown_minutes ?? 720,
      interval_minutes: r.interval_minutes ?? 60,
    })),
    linkedPageIds: (row as StrategyRow & { linked_page_ids?: string[] }).linked_page_ids ?? [],
    linkedIgIds: (row as StrategyRow & { linked_ig_ids?: string[] }).linked_ig_ids ?? [],
    linkedWaPhoneIds: (row as StrategyRow & { linked_wa_phone_ids?: string[] }).linked_wa_phone_ids ?? [],
    enabled: row.enabled,
  };
}

export function MetaStrategyManager({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStrategies);
  const saveFn = useServerFn(upsertStrategy);
  const delFn = useServerFn(deleteStrategy);
  const personasFn = useServerFn(listPersonas);
  const accountsFn = useServerFn(listMetaSyncedAdAccounts);
  const channelsFn = useServerFn(listStrategyChannelsForAdAccount);

  const strategiesQ = useQuery({
    queryKey: ["strategies", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }) as unknown as Promise<StrategyRow[]>,
  });
  const personasQ = useQuery({
    queryKey: ["personas", workspaceId],
    queryFn: () => personasFn({ data: { workspaceId } }),
  });
  const accountsQ = useQuery({
    queryKey: ["ad-accounts-strategies", workspaceId],
    queryFn: async () => (await accountsFn({ data: { workspaceId } })).accounts,
  });

  const [form, setForm] = useState<MetaStrategy>({ ...EMPTY, workspaceId });
  const [showChat, setShowChat] = useState(false);

  const channelsQ = useQuery({
    queryKey: ["strategy-channels", workspaceId, form.adAccountId ?? ""],
    queryFn: () => channelsFn({ data: { workspaceId, adAccountId: form.adAccountId ?? "" } }),
    enabled: !!form.adAccountId,
  });

  useEffect(() => { setForm((f) => ({ ...f, workspaceId })); }, [workspaceId]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Estratégia salva.");
      qc.invalidateQueries({ queryKey: ["strategies", workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, workspaceId } }),
    onSuccess: () => {
      toast.success("Estratégia removida.");
      setForm({ ...EMPTY, workspaceId });
      qc.invalidateQueries({ queryKey: ["strategies", workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const strategies = (strategiesQ.data ?? []) as StrategyRow[];
  const personas = (personasQ.data ?? []) as Array<{ id: string; name: string }>;
  const accounts = accountsQ.data ?? [];

  const addRule = () => {
    setForm((f) => ({
      ...f,
      automationRules: [
        ...f.automationRules,
        {
          id: crypto.randomUUID(),
          name: "Nova regra",
          enabled: true,
          scope_level: "campaign",
          trigger_metric: "cpl",
          trigger_operator: "gt",
          trigger_value: 50,
          trigger_window: "last_7d",
          action_type: "pause_campaign",
          action_value: null,
          cooldown_minutes: 720,
          interval_minutes: 60,
        },
      ],
    }));
  };
  const updateRule = (idx: number, patch: Partial<Rule>) => {
    setForm((f) => ({
      ...f,
      automationRules: f.automationRules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };
  const removeRule = (idx: number) => {
    setForm((f) => ({ ...f, automationRules: f.automationRules.filter((_, i) => i !== idx) }));
  };

  const suggestedRules = useMemo<Rule[]>(() => {
    const playbookId = (form.targetingHints as { playbook?: string } | null)?.playbook ?? null;
    const playbook = PLAYBOOKS.find((p) => p.id === playbookId) ?? null;
    if (playbook) {
      return materializePlaybookRules(playbook).map((rule) => ({
        ...rule,
        id: crypto.randomUUID(),
        name: `[Estratégia: ${playbook.name}] ${rule.name}`,
      }));
    }

    const objective = form.defaultObjective ?? '';
    const hasStrategyContext = Boolean(
      form.id || form.personaId || form.adAccountId || form.description.trim() || form.copyGuidelines.trim() || objective,
    );
    const isSales = /sales|purchase|catalog/i.test(objective);
    const isLead = /lead|message|conversion/i.test(objective);
    const resultMetric = isSales ? 'cost_per_purchase' : isLead ? 'cpl' : 'cost_per_result';
    const resultLabel = isSales ? 'custo por compra' : isLead ? 'CPL' : 'custo por resultado';
    const baseBudget = Math.max(0, Number(form.budgetAmount ?? 0));
    const protectiveThreshold = baseBudget > 0 ? Math.max(10, Math.round(baseBudget * 1.5 * 100) / 100) : 40;
    const spendThreshold = baseBudget > 0 ? Math.max(20, Math.round(baseBudget * 2 * 100) / 100) : 100;
    const prefix = hasStrategyContext ? 'Contextual' : 'Fallback';

    return [
      {
        id: crypto.randomUUID(),
        name: `${prefix}: proteger ${resultLabel} acima do limite`,
        enabled: true,
        scope_level: 'campaign',
        trigger_metric: resultMetric,
        trigger_operator: 'gt',
        trigger_value: protectiveThreshold,
        trigger_window: 'last_3d',
        action_type: 'pause_campaign',
        action_value: null,
        cooldown_minutes: 720,
        interval_minutes: 60,
      },
      {
        id: crypto.randomUUID(),
        name: `${prefix}: avisar gasto sem eficiência suficiente`,
        enabled: true,
        scope_level: 'campaign',
        trigger_metric: 'spend',
        trigger_operator: 'gt',
        trigger_value: spendThreshold,
        trigger_window: 'last_3d',
        action_type: 'notify_only',
        action_value: null,
        cooldown_minutes: 1440,
        interval_minutes: 60,
      },
      {
        id: crypto.randomUUID(),
        name: `${prefix}: escalar somente após eficiência comprovada`,
        enabled: true,
        scope_level: 'adset',
        trigger_metric: isSales ? 'roas' : 'results',
        trigger_operator: 'gt',
        trigger_value: isSales ? 3 : 3,
        trigger_window: 'last_7d',
        action_type: 'increase_budget',
        action_value: 20,
        cooldown_minutes: 1440,
        interval_minutes: 120,
      },
    ];
  }, [form.id, form.personaId, form.adAccountId, form.description, form.copyGuidelines, form.defaultObjective, form.budgetAmount, form.targetingHints]);

  const currentPlaybookId = (form.targetingHints as { playbook?: string } | null)?.playbook ?? null;
  const currentPlaybook = useMemo(() => PLAYBOOKS.find((p) => p.id === currentPlaybookId) ?? null, [currentPlaybookId]);
  const currentConfig = ((form.targetingHints as { playbook_config?: Record<string, number | boolean> } | null)?.playbook_config ?? {}) as Record<string, number | boolean>;

  const applyPlaybook = (pb: Playbook) => {
    // Trocar de modelo = substituir descrição, copy, regras e config. Se for o MESMO já aplicado, não faz nada.
    if (currentPlaybookId === pb.id) {
      toast.info(`Modelo "${pb.name}" já aplicado.`);
      return;
    }
    const rules = materializePlaybookRules(pb);
    const defaults: Record<string, number | boolean> = {};
    (pb.configFields ?? []).forEach((f) => { defaults[f.key] = f.default; });
    setForm((f) => ({
      ...f,
      budgetMode: pb.budgetMode,
      budgetLevel: pb.budgetLevel,
      bidStrategy: pb.bidStrategy,
      description: pb.description,
      copyGuidelines: pb.copyGuidelines,
      automationRules: rules,
      targetingHints: {
        ...(f.targetingHints ?? {}),
        playbook: pb.id,
        playbook_config: { ...defaults, ...(pb.config ?? {}) },
      },
    }));
    toast.success(`Modelo "${pb.name}" aplicado. Ajuste antes de salvar.`);
  };

  const setPlaybookCfg = (key: string, value: number | boolean) => {
    setForm((f) => ({
      ...f,
      targetingHints: {
        ...(f.targetingHints ?? {}),
        playbook: currentPlaybookId,
        playbook_config: { ...currentConfig, [key]: value },
      },
    }));
  };

  // Prévia dos orçamentos (só faz sentido pro modelo de baixo custo)
  const lowCostPreview = useMemo(() => {
    if (currentPlaybookId !== "low_cost") return [] as number[];
    const n = Math.max(1, Math.min(30, Number(currentConfig.duplicationCount ?? 8)));
    const min = Math.max(1, Number(currentConfig.minBudget ?? 6));
    const max = Math.max(min, Number(currentConfig.maxBudget ?? 12));
    if (n === 1) return [min];
    const step = (max - min) / (n - 1);
    return Array.from({ length: n }, (_, i) => Math.round((min + step * i) * 100) / 100);
  }, [currentPlaybookId, currentConfig.duplicationCount, currentConfig.minBudget, currentConfig.maxBudget]);


  return (
    <div className={`grid grid-cols-1 gap-3 ${showChat ? "lg:grid-cols-[220px_1fr_360px]" : "lg:grid-cols-[220px_1fr]"}`}>
      {/* Lista */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2 max-h-[80vh] overflow-y-auto">
        <button
          onClick={() => setForm({ ...EMPTY, workspaceId })}
          className="w-full inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" /> Nova estratégia
        </button>
        {strategies.length === 0 && (
          <div className="text-xs text-muted-foreground px-1 py-2">Nenhuma estratégia ainda.</div>
        )}
        {strategies.map((s) => (
          <button
            key={s.id}
            onClick={() => setForm(rowToForm(s, workspaceId))}
            className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition ${form.id === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
          >
            <div className="font-semibold truncate">{s.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {s.default_objective ?? "sem objetivo"} · {(s.automation_rules ?? []).length} regra(s)
            </div>
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{form.id ? "Editar estratégia" : "Nova estratégia"}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChat((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {showChat ? "Ocultar estrategista" : "Falar com estrategista"}
            </button>
            {form.id && (
              <button
                onClick={() => { if (confirm("Excluir esta estratégia?")) delMut.mutate(form.id!); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 text-destructive px-2.5 py-1.5 text-[11px] font-semibold hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )}
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nome da estratégia*">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Ex: Prospecção Black Friday" />
          </Field>
          <Field label="Objetivo padrão">
            <select value={form.defaultObjective ?? ""} onChange={(e) => setForm({ ...form, defaultObjective: e.target.value || null, optimizationGoal: null })} className="input">
              <option value="">Sem objetivo definido</option>
              {OBJECTIVES.map((o) => <option key={o.v} value={o.v}>{o.l}, {o.sub}</option>)}
            </select>
          </Field>
          <Field label="Meta específica / destino">
            <select
              value={form.optimizationGoal ?? ""}
              onChange={(e) => setForm({ ...form, optimizationGoal: e.target.value || null })}
              disabled={!form.defaultObjective}
              className="input"
            >
              <option value="">{form.defaultObjective ? "Sem destino específico" : "Escolha primeiro o objetivo"}</option>
              {form.defaultObjective &&
                (DESTINATIONS_BY_OBJECTIVE[form.defaultObjective as MetaObjective] ?? []).map((d) => (
                  <option key={d.v} value={d.v}>{d.l}, {d.sub}</option>
                ))}
            </select>
          </Field>
          <Field label="Conta de anúncio (opcional)">
            <select value={form.adAccountId ?? ""} onChange={(e) => setForm({ ...form, adAccountId: e.target.value || null })} className="input">
              <option value="">Qualquer conta</option>
              {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} ({a.account_id})</option>)}
            </select>
          </Field>
          <Field label="Persona vinculada (opcional)">
            <select value={form.personaId ?? ""} onChange={(e) => setForm({ ...form, personaId: e.target.value || null })} className="input">
              <option value="">Nenhuma</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Modo do orçamento">
            <select value={form.budgetMode ?? ""} onChange={(e) => setForm({ ...form, budgetMode: (e.target.value || null) as "daily" | "lifetime" | null })} className="input">
              <option value="daily">Diário</option>
              <option value="lifetime">Total (vitalício)</option>
            </select>
          </Field>
          <Field label="Nível do orçamento">
            <select value={form.budgetLevel ?? ""} onChange={(e) => setForm({ ...form, budgetLevel: (e.target.value || null) as "campaign" | "adset" | null })} className="input">
              <option value="adset">Conjunto (ABO)</option>
              <option value="campaign">Campanha (CBO)</option>
            </select>
          </Field>
          <Field label="Estratégia de lance (opcional)">
            <select value={form.bidStrategy ?? ""} onChange={(e) => setForm({ ...form, bidStrategy: e.target.value || null })} className="input">
              <option value="">Padrão da Meta</option>
              <option value="LOWEST_COST_WITHOUT_CAP">Menor custo</option>
              <option value="LOWEST_COST_WITH_BID_CAP">Menor custo com limite</option>
              <option value="COST_CAP">Custo alvo</option>
            </select>
          </Field>
        </div>

        {/* Modelos prontos (playbooks) */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Modelos de estratégia</div>
              <div className="text-[11px] text-muted-foreground">Escolha um modelo pronto, ele preenche descrição, diretrizes de copy, orçamento e regras de automação calibradas. Você ajusta depois.</div>
            </div>
            {currentPlaybookId && (
              <button
                onClick={() => setForm((f) => ({ ...f, targetingHints: { ...(f.targetingHints ?? {}), playbook: null, playbook_config: null } }))}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Limpar modelo
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {PLAYBOOKS.map((pb) => {
              const active = currentPlaybookId === pb.id;
              return (
                <button
                  key={pb.id}
                  onClick={() => applyPlaybook(pb)}
                  className={`text-left rounded-md border p-2.5 transition ${active ? "border-primary bg-card ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/50"}`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <span>{pb.icon}</span>
                    <span>{pb.name}</span>
                    {active && <span className="ml-auto text-[10px] font-semibold text-primary">APLICADO</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{pb.tagline}</div>
                  <div className="text-[10px] text-muted-foreground/80 mt-1.5 italic leading-snug">Quando usar: {pb.when}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Planejador dinÃ¢mico do modelo, renderiza os campos declarados em configFields */}
        {currentPlaybook && (currentPlaybook.configFields?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div>
              <div className="text-sm font-semibold">Planejador, {currentPlaybook.name}</div>
              <div className="text-[11px] text-muted-foreground">Par-metros usados pelo Gestor IA quando criar campanha com esta estratégia. Ajuste os números, as regras e a descrição do modelo continuam abaixo, também editáveis.</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {currentPlaybook.configFields!.filter((f) => f.type === "number").map((f) => (
                <Field key={f.key} label={f.label}>
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step ?? 1}
                    value={(currentConfig[f.key] as number | undefined) ?? (f.default as number)}
                    onChange={(e) => setPlaybookCfg(f.key, Number(e.target.value))}
                    className="input"
                  />
                  {f.help && <span className="block text-[10px] text-muted-foreground mt-0.5">{f.help}</span>}
                </Field>
              ))}
            </div>
            {currentPlaybook.configFields!.some((f) => f.type === "boolean") && (
              <div className="flex flex-wrap gap-3 text-[11px]">
                {currentPlaybook.configFields!.filter((f) => f.type === "boolean").map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={(currentConfig[f.key] as boolean | undefined) ?? (f.default as boolean)}
                      onChange={(e) => setPlaybookCfg(f.key, e.target.checked)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
            {currentPlaybookId === "low_cost" && lowCostPreview.length > 0 && (
              <div className="rounded-md bg-muted/40 p-2 text-[11px]">
                <div className="font-semibold mb-1">Prévia dos orçamentos:</div>
                <div className="flex flex-wrap gap-1.5">
                  {lowCostPreview.map((v, i) => (
                    <span key={i} className="inline-flex items-center rounded bg-card border px-1.5 py-0.5 font-mono">R$ {v.toFixed(2).replace(".", ",")}</span>
                  ))}
                </div>
                <div className="mt-1.5 text-muted-foreground">Total diário previsto: <b>R$ {lowCostPreview.reduce((a, b) => a + b, 0).toFixed(2).replace(".", ",")}</b> em {lowCostPreview.length} conjuntos.</div>
              </div>
            )}
          </div>
        )}


        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Canais vinculados</div>
            <div className="text-xs text-muted-foreground">
              {form.adAccountId ? (channelsQ.isFetching ? "Buscando na Meta…" : "Puxado da conta de anúncio") : "Selecione uma conta de anúncio pra listar os canais"}
            </div>
          </div>
          {form.adAccountId && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ChannelPicker
                label="Páginas do Facebook"
                empty="Nenhuma página encontrada nesta conta."
                options={channelsQ.data?.pages ?? []}
                selected={form.linkedPageIds}
                onChange={(ids) => setForm({ ...form, linkedPageIds: ids })}
              />
              <ChannelPicker
                label="Contas do Instagram"
                empty="Nenhum Instagram vinculado."
                options={channelsQ.data?.instagrams ?? []}
                selected={form.linkedIgIds}
                onChange={(ids) => setForm({ ...form, linkedIgIds: ids })}
              />
              <ChannelPicker
                label="Números de WhatsApp"
                empty="Nenhum número de WhatsApp Business vinculado a esta conta de anúncio."
                options={(channelsQ.data?.whatsapps ?? []).map((w) => ({ id: w.id, label: w.label }))}
                selected={form.linkedWaPhoneIds}
                onChange={(ids) => setForm({ ...form, linkedWaPhoneIds: ids })}
              />
            </div>
          )}
        </div>


        <Field label="Contexto / plano da estratégia (usado pelo Gestor IA)">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={12}
            className="input font-normal !h-auto min-h-[280px] w-full resize-y leading-relaxed"
            placeholder="Ex: Estratégia de prospecção fria pra Black Friday. Foco em mensagens no Instagram. Público morno de e-commerce, 25-45 anos. Meta CPL R$ 20."
          />
        </Field>

        <Field label="Diretrizes de copy (tom, gatilhos, CTA padrão)">
          <textarea
            value={form.copyGuidelines}
            onChange={(e) => setForm({ ...form, copyGuidelines: e.target.value })}
            rows={10}
            className="input font-normal !h-auto min-h-[220px] w-full resize-y leading-relaxed"
            placeholder="Ex: Tom direto e urgente. Sempre usar gatilho de escassez (últimas horas / 24h). CTA: 'Chama no direct'."
          />
        </Field>

        {/* Regras de automação */}
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold">Regras de automação executáveis</div>
              <div className="text-[11px] text-muted-foreground">Quando o Gestor IA criar uma campanha usando esta estratégia, estas regras serão aplicadas automaticamente à campanha criada.</div>
            </div>
            <div className="flex gap-2">
              {form.automationRules.length === 0 && (
                <button onClick={() => setForm({ ...form, automationRules: suggestedRules })} className="text-[11px] font-semibold text-primary hover:underline">
                  Sugerir regras
                </button>
              )}
              <button onClick={addRule} className="inline-flex items-center gap-1 rounded-md bg-card border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted">
                <Plus className="w-3 h-3" /> Regra
              </button>
            </div>
          </div>

          {form.automationRules.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-2">Sem regras ainda. “Sugerir regras” usa a estratégia/playbook quando houver contexto; sem estratégia, cria um fallback seguro para você revisar antes de salvar.</div>
          )}

          {form.automationRules.map((r, idx) => (
            <div key={r.id ?? idx} className="rounded-md border border-border bg-card p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <input value={r.name} onChange={(e) => updateRule(idx, { name: e.target.value })} className="input flex-1 !py-1 !text-[11px]" placeholder="Nome da regra" />
                <label className="flex items-center gap-1 text-[10px]">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(idx, { enabled: e.target.checked })} /> Ativa
                </label>
                <button onClick={() => removeRule(idx)} className="text-destructive hover:bg-destructive/10 rounded p-1"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 text-[11px]">
                <select value={r.scope_level} onChange={(e) => updateRule(idx, { scope_level: e.target.value as Rule["scope_level"] })} className="input !py-1 !text-[11px]">
                  <option value="campaign">Campanha</option><option value="adset">Conjunto</option><option value="ad">Anúncio</option>
                </select>
                <select value={r.trigger_metric} onChange={(e) => updateRule(idx, { trigger_metric: e.target.value })} className="input !py-1 !text-[11px]">
                  {METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={r.trigger_operator} onChange={(e) => updateRule(idx, { trigger_operator: e.target.value as Rule["trigger_operator"] })} className="input !py-1 !text-[11px]">
                  <option value="gt">{">"}</option><option value="gte">≥</option><option value="lt">{"<"}</option><option value="lte">≤</option><option value="eq">=</option>
                </select>
                <input type="number" step="0.01" value={r.trigger_value} onChange={(e) => updateRule(idx, { trigger_value: Number(e.target.value) })} className="input !py-1 !text-[11px]" />
                <select value={r.trigger_window} onChange={(e) => updateRule(idx, { trigger_window: e.target.value as Rule["trigger_window"] })} className="input !py-1 !text-[11px]">
                  <option value="last_1d">1 dia</option><option value="last_3d">3 dias</option><option value="last_7d">7 dias</option><option value="last_14d">14 dias</option><option value="last_30d">30 dias</option>
                </select>
                <select value={r.action_type} onChange={(e) => updateRule(idx, { action_type: e.target.value })} className="input !py-1 !text-[11px]">
                  {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {(r.action_type === "increase_budget" || r.action_type === "decrease_budget") && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">Percentual (%):</span>
                  <input type="number" min={1} max={200} value={r.action_value ?? ""} onChange={(e) => updateRule(idx, { action_value: e.target.value ? Number(e.target.value) : null })} className="input !py-1 !text-[11px] w-24" />
                </div>
              )}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <label className="flex items-center gap-1">Intervalo (min):
                  <input type="number" min={5} value={r.interval_minutes} onChange={(e) => updateRule(idx, { interval_minutes: Number(e.target.value) })} className="input !py-0.5 !text-[10px] w-16" />
                </label>
                <label className="flex items-center gap-1">Cooldown (min):
                  <input type="number" min={0} value={r.cooldown_minutes} onChange={(e) => updateRule(idx, { cooldown_minutes: Number(e.target.value) })} className="input !py-0.5 !text-[10px] w-20" />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat estrategista */}
      {showChat && (
        <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[80vh] flex flex-col">
          <AiAgentChat
            workspaceId={workspaceId}
            module="strategist"
            contextPayload={{
              strategyId: form.id ?? null,
              name: form.name,
              objective: form.defaultObjective,
              optimizationGoal: form.optimizationGoal,
              adAccountId: form.adAccountId,
              personaId: form.personaId,
              budgetMode: form.budgetMode,
              budgetLevel: form.budgetLevel,
              budgetAmount: form.budgetAmount,
              bidStrategy: form.bidStrategy,
              description: form.description,
              copyGuidelines: form.copyGuidelines,
              placements: form.placements,
              schedule: form.schedule,
              targetingHints: form.targetingHints,
              automationRules: form.automationRules,
              linkedPageIds: form.linkedPageIds,
              linkedIgIds: form.linkedIgIds,
              linkedWaPhoneIds: form.linkedWaPhoneIds,
            }}
            onStrategyPatch={(patch) => {
              setForm((f) => ({ ...f, ...(patch as Partial<MetaStrategy>) }));
              toast.success("Estrategista atualizou o formulário.");
            }}
          />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function ChannelPicker({
  label, empty, options, selected, onChange,
}: {
  label: string;
  empty: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {options.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">{empty}</div>
      ) : (
        <div className="max-h-40 overflow-auto rounded border divide-y">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
