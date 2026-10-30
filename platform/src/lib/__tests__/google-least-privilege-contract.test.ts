import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("#47 Google least-privilege OAuth contract", () => {
  it("derives scopes from the selected Google products", () => {
    const server = read("src/lib/google.server.base.ts");
    expect(server).toContain("GOOGLE_PRODUCT_SCOPES");
    expect(server).toContain("googleScopesForProducts");
    expect(server).toContain('tagmanager: ["https://www.googleapis.com/auth/tagmanager.readonly"]');
    expect(server).not.toContain(
      'tagmanager: ["https://www.googleapis.com/auth/tagmanager.edit.containers"]',
    );
  });

  it("keeps incremental offline OAuth without forcing consent on every connection", () => {
    const server = read("src/lib/google.server.base.ts");
    const functions = read("src/lib/google.functions.ts");
    expect(server).toContain('u.searchParams.set("access_type", "offline")');
    expect(server).toContain('u.searchParams.set("include_granted_scopes", "true")');
    expect(server).toContain('if (args.forceConsent) u.searchParams.set("prompt", "consent")');
    expect(functions).toContain("forceConsent: !current?.refresh_token");
    expect(server).not.toContain('\n  u.searchParams.set("prompt", "consent");');
  });

  it("carries selected products through signed state and callback persistence", () => {
    const server = read("src/lib/google.server.base.ts");
    const functions = read("src/lib/google.functions.ts");
    const callback = read("src/routes/api/public/oauth/google/callback.ts");
    expect(server).toContain("products: normalizeGoogleProducts(products)");
    expect(server).toContain("products: normalizeGoogleProducts(obj.products)");
    expect(functions).toContain("products: z.array");
    expect(functions).toContain("googleScopesForProducts(products)");
    expect(callback).toContain("products: st.products");
    expect(callback).toContain(
      "scope: tok.scope ?? (previous.scope as string | undefined) ?? null",
    );
  });

  it("does not expose platform Google secrets to the client", () => {
    const panel = read("src/components/integrations/GoogleConnectPanel.tsx");
    const functions = read("src/lib/google.functions.ts");
    expect(panel).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(panel).not.toContain("adsDeveloperToken");
    expect(functions).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
    expect(functions).not.toContain("adsDeveloperToken: z.string");
  });

  it("distinguishes selected products from scopes actually granted by Google", () => {
    const panel = read("src/components/integrations/GoogleConnectPanel.tsx");
    const callback = read("src/routes/api/public/oauth/google/callback.ts");
    expect(panel).toContain("selectedProducts");
    expect(panel).toContain("Checkbox");
    expect(panel).toContain("GOOGLE_SCOPE_BY_PRODUCT");
    expect(panel).toContain("split(/\\s+/)");
    expect(panel).toContain("grantedScopes.has(productScope)");
    expect(panel).toContain("{authorized ? (");
    expect(panel).not.toContain("connected && status?.products.includes(p.id)");
    expect(callback).not.toContain("Workspace liberados na central");
  });
});
