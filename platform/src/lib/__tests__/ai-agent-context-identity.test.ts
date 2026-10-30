import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadIdentityInternal } from "../ai-agent-context.server";

describe("AI Agent Context Engine - Identity", () => {
  const WS_A_ID = "11111111-1111-1111-1111-111111111111";
  const WS_B_ID = "22222222-2222-2222-2222-222222222222";
  const SOURCE_ID = "33333333-3333-3333-3333-333333333333";
  const LEAD_ID = "44444444-4444-4444-4444-444444444444";

  beforeAll(async () => {
    // 1. Obter um perfil existente para o workspace
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1)
      .single();
    
    if (!profiles) throw new Error("Nenhum perfil encontrado para o teste.");
    const profileId = profiles.id;

    // 2. Criar Workspaces A e B
    const { error: wsError } = await supabaseAdmin.from("workspaces").upsert([
      { 
        id: WS_A_ID, 
        name: "WS Test Context A", 
        owner_id: profileId,
        slug: `ws-test-ctx-a-${Date.now()}`
      },
      { 
        id: WS_B_ID, 
        name: "WS Test Context B", 
        owner_id: profileId,
        slug: `ws-test-ctx-b-${Date.now()}`
      }
    ]);
    if (wsError) throw new Error(`Falha ao criar workspaces: ${wsError.message}`);

    // 3. Criar CRM Source no WS A (obrigatório para criar lead)
    const { error: sourceError } = await supabaseAdmin.from("crm_sources").upsert({
      id: SOURCE_ID,
      workspace_id: WS_A_ID,
      display_name: "Source Test Context",
      provider: "mkton"
    });
    if (sourceError) throw new Error(`Falha ao criar CRM source: ${sourceError.message}`);

    // 4. Criar Lead no WS A
    const { error: leadError } = await supabaseAdmin.from("leads").upsert({
      id: LEAD_ID,
      workspace_id: WS_A_ID,
      crm_source_id: SOURCE_ID,
      name: "Lead Context Test",
      email: "test@context.com",
      phone: "+5511999999999"
    });
    if (leadError) throw new Error(`Falha ao criar lead: ${leadError.message}`);
  });

  afterAll(async () => {
    // Cleanup em ordem reversa
    await supabaseAdmin.from("leads").delete().eq("id", LEAD_ID);
    await supabaseAdmin.from("crm_sources").delete().eq("id", SOURCE_ID);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_A_ID, WS_B_ID]);
  });

  it("TEST 1: Lead do workspace correto deve retornar identidade básica", async () => {
    const result = await getLeadIdentityInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_ID,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(LEAD_ID);
    expect(result?.nome).toBe("Lead Context Test");
    expect(result?.email).toBe("test@context.com");
    expect(result?.telefone).toBe("+5511999999999");
  });

  it("TEST 2: Lead solicitado por outro workspace deve retornar null (isolamento)", async () => {
    const result = await getLeadIdentityInternal({
      workspaceId: WS_B_ID,
      leadId: LEAD_ID,
    });

    expect(result).toBeNull();
  });
});
