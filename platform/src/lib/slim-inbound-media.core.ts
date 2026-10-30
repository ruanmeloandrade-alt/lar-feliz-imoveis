/** Keep receipt of a message independent from downloading its attachment. */
export function slimDeferredInboundMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    // WhatsApp's encrypted CDN URL is not a playable/downloadable attachment.
    if (url.hostname === "mmg.whatsapp.net" || url.hostname.endsWith(".mmg.whatsapp.net")) return null;
    return url.href;
  } catch {
    return null;
  }
}

const BINARY_FIELDS = new Set([
  "base64", "mediabase64", "jpegthumbnail", "pngthumbnail", "thumbnailbytes",
  "thumbnail", "thumbnaildata", "filebytes", "mediabytes",
]);
const CREDENTIAL_FIELDS = new Set(["apikey", "api_key", "authorization", "webhook_secret"]);

/** Preserve the provider key and message metadata, never embedded file bytes. */
export function slimSanitizeEvolutionMessage(value: unknown, depth = 0): unknown {
  if (depth > 24) return null;
  if (typeof value === "string") {
    if (/^data:[^,]*[;,]/i.test(value)) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map(item => slimSanitizeEvolutionMessage(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (BINARY_FIELDS.has(lower) || CREDENTIAL_FIELDS.has(lower)) continue;
    result[key] = slimSanitizeEvolutionMessage(item, depth + 1);
  }
  return result;
}

export function slimEvolutionMessageSnapshot(
  envelope: Record<string, unknown>, item: Record<string, unknown>,
  media: { kind: string; mimeType: string; fileName: string | null; durationSeconds: number | null } | null,
): Record<string, unknown> {
  const clean = slimSanitizeEvolutionMessage({ ...envelope, data: item }) as Record<string, unknown>;
  if (media) clean.slim_media = {
    kind: media.kind,
    mime_type: media.mimeType,
    file_name: media.fileName,
    duration_seconds: media.durationSeconds,
  };
  return clean;
}
