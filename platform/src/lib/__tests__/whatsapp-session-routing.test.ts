import { describe, expect, it, vi } from "vitest";
import { preferredWhatsappSessionId, resolveLeadEvolutionSession } from "../whatsapp-session-routing.server";

function sbWithSessions(ids: string[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(async () => ({ data: ids.map((id) => ({ id })), error: null })),
  };
  return { from: vi.fn(() => chain) } as any;
}

describe("WhatsApp session routing", () => {
  it("reads persisted lead affinity", () => {
    expect(preferredWhatsappSessionId({ whatsapp_session_id: "session-a" })).toBe("session-a");
    expect(preferredWhatsappSessionId({})).toBeNull();
  });

  it("keeps the preferred connected session when multiple numbers exist", async () => {
    await expect(resolveLeadEvolutionSession(sbWithSessions(["session-b", "session-a"]), {
      workspaceId: "ws-a",
      preferredSessionId: "session-a",
    })).resolves.toBe("session-a");
  });

  it("only falls back when exactly one Evolution session is connected", async () => {
    await expect(resolveLeadEvolutionSession(sbWithSessions(["session-only"]), {
      workspaceId: "ws-a",
    })).resolves.toBe("session-only");
  });

  it("refuses an ambiguous multi-number send", async () => {
    await expect(resolveLeadEvolutionSession(sbWithSessions(["session-a", "session-b"]), {
      workspaceId: "ws-a",
    })).rejects.toThrow(/não está vinculada/i);
  });
});
