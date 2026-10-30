type AnySb = { from: (table: string) => any };

type StageRef = { id: string; name: string; pipeline_id: string };
type PipelineRef = { id: string; name: string };

async function pipelineByName(sb: AnySb, workspaceId: string, name: string) {
  const { data, error } = await sb
    .from("pipelines")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PipelineRef | null;
}

async function stagesFor(sb: AnySb, workspaceId: string, pipelineId: string) {
  const { data, error } = await sb
    .from("pipeline_stages")
    .select("id,name,pipeline_id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipelineId);
  if (error) throw new Error(error.message);
  return (data ?? []) as StageRef[];
}

async function moveLead(
  sb: AnySb,
  input: {
    workspaceId: string;
    leadId: string;
    fromStageId: string | null;
    pipeline: PipelineRef;
    stage: StageRef;
  },
) {
  let query = sb
    .from("leads")
    .update({
      pipeline_id: input.pipeline.id,
      stage_id: input.stage.id,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.leadId);
  query = input.fromStageId ? query.eq("stage_id", input.fromStageId) : query.is("stage_id", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return false;

  const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
  await dispatchCrmStageMoved(sb as never, {
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    newStageId: input.stage.id,
    newPipelineId: input.pipeline.id,
    fromStageId: input.fromStageId,
  });
  return true;
}

export async function syncMktonSubscriptionsToCrm(input: {
  sb: AnySb;
  workspaceId: string;
}) {
  const { sb, workspaceId } = input;
  const cadastro = await pipelineByName(sb, workspaceId, "Cadastro");
  const postSale = await pipelineByName(sb, workspaceId, "Pós-venda");
  if (!cadastro || !postSale) return { scanned: 0, moved: 0, reason: "funnels_missing" };

  const cadastroStages = await stagesFor(sb, workspaceId, cadastro.id);
  const postStages = await stagesFor(sb, workspaceId, postSale.id);
  const signed = cadastroStages.find((s) => s.name === "Assinou");
  const standby = postStages.find((s) => s.name === "Standby");
  const renewal = postStages.find((s) => s.name === "Renovação do Plano");
  const renewed = postStages.find((s) => s.name === "Venda Fechada");
  const lost = postStages.find((s) => s.name === "Venda Perdida");
  if (!signed || !standby || !renewal || !renewed || !lost) {
    return { scanned: 0, moved: 0, reason: "stages_missing" };
  }

  const { data: events, error: eventError } = await sb
    .from("tracking_events")
    .select("id,lead_id,props,created_at")
    .eq("workspace_id", workspaceId)
    .eq("event_name", "signup_completed")
    .not("lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (eventError) throw new Error(eventError.message);

  const seenLeads = new Set<string>();
  let moved = 0;
  let scanned = 0;
  const now = Date.now();
  const renewalWindowMs = 15 * 24 * 60 * 60 * 1000;

  for (const event of events ?? []) {
    const leadId = String(event.lead_id ?? "");
    if (!leadId || seenLeads.has(leadId)) continue;
    seenLeads.add(leadId);
    const props = (event.props ?? {}) as Record<string, unknown>;
    const authUserId = typeof props.auth_user_id === "string" ? props.auth_user_id : "";
    if (!authUserId) continue;
    scanned += 1;

    const { data: customerWorkspace, error: wsError } = await sb
      .from("workspaces")
      .select("id")
      .eq("owner_id", authUserId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (wsError) throw new Error(wsError.message);
    if (!customerWorkspace?.id) continue;

    const { data: subscription, error: subError } = await sb
      .from("subscriptions")
      .select("status,plan_id,period,started_at,current_period_end,last_payment_id")
      .eq("workspace_id", customerWorkspace.id)
      .maybeSingle();
    if (subError) throw new Error(subError.message);
    if (!subscription) continue;

    const { data: lead, error: leadError } = await sb
      .from("leads")
      .select("id,pipeline_id,stage_id")
      .eq("workspace_id", workspaceId)
      .eq("id", leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) continue;

    const status = String(subscription.status ?? "").toLowerCase();
    const endAt = subscription.current_period_end
      ? new Date(subscription.current_period_end).getTime()
      : Number.NaN;
    const daysToEnd = Number.isFinite(endAt) ? endAt - now : Number.POSITIVE_INFINITY;

    // Pagamento confirmado: qualquer lead atribuído àquele cadastro que ainda
    // esteja em uma jornada pré-venda (Cadastro, Reativação, Social etc.) entra
    // em Assinou. Só preservamos quem já está no Pós-venda, pois ali a assinatura
    // já foi absorvida pela jornada de cliente.
    if (
      status === "active" &&
      lead.pipeline_id !== postSale.id &&
      !(lead.pipeline_id === cadastro.id && lead.stage_id === signed.id)
    ) {
      if (
        await moveLead(sb, {
          workspaceId,
          leadId,
          fromStageId: lead.stage_id ?? null,
          pipeline: cadastro,
          stage: signed,
        })
      ) moved += 1;
      continue;
    }

    // Cliente ativo em standby: 15 dias antes do término vai para renovação.
    if (
      status === "active" &&
      lead.pipeline_id === postSale.id &&
      lead.stage_id === standby.id &&
      daysToEnd <= renewalWindowMs
    ) {
      if (
        await moveLead(sb, {
          workspaceId,
          leadId,
          fromStageId: lead.stage_id,
          pipeline: postSale,
          stage: renewal,
        })
      ) moved += 1;
      continue;
    }

    // Se já estava em renovação e o período foi estendido para além de 15 dias,
    // a assinatura foi renovada; a etapa Venda Fechada devolve ao Standby.
    if (
      status === "active" &&
      lead.pipeline_id === postSale.id &&
      lead.stage_id === renewal.id &&
      daysToEnd > renewalWindowMs
    ) {
      if (
        await moveLead(sb, {
          workspaceId,
          leadId,
          fromStageId: lead.stage_id,
          pipeline: postSale,
          stage: renewed,
        })
      ) moved += 1;
      continue;
    }

    // Assinatura deixou de estar ativa e a vigência acabou: venda perdida.
    if (
      status !== "active" &&
      lead.pipeline_id === postSale.id &&
      lead.stage_id === renewal.id &&
      Number.isFinite(endAt) &&
      endAt <= now
    ) {
      if (
        await moveLead(sb, {
          workspaceId,
          leadId,
          fromStageId: lead.stage_id,
          pipeline: postSale,
          stage: lost,
        })
      ) moved += 1;
    }
  }

  return { scanned, moved };
}
