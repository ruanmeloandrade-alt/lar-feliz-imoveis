import { describe, expect, it } from "vitest";
import { DOCUMENTATION_ADMIN_MODULES } from "./documentation-admin-catalog";

const byId = (id: string) => DOCUMENTATION_ADMIN_MODULES.find((item) => item.id === id);

describe("documentation admin catalog", () => {
  it("keeps Central de Operações restricted to administration", () => {
    expect(byId("central-operacoes")?.status).toBe("admin_only");
    expect(byId("central-operacoes")?.route).toBe("/campanhas");
  });

  it("separates global MktOn dependencies from client setup", () => {
    const global = byId("dependencias-globais");
    expect(global?.status).toBe("admin_only");
    expect(global?.article.purpose.toLowerCase()).toContain("cliente");
    expect(global?.article.limitations.join(" ").toLowerCase()).toContain("segredo");
  });

  it("documents security, sessions and permissions", () => {
    const security = byId("seguranca");
    const capabilities = security?.article.capabilities.join(" ").toLowerCase() ?? "";
    expect(capabilities).toContain("sessões");
    expect(capabilities).toContain("passkeys");
    expect(capabilities).toContain("permissões");
  });

  it("does not freeze commercial prices into documentation", () => {
    const billing = byId("faturamento");
    const serialized = JSON.stringify(billing);
    expect(serialized).not.toMatch(/R\$\s?\d/i);
    expect(serialized).not.toContain("R$ 33");
    expect(billing?.article.limitations.join(" ").toLowerCase()).toContain("não fixa preços");
  });

  it("keeps the admin articles complete", () => {
    for (const module of DOCUMENTATION_ADMIN_MODULES) {
      expect(module.article.capabilities.length).toBeGreaterThan(0);
      expect(module.article.steps.length).toBeGreaterThan(0);
      expect(module.article.connections.length).toBeGreaterThan(0);
      expect(module.article.limitations.length).toBeGreaterThan(0);
      expect(module.article.troubleshooting.length).toBeGreaterThan(0);
    }
  });
});
