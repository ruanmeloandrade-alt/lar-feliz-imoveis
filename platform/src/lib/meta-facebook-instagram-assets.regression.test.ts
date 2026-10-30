import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const meta = readFileSync("src/lib/meta.functions.ts", "utf8");
const panel = readFileSync("src/components/integrations/MetaConnectPanel.tsx", "utf8");
const callback = readFileSync("src/routes/api/public/oauth/meta/callback.ts", "utf8");

describe("Meta · páginas Facebook e Instagram", () => {
  it("refaz consentimento e mantém os escopos necessários", () => {
    expect(meta).toContain('url.searchParams.set("auth_type", "rerequest")');
    expect(meta).toContain('"pages_show_list"');
    expect(meta).toContain('"business_management"');
    expect(meta).toContain('"instagram_basic"');
  });

  it("descobre páginas diretas e de portfolios Meta", () => {
    expect(meta).toContain('fetchAllPaged<MetaDiscoverablePage>("me/accounts"');
    expect(meta).toContain('["owned_pages", "client_pages"] as const');
    expect(meta).toContain("discoverMetaPagesForToken(token)");
  });

  it("expõe Instagram no seletor e envia seleção explícita ao sync", () => {
    expect(panel).toContain("Instagram Professional ({available.instagram.length})");
    expect(panel).toContain("pickInstagram");
    expect(panel).toContain("instagramIds: Array.from(pickInstagram)");
    expect(meta).toContain("instagramIds: z.array(z.string()).optional()");
  });

  it("registra permissões concedidas e recusadas no callback", () => {
    expect(callback).toContain('"me/permissions"');
    expect(callback).toContain("granted_permissions: grantedPermissions");
    expect(callback).toContain("declined_permissions: declinedPermissions");
  });

  it("explica que o cliente pode autorizar a própria conta Meta", () => {
    expect(panel).toContain("Pode ser o próprio cliente");
    expect(panel).toContain("você não precisa virar administrador de todas as Páginas");
  });
});
