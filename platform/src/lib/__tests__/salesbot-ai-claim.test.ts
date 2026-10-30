import { describe, expect, it } from "vitest";
import { claimSalesbotAiTurn } from "../salesbot-ai-claim.server";

function mockSupabase(result: { data: Array<{ id: string }> | null; error: unknown }) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    update: () => query,
    eq: (field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    },
    select: async () => result,
  };
  return {
    filters,
    client: { from: () => query },
  };
}

describe("claimSalesbotAiTurn", () => {
  it("só conquista a run quando o update condicional retorna uma linha", async () => {
    const won = mockSupabase({ data: [{ id: "run-1" }], error: null });
    const lost = mockSupabase({ data: [], error: null });

    await expect(claimSalesbotAiTurn(won.client as never, { runId: "run-1", workspaceId: "ws-1" }))
      .resolves.toBe(true);
    await expect(claimSalesbotAiTurn(lost.client as never, { runId: "run-1", workspaceId: "ws-1" }))
      .resolves.toBe(false);

    expect(won.filters).toEqual([
      ["id", "run-1"],
      ["workspace_id", "ws-1"],
      ["status", "waiting_message"],
    ]);
  });

  it("não considera claim conquistado quando o banco retorna erro", async () => {
    const db = mockSupabase({ data: null, error: { message: "db error" } });
    await expect(claimSalesbotAiTurn(db.client as never, { runId: "run-1", workspaceId: "ws-1" }))
      .resolves.toBe(false);
  });
});
