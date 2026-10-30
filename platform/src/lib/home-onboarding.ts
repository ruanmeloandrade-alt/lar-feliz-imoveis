import { moduleEnabled, type EffectivePermissions } from "@/lib/permissions-core";
import type { HomeOnboardingStep } from "@/lib/home.functions";

export type HomeOnboardingStepId = HomeOnboardingStep["id"];

export type HomeOnboardingAccess = {
  ready: boolean;
  error: boolean;
  eligibleIds: Set<HomeOnboardingStepId>;
};

export type HomeOnboardingPresentation = {
  steps: HomeOnboardingStep[];
  completed: number;
  percentage: number;
  next: HomeOnboardingStep | null;
  unavailable: HomeOnboardingStep[];
  complete: boolean;
  show: boolean;
};

export function buildHomeOnboardingAccess(options: {
  entitledModules: readonly string[];
  activatedModuleIds: readonly string[];
  effectivePermissions: EffectivePermissions | null | undefined;
  loading?: boolean;
  error?: boolean;
}): HomeOnboardingAccess {
  if (options.loading) return { ready: false, error: false, eligibleIds: new Set() };
  if (options.error || !options.effectivePermissions) return { ready: false, error: true, eligibleIds: new Set() };

  const entitled = new Set(options.entitledModules);
  const activated = new Set(options.activatedModuleIds);
  const hasExplicitActivation = activated.size > 0;
  const permitted = (moduleId: string) => moduleEnabled(options.effectivePermissions!, moduleId);
  const activatedWhenExplicit = (moduleId: string) => !hasExplicitActivation || activated.has(moduleId);

  // Plan keys and UI activation IDs are intentionally different for some modules.
  // CRM is part of the core product and does not depend on activated_modules.
  const crm = entitled.has("crm_mkton");
  const social =
    entitled.has("social_media_ia") &&
    activatedWhenExplicit("social-media") &&
    permitted("social-media");
  const traffic =
    entitled.has("trafego_ia") &&
    activatedWhenExplicit("gestor-trafego") &&
    permitted("gestor-trafego");

  const eligibleIds = new Set<HomeOnboardingStepId>();
  if (crm && permitted("inbox")) eligibleIds.add("whatsapp");
  if (crm && permitted("crm")) eligibleIds.add("funil");
  if (social) eligibleIds.add("social");
  if (social || traffic) eligibleIds.add("meta");

  return { ready: true, error: false, eligibleIds };
}

export function buildHomeOnboardingPresentation(
  availableSteps: readonly HomeOnboardingStep[],
  access: HomeOnboardingAccess,
): HomeOnboardingPresentation {
  if (access.error) {
    return {
      steps: [],
      completed: 0,
      percentage: 0,
      next: null,
      unavailable: [],
      complete: false,
      show: true,
    };
  }

  if (!access.ready) {
    return {
      steps: [],
      completed: 0,
      percentage: 0,
      next: null,
      unavailable: [],
      complete: false,
      show: false,
    };
  }

  const steps = availableSteps.filter((step) => access.eligibleIds.has(step.id));
  const completed = steps.filter((step) => step.state === "complete").length;
  const percentage = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 100;
  const next = steps.find((step) => step.state === "pending") ?? null;
  const unavailable = steps.filter((step) => step.state === "unavailable");
  const complete = steps.length > 0 && completed === steps.length;
  const show = steps.length > 0 && !complete;

  return { steps, completed, percentage, next, unavailable, complete, show };
}
