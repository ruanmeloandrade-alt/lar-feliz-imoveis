import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/routes/modulos.gestor-trafego.index.tsx"), "utf8");
const table = readFileSync(resolve(process.cwd(), "src/components/meta/MetaAdsManagerTable.tsx"), "utf8");

describe("Gestor de Tráfego product contract", () => {
  it("does not expose the Ads Manager clone campaign creator", () => {
    expect(page).not.toContain("NewCampaignDialog");
    expect(page).not.toContain("Nova campanha");
    expect(page).not.toContain("setNewOpen");
    expect(table).not.toContain("onNewCampaign");
  });

  it("keeps campaigns, ad sets and ads as operational views", () => {
    expect(table).toContain('l: "Campanhas"');
    expect(table).toContain('l: "Conjuntos de anúncios"');
    expect(table).toContain('l: "Anúncios"');
  });

  it("redirects creation guidance to executable automations", () => {
    expect(page).toContain("Automações Executáveis");
  });
});
