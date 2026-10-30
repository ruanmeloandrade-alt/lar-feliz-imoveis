import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";

type AnySb = { from: (table: string) => any };
type StageRef = { id: string; name: string; pipeline_id?: string };
type LocalBlock = {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  nextBlockId?: string | null;
  [key: string]: unknown;
};

type LocalBot = {
  id: string;
  nome: string;
  startBlockId: string;
  gatilhos: Array<Record<string, unknown>>;
  blocks: LocalBlock[];
};

const appOrigin = () => resolvePublicAppUrl();
const signupUrl = () => `${appOrigin()}/auth?mode=signup`;
const INITIAL_LINK_SLUG = "ruanandradenegocios-cadastro-atendimento";
const FOLLOW_LINK_SLUG = "ruanandradenegocios-cadastro-follow";

const FOLLOW_COPY = [
  "Quer retomar? Você testa a Vanessa Simoni por 20 dias e a implementação é gratuita. Cadastro: {{follow_url}}",
  "Se faltou tempo para configurar, deixa essa parte com a gente. 20 dias grátis + implementação gratuita: {{follow_url}}",
  "Se seus leads e follows ainda ficam espalhados, vale testar a Vanessa Simoni na sua operação: {{follow_url}}",
  "A ideia é simples: colocamos a Vanessa Simoni para rodar e você decide usando, não por promessa. Cadastro: {{follow_url}}",
  "Quer ver seu processo funcionando dentro da Vanessa Simoni? A implementação é por nossa conta: {{follow_url}}",
  "Caminho curto: 20 dias grátis, implementação gratuita e CRM rodando na sua realidade. {{follow_url}}",
  "Se a rotina apertou, sem problema. Quando quiser retomar, seu acesso começa aqui: {{follow_url}}",
  "O que mais pesa hoje: perder leads, cobrar follow-up ou ganhar velocidade no atendimento? Se quiser testar: {{follow_url}}",
  "Você ainda pode testar por 20 dias com a implementação feita pela gente: {{follow_url}}",
  "Encerrando meu acompanhamento por aqui. Se quiser retomar, a Vanessa Simoni continua disponível por 20 dias grátis: {{follow_url}}",
] as const;

const FOLLOW_DELAYS = [
  { horas: 3 },
  { horas: 21 },
  { dias: 2 },
  { dias: 3 },
  { dias: 4 },
  { dias: 7 },
  { dias: 10 },
  { dias: 14 },
  { dias: 21 },
] as const;

const FINAL_FOLLOW_GRACE = { dias: 14 } as const;

function branchMap(value: unknown, idMap: Map<string, string>) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const branch = item as Record<string, unknown>;
    const local = typeof branch.nextBlockId === "string" ? branch.nextBlockId : null;
    return { ...branch, nextBlockId: local ? (idMap.get(local) ?? undefined) : undefined };
  });
}

async function upsertSalesbot(sb: AnySb, workspaceId: string, bot: LocalBot) {
  const { data: existing, error: findError } = await sb
    .from("salesbots")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("local_id", bot.id)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  let botId: string;
  if (existing) {
    botId = existing.id as string;
    const { error } = await sb
      .from("salesbots")
      .update({
        name: bot.nome,
        gatilhos: bot.gatilhos,
        scope: "individual",
        is_active: true,
        settings: {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", botId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
  } else {
    const { data: created, error } = await sb
      .from("salesbots")
      .insert({
        workspace_id: workspaceId,
        local_id: bot.id,
        name: bot.nome,
        gatilhos: bot.gatilhos,
        scope: "individual",
        is_active: true,
        settings: {},
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    botId = created.id as string;
  }

  const { data: existingBlocks, error: blocksError } = await sb
    .from("salesbot_blocks")
    .select("id,local_id")
    .eq("salesbot_id", botId);
  if (blocksError) throw new Error(blocksError.message);

  const existingByLocal = new Map<string, string>();
  for (const row of existingBlocks ?? []) {
    if (row.local_id) existingByLocal.set(String(row.local_id), String(row.id));
  }
  const idMap = new Map<string, string>();
  for (const block of bot.blocks) {
    idMap.set(block.id, existingByLocal.get(block.id) ?? crypto.randomUUID());
  }

  const rows = bot.blocks.map((block, index) => {
    const cfg: Record<string, unknown> = { ...block };
    delete cfg.id;
    delete cfg.kind;
    delete cfg.x;
    delete cfg.y;
    delete cfg.nextBlockId;
    cfg.isStartBlock = block.id === bot.startBlockId;
    cfg.pausas = branchMap(cfg.pausas, idMap);
    cfg.condicoes = branchMap(cfg.condicoes, idMap);
    cfg.botoes = branchMap(cfg.botoes, idMap);
    cfg.roleta = branchMap(cfg.roleta, idMap);
    if (typeof cfg.falseNextBlockId === "string")
      cfg.falseNextBlockId = idMap.get(cfg.falseNextBlockId) ?? undefined;

    return {
      id: idMap.get(block.id),
      salesbot_id: botId,
      workspace_id: workspaceId,
      local_id: block.id,
      type: block.kind,
      config: cfg,
      position_x: Math.round(block.x ?? 80),
      position_y: Math.round(block.y ?? index * 180),
      next_block_id: block.nextBlockId ? (idMap.get(block.nextBlockId) ?? null) : null,
    };
  });

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb
      .from("salesbot_blocks")
      .upsert(rows.slice(i, i + 100), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  const keep = new Set(bot.blocks.map((b) => b.id));
  const stale = (existingBlocks ?? [])
    .filter(
      (row: { id: string; local_id: string | null }) => !row.local_id || !keep.has(row.local_id),
    )
    .map((row: { id: string }) => row.id);
  if (stale.length) {
    const { error } = await sb.from("salesbot_blocks").delete().in("id", stale);
    if (error) throw new Error(error.message);
  }

  return { id: botId, name: bot.nome, blocks: rows.length };
}

async function ensureTrackedLink(
  sb: AnySb,
  input: {
    workspaceId: string;
    createdBy: string;
    agentId: string;
    slug: string;
    contextLabel: string;
    linkLabel: string;
    utmContent: string;
  },
) {
  const { data: current, error: findError } = await sb
    .from("tracked_links")
    .select("id,workspace_id,slug")
    .eq("slug", input.slug)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (current && current.workspace_id !== input.workspaceId) {
    throw new Error(`Slug rastreado ${input.slug} já pertence a outro workspace.`);
  }

  const payload = {
    workspace_id: input.workspaceId,
    slug: input.slug,
    target_url: signupUrl(),
    agent_id: input.agentId,
    agent_name: "Júlia Braga",
    context_label: input.contextLabel,
    link_label: input.linkLabel,
    utm_source: "mkton",
    utm_medium: "whatsapp",
    utm_campaign: "cadastro",
    utm_content: input.utmContent,
    created_by: input.createdBy,
    updated_at: new Date().toISOString(),
  };

  if (current) {
    const { error } = await sb.from("tracked_links").update(payload).eq("id", current.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from("tracked_links").insert(payload);
    if (error) throw new Error(error.message);
  }
  return `${appOrigin()}/r/${input.slug}`;
}

async function ensureWorkflowTarget(sb: AnySb, workspaceId: string) {
  const { data: initialPipelines, error } = await sb
    .from("workflow_pipelines")
    .select("id,name,is_default,position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  let pipelines = initialPipelines;

  if (!pipelines?.length) {
    const { data: created, error: createError } = await sb
      .from("workflow_pipelines")
      .insert({ workspace_id: workspaceId, name: "Fluxo do gestor", is_default: true, position: 0 })
      .select("id,name,is_default,position")
      .single();
    if (createError) throw new Error(createError.message);
    pipelines = [created];
    const defaults = [
      {
        name: "Backlog",
        color: "#94a3b8",
        position: 0,
        is_done_stage: false,
        is_incomplete_stage: false,
      },
      {
        name: "Em fila",
        color: "#38bdf8",
        position: 1,
        is_done_stage: false,
        is_incomplete_stage: false,
      },
      {
        name: "Fazendo",
        color: "#f59e0b",
        position: 2,
        is_done_stage: false,
        is_incomplete_stage: false,
      },
      {
        name: "Revisão",
        color: "#a78bfa",
        position: 3,
        is_done_stage: false,
        is_incomplete_stage: false,
      },
      {
        name: "Concluído",
        color: "#22c55e",
        position: 4,
        is_done_stage: true,
        is_incomplete_stage: false,
      },
      {
        name: "Incompleto",
        color: "#ef4444",
        position: 5,
        is_done_stage: false,
        is_incomplete_stage: true,
      },
    ];
    const { error: stageError } = await sb
      .from("workflow_stages")
      .insert(
        defaults.map((stage) => ({ ...stage, workspace_id: workspaceId, pipeline_id: created.id })),
      );
    if (stageError) throw new Error(stageError.message);
  }

  const pipeline = pipelines.find((p: { is_default?: boolean }) => p.is_default) ?? pipelines[0];
  const { data: stages, error: stageError } = await sb
    .from("workflow_stages")
    .select("id,name,position")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });
  if (stageError) throw new Error(stageError.message);
  const stage =
    (stages ?? []).find((s: { name: string }) => s.name.toLowerCase() === "em fila") ?? stages?.[0];
  if (!stage) throw new Error("Fluxo de trabalho sem etapa disponível.");
  return {
    pipelineId: pipeline.id as string,
    pipelineName: pipeline.name as string,
    stageId: stage.id as string,
    stageName: stage.name as string,
  };
}

async function fieldIdByName(sb: AnySb, workspaceId: string, name: string) {
  const { data, error } = await sb
    .from("lead_custom_fields")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error(`Campo obrigatório não encontrado: ${name}`);
  return data.id as string;
}

function pauseRace(
  id: string,
  timer: Record<string, number>,
  timerNext: string,
  messageNext: string,
): LocalBlock {
  return {
    id,
    kind: "pausar",
    pausas: [
      { id: `${id}-timer`, tipo: "cronometro", ...timer, nextBlockId: timerNext },
      { id: `${id}-reply`, tipo: "msg-recebida", nextBlockId: messageNext },
    ],
  };
}

function buildFollowBlocks(input: {
  pipelineId: string;
  followStageId: string;
  cadLostStageId: string;
  statusFieldId: string;
  juliaAgentId: string;
  workflow: { pipelineId: string; pipelineName: string; stageId: string; stageName: string };
  assigneeId: string;
}) {
  const blocks: LocalBlock[] = [
    {
      id: "follow-tag",
      kind: "acao",
      acaoTipo: "tags",
      acaoConfig: "jornada:follow",
      tagsModo: "adicionar",
      nextBlockId: "follow-field",
    },
    {
      id: "follow-field",
      kind: "acao",
      acaoTipo: "definir-campo",
      campoId: input.statusFieldId,
      campoNome: "Jornada · Status",
      campoOrigem: "manual",
      campoValor: "follow",
      nextBlockId: "follow-task",
    },
    {
      id: "follow-task",
      kind: "acao",
      acaoTipo: "tarefa",
      tarefaTitulo: "Ligar para lead sem resposta · Mkton",
      tarefaKind: "tarefa",
      tarefaOffsetMin: 60,
      tarefaDuracaoMin: 20,
      tarefaWorkflowPipelineId: input.workflow.pipelineId,
      tarefaWorkflowPipelineNome: input.workflow.pipelineName,
      tarefaWorkflowStageId: input.workflow.stageId,
      tarefaWorkflowStageNome: input.workflow.stageName,
      tarefaWorkflowAssigneeId: input.assigneeId,
      tarefaWorkflowPriority: "alta",
      tarefaTambemCalendario: false,
      nextBlockId: "follow-msg-1",
    },
  ];

  for (let i = 0; i < FOLLOW_COPY.length; i += 1) {
    const n = i + 1;
    const messageId = `follow-msg-${n}`;
    blocks.push({
      id: messageId,
      kind: "enviar-mensagem",
      texto: FOLLOW_COPY[i].replace("{{follow_url}}", `${appOrigin()}/r/${FOLLOW_LINK_SLUG}`),
      textoDelayMs: 1800,
      nextBlockId: `follow-wait-${n}`,
    });
    if (n < FOLLOW_COPY.length) {
      blocks.push(
        pauseRace(
          `follow-wait-${n}`,
          FOLLOW_DELAYS[i] as Record<string, number>,
          `follow-msg-${n + 1}`,
          "follow-reply-ai",
        ),
      );
    } else {
      blocks.push(
        pauseRace(
          `follow-wait-${n}`,
          FINAL_FOLLOW_GRACE as Record<string, number>,
          "follow-lost-tag",
          "follow-reply-ai",
        ),
      );
    }
  }

  blocks.push(
    {
      id: "follow-reply-ai",
      kind: "iniciar-ia",
      iaAgentId: input.juliaAgentId,
      iaAgentNome: "Júlia Braga · Cadastro Mkton",
      iaMaxTurnos: 0,
      iaMensagemInicial: "Perfeito. Me conta só uma coisa para eu continuar daqui: o que você quer resolver primeiro na sua operação?",
      nextBlockId: "follow-reply-end",
    },
    { id: "follow-reply-end", kind: "encerrar-bot" },
    {
      id: "follow-lost-tag",
      kind: "acao",
      acaoTipo: "tags",
      acaoConfig: "jornada:cad-lost",
      tagsModo: "adicionar",
      nextBlockId: "follow-lost-field",
    },
    {
      id: "follow-lost-field",
      kind: "acao",
      acaoTipo: "definir-campo",
      campoId: input.statusFieldId,
      campoNome: "Jornada · Status",
      campoOrigem: "manual",
      campoValor: "cad_lost",
      nextBlockId: "follow-lost-move",
    },
    {
      id: "follow-lost-move",
      kind: "acao",
      acaoTipo: "mudar-status-lead",
      destinoPipelineId: input.pipelineId,
      destinoPipelineNome: "ADS Entrada | MKTOn",
      destinoStageId: input.cadLostStageId,
      destinoStageNome: "CAD Lost",
      destinoEtapa: "CAD Lost",
      nextBlockId: "follow-end",
    },
    { id: "follow-end", kind: "encerrar-bot" },
  );
  return blocks;
}

export async function provisionMktonLeadEntryAutomation(input: {
  sb: AnySb;
  workspaceId: string;
  userId: string;
  juliaAgentId: string;
  stages: StageRef[];
}) {
  const { sb, workspaceId, userId, juliaAgentId } = input;
  const byName = new Map(input.stages.map((stage) => [stage.name, stage]));
  const reception = byName.get("Recepção de Lead");
  const inService = byName.get("Em Atendimento");
  const follow = byName.get("Follow");
  const registered = byName.get("Cadastro Realizado");
  const cadLost = byName.get("CAD Lost");
  if (!reception || !inService || !follow || !registered || !cadLost) {
    throw new Error("Etapas oficiais de Leads de Entrada incompletas após auditoria.");
  }
  const pipelineId = String(inService.pipeline_id ?? follow.pipeline_id ?? "");
  if (!pipelineId) {
    const { data } = await sb
      .from("pipeline_stages")
      .select("pipeline_id")
      .eq("id", inService.id)
      .maybeSingle();
    if (!data?.pipeline_id) throw new Error("Pipeline de Leads de Entrada não resolvido.");
    inService.pipeline_id = data.pipeline_id;
  }
  const resolvedPipelineId = String(inService.pipeline_id);

  const initialLink = await ensureTrackedLink(sb, {
    workspaceId,
    createdBy: userId,
    agentId: juliaAgentId,
    slug: INITIAL_LINK_SLUG,
    contextLabel: "ADS Entrada | MKTOn · Em Atendimento",
    linkLabel: "Cadastro · Atendimento inicial",
    utmContent: "atendimento-inicial",
  });
  const followLink = await ensureTrackedLink(sb, {
    workspaceId,
    createdBy: userId,
    agentId: juliaAgentId,
    slug: FOLLOW_LINK_SLUG,
    contextLabel: "ADS Entrada | MKTOn · Follow",
    linkLabel: "Cadastro · Follow",
    utmContent: "follow",
  });

  const { data: agentRow, error: agentError } = await sb
    .from("conversation_ai_agents")
    .select("metadata")
    .eq("id", juliaAgentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (agentError) throw new Error(agentError.message);
  const metadata = { ...((agentRow?.metadata ?? {}) as Record<string, unknown>) };
  const settings = { ...((metadata.settings ?? {}) as Record<string, unknown>) };
  settings.links = [
    {
      id: "cadastro-atendimento",
      label: "Cadastro Vanessa Simoni · Atendimento",
      url: initialLink,
      when: "Use quando o lead estiver em Em Atendimento.",
    },
    {
      id: "cadastro-follow",
      label: "Cadastro Vanessa Simoni · Follow",
      url: followLink,
      when: "Use quando o lead estiver em Follow ou quando estiver retomando após uma mensagem de follow-up.",
    },
  ];
  metadata.settings = settings;
  const { error: agentUpdateError } = await sb
    .from("conversation_ai_agents")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", juliaAgentId)
    .eq("workspace_id", workspaceId);
  if (agentUpdateError) throw new Error(agentUpdateError.message);

  const statusFieldId = await fieldIdByName(sb, workspaceId, "Jornada · Status");
  const workflow = await ensureWorkflowTarget(sb, workspaceId);

  const { data: socialPipeline } = await sb
    .from("pipelines")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .ilike("name", "%Redes Sociais%")
    .maybeSingle();
  const { data: socialStage } = socialPipeline?.id
    ? await sb
        .from("pipeline_stages")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .eq("pipeline_id", socialPipeline.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const receptionBot = await upsertSalesbot(sb, workspaceId, {
    id: "mkton-lead-entry-reception",
    nome: "Mkton · Recepção de Lead",
    startBlockId: "reception-tag",
    gatilhos: [
      {
        id: "reception-trigger",
        kind: "movido-etapa",
        pipelineId: resolvedPipelineId,
        pipelineNome: "ADS Entrada | MKTOn",
        stageId: reception.id,
        stageNome: reception.name,
      },
    ],
    blocks: [
      {
        id: "reception-tag",
        kind: "acao",
        acaoTipo: "tags",
        acaoConfig: "jornada:recepcao",
        tagsModo: "adicionar",
        nextBlockId: "reception-field",
      },
      {
        id: "reception-field",
        kind: "acao",
        acaoTipo: "definir-campo",
        campoId: statusFieldId,
        campoNome: "Jornada · Status",
        campoOrigem: "manual",
        campoValor: "recepcao",
        nextBlockId: "reception-route",
      },
      {
        id: "reception-route",
        kind: "condicao",
        condicaoModo: "ou",
        condicoes: [
          { sujeito: "fonte-leads", operador: "igual", valor: "channel:instagram" },
          { sujeito: "fonte-leads", operador: "igual", valor: "channel:messenger" },
          { sujeito: "fonte-leads", operador: "igual", valor: "channel:facebook" },
          { sujeito: "fonte-leads", operador: "igual", valor: "channel:tiktok" },
          { sujeito: "fonte-leads", operador: "igual", valor: "channel:linkedin" },
        ],
        nextBlockId:
          socialPipeline?.id && socialStage?.id ? "reception-social-move" : "reception-end",
        falseNextBlockId: "reception-move",
      },
      ...(socialPipeline?.id && socialStage?.id
        ? [
            {
              id: "reception-social-move",
              kind: "acao",
              acaoTipo: "mudar-status-lead",
              destinoPipelineId: socialPipeline.id,
              destinoPipelineNome: socialPipeline.name,
              destinoStageId: socialStage.id,
              destinoStageNome: socialStage.name,
              destinoEtapa: socialStage.name,
              nextBlockId: "reception-end",
            },
          ]
        : []),
      {
        id: "reception-move",
        kind: "acao",
        acaoTipo: "mudar-status-lead",
        destinoPipelineId: resolvedPipelineId,
        destinoPipelineNome: "ADS Entrada | MKTOn",
        destinoStageId: inService.id,
        destinoStageNome: inService.name,
        destinoEtapa: inService.name,
        nextBlockId: "reception-end",
      },
      { id: "reception-end", kind: "encerrar-bot" },
    ],
  });

  const serviceBot = await upsertSalesbot(sb, workspaceId, {
    id: "mkton-lead-entry-julia",
    nome: "Mkton · Júlia Braga · Atendimento",
    startBlockId: "service-tag",
    gatilhos: [
      {
        id: "service-trigger",
        kind: "movido-etapa",
        pipelineId: resolvedPipelineId,
        pipelineNome: "ADS Entrada | MKTOn",
        stageId: inService.id,
        stageNome: inService.name,
      },
    ],
    blocks: [
      {
        id: "service-tag",
        kind: "acao",
        acaoTipo: "tags",
        acaoConfig: "jornada:atendimento",
        tagsModo: "adicionar",
        nextBlockId: "service-field",
      },
      {
        id: "service-field",
        kind: "acao",
        acaoTipo: "definir-campo",
        campoId: statusFieldId,
        campoNome: "Jornada · Status",
        campoOrigem: "manual",
        campoValor: "em_atendimento",
        nextBlockId: "service-ai",
      },
      {
        id: "service-ai",
        kind: "iniciar-ia",
        iaAgentId: juliaAgentId,
        iaAgentNome: "Júlia Braga · Cadastro Mkton",
        iaMaxTurnos: 0,
        iaMensagemInicial:
          "Oi! Eu sou a Júlia Braga, da Mkton. O que mais pesa hoje no seu comercial: organizar os leads, acompanhar atendimentos ou automatizar o processo?",
        nextBlockId: "service-end",
      },
      { id: "service-end", kind: "encerrar-bot" },
    ],
  });

  const monitorBot = await upsertSalesbot(sb, workspaceId, {
    id: "mkton-lead-entry-40m-monitor",
    nome: "Mkton · Monitor 40 min · Atendimento",
    startBlockId: "monitor-wait",
    gatilhos: [
      {
        id: "monitor-trigger",
        kind: "movido-etapa",
        pipelineId: resolvedPipelineId,
        pipelineNome: "ADS Entrada | MKTOn",
        stageId: inService.id,
        stageNome: inService.name,
      },
    ],
    blocks: [
      pauseRace("monitor-wait", { min: 40 }, "monitor-tag", "monitor-end"),
      {
        id: "monitor-tag",
        kind: "acao",
        acaoTipo: "tags",
        acaoConfig: "jornada:follow",
        tagsModo: "adicionar",
        nextBlockId: "monitor-field",
      },
      {
        id: "monitor-field",
        kind: "acao",
        acaoTipo: "definir-campo",
        campoId: statusFieldId,
        campoNome: "Jornada · Status",
        campoOrigem: "manual",
        campoValor: "follow",
        nextBlockId: "monitor-move",
      },
      {
        id: "monitor-move",
        kind: "acao",
        acaoTipo: "mudar-status-lead",
        destinoPipelineId: resolvedPipelineId,
        destinoPipelineNome: "ADS Entrada | MKTOn",
        destinoStageId: follow.id,
        destinoStageNome: follow.name,
        destinoEtapa: follow.name,
        nextBlockId: "monitor-end",
      },
      { id: "monitor-end", kind: "encerrar-bot" },
    ],
  });

  const followBot = await upsertSalesbot(sb, workspaceId, {
    id: "mkton-lead-entry-follow",
    nome: "Mkton · Follow de Cadastro",
    startBlockId: "follow-tag",
    gatilhos: [
      {
        id: "follow-trigger",
        kind: "movido-etapa",
        pipelineId: resolvedPipelineId,
        pipelineNome: "ADS Entrada | MKTOn",
        stageId: follow.id,
        stageNome: follow.name,
      },
    ],
    blocks: buildFollowBlocks({
      pipelineId: resolvedPipelineId,
      followStageId: follow.id,
      cadLostStageId: cadLost.id,
      statusFieldId,
      juliaAgentId,
      workflow,
      assigneeId: userId,
    }),
  });

  return {
    links: { initial: initialLink, follow: followLink },
    workflow,
    bots: [receptionBot, serviceBot, monitorBot, followBot],
  };
}
