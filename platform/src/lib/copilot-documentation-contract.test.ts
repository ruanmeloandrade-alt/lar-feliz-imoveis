import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCUMENTATION_START_MODULES } from "./documentation-start-catalog";

const readSource = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Copiloto e documentação pública", () => {
  it("mantém o Copiloto permanente e sem mascote", () => {
    const source = readSource("components/SupportRobot.tsx");
    expect(source).toContain("Copiloto MktOn");
    expect(source).toContain('copilotMode === "implementation"');
    expect(source).toContain("Assistente da plataforma");
    expect(source).not.toContain("robot-support-icon");
    expect(source).not.toContain("julia-face");
    expect(source.toLowerCase()).not.toContain("mensalidade");
  });

  it("mantém o acionador visível mesmo antes da conexão de IA", () => {
    const context = readSource("lib/support-robot.functions.ts");
    const component = readSource("components/SupportRobot.tsx");
    expect(context).toContain("active: true as const");
    expect(context).toContain("hasOpenAI");
    expect(component).toContain("Conecte a IA para ativar o Copiloto");
    expect(component).toContain('to="/integracoes"');
  });

  it("define a fase inicial de 20 dias sem encerrar o Copiloto depois", () => {
    const context = readSource("lib/support-robot.functions.ts");
    const diagnostics = readSource("lib/support-robot.server.ts");
    expect(context).toContain("daysUsed <= 20");
    expect(context).toContain('"implementation" as const');
    expect(context).toContain('"assistant" as const');
    expect(diagnostics).toContain('mode: implementationMode ? "implementation" : "assistant"');
    expect(diagnostics).toContain("implementationChecklist");
  });

  it("expõe documentação e afiliados como rotas públicas", () => {
    const root = readSource("routes/__root.tsx");
    expect(root).toContain('"/documentacao"');
    expect(root).toContain('"/afiliados"');
    expect(root).toContain("HomepageResourceLinks");
    expect(root).toContain(">Documentação</Link>");
  });

  it("inclui Afiliados na biblioteca pública sem congelar comissão", () => {
    const affiliate = DOCUMENTATION_START_MODULES.find((item) => item.id === "programa-afiliados");
    expect(affiliate).toBeTruthy();
    expect(affiliate?.route).toBe("/afiliados");
    const serialized = JSON.stringify(affiliate);
    expect(serialized).not.toMatch(/35%|15%|30%|25%|20%/);
    expect(serialized).toContain("política vigente");
  });
});
