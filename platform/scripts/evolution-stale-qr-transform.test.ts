import { describe, expect, it } from "vitest";
import {
  EVOLUTION_SAVED_QR_MAX_AGE_MS,
  applyEvolutionStaleQrTransform,
  isEvolutionQrTimestampFresh,
  isEvolutionStaleQrTransformApplied,
} from "./evolution-stale-qr-transform";

const READ_SAVED_QR_WITHOUT_TYPE = `async function readSavedQr(supabase: unknown, sessionId: string): Promise<string | null> {
  const { data: savedQr } = await (supabase as any)
    .from("whatsapp_web_sessions")
    .select("last_qr")
    .eq("id", sessionId)
    .maybeSingle();
  return savedQr?.last_qr ?? null;
}`;

describe("evolution stale QR build transform", () => {
  it("aplica a proteção mesmo quando SbQrLookup não existe na fonte", () => {
    const transformed = applyEvolutionStaleQrTransform(READ_SAVED_QR_WITHOUT_TYPE);

    expect(transformed).toContain('select("last_qr, metadata, updated_at")');
    expect(transformed).toContain("type SavedQrLookup");
    expect(transformed).toContain("isSavedQrFresh");
    expect(isEvolutionStaleQrTransformApplied(transformed)).toBe(true);
  });

  it("é idempotente quando o transform já foi aplicado", () => {
    const once = applyEvolutionStaleQrTransform(READ_SAVED_QR_WITHOUT_TYPE);
    expect(applyEvolutionStaleQrTransform(once)).toBe(once);
  });

  it("mantém a janela de validade em 45 segundos", () => {
    const now = Date.parse("2026-08-31T20:00:45.000Z");
    expect(EVOLUTION_SAVED_QR_MAX_AGE_MS).toBe(45_000);
    expect(isEvolutionQrTimestampFresh("2026-08-31T20:00:00.000Z", now)).toBe(true);
    expect(isEvolutionQrTimestampFresh("2026-08-31T19:59:59.999Z", now)).toBe(false);
    expect(isEvolutionQrTimestampFresh(null, now)).toBe(false);
  });
});
