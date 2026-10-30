import { createFileRoute } from "@tanstack/react-router";

/**
 * Config pública do pixel: devolve as regras de evento ativas do workspace
 * (opcionalmente filtradas pelo domínio). Só campos necessários ao browser.
 */
export const Route = createFileRoute("/api/public/track/config")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        }),

      GET: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60",
        };
        try {
          const url = new URL(request.url);
          const w = url.searchParams.get("w") ?? "";
          const d = (url.searchParams.get("d") ?? "").replace(/^www\./, "").toLowerCase();
          if (!/^[0-9a-f-]{36}$/i.test(w)) {
            return Response.json({ rules: [] }, { headers: cors });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          let siteId: string | null = null;
          if (d) {
            const { data: site } = await supabaseAdmin
              .from("tracking_sites")
              .select("id")
              .eq("workspace_id", w)
              .eq("domain", d)
              .maybeSingle();
            if (site) siteId = (site as { id: string }).id;
            if (!siteId) return Response.json({ rules: [] }, { headers: cors });
          }

          const { data } = await supabaseAdmin
            .from("tracking_event_rules")
            .select("id, name, event_name, trigger_type, selector, match_text, url_contains, threshold, value, once_per_session, site_id")
            .eq("workspace_id", w)
            .eq("active", true)
            .limit(200);

          const rules = ((data ?? []) as Array<Record<string, unknown>>).filter(
            (r) => !r.site_id || r.site_id === siteId,
          );

          return Response.json({ rules }, { headers: cors });
        } catch {
          return Response.json({ rules: [] }, { headers: cors });
        }
      },
    },
  },
});
