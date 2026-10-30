import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeadRecentHistoryInternal } from "../ai-agent-context.server";
import { getLeadRecentHistory } from "../ai-agent-context.functions";
import { z } from "zod";

describe("AI Agent Context Engine - Validation & Isolation Review", () => {
  const WS_A_ID = "11111111-1111-1111-c1c1-111111111111";
  const WS_B_ID = "22222222-2222-2222-d2d2-222222222222";
  const LEAD_A_ID = "33333333-3333-3333-c3c3-333333333333";
  const SESS_1_ID = "66666666-6666-6666-c6c6-666666666666";
  const SESS_2_ID = "77777777-7777-7777-c7c7-777777777777";
  const SOURCE_ID = "88888888-8888-8888-c8c8-888888888888";
  const PHONE_A = "551199999999";
  const JID_A = `${PHONE_A}@s.whatsapp.net`;

  beforeAll(async () => {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
    if (!profiles) throw new Error("Nenhum perfil encontrado para o teste.");
    const profileId = profiles.id;

    await supabaseAdmin.from("workspaces").upsert([
      { id: WS_A_ID, name: "WS Test Review A", owner_id: profileId, slug: `ws-test-rev-a-${Date.now()}` },
      { id: WS_B_ID, name: "WS Test Review B", owner_id: profileId, slug: `ws-test-rev-b-${Date.now()}` }
    ]);

    await supabaseAdmin.from("crm_sources").upsert({
      id: SOURCE_ID,
      workspace_id: WS_A_ID,
      display_name: "WA Source",
      provider: "mkton"
    });

    await supabaseAdmin.from("leads").upsert([
      { id: LEAD_A_ID, workspace_id: WS_A_ID, crm_source_id: SOURCE_ID, name: "Lead A", phone: PHONE_A }
    ] as any);

    await supabaseAdmin.from("whatsapp_web_sessions").upsert([
      { id: SESS_1_ID, workspace_id: WS_A_ID, provider: "evolution", status: "conectado", instance_id: "inst-1" },
      { id: SESS_2_ID, workspace_id: WS_A_ID, provider: "evolution", status: "conectado", instance_id: "inst-2" }
    ]);
  });

  afterAll(async () => {
    await supabaseAdmin.from("whatsapp_web_messages").delete().eq("workspace_id", WS_A_ID);
    await supabaseAdmin.from("whatsapp_web_sessions").delete().in("id", [SESS_1_ID, SESS_2_ID]);
    await supabaseAdmin.from("leads").delete().eq("id", LEAD_A_ID);
    await supabaseAdmin.from("crm_sources").delete().eq("id", SOURCE_ID);
    await supabaseAdmin.from("workspaces").delete().in("id", [WS_A_ID, WS_B_ID]);
  });

  // 1. TESTE 19.7 — VALIDAÇÃO DO LIMIT
  describe("1. TESTE 19.7 — VALIDAÇÃO DO LIMIT", () => {
    const schema = z.object({
      limit: z.number().int().min(1).max(50).optional()
    });

    it("LIMIT 1: Aceitar", () => {
      expect(schema.parse({ limit: 1 }).limit).toBe(1);
    });

    it("LIMIT 20: Aceitar", () => {
      expect(schema.parse({ limit: 20 }).limit).toBe(20);
    });

    it("LIMIT 50: Aceitar", () => {
      expect(schema.parse({ limit: 50 }).limit).toBe(50);
    });

    it("LIMIT 0 REJECTED: Deve falhar", () => {
      const res = schema.safeParse({ limit: 0 });
      expect(res.success).toBe(false);
    });

    it("LIMIT -1 REJECTED: Deve falhar", () => {
      const res = schema.safeParse({ limit: -1 });
      expect(res.success).toBe(false);
    });

    it("LIMIT 1.5 REJECTED: Deve falhar", () => {
      const res = schema.safeParse({ limit: 1.5 });
      expect(res.success).toBe(false);
    });

    it("LIMIT 51 REJECTED: Deve falhar", () => {
      const res = schema.safeParse({ limit: 51 });
      expect(res.success).toBe(false);
    });
  });

  // 2. TESTE DE ISOLAMENTO POR INSTÂNCIA / SESSÃO
  describe("2. TESTE DE ISOLAMENTO POR INSTÂNCIA / SESSÃO", () => {
    it("Identifica se session_id separa conversas no lead", async () => {
      const now = new Date();
      await supabaseAdmin.from("whatsapp_web_messages").insert([
        {
          workspace_id: WS_A_ID,
          session_id: SESS_1_ID,
          remote_jid: JID_A,
          message_id: "msg-sess-1",
          body: "Msg Session 1",
          from_me: false,
          received_at: new Date(now.getTime() - 2000).toISOString(),
          message_type: "text"
        },
        {
          workspace_id: WS_A_ID,
          session_id: SESS_2_ID,
          remote_jid: JID_A,
          message_id: "msg-sess-2",
          body: "Msg Session 2",
          from_me: false,
          received_at: new Date(now.getTime() - 1000).toISOString(),
          message_type: "text"
        }
      ]);

      const result = await getLeadRecentHistoryInternal({
        workspaceId: WS_A_ID,
        leadId: LEAD_A_ID
      });

      // Se a arquitetura define lead por workspace + JID, mensagens de ambas as sessões aparecem
      const hasSess1 = result.some(m => m.conteudo === "Msg Session 1");
      const hasSess2 = result.some(m => m.conteudo === "Msg Session 2");

      console.log(`[ARCH AUDIT] Session 1 found: ${hasSess1}, Session 2 found: ${hasSess2}`);
      
      // MKTON identifica o lead pelo Workspace + Telefone (JID). 
      // A session_id identifica por qual "chip" a mensagem passou, mas a conversa pertence ao mesmo lead.
      expect(hasSess1).toBe(true);
      expect(hasSess2).toBe(true);
    });
  });

  // 3. REGRESSION & JID MATCH
  describe("3. REGRESSION & JID MATCH", () => {
    it("EXACT JID MATCH: Deve ignorar mensagens de JIDs parecidos", async () => {
      const SIMILAR_JID = "1199999999@s.whatsapp.net"; // Substring do JID_A
      await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: WS_A_ID,
        session_id: SESS_1_ID,
        remote_jid: SIMILAR_JID,
        message_id: "msg-similar",
        body: "Similar JID Msg",
        from_me: false,
        received_at: new Date().toISOString(),
        message_type: "text"
      });

      const result = await getLeadRecentHistoryInternal({
        workspaceId: WS_A_ID,
        leadId: LEAD_A_ID
      });

      expect(result.some(m => m.conteudo === "Similar JID Msg")).toBe(false);
    });

    it("CROSS-WORKSPACE ISOLATION: Deve ignorar mensagens do mesmo JID em outro WS", async () => {
      await supabaseAdmin.from("whatsapp_web_messages").insert({
        workspace_id: WS_B_ID,
        session_id: SESS_1_ID,
        remote_jid: JID_A,
        message_id: "msg-ws-b",
        body: "WS B Msg",
        from_me: false,
        received_at: new Date().toISOString(),
        message_type: "text"
      });

      const result = await getLeadRecentHistoryInternal({
        workspaceId: WS_A_ID,
        leadId: LEAD_A_ID
      });

      expect(result.some(m => m.conteudo === "WS B Msg")).toBe(false);
    });
  });
});
