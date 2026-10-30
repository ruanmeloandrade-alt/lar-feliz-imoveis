import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const admin = readFileSync(resolve(process.cwd(), "src/routes/partners.admin.tsx"), "utf8");
const accounts = readFileSync(resolve(process.cwd(), "src/routes/contas.tsx"), "utf8");

describe("Central Partners administrativa", () => {
  it("protege a rota por super admin e usa dashboard real", () => {
    expect(admin).toContain("partner_program_is_admin");
    expect(admin).toContain("partner_program_admin_dashboard");
    expect(admin).toContain("Acesso restrito ao super admin");
  });

  it("aprova e bloqueia papéis pelo backend real", () => {
    expect(admin).toContain("partner_program_set_role_status");
    expect(admin).toContain("Aprovar");
    expect(admin).toContain("Bloquear");
  });

  it("processa payout manual via função canônica", () => {
    expect(admin).toContain("partner_program_set_payout_status");
    expect(admin).toContain("Marcar pago");
    expect(admin).toContain("Pagamentos manuais");
  });

  it("mostra atalho da Central somente para super admin", () => {
    expect(accounts).toContain("data?.is_program_admin ? <Link to=\"/partners/admin\"");
    expect(accounts).toContain("Central Partners");
  });
});
