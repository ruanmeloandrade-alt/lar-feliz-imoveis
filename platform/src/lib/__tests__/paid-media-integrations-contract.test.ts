import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("#46 paid-media integrations contract", () => {
  it("keeps Google technical credentials server-side", () => {
    const panel = read("src/components/integrations/GoogleConnectPanel.tsx");
    const functions = read("src/lib/google.functions.ts");
    const server = read("src/lib/google.server.ts");
    const base = read("src/lib/google.server.base.ts");

    expect(panel).not.toContain("setAdsDeveloperToken");
    expect(panel).not.toContain("<Label>Developer Token</Label>");
    expect(panel).not.toContain("adsDeveloperToken:");
    expect(functions).not.toContain("adsDeveloperToken: z.string");
    expect(functions).not.toContain("data.adsDeveloperToken");
    expect(server).toContain("process.env.GOOGLE_ADS_DEVELOPER_TOKEN");
    expect(base).not.toContain(
      "secret.ads_developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN",
    );
  });

  it("uses a supported Google Ads API path", () => {
    const server = read("src/lib/google.server.ts");
    const base = read("src/lib/google.server.base.ts");
    const gestor = read("src/lib/ai-agent/gestor-paid-media-tools.server.ts");

    expect(server).toContain("googleads.googleapis.com/v25");
    expect(base).toContain("googleads.googleapis.com/v25");
    expect(gestor).toContain("googleads.googleapis.com/v25");
    expect(gestor).not.toContain("googleads.googleapis.com/v18");
  });

  it("keeps Google and TikTok consumable by Gestor de Tráfego", () => {
    const facade = read("src/lib/ai-agent/gestor-tools.server.ts");
    const paidMedia = read("src/lib/ai-agent/gestor-paid-media-tools.server.ts");
    const context = read("src/lib/ai-agent/gestor-context.server.ts");

    expect(facade).toContain("buildPaidMediaProviderTools");
    expect(paidMedia).toContain("list_google_ad_accounts");
    expect(paidMedia).toContain("list_tiktok_advertisers");
    expect(paidMedia).toContain("list_google_campaigns");
    expect(paidMedia).toContain("list_tiktok_campaigns");
    expect(context).toContain("buildPaidMediaProviderContext");
  });

  it("keeps TikTok Ads OAuth-first surfaces", () => {
    const panel = read("src/components/integrations/TikTokConnectPanel.tsx");
    const oauth = read("src/lib/tiktok.oauth.functions.ts");
    const callback = read("src/routes/api/public/oauth/tiktok/callback.ts");

    expect(panel).toContain("startTikTokAdsOAuth");
    expect(oauth).toContain("selectTikTokAdvertiser");
    expect(callback).toContain("exchangeTikTokAdsCode");
  });
});
