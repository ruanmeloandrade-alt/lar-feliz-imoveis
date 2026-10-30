import { parseSlimInboxGroupConversationKey } from './slim-inbox-group-key.core.ts';

export const SLIM_GROUP_MEDIA_BUCKET = 'inbox-outgoing';
export const SLIM_GROUP_MEDIA_ORIGIN = 'https://fnuhmypmhcwecziswbat.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_JID = /^[0-9-]{3,160}@g\.us$/;

export type SlimGroupMediaScope = {
  workspaceId: string;
  sessionId: string;
  groupJid: string;
  metadataId: string | null;
  messageId: string;
};
export type SlimGroupMediaRow = {
  id: string;
  workspace_id: string;
  session_id: string;
  remote_jid: string;
  message_id: string;
  from_me: boolean;
  message_type: string;
  media_url: string | null;
  delivery_status?: string | null;
  received_at: string;
  raw: unknown;
};

export function slimGroupRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function parseSlimGroupMediaInput(value: { groupId: string; messageId: string }) {
  if (!value || typeof value.groupId !== 'string' || value.groupId.length > 220 ||
      !UUID.test(value.messageId)) throw new Error('Referência do anexo inválida.');
  const parsed = parseSlimInboxGroupConversationKey(value.groupId);
  if (parsed) {
    if (!GROUP_JID.test(parsed.groupJid)) throw new Error('Conversa de grupo inválida.');
    return { messageId: value.messageId.toLowerCase(), metadataId: null,
      sessionId: parsed.sessionId.toLowerCase(), groupJid: parsed.groupJid };
  }
  if (!UUID.test(value.groupId)) throw new Error('Conversa de grupo inválida.');
  return { messageId: value.messageId.toLowerCase(), metadataId: value.groupId.toLowerCase(),
    sessionId: null, groupJid: null };
}

export function assertSlimGroupMediaScope(scope: SlimGroupMediaScope): void {
  if (![scope.workspaceId, scope.sessionId, scope.messageId].every(v => UUID.test(v)) ||
      !GROUP_JID.test(scope.groupJid) || (scope.metadataId !== null && !UUID.test(scope.metadataId))) {
    throw new Error('Referência do grupo inválida.');
  }
}

export function assertSlimGroupMediaMessage(row: SlimGroupMediaRow | null, scope: SlimGroupMediaScope): void {
  if (!row || row.id !== scope.messageId || row.workspace_id !== scope.workspaceId ||
      row.session_id !== scope.sessionId || row.remote_jid !== scope.groupJid ||
      typeof row.from_me !== 'boolean' || typeof row.message_id !== 'string' ||
      !row.message_id.length || row.message_id.length > 200 || /[\s\x00-\x1f]/.test(row.message_id)) {
    throw new Error('Mensagem não encontrada nesta conversa.');
  }
  const raw = slimGroupRecord(row.raw), data = slimGroupRecord(raw.data);
  const deleted = (record: Record<string, unknown>) =>
    ['deleted', 'deleted_for_me', 'deleted_for_all', 'revoked'].some(key => record[key] === true || record[key] === 'true');
  if (deleted(raw) || deleted(data) || deleted(slimGroupRecord(raw.slim_media)) ||
      /^(?:deleted|revoked|revoke)$/i.test(row.delivery_status ?? '') ||
      /^(?:deleted|revoked|revoke|protocolMessage)$/i.test(row.message_type)) {
    throw new Error('Esta mensagem foi apagada.');
  }
}

export function slimGroupMediaKind(type: unknown): 'image' | 'video' | 'audio' | 'document' | 'sticker' | null {
  const value = typeof type === 'string' ? type.toLowerCase() : '';
  if (value.includes('sticker')) return 'sticker';
  if (value.includes('image')) return 'image';
  if (value.includes('video') || value === 'ptv' || value === 'ptvmessage') return 'video';
  if (value.includes('audio') || value.includes('ptt')) return 'audio';
  if (value.includes('document') || value === 'pdf') return 'document';
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm',
  'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/3gpp': '3gp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'application/pdf': 'pdf', 'application/octet-stream': 'bin',
};

/** Only passive media types; SVG/HTML/XML must never become active content. */
export function safeSlimGroupMediaType(value: unknown, kind: string | null) {
  const fallbacks: Record<string, string> = {
    image: 'image/jpeg', sticker: 'image/webp', audio: 'audio/ogg', video: 'video/mp4', document: 'application/octet-stream',
  };
  const declared = typeof value === 'string' ? value.toLowerCase().trim() : '';
  const match = /^([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;\s*codecs=([a-z0-9.+-]+))?$/.exec(declared);
  const main = !declared ? fallbacks[kind ?? ''] ?? 'application/octet-stream'
    : match && EXTENSIONS[match[1]] ? match[1] : 'application/octet-stream';
  return {
    mimeType: match?.[2] && main.startsWith('audio/') ? `${main}; codecs=${match[2]}` : main,
    extension: EXTENSIONS[main] ?? 'bin',
  };
}

export function slimGroupMediaParts(row: SlimGroupMediaRow) {
  const raw = slimGroupRecord(row.raw), data = slimGroupRecord(raw.data);
  const message = slimGroupRecord(data.message), normalized = slimGroupRecord(raw.slim_media);
  const names = ['imageMessage', 'videoMessage', 'ptvMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  const mediaName = names.find(name => Object.keys(slimGroupRecord(message[name])).length > 0);
  const media = slimGroupRecord(mediaName ? message[mediaName] : null);
  const kind = slimGroupMediaKind(row.message_type) ?? slimGroupMediaKind(normalized.kind) ?? slimGroupMediaKind(mediaName);
  if (!kind) throw new Error('Esta mensagem não contém um anexo recuperável.');
  const mime = normalized.mime_type ?? media.mimetype ?? media.mimeType ?? data.mimetype ?? data.mimeType
    ?? raw.mimeType ?? raw.mimetype ?? raw.mime_type;
  return { raw, data, message, media, kind, ...safeSlimGroupMediaType(mime, kind) };
}

export function slimGroupEvolutionMediaKey(row: SlimGroupMediaRow): Record<string, unknown> {
  const raw = slimGroupRecord(row.raw), data = slimGroupRecord(raw.data);
  const key = slimGroupRecord(data.key ?? raw.key);
  if (key.id !== row.message_id || key.remoteJid !== row.remote_jid || key.fromMe !== row.from_me) {
    throw new Error('A referência do WhatsApp não corresponde à mensagem salva.');
  }
  const result: Record<string, unknown> = { id: row.message_id, remoteJid: row.remote_jid, fromMe: row.from_me };
  if (key.participant !== undefined && key.participant !== null) {
    if (typeof key.participant !== 'string' || !/^[0-9:.-]{3,100}@(?:s\.whatsapp\.net|lid)$/.test(key.participant)) {
      throw new Error('A referência do participante está inválida.');
    }
    result.participant = key.participant;
  }
  return result;
}

function scopedPath(path: string, scope: SlimGroupMediaScope): string | null {
  if (path.length > 650 || /[\s\x00-\x1f\x7f\\%?#]/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..')) return null;
  const current = `${scope.workspaceId}/groups/${scope.sessionId}/${scope.groupJid}/${scope.messageId}/`;
  if (path.startsWith(current) && /^[a-f0-9]{64}\.[a-z0-9]{2,5}$/.test(path.slice(current.length))) return path;
  // Compatibility with sendGroupMedia's historical safeGroupPathId.
  const ids = [scope.metadataId, `${scope.sessionId}|${scope.groupJid}`, scope.groupJid].filter(Boolean) as string[];
  for (const id of ids) {
    const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 160);
    const prefix = `${scope.workspaceId}/groups/${safeId}/`;
    if (path.startsWith(prefix) && /^[0-9]{10,16}-[a-zA-Z0-9_.-]{1,300}$/.test(path.slice(prefix.length))) return path;
  }
  return null;
}

export function slimGroupStoredMediaPath(row: Pick<SlimGroupMediaRow, 'media_url' | 'raw'>, scope: SlimGroupMediaScope): string | null {
  assertSlimGroupMediaScope(scope);
  if (typeof row.media_url === 'string' && row.media_url.length <= 1800) {
    try {
      const url = new URL(row.media_url);
      const match = /^\/storage\/v1\/object\/(?:sign|authenticated)\/inbox-outgoing\/(.+)$/.exec(url.pathname);
      if (url.origin === SLIM_GROUP_MEDIA_ORIGIN && !url.username && !url.password && !url.hash && match) {
        const path = scopedPath(decodeURIComponent(match[1]), scope);
        if (path) return path;
      }
    } catch { /* Invalid URL is never fetched. */ }
  }
  const stored = slimGroupRecord(row.raw).slim_media_storage_path;
  return typeof stored === 'string' ? scopedPath(stored, scope) : null;
}

/** A stable private pointer, without a signed token or embedded file in the database. */
export function slimGroupStoragePointer(path: string, scope: SlimGroupMediaScope): string {
  if (!scopedPath(path, scope)) throw new Error('Caminho privado do anexo inválido.');
  return `${SLIM_GROUP_MEDIA_ORIGIN}/storage/v1/object/authenticated/${SLIM_GROUP_MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
