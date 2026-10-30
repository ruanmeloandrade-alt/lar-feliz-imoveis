type AnySb = { from: (table: string) => any };

type BlockRow = {
  id: string;
  local_id: string | null;
  type: string;
  config: Record<string, unknown> | null;
  next_block_id: string | null;
};

async function workflowTarget(sb: AnySb, workspaceId: string) {
  const { data: pipelines, error } = await sb
    .from("workflow_pipelines")
    .select("id,name,is_default,position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  const pipeline = (pipelines ?? []).find((p: { is_default?: boolean }) => p.is_default) ?? pipelines?.[0];
  if (!pipeline?.id) throw new Error("Fluxo de trabalho da Vanessa Simoni não encontrado.");

  const { data: stages, error: stageError } = await sb
    .from("workflow_stages")
    .select("id,name,position")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });
  if (stageError) throw new Error(stageError.message);
  const stage =
    (stages ?? []).find((s: { name: string }) => s.name.trim().toLowerCase() === "em fila") ??
    stages?.[0];
  if (!stage?.id) throw new Error("Etapa do Fluxo de trabalho da Vanessa Simoni não encontrada.");

  return {
    pipelineId: String(pipeline.id),
    pipelineName: String(pipeline.name),
    stageId: String(stage.id),
    stageName: String(stage.name),
  };
}

async function patchTaskBlocks(sb: AnySb, workspaceId: string) {
  const target = await workflowTarget(sb, workspaceId);
  const { data: bots, error } = await sb
    .from("salesbots")
    .select("id,local_id")
    .eq("workspace_id", workspaceId)
    .like("local_id", "mkton-%");
  if (error) throw new Error(error.message);
  const botIds = (bots ?? []).map((b: { id: string }) => b.id);
  if (!botIds.length) return { patched: 0, target };

  const { data: blocks, error: blockError } = await sb
    .from("salesbot_blocks")
    .select("id,local_id,type,config,next_block_id")
    .eq("workspace_id", workspaceId)
    .in("salesbot_id", botIds);
  if (blockError) throw new Error(blockError.message);

  let patched = 0;
  for (const row of (blocks ?? []) as BlockRow[]) {
    if (row.type !== "acao") continue;
    const cfg = { ...(row.config ?? {}) };
    if (cfg.acaoTipo !== "tarefa") continue;
    const next = {
      ...cfg,
      tarefaWorkflowPipelineId: target.pipelineId,
      tarefaWorkflowPipelineNome: target.pipelineName,
      tarefaWorkflowStageId: target.stageId,
      tarefaWorkflowStageNome: target.stageName,
    };
    const { error: updateError } = await sb
      .from("salesbot_blocks")
      .update({ config: next })
      .eq("id", row.id)
      .eq("workspace_id", workspaceId);
    if (updateError) throw new Error(updateError.message);
    patched += 1;
  }
  return { patched, target };
}

async function patchReactivationCadence(sb: AnySb, workspaceId: string) {
  const { data: bot, error } = await sb
    .from("salesbots")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("local_id", "mkton-reactivation-entry")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!bot?.id) return { patched: 0, totalDays: 0 };

  // 12 esperas entre mensagens + espera final = 540 dias (~17,7 meses).
  // Assim a sequência inteira, e não apenas parte dela, respeita o limite
  // operacional aproximado de 18 meses definido para a reativação.
  const waits = [15, 30, 30, 30, 30, 45, 45, 45, 45, 60, 60, 60, 45] as const;
  let patched = 0;

  for (let i = 0; i < 12; i += 1) {
    const localId = `react-wait-${i + 1}`;
    const { data: row, error: findError } = await sb
      .from("salesbot_blocks")
      .select("id,config")
      .eq("salesbot_id", bot.id)
      .eq("local_id", localId)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!row?.id) continue;
    const config = { ...(row.config ?? {}) } as Record<string, unknown>;
    const pausas = Array.isArray(config.pausas) ? [...config.pausas] : [];
    if (pausas[0] && typeof pausas[0] === "object") {
      pausas[0] = { ...(pausas[0] as object), dias: waits[i] };
    }
    config.pausas = pausas;
    const { error: updateError } = await sb
      .from("salesbot_blocks")
      .update({ config })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    patched += 1;
  }

  const { data: finalRow, error: finalError } = await sb
    .from("salesbot_blocks")
    .select("id,config")
    .eq("salesbot_id", bot.id)
    .eq("local_id", "react-final-wait")
    .maybeSingle();
  if (finalError) throw new Error(finalError.message);
  if (finalRow?.id) {
    const config = { ...(finalRow.config ?? {}) } as Record<string, unknown>;
    const pausas = Array.isArray(config.pausas) ? [...config.pausas] : [];
    if (pausas[0] && typeof pausas[0] === "object") {
      pausas[0] = { ...(pausas[0] as object), dias: waits[12] };
    }
    config.pausas = pausas;
    const { error: updateError } = await sb
      .from("salesbot_blocks")
      .update({ config })
      .eq("id", finalRow.id);
    if (updateError) throw new Error(updateError.message);
    patched += 1;
  }

  return { patched, totalDays: waits.reduce((sum, days) => sum + days, 0) };
}

async function patchSocialRegistrationStart(sb: AnySb, workspaceId: string) {
  const { data: bot, error } = await sb
    .from("salesbots")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("local_id", "mkton-social-registered")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!bot?.id) return { patched: 0 };

  const { data: blocks, error: blockError } = await sb
    .from("salesbot_blocks")
    .select("id,local_id,config")
    .eq("salesbot_id", bot.id);
  if (blockError) throw new Error(blockError.message);
  let patched = 0;
  for (const row of blocks ?? []) {
    const cfg = { ...(row.config ?? {}) };
    const shouldStart = row.local_id === "sr-tag";
    if (cfg.isStartBlock === shouldStart) continue;
    cfg.isStartBlock = shouldStart;
    const { error: updateError } = await sb
      .from("salesbot_blocks")
      .update({ config: cfg })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    patched += 1;
  }
  return { patched };
}

export async function auditAndCorrectMktonFullOperation(input: {
  sb: AnySb;
  workspaceId: string;
}) {
  const tasks = await patchTaskBlocks(input.sb, input.workspaceId);
  const reactivation = await patchReactivationCadence(input.sb, input.workspaceId);
  const social = await patchSocialRegistrationStart(input.sb, input.workspaceId);
  return { tasks, reactivation, social };
}
