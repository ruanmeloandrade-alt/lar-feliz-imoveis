import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CRM_AGENT_AUTONOMY = [
  "leitura",
  "relatorio",
  "sugestao",
  "automatico",
] as const;
export type CrmAgentAutonomy = (typeof CRM_AGENT_AUTONOMY)[number];

export const CRM_AGENT_TASKS = [
  "leads_parados",
  "follow_up",
  "sem_resposta",
  "higienizacao",
  "qualificacao",
  "mover_etapa",
  "criar_tarefa",
  "registrar_nota",
  "alerta_sla",
  "detectar_duplicados",
] as const;
export type CrmAgentTask = (typeof CRM_AGENT_TASKS)[number];

type AnySb = { from: (table: string) => any };

async function requireActiveWorkspace(supabase: AnySb, userId: string, requestedWorkspaceId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const activeWorkspaceId = (profile as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!activeWorkspaceId) throw new Error("Workspace ativo não encontrado.");
  if (activeWorkspaceId !== requestedWorkspaceId) throw new Error("Workspace inválido para esta sessão.");
  return activeWorkspaceId;
}

const ConfigSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  /** Funis administrados por este agente. Vazio = todos os funis. */
  pipelineIds: z.array(z.string().uuid()),
  enabled: z.boolean(),
  autonomy: z.enum(CRM_AGENT_AUTONOMY),
  activeDays: z.array(z.number().int().min(0).max(6)),
  startTime: z.string(),
  endTime: z.string(),
  timezone: z.string(),
  checkIntervalMinutes: z.number().int().min(5).max(1440),
  tasks: z.array(z.enum(CRM_AGENT_TASKS)),
  maxActionsPerDay: z.number().int().min(0).max(500),
  requireApprovalAbove: z.number().int().min(0),
  rules: z.string().max(6000).nullable(),
  reportChannel: z.enum(["painel", "email", "whatsapp", "inbox"]),
  reportTime: z.string().nullable(),
});

export type CrmAgentConfig = Omit<z.infer<typeof ConfigSchema>, "workspaceId" | "id"> & {
  id: string | null;
};

export const DEFAULT_CRM_AGENT_CONFIG: CrmAgentConfig = {
  id: null,
  name: "Gestor geral",
  pipelineIds: [],
  enabled: false,
  autonomy: "relatorio",
  activeDays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "18:00",
  timezone: "America/Sao_Paulo",
  checkIntervalMinutes: 60,
  tasks: ["leads_parados", "follow_up", "sem_resposta"],
  maxActionsPerDay: 20,
  requireApprovalAbove: 0,
  rules: null,
  reportChannel: "painel",
  reportTime: "09:00",
};

function hhmm(value: string | null | undefined, fallback: string | null): string | null {
  if (!value) return fallback;
  return value.slice(0, 5);
}

function rowToConfig(row: Record<string, unknown>): CrmAgentConfig {
  return {
    id: String(row.id),
    name: (row.name as string) ?? "Gestor",
    pipelineIds: Array.isArray(row.pipeline_ids) ? (row.pipeline_ids as string[]) : [],
    enabled: Boolean(row.enabled),
    autonomy: (CRM_AGENT_AUTONOMY as readonly string[]).includes(String(row.autonomy))
      ? (row.autonomy as CrmAgentAutonomy)
      : "relatorio",
    activeDays: Array.isArray(row.active_days) ? (row.active_days as number[]) : [1, 2, 3, 4, 5],
    startTime: hhmm(row.start_time as string, "09:00")!,
    endTime: hhmm(row.end_time as string, "18:00")!,
    timezone: (row.timezone as string) ?? "America/Sao_Paulo",
    checkIntervalMinutes: Number(row.check_interval_minutes ?? 60),
    tasks: Array.isArray(row.tasks) ? (row.tasks as CrmAgentTask[]) : [],
    maxActionsPerDay: Number(row.max_actions_per_day ?? 20),
    requireApprovalAbove: Number(row.require_approval_above ?? 0),
    rules: (row.rules as string | null) ?? null,
    reportChannel: (row.report_channel as CrmAgentConfig["reportChannel"]) ?? "painel",
    reportTime: hhmm(row.report_time as string, null),
  };
}

/** Lista todos os agentes gestores de CRM do workspace. */
export const listCrmAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CrmAgentConfig[]> => {
    const workspaceId = await requireActiveWorkspace(context.supabase as unknown as AnySb, context.userId, data.workspaceId);
    const { data: rows, error } = await context.supabase
      .from("crm_agent_config" as never)
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Record<string, unknown>[]).map(rowToConfig);
  });

/** Compat: primeiro agente do workspace (ou default). */
export const getCrmAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CrmAgentConfig> => {
    const workspaceId = await requireActiveWorkspace(context.supabase as unknown as AnySb, context.userId, data.workspaceId);
    const { data: rows, error } = await context.supabase
      .from("crm_agent_config" as never)
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] as unknown as Record<string, unknown> | undefined;
    return row ? rowToConfig(row) : DEFAULT_CRM_AGENT_CONFIG;
  });

export const saveCrmAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfigSchema.parse(d))
  .handler(async ({ data, context }) => {
    const workspaceId = await requireActiveWorkspace(context.supabase as unknown as AnySb, context.userId, data.workspaceId);
    if (data.pipelineIds.length) {
      const { data: pipelines, error: pipelinesError } = await context.supabase
        .from("pipelines")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", data.pipelineIds);
      if (pipelinesError) throw new Error(pipelinesError.message);
      if ((pipelines ?? []).length !== new Set(data.pipelineIds).size) {
        throw new Error("Um ou mais funis não pertencem ao workspace ativo.");
      }
    }

    // Impede conflito: dois agentes ligados cuidando do mesmo funil.
    const { data: others, error: readErr } = await context.supabase
      .from("crm_agent_config" as never)
      .select("id,name,enabled,pipeline_ids")
      .eq("workspace_id", workspaceId);
    if (readErr) throw new Error(readErr.message);

    if (data.enabled) {
      for (const o of ((others ?? []) as unknown as Record<string, unknown>[])) {
        if (data.id && String(o.id) === data.id) continue;
        if (!o.enabled) continue;
        const theirs = Array.isArray(o.pipeline_ids) ? (o.pipeline_ids as string[]) : [];
        const overlap =
          theirs.length === 0 ||
          data.pipelineIds.length === 0 ||
          data.pipelineIds.some((p) => theirs.includes(p));
        if (overlap) {
          throw new Error(
            `Conflito: o agente "${String(o.name)}" já está ligado cuidando desses funis. Escolha funis diferentes ou desligue o outro agente.`,
          );
        }
      }
    }

    const payload = {
      workspace_id: workspaceId,
      name: data.name,
      pipeline_ids: data.pipelineIds,
      enabled: data.enabled,
      autonomy: data.autonomy,
      active_days: data.activeDays,
      start_time: data.startTime,
      end_time: data.endTime,
      timezone: data.timezone,
      check_interval_minutes: data.checkIntervalMinutes,
      tasks: data.tasks,
      max_actions_per_day: data.maxActionsPerDay,
      require_approval_above: data.requireApprovalAbove,
      rules: data.rules,
      report_channel: data.reportChannel,
      report_time: data.reportTime,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("crm_agent_config" as never)
        .update(payload as never)
        .eq("id", data.id)
        .eq("workspace_id", workspaceId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error("Gestor de CRM não encontrado no workspace ativo.");
      return { id: data.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("crm_agent_config" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String((inserted as unknown as { id: string }).id) };
  });

export const deleteCrmAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await requireActiveWorkspace(context.supabase as unknown as AnySb, context.userId, data.workspaceId);
    const { data: deleted, error } = await context.supabase
      .from("crm_agent_config" as never)
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Gestor de CRM não encontrado no workspace ativo.");
    return { ok: true };
  });
