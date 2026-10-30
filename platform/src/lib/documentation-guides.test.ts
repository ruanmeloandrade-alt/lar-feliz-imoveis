import { describe, expect, it } from "vitest";
import { DOCUMENTATION_CONNECTIONS, DOCUMENTATION_DIAGNOSTICS, DOCUMENTATION_RECIPES } from "./documentation-guides";

describe("documentation guides", () => {
  it("documents the main cross-module connections", () => {
    const titles = DOCUMENTATION_CONNECTIONS.map((item) => item.title).join(" | ");
    expect(titles).toContain("Formulário → Lead → CRM → Automação");
    expect(titles).toContain("Tracking → CRM → Dashboard / Gestor de Tráfego");
    expect(titles).toContain("SalesBot → Make / n8n / Zapier / Webhook");
  });

  it("keeps connection notes explicit instead of promising invisible automation", () => {
    for (const connection of DOCUMENTATION_CONNECTIONS) {
      expect(connection.flow.length).toBeGreaterThan(1);
      expect(connection.notes.length).toBeGreaterThan(0);
    }
  });

  it("gives every recipe prerequisites, steps and validation", () => {
    for (const recipe of DOCUMENTATION_RECIPES) {
      expect(recipe.modules.length).toBeGreaterThan(0);
      expect(recipe.prerequisites.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(1);
      expect(recipe.validation.length).toBeGreaterThan(0);
    }
  });

  it("does not prescribe unsupported NPS automation as a ready recipe", () => {
    const serialized = JSON.stringify(DOCUMENTATION_RECIPES).toLowerCase();
    expect(serialized).not.toContain("nps");
  });

  it("includes escalation criteria in every diagnostic", () => {
    for (const diagnostic of DOCUMENTATION_DIAGNOSTICS) {
      expect(diagnostic.checks.length).toBeGreaterThan(1);
      expect(diagnostic.escalateWhen.length).toBeGreaterThan(10);
    }
  });

  it("covers access, integrations, automations, tracking, dashboard and social failures", () => {
    const ids = DOCUMENTATION_DIAGNOSTICS.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      "acesso-bloqueado",
      "canal-desconectado",
      "automacao-nao-dispara",
      "tracking-sem-evento",
      "dado-dashboard",
      "integracao-oauth",
      "social-imagem",
    ]));
  });
});
