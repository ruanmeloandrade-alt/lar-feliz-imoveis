import { describe, expect, it } from "vitest";
import { shouldDispatchEvolutionInbound, withEvolutionDispatchStatus } from "../evolution-inbound-lifecycle";

describe("Evolution inbound lifecycle", () => {
  it("dispatches a fresh inbound", () => {
    expect(shouldDispatchEvolutionInbound({ fromMe: false, activityExists: false, dispatchStatus: null })).toBe(true);
  });
  it("retries a persisted inbound whose previous dispatch errored", () => {
    expect(shouldDispatchEvolutionInbound({ fromMe: false, activityExists: true, dispatchStatus: "error" })).toBe(true);
  });
  it("retries legacy persisted inbound without dispatch marker", () => {
    expect(shouldDispatchEvolutionInbound({ fromMe: false, activityExists: true, dispatchStatus: undefined })).toBe(true);
  });
  it("does not dispatch an inbound twice after successful completion", () => {
    expect(shouldDispatchEvolutionInbound({ fromMe: false, activityExists: true, dispatchStatus: "dispatched" })).toBe(false);
  });
  it("never dispatches outbound messages", () => {
    expect(shouldDispatchEvolutionInbound({ fromMe: true, activityExists: false, dispatchStatus: null })).toBe(false);
  });
  it("records and clears dispatch errors across retry lifecycle", () => {
    const failed = withEvolutionDispatchStatus({ text: "oi" }, "error", "boom");
    expect(failed).toMatchObject({ inbound_dispatch_status: "error", inbound_dispatch_error: "boom" });
    const done = withEvolutionDispatchStatus(failed, "dispatched");
    expect(done.inbound_dispatch_status).toBe("dispatched");
    expect(done).not.toHaveProperty("inbound_dispatch_error");
    expect(done).toHaveProperty("inbound_dispatched_at");
  });
});
