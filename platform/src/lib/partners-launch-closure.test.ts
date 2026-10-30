import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const register = readFileSync(resolve(process.cwd(), "src/routes/api/public/partners/register.ts"), "utf8");
const publicPage = readFileSync(resolve(process.cwd(), "src/routes/partners.tsx"), "utf8");
const finance = readFileSync(resolve(process.cwd(), "src/routes/partners.financeiro.tsx"), "utf8");
const payoutApi = readFileSync(resolve(process.cwd(), "src/routes/api/partners/request-payout.ts"), "utf8");
const accounts = readFileSync(resolve(process.cwd(), "src/lib/accounts.functions.ts"), "utf8");
const root = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");

describe("Partners — fechamento de lançamento", () => {
  it("cadastro não depende mais de convite ou confirmação por e-mail para acessar", () => {
    expect(register).toContain("admin.auth.admin.createUser");
    expect(register).toContain("email_confirm: true");
    expect(register).not.toContain("inviteUserByEmail");
    expect(register).toContain("immediateAccess: true");
    expect(publicPage).toContain("signInWithPassword");
    expect(publicPage).toContain('window.location.href = "/contas"');
    expect(publicPage).not.toContain("Confira seu e-mail para ativar");
  });

  it("mantém aprovação comercial separada do acesso à plataforma", () => {
    expect(register).toContain('const roleStatus = "pending"');
    expect(register).toContain("referral_active: false");
    expect(publicPage).toContain("A aprovação comercial libera divulgação e comissões");
  });

  it("simulador atende Afiliado e Partner com as regras vigentes", () => {
    expect(publicPage).toContain("Simule seus ganhos");
    expect(publicPage).toContain('setSimRole("affiliate")');
    expect(publicPage).toContain('setSimRole("partner")');
    expect(publicPage).toContain('simRole === "affiliate" ? 0.50 : 0.35');
    expect(publicPage).toContain('simRole === "affiliate" ? 0.15 : 0.35');
    for (const period of ["Mensal", "Trimestral", "Semestral", "Anual"]) expect(publicPage).toContain(period);
  });

  it("saque exige autenticação e perfil financeiro verificado no servidor", () => {
    expect(finance).toContain('/api/partners/request-payout');
    expect(payoutApi).toContain("admin.auth.getUser(token)");
    expect(payoutApi).toContain('profile.verification_status !== "verified"');
    expect(payoutApi).toContain("partner_program_request_payout");
    expect(finance).toContain("O bloqueio aqui vale apenas para saque");
  });

  it("super admin mantém Central própria e previews sem esconder papel comercial real", () => {
    expect(accounts).toContain('if (!destinations.has("affiliate"))');
    expect(accounts).toContain('if (!destinations.has("partner"))');
    expect(root).toContain('"/partners"');
    expect(root).toContain("ConditionalSupportRobot");
  });
});
