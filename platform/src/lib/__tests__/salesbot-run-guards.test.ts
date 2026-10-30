import { describe, expect, it, vi } from "vitest";
import {
  findActiveSalesbotRunId,
  findPriorSingleEntrySalesbotRunId,
  isSingleEntryConversationTrigger,
  waitForDurableSalesbotTimer,
} from "../salesbot-run-guards.server";

describe("SalesBot run guards", () => {
  it("busca run ativa sempre dentro do workspace", async () => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
      in: (field: string, value: unknown) => { filters.push([field, value]); return query; },
      maybeSingle: async () => ({ data: { id: "run-1" }, error: null }),
    };
    const supabase = { from: () => query };

    await expect(findActiveSalesbotRunId(supabase as never, {
      workspaceId: "ws-1",
      salesbotId: "bot-1",
      leadId: "lead-1",
    })).resolves.toBe("run-1");

    expect(filters).toContainEqual(["workspace_id", "ws-1"]);
    expect(filters).toContainEqual(["salesbot_id", "bot-1"]);
    expect(filters).toContainEqual(["lead_id", "lead-1"]);
  });

  it("classifica somente gatilhos de entrada única", () => {
    expect(isSingleEntryConversationTrigger("primeira-mensagem")).toBe(true);
    expect(isSingleEntryConversationTrigger("qualquer-conversa")).toBe(true);
    expect(isSingleEntryConversationTrigger("mensagem-recebida")).toBe(false);
    expect(isSingleEntryConversationTrigger("movido-etapa")).toBe(false);
  });

  it("não recria bot de entrada única depois que já houve run concluída", async () => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
      in: (field: string, value: unknown) => { filters.push([field, value]); return query; },
      order: () => query,
      limit: async () => ({
        data: [
          { id: "run-finished", status: "finished", variables: { trigger: "primeira-mensagem" } },
        ],
        error: null,
      }),
    };
    const supabase = { from: () => query };

    await expect(findPriorSingleEntrySalesbotRunId(supabase as never, {
      workspaceId: "ws-1",
      salesbotId: "bot-1",
      leadId: "lead-1",
      trigger: "qualquer-conversa",
    })).resolves.toBe("run-finished");

    expect(filters).toContainEqual(["workspace_id", "ws-1"]);
    expect(filters).toContainEqual(["salesbot_id", "bot-1"]);
    expect(filters).toContainEqual(["lead_id", "lead-1"]);
  });

  it("não aplica trava permanente a gatilho de mensagem recorrente", async () => {
    const supabase = { from: vi.fn() };
    await expect(findPriorSingleEntrySalesbotRunId(supabase as never, {
      workspaceId: "ws-1",
      salesbotId: "bot-1",
      leadId: "lead-1",
      trigger: "mensagem-recebida",
    })).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("persiste timer curto antes do sleep e reivindica só a mesma run/workspace", async () => {
    const events: string[] = [];
    const filters: Array<[string, unknown]> = [];
    let updateCount = 0;
    const query: Record<string, unknown> = {};
    query.update = vi.fn(() => {
      updateCount += 1;
      events.push(updateCount === 1 ? "park" : "claim");
      return query;
    });
    query.eq = vi.fn((field: string, value: unknown) => { filters.push([field, value]); return query; });
    query.lte = vi.fn((field: string, value: unknown) => { filters.push([field, value]); return query; });
    query.select = vi.fn(async () => ({ data: [{ id: "run-1" }], error: null }));
    const supabase = { from: () => query };
    const sleeper = vi.fn(async () => { events.push("sleep"); });

    const ok = await waitForDurableSalesbotTimer(supabase as never, {
      runId: "run-1",
      workspaceId: "ws-1",
      currentBlockId: "block-wait",
      nextBlockId: "block-next",
      waitingUntil: new Date(Date.now() - 1).toISOString(),
      waitMs: 0,
      waitingVariables: { salesbot_waiting_branch: { timerNextBlockId: "block-next" } },
      resumeVariables: {},
    }, sleeper);

    expect(ok).toBe(true);
    expect(events).toEqual(["park", "sleep", "claim"]);
    expect(filters.filter(([field]) => field === "workspace_id")).toEqual([
      ["workspace_id", "ws-1"],
      ["workspace_id", "ws-1"],
    ]);
    expect(filters).toContainEqual(["status", "running"]);
    expect(filters).toContainEqual(["status", "waiting_timer"]);
    expect(filters.some(([field]) => field === "waiting_until")).toBe(true);
  });

  it("não continua inline quando o scheduler já conquistou o timer", async () => {
    let selectCount = 0;
    const query: Record<string, unknown> = {};
    query.update = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.lte = vi.fn(() => query);
    query.select = vi.fn(async () => {
      selectCount += 1;
      return selectCount === 1
        ? { data: [{ id: "run-1" }], error: null }
        : { data: [], error: null };
    });
    const supabase = { from: () => query };

    await expect(waitForDurableSalesbotTimer(supabase as never, {
      runId: "run-1",
      workspaceId: "ws-1",
      currentBlockId: "block-wait",
      nextBlockId: "block-next",
      waitingUntil: new Date(Date.now() - 1).toISOString(),
      waitMs: 0,
      waitingVariables: {},
      resumeVariables: {},
    }, async () => undefined)).resolves.toBe(false);
  });
});
