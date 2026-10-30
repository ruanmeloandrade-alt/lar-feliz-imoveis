import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  scope_level: z.enum(["campaign", "adset", "ad"]).default("campaign"),
  trigger_metric: z.string().min(1),
  trigger_operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  trigger_value: z.number(),
  trigger_window: z.enum(["last_1d", "last_3d", "last_7d", "last_14d", "last_30d"]).default("last_7d"),
  action_type: z.string().min(1),
  action_value: z.number().nullable().optional(),
  cooldown_minutes: z.number().int().min(0).default(720),
  interval_minutes: z.number().int().min(5).default(60),
});

const StrategySchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().max(8000).default(""),
  adAccountId: z.string().nullable().optional(),
  defaultObjective: z.string().nullable().optional(),
  budgetMode: z.enum(["daily", "lifetime"]).nullable().optional(),
  budgetAmount: z.number().nullable().optional(),
  budgetLevel: z.enum(["campaign", "adset"]).nullable().optional(),
  bidStrategy: z.string().nullable().optional(),
  optimizationGoal: z.string().nullable().optional(),
  personaId: z.string().uuid().nullable().optional(),
  placements: z.record(z.string(), z.unknown()).default({}),
  schedule: z.record(z.string(), z.unknown()).default({}),
  targetingHints: z.record(z.string(), z.unknown()).default({}),
  copyGuidelines: z.string().max(8000).default(""),
  automationRules: z.array(RuleSchema).default([]),
  linkedPageIds: z.array(z.string()).default([]),
  linkedIgIds: z.array(z.string()).default([]),
  linkedWaPhoneIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export type MetaStrategy = z.infer<typeof StrategySchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(data: MetaStrategy, userId: string): any {
  return {
    workspace_id: data.workspaceId,
    created_by: userId,
    name: data.name,
    description: data.description,
    ad_account_id: data.adAccountId ?? null,
    default_objective: data.defaultObjective ?? null,
    budget_mode: data.budgetMode ?? null,
    budget_amount: data.budgetAmount ?? null,
    budget_level: data.budgetLevel ?? null,
    bid_strategy: data.bidStrategy ?? null,
    optimization_goal: data.optimizationGoal ?? null,
    persona_id: data.personaId ?? null,
    placements: data.placements,
    schedule: data.schedule,
    targeting_hints: data.targetingHints,
    copy_guidelines: data.copyGuidelines,
    automation_rules: data.automationRules,
    linked_page_ids: data.linkedPageIds,
    linked_ig_ids: data.linkedIgIds,
    linked_wa_phone_ids: data.linkedWaPhoneIds,
    enabled: data.enabled,
  };
}

export const listStrategies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meta_strategies")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meta_strategies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StrategySchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = toRow(data, context.userId);
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("meta_strategies")
        .update(row)
        .eq("id", data.id)
        .eq("workspace_id", data.workspaceId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("meta_strategies")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_strategies")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Aplica as regras de automação da estratégia a uma campanha recém-criada.
 * Cria linhas em meta_automation_rules com scope_type='campaign' e scope_id=campaignId.
 */
export const applyStrategyToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { strategyId: string; workspaceId: string; campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: strat, error: sErr } = await context.supabase
      .from("meta_strategies")
      .select("*")
      .eq("id", data.strategyId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!strat) throw new Error("Estratégia não encontrada.");

    const rules = ((strat as { automation_rules?: unknown }).automation_rules ?? []) as Array<Record<string, unknown>>;
    if (rules.length === 0) return { created: 0 };

    const inserts = rules.map((r) => ({
      workspace_id: data.workspaceId,
      name: `[${(strat as { name: string }).name}] ${(r.name as string) ?? "regra"}`,
      enabled: (r.enabled as boolean) ?? true,
      scope_type: "campaign" as const,
      scope_id: data.campaignId,
      trigger_metric: r.trigger_metric as string,
      trigger_operator: r.trigger_operator as string,
      trigger_value: r.trigger_value as number,
      trigger_window: (r.trigger_window as string) ?? "last_7d",
      action_type: r.action_type as string,
      action_value: (r.action_value as number | null) ?? null,
      cooldown_minutes: (r.cooldown_minutes as number) ?? 720,
      created_by: context.userId,
    }));

    const { data: inserted, error } = await context.supabase
      .from("meta_automation_rules")
      .insert(inserts)
      .select("id");
    if (error) throw new Error(error.message);
    return { created: (inserted ?? []).length };
  });

// Loads REAL channel options for an ad account: FB pages, IG accounts, and WhatsApp phone numbers.
// - Pages/IG: from meta_pages + meta_instagram_accounts (already scoped to workspace).
// - WhatsApp: fetched live from Meta Graph via connected_whatsapp_business_accounts + /phone_numbers.
export const listStrategyChannelsForAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; adAccountId: string }) => d)
  .handler(async ({ data, context }) => {
    const wsId = data.workspaceId;
    const acct = data.adAccountId;

    const [{ data: pages }, { data: igs }] = await Promise.all([
      context.supabase.from("meta_pages")
        .select("page_id,page_name").eq("workspace_id", wsId).order("page_name"),
      context.supabase.from("meta_instagram_accounts")
        .select("instagram_id,username").eq("workspace_id", wsId).order("username"),
    ]);

    // WhatsApp: precisamos do token pra puxar números reais da(s) WABA(s) da conta.
    let whatsapps: Array<{ id: string; label: string; verified_name: string | null; display_phone_number: string; waba_id: string }> = [];
    try {
      const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
      if (encKey && acct) {
        const sb = context.supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
        const { data: sec } = await sb.rpc("get_integration_secret", { _workspace_id: wsId, _provider: "meta", _key: encKey });
        const token = (sec as { access_token?: string } | null)?.access_token;
        if (token) {
          const acctId = acct.startsWith("act_") ? acct : `act_${acct}`;
          const wabaRes = await fetch(`https://graph.facebook.com/v23.0/${acctId}/connected_whatsapp_business_accounts?fields=id,name&access_token=${encodeURIComponent(token)}`);
          const wabaJson = wabaRes.ok ? await wabaRes.json() as { data?: Array<{ id: string; name?: string }> } : { data: [] };
          const phoneResults = await Promise.all((wabaJson.data ?? []).map(async (w) => {
            const r = await fetch(`https://graph.facebook.com/v23.0/${w.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`);
            if (!r.ok) return { waba: w, phones: [] as Array<{ id: string; display_phone_number: string; verified_name?: string }> };
            const j = await r.json() as { data?: Array<{ id: string; display_phone_number: string; verified_name?: string }> };
            return { waba: w, phones: j.data ?? [] };
          }));
          for (const pr of phoneResults) {
            for (const p of pr.phones) {
              whatsapps.push({
                id: p.id,
                waba_id: pr.waba.id,
                display_phone_number: p.display_phone_number,
                verified_name: p.verified_name ?? null,
                label: p.verified_name ? `${p.verified_name}, ${p.display_phone_number}` : p.display_phone_number,
              });
            }
          }
          // dedupe por id
          const seen = new Set<string>();
          whatsapps = whatsapps.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
        }
      }
    } catch { /* silencioso: retorna vazio */ }

    return {
      pages: (pages ?? []).map((p: { page_id: string; page_name: string | null }) => ({ id: p.page_id, label: p.page_name ?? p.page_id })),
      instagrams: (igs ?? []).map((i: { instagram_id: string; username: string | null }) => ({ id: i.instagram_id, label: i.username ? `@${i.username}` : i.instagram_id })),
      whatsapps,
    };
  });
