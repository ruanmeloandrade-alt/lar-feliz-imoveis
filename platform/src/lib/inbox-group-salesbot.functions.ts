import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSlimInboxGroupTarget } from "./slim-inbox-group-target.core";

type AnySb = { from: (table: string) => any };
const ACTIVE_RUN_STATUSES = ["running", "waiting_message", "waiting_timer"] as const;

async function loadActiveWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data, error } = await sb
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível identificar a empresa ativa.");
  const workspaceId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!workspaceId) throw new Error("Workspace ativo não encontrado.");
  return workspaceId;
}

async function findGroup(
  sb: AnySb,
  workspaceId: string,
  conversationId: string,
) {
  return resolveSlimInboxGroupTarget(sb, workspaceId, conversationId);
}

export const resolveInboxSalesbotTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    // SLIM_INBOX_DIRECT_FIRST: a client conversation never depends on group tables.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.conversationId)) {
      const direct = await sb.from("leads").select("id")
        .eq("workspace_id", workspaceId).eq("id", data.conversationId).maybeSingle();
      if (direct.error) throw new Error(direct.error.message);
      if (direct.data) return { kind: "lead" as const, activeRunId: null, workspaceId, userId: context.userId };
    }
    const group = await findGroup(sb, workspaceId, data.conversationId);
    if (!group) throw new Error("Conversa não encontrada nesta empresa.");

    const { data: technicalLead, error: technicalLeadError } = await sb
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", group.group_jid)
      .eq("custom_data->>whatsapp_session_id", group.session_id)
      .eq("custom_data->>technical_group_context", "true")
      .limit(1)
      .maybeSingle();
    if (technicalLeadError) throw new Error("Não foi possível consultar o SalesBot deste grupo.");

    let activeRunId: string | null = null;
    if (technicalLead?.id) {
      const { data: activeRun, error: activeRunError } = await sb
        .from("salesbot_runs")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("lead_id", technicalLead.id)
        .in("status", [...ACTIVE_RUN_STATUSES])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeRunError) throw new Error("Não foi possível consultar as execuções deste grupo.");
      activeRunId = (activeRun as { id?: string } | null)?.id ?? null;
    }

    return {
      kind: "group" as const,
      groupId: group.id,
      groupJid: group.group_jid,
      sessionId: group.session_id,
      conversationKey: group.conversation_key,
      workspaceId,
      userId: context.userId,
      groupName: group.name ?? group.subject ?? group.group_jid,
      activeRunId,
    };
  });

export const startGroupSalesbotFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().min(1), salesbotId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const userSb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(userSb, context.userId);
    const { assertSlimOperator } = await import("./slim-workspace-operator.server");
    await assertSlimOperator(userSb, workspaceId, context.userId);
    const group = await findGroup(userSb, workspaceId, data.conversationId);
    if (!group) throw new Error("Grupo não encontrado neste workspace.");
    if (group.sessionStatus !== "conectado") {
      throw new Error("Conecte a sessão de origem do grupo antes de iniciar o SalesBot.");
    }

    const { data: bot, error: botError } = await userSb
      .from("salesbots")
      .select("id, name, is_active, scope")
      .eq("id", data.salesbotId)
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo")
      .maybeSingle();
    if (botError) throw new Error(botError.message);
    if (!bot) throw new Error("SalesBot de grupo não encontrado neste workspace.");
    if (bot.is_active !== true) throw new Error("Ative este SalesBot de grupo antes de enviá-lo.");

    const [{ supabaseAdmin }, { resolveOrCreateGroupTechnicalLead }, { startSalesbotRun }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/whatsapp-group-context.server"),
      import("@/lib/salesbot-runtime.server"),
    ]);
    const admin = supabaseAdmin as unknown as AnySb;
    const technicalLeadId = await resolveOrCreateGroupTechnicalLead(admin, {
      workspaceId,
      groupId: group.id,
      groupJid: group.group_jid,
      groupName: group.name ?? group.subject,
      sessionId: group.session_id,
    });

    const { data: existing, error: existingError } = await admin
      .from("salesbot_runs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("salesbot_id", data.salesbotId)
      .eq("lead_id", technicalLeadId)
      .in("status", [...ACTIVE_RUN_STATUSES])
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing?.id) throw new Error("Este SalesBot já está em execução neste grupo.");

    const runId = await startSalesbotRun(supabaseAdmin as never, {
      workspaceId,
      salesbotId: data.salesbotId,
      leadId: technicalLeadId,
      initialVariables: {
        trigger: "inbox-manual-group",
        group_inbox_manual: true,
        group_id: group.id,
        group_jid: group.group_jid,
        whatsapp_session_id: group.session_id,
        group_inbox_conversation_key: group.conversation_key,
        participante_telefone: "",
        participante_nome: "",
      },
    });
    if (!runId) throw new Error("Não foi possível iniciar o SalesBot neste grupo.");

    return {
      ok: true,
      runId,
      groupId: group.id,
      groupJid: group.group_jid,
      groupName: group.name ?? group.subject ?? group.group_jid,
    };
  });
