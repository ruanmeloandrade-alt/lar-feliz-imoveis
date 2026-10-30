import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { computePausaCronometroMs } from "../salesbot-runtime.server";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const automation = readFileSync(
  resolve(root, "src/lib/mkton-lead-entry-automation.server.ts"),
  "utf8",
);
const provision = readFileSync(resolve(root, "src/lib/mkton-admin-provision.functions.ts"), "utf8");
const blueprint = readFileSync(resolve(root, "src/config/marketon-operation.ts"), "utf8");
const crmCi = readFileSync(resolve(root, ".github/workflows/mkton-config-ci.yml"), "utf8");

describe("Mkton · Leads de Entrada", () => {
  it("uses the existing funnel and refuses to create a replacement", () => {
    expect(provision).toContain("resolveExistingMktonFunnel");
    expect(provision).not.toContain('.ilike("name", "Leads de Entrada")');
    expect(provision).not.toMatch(/from\("pipelines"\)\s*\.insert/);
    expect(blueprint).toContain('name: "Leads de Entrada"');
  });

  it("uses a real 40 minute race between timer and lead reply", () => {
    expect(computePausaCronometroMs({ min: 40 })).toBe(40 * 60_000);
    expect(automation).toContain(
      'pauseRace("monitor-wait", { min: 40 }, "monitor-tag", "monitor-end")',
    );
    expect(automation).toContain('tipo: "msg-recebida"');
    expect(automation).toContain('tipo: "cronometro"');
  });

  it("creates four focused bots for reception, Julia, monitor and follow", () => {
    expect(automation).toContain('id: "mkton-lead-entry-reception"');
    expect(automation).toContain('id: "mkton-lead-entry-julia"');
    expect(automation).toContain('id: "mkton-lead-entry-40m-monitor"');
    expect(automation).toContain('id: "mkton-lead-entry-follow"');
  });

  it("keeps initial registration and follow registration attribution separate", () => {
    expect(automation).toContain('"ruanandradenegocios-cadastro-atendimento"');
    expect(automation).toContain('"ruanandradenegocios-cadastro-follow"');
    expect(automation).toContain('utmContent: "atendimento-inicial"');
    expect(automation).toContain('utmContent: "follow"');
  });

  it("configures ten follow messages and a work task", () => {
    const followCopyBody =
      automation.match(/const FOLLOW_COPY = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    const followMessages = followCopyBody.match(/`[\s\S]*?`/g) ?? [];
    expect(followMessages).toHaveLength(10);
    expect(automation).toContain('tarefaTitulo: "Ligar para lead sem resposta · Mkton"');
    expect(automation).toContain('tarefaWorkflowPriority: "alta"');
    expect(automation).toContain("tarefaTambemCalendario: false");
  });

  it("records journey state with tags and custom fields", () => {
    expect(provision).toContain('status_jornada: "Jornada · Status"');
    expect(automation).toContain('acaoConfig: "jornada:atendimento"');
    expect(automation).toContain('acaoConfig: "jornada:follow"');
    expect(automation).toContain('acaoConfig: "jornada:cad-lost"');
    expect(automation).toContain('campoNome: "Jornada · Status"');
  });

  it("keeps Grupo, Prospecção and Software RB Media out of this provisioning", () => {
    expect(blueprint).toContain('"Grupo"');
    expect(blueprint).toContain('"Prospecção"');
    expect(blueprint).toContain('"Software RB Media"');
    expect(provision).not.toContain('name: "Grupo"');
    expect(provision).not.toContain('name: "Prospecção"');
    expect(provision).not.toContain('name: "Software RB Media"');
  });

  it("resolves the CRM workspace through the canonical resolver", () => {
    expect(provision).toContain("requireActiveWorkspace");
    expect(provision).toContain("requireActiveWorkspace(sb as never, userId)");
    expect(provision).not.toContain('.select("current_workspace_id")');
  });

  it("requires super_admin before mutating the Mkton operational workspace", () => {
    expect(provision).toContain('rpc("has_role"');
    expect(provision).toContain('_role: "super_admin"');
    expect(provision).toContain('reason: "not_super_admin"');
  });

  it("runs CRM integration CI when workspace or entitlement boundaries change", () => {
    expect(crmCi).toContain("src/lib/workspace-resolver.server.ts");
    expect(crmCi).toContain("src/lib/billing/entitlements.ts");
    expect(crmCi).toContain("src/lib/activated-modules.functions.ts");
  });
});
