import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint público de ingestão de eventos do pixel MKTOn.
 * Aceita Content-Type "text/plain" (evita preflight) e application/json.
 *
 * Regras (auditoria de tracking):
 *  - Tráfego do painel MKTOn, previews e localhost é rejeitado na origem.
 *  - Só aceita domínio cadastrado em tracking_sites.
 *  - Deduplica por event_id e reaproveita o evento salvo para retry de dispatch parcial.
 *  - Resolve identidade (anon_id -> lead_id) e faz backfill.
 *  - Distribui para CRM / SalesBots / Conversões / Meta / Workflow / Social.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      }
    : { "Access-Control-Allow-Origin": "*" };
}

const HITS = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string, max = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = HITS.get(key);
  if (!cur || cur.reset < now) {
    HITS.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  cur.n += 1;
  return cur.n > max;
}

export const Route = createFileRoute("/api/public/track/collect")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders(request),
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          },
        }),

      POST: async ({ request }) => {
        const cors = corsHeaders(request);
        try {
          const raw = await request.text().catch(() => "");
          let body: Record<string, unknown> | null = null;
          try {
            body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
          } catch {
            body = null;
          }
          if (!body || typeof body !== "object")
            return Response.json({ ok: false, error: "invalid body" }, { status: 400, headers: cors });
          const w = String(body.w ?? "");
          if (!/^[0-9a-f-]{36}$/i.test(w))
            return Response.json({ ok: false, error: "invalid workspace" }, { status: 400, headers: cors });

          const ua = request.headers.get("user-agent") ?? "";
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            "";
          if (rateLimited(`${w}:${ip}`))
            return Response.json({ ok: false, error: "rate limited" }, { status: 429, headers: cors });

          const url = typeof body.url === "string" ? body.url.slice(0, 1000) : null;

          const { classifySource, hostFromUrl, resolveTrackingIdentity } = await import(
            "@/lib/tracking-identity.server"
          );
          const sourceClass = classifySource(url);
          if (sourceClass !== "cliente")
            return Response.json({ ok: true, ignored: sourceClass }, { headers: cors });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const domain = hostFromUrl(url);
          let siteId: string | null = null;
          if (domain) {
            const { data: site } = await supabaseAdmin
              .from("tracking_sites")
              .select("id")
              .eq("workspace_id", w)
              .eq("domain", domain)
              .maybeSingle();
            if (site) siteId = (site as { id: string }).id;
          }
          if (!siteId)
            return Response.json({ ok: true, ignored: "site-nao-cadastrado" }, { headers: cors });

          const country = request.headers.get("cf-ipcountry") ?? null;
          const path = typeof body.path === "string" ? body.path.slice(0, 500) : null;
          const eventName = String(body.event ?? "page_view").slice(0, 60);
          const props = (body.props && typeof body.props === "object" ? body.props : {}) as Record<string, unknown>;
          const value =
            typeof (body as { value?: unknown }).value === "number" ? (body as { value: number }).value : null;
          const currency = typeof body.currency === "string" ? body.currency.slice(0, 6) : null;
          const eventId = typeof body.event_id === "string" ? body.event_id.slice(0, 80) : null;
          const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

          const utm = {
            utm_source: str(body.utm_source, 120),
            utm_medium: str(body.utm_medium, 120),
            utm_campaign: str(body.utm_campaign, 120),
            utm_term: str(body.utm_term, 120),
            utm_content: str(body.utm_content, 120),
          };

          const row = {
            workspace_id: w,
            site_id: siteId,
            event_name: eventName,
            page_url: url,
            page_path: path,
            referrer: str(body.ref, 500),
            ...utm,
            fbclid: str(body.fbclid, 200),
            gclid: str(body.gclid, 200),
            session_id: str(body.session_id, 60),
            anon_id: str(body.anon_id, 60),
            value,
            currency,
            props,
            user_agent: ua.slice(0, 500),
            ip: ip.slice(0, 60),
            country,
            source_class: sourceClass,
            event_id: eventId,
          };

          const pick = (...keys: string[]): string => {
            for (const k of keys) {
              const v = props[k] ?? (body as Record<string, unknown>)[k];
              if (typeof v === "string" && v.trim()) return v.trim();
            }
            return "";
          };
          const identity = await resolveTrackingIdentity(supabaseAdmin as never, {
            workspaceId: w,
            anonId: row.anon_id,
            email: pick("email", "e-mail", "lead_email"),
            phone: pick("phone", "telefone", "whatsapp", "lead_phone"),
            explicitLeadId: pick("lead_id", "leadId"),
            utm,
            createLeadIfMissing: ["form_submit", "lead", "cadastro"].includes(eventName.toLowerCase()),
            leadName: pick("name", "nome", "full_name") || null,
            sourceLabel: `site: ${domain ?? "tracking"}`,
          });
          const leadId = identity.leadId;

          let priorCount = 0;
          if (row.anon_id) {
            const { count } = await supabaseAdmin
              .from("tracking_events")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", w)
              .eq("anon_id", row.anon_id);
            priorCount = count ?? 0;
          }

          const { data: inserted, error } = await supabaseAdmin
            .from("tracking_events")
            .insert({ ...row, lead_id: leadId } as never)
            .select("id")
            .single();

          let eventRowId: number | null = null;
          let duplicate = false;
          if (error) {
            if (String((error as { code?: string }).code) !== "23505")
              return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
            if (!eventId)
              return Response.json({ ok: false, error: "duplicate event without event_id" }, { status: 409, headers: cors });

            const { data: existing } = await supabaseAdmin
              .from("tracking_events")
              .select("id")
              .eq("workspace_id", w)
              .eq("event_id", eventId)
              .maybeSingle();
            eventRowId = Number((existing as { id?: number } | null)?.id ?? 0) || null;
            if (!eventRowId)
              return Response.json({ ok: false, error: "duplicate event could not be recovered" }, { status: 500, headers: cors });
            duplicate = true;
          } else {
            eventRowId = Number((inserted as { id: number } | null)?.id ?? 0) || null;
          }

          await supabaseAdmin
            .from("tracking_sites")
            .update({ last_event_at: new Date().toISOString(), verified: true } as never)
            .eq("id", siteId);

          const { dispatchTracking } = await import("@/lib/tracking-dispatcher.server");
          const dispatchResult = await dispatchTracking(supabaseAdmin as never, {
            workspaceId: w,
            eventRowId,
            eventName,
            leadId,
            siteId,
            value,
            currency,
            pageUrl: url,
            pagePath: path,
            anonId: row.anon_id,
            sessionId: row.session_id,
            utm,
            isFirstVisit: duplicate ? priorCount <= 1 : priorCount === 0,
            isHotVisit: duplicate ? priorCount >= 3 : priorCount + 1 >= 3,
            eventId,
          });
          if (dispatchResult.errors.length) {
            throw new Error(`Tracking dispatch incomplete: ${dispatchResult.errors.join(", ")}`);
          }

          return Response.json(
            {
              ok: true,
              duplicate,
              lead: leadId ? "identified" : "anonymous",
              backfilled: identity.backfilled,
            },
            { headers: cors },
          );
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500, headers: cors },
          );
        }
      },
    },
  },
});
