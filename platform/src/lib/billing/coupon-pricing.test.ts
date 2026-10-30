import { describe, expect, it } from "vitest";
import { calculateCouponDiscountCents, couponEligibleSubtotalCents } from "./coupon-pricing";

describe("calculateCouponDiscountCents", () => {
  it("trata override como preço final e não como desconto fixo", () => {
    expect(calculateCouponDiscountCents(10_000, "override", 20)).toBe(8_000);
  });

  it("não aumenta o preço quando override é maior que o subtotal", () => {
    expect(calculateCouponDiscountCents(10_000, "override", 150)).toBe(0);
  });

  it("mantém desconto fixo com teto no subtotal", () => {
    expect(calculateCouponDiscountCents(10_000, "fixed", 20)).toBe(2_000);
    expect(calculateCouponDiscountCents(10_000, "fixed", 200)).toBe(10_000);
  });

  it("limita percentual a cem por cento do subtotal", () => {
    expect(calculateCouponDiscountCents(10_000, "percent", 25)).toBe(2_500);
    expect(calculateCouponDiscountCents(10_000, "percent", 250)).toBe(10_000);
  });
});

describe("couponEligibleSubtotalCents", () => {
  it("aplica o cupom somente à assinatura quando extra_employee não está autorizado", () => {
    expect(couponEligibleSubtotalCents({
      baseCents: 10_000,
      extrasCents: 3_300,
      isSubscription: true,
      validModules: ["crm_mkton"],
    })).toBe(10_000);
  });

  it("aplica o cupom somente aos adicionais quando assinatura não está autorizada", () => {
    expect(couponEligibleSubtotalCents({
      baseCents: 10_000,
      extrasCents: 3_300,
      isSubscription: false,
      validModules: ["extra_employee"],
    })).toBe(3_300);
  });

  it("considera módulos vazios como escopo amplo para adicionais", () => {
    expect(couponEligibleSubtotalCents({
      baseCents: 0,
      extrasCents: 6_600,
      isSubscription: false,
      validModules: [],
    })).toBe(6_600);
  });

  it("retorna zero quando nenhum item do checkout é elegível", () => {
    expect(couponEligibleSubtotalCents({
      baseCents: 10_000,
      extrasCents: 3_300,
      isSubscription: false,
      validModules: ["crm_mkton"],
    })).toBe(0);
  });
});
