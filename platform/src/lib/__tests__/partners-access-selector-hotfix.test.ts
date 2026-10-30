import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Partners access selector hotfix", () => {
  it("never auto-enters the only workspace", () => {
    const contas = read("src/routes/contas.tsx");
    expect(contas).not.toContain("accounts.length === 1");
    expect(contas).toContain("nunca entrar automaticamente");
  });

  it("uses canonical program roles and exposes both admin destinations", () => {
    const accounts = read("src/lib/accounts.functions.ts");
    expect(accounts).toContain('from("partner_program_roles")');
    expect(accounts).toContain('rpc("partner_program_is_admin"');
    expect(accounts).toContain('destinations.set("affiliate"');
    expect(accounts).toContain('destinations.set("partner"');
    expect(accounts).not.toContain("feature_flags?.affiliate");
  });

  it("keeps Affiliate and Partner pending while granting portal access", () => {
    const register = read("src/routes/api/public/partners/register.ts");
    expect(register).toContain('const roleStatus = "pending"');
    expect(register).toContain("referral_active: false");
    expect(register).not.toContain('role === "affiliate" ? "approved"');
    expect(register).not.toContain('from("workspaces").delete()');
  });

  it("returns activation to the explicit selector", () => {
    const activation = read("src/routes/partners.ativar.tsx");
    expect(activation).toContain('navigate({ to: "/contas" })');
    expect(activation).not.toContain('partner ? "/partners/parceiro"');
  });

  it("lets pending users open their area without exposing promotion links", () => {
    const affiliate = read("src/routes/partners.afiliado.tsx");
    const partner = read("src/routes/partners.parceiro.tsx");
    expect(affiliate).toContain('role?.status === "pending"');
    expect(affiliate).toContain("link de divulgação e as comissões ficam bloqueados");
    expect(partner).toContain('role?.status === "pending"');
    expect(partner).toContain("link de indicação e benefícios comerciais ficam bloqueados");
  });

  it("retires the legacy affiliate page and uses current plan references", () => {
    const legacy = read("src/routes/afiliados.tsx");
    const partners = read("src/routes/partners.tsx");
    expect(legacy).toContain('redirect({ to: "/partners"');
    expect(partners).not.toContain("29700");
    expect(partners).not.toContain("R$297");
    expect(partners).toContain('{ code: "starter", name: "Start", priceCents: 39700 }');
    expect(partners).toContain('{ code: "professional", name: "Growth", priceCents: 69700 }');
    expect(partners).toContain('{ code: "business", name: "Performance", priceCents: 99700 }');
    expect(partners).toContain('{ code: "enterprise", name: "Scale", priceCents: 149700 }');
    expect(partners).toContain("35% inicial + 15% recorrente");
  });

  it("labels technical Partner workspaces in the selector", () => {
    const contas = read("src/routes/contas.tsx");
    const accounts = read("src/lib/accounts.functions.ts");
    expect(accounts).toContain("role_type");
    expect(accounts).toContain("is_partner");
    expect(contas).toContain("Acesso técnico Partner");
  });
});