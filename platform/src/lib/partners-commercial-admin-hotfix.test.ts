import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicPage = readFileSync(resolve(process.cwd(), "src/routes/partners.tsx"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/routes/partners.afiliado.tsx"), "utf8");
const partner = readFileSync(resolve(process.cwd(), "src/routes/partners.parceiro.tsx"), "utf8");
const register = readFileSync(resolve(process.cwd(), "src/routes/api/public/partners/register.ts"), "utf8");
const commissionSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260811183500_partners_commission_alignment.sql"), "utf8");
const profileSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260811184000_partner_program_profile_fields.sql"), "utf8");

describe("Partners — regras comerciais e acesso administrativo", () => {
  it("Affiliate usa 50% inicial e 15% recorrente", () => {
    expect(publicPage).toContain("50% na primeira venda elegível + 15% nas renovações");
    expect(publicPage).toContain("Primeira venda · 50%");
    expect(affiliate).toContain("50% na primeira venda elegível + 15% nas renovações");
    expect(commissionSql).toContain("5000");
    expect(commissionSql).toContain("'affiliate','initial'");
  });

  it("Partner começa em 35% e a recorrência acompanha a mesma faixa", () => {
    expect(publicPage).toContain("Começa em 35%");
    expect(partner).toContain("A recorrência acompanha a mesma faixa de comissão");
    expect(commissionSql).toContain("'partner','initial',null,3500");
  });

  it("simulador oferece mensal, trimestral, semestral e anual", () => {
    for (const label of ["Mensal", "Trimestral", "Semestral", "Anual"]) expect(publicPage).toContain(label);
  });

  it("cadastro coleta e persiste Instagram, experiência e PF/PJ", () => {
    expect(publicPage).toContain("Instagram");
    expect(publicPage).toContain("Nível de experiência");
    expect(publicPage).toContain("Pessoa física");
    expect(publicPage).toContain("Pessoa jurídica");
    expect(register).toContain("instagram_handle");
    expect(register).toContain("experience_level");
    expect(register).toContain("person_type");
    expect(profileSql).toContain("instagram_handle");
  });

  it("super admin entra direto nas duas áreas sem depender do parâmetro preview", () => {
    expect(affiliate).toContain("if (isAdmin === true)");
    expect(partner).toContain("if (isAdmin === true)");
  });
});
