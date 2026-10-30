import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks do Supabase para o runtime
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  then: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

// Mock executeRun in the module before importing
vi.mock("../salesbot-runtime.server", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return {
    ...mod,
    executeRun: vi.fn().mockResolvedValue(undefined),
  };
});

// Importamos o runtime real
import * as runtime from "../salesbot-runtime.server";

describe("ETAPA 02.0G - Media Pauses Logic Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMockSequence = (results: any[]) => {
    let callIndex = 0;
    mockSupabase.then.mockImplementation((resolve: any) => {
      const result = results[callIndex] || { data: null, error: null };
      callIndex++;
      return Promise.resolve(resolve(result));
    });
  };

  it("should resume audio-aberto on 'read' status", async () => {
    const runId = "run-audio-aberto";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "audio-aberto", nextBlockId: "next-1", messageId: "msg-1" }] } } }] }, // select runs
      { data: [{ id: runId }] }, // atomic claim success
    ]);

    await runtime.resumeRunsOnMediaEvent(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      messageId: "msg-1", 
      status: "read" 
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running", current_block_id: "next-1" }));
  });

  it("should resume audio-fechado on 'played' status", async () => {
    const runId = "run-audio-fechado";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "audio-fechado", nextBlockId: "next-2", messageId: "msg-2" }] } } }] }, // select runs
      { data: [{ id: runId }] }, // atomic claim success
    ]);

    await runtime.resumeRunsOnMediaEvent(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      messageId: "msg-2", 
      status: "played" 
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running", current_block_id: "next-2" }));
  });

  it("should resume video-aberto on 'read' status", async () => {
    const runId = "run-video-aberto";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "video-aberto", nextBlockId: "next-3", messageId: "msg-3" }] } } }] }, // select runs
      { data: [{ id: runId }] }, // atomic claim success
    ]);

    await runtime.resumeRunsOnMediaEvent(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      messageId: "msg-3", 
      status: "read" 
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running", current_block_id: "next-3" }));
  });

  it("should NOT resume video-fechado on 'played' status (Requirement)", async () => {
    const runId = "run-video-fechado";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "video-fechado", nextBlockId: "next-4", messageId: "msg-4" }] } } }] }, // select runs
    ]);

    await runtime.resumeRunsOnMediaEvent(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      messageId: "msg-4", 
      status: "played" 
    });

    // Should NOT have called update for status running
    const runningCalls = mockSupabase.update.mock.calls.filter((call: any) => call[0]?.status === "running");
    expect(runningCalls.length).toBe(0);
  });

  it("should NOT resume if messageId does not match", async () => {
    const runId = "run-msg-mismatch";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "audio-aberto", nextBlockId: "next-5", messageId: "msg-5" }] } } }] }, // select runs
    ]);

    await runtime.resumeRunsOnMediaEvent(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      messageId: "msg-DIFFERENT", 
      status: "read" 
    });

    const runningCalls = mockSupabase.update.mock.calls.filter((call: any) => call[0]?.status === "running");
    expect(runningCalls.length).toBe(0);
  });
});
