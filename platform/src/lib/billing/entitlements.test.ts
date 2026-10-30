import { describe, expect, it } from "vitest";
import { effectiveEntitledModules, hasFuturePaidCoverage, TRIAL_MODULES } from "./entitlements";
import { planEntitlements } from "./plan-catalog";

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const FUTURE = new Date(NOW + 86_400_000).toISOString();
const PAST = new Date(NOW - 86_400_000).toISOString();

const staleModules = ["dashboard", "tracking", "social_media_ia", "unknown_module"];

describe("subscription entitlements", () => {
  it("uses the canonical plan matrix for an active paid subscription", () => {
    expect(effectiveEntitledModules({
      status: "active",
      planCode: "professional",
      workspaceModules: staleModules,
      now: NOW,
    })).toEqual(planEntitlements("professional"));
  });

  it("keeps a live trial broad without trusting stale workspace modules", () => {
    expect(effectiveEntitledModules({
      status: "trial_active",
      trialEndsAt: FUTURE,
      workspaceModules: staleModules,
      now: NOW,
    })).toEqual(TRIAL_MODULES);
  });

  it("keeps canceled access only while the already-paid period is still valid", () => {
    expect(hasFuturePaidCoverage(FUTURE, NOW)).toBe(true);
    expect(effectiveEntitledModules({
      status: "canceled",
      currentPeriodEnd: FUTURE,
      planCode: "business",
      workspaceModules: staleModules,
      now: NOW,
    })).toEqual(planEntitlements("business"));
  });

  it("does not restore canceled access after the paid period ended", () => {
    expect(hasFuturePaidCoverage(PAST, NOW)).toBe(false);
    expect(effectiveEntitledModules({
      status: "canceled",
      currentPeriodEnd: PAST,
      planCode: "enterprise",
      workspaceModules: staleModules,
      now: NOW,
    })).toEqual([]);
  });

  it.each(["expired", "trial_expired", "overdue", "paused"])(
    "does not use workspace_modules as a bypass for terminal status %s",
    (status) => {
      expect(effectiveEntitledModules({
        status,
        planCode: "enterprise",
        workspaceModules: staleModules,
        now: NOW,
      })).toEqual([]);
    },
  );

  it("keeps the explicit legacy starter fallback bounded to known modules", () => {
    expect(effectiveEntitledModules({
      status: "starter",
      workspaceModules: staleModules,
      now: NOW,
    })).toEqual(["dashboard", "tracking", "social_media_ia"]);
  });
});
