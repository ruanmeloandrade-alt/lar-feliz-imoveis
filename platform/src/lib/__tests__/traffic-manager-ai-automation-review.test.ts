import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const planner = readFileSync("src/lib/meta-automation-ai-planner.functions.ts", "utf8");
const ui = readFileSync("src/components/meta/MetaAutomationAiPlanner.tsx", "utf8");
const workspace = readFileSync("src/components/meta/MetaAutomationWorkspace.tsx", "utf8");
const route = readFileSync("src/routes/modulos.gestor-trafego.automacoes.tsx", "utf8");

describe("Gestor de Tráfego Task 13 — automação manual vs IA", () => {
  it("separa explicitamente os dois modos sem remover o editor manual", () => {
    expect(workspace).toContain("Automação manual");
    expect(workspace).toContain("Automação com IA");
    expect(workspace).toContain("<MetaAutomationsPanel");
    expect(workspace).toContain("<MetaAutomationAiPlanner");
    expect(route).toContain("MetaAutomationWorkspace");
  });

  it("obriga a IA a planejar sobre alvo real selecionado", () => {
    expect(ui).toContain("Selecione uma campanha real");
    expect(ui).toContain("Selecione um conjunto real");
    expect(ui).toContain("Selecione um anúncio real");
    expect(planner).toContain("ALVO REAL SELECIONADO");
  });

  it("nunca ativa automaticamente o plano gerado pela IA", () => {
    expect(planner).toContain("Você NÃO executa nenhuma ação e NÃO ativa regra");
    expect(ui).toContain("enabled: false");
    expect(ui).toContain('creationMode: "ai_reviewed_draft"');
    expect(ui).toContain("Criar rascunho para revisão");
  });

  it("limita alteração percentual de orçamento a 20 por cento", () => {
    expect(planner).toContain("Math.min(Math.max(Math.abs(action.value ?? 0), 1), 20)");
    expect(planner).toContain("nunca recomende mais de 20% por execução");
  });
});
