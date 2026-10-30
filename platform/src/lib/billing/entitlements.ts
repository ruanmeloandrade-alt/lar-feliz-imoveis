import { PLAN_ENTITLEMENTS, planEntitlements } from "./plan-catalog";
import type { PlanCode } from "./types";

export const ALL_MODULES = Array.from(new Set(Object.values(PLAN_ENTITLEMENTS).flat())) as readonly string[];

/** Trial preserva a experiência ampla já existente, sem suporte prioritário. */
export const TRIAL_MODULES = ALL_MODULES.filter((module) => module !== "suporte_prioritario");

export type SellableModule = (typeof ALL_MODULES)[number];

export function isTrialActive(status: string | null | undefined, trialEndsAt: string | null | undefined, now = Date.now()) {
  if (status !== "trial_active" || !trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  return Number.isFinite(end) && end > now;
}

export function hasFuturePaidCoverage(currentPeriodEnd: string | null | undefined, now = Date.now()) {
  if (!currentPeriodEnd) return false;
  const end = new Date(currentPeriodEnd).getTime();
  return Number.isFinite(end) && end > now;
}

function sanitizedWorkspaceModules(value: unknown): SellableModule[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(ALL_MODULES);
  return value.filter((id): id is SellableModule => typeof id === "string" && known.has(id));
}

export function effectiveEntitledModules(options: {
  isSuperAdmin?: boolean;
  status?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  planCode?: PlanCode | string | null;
  workspaceModules?: unknown;
  now?: number;
}) {
  if (options.isSuperAdmin) return [...ALL_MODULES];
  if (isTrialActive(options.status, options.trialEndsAt, options.now)) return [...TRIAL_MODULES];

  const canceledWithPaidCoverage = options.status === "canceled"
    && hasFuturePaidCoverage(options.currentPeriodEnd, options.now);
  const paidCoverage = options.status === "active" || canceledWithPaidCoverage;

  // Assinatura ativa ou cancelada dentro da vigência já paga usa a matriz
  // canônica do plano. Cancelamento deixa de renovar, mas não apaga período pago.
  if (paidCoverage && options.planCode) {
    const canonical = planEntitlements(options.planCode);
    if (canonical.length > 0) return canonical;
  }

  // Compatibilidade somente para cobertura ainda válida ou status starter legado.
  // Nunca usar workspace_modules como passe livre para expired/trial_expired/
  // overdue/canceled fora da vigência, pois isso manteria acesso indefinidamente.
  if (paidCoverage || options.status === "starter") {
    return sanitizedWorkspaceModules(options.workspaceModules);
  }

  return [];
}

export function canManageWorkspaceBilling(role: string | null | undefined) {
  return role === "owner";
}
