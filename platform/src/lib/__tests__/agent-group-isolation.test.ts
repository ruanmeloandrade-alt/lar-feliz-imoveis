import { describe, it, expect, beforeAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchInboundMessage, classifyWhatsappRemoteJid } from "@/lib/salesbot-runtime.server";

describe("Step 01.2C - Separate X1 Agent from Groups (Real Identifiers)", () => {
  const TEST_WS_ID = "00000000-0000-0000-0000-000000000001";
  const LEAD_X1_ID = "00000000-0000-0000-0000-000000000123";
  const LEAD_GROUP_ID = "00000000-0000-0000-0000-123456789012@g.us";
  const TEST_AGENT_ID = "00000000-0000-0000-0000-000000000003";

  beforeAll(async () => {
    // Setup leads
    await supabaseAdmin.from("leads").upsert([
      {
        id: LEAD_X1_ID,
        workspace_id: TEST_WS_ID,
        name: "Test Lead X1",
        phone_normalized: "5511999999991",
        ai_paused: false,
        active_conversation_agent_id: TEST_AGENT_ID,
        crm_source_id: "direct"
      },
      {
        id: LEAD_GROUP_ID,
        workspace_id: TEST_WS_ID,
        name: "Test Group Lead",
        phone_normalized: "123456789012",
        ai_paused: false,
        active_conversation_agent_id: TEST_AGENT_ID, // Simulating risky config
        crm_source_id: "direct"
      }
    ]);
  });

  it("TESTE A: remoteJid X1 should be classified as x1", async () => {
    const remoteJid = "5511999999999@s.whatsapp.net";
    expect(classifyWhatsappRemoteJid(remoteJid)).toBe("x1");
  });

  it("TESTE B: remoteJid Group should be classified as group", async () => {
    const remoteJid = "120363000000000000@g.us";
    expect(classifyWhatsappRemoteJid(remoteJid)).toBe("group");
  });
});
