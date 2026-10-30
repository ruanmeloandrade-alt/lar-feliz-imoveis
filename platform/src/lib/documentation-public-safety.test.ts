import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "src/routes/documentacao.tsx"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/lib/documentation-public-catalog.ts"), "utf8");
const article = readFileSync(resolve(process.cwd(), "src/components/documentation/DocumentationArticleView.tsx"), "utf8");

describe("documentação pública MktOn", () => {
  it("não importa catálogo admin nem guias internos", () => {
    expect(route).not.toContain("documentation-admin-catalog");
    expect(route).not.toContain("DocumentationGuidesView");
    expect(route).not.toContain("DOCUMENTATION_START_MODULES");
    expect(route).not.toContain("Receitas");
    expect(route).not.toContain("Diagnóstico");
    expect(route).not.toContain("Conexões");
  });

  it("publica somente os sete manuais operacionais aprovados", () => {
    for (const id of ["crm-automacoes", "gestor-crm", "tracking", "gestor-trafego", "social-media", "workflow", "notas"]) {
      expect(catalog).toContain(`id: \"${id}\"`);
    }
    expect((catalog.match(/id: \"/g) ?? []).length).toBe(7);
  });

  it("não renderiza arquitetura ou conexão interna nos artigos públicos", () => {
    expect(article).not.toContain("Como se conecta a outros módulos");
    expect(article).not.toContain("Problemas comuns");
    expect(article).toContain("Como configurar e usar");
  });
});
