import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";
import { type StripeEnv, createStripeClient, getConfiguredStripeEnvironment, getStripeErrorMessage } from "@/lib/stripe.server";
import { EXTRA_EMPLOYEE_PRICE_CENTS, PERIOD_MONTHS, type PaymentMethod, type Period, type PlanCode } from "./types";
import { extrasProrationMonths } from "./proration";
import { PLAN_PRICES_CENTS } from "./price-catalog";
import { calculateCouponDiscountCents, couponEligibleSubtotalCents, type CouponKind } from "./coupon-pricing";
import { activateSubscriptionForPayment } from "./payment-activation.server";
import { resolveCheckoutPlanContext, type CheckoutPlanContext } from "./checkout-context.server";

const CreateSchema = z.object({
  planCode: z.enum(["starter", "professional", "business", "enterprise"]),
  period: z.enum(["1m", "3m", "6m", "1y"]),
  extraEmployees: z.number().int().min(0).max(99),
  method: z.enum(["pix", "credit_card", "debit_card"]),
  couponCode: z.string().trim().toUpperCase().max(40).optional().nullable(),
  extrasOnly: z.boolean().optional().default(false),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
  payerName: z.string().trim().min(2).max(120).optional().nullable(),
  payerEmail: z.string().trim().email().max(160).optional().nullable(),
  payerTaxId: z.string().trim().max(24).optional().nullable(),
  payerPhone: z.string().trim().max(24).optional().nullable(),
});

const StatusSchema = z.object({ id: z.string().uuid() });
type JsonRecord = Record<string, unknown>;

type CreateCheckoutResult = {
  clientSecret?: string;
  paymentId?: string;
  totalCents?: number;
  notice?: string;
  error?: string;
  pix?: { copyPaste?: string; qrUrl?: string; chargeId?: string; expiresAt?: string };
};

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function errorMessage(prefix: string, error: unknown) {
  if (typeof error === "string") return `${prefix}: ${error}`;
  if (error && typeof error === "object") {
    const record = error as JsonRecord;
    const message = record.message ?? record.error ?? record.detail ?? record.description;
    if (typeof message === "string") return `${prefix}: ${message}`;
    try { return `${prefix}: ${JSON.stringify(record)}`; } catch { return prefix; }
  }
  return prefix;
}

function findDeepString(value: unknown, keys: string[]): string | undefined {
  const seen = new Set<unknown>();
  const queue: unknown[] = [value];
  const normalizedKeys = keys.map((k) => k.toLowerCase());
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) { queue.push(...current); continue; }
    for (const [key, raw] of Object.entries(current as JsonRecord)) {
      const normalized = key.toLowerCase().replace(/[_-]/g, "");
      const matches = normalizedKeys.some((wanted) => normalized === wanted.replace(/[_-]/g, "") || normalized.includes(wanted.replace(/[_-]/g, "")));
      if (matches && typeof raw === "string" && raw.trim()) return raw.trim();
      if (raw && typeof raw === "object") queue.push(raw);
    }
  }
  return undefined;
}

function extractCoraPix(data: unknown) {
  const record = (data ?? {}) as JsonRecord;
  const paymentOptions = (record.payment_options ?? {}) as JsonRecord;
  const pix = ((record.pix ?? paymentOptions.pix) ?? {}) as JsonRecord;
  const bankSlip = (paymentOptions.bank_slip ?? {}) as JsonRecord;
  const chargeId =
    (typeof record.id === "string" && record.id) ||
    (typeof record.invoice_id === "string" && record.invoice_id) ||
    (typeof record.code === "string" && record.code) ||
    findDeepString(data, ["invoice_id", "charge_id"]);
  const copyPaste =
    (typeof pix.emv === "string" && pix.emv) ||
    (typeof pix.copy_paste === "string" && pix.copy_paste) ||
    (typeof pix.copyPaste === "string" && pix.copyPaste) ||
    findDeepString(data, ["emv", "copy_paste", "copypaste", "brcode", "payload"]);
  const qrUrl =
    (typeof pix.url === "string" && pix.url) ||
    (typeof pix.qr_code_url === "string" && pix.qr_code_url) ||
    (typeof bankSlip.url === "string" && bankSlip.url) ||
    findDeepString(data, ["qr_code_url", "qrcode", "qr_url", "url"]);
  const expiresAt =
    (typeof record.expires_at === "string" && record.expires_at) ||
    (typeof record.due_at === "string" && record.due_at) ||
    findDeepString(data, ["expires_at", "expiration", "due_at"]);
  return { chargeId, copyPaste, qrUrl, expiresAt };
}

function normalizeCoraPaymentStatus(status: unknown) {
  const value = String(status ?? "").toUpperCase();
  if (["PAID", "SETTLED", "RECEIVED"].includes(value)) return "paid";
  if (["CANCELED", "CANCELLED"].includes(value)) return "canceled";
  if (["EXPIRED", "OVERDUE", "LATE"].includes(value)) return "expired";
  if (["FAILED", "REJECTED"].includes(value)) return "failed";
  return "pending";
}

async function resolveOrCreateCustomer(
  stripe: Awaited<ReturnType<typeof createStripeClient>>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Usuário inválido");

  if (options.userId) {
    const found = await stripe.customers.search({ query: `metadata['userId']:'${options.userId}'`, limit: 1 });
    if (found.data.length) return found.data[0].id;

    const created = await stripe.customers.create({
      ...(options.email && { email: options.email }),
      metadata: { userId: options.userId },
    });
    return created.id;
  }

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) return existing.data[0].id;
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
  });
  return created.id;
}

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }): Promise<CreateCheckoutResult> => {
    if (data.extrasOnly && data.extraEmployees < 1) return { error: "Selecione pelo menos um adicional para esta compra." };

    const sb = context.supabase as { from: (t: string) => any };
    const workspaceId = await resolveActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });
    if (!workspaceId) return { error: "Workspace não encontrado" };
    const { data: prof } = await sb.from("profiles").select("display_name").eq("id", context.userId).maybeSingle();

    let checkoutContext: CheckoutPlanContext;
    try {
      checkoutContext = await resolveCheckoutPlanContext(sb, workspaceId, {
        planCode: data.planCode as PlanCode,
        period: data.period as Period,
        extrasOnly: data.extrasOnly,
      });
    } catch (error) {
      return { error: (error as Error)?.message ?? "Não foi possível validar plano e assinatura." };
    }
    const { plan } = checkoutContext;
    const effectivePeriod = checkoutContext.period;
    const extrasCoverageEnd = data.extrasOnly ? checkoutContext.currentPeriodEnd : null;
    const basePaymentRaw = {
      extras_only: data.extrasOnly,
      extras_coverage_end: extrasCoverageEnd,
    };

    const canonicalPrice = PLAN_PRICES_CENTS[plan.code]?.[effectivePeriod];
    if (!canonicalPrice) return { error: "Preço não encontrado" };

    const baseCents = data.extrasOnly ? 0 : canonicalPrice;
    const prorationMonths = extrasProrationMonths(
      effectivePeriod,
      data.extrasOnly ? checkoutContext.currentPeriodEnd : null,
    );
    const extrasCents = Math.round(data.extraEmployees * EXTRA_EMPLOYEE_PRICE_CENTS * prorationMonths);
    let discountCents = 0;
    let couponId: string | null = null;

    if (data.couponCode) {
      const { data: coupon } = await sb.from("coupons").select("*").eq("code", data.couponCode).eq("is_active", true).maybeSingle();
      if (!coupon) return { error: "Cupom inválido ou inativo." };
      const now = new Date();
      if (coupon.starts_at && new Date(coupon.starts_at) > now) return { error: "Cupom ainda não está válido." };
      if (coupon.expires_at && new Date(coupon.expires_at) < now) return { error: "Cupom expirado." };
      if (coupon.valid_plans?.length && !coupon.valid_plans.includes(plan.code)) return { error: `Cupom válido apenas para: ${coupon.valid_plans.join(", ")}.` };
      if (coupon.valid_periods?.length && !coupon.valid_periods.includes(effectivePeriod)) return { error: `Cupom válido apenas para os períodos: ${coupon.valid_periods.join(", ")}.` };
      const eligibleSubtotal = couponEligibleSubtotalCents({
        baseCents,
        extrasCents,
        isSubscription: coupon.is_subscription,
        validModules: coupon.valid_modules,
      });
      if (eligibleSubtotal <= 0) return { error: "Cupom não vale para os itens deste checkout." };
      if (coupon.max_uses) {
        const { count } = await sb.from("coupon_usages").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id);
        if ((count ?? 0) >= coupon.max_uses) return { error: "Cupom esgotado." };
      }
      if (coupon.max_uses_per_customer) {
        const { count } = await sb.from("coupon_usages").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id).eq("workspace_id", workspaceId);
        if ((count ?? 0) >= coupon.max_uses_per_customer) return { error: "Limite de uso deste cupom atingido para sua conta." };
      }
      discountCents = calculateCouponDiscountCents(eligibleSubtotal, coupon.kind as CouponKind, Number(coupon.value));
      couponId = coupon.id;
    }

    const totalCents = Math.max(0, baseCents + extrasCents - discountCents);
    const isFullDiscount = totalCents === 0;
    const provider = isFullDiscount ? "internal" : data.method === "pix" ? "cora" : "stripe";
    const finalMethod: PaymentMethod = data.method === "debit_card" ? "credit_card" : (data.method as PaymentMethod);

    let stripeEnvironment: StripeEnv | null = null;
    if (provider === "stripe") {
      try {
        stripeEnvironment = getConfiguredStripeEnvironment();
      } catch (error) {
        return { error: (error as Error)?.message ?? "Ambiente Stripe não configurado." };
      }
      if (data.environment !== stripeEnvironment) return { error: "Ambiente de pagamento inválido para este deployment." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        workspace_id: workspaceId,
        subscription_id: checkoutContext.subscriptionId,
        plan_id: plan.id,
        period: effectivePeriod,
        provider,
        method: finalMethod,
        status: isFullDiscount ? "paid" : "pending",
        amount_cents: totalCents,
        discount_cents: discountCents,
        extra_employees: data.extraEmployees,
        coupon_id: couponId,
        paid_at: isFullDiscount ? new Date().toISOString() : null,
        raw_response: basePaymentRaw,
      })
      .select("id")
      .single();
    if (payErr) return { error: payErr.message };

    if (isFullDiscount) {
      const activationPayment = {
        id: payment.id,
        workspace_id: workspaceId,
        plan_id: plan.id,
        period: effectivePeriod,
        extra_employees: data.extraEmployees,
        coupon_id: couponId,
        raw_response: basePaymentRaw,
      } as JsonRecord;
      try {
        await activateSubscriptionForPayment(activationPayment, data.extrasOnly);
        return { paymentId: payment.id, totalCents: 0, notice: data.extrasOnly ? "Cupom aplicado, adicionais ativados sem cobrança." : "Cupom aplicado, assinatura ativada sem cobrança." };
      } catch (error) {
        return {
          paymentId: payment.id,
          totalCents: 0,
          notice: data.extrasOnly ? "Pagamento aprovado. Finalizando a ativação dos adicionais…" : "Pagamento aprovado. Finalizando a ativação do plano…",
          error: errorMessage("A ativação precisa ser reconciliada", error),
        };
      }
    }

    const email = typeof context.claims?.email === "string" ? context.claims.email : undefined;
    const description = data.extrasOnly
      ? `Vanessa Simoni · ${data.extraEmployees} adicional(is) · +1 usuário e +1 WhatsApp cada`
      : `Vanessa Simoni · ${plan.name} · ${PERIOD_MONTHS[effectivePeriod]} ${PERIOD_MONTHS[effectivePeriod] === 1 ? "mês" : "meses"}`;

    if (data.method === "pix") {
      const payerTaxId = digitsOnly(data.payerTaxId);
      if (![11, 14].includes(payerTaxId.length)) {
        await supabaseAdmin.from("payments")
          .update({ status: "failed", raw_response: { ...basePaymentRaw, error: "cpf_cnpj_required" } })
          .eq("id", payment.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "pending");
        return { error: "Para gerar Pix na Cora, informe um CPF ou CNPJ válido." };
      }
      try {
        const { callCora } = await import("@/lib/billing/cora.server");
        const cora = await callCora<JsonRecord>("create_pix", {
          amount_cents: totalCents,
          description,
          payer_name: data.payerName || prof?.display_name || "Cliente MKTOn",
          payer_tax_id: payerTaxId,
          payer_email: data.payerEmail || email,
          payer_phone: digitsOnly(data.payerPhone) || undefined,
          external_id: `mkton_${payment.id.replace(/-/g, "").slice(0, 24)}`,
          idempotency_key: payment.id,
          expires_in_minutes: 60 * 24,
        });
        if (!cora.ok) {
          const message = errorMessage("Falha ao gerar Pix na Cora", cora.error ?? cora.data);
          await supabaseAdmin.from("payments")
            .update({ status: "failed", raw_response: { ...basePaymentRaw, error: message, cora_status: cora.status } })
            .eq("id", payment.id)
            .eq("workspace_id", workspaceId)
            .eq("status", "pending");
          return { error: message, paymentId: payment.id, totalCents };
        }

        const pix = extractCoraPix(cora.data);
        if (!pix.chargeId) {
          const message = "A Cora confirmou a criação da cobrança, mas não retornou um identificador persistível.";
          await supabaseAdmin.from("payments")
            .update({
              raw_response: {
                ...basePaymentRaw,
                provider_response: cora.data,
                provider_binding_reconciliation_required: true,
                provider_binding_error: message,
              },
            })
            .eq("id", payment.id)
            .eq("workspace_id", workspaceId)
            .eq("status", "pending");
          return { error: message, paymentId: payment.id, totalCents };
        }

        const bindingPayload = {
          provider: "cora",
          provider_charge_id: pix.chargeId,
          pix_qr: pix.qrUrl,
          pix_copy_paste: pix.copyPaste,
          due_at: pix.expiresAt,
          raw_response: { ...basePaymentRaw, provider_response: cora.data },
        };
        const { data: boundPix, error: bindError } = await supabaseAdmin
          .from("payments")
          .update(bindingPayload)
          .eq("id", payment.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "pending")
          .select("id,provider_charge_id")
          .maybeSingle();

        if (bindError || !boundPix || boundPix.provider_charge_id !== pix.chargeId) {
          const { data: latest, error: latestError } = await supabaseAdmin
            .from("payments")
            .select("status,provider_charge_id")
            .eq("id", payment.id)
            .eq("workspace_id", workspaceId)
            .maybeSingle();

          if (!latestError && latest?.provider_charge_id === pix.chargeId) {
            return {
              paymentId: payment.id,
              totalCents,
              notice: pix.copyPaste || pix.qrUrl ? undefined : "A Cora criou a cobrança Pix, mas não retornou o QR Code direto. Use o link/ID exibido e consulte o status em instantes.",
              pix: { copyPaste: pix.copyPaste, qrUrl: pix.qrUrl, chargeId: pix.chargeId, expiresAt: pix.expiresAt },
            };
          }

          const message = bindError
            ? `A Cora criou a cobrança, mas o vínculo no ledger precisa ser reconciliado: ${bindError.message}`
            : "A Cora criou a cobrança, mas não foi possível confirmar o vínculo no ledger.";
          await supabaseAdmin.from("payments")
            .update({
              raw_response: {
                ...basePaymentRaw,
                provider_response: cora.data,
                provider_binding_reconciliation_required: true,
                provider_binding_error: message,
              },
            })
            .eq("id", payment.id)
            .eq("workspace_id", workspaceId)
            .eq("status", "pending")
            .is("provider_charge_id", null);
          return { error: message, paymentId: payment.id, totalCents };
        }

        return {
          paymentId: payment.id,
          totalCents,
          notice: pix.copyPaste || pix.qrUrl ? undefined : "A Cora criou a cobrança Pix, mas não retornou o QR Code direto. Use o link/ID exibido e consulte o status em instantes.",
          pix: { copyPaste: pix.copyPaste, qrUrl: pix.qrUrl, chargeId: pix.chargeId, expiresAt: pix.expiresAt },
        };
      } catch (error) {
        const message = errorMessage("Não foi possível confirmar a criação do Pix na Cora", error);
        await supabaseAdmin.from("payments")
          .update({
            raw_response: {
              ...basePaymentRaw,
              provider_binding_reconciliation_required: true,
              provider_binding_error: message,
            },
          })
          .eq("id", payment.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "pending");
        return { error: message, paymentId: payment.id, totalCents };
      }
    }

    let stripeProviderAttempted = false;
    try {
      if (!stripeEnvironment) throw new Error("Ambiente Stripe não resolvido.");
      const stripe = await createStripeClient(stripeEnvironment);
      const customerId = await resolveOrCreateCustomer(stripe, { email, userId: context.userId });
      const metadata = {
        userId: context.userId,
        workspaceId,
        paymentId: payment.id,
        planId: plan.id,
        planCode: String(plan.code),
        period: effectivePeriod,
        extraEmployees: String(data.extraEmployees),
        extrasOnly: data.extrasOnly ? "true" : "false",
      };
      const selectedStripeMethod = "card";
      const request = getRequest();
      if (!request) throw new Error("Não foi possível validar a origem do checkout.");
      const requestOrigin = new URL(request.url).origin;
      const requestedReturnUrl = new URL(data.returnUrl);
      if (requestedReturnUrl.origin !== requestOrigin) throw new Error("Origem de retorno do checkout inválida.");
      const verifiedReturnUrl = `${requestOrigin}/checkout-retorno?session_id={CHECKOUT_SESSION_ID}`;

      stripeProviderAttempted = true;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded",
        return_url: verifiedReturnUrl,
        customer: customerId,
        payment_method_types: [selectedStripeMethod],
        line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: totalCents, product_data: { name: data.extrasOnly ? "MKTOn · Adicionais (usuário + WhatsApp)" : `MKTOn · ${plan.name}`, description } } }],
        payment_intent_data: { description, metadata },
        metadata: { ...metadata, managed_payments: "false" },
      }, { idempotencyKey: payment.id });

      const { data: boundStripe, error: bindError } = await supabaseAdmin
        .from("payments")
        .update({ method: finalMethod, provider_charge_id: session.id, raw_response: { ...basePaymentRaw, session_id: session.id, stripe_method: selectedStripeMethod, stripe_environment: stripeEnvironment } })
        .eq("id", payment.id)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .select("provider_charge_id")
        .maybeSingle();

      if (bindError || !boundStripe || boundStripe.provider_charge_id !== session.id) {
        const { data: latest, error: latestError } = await supabaseAdmin
          .from("payments")
          .select("status,provider_charge_id")
          .eq("id", payment.id)
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        if (!latestError && latest?.provider_charge_id === session.id) {
          return { clientSecret: session.client_secret ?? undefined, paymentId: payment.id, totalCents };
        }

        const message = bindError
          ? `A Stripe criou a sessão, mas o vínculo no ledger precisa ser reconciliado: ${bindError.message}`
          : "A Stripe criou a sessão, mas não foi possível confirmar o vínculo no ledger.";
        await supabaseAdmin.from("payments")
          .update({
            raw_response: {
              ...basePaymentRaw,
              session_id: session.id,
              stripe_method: selectedStripeMethod,
              stripe_environment: stripeEnvironment,
              provider_binding_reconciliation_required: true,
              provider_binding_error: message,
            },
          })
          .eq("id", payment.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "pending")
          .is("provider_charge_id", null);
        return { error: message, paymentId: payment.id, totalCents };
      }

      return { clientSecret: session.client_secret ?? undefined, paymentId: payment.id, totalCents };
    } catch (error) {
      const message = getStripeErrorMessage(error);
      if (stripeProviderAttempted) {
        await supabaseAdmin.from("payments")
          .update({
            raw_response: {
              ...basePaymentRaw,
              stripe_environment: stripeEnvironment,
              provider_binding_reconciliation_required: true,
              provider_binding_error: message,
            },
          })
          .eq("id", payment.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "pending");
        return { error: message, paymentId: payment.id, totalCents };
      }

      await supabaseAdmin.from("payments")
        .update({ status: "failed", raw_response: { ...basePaymentRaw, error: message } })
        .eq("id", payment.id)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending");
      return { error: message, paymentId: payment.id, totalCents };
    }
  });

export const getPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as { from: (t: string) => any };
    const workspaceId = await resolveActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });
    if (!workspaceId) throw new Error("Workspace não encontrado");

    let { data: p } = await sb
      .from("payments")
      .select("*")
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!p) throw new Error("Pagamento não encontrado");

    if (p.provider === "cora" && p.status === "pending" && p.provider_charge_id) {
      const { callCora } = await import("@/lib/billing/cora.server");
      const verify = await callCora<JsonRecord>("get_invoice_status", { id: p.provider_charge_id });
      if (verify.ok) {
        const newStatus = normalizeCoraPaymentStatus((verify.data as JsonRecord | undefined)?.status);
        const pix = extractCoraPix(verify.data);
        const paidAt = newStatus === "paid" ? new Date().toISOString() : p.paid_at;
        const previousRaw = (p.raw_response ?? {}) as JsonRecord;
        const preservedRaw = {
          extras_only: Boolean(previousRaw.extras_only),
          extras_coverage_end: typeof previousRaw.extras_coverage_end === "string" ? previousRaw.extras_coverage_end : null,
          provider_response: verify.data,
        };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: updatedPayment, error: updateError } = await supabaseAdmin
          .from("payments")
          .update({ status: newStatus, paid_at: paidAt, pix_qr: pix.qrUrl ?? p.pix_qr, pix_copy_paste: pix.copyPaste ?? p.pix_copy_paste, due_at: pix.expiresAt ?? p.due_at, raw_response: preservedRaw })
          .eq("id", p.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "pending")
          .select("*")
          .maybeSingle();
        if (updateError) throw new Error(updateError.message);
        if (updatedPayment) {
          p = updatedPayment;
        } else {
          const { data: latest, error: latestError } = await supabaseAdmin
            .from("payments")
            .select("*")
            .eq("id", p.id)
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          if (latestError) throw new Error(latestError.message);
          if (!latest) throw new Error("Pagamento não encontrado após reconciliação concorrente.");
          p = latest;
        }
      }
    }

    let activationPending = false;
    if (p.status === "paid") {
      const raw = (p.raw_response ?? {}) as JsonRecord;
      try {
        await activateSubscriptionForPayment(p as JsonRecord, Boolean(raw.extras_only));
      } catch {
        activationPending = true;
      }
    }

    return {
      id: p.id,
      status: p.status,
      method: p.method,
      amount_cents: p.amount_cents,
      provider_charge_id: p.provider_charge_id,
      provider: p.provider,
      pix_qr: p.pix_qr,
      pix_copy_paste: p.pix_copy_paste,
      due_at: p.due_at,
      paid_at: p.paid_at,
      activation_pending: activationPending,
    };
  });
