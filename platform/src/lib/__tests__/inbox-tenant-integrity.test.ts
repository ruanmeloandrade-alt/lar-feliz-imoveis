import { describe, expect, it } from "vitest";
import fs from "node:fs";

const leads = fs.readFileSync(new URL("../leads.functions.ts", import.meta.url), "utf8");
const labels = fs.readFileSync(new URL("../inbox-labels.functions.ts", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../../routes/api/public/evolution/webhook.$secret.ts", import.meta.url), "utf8");

describe("Inbox tenant integrity", () => {
  it("scopes Inbox product hydration to the active workspace", () => {
    const start = leads.indexOf('.from("lead_products")');
    const block = leads.slice(start, start + 220);
    expect(block).toContain('.eq("workspace_id", wsId)');
  });

  it("scopes note and Meta lead updates to lead + workspace", () => {
    const note = leads.slice(leads.indexOf("export const addLeadNote"), leads.indexOf("export const sendLeadMessage"));
    expect(note).toContain('.eq("id", data.leadId)');
    expect(note).toContain('.eq("workspace_id", wsId)');
    expect(note).toContain("pauseLeadAiAgentInternal");

    const send = leads.slice(leads.indexOf("export const sendLeadMessage"), leads.indexOf("export const updateLead"));
    const meta = send.slice(0, send.indexOf("// WhatsApp Evolution"));
    expect(meta).toContain('.eq("id", data.leadId)');
    expect(meta).toContain('.eq("workspace_id", wsId)');
    expect(meta).toContain("pauseLeadAiAgentInternal");
  });

  it("scopes service-role transcription cache updates", () => {
    const transcribe = leads.slice(leads.indexOf("export const transcribeLeadAudio"));
    expect(transcribe).toContain('.eq("id", data.activityId)');
    expect(transcribe).toContain('.eq("workspace_id", wsId)');
    expect(transcribe).toContain('.eq("lead_id", data.leadId)');
  });

  it("validates label ownership before changing assignments", () => {
    const toggle = labels.slice(labels.indexOf("export const toggleLabelAssignment"));
    expect(toggle).toContain('.from("inbox_labels")');
    expect(toggle).toContain('.eq("id", data.labelId)');
    expect(toggle).toContain('.eq("workspace_id", wsId)');
    expect(toggle).toContain("Etiqueta não pertence a este workspace");
  });

  it("logs Evolution lead processing errors instead of swallowing them", () => {
    expect(webhook).toContain('[evolution-webhook] lead processing failed:');
    expect(webhook).not.toContain('} catch {\n              // não interrompe o webhook');
  });
});
