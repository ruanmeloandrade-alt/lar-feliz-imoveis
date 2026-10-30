// Tipos e helpers do Inbox Chat. Sem conversas simuladas.
// Conversas reais virão por integração (WhatsApp, e-mail, etc.) - por enquanto vazio.

export type ChatChannel = "leads" | "equipe" | "suporte";
export type ChatMessageFrom = "me" | "them";

export type ChatReaction =
 | string
 | {
   emoji: string;
   fromMe?: boolean | null;
   at?: string | null;
 };

export interface ChatMessage {
 id: string;
 from: ChatMessageFrom;
 author?: string;
 text?: string;
 mediaUrl?: string | null;
 mediaDeferred?: boolean;
 mediaType?: "image" | "video" | "audio" | "document" | "sticker" | string | null;
 mimeType?: string | null;
 fileName?: string | null;
 audioSeconds?: number;
 reactions?: ChatReaction[];
 whatsappMessageId?: string | null;
 sentAt: string;
 edited?: boolean;
 deletedForMe?: boolean;
 deletedForAll?: boolean;
}


export interface ChatConversation {
 id: string;
 channel: ChatChannel;
 name: string;
 subtitle?: string;
 avatarUrl?: string;
 isGroup?: boolean;
 pinned?: boolean;
 favorite?: boolean;
 unreadCount?: number;
 readStateUnavailable?: boolean;
 lastMessageFrom: ChatMessageFrom;
 lastMessagePreview: string;
 lastMessageAt: string;
 status?: "online" | "aguardando" | "standby" | "aberto" | "resolvido";
 labels?: string[];
 messages: ChatMessage[];
 leadId?: string;
 ticketCode?: string;
 companyId?: string;
 productIds?: string[];
 sourceProvider?: string;
  whatsappSessionId?: string | null;
  whatsappOrigin?: string | null;
  groupJid?: string;
  groupSessionId?: string;
}

export const LEAD_CONVERSATIONS: ChatConversation[] = [];
export const TEAM_CONVERSATIONS: ChatConversation[] = [];
export const SUPPORT_CONVERSATIONS: ChatConversation[] = [];

export function getChannelConversations(channel: ChatChannel): ChatConversation[] {
 switch (channel) {
 case "leads": return LEAD_CONVERSATIONS;
 case "equipe": return TEAM_CONVERSATIONS;
 case "suporte": return SUPPORT_CONVERSATIONS;
 }
}

export function getConversation(channel: ChatChannel, id: string) {
 return getChannelConversations(channel).find((c) => c.id === id);
}

const TZ = "America/Sao_Paulo";

export function chatTime(iso: string) {
 return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function dayKey(d: Date) {
 return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
}

export function chatDayLabel(iso: string) {
 const d = new Date(iso);
 const today = new Date();
 if (dayKey(d) === dayKey(today)) return "Hoje";
 const yest = new Date(today);
 yest.setDate(today.getDate() - 1);
 if (dayKey(d) === dayKey(yest)) return "Ontem";
 return dayKey(d);
}

export function chatPreviewTime(iso: string) {
 const d = new Date(iso);
 const today = new Date();
 if (dayKey(d) === dayKey(today)) return chatTime(iso);
 const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
 if (diffDays === 1) return "Ontem";
 if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: TZ });
 return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
}

export function initials(name: string) {
 const clean = name.replace(/^#\s*/, "");
 return clean.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// SLIM_INBOX_DB_RELIEF_V1

// SLIM_INBOX_MEDIA_ON_DEMAND_V1
