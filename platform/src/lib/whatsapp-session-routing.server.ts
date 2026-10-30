/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  conversationKey,
  directWhatsappJidFromCanonicalDigits,
  normalizeInternationalPhone,
  whatsappIdentityFromJid,
  type WhatsappJidIdentity,
} from "@/lib/whatsapp-identity";

type AnySb = { from: (table: string) => any };

export function preferredWhatsappSessionId(customData: unknown): string | null {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return null;
  const value = (customData as Record<string, unknown>).whatsapp_session_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function resolveLeadEvolutionSession(
  sb: AnySb,
  input: { workspaceId: string; preferredSessionId?: string | null },
): Promise<string> {
  const { data, error } = await sb
    .from("whatsapp_web_sessions")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado")
    .order("last_connected_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = ((data ?? []) as Array<{ id?: string }>)
    .map((row) => row.id)
    .filter(Boolean) as string[];
  const preferred = input.preferredSessionId?.trim() || null;
  if (preferred) {
    if (ids.includes(preferred)) return preferred;
    throw new Error(
      "O número de WhatsApp desta conversa não está conectado. Reconecte a sessão correta antes de responder.",
    );
  }
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error("Nenhum WhatsApp Evolution conectado neste workspace.");
  throw new Error(
    "Esta conversa não está vinculada a um número de WhatsApp. Receba uma mensagem por esse número ou vincule a sessão antes de responder.",
  );
}

export type LeadWhatsappConversationIdentity = WhatsappJidIdentity & {
  sessionId: string | null;
  messageId: string | null;
  receivedAt: string | null;
};

export async function findLatestLeadWhatsappIdentity(
  sb: AnySb,
  input: { workspaceId: string; leadId: string; phone?: string | null; preferredSessionId?: string | null },
): Promise<LeadWhatsappConversationIdentity | null> {
  const { data: activities, error: activityError } = await sb
    .from("lead_activities")
    .select("payload,occurred_at")
    .eq("workspace_id", input.workspaceId)
    .eq("lead_id", input.leadId)
    .in("type", ["message_in", "message_out"])
    .order("occurred_at", { ascending: false })
    .limit(80);
  if (activityError) throw new Error(activityError.message);

  const activityRows = (activities ?? []) as Array<{
    payload?: Record<string, unknown> | null;
    occurred_at?: string | null;
  }>;

  // Novas atividades carregam JID/sessão diretamente. Isso evita lookup e mantém
  // a identidade técnica da conversa separada de lead.phone.
  for (const activity of activityRows) {
    const payload = activity.payload ?? {};
    const identity = whatsappIdentityFromJid(payload.whatsapp_remote_jid);
    const sessionId =
      typeof payload.whatsapp_session_id === "string" && payload.whatsapp_session_id.trim()
        ? payload.whatsapp_session_id.trim()
        : typeof payload.session_id === "string" && payload.session_id.trim()
          ? payload.session_id.trim()
          : null;
    if (input.preferredSessionId && sessionId !== input.preferredSessionId) continue;
    if (identity) {
      return {
        ...identity,
        sessionId,
        messageId:
          typeof payload.whatsapp_message_id === "string" ? payload.whatsapp_message_id : null,
        receivedAt: activity.occurred_at ?? null,
      };
    }
  }

  // Compatibilidade com atividades históricas: segue o message_id até a tabela
  // que preserva o remote_jid real recebido da Evolution. Diferente do metadado
  // novo acima, esse vínculo histórico pode ter sido criado pelo matcher legado
  // dos últimos 8 dígitos; portanto só é roteável se o JID direto concordar com
  // o telefone canônico conhecido do próprio lead.
  const historicalPhone = normalizeInternationalPhone(input.phone, {
    allowTrustedBare: true,
  });
  const messageIds = Array.from(
    new Set(
      activityRows
        .map((activity) => activity.payload?.whatsapp_message_id)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
  if (!messageIds.length) return null;

  const { data: messages, error: messageError } = await sb
    .from("whatsapp_web_messages")
    .select("message_id,remote_jid,to_jid,session_id,received_at")
    .eq("workspace_id", input.workspaceId)
    .in("message_id", messageIds)
    .order("received_at", { ascending: false })
    .limit(80);
  if (messageError) throw new Error(messageError.message);

  for (const row of (messages ?? []) as Array<{
    message_id?: string | null;
    remote_jid?: string | null;
    to_jid?: string | null;
    session_id?: string | null;
    received_at?: string | null;
  }>) {
    const identity =
      whatsappIdentityFromJid(row.remote_jid) ?? whatsappIdentityFromJid(row.to_jid);
    if (!identity) continue;
    if (input.preferredSessionId && row.session_id !== input.preferredSessionId) continue;
    if (identity.kind === "direct") {
      if (historicalPhone.ok === false || historicalPhone.digits !== identity.digits) {
        continue;
      }
    }
    return {
      ...identity,
      sessionId: row.session_id?.trim() || null,
      messageId: row.message_id?.trim() || null,
      receivedAt: row.received_at ?? null,
    };
  }
  return null;
}

export type LeadWhatsappRoutingTarget = LeadWhatsappConversationIdentity & {
  sessionId: string;
  conversationKey: string;
  source: "conversation_jid" | "explicit_phone";
};

export async function resolveLeadWhatsappRoutingTarget(
  sb: AnySb,
  input: {
    workspaceId: string;
    leadId: string;
    phone?: string | null;
    preferredSessionId?: string | null;
  },
): Promise<LeadWhatsappRoutingTarget> {
  const conversation = await findLatestLeadWhatsappIdentity(sb, {
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    phone: input.phone,
    preferredSessionId: input.preferredSessionId,
  });

  if (conversation) {
    const sessionId = await resolveLeadEvolutionSession(sb, {
      workspaceId: input.workspaceId,
      preferredSessionId: input.preferredSessionId ?? conversation.sessionId ?? null,
    });
    return {
      ...conversation,
      sessionId,
      conversationKey: conversationKey(sessionId, conversation.remoteJid),
      source: "conversation_jid",
    };
  }

  const normalized = normalizeInternationalPhone(input.phone);
  if (normalized.ok === false) {
    if (normalized.reason === "ambiguous") {
      throw new Error(
        "Número de WhatsApp ambíguo: informe o DDI explicitamente (ex.: +55, +351, +44, +32) antes do primeiro envio.",
      );
    }
    throw new Error("Lead sem número internacional de WhatsApp válido.");
  }

  const remoteJid = directWhatsappJidFromCanonicalDigits(normalized.digits);
  if (!remoteJid) throw new Error("Número internacional de WhatsApp inválido.");
  const sessionId = await resolveLeadEvolutionSession(sb, {
    workspaceId: input.workspaceId,
    preferredSessionId: input.preferredSessionId ?? null,
  });
  return {
    kind: "direct",
    remoteJid,
    number: normalized.digits,
    digits: normalized.digits,
    e164: normalized.e164,
    sessionId,
    messageId: null,
    receivedAt: null,
    conversationKey: conversationKey(sessionId, remoteJid),
    source: "explicit_phone",
  };
}

// SLIM_WHATSAPP_ORIGIN_V1
