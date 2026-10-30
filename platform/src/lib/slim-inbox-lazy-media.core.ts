/**
 * The Inbox first fetches only JSONB metadata, never full historical files.
 * A separate authorized server function reads one attachment on user request.
 */
export const SLIM_LEAD_ACTIVITY_META_SELECT =
  'id,type,occurred_at,preview_text:payload->>text,media_type:payload->>media_type,' +
  'mime_type:payload->>mime_type,file_name:payload->>file_name,duration_seconds:payload->>duration_seconds,' +
  'whatsapp_message_id:payload->>whatsapp_message_id,reactions:payload->reactions,' +
  'deleted_for_me:payload->>deleted_for_me,deleted_for_all:payload->>deleted_for_all,' +
  'error_text:payload->>error,transcription:payload->>transcription';

export type SlimProjectedActivityRow = {
  id: string;
  type: string;
  occurred_at: string;
  preview_text: string | null;
  media_type: string | null;
  mime_type: string | null;
  file_name: string | null;
  duration_seconds: string | null;
  whatsapp_message_id: string | null;
  reactions: unknown;
  deleted_for_me: string | boolean | null;
  deleted_for_all: string | boolean | null;
  error_text: string | null;
  transcription: string | null;
};

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function slimProjectedActivity(row: SlimProjectedActivityRow) {
  const seconds = row.duration_seconds == null ? NaN : Number(row.duration_seconds);
  return {
    id: row.id,
    type: row.type,
    text: row.preview_text ?? null,
    mediaUrl: null as string | null,
    mediaDeferred: hasText(row.media_type) || hasText(row.mime_type) || hasText(row.file_name),
    mediaType: row.media_type ?? null,
    mimeType: row.mime_type ?? null,
    fileName: row.file_name ?? null,
    durationSeconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
    whatsappMessageId: row.whatsapp_message_id ?? null,
    reactions: (Array.isArray(row.reactions) ? row.reactions : []) as Array<
      string | { emoji: string; fromMe?: boolean | null; at?: string | null }
    >,
    deletedForMe: row.deleted_for_me === true || row.deleted_for_me === 'true',
    deletedForAll: row.deleted_for_all === true || row.deleted_for_all === 'true',
    from: row.type === 'message_out' || row.type === 'note' ? 'us' as const : 'lead' as const,
    occurredAt: row.occurred_at,
    error: row.error_text ?? null,
    transcription: row.transcription ?? null,
  };
}

/** Scrub old inline data URLs from hot/cold cache or live messages. */
export function slimScrubInlineMedia<T extends {
  mediaUrl?: string | null;
  mediaDeferred?: boolean;
}>(row: T): T {
  if (typeof row.mediaUrl !== 'string' || !row.mediaUrl.startsWith('data:')) return row;
  return { ...row, mediaUrl: null, mediaDeferred: true };
}

export function slimAllowStoredMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 8) return null;
  const maxEncodedChars = Math.ceil(16 * 1024 * 1024 * 4 / 3) + 2048;
  if (value.length > maxEncodedChars) return null;
  if (/^https?:\/\/[^ \t\r\n]+$/i.test(value)) return value;
  if (/^data:(?:image|audio|video|application)\/[a-z0-9.+-]+(?:;[^,\r\n]{0,120})?;base64,[a-z0-9+/=\r\n]+$/i.test(value)) return value;
  return null;
}

/**
 * Re-sign a private workspace-scoped Storage object, including old outgoing
 * signed links that expire. The caller must already have checked Auth/RLS.
 */
export function slimInboxStoredMediaPath(payload:Record<string,unknown>,wsId:string,leadId:string):string|null {
 const prefix=wsId+'/'+leadId+'/';
 const stored=typeof payload.media_storage_path==='string'?payload.media_storage_path:null;
 let path=stored;
 if(!path&&typeof payload.media_url==='string'){
   try {
     const url=new URL(payload.media_url);
     const route='/storage/v1/object/sign/inbox-outgoing/';
     if(url.protocol==='https:'&&url.hostname.endsWith('.supabase.co')&&url.pathname.startsWith(route)) {
       path=decodeURIComponent(url.pathname.slice(route.length));
     }
   } catch {return null;}
 }
 if(!path||path.length>550||!path.startsWith(prefix)||path.includes('..')||path.includes('\\')||
    /[\r\n?#]/.test(path))return null;
 return path;
}
