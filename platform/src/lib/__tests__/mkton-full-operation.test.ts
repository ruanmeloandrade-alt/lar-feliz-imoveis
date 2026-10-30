import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manualPack = readFileSync(resolve(root, "src/lib/mkton-manual-pack.server.ts"), "utf8");
const provision = readFileSync(resolve(root, "src/lib/mkton-full-provision.functions.ts"), "utf8");
const rootRoute = readFileSync(resolve(root, "src/routes/__root.tsx"), "utf8");

describe("Mkton · pacote manual de SalesBots e agentes", () => {
  it("defines exactly the 24 SalesBots requested", () => {
    const idsBody =
      manualPack.match(/export const MKTON_MANUAL_BOT_IDS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    const ids = idsBody.match(/"mkton-[^"]+"/g) ?? [];
    expect(ids).toHaveLength(24);
    expect(manualPack).toContain("if (bots.length !== 24)");
  });

  it("creates SalesBots with no automatic triggers", () => {
    expect(manualPack).toContain("gatilhos: []");
    expect(manualPack).not.toContain('kind: "movido-etapa"');
  });

  it("keeps pipeline transitions as manual placeholders without pipeline or stage IDs", () => {
    expect(manualPack).toContain("manualConnectionRequired: true");
    expect(manualPack).toContain('acaoTipo: "mudar-status-lead"');
    expect(manualPack).not.toContain("destinoPipelineId");
    expect(manualPack).not.toContain("destinoStageId");
  });

  it("keeps AI handoff blocks as manual placeholders without agent IDs", () => {
    expect(manualPack).toContain('kind: "iniciar-ia"');
    expect(manualPack).not.toContain("iaAgentId");
  });

  it("creates bots before creating the three AI agents", () => {
    const botsPhase = manualPack.indexOf("// Fase 1: cria exatamente os 24 SalesBots");
    const agentsPhase = manualPack.indexOf("// Fase 2: somente depois dos bots");
    expect(botsPhase).toBeGreaterThan(-1);
    expect(agentsPhase).toBeGreaterThan(botsPhase);
  });

  it("defines exactly three independent Julia agents", () => {
    expect(manualPack).toContain('"Júlia Braga · Ativação Mkton"');
    expect(manualPack).toContain('"Júlia Braga · Reativação Mkton"');
    expect(manualPack).toContain('"Júlia Braga · Redes Sociais Mkton"');
    const namesBody =
      manualPack.match(/export const MKTON_MANUAL_AGENT_NAMES = \[([\s\S]*?)\] as const;/)?.[1] ??
      "";
    const names = namesBody.match(/"Júlia Braga · [^"]+"/g) ?? [];
    expect(names).toHaveLength(3);
  });

  it("deletes existing bots, blocks and AI agents only inside the active workspace", () => {
    expect(manualPack).toContain(
      'from("salesbot_blocks").delete().eq("workspace_id", workspaceId)',
    );
    expect(manualPack).toContain('from("salesbots").delete().eq("workspace_id", workspaceId)');
    expect(manualPack).toContain(
      'from("conversation_ai_agents").delete().eq("workspace_id", workspaceId)',
    );
  });

  it("seeds the manual pack once and then preserves manual connections", () => {
    expect(manualPack).toContain('MKTON_MANUAL_PACK_VERSION = "manual-connections-v1"');
    expect(provision).toContain("manual_pack_already_seeded_preserve_manual_connections");
    expect(provision).toContain("packSeeded");
  });

  it("disables the legacy lead-entry bootstrap so it cannot recreate four extra bots", () => {
    expect(provision).toContain("leadEntryReady: true");
    expect(rootRoute).toContain("if (bootstrap.allowed && !bootstrap.leadEntryReady)");
  });

  it("does not provision products, subscription sync or tracked links in the manual pack bootstrap", () => {
    expect(provision).not.toContain("provisionMktonProducts");
    expect(provision).not.toContain("syncMktonSubscriptionsToCrm");
    expect(provision).not.toContain("auditAndCorrectMktonFullOperation");
    expect(manualPack).not.toContain('from("tracked_links")');
    expect(manualPack).not.toContain('from("pipelines")');
    expect(manualPack).not.toContain('from("pipeline_stages")');
  });
});
