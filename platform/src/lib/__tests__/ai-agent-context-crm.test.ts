import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadCrmPositionInternal } from "../ai-agent-context.server";

describe("AI Agent Context Engine - CRM Position", () => {
  const WS_A_ID = "55555555-5555-5555-5555-555555555555";
  const WS_B_ID = "66666666-6666-6666-6666-666666666666";
  const SOURCE_ID = "77777777-7777-7777-7777-777777777777";
  const PIPELINE_ID = "88888888-8888-8888-8888-888888888888";
  const STAGE_ID = "99999999-9999-9999-9999-999999999999";
  const LEAD_WITH_POS_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const LEAD_NO_POS_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeAll(async () => {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!profiles) throw new Error("Nenhum perfil encontrado para o teste.");
    const profileId = profiles.id;

    // 1. Workspaces
    await supabaseAdmin.from("workspaces").upsert([
      { id: WS_A_ID, name: "WS Test CRM A", owner_id: profileId, slug: `ws-test-crm-a-${Date.now()}` },
      { id: WS_B_ID, name: "WS Test CRM B", owner_id: profileId, slug: `ws-test-crm-b-${Date.now()}` }
    ]);

    // 2. Source
    await supabaseAdmin.from("crm_sources").upsert({
      id: SOURCE_ID,
      workspace_id: WS_A_ID,
      display_name: "CRM Test Source",
      provider: "mkton"
    });

    // 3. Pipeline e Stage
    await supabaseAdmin.from("pipelines").upsert({
      id: PIPELINE_ID,
      workspace_id: WS_A_ID,
      crm_source_id: SOURCE_ID,
      name: "Pipeline Test"
    });

    await supabaseAdmin.from("pipeline_stages").upsert({
      id: STAGE_ID,
      workspace_id: WS_A_ID,
      pipeline_id: PIPELINE_ID,
      name: "Stage Test",
      position: 1
    });

    // 4. Leads
    await supabaseAdmin.from("leads").upsert([
      {
        id: LEAD_WITH_POS_ID,
        workspace_id: WS_A_ID,
        crm_source_id: SOURCE_ID,
        name: "Lead With Position",
        pipeline_id: PIPELINE_ID,
        stage_id: STAGE_ID
      },
      {
        id: LEAD_NO_POS_ID,
        workspace_id: WS_A_ID,
        crm_source_id: SOURCE_ID,
        name: "Lead No Position",
        pipeline_id: null,
        stage_id: null
      }
    ]);
  });

  afterAll(async () => {
    await supabaseAdmin.from("leads").delete().in("id", [LEAD_WITH_POS_ID, LEAD_NO_POS_ID]);
    await supabaseAdmin.from("pipeline_stages").delete().eq("id", STAGE_ID);
    await supabaseAdmin.from("pipelines").delete().eq("id", PIPELINE_ID);
    await supabaseAdmin.from("crm_sources").delete().eq("id", SOURCE_ID);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_A_ID, WS_B_ID]);
  });

  it("TEST 1: Lead posicionado deve retornar pipeline e etapa corretamente", async () => {
    const result = await getLeadCrmPositionInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_WITH_POS_ID,
    });

    expect(result).not.toBeNull();
    expect(result?.pipeline?.id).toBe(PIPELINE_ID);
    expect(result?.pipeline?.name).toBe("Pipeline Test");
    expect(result?.stage?.id).toBe(STAGE_ID);
    expect(result?.stage?.name).toBe("Stage Test");
  });

  it("TEST 2: Lead sem posição deve retornar null", async () => {
    const result = await getLeadCrmPositionInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_NO_POS_ID,
    });

    expect(result).toBeNull();
  });

  it("TEST 3: Não deve permitir leitura cruzada entre workspaces", async () => {
    const result = await getLeadCrmPositionInternal({
      workspaceId: WS_B_ID,
      leadId: LEAD_WITH_POS_ID,
    });

    expect(result).toBeNull();
  });
});
