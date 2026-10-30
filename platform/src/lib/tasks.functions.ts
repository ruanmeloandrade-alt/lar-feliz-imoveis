import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as google from "@/lib/google.server";
import { calendarCreateEvent, googleScopeGranted } from "@/lib/google-workspace.server";

type AnySb = {
  from: (t: string) => any;
  rpc: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
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

async function createWorkflowTaskFromCalendar(
  supabase: AnySb,
  workspaceId: string,
  userId: string,
  input: { title: string; description?: string; dueAt: string },
): Promise<string> {
  const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_workflow", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (permissionError) throw new Error(permissionError.message ?? "Não foi possível validar a permissão do Workflow.");
  if (!canManage) throw new Error("Você não tem permissão para criar tarefas no Workflow.");

  let { data: pipeline, error: pipelineError } = await supabase
    .from("workflow_pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pipelineError) throw new Error(pipelineError.message);

  if (!pipeline) {
    const fallback = await supabase
      .from("workflow_pipelines")
      .select("id")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    pipeline = fallback.data;
  }
  if (!pipeline?.id) throw new Error("Nenhum fluxo de trabalho está configurado neste workspace.");

  const { data: stage, error: stageError } = await supabase
    .from("workflow_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .eq("is_done_stage", false)
    .eq("is_incomplete_stage", false)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stageError) throw new Error(stageError.message);
  if (!stage?.id) throw new Error("O fluxo padrão não possui uma etapa inicial disponível.");

  const { data: row, error } = await supabase
    .from("workflow_tasks")
    .insert({
      workspace_id: workspaceId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      title: input.title,
      description: input.description ?? null,
      priority: "media",
      due_at: input.dueAt,
      status: "ativa",
      position: 0,
      created_by: userId,
      tags: [],
      links: [],
      credentials: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  try {
    const { runInlineTrigger } = await import("@/lib/workflow-automations-runtime.server");
    await runInlineTrigger(row.id, "task_created");
  } catch (triggerError) {
    console.error("[calendar] workflow task_created trigger failed", triggerError);
  }

  return row.id as string;
}

export interface EventParticipant {
  name?: string;
  email: string;
}

export interface CalendarEventRow {
  id: string;
  title: string;
  description: string | null;
  kind: "tarefa" | "reuniao" | "evento";
  status: "pendente" | "concluida" | "cancelada";
  start: string;
  end: string;
  leadId: string | null;
  leadName: string | null;
  source: "crm" | "manual" | "google";
  externalUrl: string | null;
  location: string | null;
  meetingUrl: string | null;
  participants: EventParticipant[];
  reminderMinutes: number | null;
  googleSyncStatus: "off" | "pending" | "synced" | "error";
}

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    let q = sb
      .from("tasks")
      .select(
        "id, title, description, kind, status, start_at, end_at, lead_id, external_source, external_url, location, meeting_url, participants, reminder_minutes, google_sync_status, leads(name)",
      )
      .eq("workspace_id", wsId)
      .order("start_at");
    if (data.from) q = q.gte("start_at", data.from);
    if (data.to) q = q.lte("start_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const events: CalendarEventRow[] = (
      (rows ?? []) as Array<{
        id: string;
        title: string;
        description: string | null;
        kind: CalendarEventRow["kind"];
        status: CalendarEventRow["status"];
        start_at: string;
        end_at: string;
        lead_id: string | null;
        external_source: string | null;
        external_url: string | null;
        leads: { name: string } | null;
        location: string | null;
        meeting_url: string | null;
        participants: EventParticipant[] | null;
        reminder_minutes: number | null;
        google_sync_status: CalendarEventRow["googleSyncStatus"] | null;
      }>
    ).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      status: r.status,
      start: r.start_at,
      end: r.end_at,
      leadId: r.lead_id,
      leadName: r.leads?.name ?? null,
      source: (r.external_source as CalendarEventRow["source"] | null) ?? "manual",
      externalUrl: r.external_url,
      location: r.location,
      meetingUrl: r.meeting_url,
      participants: Array.isArray(r.participants) ? r.participants : [],
      reminderMinutes: r.reminder_minutes,
      googleSyncStatus: r.google_sync_status ?? "off",
    }));
    return { events };
  });

const ParticipantSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
});

const TaskInputSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().optional(),
  kind: z.enum(["tarefa", "reuniao", "evento"]).default("tarefa"),
  startAt: z.string(),
  endAt: z.string(),
  timeZone: z.string().trim().min(1).max(100).optional(),
  leadId: z.string().uuid().nullable().optional(),
  location: z.string().max(300).optional(),
  meetingUrl: z.string().url().optional().or(z.literal("")),
  participants: z.array(ParticipantSchema).max(50).optional(),
  reminderMinutes: z.number().int().min(0).max(43200).nullable().optional(),
  syncGoogle: z.boolean().optional(),
  syncWorkflow: z.boolean().optional(),
});

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaskInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const wantsGoogleSync = !!data.syncGoogle && (data.kind === "reuniao" || data.kind === "evento");
    const wantsWorkflowSync = !!data.syncWorkflow && data.kind === "tarefa";
    const manualMeetingUrl = data.meetingUrl && data.meetingUrl.length > 0 ? data.meetingUrl : null;
    const { data: row, error } = await sb
      .from("tasks")
      .insert({
        workspace_id: wsId,
        created_by: context.userId,
        title: data.title,
        description: data.description ?? null,
        kind: data.kind,
        start_at: data.startAt,
        end_at: data.endAt,
        lead_id: data.leadId ?? null,
        location: data.location ?? null,
        meeting_url: manualMeetingUrl,
        participants: data.participants ?? [],
        reminder_minutes: data.reminderMinutes ?? null,
        google_sync_status: wantsGoogleSync ? "pending" : "off",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const taskId = (row as { id: string }).id;

    let workflowTaskId: string | null = null;
    let workflowSyncError: string | null = null;
    if (wantsWorkflowSync) {
      try {
        workflowTaskId = await createWorkflowTaskFromCalendar(sb, wsId, context.userId, {
          title: data.title,
          description: data.description,
          dueAt: data.endAt,
        });
      } catch (workflowFailure) {
        workflowSyncError = workflowFailure instanceof Error
          ? workflowFailure.message
          : "Falha ao criar a tarefa no Workflow.";
      }
    }

    if (wantsGoogleSync) {
      try {
        const secret = await google.readGoogleSecretSafe(sb, wsId);
        const calendarScope = "https://www.googleapis.com/auth/calendar";
        if (!secret || !googleScopeGranted(secret, calendarScope)) {
          throw new Error(
            "Google Agenda não autorizado neste workspace. Autorize o produto Agenda na Central Google.",
          );
        }
        const { token } = await google.getGoogleAccessToken(sb, wsId, secret);
        const event = await calendarCreateEvent(token, {
          summary: data.title,
          description: data.description ?? null,
          start: data.startAt,
          end: data.endAt,
          timeZone: data.timeZone ?? null,
          location: data.location ?? null,
          attendees: (data.participants ?? []).map((p) => ({
            email: p.email,
            displayName: p.name,
          })),
          reminderMinutes: data.reminderMinutes ?? null,
          meetingUrl: manualMeetingUrl,
          createGoogleMeet: data.kind === "reuniao" && !manualMeetingUrl,
        });
        const resolvedMeetingUrl = event.hangoutLink ?? manualMeetingUrl;
        const { error: syncError } = await sb
          .from("tasks")
          .update({
            external_source: "google",
            external_url: event.htmlLink ?? null,
            meeting_url: resolvedMeetingUrl,
            google_event_id: event.id,
            google_sync_status: "synced",
            external_sync_status: "synced",
            external_synced_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .eq("workspace_id", wsId);
        if (syncError) throw new Error(syncError.message);
        return {
          id: taskId,
          googleSyncStatus: "synced" as const,
          meetingUrl: resolvedMeetingUrl,
          externalUrl: event.htmlLink ?? null,
          workflowTaskId,
          workflowSyncError,
        };
      } catch (syncFailure) {
        const message = syncFailure instanceof Error
          ? syncFailure.message
          : "Falha ao sincronizar Google Agenda.";
        await sb
          .from("tasks")
          .update({ google_sync_status: "error", external_sync_status: "error" })
          .eq("id", taskId)
          .eq("workspace_id", wsId);
        return {
          id: taskId,
          googleSyncStatus: "error" as const,
          googleSyncError: message,
          workflowTaskId,
          workflowSyncError,
        };
      }
    }

    return {
      id: taskId,
      googleSyncStatus: "off" as const,
      workflowTaskId,
      workflowSyncError,
    };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        kind: z.enum(["tarefa", "reuniao", "evento"]).optional(),
        status: z.enum(["pendente", "concluida", "cancelada"]).optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.status !== undefined) patch.status = data.status;
    if (data.startAt !== undefined) patch.start_at = data.startAt;
    if (data.endAt !== undefined) patch.end_at = data.endAt;
    const { error } = await sb
      .from("tasks")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("tasks").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
