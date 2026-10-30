import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { loadEffectivePermissions } from "@/lib/permissions-core.functions";
import { allowedPipelines } from "@/lib/permissions-core";
import type { AutomationAction } from "@/lib/crm-mock";


/* ----- shared helpers ----- */

type AnySb = {
 from: (t: string) => any;
 rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
 return requireActiveWorkspace(supabase, userId);
}

function encKey() {
 const k = process.env.INTEGRATION_ENCRYPTION_KEY;
 if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
 return k;
}

/* ----- list CRM sources ----- */

export const listCrmSources = createServerFn({ method: "GET" })
.middleware([requireSupabaseAuth])
.handler(async ({ context }) => {
 const sb = context.supabase as unknown as AnySb;
 const wsId = await loadActiveWorkspace(sb, context.userId);
 const { data, error } = await sb
.from("crm_sources")
.select("id, provider, display_name, is_default, external_account_id")
.eq("workspace_id", wsId)
.order("is_default", { ascending: false });
 if (error) throw new Error(error.message);
 return {
 workspaceId: wsId,
 sources: (data?? []) as Array<{
 id: string;
 provider: "mkton" | "rd" | "hubspot";
 display_name: string;
 is_default: boolean;
 external_account_id: string | null;
 }>,
 };
 });

export const createCrmSource = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80) }).parse(d))
.handler(async ({ data, context }) => {
 const sb = context.supabase as unknown as AnySb;
 const wsId = await loadActiveWorkspace(sb, context.userId);
 const name = data.name.trim();
 const { data: existing, error: existingError } = await sb
  .from("crm_sources")
  .select("id")
  .eq("workspace_id", wsId)
  .ilike("display_name", name)
  .maybeSingle();
 if (existingError) throw new Error(existingError.message);
 if (existing) return { sourceId: (existing as { id: string }).id };
 const { data: created, error } = await sb
  .from("crm_sources")
  .insert({ workspace_id: wsId, provider: "mkton", display_name: name, is_default: false })
  .select("id")
  .single();
 if (error) throw new Error(error.message);
 return { sourceId: (created as { id: string }).id };
});

/* ----- list ALL pipelines + stages for the active workspace (picker) ----- */

export const listAllPipelineStages = createServerFn({ method: "GET" })
 .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
   const sb = context.supabase as unknown as AnySb;
   const wsId = await loadActiveWorkspace(sb, context.userId);
   const eff = await loadEffectivePermissions(sb, context.userId, wsId);
   const allowed = allowedPipelines(eff, "crm");
   if (allowed && allowed.length === 0) {
    return { pipelines: [] as Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> };
   }
   let pq = sb
    .from("pipelines")
    .select("id, name, position")
    .eq("workspace_id", wsId)
    .order("position");
   if (allowed) pq = pq.in("id", allowed);
   const { data: pipelines, error: pErr } = await pq;
   if (pErr) throw new Error(pErr.message);
   const pipelineIds = ((pipelines ?? []) as Array<{ id: string }>).map((p) => p.id);
   if (pipelineIds.length === 0) return { pipelines: [] as Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> };

  const { data: stages, error: sErr } = await sb
   .from("pipeline_stages")
   .select("id, pipeline_id, name, position")
   .in("pipeline_id", pipelineIds)
   .order("position");
  if (sErr) throw new Error(sErr.message);
  return {
   pipelines: (pipelines as Array<{ id: string; name: string }>).map((p) => ({
    id: p.id,
    name: p.name,
    stages: ((stages ?? []) as Array<{ id: string; pipeline_id: string; name: string }>)
     .filter((s) => s.pipeline_id === p.id)
     .map((s) => ({ id: s.id, name: s.name })),
   })),
  };
 });



/* ----- list funnels with stages + leads for a source ----- */

const ListFunnelsSchema = z.object({ crmSourceId: z.string().uuid() });

export const listFunnels = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) => ListFunnelsSchema.parse(d))
 .handler(async ({ data, context }) => {
 const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const eff = await loadEffectivePermissions(sb, context.userId, wsId);
  const allowedIds = allowedPipelines(eff, "crm");
  if (allowedIds && allowedIds.length === 0) return { funnels: [] };

 // pivot: funis vinculados a essa fonte
 const { data: links, error: linkErr } = await sb
.from("crm_source_funnels")
.select("pipeline_id")
.eq("workspace_id", wsId)
.eq("crm_source_id", data.crmSourceId);
 if (linkErr) throw new Error(linkErr.message);
 let linkedIds = ((links ?? []) as Array<{ pipeline_id: string }>).map((l) => l.pipeline_id);
 if (allowedIds) linkedIds = linkedIds.filter((id) => allowedIds.includes(id));
 if (linkedIds.length === 0) return { funnels: [] };


 const { data: pipelines, error: pErr } = await sb
.from("pipelines")
.select("id, name, position")
.eq("workspace_id", wsId)
.in("id", linkedIds)
.order("position");
 if (pErr) throw new Error(pErr.message);

 const pipelineIds = (pipelines?? []).map((p: { id: string }) => p.id);
 if (pipelineIds.length === 0) return { funnels: [] };

 const { data: stages } = await sb
.from("pipeline_stages")
.select("id, pipeline_id, name, position, color, description")
.in("pipeline_id", pipelineIds)
.order("position");

 const { data: leads } = await sb
.from("leads")
.select("id, pipeline_id, stage_id, name, value, last_message_from, tags, created_at, company_id, email, phone")
.eq("workspace_id", wsId)
.eq("crm_source_id", data.crmSourceId);

 return {
 funnels: (pipelines as Array<{ id: string; name: string }>).map((p) => ({
 id: p.id,
 name: p.name,
 stages: ((stages?? []) as Array<{ id: string; pipeline_id: string; name: string; color: string | null; description: string | null; position: number }>)
.filter((s) => s.pipeline_id === p.id)
.map((s) => {
 const sLeads = ((leads?? []) as Array<{
 id: string; pipeline_id: string; stage_id: string; name: string; value: number;
 last_message_from: string | null; tags: unknown; created_at: string; company_id: string | null;
 email: string | null; phone: string | null;
 }>).filter((l) => l.stage_id === s.id);
 return {
 id: s.id,
 name: s.name,
  color: s.color,
  description: s.description ?? null,
 status: /ganh|venda/i.test(s.name)? "ganha": /perdid/i.test(s.name)? "perdida": "aberta",
 leads: sLeads.map((l) => ({
 id: l.id,
 name: l.name,
 value: Number(l.value?? 0),
 lastMessageFrom: (l.last_message_from as "lead" | "us" | "none" | null)?? "none",
 companyId: l.company_id,
 createdAt: l.created_at,
 email: l.email,
 phone: l.phone,
 tags: Array.isArray(l.tags)? (l.tags as string[]): [],
 })),
 };
 }),
 })),
 };
 });

/* ----- create funnel + default stages ----- */

const CreateFunnelSchema = z.object({
 crmSourceId: z.string().uuid(),
 name: z.string().min(1).max(80),
});

export const createFunnel = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) => CreateFunnelSchema.parse(d))
 .handler(async ({ data, context }) => {
 const sb = context.supabase as unknown as AnySb;
 const wsId = await loadActiveWorkspace(sb, context.userId);
 const { data: created, error } = await sb
.from("pipelines")
.insert({ workspace_id: wsId, crm_source_id: data.crmSourceId, name: data.name, position: 0 })
.select("id")
.single();
 if (error) throw new Error(error.message);
 const pipelineId = (created as { id: string }).id;

 // vincula funil à fonte no pivot (many-to-many)
 await sb
.from("crm_source_funnels")
.insert({ workspace_id: wsId, crm_source_id: data.crmSourceId, pipeline_id: pipelineId });

 const defaultStages = [
 { name: "Novo lead", position: 1, color: "#3b82f6" },
 { name: "Em contato", position: 2, color: "#8b5cf6" },
 { name: "Qualificação", position: 3, color: "#06b6d4" },
 { name: "Proposta", position: 4, color: "#f59e0b" },
 { name: "Negociação", position: 5, color: "#ef4444" },
 { name: "Venda realizada", position: 6, color: "#10b981" },
 { name: "Perdida", position: 7, color: "#6b7280" },
 ].map((s) => ({...s, pipeline_id: pipelineId, workspace_id: wsId }));
 const { error: sErr } = await sb.from("pipeline_stages").insert(defaultStages);
 if (sErr) throw new Error(sErr.message);
 return { pipelineId };
 });

/* ----- Escopo fonte → funil (many-to-many) ----- */

export const listFunnelSourceIds = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { data: rows, error } = await sb
   .from("crm_source_funnels")
   .select("crm_source_id")
   .eq("workspace_id", wsId)
   .eq("pipeline_id", data.pipelineId);
  if (error) throw new Error(error.message);
  return { sourceIds: ((rows ?? []) as Array<{ crm_source_id: string }>).map((r) => r.crm_source_id) };
 });

export const setFunnelSources = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) =>
  z.object({
   pipelineId: z.string().uuid(),
   crmSourceIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos uma fonte"),
  }).parse(d),
 )
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);

  // valida pipeline no workspace
  const { data: pipe, error: pErr } = await sb
   .from("pipelines")
   .select("id")
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!pipe) throw new Error("Funil não encontrado neste workspace.");

  // valida fontes no workspace
  const { data: srcs, error: sErr } = await sb
   .from("crm_sources")
   .select("id")
   .eq("workspace_id", wsId)
   .in("id", data.crmSourceIds);
  if (sErr) throw new Error(sErr.message);
  const validIds = ((srcs ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (validIds.length === 0) throw new Error("Nenhuma fonte válida.");

  // substitui vínculos
  const { error: delErr } = await sb
   .from("crm_source_funnels")
   .delete()
   .eq("workspace_id", wsId)
   .eq("pipeline_id", data.pipelineId);
  if (delErr) throw new Error(delErr.message);

  const rows = validIds.map((sid) => ({
   workspace_id: wsId,
   crm_source_id: sid,
   pipeline_id: data.pipelineId,
  }));
  const { error: insErr } = await sb.from("crm_source_funnels").insert(rows);
  if (insErr) throw new Error(insErr.message);

  return { ok: true, sourceIds: validIds };
 });

/* ----- CRM source + stage editing ----- */

export const setDefaultCrmSource = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ crmSourceId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);

  const { data: source, error: sourceErr } = await sb
   .from("crm_sources")
   .select("id")
   .eq("id", data.crmSourceId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (sourceErr) throw new Error(sourceErr.message);
  if (!source) throw new Error("CRM não encontrado neste workspace.");

  const { error: clearErr } = await sb
   .from("crm_sources")
   .update({ is_default: false })
   .eq("workspace_id", wsId);
  if (clearErr) throw new Error(clearErr.message);

  const { error: setErr } = await sb
   .from("crm_sources")
   .update({ is_default: true })
   .eq("id", data.crmSourceId)
   .eq("workspace_id", wsId);
  if (setErr) throw new Error(setErr.message);

  return { ok: true };
 });

export const renamePipeline = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  pipelineId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { error } = await sb
   .from("pipelines")
   .update({ name: data.name, updated_at: new Date().toISOString() })
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId);
  if (error) throw new Error(error.message);
  return { ok: true };
 });

/** Reordena os funis do workspace. A ordem vale para o CRM e para o menu lateral,
 *  que já lê `pipelines.position`. */
export const reorderFunnels = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  pipelineIds: z.array(z.string().uuid()).min(1),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);

  const { data: owned, error: ownErr } = await sb
   .from("pipelines")
   .select("id")
   .eq("workspace_id", wsId)
   .in("id", data.pipelineIds);
  if (ownErr) throw new Error(ownErr.message);
  const validIds = new Set(((owned ?? []) as Array<{ id: string }>).map((p) => p.id));
  const ordered = data.pipelineIds.filter((id) => validIds.has(id));
  if (ordered.length === 0) throw new Error("Nenhum funil válido neste workspace.");

  const now = new Date().toISOString();
  for (let i = 0; i < ordered.length; i++) {
   const { error } = await sb
    .from("pipelines")
    .update({ position: i, updated_at: now })
    .eq("id", ordered[i])
    .eq("workspace_id", wsId);
   if (error) throw new Error(error.message);
  }
  return { ok: true };
 });


export const updatePipelineStage = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  stageId: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const patch: Record<string, string | null> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.color !== undefined) patch.color = data.color;
  if (data.description !== undefined) patch.description = data.description && data.description.length > 0 ? data.description : null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data: stage, error: stageErr } = await sb
   .from("pipeline_stages")
   .select("id, pipeline_id")
   .eq("id", data.stageId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (stageErr) throw new Error(stageErr.message);
  if (!stage) throw new Error("Etapa não encontrada neste workspace.");
  const { data: pipeline } = await sb
   .from("pipelines")
   .select("crm_source_id")
   .eq("id", (stage as { pipeline_id: string }).pipeline_id)
   .eq("workspace_id", wsId)
   .maybeSingle();
  const { data: source } = await sb
   .from("crm_sources")
   .select("provider")
   .eq("id", (pipeline as { crm_source_id?: string } | null)?.crm_source_id ?? "")
   .eq("workspace_id", wsId)
   .maybeSingle();
  const provider = (source as { provider?: string } | null)?.provider;
  

  const { error } = await sb
   .from("pipeline_stages")
   .update(patch)
   .eq("id", data.stageId)
   .eq("workspace_id", wsId);
  if (error) throw new Error(error.message);
  return { ok: true };
 });

export const reorderPipelineStages = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  pipelineId: z.string().uuid(),
  stageIds: z.array(z.string().uuid()).min(1),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);

  const { data: pipeline, error: pipelineErr } = await sb
   .from("pipelines")
   .select("id, crm_source_id")
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (pipelineErr) throw new Error(pipelineErr.message);
  if (!pipeline) throw new Error("Funil não encontrado neste workspace.");
  const { data: source } = await sb
   .from("crm_sources")
   .select("provider")
   .eq("id", (pipeline as { crm_source_id: string }).crm_source_id)
   .eq("workspace_id", wsId)
   .maybeSingle();
  const provider = (source as { provider?: string } | null)?.provider;
  

  const { data: stages, error: stagesErr } = await sb
   .from("pipeline_stages")
   .select("id")
   .eq("pipeline_id", data.pipelineId)
   .eq("workspace_id", wsId);
  if (stagesErr) throw new Error(stagesErr.message);
  const existingIds = new Set(((stages ?? []) as Array<{ id: string }>).map((s) => s.id));
  if (existingIds.size !== data.stageIds.length || data.stageIds.some((id) => !existingIds.has(id))) {
   throw new Error("A ordem enviada não corresponde às etapas do funil.");
  }

  for (const [idx, stageId] of data.stageIds.entries()) {
   const { error } = await sb
    .from("pipeline_stages")
    .update({ position: idx + 1 })
    .eq("id", stageId)
    .eq("workspace_id", wsId);
   if (error) throw new Error(error.message);
  }
  return { ok: true };
  });


/** Duplica uma pipeline inteira: etapas, bots vinculados e gatilhos (exceto leads). */
export const duplicatePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    // 1. Carregar pipeline original
    const { data: sourcePipe, error: pipeErr } = await sb
      .from("pipelines")
      .select("*")
      .eq("id", data.pipelineId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (pipeErr) throw new Error(pipeErr.message);
    if (!sourcePipe) throw new Error("Funil não encontrado.");

    // 2. Criar nova pipeline
    const { data: newPipe, error: insPipeErr } = await sb
      .from("pipelines")
      .insert({
        workspace_id: wsId,
        crm_source_id: (sourcePipe as any).crm_source_id,
        name: data.name,
        position: (sourcePipe as any).position + 1,
      })
      .select("id")
      .single();
    if (insPipeErr) throw new Error(insPipeErr.message);
    const newPipeId = (newPipe as { id: string }).id;

    // 3. Vincular às mesmas fontes de CRM (pivot)
    const { data: sourceLinks } = await sb
      .from("crm_source_funnels")
      .select("crm_source_id")
      .eq("workspace_id", wsId)
      .eq("pipeline_id", data.pipelineId);
    
    if (sourceLinks && sourceLinks.length > 0) {
      const linkRows = (sourceLinks as any[]).map(l => ({
        workspace_id: wsId,
        crm_source_id: l.crm_source_id,
        pipeline_id: newPipeId,
      }));
      await sb.from("crm_source_funnels").insert(linkRows);
    }

    // 4. Duplicar etapas e gatilhos
    const { data: stages } = await sb
      .from("pipeline_stages")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("pipeline_id", data.pipelineId)
      .order("position");

    if (stages && stages.length > 0) {
      for (const stage of stages as any[]) {
        const { data: newStage, error: stageErr } = await sb
          .from("pipeline_stages")
          .insert({
            workspace_id: wsId,
            pipeline_id: newPipeId,
            name: stage.name,
            position: stage.position,
            color: stage.color,
            description: stage.description,
          })
          .select("id")
          .single();
        
        if (stageErr) continue;
        const newStageId = (newStage as { id: string }).id;

        // 5. Duplicar automações da etapa (Gatilhos)
        const { data: automations } = await sb
          .from("crm_stage_automations")
          .select("action_id, action, enabled, position")
          .eq("workspace_id", wsId)
          .eq("pipeline_id", data.pipelineId)
          .eq("stage_id", stage.id)
          .order("position");
        
        if (automations && automations.length > 0) {
          const autoRows = (automations as any[]).map(a => ({
            workspace_id: wsId,
            pipeline_id: newPipeId,
            stage_id: newStageId,
            action_id: a.action_id,
            action: a.action,
            enabled: a.enabled !== false,
            position: a.position ?? 0,
          }));
          const { error: autoErr } = await sb.from("crm_stage_automations").insert(autoRows);
          if (autoErr) throw new Error(autoErr.message);
        }
      }
    }

    return { id: newPipeId };
  });

export const createPipelineStage = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  pipelineId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { data: pipeline, error: pErr } = await sb
   .from("pipelines")
   .select("id, crm_source_id")
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!pipeline) throw new Error("Funil não encontrado neste workspace.");
  const { data: source } = await sb
   .from("crm_sources")
   .select("provider")
   .eq("id", (pipeline as { crm_source_id: string }).crm_source_id)
   .eq("workspace_id", wsId)
   .maybeSingle();
  const provider = (source as { provider?: string } | null)?.provider;
  

  const { data: stages } = await sb
   .from("pipeline_stages")
   .select("position")
   .eq("pipeline_id", data.pipelineId)
   .eq("workspace_id", wsId);
  const maxPos = ((stages ?? []) as Array<{ position: number | null }>).reduce(
   (acc, s) => Math.max(acc, Number(s.position ?? 0)), 0,
  );
  // Nova etapa entra ANTES da última (perdida/venda), pra manter fechamento no final.
  const nextPos = Math.max(1, maxPos);
  const { data: created, error } = await sb
   .from("pipeline_stages")
   .insert({
    pipeline_id: data.pipelineId,
    workspace_id: wsId,
    name: data.name,
    position: nextPos,
    color: data.color ?? "#3b82f6",
   })
   .select("id")
   .single();
  if (error) throw new Error(error.message);
  return { stageId: (created as { id: string }).id };
 });

export const deletePipelineStage = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  stageId: z.string().uuid(),
  fallbackStageId: z.string().uuid().optional(),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);

  const { data: stage, error: sErr } = await sb
   .from("pipeline_stages")
   .select("id, pipeline_id, position")
   .eq("id", data.stageId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!stage) throw new Error("Etapa não encontrada.");
  const pipelineId = (stage as { pipeline_id: string }).pipeline_id;
  const pos = Number((stage as { position: number | null }).position ?? 0);
  if (pos <= 1) throw new Error("A etapa de entrada de lead não pode ser excluída.");

  const { data: pipeline } = await sb
   .from("pipelines")
   .select("crm_source_id")
   .eq("id", pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  const { data: source } = await sb
   .from("crm_sources")
   .select("provider")
   .eq("id", (pipeline as { crm_source_id?: string } | null)?.crm_source_id ?? "")
   .eq("workspace_id", wsId)
   .maybeSingle();
  const provider = (source as { provider?: string } | null)?.provider;
  

  // Precisa haver ao menos uma outra etapa pra receber os leads.
  const { data: siblings } = await sb
   .from("pipeline_stages")
   .select("id, position")
   .eq("pipeline_id", pipelineId)
   .eq("workspace_id", wsId)
   .neq("id", data.stageId)
   .order("position", { ascending: true });
  const others = (siblings ?? []) as Array<{ id: string; position: number | null }>;
  if (others.length === 0) throw new Error("Não é possível excluir a última etapa do funil.");
  const fallback =
   (data.fallbackStageId && others.find((s) => s.id === data.fallbackStageId)?.id) ??
   others[0].id;

  const { data: affectedRows, error: affectedErr } = await sb
   .from("leads")
   .select("id, stage_id")
   .eq("stage_id", data.stageId)
   .eq("workspace_id", wsId);
  if (affectedErr) throw new Error(affectedErr.message);
  const affected = (affectedRows ?? []) as Array<{ id: string; stage_id: string | null }>;

  const { error: moveErr } = await sb
   .from("leads")
   .update({ stage_id: fallback, pipeline_id: pipelineId, updated_at: new Date().toISOString() })
   .eq("stage_id", data.stageId)
   .eq("workspace_id", wsId);
  if (moveErr) throw new Error(moveErr.message);

  if (affected.length > 0) {
   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
   const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
   for (const lead of affected) {
    await dispatchCrmStageMoved(supabaseAdmin as never, {
     workspaceId: wsId,
     leadId: lead.id,
     newStageId: fallback,
     newPipelineId: pipelineId,
     fromStageId: lead.stage_id,
    });
   }
  }

  const { error: delErr } = await sb
   .from("pipeline_stages")
   .delete()
   .eq("id", data.stageId)
   .eq("workspace_id", wsId);
  if (delErr) throw new Error(delErr.message);
  return { ok: true, movedTo: fallback };
 });


export const deletePipeline = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);

  const { data: pipeline, error: pErr } = await sb
   .from("pipelines")
   .select("id")
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!pipeline) throw new Error("Funil não encontrado neste workspace.");

  const { count: total, error: cErr } = await sb
   .from("pipelines")
   .select("id", { count: "exact", head: true })
   .eq("workspace_id", wsId);
  if (cErr) throw new Error(cErr.message);
  if ((total ?? 0) <= 1) throw new Error("Você precisa ter pelo menos um funil.");

  const { count: leadCount, error: lErr } = await sb
   .from("leads")
   .select("id", { count: "exact", head: true })
   .eq("workspace_id", wsId)
   .eq("pipeline_id", data.pipelineId);
  if (lErr) throw new Error(lErr.message);
  if ((leadCount ?? 0) > 0) {
   throw new Error(
    `Este funil ainda tem ${leadCount} lead(s). Mova esses leads para outro funil ou exclua-os antes de apagar o funil.`,
   );
  }

  await sb.from("crm_stage_automations").delete().eq("workspace_id", wsId).eq("pipeline_id", data.pipelineId);
  await sb.from("pipeline_stages").delete().eq("workspace_id", wsId).eq("pipeline_id", data.pipelineId);
  const { error: delErr } = await sb
   .from("pipelines")
   .delete()
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId);
  if (delErr) throw new Error(delErr.message);
  return { ok: true };
 });



export const listStageAutomations = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { data: pipeline, error: pipelineErr } = await sb
   .from("pipelines")
   .select("id")
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (pipelineErr) throw new Error(pipelineErr.message);
  if (!pipeline) throw new Error("Funil não encontrado neste workspace.");

  const { data: rows, error } = await sb
   .from("crm_stage_automations")
   .select("stage_id, action, enabled, position")
   .eq("workspace_id", wsId)
   .eq("pipeline_id", data.pipelineId)
   .order("stage_id")
   .order("position");
  if (error) throw new Error(error.message);
  const automations: Record<string, AutomationAction[]> = {};
  for (const row of (rows ?? []) as Array<{ stage_id: string; action: unknown; enabled: boolean | null }>) {
   const action = row.action as AutomationAction;
   if (!action?.id) continue;
   (automations[row.stage_id] ??= []).push({ ...action, enabled: row.enabled !== false });
  }
  return { automations };
 });

export const saveStageAutomations = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  pipelineId: z.string().uuid(),
  automations: z.record(z.string(), z.array(z.unknown())),
  applyRequestId: z.string().uuid().optional(),
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { data: pipeline, error: pipelineErr } = await sb
   .from("pipelines")
   .select("id")
   .eq("id", data.pipelineId)
   .eq("workspace_id", wsId)
   .maybeSingle();
  if (pipelineErr) throw new Error(pipelineErr.message);
  if (!pipeline) throw new Error("Funil não encontrado neste workspace.");

  const persistedAutomations = Object.fromEntries(Object.entries(data.automations).map(([stageId,list])=>[stageId,list.map(raw=>{const action=raw as AutomationAction;return {...action,...(action.execution?{execution:{...action.execution,applyToExisting:false}}:{}),applyToExisting:false};})]));
  const { data: count, error } = await sb.rpc("replace_crm_stage_automations", {
   _pipeline_id: data.pipelineId,
   _automations: persistedAutomations,
  });
  if (error) throw new Error(error.message ?? "Falha ao salvar automações.");

  // Backfill: ações marcadas com "aplicar aos leads já nesta etapa" são
  // enfileiradas no servidor para todos os leads que já estão nas etapas cobertas.
  let backfilled = 0;
  try {
   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
   const { backfillAutomationAction, scheduleStageTimerActions } = await import("@/lib/stage-automation-engine.server");
   await scheduleStageTimerActions(supabaseAdmin as never,true,{workspaceId:wsId,pipelineId:data.pipelineId});
   const done = new Set<string>();
   for (const [stageId, list] of Object.entries(data.automations)) {
    for (const raw of (list ?? []) as Array<Record<string, unknown>>) {
     const action = raw as { id?: string; applyToExisting?: boolean; execution?: {applyToExisting?:boolean}; stageIds?: string[]; enabled?: boolean };
     if (!action?.id || !(action.execution?.applyToExisting || action.applyToExisting) || action.enabled === false) continue;
     if (done.has(action.id)) continue;
     done.add(action.id);
     const stageIds = action.stageIds && action.stageIds.length > 0 ? action.stageIds : [stageId];
     const r = await backfillAutomationAction(supabaseAdmin as never, {
      workspaceId: wsId,
      pipelineId: data.pipelineId,
      action: raw as never,
      stageIds,
      requestId: data.applyRequestId,
     });
     backfilled += r.queued;
    }
   }
  } catch (e) {
   throw new Error(`As configurações foram gravadas, mas a aplicação aos leads falhou: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { ok: true, count: Number(count ?? 0), backfilled };
 });


export const backfillAutomationAction = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({
  pipelineId: z.string().uuid(),
  action: z.any(),
  stageIds: z.array(z.string().uuid())
 }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
 // SLIM_STAGE_OPERATOR_GUARD_backfillAutomationAction
 const {assertSlimOperator}=await import("@/lib/slim-workspace-operator.server");
 await assertSlimOperator(context.supabase,wsId,context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { backfillAutomationAction: backfill } = await import("@/lib/stage-automation-engine.server");
  return backfill(supabaseAdmin as never, {
   workspaceId: wsId,
   pipelineId: data.pipelineId,
   action: data.action,
   stageIds: data.stageIds,
  });
 });

/* ----- create lead ----- */


const CreateLeadSchema = z.object({
 crmSourceId: z.string().uuid(),
 pipelineId: z.string().uuid(),
 stageId: z.string().uuid(),
 name: z.string().min(1).max(120),
 email: z.string().email().optional().or(z.literal("")),
 phone: z.string().optional(),
 value: z.number().nonnegative().default(0),
 companyId: z.string().uuid().nullable().optional(),
 instagramHandle: z.string().optional(),
 facebookUrl: z.string().optional(),
 address: z.string().optional(),
});

export const createLead = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) => CreateLeadSchema.parse(d))
.handler(async ({ data, context }) => {
 const sb = context.supabase as unknown as AnySb;
 const wsId = await loadActiveWorkspace(sb, context.userId);
 const { data: ownedSource } = await sb
  .from("crm_sources").select("id").eq("id", data.crmSourceId).eq("workspace_id", wsId).maybeSingle();
 if (!ownedSource) throw new Error("Fonte de CRM não pertence a este workspace.");
 const { data: ownedPipeline } = await sb
  .from("pipelines").select("id").eq("id", data.pipelineId).eq("workspace_id", wsId).maybeSingle();
 if (!ownedPipeline) throw new Error("Funil não pertence a este workspace.");
 const { data: ownedStage } = await sb
  .from("pipeline_stages").select("id").eq("id", data.stageId).eq("pipeline_id", data.pipelineId).eq("workspace_id", wsId).maybeSingle();
 if (!ownedStage) throw new Error("Etapa não pertence ao funil informado neste workspace.");
 if (data.companyId) {
  const { data: ownedCompany } = await sb.from("companies").select("id").eq("id", data.companyId).eq("workspace_id", wsId).maybeSingle();
  if (!ownedCompany) throw new Error("Empresa não pertence a este workspace.");
 }
 const ig = (data.instagramHandle ?? "").trim().replace(/^@/, "");
 const fb = (data.facebookUrl ?? "").trim();
 const custom: Record<string, string> = {};
 if (ig) custom.instagram_handle = ig;
 if (fb) custom.facebook_url = fb;
 const address = (data.address ?? "").trim();
 if (address) custom.address = address;
 const { data: created, error } = await sb
.from("leads")
.insert({
 workspace_id: wsId,
 crm_source_id: data.crmSourceId,
 pipeline_id: data.pipelineId,
 stage_id: data.stageId,
 company_id: data.companyId?? null,
 name: data.name,
 email: data.email || null,
 phone: data.phone || null,
 value: data.value,
 custom_data: custom,
 last_message_from: "us",
 })
.select("id, crm_source_id")
.single();
 if (error) throw new Error(error.message);


 const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
 const { dispatchCrmLeadCreated } = await import("@/lib/crm-event-dispatch.server");
 await dispatchCrmLeadCreated(supabaseAdmin as never, {
  workspaceId: wsId,
  leadId: (created as { id: string }).id,
  pipelineId: data.pipelineId,
  stageId: data.stageId,
 });

  return { leadId: (created as { id: string }).id };
  });


/* ----- move lead between stages ----- */

const MoveLeadSchema = z.object({
 leadId: z.string().uuid(),
 toStageId: z.string().uuid(),
});

export const moveLead = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) => MoveLeadSchema.parse(d))
.handler(async ({ data, context }) => {
 const sb = context.supabase as unknown as AnySb;
 const wsId = await loadActiveWorkspace(sb, context.userId);
 const { data: stage, error: sErr } = await sb
.from("pipeline_stages")
.select("pipeline_id, external_id")
.eq("id", data.toStageId)
 .eq("workspace_id", wsId)
.maybeSingle();
 if (sErr ||!stage) throw new Error(sErr?.message?? "Etapa inválida.");
 const pipelineId = (stage as { pipeline_id: string }).pipeline_id;

 const { data: movedLead } = await sb
.from("leads")
.select("id, company_id, crm_source_id, stage_id, crm_sources(provider)")
.eq("id", data.leadId)
 .eq("workspace_id", wsId)
.maybeSingle();
  if (!movedLead) throw new Error("Lead não encontrado neste workspace.");
 const moved = movedLead as
 | { id: string; company_id: string | null; crm_source_id: string | null; stage_id: string | null; crm_sources: { provider: string } | null }
 | null;

 // Move junto: todos da mesma empresa.
 const ids: string[] = [data.leadId];
 const previousStageByLead = new Map<string, string | null>([[data.leadId, moved?.stage_id ?? null]]);
 if (moved?.company_id) {
 const { data: companions } = await sb
.from("leads")
.select("id, stage_id, crm_sources(provider)")
.eq("workspace_id", wsId)
.eq("company_id", moved.company_id)
.neq("id", data.leadId);
 for (const c of ((companions?? []) as Array<{ id: string; stage_id: string | null }>)) {
 ids.push(c.id);
 previousStageByLead.set(c.id, c.stage_id);
 }
 }

 const { error } = await sb
.from("leads")
.update({
 stage_id: data.toStageId,
 pipeline_id: pipelineId,
 last_message_from: "us",
 updated_at: new Date().toISOString(),
 })
.in("id", ids)
.eq("workspace_id", wsId);
  if (error) throw new Error(error.message);


  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
  let automations: Array<{ actionId: string; title: string; ok: boolean; error?: string; skipped?: boolean }> = [];
  for (const id of ids) {
   const r = await dispatchCrmStageMoved(supabaseAdmin as never, {
    workspaceId: wsId,
    leadId: id,
    newStageId: data.toStageId,
    newPipelineId: pipelineId,
    fromStageId: previousStageByLead.get(id) ?? null,
   });
   if (id === data.leadId) automations = r;
  }

  return { ok: true, movedIds: ids, automations };
  });


/* ----- delete lead ----- */

export const deleteLead = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { error } = await sb.from("leads").delete().eq("id", data.leadId).eq("workspace_id", wsId);
  if (error) throw new Error(error.message);
  return { ok: true };
 });

/* ----- complete all pending tasks for a lead ----- */

export const completeLeadTasks = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { error, count } = await sb
   .from("tasks")
   .update({ status: "concluida" })
   .eq("workspace_id", wsId)
   .eq("lead_id", data.leadId)
   .eq("status", "pendente");
  if (error) throw new Error(error.message);
  return { ok: true, completed: count ?? 0 };
  });

/* ----- delete lead tasks (specific or all pending) ----- */

export const deleteLeadTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      leadId: z.string().uuid(),
      taskId: z.string().uuid().optional(),
      onlyPending: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    let q = sb.from("tasks").delete().eq("workspace_id", wsId).eq("lead_id", data.leadId);
    if (data.taskId) q = q.eq("id", data.taskId);
    if (data.onlyPending) q = q.eq("status", "pendente");
    const { error, count } = await q;
    if (error) throw new Error(error.message);
    return { ok: true, deleted: count ?? 0 };
  });

/* ----- duplicate lead (same stage or another) ----- */

export const duplicateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      leadId: z.string().uuid(),
      toStageId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: orig, error: fErr } = await sb
      .from("leads")
      .select("crm_source_id, pipeline_id, stage_id, company_id, name, email, phone, value, tags, source")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!orig) throw new Error("Lead original não encontrado.");
    const src = orig as {
      crm_source_id: string | null; pipeline_id: string | null; stage_id: string | null;
      company_id: string | null; name: string; email: string | null; phone: string | null;
      value: number | null; tags: string[] | null; source: string | null;
    };
    let stageId = src.stage_id;
    let pipelineId = src.pipeline_id;
    if (data.toStageId) {
      const { data: st } = await sb
        .from("pipeline_stages")
        .select("pipeline_id")
        .eq("id", data.toStageId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (!st) throw new Error("Etapa de destino não pertence a este workspace.");
      stageId = data.toStageId;
      pipelineId = (st as { pipeline_id: string }).pipeline_id;
    }
    const { data: created, error } = await sb.from("leads").insert({
      workspace_id: wsId,
      crm_source_id: src.crm_source_id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      company_id: src.company_id,
      name: `${src.name} (cópia)`,
      email: src.email,
      phone: src.phone,
      value: src.value ?? 0,
      tags: src.tags ?? [],
      source: src.source ?? "outro",
      last_message_from: "us",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const newLeadId = (created as { id: string }).id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchCrmLeadCreated } = await import("@/lib/crm-event-dispatch.server");
    await dispatchCrmLeadCreated(supabaseAdmin as never, {
      workspaceId: wsId,
      leadId: newLeadId,
      pipelineId,
      stageId,
    });
    return { leadId: newLeadId };
  });

/* ----- pause AI agent on a lead ----- */

export const pauseLeadAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error: upErr } = await sb
      .from("leads")
      .update({ ai_paused: true, active_conversation_agent_id: null, updated_at: new Date().toISOString() })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);
    if (upErr) throw new Error(upErr.message);
    await sb.from("lead_activities").insert({
      workspace_id: wsId,
      lead_id: data.leadId,
      type: "ai_paused",
      payload: { by: context.userId },
      occurred_at: new Date().toISOString(),
    });
    return { ok: true };
  });

/* ----- send outbound webhook (server-side: dodges CORS, signs with HMAC) ----- */

export const sendCrmWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      url: z.string().url(),
      method: z.enum(["POST", "PUT"]).default("POST"),
      payload: z.record(z.string(), z.unknown()),
      secret: z.string().optional(),
      headersExtra: z.string().optional(),
      leadId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const body = JSON.stringify(data.payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (data.secret) {
      const { createHmac } = await import("crypto");
      const sig = createHmac("sha256", data.secret).update(body).digest("hex");
      headers["X-MKTOn-Signature"] = `sha256=${sig}`;
    }
    if (data.headersExtra) {
      for (const line of data.headersExtra.split("\n")) {
        const [k, ...v] = line.split(":");
        if (k && v.length) headers[k.trim()] = v.join(":").trim();
      }
    }
    let status = 0; let ok = false; let respText = "";
    try {
      const r = await fetch(data.url, { method: data.method, headers, body });
      status = r.status; ok = r.ok;
      respText = (await r.text()).slice(0, 500);
    } catch (e) {
      respText = e instanceof Error ? e.message : String(e);
    }
    if (data.leadId) {
      await sb.from("lead_activities").insert({
        workspace_id: wsId,
        lead_id: data.leadId,
        type: "webhook_sent",
        payload: { url: data.url, status, ok, response: respText },
        occurred_at: new Date().toISOString(),
      });
    }
    return { ok, status, response: respText };
  });

/* ----- list workspace members (for owner selectors) ----- */

export const listWorkspaceUsers = createServerFn({ method: "GET" })
 .middleware([requireSupabaseAuth])
 .handler(async ({ context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const { data, error } = await sb.rpc("list_workspace_users", { _workspace_id: wsId });
  if (!error && Array.isArray(data)) {
   const rows = data as Array<{ id: string; name: string | null; email: string | null }>;
   return {
    users: rows.map((r) => ({ id: r.id, name: r.name || r.email || "Usuário", email: r.email ?? null })),
   };
  }
  // Fallback: membros + perfis visíveis
  const { data: mems, error: memErr } = await sb
   .from("workspace_members")
   .select("user_id")
   .eq("workspace_id", wsId);
  if (memErr) throw new Error(memErr.message);
  const ids = ((mems ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  const { data: profs } = ids.length
   ? await sb.from("profiles").select("id, display_name, full_name").in("id", ids)
   : { data: [] as Array<{ id: string; display_name: string | null; full_name: string | null }> };
  const byId = new Map<string, { display_name: string | null; full_name: string | null }>(
   ((profs ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null }>).map((p) => [p.id, p]),
  );
  return {
   users: ids.map((id) => ({
    id,
    name: byId.get(id)?.display_name || byId.get(id)?.full_name || "Usuário",
    email: null as string | null,
   })),
  };
 });


/* ----- fontes conectadas para condições de gatilho ----- */

export type ConnectedSourceKind = "whatsapp" | "instagram" | "facebook" | "form" | "webhook" | "other";
export interface ConnectedLeadSource {
  id: string;
  label: string;
  kind: ConnectedSourceKind;
}

export const listConnectedLeadSources = createServerFn({ method: "GET" })
 .middleware([requireSupabaseAuth])
 .handler(async ({ context }) => {
  const sb = context.supabase as unknown as AnySb;
  const wsId = await loadActiveWorkspace(sb, context.userId);
  const out: ConnectedLeadSource[] = [];

  const formatPhone = (phone?: string | null) => {
   const digits = String(phone ?? "").replace(/\D/g, "");
   if (digits.length < 10) return phone?.trim() || "número não identificado";
   const country = digits.length > 11 ? `+${digits.slice(0, digits.length - 11)} ` : digits.length === 11 ? "+55 " : "";
   const local = digits.slice(-11);
   if (local.length === 11) return `${country}(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`.trim();
   return `${country}(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`.trim();
  };

  // WhatsApp, uma entrada por número/sessão conectada, sem expor o provedor técnico.
  try {
   const { data } = await sb
    .from("whatsapp_web_sessions")
    .select("id, instance_id, phone_number, push_name, status, metadata")
    .eq("workspace_id", wsId)
    .eq("status", "conectado");
   for (const s of (data ?? []) as Array<{ id: string; instance_id?: string | null; phone_number?: string | null; push_name?: string | null; metadata?: { deleted?: boolean } | null }>) {
    if (s.metadata?.deleted === true) continue;
    const label = `WhatsApp · ${formatPhone(s.phone_number)}`;
    out.push({ id: `whatsapp:${s.id}`, label, kind: "whatsapp" });
   }
  } catch { /* opcional */ }

  // Instagram / Facebook (Meta)
  try {
   const { data } = await sb
    .from("meta_instagram_accounts")
    .select("id, username")
    .eq("workspace_id", wsId);
   for (const s of (data ?? []) as Array<{ id: string; username?: string | null }>) {
    out.push({ id: `instagram:${s.id}`, label: `Instagram · @${s.username ?? "conta"}`, kind: "instagram" });
   }
  } catch { /* opcional */ }

  // Formulários públicos
  try {
   const { data } = await sb.from("crm_forms").select("id, name").eq("workspace_id", wsId).limit(20);
   const forms = (data ?? []) as Array<{ id: string; name: string }>;
   if (forms.length > 0) {
    out.push({ id: "form:*", label: "Formulário (qualquer)", kind: "form" });
    for (const f of forms) {
     out.push({ id: `form:${f.id}`, label: `Formulário · ${f.name}`, kind: "form" });
    }
   }
  } catch { /* opcional */ }

  return { sources: out };
 });

export const bulkMoveLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => 
    z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(1000),
      targetPipelineId: z.string().uuid(),
      targetStageId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const uniqueIds = Array.from(new Set(data.leadIds));

    const { data: targetStage, error: stageErr } = await sb
      .from("pipeline_stages")
      .select("id, pipeline_id")
      .eq("id", data.targetStageId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (stageErr) throw new Error(stageErr.message);
    if (!targetStage || (targetStage as { pipeline_id: string }).pipeline_id !== data.targetPipelineId) {
      throw new Error("Etapa de destino não pertence ao funil informado neste workspace.");
    }

    const { data: rows, error: leadErr } = await sb
      .from("leads")
      .select("id, stage_id")
      .eq("workspace_id", wsId)
      .in("id", uniqueIds);
    if (leadErr) throw new Error(leadErr.message);
    const leads = (rows ?? []) as Array<{ id: string; stage_id: string | null }>;
    if (leads.length !== uniqueIds.length) throw new Error("Um ou mais leads não pertencem a este workspace.");

    const { error } = await sb
      .from("leads")
      .update({
        pipeline_id: data.targetPipelineId,
        stage_id: data.targetStageId,
        updated_at: new Date().toISOString(),
      })
      .in("id", uniqueIds)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
    for (const lead of leads) {
      await dispatchCrmStageMoved(supabaseAdmin as never, {
        workspaceId: wsId,
        leadId: lead.id,
        newStageId: data.targetStageId,
        newPipelineId: data.targetPipelineId,
        fromStageId: lead.stage_id,
      });
    }
    return { success: true, count: leads.length };
  });
