import { parseSlimInboxGroupConversationKey } from "./slim-inbox-group-key.core.ts";

type GroupTargetDb = { from: (table: string) => any };

export type SlimInboxGroupTarget = {
  id: string | null;
  workspace_id: string;
  session_id: string;
  group_jid: string;
  name: string | null;
  subject: string | null;
  conversation_key: string;
  sessionStatus: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Recognize a group reference before any fallback to individual controls. */
export function isSlimInboxGroupReference(value: string): boolean {
  return value.includes("|") || /@g\.us/i.test(value);
}

/**
 * Resolve metadata IDs and the session|JID keys returned by the Inbox RPC.
 * The authenticated client's RLS still applies to every lookup. A historical
 * group is read from its exact session; no group or technical lead is created.
 */
export async function resolveSlimInboxGroupTarget(
  db: GroupTargetDb,
  workspaceId: string,
  conversationId: string,
): Promise<SlimInboxGroupTarget | null> {
  if (!UUID.test(workspaceId)) throw new Error("Empresa ativa inválida.");
  const composite = conversationId.includes("|");
  const parsed = composite ? parseSlimInboxGroupConversationKey(conversationId) : null;
  if (composite && !parsed) throw new Error("Conversa de grupo inválida.");
  if (!parsed && !UUID.test(conversationId)) {
    throw new Error(isSlimInboxGroupReference(conversationId)
      ? "Selecione o grupo pela lista do Inbox para identificar a sessão correta."
      : "Conversa inválida.");
  }

  let metadataQuery = db.from("whatsapp_groups")
    .select("id,workspace_id,session_id,group_jid,name,subject")
    .eq("workspace_id", workspaceId);
  metadataQuery = parsed
    ? metadataQuery.eq("session_id", parsed.sessionId).eq("group_jid", parsed.groupJid)
    : metadataQuery.eq("id", conversationId);
  const metadata = await metadataQuery.maybeSingle();
  if (metadata.error) throw new Error("Não foi possível identificar o grupo nesta empresa.");
  const group = metadata.data as Omit<SlimInboxGroupTarget, "conversation_key" | "sessionStatus"> | null;
  if (!parsed && !group) return null;

  const sessionId = parsed?.sessionId ?? group!.session_id;
  const groupJid = parsed?.groupJid ?? group!.group_jid;
  // Validate metadata too, rather than trusting a malformed legacy row.
  const exact = parseSlimInboxGroupConversationKey(sessionId + "|" + groupJid);
  if (!exact || (group && (group.workspace_id !== workspaceId ||
      group.session_id !== exact.sessionId || group.group_jid !== exact.groupJid))) {
    throw new Error("O grupo não corresponde à empresa e à sessão selecionadas.");
  }

  const session = await db.from("whatsapp_web_sessions")
    .select("id,status,provider")
    .eq("workspace_id", workspaceId)
    .eq("id", exact.sessionId)
    .maybeSingle();
  if (session.error) throw new Error("Não foi possível verificar a sessão do grupo.");
  if (!session.data || session.data.provider !== "evolution") {
    throw new Error("A sessão do grupo não está disponível nesta empresa.");
  }

  if (!group) {
    const history = await db.from("whatsapp_web_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("session_id", exact.sessionId)
      .eq("remote_jid", exact.groupJid)
      .limit(1)
      .maybeSingle();
    if (history.error) throw new Error("Não foi possível verificar o histórico do grupo.");
    if (!history.data) throw new Error("Grupo não encontrado nesta sessão do Inbox.");
  }

  return {
    id: group?.id ?? null,
    workspace_id: workspaceId,
    session_id: exact.sessionId,
    group_jid: exact.groupJid,
    name: group?.name ?? "Grupo WhatsApp " + exact.groupJid.split("@")[0].slice(-6),
    subject: group?.subject ?? null,
    conversation_key: exact.sessionId + "|" + exact.groupJid,
    sessionStatus: String(session.data.status ?? ""),
  };
}
