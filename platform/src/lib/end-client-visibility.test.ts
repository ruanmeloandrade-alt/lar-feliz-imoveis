import { describe, expect, it } from "vitest";
import {
  END_CLIENT_INTEGRATION_CATEGORIES,
  FUNCTIONAL_INTEGRATION_IDS,
  isIntegrationAdminOnly,
} from "./end-client-visibility";

describe("end client integration visibility", () => {
  it("keeps completed signature providers visible to customers", () => {
    expect(END_CLIENT_INTEGRATION_CATEGORIES.has("assinatura")).toBe(true);
    for (const id of ["clicksign", "zapsign", "docusign"]) {
      expect(FUNCTIONAL_INTEGRATION_IDS.has(id)).toBe(true);
      expect(isIntegrationAdminOnly({ id, category: "assinatura" })).toBe(false);
    }
  });

  it("does not mark completed Google and WhatsApp Cloud connections as admin-only", () => {
    expect(isIntegrationAdminOnly({ id: "conta-google", category: "arquivos" })).toBe(false);
    expect(isIntegrationAdminOnly({ id: "whatsapp-cloud", category: "social" })).toBe(false);
  });

  it("still protects genuinely internal or unfinished categories", () => {
    expect(isIntegrationAdminOnly({ id: "internal-voice-provider", category: "voz" })).toBe(true);
    expect(isIntegrationAdminOnly({ id: "unknown-integration", category: "social" })).toBe(true);
  });
});
