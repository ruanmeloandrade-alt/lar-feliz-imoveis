import { describe, expect, it } from "vitest";
import { extrasProrationMonths } from "./proration";

describe("extrasProrationMonths", () => {
  it("cobra o período pago completo quando a compra acontece junto com o plano", () => {
    expect(extrasProrationMonths("1m", null)).toBe(1);
    expect(extrasProrationMonths("3m", null)).toBe(3);
    expect(extrasProrationMonths("6m", null)).toBe(6);
    expect(extrasProrationMonths("1y", null)).toBe(12);
  });

  it("mantém mínimo de um mês para compra avulsa perto do vencimento", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(extrasProrationMonths("6m", "2026-01-02T00:00:00.000Z", now)).toBe(1);
  });

  it("limita a cobrança avulsa à duração paga do período", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(extrasProrationMonths("3m", "2027-01-01T00:00:00.000Z", now)).toBe(3);
  });

  it("usa o período completo quando o vencimento salvo é inválido", () => {
    expect(extrasProrationMonths("1y", "data-invalida")).toBe(12);
  });
});
