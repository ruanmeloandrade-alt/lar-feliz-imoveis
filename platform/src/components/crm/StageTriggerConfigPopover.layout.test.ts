import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const popover = readFileSync("src/components/crm/StageTriggerConfigPopover.tsx", "utf8");
const sidebar = readFileSync("src/components/dashboard/AppSidebar.tsx", "utf8");

describe("StageTriggerConfigPopover layout", () => {
  test("abre a partir do início da etapa e acima da sidebar fixa", () => {
    expect(sidebar).toContain('z-[80]');
    expect(popover).toContain('align="start"');
    expect(popover).toContain('sideOffset={8}');
    expect(popover).toContain('collisionPadding={12}');
    expect(popover).toContain('z-[90]');
  });

  test("usa a altura disponível do Radix e mantém rodapé fora da rolagem", () => {
    expect(popover).toContain('max-h-[var(--radix-popover-content-available-height)]');
    expect(popover).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(popover).toContain('shrink-0 flex items-center justify-between');
    expect(popover).not.toContain('max-h-[70vh] overflow-y-auto');
  });

  test("dropdowns internos ficam acima do popover", () => {
    expect(popover).toContain('z-[100]');
    expect(popover).not.toContain('z-[60]');
  });

  test("não altera as opções funcionais de gatilho", () => {
    expect(popover).toContain('Assim que o lead for criado ou movido para esta etapa');
    expect(popover).toContain('Depois de um tempo parado nesta etapa');
    expect(popover).toContain('Todo dia em um horário fixo');
    expect(popover).toContain('Em uma data e hora específicas');
  });
});
