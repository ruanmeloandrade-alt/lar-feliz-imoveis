import { describe, expect, it } from "vitest";
import { assertSalesbotVariablesPreserved, extractSalesbotVariables } from "./salesbot-message-ai.functions";

describe("SalesBot AI message safety", () => {
  it("extracts unique template variables", () => {
    expect(extractSalesbotVariables("Olá {{nome}}, pedido {{pedido}} para {{nome}}"))
      .toEqual(["{{nome}}", "{{pedido}}"]);
  });

  it("accepts improved copy when every original variable is preserved", () => {
    expect(() => assertSalesbotVariablesPreserved(
      "Olá {{nome}}, seu pedido {{pedido}} chegou.",
      "Olá, {{nome}}! O seu pedido {{pedido}} já chegou.",
    )).not.toThrow();
  });

  it("rejects an AI response that removes an original variable", () => {
    expect(() => assertSalesbotVariablesPreserved(
      "Olá {{nome}}, seu pedido {{pedido}} chegou.",
      "Olá {{nome}}, seu pedido chegou.",
    )).toThrow(/\{\{pedido\}\}/);
  });
});
