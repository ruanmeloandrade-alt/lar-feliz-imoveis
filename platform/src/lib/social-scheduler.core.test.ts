import { describe, expect, it } from "vitest";
import {
  allPublishChannelsSucceeded,
  clampSchedulerLimit,
  manualRetryPostPatch,
  nextRetryAt,
  normalizePublishError,
  operationalStatusLabel,
  pendingPublishChannels,
  resolveOperationalStatus,
  retryDelayMs,
  schedulerSecretMatches,
  shouldRetry,
  SOCIAL_PUBLISH_MAX_ATTEMPTS,
} from "./social-scheduler.core";

describe("social scheduler core", () => {
  it("uses a safe default batch size", () => {
    expect(clampSchedulerLimit(undefined)).toBe(25);
    expect(clampSchedulerLimit(Number.NaN)).toBe(25);
  });

  it("clamps scheduler batch size", () => {
    expect(clampSchedulerLimit(0)).toBe(1);
    expect(clampSchedulerLimit(7.9)).toBe(7);
    expect(clampSchedulerLimit(999)).toBe(100);
  });

  it("uses exponential retry backoff capped at one hour", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });

  it("calculates deterministic next retry time", () => {
    const now = new Date("2026-08-09T08:00:00.000Z");
    expect(nextRetryAt(now, 2)).toBe("2026-08-09T08:02:00.000Z");
  });

  it("retries only while attempts remain", () => {
    expect(shouldRetry({ attempts: 1 })).toBe(true);
    expect(shouldRetry({ attempts: SOCIAL_PUBLISH_MAX_ATTEMPTS })).toBe(false);
    expect(shouldRetry({ attempts: 2, maxAttempts: 2 })).toBe(false);
  });

  it("stops after the definitive failure limit", () => {
    expect(
      shouldRetry({
        attempts: SOCIAL_PUBLISH_MAX_ATTEMPTS,
        maxAttempts: SOCIAL_PUBLISH_MAX_ATTEMPTS,
      }),
    ).toBe(false);
  });

  it("normalizes and truncates provider errors", () => {
    expect(normalizePublishError(new Error("Meta\n  exploded"))).toBe("Meta exploded");
    expect(normalizePublishError("abcdef", 3)).toBe("abc");
  });

  it("rejects missing or wrong scheduler secrets", () => {
    expect(schedulerSecretMatches(undefined, "x")).toBe(false);
    expect(schedulerSecretMatches("secret", null)).toBe(false);
    expect(schedulerSecretMatches("secret", "wrong!")).toBe(false);
  });

  it("accepts an exact scheduler secret", () => {
    expect(schedulerSecretMatches("secret-value", "secret-value")).toBe(true);
  });

  it("keeps already published channels out of retry", () => {
    const channels = [
      { id: "fb", status: "published" },
      { id: "ig", status: "failed" },
      { id: "li", status: "pending" },
    ];
    expect(pendingPublishChannels(channels).map((channel) => channel.id)).toEqual(["ig", "li"]);
  });

  it("does not treat partial success as fully published", () => {
    expect(allPublishChannelsSucceeded([{ status: "published" }, { status: "failed" }])).toBe(
      false,
    );
    expect(allPublishChannelsSucceeded([{ status: "published" }, { status: "published" }])).toBe(
      true,
    );
  });

  it("maps retry waiting and lifecycle states to clear labels", () => {
    expect(
      resolveOperationalStatus({ status: "scheduled", nextAttemptAt: "2026-08-09T10:00:00Z" }),
    ).toBe("retry_wait");
    expect(resolveOperationalStatus({ status: "publishing" })).toBe("publishing");
    expect(resolveOperationalStatus({ status: "published" })).toBe("published");
    expect(resolveOperationalStatus({ status: "failed" })).toBe("failed");
    expect(operationalStatusLabel("retry_wait")).toBe("Aguardando nova tentativa");
  });

  it("resets publish telemetry for manual recovery", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    expect(manualRetryPostPatch(now)).toEqual({
      status: "publishing",
      publish_attempts: 1,
      last_publish_attempt_at: "2026-08-09T12:00:00.000Z",
      next_publish_attempt_at: null,
      last_error: null,
      failed_at: null,
      published_at: null,
    });
  });
});
