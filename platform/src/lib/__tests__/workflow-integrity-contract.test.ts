import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260809124500_workflow_integrity_guards.sql",
  "utf8",
);

describe("Workflow integrity guards", () => {
  it("T1 rejects stages whose pipeline belongs to another workspace", () => {
    expect(migration).toContain("assert_workflow_stage_integrity");
    expect(migration).toContain("p.id = NEW.pipeline_id");
    expect(migration).toContain("p.workspace_id = NEW.workspace_id");
    expect(migration).toContain("workflow_stage_integrity_guard");
  });

  it("T2 prevents contradictory terminal stage semantics", () => {
    expect(migration).toContain("workflow_stage_terminal_state_check");
    expect(migration).toContain("COALESCE(is_done_stage, false) AND COALESCE(is_incomplete_stage, false)");
    expect(migration).toContain("NOT VALID");
  });

  it("T3 keeps task workspace, pipeline and stage consistent", () => {
    expect(migration).toContain("assert_workflow_task_integrity");
    expect(migration).toContain("v_stage_workspace IS DISTINCT FROM NEW.workspace_id");
    expect(migration).toContain("v_stage_pipeline IS DISTINCT FROM NEW.pipeline_id");
    expect(migration).toContain("workflow_task_integrity_guard");
  });

  it("T4 only allows assignees that belong to the task workspace", () => {
    expect(migration).toContain("wm.workspace_id = NEW.workspace_id");
    expect(migration).toContain("wm.user_id = NEW.assignee_id");
    expect(migration).toContain("Workflow task assignee is not a workspace member");
  });

  it("T5 scopes timers to the task workspace and authorized workspace users", () => {
    expect(migration).toContain("assert_workflow_time_session_integrity");
    expect(migration).toContain("v_task_workspace IS DISTINCT FROM NEW.workspace_id");
    expect(migration).toContain("wm.user_id = NEW.user_id");
    expect(migration).toContain("public.can_manage_workflow(NEW.workspace_id, NEW.user_id)");
    expect(migration).toContain("workflow_time_session_integrity_guard");
  });
});
