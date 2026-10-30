import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../leads.functions.ts", import.meta.url), "utf8");
const sendStart = source.indexOf("export const sendLeadMessage");
const sendEnd = source.indexOf("export const updateLead", sendStart);
const sendLeadSource = source.slice(sendStart, sendEnd);
const mediaStart = source.indexOf("export const sendLeadMedia");
const mediaEnd = source.indexOf("export const syncWhatsAppInbox", mediaStart);
const mediaSource = source.slice(mediaStart, mediaEnd);

describe("Inbox outbound transport contract", () => {
  it("never reports a failed WhatsApp text as an internal success", () => {
    expect(sendLeadSource).not.toContain('channel: "internal"');
    expect(sendLeadSource).not.toContain('let channel: "whatsapp_web" | "internal"');
    expect(sendLeadSource).toContain("if (!resp.ok)");
    expect(sendLeadSource).toContain("throw new Error(`Falha no envio pelo WhatsApp:");
  });

  it("only marks a text reply after Evolution accepted it", () => {
    const transportCheck = sendLeadSource.indexOf("if (!resp.ok)");
    const answeredUpdate = sendLeadSource.lastIndexOf('last_message_from: "us"');
    expect(transportCheck).toBeGreaterThan(-1);
    expect(answeredUpdate).toBeGreaterThan(transportCheck);
  });

  it("only marks a media reply after sendError was rejected", () => {
    const errorGuard = mediaSource.lastIndexOf("if (sendError) throw new Error(sendError)");
    const answeredUpdate = mediaSource.lastIndexOf('last_message_from: "us"');
    expect(errorGuard).toBeGreaterThan(-1);
    expect(answeredUpdate).toBeGreaterThan(errorGuard);
  });
});
