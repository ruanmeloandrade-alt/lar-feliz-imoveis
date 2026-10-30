import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyEvolutionStaleQrTransform,
  EVOLUTION_SAVED_QR_MAX_AGE_MS,
  isEvolutionQrTimestampFresh,
} from "../../../scripts/evolution-stale-qr-transform";

const evolutionSource = readFileSync("src/lib/evolution.functions.ts", "utf8");

describe("Evolution persisted QR freshness", () => {
  it("accepts a QR generated inside the validity window", () => {
    const now = Date.parse("2026-08-29T11:30:00.000Z");
    const generatedAt = new Date(now - EVOLUTION_SAVED_QR_MAX_AGE_MS + 1_000).toISOString();
    expect(isEvolutionQrTimestampFresh(generatedAt, now)).toBe(true);
  });

  it("rejects an expired QR instead of keeping a never-paired session alive", () => {
    const now = Date.parse("2026-08-29T11:30:00.000Z");
    const generatedAt = new Date(now - EVOLUTION_SAVED_QR_MAX_AGE_MS - 1).toISOString();
    expect(isEvolutionQrTimestampFresh(generatedAt, now)).toBe(false);
  });

  it("rejects missing, malformed and future timestamps", () => {
    const now = Date.parse("2026-08-29T11:30:00.000Z");
    expect(isEvolutionQrTimestampFresh(null, now)).toBe(false);
    expect(isEvolutionQrTimestampFresh("invalid", now)).toBe(false);
    expect(isEvolutionQrTimestampFresh(new Date(now + 1_000).toISOString(), now)).toBe(false);
  });

  it("changes readSavedQr to inspect qr_generated_at and ignore stale stored QR values", () => {
    const transformed = applyEvolutionStaleQrTransform(evolutionSource);
    expect(transformed).toContain(`const SAVED_QR_MAX_AGE_MS = ${EVOLUTION_SAVED_QR_MAX_AGE_MS}`);
    expect(transformed).toContain('.select("last_qr, metadata, updated_at")');
    expect(transformed).toContain("savedQr.metadata?.qr_generated_at ?? savedQr.updated_at ?? null");
    expect(transformed).toContain("return isSavedQrFresh(savedQr) ? savedQr?.last_qr ?? null : null");
  });

  it("keeps the existing automatic recovery/recreation path intact", () => {
    const transformed = applyEvolutionStaleQrTransform(evolutionSource);
    expect(transformed).toContain("const poll = await triggerAndPollQr");
    expect(transformed).toContain("export const recreateEvolutionInstance");
    expect(transformed).toContain("/instance/delete/");
    expect(transformed).toContain('status: "desconectado"');
    expect(transformed).toContain("metadata: { deleted: true");
  });

  it("fails high if the source contract changes", () => {
    expect(() => applyEvolutionStaleQrTransform(evolutionSource.replace('.select("last_qr")', '.select("last_qr, updated_at")')))
      .toThrow("readSavedQr não encontrado");
  });
});
