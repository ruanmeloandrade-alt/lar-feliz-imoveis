import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadCanonicalContextInternal } from "../ai-agent-context.server";
import { Database } from "@/integrations/supabase/types";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type WhatsAppMessageInsert = Database["public"]["Tables"]["whatsapp_web_messages"]["Insert"];
type PipelineInsert = Database["public"]["Tables"]["pipelines"]["Insert"];
type StageInsert = Database["public"]["Tables"]["pipeline_stages"]["Insert"];
type CustomFieldInsert = Database["public"]["Tables"]["lead_custom_fields"]["Insert"];
type CustomFieldValueInsert = Database["public"]["Tables"]["lead_custom_field_values"]["Insert"];
type WhatsAppSessionInsert = Database["public"]["Tables"]["whatsapp_web_sessions"]["Insert"];

describe("AI Agent Context Engine - ETAPA 01.3H - Consolidação Canônica", () => {
  let ws_a_id: string;
  let ws_b_id: string;
  let lead_full_id: string;
  let lead_empty_id: string;
  let lead_b_id: string;
  let profileId: string;
  
  const now = Date.now();
  const PHONE_A = `5511${now}1`;
  const PHONE_B = `5511${now}2`;

  // Workspace A Resources
  let source_a_id: string;
  let pipe_a_id: string;
  let stage_a_id: string;
  let field_a_id: string;
  let sess_a_id: string;

  // Workspace B Resources
  let source_b_id: string;
  let sess_b_id: string;

  beforeAll(async () => {
    const { data: p } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!p) throw new Error("Perfil não encontrado");
    profileId = p.id;

    const wsA = await supabaseAdmin.from("workspaces").insert({ name: `WS A ${now}`, owner_id: profileId, slug: `ws-a-${now}` }).select("id").single();
    const wsB = await supabaseAdmin.from("workspaces").insert({ name: `WS B ${now}`, owner_id: profileId, slug: `ws-b-${now}` }).select("id").single();
    ws_a_id = wsA.data!.id;
    ws_b_id = wsB.data!.id;

    const srcA = await supabaseAdmin.from("crm_sources").insert({ workspace_id: ws_a_id, display_name: "Source A", provider: "mkton" }).select("id").single();
    source_a_id = srcA.data!.id;

    const pipeA = await supabaseAdmin.from("pipelines").insert({ workspace_id: ws_a_id, name: "Pipe A", crm_source_id: source_a_id } as PipelineInsert).select("id").single();
    pipe_a_id = pipeA.data!.id;

    const stageA = await supabaseAdmin.from("pipeline_stages").insert({ workspace_id: ws_a_id, pipeline_id: pipe_a_id, name: "Stage A" } as StageInsert).select("id").single();
    stage_a_id = stageA.data!.id;

    const fieldA = await supabaseAdmin.from("lead_custom_fields").insert({ workspace_id: ws_a_id, name: "Field A", field_type: "text" } as CustomFieldInsert).select("id").single();
    field_a_id = fieldA.data!.id;

    const sessA = await supabaseAdmin.from("whatsapp_web_sessions").insert({ workspace_id: ws_a_id, status: "conectado", provider: "evolution", instance_id: `inst-a-${now}` } as WhatsAppSessionInsert).select("id").single();
    sess_a_id = sessA.data!.id;

    const srcB = await supabaseAdmin.from("crm_sources").insert({ workspace_id: ws_b_id, display_name: "Source B", provider: "mkton" }).select("id").single();
    source_b_id = srcB.data!.id;

    const sessB = await supabaseAdmin.from("whatsapp_web_sessions").insert({ workspace_id: ws_b_id, status: "conectado", provider: "evolution", instance_id: `inst-b-${now}` } as WhatsAppSessionInsert).select("id").single();
    sess_b_id = sessB.data!.id;

    const lFull = await supabaseAdmin.from("leads").insert({
      workspace_id: ws_a_id,
      name: "Lead Full",
      phone: PHONE_A,
      email: "full@test.com",
      pipeline_id: pipe_a_id,
      stage_id: stage_a_id,
      responsible_id: profileId,
      crm_source_id: source_a_id,
      // TYPE EXCEPTION: leads.tags é Json no schema, mas tipado como Json no generated types.
      // O insert de array de strings ['tag1', 'tag2'] é compatível com Json, mas o compilador às vezes exige cast se o tipo exato for complexo.
      // Aqui o cast p/ Json do Supabase resolve sem 'as any'.
      tags: ["tag1", "tag2"] as Database["public"]["Tables"]["leads"]["Insert"]["tags"]
    } as LeadInsert).select("id").single();
    lead_full_id = lFull.data!.id;

    const lEmpty = await supabaseAdmin.from("leads").insert({
      workspace_id: ws_a_id,
      name: "Lead Empty",
      phone: PHONE_B,
      crm_source_id: source_a_id
    } as LeadInsert).select("id").single();
    lead_empty_id = lEmpty.data!.id;

    const lB = await supabaseAdmin.from("leads").insert({
      workspace_id: ws_b_id,
      name: "Lead B",
      phone: PHONE_A, 
      crm_source_id: source_b_id
    } as LeadInsert).select("id").single();
    lead_b_id = lB.data!.id;

    await supabaseAdmin.from("lead_custom_field_values").insert({
      workspace_id: ws_a_id,
      lead_id: lead_full_id,
      field_id: field_a_id,
      value: "Valor A"
    } as CustomFieldValueInsert);

    const time = new Date();
    await supabaseAdmin.from("whatsapp_web_messages").insert([
      { workspace_id: ws_a_id, session_id: sess_a_id, remote_jid: `${PHONE_A}@s.whatsapp.net`, body: "Msg 1", from_me: false, received_at: new Date(time.getTime() - 3000).toISOString(), message_id: `a1-${now}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert,
      { workspace_id: ws_a_id, session_id: sess_a_id, remote_jid: `${PHONE_A}@s.whatsapp.net`, body: "Msg 2", from_me: true, received_at: new Date(time.getTime() - 2000).toISOString(), message_id: `a2-${now}`, message_type: "text", delivery_status: "sent" } as WhatsAppMessageInsert,
      { workspace_id: ws_a_id, session_id: sess_a_id, remote_jid: `${PHONE_A}@s.whatsapp.net`, body: "Msg 3", from_me: false, received_at: new Date(time.getTime() - 1000).toISOString(), message_id: `a3-${now}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert
    ]);

    await supabaseAdmin.from("whatsapp_web_messages").insert({
      workspace_id: ws_b_id,
      session_id: sess_b_id,
      remote_jid: `${PHONE_A}@s.whatsapp.net`,
      body: "Leak Msg B",
      from_me: false,
      received_at: new Date().toISOString(),
      message_id: `b1-${now}`,
      message_type: "text",
      delivery_status: "received"
    } as WhatsAppMessageInsert);
  });

  afterAll(async () => {
    await supabaseAdmin.from("whatsapp_web_messages").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("lead_custom_field_values").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("leads").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("lead_custom_fields").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("pipeline_stages").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("pipelines").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("whatsapp_web_sessions").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("crm_sources").delete().in("workspace_id", [ws_a_id, ws_b_id]);
    await supabaseAdmin.from("workspaces").delete().in("id", [ws_a_id, ws_b_id]);
  });

  it("IDENTIDADE: deve validar id, nome, telefone e email corretos", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.identity.id).toBe(lead_full_id);
    expect(context?.identity.nome).toBe("Lead Full");
    expect(context?.identity.telefone).toBe(PHONE_A);
    expect(context?.identity.email).toBe("full@test.com");
  });

  it("CRM: deve validar IDs e nomes de pipeline e etapa", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.crm?.pipeline?.id).toBe(pipe_a_id);
    expect(context?.crm?.pipeline?.name).toBe("Pipe A");
    expect(context?.crm?.stage?.id).toBe(stage_a_id);
    expect(context?.crm?.stage?.name).toBe("Stage A");
  });

  it("TAGS: deve retornar exatamente 2 tags com conteúdo correto", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.tags).toHaveLength(2);
    expect(context?.tags.map(t => t.nome)).toContain("tag1");
    expect(context?.tags.map(t => t.nome)).toContain("tag2");
  });

  it("CAMPO PERSONALIZADO: deve retornar campo e valor corretos", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.customFields).toHaveLength(1);
    expect(context?.customFields[0].nome).toBe("Field A");
    expect(context?.customFields[0].valor).toBe("Valor A");
  });

  it("RESPONSÁVEL: deve retornar ID e nome corretos", async () => {
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, display_name").eq("id", profileId).single();
    const expectedName = profile?.full_name || profile?.display_name || "Sem Nome";
    
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.responsible?.id).toBe(profileId);
    expect(context?.responsible?.nome).toBe(expectedName);
  });

  it("ORIGEM: deve retornar ID, nome e provider corretos", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.origin?.id).toBe(source_a_id);
    expect(context?.origin?.nome).toBe("Source A");
    expect(context?.origin?.provider).toBe("mkton");
  });

  it("HISTÓRICO: deve retornar 3 mensagens em ordem cronológica", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.recentHistory).toHaveLength(3);
    expect(context?.recentHistory[0].conteudo).toBe("Msg 1");
    expect(context?.recentHistory[1].conteudo).toBe("Msg 2");
    expect(context?.recentHistory[2].conteudo).toBe("Msg 3");
    
    const d1 = new Date(context?.recentHistory[0].data!).getTime();
    const d2 = new Date(context?.recentHistory[1].data!).getTime();
    const d3 = new Date(context?.recentHistory[2].data!).getTime();
    expect(d1).toBeLessThan(d2);
    expect(d2).toBeLessThan(d3);
  });

  it("DADOS OPCIONAIS VAZIOS: deve retornar null ou [] conforme contrato", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_empty_id });
    expect(context?.crm).toBeNull();
    expect(context?.responsible).toBeNull();
    expect(context?.tags).toEqual([]);
    expect(context?.customFields).toEqual([]);
    expect(context?.recentHistory).toEqual([]);
  });

  it("ISOLAMENTO REAL: Lead B consultado usando Workspace A -> null", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_b_id });
    expect(context).toBeNull();
  });

  it("SOURCE ISOLATION: Lead A deve usar source_a e nunca source_b", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.origin?.id).toBe(source_a_id);
    expect(context?.origin?.id).not.toBe(source_b_id);
  });

  it("ISOLAMENTO REAL: Mensagens do Workspace B nunca aparecem no Lead A", async () => {
    const context = await getLeadCanonicalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(context?.recentHistory.some(m => m.conteudo === "Leak Msg B")).toBe(false);
  });
});

