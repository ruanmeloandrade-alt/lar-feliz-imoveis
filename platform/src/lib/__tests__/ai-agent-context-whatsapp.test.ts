
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadRecentHistoryInternal } from "../ai-agent-context.server";
import { Database } from "@/integrations/supabase/types";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type WhatsAppMessageInsert = Database["public"]["Tables"]["whatsapp_web_messages"]["Insert"];
type WhatsAppSessionInsert = Database["public"]["Tables"]["whatsapp_web_sessions"]["Insert"];
type CRMSourceInsert = Database["public"]["Tables"]["crm_sources"]["Insert"];
type ChannelMessageInsert = Database["public"]["Tables"]["channel_messages"]["Insert"];

describe("AI Agent Context Engine - Extended WhatsApp History", () => {
  let WS_A_ID: string;
  let WS_B_ID: string;
  let profileId: string;
  let SOURCE_A_ID: string;
  let SESS_1_ID: string;
  let LEAD_A_ID: string;

  const now = Date.now();
  const PHONE_A = `5511${now}1`;
  const JID_A = `${PHONE_A}@s.whatsapp.net`;
  const JID_GROUP = "12345678@g.us";

  beforeAll(async () => {
    const { data: p } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!p) throw new Error("Perfil não encontrado");
    profileId = p.id;

    const wsA = await supabaseAdmin.from("workspaces").insert({ name: `WS WA A ${now}`, owner_id: profileId, slug: `ws-wa-a-${now}` }).select("id").single();
    const wsB = await supabaseAdmin.from("workspaces").insert({ name: `WS WA B ${now}`, owner_id: profileId, slug: `ws-wa-b-${now}` }).select("id").single();
    WS_A_ID = wsA.data!.id;
    WS_B_ID = wsB.data!.id;

    const srcA = await supabaseAdmin.from("crm_sources").insert({ workspace_id: WS_A_ID, display_name: "WA Source A", provider: "mkton" } as CRMSourceInsert).select("id").single();
    SOURCE_A_ID = srcA.data!.id;

    const s1 = await supabaseAdmin.from("whatsapp_web_sessions").insert({ workspace_id: WS_A_ID, provider: "evolution", status: "conectado", instance_id: `inst-1-${now}` } as WhatsAppSessionInsert).select("id").single();
    SESS_1_ID = s1.data!.id;

    const lA = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead A Base", phone: PHONE_A } as LeadInsert).select("id").single();
    LEAD_A_ID = lA.data!.id;
  });

  afterAll(async () => {
    await supabaseAdmin.from("whatsapp_web_messages").delete().in("workspace_id", [WS_A_ID, WS_B_ID]);
    await supabaseAdmin.from("channel_messages").delete().in("workspace_id", [WS_A_ID, WS_B_ID]);
    await supabaseAdmin.from("leads").delete().in("workspace_id", [WS_A_ID, WS_B_ID]);
    await supabaseAdmin.from("whatsapp_web_sessions").delete().in("workspace_id", [WS_A_ID, WS_B_ID]);
    await supabaseAdmin.from("crm_sources").delete().in("workspace_id", [WS_A_ID, WS_B_ID]);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_A_ID, WS_B_ID]);
  });

  it("TEST 19.1: mensagens individuais com direções", async () => {
    const time = Date.now();
    const phone1 = `5511${time}1`;
    const jid1 = `${phone1}@s.whatsapp.net`;
    const l1 = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead 19.1", phone: phone1 } as LeadInsert).select("id").single();

    await supabaseAdmin.from("whatsapp_web_messages").insert([
      { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jid1, body: "WA Msg 1", from_me: false, received_at: new Date(time - 2000).toISOString(), message_id: `w1-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert,
      { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jid1, body: "WA Msg 2", from_me: true, received_at: new Date(time - 1000).toISOString(), message_id: `w2-${time}`, message_type: "text", delivery_status: "sent" } as WhatsAppMessageInsert
    ]);

    const result = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: l1.data!.id });
    expect(result).toHaveLength(2);
    expect(result[0].conteudo).toBe("WA Msg 1");
    expect(result[1].conteudo).toBe("WA Msg 2");
    expect(result[0].direcao).toBe("cliente");
    expect(result[1].direcao).toBe("time");
  });

  it("TEST 19.2: números parecidos - isolamento de histórico", async () => {
    const time = Date.now();
    const phoneA = `5511${time}1`;
    const phoneA2 = `5511${time}2`;
    const jidA = `${phoneA}@s.whatsapp.net`;
    const jidA2 = `${phoneA2}@s.whatsapp.net`;

    const lA = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead A Unique", phone: phoneA } as LeadInsert).select("id").single();
    const lA2 = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead A2 Unique", phone: phoneA2 } as LeadInsert).select("id").single();

    await supabaseAdmin.from("whatsapp_web_messages").insert([
      { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jidA, body: "Msg Lead A", from_me: false, received_at: new Date(time - 2000).toISOString(), message_id: `wA-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert,
      { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jidA2, body: "Msg Lead A2", from_me: false, received_at: new Date(time - 2000).toISOString(), message_id: `wA2-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert
    ]);

    const resultA = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: lA.data!.id });
    expect(resultA).toHaveLength(1);
    expect(resultA[0].conteudo).toBe("Msg Lead A");
    
    const resultA2 = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: lA2.data!.id });
    expect(resultA2).toHaveLength(1);
    expect(resultA2[0].conteudo).toBe("Msg Lead A2");
  });

  it("TEST 19.3: isolamento entre workspaces", async () => {
    const time = Date.now();
    
    // Lead A e Mensagem A já existem no Workspace A (criados no beforeAll ou aqui se preferir ser explícito)
    // Mas o teste pede para usar o MESMO telefone/JID no Workspace B
    
    const srcB = await supabaseAdmin.from("crm_sources").insert({ workspace_id: WS_B_ID, display_name: "WA Source B", provider: "mkton" } as CRMSourceInsert).select("id").single();
    const lB = await supabaseAdmin.from("leads").insert({ workspace_id: WS_B_ID, crm_source_id: srcB.data!.id, name: "Lead B Iso", phone: PHONE_A } as LeadInsert).select("id").single();
    const sB = await supabaseAdmin.from("whatsapp_web_sessions").insert({ workspace_id: WS_B_ID, provider: "evolution", status: "conectado", instance_id: `inst-b-${time}` } as WhatsAppSessionInsert).select("id").single();

    // Mensagem no Workspace B com o MESMO JID_A
    await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: WS_B_ID, session_id: sB.data!.id, remote_jid: JID_A, body: "Msg WS B", from_me: false, received_at: new Date().toISOString(), message_id: `wb-${time}`, message_type: "text", delivery_status: "received"
    } as WhatsAppMessageInsert);

    // Mensagem no Workspace A para o LEAD_A_ID (JID_A)
    await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: JID_A, body: "Msg WS A", from_me: false, received_at: new Date(time-1000).toISOString(), message_id: `wa-${time}`, message_type: "text", delivery_status: "received"
    } as WhatsAppMessageInsert);

    const resultA = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: LEAD_A_ID });
    
    // O histórico do Lead A deve conter sua mensagem mas NÃO a do Workspace B, mesmo sendo o mesmo JID
    expect(resultA.some(m => m.conteudo === "Msg WS A")).toBe(true);
    expect(resultA.some(m => m.conteudo === "Msg WS B")).toBe(false);
  });

  it("TEST 19.4: contrato de sessão - JIDs repetidos em sessões diferentes", async () => {
    const time = Date.now();
    const phoneSess = `5511${time}8`;
    const jidSess = `${phoneSess}@s.whatsapp.net`;
    const lSess = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead Sess", phone: phoneSess } as LeadInsert).select("id").single();

    const s2 = await supabaseAdmin.from("whatsapp_web_sessions").insert({ workspace_id: WS_A_ID, provider: "evolution", status: "conectado", instance_id: `inst-2-${time}` } as WhatsAppSessionInsert).select("id").single();
    const SESS_2_ID = s2.data!.id;

    await supabaseAdmin.from("whatsapp_web_messages").insert([
        { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jidSess, body: "Sessão 1", from_me: false, received_at: new Date(time-1000).toISOString(), message_id: `s1-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert,
        { workspace_id: WS_A_ID, session_id: SESS_2_ID, remote_jid: jidSess, body: "Sessão 2", from_me: false, received_at: new Date(time-500).toISOString(), message_id: `s2-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert
    ]);

    const result = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: lSess.data!.id });
    expect(result).toHaveLength(2);
    expect(result[0].conteudo).toBe("Sessão 1");
    expect(result[1].conteudo).toBe("Sessão 2");
  });

  it("TEST 19.5: grupo excluído", async () => {
    const time = Date.now();
    await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: JID_GROUP, body: "Group Msg", from_me: false, received_at: new Date().toISOString(), message_id: `wg-${time}`, message_type: "text", delivery_status: "received"
    } as WhatsAppMessageInsert);
    const result = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: LEAD_A_ID });
    expect(result.some(m => m.conteudo === "Group Msg")).toBe(false);
  });

  it("TEST 19.6: Meta + WA unificados", async () => {
    const time = Date.now();
    const phoneUnified = `5511${time}7`;
    const jidUnified = `${phoneUnified}@s.whatsapp.net`;
    const lUnified = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead Unified", phone: phoneUnified } as LeadInsert).select("id").single();
    const leadId = lUnified.data!.id;

    await supabaseAdmin.from("whatsapp_web_messages").insert([
        { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jidUnified, body: "Order WA 1", from_me: false, received_at: new Date(time - 3000).toISOString(), message_id: `w1-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert,
        { workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jidUnified, body: "Order WA 2", from_me: false, received_at: new Date(time - 1000).toISOString(), message_id: `w2-${time}`, message_type: "text", delivery_status: "received" } as WhatsAppMessageInsert
    ]);
    
    await supabaseAdmin.from("channel_messages").insert({
      workspace_id: WS_A_ID, lead_id: leadId, direction: "in", text: "Order Meta", received_at: new Date(time - 2000).toISOString(), thread_id: `t-${time}`, channel: "messenger"
    } as ChannelMessageInsert);

    const result = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: leadId, limit: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].conteudo).toBe("Order WA 1");
    expect(result[1].conteudo).toBe("Order Meta");
    expect(result[2].conteudo).toBe("Order WA 2");

    expect(result[0].direcao).toBe("cliente");
    expect(result[1].direcao).toBe("cliente");
    expect(result[2].direcao).toBe("cliente");
  });

  it("TEST 19.7: limite", async () => {
    const time = Date.now();
    const phoneLimit = `5511${time}6`;
    const jidLimit = `${phoneLimit}@s.whatsapp.net`;
    const lLimit = await supabaseAdmin.from("leads").insert({ workspace_id: WS_A_ID, crm_source_id: SOURCE_A_ID, name: "Lead Limit", phone: phoneLimit } as LeadInsert).select("id").single();
    
    for (let i = 0; i < 5; i++) {
        await supabaseAdmin.from("whatsapp_web_messages").insert({
            workspace_id: WS_A_ID, session_id: SESS_1_ID, remote_jid: jidLimit, body: `Msg ${i}`, from_me: false, received_at: new Date(time + (i * 1000)).toISOString(), message_id: `m-${i}-${time}`, message_type: "text", delivery_status: "received"
        } as WhatsAppMessageInsert);
    }
    const result = await getLeadRecentHistoryInternal({ workspaceId: WS_A_ID, leadId: lLimit.data!.id, limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].conteudo).toBe("Msg 3");
    expect(result[1].conteudo).toBe("Msg 4");
  });
});
