import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/dashboard/AppSidebar.tsx", "utf8");
const forms = readFileSync("src/lib/forms.functions.ts", "utf8");
const companies = readFileSync("src/lib/companies.functions.ts", "utf8");
const products = readFileSync("src/lib/products.functions.ts", "utf8");
const files = readFileSync("src/lib/crm-arquivos.functions.ts", "utf8");
const storage = readFileSync("src/lib/storage.functions.ts", "utf8");
const agent = readFileSync("src/lib/crm-agent.functions.ts", "utf8");
const formsRoute = readFileSync("src/routes/crm.formularios.tsx", "utf8");
const companiesRoute = readFileSync("src/routes/crm.empresas.tsx", "utf8");
const productsRoute = readFileSync("src/routes/crm.produtos.tsx", "utf8");
const filesRoute = readFileSync("src/routes/crm.arquivos.tsx", "utf8");

describe("CRM completion — batch 07 / auditoria final", () => {
  it("TESTE 19: menu CRM expõe exatamente as áreas prioritárias e o Gestor de CRM fica na posição correta", () => {
    const expected = [
      '{ label: "Funis de venda", to: "/crm/funis-de-venda", kind: "funis" }',
      '{ label: "Automações", to: "/crm/automacoes" }',
      '{ label: "Gestor de CRM", to: "/crm/agente-ia", adminOnly: true }',
      '{ label: "Formulários", to: "/crm/formularios" }',
      '{ label: "Empresas", to: "/crm/empresas" }',
      '{ label: "Produtos", to: "/crm/produtos" }',
      '{ label: "Arquivos", to: "/crm/arquivos" }',
    ];
    for (const item of expected) expect(sidebar).toContain(item);

    const automationPos = sidebar.indexOf(expected[1]);
    const managerPos = sidebar.indexOf(expected[2]);
    const formsPos = sidebar.indexOf(expected[3]);
    expect(automationPos).toBeLessThan(managerPos);
    expect(managerPos).toBeLessThan(formsPos);
  });

  it("TESTE 20: módulos prioritários têm backend autenticado, workspace ativo e tela conectada ao backend real", () => {
    for (const source of [forms, companies, products, files, storage, agent]) {
      expect(source).toContain("requireSupabaseAuth");
    }
    for (const source of [forms, companies, products, files, agent]) {
      expect(source).toMatch(/current_workspace_id/);
      expect(source).toContain("Workspace ativo não encontrado.");
    }

    expect(formsRoute).toContain("listForms");
    expect(formsRoute).toContain("upsertForm");
    expect(companiesRoute).toContain("listCompanies");
    expect(companiesRoute).toContain("createCompany");
    expect(productsRoute).toContain("listProductCatalogs");
    expect(productsRoute).toContain("saveProductCatalog");
    expect(filesRoute).toContain("listCrmArquivos");
    expect(filesRoute).not.toContain("setLeadKeepFiles");
    expect(storage).toContain("deleteWorkspaceStorageFile");
  });

  it("TESTE 21: auditoria final não aceita dados falsos ou promessas falsas nas áreas concluídas", () => {
    for (const route of [formsRoute, companiesRoute, productsRoute, filesRoute]) {
      expect(route).not.toMatch(/TODO\s*:\s*(implementar|mock)/i);
      expect(route).not.toMatch(/const\s+(MOCK|FAKE|SAMPLE)_[A-Z0-9_]*\s*=/i);
      expect(route).not.toMatch(/\bmockData\b/i);
    }

    // crm-mock ainda contém utilitários puros compartilhados (ex.: formatBRL),
    // então o nome do arquivo por si só não significa que a tela usa dados falsos.
    expect(productsRoute).toContain("queryFn: () => loadCatalogsFn()");
    expect(productsRoute).toContain("catalogsQ.data ?? []");
    expect(productsRoute).toContain("const INITIAL_CATALOGS: Catalog[] = [];");

    expect(filesRoute).not.toContain("excluídos automaticamente após <b>15 dias</b>");
    expect(filesRoute).toContain("permanecem armazenados até exclusão manual");
    expect(sidebar).not.toContain('{ label: "Agente IA", to: "/crm/agente-ia", adminOnly: true }');
    expect(agent).toContain("Workspace inválido para esta sessão.");
    expect(agent).toContain("Um ou mais funis não pertencem ao workspace ativo.");
  });
});
