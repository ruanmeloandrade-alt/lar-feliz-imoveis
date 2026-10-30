import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialog = readFileSync(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8");

const livePanels = [
  "ConnectorDialog.tsx",
  "IntegrationConnectPanel.tsx",
  "ZapiConnectPanel.tsx",
  "EvolutionConnectPanel.tsx",
  "MetaConnectPanel.tsx",
  "WhatsAppCloudPanel.tsx",
  "TikTokConnectPanel.tsx",
  "ShopifyConnectPanel.tsx",
  "GoogleConnectPanel.tsx",
  "EmailConnectPanel.tsx",
  "MicrosoftConnectPanel.tsx",
  "SignatureConnectPanel.tsx",
  "ExternalAutomationPanel.tsx",
  "AgentMcpPanel.tsx",
];

describe("Integrações — padrão premium dos diálogos", () => {
  it("locks every dialog on /integracoes to one viewport-safe shell", () => {
    expect(dialog).toContain('window.location.pathname.startsWith("/integracoes")');
    expect(dialog).toContain("!max-w-[960px]");
    expect(dialog).toContain("!h-[min(760px,86vh)]");
    expect(dialog).toContain("!max-h-[86vh]");
    expect(dialog).toContain("!w-[calc(100vw-24px)]");
    expect(dialog).toContain("!overflow-y-auto");
    expect(dialog).toContain("overscroll-contain");
  });

  it("removes emoji from dialog presentation on the integrations route", () => {
    expect(dialog).toContain("Extended_Pictographic");
    expect(dialog).toContain("stripEmojiFromNode");
    expect(dialog).toContain("integrationsRoute ? stripEmojiFromNode(children) : children");
  });

  it("keeps all live integration panels on the shared DialogContent primitive", () => {
    for (const panel of livePanels) {
      const source = readFileSync(new URL(`../components/integrations/${panel}`, import.meta.url), "utf8");
      expect(source, panel).toContain("@/components/ui/dialog");
      expect(source, panel).toContain("DialogContent");
    }
  });
});
