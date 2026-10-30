import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/integrations/MetaConnectPanel.tsx", import.meta.url),
  "utf8",
);

describe("Meta integration panel — single premium flow", () => {
  it("keeps only one Radix Dialog in the Meta panel", () => {
    expect(source.match(/<Dialog\b/g)?.length ?? 0).toBe(1);
    expect(source.match(/<DialogContent\b/g)?.length ?? 0).toBe(1);
    expect(source).toContain("function MetaAssetPicker");
    expect(source).toContain("pickerOpen ? (");
  });

  it("does not auto-stack the asset picker after OAuth return", () => {
    const oauthEffect = source.slice(
      source.indexOf('u.searchParams.get("meta") === "ok"'),
      source.indexOf("function toggle"),
    );
    expect(oauthEffect).not.toContain("openPicker()");
    expect(oauthEffect).toContain("Autorização Meta concluída");
  });

  it("removes literal emoji from Messenger and Instagram account rows", () => {
    expect(source).not.toContain("📘");
    expect(source).not.toContain("📷");
    expect(source).toContain('<MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />');
    expect(source).toContain('<Instagram className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />');
  });
});
