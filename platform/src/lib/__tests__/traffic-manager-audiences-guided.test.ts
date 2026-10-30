import { describe, expect, it } from "vitest";
import fs from "node:fs";

const panel = fs.readFileSync("src/components/meta/MetaAudiencesPanel.tsx", "utf8");

describe("Gestor de Tráfego - Públicos guiados", () => {
  it("mantém sincronização e reutilização de públicos reais", () => {
    expect(panel).toContain("Sincronizar do Meta");
    expect(panel).toContain("Públicos já sincronizados continuam disponíveis para reutilização sem recriar.");
  });

  it("oferece fluxo simples antes dos tipos avançados", () => {
    expect(panel).toContain("const SIMPLE_TYPES");
    expect(panel).toContain("Criação guiada");
    expect(panel).toContain("Mais tipos");
    expect(panel).toContain("showAdvanced ? CREATABLE_TYPES : SIMPLE_TYPES");
  });

  it("aceita Persona ou Estratégia como contexto sem inventar targeting", () => {
    expect(panel).toContain("listPersonas");
    expect(panel).toContain("listStrategies");
    expect(panel).toContain("Sem Persona/Estratégia");
    expect(panel).toContain("não inventa targeting");
  });

  it("prioriza os quatro fluxos mais comuns no modo simples", () => {
    expect(panel).toContain('"website", "engagement_ig", "lead_form", "customer_list"');
  });
});
