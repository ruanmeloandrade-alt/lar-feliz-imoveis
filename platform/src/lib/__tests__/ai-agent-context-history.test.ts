import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadRecentHistoryInternal } from "../ai-agent-context.server";
import { Database } from "@/integrations/supabase/types";

type ChannelMessageInsert = Database["public"]["Tables"]["channel_messages"]["Insert"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type CRMSourceInsert = Database["public"]["Tables"]["crm_sources"]["Insert"];
type WorkspaceInsert = Database["public"]["Tables"]["workspaces"]["Insert"];

describe("AI Agent Context Engine - Recent History", () => {
  const WS_A_ID = "11111111-1111-1111-c1c1-111111111111";
  const WS_B_ID = "22222222-2222-2222-d2d2-222222222222";
  const now_ts = Date.now();
  const LEAD_A_ID = `33333333-3333-3333-c3c3-${now_ts}`.slice(0, 36);
  const LEAD_NO_MSG_ID = `44444444-4444-4444-c4c4-${now_ts}`.slice(0, 36);
  const SOURCE_ID = `55555555-5555-5555-c5c5-${now_ts}`.slice(0, 36);

  beforeAll(async () => {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!profiles) throw new Error("Nenhum perfil encontrado para o teste.");
    const profileId = profiles.id;

    await supabaseAdmin.from("workspaces").upsert([
      { id: WS_A_ID, name: "WS Test History A", owner_id: profileId, slug: `ws-test-history-a-${Date.now()}` } as WorkspaceInsert,
      { id: WS_B_ID, name: "WS Test History B", owner_id: profileId, slug: `ws-test-history-b-${Date.now()}` } as WorkspaceInsert
    ]);

    await supabaseAdmin.from("crm_sources").upsert({
      id: SOURCE_ID,
      workspace_id: WS_A_ID,
      display_name: "History Source",
      provider: "mkton"
    } as CRMSourceInsert);

    await supabaseAdmin.from("leads").upsert([
      { id: LEAD_A_ID, workspace_id: WS_A_ID, crm_source_id: SOURCE_ID, name: "Lead History", phone: "+5511988887777" } as LeadInsert,
      { id: LEAD_NO_MSG_ID, workspace_id: WS_A_ID, crm_source_id: SOURCE_ID, name: "Lead No Msg" } as LeadInsert
    ]);

    // Criar 3 mensagens em ordem cronológica
    const now = new Date();
    const { error: insertError } = await supabaseAdmin.from("channel_messages").insert([
      {
        workspace_id: WS_A_ID,
        lead_id: LEAD_A_ID,
        direction: "in",
        text: "Msg 1",
        received_at: new Date(now.getTime() - 3000).toISOString(),
        thread_id: "thread-1",
        channel: "messenger",
      } as ChannelMessageInsert,
      {
        workspace_id: WS_A_ID,
        lead_id: LEAD_A_ID,
        direction: "out",
        text: "Msg 2",
        received_at: new Date(now.getTime() - 2000).toISOString(),
        thread_id: "thread-1",
        channel: "messenger",
      } as ChannelMessageInsert,
      {
        workspace_id: WS_A_ID,
        lead_id: LEAD_A_ID,
        direction: "in",
        text: "Msg 3",
        received_at: new Date(now.getTime() - 1000).toISOString(),
        thread_id: "thread-1",
        channel: "messenger",
      } as ChannelMessageInsert
    ]);

    if (insertError) {
      throw new Error(`Falha ao inserir mensagens de teste: ${insertError.message}`);
    }
  });

  afterAll(async () => {
    await supabaseAdmin.from("channel_messages").delete().eq("lead_id", LEAD_A_ID);
    await supabaseAdmin.from("leads").delete().in("id", [LEAD_A_ID, LEAD_NO_MSG_ID]);
    await supabaseAdmin.from("crm_sources").delete().eq("id", SOURCE_ID);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_A_ID, WS_B_ID]);
  });

  it("TEST 18.1: Lead com 3 mensagens deve retornar exatamente as 3 na ordem cronológica correta", async () => {
    const result = await getLeadRecentHistoryInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_A_ID,
      limit: 10
    });

    expect(result).toHaveLength(3);
    expect(result[0].conteudo).toBe("Msg 1");
    expect(result[1].conteudo).toBe("Msg 2");
    expect(result[2].conteudo).toBe("Msg 3");
    
    // Validar direções
    expect(result[0].direcao).toBe("cliente");
    expect(result[1].direcao).toBe("time");
    expect(result[2].direcao).toBe("cliente");
  });

  it("TEST 18.2: Lead sem mensagens deve retornar []", async () => {
    const result = await getLeadRecentHistoryInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_NO_MSG_ID,
    });
    expect(result).toEqual([]);
  });

  it("TEST 18.3: Isolamento de workspace - outro workspace não acessa histórico", async () => {
    const result = await getLeadRecentHistoryInternal({
      workspaceId: WS_B_ID,
      leadId: LEAD_A_ID,
    });
    expect(result).toEqual([]);
  });

  it("TEST 18.4: Limite deve respeitar a quantidade solicitada (limit: 2), mantendo ordem cronológica", async () => {
    const result = await getLeadRecentHistoryInternal({
      workspaceId: WS_A_ID,
      leadId: LEAD_A_ID,
      limit: 2
    });

    expect(result).toHaveLength(2);
    // Como o teste anterior inseriu Msg 1, Msg 2, Msg 3, e o limite é 2, deve pegar as 2 mais recentes.
    // As mensagens retornadas devem ser Msg 2 e Msg 3.
    expect(result[0].conteudo).toBe("Msg 2");
    expect(result[1].conteudo).toBe("Msg 3");
  });
});
