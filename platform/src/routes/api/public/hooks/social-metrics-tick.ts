// Cron: coleta métricas orgânicas reais dos posts publicados (IG/FB).
// Chamado pelo pg_cron — roda no servidor, independente do navegador.
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

export const Route = createFileRoute("/api/public/hooks/social-metrics-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncSocialMetrics } = await import("@/lib/social-metrics.server");
          const r = await syncSocialMetrics(supabaseAdmin, { days: 30, limit: 200 });
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
