import { z } from "zod";
import { adminClient } from "@/lib/meta-server";
import { resolveOrCreateGroupTechnicalLead } from "./whatsapp-group-context.server";

const RuleActionSchema = z.object({
  type: z.enum(["send_message", "send_dm", "start_bot", "remove_member"]),
  message: z.string().optional(),
  botId: z.string().uuid().optional(),
});

const TriggerSchema = z.object({
  id: z.string(),
  type: z.enum(["member_join", "member_leave", "keyword", "all_messages", "link_not_allowed", "schedule"]),
  enabled: z.boolean(),
  config: RuleActionSchema.extend({
    keywords: z.string().optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  }),
});

export type GroupEventData = {
  workspaceId: string;
  sessionId: string;
  groupJid: string;
  type: "message" | "member_join" | "member_leave";
  text?: string;
  senderPhone?: string;
  senderName?: string;
};

export async function dispatchGroupEvent(data: GroupEventData) {
  const admin = adminClient();

  // 1. Busca o grupo e suas regras
  const { data: group } = await admin
    .from("whatsapp_groups")
    .select("id, rules, is_admin")
    .eq("workspace_id", data.workspaceId)
    .eq("session_id", data.sessionId)
    .eq("group_jid", data.groupJid)
    .maybeSingle();

  if (!group || !group.rules) return { ok: true, status: "no_rules" };

  const rules = (group.rules as any).triggers as z.infer<typeof TriggerSchema>[] | undefined;
  if (!rules || !rules.length) return { ok: true, status: "empty_rules" };

  // `schedule` é executado pelo scheduler durável (`salesbot_runs.waiting_timer`),
  // então eventos de mensagem/entrada/saída nunca o disparam por acidente.
  const activeRules = rules.filter((r) => r.enabled && r.type !== "schedule");

  for (const rule of activeRules) {
    let matched = false;

    if (data.type === "member_join" && rule.type === "member_join") matched = true;
    if (data.type === "member_leave" && rule.type === "member_leave") matched = true;

    if (data.type === "message") {
      const text = (data.text || "").toLowerCase();

      if (rule.type === "all_messages") matched = true;

      if (rule.type === "keyword" && rule.config.keywords) {
        const kws = rule.config.keywords.split(",").map((k) => k.trim().toLowerCase());
        if (kws.some((k) => text.includes(k))) matched = true;
      }

      if (rule.type === "link_not_allowed") {
        const hasLink = /https?:\/\/[^\s]+/.test(text);
        if (hasLink) matched = true;
      }
    }

    if (matched) {
      await executeGroupAction(admin, data, rule, group.is_admin);
    }
  }

  return { ok: true };
}

async function executeGroupAction(
  admin: any,
  event: GroupEventData,
  rule: z.infer<typeof TriggerSchema>,
  isAdmin: boolean,
) {
  const { sendWhatsappText } = await import("./salesbot-runtime.server");
  const targetPhone = rule.config.type === "send_dm" ? event.senderPhone : event.groupJid;

  if (!targetPhone) return;

  const vars = {
    participante_telefone: event.senderPhone || "",
    participante_nome: event.senderName || "",
  };

  switch (rule.config.type) {
    case "send_message":
    case "send_dm":
      if (rule.config.message) {
        await sendWhatsappText(admin, event.workspaceId, targetPhone, rule.config.message, event.sessionId);
      }
      break;

    case "start_bot":
      if (rule.config.botId) {
        const leadId = await resolveOrCreateGroupTechnicalLead(admin, {
          workspaceId: event.workspaceId,
          groupJid: event.groupJid,
          sessionId: event.sessionId,
        });
        const { startSalesbotRun } = await import("./salesbot-runtime.server");
        await startSalesbotRun(admin, {
          workspaceId: event.workspaceId,
          salesbotId: rule.config.botId,
          leadId,
          initialVariables: vars,
        });
      }
      break;

    case "remove_member":
      if (isAdmin && event.senderPhone && event.type === "message") {
        // Implementar via Evolution se necessário, ou usar a função se existir
        // Por enquanto logamos ou usamos fetch direto
      }
      break;
  }
}
