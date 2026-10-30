import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canManageWorkspaceBilling, effectiveEntitledModules } from "./entitlements";

describe("Planos 10-12", () => {
  it("10 - only activates modules entitled by the current plan", () => {
    expect(effectiveEntitledModules({
      status: "active",
      workspaceModules: ["dashboard", "crm_mkton", "trafego_ia", "modulo_inventado"],
    })).toEqual(["dashboard", "crm_mkton", "trafego_ia"]);

    expect(effectiveEntitledModules({ status: "active", workspaceModules: [] })).toEqual([]);
  });

  it("11 - subscription flows use the canonical active-workspace resolver", () => {
    const sourcePath = fileURLToPath(new URL("./plans.functions.ts", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("resolveActiveWorkspace");
    expect(source).not.toContain('select("current_workspace_id")');
  });

  it("12 - only the workspace owner can manage billing", () => {
    expect(canManageWorkspaceBilling("owner")).toBe(true);
    expect(canManageWorkspaceBilling("admin")).toBe(false);
    expect(canManageWorkspaceBilling("member")).toBe(false);
    expect(canManageWorkspaceBilling(null)).toBe(false);
  });
});
