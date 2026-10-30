/**
 * Workflow automations runtime.
 * - runInlineTrigger: called from server-fn handlers after a task changes state
 *   (task_created, task_moved_to_stage, task_completed, task_marked_incomplete,
 *   task_review_returned).
 * - runPeriodicSweep: called by the /api/public/hooks/workflow-automations cron.
 *   Evaluates time-based triggers (task_overdue, task_timer_exceeded,
 *   task_stalled_in_stage, task_near_due) across all workspaces.
 *
 * Actions supported: move_to_stage, assign_to_user, reassign_round_robin,
 * reassign_to_manager, set_priority, escalate_priority, add_comment,
 * notify_assignee (creates a system comment mentioning the assignee),
 * extend_due, remove_assignee, add_tag.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Params = Record<string, string | number | boolean | null | undefined>;
type Trigger = { event: string; params?: Params };
type Action = { type: string; params?: Params };
type Automation = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
};
type Task = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  assignee_id: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  tags: string[] | null;
  time_spent_seconds: number;
  estimated_seconds: number | null;
  updated_at: string;
  automation_state: Record<string, string> | null;
  created_by?: string | null;

};

const now = () => new Date();
const iso = (d: Date) => d.toISOString();

/** Comentários/ações automáticas precisam de um autor real (author_id é NOT NULL). */
async function resolveAutomationAuthor(task: Task): Promise<string | null> {
  if (task.assignee_id) return task.assignee_id;
  if (task.created_by) return task.created_by;
  const { data } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", task.workspace_id)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}


async function applyActions(task: Task, automation: Automation, event: string) {
  // Prevent double-firing per (task, automation) for time-based events.
  // Inline events (like task_moved_to_stage) handle their own deduplication or clearing.
  const TIME_EVENTS = new Set([
    "task_overdue",
    "task_timer_exceeded",
    "task_stalled_in_stage",
    "task_near_due",
    "high_priority_untouched",
    "task_no_progress",
    "task_over_estimate_percent",
    "stage_wip_exceeded",
  ]);

  const state = task.automation_state ?? {};
  if (TIME_EVENTS.has(event) && state[automation.id]) return;

  const summary: Array<{ type: string; ok: boolean; error?: string }> = [];
  let hadError = false;
  for (const ac of automation.actions) {
    try {
      await runAction(task, ac, automation);
      summary.push({ type: ac.type, ok: true });
    } catch (e) {
      hadError = true;
      const msg = e instanceof Error ? e.message : String(e);
      summary.push({ type: ac.type, ok: false, error: msg });
      console.warn("workflow automation action failed", automation.id, ac.type, e);
    }
  }

  // Update automation state to prevent re-firing for time-based triggers
  await supabaseAdmin
    .from("workflow_tasks")
    .update({
      automation_state: { ...state, [automation.id]: iso(now()) },
    })
    .eq("id", task.id);

  try {
    await supabaseAdmin.from("workflow_automation_runs").insert({
      workspace_id: task.workspace_id,
      automation_id: automation.id,
      pipeline_id: automation.pipeline_id,
      task_id: task.id,
      trigger_event: event,
      actions_summary: summary,
      status: hadError ? "partial" : "ok",
      error: hadError ? summary.filter((s) => !s.ok).map((s) => `${s.type}: ${s.error}`).join(" | ") : null,
    });
  } catch (e) {
    console.warn("automation run log failed", e);
  }
}


async function runAction(task: Task, ac: Action, automation: Automation) {
  const p = ac.params ?? {};
  switch (ac.type) {
    case "move_to_stage": {
      const stageId = String(p.stageId ?? "");
      if (!stageId) return;
      // Reset automation state when moving stages so new triggers can fire.
      await supabaseAdmin.from("workflow_tasks").update({ 
        stage_id: stageId,
        automation_state: {} 
      }).eq("id", task.id);
      
      // Run triggers for the new stage immediately.
      await runInlineTrigger(task.id, "task_moved_to_stage");
      return;
    }
    case "assign_to_user": {
      const uid = (p.userId as string) || null;
      await supabaseAdmin.from("workflow_tasks").update({ assignee_id: uid }).eq("id", task.id);
      return;
    }
    case "remove_assignee": {
      await supabaseAdmin.from("workflow_tasks").update({ assignee_id: null }).eq("id", task.id);
      return;
    }
    case "reassign_round_robin": {
      // Pick next member of the pipeline's sector, skipping current assignee.
      const { data: pipe } = await supabaseAdmin
        .from("workflow_pipelines")
        .select("sector_id")
        .eq("id", task.pipeline_id)
        .maybeSingle();
      const sectorId = (pipe as any)?.sector_id;
      if (!sectorId) return;
      const { data: mem } = await supabaseAdmin
        .from("workflow_sector_members")
        .select("user_id")
        .eq("sector_id", sectorId);
      const ids = ((mem as any[]) ?? []).map((m) => m.user_id).filter(Boolean);
      if (ids.length === 0) return;
      const pool = ids.filter((id) => id !== task.assignee_id);
      const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : ids[0];
      await supabaseAdmin.from("workflow_tasks").update({ assignee_id: pick }).eq("id", task.id);
      return;
    }
    case "reassign_to_manager": {
      const { data: pipe } = await supabaseAdmin
        .from("workflow_pipelines")
        .select("sector_id")
        .eq("id", task.pipeline_id)
        .maybeSingle();
      const sectorId = (pipe as any)?.sector_id;
      if (!sectorId) return;
      const { data: sec } = await supabaseAdmin
        .from("workflow_sectors")
        .select("manager_id")
        .eq("id", sectorId)
        .maybeSingle();
      const mgr = (sec as any)?.manager_id;
      if (!mgr) return;
      await supabaseAdmin.from("workflow_tasks").update({ assignee_id: mgr }).eq("id", task.id);
      return;
    }
    case "set_priority": {
      const pr = String(p.priority ?? "media");
      await supabaseAdmin.from("workflow_tasks").update({ priority: pr }).eq("id", task.id);
      return;
    }
    case "escalate_priority": {
      const order = ["baixa", "media", "alta", "urgente"];
      const cur = order.indexOf(task.priority);
      if (cur < 0) return;
      const next = order[Math.min(order.length - 1, cur + 1)];
      if (next !== task.priority) {
        await supabaseAdmin.from("workflow_tasks").update({ priority: next }).eq("id", task.id);
      }
      return;
    }
    case "add_comment": {
      const text = (p.text as string) || `Automação "${automation.name}" executada.`;
      const authorId = await resolveAutomationAuthor(task);
      if (!authorId) throw new Error("Nenhum usuário do workspace disponível para assinar o comentário automático.");
      const { error } = await supabaseAdmin.from("workflow_task_comments").insert({
        workspace_id: task.workspace_id,
        task_id: task.id,
        body: text,
        author_id: authorId,
      });
      if (error) throw new Error(error.message);
      return;
    }

    case "notify_assignee": {
      // Chat interno: mensagem do ADM (ou automação) direto para o responsável da tarefa.
      const text = (p.text as string) || `🔔 Automação "${automation.name}" acionada.`;
      if (task.assignee_id) {
        // pick a "from", task creator if available, else a workspace owner
        let fromId: string | null = task.created_by ?? null;
        if (!fromId) {
          const { data: owner } = await supabaseAdmin
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", task.workspace_id)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();
          fromId = (owner as any)?.user_id ?? null;
        }
        await (supabaseAdmin as any).from("internal_messages").insert({
          workspace_id: task.workspace_id,
          from_user_id: fromId,
          to_user_id: task.assignee_id,
          task_id: task.id,
          body: text,
          origin: "automation",
        });
      }
      return;
    }
    case "create_child_task": {
      const title = String(p.title ?? "").trim();
      if (!title) return;
      const priority = String(p.priority ?? task.priority);
      const assignTo = String(p.assignTo ?? "same"); // same | manager | unassigned
      let assignee: string | null = null;
      if (assignTo === "same") assignee = task.assignee_id;
      else if (assignTo === "manager") {
        const { data: pipe } = await supabaseAdmin
          .from("workflow_pipelines").select("sector_id").eq("id", task.pipeline_id).maybeSingle();
        const sectorId = (pipe as any)?.sector_id;
        if (sectorId) {
          const { data: sec } = await supabaseAdmin
            .from("workflow_sectors").select("manager_id").eq("id", sectorId).maybeSingle();
          assignee = (sec as any)?.manager_id ?? null;
        }
      }
      // pick first non-done stage
      const { data: st } = await supabaseAdmin
        .from("workflow_stages")
        .select("id")
        .eq("pipeline_id", task.pipeline_id)
        .eq("is_done_stage", false)
        .eq("is_incomplete_stage", false)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      const stageId = (st as any)?.id ?? task.stage_id;
      await supabaseAdmin.from("workflow_tasks").insert({
        workspace_id: task.workspace_id,
        pipeline_id: task.pipeline_id,
        stage_id: stageId,
        title,
        description: (p.description as string) ?? null,
        priority,
        assignee_id: assignee,
        parent_task_id: task.id,
        created_by: (task.created_by ?? task.assignee_id) as string,
        position: 0,
        tags: [],
        credentials: [],
        links: [],
      });
      if (assignee) {
        await supabaseAdmin.from("notifications").insert({
          workspace_id: task.workspace_id,
          user_id: assignee,
          type: "workflow_child_task",
          title: "🆕 Nova subtarefa atribuída",
          body: title,
          task_id: task.id,
          link: "/fluxo-trabalho",
        });
      }
      return;
    }

    case "extend_due": {
      const hours = Number(p.hours ?? 24);
      const base = task.due_at ? new Date(task.due_at) : now();
      const next = new Date(base.getTime() + hours * 3600 * 1000);
      await supabaseAdmin.from("workflow_tasks").update({ due_at: iso(next) }).eq("id", task.id);
      return;
    }
    case "add_tag": {
      const tag = String(p.tag ?? "").trim();
      if (!tag) return;
      const current = Array.isArray(task.tags) ? task.tags : [];
      if (current.includes(tag)) return;
      await supabaseAdmin
        .from("workflow_tasks")
        .update({ tags: [...current, tag] })
        .eq("id", task.id);
      return;
    }
  }
}

// -------- Inline triggers --------
export async function runInlineTrigger(taskId: string, event: string) {
  let ctx: { workspaceId: string; pipelineId: string } | null = null;
  try {
    const { data: task } = await supabaseAdmin
      .from("workflow_tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return;
    const t = task as unknown as Task;
    ctx = { workspaceId: t.workspace_id, pipelineId: t.pipeline_id };
    const { data: autos } = await supabaseAdmin
      .from("workflow_automations")
      .select("*")
      .eq("pipeline_id", t.pipeline_id)
      .eq("enabled", true);
    for (const a of ((autos as any[]) ?? []) as Automation[]) {
      if (a.trigger?.event !== event) continue;
      // For "task_moved_to_stage" allow optional filter param stageId
      if (event === "task_moved_to_stage") {
        const target = a.trigger.params?.stageId;
        if (target && target !== t.stage_id) continue;
      }
      
      // Inline events can fire multiple times if the event occurs again.
      // We don't block based on automation_state here if we want immediate reaction.
      // applyActions handles the "TIME_EVENTS" check.
      await applyActions(t, a, event);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("runInlineTrigger failed", event, taskId, msg, ctx);
  }
}



// -------- Periodic sweep (time-based) --------
export async function runPeriodicSweep() {
  const { data: autos } = await supabaseAdmin
    .from("workflow_automations")
    .select("*")
    .eq("enabled", true);
  const rules = ((autos as any[]) ?? []) as Automation[];
  const TIME_EVENTS = new Set([
    "task_overdue",
    "task_timer_exceeded",
    "task_stalled_in_stage",
    "task_near_due",
    "high_priority_untouched",
    "task_no_progress",
    "task_over_estimate_percent",
    "stage_wip_exceeded",
  ]);
  const timeBased = rules.filter((a) => TIME_EVENTS.has(a.trigger?.event));
  if (timeBased.length === 0) return { checked: 0, fired: 0 };

  // Group by pipeline for cheap fetch.
  const byPipe = new Map<string, Automation[]>();
  for (const a of timeBased) {
    const list = byPipe.get(a.pipeline_id) ?? [];
    list.push(a);
    byPipe.set(a.pipeline_id, list);
  }

  let fired = 0;
  let checked = 0;
  for (const [pipelineId, autos] of byPipe.entries()) {
    const { data: tasks } = await supabaseAdmin
      .from("workflow_tasks")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .eq("status", "ativa");
    const allTasks = ((tasks as any[]) ?? []) as Task[];
    // Pre-compute WIP counts per stage for stage_wip_exceeded.
    const stageCount = new Map<string, number>();
    for (const t of allTasks) stageCount.set(t.stage_id, (stageCount.get(t.stage_id) ?? 0) + 1);

    for (const t of allTasks) {
      checked++;
      const state = t.automation_state ?? {};
      for (const a of autos) {
        if (state[a.id]) continue; // already fired
        if (!matchesTimeTrigger(t, a, stageCount)) continue;
        await applyActions(t, a, a.trigger.event);
        fired++;
      }
    }
  }
  return { checked, fired };
}

function matchesTimeTrigger(t: Task, a: Automation, stageCount?: Map<string, number>): boolean {
  const p = a.trigger.params ?? {};
  const nowMs = Date.now();
  switch (a.trigger.event) {
    case "task_overdue": {
      if (!t.due_at) return false;
      return new Date(t.due_at).getTime() < nowMs;
    }
    case "task_near_due": {
      if (!t.due_at) return false;
      const hours = Number(p.hoursBefore ?? 2);
      const due = new Date(t.due_at).getTime();
      return due > nowMs && due - nowMs <= hours * 3600 * 1000;
    }
    case "task_timer_exceeded": {
      const thresholdSec = p.seconds
        ? Number(p.seconds)
        : t.estimated_seconds
        ? Number(t.estimated_seconds)
        : 0;
      if (!thresholdSec) return false;
      return Number(t.time_spent_seconds) >= thresholdSec;
    }
    case "task_stalled_in_stage": {
      const hours = Number(p.hours ?? 24);
      const last = new Date(t.updated_at).getTime();
      return nowMs - last >= hours * 3600 * 1000;
    }
    case "high_priority_untouched": {
      // Prioridade alta/urgente sem trabalho iniciado por N horas
      const priorities = ["alta", "urgente"];
      if (!priorities.includes(t.priority)) return false;
      if (Number(t.time_spent_seconds) > 0) return false;
      const hours = Number(p.hours ?? 2);
      const created = new Date(t.updated_at).getTime();
      return nowMs - created >= hours * 3600 * 1000;
    }
    case "task_no_progress": {
      // Sem update algum por N horas (mesmo que time_spent > 0)
      const hours = Number(p.hours ?? 8);
      const last = new Date(t.updated_at).getTime();
      return nowMs - last >= hours * 3600 * 1000;
    }
    case "task_over_estimate_percent": {
      // time_spent passou X% do estimated
      if (!t.estimated_seconds) return false;
      const pct = Number(p.percent ?? 100);
      return Number(t.time_spent_seconds) >= (Number(t.estimated_seconds) * pct) / 100;
    }
    case "stage_wip_exceeded": {
      // Etapa tem mais que N tarefas ativas
      if (!stageCount) return false;
      const limit = Number(p.limit ?? 5);
      const stageId = String(p.stageId ?? t.stage_id);
      if (stageId !== t.stage_id) return false;
      return (stageCount.get(t.stage_id) ?? 0) > limit;
    }
  }
  return false;
}
