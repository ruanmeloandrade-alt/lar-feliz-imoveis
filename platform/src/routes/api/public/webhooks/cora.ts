// Webhook público do Banco Cora.
// Cora não emite secret simétrico documentado; estratégia:
// 1) dedupe por (provider, event_id)
// 2) re-consulta o recurso no Cora via cora-proxy antes de confirmar pagamento
// Assim mesmo se alguém forjar um POST, nada é liberado sem confirmação real.

import { createFileRoute } from "@tanstack/react-router";
import { periodEndDate, type Period } from "@/lib/billing/types";

async function processEvent(payload: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { callCora } = await import("@/lib/billing/cora.server");

  const eventId =
    String((payload.id as string) ?? (payload.event_id as string) ?? (payload.uuid as string) ?? crypto.randomUUID());
  const resource = (payload.resource ?? payload.data ?? payload) as Record<string, unknown>;
  const providerChargeId = String((resource.id as string) ?? (resource.invoice_id as string) ?? "");

  // dedupe
  const { data: existing } = await supabaseAdmin
    .from("webhook_events")
    .select("id, processed_at")
    .eq("provider", "cora")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.processed_at) return { ok: true, dedup: true };

  await supabaseAdmin
    .from("webhook_events")
    .upsert(
      { provider: "cora", event_id: eventId, signature_ok: true, payload: payload as never },
      { onConflict: "provider,event_id" },
    );



  if (!providerChargeId) {
    return { ok: true, ignored: "no_provider_id" };
  }

  // Re-consulta o recurso pra confirmar status real
  const verify = await callCora<{ status?: string; paid_at?: string }>("get_invoice_status", { id: providerChargeId });
  const status = String(((verify.data ?? {}) as Record<string, unknown>).status ?? "").toUpperCase();

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("provider_charge_id", providerChargeId)
    .maybeSingle();
  if (!payment) return { ok: true, ignored: "payment_not_found" };

  let newStatus: string = payment.status;
  let paidAt: string | null = payment.paid_at;
  if (["PAID", "SETTLED", "RECEIVED"].includes(status)) {
    newStatus = "paid";
    paidAt = new Date().toISOString();
  } else if (["CANCELED", "CANCELLED"].includes(status)) newStatus = "canceled";
  else if (["EXPIRED", "OVERDUE"].includes(status)) newStatus = "expired";
  else if (["FAILED", "REJECTED"].includes(status)) newStatus = "failed";

  await supabaseAdmin
    .from("payments")
    .update({ status: newStatus, paid_at: paidAt ?? undefined, raw_response: (verify.data ?? {}) as never })
    .eq("id", payment.id);

  if (newStatus === "paid" && payment.subscription_id) {
    const now = new Date();
    const end = periodEndDate(now, payment.period as Period);
    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        plan_id: payment.plan_id ?? undefined,
        period: payment.period ?? undefined,
        started_at: now.toISOString(),
        current_period_end: end.toISOString(),
        extra_employees: payment.extra_employees,
        last_payment_id: payment.id,
      })
      .eq("id", payment.subscription_id);
    if (payment.coupon_id) {
      await supabaseAdmin.from("coupon_usages").insert({
        coupon_id: payment.coupon_id,
        workspace_id: payment.workspace_id,
        payment_id: payment.id,
      });
    }
  }

  await supabaseAdmin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", "cora")
    .eq("event_id", eventId);

  return { ok: true, status: newStatus };
}

export const Route = createFileRoute("/api/public/webhooks/cora")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("bad json", { status: 400 });
        }
        try {
          const r = await processEvent(payload);
          return Response.json(r);
        } catch (e) {
          console.error("[cora-webhook]", e);
          return Response.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
        }
      },
      GET: async () => new Response("ok"),
    },
  },
});
