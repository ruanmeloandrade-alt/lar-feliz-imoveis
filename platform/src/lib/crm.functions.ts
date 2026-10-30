import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { loadEffectivePermissions } from "@/lib/permissions-core.functions";
import { allowedPipelines } from "@/lib/permissions-core";

export * from "./crm.functions.legacy";

type AnySb = {
  from: (table: string) => any;
};

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  return requireActiveWorkspace(supabase, userId);
}

export function nextPipelineStagePosition(positions: Array<number | null | undefined>): number {
  const maxPosition = positions.reduce(
    (max, position) => Math.max(max, Number(position ?? 0)),
    0,
  );
  return Math.max(1, maxPosition + 1);
}

type OrderedStage = {
  id: string;
  position: number | null;
  created_at: string | null;
};

export function orderPipelineStagesForDeletion(stages: OrderedStage[]): OrderedStage[] {
  return [...stages].sort((a, b) => {
    const byPosition = Number(a.position ?? 0) - Number(b.position ?? 0);
    if (byPosition !== 0) return byPosition;
    const byCreated = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

const ListFunnelsSchema = z.object({ crmSourceId: z.string().uuid() });

/**
 * Mantém a ordenação determinística mesmo para dados legados com position repetida.
 * Assim a etapa original de entrada continua na primeira coluna e etapas novas que
 * herdaram position=1 não perdem a lixeira por aparecerem acidentalmente no índice 0.
 */
export const listFunnels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListFunnelsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const permissions = await loadEffectivePermissions(sb as never, context.userId, workspaceId);
    const allowedIds = allowedPipelines(permissions, "crm");
    if (allowedIds && allowedIds.length === 0) return { funnels: [] };

    const { data: links, error: linkError } = await sb
      .from("crm_source_funnels")
      .select("pipeline_id")
      .eq("workspace_id", workspaceId)
      .eq("crm_source_id", data.crmSourceId);
    if (linkError) throw new Error(linkError.message);

    let linkedIds = ((links ?? []) as Array<{ pipeline_id: string }>).map((link) => link.pipeline_id);
    if (allowedIds) linkedIds = linkedIds.filter((id) => allowedIds.includes(id));
    if (linkedIds.length === 0) return { funnels: [] };

    const { data: pipelines, error: pipelinesError } = await sb
      .from("pipelines")
      .select("id, name, position")
      .eq("workspace_id", workspaceId)
      .in("id", linkedIds)
      .order("position", { ascending: true });
    if (pipelinesError) throw new Error(pipelinesError.message);

    const pipelineIds = ((pipelines ?? []) as Array<{ id: string }>).map((pipeline) => pipeline.id);
    if (pipelineIds.length === 0) return { funnels: [] };

    const { data: stageRows, error: stagesError } = await sb
      .from("pipeline_stages")
      .select("id, pipeline_id, name, position, color, description, created_at")
      .in("pipeline_id", pipelineIds)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (stagesError) throw new Error(stagesError.message);

    const { data: leadRows, error: leadsError } = await sb
      .from("leads")
      .select("id, pipeline_id, stage_id, name, value, last_message_from, tags, created_at, company_id, email, phone")
      .eq("workspace_id", workspaceId)
      .eq("crm_source_id", data.crmSourceId);
    if (leadsError) throw new Error(leadsError.message);

    const stages = (stageRows ?? []) as Array<{
      id: string;
      pipeline_id: string;
      name: string;
      position: number | null;
      color: string | null;
      description: string | null;
      created_at: string | null;
    }>;
    const leads = (leadRows ?? []) as Array<{
      id: string;
      pipeline_id: string;
      stage_id: string | null;
      name: string;
      value: number | null;
      last_message_from: string | null;
      tags: unknown;
      created_at: string;
      company_id: string | null;
      email: string | null;
      phone: string | null;
    }>;

    return {
      funnels: ((pipelines ?? []) as Array<{ id: string; name: string }>).map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        stages: stages
          .filter((stage) => stage.pipeline_id === pipeline.id)
          .map((stage) => ({
            id: stage.id,
            name: stage.name,
            color: stage.color,
            description: stage.description ?? null,
            status: /ganh|venda/i.test(stage.name)
              ? "ganha"
              : /perdid/i.test(stage.name)
                ? "perdida"
                : "aberta",
            leads: leads
              .filter((lead) => lead.stage_id === stage.id)
              .map((lead) => ({
                id: lead.id,
                name: lead.name,
                value: Number(lead.value ?? 0),
                lastMessageFrom: (lead.last_message_from as "lead" | "us" | "none" | null) ?? "none",
                companyId: lead.company_id,
                createdAt: lead.created_at,
                email: lead.email,
                phone: lead.phone,
                tags: Array.isArray(lead.tags) ? (lead.tags as string[]) : [],
              })),
          })),
      })),
    };
  });

const CreatePipelineStageSchema = z.object({
  pipelineId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

/**
 * Override do fluxo legado: etapas novas precisam de uma posição realmente nova.
 * O código anterior reutilizava maxPos e criava posições duplicadas, fazendo
 * etapas recém-criadas parecerem a etapa de entrada e ficarem impossíveis de apagar.
 */
export const createPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreatePipelineStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);

    const { data: pipeline, error: pipelineError } = await sb
      .from("pipelines")
      .select("id")
      .eq("id", data.pipelineId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (pipelineError) throw new Error(pipelineError.message);
    if (!pipeline) throw new Error("Funil não encontrado neste workspace.");

    const { data: stages, error: stagesError } = await sb
      .from("pipeline_stages")
      .select("position")
      .eq("pipeline_id", data.pipelineId)
      .eq("workspace_id", workspaceId);
    if (stagesError) throw new Error(stagesError.message);

    const position = nextPipelineStagePosition(
      ((stages ?? []) as Array<{ position: number | null }>).map((stage) => stage.position),
    );

    const { data: created, error } = await sb
      .from("pipeline_stages")
      .insert({
        pipeline_id: data.pipelineId,
        workspace_id: workspaceId,
        name: data.name,
        position,
        color: data.color ?? "#3b82f6",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { stageId: (created as { id: string }).id };
  });

const DeletePipelineStageSchema = z.object({
  stageId: z.string().uuid(),
  fallbackStageId: z.string().uuid().optional(),
});

/**
 * Exclui uma etapa sem confundir position=1 duplicado com a etapa de entrada real.
 * Leads são preservados em uma etapa fallback. Efeitos secundários de automação
 * acontecem depois do DELETE e nunca podem impedir a remoção da etapa.
 */
export const deletePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeletePipelineStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);

    const { data: stage, error: stageError } = await sb
      .from("pipeline_stages")
      .select("id, pipeline_id, position, created_at")
      .eq("id", data.stageId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (stageError) throw new Error(stageError.message);
    if (!stage) throw new Error("Etapa não encontrada.");

    const target = stage as OrderedStage & { pipeline_id: string };
    const pipelineId = target.pipeline_id;

    const { data: pipelineStages, error: siblingsError } = await sb
      .from("pipeline_stages")
      .select("id, position, created_at")
      .eq("pipeline_id", pipelineId)
      .eq("workspace_id", workspaceId);
    if (siblingsError) throw new Error(siblingsError.message);

    const orderedStages = orderPipelineStagesForDeletion(
      (pipelineStages ?? []) as OrderedStage[],
    );
    if (orderedStages.length <= 1) {
      throw new Error("Não é possível excluir a última etapa do funil.");
    }

    const entryStage = orderedStages[0];
    if (entryStage?.id === data.stageId) {
      throw new Error("A etapa de entrada de lead não pode ser excluída.");
    }

    const targetIndex = orderedStages.findIndex((item) => item.id === data.stageId);
    if (targetIndex < 0) throw new Error("Etapa não encontrada no funil.");

    const remainingStages = orderedStages.filter((item) => item.id !== data.stageId);
    const requestedFallback = data.fallbackStageId
      ? remainingStages.find((item) => item.id === data.fallbackStageId)?.id
      : undefined;
    const fallback =
      requestedFallback ??
      orderedStages[targetIndex - 1]?.id ??
      orderedStages[targetIndex + 1]?.id ??
      remainingStages[0].id;

    const { data: affectedRows, error: affectedError } = await sb
      .from("leads")
      .select("id, stage_id")
      .eq("stage_id", data.stageId)
      .eq("workspace_id", workspaceId);
    if (affectedError) throw new Error(affectedError.message);
    const affected = (affectedRows ?? []) as Array<{ id: string; stage_id: string | null }>;

    const { error: moveError } = await sb
      .from("leads")
      .update({
        stage_id: fallback,
        pipeline_id: pipelineId,
        updated_at: new Date().toISOString(),
      })
      .eq("stage_id", data.stageId)
      .eq("workspace_id", workspaceId);
    if (moveError) throw new Error(moveError.message);

    // Automações da etapa antiga não devem sobreviver à etapa apagada.
    const { error: automationDeleteError } = await sb
      .from("crm_stage_automations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("pipeline_id", pipelineId)
      .eq("stage_id", data.stageId);
    if (automationDeleteError) {
      console.error("[crm-stage-delete] automation cleanup", automationDeleteError);
    }

    const { data: deletedStage, error: deleteError } = await sb
      .from("pipeline_stages")
      .delete()
      .eq("id", data.stageId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .maybeSingle();
    if (deleteError) throw new Error(deleteError.message);
    if (!deletedStage) {
      throw new Error("A etapa não foi excluída. Atualize o funil e tente novamente.");
    }

    // Repara posições antigas duplicadas no mesmo funil sem voltar a bloquear o delete.
    for (const [index, remaining] of remainingStages.entries()) {
      const expectedPosition = index + 1;
      if (Number(remaining.position ?? 0) === expectedPosition) continue;
      const { error: reorderError } = await sb
        .from("pipeline_stages")
        .update({ position: expectedPosition })
        .eq("id", remaining.id)
        .eq("workspace_id", workspaceId);
      if (reorderError) {
        console.error("[crm-stage-delete] position repair", remaining.id, reorderError);
      }
    }

    if (affected.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
        for (const lead of affected) {
          try {
            await dispatchCrmStageMoved(supabaseAdmin as never, {
              workspaceId,
              leadId: lead.id,
              newStageId: fallback,
              newPipelineId: pipelineId,
              fromStageId: lead.stage_id,
            });
          } catch (error) {
            console.error("[crm-stage-delete] post-delete dispatch", lead.id, error);
          }
        }
      } catch (error) {
        console.error("[crm-stage-delete] post-delete dispatcher unavailable", error);
      }
    }

    return { ok: true, movedTo: fallback, deletedStageId: data.stageId };
  });
