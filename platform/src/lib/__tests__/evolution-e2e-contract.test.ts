import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const webhook = readFileSync("src/routes/api/public/evolution/webhook.$secret.ts", "utf8");
const leads = readFileSync("src/lib/leads.functions.legacy.ts", "utf8");

describe("Evolution lead E2E contract", () => {
  it("dispatches the canonical CRM lead-created event after a new WhatsApp lead is created", () => {
    expect(webhook).toContain('const { dispatchCrmLeadCreated } = await import("@/lib/crm-event-dispatch.server")');
    expect(webhook).toContain("await dispatchCrmLeadCreated(supabaseAdmin as never");
    expect(webhook).toContain("workspaceId: sess.workspace_id");
    expect(webhook).toContain("pipelineId,");
    expect(webhook).toContain("stageId,");
  });

  it("does not write the generated phone_normalized column when creating a WhatsApp lead", () => {
    const createLeadStart = webhook.indexOf("const { data: created, error: createErr }");
    expect(createLeadStart).toBeGreaterThan(-1);
    const createLeadBlock = webhook.slice(createLeadStart, createLeadStart + 1800);
    expect(createLeadBlock).toContain('.from("leads")');
    expect(createLeadBlock).toContain("phone: `+${phone}`");
    expect(createLeadBlock).not.toContain("phone_normalized:");
  });


  it("creates an unknown WhatsApp lead only from inbound messages", () => {
    expect(webhook).toContain("if (!resolvedLeadId && !msg.key?.fromMe) {");
    expect(webhook).toContain("Novos leads de WhatsApp nascem somente de inbound real.");
  });

  it("never uses outbound pushName as a new contact name", () => {
    const createGuardStart = webhook.indexOf("if (!resolvedLeadId && !msg.key?.fromMe) {");
    expect(createGuardStart).toBeGreaterThan(-1);
    const createBlock = webhook.slice(createGuardStart, createGuardStart + 3600);
    expect(createBlock).toContain('const inboundPushName = msg.pushName?.trim() ?? ""');
    expect(createBlock).toContain('whatsapp_name_source: inboundPushName ? "inbound_push_name" : "phone_fallback"');
    expect(createBlock).toContain('last_message_from: "lead"');
  });

  it("only enriches placeholder WhatsApp lead names from inbound pushName", () => {
    expect(webhook).toContain('const inboundPushName = !msg.key?.fromMe ? msg.pushName?.trim() ?? "" : ""');
    expect(webhook).toContain('match.source === "whatsapp"');
    expect(webhook).toContain('nameSource === "phone_fallback"');
    expect(webhook).toContain('whatsapp_name_source: "inbound_push_name"');
  });

  it("keeps the defensive WhatsApp Inbox backfill on the same inbound-only naming contract", () => {
    const syncStart = leads.indexOf("export const syncWhatsAppInbox");
    expect(syncStart).toBeGreaterThan(-1);
    const syncBlock = leads.slice(syncStart);
    expect(syncBlock).toContain("(m) => !m.from_me && m.sender_name && m.sender_name.trim()");
    expect(syncBlock).toContain('whatsapp_name_source: inboundName ? "inbound_push_name" : "phone_fallback"');
    expect(syncBlock).toContain("name: inboundName || `+${p}`");
    expect(syncBlock).not.toContain("phone_normalized: p");
  });

  it("recovers the existing lead when concurrent first-contact creation loses the insert race", () => {
    expect(webhook).toContain("const { data: racedLead } = await supabaseAdmin");
    expect(webhook).toContain('.eq("phone_normalized", phone)');
    expect(webhook).toContain("resolvedLeadId = (racedLead as { id?: string } | null)?.id ?? null");
  });

  it("persists CRM-created dispatch state so a failed creation event is retryable", () => {
    expect(webhook).toContain("crm_created_dispatched: false");
    expect(webhook).toContain("currentCustom.crm_created_dispatched === false");
    expect(webhook).toContain("crm_created_dispatched: true");
  });
});
