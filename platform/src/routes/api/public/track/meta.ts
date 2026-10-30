import { createFileRoute } from "@tanstack/react-router";

const META_EVENT_PLAN_CODES = new Set(["professional", "business", "enterprise"]);

function isLiveTrial(status: string | null | undefined, trialEndsAt: string | null | undefined) {
  if (status !== "trial_active" || !trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  return Number.isFinite(end) && end > Date.now();
}

/**
 * Endpoint público chamado pelo snippet de tracking no site do cliente.
 * Recebe fbc/fbp/fbclid/event_id capturados pelo Pixel do browser e grava
 * no lead correspondente pra a Conversions API poder deduplicar depois.
 *
 * Body JSON:
 *   { leadId: string, fbc?: string, fbp?: string, fbclid?: string,
 *     eventId?: string, externalId?: string }
 *
 * Sem auth (público). O único identificador é o leadId. Antes de gravar,
 * resolve o workspace dono do lead e aplica o entitlement meta_events:
 * Growth, Performance, Scale ou trial ativo. Start não recebe o recurso.
 */
export const Route = createFileRoute("/api/public/track/meta")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          },
        }),

      POST: async ({ request }) => {
        const cors = { "Access-Control-Allow-Origin": "*" };
        try {
          const body = await request.json().catch(() => null) as {
            leadId?: string; fbc?: string; fbp?: string; fbclid?: string;
            eventId?: string; externalId?: string;
          } | null;
          if (!body?.leadId || !/^[0-9a-f-]{36}$/i.test(body.leadId)) {
            return Response.json({ ok: false, error: "leadId inválido" }, { status: 400, headers: cors });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: lead, error: leadError } = await supabaseAdmin
            .from("leads")
            .select("workspace_id")
            .eq("id", body.leadId)
            .maybeSingle();
          if (leadError) {
            return Response.json({ ok: false, error: leadError.message }, { status: 500, headers: cors });
          }
          if (!lead?.workspace_id) {
            return Response.json({ ok: false, error: "lead não encontrado" }, { status: 404, headers: cors });
          }

          const { data: subscription, error: subscriptionError } = await supabaseAdmin
            .from("subscriptions")
            .select("status,trial_ends_at,plan:plans(code)")
            .eq("workspace_id", lead.workspace_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (subscriptionError) {
            return Response.json({ ok: false, error: subscriptionError.message }, { status: 500, headers: cors });
          }

          const planCode = (subscription?.plan as { code?: string } | null)?.code ?? null;
          const hasMetaEvents = isLiveTrial(subscription?.status, subscription?.trial_ends_at)
            || (subscription?.status === "active" && !!planCode && META_EVENT_PLAN_CODES.has(planCode));
          if (!hasMetaEvents) {
            return Response.json({ ok: false, error: "meta_events não disponível neste plano" }, { status: 403, headers: cors });
          }

          const patch: Record<string, unknown> = {};
          // fbc oficial: fb.{subdomainIndex}.{creation_time_ms}.{fbclid}
          if (body.fbc) patch.fb_fbc = body.fbc;
          else if (body.fbclid) patch.fb_fbc = `fb.1.${Date.now()}.${body.fbclid}`;
          if (body.fbp) patch.fb_fbp = body.fbp;
          if (body.eventId) patch.fb_event_id = body.eventId;
          if (body.externalId) patch.fb_external_id = body.externalId;

          const ua = request.headers.get("user-agent") ?? "";
          const ip = request.headers.get("cf-connecting-ip")
            ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? "";
          if (ua) patch.fb_client_ua = ua;
          if (ip) patch.fb_client_ip = ip;

          if (Object.keys(patch).length === 0) {
            return Response.json({ ok: true, updated: 0 }, { headers: cors });
          }

          const { error } = await supabaseAdmin
            .from("leads")
            .update(patch as never)
            .eq("id", body.leadId)
            .eq("workspace_id", lead.workspace_id);
          if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
          }
          return Response.json({ ok: true, updated: Object.keys(patch).length }, { headers: cors });
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
