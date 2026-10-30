import { describe, it, expect } from "vitest";
import { createRootContext, createChildContext, MAX_EXECUTION_DEPTH } from "../execution-context";
import { startSalesbotRun } from "../salesbot-runtime.server";

function makeSelectChain() {
  const chain: any = {
    eq: () => chain,
    in: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return chain;
}

// Mock Supabase admin compatível com os filtros de isolamento atuais.
const mockSupabase = {
  from: (table: string) => ({
    select: () => makeSelectChain(),
    insert: (row: any) => ({
      select: () => ({
        single: async () => ({ data: row, error: null }),
      }),
    }),
    update: () => {
      const chain: any = {
        eq: () => chain,
        select: async () => ({ data: [{ id: "run" }], error: null }),
      };
      return chain;
    },
  }),
} as any;

describe("Salesbot Execution Lineage Integration", () => {
  const workspaceId = "ws-1";
  const leadId = "lead-1";
  const salesbotId = "bot-1";

  it("helper semantics: createChildContext uses parentRunId correctly", () => {
    const root = createRootContext("run-root", "salesbot", "bot-1");
    const child = createChildContext(root, "run-root", "salesbot", "bot-2");

    expect(child.rootRunId).toBe("run-root");
    expect(child.parentRunId).toBe("run-root");
    expect(child.depth).toBe(1);
  });

  it("root run persistence: starts with depth 0 and parent null", async () => {
    let capturedRow: any = null;
    const customSupabase = {
      ...mockSupabase,
      from: (table: string) => ({
        ...mockSupabase.from(table),
        insert: (row: any) => {
          if (table === "salesbot_runs") capturedRow = row;
          return mockSupabase.from(table).insert(row);
        },
      }),
    };

    await startSalesbotRun(customSupabase, { workspaceId, salesbotId, leadId });

    expect(capturedRow).toBeDefined();
    const exec = capturedRow.variables._execution;
    expect(exec.rootRunId).toBe(capturedRow.id);
    expect(exec.parentRunId).toBeNull();
    expect(exec.depth).toBe(0);
    expect(exec.originType).toBe("salesbot");
    expect(exec.originId).toBe(salesbotId);
  });

  it("child run persistence: correctly inherits root and increments depth", async () => {
    const parentRunId = "run-parent";
    const rootRunId = "run-root";
    const parentContext = {
      rootRunId,
      parentRunId: "run-grandparent",
      depth: 1,
      originType: "salesbot",
      originId: "bot-old",
    };

    let capturedRow: any = null;
    const customSupabase = {
      ...mockSupabase,
      from: (table: string) => ({
        ...mockSupabase.from(table),
        insert: (row: any) => {
          if (table === "salesbot_runs") capturedRow = row;
          return mockSupabase.from(table).insert(row);
        },
      }),
    };

    const nextExec = createChildContext(parentContext, parentRunId, "salesbot", "bot-new");

    await startSalesbotRun(customSupabase, {
      workspaceId,
      salesbotId: "bot-new",
      leadId,
      initialVariables: { _execution: nextExec },
    });

    expect(capturedRow).toBeDefined();
    const exec = capturedRow.variables._execution;
    expect(exec.rootRunId).toBe(rootRunId);
    expect(exec.parentRunId).toBe(parentRunId);
    expect(exec.depth).toBe(2);
  });

  it("max depth protection: throws when depth limit exceeded", () => {
    let context = createRootContext("r", "s", "b");
    for (let i = 0; i < MAX_EXECUTION_DEPTH; i++) {
      context = createChildContext(context, `id-${i}`, "salesbot", `bot-${i}`);
    }

    expect(context.depth).toBe(MAX_EXECUTION_DEPTH);
    expect(() => {
      createChildContext(context, "id-next", "salesbot", "bot-next");
    }).toThrow(`Maximum execution depth of ${MAX_EXECUTION_DEPTH} reached`);
  });

  it("delayed root run: starts with depth 0 and parent null", async () => {
    let capturedRow: any = null;
    const customSupabase = {
      ...mockSupabase,
      from: (table: string) => ({
        ...mockSupabase.from(table),
        insert: (row: any) => {
          if (table === "salesbot_runs") capturedRow = row;
          return mockSupabase.from(table).insert(row);
        },
      }),
    };

    await startSalesbotRun(customSupabase, {
      workspaceId,
      salesbotId,
      leadId,
      delaySeconds: 30,
    });

    expect(capturedRow).toBeDefined();
    expect(capturedRow.status).toBe("waiting_timer");
    const exec = capturedRow.variables._execution;
    expect(exec.rootRunId).toBe(capturedRow.id);
    expect(exec.parentRunId).toBeNull();
    expect(exec.depth).toBe(0);
    expect(exec.originType).toBe("salesbot");
    expect(exec.originId).toBe(salesbotId);
  });

  it("delayed child run: preserves the provided _execution exactly", async () => {
    const parentRunId = "run-parent";
    const rootRunId = "run-root";
    const parentContext = {
      rootRunId,
      parentRunId: "run-grandparent",
      depth: 1,
      originType: "salesbot",
      originId: "bot-old",
    };

    const nextExec = createChildContext(parentContext, parentRunId, "salesbot", "bot-new");

    let capturedRow: any = null;
    const customSupabase = {
      ...mockSupabase,
      from: (table: string) => ({
        ...mockSupabase.from(table),
        insert: (row: any) => {
          if (table === "salesbot_runs") capturedRow = row;
          return mockSupabase.from(table).insert(row);
        },
      }),
    };

    await startSalesbotRun(customSupabase, {
      workspaceId,
      salesbotId: "bot-new",
      leadId,
      delaySeconds: 60,
      initialVariables: { _execution: nextExec },
    });

    expect(capturedRow).toBeDefined();
    expect(capturedRow.status).toBe("waiting_timer");
    const exec = capturedRow.variables._execution;
    expect(exec.rootRunId).toBe(rootRunId);
    expect(exec.parentRunId).toBe(parentRunId);
    expect(exec.depth).toBe(2);
    expect(capturedRow.id).not.toBe(parentRunId);
    expect(capturedRow.id).not.toBe(rootRunId);
  });
});
