import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sidebar = readFileSync(resolve(root, "src/components/dashboard/AppSidebar.tsx"), "utf8");
const route = readFileSync(resolve(root, "src/routes/campanhas.tsx"), "utf8");
const report = readFileSync(resolve(root, "src/lib/operations-report.functions.ts"), "utf8");
const usage = readFileSync(resolve(root, "src/lib/admin-coupon-usage.functions.ts"), "utf8");
const usageUi = readFileSync(resolve(root, "src/components/operations/CouponUsageButton.tsx"), "utf8");

describe("Central de Operações", () => {
  it("mantém a Central exclusiva de super admin", () => {
    expect(sidebar).toContain('label: "Central de Operações"');
    expect(sidebar).toContain("superAdminOnly: true");
    expect(route).toContain("A Central de Operações só pode ser acessada pelo administrador geral");
    expect(report).toContain('"super_admin"');
    expect(usage).toContain('"super_admin"');
  });

  it("unifica cobrança e renovação em uma única frente financeira", () => {
    expect(route).toContain('value="financeiro"');
    expect(route).toContain("Cobranças e renovações");
    expect(route).not.toContain('TabsTrigger value="renovacao"');
    expect(route).not.toContain('TabsTrigger value="cobrancas"');
  });

  it("usa execuções reais e não depende de workspace_id nos logs", () => {
    expect(report).toContain('from("salesbot_runs")');
    expect(report).toContain('from("salesbot_run_logs")');
    expect(report).toContain('.in("salesbot_run_id", runIds)');
    expect(report).not.toContain('from("salesbot_run_logs")\n        .select("id,salesbot_run_id,status,message,created_at")\n        .eq("workspace_id"');
    expect(report).toContain("sourceHealth");
    expect(report).toContain("duplicateIds");
  });

  it("permite detalhar uso do cupom e só abre Inbox com lead real", () => {
    expect(route).toContain("CouponUsageButton");
    expect(usage).toContain('from("coupon_usages")');
    expect(usage).toContain('from("workspace_members")');
    expect(usage).toContain('`signup:${userId}`');
    expect(usageUi).toContain("row.leadId ?");
    expect(usageUi).toContain("Sem lead correlacionado");
    expect(usageUi).toContain("/inbox/leads?leadId=");
  });

  it("preserva Cadastros, Cupons, SMS, Histórico e Execuções e Bugs", () => {
    for (const label of ["Cadastros", "Cupons", "SMS", "Histórico", "Execuções e Bugs"]) {
      expect(route).toContain(`>${label}</TabsTrigger>`);
    }
  });
});
