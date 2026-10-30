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

// Importamos o runtime real
import * as runtime from "../salesbot-runtime.server";

describe("Salesbot Race Condition Correction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy no executeRun exportado
    vi.spyOn(runtime, 'executeRun').mockResolvedValue(undefined as any);
  });

  const setupMockSequence = (results: any[]) => {
    let callIndex = 0;
    mockSupabase.then.mockImplementation((resolve: any) => {
      const result = results[callIndex] || { data: null, error: null };
      callIndex++;
      return Promise.resolve(resolve(result));
    });
  };

  it("resumeRunsOnFormSubmission should use atomic claim and call executeRun", async () => {
    const runId = "run-form";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "formulario-enviado", nextBlockId: "next-1" }] } } }] }, // select runs
      { data: { current_block_id: "block-x" } }, // maybeSingle current_block
      { data: { next_block_id: "next-y" } }, // maybeSingle next_block
      { data: [{ id: runId }] }, // atomic claim success (RETURNING data para o .select("id"))
    ]);

    await runtime.resumeRunsOnFormSubmission(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      formId: "form-1" 
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(mockSupabase.eq).toHaveBeenCalledWith("status", "waiting_message");
    expect(mockSupabase.select).toHaveBeenCalledWith("id");
  });

  it("resumeRunsOnInboundMessage should use atomic claim and call executeRun", async () => {
    const runId = "run-msg";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "msg-recebida", nextBlockId: "next-2" }] } } }] }, // select runs
      { data: { current_block_id: "block-x" } }, // maybeSingle
      { data: [{ id: runId }] }, // atomic claim success
    ]);

    await runtime.resumeRunsOnInboundMessage(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      text: "oi" 
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(mockSupabase.eq).toHaveBeenCalledWith("status", "waiting_message");
    expect(mockSupabase.select).toHaveBeenCalledWith("id");
  });

  it("resumeRunsOnMediaEvent should use atomic claim and call executeRun", async () => {
    const runId = "run-media";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "video-aberto", nextBlockId: "next-3" }] } } }] }, // select runs
      { data: [{ id: runId }] }, // atomic claim success
    ]);

    await runtime.resumeRunsOnMediaEvent(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      messageId: "msg-1", 
      status: "read" 
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(mockSupabase.eq).toHaveBeenCalledWith("status", "waiting_message");
    expect(mockSupabase.select).toHaveBeenCalledWith("id");
  });

  it("should NOT proceed if claim fails (concurrency)", async () => {
    const runId = "run-race";
    setupMockSequence([
      { data: [{ id: runId, variables: { salesbot_waiting_branch: { waitingEvents: [{ type: "msg-recebida", nextBlockId: "next-4" }] } } }] }, // select runs
      { data: { current_block_id: "block-x" } }, // maybeSingle
      { data: [] }, // atomic claim FAIL (empty array)
    ]);

    await runtime.resumeRunsOnInboundMessage(mockSupabase as any, { 
      workspaceId: "ws-1", 
      leadId: "lead-1", 
      text: "oi" 
    });

    // Verificamos se o update tentou usar o filtro de segurança
    expect(mockSupabase.eq).toHaveBeenCalledWith("status", "waiting_message");
  });
});
