import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadOriginInternal } from "../ai-agent-context.server";

describe("AI Agent Context Engine - Lead Origin", () => {
  const WS_A_ID = "11111111-1111-1111-a1a1-111111111111";
  const WS_B_ID = "22222222-2222-2222-b2b2-222222222222";
  const SOURCE_A_ID = "33333333-3333-3333-a3a3-333333333333";
  const SOURCE_B_ID = "44444444-4444-4444-b4b4-444444444444";
  const LEAD_A_ID = "55555555-5555-5555-a5a5-555555555555";
  const LEAD_NO_SOURCE_ID = "66666666-6666-6666-0000-666666666666";

  beforeAll(async () => {
    // 1. Obter um perfil existente
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!profiles) throw new Error("Nenhum perfil encontrado para o teste.");
    const profileId = profiles.id;

    // 2. Criar Workspaces A e B
    await supabaseAdmin.from("workspaces").upsert([
      { id: WS_A_ID, name: "WS Test Origin A", owner_id: profileId, slug: `ws-test-origin-a-${Date.now()}` },
      { id: WS_B_ID, name: "WS Test Origin B", owner_id: profileId, slug: `ws-test-origin-b-${Date.now()}` }
    ]);

    // 3. Criar CRM Sources
    await supabaseAdmin.from("crm_sources").upsert([
      { id: SOURCE_A_ID, workspace_id: WS_A_ID, display_name: "Source WS A", provider: "mkton" },
      { id: SOURCE_B_ID, workspace_id: WS_B_ID, display_name: "Source WS B", provider: "mkton" }
    ]);

    // 4. Criar Lead no WS A com origem
    await supabaseAdmin.from("leads").upsert({
      id: LEAD_A_ID,
      workspace_id: WS_A_ID,
      crm_source_id: SOURCE_A_ID,
      name: "Lead With Origin",
      phone: "+5511000000001"
    });

    // 5. Tentar criar Lead no WS A SEM origem
    const { error: noSourceError } = await supabaseAdmin.from("leads").upsert({
      id: LEAD_NO_SOURCE_ID,
      workspace_id: WS_A_ID,
      name: "Lead No Origin",
      phone: "+5511000000002",
      crm_source_id: null as any // Bypass TS for schema check
    });
    
    if (noSourceError) {
       console.log("SCHEMA RESTRICTION: Leads must have crm_source_id. Message: " + noSourceError.message);
    }
  });

  afterAll(async () => {
    await supabaseAdmin.from("leads").delete().in("id", [LEAD_A_ID, LEAD_NO_SOURCE_ID]);
    await supabaseAdmin.from("crm_sources").delete().in("id", [SOURCE_A_ID, SOURCE_B_ID]);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_A_ID, WS_B_ID]);
  });

  it("TEST 17.1: Lead com origem válida deve retornar os dados corretos", async () => {
    const result = await getLeadOriginInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_A_ID,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(SOURCE_A_ID);
    expect(result?.nome).toBe("Source WS A");
    expect(result?.provider).toBe("mkton");
  });

  it("TEST 17.2: O ID retornado deve corresponder ao crm_source_id do lead", async () => {
    const { data: lead } = await supabaseAdmin.from("leads").select("crm_source_id").eq("id", LEAD_A_ID).single();
    const result = await getLeadOriginInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_A_ID,
    });
    expect(result?.id).toBe(lead?.crm_source_id);
  });

  it("TEST 17.3: Lead sem origem deve retornar null (se permitido pelo schema)", async () => {
    const { data: lead } = await supabaseAdmin.from("leads").select("id").eq("id", LEAD_NO_SOURCE_ID).maybeSingle();
    
    if (lead) {
      const result = await getLeadOriginInternal({
        workspaceId: WS_A_ID,
        leadId: LEAD_NO_SOURCE_ID,
      });
      expect(result).toBeNull();
    } else {
      console.log("Skipping TEST 17.3 - Schema requires source.");
    }
  });

  it("TEST 17.4: Outro workspace não pode acessar a origem via leadId", async () => {
    const result = await getLeadOriginInternal({
      workspaceId: WS_B_ID,
      leadId: LEAD_A_ID,
    });
    expect(result).toBeNull();
  });

  it("TEST 17.5: Uma origem de outro workspace não pode ser retornada (isolamento)", async () => {
    const result = await getLeadOriginInternal({
      workspaceId: WS_B_ID,
      leadId: LEAD_A_ID,
    });
    expect(result).toBeNull();
  });
});