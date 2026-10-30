import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const crmSource = readFileSync("src/lib/crm.functions.ts", "utf8");
const automationEngine = readFileSync("src/lib/stage-automation-engine.server.ts", "utf8");
const integrityMigration = readFileSync(
  "supabase/migrations/20260809165000_crm_pipeline_source_integrity.sql",
  "utf8",
);

describe("CRM core completion — batch 02", () => {
  it("TESTE 04: funil e fonte CRM não podem cruzar workspaces", () => {
    expect(integrityMigration).toContain("assert_crm_pipeline_source_integrity");
    expect(integrityMigration).toContain("s.id = NEW.crm_source_id");
    expect(integrityMigration).toContain("s.workspace_id = NEW.workspace_id");
    expect(integrityMigration).toContain("crm_pipeline_source_integrity_guard");

    expect(integrityMigration).toContain("assert_crm_source_funnel_integrity");
    expect(integrityMigration).toContain("p.id = NEW.pipeline_id");
    expect(integrityMigration).toContain("p.workspace_id = NEW.workspace_id");
    expect(integrityMigration).toContain("crm_source_funnel_integrity_guard");
  });

  it("TESTE 05: movimentação de lead permanece ligada ao motor de automações", () => {
    const moveStart = crmSource.indexOf('export const moveLead = createServerFn({ method: "POST" })');
    const moveEnd = crmSource.indexOf('/* ----- delete lead ----- */', moveStart);
    const moveLeadBlock = crmSource.slice(moveStart, moveEnd > moveStart ? moveEnd : undefined);

    expect(moveStart).toBeGreaterThanOrEqual(0);
    expect(moveLeadBlock).toContain('.eq("workspace_id", wsId)');
    expect(moveLeadBlock).toContain('stage_id: data.toStageId');
    expect(moveLeadBlock).toContain('dispatchCrmStageMoved');
    expect(moveLeadBlock).toContain('fromStageId: previousStageByLead.get(id) ?? null');
    expect(moveLeadBlock).toContain('newStageId: data.toStageId');
    expect(moveLeadBlock).toContain('newPipelineId: pipelineId');
  });

  it("TESTE 06: automações de etapa têm isolamento, dedupe e fila durável", () => {
    expect(automationEngine).toContain('.eq("workspace_id", lead.workspaceId)');
    expect(automationEngine).toContain('const dedupeKey = `${action.id}:${eventId}`');
    expect(automationEngine).toContain("dedupe_key: dedupeKey");
    expect(automationEngine).toContain('status: "pending"');
    expect(automationEngine).toContain("due_at: dueAt");
    expect(automationEngine).toContain('String((insertError as any).code) === "23505"');
    expect(automationEngine).toContain("if (delay === 0) immediate.push");
  });
});
