import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function getSupabase() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function activateFromSession(session: any, env: StripeEnv) {
  const metadata = session.metadata ?? {};
  const paymentId = metadata.paymentId;
  const workspaceId = metadata.workspaceId;
  const planId = metadata.planId;
  if (!paymentId || !workspaceId || !planId) return;

  const sb = await getSupabase();
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const monthsByPeriod: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };
  const months = monthsByPeriod[String(metadata.period ?? "1m")] ?? 1;
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + months);

  await sb
    .from("payments")
    .update({
      status: "paid",
      provider: "stripe",
      provider_charge_id: session.id,
      paid_at: new Date().toISOString(),
      raw_response: { session_id: session.id, stripe_subscription_id: subscriptionId, environment: env },
    })
    .eq("id", paymentId);

  // Compra avulsa de adicionais: só soma usuários/WhatsApp extras, sem mexer no plano/ciclo.
  if (String(metadata.extrasOnly ?? "") === "true") {
    const { data: current } = await sb
      .from("subscriptions")
      .select("extra_employees")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    await sb
      .from("subscriptions")
      .update({
        extra_employees: Number(current?.extra_employees ?? 0) + Number(metadata.extraEmployees ?? 0),
        last_payment_id: paymentId,
      })
      .eq("workspace_id", workspaceId);
    return;
  }

  await sb
    .from("subscriptions")
    .update({
      plan_id: planId,
      status: "active",
      period: metadata.period ?? "1m",
      started_at: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
      extra_employees: Number(metadata.extraEmployees ?? 0),
      last_payment_id: paymentId,
    })
    .eq("workspace_id", workspaceId);
}

async function markSubscriptionCanceled(subscription: any) {
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) return;
  const sb = await getSupabase();
  await sb.from("subscriptions").update({ status: "canceled" }).eq("workspace_id", workspaceId);
}

async function handleWebhook(request: Request, env: StripeEnv) {
  const event = await verifyWebhook(request, env);

  switch (event.type) {
    case "checkout.session.completed":
      if (event.data.object?.payment_status === "paid") await activateFromSession(event.data.object, env);
      break;
    case "checkout.session.async_payment_succeeded":
      await activateFromSession(event.data.object, env);
      break;
    case "checkout.session.async_payment_failed":
      if (event.data.object?.metadata?.paymentId) {
        const sb = await getSupabase();
        await sb.from("payments").update({ status: "failed" }).eq("id", event.data.object.metadata.paymentId);
      }
      break;
    case "customer.subscription.deleted":
      await markSubscriptionCanceled(event.data.object);
      break;
    default:
      break;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") return Response.json({ received: true, ignored: "invalid_env" });
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (error) {
          console.error("[stripe-webhook]", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});