import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const backend = readFileSync(resolve(process.cwd(), "src/lib/meta-personas.functions.ts"), "utf8");
const manager = readFileSync(resolve(process.cwd(), "src/components/meta/MetaPersonaManager.tsx"), "utf8");
const map = readFileSync(resolve(process.cwd(), "src/components/meta/MapLocationSelector.tsx"), "utf8");

describe("Gestor de Tráfego Persona finalization", () => {
  it("scopes Persona reads/writes/deletes to a workspace membership", () => {
    expect(backend).toContain("assertWorkspaceMember");
    expect(backend).toContain("assertAdAccountInWorkspace");
    expect(backend).toContain('.eq("id", data.id).eq("workspace_id", data.workspaceId)');
    expect(manager).toContain("deleteFn({ data: { workspaceId, id } })");
  });

  it("does not swallow Google Places errors", () => {
    expect(map).toContain("searchError");
    expect(map).toContain("Busca de endereço indisponível");
    expect(map).toContain("Nenhum endereço encontrado");
    expect(map).toContain("VITE_GOOGLE_MAPS_BROWSER_KEY");
  });
});
