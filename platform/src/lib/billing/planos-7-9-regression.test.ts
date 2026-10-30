import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

describe("Planos 7-9 regression", () => {
  it("7 - checkout resolves the canonical active workspace", () => {
    const checkout = source("checkout.functions.ts");
    expect(checkout).toContain("resolveActiveWorkspace");
    expect(checkout).not.toContain('select("current_workspace_id, display_name")');
  });

  it("8 - checkout rejects exhausted coupons", () => {
    const checkout = source("checkout.functions.ts");
    expect(checkout).toContain("coupon.max_uses");
    expect(checkout).toContain('from("coupon_usages")');
    expect(checkout).toContain('return { error: "Cupom esgotado." }');
  });

  it("9 - subscription entitlement read does not swallow workspace_modules errors", () => {
    const plans = source("plans.functions.ts");
    expect(plans).toContain("modulesError");
    expect(plans).toContain("if (modulesError) throw new Error(modulesError.message)");
  });
});
