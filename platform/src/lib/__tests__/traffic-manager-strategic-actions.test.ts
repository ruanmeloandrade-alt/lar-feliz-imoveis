import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const strategic = readFileSync("src/lib/ai-agent/gestor-strategic-actions.server.ts", "utf8");
const facade = readFileSync("src/lib/ai-agent/gestor-tools.server.ts", "utf8");

describe("Gestor de Tráfego Task 14 — ações estratégicas compostas", () => {
  it("duplica preservando a origem e nasce pausado por padrão", () => {
    expect(strategic).toContain('status_option: "PAUSED"');
    expect(strategic).toContain('deep_copy: "true"');
    expect(strategic).toContain("preservedByCopyEndpoint: true");
    expect(strategic).toContain('finalStatus: z.enum(["PAUSED", "ACTIVE"]).default("PAUSED")');
  });

  it("limita mudanças de orçamento a 20 por cento", () => {
    expect(strategic).toContain("Math.abs(percentDelta) > 20");
    expect(strategic).toContain("alteração de orçamento acima de 20% por execução não é permitida");
    expect(strategic).toContain("budgetPercentDelta: z.number().min(-20).max(20).default(0)");
  });

  it("preserva tracking e só troca criativo quando explicitamente solicitado", () => {
    expect(strategic).toContain('changes.trackingSpecs = "preserved_from_source"');
    expect(strategic).toContain("if (input.level === \"ad\" && input.creativeId)");
    expect(strategic).toContain("não pertence à mesma conta do anúncio de origem");
  });

  it("expõe a mesma ação estratégica no facade compartilhado do Gestor", () => {
    expect(facade).toContain("buildStrategicActionTools");
    expect(facade).toContain("...buildStrategicActionTools(ctx)");
    expect(strategic).toContain("duplicate_meta_object_safely");
  });
});
