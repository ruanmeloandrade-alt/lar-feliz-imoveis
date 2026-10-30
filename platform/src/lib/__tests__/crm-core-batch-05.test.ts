import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const companySource = readFileSync("src/lib/companies.functions.ts", "utf8");
const productSource = readFileSync("src/lib/products.functions.ts", "utf8");
const filesSource = readFileSync("src/lib/crm-arquivos.functions.ts", "utf8");
const filesRoute = readFileSync("src/routes/crm.arquivos.tsx", "utf8");
const storageSource = readFileSync("src/lib/storage.functions.ts", "utf8");
const storageMigration = readFileSync(
  "supabase/migrations/20260811025500_workspace_storage_quotas.sql",
  "utf8",
);
const integrityMigration = readFileSync(
  "supabase/migrations/20260809172000_crm_company_product_integrity.sql",
  "utf8",
);

describe("CRM completion — batch 05", () => {
  it("TESTE 13: empresas fecham gestão de membros, responsável, papéis e isolamento", () => {
    for (const fn of [
      "listCompanies",
      "createCompany",
      "updateCompany",
      "listCompanyLeads",
      "setCompanyPrimaryLead",
      "addCompanyMembers",
      "updateCompanyMemberRole",
      "removeCompanyMember",
      "listUnassignedLeads",
    ]) {
      expect(companySource).toContain(`export const ${fn} = createServerFn`);
    }

    expect(companySource).toContain("primary_lead_id");
    expect(companySource).toContain("company_role");
    expect(companySource).toContain('.eq("workspace_id", wsId)');
    expect(integrityMigration).toContain("crm_lead_company_integrity_guard");
    expect(integrityMigration).toContain("crm_company_primary_lead_integrity_guard");
  });

  it("TESTE 14: produtos fecham catálogo, CRUD, importação, categorias e vínculo com leads", () => {
    for (const fn of [
      "listProductCatalogs",
      "saveProductCatalog",
      "deleteProductCatalog",
      "saveProduct",
      "deleteProduct",
      "bulkUpsertProducts",
      "linkLeadProduct",
      "unlinkLeadProduct",
      "listProductLeads",
      "renameProductCategory",
    ]) {
      expect(productSource).toContain(`export const ${fn} = createServerFn`);
    }

    expect(productSource).toContain("canonicalCategory");
    expect(productSource).toContain('from("lead_products")');
    expect(productSource).toContain('.eq("workspace_id", wsId)');
    expect(integrityMigration).toContain("crm_product_catalog_integrity_guard");
    expect(integrityMigration).toContain("crm_lead_product_integrity_guard");
  });

  it("TESTE 15: arquivos ficam persistentes, medidos e só permitem limpeza manual sem cruzar workspaces", () => {
    for (const fn of ["listCrmArquivos", "deleteLeadFiles"]) {
      expect(filesSource).toContain(`export const ${fn} = createServerFn`);
    }
    for (const fn of ["getWorkspaceStorageUsage", "checkWorkspaceStorageCapacity", "registerWorkspaceStorageFile", "deleteWorkspaceStorageFile"]) {
      expect(storageSource).toContain(`export const ${fn} = createServerFn`);
    }

    expect(filesSource).toContain("DeleteLeadFilesSchema");
    expect(filesSource).toContain("manual: z.literal(true)");
    expect(filesSource).toMatch(/from\("whatsapp_web_messages"\)[\s\S]*update\(\{ media_url: null \}\)[\s\S]*eq\("workspace_id", wsId\)/);
    expect(filesSource).toMatch(/from\("channel_messages"\)[\s\S]*update\(\{ attachments: keep \}\)[\s\S]*eq\("workspace_id", wsId\)/);
    expect(filesSource).toContain('from("companies")');
    expect(filesSource).toContain('.eq("workspace_id", wsId)');

    expect(storageMigration).toContain("workspace_storage_files");
    expect(storageMigration).toContain("enforce_workspace_storage_quota");
    expect(storageMigration).toContain("sync_meta_creative_storage_usage");
    expect(storageSource).toContain("deleted_at: new Date().toISOString()");

    expect(filesRoute).toContain("listCrmArquivos");
    expect(filesRoute).not.toContain("setLeadKeepFiles");
    expect(filesRoute).toContain("permanecem armazenados até exclusão manual");
    expect(filesRoute).toContain("Buscar por arquivo, lead ou empresa");
  });
});
