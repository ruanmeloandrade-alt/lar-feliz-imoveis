import type { Period, PlanCode } from "./types";

type AnySb = { from: (table: string) => any };

const PLAN_CODES = new Set<PlanCode>(["starter", "professional", "business", "enterprise"]);
const PERIODS = new Set<Period>(["1m", "3m", "6m", "1y"]);

export type CheckoutPlanContext = {
  plan: { id: string; code: PlanCode; name: string };
  period: Period;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
};

function validFutureCoverage(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return value;
}

export async function resolveCheckoutPlanContext(
  sb: AnySb,
  workspaceId: string,
  input: { planCode: PlanCode; period: Period; extrasOnly: boolean },
): Promise<CheckoutPlanContext> {
  const { data: subscription, error: subscriptionError } = await sb
    .from("subscriptions")
    .select("id,status,plan_id,period,current_period_end")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (subscriptionError) throw new Error("Não foi possível validar a assinatura atual.");

  if (input.extrasOnly) {
    const currentPeriodEnd = subscription
      ? validFutureCoverage(subscription.current_period_end)
      : null;
    const hasPaidCoverage = Boolean(
      subscription
      && currentPeriodEnd
      && (subscription.status === "active" || subscription.status === "canceled"),
    );
    if (!subscription || !hasPaidCoverage) {
      throw new Error("Adicionais só podem ser comprados enquanto houver uma vigência paga válida.");
    }
    if (!subscription.plan_id || !PERIODS.has(subscription.period as Period)) {
      throw new Error("A assinatura com vigência paga não possui plano/período válidos para compra de adicionais.");
    }

    const { data: currentPlan, error: currentPlanError } = await sb
      .from("plans")
      .select("id,code,name")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    if (currentPlanError || !currentPlan?.id || !PLAN_CODES.has(currentPlan.code as PlanCode)) {
      throw new Error("Plano atual da assinatura não foi encontrado.");
    }

    return {
      plan: { id: String(currentPlan.id), code: currentPlan.code as PlanCode, name: String(currentPlan.name) },
      period: subscription.period as Period,
      subscriptionId: String(subscription.id),
      currentPeriodEnd,
    };
  }

  const { data: requestedPlan, error: planError } = await sb
    .from("plans")
    .select("id,code,name")
    .eq("code", input.planCode)
    .eq("is_active", true)
    .maybeSingle();
  if (planError || !requestedPlan?.id || !PLAN_CODES.has(requestedPlan.code as PlanCode)) {
    throw new Error("Plano não encontrado ou indisponível para novas assinaturas.");
  }

  return {
    plan: { id: String(requestedPlan.id), code: requestedPlan.code as PlanCode, name: String(requestedPlan.name) },
    period: input.period,
    subscriptionId: subscription?.id ? String(subscription.id) : null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
  };
}
