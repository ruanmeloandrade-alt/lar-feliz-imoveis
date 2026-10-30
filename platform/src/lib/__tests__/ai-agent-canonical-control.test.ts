import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { activateLeadAiAgentInternal, pauseLeadAiAgentInternal } from "../ai-agent-control.server";

describe("Step 01.2E - AI Agent Activation/Pause - Isolated Tests", () => {
  // Unique IDs for this run to avoid collisions
  const WS_ID = "a1111111-1111-1111-1111-111111111111";
  const WS_B_ID = "b2222222-2222-2222-2222-222222222222";
  const LEAD_ID = "c3333333-3333-3333-3333-333333333333";
  const AGENT_ID = "d4444444-4444-4444-4444-444444444444";
  const AGENT_B_ID = "e5555555-5555-5555-5555-555555555555";
  const AGENT_DISABLED_ID = "f6666666-6666-6666-6666-666666666666";
  const SOURCE_ID = "17777777-7777-7777-7777-777777777777";

  beforeAll(async () => {
    // 1. Get a real owner_id (Profile)
    const { data: users } = await supabaseAdmin.from("profiles").select("id").limit(1);
    const ownerId = users?.[0]?.id;
    if (!ownerId) throw new Error("No user found in profiles table for testing.");

    // 2. Create Workspaces
    await supabaseAdmin.from("workspaces").upsert([
      { id: WS_ID, name: "Test WS A", owner_id: ownerId, slug: "ws-test-a-" + Date.now() },
      { id: WS_B_ID, name: "Test WS B", owner_id: ownerId, slug: "ws-test-b-" + Date.now() }
    ]);

    // 3. Create CRM Source (Required for Leads FK)
    const { error: sourceError } = await supabaseAdmin.from("crm_sources").upsert({
      id: SOURCE_ID,
      workspace_id: WS_ID,
      display_name: "Test Source",
      provider: "mkton" 
    });
    if (sourceError) throw new Error("Source creation failed: " + sourceError.message);

    // 4. Create Lead in WS A
    const { error: leadError } = await supabaseAdmin.from("leads").upsert({
      id: LEAD_ID,
      workspace_id: WS_ID,
      name: "Test Lead Isolated",
      status: "active",
      crm_source_id: SOURCE_ID
    });
    if (leadError) throw new Error("Lead creation failed: " + leadError.message);

    // 5. Create Agents
    const { error: agentError } = await supabaseAdmin.from("conversation_ai_agents").upsert([
      { id: AGENT_ID, workspace_id: WS_ID, name: "Agent WS A", enabled: true, model: "gpt-4" },
      { id: AGENT_B_ID, workspace_id: WS_B_ID, name: "Agent WS B", enabled: true, model: "gpt-4" },
      { id: AGENT_DISABLED_ID, workspace_id: WS_ID, name: "Disabled Agent", enabled: false, model: "gpt-4" }
    ]);
    if (agentError) throw new Error("Agent creation failed: " + agentError.message);
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await supabaseAdmin.from("lead_activities").delete().eq("workspace_id", WS_ID);
    await supabaseAdmin.from("leads").delete().eq("id", LEAD_ID);
    await supabaseAdmin.from("conversation_ai_agents").delete().in("id", [AGENT_ID, AGENT_B_ID, AGENT_DISABLED_ID]);
    await supabaseAdmin.from("crm_sources").delete().eq("id", SOURCE_ID);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_ID, WS_B_ID]);
  });

  it("1. Ativar agente: active_conversation_agent_id = agentId e ai_paused = false", async () => {
    const result = await activateLeadAiAgentInternal({
      workspaceId: WS_ID,
      leadId: LEAD_ID,
      agentId: AGENT_ID
    });
    expect(result.ok).toBe(true);

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("active_conversation_agent_id, ai_paused")
      .eq("id", LEAD_ID)
      .single();

    expect(lead?.active_conversation_agent_id).toBe(AGENT_ID);
    expect(lead?.ai_paused).toBe(false);
  });

  it("2. Pausar agente: ai_paused = true e active_conversation_agent_id continua preenchido", async () => {
    // Ensure it is activated first
    await activateLeadAiAgentInternal({
      workspaceId: WS_ID,
      leadId: LEAD_ID,
      agentId: AGENT_ID
    });

    const result = await pauseLeadAiAgentInternal({
      workspaceId: WS_ID,
      leadId: LEAD_ID
    });
    expect(result.ok).toBe(true);

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("active_conversation_agent_id, ai_paused")
      .eq("id", LEAD_ID)
      .single();

    expect(lead?.active_conversation_agent_id).toBe(AGENT_ID);
    expect(lead?.ai_paused).toBe(true);
  });

  it("3. Agente de outro workspace não pode ser ativado", async () => {
    await expect(activateLeadAiAgentInternal({
      workspaceId: WS_ID,
      leadId: LEAD_ID,
      agentId: AGENT_B_ID
    })).rejects.toThrow(/não encontrado ou não pertence a este workspace/);
  });

  it("4. Agente desabilitado não pode ser ativado", async () => {
    await expect(activateLeadAiAgentInternal({
      workspaceId: WS_ID,
      leadId: LEAD_ID,
      agentId: AGENT_DISABLED_ID
    })).rejects.toThrow(/está desabilitado/);
  });
});
