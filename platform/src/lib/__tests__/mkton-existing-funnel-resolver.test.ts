import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const resolver = fs.readFileSync(
  path.join(root, "src/lib/mkton-existing-funnel-resolver.server.ts"),
  "utf8",
);
const leadProvision = fs.readFileSync(
  path.join(root, "src/lib/mkton-admin-provision.functions.ts"),
  "utf8",
);
const fullOperation = fs.readFileSync(
  path.join(root, "src/lib/mkton-full-operation.server.ts"),
  "utf8",
);

describe("Mkton · reutilização de funis reais", () => {
  it("lists existing pipelines instead of creating a new funnel", () => {
    expect(resolver).toContain('.from("pipelines")');
    expect(resolver).toContain("Funis encontrados neste workspace");
    expect(resolver).toContain("Nenhum funil novo foi criado");
  });

  it("resolves the lead-entry funnel from existing CRM data", () => {
    expect(leadProvision).toContain("resolveExistingMktonFunnel");
    expect(leadProvision).not.toContain('.ilike("name", "Leads de Entrada")');
  });

  it("resolves every full-operation funnel from existing CRM data", () => {
    expect(fullOperation).toContain("resolveExistingMktonFunnel");
    expect(fullOperation).not.toContain('.ilike("name", name).maybeSingle()');
  });
});
