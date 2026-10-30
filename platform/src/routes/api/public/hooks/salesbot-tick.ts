import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

// Cron público chamado a cada minuto pelo pg_cron.
// Destrava runs de Salesbot cujo timer venceu.

export const Route = createFileRoute("/api/public/hooks/salesbot-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { tickWaitingTimers, tickAiAgentInactivity, tickAiAgentTracking } = await import("@/lib/salesbot-runtime.server");
          const r = await tickWaitingTimers(supabaseAdmin as unknown as never);
          const ia = await tickAiAgentInactivity(supabaseAdmin as unknown as never).catch(() => ({ processed: 0 }));
          const tracking = await tickAiAgentTracking(supabaseAdmin as unknown as never).catch(() => ({ processed: 0 }));
          return Response.json({ ok: true, ...r, iaFollowups: ia.processed, iaTracking: tracking.processed });

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
