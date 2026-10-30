import type { JobResult } from "@/lib/stage-automation-engine.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySb = { from: (table: string) => any; rpc?: (...args: any[]) => any };

export async function dispatchCrmLeadCreated(
  admin: AnySb,
  input: {
    workspaceId: string;
    leadId: string;
    pipelineId?: string | null;
    stageId?: string | null;
    eventId?: string;
  },
): Promise<JobResult[]> {
  try {
    const { dispatchLeadCreated } = await import("@/lib/salesbot-runtime.server");
    await dispatchLeadCreated(admin as never, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    });
  } catch (error) {
    console.error("[crm-event] salesbot lead-created", error);
  }

  const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
  return enqueueLeadAutomationEvent(admin as never, {
    leadId: input.leadId,
    event: "created",
    eventId: input.eventId ?? "lead-created:" + input.leadId,
    workspaceId: input.workspaceId,
    pipelineId: input.pipelineId ?? null,
    stageId: input.stageId ?? null,
  });
}

export async function dispatchCrmStageMoved(
  admin: AnySb,
  input: {
    workspaceId: string;
    leadId: string;
    newStageId: string;
    newPipelineId: string;
    fromStageId?: string | null;
  },
): Promise<JobResult[]> {
  try {
    const { dispatchStageChange } = await import("@/lib/salesbot-runtime.server");
    await dispatchStageChange(admin as never, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      newStageId: input.newStageId,
      newPipelineId: input.newPipelineId,
    });
  } catch (error) {
    console.error("[crm-event] salesbot stage-change", error);
  }

  const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
  return enqueueLeadAutomationEvent(admin as never, {
    leadId: input.leadId,
    event: "moved",
    workspaceId: input.workspaceId,
    pipelineId: input.newPipelineId,
    stageId: input.newStageId,
    fromStageId: input.fromStageId ?? null,
  });
}

export async function dispatchCrmTagAdded(
  admin: AnySb,
  input: { workspaceId: string; leadId: string; tags: string[] },
): Promise<JobResult[]> {
  if (input.tags.length === 0) return [];
  try {
    const { dispatchTagAdded } = await import("@/lib/salesbot-runtime.server");
    await dispatchTagAdded(admin as never, input);
  } catch (error) {
    console.error("[crm-event] salesbot tag-added", error);
  }
  const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
  return enqueueLeadAutomationEvent(admin as never, {
    leadId: input.leadId,
    event: "tag-added",
    workspaceId: input.workspaceId,
    tags: input.tags,
  });
}

export async function dispatchCrmFieldUpdated(
  admin: AnySb,
  input: { workspaceId: string; leadId: string; fieldId?: string; fieldName?: string },
): Promise<JobResult[]> {
  const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
  return enqueueLeadAutomationEvent(admin as never, {
    leadId: input.leadId,
    event: "field-updated",
    workspaceId: input.workspaceId,
    fieldId: input.fieldId,
    fieldName: input.fieldName,
  });
}
