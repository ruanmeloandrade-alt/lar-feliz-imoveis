/**
 * Server-only helper: insert a workflow task using the admin client, bypassing RLS.
 * Used by automations that run without a user context (salesbot runtime, CRM
 * stage automation runner when triggered by system events).
 *
 * For user-initiated task creation, use `createTask` from `workflow.functions.ts`
 * which uses the authenticated Supabase client and respects RLS.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface CreateWorkflowTaskAdminInput {
  workspaceId: string;
  pipelineId: string;
  /** Etapa destino; se omitida, usa a primeira etapa ativa do fluxo. */
  stageId?: string | null;
  title: string;
  description?: string | null;
  priority?: "baixa" | "media" | "alta" | "urgente";
  dueAt?: string | null;
  assigneeId?: string | null;
  tags?: string[];
  createdBy?: string | null;
  /** Optional: link the task back to a lead. Stored in description if not supported. */
  leadId?: string | null;
}

export async function createWorkflowTaskAdmin(input: CreateWorkflowTaskAdminInput): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    // Etapa explícita (valida que pertence ao fluxo) ou primeira etapa ativa.
    let stageId: string | undefined;
    if (input.stageId) {
      const { data: chosen } = await supabaseAdmin
        .from("workflow_stages")
        .select("id")
        .eq("id", input.stageId)
        .eq("pipeline_id", input.pipelineId)
        .maybeSingle();
      stageId = (chosen as any)?.id as string | undefined;
    }
    const { data: stage } = await supabaseAdmin
      .from("workflow_stages")
      .select("id")
      .eq("pipeline_id", input.pipelineId)
      .eq("is_done_stage", false)
      .eq("is_incomplete_stage", false)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    stageId = stageId ?? ((stage as any)?.id as string | undefined);
    if (!stageId) return { ok: false, error: "Fluxo sem etapas configuradas." };

    const { data: max } = await supabaseAdmin
      .from("workflow_tasks")
      .select("position")
      .eq("stage_id", stageId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max as any)?.position ?? -1) + 1;

    const desc = input.leadId
      ? `${input.description ?? ""}${input.description ? "\n\n" : ""}[Lead: ${input.leadId}]`
      : (input.description ?? null);

    const { data: row, error } = await supabaseAdmin
      .from("workflow_tasks")
      .insert({
        workspace_id: input.workspaceId,
        pipeline_id: input.pipelineId,
        stage_id: stageId,
        title: input.title,
        description: desc,
        priority: input.priority ?? "media",
        due_at: input.dueAt ?? null,
        assignee_id: input.assigneeId ?? null,
        tags: input.tags ?? [],
        created_by: (input.createdBy ?? null) as unknown as string,
        position: nextPos,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: (row as any).id as string };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "error" };
  }
}
