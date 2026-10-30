/**
 * Núcleo do fluxo de revisão de tarefas do Fluxo de Trabalho.
 *
 * Regra de negócio:
 *  - O funcionário NÃO conclui nem marca incompleta uma tarefa direto.
 *    Ele envia para revisão informando o resultado ("concluída" ou "incompleta").
 *  - Ao enviar, a tarefa original vai para o estado "em_revisao" e uma CÓPIA de
 *    revisão é criada no fluxo do revisor (líder do setor ou administrador
 *    principal, conforme configuração do workspace).
 *  - O revisor aprova (com observação opcional) -> a original vai para Concluído.
 *  - O revisor devolve como incompleta (observação obrigatória) -> a original vai
 *    para Incompleto e o funcionário precisa refazer e reenviar para revisão.
 *  - O revisor também pode reatribuir a tarefa para outra pessoa.
 */

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type ReviewOutcome = "concluida" | "incompleta";

export async function canManageWorkflow(sb: AnySb, wsId: string, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("can_manage_workflow", { _workspace_id: wsId, _user_id: userId });
  return Boolean(data);
}

async function findWorkspaceAdmin(sb: AnySb, wsId: string): Promise<string | null> {
  const { data: ws } = await sb.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle();
  if ((ws as any)?.owner_id) return (ws as any).owner_id as string;
  const { data: m } = await sb
    .from("workspace_members")
    .select("user_id,role,role_type")
    .eq("workspace_id", wsId)
    .limit(50);
  const rows = ((m ?? []) as any[]).filter(
    (r) => r.role_type === "owner" || r.role === "owner" || r.role_type === "admin" || r.role === "admin",
  );
  return rows[0]?.user_id ?? null;
}

/** Descobre quem deve revisar uma tarefa e em qual fluxo a cópia deve aparecer. */
export async function resolveReviewer(
  sb: AnySb,
  wsId: string,
  pipelineId: string,
  submitterId: string,
): Promise<{ reviewerId: string | null; pipelineId: string | null }> {
  const { data: ws } = await sb.from("workspaces").select("workflow_review_mode").eq("id", wsId).maybeSingle();
  const mode = ((ws as any)?.workflow_review_mode ?? "leader") as "leader" | "admin";

  let reviewerId: string | null = null;

  if (mode === "leader") {
    const { data: pipe } = await sb
      .from("workflow_pipelines")
      .select("sector_id")
      .eq("id", pipelineId)
      .maybeSingle();
    const sectorId = (pipe as any)?.sector_id ?? null;
    if (sectorId) {
      const { data: sector } = await sb
        .from("workflow_sectors")
        .select("manager_id")
        .eq("id", sectorId)
        .maybeSingle();
      const managerId = (sector as any)?.manager_id ?? null;
      if (managerId && managerId !== submitterId) reviewerId = managerId;
    }
  }

  if (!reviewerId) reviewerId = await findWorkspaceAdmin(sb, wsId);
  if (reviewerId === submitterId) {
    // Se o próprio revisor enviou, cai para o admin principal (ou fica sem cópia).
    const admin = await findWorkspaceAdmin(sb, wsId);
    reviewerId = admin && admin !== submitterId ? admin : null;
  }
  if (!reviewerId) return { reviewerId: null, pipelineId: null };

  return { reviewerId, pipelineId: await pipelineForUser(sb, wsId, reviewerId) };
}

/** Fluxo (pipeline) onde as tarefas de um usuário aparecem: o do setor dele, senão o padrão. */
export async function pipelineForUser(sb: AnySb, wsId: string, userId: string): Promise<string | null> {
  const { data: sm } = await sb
    .from("workflow_sector_members")
    .select("sector_id")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const sectorId = (sm as any)?.sector_id ?? null;
  if (sectorId) {
    const { data: p } = await sb
      .from("workflow_pipelines")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("sector_id", sectorId)
      .limit(1)
      .maybeSingle();
    if ((p as any)?.id) return (p as any).id as string;
  }
  const { data: def } = await sb
    .from("workflow_pipelines")
    .select("id")
    .eq("workspace_id", wsId)
    .is("sector_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if ((def as any)?.id) return (def as any).id as string;
  const { data: any1 } = await sb
    .from("workflow_pipelines")
    .select("id")
    .eq("workspace_id", wsId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (any1 as any)?.id ?? null;
}

/** Garante uma etapa de revisão no pipeline informado. */
export async function ensureReviewStage(sb: AnySb, wsId: string, pipelineId: string): Promise<string | null> {
  const { data: stages } = await sb
    .from("workflow_stages")
    .select("id,name,position,is_review_stage,is_done_stage,is_incomplete_stage")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  const list = ((stages ?? []) as any[]);
  const flagged = list.find((s) => s.is_review_stage);
  if (flagged) return flagged.id;
  const byName = list.find((s) => String(s.name ?? "").toLowerCase().includes("revis"));
  if (byName) {
    await sb.from("workflow_stages").update({ is_review_stage: true }).eq("id", byName.id);
    return byName.id;
  }
  const doneIdx = list.findIndex((s) => s.is_done_stage);
  const position = doneIdx >= 0 ? list[doneIdx].position : list.length;
  const { data: created } = await sb
    .from("workflow_stages")
    .insert({
      workspace_id: wsId,
      pipeline_id: pipelineId,
      name: "Revisão",
      color: "#a78bfa",
      position,
      is_review_stage: true,
    })
    .select("id")
    .maybeSingle();
  return (created as any)?.id ?? null;
}

export async function stageOfKind(
  sb: AnySb,
  pipelineId: string,
  kind: "done" | "incomplete" | "first",
): Promise<string | null> {
  const q = sb.from("workflow_stages").select("id,position").eq("pipeline_id", pipelineId);
  if (kind === "done") {
    const { data } = await q.eq("is_done_stage", true).limit(1).maybeSingle();
    return (data as any)?.id ?? null;
  }
  if (kind === "incomplete") {
    const { data } = await q.eq("is_incomplete_stage", true).limit(1).maybeSingle();
    return (data as any)?.id ?? null;
  }
  const { data } = await q
    .eq("is_done_stage", false)
    .eq("is_incomplete_stage", false)
    .eq("is_review_stage", false)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

async function notify(
  sb: AnySb,
  wsId: string,
  userId: string | null,
  type: string,
  title: string,
  body: string,
  taskId: string,
) {
  if (!userId) return;
  try {
    await sb.from("notifications").insert({
      workspace_id: wsId,
      user_id: userId,
      type,
      title,
      body,
      task_id: taskId,
      link: "/fluxo-trabalho",
    });
  } catch {
    /* notificação é best-effort */
  }
}

/** Envia a tarefa para revisão e cria a cópia no fluxo do revisor. */
export async function submitForReviewCore(
  sb: AnySb,
  wsId: string,
  userId: string,
  taskId: string,
  outcome: ReviewOutcome,
  note?: string,
): Promise<{ ok: true; reviewerId: string | null }> {
  const { data: taskRow } = await sb.from("workflow_tasks").select("*").eq("id", taskId).maybeSingle();
  const task = taskRow as any;
  if (!task) throw new Error("Tarefa não encontrada.");
  if (task.is_review_copy) throw new Error("Esta é uma tarefa de revisão.");

  // encerra timer ativo do usuário nessa tarefa
  await sb
    .from("workflow_time_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .is("ended_at", null);

  const round = Number(task.review_round ?? 0) + 1;
  const reviewStage = await ensureReviewStage(sb, wsId, task.pipeline_id);

  const patch: Record<string, unknown> = {
    status: "em_revisao",
    review_status: "pending",
    review_outcome: outcome,
    review_round: round,
    submitted_for_review_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    completed_at: null,
    incomplete_reason: outcome === "incompleta" ? (note ?? task.incomplete_reason ?? null) : null,
  };
  if (reviewStage) patch.stage_id = reviewStage;
  const { error } = await sb.from("workflow_tasks").update(patch).eq("id", taskId);
  if (error) throw new Error(error.message);

  if (note) {
    await sb.from("workflow_task_comments").insert({
      workspace_id: wsId,
      task_id: taskId,
      author_id: userId,
      body: `📤 Enviada para revisão (${outcome === "concluida" ? "concluída" : "incompleta"}): ${note}`,
    });
  }

  // remove cópias antigas ainda pendentes
  await sb.from("workflow_tasks").delete().eq("review_copy_of", taskId).eq("is_review_copy", true);

  const { reviewerId, pipelineId } = await resolveReviewer(sb, wsId, task.pipeline_id, userId);
  if (reviewerId && pipelineId) {
    const copyStage = (await ensureReviewStage(sb, wsId, pipelineId)) ?? (await stageOfKind(sb, pipelineId, "first"));
    if (copyStage) {
      await sb.from("workflow_tasks").insert({
        workspace_id: wsId,
        pipeline_id: pipelineId,
        stage_id: copyStage,
        title: `[Revisão] ${task.title}`,
        description: task.description ?? null,
        priority: task.priority,
        due_at: task.due_at,
        assignee_id: reviewerId,
        created_by: userId,
        status: "ativa",
        is_review_copy: true,
        review_copy_of: taskId,
        review_status: "pending",
        review_outcome: outcome,
        review_round: round,
        submitted_for_review_at: new Date().toISOString(),
        tags: task.tags ?? [],
      });
    }
    await notify(
      sb,
      wsId,
      reviewerId,
      "review_requested",
      "🔍 Nova tarefa para revisar",
      `${task.title} — enviada como ${outcome === "concluida" ? "concluída" : "incompleta"}${note ? `: ${note}` : ""}`,
      taskId,
    );
  }

  try {
    const { awardTaskPoints } = await import("@/lib/workflow-gamification.functions");
    await awardTaskPoints(sb as any, wsId, userId, taskId, "review_submitted", { round });
  } catch {
    /* pontuação best-effort */
  }

  return { ok: true, reviewerId };
}

/** Resolve a tarefa original a partir do id recebido (original ou cópia de revisão). */
export async function resolveOriginalTask(sb: AnySb, taskId: string): Promise<any> {
  const { data } = await sb.from("workflow_tasks").select("*").eq("id", taskId).maybeSingle();
  const t = data as any;
  if (!t) throw new Error("Tarefa não encontrada.");
  if (t.is_review_copy && t.review_copy_of) {
    const { data: orig } = await sb.from("workflow_tasks").select("*").eq("id", t.review_copy_of).maybeSingle();
    if (orig) return orig;
  }
  return t;
}

export async function isReviewerOf(sb: AnySb, wsId: string, userId: string, originalId: string): Promise<boolean> {
  if (await canManageWorkflow(sb, wsId, userId)) return true;
  const { data } = await sb
    .from("workflow_tasks")
    .select("id")
    .eq("review_copy_of", originalId)
    .eq("assignee_id", userId)
    .limit(1)
    .maybeSingle();
  return Boolean((data as any)?.id);
}

async function dropReviewCopies(sb: AnySb, originalId: string) {
  await sb.from("workflow_tasks").delete().eq("review_copy_of", originalId).eq("is_review_copy", true);
}

/** Aprova: a tarefa original vai para Concluído. */
export async function approveReviewCore(
  sb: AnySb,
  wsId: string,
  userId: string,
  taskId: string,
  notes?: string,
): Promise<{ ok: true; originalId: string }> {
  const original = await resolveOriginalTask(sb, taskId);
  if (!(await isReviewerOf(sb, wsId, userId, original.id))) throw new Error("Sem permissão para revisar esta tarefa.");
  const doneStage = await stageOfKind(sb, original.pipeline_id, "done");
  const patch: Record<string, unknown> = {
    status: "concluida",
    completed_at: new Date().toISOString(),
    incomplete_reason: null,
    review_status: "approved",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: notes ?? null,
  };
  if (doneStage) patch.stage_id = doneStage;
  const { error } = await sb.from("workflow_tasks").update(patch).eq("id", original.id);
  if (error) throw new Error(error.message);
  await dropReviewCopies(sb, original.id);

  if (notes) {
    await sb.from("workflow_task_comments").insert({
      workspace_id: wsId,
      task_id: original.id,
      author_id: userId,
      body: `✅ Revisão aprovada: ${notes}`,
    });
  }
  await notify(
    sb,
    wsId,
    original.assignee_id,
    "review_approved",
    "✅ Tarefa aprovada",
    notes ?? "Sua tarefa foi aprovada na revisão.",
    original.id,
  );
  try {
    const { awardTaskPoints } = await import("@/lib/workflow-gamification.functions");
    if (original.assignee_id) {
      await awardTaskPoints(sb as any, wsId, original.assignee_id, original.id, "task_completed");
      await awardTaskPoints(sb as any, wsId, original.assignee_id, original.id, "review_approved", {
        round: Number(original.review_round ?? 1),
      });
    }
  } catch {
    /* pontuação best-effort */
  }
  try {
    const { runInlineTrigger } = await import("@/lib/workflow-automations-runtime.server");
    await runInlineTrigger(original.id, "task_completed");
    await runInlineTrigger(original.id, "task_review_approved");
  } catch {
    /* automações best-effort */
  }
  return { ok: true, originalId: original.id };
}

/** Devolve como incompleta: a tarefa volta para o funcionário refazer. */
export async function returnReviewCore(
  sb: AnySb,
  wsId: string,
  userId: string,
  taskId: string,
  notes: string,
  reassignTo?: string | null,
): Promise<{ ok: true; originalId: string }> {
  const original = await resolveOriginalTask(sb, taskId);
  if (!(await isReviewerOf(sb, wsId, userId, original.id))) throw new Error("Sem permissão para revisar esta tarefa.");
  const incompleteStage = await stageOfKind(sb, original.pipeline_id, "incomplete");
  const patch: Record<string, unknown> = {
    status: "incompleta",
    completed_at: null,
    incomplete_reason: notes,
    review_status: "returned",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: notes,
  };
  if (incompleteStage) patch.stage_id = incompleteStage;
  if (reassignTo) patch.assignee_id = reassignTo;
  const { error } = await sb.from("workflow_tasks").update(patch).eq("id", original.id);
  if (error) throw new Error(error.message);
  await dropReviewCopies(sb, original.id);

  await sb.from("workflow_task_comments").insert({
    workspace_id: wsId,
    task_id: original.id,
    author_id: userId,
    body: `↩️ Devolvida como incompleta: ${notes}`,
  });
  await notify(
    sb,
    wsId,
    reassignTo ?? original.assignee_id,
    "review_returned",
    "↩️ Tarefa devolvida como incompleta",
    notes,
    original.id,
  );
  try {
    const { awardTaskPoints } = await import("@/lib/workflow-gamification.functions");
    if (original.assignee_id) {
      await awardTaskPoints(sb as any, wsId, original.assignee_id, original.id, "review_returned", {
        round: Number(original.review_round ?? 1),
      });
    }
  } catch {
    /* pontuação best-effort */
  }
  try {
    const { runInlineTrigger } = await import("@/lib/workflow-automations-runtime.server");
    await runInlineTrigger(original.id, "task_marked_incomplete");
    await runInlineTrigger(original.id, "task_returned_from_review");
    await runInlineTrigger(original.id, "task_review_returned");
  } catch {
    /* automações best-effort */
  }
  return { ok: true, originalId: original.id };
}
