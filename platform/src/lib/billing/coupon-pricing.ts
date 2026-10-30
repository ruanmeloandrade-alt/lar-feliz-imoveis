export type CouponKind = "percent" | "fixed" | "override";

export function calculateCouponDiscountCents(
  subtotalCents: number,
  kind: CouponKind,
  value: number,
): number {
  const subtotal = Math.max(0, Math.round(Number(subtotalCents) || 0));
  const numericValue = Math.max(0, Number(value) || 0);

  if (subtotal === 0 || numericValue === 0) return 0;

  if (kind === "percent") {
    return Math.min(subtotal, Math.round((subtotal * numericValue) / 100));
  }

  const configuredCents = Math.round(numericValue * 100);
  if (kind === "override") {
    const finalPriceCents = Math.min(subtotal, configuredCents);
    return subtotal - finalPriceCents;
  }

  return Math.min(subtotal, configuredCents);
}

export function couponEligibleSubtotalCents(options: {
  baseCents: number;
  extrasCents: number;
  isSubscription?: boolean | null;
  validModules?: unknown;
}): number {
  const baseCents = Math.max(0, Math.round(Number(options.baseCents) || 0));
  const extrasCents = Math.max(0, Math.round(Number(options.extrasCents) || 0));
  const subscriptionEligible = options.isSubscription !== false;
  const validModules = Array.isArray(options.validModules)
    ? options.validModules.filter((value): value is string => typeof value === "string")
    : [];
  const extrasEligible = validModules.length === 0 || validModules.includes("extra_employee");

  return (subscriptionEligible ? baseCents : 0) + (extrasEligible ? extrasCents : 0);
}
