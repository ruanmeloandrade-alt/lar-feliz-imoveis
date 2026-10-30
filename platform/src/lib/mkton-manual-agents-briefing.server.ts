type AnySb = { from: (table: string) => any };

type ObjectiveNode = {
  id: string;
  block: "objetivo" | "acao" | "condicao" | "tracking";
  say: string;
  expected: string;
  mode: "free" | "strict";
  maxTurns?: number;
  keepOnTrack?: boolean;
  actions?: Array<{ id: string; action: string; target: string; targetLabel?: string; message?: string }>;
  conditions?: Array<{ id: string; field: string; op: string; value?: string }>;
  conditionLogic?: "e" | "ou";
  tracking?: {
    event: string;
    customEvent?: string;
    everyMinutes?: number;
    initialDelayMinutes?: number;
    retryAttempts?: number;
    forMinutes?: number;
    onFoundMessage?: string;
    onTimeout?: "ficar" | "proximo" | "encerrar";
  };
  children: ObjectiveNode[];
};

type AgentSpec = {
  name: string;
  context: string;
  prompt: string;
  root: ObjectiveNode;
  endFrom: string[];
};

const MODEL = "openai/gpt-5.5";
const PACK_VERSION = "manual-connections-v1";

const action = (
  id: string,
  say: string,
  steps: Array<{ action: string; target?: string; targetLabel?: string; message?: string }>,
  children: ObjectiveNode[] = [],
): ObjectiveNode => ({
  id,
  block: "acao",
  say,
  expected: "A ação foi executada e o fluxo pode continuar.",
  mode: "free",
  actions: steps.map((step, index) => ({
    id: `${id}-step-${index + 1}`,
    action: step.action,
    target: step.target ?? "",
    targetLabel: step.targetLabel,
    message: step.message,
  })),
  children,
});

const condition = (
  id: string,
  say: string,
  conditions: Array<{ field: string; op: string; value?: string }>,
  children: ObjectiveNode[] = [],
): ObjectiveNode => ({
  id,
  block: "condicao",
  say,
  expected: "A condição foi avaliada com base na conversa atual.",
  mode: "free",
  conditionLogic: "ou",
  conditions: conditions.map((row, index) => ({ id: `${id}-cond-${index + 1}`, ...row })),
  children,
});

const tracking = (
  id: string,
  event: string,
  foundMessage: string,
  children: ObjectiveNode[] = [],
): ObjectiveNode => ({
  id,
  block: "tracking",
  say: `Confirmar o evento ${event} no tracking da Mkton.`,
  expected: `O evento ${event} foi identificado ou o prazo de acompanhamento terminou.`,
  mode: "free",
  tracking: {
    event,
    everyMinutes: 5,
    initialDelayMinutes: 0,
    retryAttempts: 12,
    forMinutes: 1440,
    onFoundMessage: foundMessage,
    onTimeout: "proximo",
  },
  children,
});

const objective = (
  id: string,
  say: string,
  expected: string,
  children: ObjectiveNode[] = [],
  maxTurns = 6,
): ObjectiveNode => ({
  id,
  block: "objetivo",
  say,
  expected,
  mode: "free",
  maxTurns,
  keepOnTrack: true,
  children,
});

const activationRoot = objective(
  "activation-objective-understand",
  "Entenda rapidamente o negócio, o volume de atendimento, a equipe, os canais e o principal gargalo. Não repita dados que já existirem no histórico.",
  "O nicho, a operação atual e o principal gargalo estão claros.",
  [
    action(
      "activation-action-history",
      "Leia o histórico completo antes de aprofundar a qualificação.",
      [{ action: "ler-historico" }],
      [
        condition(
          "activation-condition-ready",
          "Verifique se já há informação suficiente para avançar ao briefing sem continuar interrogando o lead.",
          [
            { field: "mensagem", op: "contem", value: "quero implementar" },
            { field: "mensagem", op: "contem", value: "vamos configurar" },
            { field: "mensagem", op: "contem", value: "pode agendar" },
          ],
          [
            objective(
              "activation-objective-briefing",
              "Conduza o lead ao briefing correto para o nicho e combine a call de implementação. Explique só o necessário para ele avançar.",
              "O briefing adequado foi enviado e existe um próximo passo de implementação combinado.",
              [
                action(
                  "activation-action-qualified",
                  "Marque que o lead avançou na ativação.",
                  [{ action: "adicionar-tag", target: "ativacao:briefing-enviado", targetLabel: "ativacao:briefing-enviado" }],
                  [
                    tracking(
                      "activation-tracking-briefing",
                      "briefing_completed",
                      "Perfeito, recebi seu briefing. Agora seguimos para a implementação.",
                      [
                        objective(
                          "activation-objective-next-step",
                          "Confirme a call ou o próximo passo concreto e encerre a IA quando a responsabilidade passar para implementação.",
                          "A call/implementação está encaminhada e o lead sabe exatamente o que acontece agora.",
                          [
                            action(
                              "activation-action-finish",
                              "Finalize esta etapa do agente.",
                              [
                                { action: "adicionar-tag", target: "ativacao:pronto-implementacao", targetLabel: "ativacao:pronto-implementacao" },
                                { action: "encerrar-conversa" },
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);

const reactivationRoot = objective(
  "reactivation-objective-context",
  "Leia o histórico e descubra em qual situação o lead está: nunca cadastrou, já testou a Mkton ou já foi cliente.",
  "A origem da reativação e a situação atual do lead estão claras.",
  [
    action(
      "reactivation-action-history",
      "Use todo o histórico para não abordar o lead como se fosse novo.",
      [{ action: "ler-historico" }],
      [
        condition(
          "reactivation-condition-intent",
          "Avalie se existe intenção de retomar agora ou uma negativa clara.",
          [
            { field: "mensagem", op: "contem", value: "quero voltar" },
            { field: "mensagem", op: "contem", value: "quero testar" },
            { field: "mensagem", op: "contem", value: "tenho interesse" },
            { field: "mensagem", op: "contem", value: "não tenho interesse" },
          ],
          [
            objective(
              "reactivation-objective-convert",
              "Se nunca cadastrou, conduza ao cadastro. Se já testou, conduza à retomada/assinatura. Se já foi cliente, conduza à recontratação. Sempre combine um único próximo passo.",
              "Existe um próximo passo de conversão concreto e compatível com o histórico do lead.",
              [
                action(
                  "reactivation-action-mark",
                  "Marque a retomada antes de acompanhar a conversão.",
                  [{ action: "adicionar-tag", target: "reativacao:em-conversao", targetLabel: "reativacao:em-conversao" }],
                  [
                    tracking(
                      "reactivation-tracking-signup",
                      "signup_completed",
                      "Cadastro confirmado. Agora vamos avançar com sua ativação.",
                      [
                        action(
                          "reactivation-action-finish",
                          "Encerre a IA quando o próximo passo já estiver definido.",
                          [{ action: "encerrar-conversa" }],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);

const socialRoot = objective(
  "social-objective-qualify",
  "Qualifique de forma curta: entenda o negócio e o principal problema comercial. Não transforme a DM em uma entrevista longa.",
  "O negócio e o principal problema estão claros em poucas interações.",
  [
    condition(
      "social-condition-intent",
      "Identifique se o contato quer conhecer/testar a Mkton ou apenas tirar uma dúvida pontual.",
      [
        { field: "mensagem", op: "contem", value: "quero testar" },
        { field: "mensagem", op: "contem", value: "tenho interesse" },
        { field: "mensagem", op: "contem", value: "como funciona" },
      ],
      [
        objective(
          "social-objective-migrate",
          "Conduza para cadastro ou WhatsApp. Faça um CTA simples e único.",
          "O contato recebeu o próximo passo para sair da DM e avançar no funil.",
          [
            action(
              "social-action-mark",
              "Marque a origem antes de acompanhar a conversão.",
              [{ action: "adicionar-tag", target: "origem:rede-social", targetLabel: "origem:rede-social" }],
              [
                tracking(
                  "social-tracking-signup",
                  "signup_completed",
                  "Cadastro confirmado. Vou deixar sua ativação encaminhada.",
                  [
                    action(
                      "social-action-finish",
                      "Finalize a IA depois da migração/conversão.",
                      [{ action: "encerrar-conversa" }],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);

const AGENTS: AgentSpec[] = [
  {
    name: "Júlia Braga · Ativação Mkton",
    context:
      "Você atende quem já criou a conta da Mkton. Seu papel é acelerar briefing, call de implementação e primeiro uso real, sem repetir perguntas já respondidas.",
    prompt:
      "Você é Júlia Braga no pós-cadastro da Vanessa Simoni. Seja breve, humana e prática. Leia o histórico antes de perguntar. Conduza a conversa pelos objetivos configurados. Não invente integrações nem dados. Quando houver próximo passo concreto, execute as ações configuradas e encerre.",
    root: activationRoot,
    endFrom: ["activation-action-finish"],
  },
  {
    name: "Júlia Braga · Reativação Mkton",
    context:
      "Você retoma leads antigos da Mkton. O histórico define a abordagem: aquisição sem cadastro, ex-trial ou ex-cliente. Nunca trate todos como leads novos.",
    prompt:
      "Você é Júlia Braga na reativação da Vanessa Simoni. Leia o histórico completo. Descubra a situação atual e conduza apenas ao próximo passo coerente: cadastro, retomada de trial/assinatura ou recontratação. Mensagens curtas. Respeite negativas claras.",
    root: reactivationRoot,
    endFrom: ["reactivation-action-finish"],
  },
  {
    name: "Júlia Braga · Redes Sociais Mkton",
    context:
      "Você atende contatos vindos de redes sociais. Qualifique rápido e leve a conversa para cadastro ou WhatsApp, evitando venda longa por DM.",
    prompt:
      "Você é Júlia Braga nas redes sociais da Vanessa Simoni. Responda de forma curta, contextual e natural. Entenda o negócio e o problema principal e conduza para cadastro ou WhatsApp. Não faça interrogatório nem venda longa na DM.",
    root: socialRoot,
    endFrom: ["social-action-finish"],
  },
];

async function insertAgent(sb: AnySb, workspaceId: string, spec: AgentSpec) {
  const { data, error } = await sb
    .from("conversation_ai_agents")
    .insert({
      workspace_id: workspaceId,
      name: spec.name,
      persona:
        "Júlia Braga, consultora da Mkton. Natural, objetiva, consultiva e orientada a resultado. Nunca se apresenta como robô.",
      system_prompt: spec.prompt,
      model: MODEL,
      temperature: 0.55,
      max_tokens: 1400,
      cooldown_seconds: 8,
      enabled: false,
      metadata: {
        manual_pack_version: PACK_VERSION,
        manual_connections: true,
        settings: { mode: "objetivos", language: "pt-BR", max_interactions: 30 },
        objective_tree: {
          // Contexto Geral existe somente aqui. O root já é o primeiro objetivo real.
          context: spec.context,
          root: spec.root,
          endFrom: spec.endFrom,
          positions: {
            __context__: { x: 0, y: 200 },
            [spec.root.id]: { x: 340, y: 200 },
          },
        },
      },
    })
    .select("id,name,model")
    .single();
  if (error) throw new Error(`Falha ao criar ${spec.name}: ${error.message}`);
  return data;
}

const softwareFields = [
  { id: "nome", label: "Nome completo", kind: "text", required: true },
  { id: "empresa", label: "Empresa / software", kind: "text", required: true },
  { id: "whatsapp", label: "WhatsApp principal", kind: "phone", required: true },
  { id: "produto", label: "O que o seu software resolve hoje?", kind: "textarea", required: true },
  { id: "publico", label: "Quem é o cliente ideal do software?", kind: "textarea", required: true },
  { id: "modelo", label: "Como vocês vendem: mensalidade, licença, implantação ou outro modelo?", kind: "text", required: true },
  { id: "ticket", label: "Qual é o ticket médio ou faixa de planos?", kind: "text", required: false },
  { id: "leads", label: "Quantos leads/demonstrações recebem aproximadamente por mês?", kind: "text", required: true },
  { id: "canais", label: "Quais canais geram oportunidades hoje?", kind: "textarea", required: true },
  { id: "vendas", label: "Como funciona o processo entre lead, demonstração, proposta e fechamento?", kind: "textarea", required: true },
  { id: "equipe", label: "Quantas pessoas participam de pré-vendas, vendas e atendimento?", kind: "text", required: true },
  { id: "crm", label: "Qual CRM ou ferramenta comercial vocês usam hoje?", kind: "text", required: false },
  { id: "follow", label: "Como vocês fazem follow-up de trials, demos e propostas?", kind: "textarea", required: true },
  { id: "trial", label: "Existe trial, freemium ou demonstração? Como funciona?", kind: "textarea", required: false },
  { id: "integracoes", label: "Quais integrações são essenciais na operação?", kind: "textarea", required: false },
  { id: "gargalo", label: "Qual é hoje o maior gargalo para vender e ativar clientes?", kind: "textarea", required: true },
  { id: "meta", label: "O que precisa estar funcionando primeiro na implementação da Vanessa Simoni?", kind: "textarea", required: true },
];

async function ensureSoftwareBriefing(sb: AnySb, workspaceId: string) {
  const name = "Briefing Mkton · Software";
  const slug = "mkton-briefing-software";
  const { data: current, error: findError } = await sb
    .from("crm_forms")
    .select("id,slug")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();
  if (findError) throw new Error(`Falha ao buscar briefing Software: ${findError.message}`);

  const payload = {
    workspace_id: workspaceId,
    slug: current?.slug ?? slug,
    nome: name,
    descricao:
      "Briefing de implementação para SaaS, plataformas, aplicativos e empresas de software, cobrindo aquisição, demos, trial, vendas, onboarding e integrações.",
    campos: softwareFields,
    branding: {
      headline: name,
      subheadline: "Responda o essencial para montarmos CRM, automações e atendimento conforme a jornada real do seu software.",
      thanksMessage: "Briefing recebido. Agora vamos organizar a implementação da sua operação.",
      thanksButtonLabel: "Agendar call de implementação",
      thanksButtonMode: "agendamento",
      scheduling: {
        durationMin: 30,
        daysAhead: 15,
        workStart: "09:00",
        workEnd: "18:00",
        weekdaysOnly: false,
        eventTitle: "Implementação Mkton · Software",
        syncGoogle: true,
      },
    },
    origem: "mkton",
    auto_criar_lead: false,
    updated_at: new Date().toISOString(),
  };

  if (current?.id) {
    const { error } = await sb
      .from("crm_forms")
      .update(payload)
      .eq("id", current.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(`Falha ao atualizar briefing Software: ${error.message}`);
    return { id: current.id, slug: current.slug ?? slug, name };
  }

  const { data, error } = await sb.from("crm_forms").insert(payload).select("id,slug").single();
  if (error) throw new Error(`Falha ao criar briefing Software: ${error.message}`);
  return { id: data.id, slug: data.slug, name };
}

export async function correctMktonManualAgentsAndSoftware(input: {
  sb: AnySb;
  workspaceId: string;
}) {
  const { sb, workspaceId } = input;

  // Remove somente os agentes criados pelo pacote Mkton e os recria corretamente em GPT.
  const { error: deleteError } = await sb
    .from("conversation_ai_agents")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("name", AGENTS.map((agent) => agent.name));
  if (deleteError) throw new Error(`Falha ao corrigir agentes Vanessa Simoni: ${deleteError.message}`);

  const agents = [];
  for (const spec of AGENTS) agents.push(await insertAgent(sb, workspaceId, spec));
  const softwareBriefing = await ensureSoftwareBriefing(sb, workspaceId);

  return { agents, softwareBriefing, model: MODEL };
}
