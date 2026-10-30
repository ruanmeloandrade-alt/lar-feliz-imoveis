import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync(new URL("../components/integrations/IntegrationCard.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/integrations/ConnectorDialog.tsx", import.meta.url), "utf8");
const google = readFileSync(new URL("../components/integrations/GoogleConnectPanel.tsx", import.meta.url), "utf8");
const googleFunctions = readFileSync(new URL("./google.functions.ts", import.meta.url), "utf8");

describe("Integrações card UX v2", () => {
  it("keeps the external integration card compact", () => {
    expect(card).toContain('min-h-[148px]');
    expect(card).not.toContain('min-h-[230px]');
    expect(card).not.toContain('grid gap-2 text-[11px] sm:grid-cols-2');
  });

  it("does not simulate save or test actions in the generic connector dialog", () => {
    expect(dialog).not.toContain("setTimeout");
    expect(dialog).not.toContain("toast.success");
    expect(dialog).not.toContain("Testar conexão");
    expect(dialog).toContain("não simula salvamento");
  });

  it("explains connection model, cost and steps in the generic detail", () => {
    expect(dialog).toContain('label="Conectar"');
    expect(dialog).toContain('label="Custo"');
    expect(dialog).toContain("Como funciona");
    expect(dialog).toContain("Passo a passo");
  });

  it("keeps Google Business Profile on the real Google OAuth backend", () => {
    expect(google).toContain('business: "https://www.googleapis.com/auth/business.manage"');
    expect(google).toContain('TabsTrigger value="gbp">Business Profile');
    expect(google).toContain("fnGbpAccounts");
    expect(google).toContain("fnGbpLocations");
    expect(google).toContain("fnGbpPerf");
    expect(google).toContain("fnReviews");
    expect(googleFunctions).toContain("listGbpAccounts");
    expect(googleFunctions).toContain("listGbpLocations");
    expect(googleFunctions).toContain("getGbpPerformance");
    expect(googleFunctions).toContain("replyGbpReview");
  });

  it("makes Google Meu Negócio discoverable from the compact Google card", () => {
    expect(card).toContain("OAuth Google · inclui Business Profile");
    expect(card).toContain("Google Meu Negócio · Ads · Analytics · Workspace");
  });
});
