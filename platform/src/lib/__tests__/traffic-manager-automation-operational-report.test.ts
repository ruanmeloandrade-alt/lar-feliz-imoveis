import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const server = readFileSync(resolve(process.cwd(), "src/lib/meta-automation-operational-report.functions.ts"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "src/components/meta/MetaRuleStatsDialog.tsx"), "utf8");

describe("Gestor automation operational report", () => {
  it("reports reads, executions, ignored actions, failures and operational timestamps", () => {
    expect(server).toContain("lastReadAt");
    expect(server).toContain("lastExecutedAt");
    expect(server).toContain("lastFailureAt");
    expect(server).toContain("ignoredActions");
    expect(dialog).toContain("Última leitura");
    expect(dialog).toContain("Última ação executada");
  });

  it("exposes target, decision, configured conditions and action outcomes", () => {
    expect(server).toContain("target: targetOf(rule, run)");
    expect(server).toContain("structuredError");
    expect(server).toContain("actualRecorded");
    expect(dialog).toContain("Leitura → decisão → execução");
    expect(dialog).toContain("Erro estruturado:");
  });

  it("never invents missing historical condition values or activation timestamps", () => {
    expect(server).toContain("Histórico atual não persiste o valor individual desta condição; não foi inferido.");
    expect(server).toContain("activationTimestamp: null");
    expect(server).toContain("não persiste um timestamp confiável da última ativação");
    expect(dialog).toContain("valores ausentes não são inferidos");
  });

  it("reuses Task 11 semantic classification instead of counting raw status as success", () => {
    expect(server).toContain("normalizeAutomationRun(run)");
    expect(server).toContain("semantic.executed");
    expect(server).toContain("semantic.failed");
  });
});
