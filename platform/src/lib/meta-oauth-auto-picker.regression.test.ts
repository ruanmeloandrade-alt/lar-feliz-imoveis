import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/components/integrations/MetaConnectPanel.tsx", "utf8");

describe("Meta OAuth return", () => {
  test("abre automaticamente o picker de ativos", () => {
    expect(panel).toContain('u.searchParams.get("meta") === "ok"');
    expect(panel).toContain("void openPicker();");
    expect(panel).toContain("OAuth concluído não significa ativos sincronizados");
  });

  test("deixa Instagram explícito no CTA", () => {
    expect(panel).toContain("Escolher contas, páginas e Instagram");
    expect(panel).toContain("contas de anúncio, Páginas e Instagrams");
  });
});
