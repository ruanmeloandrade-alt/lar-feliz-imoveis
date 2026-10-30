import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeAutomationRun } from "@/lib/meta-automation-run-semantics";

type Condition = { metric: string; operator: string; value: number };
type Action = {
  type: string;
  value?: number | null;
  valueMode?: string;
  conditions?: Condition[];
  conditionLogic?: "and" | "or";
};

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  scope_type: "workspace" | "ad_account" | "campaign" | "adset" | "ad";
  scope_id: string | null;
  trigger_metric: string;
  trigger_operator: string;
  trigger_value: number;
  trigger_window: string;
  action_type: string;
  action_value: number | null;
  action_config: Record<string, unknown> | null;
  scan_interval_minutes: number | null;
  cooldown_minutes: number;
  last_run_at: string | null;
};

type RunRow = {
  id: string;
  created_at: string;
  matched: boolean | null;
  action_status: string | null;
  action_taken: string | null;
  campaign_id: string | null;
  metric_value: number | null;
  error_message: string | null;
  payload: Record<string, unknown> | null;
};

async function assertMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso ao workspace.");
}

function configOf(rule: RuleRow) {
  const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
  const rawConditions = Array.isArray(cfg.conditions) ? cfg.conditions : [];
  const conditions: Condition[] = rawConditions.length
    ? rawConditions.map((item) => {
        const c = item as Record<string, unknown>;
        return {
          metric: String(c.metric ?? ""),
          operator: String(c.operator ?? "gt"),
          value: Number(c.value ?? 0),
        };
      }).filter((c) => c.metric && Number.isFinite(c.value))
    : [{ metric: rule.trigger_metric, operator: rule.trigger_operator, value: Number(rule.trigger_value) }];

  const rawActions = Array.isArray(cfg.actions) ? cfg.actions : [];
  const actions: Action[] = rawActions.length
    ? rawActions.map((item) => {
        const a = item as Record<string, unknown>;
        const guards = Array.isArray(a.conditions) ? a.conditions : [];
        return {
          type: String(a.type ?? ""),
          value: a.value == null ? null : Number(a.value),
          valueMode: String(a.valueMode ?? "percent"),
          conditionLogic: a.conditionLogic === "or" ? "or" : "and",
          conditions: guards.map((guard) => {
            const c = guard as Record<string, unknown>;
            return { metric: String(c.metric ?? ""), operator: String(c.operator ?? "gt"), value: Number(c.value ?? 0) };
          }).filter((c) => c.metric && Number.isFinite(c.value)),
        };
      }).filter((a) => a.type)
    : [{ type: rule.action_type, value: rule.action_value }];

  return {
    conditions,
    conditionLogic: cfg.conditionLogic === "or" ? "or" as const : "and" as const,
    actions,
  };
}

function targetOf(rule: RuleRow, run: RunRow) {
  const payload = (run.payload ?? {}) as Record<string, unknown>;
  const audit = payload.audit && typeof payload.audit === "object" ? payload.audit as Record<string, unknown> : null;
  const auditTarget = audit?.target && typeof audit.target === "object" ? audit.target as Record<string, unknown> : null;
  if (auditTarget?.id) {
    return {
      level: String(auditTarget.level ?? rule.scope_type),
      id: String(auditTarget.id),
      campaignId: auditTarget.campaignId ? String(auditTarget.campaignId) : run.campaign_id,
      source: "audit" as const,
    };
  }
  if (["campaign", "adset", "ad"].includes(rule.scope_type) && rule.scope_id) {
    return { level: rule.scope_type, id: rule.scope_id, campaignId: run.campaign_id, source: "rule_scope" as const };
  }
  if (run.campaign_id) {
    return { level: "campaign", id: run.campaign_id, campaignId: run.campaign_id, source: "run" as const };
  }
  return { level: rule.scope_type, id: rule.scope_id, campaignId: null, source: "unknown" as const };
}

function actionOutcomes(configured: Action[], run: RunRow, semantic: ReturnType<typeof normalizeAutomationRun<RunRow>>["semantic"]) {
  const parts = String(run.action_taken ?? "").split(" + ").map((x) => x.trim()).filter(Boolean);
  return configured.map((action, index) => {
    const evidence = parts.find((part) => part.startsWith(action.type)) ?? parts[index] ?? null;
    const ignored = Boolean(evidence?.includes("ignorada:") || evidence?.includes("ignored:"));
    const failed = semantic.failed && (index === Math.max(0, parts.length - 1) || String(run.error_message ?? "").startsWith(`${action.type}:`));
    let outcome: "executed" | "ignored" | "failed" | "not_reached" | "unverified" = "not_reached";
    if (ignored) outcome = "ignored";
    else if (failed) outcome = "failed";
    else if (semantic.executed && evidence) outcome = "executed";
    else if (semantic.code === "delivery_unverified" && evidence) outcome = "unverified";
    return {
      ...action,
      outcome,
      evidence,
      error: failed ? run.error_message : null,
    };
  });
}

function operationalRun(rule: RuleRow, run: RunRow, config: ReturnType<typeof configOf>) {
  const normalized = normalizeAutomationRun(run);
  const firstCondition = config.conditions[0] ?? null;
  const conditions = config.conditions.map((condition, index) => ({
    ...condition,
    actual: index === 0 ? run.metric_value : null,
    actualRecorded: index === 0 && run.metric_value !== null,
    note: index === 0
      ? (run.metric_value === null ? "Valor não registrado neste run." : null)
      : "Histórico atual não persiste o valor individual desta condição; não foi inferido.",
  }));
  return {
    id: run.id,
    readAt: run.created_at,
    target: targetOf(rule, run),
    decision: {
      matched: Boolean(run.matched),
      semantic: normalized.semantic,
      reason: normalized.semantic.detail,
    },
    trigger: {
      window: rule.trigger_window,
      logic: config.conditionLogic,
      conditions,
      primaryMetric: firstCondition?.metric ?? rule.trigger_metric,
      primaryActual: run.metric_value,
    },
    actions: actionOutcomes(config.actions, run, normalized.semantic),
    providerResult: run.action_taken,
    structuredError: normalized.semantic.failed
      ? { code: normalized.semantic.code, message: run.error_message || normalized.semantic.detail }
      : null,
    legacyEvidence: !(run.payload && typeof run.payload === "object" && "audit" in run.payload),
  };
}

export const getAutomationOperationalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    ruleId: z.string().uuid(),
    days: z.number().int().min(1).max(90).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const [{ data: ruleData, error: ruleError }, { data: rows, error: runsError }] = await Promise.all([
      context.supabase.from("meta_automation_rules").select("id,name,enabled,scope_type,scope_id,trigger_metric,trigger_operator,trigger_value,trigger_window,action_type,action_value,action_config,scan_interval_minutes,cooldown_minutes,last_run_at")
        .eq("workspace_id", data.workspaceId).eq("id", data.ruleId).maybeSingle(),
      context.supabase.from("meta_automation_runs").select("id,created_at,matched,action_status,action_taken,campaign_id,metric_value,error_message,payload")
        .eq("workspace_id", data.workspaceId).eq("rule_id", data.ruleId).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (ruleError) throw new Error(ruleError.message);
    if (runsError) throw new Error(runsError.message);
    if (!ruleData) throw new Error("Regra não encontrada.");

    const rule = ruleData as unknown as RuleRow;
    const config = configOf(rule);
    const runs = ((rows ?? []) as unknown as RunRow[]).map((run) => operationalRun(rule, run, config));
    const executed = runs.filter((run) => run.decision.semantic.executed);
    const failed = runs.filter((run) => run.decision.semantic.failed);
    const ignoredActions = runs.flatMap((run) => run.actions).filter((action) => action.outcome === "ignored").length;

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        scopeType: rule.scope_type,
        scopeId: rule.scope_id,
        triggerWindow: rule.trigger_window,
        scanIntervalMinutes: rule.scan_interval_minutes ?? 30,
        cooldownMinutes: rule.cooldown_minutes,
        lastSchedulerRunAt: rule.last_run_at,
        activationTimestamp: null as string | null,
        activationTimestampNote: "O schema atual registra o estado ativo/pausado, mas não persiste um timestamp confiável da última ativação; o relatório não inventa essa data.",
      },
      configured: config,
      summary: {
        reads: runs.length,
        matched: runs.filter((run) => run.decision.matched).length,
        executed: executed.length,
        ignoredActions,
        failures: failed.length,
        lastReadAt: runs[0]?.readAt ?? null,
        lastExecutedAt: executed[0]?.readAt ?? null,
        lastFailureAt: failed[0]?.readAt ?? null,
      },
      recent: runs.slice(0, 30),
    };
  });
