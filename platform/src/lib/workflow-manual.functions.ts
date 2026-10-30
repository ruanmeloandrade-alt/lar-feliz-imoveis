import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

const createManualTaskSchema = z.object({
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(20_000).optional(),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  estimatedSeconds: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  links: z.array(z.object({ label: z.string().max(255), url: z.string().max(2_000) })).max(50).optional(),
  credentials: z.array(z.object({
    label: z.string().max(255),
    username: z.string().max(500),
    password: z.string().max(2_000),
    notes: z.string().max(2_000),
  })).max(50).optional(),
});

async function canManageWorkflow(supabase: any, workspaceId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_manage_workflow", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function assertManager(supabase: any, workspaceId: string, userId: string) {
  if (!(await canManageWorkflow(supabase, workspaceId, userId))) {
    throw new Error("Você não tem permissão para executar esta ação manual no fluxo de trabalho.");
  }
}

async function assertStageBelongsToPipeline(supabase: any, workspaceId: string, pipelineId: string, stageId: string) {
  const { data: stage, error } = await supabase
    .from("workflow_stages")
    .select("id,pipeline_id")
    .eq("id", stageId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!stage || stage.pipeline_id !== pipelineId) {
    throw new Error("A etapa escolhida não pertence ao fluxo selecionado.");
  }
}

async function assertPipelineExists(supabase: any, workspaceId: string, pipelineId: string) {
  const { data: pipeline, error } = await supabase
    .from("workflow_pipelines")
    .select("id")
    .eq("id", pipelineId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pipeline) throw new Error("Fluxo selecionado não encontrado.");
}

async function assertAssigneeIsWorkspaceMember(supabase: any, workspaceId: string, assigneeId?: string | null) {
  if (!assigneeId) return;
  const { data: member, error } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", assigneeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("O responsável escolhido não pertence a este workspace.");
}

async function resolveManualStage(supabase: any, workspaceId: string, pipelineId: string, stageId?: string) {
  await assertPipelineExists(supabase, workspaceId, pipelineId);
  if (stageId) {
    await assertStageBelongsToPipeline(supabase, workspaceId, pipelineId, stageId);
    return stageId;
  }

  const { data: stage, error } = await supabase
    .from("workflow_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipelineId)
    .eq("is_done_stage", false)
    .eq("is_incomplete_stage", false)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!stage) throw new Error("O fluxo selecionado não possui uma etapa inicial disponível.");
  return stage.id as string;
}

export const createManualWorkflowTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createManualTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const workspaceId = await requireActiveWorkspace(supabase, context.userId, { createIfMissing: false });
    await assertManager(supabase, workspaceId, context.userId);
    await assertAssigneeIsWorkspaceMember(supabase, workspaceId, data.assigneeId);
    const stageId = await resolveManualStage(supabase, workspaceId, data.pipelineId, data.stageId);

    const { data: row, error } = await supabase
      .from("workflow_tasks")
      .insert({
        workspace_id: workspaceId,
        pipeline_id: data.pipelineId,
        stage_id: stageId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        due_at: data.dueAt ?? null,
        assignee_id: data.assigneeId ?? null,
        estimated_seconds: data.estimatedSeconds ?? null,
        tags: data.tags ?? [],
        links: data.links ?? [],
        credentials: data.credentials ?? [],
        status: "ativa",
        position: 0,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      const { runInlineTrigger } = await import("@/lib/workflow-automations-runtime.server");
      await runInlineTrigger(row.id, "task_created");
    } catch (triggerError) {
      console.error("[workflow] task_created trigger failed", triggerError);
    }

    return { id: row.id as string };
  });

const moveManualTaskSchema = z.object({
  taskId: z.string().uuid(),
  stageId: z.string().uuid(),
  position: z.number().int().nonnegative().default(0),
});

export const moveManualWorkflowTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => moveManualTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const workspaceId = await requireActiveWorkspace(supabase, context.userId, { createIfMissing: false });
    await assertManager(supabase, workspaceId, context.userId);

    const { data: task, error: taskError } = await supabase
      .from("workflow_tasks")
      .select("id,pipeline_id")
      .eq("id", data.taskId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) throw new Error("Tarefa não encontrada.");

    await assertStageBelongsToPipeline(supabase, workspaceId, task.pipeline_id, data.stageId);

    const { data: row, error } = await supabase
      .from("workflow_tasks")
      .update({ stage_id: data.stageId, position: data.position, updated_at: new Date().toISOString() })
      .eq("id", data.taskId)
      .eq("workspace_id", workspaceId)
      .select("id,stage_id,position")
      .single();
    if (error) throw new Error(error.message);

    return { id: row.id as string, stageId: row.stage_id as string, position: Number(row.position ?? 0) };
  });

const duplicateManualTaskSchema = z.object({ taskId: z.string().uuid() });

export const duplicateManualWorkflowTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => duplicateManualTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const workspaceId = await requireActiveWorkspace(supabase, context.userId, { createIfMissing: false });
    await assertManager(supabase, workspaceId, context.userId);

    const { data: source, error: sourceError } = await supabase
      .from("workflow_tasks")
      .select("*")
      .eq("id", data.taskId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) throw new Error("Tarefa não encontrada.");

    const { data: copy, error } = await supabase
      .from("workflow_tasks")
      .insert({
        workspace_id: workspaceId,
        pipeline_id: source.pipeline_id,
        stage_id: source.stage_id,
        title: `${source.title} (cópia)`,
        description: source.description,
        priority: source.priority,
        due_at: source.due_at,
        assignee_id: source.assignee_id,
        estimated_seconds: source.estimated_seconds,
        tags: source.tags ?? [],
        links: source.links ?? [],
        credentials: source.credentials ?? [],
        status: "ativa",
        position: Number(source.position ?? 0) + 1,
        time_spent_seconds: 0,
        completed_at: null,
        incomplete_reason: null,
        review_status: null,
        review_outcome: null,
        review_note: null,
        review_submitted_at: null,
        review_reviewed_at: null,
        review_reviewed_by: null,
        review_round: 0,
        is_review_copy: false,
        review_source_task_id: null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: copy.id as string };
  });
