import { describe, expect, it } from "vitest";
import type { EffectivePermissions } from "@/lib/permissions-core";
import { buildHomeOnboardingAccess, buildHomeOnboardingPresentation } from "@/lib/home-onboarding";
import type { HomeOnboardingStep } from "@/lib/home.functions";

const FULL_ACCESS: EffectivePermissions = { role: "owner", full: true, permissions: null };

function memberPermissions(enabledModules: string[]): EffectivePermissions {
  return {
    role: "member",
    full: false,
    permissions: {
      modules: Object.fromEntries(enabledModules.map((id) => [id, { enabled: true }])),
    },
  };
}

const STEPS: HomeOnboardingStep[] = [
  { id: "whatsapp", state: "complete", detail: "ok" },
  { id: "meta", state: "pending", detail: "pending" },
  { id: "social", state: "complete", detail: "ok" },
  { id: "funil", state: "complete", detail: "ok" },
];

describe("buildHomeOnboardingAccess", () => {
  it("separates plan entitlement keys from activated UI module ids", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["crm_mkton", "social_media_ia", "trafego_ia"],
      activatedModuleIds: ["social-media", "gestor-trafego"],
      effectivePermissions: FULL_ACCESS,
    });

    expect([...access.eligibleIds].sort()).toEqual(["funil", "meta", "social", "whatsapp"]);
  });

  it("does not treat an entitlement key as an activated UI module id", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["social_media_ia"],
      activatedModuleIds: ["social_media_ia"],
      effectivePermissions: FULL_ACCESS,
    });

    expect([...access.eligibleIds]).toEqual([]);
  });

  it("keeps backward-compatible entitlement behavior when activation list is empty", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["crm_mkton", "social_media_ia"],
      activatedModuleIds: [],
      effectivePermissions: FULL_ACCESS,
    });

    expect([...access.eligibleIds].sort()).toEqual(["funil", "meta", "social", "whatsapp"]);
  });

  it("respects effective user permissions", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["crm_mkton", "social_media_ia", "trafego_ia"],
      activatedModuleIds: ["social-media", "gestor-trafego"],
      effectivePermissions: memberPermissions(["crm", "inbox"]),
    });

    expect([...access.eligibleIds].sort()).toEqual(["funil", "whatsapp"]);
  });

  it("does not recommend steps when access data failed", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["crm_mkton"],
      activatedModuleIds: [],
      effectivePermissions: FULL_ACCESS,
      error: true,
    });

    expect(access.ready).toBe(false);
    expect(access.error).toBe(true);
    expect(access.eligibleIds.size).toBe(0);
  });
});

describe("buildHomeOnboardingPresentation", () => {
  it("hides onboarding when every eligible step is complete", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["crm_mkton"],
      activatedModuleIds: [],
      effectivePermissions: FULL_ACCESS,
    });
    const presentation = buildHomeOnboardingPresentation(
      STEPS.map((step) => ({ ...step, state: "complete" })),
      access,
    );

    expect(presentation.complete).toBe(true);
    expect(presentation.show).toBe(false);
    expect(presentation.percentage).toBe(100);
  });

  it("shows the first pending eligible step", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["social_media_ia"],
      activatedModuleIds: ["social-media"],
      effectivePermissions: FULL_ACCESS,
    });
    const presentation = buildHomeOnboardingPresentation(STEPS, access);

    expect(presentation.show).toBe(true);
    expect(presentation.next?.id).toBe("meta");
    expect(presentation.steps.map((step) => step.id).sort()).toEqual(["meta", "social"]);
  });

  it("keeps onboarding visible when an eligible step is unavailable", () => {
    const access = buildHomeOnboardingAccess({
      entitledModules: ["crm_mkton"],
      activatedModuleIds: [],
      effectivePermissions: FULL_ACCESS,
    });
    const presentation = buildHomeOnboardingPresentation(
      STEPS.map((step) => step.id === "whatsapp" ? { ...step, state: "unavailable" } : step),
      access,
    );

    expect(presentation.show).toBe(true);
    expect(presentation.next).toBeNull();
    expect(presentation.unavailable.map((step) => step.id)).toEqual(["whatsapp"]);
  });
});
