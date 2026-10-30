import { describe, it, expect, vi } from "vitest";
import { resumeRunsOnFormSubmission } from "../salesbot-runtime.server";

describe("Salesbot Multi-Pause Form Persistence", () => {
  const workspaceId = "ws-test";
  const leadId = "lead-test";
  const correctFormId = "form-correct";
  const wrongFormId = "form-wrong";

  it("should proof form resume behavior and isolation", async () => {
    const waitingRun = {
      id: "run-123",
      workspace_id: workspaceId,
      lead_id: leadId,
      current_block_id: "block-wait",
      variables: {
        salesbot_waiting_branch: {
          blockId: "block-wait",
          waitingEvents: [
            { type: "cronometro", nextBlockId: "block-timeout" },
            { type: "formulario-enviado", formularioId: correctFormId, nextBlockId: "block-form-success" },
          ],
        },
      },
    };

    const updates: unknown[] = [];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        const chain: any = {};
        chain.select = vi.fn().mockImplementation((cols: string) => {
          if (cols === "id, variables") {
            const listChain: any = {
              eq: vi.fn().mockImplementation(() => listChain),
              then: (cb: any) => cb({ data: mockSupabase._runs || [] }),
            };
            return listChain;
          }
          if (cols === "current_block_id" || cols === "next_block_id") {
            const singleChain: any = {
              eq: vi.fn().mockImplementation(() => singleChain),
              maybeSingle: vi.fn().mockResolvedValue({
                data: table === "salesbot_runs"
                  ? { current_block_id: "block-wait" }
                  : { next_block_id: "block-next" },
              }),
            };
            return singleChain;
          }
          return chain;
        });
        chain.update = vi.fn().mockImplementation((payload: unknown) => {
          updates.push(payload);
          const updateChain: any = {
            eq: vi.fn().mockImplementation(() => updateChain),
            select: vi.fn().mockResolvedValue({ data: [{ id: "run-123" }], error: null }),
          };
          return updateChain;
        });
        chain.eq = vi.fn().mockImplementation(() => chain);
        chain.then = (cb: any) => cb({ data: [] });
        return chain;
      }),
      _runs: [] as any[],
    } as any;

    mockSupabase._runs = [];
    await resumeRunsOnFormSubmission(mockSupabase, { workspaceId, leadId, formId: wrongFormId });
    expect(updates).toHaveLength(0);

    mockSupabase._runs = [waitingRun];
    await resumeRunsOnFormSubmission(mockSupabase, { workspaceId, leadId, formId: correctFormId });

    expect(updates).toContainEqual(expect.objectContaining({
      status: "running",
      current_block_id: "block-form-success",
    }));
  });
});
