import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

// Cron público (pg_cron, 1x por minuto): executa os gatilhos de etapa do CRM
// que já venceram. Roda no servidor, independente do navegador do cliente.

export const Route = createFileRoute("/api/public/hooks/crm-automations-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { tickStageAutomationJobs } = await import("@/lib/stage-automation-engine.server");
          const r = await tickStageAutomationJobs(supabaseAdmin as never);
          return Response.json({ ok: true, ...r });
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
