import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";

// Cron público, a cada 1h avalia relatórios agendados vencidos e envia.
// Isolamento multi-tenant: cada relatório carrega workspace_id próprio.

export const Route = createFileRoute("/api/public/hooks/meta-reports-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const mod = await import("@/lib/meta-reports-core.server");

          const nowIso = new Date().toISOString();
          const { data: due, error } = await supabaseAdmin
            .from("scheduled_reports").select("*")
            .eq("enabled", true).lte("next_run_at", nowIso).limit(50);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

          const list = (due ?? []) as Array<{
            id: string; workspace_id: string; name: string; preset: string;
            channels: string[]; recipients_email: string[]; recipients_whatsapp: string[];
            include_ai_suggestions: boolean;
            frequency: "daily" | "weekly" | "biweekly" | "monthly"; timezone: string;
            send_hour_local: number; send_minute_local: number | null; weekly_day: number;
          }>;

          const results: Array<{ id: string; ok: boolean; error?: string }> = [];
          for (const r of list) {
            try {
              const res = await mod.executeReport(supabaseAdmin, {
                id: r.id, workspace_id: r.workspace_id, name: r.name, preset: r.preset,
                channels: r.channels, recipients_email: r.recipients_email,
                recipients_whatsapp: r.recipients_whatsapp,
                include_ai_suggestions: r.include_ai_suggestions,
              });
              const next = mod.computeNextRunAt(r.frequency, r.timezone, r.send_hour_local, r.send_minute_local ?? 0, r.weekly_day);
              await supabaseAdmin.from("scheduled_reports").update({
                last_run_at: new Date().toISOString(),
                last_status: res.error ? "error" : "ok",
                last_error: res.error ?? null,
                next_run_at: next,
              }).eq("id", r.id);
              results.push({ id: r.id, ok: !res.error, error: res.error });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await supabaseAdmin.from("scheduled_reports").update({
                last_run_at: new Date().toISOString(),
                last_status: "error", last_error: msg,
                next_run_at: new Date(Date.now() + 60 * 60_000).toISOString(),
              }).eq("id", r.id);
              results.push({ id: r.id, ok: false, error: msg });
            }
          }
          return Response.json({ ok: true, evaluated: list.length, results });
        } catch (err) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
        }
      },
    },
  },
});
