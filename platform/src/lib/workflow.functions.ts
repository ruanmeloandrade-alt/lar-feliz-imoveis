import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

async function canManage(sb: AnySb, wsId: string, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("can_manage_workflow", { _workspace_id: wsId, _user_id: userId });
  return Boolean(data);
}

// ---------- Types ----------
export interface WorkflowStage {
  id: string;
  name: string;
  color: string;
  position: number;
  isDoneStage: boolean;
  isIncompleteStage: boolean;
  isReviewStage: boolean;
}
export interface WorkflowTaskLite {
  id: string;
  stageId: string;
  title: string;
  priority: "baixa" | "media" | "alta" | "urgente";
  dueAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: "ativa" | "concluida" | "incompleta" | "em_revisao";
  timeSpentSeconds: number;
  position: number;
  checklistDone: number;
  checklistTotal: number;
  commentsCount: number;
  activeSessionSince: string | null;
  reviewStatus: "pending" | "approved" | "returned" | null;
  reviewNotes: string | null;
  submittedForReviewAt: string | null;
  isReviewCopy: boolean;
  reviewCopyOf: string | null;
  reviewOutcome: "concluida" | "incompleta" | null;
  reviewRound: number;
  tags: string[];
}
export interface WorkflowPipelineRef {
  id: string;
  name: string;
  color: string | null;
  sectorId: string | null;
  sectorName: string | null;
  sectorColor: string | null;
  isDefault: boolean;
  memberIds: string[];
}
export interface WorkflowBoard {
  pipelineId: string;
  pipelineName: string;
  sectorId: string | null;
  sectorName: string | null;
  stages: WorkflowStage[];
  tasks: WorkflowTaskLite[];
  members: { id: string; name: string; email: string | null; avatarUrl: string | null }[];
  canManage: boolean;
  currentUserActiveSession: { taskId: string; startedAt: string } | null;
  pipelines: WorkflowPipelineRef[];
}

// ---------- Board ----------
export const getWorkflowBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<WorkflowBoard> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const manage = await canManage(sb, wsId, context.userId);

    // Ensure default pipeline + stages exist (only if user can manage), no sector = fluxo do admin
    let { data: pipes } = await sb
      .from("workflow_pipelines")
      .select("id,name,color,position,is_default,sector_id")
      .eq("workspace_id", wsId)
      .order("position", { ascending: true });
    if ((!pipes || pipes.length === 0) && manage) {
      const { data: created } = await sb
        .from("workflow_pipelines")
        .insert({ workspace_id: wsId, name: "Fluxo do gestor", is_default: true, position: 0 })
        .select("id,name,color,position,is_default,sector_id")
        .single();
      pipes = [created];
      const defaults = [
        { name: "Backlog", color: "#94a3b8", position: 0, is_done_stage: false, is_incomplete_stage: false },
        { name: "Em fila", color: "#38bdf8", position: 1, is_done_stage: false, is_incomplete_stage: false },
        { name: "Fazendo", color: "#f59e0b", position: 2, is_done_stage: false, is_incomplete_stage: false },
        { name: "Revisão", color: "#a78bfa", position: 3, is_done_stage: false, is_incomplete_stage: false },
        { name: "Concluído", color: "#22c55e", position: 4, is_done_stage: true, is_incomplete_stage: false },
        { name: "Incompleto", color: "#ef4444", position: 5, is_done_stage: false, is_incomplete_stage: true },
      ];
      await sb.from("workflow_stages").insert(
        defaults.map((d) => ({ ...d, workspace_id: wsId, pipeline_id: (created as any).id })),
      );
    }

    // Load sectors for pipeline metadata
    const { data: sectorsRows } = await sb
      .from("workflow_sectors")
      .select("id,name,color")
      .eq("workspace_id", wsId);
    const sectorMap = new Map<string, { name: string; color: string }>(
      ((sectorsRows ?? []) as any[]).map((s: any) => [s.id, { name: s.name, color: s.color }]),
    );
    // Load sector members map
    const { data: allSectorMembers } = await sb
      .from("workflow_sector_members")
      .select("sector_id,user_id")
      .in(
        "sector_id",
        ((sectorsRows ?? []) as any[]).map((s: any) => s.id),
      );
    const sectorMembersMap = new Map<string, string[]>();
    for (const m of (allSectorMembers ?? []) as any[]) {
      const arr = sectorMembersMap.get(m.sector_id) ?? [];
      arr.push(m.user_id);
      sectorMembersMap.set(m.sector_id, arr);
    }

    // Filter to pipelines the user can access (manage = all; else via sector membership)
    let accessible: any[] = pipes ?? [];
    if (!manage) {
      const [{ data: memberSectors }, { data: managedSectors }] = await Promise.all([
        sb
          .from("workflow_sector_members")
          .select("sector_id")
          .eq("workspace_id", wsId)
          .eq("user_id", context.userId),
        sb
          .from("workflow_sectors")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("manager_id", context.userId),
      ]);
      const allowedSectors = new Set([
        ...((memberSectors ?? []) as any[]).map((m: any) => m.sector_id),
        ...((managedSectors ?? []) as any[]).map((s: any) => s.id),
      ]);
      accessible = (pipes ?? []).filter((p: any) => p.sector_id && allowedSectors.has(p.sector_id));
    }

    const pipelines: WorkflowPipelineRef[] = accessible.map((p: any) => {
      const s = p.sector_id ? sectorMap.get(p.sector_id) : null;
      return {
        id: p.id,
        name: p.name,
        color: p.color ?? null,
        sectorId: p.sector_id ?? null,
        sectorName: s?.name ?? null,
        sectorColor: s?.color ?? null,
        isDefault: !!p.is_default,
        memberIds: p.sector_id ? (sectorMembersMap.get(p.sector_id) ?? []) : [],
      };
    });

    let pipe = data.pipelineId ? accessible.find((p: any) => p.id === data.pipelineId) : undefined;
    if (!pipe) pipe = accessible[0];

    if (!pipe) {
      return {
        pipelineId: "",
        pipelineName: "",
        sectorId: null,
        sectorName: null,
        stages: [],
        tasks: [],
        members: [],
        canManage: manage,
        currentUserActiveSession: null,
        pipelines,
      };
    }

    const [{ data: stages }, { data: tasks }, { data: members }, { data: activeSession }] = await Promise.all([
      sb.from("workflow_stages").select("*").eq("pipeline_id", pipe.id).order("position", { ascending: true }),
      sb.from("workflow_tasks").select("*").eq("pipeline_id", pipe.id).order("position", { ascending: true }),
      sb.from("workspace_members").select("user_id").eq("workspace_id", wsId),
      sb
        .from("workflow_time_sessions")
        .select("task_id,started_at")
        .eq("user_id", context.userId)
        .is("ended_at", null)
        .maybeSingle(),
    ]);

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profs } = memberIds.length
      ? await sb.from("profiles").select("id,display_name,full_name,avatar_url").in("id", memberIds)
      : { data: [] };
    const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));

    // Cap tasks in done stage to the latest 10 (by completed_at desc)
    const stageList = ((stages ?? []) as any[]);
    const doneStageIds = new Set(stageList.filter((s: any) => s.is_done_stage).map((s: any) => s.id));
    // Colaboradores comuns só enxergam as tarefas atribuídas a eles.
    const rawTasks = ((tasks ?? []) as any[]).filter((t: any) =>
      manage ? true : t.assignee_id === context.userId,
    );
    const doneTasks = rawTasks
      .filter((t: any) => doneStageIds.has(t.stage_id))
      .sort((a: any, b: any) => new Date(b.completed_at ?? b.updated_at ?? 0).getTime() - new Date(a.completed_at ?? a.updated_at ?? 0).getTime())
      .slice(0, 10);
    const otherTasks = rawTasks.filter((t: any) => !doneStageIds.has(t.stage_id));
    const filteredTasks = [...otherTasks, ...doneTasks];


    const taskIds = filteredTasks.map((t: any) => t.id);
    const [activeByTask, checklistAgg, commentsAgg] = await Promise.all([
      taskIds.length
        ? sb
            .from("workflow_time_sessions")
            .select("task_id,started_at,user_id")
            .is("ended_at", null)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] }),
      taskIds.length
        ? sb.from("workflow_task_checklist").select("task_id,done").in("task_id", taskIds)
        : Promise.resolve({ data: [] }),
      taskIds.length
        ? sb.from("workflow_task_comments").select("task_id").in("task_id", taskIds)
        : Promise.resolve({ data: [] }),
    ]);
    const activeMap = new Map<string, string>();
    for (const s of ((activeByTask as any).data ?? []) as any[]) activeMap.set(s.task_id, s.started_at);
    const clMap = new Map<string, { done: number; total: number }>();
    for (const c of ((checklistAgg as any).data ?? []) as any[]) {
      const cur = clMap.get(c.task_id) ?? { done: 0, total: 0 };
      cur.total += 1;
      if (c.done) cur.done += 1;
      clMap.set(c.task_id, cur);
    }
    const cmMap = new Map<string, number>();
    for (const c of ((commentsAgg as any).data ?? []) as any[]) {
      cmMap.set(c.task_id, (cmMap.get(c.task_id) ?? 0) + 1);
    }

    const sectorInfo = pipe.sector_id ? sectorMap.get(pipe.sector_id) : null;
    return {
      pipelineId: pipe.id,
      pipelineName: pipe.name,
      sectorId: pipe.sector_id ?? null,
      sectorName: sectorInfo?.name ?? null,
      canManage: manage,
      currentUserActiveSession: activeSession
        ? { taskId: (activeSession as any).task_id, startedAt: (activeSession as any).started_at }
        : null,
      pipelines,
      stages: stageList.map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        position: s.position,
        isDoneStage: s.is_done_stage,
        isIncompleteStage: s.is_incomplete_stage,
        isReviewStage: Boolean(s.is_review_stage),
      })),
      members: memberIds.map((id: string) => {
        const p = profMap.get(id);
        return {
          id,
          name: p?.display_name || p?.full_name || "Membro",
          email: null,
          avatarUrl: p?.avatar_url ?? null,
        };
      }),
      tasks: filteredTasks.map((t: any) => {
        const cl = clMap.get(t.id) ?? { done: 0, total: 0 };
        const assigneeProf = t.assignee_id ? profMap.get(t.assignee_id) : null;
        return {
          id: t.id,
          stageId: t.stage_id,
          title: t.title,
          priority: t.priority,
          dueAt: t.due_at,
          assigneeId: t.assignee_id,
          assigneeName: assigneeProf ? assigneeProf.display_name || assigneeProf.full_name : null,
          status: t.status,
          timeSpentSeconds: Number(t.time_spent_seconds ?? 0),
          position: t.position,
          checklistDone: cl.done,
          checklistTotal: cl.total,
          commentsCount: cmMap.get(t.id) ?? 0,
          activeSessionSince: activeMap.get(t.id) ?? null,
          reviewStatus: (t.review_status ?? null) as WorkflowTaskLite["reviewStatus"],
          reviewNotes: t.review_notes ?? null,
          submittedForReviewAt: t.submitted_for_review_at ?? null,
          isReviewCopy: Boolean(t.is_review_copy),
          reviewCopyOf: t.review_copy_of ?? null,
          reviewOutcome: (t.review_outcome ?? null) as WorkflowTaskLite["reviewOutcome"],
          reviewRound: Number(t.review_round ?? 0),
          tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
        };
      }),
    };
  });

// ---------- Stages ----------
export const createStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ pipelineId: z.string().uuid(), name: z.string().min(1).max(60), color: z.string().default("#94a3b8") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: pipeline } = await sb
      .from("workflow_pipelines")
      .select("id")
      .eq("id", data.pipelineId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!pipeline) throw new Error("Fluxo não encontrado neste workspace.");
    const { data: max } = await sb
      .from("workflow_stages")
      .select("position")
      .eq("workspace_id", wsId)
      .eq("pipeline_id", data.pipelineId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max as any)?.position ?? -1) + 1;
    const { data: row, error } = await sb
      .from("workflow_stages")
      .insert({ workspace_id: wsId, pipeline_id: data.pipelineId, name: data.name, color: data.color, position: nextPos })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const updateStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(60).optional(),
        color: z.string().optional(),
        isDoneStage: z.boolean().optional(),
        isIncompleteStage: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: stage } = await sb
      .from("workflow_stages")
      .select("id")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!stage) throw new Error("Etapa não encontrada neste workspace.");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.isDoneStage !== undefined) patch.is_done_stage = data.isDoneStage;
    if (data.isIncompleteStage !== undefined) patch.is_incomplete_stage = data.isIncompleteStage;
    const { error } = await sb
      .from("workflow_stages")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const uniqueIds = [...new Set(data.order)];
    if (uniqueIds.length !== data.order.length) throw new Error("Ordem de etapas inválida.");
    if (uniqueIds.length) {
      const { data: ownedStages } = await sb
        .from("workflow_stages")
        .select("id")
        .eq("workspace_id", wsId)
        .in("id", uniqueIds);
      if (((ownedStages ?? []) as any[]).length !== uniqueIds.length) {
        throw new Error("Uma ou mais etapas não pertencem a este workspace.");
      }
    }
    for (let i = 0; i < data.order.length; i++) {
      const { error } = await sb
        .from("workflow_stages")
        .update({ position: i })
        .eq("id", data.order[i])
        .eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: stage } = await sb
      .from("workflow_stages")
      .select("id")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!stage) throw new Error("Etapa não encontrada neste workspace.");
    // impede deletar se houver tarefas ativas
    const { data: hasTasks } = await sb
      .from("workflow_tasks")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("stage_id", data.id)
      .limit(1);
    if (hasTasks && (hasTasks as any[]).length > 0) throw new Error("Mova as tarefas antes de excluir a etapa.");
    const { error } = await sb
      .from("workflow_stages")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Tasks ----------
const credentialSchema = z.object({
  label: z.string().max(120),
  username: z.string().max(200).optional().default(""),
  password: z.string().max(500).optional().default(""),
  notes: z.string().max(500).optional().default(""),
});
const linkSchema = z.object({ label: z.string().max(120).optional().default(""), url: z.string().url().max(1000) });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid(),
        stageId: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        priority: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
        dueAt: z.string().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        credentials: z.array(credentialSchema).max(20).optional(),
        links: z.array(linkSchema).max(20).optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        estimatedSeconds: z.number().int().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    // Roteamento automático: se o responsável pertence a um setor com fluxo próprio,
    // a tarefa vai para o fluxo desse setor (a não ser que o fluxo atual já seja dele).
    let pipelineId = data.pipelineId;
    let stageId = data.stageId;
    if (data.assigneeId) {
      const { data: memberSectors } = await sb
        .from("workflow_sector_members")
        .select("sector_id")
        .eq("user_id", data.assigneeId);
      const sectorIds = ((memberSectors ?? []) as any[]).map((m: any) => m.sector_id);
      if (sectorIds.length) {
        const { data: sectorPipes } = await sb
          .from("workflow_pipelines")
          .select("id,sector_id,position")
          .eq("workspace_id", wsId)
          .in("sector_id", sectorIds)
          .order("position", { ascending: true });
        const list = (sectorPipes ?? []) as any[];
        const alreadyInSector = list.some((p: any) => p.id === pipelineId);
        if (!alreadyInSector && list.length) {
          pipelineId = list[0].id;
          stageId = undefined; // etapa inicial do fluxo de destino
        }
      }
    }

    // Resolve stageId if not provided: first non-done/non-incomplete stage of the pipeline
    if (!stageId) {
      const { data: st } = await sb
        .from("workflow_stages")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .eq("is_done_stage", false)
        .eq("is_incomplete_stage", false)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      stageId = (st as any)?.id;
      if (!stageId) throw new Error("Fluxo sem etapas configuradas.");
    }

    const { data: max } = await sb
      .from("workflow_tasks")
      .select("position")
      .eq("stage_id", stageId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max as any)?.position ?? -1) + 1;
    const { data: row, error } = await sb
      .from("workflow_tasks")
      .insert({
        workspace_id: wsId,
        pipeline_id: pipelineId,
        stage_id: stageId,

        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        due_at: data.dueAt ?? null,
        assignee_id: data.assigneeId ?? null,
        credentials: data.credentials ?? [],
        links: data.links ?? [],
        tags: data.tags ?? [],
        estimated_seconds: data.estimatedSeconds ?? null,
        created_by: context.userId,
        position: nextPos,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const newId = (row as any).id as string;
    try {
      const { runInlineTrigger } = await import("@/lib/workflow-automations-runtime.server");
      await runInlineTrigger(newId, "task_created");
    } catch (e) {
      console.warn("inline trigger task_created failed", newId, e);
    }
    return { id: newId };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
        priority: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
        dueAt: z.string().nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        credentials: z.array(credentialSchema).max(20).optional(),
        links: z.array(linkSchema).max(20).optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        estimatedSeconds: z.number().int().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueAt !== undefined) patch.due_at = data.dueAt;
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.credentials !== undefined) patch.credentials = data.credentials;
    if (data.links !== undefined) patch.links = data.links;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.estimatedSeconds !== undefined) patch.estimated_seconds = data.estimatedSeconds;
    const { error } = await sb.from("workflow_tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const moveTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), stageId: z.string().uuid(), position: z.number().int().min(0) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb
      .from("workflow_tasks")
      .update({ stage_id: data.stageId, position: data.position })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      const { runInlineTrigger } = await import("@/lib/workflow-automations-runtime.server");
      await runInlineTrigger(data.id, "task_moved_to_stage");
    } catch (e) {
      console.warn("inline trigger task_moved_to_stage failed", data.id, e);
    }
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb.from("workflow_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Timer ----------
export const startTaskTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    // Pausa qualquer sessão ativa do usuário (única por índice único)
    await sb
      .from("workflow_time_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("ended_at", null);
    const { error } = await sb.from("workflow_time_sessions").insert({
      workspace_id: wsId,
      task_id: data.taskId,
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const stopTaskTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb
      .from("workflow_time_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("task_id", data.taskId)
      .is("ended_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Envia a tarefa para revisão. É o único caminho do funcionário para "concluir"
 * ou "marcar incompleta" — quem decide é o revisor (líder ou admin principal).
 */
export const submitTaskForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        outcome: z.enum(["concluida", "incompleta"]),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { submitForReviewCore } = await import("@/lib/workflow-review.server");
    return await submitForReviewCore(sb as any, wsId, context.userId, data.taskId, data.outcome, data.note);
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const manage = await canManage(sb, wsId, context.userId);
    const { submitForReviewCore, approveReviewCore } = await import("@/lib/workflow-review.server");
    // Gestor conclui direto (é ele quem revisa). Funcionário envia para revisão.
    if (manage) {
      await sb
        .from("workflow_time_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("task_id", data.taskId)
        .is("ended_at", null);
      await approveReviewCore(sb as any, wsId, context.userId, data.taskId);
      return { ok: true };
    }
    await submitForReviewCore(sb as any, wsId, context.userId, data.taskId, "concluida");
    return { ok: true };
  });

export const markTaskIncomplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const manage = await canManage(sb, wsId, context.userId);
    const { submitForReviewCore, returnReviewCore } = await import("@/lib/workflow-review.server");
    if (manage) {
      await sb
        .from("workflow_time_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("task_id", data.taskId)
        .is("ended_at", null);
      await returnReviewCore(sb as any, wsId, context.userId, data.taskId, data.reason || "Marcada como incompleta.");
      return { ok: true };
    }
    await submitForReviewCore(sb as any, wsId, context.userId, data.taskId, "incompleta", data.reason);
    return { ok: true };
  });

// ---------- Configuração de quem revisa ----------
export const getReviewSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: ws } = await sb.from("workspaces").select("workflow_review_mode").eq("id", wsId).maybeSingle();
    return { mode: (((ws as any)?.workflow_review_mode ?? "leader") as "leader" | "admin") };
  });

export const setReviewSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["leader", "admin"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { error } = await sb.from("workspaces").update({ workflow_review_mode: data.mode }).eq("id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const reopenTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid(), stageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb
      .from("workflow_tasks")
      .update({ status: "ativa", completed_at: null, incomplete_reason: null, stage_id: data.stageId })
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Task Details (drawer) ----------
export const getTaskDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const [taskRes, checklistRes, commentsRes, sessionsRes] = await Promise.all([
      sb.from("workflow_tasks").select("*").eq("id", data.taskId).single(),
      sb.from("workflow_task_checklist").select("*").eq("task_id", data.taskId).order("position", { ascending: true }),
      sb
        .from("workflow_task_comments")
        .select("*")
        .eq("task_id", data.taskId)
        .order("created_at", { ascending: true }),
      sb
        .from("workflow_time_sessions")
        .select("*")
        .eq("task_id", data.taskId)
        .order("started_at", { ascending: false })
        .limit(50),
    ]);
    const authorIds = [...new Set(((commentsRes as any).data ?? []).map((c: any) => c.author_id))];
    const userIds = [...new Set(((sessionsRes as any).data ?? []).map((s: any) => s.user_id))];
    const allIds = [...new Set([...authorIds, ...userIds])];
    const { data: profs } = allIds.length
      ? await sb.from("profiles").select("id,display_name,full_name,avatar_url").in("id", allIds)
      : { data: [] };
    const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
    return {
      task: (taskRes as any).data,
      checklist: ((checklistRes as any).data ?? []).map((c: any) => ({
        id: c.id,
        text: c.text,
        done: c.done,
        position: c.position,
      })),
      comments: ((commentsRes as any).data ?? []).map((c: any) => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        authorId: c.author_id,
        authorName:
          profMap.get(c.author_id)?.display_name || profMap.get(c.author_id)?.full_name || "Membro",
      })),
      sessions: ((sessionsRes as any).data ?? []).map((s: any) => ({
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationSeconds: Number(s.duration_seconds ?? 0),
        userId: s.user_id,
        userName: profMap.get(s.user_id)?.display_name || profMap.get(s.user_id)?.full_name || "Membro",
      })),
    };
  });

export const addChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string().uuid(), text: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: max } = await sb
      .from("workflow_task_checklist")
      .select("position")
      .eq("task_id", data.taskId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max as any)?.position ?? -1) + 1;
    const { error } = await sb.from("workflow_task_checklist").insert({
      workspace_id: wsId,
      task_id: data.taskId,
      text: data.text,
      position: nextPos,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb.from("workflow_task_checklist").update({ done: data.done }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb.from("workflow_task_checklist").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("workflow_task_comments").insert({
      workspace_id: wsId,
      task_id: data.taskId,
      author_id: context.userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Metrics ----------
export const getWorkflowMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ periodStart: z.string().optional(), periodEnd: z.string().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const start = data.periodStart ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const end = data.periodEnd ?? new Date().toISOString();

    const [{ data: sessions }, { data: tasks }, { data: members }] = await Promise.all([
      sb
        .from("workflow_time_sessions")
        .select("user_id,duration_seconds,ended_at")
        .eq("workspace_id", wsId)
        .gte("started_at", start)
        .lte("started_at", end)
        .not("ended_at", "is", null),
      sb
        .from("workflow_tasks")
        .select("assignee_id,status,due_at,completed_at,created_at")
        .eq("workspace_id", wsId)
        .gte("created_at", start)
        .lte("created_at", end),
      sb.from("workspace_members").select("user_id").eq("workspace_id", wsId),
    ]);
    const memberIds = ((members ?? []) as any[]).map((m: any) => m.user_id);
    const { data: profs } = memberIds.length
      ? await sb.from("profiles").select("id,display_name,full_name,avatar_url").in("id", memberIds)
      : { data: [] };
    const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));

    const byUser = new Map<
      string,
      { userId: string; name: string; avatarUrl: string | null; totalSeconds: number; done: number; doneOnTime: number; incomplete: number; total: number }
    >();
    const ensure = (uid: string) => {
      if (!byUser.has(uid)) {
        const p = profMap.get(uid);
        byUser.set(uid, {
          userId: uid,
          name: p?.display_name || p?.full_name || "Membro",
          avatarUrl: p?.avatar_url ?? null,
          totalSeconds: 0,
          done: 0,
          doneOnTime: 0,
          incomplete: 0,
          total: 0,
        });
      }
      return byUser.get(uid)!;
    };
    for (const uid of memberIds) ensure(uid);
    for (const s of (sessions ?? []) as any[]) {
      if (!s.user_id) continue;
      ensure(s.user_id).totalSeconds += Number(s.duration_seconds ?? 0);
    }
    for (const t of (tasks ?? []) as any[]) {
      if (!t.assignee_id) continue;
      const row = ensure(t.assignee_id);
      row.total += 1;
      if (t.status === "concluida") {
        row.done += 1;
        if (!t.due_at || (t.completed_at && new Date(t.completed_at) <= new Date(t.due_at))) row.doneOnTime += 1;
      } else if (t.status === "incompleta") {
        row.incomplete += 1;
      }
    }
    return {
      periodStart: start,
      periodEnd: end,
      byUser: Array.from(byUser.values()).sort((a, b) => b.totalSeconds - a.totalSeconds),
    };
  });

// ---------- Automations ----------
export interface WorkflowAutomation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { event: string; params?: Record<string, string | number | boolean | null> };
  actions: Array<{ type: string; params?: Record<string, string | number | boolean | null> }>;
}

export const listAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {

    const sb = context.supabase as unknown as AnySb;
    const { data: rows, error } = await sb
      .from("workflow_automations")
      .select("id,name,enabled,trigger,actions")
      .eq("pipeline_id", data.pipelineId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any as WorkflowAutomation[];
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        pipelineId: z.string().uuid(),
        name: z.string().min(1).max(120),
        enabled: z.boolean().default(true),
        trigger: z.object({ event: z.string().min(1), params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }),
        actions: z.array(z.object({ type: z.string().min(1), params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() })).min(1),

      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    if (data.id) {
      const { error } = await sb
        .from("workflow_automations")
        .update({ name: data.name, enabled: data.enabled, trigger: data.trigger, actions: data.actions })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sb
      .from("workflow_automations")
      .insert({
        workspace_id: wsId,
        pipeline_id: data.pipelineId,
        name: data.name,
        enabled: data.enabled,
        trigger: data.trigger,
        actions: data.actions,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb.from("workflow_automations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Sectors ----------
export interface WorkflowSector {
  id: string;
  name: string;
  color: string;
  managerId: string | null;
  memberIds: string[];
  position: number;
}

export const listSectors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkflowSector[]> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: rows } = await sb
      .from("workflow_sectors")
      .select("id,name,color,manager_id,position")
      .eq("workspace_id", wsId)
      .order("position", { ascending: true });
    const ids = ((rows ?? []) as any[]).map((r: any) => r.id);
    const { data: mems } = ids.length
      ? await sb.from("workflow_sector_members").select("sector_id,user_id").in("sector_id", ids)
      : { data: [] };
    const byS = new Map<string, string[]>();
    for (const m of (mems ?? []) as any[]) {
      const arr = byS.get(m.sector_id) ?? [];
      arr.push(m.user_id);
      byS.set(m.sector_id, arr);
    }
    return ((rows ?? []) as any[]).map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      managerId: r.manager_id ?? null,
      memberIds: byS.get(r.id) ?? [],
      position: r.position,
    }));
  });

/** Lightweight list of pipelines + their sector members, for automation editors. */
export const listWorkflowPipelinesLite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: pipes } = await sb
      .from("workflow_pipelines")
      .select("id,name,sector_id")
      .eq("workspace_id", wsId)
      .order("position", { ascending: true });
    const rows = ((pipes ?? []) as any[]);
    const sectorIds = Array.from(new Set(rows.map((p) => p.sector_id).filter(Boolean)));
    const { data: mems } = sectorIds.length
      ? await sb
          .from("workflow_sector_members")
          .select("sector_id,user_id")
          .in("sector_id", sectorIds)
      : { data: [] as any[] };
    const bySec = new Map<string, string[]>();
    for (const m of (mems ?? []) as any[]) {
      const arr = bySec.get(m.sector_id) ?? [];
      arr.push(m.user_id);
      bySec.set(m.sector_id, arr);
    }
    const pipeIds = rows.map((p) => p.id as string);
    const { data: stageRows } = pipeIds.length
      ? await sb
          .from("workflow_stages")
          .select("id,name,pipeline_id,position")
          .in("pipeline_id", pipeIds)
          .order("position", { ascending: true })
      : { data: [] as any[] };
    const stagesByPipe = new Map<string, Array<{ id: string; name: string }>>();
    for (const st of (stageRows ?? []) as any[]) {
      const arr = stagesByPipe.get(st.pipeline_id) ?? [];
      arr.push({ id: st.id as string, name: st.name as string });
      stagesByPipe.set(st.pipeline_id, arr);
    }
    // Fallback: todos os membros do workspace (fluxo sem setor ou setor vazio).
    const { data: wsMems } = await sb
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", wsId);
    const wsMemberIds = Array.from(
      new Set([...(((wsMems ?? []) as any[]).map((m: any) => m.user_id as string)), context.userId]),
    );
    const userIds = Array.from(new Set([
      ...((mems ?? []) as any[]).map((m: any) => m.user_id as string),
      ...wsMemberIds,
    ]));
    const { data: profs } = userIds.length
      ? await sb.from("profiles").select("id,display_name,full_name").in("id", userIds)
      : { data: [] as any[] };
    const nameById = new Map<string, string>(
      ((profs ?? []) as any[]).map((p: any) => [p.id, (p.display_name ?? p.full_name ?? "Sem nome") as string]),
    );
    return rows.map((p) => {
      const sectorMembers = p.sector_id ? (bySec.get(p.sector_id) ?? []) : [];
      const memberIds = sectorMembers.length ? sectorMembers : wsMemberIds;
      return {
        id: p.id as string,
        name: p.name as string,
        sectorId: (p.sector_id ?? null) as string | null,
        members: memberIds.map((id) => ({ id, name: nameById.get(id) ?? "Sem nome" })),
        stages: stagesByPipe.get(p.id as string) ?? [],
      };
    });
  });


export const saveSector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        color: z.string().default("#6366f1"),
        managerId: z.string().uuid().nullable().optional(),
        memberIds: z.array(z.string().uuid()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    let sectorId = data.id;
    const memberIds = Array.from(
      new Set([...data.memberIds, ...(data.managerId ? [data.managerId] : [])]),
    );
    if (sectorId) {
      const { data: existingSector } = await sb
        .from("workflow_sectors")
        .select("id")
        .eq("id", sectorId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (!existingSector) throw new Error("Setor não encontrado neste workspace.");
      const { error } = await sb
        .from("workflow_sectors")
        .update({ name: data.name, color: data.color, manager_id: data.managerId ?? null })
        .eq("id", sectorId)
        .eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
    } else {
      const { data: max } = await sb
        .from("workflow_sectors")
        .select("position")
        .eq("workspace_id", wsId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((max as any)?.position ?? -1) + 1;
      const { data: row, error } = await sb
        .from("workflow_sectors")
        .insert({
          workspace_id: wsId,
          name: data.name,
          color: data.color,
          manager_id: data.managerId ?? null,
          position: nextPos,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      sectorId = (row as any).id;
    }
    // sync members; o gestor do setor é sempre membro efetivo do próprio setor.
    await sb
      .from("workflow_sector_members")
      .delete()
      .eq("sector_id", sectorId)
      .eq("workspace_id", wsId);
    if (memberIds.length) {
      await sb.from("workflow_sector_members").insert(
        memberIds.map((uid) => ({ sector_id: sectorId, user_id: uid, workspace_id: wsId })),
      );
    }
    return { id: sectorId };
  });

export const deleteSector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: sector } = await sb
      .from("workflow_sectors")
      .select("id")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!sector) throw new Error("Setor não encontrado neste workspace.");
    const { error } = await sb
      .from("workflow_sectors")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Pipelines CRUD ----------
export const createPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        color: z.string().default("#6366f1"),
        sectorId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    if (data.sectorId) {
      const { data: sector } = await sb
        .from("workflow_sectors")
        .select("id")
        .eq("id", data.sectorId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (!sector) throw new Error("Setor não encontrado neste workspace.");
    }
    const { data: max } = await sb
      .from("workflow_pipelines")
      .select("position")
      .eq("workspace_id", wsId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max as any)?.position ?? -1) + 1;
    const { data: row, error } = await sb
      .from("workflow_pipelines")
      .insert({
        workspace_id: wsId,
        name: data.name,
        color: data.color,
        sector_id: data.sectorId ?? null,
        position: nextPos,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const pid = (row as any).id;
    const defaults = [
      { name: "Backlog", color: "#94a3b8", position: 0, is_done_stage: false, is_incomplete_stage: false },
      { name: "Em fila", color: "#38bdf8", position: 1, is_done_stage: false, is_incomplete_stage: false },
      { name: "Fazendo", color: "#f59e0b", position: 2, is_done_stage: false, is_incomplete_stage: false },
      { name: "Revisão", color: "#a78bfa", position: 3, is_done_stage: false, is_incomplete_stage: false },
      { name: "Concluído", color: "#22c55e", position: 4, is_done_stage: true, is_incomplete_stage: false },
      { name: "Incompleto", color: "#ef4444", position: 5, is_done_stage: false, is_incomplete_stage: true },
    ];
    await sb.from("workflow_stages").insert(defaults.map((s) => ({ ...s, workspace_id: wsId, pipeline_id: pid })));
    return { id: pid };
  });

export const updatePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        color: z.string().optional(),
        sectorId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: pipeline } = await sb
      .from("workflow_pipelines")
      .select("id")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!pipeline) throw new Error("Fluxo não encontrado neste workspace.");
    if (data.sectorId) {
      const { data: sector } = await sb
        .from("workflow_sectors")
        .select("id")
        .eq("id", data.sectorId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (!sector) throw new Error("Setor não encontrado neste workspace.");
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.sectorId !== undefined) patch.sector_id = data.sectorId;
    const { error } = await sb
      .from("workflow_pipelines")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    // impede excluir default e garante que o alvo pertence ao workspace ativo
    const { data: p } = await sb
      .from("workflow_pipelines")
      .select("is_default")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!p) throw new Error("Fluxo não encontrado neste workspace.");
    if ((p as any).is_default) throw new Error("Não é possível excluir o fluxo padrão.");
    const { error } = await sb
      .from("workflow_pipelines")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Review flow ----------
export interface PendingReviewTask {
  id: string;
  title: string;
  status: "concluida" | "incompleta";
  pipelineId: string;
  pipelineName: string;
  sectorId: string | null;
  sectorName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  submittedAt: string | null;
  incompleteReason: string | null;
  reviewOutcome: "concluida" | "incompleta" | null;
  reviewRound: number;
}

export const listPendingReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingReviewTask[]> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const manage = await canManage(sb, wsId, context.userId);
    let allowedIds: string[] | null = null;
    if (!manage) {
      // Líder: só revisa o que caiu no fluxo dele (cópias de revisão atribuídas a ele).
      const { data: copies } = await sb
        .from("workflow_tasks")
        .select("review_copy_of")
        .eq("workspace_id", wsId)
        .eq("is_review_copy", true)
        .eq("assignee_id", context.userId);
      allowedIds = [...new Set(((copies ?? []) as any[]).map((c: any) => c.review_copy_of).filter(Boolean))];
      if (!allowedIds.length) return [];
    }
    let query = sb
      .from("workflow_tasks")
      .select(
        "id,title,status,pipeline_id,assignee_id,submitted_for_review_at,incomplete_reason,review_outcome,review_round",
      )
      .eq("workspace_id", wsId)
      .eq("is_review_copy", false)
      .eq("review_status", "pending");
    if (allowedIds) query = query.in("id", allowedIds);
    const { data: tasks } = await query.order("submitted_for_review_at", { ascending: false });
    const rows = (tasks ?? []) as any[];
    if (!rows.length) return [];
    const pipeIds = [...new Set(rows.map((t: any) => t.pipeline_id))];
    const asgIds = [...new Set(rows.map((t: any) => t.assignee_id).filter(Boolean))] as string[];
    const [{ data: pipes }, { data: profs }] = await Promise.all([
      sb.from("workflow_pipelines").select("id,name,sector_id").in("id", pipeIds),
      asgIds.length
        ? sb.from("profiles").select("id,display_name,full_name").in("id", asgIds)
        : Promise.resolve({ data: [] }),
    ]);
    const secIds = [...new Set(((pipes ?? []) as any[]).map((p: any) => p.sector_id).filter(Boolean))] as string[];
    const { data: secs } = secIds.length
      ? await sb.from("workflow_sectors").select("id,name").in("id", secIds)
      : { data: [] };
    const pipeMap = new Map<string, any>(((pipes ?? []) as any[]).map((p: any) => [p.id, p]));
    const secMap = new Map<string, any>(((secs ?? []) as any[]).map((s: any) => [s.id, s]));
    const profMap = new Map<string, any>(((profs ?? []) as any[]).map((p: any) => [p.id, p]));
    return rows.map((t: any) => {
      const p = pipeMap.get(t.pipeline_id);
      const s = p?.sector_id ? secMap.get(p.sector_id) : null;
      const a = t.assignee_id ? profMap.get(t.assignee_id) : null;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        pipelineId: t.pipeline_id,
        pipelineName: p?.name ?? "",
        sectorId: p?.sector_id ?? null,
        sectorName: s?.name ?? null,
        assigneeId: t.assignee_id ?? null,
        assigneeName: a?.display_name || a?.full_name || null,
        submittedAt: t.submitted_for_review_at ?? null,
        reviewOutcome: (t.review_outcome ?? null) as PendingReviewTask["reviewOutcome"],
        reviewRound: Number(t.review_round ?? 1),
        incompleteReason: t.incomplete_reason ?? null,
      };
    });
  });

export const approveTaskReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string().uuid(), notes: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { approveReviewCore } = await import("@/lib/workflow-review.server");
    await approveReviewCore(sb as any, wsId, context.userId, data.taskId, data.notes);
    return { ok: true };
  });

export const returnTaskReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        notes: z.string().min(1).max(1000),
        reassignTo: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { returnReviewCore } = await import("@/lib/workflow-review.server");
    await returnReviewCore(sb as any, wsId, context.userId, data.taskId, data.notes, data.reassignTo ?? null);
    return { ok: true };
  });



// ---------- History (auditoria) ----------
export interface HistoryTask {
  id: string;
  title: string;
  status: string;
  completedAt: string | null;
  pipelineId: string;
  pipelineName: string;
  sectorId: string | null;
  sectorName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  reviewStatus: string | null;
  timeSpentSeconds: number;
}

export const searchTaskHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().max(200).optional(),
        sectorId: z.string().uuid().nullable().optional(),
        pipelineId: z.string().uuid().nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<HistoryTask[]> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    let q = sb
      .from("workflow_tasks")
      .select("id,title,status,completed_at,pipeline_id,assignee_id,review_status,time_spent_seconds")
      .eq("workspace_id", wsId)
      .in("status", ["concluida", "incompleta"])
      .order("completed_at", { ascending: false })
      .limit(data.limit);
    if (data.query) q = q.ilike("title", `%${data.query}%`);
    if (data.pipelineId) q = q.eq("pipeline_id", data.pipelineId);
    if (data.assigneeId) q = q.eq("assignee_id", data.assigneeId);
    if (data.from) q = q.gte("completed_at", data.from);
    if (data.to) q = q.lte("completed_at", data.to);
    const { data: tasks } = await q;
    const rows = (tasks ?? []) as any[];
    if (!rows.length) return [];
    const pipeIds = [...new Set(rows.map((t: any) => t.pipeline_id))];
    const asgIds = [...new Set(rows.map((t: any) => t.assignee_id).filter(Boolean))] as string[];
    const [{ data: pipes }, { data: profs }] = await Promise.all([
      sb.from("workflow_pipelines").select("id,name,sector_id").in("id", pipeIds),
      asgIds.length
        ? sb.from("profiles").select("id,display_name,full_name").in("id", asgIds)
        : Promise.resolve({ data: [] }),
    ]);
    const secIds = [...new Set(((pipes ?? []) as any[]).map((p: any) => p.sector_id).filter(Boolean))] as string[];
    const { data: secs } = secIds.length
      ? await sb.from("workflow_sectors").select("id,name").in("id", secIds)
      : { data: [] };
    const pipeMap = new Map<string, any>(((pipes ?? []) as any[]).map((p: any) => [p.id, p]));
    const secMap = new Map<string, any>(((secs ?? []) as any[]).map((s: any) => [s.id, s]));
    const profMap = new Map<string, any>(((profs ?? []) as any[]).map((p: any) => [p.id, p]));
    let out = rows.map((t: any) => {
      const p = pipeMap.get(t.pipeline_id);
      const s = p?.sector_id ? secMap.get(p.sector_id) : null;
      const a = t.assignee_id ? profMap.get(t.assignee_id) : null;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        completedAt: t.completed_at ?? null,
        pipelineId: t.pipeline_id,
        pipelineName: p?.name ?? "",
        sectorId: p?.sector_id ?? null,
        sectorName: s?.name ?? null,
        assigneeId: t.assignee_id ?? null,
        assigneeName: a?.display_name || a?.full_name || null,
        reviewStatus: t.review_status ?? null,
        timeSpentSeconds: Number(t.time_spent_seconds ?? 0),
      };
    });
    if (data.sectorId) out = out.filter((x) => x.sectorId === data.sectorId);
    return out;
  });

// ==================== NOTIFICATIONS ====================
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ onlyUnread: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<Notification[]> => {
    const sb = context.supabase as unknown as AnySb;
    let q = sb
      .from("notifications")
      .select("id,type,title,body,task_id,link,read_at,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.onlyUnread) q = q.is("read_at", null);
    const { data: rows } = await q;
    return ((rows as any[]) ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
      taskId: r.task_id ?? null,
      link: r.link ?? null,
      readAt: r.read_at ?? null,
      createdAt: r.created_at,
    }));
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    let q = sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", context.userId);
    if (data.all) q = q.is("read_at", null);
    else if (data.id) q = q.eq("id", data.id);
    else throw new Error("id ou all obrigatório");
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== ATTACHMENTS ====================
export interface AttachmentRow {
  id: string;
  fileName: string;
  storagePath: string;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
  signedUrl: string | null;
}

export const listAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AttachmentRow[]> => {
    const sb = context.supabase as any;
    const { data: rows } = await sb
      .from("workflow_task_attachments")
      .select("id,file_name,storage_path,mime,size_bytes,created_at")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false });
    const arr = ((rows as any[]) ?? []);
    const results: AttachmentRow[] = [];
    for (const r of arr) {
      let signedUrl: string | null = null;
      try {
        const { data: s } = await sb.storage.from("workflow-attachments").createSignedUrl(r.storage_path, 3600);
        signedUrl = (s as any)?.signedUrl ?? null;
      } catch (e) {
        console.warn("signed url failed", r.storage_path, e);
      }
      results.push({
        id: r.id,
        fileName: r.file_name,
        storagePath: r.storage_path,
        mime: r.mime ?? null,
        sizeBytes: r.size_bytes ?? null,
        createdAt: r.created_at,
        signedUrl,
      });
    }
    return results;
  });

export const registerAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        storagePath: z.string(),
        fileName: z.string(),
        mime: z.string().optional(),
        sizeBytes: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: row, error } = await sb
      .from("workflow_task_attachments")
      .insert({
        workspace_id: wsId,
        task_id: data.taskId,
        uploaded_by: context.userId,
        storage_path: data.storagePath,
        file_name: data.fileName,
        mime: data.mime ?? null,
        size_bytes: data.sizeBytes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row } = await sb
      .from("workflow_task_attachments")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    try {
      await sb.storage.from("workflow-attachments").remove([(row as any).storage_path]);
    } catch (e) {
      console.warn("attachment remove failed", data.id, e);
    }
    const { error } = await sb.from("workflow_task_attachments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== AUTOMATION RUNS (log) ====================
export interface AutomationRun {
  id: string;
  automationId: string;
  automationName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  triggerEvent: string;
  actionsSummary: Array<{ type: string; ok: boolean; error?: string }>;
  status: string;
  error: string | null;
  createdAt: string;
}

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      pipelineId: z.string().uuid().optional(),
      automationId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AutomationRun[]> => {
    const sb = context.supabase as unknown as AnySb;
    let q = sb
      .from("workflow_automation_runs")
      .select("id,automation_id,task_id,trigger_event,actions_summary,status,error,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.automationId) q = q.eq("automation_id", data.automationId);
    if (data.pipelineId) q = q.eq("pipeline_id", data.pipelineId);
    const { data: rows } = await q;
    const arr = ((rows as any[]) ?? []);
    if (!arr.length) return [];
    const automationIds = [...new Set(arr.map((r) => r.automation_id))];
    const taskIds = [...new Set(arr.map((r) => r.task_id).filter(Boolean))];
    const [{ data: autos }, { data: tasks }] = await Promise.all([
      sb.from("workflow_automations").select("id,name").in("id", automationIds),
      taskIds.length
        ? sb.from("workflow_tasks").select("id,title").in("id", taskIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const aMap = new Map(((autos as any[]) ?? []).map((a) => [a.id, a.name]));
    const tMap = new Map(((tasks as any[]) ?? []).map((t) => [t.id, t.title]));
    return arr.map((r) => ({
      id: r.id,
      automationId: r.automation_id,
      automationName: aMap.get(r.automation_id) ?? null,
      taskId: r.task_id ?? null,
      taskTitle: r.task_id ? (tMap.get(r.task_id) ?? null) : null,
      triggerEvent: r.trigger_event,
      actionsSummary: Array.isArray(r.actions_summary) ? r.actions_summary : [],
      status: r.status,
      error: r.error ?? null,
      createdAt: r.created_at,
    }));
  });
