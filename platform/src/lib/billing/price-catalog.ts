import type { Period, PlanCode } from "./types";

/**
 * Tabela histórica imediatamente anterior ao reposicionamento de 2026-08-10.
 * Ela é mantida aqui para tornar auditável a proporção comercial usada no
 * recálculo dos ciclos maiores.
 */
export const PREVIOUS_PLAN_PRICES_CENTS: Record<PlanCode, Record<Period, number>> = {
  starter: { "1m": 39_700, "3m": 99_000, "6m": 198_500, "1y": 357_300 },
  professional: { "1m": 69_700, "3m": 174_000, "6m": 348_500, "1y": 627_300 },
  business: { "1m": 99_700, "3m": 249_000, "6m": 498_500, "1y": 897_300 },
  enterprise: { "1m": 149_700, "3m": 374_000, "6m": 748_500, "1y": 1_347_300 },
};

export const PLAN_PRICES_CENTS: Record<PlanCode, Record<Period, number>> = {
  starter: { "1m": 19_700, "3m": 49_126, "6m": 98_500, "1y": 177_300 },
  professional: { "1m": 39_800, "3m": 99_357, "6m": 199_000, "1y": 358_200 },
  business: { "1m": 78_200, "3m": 195_304, "6m": 391_000, "1y": 703_800 },
  enterprise: { "1m": 129_300, "3m": 323_034, "6m": 646_500, "1y": 1_163_700 },
};

export function proportionalPlanPriceCents(plan: PlanCode, period: Period): number {
  const previousMonthly = PREVIOUS_PLAN_PRICES_CENTS[plan]["1m"];
  const newMonthly = PLAN_PRICES_CENTS[plan]["1m"];
  const previousPeriod = PREVIOUS_PLAN_PRICES_CENTS[plan][period];
  return Math.round(previousPeriod * (newMonthly / previousMonthly));
}
