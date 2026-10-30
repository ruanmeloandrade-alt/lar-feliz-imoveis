import { MKTON_FUNNELS } from "@/config/marketon-operation";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";
import { resolveExistingMktonFunnel } from "@/lib/mkton-existing-funnel-resolver.server";

type AnySb = { from: (table: string) => any };
type Stage = { id: string; name: string; pipeline_id: string; position?: number | null };
type Funnel = { id: string; name: string; stages: Stage[] };
type Block = { id: string; kind: string; x?: number; y?: number; nextBlockId?: string | null; [key: string]: unknown };

type BotSpec = {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  startBlockId: string;
  blocks: Block[];
};

const appOrigin = () => resolvePublicAppUrl();

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function mapBranches(value: unknown, ids: Map<string, string>) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const b = item as Record<string, unknown>;
    const next = typeof b.nextBlockId === "string" ? b.nextBlockId : null;
    return { ...b, nextBlockId: next ? ids.get(next) ?? undefined : undefined };
  });
}

async function upsertBot(sb: AnySb, workspaceId: string, spec: BotSpec) {
  const { data: current, error: findError } = await sb
    .from("salesbots")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("local_id", spec.id)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  let botId: string;
  const gatilhos = [
    {
      id: `${spec.id}-trigger`,
      kind: "movido-etapa",
      pipelineId: spec.pipelineId,
      pipelineNome: spec.pipelineName,
      stageId: spec.stageId,
      stageNome: spec.stageName,
    },
  ];
  if (current?.id) {
    botId = String(current.id);
    const { error } = await sb
      .from("salesbots")
      .update({ name: spec.name, gatilhos, is_active: true, scope: "individual", updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", botId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb
      .from("salesbots")
      .insert({ workspace_id: workspaceId, local_id: spec.id, name: spec.name, gatilhos, is_active: true, scope: "individual", settings: {} })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    botId = String(data.id);
  }

  const { data: oldBlocks, error: oldError } = await sb
    .from("salesbot_blocks")
    .select("id,local_id")
    .eq("salesbot_id", botId);
  if (oldError) throw new Error(oldError.message);
  const old = new Map<string, string>();
  for (const r of oldBlocks ?? []) if (r.local_id) old.set(String(r.local_id), String(r.id));

  const ids = new Map<string, string>();
  for (const block of spec.blocks) ids.set(block.id, old.get(block.id) ?? crypto.randomUUID());
  const rows = spec.blocks.map((block, index) => {
    const config: Record<string, unknown> = { ...block };
    delete config.id;
    delete config.kind;
    delete config.x;
    delete config.y;
    delete config.nextBlockId;
    config.isStartBlock = block.id === spec.startBlockId;
    config.pausas = mapBranches(config.pausas, ids);
    config.condicoes = mapBranches(config.condicoes, ids);
    if (typeof config.falseNextBlockId === "string") config.falseNextBlockId = ids.get(config.falseNextBlockId) ?? undefined;
    return {
      id: ids.get(block.id), salesbot_id: botId, workspace_id: workspaceId,
      local_id: block.id, type: block.kind, config,
      position_x: Math.round(block.x ?? 80), position_y: Math.round(block.y ?? index * 180),
      next_block_id: block.nextBlockId ? ids.get(block.nextBlockId) ?? null : null,
    };
  });
  for (const row of rows) {
    const { error } = await sb.from("salesbot_blocks").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  const keep = new Set(spec.blocks.map((b) => b.id));
  const stale = (oldBlocks ?? []).filter((r: { local_id?: string | null }) => !r.local_id || !keep.has(String(r.local_id))).map((r: { id: string }) => r.id);
  if (stale.length) await sb.from("salesbot_blocks").delete().in("id", stale);
  return { id: botId, name: spec.name, blocks: rows.length };
}

function pause(id: string, timer: Record<string, number>, next: string): Block {
  return { id, kind: "pausar", pausas: [{ id: `${id}-timer`, tipo: "cronometro", ...timer, nextBlockId: next }] };
}
function race(id: string, timer: Record<string, number>, timerNext: string, replyNext: string): Block {
  return { id, kind: "pausar", pausas: [
    { id: `${id}-timer`, tipo: "cronometro", ...timer, nextBlockId: timerNext },
    { id: `${id}-reply`, tipo: "msg-recebida", nextBlockId: replyNext },
  ] };
}
function msg(id: string, text: string, next?: string): Block {
  return { id, kind: "enviar-mensagem", texto: text, textoDelayMs: 1300, nextBlockId: next ?? null };
}
function end(id: string): Block { return { id, kind: "encerrar-bot" }; }
function tag(id: string, value: string, next?: string): Block {
  return { id, kind: "acao", acaoTipo: "tags", acaoConfig: value, tagsModo: "adicionar", nextBlockId: next ?? null };
}
function field(id: string, fieldId: string, fieldName: string, value: string, next?: string): Block {
  return { id, kind: "acao", acaoTipo: "definir-campo", campoId: fieldId, campoNome: fieldName, campoOrigem: "manual", campoValor: value, nextBlockId: next ?? null };
}
function move(id: string, funnel: Funnel, stage: Stage, next?: string): Block {
  return { id, kind: "acao", acaoTipo: "mudar-status-lead", destinoPipelineId: funnel.id, destinoPipelineNome: funnel.name, destinoStageId: stage.id, destinoStageNome: stage.name, destinoEtapa: stage.name, nextBlockId: next ?? null };
}
function ai(id: string, agentId: string, agentName: string, opening: string, next?: string): Block {
  return { id, kind: "iniciar-ia", iaAgentId: agentId, iaAgentNome: agentName, iaMaxTurnos: 0, iaMensagemInicial: opening, nextBlockId: next ?? null };
}
function task(id: string, title: string, userId: string, next?: string, offsetMin = 0): Block {
  return { id, kind: "acao", acaoTipo: "tarefa", tarefaTitulo: title, tarefaKind: "tarefa", tarefaOffsetMin: offsetMin, tarefaDuracaoMin: 20, tarefaWorkflowAssigneeId: userId, tarefaWorkflowPriority: "alta", tarefaTambemCalendario: false, nextBlockId: next ?? null };
}

async function fieldId(sb: AnySb, workspaceId: string, name: string) {
  const { data, error } = await sb.from("lead_custom_fields").select("id").eq("workspace_id", workspaceId).eq("name", name).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error(`Campo obrigatório não encontrado: ${name}`);
  return String(data.id);
}

async function ensureAgent(sb: AnySb, workspaceId: string, input: { name: string; prompt: string; context: string }) {
  const persona = "Júlia Braga, consultora da Mkton. Natural, objetiva, consultiva e orientada a resultado. Nunca se apresenta como robô.";
  const metadata = { settings: { mode: "objetivos", language: "pt-BR", max_interactions: 30, allowed_actions: ["mover_etapa", "definir_campo", "adicionar_tag", "criar_tarefa", "handoff"] }, objective_tree: { context: input.context, root: { id: `root-${norm(input.name).replace(/[^a-z0-9]+/g, "-")}`, block: "objetivo", say: input.context, expected: "O objetivo desta etapa foi concluído ou existe um próximo passo concreto combinado com o lead.", mode: "free", maxTurns: 12, keepOnTrack: true, children: [] } } };
  const payload = { workspace_id: workspaceId, name: input.name, persona, system_prompt: input.prompt, model: "google/gemini-2.5-flash", temperature: 0.55, max_tokens: 1400, cooldown_seconds: 8, enabled: true, metadata, updated_at: new Date().toISOString() };
  const { data: existing, error: findError } = await sb.from("conversation_ai_agents").select("id").eq("workspace_id", workspaceId).ilike("name", input.name).maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing?.id) {
    const { error } = await sb.from("conversation_ai_agents").update(payload).eq("id", existing.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return String(existing.id);
  }
  const { data, error } = await sb.from("conversation_ai_agents").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

async function ensureFunnel(sb: AnySb, workspaceId: string, name: string): Promise<Funnel> {
  const spec = MKTON_FUNNELS.find((f) => f.name === name);
  if (!spec) throw new Error(`Spec do funil ${name} não encontrada.`);
  const pipeline = await resolveExistingMktonFunnel(sb, workspaceId, spec.name, spec.stages);
  const { data: existing, error } = await sb
    .from("pipeline_stages")
    .select("id,name,position,pipeline_id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (existing ?? []) as Stage[];
  if (!rows.length) throw new Error(`O funil existente "${pipeline.name}" não possui etapas.`);
  return { id: String(pipeline.id), name: String(pipeline.name), stages: rows };
}

function stage(f: Funnel, name: string) {
  const wanted = norm(name);
  const s = f.stages.find((x) => norm(x.name) === wanted);
  if (!s) {
    throw new Error(`Etapa ${f.name} > ${name} não encontrada. Etapas existentes: ${f.stages.map((x) => x.name).join(", ")}.`);
  }
  return s;
}

async function ensureTrackedLink(sb: AnySb, input: { workspaceId: string; userId: string; slug: string; target: string; label: string; content: string }) {
  const payload = { workspace_id: input.workspaceId, slug: input.slug, target_url: input.target, context_label: input.label, link_label: input.label, utm_source: "mkton", utm_medium: "whatsapp", utm_campaign: "conversao", utm_content: input.content, created_by: input.userId, updated_at: new Date().toISOString() };
  const { data: current, error } = await sb.from("tracked_links").select("id,workspace_id").eq("slug", input.slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (current && String(current.workspace_id) !== input.workspaceId) throw new Error(`Slug ${input.slug} pertence a outro workspace.`);
  if (current?.id) await sb.from("tracked_links").update(payload).eq("id", current.id);
  else await sb.from("tracked_links").insert(payload);
  return `${appOrigin()}/r/${input.slug}`;
}

async function ensureForm(sb: AnySb, workspaceId: string, input: { slug: string; name: string; description: string; fields: Array<Record<string, unknown>> }) {
  const branding = { headline: input.name, subheadline: "Responda o essencial para nossa implementação já começar direcionada à sua operação.", thanksMessage: "Briefing recebido. Agora vamos organizar sua implementação.", thanksButtonLabel: "Agendar call de implementação", thanksButtonMode: "agendamento", scheduling: { durationMin: 30, daysAhead: 15, workStart: "09:00", workEnd: "18:00", weekdaysOnly: false, eventTitle: "Implementação Mkton", syncGoogle: true } };
  const { data: bySlug, error: slugError } = await sb.from("crm_forms").select("id,slug").eq("workspace_id", workspaceId).eq("slug", input.slug).maybeSingle();
  if (slugError) throw new Error(slugError.message);
  let current = bySlug;
  if (!current) {
    const { data: byName, error: nameError } = await sb.from("crm_forms").select("id,slug").eq("workspace_id", workspaceId).eq("nome", input.name).maybeSingle();
    if (nameError) throw new Error(nameError.message);
    current = byName;
  }
  const effectiveSlug = String(current?.slug || input.slug);
  const payload = { workspace_id: workspaceId, slug: effectiveSlug, nome: input.name, descricao: input.description, campos: input.fields, branding, origem: "mkton", auto_criar_lead: false, updated_at: new Date().toISOString() };
  if (current?.id) await sb.from("crm_forms").update(payload).eq("id", current.id).eq("workspace_id", workspaceId);
  else {
    const { error: insertError } = await sb.from("crm_forms").insert(payload);
    if (insertError) throw new Error(`Falha ao criar ${input.name}: ${insertError.message}`);
  }
  return `${appOrigin()}/l/${effectiveSlug}`;
}

const baseBriefing = [
  { id: "nome", label: "Nome completo", kind: "text", required: true },
  { id: "empresa", label: "Empresa / marca", kind: "text", required: true },
  { id: "whatsapp", label: "WhatsApp principal", kind: "phone", required: true },
  { id: "volume", label: "Quantos leads/atendimentos recebe por dia?", kind: "text", required: true },
  { id: "equipe", label: "Quantas pessoas atendem ou vendem?", kind: "text", required: true },
  { id: "canais", label: "Quais canais trazem seus leads hoje?", kind: "text", required: true },
  { id: "processo", label: "Como você acompanha os leads hoje?", kind: "text", required: true },
  { id: "gargalo", label: "Qual é o maior gargalo comercial hoje?", kind: "text", required: true },
  { id: "objetivo", label: "O que precisa estar funcionando primeiro na Vanessa Simoni?", kind: "text", required: true },
];

async function provisionForms(sb: AnySb, workspaceId: string) {
  const niches = [
    ["geral", "Briefing Mkton · Geral", []],
    ["imobiliario", "Briefing Mkton · Imobiliário", [{ id: "imob", label: "Você trabalha com venda, locação ou ambos?", kind: "select", options: ["Venda", "Locação", "Ambos"] }]],
    ["advocacia", "Briefing Mkton · Advocacia", [{ id: "juridico", label: "Quais áreas do direito geram mais atendimentos?", kind: "text" }]],
    ["saude", "Briefing Mkton · Saúde e Clínicas", [{ id: "saude", label: "Quais tipos de consulta/procedimento mais geram leads?", kind: "text" }]],
    ["odontologia", "Briefing Mkton · Odontologia", [{ id: "odonto", label: "Quais tratamentos são prioridade comercial?", kind: "text" }]],
    ["estetica", "Briefing Mkton · Estética", [{ id: "estetica", label: "Quais procedimentos você mais quer vender?", kind: "text" }]],
    ["agencia-marketing", "Briefing Mkton · Agência e Marketing", [{ id: "agencia", label: "Quantos clientes/campanhas entram no atendimento comercial?", kind: "text" }]],
    ["educacao", "Briefing Mkton · Educação e Cursos", [{ id: "educacao", label: "Quais cursos/produtos educacionais são prioridade?", kind: "text" }]],
    ["servicos", "Briefing Mkton · Serviços", [{ id: "servicos", label: "Quais serviços geram mais pedidos de orçamento?", kind: "text" }]],
    ["comercio", "Briefing Mkton · Comércio", [{ id: "comercio", label: "Você vende por loja física, online, WhatsApp ou combinação?", kind: "text" }]],
  ] as const;
  const links: Record<string, string> = {};
  for (const [slug, name, extra] of niches) links[slug] = await ensureForm(sb, workspaceId, { slug: `ruanandradenegocios-briefing-${slug}`, name, description: "Briefing de implementação da Vanessa Simoni.", fields: [...baseBriefing, ...extra] });
  return links;
}

function trialBlocks(input: { statusFieldId: string; offers: Funnel; offersStage: Stage; userId: string; checkout: string }) {
  return [
    tag("trial-tag", "trial:ativo", "trial-field"),
    field("trial-field", input.statusFieldId, "Trial · Status", "ativo", "trial-msg-1"),
    msg("trial-msg-1", "Seu teste já está rodando. Se alguma configuração travar, me chama por aqui.", "trial-wait-2"),
    pause("trial-wait-2", { dias: 2 }, "trial-msg-2"),
    msg("trial-msg-2", "Você já conseguiu usar a Mkton no fluxo real ou ainda tem algo segurando a implementação?", "trial-wait-4"),
    pause("trial-wait-4", { dias: 2 }, "trial-msg-3"),
    msg("trial-msg-3", "Se algo estiver travando seu teste, me fala. A ideia é testar com a operação montada.", "trial-wait-7"),
    pause("trial-wait-7", { dias: 3 }, "trial-msg-4"),
    msg("trial-msg-4", "Fechando a primeira semana: precisa que a gente ajuste alguma coisa na sua operação?", "trial-silence"),
    pause("trial-silence", { dias: 8 }, "trial-day15"),
    msg("trial-day15", `Se a Mkton já está fazendo sentido, garanta a continuidade antes do trial acabar: ${input.checkout}`, "trial-wait17"),
    pause("trial-wait17", { dias: 2 }, "trial-day17"),
    msg("trial-day17", `Se a decisão é continuar, resolva aqui: ${input.checkout}`, "trial-task"),
    task("trial-task", "Ligar para lead em fase final do Trial · Mkton", input.userId, "trial-wait19", 60),
    pause("trial-wait19", { dias: 2 }, "trial-day19"),
    msg("trial-day19", `Seu período gratuito está chegando ao fim. Para manter tudo rodando: ${input.checkout}`, "trial-wait20"),
    pause("trial-wait20", { dias: 1 }, "trial-move-offers"),
    move("trial-move-offers", input.offers, input.offersStage, "trial-end"), end("trial-end"),
  ];
}

function offerBlocks(input: { expired: Funnel; expiredStage: Stage; checkout: string; userId: string }) {
  const copies = [
    `Você já testou a Mkton com implementação gratuita. Para manter a operação rodando: ${input.checkout}`,
    `Se CRM, automações e IA já estão ajudando sua rotina, continue por aqui: ${input.checkout}`,
    `Se quer preservar o processo que montamos, finalize sua assinatura: ${input.checkout}`,
    `Continuar a operação organizada ou voltar parte dela para o manual? Se fizer sentido continuar: ${input.checkout}`,
    `Último contato desta etapa. Para continuar com a Mkton: ${input.checkout}`,
  ];
  const delays = [{ dias: 2 }, { dias: 3 }, { dias: 3 }, { dias: 4 }, { dias: 3 }];
  const blocks: Block[] = [tag("offer-tag", "trial:ofertas", "offer-task"), task("offer-task", "Contato comercial forte · Trial expirado Mkton", input.userId, "offer-msg-1", 30)];
  for (let i = 0; i < copies.length; i++) {
    const n = i + 1; blocks.push(msg(`offer-msg-${n}`, copies[i], `offer-wait-${n}`));
    blocks.push(pause(`offer-wait-${n}`, delays[i], n < copies.length ? `offer-msg-${n + 1}` : "offer-expired"));
  }
  blocks.push(move("offer-expired", input.expired, input.expiredStage, "offer-end"), end("offer-end"));
  return blocks;
}

function reactivationCycleBlocks(input: { conversion: Funnel; conversionStage: Stage; retire: Stage }) {
  const schedule = [15, 30, 30, 45, 45, 60, 60, 60, 75, 75, 90, 90] as const;
  const angles = [
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
  const blocks: Block[] = [];
  for (let i = 0; i < schedule.length; i++) {
    const n = i + 1;
    blocks.push(race(`react-wait-${n}`, { dias: schedule[i] }, `react-msg-${n}`, "react-reply"));
    blocks.push(msg(`react-msg-${n}`, angles[i], n < schedule.length ? `react-wait-${n + 1}` : "react-final-wait"));
  }
  blocks.push(race("react-final-wait", { dias: 90 }, "react-retire", "react-reply"));
  blocks.push(move("react-reply", input.conversion, input.conversionStage, "react-end"));
  blocks.push({ id: "react-retire", kind: "acao", acaoTipo: "mudar-status-lead", destinoPipelineId: input.conversion.id, destinoPipelineNome: input.conversion.name, destinoStageId: input.retire.id, destinoStageNome: input.retire.name, destinoEtapa: input.retire.name, nextBlockId: "react-end" });
  blocks.push(end("react-end"));
  return blocks;
}

export async function provisionMktonFullOperation(input: { sb: AnySb; workspaceId: string; userId: string }) {
  const { sb, workspaceId, userId } = input;
  const leadEntry = await ensureFunnel(sb, workspaceId, "Leads de Entrada");
  const cadastro = await ensureFunnel(sb, workspaceId, "Cadastro");
  const pos = await ensureFunnel(sb, workspaceId, "Pós-venda");
  const reativacao = await ensureFunnel(sb, workspaceId, "Reativação");
  const social = await ensureFunnel(sb, workspaceId, "Rede Social");
  const afiliado = await ensureFunnel(sb, workspaceId, "Afiliado");

  const jornadaId = await fieldId(sb, workspaceId, "Jornada · Status");
  const trialId = await fieldId(sb, workspaceId, "Trial · Status");
  const assinaturaId = await fieldId(sb, workspaceId, "Assinatura · Status");
  const onboardingId = await fieldId(sb, workspaceId, "Onboarding · Status");
  const renovacaoId = await fieldId(sb, workspaceId, "Renovação · Status");
  const reativacaoOrigemId = await fieldId(sb, workspaceId, "Reativação · Origem");

  const forms = await provisionForms(sb, workspaceId);
  const origin = appOrigin();
  const checkout = await ensureTrackedLink(sb, { workspaceId, userId, slug: "ruanandradenegocios-checkout-trial", target: `${origin}/checkout`, label: "Checkout · Trial", content: "trial" });
  const checkoutOffers = await ensureTrackedLink(sb, { workspaceId, userId, slug: "ruanandradenegocios-checkout-ofertas", target: `${origin}/checkout`, label: "Checkout · Ofertas", content: "ofertas" });
  const socialSignup = await ensureTrackedLink(sb, { workspaceId, userId, slug: "ruanandradenegocios-cadastro-social", target: `${origin}/auth?mode=signup`, label: "Cadastro · Rede Social", content: "social" });

  const activationAgent = await ensureAgent(sb, workspaceId, {
    name: "Júlia Braga · Ativação Mkton",
    context: "Fazer o novo cadastro avançar para briefing, call de implementação e uso real da Mkton durante o trial.",
    prompt: `Você é Júlia Braga no pós-cadastro da Vanessa Simoni. O lead já se cadastrou. Acelere ativação e implementação. Use o nicho e os dados existentes, evite repetir perguntas e direcione ao briefing correto. Oferta: 20 dias grátis + implementação gratuita. Links: Geral ${forms.geral}; Imobiliário ${forms.imobiliario}; Advocacia ${forms.advocacia}; Saúde ${forms.saude}; Odontologia ${forms.odontologia}; Estética ${forms.estetica}; Agência/Marketing ${forms["agencia-marketing"]}; Educação ${forms.educacao}; Serviços ${forms.servicos}; Comércio ${forms.comercio}. Prioridade: briefing + call + primeiro valor entregue. Mensagens curtas.`,
  });
  const reactivationAgent = await ensureAgent(sb, workspaceId, {
    name: "Júlia Braga · Reativação Mkton",
    context: "Retomar leads antigos respeitando o histórico: aquisição sem cadastro, ex-trial ou ex-cliente.",
    prompt: "Você é Júlia Braga na reativação da Vanessa Simoni. Leia histórico, tags e campos antes de responder. Se nunca cadastrou, objetivo = cadastro. Se já testou, objetivo = assinatura/retorno. Se já foi cliente, objetivo = recontratação. Atualize o contexto e conduza para um próximo passo concreto.",
  });
  const socialAgent = await ensureAgent(sb, workspaceId, {
    name: "Júlia Braga · Redes Sociais Mkton",
    context: "Qualificar rapidamente contatos de redes sociais e migrar para cadastro/WhatsApp sem venda longa por DM.",
    prompt: `Você é Júlia Braga nas redes sociais da Vanessa Simoni. Qualifique de forma curta e leve para cadastro ou WhatsApp. Link: ${socialSignup}.`,
  });

  const bots: Array<{ id: string; name: string; blocks: number }> = [];
  const add = async (spec: BotSpec) => bots.push(await upsertBot(sb, workspaceId, spec));

  await add({ id: "mkton-registration-bridge", name: "Mkton · Cadastro Realizado → New Cad", pipelineId: leadEntry.id, pipelineName: leadEntry.name, stageId: stage(leadEntry, "Cadastro Realizado").id, stageName: "Cadastro Realizado", startBlockId: "reg-tag", blocks: [tag("reg-tag", "jornada:cadastro-realizado", "reg-field"), field("reg-field", jornadaId, "Jornada · Status", "cadastro_realizado", "reg-move"), move("reg-move", cadastro, stage(cadastro, "New Cad"), "reg-end"), end("reg-end")] });
  await add({ id: "mkton-cad-lost-bridge", name: "Mkton · CAD Lost → Reativação", pipelineId: leadEntry.id, pipelineName: leadEntry.name, stageId: stage(leadEntry, "CAD Lost").id, stageName: "CAD Lost", startBlockId: "lost-origin", blocks: [field("lost-origin", reativacaoOrigemId, "Reativação · Origem", "entrada_ads", "lost-tag"), tag("lost-tag", "reativacao:entrada", "lost-move"), move("lost-move", reativacao, stage(reativacao, "Entrada Reativação"), "lost-end"), end("lost-end")] });

  await add({ id: "mkton-new-cad", name: "Mkton · New Cad · Implementação", pipelineId: cadastro.id, pipelineName: cadastro.name, stageId: stage(cadastro, "New Cad").id, stageName: "New Cad", startBlockId: "new-tag", blocks: [tag("new-tag", "jornada:new-cad", "new-field"), field("new-field", trialId, "Trial · Status", "iniciando", "new-msg"), msg("new-msg", "Cadastro feito. Agora vamos colocar a Mkton para funcionar na sua operação; a implementação é por nossa conta.", "new-task"), task("new-task", "Agendar/realizar call de implementação Mkton", userId, "new-ai", 30), ai("new-ai", activationAgent, "Júlia Braga · Ativação Mkton", "Com o que você trabalha hoje?", "new-wait"), pause("new-wait", { horas: 6 }, "new-move"), move("new-move", cadastro, stage(cadastro, "Trial"), "new-end"), end("new-end")] });
  await add({ id: "mkton-trial-20d", name: "Mkton · Trial 20 dias", pipelineId: cadastro.id, pipelineName: cadastro.name, stageId: stage(cadastro, "Trial").id, stageName: "Trial", startBlockId: "trial-tag", blocks: trialBlocks({ statusFieldId: trialId, offers: cadastro, offersStage: stage(cadastro, "Ofertas"), userId, checkout }) });
  await add({ id: "mkton-offers-close", name: "Mkton · Ofertas · Fechamento", pipelineId: cadastro.id, pipelineName: cadastro.name, stageId: stage(cadastro, "Ofertas").id, stageName: "Ofertas", startBlockId: "offer-tag", blocks: offerBlocks({ expired: cadastro, expiredStage: stage(cadastro, "Trial Expirado"), checkout: checkoutOffers, userId }) });
  await add({ id: "mkton-signed-bridge", name: "Mkton · Assinou → Pós-venda", pipelineId: cadastro.id, pipelineName: cadastro.name, stageId: stage(cadastro, "Assinou").id, stageName: "Assinou", startBlockId: "signed-tag", blocks: [tag("signed-tag", "cliente:ativo", "signed-field"), field("signed-field", assinaturaId, "Assinatura · Status", "ativa", "signed-task"), task("signed-task", "Validar implementação do novo cliente Mkton", userId, "signed-move", 30), move("signed-move", pos, stage(pos, "Onboarding"), "signed-end"), end("signed-end")] });
  await add({ id: "mkton-expired-bridge", name: "Mkton · Trial Expirado → Reativação", pipelineId: cadastro.id, pipelineName: cadastro.name, stageId: stage(cadastro, "Trial Expirado").id, stageName: "Trial Expirado", startBlockId: "exp-origin", blocks: [field("exp-origin", reativacaoOrigemId, "Reativação · Origem", "ex_trial", "exp-tag"), tag("exp-tag", "reativacao:ex-trial", "exp-move"), move("exp-move", reativacao, stage(reativacao, "Entrada Reativação"), "exp-end"), end("exp-end")] });

  await add({ id: "mkton-onboarding", name: "Mkton · Onboarding 3 dias", pipelineId: pos.id, pipelineName: pos.name, stageId: stage(pos, "Onboarding").id, stageName: "Onboarding", startBlockId: "on-tag", blocks: [tag("on-tag", "cliente:onboarding", "on-field"), field("on-field", onboardingId, "Onboarding · Status", "ativo", "on-msg1"), msg("on-msg1", "Obrigado pela confiança. Como estão sendo esses primeiros passos com a Mkton?", "on-task"), task("on-task", "Acompanhar onboarding do novo cliente Mkton", userId, "on-wait1", 60), pause("on-wait1", { dias: 1 }, "on-msg2"), msg("on-msg2", "O que você mais gostou e o que ainda precisa de ajuste?", "on-wait2"), pause("on-wait2", { dias: 1 }, "on-msg3"), msg("on-msg3", "Terceiro dia: o que já mudou na sua operação?", "on-move"), move("on-move", pos, stage(pos, "Standby"), "on-end"), end("on-end")] });
  await add({ id: "mkton-postsale-standby", name: "Mkton · Pós-venda · Standby", pipelineId: pos.id, pipelineName: pos.name, stageId: stage(pos, "Standby").id, stageName: "Standby", startBlockId: "ps-w15", blocks: [pause("ps-w15", { dias: 15 }, "ps-m15"), msg("ps-m15", "Como a Mkton está encaixando na rotina? Tem algo que você quer melhorar?", "ps-w20"), pause("ps-w20", { dias: 20 }, "ps-m20"), msg("ps-m20", "Tem alguma automação ou etapa que ainda pode ficar mais redonda?", "ps-w30"), pause("ps-w30", { dias: 30 }, "ps-m30"), msg("ps-m30", "A Mkton continua entregando o que você esperava?", "ps-loop"), pause("ps-loop", { dias: 30 }, "ps-m15")] });
  await add({ id: "mkton-renewal", name: "Mkton · Renovação do Plano", pipelineId: pos.id, pipelineName: pos.name, stageId: stage(pos, "Renovação do Plano").id, stageName: "Renovação do Plano", startBlockId: "ren-tag", blocks: [tag("ren-tag", "cliente:renovacao", "ren-field"), field("ren-field", renovacaoId, "Renovação · Status", "em_negociacao", "ren-msg1"), msg("ren-msg1", "Seu ciclo está chegando ao fim. Quer que eu deixe a renovação encaminhada?", "ren-task"), task("ren-task", "Renovar plano do cliente Mkton", userId, "ren-w", 60), pause("ren-w", { dias: 5 }, "ren-msg2"), msg("ren-msg2", `Para manter sua operação sem interrupção: ${checkout}`, "ren-end"), end("ren-end")] });
  await add({ id: "mkton-renewed", name: "Mkton · Renovado → Standby", pipelineId: pos.id, pipelineName: pos.name, stageId: stage(pos, "Venda Fechada").id, stageName: "Venda Fechada", startBlockId: "renewed-field", blocks: [field("renewed-field", renovacaoId, "Renovação · Status", "renovado", "renewed-tag"), tag("renewed-tag", "cliente:renovado", "renewed-move"), move("renewed-move", pos, stage(pos, "Standby"), "renewed-end"), end("renewed-end")] });
  await add({ id: "mkton-postsale-lost", name: "Mkton · Venda Perdida → Reativação", pipelineId: pos.id, pipelineName: pos.name, stageId: stage(pos, "Venda Perdida").id, stageName: "Venda Perdida", startBlockId: "pl-origin", blocks: [field("pl-origin", reativacaoOrigemId, "Reativação · Origem", "ex_cliente", "pl-tag"), tag("pl-tag", "reativacao:ex-cliente", "pl-move"), move("pl-move", reativacao, stage(reativacao, "Entrada Reativação"), "pl-end"), end("pl-end")] });

  await add({ id: "mkton-reactivation-entry", name: "Mkton · Reativação 18 meses", pipelineId: reativacao.id, pipelineName: reativacao.name, stageId: stage(reativacao, "Entrada Reativação").id, stageName: "Entrada Reativação", startBlockId: "react-tag", blocks: [tag("react-tag", "jornada:reativacao", "react-field"), field("react-field", jornadaId, "Jornada · Status", "reativacao", "react-wait-1"), ...reactivationCycleBlocks({ conversion: reativacao, conversionStage: stage(reativacao, "Em Conversão"), retire: stage(reativacao, "Encerrar Base") })] });
  await add({ id: "mkton-reactivation-ai", name: "Mkton · Reativação · Júlia", pipelineId: reativacao.id, pipelineName: reativacao.name, stageId: stage(reativacao, "Em Conversão").id, stageName: "Em Conversão", startBlockId: "react-ai", blocks: [ai("react-ai", reactivationAgent, "Júlia Braga · Reativação Mkton", "Que bom que você respondeu. O que mudou na sua operação desde a última vez que conversamos?", "react-ai-task"), task("react-ai-task", "Acompanhar lead reativado Mkton", userId, "react-ai-end", 30), end("react-ai-end")] });
  await add({ id: "mkton-reactivation-retire", name: "Mkton · Encerrar Base · Proteção", pipelineId: reativacao.id, pipelineName: reativacao.name, stageId: stage(reativacao, "Encerrar Base").id, stageName: "Encerrar Base", startBlockId: "retire-task", blocks: [task("retire-task", "Revisar lead antes de excluir da base Mkton", userId, "retire-end", 0), end("retire-end")] });

  await add({ id: "mkton-social-reception", name: "Mkton · Rede Social · Recepção", pipelineId: social.id, pipelineName: social.name, stageId: stage(social, "Recepção Social").id, stageName: "Recepção Social", startBlockId: "social-tag", blocks: [tag("social-tag", "canal:rede-social", "social-msg"), msg("social-msg", `Oi! Se quiser testar a Mkton, seu cadastro está aqui: ${socialSignup}. Se preferir, me responde e eu entendo seu cenário primeiro.`, "social-race"), race("social-race", { horas: 2 }, "social-no-reply", "social-reply"), move("social-reply", social, stage(social, "Qualificação IA"), "social-end"), move("social-no-reply", social, stage(social, "Sem Conversão"), "social-end"), end("social-end")] });
  await add({ id: "mkton-social-ai", name: "Mkton · Rede Social · Júlia", pipelineId: social.id, pipelineName: social.name, stageId: stage(social, "Qualificação IA").id, stageName: "Qualificação IA", startBlockId: "social-ai", blocks: [ai("social-ai", socialAgent, "Júlia Braga · Redes Sociais Mkton", "Com o que você trabalha e o que mais te incomoda hoje no atendimento/comercial?", "social-ai-end"), end("social-ai-end")] });
  await add({ id: "mkton-social-registered", name: "Mkton · Social Cadastro → Cadastro", pipelineId: social.id, pipelineName: social.name, stageId: stage(social, "Cadastro Realizado").id, stageName: "Cadastro Realizado", startBlockId: "sr-tag", blocks: [tag("sr-tag", "origem:rede-social", "sr-move"), move("sr-move", cadastro, stage(cadastro, "New Cad"), "sr-end"), end("sr-end")] });
  await add({ id: "mkton-social-lost", name: "Mkton · Social sem conversão → Reativação", pipelineId: social.id, pipelineName: social.name, stageId: stage(social, "Sem Conversão").id, stageName: "Sem Conversão", startBlockId: "sl-origin", blocks: [field("sl-origin", reativacaoOrigemId, "Reativação · Origem", "rede_social", "sl-move"), move("sl-move", reativacao, stage(reativacao, "Entrada Reativação"), "sl-end"), end("sl-end")] });

  for (const s of ["Em Cadastro", "Cadastrado", "Primeira Venda", "Em Progressão", "Ativo"]) {
    await add({ id: `mkton-affiliate-${norm(s).replace(/[^a-z0-9]+/g, "-")}`, name: `Mkton · Afiliado · ${s}`, pipelineId: afiliado.id, pipelineName: afiliado.name, stageId: stage(afiliado, s).id, stageName: s, startBlockId: "aff-task", blocks: [task("aff-task", `Revisar afiliado/parceiro · ${s}`, userId, "aff-end", 0), end("aff-end")] });
  }

  return { funnels: { leadEntry, cadastro, pos, reativacao, social, afiliado }, agents: { activationAgent, reactivationAgent, socialAgent }, forms, links: { checkout, checkoutOffers, socialSignup }, bots };
}
