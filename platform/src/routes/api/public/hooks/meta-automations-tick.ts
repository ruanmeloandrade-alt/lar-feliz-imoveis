import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

// Cron público chamado pelo pg_cron a cada 30 min.
// Avalia todas as regras Meta habilitadas, respeitando cooldown por regra.
// Isolamento multi-tenant: cada regra tem workspace_id próprio e a execução
// só toca dados/tokens desse workspace.

export const Route = createFileRoute("/api/public/hooks/meta-automations-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const mod = await import("@/lib/meta-automations-core.server");
          const evaluateRule = mod.evaluateRule;
          type AutomationRule = import("@/lib/meta-automations-core.server").AutomationRule;

          const { data: rules, error } = await supabaseAdmin
            .from("meta_automation_rules")
            .select("*")
            .eq("enabled", true)
            .limit(200);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

          const list = (rules ?? []) as unknown as AutomationRule[];
          const results: Array<{ rule_id: string; count: number; matched: number; errors: number }> = [];

          for (const rule of list) {
            try {
              const runs = await evaluateRule(supabaseAdmin, rule);
              const skippedInterval = runs.length === 1 && runs[0].status === "skipped" && runs[0].error === "scan_interval";
              let matched = 0, errors = 0;
              const rows = skippedInterval ? [] : runs.map((r) => {
                if (r.matched) matched++;
                if (r.status === "error") errors++;
                return {
                  workspace_id: rule.workspace_id,
                  rule_id: rule.id,
                  campaign_id: r.campaign_id ?? null,
                  matched: r.matched,
                  metric_value: r.metric_value,
                  action_taken: r.action_taken,
                  action_status: r.status,
                  error_message: r.error ?? null,
                  payload: { scheduled: true },
                };
              });
              if (rows.length) await supabaseAdmin.from("meta_automation_runs").insert(rows);
              if (!skippedInterval) {
                await supabaseAdmin.from("meta_automation_rules")
                  .update({ last_run_at: new Date().toISOString() })
                  .eq("id", rule.id);
              }
              results.push({ rule_id: rule.id, count: runs.length, matched, errors });
            } catch (err) {
              await supabaseAdmin.from("meta_automation_runs").insert({
                workspace_id: rule.workspace_id, rule_id: rule.id,
                matched: false, action_status: "error",
                error_message: err instanceof Error ? err.message : String(err),
                payload: { scheduled: true },
              });
              results.push({ rule_id: rule.id, count: 0, matched: 0, errors: 1 });
            }
          }


          return Response.json({ ok: true, evaluated: list.length, results });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
