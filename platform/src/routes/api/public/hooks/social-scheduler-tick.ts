// Scheduler cron do Social Media. Chamado pelo pg_cron a cada 5 min.
// Isolamento: cada post tem workspace_id, nunca cruza dados entre workspaces.
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

export const Route = createFileRoute("/api/public/hooks/social-scheduler-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { publishSocialPost } = await import("@/lib/social-publisher.server");
          const now = new Date().toISOString();

          const { data: due, error } = await supabaseAdmin
            .from("social_posts")
            .select("id,workspace_id,scheduled_at,status")
            .in("status", ["scheduled", "approved"])
            .lte("scheduled_at", now)
            .limit(50);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

          const list = (due ?? []) as Array<{ id: string; workspace_id: string }>;
          const results: Array<{ id: string; ok: boolean; error?: string }> = [];

          for (const post of list) {
            // Lock otimista: só processa se ainda está scheduled/approved.
            const { data: locked } = await supabaseAdmin.from("social_posts")
              .update({ status: "publishing" }).eq("id", post.id)
              .in("status", ["scheduled", "approved"]).select("id").maybeSingle();
            if (!locked) continue;
            try {
              const r = await publishSocialPost(supabaseAdmin, post.id);
              results.push({ id: post.id, ok: r.ok });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await supabaseAdmin.from("social_posts")
                .update({ status: "failed", last_error: msg }).eq("id", post.id);
              results.push({ id: post.id, ok: false, error: msg });
            }
          }

          return Response.json({ ok: true, processed: list.length, results });
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
