import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";
import { createStripeClient, getConfiguredStripeEnvironment, type StripeEnv } from "@/lib/stripe.server";
import { markStripePaymentPaidAndActivate } from "./payment-activation.server";

const ReturnStatusSchema = z.object({ sessionId: z.string().trim().min(1).max(255) });
type JsonRecord = Record<string, unknown>;

function sessionEnvironment(sessionId: string): StripeEnv {
  if (sessionId.startsWith("cs_test_")) return "sandbox";
  if (sessionId.startsWith("cs_live_")) return "live";
  throw new Error("Identificador de sessão Stripe inválido.");
}

function validateCheckoutSession(payment: JsonRecord, session: any, workspaceId: string) {
  const paymentId = typeof payment.id === "string" ? payment.id : "";
  const providerChargeId = typeof payment.provider_charge_id === "string" ? payment.provider_charge_id : "";
  const sessionId = typeof session?.id === "string" ? session.id : "";
  const metadataPaymentId = typeof session?.metadata?.paymentId === "string" ? session.metadata.paymentId : "";
  const metadataWorkspaceId = typeof session?.metadata?.workspaceId === "string" ? session.metadata.workspaceId : "";

  if (!paymentId || !sessionId || (providerChargeId && providerChargeId !== sessionId)) {
    throw new Error("A sessão Stripe não corresponde ao pagamento solicitado.");
  }
  if (metadataPaymentId !== paymentId) {
    throw new Error("A sessão Stripe não possui a identidade canônica deste pagamento.");
  }
  if (metadataWorkspaceId !== workspaceId) {
    throw new Error("A sessão Stripe não possui a identidade canônica do workspace ativo.");
  }

  const amountTotal = typeof session?.amount_total === "number" ? session.amount_total : null;
  const ledgerAmount = Number(payment.amount_cents);
  if (!Number.isFinite(ledgerAmount) || amountTotal === null || amountTotal !== ledgerAmount) {
    throw new Error("O valor confirmado pela Stripe diverge do pagamento registrado.");
  }

  const currency = typeof session?.currency === "string" ? session.currency.toLowerCase() : "";
  if (currency !== "brl") throw new Error("A moeda confirmada pela Stripe é inválida para este pagamento.");
  if (session?.mode !== "payment") {
    throw new Error("A sessão Stripe possui modo incompatível com este checkout.");
  }
}

async function repairSessionBinding(payment: JsonRecord, sessionId: string, workspaceId: string) {
  const currentBinding = typeof payment.provider_charge_id === "string" ? payment.provider_charge_id : "";
  if (currentBinding === sessionId) return;
  if (currentBinding) throw new Error("O pagamento já está vinculado a outra sessão Stripe.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("payments")
    .update({ provider_charge_id: sessionId })
    .eq("id", payment.id)
    .eq("workspace_id", workspaceId)
    .is("provider_charge_id", null);
  if (error) throw new Error(error.message);

  const { data: latest, error: latestError } = await supabaseAdmin
    .from("payments")
    .select("provider_charge_id")
    .eq("id", payment.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);
  if (latest?.provider_charge_id !== sessionId) {
    throw new Error("Não foi possível reconciliar a sessão Stripe com o pagamento.");
  }
}

export const getVerifiedCheckoutReturnStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReturnStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const workspaceId = await resolveActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });
    if (!workspaceId) throw new Error("Workspace não encontrado.");

    const configuredEnvironment = getConfiguredStripeEnvironment();
    if (sessionEnvironment(data.sessionId) !== configuredEnvironment) {
      throw new Error("A sessão Stripe pertence a outro ambiente de pagamento.");
    }
    const stripe = await createStripeClient(configuredEnvironment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);

    const metadataPaymentId = typeof session?.metadata?.paymentId === "string" ? session.metadata.paymentId : "";
    const metadataWorkspaceId = typeof session?.metadata?.workspaceId === "string" ? session.metadata.workspaceId : "";
    if (!metadataPaymentId || metadataWorkspaceId !== workspaceId) {
      throw new Error("A sessão Stripe não possui a identidade canônica do checkout Vanessa Simoni.");
    }

    const sb = context.supabase as { from: (table: string) => any };
    let { data: payment, error } = await sb
      .from("payments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("provider", "stripe")
      .eq("provider_charge_id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!payment) {
      const fallback = await sb
        .from("payments")
        .select("*")
        .eq("id", metadataPaymentId)
        .eq("workspace_id", workspaceId)
        .eq("provider", "stripe")
        .maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      payment = fallback.data;
    }
    if (!payment) throw new Error("Pagamento não encontrado para esta sessão.");

    validateCheckoutSession(payment as JsonRecord, session, workspaceId);
    await repairSessionBinding(payment as JsonRecord, data.sessionId, workspaceId);

    let activationFailed = false;
    if (session.payment_status === "paid") {
      try {
        await markStripePaymentPaidAndActivate(payment as JsonRecord);
      } catch {
        activationFailed = true;
      }
    } else if (session.status === "expired" && payment.status === "pending") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: expireError } = await supabaseAdmin
        .from("payments")
        .update({ status: "expired" })
        .eq("id", payment.id)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending");
      if (expireError) throw new Error(expireError.message);
    }

    const { data: current, error: currentError } = await sb
      .from("payments")
      .select("id,status,amount_cents,paid_at,raw_response")
      .eq("id", payment.id)
      .eq("workspace_id", workspaceId)
      .single();
    if (currentError) throw new Error(currentError.message);

    const raw = (current.raw_response ?? {}) as JsonRecord;
    return {
      id: current.id as string,
      status: current.status as string,
      amount_cents: current.amount_cents as number,
      paid_at: current.paid_at as string | null,
      activation_pending: activationFailed || raw.activation_reconciliation_required === true,
    };
  });
