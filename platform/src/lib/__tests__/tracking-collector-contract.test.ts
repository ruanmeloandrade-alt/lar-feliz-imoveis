import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const collector = readFileSync("src/routes/api/public/track/collect.ts", "utf8");
const dispatcher = readFileSync("src/lib/tracking-dispatcher.server.ts", "utf8");

describe("Tracking collector contract", () => {
  it("treats cadastro as an identity-producing business event", () => {
    expect(collector).toContain('["form_submit", "lead", "cadastro"].includes(eventName.toLowerCase())');
    expect(collector).toContain('explicitLeadId: pick("lead_id", "leadId")');
    expect(dispatcher).toContain('cadastro: "Lead"');
  });

  it("recovers a duplicate event row and retries only incomplete dispatch modules", () => {
    expect(collector).toContain('.eq("event_id", eventId)');
    expect(collector).toContain('throw new Error(`Tracking dispatch incomplete: ${dispatchResult.errors.join(", ")}`)');
    expect(dispatcher).toContain('async function alreadyCompleted');
    expect(dispatcher).toContain('.eq("status", "ok")');
    expect(dispatcher).toContain('return { errors }');
  });
});
