/** A conversation list/history must not transport historical file bodies. */
export const SLIM_GROUP_HISTORY_SELECT =
  "id,message_id,session_id,remote_jid,sender_name,body,from_me,received_at,message_type," +
  "mime_type:raw->slim_media->>mime_type,file_name:raw->slim_media->>file_name," +
  "duration_seconds:raw->slim_media->>duration_seconds," +
  "legacy_mime_type:raw->>mimeType,legacy_file_name:raw->>fileName";

export function slimGroupMediaKind(value: unknown): string | null {
  const kind = String(value ?? "").toLowerCase().replace(/message$/, "");
  if (kind === "ptv") return "video";
  if (kind === "ptt") return "audio";
  return ["image", "video", "audio", "document", "sticker"].includes(kind) ? kind : null;
}

export type SlimGroupHistoryRow = {
  id: string; message_id: string; session_id?: string; remote_jid?: string;
  sender_name: string | null; body: string | null; from_me: boolean; received_at: string;
  message_type: string | null; mime_type?: string | null; file_name?: string | null;
  duration_seconds?: string | number | null; legacy_mime_type?: string | null; legacy_file_name?: string | null;
};

export function slimProjectedGroupMessage(row: SlimGroupHistoryRow) {
  const kind = slimGroupMediaKind(row.message_type);
  const duration = row.duration_seconds == null ? NaN : Number(row.duration_seconds);
  return {
    id: row.id,
    from: row.from_me ? "us" as const : "lead" as const,
    author: row.sender_name ?? undefined,
    text: row.body ?? (kind ? undefined : "Mensagem"),
    mediaUrl: null as string | null,
    mediaDeferred: Boolean(kind),
    mediaType: kind ?? row.message_type,
    mimeType: row.mime_type ?? row.legacy_mime_type ?? null,
    fileName: row.file_name ?? row.legacy_file_name ?? null,
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    whatsappMessageId: row.message_id,
    occurredAt: row.received_at,
  };
}

/** Older cache and Realtime rows also go through the deferred group contract. */
export function slimScrubGroupHistoryMedia<T extends { mediaUrl?: string | null; mediaType?: string | null; mediaDeferred?: boolean }>(row: T): T {
  const kind = slimGroupMediaKind(row.mediaType);
  return { ...row, mediaUrl: null, mediaType: kind ?? row.mediaType,
    mediaDeferred: Boolean(kind || row.mediaDeferred || row.mediaUrl) };
}

/** A group JID alone is shared by every connected account participating in it. */
export function slimGroupRealtimeMessage(
  record: Record<string, unknown>,
  scope: { workspaceId?: string | null; sessionId?: string | null; groupJid?: string | null },
) {
  if (!scope.workspaceId || !scope.sessionId || !scope.groupJid ||
      record.workspace_id !== scope.workspaceId || record.session_id !== scope.sessionId ||
      record.remote_jid !== scope.groupJid || typeof record.id !== "string" || !record.id) return null;
  const raw = record.raw && typeof record.raw === "object" ? record.raw as Record<string, unknown> : {};
  const meta = raw.slim_media && typeof raw.slim_media === "object" ? raw.slim_media as Record<string, unknown> : {};
  const stringOrNull = (value: unknown) => typeof value === "string" ? value : null;
  return slimProjectedGroupMessage({
    id: record.id,
    message_id: stringOrNull(record.message_id) ?? "",
    session_id: scope.sessionId,
    remote_jid: scope.groupJid,
    sender_name: stringOrNull(record.sender_name),
    body: stringOrNull(record.body),
    from_me: record.from_me === true,
    received_at: stringOrNull(record.received_at) ?? new Date().toISOString(),
    message_type: stringOrNull(record.message_type),
    mime_type: stringOrNull(meta.mime_type),
    file_name: stringOrNull(meta.file_name),
    duration_seconds: typeof meta.duration_seconds === "number" || typeof meta.duration_seconds === "string"
      ? meta.duration_seconds : null,
    legacy_mime_type: stringOrNull(raw.mimeType),
    legacy_file_name: stringOrNull(raw.fileName),
  });
}
