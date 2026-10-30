// SLIM_AUDIENCE_OPERATIONS_V1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

/**
 * Dispara gatilhos de etapa no SERVIDOR.
 * O navegador só avisa "aconteceu isso com esse lead" — quem executa (agora ou
 * daqui a X minutos) é o servidor, com o app aberto ou fechado.
 */
export const triggerStageAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        event: z.enum(["created", "moved", "manual", "assignee-changed", "tag-added", "field-updated"]),
        stageId: z.string().uuid().nullable().optional(),
        fromStageId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string()).optional(),
        fieldId: z.string().uuid().optional(),
        fieldName: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => { select: (c: string) => unknown };
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    const wsId = await requireActiveWorkspace(sb as never, context.userId);
 // SLIM_STAGE_OPERATOR_GUARD_triggerStageAutomations
 const {assertSlimOperator}=await import("@/lib/slim-workspace-operator.server");
 await assertSlimOperator(context.supabase,wsId,context.userId);

    const { data: lead } = await (context.supabase as never as {
      from: (t: string) => any;
    })
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!lead) throw new Error("Lead não encontrado neste workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
    const results = await enqueueLeadAutomationEvent(supabaseAdmin as never, {
      leadId: data.leadId,
      event: data.event,
      workspaceId: wsId,
      stageId: data.stageId ?? null,
      fromStageId: data.fromStageId ?? null,
      tags: data.tags,
      fieldId: data.fieldId,
      fieldName: data.fieldName,
    });
    return { results };
  });

/** Últimos gatilhos executados/enfileirados de um lead (auditoria na UI). */
export const listLeadAutomationJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as never as { from: (t: string) => any };
    const wsId = await requireActiveWorkspace(sb as never, context.userId);
    const { data: lead } = await sb
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!lead) throw new Error("Lead não encontrado neste workspace.");
    const { data: rows, error: jobsError } = await sb
      .from("crm_automation_jobs")
      .select("id, action_id, action, status, due_at, executed_at, last_error")
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(50);
    if(jobsError)throw new Error("Não foi possível consultar o histórico das automações.");
    return { jobs: rows ?? [] };
  });
