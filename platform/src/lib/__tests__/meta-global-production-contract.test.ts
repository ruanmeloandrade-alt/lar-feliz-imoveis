import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const metaFunctions = readFileSync(new URL("../meta.functions.ts", import.meta.url), "utf8");
const metaCallback = readFileSync(
  new URL("../../routes/api/public/oauth/meta/callback.ts", import.meta.url),
  "utf8",
);

function oauthScopes(source: string): string[] {
  const block = source.match(/const SCOPES = \[([\s\S]*?)\];/);
  if (!block) return [];
  return Array.from(block[1].matchAll(/"([a-z0-9_]+)"/g), (match) => match[1]);
}

describe("Meta global production contract", () => {
  it("requests the permissions required by Messenger, Instagram, Ads and Lead Ads", () => {
    const scopes = oauthScopes(metaFunctions);

    expect(scopes).toEqual(expect.arrayContaining([
      "pages_messaging",
      "pages_manage_metadata",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_messages",
      "leads_retrieval",
      "ads_read",
      "ads_management",
      "business_management",
    ]));
  });

  it("keeps catalog_management only while the OAuth callback consumes product catalogs", () => {
    const scopes = oauthScopes(metaFunctions);

    expect(scopes).toContain("catalog_management");
    expect(metaCallback).toContain("owned_product_catalogs");
    expect(metaCallback).toContain("catalogs: catalogs.map");
  });
});
