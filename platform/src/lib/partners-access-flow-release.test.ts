import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const gate = read("src/components/DeviceApprovalGate.tsx");
const sidebar = read("src/components/dashboard/AppSidebar.tsx");
const affiliate = read("src/routes/partners.afiliado.tsx");
const partner = read("src/routes/partners.parceiro.tsx");
const community = read("src/routes/partners.comunidade.tsx");
const migration = read("supabase/migrations/20260812143000_partner_program_pending_access.sql");

describe("Partners access flow release", () => {
  it("não exige aprovação de dispositivo para papéis comerciais pending/approved", () => {
    expect(gate).toContain('partner_program_roles');
    expect(gate).toContain('.in("status", ["pending", "approved"])');
    expect(gate).toContain('if (programRole) return');
  });

  it("pending entra nas áreas de Afiliado e Partner sem liberar o link", () => {
    expect(affiliate).toContain('if (access === "pending") return <AffiliateLayout data={null} pending />');
    expect(affiliate).toContain('O link de indicação e as comissões serão ativados quando o administrador aprovar');
    expect(partner).toContain('if (access === "pending") return <PartnerLayout data={null} pending />');
    expect(partner).toContain('Aguardando aprovação comercial');
  });

  it("comunidade e faculdade aceitam pending/approved", () => {
    expect(community).toContain('item.status === "pending" || item.status === "approved"');
    expect(migration).toContain("status in ('pending','approved')");
    expect(migration).toContain('partner_program_my_academy_progress');
    expect(migration).toContain('partner_program_complete_academy_lesson');
  });

  it("menu interno mostra atalhos condicionais depois da Faculdade", () => {
    expect(sidebar).toContain('Faculdade MKTOn');
    expect(sidebar).toContain('Acessar área de Afiliado');
    expect(sidebar).toContain('Acessar área Partners');
    expect(sidebar).toContain('Central Partners');
    expect(sidebar).toContain('programAccess?.affiliate || isSuperAdmin');
    expect(sidebar).toContain('programAccess?.partner || isSuperAdmin');
  });
});
