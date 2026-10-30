import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySalesbotBuilderTransform } from "../../../scripts/salesbot-save-feedback-transform";

const builderSource = readFileSync(new URL("./SalesbotBuilder.tsx", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../../lib/salesbots.functions.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("SalesbotBuilder activation and save feedback contract", () => {
  it("does not mutate activation during normal structural saves", () => {
    const persistBlock = between(builderSource, "function persist(", "/* ===== Estado de salvamento");
    expect(persistBlock).not.toContain("isActive:");
    expect(persistBlock).toContain("expectedRevision: proof?.revision ?? null");
    expect(persistBlock).toContain("baseBlockLocalIds: proof?.baseBlockLocalIds ?? []");
  });

  it("restores is_active from the database when loading the builder", () => {
    const loadBlock = between(serverSource, "export const listSalesbotsFull", "export const getSalesbotGraph");
    expect(loadBlock).toContain("isActive: bot.is_active");
  });

  it("allows toggling a bot active without requiring triggers", () => {
    const transformed = applySalesbotBuilderTransform(builderSource);
    const toggleBlock = between(transformed, "Robô Ativo", 'className="scale-75"');
    expect(toggleBlock).toContain("setActiveFn({ data:");
    expect(toggleBlock).toContain("expectedRevision: proof.revision");
    expect(toggleBlock).toContain("isActive: val");
    expect(toggleBlock).not.toContain("Adicione pelo menos um gatilho antes de ativar o bot.");
    expect(toggleBlock).not.toContain("active.gatilhos.length === 0");
  });

  it("creates duplicated bots paused instead of silently activating them", () => {
    const duplicateBlock = between(builderSource, "if (op === \"duplicar\")", "if (!confirm(\"Excluir este bot?\"))");
    expect(duplicateBlock).toContain("isActive: false");
    expect(duplicateBlock).not.toContain("isActive: true");
  });

  it("keeps explicit saving, saved and error feedback visible in the builder", () => {
    expect(builderSource).toContain("Salvando…");
    expect(builderSource).toContain("Salvo {lastSavedAt.toLocaleTimeString");
    expect(builderSource).toContain("Falha ao salvar");
  });
});
