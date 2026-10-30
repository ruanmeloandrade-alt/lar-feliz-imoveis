import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";
import { EXTRA_EMPLOYEE_PRICE_CENTS, type PlanCode, type Period } from "./types";
import { extrasProrationMonths } from "./proration";
import { calculateCouponDiscountCents, couponEligibleSubtotalCents, type CouponKind } from "./coupon-pricing";
import { PLAN_PRICES_CENTS } from "./price-catalog";
import { resolveCheckoutPlanContext } from "./checkout-context.server";

const QuoteSchema = z.object({
  planCode: z.enum(["starter", "professional", "business", "enterprise"]),
  period: z.enum(["1m", "3m", "6m", "1y"]),
  extraEmployees: z.number().int().min(0).max(99),
  couponCode: z.string().trim().toUpperCase().max(40).optional().nullable(),
  // Compra avulsa de adicionais (usuário + WhatsApp) sem cobrar o plano de novo.
  extrasOnly: z.boolean().optional().default(false),
});

export const quoteCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuoteSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.extrasOnly && data.extraEmployees < 1) {
      throw new Error("Selecione pelo menos um adicional para esta compra.");
    }

    const sb = context.supabase as { from: (t: string) => any };
    const workspaceId = await resolveActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });
    if (!workspaceId) throw new Error("Workspace não encontrado");

    const checkoutContext = await resolveCheckoutPlanContext(sb, workspaceId, {
      planCode: data.planCode as PlanCode,
      period: data.period as Period,
      extrasOnly: data.extrasOnly,
    });
    const { plan } = checkoutContext;
    const effectivePeriod = checkoutContext.period;

    const canonicalPrice = PLAN_PRICES_CENTS[plan.code]?.[effectivePeriod];
    if (!canonicalPrice) throw new Error("Preço não encontrado para o período escolhido");

    const baseCents = data.extrasOnly ? 0 : canonicalPrice;
    const prorationMonths = extrasProrationMonths(
      effectivePeriod,
      data.extrasOnly ? checkoutContext.currentPeriodEnd : null,
    );
    const extrasCents = Math.round(data.extraEmployees * EXTRA_EMPLOYEE_PRICE_CENTS * prorationMonths);
    let discountCents = 0;
    let couponMessage: string | null = null;
    let couponId: string | null = null;

    if (data.couponCode) {
      const { data: coupon } = await sb
        .from("coupons")
        .select("*")
        .eq("code", data.couponCode)
        .maybeSingle();
      if (!coupon) couponMessage = "Cupom inválido.";
      else if (!coupon.is_active) couponMessage = "Cupom inativo.";
      else if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) couponMessage = "Cupom ainda não está válido.";
      else if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) couponMessage = "Cupom expirado.";
      else if (coupon.valid_plans?.length && !coupon.valid_plans.includes(plan.code))
        couponMessage = `Cupom não vale para o plano ${plan.name}.`;
      else if (coupon.valid_periods?.length && !coupon.valid_periods.includes(effectivePeriod))
        couponMessage = "Cupom não vale para esse período.";
      else {
        const eligibleSubtotal = couponEligibleSubtotalCents({
          baseCents,
          extrasCents,
          isSubscription: coupon.is_subscription,
          validModules: coupon.valid_modules,
        });
        if (eligibleSubtotal <= 0) couponMessage = "Cupom não vale para os itens deste checkout.";

        if (!couponMessage && coupon.max_uses) {
          const { count } = await sb
            .from("coupon_usages")
            .select("id", { count: "exact", head: true })
            .eq("coupon_id", coupon.id);
          if ((count ?? 0) >= coupon.max_uses) couponMessage = "Cupom esgotado.";
        }

        if (!couponMessage && coupon.max_uses_per_customer) {
          const { count } = await sb
            .from("coupon_usages")
            .select("id", { count: "exact", head: true })
            .eq("coupon_id", coupon.id)
            .eq("workspace_id", workspaceId);
          if ((count ?? 0) >= coupon.max_uses_per_customer) couponMessage = "Limite de uso deste cupom atingido para sua conta.";
        }

        if (!couponMessage) {
          discountCents = calculateCouponDiscountCents(eligibleSubtotal, coupon.kind as CouponKind, Number(coupon.value));
          if (discountCents <= 0) {
            couponMessage = "Cupom não reduz o valor deste checkout.";
            discountCents = 0;
          } else {
            couponId = coupon.id;
          }
        }
      }
    }

    const totalCents = Math.max(0, baseCents + extrasCents - discountCents);

    return {
      planId: plan.id,
      planCode: plan.code as PlanCode,
      planName: plan.name,
      period: effectivePeriod,
      baseCents,
      extraEmployees: data.extraEmployees,
      extrasCents,
      prorationMonths,
      discountCents,
      totalCents,
      couponId,
      couponCode: couponId ? data.couponCode : null,
      couponMessage,
    };
  });
