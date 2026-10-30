import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchLeadCreated = vi.fn();
const dispatchStageChange = vi.fn();
const dispatchTagAdded = vi.fn();
const enqueueLeadAutomationEvent = vi.fn();

vi.mock("../salesbot-runtime.server", () => ({
  dispatchLeadCreated,
  dispatchStageChange,
  dispatchTagAdded,
}));
vi.mock("../stage-automation-engine.server", () => ({
  enqueueLeadAutomationEvent,
}));

import {
  dispatchCrmFieldUpdated,
  dispatchCrmLeadCreated,
  dispatchCrmStageMoved,
  dispatchCrmTagAdded,
} from "../crm-event-dispatch.server";

describe("canonical CRM event dispatcher", () => {
  const admin = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchLeadCreated.mockResolvedValue(undefined);
    dispatchStageChange.mockResolvedValue(undefined);
    dispatchTagAdded.mockResolvedValue(undefined);
    enqueueLeadAutomationEvent.mockResolvedValue([]);
  });

  it("dispatches lead-created to SalesBot and CRM automation with the same tenant context", async () => {
    await dispatchCrmLeadCreated(admin, { workspaceId: "ws-a", leadId: "lead-a", pipelineId: "pipe-a", stageId: "stage-a" });
    expect(dispatchLeadCreated).toHaveBeenCalledWith(admin, { workspaceId: "ws-a", leadId: "lead-a" });
    expect(enqueueLeadAutomationEvent).toHaveBeenCalledWith(admin, expect.objectContaining({
      workspaceId: "ws-a", leadId: "lead-a", event: "created", pipelineId: "pipe-a", stageId: "stage-a",
    }));
  });

  it("dispatches stage movement with previous stage preserved", async () => {
    await dispatchCrmStageMoved(admin, {
      workspaceId: "ws-a", leadId: "lead-a", newPipelineId: "pipe-b", newStageId: "stage-b", fromStageId: "stage-a",
    });
    expect(dispatchStageChange).toHaveBeenCalledWith(admin, expect.objectContaining({ newStageId: "stage-b", newPipelineId: "pipe-b" }));
    expect(enqueueLeadAutomationEvent).toHaveBeenCalledWith(admin, expect.objectContaining({
      event: "moved", workspaceId: "ws-a", fromStageId: "stage-a", stageId: "stage-b",
    }));
  });

  it("forwards exact tags and exact field identity", async () => {
    await dispatchCrmTagAdded(admin, { workspaceId: "ws-a", leadId: "lead-a", tags: ["VIP"] });
    expect(dispatchTagAdded).toHaveBeenCalledWith(admin, { workspaceId: "ws-a", leadId: "lead-a", tags: ["VIP"] });
    expect(enqueueLeadAutomationEvent).toHaveBeenLastCalledWith(admin, expect.objectContaining({ event: "tag-added", tags: ["VIP"] }));

    await dispatchCrmFieldUpdated(admin, { workspaceId: "ws-a", leadId: "lead-a", fieldId: "field-a", fieldName: "Cidade" });
    expect(enqueueLeadAutomationEvent).toHaveBeenLastCalledWith(admin, expect.objectContaining({
      event: "field-updated", workspaceId: "ws-a", fieldId: "field-a", fieldName: "Cidade",
    }));
  });
});
