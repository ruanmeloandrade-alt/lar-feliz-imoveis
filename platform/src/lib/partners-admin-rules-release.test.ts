import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rules = readFileSync(resolve(process.cwd(), "src/routes/partners.admin.regras.tsx"), "utf8");
const admin = readFileSync(resolve(process.cwd(), "src/routes/partners.admin.tsx"), "utf8");

describe("Partners admin — regras e vínculos", () => {
  it("protege o editor por super admin", () => {
    expect(rules).toContain("partner_program_is_admin");
    expect(rules).toContain("Acesso restrito ao super admin");
  });

  it("aplica override versionado usando a função canônica", () => {
    expect(rules).toContain("partner_program_set_commission_override");
    expect(rules).toContain("p_rate_bps");
    expect(rules).toContain("p_effective_from");
    expect(rules).toContain("p_reason");
  });

  it("cria vínculo formal Partner cliente pelo backend real", () => {
    expect(rules).toContain("partner_program_link_customer");
    expect(rules).toContain("p_partner_user_id");
    expect(rules).toContain("p_workspace_id");
    expect(rules).toContain("acesso técnico será sincronizado automaticamente");
  });

  it("Central Partners aponta para o editor", () => {
    expect(admin).toContain("/partners/admin/regras");
    expect(admin).toContain("Regras e vínculos");
  });
});
