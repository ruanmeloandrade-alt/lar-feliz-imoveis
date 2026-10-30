type AnySb = { from: (table: string) => any };

type Block = {
  id: string;
  kind: string;
  nextBlockId?: string | null;
  [key: string]: unknown;
};

type BotSpec = {
  id: string;
  name: string;
  startBlockId: string;
  blocks: Block[];
};

export const MKTON_MANUAL_PACK_VERSION = "manual-connections-v1";

export const MKTON_MANUAL_BOT_IDS = [
  "mkton-registration-bridge",
  "mkton-cad-lost-bridge",
  "mkton-new-cad",
  "mkton-trial-20d",
  "mkton-offers-close",
  "mkton-signed-bridge",
  "mkton-expired-bridge",
  "mkton-onboarding",
  "mkton-postsale-standby",
  "mkton-renewal",
  "mkton-renewed",
  "mkton-postsale-lost",
  "mkton-reactivation-entry",
  "mkton-reactivation-ai",
  "mkton-reactivation-retire",
  "mkton-social-reception",
  "mkton-social-ai",
  "mkton-social-registered",
  "mkton-social-lost",
  "mkton-affiliate-em-cadastro",
  "mkton-affiliate-cadastrado",
  "mkton-affiliate-primeira-venda",
  "mkton-affiliate-em-progressao",
  "mkton-affiliate-ativo",
] as const;

export const MKTON_MANUAL_AGENT_NAMES = [
  "Júlia Braga · Ativação Mkton",
  "Júlia Braga · Reativação Mkton",
  "Júlia Braga · Redes Sociais Mkton",
] as const;

const tag = (id: string, value: string, next?: string): Block => ({
  id,
  kind: "acao",
  acaoTipo: "tags",
  acaoConfig: value,
  tagsModo: "adicionar",
  nextBlockId: next ?? null,
});

const field = (id: string, name: string, value: string, next?: string): Block => ({
  id,
  kind: "acao",
  acaoTipo: "definir-campo",
  campoNome: name,
  campoOrigem: "manual",
  campoValor: value,
  nextBlockId: next ?? null,
});

const msg = (id: string, text: string, next?: string): Block => ({
  id,
  kind: "enviar-mensagem",
  texto: text,
  textoDelayMs: 1300,
  nextBlockId: next ?? null,
});

const pause = (id: string, timer: Record<string, number>, next: string): Block => ({
  id,
  kind: "pausar",
  pausas: [{ id: `${id}-timer`, tipo: "cronometro", ...timer, nextBlockId: next }],
});

const race = (id: string, timer: Record<string, number>, timerNext: string, replyNext: string): Block => ({
  id,
  kind: "pausar",
  pausas: [
    { id: `${id}-timer`, tipo: "cronometro", ...timer, nextBlockId: timerNext },
    { id: `${id}-reply`, tipo: "msg-recebida", nextBlockId: replyNext },
  ],
});

const task = (id: string, title: string, next?: string): Block => ({
  id,
  kind: "acao",
  acaoTipo: "tarefa",
  tarefaTitulo: title,
  tarefaKind: "tarefa",
  tarefaOffsetMin: 0,
  tarefaDuracaoMin: 20,
  tarefaWorkflowPriority: "alta",
  tarefaTambemCalendario: false,
  nextBlockId: next ?? null,
});

const movePlaceholder = (id: string, label: string, next?: string): Block => ({
  id,
  kind: "acao",
  acaoTipo: "mudar-status-lead",
  destinoEtapa: label,
  manualConnectionRequired: true,
  nextBlockId: next ?? null,
});

const aiPlaceholder = (id: string, agentName: string, opening: string, next?: string): Block => ({
  id,
  kind: "iniciar-ia",
  iaAgentNome: agentName,
  iaMensagemInicial: opening,
  iaMaxTurnos: 0,
  manualConnectionRequired: true,
  nextBlockId: next ?? null,
});

const end = (id: string): Block => ({ id, kind: "encerrar-bot" });

function mapBranches(value: unknown, ids: Map<string, string>) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const branch = item as Record<string, unknown>;
    const next = typeof branch.nextBlockId === "string" ? branch.nextBlockId : null;
    return { ...branch, nextBlockId: next ? ids.get(next) ?? undefined : undefined };
  });
}

async function createBot(sb: AnySb, workspaceId: string, spec: BotSpec) {
  const { data: bot, error: botError } = await sb
    .from("salesbots")
    .insert({
      workspace_id: workspaceId,
      local_id: spec.id,
      name: spec.name,
      gatilhos: [],
      scope: "individual",
      is_active: false,
      settings: { manual_pack_version: MKTON_MANUAL_PACK_VERSION, manual_connections: true },
    })
    .select("id")
    .single();
  if (botError) throw new Error(botError.message);

  const botId = String(bot.id);
  const ids = new Map(spec.blocks.map((block) => [block.id, crypto.randomUUID()]));
  const rows = spec.blocks.map((block, index) => {
    const config: Record<string, unknown> = { ...block };
    delete config.id;
    delete config.kind;
    delete config.nextBlockId;
    config.isStartBlock = block.id === spec.startBlockId;
    config.pausas = mapBranches(config.pausas, ids);
    config.condicoes = mapBranches(config.condicoes, ids);
    config.botoes = mapBranches(config.botoes, ids);
    if (typeof config.falseNextBlockId === "string") {
      config.falseNextBlockId = ids.get(config.falseNextBlockId) ?? undefined;
    }
    return {
      id: ids.get(block.id),
      salesbot_id: botId,
      workspace_id: workspaceId,
      local_id: block.id,
      type: block.kind,
      config,
      position_x: 80,
      position_y: index * 180,
      next_block_id: block.nextBlockId ? ids.get(block.nextBlockId) ?? null : null,
    };
  });

  if (rows.length) {
    const { error } = await sb.from("salesbot_blocks").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { id: botId, localId: spec.id, name: spec.name, blocks: rows.length };
}

const trialBlocks: Block[] = [
  tag("trial-tag", "trial:ativo", "trial-field"),
  field("trial-field", "Trial · Status", "ativo", "trial-msg-1"),
  msg("trial-msg-1", "Seu teste já está rodando. Se alguma configuração travar, me chama por aqui.", "trial-wait-2"),
  pause("trial-wait-2", { dias: 2 }, "trial-msg-2"),
  msg("trial-msg-2", "Você já conseguiu usar a Mkton no fluxo real ou ainda tem algo segurando a implementação?", "trial-wait-4"),
  pause("trial-wait-4", { dias: 2 }, "trial-msg-3"),
  msg("trial-msg-3", "Se algo estiver travando seu teste, me fala. A ideia é testar com a operação montada.", "trial-wait-7"),
  pause("trial-wait-7", { dias: 3 }, "trial-msg-4"),
  msg("trial-msg-4", "Fechando a primeira semana: precisa que a gente ajuste alguma coisa na sua operação?", "trial-silence"),
  pause("trial-silence", { dias: 8 }, "trial-day15"),
  msg("trial-day15", "Se a Mkton já está fazendo sentido, vale garantir a continuidade antes do trial acabar.", "trial-wait17"),
  pause("trial-wait17", { dias: 2 }, "trial-day17"),
  msg("trial-day17", "Se a decisão é continuar, vamos resolver a continuidade.", "trial-task"),
  task("trial-task", "Ligar para lead em fase final do Trial · Mkton", "trial-wait19"),
  pause("trial-wait19", { dias: 2 }, "trial-day19"),
  msg("trial-day19", "Seu período gratuito está chegando ao fim. Quer manter tudo rodando?", "trial-wait20"),
  pause("trial-wait20", { dias: 1 }, "trial-move-offers"),
  movePlaceholder("trial-move-offers", "Cadastro > Ofertas", "trial-end"),
  end("trial-end"),
];

const offerBlocks: Block[] = [
  tag("offer-tag", "trial:ofertas", "offer-task"),
  task("offer-task", "Contato comercial forte · Trial expirado Mkton", "offer-msg-1"),
  msg("offer-msg-1", "Você já testou a Mkton. Quer manter a operação rodando?", "offer-wait-1"),
  pause("offer-wait-1", { dias: 2 }, "offer-msg-2"),
  msg("offer-msg-2", "Se CRM, automações e IA já estão ajudando, vale continuar.", "offer-wait-2"),
  pause("offer-wait-2", { dias: 3 }, "offer-msg-3"),
  msg("offer-msg-3", "Se quer preservar o processo que montamos, finalize a continuidade.", "offer-wait-3"),
  pause("offer-wait-3", { dias: 3 }, "offer-msg-4"),
  msg("offer-msg-4", "Continuar organizado ou voltar parte da operação para o manual?", "offer-wait-4"),
  pause("offer-wait-4", { dias: 4 }, "offer-msg-5"),
  msg("offer-msg-5", "Último contato desta etapa. Se quiser continuar, me chama.", "offer-wait-5"),
  pause("offer-wait-5", { dias: 3 }, "offer-expired"),
  movePlaceholder("offer-expired", "Cadastro > Trial Expirado", "offer-end"),
  end("offer-end"),
];

const reactivationBlocks: Block[] = [
  tag("react-tag", "jornada:reativacao", "react-field"),
  field("react-field", "Jornada · Status", "reativacao", "react-wait-1"),
];
const reactSchedule = [15, 30, 30, 45, 45, 60, 60, 60, 75, 75, 90, 90];
const reactMessages = [
  "Você conseguiu organizar seu atendimento ou ainda tem lead/follow dependendo de trabalho manual?",
  "Hoje seu maior gargalo ainda é acompanhar os leads ou sua operação já mudou?",
  "Como está funcionando seu processo comercial hoje?",
  "Se ainda estiver buscando organizar CRM e automações, posso retomar de onde paramos.",
  "Mudou alguma coisa na sua operação? Se fizer sentido, retomamos pelo cenário atual.",
  "Organizar atendimento e follow ainda é prioridade para você?",
  "Sua operação mudou. Se quiser, retomamos olhando o cenário de hoje.",
  "Você ainda resolve CRM e automação no braço ou conseguiu estruturar isso?",
  "Existe interesse em revisar sua operação comercial ou não é prioridade agora?",
  "Se organização de leads e automação voltou a ser prioridade, responde aqui.",
  "Sua empresa ainda tem interesse em CRM + automação + IA ou posso deixar isso quieto?",
  "Última tentativa desta sequência. Se quiser retomar a Mkton, responde aqui.",
];
for (let i = 0; i < reactSchedule.length; i += 1) {
  const n = i + 1;
  reactivationBlocks.push(race(`react-wait-${n}`, { dias: reactSchedule[i] }, `react-msg-${n}`, "react-reply"));
  reactivationBlocks.push(msg(`react-msg-${n}`, reactMessages[i], n < reactSchedule.length ? `react-wait-${n + 1}` : "react-final-wait"));
}
reactivationBlocks.push(
  race("react-final-wait", { dias: 90 }, "react-retire", "react-reply"),
  movePlaceholder("react-reply", "Reativação > Em Conversão", "react-end"),
  movePlaceholder("react-retire", "Reativação > Encerrar Base", "react-end"),
  end("react-end"),
);

export const MKTON_MANUAL_BOTS: BotSpec[] = [
  {
    id: "mkton-registration-bridge",
    name: "Mkton · Cadastro Realizado → New Cad",
    startBlockId: "reg-tag",
    blocks: [
      tag("reg-tag", "jornada:cadastro-realizado", "reg-field"),
      field("reg-field", "Jornada · Status", "cadastro_realizado", "reg-move"),
      movePlaceholder("reg-move", "Cadastros > New Cad", "reg-end"),
      end("reg-end"),
    ],
  },
  {
    id: "mkton-cad-lost-bridge",
    name: "Mkton · CAD Lost → Reativação",
    startBlockId: "lost-origin",
    blocks: [
      field("lost-origin", "Reativação · Origem", "entrada_ads", "lost-tag"),
      tag("lost-tag", "reativacao:entrada", "lost-move"),
      movePlaceholder("lost-move", "Reativação > Entrada Reativação", "lost-end"),
      end("lost-end"),
    ],
  },
  {
    id: "mkton-new-cad",
    name: "Mkton · New Cad · Implementação",
    startBlockId: "new-tag",
    blocks: [
      tag("new-tag", "jornada:new-cad", "new-field"),
      field("new-field", "Trial · Status", "iniciando", "new-msg"),
      msg("new-msg", "Cadastro feito. Agora vamos colocar a Mkton para funcionar na sua operação; a implementação é por nossa conta.", "new-task"),
      task("new-task", "Agendar/realizar call de implementação Mkton", "new-ai"),
      aiPlaceholder("new-ai", "Júlia Braga · Ativação Mkton", "Com o que você trabalha hoje?", "new-wait"),
      pause("new-wait", { horas: 6 }, "new-move"),
      movePlaceholder("new-move", "Cadastros > Trial", "new-end"),
      end("new-end"),
    ],
  },
  { id: "mkton-trial-20d", name: "Mkton · Trial 20 dias", startBlockId: "trial-tag", blocks: trialBlocks },
  { id: "mkton-offers-close", name: "Mkton · Ofertas · Fechamento", startBlockId: "offer-tag", blocks: offerBlocks },
  {
    id: "mkton-signed-bridge",
    name: "Mkton · Assinou → Pós-venda",
    startBlockId: "signed-tag",
    blocks: [
      tag("signed-tag", "cliente:ativo", "signed-field"),
      field("signed-field", "Assinatura · Status", "ativa", "signed-task"),
      task("signed-task", "Validar implementação do novo cliente Mkton", "signed-move"),
      movePlaceholder("signed-move", "Pós Vendas > Onboarding", "signed-end"),
      end("signed-end"),
    ],
  },
  {
    id: "mkton-expired-bridge",
    name: "Mkton · Trial Expirado → Reativação",
    startBlockId: "exp-origin",
    blocks: [
      field("exp-origin", "Reativação · Origem", "ex_trial", "exp-tag"),
      tag("exp-tag", "reativacao:ex-trial", "exp-move"),
      movePlaceholder("exp-move", "Reativação > Entrada Reativação", "exp-end"),
      end("exp-end"),
    ],
  },
  {
    id: "mkton-onboarding",
    name: "Mkton · Onboarding 3 dias",
    startBlockId: "on-tag",
    blocks: [
      tag("on-tag", "cliente:onboarding", "on-field"),
      field("on-field", "Onboarding · Status", "ativo", "on-msg1"),
      msg("on-msg1", "Obrigado pela confiança. Como estão sendo esses primeiros passos com a Mkton?", "on-task"),
      task("on-task", "Acompanhar onboarding do novo cliente Mkton", "on-wait1"),
      pause("on-wait1", { dias: 1 }, "on-msg2"),
      msg("on-msg2", "O que você mais gostou e o que ainda precisa de ajuste?", "on-wait2"),
      pause("on-wait2", { dias: 1 }, "on-msg3"),
      msg("on-msg3", "Terceiro dia: o que já mudou na sua operação?", "on-move"),
      movePlaceholder("on-move", "Pós Vendas > Standby", "on-end"),
      end("on-end"),
    ],
  },
  {
    id: "mkton-postsale-standby",
    name: "Mkton · Pós-venda · Standby",
    startBlockId: "ps-w15",
    blocks: [
      pause("ps-w15", { dias: 15 }, "ps-m15"),
      msg("ps-m15", "Como a Mkton está encaixando na rotina? Tem algo que você quer melhorar?", "ps-w20"),
      pause("ps-w20", { dias: 20 }, "ps-m20"),
      msg("ps-m20", "Tem alguma automação ou etapa que ainda pode ficar mais redonda?", "ps-w30"),
      pause("ps-w30", { dias: 30 }, "ps-m30"),
      msg("ps-m30", "A Mkton continua entregando o que você esperava?", "ps-loop"),
      pause("ps-loop", { dias: 30 }, "ps-m15"),
    ],
  },
  {
    id: "mkton-renewal",
    name: "Mkton · Renovação do Plano",
    startBlockId: "ren-tag",
    blocks: [
      tag("ren-tag", "cliente:renovacao", "ren-field"),
      field("ren-field", "Renovação · Status", "em_negociacao", "ren-msg1"),
      msg("ren-msg1", "Seu ciclo está chegando ao fim. Quer que eu deixe a renovação encaminhada?", "ren-task"),
      task("ren-task", "Renovar plano do cliente Mkton", "ren-w"),
      pause("ren-w", { dias: 5 }, "ren-msg2"),
      msg("ren-msg2", "Para manter sua operação sem interrupção, vamos concluir a renovação.", "ren-end"),
      end("ren-end"),
    ],
  },
  {
    id: "mkton-renewed",
    name: "Mkton · Renovado → Standby",
    startBlockId: "renewed-field",
    blocks: [
      field("renewed-field", "Renovação · Status", "renovado", "renewed-tag"),
      tag("renewed-tag", "cliente:renovado", "renewed-move"),
      movePlaceholder("renewed-move", "Pós Vendas > Standby", "renewed-end"),
      end("renewed-end"),
    ],
  },
  {
    id: "mkton-postsale-lost",
    name: "Mkton · Venda Perdida → Reativação",
    startBlockId: "pl-origin",
    blocks: [
      field("pl-origin", "Reativação · Origem", "ex_cliente", "pl-tag"),
      tag("pl-tag", "reativacao:ex-cliente", "pl-move"),
      movePlaceholder("pl-move", "Reativação > Entrada Reativação", "pl-end"),
      end("pl-end"),
    ],
  },
  { id: "mkton-reactivation-entry", name: "Mkton · Reativação 18 meses", startBlockId: "react-tag", blocks: reactivationBlocks },
  {
    id: "mkton-reactivation-ai",
    name: "Mkton · Reativação · Júlia",
    startBlockId: "react-ai",
    blocks: [
      aiPlaceholder("react-ai", "Júlia Braga · Reativação Mkton", "Que bom que você respondeu. O que mudou na sua operação desde a última vez que conversamos?", "react-ai-task"),
      task("react-ai-task", "Acompanhar lead reativado Mkton", "react-ai-end"),
      end("react-ai-end"),
    ],
  },
  {
    id: "mkton-reactivation-retire",
    name: "Mkton · Encerrar Base · Proteção",
    startBlockId: "retire-task",
    blocks: [task("retire-task", "Revisar lead antes de excluir da base Mkton", "retire-end"), end("retire-end")],
  },
  {
    id: "mkton-social-reception",
    name: "Mkton · Rede Social · Recepção",
    startBlockId: "social-tag",
    blocks: [
      tag("social-tag", "canal:rede-social", "social-msg"),
      msg("social-msg", "Oi! Se preferir, me responde e eu entendo seu cenário primeiro.", "social-race"),
      race("social-race", { horas: 2 }, "social-no-reply", "social-reply"),
      movePlaceholder("social-reply", "Redes Sociais > Qualificação IA", "social-end"),
      movePlaceholder("social-no-reply", "Redes Sociais > Sem Conversão", "social-end"),
      end("social-end"),
    ],
  },
  {
    id: "mkton-social-ai",
    name: "Mkton · Rede Social · Júlia",
    startBlockId: "social-ai",
    blocks: [
      aiPlaceholder("social-ai", "Júlia Braga · Redes Sociais Mkton", "Com o que você trabalha e o que mais te incomoda hoje no atendimento/comercial?", "social-ai-end"),
      end("social-ai-end"),
    ],
  },
  {
    id: "mkton-social-registered",
    name: "Mkton · Social Cadastro → Cadastro",
    startBlockId: "sr-tag",
    blocks: [tag("sr-tag", "origem:rede-social", "sr-move"), movePlaceholder("sr-move", "Cadastros > New Cad", "sr-end"), end("sr-end")],
  },
  {
    id: "mkton-social-lost",
    name: "Mkton · Social sem conversão → Reativação",
    startBlockId: "sl-origin",
    blocks: [field("sl-origin", "Reativação · Origem", "rede_social", "sl-move"), movePlaceholder("sl-move", "Reativação > Entrada Reativação", "sl-end"), end("sl-end")],
  },
  ...[
    ["mkton-affiliate-em-cadastro", "Mkton · Afiliado · Em Cadastro", "Em Cadastro"],
    ["mkton-affiliate-cadastrado", "Mkton · Afiliado · Cadastrado", "Cadastrado"],
    ["mkton-affiliate-primeira-venda", "Mkton · Afiliado · Primeira Venda", "Primeira Venda"],
    ["mkton-affiliate-em-progressao", "Mkton · Afiliado · Em Progressão", "Em Progressão"],
    ["mkton-affiliate-ativo", "Mkton · Afiliado · Ativo", "Ativo"],
  ].map(([id, name, stage]) => ({
    id,
    name,
    startBlockId: "aff-task",
    blocks: [task("aff-task", `Revisar afiliado/parceiro · ${stage}`, "aff-end"), end("aff-end")],
  })),
];

async function createAgent(sb: AnySb, workspaceId: string, input: { name: string; context: string; prompt: string }) {
  const { data, error } = await sb
    .from("conversation_ai_agents")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      persona: "Júlia Braga, consultora da Mkton. Natural, objetiva, consultiva e orientada a resultado. Nunca se apresenta como robô.",
      system_prompt: input.prompt,
      model: "google/gemini-2.5-flash",
      temperature: 0.55,
      max_tokens: 1400,
      cooldown_seconds: 8,
      enabled: false,
      metadata: {
        manual_pack_version: MKTON_MANUAL_PACK_VERSION,
        manual_connections: true,
        settings: { mode: "objetivos", language: "pt-BR", max_interactions: 30 },
        objective_tree: {
          context: input.context,
          root: {
            id: `root-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            block: "objetivo",
            say: input.context,
            expected: "Existe um próximo passo concreto combinado com o lead.",
            mode: "free",
            maxTurns: 12,
            keepOnTrack: true,
            children: [],
          },
        },
      },
    })
    .select("id,name")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function resetAndProvisionMktonManualPack(input: { sb: AnySb; workspaceId: string }) {
  const { sb, workspaceId } = input;

  // O usuário pediu limpeza total dos SalesBots e agentes IA deste workspace.
  const { error: blocksError } = await sb.from("salesbot_blocks").delete().eq("workspace_id", workspaceId);
  if (blocksError) throw new Error(`Falha ao limpar blocos: ${blocksError.message}`);

  const { error: botsError } = await sb.from("salesbots").delete().eq("workspace_id", workspaceId);
  if (botsError) throw new Error(`Falha ao limpar SalesBots: ${botsError.message}`);

  const { error: agentsError } = await sb.from("conversation_ai_agents").delete().eq("workspace_id", workspaceId);
  if (agentsError) throw new Error(`Falha ao limpar agentes IA: ${agentsError.message}`);

  // Fase 1: cria exatamente os 24 SalesBots, sem gatilhos e sem IDs de pipeline/IA.
  const bots = [];
  for (const spec of MKTON_MANUAL_BOTS) {
    bots.push(await createBot(sb, workspaceId, spec));
  }
  if (bots.length !== 24) throw new Error(`Pacote manual esperava 24 bots e criou ${bots.length}.`);

  // Fase 2: somente depois dos bots, cria os três agentes IA independentes.
  const agents = [];
  agents.push(
    await createAgent(sb, workspaceId, {
      name: "Júlia Braga · Ativação Mkton",
      context: "Fazer o novo cadastro avançar para briefing, call de implementação e uso real da Mkton durante o trial.",
      prompt: "Você é Júlia Braga no pós-cadastro da Vanessa Simoni. O lead já se cadastrou. Acelere ativação e implementação, evite repetir perguntas e conduza para briefing, call e primeiro valor entregue. Mensagens curtas e humanas.",
    }),
  );
  agents.push(
    await createAgent(sb, workspaceId, {
      name: "Júlia Braga · Reativação Mkton",
      context: "Retomar leads antigos respeitando o histórico: aquisição sem cadastro, ex-trial ou ex-cliente.",
      prompt: "Você é Júlia Braga na reativação da Vanessa Simoni. Leia o histórico antes de responder. Se nunca cadastrou, conduza ao cadastro. Se já testou, conduza ao retorno/assinatura. Se já foi cliente, conduza à recontratação. Atualize o contexto e combine um próximo passo concreto.",
    }),
  );
  agents.push(
    await createAgent(sb, workspaceId, {
      name: "Júlia Braga · Redes Sociais Mkton",
      context: "Qualificar rapidamente contatos de redes sociais e migrar para cadastro ou WhatsApp.",
      prompt: "Você é Júlia Braga nas redes sociais da Vanessa Simoni. Faça qualificação curta, responda o contexto e conduza o contato para cadastro ou WhatsApp. Não faça venda longa por DM.",
    }),
  );

  return { version: MKTON_MANUAL_PACK_VERSION, bots, agents };
}
