import { describe, expect, it } from "vitest";
import { isFreshInboundLeadMessage, leadActivitiesToAiHistory } from "../ai-agent-x1-guards.server";

describe("Agent IA X1 conversation guards", () => {
  it("builds chronological AI history from persisted lead activities", () => {
    const history = leadActivitiesToAiHistory([
      { type: "message_out", payload: { text: "Olá, como posso ajudar?" }, occurred_at: "2026-08-09T03:02:00Z" },
      { type: "note", payload: { text: "nota interna" }, occurred_at: "2026-08-09T03:01:30Z" },
      { type: "message_in", payload: { text: "Quero saber o preço" }, occurred_at: "2026-08-09T03:01:00Z" },
    ]);

    expect(history).toEqual([
      { role: "user", content: "Quero saber o preço" },
      { role: "assistant", content: "Olá, como posso ajudar?" },
    ]);
  });

  it("drops blank/non-message activities from AI history", () => {
    expect(leadActivitiesToAiHistory([
      { type: "message_in", payload: { text: "   " } },
      { type: "stage_change", payload: { text: "mudou etapa" } },
    ])).toEqual([]);
  });

  it("dispatches only fresh inbound provider messages", () => {
    expect(isFreshInboundLeadMessage({ fromMe: false, alreadyLogged: false })).toBe(true);
    expect(isFreshInboundLeadMessage({ fromMe: false, alreadyLogged: true })).toBe(false);
    expect(isFreshInboundLeadMessage({ fromMe: true, alreadyLogged: false })).toBe(false);
  });
});
