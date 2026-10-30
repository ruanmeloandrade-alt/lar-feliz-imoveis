import { createFileRoute } from "@tanstack/react-router";
import { getConfiguredStripeEnvironment, verifyWebhook, type StripeEnv } from "@/lib/stripe.server";
import { markStripePaymentPaidAndActivate } from "@/lib/billing/payment-activation.server";

type JsonRecord = Record<string, unknown>;

type VerifiedStripeEvent = {
  env: StripeEnv;
  event: { type: string; data: { object: any } };
};

async function verifyStripeEvent(request: Request): Promise<VerifiedStripeEvent> {
  const env = getConfiguredStripeEnvironment();
  return { env, event: await verifyWebhook(request, env) };
}

async function findManagedPayment(admin: any, session: any) {
  const sessionId = typeof session?.id === "string" ? session.id : "";
  const paymentId = typeof session?.metadata?.paymentId === "string" ? session.metadata.paymentId : "";

  if (sessionId) {
    const { data, error } = await admin
      .from("payments")
      .select("*")
      .eq("provider", "stripe")
      .eq("provider_charge_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
  }

  if (paymentId) {
    const { data, error } = await admin
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .eq("provider", "stripe")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
  }

  return null;
}

function expectedStripeEnvironment(payment: JsonRecord, session: any): StripeEnv {
  const raw = (payment.raw_response ?? {}) as JsonRecord;
  if (raw.stripe_environment === "sandbox" || raw.stripe_environment === "live") {
    return raw.stripe_environment;
  }

  const sessionId = typeof session?.id === "string"
    ? session.id
    : typeof payment.provider_charge_id === "string"
      ? payment.provider_charge_id
      : "";
  return sessionId.startsWith("cs_test_") ? "sandbox" : "live";
}

function validateManagedSession(payment: JsonRecord, session: any): string | null {
  const sessionId = typeof session?.id === "string" ? session.id : "";
  const paymentId = typeof payment.id === "string" ? payment.id : "";
  const providerChargeId = typeof payment.provider_charge_id === "string" ? payment.provider_charge_id : "";
  const metadataPaymentId = typeof session?.metadata?.paymentId === "string" ? session.metadata.paymentId : "";
  const metadataWorkspaceId = typeof session?.metadata?.workspaceId === "string" ? session.metadata.workspaceId : "";

  if (!sessionId || !paymentId) return "payment identity mismatch";
  if (providerChargeId && providerChargeId !== sessionId) return "session mismatch";
  if (metadataPaymentId !== paymentId) return "payment metadata mismatch";
  if (typeof payment.workspace_id !== "string" || metadataWorkspaceId !== payment.workspace_id) return "workspace metadata mismatch";

  const amountTotal = typeof session?.amount_total === "number" ? session.amount_total : null;
  const ledgerAmount = Number(payment.amount_cents);
  if (!Number.isFinite(ledgerAmount) || amountTotal === null || amountTotal !== ledgerAmount) {
    return "amount mismatch";
  }

  const currency = typeof session?.currency === "string" ? session.currency.toLowerCase() : "";
  if (currency !== "brl") return "currency mismatch";
  if (session?.mode !== "payment") return "mode mismatch";

  return null;
}

async function reconcileSessionBinding(admin: any, payment: any, sessionId: string) {
  if (payment.provider_charge_id === sessionId) return payment;
  if (payment.provider_charge_id) throw new Error("payment already bound to another Stripe session");

  const { data: claimed, error } = await admin
    .from("payments")
    .update({ provider_charge_id: sessionId })
    .eq("id", payment.id)
    .eq("workspace_id", payment.workspace_id)
    .is("provider_charge_id", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (claimed) return claimed;

  const { data: latest, error: latestError } = await admin
    .from("payments")
    .select("*")
    .eq("id", payment.id)
    .eq("workspace_id", payment.workspace_id)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);
  if (!latest || latest.provider_charge_id !== sessionId) {
    throw new Error("Stripe session binding reconciliation failed");
  }
  return latest;
}

async function handler(request: Request): Promise<Response> {
  let verified: VerifiedStripeEvent;
  try {
    verified = await verifyStripeEvent(request);
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const { event, env } = verified;
  const session = event.data?.object;
  if (!session || typeof session !== "object") return new Response("ok", { status: 200 });

  const relevant = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ]);
  if (!relevant.has(event.type)) return new Response("ok", { status: 200 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  try {
    let payment = await findManagedPayment(admin, session);
    if (!payment) return new Response("ok", { status: 200 });

    const integrityError = validateManagedSession(payment as JsonRecord, session);
    if (integrityError) return new Response(integrityError, { status: 409 });

    if (expectedStripeEnvironment(payment as JsonRecord, session) !== env) {
      return new Response("environment mismatch", { status: 409 });
    }

    const sessionId = typeof session.id === "string" ? session.id : "";
    payment = await reconcileSessionBinding(admin, payment, sessionId);

    if (session.payment_status === "paid" && (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    )) {
      await markStripePaymentPaidAndActivate(payment as JsonRecord);
      return new Response("ok", { status: 200 });
    }

    if (payment.status === "pending" && (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    )) {
      const nextStatus = event.type === "checkout.session.expired" ? "expired" : "failed";
      const { error } = await admin
        .from("payments")
        .update({ status: nextStatus })
        .eq("id", payment.id)
        .eq("workspace_id", payment.workspace_id)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return new Response("processing failed", { status: 503 });
  }
}

export const Route = createFileRoute("/api/stripe-webhook")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
