import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { storageAddonByCode, type StorageAddonCode } from "@/lib/billing/storage-catalog";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

const CreateSchema = z.object({
  addonCode: z.enum(["storage_10gb", "storage_25gb", "storage_50gb", "storage_100gb"]),
  environment: z.enum(["sandbox", "live"]).default("live"),
  returnUrl: z.string().url(),
});

const ConfirmSchema = z.object({
  sessionId: z.string().min(1).max(255),
  environment: z.enum(["sandbox", "live"]).default("live"),
});

function appendCheckoutToken(returnUrl: string) {
  const url = new URL(returnUrl);
  url.searchParams.set("storage_checkout", "{CHECKOUT_SESSION_ID}");
  return url.toString();
}

function normalizeError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return getStripeErrorMessage(error);
}

export const createStorageAddonCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const workspaceId = await resolveActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });
    if (!workspaceId) throw new Error("Workspace ativo não encontrado.");

    const addon = storageAddonByCode(data.addonCode);
    if (!addon) throw new Error("Adicional de armazenamento inválido.");

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("id,plan_id,period")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (subscriptionError) throw new Error(subscriptionError.message);
    if (!subscription) throw new Error("Assinatura ativa não encontrada para este workspace.");

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .insert({
        workspace_id: workspaceId,
        subscription_id: subscription.id,
        plan_id: subscription.plan_id,
        period: subscription.period,
        provider: "stripe",
        method: "credit_card",
        status: "pending",
        amount_cents: addon.monthlyPriceCents,
        discount_cents: 0,
        extra_employees: 0,
        coupon_id: null,
        paid_at: null,
        raw_response: { purpose: "storage_addon", addon_code: addon.code },
      })
      .select("id")
      .single();
    if (paymentError) throw new Error(paymentError.message);

    try {
      const stripe = await createStripeClient(data.environment as StripeEnv);
      const metadata = {
        workspaceId,
        userId: context.userId,
        paymentId: payment.id,
        addonCode: addon.code,
        extraGb: String(addon.extraGb),
        purpose: "storage_addon",
      };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: appendCheckoutToken(data.returnUrl),
        cancel_url: data.returnUrl,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: addon.monthlyPriceCents,
            product_data: {
              name: `MKTOn · ${addon.label} de armazenamento`,
              description: `Adicional de ${addon.extraGb} GB de armazenamento interno para o workspace atual.`,
            },
          },
        }],
        payment_intent_data: { metadata },
        metadata: { ...metadata, managed_payments: "false" },
      });
      if (!session.url) throw new Error("A Stripe não retornou a URL de checkout.");

      const { error: paymentUpdateError } = await admin
        .from("payments")
        .update({
          provider_charge_id: session.id,
          raw_response: { session_id: session.id, purpose: "storage_addon", addon_code: addon.code },
        })
        .eq("id", payment.id)
        .eq("workspace_id", workspaceId);
      if (paymentUpdateError) throw new Error(paymentUpdateError.message);

      const { error: addonError } = await admin.from("workspace_storage_addons").insert({
        workspace_id: workspaceId,
        addon_code: addon.code,
        extra_gb: addon.extraGb,
        monthly_price_cents: addon.monthlyPriceCents,
        status: "pending",
        provider: "stripe",
        provider_checkout_id: session.id,
        payment_id: payment.id,
        created_by: context.userId,
      });
      if (addonError) throw new Error(addonError.message);

      return { url: session.url, sessionId: session.id, paymentId: payment.id };
    } catch (error) {
      await admin
        .from("payments")
        .update({ status: "failed", raw_response: { purpose: "storage_addon", addon_code: addon.code, error: normalizeError(error) } })
        .eq("id", payment.id)
        .eq("workspace_id", workspaceId);
      throw new Error(normalizeError(error));
    }
  });

export const confirmStorageAddonCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const workspaceId = await resolveActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });
    if (!workspaceId) throw new Error("Workspace ativo não encontrado.");

    const { data: pending, error: pendingError } = await admin
      .from("workspace_storage_addons")
      .select("id,addon_code,status,payment_id")
      .eq("workspace_id", workspaceId)
      .eq("provider", "stripe")
      .eq("provider_checkout_id", data.sessionId)
      .maybeSingle();
    if (pendingError) throw new Error(pendingError.message);
    if (!pending) throw new Error("Compra de armazenamento não encontrada.");
    if (pending.status === "active") {
      return { ok: true, active: true, addonCode: pending.addon_code as StorageAddonCode, paymentId: pending.payment_id as string | null };
    }

    const stripe = await createStripeClient(data.environment as StripeEnv);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    const metadata = session.metadata ?? {};
    const matches = metadata.workspaceId === workspaceId
      && metadata.purpose === "storage_addon"
      && metadata.addonCode === pending.addon_code
      && (!pending.payment_id || metadata.paymentId === pending.payment_id);
    if (!matches) throw new Error("A cobrança não pertence a este workspace.");

    if (session.payment_status !== "paid") {
      return { ok: true, active: false, addonCode: pending.addon_code as StorageAddonCode, paymentId: pending.payment_id as string | null };
    }

    const now = new Date().toISOString();
    if (pending.payment_id) {
      const { error: paymentUpdateError } = await admin
        .from("payments")
        .update({ status: "paid", paid_at: now })
        .eq("id", pending.payment_id)
        .eq("workspace_id", workspaceId);
      if (paymentUpdateError) throw new Error(paymentUpdateError.message);
    }

    const { error: activateError } = await admin
      .from("workspace_storage_addons")
      .update({ status: "active", activated_at: now, updated_at: now })
      .eq("id", pending.id)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending");
    if (activateError) throw new Error(activateError.message);

    return { ok: true, active: true, addonCode: pending.addon_code as StorageAddonCode, paymentId: pending.payment_id as string | null };
  });
