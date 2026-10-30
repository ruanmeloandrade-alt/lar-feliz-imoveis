import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildLeadOperationalContextInternal } from "../ai-agent-context.server";
import { Database } from "@/integrations/supabase/types";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type PipelineInsert = Database["public"]["Tables"]["pipelines"]["Insert"];
type StageInsert = Database["public"]["Tables"]["pipeline_stages"]["Insert"];
type CustomFieldInsert = Database["public"]["Tables"]["lead_custom_fields"]["Insert"];
type CustomFieldValueInsert = Database["public"]["Tables"]["lead_custom_field_values"]["Insert"];
type WhatsAppSessionInsert = Database["public"]["Tables"]["whatsapp_web_sessions"]["Insert"];
type WhatsAppMessageInsert = Database["public"]["Tables"]["whatsapp_web_messages"]["Insert"];

describe("AI Agent Context Engine - ETAPA 01.3I-A - Contexto Operacional", () => {
  const now = Date.now();
  const PHONE_A = `5511${now}7`;

  let ws_a_id: string;
  let ws_b_id: string;
  let profileId: string;
  let source_a_id: string;
  let source_b_id: string;
  let pipe_a_id: string;
  let stage_a_id: string;
  let field_a_id: string;
  let sess_a_id: string;
  let lead_full_id: string;
  let lead_b_id: string;

  beforeAll(async () => {
    const { data: p } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!p) throw new Error("Perfil não encontrado");
    profileId = p.id;

    const wsA = await supabaseAdmin.from("workspaces").insert({ name: `WS OP A ${now}`, owner_id: profileId, slug: `ws-op-a-${now}` }).select("id").single();
    const wsB = await supabaseAdmin.from("workspaces").insert({ name: `WS OP B ${now}`, owner_id: profileId, slug: `ws-op-b-${now}` }).select("id").single();
    ws_a_id = wsA.data!.id;
    ws_b_id = wsB.data!.id;

    const srcA = await supabaseAdmin.from("crm_sources").insert({ workspace_id: ws_a_id, display_name: "Source OP A", provider: "mkton" }).select("id").single();
    source_a_id = srcA.data!.id;
    const srcB = await supabaseAdmin.from("crm_sources").insert({ workspace_id: ws_b_id, display_name: "Source OP B", provider: "mkton" }).select("id").single();
    source_b_id = srcB.data!.id;

    const pipeA = await supabaseAdmin.from("pipelines").insert({ workspace_id: ws_a_id, name: "Pipe OP A", crm_source_id: source_a_id } as PipelineInsert).select("id").single();
    pipe_a_id = pipeA.data!.id;
    const stageA = await supabaseAdmin.from("pipeline_stages").insert({ workspace_id: ws_a_id, pipeline_id: pipe_a_id, name: "Stage OP A" } as StageInsert).select("id").single();
    stage_a_id = stageA.data!.id;

    const fieldA = await supabaseAdmin.from("lead_custom_fields").insert({ workspace_id: ws_a_id, name: "Field OP A", field_type: "text" } as CustomFieldInsert).select("id").single();
    field_a_id = fieldA.data!.id;

    const sessA = await supabaseAdmin.from("whatsapp_web_sessions").insert({ workspace_id: ws_a_id, status: "conectado", provider: "evolution", instance_id: `inst-op-a-${now}` } as WhatsAppSessionInsert).select("id").single();
    sess_a_id = sessA.data!.id;

    const lFull = await supabaseAdmin.from("leads").insert({
      workspace_id: ws_a_id,
      name: "Lead OP Full",
      phone: PHONE_A,
      email: "op@test.com",
      pipeline_id: pipe_a_id,
      stage_id: stage_a_id,
      responsible_id: profileId,
      crm_source_id: source_a_id,
      tags: ["tag1", "tag2"] as Database["public"]["Tables"]["leads"]["Insert"]["tags"],
    } as LeadInsert).select("id").single();
    lead_full_id = lFull.data!.id;

    const lB = await supabaseAdmin.from("leads").insert({
      workspace_id: ws_b_id,
      name: "Lead OP B",
      phone: PHONE_A,
      crm_source_id: source_b_id,
    } as LeadInsert).select("id").single();
    lead_b_id = lB.data!.id;

    await supabaseAdmin.from("lead_custom_field_values").insert({
      workspace_id: ws_a_id,
      lead_id: lead_full_id,
      field_id: field_a_id,
      value: "Valor OP A",
    } as CustomFieldValueInsert);

    await supabaseAdmin.from("whatsapp_web_messages").insert({
      workspace_id: ws_a_id,
      session_id: sess_a_id,
      remote_jid: `${PHONE_A}@s.whatsapp.net`,
      body: "Msg OP 1",
      from_me: false,
      received_at: new Date().toISOString(),
      message_id: `op-1-${now}`,
      message_type: "text",
      delivery_status: "received",
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

  it("TEST 20.1: lead completo -> estrutura operacional correta", async () => {
    const ctx = await buildLeadOperationalContextInternal({ workspaceId: ws_a_id, leadId: lead_full_id });
    expect(ctx).not.toBeNull();

    expect(ctx!.lead.id).toBe(lead_full_id);
    expect(ctx!.lead.nome).toBe("Lead OP Full");
    expect(ctx!.lead.telefone).toBe(PHONE_A);
    expect(ctx!.lead.email).toBe("op@test.com");

    expect(ctx!.crm.pipeline?.id).toBe(pipe_a_id);
    expect(ctx!.crm.pipeline?.name).toBe("Pipe OP A");
    expect(ctx!.crm.etapa?.id).toBe(stage_a_id);
    expect(ctx!.crm.etapa?.name).toBe("Stage OP A");

    expect(ctx!.responsavel?.id).toBe(profileId);
    expect(ctx!.origem?.id).toBe(source_a_id);

    expect(ctx!.tags).toHaveLength(2);
    expect(ctx!.tags[0].nome).toBe("tag1");

    expect(ctx!.camposPersonalizados).toHaveLength(1);

    expect(ctx!.conversa.mensagensRecentes).toHaveLength(1);
    expect(ctx!.conversa.mensagensRecentes[0].conteudo).toBe("Msg OP 1");
    expect(ctx!.conversa.mensagensRecentes[0].direcao).toBe("cliente");
  });

  it("TEST 20.2: lead inexistente -> null", async () => {
    const ctx = await buildLeadOperationalContextInternal({
      workspaceId: ws_a_id,
      leadId: "00000000-0000-0000-0000-000000000000",
    });
    expect(ctx).toBeNull();
  });

  it("TEST 20.3: lead de outro workspace -> null", async () => {
    const ctx = await buildLeadOperationalContextInternal({ workspaceId: ws_a_id, leadId: lead_b_id });
    expect(ctx).toBeNull();
  });

  it("TEST 20.4: estado da conversa (cliente -> time -> cliente -> time)", async () => {
    const t = Date.now();
    const phone = `5511${t}8`;
    const jid = `${phone}@s.whatsapp.net`;
    const l = await supabaseAdmin.from("leads").insert({ workspace_id: ws_a_id, name: "Lead Seq", phone, crm_source_id: source_a_id } as LeadInsert).select("id").single();

    const seq = [
      { body: "C1", from_me: false },
      { body: "E1", from_me: true },
      { body: "C2", from_me: false },
      { body: "E2", from_me: true },
    ];
    for (let i = 0; i < seq.length; i++) {
      await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: ws_a_id, session_id: sess_a_id, remote_jid: jid, body: seq[i].body, from_me: seq[i].from_me,
        received_at: new Date(t + i * 1000).toISOString(), message_id: `seq-${i}-${t}`, message_type: "text",
        delivery_status: seq[i].from_me ? "sent" : "received",
      } as WhatsAppMessageInsert);
    }

    const ctx = await buildLeadOperationalContextInternal({ workspaceId: ws_a_id, leadId: l.data!.id });
    expect(ctx).not.toBeNull();
    expect(ctx!.conversa.mensagensRecentes).toHaveLength(4);
    expect(ctx!.conversa.ultimaMensagem?.conteudo).toBe("E2");
    expect(ctx!.conversa.ultimaMensagemDoLead?.conteudo).toBe("C2");
    expect(ctx!.conversa.ultimaMensagemDoLead?.direcao).toBe("cliente");
    expect(ctx!.conversa.ultimaMensagemDaEmpresa?.conteudo).toBe("E2");
    expect(ctx!.conversa.ultimaMensagemDaEmpresa?.direcao).toBe("time");
  });

  it("TEST 20.5: sem histórico -> campos de conversa null", async () => {
    const t = Date.now();
    const l = await supabaseAdmin.from("leads").insert({ workspace_id: ws_a_id, name: "Lead Sem Hist", phone: `5511${t}9`, crm_source_id: source_a_id } as LeadInsert).select("id").single();

    const ctx = await buildLeadOperationalContextInternal({ workspaceId: ws_a_id, leadId: l.data!.id });
    expect(ctx).not.toBeNull();
    expect(ctx!.conversa.mensagensRecentes).toHaveLength(0);
    expect(ctx!.conversa.ultimaMensagem).toBeNull();
    expect(ctx!.conversa.ultimaMensagemDoLead).toBeNull();
    expect(ctx!.conversa.ultimaMensagemDaEmpresa).toBeNull();
  });

  it("TEST 20.6: historyLimit=2 -> apenas 2 mensagens mais recentes e estado derivado só delas", async () => {
    const t = Date.now();
    const phone = `5511${t}6`;
    const jid = `${phone}@s.whatsapp.net`;
    const l = await supabaseAdmin.from("leads").insert({ workspace_id: ws_a_id, name: "Lead Limit", phone, crm_source_id: source_a_id } as LeadInsert).select("id").single();

    // Ordem cronológica: C1, C2, E1, E2 -> com limit 2 sobram apenas E1 e E2
    const seq = [
      { body: "L-C1", from_me: false },
      { body: "L-C2", from_me: false },
      { body: "L-E1", from_me: true },
      { body: "L-E2", from_me: true },
    ];
    for (let i = 0; i < seq.length; i++) {
      await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: ws_a_id, session_id: sess_a_id, remote_jid: jid, body: seq[i].body, from_me: seq[i].from_me,
        received_at: new Date(t + i * 1000).toISOString(), message_id: `lim-${i}-${t}`, message_type: "text",
        delivery_status: seq[i].from_me ? "sent" : "received",
      } as WhatsAppMessageInsert);
    }

    const ctx = await buildLeadOperationalContextInternal({ workspaceId: ws_a_id, leadId: l.data!.id, historyLimit: 2 });
    expect(ctx).not.toBeNull();
    expect(ctx!.conversa.mensagensRecentes).toHaveLength(2);
    expect(ctx!.conversa.mensagensRecentes.map((m) => m.conteudo)).toEqual(["L-E1", "L-E2"]);
    expect(ctx!.conversa.ultimaMensagem?.conteudo).toBe("L-E2");
    expect(ctx!.conversa.ultimaMensagemDaEmpresa?.conteudo).toBe("L-E2");
    // C1/C2 ficaram fora do limite -> não podem ser consideradas
    expect(ctx!.conversa.ultimaMensagemDoLead).toBeNull();
  });
});
