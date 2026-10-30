// Tipos do CRM. Sem dados simulados - os funis vêm do banco via server fns.

export type LeadStatus = "aberta" | "ganha" | "perdida";
export type LeadMessageDirection = "lead" | "us" | "none";

export interface CrmLead {
 id: string;
 name: string;
 company?: string;
 companyId?: string | null;
 avatar?: string;
 value: number;
 source: "whatsapp" | "instagram" | "facebook" | "google" | "indicacao" | "outro";
 tags?: string[];
 lastMessageFrom: LeadMessageDirection;
 lastMessageAt?: string;
 lastMessagePreview?: string;
 unreadCount?: number;
 owner?: string;
 createdAt: string;
}

export interface FunnelStage {
 id: string;
 name: string;
 status: LeadStatus;
 leads: CrmLead[];
 color?: string | null;
 description?: string | null;
}


export interface Funnel {
 id: string;
 name: string;
 stages: FunnelStage[];
}

// Sem nenhum funil simulado - a página carrega via server fn ao montar.
export const FUNNELS: Funnel[] = [];

export type TriggerChannel =
 | "whatsapp" | "email" | "tarefa" | "ia" | "webhook" | "meta" | "facebook"
 | "tiktok" | "google" | "lead" | "tags" | "campo" | "form" | "etapa"
 | "user" | "arquivo";

// Config estruturada por tipo de gatilho (para os que são executáveis)
export type WebhookPreset =
 | "custom"
 | "sale-won"
 | "sale-lost"
 | "remarketing"
 | "meeting"
 | "billing"
 | "lead-qualified";

export type TagsMode = "add" | "remove" | "replace";

export type AutomationConfig =
 | { kind: "mudar-etapa"; pipelineId?: string; pipelineNome?: string; stageId?: string; stageNome?: string }
 | { kind: "editar-tags"; mode?: TagsMode; add?: string[]; remove?: string[]; replace?: string[] }
 | { kind: "alterar-user"; userId?: string; userNome?: string }
 | { kind: "alterar-campo"; campo?: "name" | "email" | "phone" | "value" | "custom"; valor?: string; customFieldId?: string; customFieldNome?: string; customFieldType?: string }
  | {
     kind: "tarefa";
     titulo?: string;
     descricao?: string;
     /** legado: prazo em dias */
     diasAdiante?: number;
     /** Prazo relativo: valor + unidade (imediato = 0). */
     prazoValor?: number;
     prazoUnidade?: "minutos" | "horas" | "dias";
     /** Onde a tarefa é criada. */
     destino?: "calendario" | "fluxo" | "ambos";
     /** Se preenchido, a tarefa cai no Fluxo de Trabalho (Kanban). */
     workflowPipelineId?: string;
     workflowPipelineNome?: string;
     workflowStageId?: string;
     workflowStageNome?: string;
     workflowAssigneeId?: string;
     workflowAssigneeNome?: string;
     workflowPriority?: "baixa" | "media" | "alta" | "urgente";
     workflowTags?: string[];
    }

 | { kind: "tarefa-concluida"; escopo?: "todas" | "especifica"; taskId?: string; taskTitulo?: string }
 | { kind: "excluir-tarefas"; escopo?: "todas" | "especifica"; taskId?: string; taskTitulo?: string }
 | { kind: "excluir-lead" }
 | { kind: "duplicar-lead"; manterEtapa?: boolean; toStageId?: string; toStageNome?: string }
 | { kind: "salesbot"; botId?: string; botNome?: string }
 | { kind: "executar-ia"; agentId?: string; agentNome?: string }
 | { kind: "pausar-ia" }
 | { kind: "msg-interna"; toUserId?: string; toUserNome?: string; mensagem?: string }
 | { kind: "gerar-form"; formId?: string; formNome?: string; canal?: "whatsapp" | "email" | "link"; mensagem?: string }
 | { kind: "deletar-arquivos"; escopo?: "todos" | "descartados" | "por-tipo" | "por-tag"; tipo?: string; tag?: string }
 | {
    kind: "meta-ads";
    modo?: "capturar" | "enviar";
    pixelId?: string;
    accessTokenSecret?: string; // referência ao nome do secret configurado
    eventName?: "Lead" | "Purchase" | "LeadLost" | "CompleteRegistration" | "Contact" | "Schedule" | "custom";
    customEventName?: string;
    valorPadrao?: string;
    moeda?: "BRL" | "USD" | "EUR";
    testEventCode?: string;
   }
 | {
    kind: "webhook";
    preset: WebhookPreset;
    url?: string;
    secret?: string;
    method?: "POST" | "PUT";
    // extras opcionais por preset
    audienceName?: string;   // remarketing
    motivoPadrao?: string;   // sale-lost
    valorPadrao?: string;    // billing
    metodo?: string;         // billing (pix / boleto / cartão)
    headersExtra?: string;   // livre, pares "chave: valor" por linha
   }
 | {
    kind: "webhook-inbound";
    // Etapa onde novos leads recebidos por este webhook serão criados (default: a etapa atual).
    createInStageId?: string;
    createInStageNome?: string;
    // Mapeamento JSON -> campos do lead. Ex.: { name: "full_name", email: "email", phone: "phone" }
    mapName?: string;
    mapEmail?: string;
    mapPhone?: string;
    mapValue?: string;
    mapTags?: string;      // caminho dentro do JSON pra array de tags
    sourceLabel?: string;  // rótulo pra identificar origem dos leads (ex.: "Meta Ads")
    secretRotated?: string; // marca visual, força regeneração da URL
   }
  | { kind: "vincular-produto"; productId?: string; productNome?: string; productKind?: "interesse" | "comprou" }
  | { kind: "none" };

/** Regra de execução do gatilho (quando disparar, para quem, em qual janela). */
export type TriggerKind =
 | "created-or-moved" | "created-only" | "moved-only"
 | "assignee-changed" | "tag-added" | "field-updated"
 | "hours-before-field" | "exact-datetime" | "daily"
 | "form-submitted" | "email-received" | "call-received"
 | "chat-started-inbound" | "hours-after-last-message"
 | "message-received-after-pause" | "ig-story-mention"
 | "ig-post-comment" | "outbound-message-seen"
 | "immediately-after-conversation-close";

export type TriggerSpec =
 | { kind: "created-or-moved" }
 | { kind: "created-only" }
 | { kind: "moved-only" }
 | { kind: "assignee-changed" }
 | { kind: "tag-added"; tags?: string[] }
 | { kind: "field-updated"; entity?: "lead" | "produto"; fieldId?: string; fieldName?: string }
 | { kind: "hours-before-field"; hours: number; fieldId?: string; fieldName?: string }
 | { kind: "exact-datetime"; at: string }
 | { kind: "daily"; time: string }
 | { kind: "form-submitted"; formId?: string; formName?: string }
 | { kind: "email-received" }
 | { kind: "call-received" }
 | { kind: "chat-started-inbound"; channel?: string; channelLabel?: string }
 | { kind: "hours-after-last-message"; hours: number; channel?: string; channelLabel?: string }
 | { kind: "message-received-after-pause"; channel?: string; channelLabel?: string; pause?: "1h" | "1d" | "3d" | "7d" }
 | { kind: "ig-story-mention"; channel?: string; channelLabel?: string }
 | { kind: "ig-post-comment"; postId?: string; postLabel?: string }
 | { kind: "outbound-message-seen"; channel?: string; channelLabel?: string; within?: "24h" | "7d" }
 | { kind: "immediately-after-conversation-close"; channel?: string; channelLabel?: string };

/** Retrocompat, versões antigas salvavam apenas a string. */
export type ExecutionTrigger = TriggerSpec | "created-or-moved" | "created-only" | "moved-only";

export function normalizeTrigger(t?: ExecutionTrigger): TriggerSpec {
 if (!t) return { kind: "created-or-moved" };
 if (typeof t === "string") return { kind: t };
 return t;
}

export type ActiveMode = "always" | "business-hours" | "custom";
export type ConditionField =
 | "tag" | "no-tag"
 | "assignee"
 | "value"
 | "custom-field"
 | "utm_source" | "utm_medium" | "utm_campaign"
 | "utm_content" | "utm_term" | "utm_referrer"
 | "source" | "name" | "email" | "phone";
export type ConditionOp = "eq" | "neq" | "contains" | "in" | "not-in" | "gt" | "lt";
export interface ExecutionCondition {
  field: ConditionField;
  op: ConditionOp;
  value: string;
  customFieldId?: string;
  customFieldNome?: string;
}
export interface ExecutionConfig {
  sourceFilter?: string[];
  conditions?: ExecutionCondition[];
  trigger?: ExecutionTrigger;
   /** Atraso real antes de executar a ação. 0/undefined = imediato. */
   delayMinutes?: number;
   delayUnit?: "minutes" | "hours" | "days";
  active?: ActiveMode;
  /** Retrocompat: janela única. */
  activeWindow?: { days: number[]; from: string; to: string };
  /** Vários períodos ativos (dias + horário). Se preenchido, tem prioridade. */
  activeWindows?: Array<{ days: number[]; from: string; to: string }>;

  leaveUnanswered?: boolean;
  applyToExisting?: boolean;
}


export interface AutomationAction {
 id: string;
 triggerId: string; // referência ao TriggerCatalogItem.id
 title: string;
 description: string;
 channel: TriggerChannel;
 popular?: boolean;
 enabled?: boolean;
 config?: AutomationConfig;
 /** Regras de quando/para quem disparar (janela horária, filtros, etc.). */
 execution?: ExecutionConfig;
 /**
  * Etapas contíguas cobertas por este gatilho.
  * Quando ausente/undefined, o gatilho funciona só na etapa em que foi criado (retrocompat).
  * Quando preenchido, dispara ao entrar em qualquer dessas etapas (dedupe por triggerId).
  */
 stageIds?: string[];
}


export interface TriggerCatalogItem {
 id: string;
 title: string;
 channel: TriggerChannel;
 group: "IA & Bots" | "Integrações" | "Comunicação" | "CRM" | "Dados";
 description: string;
}

// Catálogo de gatilhos disponíveis (puramente descritivo - não é "dado").
export const TRIGGER_CATALOG: TriggerCatalogItem[] = [
 { id: "salesbot", title: "SalesBot", channel: "ia", group: "IA & Bots", description: "Escolhe qual SalesBot enviar ao lead nesta etapa." },
 { id: "executar-ia", title: "Executar Agente IA", channel: "ia", group: "IA & Bots", description: "Ativa um Agente de IA pra conduzir a conversa com o lead." },
 { id: "pausar-ia", title: "Pausar Agente IA", channel: "ia", group: "IA & Bots", description: "Desativa o Agente de IA ativo no lead." },
 { id: "meta", title: "Meta Ads", channel: "meta", group: "Integrações", description: "Captura e envia eventos pra Meta Ads (Conversions API)." },
 { id: "msg-interna", title: "Enviar mensagem interna", channel: "user", group: "Comunicação", description: "Notifica um usuário do time (comentário interno)." },
 { id: "webhook", title: "Enviar webhook", channel: "webhook", group: "Comunicação", description: "Notifica um sistema externo." },
 { id: "duplicar-lead", title: "Duplicar lead", channel: "lead", group: "CRM", description: "Cria uma cópia do lead (mesma etapa ou outra)." },
 { id: "tarefa", title: "Adicionar tarefa", channel: "tarefa", group: "CRM", description: "Cria tarefa pro vendedor." },
 { id: "tarefa-concluida", title: "Concluir tarefas", channel: "tarefa", group: "CRM", description: "Marca uma tarefa específica, ou todas, como concluídas." },
 { id: "excluir-tarefas", title: "Excluir tarefas", channel: "tarefa", group: "CRM", description: "Remove uma tarefa específica, ou todas, do lead." },
 { id: "mudar-etapa", title: "Mudar etapa do lead", channel: "etapa", group: "CRM", description: "Move o lead pra outra etapa." },
 { id: "editar-tags", title: "Tags", channel: "tags", group: "CRM", description: "Adiciona, remove ou substitui as tags do lead." },
 { id: "alterar-user", title: "Alterar usuário do lead", channel: "user", group: "CRM", description: "Reatribui o lead a outro vendedor." },
 { id: "alterar-campo", title: "Alterar campo", channel: "campo", group: "CRM", description: "Atualiza um campo padrão ou personalizado." },
 { id: "excluir-lead", title: "Excluir lead", channel: "lead", group: "CRM", description: "Remove o lead permanentemente ao entrar na etapa." },
  { id: "deletar-arquivos", title: "Deletar arquivos", channel: "arquivo", group: "Dados", description: "Limpa arquivos do lead segundo classificação (Central de Arquivos)." },
  { id: "vincular-produto", title: "Vincular produto", channel: "campo", group: "Dados", description: "Associa um produto do catálogo ao lead no CRM (interesse ou compra)." },
  // Webhooks, preset family
 { id: "webhook-venda-ganha", title: "Webhook · Venda ganha", channel: "webhook", group: "Integrações", description: "Avisa um sistema externo quando o lead fecha (conversão)." },
 { id: "webhook-venda-perdida", title: "Webhook · Venda perdida", channel: "webhook", group: "Integrações", description: "Notifica quando o lead é marcado como perdido, bom pra pesquisas de motivo." },
 { id: "webhook-remarketing", title: "Webhook · Remarketing", channel: "webhook", group: "Integrações", description: "Manda dados do lead pra audiência de remarketing (Meta/Google/CRM externo)." },
 { id: "webhook-reuniao", title: "Webhook · Reunião marcada", channel: "webhook", group: "Integrações", description: "Alerta agenda / Slack / calendário quando uma reunião é agendada." },
 { id: "webhook-cobranca", title: "Webhook · Solicitar cobrança", channel: "webhook", group: "Integrações", description: "Dispara pedido de cobrança pra Asaas, Pagar.me ou seu gateway." },
 { id: "webhook-lead-qualificado", title: "Webhook · Novo lead qualificado", channel: "webhook", group: "Integrações", description: "Empurra o lead qualificado pra outro CRM / planilha / time comercial." },
 { id: "webhook-entrada", title: "Receber webhook (URL de entrada)", channel: "webhook", group: "Integrações", description: "Cria leads automaticamente a partir de POSTs de sistemas externos (Meta Ads, checkout, formulários…)." },
];

// Presets de webhook, id do catálogo -> preset
export const WEBHOOK_PRESET_BY_TRIGGER: Record<string, WebhookPreset> = {
 "webhook": "custom",
 "webhook-venda-ganha": "sale-won",
 "webhook-venda-perdida": "sale-lost",
 "webhook-remarketing": "remarketing",
 "webhook-reuniao": "meeting",
 "webhook-cobranca": "billing",
 "webhook-lead-qualificado": "lead-qualified",
};

export const WEBHOOK_PRESET_LABEL: Record<WebhookPreset, string> = {
 "custom": "Webhook customizado",
 "sale-won": "Venda ganha",
 "sale-lost": "Venda perdida",
 "remarketing": "Remarketing",
 "meeting": "Reunião marcada",
 "billing": "Cobrança",
 "lead-qualified": "Lead qualificado",
};

export const WEBHOOK_PRESET_EVENT: Record<WebhookPreset, string> = {
 "custom": "lead.stage_entered",
 "sale-won": "sale.won",
 "sale-lost": "sale.lost",
 "remarketing": "remarketing.add",
 "meeting": "meeting.scheduled",
 "billing": "billing.request",
 "lead-qualified": "lead.qualified",
};

/** Payload que será enviado, usado no preview do dialog e (futuramente) pelo runner. */
export function webhookPreviewPayload(cfg: Extract<AutomationConfig, { kind: "webhook" }>): Record<string, unknown> {
 const base = {
  event: WEBHOOK_PRESET_EVENT[cfg.preset],
  event_id: "evt_<gerado_no_envio>",
  workspace_id: "<ws_id>",
  sent_at: "<ISO-8601>",
  lead: {
   id: "<lead_id>",
   name: "Fulano de Tal",
   email: "fulano@exemplo.com",
   phone: "5511999998888",
   value: 1500,
   tags: ["quente"],
   pipeline: "Funil principal",
   stage_from: "Negociação",
   stage_to: "Fechado",
   responsible: { id: "<user_id>", name: "Vendedor" },
  },
 };
 switch (cfg.preset) {
  case "sale-won":
   return { ...base, sale: { valor: 1500, produto: "<produto>", vendedor_id: "<user_id>", data_fechamento: "<ISO-8601>" } };
  case "sale-lost":
   return { ...base, loss: { motivo: cfg.motivoPadrao ?? "<preenchido pelo vendedor>", etapa: "<última etapa>", valor_previsto: 1500 } };
  case "remarketing":
   return { ...base, audience: cfg.audienceName ?? "<nome-da-audiencia>", hashes: { email_sha256: "<hash>", phone_sha256: "<hash>" } };
  case "meeting":
   return { ...base, meeting: { agendada_para: "<ISO-8601>", link: "<url>", vendedor_id: "<user_id>" } };
  case "billing":
   return { ...base, billing: { valor: Number(cfg.valorPadrao) || 0, metodo: cfg.metodo ?? "pix", vencimento: "<ISO-8601>" } };
  case "lead-qualified":
   return { ...base, qualification: { score: 80, etapa: "<etapa atual>" } };
  case "custom":
  default:
   return base;
 }
}

// IDs com execução real de ponta a ponta (o runner de automações executa a ação).
// Só entra aqui o que roda de verdade. O que ainda está em integração fica de fora
// e aparece apenas para o super admin, marcado com o ponto rosa.
export const ACTIONABLE_TRIGGER_IDS = new Set<string>([
 "mudar-etapa",
 "editar-tags",
 "alterar-user",
 "alterar-campo",
 "tarefa",
 "tarefa-concluida",
 "excluir-tarefas",
 "excluir-lead",
 "duplicar-lead",
 "pausar-ia",
 "msg-interna",
 "webhook",
 "webhook-venda-ganha",
 "webhook-venda-perdida",
 "webhook-remarketing",
 "webhook-reuniao",
 "webhook-cobranca",
 "webhook-lead-qualificado",
 "meta",
 "salesbot",
 "executar-ia",
 "gerar-form",
  "deletar-arquivos",
  "vincular-produto",
  // "webhook-entrada": ainda em integração — o runner marca como skipped e nenhuma
 // URL de entrada é registrada no backend por este gatilho.
]);

export function triggerIsImplemented(triggerId: string): boolean {
 return ACTIONABLE_TRIGGER_IDS.has(triggerId);
}


// Mapeia id do catálogo -> kind da config
export function configKindFor(triggerId: string): AutomationConfig["kind"] {
 switch (triggerId) {
  case "mudar-etapa": return "mudar-etapa";
  case "editar-tags": return "editar-tags";
  case "alterar-user": return "alterar-user";
  case "alterar-campo": return "alterar-campo";
  case "tarefa": return "tarefa";
  case "tarefa-concluida": return "tarefa-concluida";
  case "excluir-tarefas": return "excluir-tarefas";
  case "excluir-lead": return "excluir-lead";
  case "duplicar-lead": return "duplicar-lead";
  case "salesbot": return "salesbot";
  case "executar-ia": return "executar-ia";
  case "pausar-ia": return "pausar-ia";
  case "msg-interna": return "msg-interna";
  case "gerar-form": return "gerar-form";
  case "deletar-arquivos": return "deletar-arquivos";
  case "vincular-produto": return "vincular-produto";
  case "meta": return "meta-ads";
  case "webhook-entrada": return "webhook-inbound";
  default:
   if (triggerId in WEBHOOK_PRESET_BY_TRIGGER) return "webhook";
   return "none";
 }
}

/** Gatilhos que já possuem UI de configuração pronta (mesmo que a execução real ainda não exista). */
export function triggerHasConfigUI(triggerId: string): boolean {
 return (
  triggerIsImplemented(triggerId)
  || triggerId in WEBHOOK_PRESET_BY_TRIGGER
  || triggerId === "webhook-entrada"
  || configKindFor(triggerId) !== "none"
 );
}

// Descreve o config para exibição no chip da automação
export function describeAutomationConfig(cfg?: AutomationConfig): string {
 if (!cfg || cfg.kind === "none") return "";
 switch (cfg.kind) {
  case "mudar-etapa":
   return cfg.stageNome ? `→ ${cfg.pipelineNome ? cfg.pipelineNome + " · " : ""}${cfg.stageNome}` : "(configurar etapa)";
  case "editar-tags": {
   const parts: string[] = [];
   const mode = cfg.mode ?? "add";
   if (mode === "replace" && cfg.replace?.length) return `= ${cfg.replace.join(", ")}`;
   if (cfg.add?.length) parts.push(`+ ${cfg.add.join(", ")}`);
   if (cfg.remove?.length) parts.push(`− ${cfg.remove.join(", ")}`);
   return parts.join(" · ") || "(configurar tags)";
  }
  case "alterar-user":
   return cfg.userNome ? `→ ${cfg.userNome}` : "(escolher usuário)";
  case "alterar-campo": {
   const label = cfg.campo === "custom" ? (cfg.customFieldNome ?? "campo") : (cfg.campo ?? "");
   return label ? `${label} = ${cfg.valor ?? ""}` : "(configurar campo)";
  }
  case "tarefa":
   return cfg.titulo ? `"${cfg.titulo}"` : "(sem título)";
  case "tarefa-concluida":
   return cfg.escopo === "especifica" && cfg.taskTitulo ? `concluir "${cfg.taskTitulo}"` : "concluir todas";
  case "excluir-tarefas":
   return cfg.escopo === "especifica" && cfg.taskTitulo ? `excluir "${cfg.taskTitulo}"` : "excluir todas";
  case "excluir-lead":
   return "remove o lead";
  case "duplicar-lead":
   return cfg.toStageNome ? `duplicar → ${cfg.toStageNome}` : "duplicar (mesma etapa)";
  case "salesbot":
   return cfg.botNome ? cfg.botNome : "(escolher SalesBot)";
  case "executar-ia":
   return cfg.agentNome ? `agente: ${cfg.agentNome}` : "(escolher Agente)";
  case "pausar-ia":
   return "pausa o agente";
  case "msg-interna":
   return cfg.toUserNome ? `→ ${cfg.toUserNome}` : "(escolher destinatário)";
  case "gerar-form":
   return cfg.formNome ? `form: ${cfg.formNome}` : "(escolher formulário)";
  case "deletar-arquivos": {
   const esc = cfg.escopo ?? "todos";
   if (esc === "por-tipo") return `arquivos · tipo ${cfg.tipo ?? "?"}`;
   if (esc === "por-tag") return `arquivos · tag ${cfg.tag ?? "?"}`;
   if (esc === "descartados") return "arquivos · descartados";
   return "arquivos · todos";
  }
  case "meta-ads": {
   const ev = cfg.eventName === "custom" ? (cfg.customEventName ?? "custom") : (cfg.eventName ?? "Lead");
   return cfg.modo === "capturar" ? `capturar · ${ev}` : `enviar · ${ev}`;
  }
  case "webhook": {
   const label = WEBHOOK_PRESET_LABEL[cfg.preset] ?? "webhook";
   if (!cfg.url) return `${label} · (colar URL)`;
   try {
    const host = new URL(cfg.url).host;
    return `${label} → ${host}`;
   } catch {
    return `${label} · URL inválida`;
   }
  }
  case "webhook-inbound":
   return cfg.sourceLabel ? `entrada · ${cfg.sourceLabel}` : "entrada · (URL única)";
 }
 return "";
}

const DAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function describeTrigger(t?: ExecutionTrigger): string {
 const spec = normalizeTrigger(t);
 switch (spec.kind) {
  case "created-or-moved": return "criado ou movido";
  case "created-only": return "só quando criado";
  case "moved-only": return "só quando movido";
  case "assignee-changed": return "responsável alterado";
  case "tag-added": return spec.tags?.length ? `tag adicionada: ${spec.tags.join(", ")}` : "tag adicionada";
  case "field-updated": return `campo atualizado${spec.fieldName ? `: ${spec.fieldName}` : ""}`;
  case "hours-before-field": return `${spec.hours}h antes de ${spec.fieldName ?? "campo"}`;
  case "exact-datetime": return `tempo exato · ${spec.at}`;
  case "daily": return `diariamente às ${spec.time}`;
  case "form-submitted": return spec.formName ? `formulário: ${spec.formName}` : "formulário enviado";
  case "email-received": return "e-mail recebido";
  case "call-received": return "chamada recebida";
  case "chat-started-inbound": return `chat iniciado · ${spec.channelLabel ?? "qualquer canal"}`;
  case "hours-after-last-message": return `${spec.hours}h após última mensagem · ${spec.channelLabel ?? "qualquer canal"}`;
  case "message-received-after-pause": return `mensagem recebida · pausa ${spec.pause ?? "1d"}`;
  case "ig-story-mention": return "menção em story do Instagram";
  case "ig-post-comment": return spec.postLabel ? `comentário em ${spec.postLabel}` : "comentário em post";
  case "outbound-message-seen": return `mensagem de saída vista · ${spec.within ?? "24h"}`;
  case "immediately-after-conversation-close": return "após encerramento da conversa";
 }
}

export function describeExecution(exec?: ExecutionConfig): string {
 if (!exec) return "";
 const parts: string[] = [describeTrigger(exec.trigger)];
  const delay = Math.max(0, Number(exec.delayMinutes ?? 0));
  if (delay > 0) {
   if (delay % 1440 === 0) parts.push(`após ${delay / 1440}d`);
   else if (delay % 60 === 0) parts.push(`após ${delay / 60}h`);
   else parts.push(`após ${delay}min`);
  } else {
   parts.push("imediato");
  }
 const active = exec.active ?? "always";
 if (active === "business-hours") parts.push("horário comercial");
 else if (active === "custom") {
  const wins = exec.activeWindows?.length ? exec.activeWindows : exec.activeWindow ? [exec.activeWindow] : [];
  wins.forEach((w) => {
   const days = (w.days ?? []).map((d) => DAY_LABELS[d]).join("/");
   parts.push(`${days || "dias"} ${w.from ?? ""}-${w.to ?? ""}`);
  });
 }

 const condCount = (exec.conditions?.length ?? 0) + (exec.sourceFilter?.length ? 1 : 0);
 if (condCount > 0) parts.push(`${condCount} condição${condCount > 1 ? "es" : ""}`);
 if (exec.applyToExisting) parts.push("aplicar a existentes");
 return parts.join(" · ");
}



export function isAutomationConfigured(action: AutomationAction): boolean {
 const cfg = action.config;
 if (!cfg) return false;
 switch (cfg.kind) {
  case "mudar-etapa": return !!cfg.stageId;
  case "editar-tags": {
   const mode = cfg.mode ?? "add";
   if (mode === "replace") return !!cfg.replace?.length;
   return !!(cfg.add?.length || cfg.remove?.length);
  }
  case "alterar-user": return !!cfg.userId;
  case "alterar-campo": {
   if (!cfg.campo || cfg.valor === undefined || cfg.valor === "") return false;
   if (cfg.campo === "custom" && !cfg.customFieldId) return false;
   return validateFieldValue(cfg.campo, cfg.valor, cfg.customFieldType).ok;
  }
  case "tarefa": return !!cfg.titulo?.trim();
  case "tarefa-concluida":
  case "excluir-tarefas":
   return (cfg.escopo ?? "todas") === "todas" ? true : !!cfg.taskId;
  case "excluir-lead":
  case "pausar-ia":
   return true;
  case "duplicar-lead": return true;
  case "salesbot": return !!cfg.botId;
  case "executar-ia": return !!cfg.agentId;
  case "msg-interna": return !!cfg.toUserId && !!cfg.mensagem?.trim();
  case "gerar-form": return !!cfg.formId;
  case "deletar-arquivos": {
   const esc = cfg.escopo ?? "todos";
   if (esc === "por-tipo") return !!cfg.tipo;
   if (esc === "por-tag") return !!cfg.tag;
   return true;
  }
  case "meta-ads": return !!cfg.pixelId && !!cfg.eventName;
  case "vincular-produto": return !!cfg.productId;
  case "webhook": return false; // front-end only por enquanto
  case "webhook-inbound": return false; // front-end only por enquanto
  case "none": return false;
 }
}

/**
 * Valida o valor de acordo com o tipo de campo, usado tanto no dialog quanto no runner.
 */
export function validateFieldValue(
 campo: "name" | "email" | "phone" | "value" | "custom" | string,
 valor: string,
 customFieldType?: string,
): { ok: boolean; error?: string; normalized?: string | number } {
 const v = (valor ?? "").trim();
 if (!v) return { ok: false, error: "Informe um valor." };

 if (campo === "name") {
  if (v.length < 2) return { ok: false, error: "Nome muito curto." };
  if (/^\d+$/.test(v)) return { ok: false, error: "Nome não pode ser só números." };
  return { ok: true, normalized: v };
 }
 if (campo === "email") {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: "E-mail inválido (precisa ter @ e domínio)." };
  return { ok: true, normalized: v.toLowerCase() };
 }
 if (campo === "phone") {
  const digits = v.replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, error: "Telefone precisa ter DDD + número (mín. 10 dígitos)." };
  if (digits.length > 15) return { ok: false, error: "Telefone muito longo." };
  return { ok: true, normalized: digits };
 }
 if (campo === "value") {
  const cleaned = v.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return { ok: false, error: "Valor precisa ser um número (ex.: 1500 ou 1.500,50)." };
  return { ok: true, normalized: num };
 }

 const t = String(customFieldType ?? "text").toLowerCase();
 if (t === "email") {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: "E-mail inválido." };
  return { ok: true, normalized: v };
 }
 if (t === "phone" || t === "tel") {
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8) return { ok: false, error: "Telefone inválido." };
  return { ok: true, normalized: digits };
 }
 if (t === "number" || t === "numeric" || t === "price") {
  const cleaned = v.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return { ok: false, error: "Precisa ser um número." };
  return { ok: true, normalized: num };
 }
 if (t === "url") {
  try { new URL(v.startsWith("http") ? v : `https://${v}`); return { ok: true, normalized: v }; }
  catch { return { ok: false, error: "URL inválida." }; }
 }
 if (t === "date") {
  if (Number.isNaN(new Date(v).getTime())) return { ok: false, error: "Data inválida." };
  return { ok: true, normalized: v };
 }
 return { ok: true, normalized: v };
}




// Sem automações pré-configuradas.
export const STAGE_AUTOMATIONS: Record<string, AutomationAction[]> = {};

export function summarizeFunnel(funnel: Funnel) {
 const all = funnel.stages.flatMap((s) => s.leads);
 const abertas = funnel.stages.filter((s) => s.status === "aberta").flatMap((s) => s.leads).length;
 const negociacao = funnel.stages.find((s) => /negocia/i.test(s.name))?.leads?? [];
 const vendas = funnel.stages.find((s) => s.status === "ganha")?.leads?? [];
 return {
 total: all.length,
 abertas,
 emNegociacao: negociacao.length,
 vendas: vendas.length,
 faturamento: vendas.reduce((s, l) => s + l.value, 0),
 valorAbertas: all
.filter((l) => funnel.stages.find((s) => s.leads.includes(l))?.status === "aberta")
.reduce((s, l) => s + l.value, 0),
 };
}

export function formatBRL(v: number) {
 return v.toLocaleString("pt-BR", {
 style: "currency",
 currency: "BRL",
 maximumFractionDigits: 0,
 });
}

export function timeAgo(iso?: string) {
 if (!iso) return "";
 const diff = Date.now() - new Date(iso).getTime();
 const m = Math.round(diff / 60000);
 if (m < 1) return "agora";
 if (m < 60) return `${m}min`;
 const h = Math.round(m / 60);
 if (h < 24) return `${h}h`;
 const d = Math.round(h / 24);
 return `${d}d`;
}
