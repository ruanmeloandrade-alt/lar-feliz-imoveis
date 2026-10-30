import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
const accounts = readFileSync(resolve(process.cwd(), "src/lib/accounts.functions.ts"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/routes/partners.afiliado.tsx"), "utf8");
const partner = readFileSync(resolve(process.cwd(), "src/routes/partners.parceiro.tsx"), "utf8");
const publicPartners = readFileSync(resolve(process.cwd(), "src/routes/partners.tsx"), "utf8");

describe("Partners — isolamento final e homologação de indicação", () => {
  it("Copiloto e modo implementação não são montados em Partners, autenticação e rotas externas", () => {
    expect(root).toContain("isCopilotAllowedPath");
    for (const path of ["/partners", "/contas", "/auth", "/afiliado/", "/convite/", "/f/", "/r/"]) {
      expect(root).toContain(path);
    }
    expect(root).toContain("if (!isCopilotAllowedPath(path)) return null");
  });

  it("papel comercial real do super admin vence a pré-visualização", () => {
    expect(accounts).toContain('if (!destinations.has("affiliate"))');
    expect(accounts).toContain('if (!destinations.has("partner"))');
    expect(affiliate.indexOf('role?.status === "approved"')).toBeLessThan(affiliate.lastIndexOf('if (isAdmin === true)'));
    expect(partner.indexOf('role?.status === "approved"')).toBeLessThan(partner.lastIndexOf('if (isAdmin === true)'));
  });

  it("Afiliado aprovado recebe link real com copiar e testar", () => {
    expect(affiliate).toContain("Seu link de indicação");
    expect(affiliate).toContain("new URL(referralPath, window.location.origin)");
    expect(affiliate).toContain("Copiar link");
    expect(affiliate).toContain("Testar link");
    expect(affiliate).toContain("A pré-visualização administrativa não fabrica um link");
  });

  it("interface pública usa Afiliado em português sem alterar as regras comerciais", () => {
    expect(publicPartners).toContain("Simule seus ganhos de Afiliado");
    expect(publicPartners).toContain("50% na primeira venda elegível + 15% nas renovações");
    for (const label of ["Mensal", "Trimestral", "Semestral", "Anual"]) expect(publicPartners).toContain(label);
  });
});
