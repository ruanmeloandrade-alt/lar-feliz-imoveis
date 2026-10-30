import { describe, it, expect, vi } from "vitest";
import { tickWaitingTimers } from "../salesbot-runtime.server";

describe("Salesbot Scheduler and Resume Infrastructure", () => {
  const workspaceId = "ws-tick";
  const leadId = "lead-tick";
  const botId = "bot-tick";

  const createMockSupabase = (runs: any[] = []) => {
    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockIn = vi.fn().mockReturnThis();
    const mockLte = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockImplementation(() => ({
      then: (cb: any) => cb({ data: runs, error: null })
    }));

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "salesbot_runs") {
          return {
            update: mockUpdate,
            in: mockIn,
            lte: mockLte,
            select: mockSelect,
            limit: mockLimit,
            eq: mockEq,
            maybeSingle: vi.fn().mockResolvedValue({ data: { current_block_id: "block-wait" } }),
            then: (cb: any) => cb({ data: runs, error: null })
          };
        }
        if (table === "salesbot_blocks") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { next_block_id: "next-from-block" } })
          };
        }
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "l1", workspace_id: "w1" } })
          };
        }
        if (table === "workspaces" || table === "salesbots") {
           return {
             select: vi.fn().mockReturnThis(),
             eq: vi.fn().mockReturnThis(),
             maybeSingle: vi.fn().mockResolvedValue({ data: {} })
           };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          insert: vi.fn().mockResolvedValue({ error: null })
        };
      })
    } as any;

    return { mockSupabase, mockUpdate, mockIn, mockLte, mockLimit };
  };

  it("should process due runs using atomic claim (duplicate protection)", async () => {
    const dueRun = {
      id: "run-due",
      workspace_id: workspaceId,
      salesbot_id: botId,
      lead_id: leadId,
      status: "waiting_timer",
      variables: {
        salesbot_waiting_branch: { timerNextBlockId: "next-1" }
      }
    };

    const { mockSupabase, mockUpdate, mockIn, mockLte } = createMockSupabase([dueRun]);
    const result = await tickWaitingTimers(mockSupabase);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(mockIn).toHaveBeenCalledWith("status", ["waiting_timer", "waiting_message"]);
    expect(mockLte).toHaveBeenCalled();
    expect(result.processed).toBe(1);
  });

  it("should handle delayed start (current_block_id = null)", async () => {
    const delayedRun = {
      id: "run-delayed",
      variables: {},
      lead_id: leadId,
      workspace_id: workspaceId,
      current_block_id: null
    };

    const { mockSupabase, mockUpdate } = createMockSupabase([delayedRun]);
    
    mockSupabase.from("salesbot_runs").limit = vi.fn().mockImplementation(() => ({
      then: (cb: any) => cb({ data: [delayedRun], error: null })
    }));

    await tickWaitingTimers(mockSupabase);

    const cleanUpdate = mockUpdate.mock.calls.find(c => c[0] && c[0].waiting_until === null && "current_block_id" in c[0]);
    expect(cleanUpdate).toBeDefined();
    if (cleanUpdate) {
      expect(cleanUpdate[0].current_block_id).toBeNull();
    }
  });

  it("should invalidate other waiting events when timeout wins in waiting_message", async () => {
    const timeoutRun = {
      id: "run-timeout",
      variables: {
        salesbot_waiting_branch: {
          timerNextBlockId: "timer-path",
          waitingEvents: [{ type: "msg-recebida" }]
        }
      },
      lead_id: leadId,
      workspace_id: workspaceId
    };

    const { mockSupabase, mockUpdate } = createMockSupabase([timeoutRun]);
    await tickWaitingTimers(mockSupabase);

    const cleanUpdate = mockUpdate.mock.calls.find(c => c[0] && c[0].variables && c[0].variables.salesbot_waiting_branch === undefined);
    expect(cleanUpdate).toBeDefined();
    if (cleanUpdate) {
      expect(cleanUpdate[0].current_block_id).toBe("timer-path");
    }
  });

  it("should process at most 100 runs per tick", async () => {
    const manyRuns = Array(100).fill(null).map((_, i) => ({ 
      id: `run-${i}`, lead_id: "l", workspace_id: "w" 
    }));
    const { mockSupabase, mockLimit } = createMockSupabase(manyRuns);
    const result = await tickWaitingTimers(mockSupabase);
    expect(mockLimit).toHaveBeenCalledWith(100);
    expect(result.processed).toBe(100);
  });

  it("should update status to error if resume fails", async () => {
    const failingRun = { id: "run-fail", variables: {}, lead_id: "l1", workspace_id: "w1" };
    // Create separate mock calls tracker to avoid confusion with createMockSupabase's default
    const capturedUpdates: any[] = [];
    
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "salesbot_runs") {
          return {
            update: vi.fn().mockImplementation((payload) => {
              capturedUpdates.push(payload);
              const updateIdx = capturedUpdates.length;
              
              if (updateIdx === 1) { // Claim
                return { 
                  in: vi.fn().mockReturnThis(), 
                  lte: vi.fn().mockReturnThis(), 
                  select: vi.fn().mockReturnThis(), 
                  limit: vi.fn().mockImplementation(() => ({
                    then: (cb: any) => cb({ data: [failingRun], error: null })
                  }))
                };
              }

              if (payload && payload.waiting_until === null) { // Cleanup/Resume
                throw new Error("Resume Failed");
              }

              return { 
                eq: vi.fn().mockReturnThis(), 
                then: (cb: any) => cb({ data: [], error: null })
              };
            }),
            eq: vi.fn().mockReturnThis()
          };
        }
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "l1", workspace_id: "w1" } })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: {} })
        };
      })
    } as any;

    await tickWaitingTimers(mockSupabase);

    const errorCall = capturedUpdates.find(p => p.status === "error");
    expect(errorCall).toBeDefined();
    if (errorCall) {
      expect(errorCall.last_error).toContain("Resume Failed");
    }
  });
});