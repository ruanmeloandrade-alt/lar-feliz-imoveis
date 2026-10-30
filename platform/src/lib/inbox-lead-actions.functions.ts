import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeInternationalPhone, whatsappIdentityFromJid } from "@/lib/whatsapp-identity";

type AnySb = { from: (table: string) => any };

const ACTIVE_SALESBOT_STATUSES = ["queued", "pending", "running", "waiting", "waiting_message"];

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const workspaceId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!workspaceId) throw new Error("Workspace ativo não encontrado.");
  return workspaceId;
}

export function directWhatsappPhoneFromJid(value: unknown): string | null {
  const identity = whatsappIdentityFromJid(value);
  return identity?.kind === "direct" ? identity.digits : null;
}

export const resolveLeadWhatsappIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);
    const { data: lead, error: leadError } = await sb.from("leads")
      .select("id,phone,external_id").eq("id", data.leadId).eq("workspace_id", workspaceId).maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado.");

    const { findLatestLeadWhatsappIdentity } = await import("@/lib/whatsapp-session-routing.server");
    const conversation = await findLatestLeadWhatsappIdentity(sb, {
      workspaceId,
      leadId: data.leadId,
    });
    if (conversation?.kind === "direct") {
      return {
        phone: conversation.digits,
        whatsappUrl: `https://wa.me/${conversation.digits}`,
        source: "conversation_jid" as const,
        remoteJid: conversation.remoteJid,
        sessionId: conversation.sessionId,
      };
    }
    if (conversation?.kind === "group") {
      return {
        phone: null,
        whatsappUrl: null,
        source: "group_jid" as const,
        remoteJid: conversation.remoteJid,
        sessionId: conversation.sessionId,
      };
    }

    const row = lead as { phone?: string | null; external_id?: string | null };
    const externalIdentity = whatsappIdentityFromJid(row.external_id);
    if (externalIdentity?.kind === "direct") {
      return {
        phone: externalIdentity.digits,
        whatsappUrl: `https://wa.me/${externalIdentity.digits}`,
        source: "external_jid" as const,
        remoteJid: externalIdentity.remoteJid,
        sessionId: null,
      };
    }

    const normalized = normalizeInternationalPhone(row.phone);
    if (normalized.ok === false) {
      return {
        phone: null,
        whatsappUrl: null,
        source: normalized.reason === "ambiguous" ? "ambiguous" as const : "unresolved" as const,
        remoteJid: null,
        sessionId: null,
      };
    }
    return {
      phone: normalized.digits,
      whatsappUrl: `https://wa.me/${normalized.digits}`,
      source: "explicit_phone" as const,
      remoteJid: `${normalized.digits}@s.whatsapp.net`,
      sessionId: null,
    };
  });

export const getLeadAutomationControlState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);
    const { data: lead, error: leadError } = await sb.from("leads")
      .select("id,active_conversation_agent_id,ai_paused")
      .eq("id", data.leadId).eq("workspace_id", workspaceId).maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado.");

    const { data: runs, error: runsError } = await sb.from("salesbot_runs")
      .select("id,salesbot_id,status,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", data.leadId)
      .in("status", ACTIVE_SALESBOT_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (runsError) throw new Error(runsError.message);

    const leadRow = lead as { active_conversation_agent_id?: string | null; ai_paused?: boolean | null };
    return {
      salesbotActive: Array.isArray(runs) && runs.length > 0,
      salesbotRuns: (runs ?? []) as Array<{ id: string; salesbot_id: string; status: string; updated_at: string }>,
      agentActive: Boolean(leadRow.active_conversation_agent_id) && leadRow.ai_paused !== true,
      activeAgentId: leadRow.active_conversation_agent_id ?? null,
      agentPaused: leadRow.ai_paused === true,
    };
  });

export const stopLeadSalesbots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);
    const { data: lead } = await sb.from("leads").select("id").eq("id", data.leadId).eq("workspace_id", workspaceId).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado.");

    const now = new Date().toISOString();
    const { data: stopped, error } = await sb.from("salesbot_runs")
      .update({
        status: "finished",
        current_block_id: null,
        waiting_until: null,
        finished_at: now,
        last_error: "Parado manualmente pelo atendimento do Inbox.",
      })
      .eq("workspace_id", workspaceId)
      .eq("lead_id", data.leadId)
      .in("status", ACTIVE_SALESBOT_STATUSES)
      .select("id");
    if (error) throw new Error(error.message);

    await sb.from("lead_activities").insert({
      workspace_id: workspaceId,
      lead_id: data.leadId,
      type: "note",
      payload: { text: "SalesBot parado manualmente no Inbox.", source: "inbox_manual_control" },
      occurred_at: now,
    });
    return { ok: true, stopped: Array.isArray(stopped) ? stopped.length : 0 };
  });

export const stopLeadConversationAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);
    const { data: lead } = await sb.from("leads").select("id").eq("id", data.leadId).eq("workspace_id", workspaceId).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado.");

    const { pauseLeadAiAgentInternal } = await import("./ai-agent-control.server");
    await pauseLeadAiAgentInternal({ workspaceId, leadId: data.leadId });
    await sb.from("lead_activities").insert({
      workspace_id: workspaceId,
      lead_id: data.leadId,
      type: "note",
      payload: { text: "Agente IA parado manualmente no Inbox.", source: "inbox_manual_control" },
      occurred_at: new Date().toISOString(),
    });
    return { ok: true };
  });
