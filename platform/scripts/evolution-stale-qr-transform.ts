export const EVOLUTION_SAVED_QR_MAX_AGE_MS = 45_000;

export function isEvolutionQrTimestampFresh(timestamp: string | null | undefined, nowMs = Date.now()): boolean {
  if (!timestamp) return false;
  const generatedAt = Date.parse(timestamp);
  if (!Number.isFinite(generatedAt)) return false;
  const age = nowMs - generatedAt;
  return age >= 0 && age <= EVOLUTION_SAVED_QR_MAX_AGE_MS;
}

const READ_SAVED_QR_PATTERN = /async function readSavedQr\(supabase: unknown, sessionId: string\): Promise<string \| null> \{\s*const \{ data: savedQr \} = await \(supabase as [^)]+\)\s*\.from\("whatsapp_web_sessions"\)\s*\.select\("last_qr"\)\s*\.eq\("id", sessionId\)\s*\.maybeSingle\(\);\s*return savedQr\?\.last_qr \?\? null;\s*\}/m;

const READ_SAVED_QR_REPLACEMENT = `const SAVED_QR_MAX_AGE_MS = ${EVOLUTION_SAVED_QR_MAX_AGE_MS};

function isSavedQrFresh(
  savedQr: {
    last_qr?: string | null;
    metadata?: { qr_generated_at?: string | null } | null;
    updated_at?: string | null;
  } | null,
  nowMs = Date.now(),
): boolean {
  if (!savedQr?.last_qr) return false;
  const timestamp = savedQr.metadata?.qr_generated_at ?? savedQr.updated_at ?? null;
  if (!timestamp) return false;
  const generatedAt = Date.parse(timestamp);
  if (!Number.isFinite(generatedAt)) return false;
  const age = nowMs - generatedAt;
  return age >= 0 && age <= SAVED_QR_MAX_AGE_MS;
}

async function readSavedQr(supabase: unknown, sessionId: string): Promise<string | null> {
  type SavedQrLookup = {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          maybeSingle: () => Promise<{
            data: {
              last_qr?: string | null;
              metadata?: { qr_generated_at?: string | null } | null;
              updated_at?: string | null;
            } | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };

  const { data: savedQr } = await (supabase as SavedQrLookup)
    .from("whatsapp_web_sessions")
    .select("last_qr, metadata, updated_at")
    .eq("id", sessionId)
    .maybeSingle();
  return isSavedQrFresh(savedQr) ? savedQr?.last_qr ?? null : null;
}`;

export function isEvolutionStaleQrTransformApplied(source: string): boolean {
  return (
    source.includes("SAVED_QR_MAX_AGE_MS") &&
    source.includes("isSavedQrFresh") &&
    source.includes('.select("last_qr, metadata, updated_at")')
  );
}

export function applyEvolutionStaleQrTransform(source: string): string {
  if (isEvolutionStaleQrTransformApplied(source)) return source;

  const matches = source.match(new RegExp(READ_SAVED_QR_PATTERN.source, "gm"));
  if (!matches?.length) {
    throw new Error("[evolution-stale-qr] readSavedQr não encontrado");
  }
  if (matches.length > 1) {
    throw new Error("[evolution-stale-qr] readSavedQr ficou ambíguo");
  }

  return source.replace(READ_SAVED_QR_PATTERN, READ_SAVED_QR_REPLACEMENT);
}
