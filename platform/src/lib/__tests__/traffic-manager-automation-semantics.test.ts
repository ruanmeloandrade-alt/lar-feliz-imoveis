import { describe, expect, it } from "vitest";
import { classifyAutomationRun } from "../meta-automation-run-semantics";

describe("Gestor automation execution semantics", () => {
  it("separates a condition that did not match from an execution error", () => {
    const result = classifyAutomationRun({ matched: false, action_status: "ok", action_taken: null, error_message: null });
    expect(result.code).toBe("condition_not_met");
    expect(result.failed).toBe(false);
    expect(result.executed).toBe(false);
  });

  it("never counts unsupported actions as success", () => {
    const result = classifyAutomationRun({ matched: true, action_status: "ok", action_taken: "unsupported" });
    expect(result.code).toBe("unsupported_action");
    expect(result.failed).toBe(true);
    expect(result.executed).toBe(false);
  });

  it("does not count batch actions with zero targets as executed", () => {
    const result = classifyAutomationRun({ matched: true, action_status: "ok", action_taken: "pause_ad:0" });
    expect(result.code).toBe("no_target");
    expect(result.failed).toBe(false);
    expect(result.executed).toBe(false);
  });

  it("does not count action guards that skipped every action as execution", () => {
    const result = classifyAutomationRun({
      matched: true,
      action_status: "ok",
      action_taken: 'increase_budget (ignorada: condição "se" não atendida) + pause_campaign (ignorada: condição "se" não atendida)',
    });
    expect(result.code).toBe("action_not_needed");
    expect(result.executed).toBe(false);
  });

  it("classifies Forbidden/permission responses separately", () => {
    const result = classifyAutomationRun({
      matched: true,
      action_status: "error",
      error_message: "Meta POST 123 403: Forbidden - (#200) Permissions error",
    });
    expect(result.code).toBe("permission_error");
    expect(result.label).toContain("permissão");
  });

  it("classifies invalid access tokens as authentication errors", () => {
    const result = classifyAutomationRun({
      matched: true,
      action_status: "error",
      error_message: "Meta POST 123 401: Error validating access token (#190)",
    });
    expect(result.code).toBe("auth_error");
  });

  it("does not count legacy notification requests as proven success", () => {
    const result = classifyAutomationRun({ matched: true, action_status: "ok", action_taken: "notified" });
    expect(result.code).toBe("delivery_unverified");
    expect(result.severity).toBe("warning");
    expect(result.executed).toBe(false);
    expect(result.failed).toBe(false);
  });

  it("keeps real completed actions as success", () => {
    const result = classifyAutomationRun({ matched: true, action_status: "ok", action_taken: "paused_campaign" });
    expect(result.code).toBe("success");
    expect(result.executed).toBe(true);
    expect(result.failed).toBe(false);
  });
});
