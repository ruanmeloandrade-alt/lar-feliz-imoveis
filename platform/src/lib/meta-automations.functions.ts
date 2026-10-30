import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { META_KPI_CATALOG } from "@/lib/meta-dashboard-kpis";
import { classifyAutomationRun, normalizeAutomationRun } from "@/lib/meta-automation-run-semantics";

export const AUTOMATION_METRICS = META_KPI_CATALOG
  .filter((k) => !!k.totalsField && k.unit !== "ranking")
  .map((k) => k.key)
  .concat(["cost_per_purchase", "ctr_link", "video_complete", "thruplay", "video_avg_time"]);
const AUTOMATION_METRIC_SET = new Set(AUTOMATION_METRICS);

export const AUTOMATION_ACTIONS = [
  "pause_campaign", "activate_campaign",
  "pause_adset", "activate_adset",
  "pause_ad", "activate_ad",
  "increase_budget", "decrease_budget",
  "duplicate_campaign", "duplicate_adset", "duplicate_ad",
  "create_audience_from_source", "create_lookalike_from_audience",
  "duplicate_adset_with_audience",
  "notify_only",
  "create_workflow_task", "create_calendar_task",
] as const;

const ConditionInput = z.object({
  metric: z.string().refine((v) => AUTOMATION_METRIC_SET.has(v), "Métrica inválida."),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  value: z.number().finite(),
});

const ActionSpecInput = z.object({
  type: z.enum(AUTOMATION_ACTIONS),
  value: z.number().finite().nullable().optional(),
  valueMode: z.enum(["percent", "absolute"]).default("percent"),
  /** Parâmetros específicos da ação (sufixo de nome, status da cópia, título da tarefa, etc). */
  params: z.record(z.string(), z.unknown()).default({}),
  /** "Se" opcional da ação: só executa quando estas condições baterem. */
  conditions: z.array(ConditionInput).max(5).default([]),
  conditionLogic: z.enum(["and", "or"]).default("and"),
});

const RuleInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(2).max(120),
  enabled: z.boolean().default(true),
  scopeType: z.enum(["workspace", "ad_account", "campaign", "adset", "ad"]),
  scopeId: z.string().max(100).nullable().optional(),
  triggerMetric: z.string().refine((v) => AUTOMATION_METRIC_SET.has(v), "Métrica inválida."),
  triggerOperator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  triggerValue: z.number().finite(),
  triggerWindow: z.enum(["last_1d", "last_3d", "last_7d", "last_14d", "last_30d"]).default("last_3d"),
  actionType: z.enum(AUTOMATION_ACTIONS),
  actionValue: z.number().finite().nullable().optional(),
  actionValueMode: z.enum(["percent", "absolute"]).default("percent"),
  /** Lista de ações executadas em sequência quando a métrica bate. A primeira também vai nos campos legados. */
  actions: z.array(ActionSpecInput).min(1).max(6).optional(),
  /** Condições do gatilho combinadas com E/OU. A primeira também vai nos campos legados. */
  conditions: z.array(ConditionInput).min(1).max(5).optional(),
  conditionLogic: z.enum(["and", "or"]).default("and"),
  cooldownMinutes: z.number().int().min(5).max(10080).default(60),
  scanIntervalMinutes: z.number().int().min(5).max(1440).default(30),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
});

type RuleInputData = z.infer<typeof RuleInput>;

/** Normaliza ações e condições e devolve os campos legados + action_config. */
function normalizeActions(data: RuleInputData) {
  const list = (data.actions && data.actions.length > 0)
    ? data.actions
    : [{ type: data.actionType, value: data.actionValue ?? null, valueMode: data.actionValueMode, params: {}, conditions: [], conditionLogic: "and" as const }];
  const conditions = (data.conditions && data.conditions.length > 0)
    ? data.conditions
    : [{ metric: data.triggerMetric, operator: data.triggerOperator, value: data.triggerValue }];
  const first = list[0];
  const firstCond = conditions[0];
  return {
    actionType: first.type,
    actionValue: first.value ?? null,
    actionValueMode: first.valueMode ?? "percent",
    triggerMetric: firstCond.metric,
    triggerOperator: firstCond.operator,
    triggerValue: firstCond.value,
    actionConfig: { ...(data.actionConfig ?? {}), actions: list, conditions, conditionLogic: data.conditionLogic ?? "and" },
  };
}

async function assertMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string, userId: string,
) {
  const { data, error } = await supabase.from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso ao workspace.");
}

export const listAutomationRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("meta_automation_rules")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rules: rows ?? [] };
  });

export const createAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RuleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const norm = normalizeActions(data);
    const { data: row, error } = await context.supabase
      .from("meta_automation_rules")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        enabled: data.enabled,
        scope_type: data.scopeType,
        scope_id: data.scopeId ?? null,
        trigger_metric: norm.triggerMetric,
        trigger_operator: norm.triggerOperator,
        trigger_value: norm.triggerValue,
        trigger_window: data.triggerWindow,
        action_type: norm.actionType,
        action_value: norm.actionValue,
        action_value_mode: norm.actionValueMode,
        cooldown_minutes: data.cooldownMinutes,
        scan_interval_minutes: data.scanIntervalMinutes,
        action_config: norm.actionConfig as never,
        created_by: context.userId,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RuleInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const norm = normalizeActions(data);
    const { error } = await context.supabase
      .from("meta_automation_rules")
      .update({
        name: data.name, enabled: data.enabled,
        scope_type: data.scopeType, scope_id: data.scopeId ?? null,
        trigger_metric: norm.triggerMetric, trigger_operator: norm.triggerOperator,
        trigger_value: norm.triggerValue, trigger_window: data.triggerWindow,
        action_type: norm.actionType, action_value: norm.actionValue,
        action_value_mode: norm.actionValueMode,
        cooldown_minutes: data.cooldownMinutes,
        scan_interval_minutes: data.scanIntervalMinutes,
        action_config: norm.actionConfig as never,
      })
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { error } = await context.supabase.from("meta_automation_rules")
      .update({ enabled: data.enabled }).eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { error } = await context.supabase.from("meta_automation_rules")
      .delete().eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAutomationRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    limit: z.number().int().min(1).max(500).default(30),
    ruleId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    let q = context.supabase
      .from("meta_automation_runs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.ruleId) q = q.eq("rule_id", data.ruleId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { runs: (rows ?? []).map((row) => normalizeAutomationRun(row)) };
  });

/** Estatísticas agregadas de uma regra: leituras, execuções, erros, séries por dia. */
export const getAutomationRuleStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    ruleId: z.string().uuid(),
    days: z.number().int().min(1).max(90).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("meta_automation_runs")
      .select("id,created_at,matched,action_status,action_taken,campaign_id,metric_value,error_message")
      .eq("workspace_id", data.workspaceId)
      .eq("rule_id", data.ruleId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const all = (rows ?? []).map((row) => normalizeAutomationRun(row));

    const totals = {
      reads: all.length,
      matched: 0,
      executed_ok: 0,
      errors: 0,
      no_match: 0,
      no_action: 0,
      unique_campaigns: 0,
    };
    const camps = new Set<string>();
    const actionBreakdown = new Map<string, number>();
    const dayMap = new Map<string, { day: string; reads: number; matches: number; actions: number; errors: number }>();
    for (const r of all) {
      const day = (r.created_at ?? "").slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, { day, reads: 0, matches: 0, actions: 0, errors: 0 });
      const b = dayMap.get(day)!;
      b.reads += 1;
      if (r.matched) { totals.matched += 1; b.matches += 1; }
      else totals.no_match += 1;
      if (r.semantic.failed) { totals.errors += 1; b.errors += 1; }
      if (r.semantic.executed) {
        totals.executed_ok += 1; b.actions += 1;
        if (r.action_taken) actionBreakdown.set(r.action_taken, (actionBreakdown.get(r.action_taken) ?? 0) + 1);
      } else if (r.matched && !r.semantic.failed) {
        totals.no_action += 1;
      }
      if (r.campaign_id) camps.add(r.campaign_id);
    }
    totals.unique_campaigns = camps.size;

    const series: Array<{ day: string; reads: number; matches: number; actions: number; errors: number }> = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      series.push(dayMap.get(d) ?? { day: d, reads: 0, matches: 0, actions: 0, errors: 0 });
    }

    const actions = Array.from(actionBreakdown.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totals,
      series,
      actions,
      recent: all.slice(0, 30),
    };
  });

/** Executa manualmente uma regra (útil para testar). */
export const runAutomationRuleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: rule, error } = await context.supabase
      .from("meta_automation_rules").select("*")
      .eq("id", data.id).eq("workspace_id", data.workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rule) throw new Error("Regra não encontrada.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { evaluateRule } = await import("./meta-automations-core.server");
    // Ignora cooldown/intervalo em execução manual
    const results = await evaluateRule(supabaseAdmin, { ...(rule as unknown as Parameters<typeof evaluateRule>[1]), last_run_at: null });
    const normalizedResults = results.map((r) => ({ ...r, semantic: classifyAutomationRun(r) }));

    for (const r of normalizedResults) {
      await supabaseAdmin.from("meta_automation_runs").insert({
        workspace_id: data.workspaceId, rule_id: rule.id,
        campaign_id: r.campaign_id ?? null,
        matched: r.matched, metric_value: r.metric_value,
        action_taken: r.action_taken, action_status: r.status,
        error_message: r.error ?? null,
        payload: { manual: true, semantic_code: r.semantic.code },
      });
    }
    await supabaseAdmin.from("meta_automation_rules")
      .update({ last_run_at: new Date().toISOString() }).eq("id", rule.id);

    return { results: normalizedResults };
  });
