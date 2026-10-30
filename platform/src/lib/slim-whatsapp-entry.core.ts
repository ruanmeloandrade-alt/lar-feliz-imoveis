import type { ContactDb } from "./slim-contact-identity.core";

export async function resolveSlimWhatsappEntry(db: ContactDb, workspaceId: string) {
  const sources = await db
    .from("crm_sources")
    .select("id,provider,is_default")
    .eq("workspace_id", workspaceId)
    .order("id");
  if (sources.error || !Array.isArray(sources.data))
    throw new Error("Não foi possível consultar o CRM de entrada.");
  const source =
    sources.data.find((s: { is_default?: boolean }) => s.is_default) ??
    sources.data.find((s: { provider?: string }) => s.provider === "mkton") ??
    sources.data[0];
  if (!source) throw new Error("CRM de entrada indisponível.");
  const pipeline = await db
    .from("pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("crm_source_id", source.id)
    .order("position", { ascending: true })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (pipeline.error || !pipeline.data?.id)
    throw new Error("Primeiro funil de entrada indisponível.");
  const stage = await db
    .from("pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.data.id)
    .order("position", { ascending: true })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (stage.error || !stage.data?.id) throw new Error("Primeira etapa de entrada indisponível.");
  return {
    crm_source_id: source.id as string,
    pipeline_id: pipeline.data.id as string,
    stage_id: stage.data.id as string,
  };
}

export type PendingWhatsappCreation = { id: string; sessionId: string };
export async function dispatchSlimRecoveredCreations(
  db: ContactDb,
  workspaceId: string,
  pending: PendingWhatsappCreation[],
  dispatch: (input: {
    workspaceId: string;
    leadId: string;
    pipelineId: string;
    stageId: string;
    eventId: string;
  }) => Promise<unknown>,
) {
  for (const contact of pending) {
    const current = await db
      .from("leads")
      .select("id,source,custom_data,pipeline_id,stage_id,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("id", contact.id)
      .maybeSingle();
    if (current.error) throw new Error("Não foi possível conferir a entrada recuperada.");
    const lead = current.data;
    if (
      !lead ||
      lead.source !== "whatsapp" ||
      lead.custom_data?.whatsapp_session_id !== contact.sessionId ||
      lead.custom_data?.crm_created_dispatched !== false ||
      !lead.pipeline_id ||
      !lead.stage_id
    )
      continue;
    await dispatch({
      workspaceId,
      leadId: lead.id,
      pipelineId: lead.pipeline_id,
      stageId: lead.stage_id,
      eventId: "lead-created:" + lead.id,
    });
    const saved = await db
      .from("leads")
      .update({ custom_data: { ...lead.custom_data, crm_created_dispatched: true } })
      .eq("workspace_id", workspaceId)
      .eq("id", lead.id)
      .eq("updated_at", lead.updated_at);
    if (saved.error)
      throw new Error("Não foi possível confirmar a automação da entrada recuperada.");
  }
}
