import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Tracking T11 — regressão consolidada de release", () => {
  it("mantém as regressões dos blocos 1, 2, 3 e da auditoria de UI versionadas", () => {
    const block1 = source("./tracking-block-1-regression.test.ts");
    const block2 = source("./tracking-block-2-regression.test.ts");
    const block3 = source("./tracking-block-3-regression.test.ts");
    const ui = source("./tracking-ui-audit-regression.test.ts");

    expect(block1).toContain("Tracking");
    expect(block2).toContain("Tracking");
    expect(block3).toContain("Meta CAPI");
    expect(block3).toContain("Google Ads e WhatsApp");
    expect(block3).toContain("Social Media e Workflow");
    expect(ui).toContain("UI alinhada ao backend real");
  });

  it("mantém isolamento de workspace nos pontos server-side críticos", () => {
    const live = source("./tracking-live.functions.ts");
    const dispatcher = source("./tracking-dispatcher.server.ts");
    const uiAudit = source("./tracking-ui-audit.functions.ts");

    expect(live).toContain("await assertMember(supabase, data.workspaceId, userId)");
    expect(live).toContain('.eq("workspace_id", data.workspaceId)');
    expect(dispatcher).toContain("input.workspaceId");
    expect(uiAudit).toContain("await assertMember(supabase, data.workspaceId, userId)");
    expect(uiAudit).toContain('.eq("workspace_id", data.workspaceId)');
  });

  it("mantém conversões baseadas em ocorrências reais e dispatch idempotente", () => {
    const live = source("./tracking-live.functions.ts");
    const dispatcher = source("./tracking-dispatcher.server.ts");

    expect(live).toContain('from("tracking_conversion_events")');
    expect(dispatcher).toContain("tracking_dispatch_log");
    expect(dispatcher).toContain("eventRowId");
    expect(dispatcher).not.toContain("input.eventRowId ?? Date.now()");
  });

  it("mantém UI sem os falsos positivos corrigidos na T10", () => {
    const diagnostics = source("../components/tracking/TrackingDiagnostics.tsx");
    const conversions = source("../components/tracking/TrackingConversions.tsx");
    const mapper = source("../components/tracking/TrackingEventMapper.tsx");

    expect(diagnostics).not.toContain("listTrackingEvents");
    expect(conversions).toContain("getTrackingConversionStats");
    expect(mapper).toContain("marque esse evento como conversão na aba Conversões");
  });
});
