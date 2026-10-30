import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/automations/ConversationAgentsPanel.tsx", "utf8");

describe("Agente IA · Prompt do Sistema", () => {
  test("mostra pelo menos dez linhas no editor inline e usa tipografia compacta", () => {
    expect(source).toContain("rows={10}");
    expect(source).toContain('min-h-[13rem]');
    expect(source).toContain("text-xs leading-5 font-mono");
  });

  test("oferece expansão visual sem criar segundo estado para o conteúdo", () => {
    expect(source).toContain("promptExpanded");
    expect(source).toContain("Expandir");
    expect(source).toContain("Editor ampliado");
    expect(source).toContain("value={form.systemPrompt}");
    expect(source).toContain("setForm({ ...form, systemPrompt: e.target.value })");
    expect(source).not.toContain("setExpandedPrompt");
    expect(source).not.toContain("expandedPrompt");
  });

  test("não altera contrato funcional do prompt", () => {
    expect(source).toContain("systemPrompt: form.systemPrompt");
    expect(source).toContain("payloadRef.current = {");
    expect(source).toContain("const saveFn = useServerFn(upsertConversationAgent)");
  });
});
