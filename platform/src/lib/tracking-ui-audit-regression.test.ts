import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Tracking T10 — UI alinhada ao backend real", () => {
  it("mostra ocorrências reais de conversão dos últimos 30 dias", () => {
    const ui = source("../components/tracking/TrackingConversions.tsx");
    const server = source("./tracking-ui-audit.functions.ts");

    expect(ui).toContain("getTrackingConversionStats");
    expect(ui).toContain("Ocorrências reais gravadas pelo Tracking");
    expect(server).toContain('.from("tracking_conversion_events")');
    expect(server).toContain('.from("tracking_events")');
    expect(server).toContain('.eq("workspace_id", data.workspaceId)');
    expect(server).toContain("valueBRL");
  });

  it("faz o diagnóstico ao vivo por site cadastrado, sem usar eventos globais do workspace", () => {
    const diagnostics = source("../components/tracking/TrackingDiagnostics.tsx");

    expect(diagnostics).toContain("normalizeDomain");
    expect(diagnostics).toContain("registeredSite");
    expect(diagnostics).toContain("verifyPixelInstall({ data: { workspaceId, siteId: registeredSite.id } })");
    expect(diagnostics).not.toContain("listTrackingEvents");
    expect(diagnostics).not.toContain('fetch(target, { mode: "no-cors" })');
    expect(diagnostics).toContain("sem misturar dados de outras fontes");
  });

  it("não chama site apenas verificado de site ativo por recebimento", () => {
    const overview = source("../components/tracking/TrackingOverview.tsx");

    expect(overview).toContain("Sites verificados");
    expect(overview).toContain("pixel validado no cadastro");
    expect(overview).toContain("Tracking recebendo eventos nas últimas 24 horas");
    expect(overview).not.toContain('label: "Sites ativos"');
  });

  it("não promete conversão ao criar apenas uma regra de evento", () => {
    const mapper = source("../components/tracking/TrackingEventMapper.tsx");

    expect(mapper).toContain("marque esse evento como conversão na aba Conversões");
    expect(mapper).toContain("CREATABLE_TRIGGERS");
    expect(mapper).toContain('["click", "form", "url"]');
    expect(mapper).toContain("Valor do evento (opcional)");
  });
});
