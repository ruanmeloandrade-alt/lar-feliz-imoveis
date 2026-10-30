import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runSocialScheduler } from "@/lib/social-scheduler.server";
import { clampSchedulerLimit, schedulerSecretMatches } from "@/lib/social-scheduler.core";

function providedSecret(request: Request): string | null {
  const direct = request.headers.get("x-social-scheduler-secret");
  if (direct) return direct;
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export const Route = createFileRoute("/api/social/scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SOCIAL_SCHEDULER_SECRET;
        if (!schedulerSecretMatches(expected, providedSecret(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const rawLimit = Number(url.searchParams.get("limit") ?? undefined);
        const limit = clampSchedulerLimit(Number.isFinite(rawLimit) ? rawLimit : undefined);

        try {
          const result = await runSocialScheduler(supabaseAdmin, { limit });
          return Response.json({ ok: result.failed === 0, ...result });
        } catch (error) {
          console.error("[social-scheduler] fatal", error);
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "scheduler_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
