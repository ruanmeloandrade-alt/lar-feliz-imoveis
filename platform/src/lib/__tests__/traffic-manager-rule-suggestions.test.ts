import { describe, expect, it } from "vitest";
import fs from "node:fs";

const manager = fs.readFileSync("src/components/meta/MetaStrategyManager.tsx", "utf8");

describe("Gestor de Tráfego - sugestões de regras", () => {
  it("mantém o botão Sugerir regras", () => {
    expect(manager).toContain("Sugerir regras");
  });

  it("prioriza regras do playbook/estratégia quando houver", () => {
    expect(manager).toContain("materializePlaybookRules(playbook)");
    expect(manager).toContain("[Estratégia: ${playbook.name}]");
  });

  it("mantém fallback quando não houver estratégia configurada", () => {
    expect(manager).toContain("const prefix = hasStrategyContext ? 'Contextual' : 'Fallback'");
    expect(manager).toContain("sem estratégia, cria um fallback seguro");
  });

  it("faz sugestão considerar objetivo e orçamento", () => {
    expect(manager).toContain("form.defaultObjective");
    expect(manager).toContain("form.budgetAmount");
    expect(manager).toContain("protectiveThreshold");
    expect(manager).toContain("spendThreshold");
  });

  it("mantém guardrail de escala por percentual e cooldown", () => {
    expect(manager).toContain("action_type: 'increase_budget'");
    expect(manager).toContain("action_value: 20");
    expect(manager).toContain("cooldown_minutes: 1440");
  });
});
