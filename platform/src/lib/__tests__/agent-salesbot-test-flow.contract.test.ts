import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("teste visual de Agente A e SalesBot", () => {
  it("mantém o Agente A ligado ao endpoint real e ao celular", () => {
    const source = read("components/automations/AgentTestChat.tsx");
    expect(source).toContain('/api/agent-test-chat');
    expect(source).toContain('rounded-[34px]');
    expect(source).toContain('Jornada do teste');
    expect(source).toContain('MKTON_OBJECTIVE');
    expect(source).not.toContain('fixed right-4 top-20 bottom-4');
  });

  it("instrumenta objetivos sem mostrar marcador técnico ao cliente", () => {
    const api = read("routes/api/agent-test-chat.ts");
    const ui = read("components/automations/AgentTestChat.tsx");
    expect(api).toContain('[[MKTON_OBJECTIVE:<ID>]]');
    expect(api).toContain('[[MKTON_OBJECTIVE:END]]');
    expect(ui).toContain('visibleText');
    expect(ui).toContain('replace(OBJECTIVE_MARKER');
    expect(ui).toContain('PARTIAL_OBJECTIVE_MARKER');
  });

  it("preserva o simulador determinístico do SalesBot", () => {
    const phone = read("components/automations/SalesbotTestPhone.tsx");
    const builder = read("components/automations/SalesbotBuilder.tsx");
    expect(phone).toContain('currentBlockId');
    expect(phone).toContain('runFrom');
    expect(phone).toContain('evalCondicao');
    expect(phone).toContain('runValidation');
    expect(phone).toContain('Cronômetro');
    expect(builder).toContain('SalesbotTestPhone');
    expect(builder).toContain('setTestOpen(true)');
  });
});
