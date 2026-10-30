import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildFormIngestUrl,
  buildFormShareUrlWithWorkspace,
  isValidSlug,
  normalizeSlug,
} from "@/lib/forms.functions";

const formsSource = readFileSync("src/lib/forms.functions.ts", "utf8");
const companySource = readFileSync("src/lib/companies.functions.ts", "utf8");
const productSource = readFileSync("src/lib/products.functions.ts", "utf8");
const integrityMigration = readFileSync(
  "supabase/migrations/20260809172000_crm_company_product_integrity.sql",
  "utf8",
);

describe("CRM completion — batch 04", () => {
  it("TESTE 10: formulários fecham CRUD, publicação e integração com isolamento de workspace", () => {
    expect(normalizeSlug(" Orçamento Ágil 2026 ")).toBe("orcamento-agil-2026");
    expect(isValidSlug("orcamento-agil-2026")).toBe(true);
    expect(isValidSlug("api")).toBe(false);
    expect(buildFormShareUrlWithWorkspace("empresa-x", "orcamento", "lead-123"))
      .toBe("https://mkton.io/empresa-x/orcamento?leadId=lead-123");
    expect(buildFormIngestUrl("abc123")).toBe("https://mkton.io/api/public/forms/abc123");

    for (const fn of ["listForms", "upsertForm", "rotateFormIngestToken", "deleteForm", "getFormById"]) {
      const start = formsSource.indexOf(`export const ${fn} = createServerFn`);
      expect(start, `${fn} deve existir`).toBeGreaterThanOrEqual(0);
      const block = formsSource.slice(start, start + 5000);
      expect(block).toContain("requireSupabaseAuth");
      expect(block).toContain("activeWorkspace");
    }

    expect(formsSource).toMatch(/update\(patch\)[\s\S]*eq\("id", data\.id\)[\s\S]*eq\("workspace_id", wsId\)/);
    expect(formsSource).toMatch(/delete\(\)[\s\S]*eq\("id", data\.id\)[\s\S]*eq\("workspace_id", wsId\)/);
  });

  it("TESTE 11: empresas e funcionários não podem criar vínculos cruzados entre workspaces", () => {
    expect(companySource).toContain("requireSupabaseAuth");
    expect(companySource).toContain('.eq("workspace_id", wsId)');

    expect(integrityMigration).toContain("assert_crm_lead_company_integrity");
    expect(integrityMigration).toContain("c.id = NEW.company_id");
    expect(integrityMigration).toContain("c.workspace_id = NEW.workspace_id");
    expect(integrityMigration).toContain("crm_lead_company_integrity_guard");

    expect(integrityMigration).toContain("assert_crm_company_primary_lead_integrity");
    expect(integrityMigration).toContain("l.id = NEW.primary_lead_id");
    expect(integrityMigration).toContain("l.workspace_id = NEW.workspace_id");
    // Preserva o fluxo atual: na criação o responsável pode estar ainda sem empresa,
    // mas jamais pode estar vinculado a outra empresa.
    expect(integrityMigration).toContain("l.company_id IS NULL OR l.company_id = NEW.id");
    expect(integrityMigration).toContain("cannot belong to another company");
  });

  it("TESTE 12: catálogos, produtos e vínculo lead-produto respeitam o workspace", () => {
    expect(productSource).toContain("requireSupabaseAuth");
    expect(productSource).toContain('.eq("workspace_id", wsId)');
    expect(productSource).toContain('from("lead_products")');

    expect(integrityMigration).toContain("assert_crm_product_catalog_integrity");
    expect(integrityMigration).toContain("c.id = NEW.catalog_id");
    expect(integrityMigration).toContain("c.workspace_id = NEW.workspace_id");
    expect(integrityMigration).toContain("crm_product_catalog_integrity_guard");

    expect(integrityMigration).toContain("assert_crm_lead_product_integrity");
    expect(integrityMigration).toContain("l.id = NEW.lead_id");
    expect(integrityMigration).toContain("l.workspace_id = NEW.workspace_id");
    expect(integrityMigration).toContain("p.id = NEW.product_id");
    expect(integrityMigration).toContain("p.workspace_id = NEW.workspace_id");
    expect(integrityMigration).toContain("crm_lead_product_integrity_guard");
  });
});
