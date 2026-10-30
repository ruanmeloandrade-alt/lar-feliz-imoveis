import { describe, expect, it } from "vitest";
import { DOCUMENTATION_MODULES, filterDocumentationModules, getDocumentationModule } from "./documentation-catalog";

describe("documentation catalog", () => {
  it("covers the main operational surfaces", () => {
    const ids = DOCUMENTATION_MODULES.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      "crm-funis", "leads", "formularios", "empresas", "produtos", "arquivos", "inbox",
      "crm-automacoes", "gestor-crm", "workflow", "calendario", "notas", "tracking", "dashboard",
      "gestor-trafego", "social-media", "integracoes", "configuracoes", "faculdade",
    ]));
  });

  it("requires the full tutorial structure for every module", () => {
    for (const module of DOCUMENTATION_MODULES) {
      expect(module.article.whatIs.length).toBeGreaterThan(10);
      expect(module.article.purpose.length).toBeGreaterThan(10);
      expect(module.article.capabilities.length).toBeGreaterThan(0);
      expect(module.article.location.length).toBeGreaterThan(0);
      expect(module.article.prerequisites.length).toBeGreaterThan(0);
      expect(module.article.steps.length).toBeGreaterThan(0);
      expect(module.article.connections.length).toBeGreaterThan(0);
      expect(module.article.examples.length).toBeGreaterThan(0);
      expect(module.article.limitations.length).toBeGreaterThan(0);
      expect(module.article.troubleshooting.length).toBeGreaterThan(0);
    }
  });

  it("does not advertise every marketing source as ready", () => {
    const traffic = getDocumentationModule("gestor-trafego");
    expect(traffic?.article.limitations.join(" ")).toContain("Meta");
    expect(traffic?.article.limitations.join(" ")).toContain("Google");
  });

  it("keeps Faculdade MktOn separate from Faculdade Partners", () => {
    const academy = getDocumentationModule("faculdade");
    expect(academy?.title).toBe("Faculdade MktOn");
    expect(academy?.article.limitations.join(" ")).toContain("Faculdade Partners");
  });

  it("searches capabilities, connections and keywords", () => {
    expect(filterDocumentationModules("pixel").map((item) => item.id)).toContain("tracking");
    expect(filterDocumentationModules("zapier").map((item) => item.id)).toEqual(expect.arrayContaining(["crm-automacoes", "integracoes"]));
  });

  it("keeps external dependencies explicit", () => {
    expect(getDocumentationModule("inbox")?.status).toBe("requires_integration");
    expect(getDocumentationModule("gestor-trafego")?.status).toBe("requires_integration");
    expect(getDocumentationModule("gestor-crm")?.status).toBe("admin_only");
  });
});
