import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Evolution QR close recovery", () => {
  it("keeps a non-connected WhatsApp card available instead of preparation-locked", () => {
    const integrationsRoute = source("src/routes/integracoes.tsx");

    expect(integrationsRoute).toContain('setWaStatus(rows.some((session) => session.status === "conectado") ? "conectado" : "desconectado")');
    expect(integrationsRoute).toContain("Pronto para conectar");
    expect(integrationsRoute).not.toContain('rows.length ? "em_preparacao"');
  });

  it("recovers never-paired sessions that were persisted as pairing failures", () => {
    const panel = source("src/components/integrations/EvolutionConnectPanel.tsx");

    expect(panel).toContain('"falha_pareamento"');
    expect(panel).toContain("AUTO_RESUME_STATUSES");
    expect(panel).toContain("await recreateSession(session.id, \"WhatsApp\")");
    expect(panel).toContain("await recreateSession(sessionId, \"WhatsApp\")");
    expect(panel).toContain("Gerar QR");
  });
});
