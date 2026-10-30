// Catálogo de eventos que o MKTOn pode emitir para N8N / Make (outbound)
// e ações que o N8N / Make podem executar de volta no sistema (inbound).
// Client-safe: só constantes/tipos. Sem imports server-only.

export type ExternalEventGroup =
  | "leads"
  | "mensagens"
  | "crm"
  | "tarefas"
  | "campanhas"
  | "tracking"
  | "ligacoes"
  | "ecommerce"
  | "grupos"
  | "agentes";

export interface ExternalEventDef {
  key: string;
  group: ExternalEventGroup;
  label: string;
  hint: string;
}

export const EXTERNAL_EVENTS: ExternalEventDef[] = [
  // LEADS
  { key: "lead.created", group: "leads", label: "Lead criado", hint: "Novo lead entra no CRM." },
  { key: "lead.updated", group: "leads", label: "Lead atualizado", hint: "Campos do lead alterados." },
  { key: "lead.stage_changed", group: "crm", label: "Lead mudou de etapa", hint: "Movimentação na pipeline do CRM." },
  { key: "lead.tag_added", group: "crm", label: "Tag adicionada ao lead", hint: "Nova tag associada." },
  { key: "lead.note_added", group: "crm", label: "Nota adicionada", hint: "Anotação criada no lead." },

  // MENSAGENS
  { key: "message.received", group: "mensagens", label: "Mensagem recebida", hint: "WhatsApp/DM/Email do cliente." },
  { key: "message.sent", group: "mensagens", label: "Mensagem enviada", hint: "Enviada pelo bot ou operador." },

  // TAREFAS (Fluxo de Trabalho)
  { key: "task.created", group: "tarefas", label: "Tarefa criada", hint: "Nova tarefa no Fluxo de Trabalho." },
  { key: "task.overdue", group: "tarefas", label: "Tarefa atrasada", hint: "Prazo estourou." },
  { key: "task.completed", group: "tarefas", label: "Tarefa concluída", hint: "Concluída/aprovada." },

  // CAMPANHAS
  { key: "campaign.rule_fired", group: "campanhas", label: "Regra de automação disparada", hint: "Regra Meta Ads acionada." },
  { key: "campaign.status_changed", group: "campanhas", label: "Status da campanha alterado", hint: "Pausar/ativar/duplicar." },

  // TRACKING
  { key: "tracking.conversion", group: "tracking", label: "Conversão registrada", hint: "Pixel Vanessa Simoni / CAPI." },

  // LIGAÇÕES (Evolution call events / módulo Call Center)
  { key: "call.received", group: "ligacoes", label: "Ligação recebida", hint: "Ligação de entrada." },
  { key: "call.made", group: "ligacoes", label: "Ligação feita", hint: "Chamada de saída." },
  { key: "call.missed", group: "ligacoes", label: "Ligação perdida", hint: "Não atendida." },
  { key: "call.ended", group: "ligacoes", label: "Ligação encerrada", hint: "Com duração/gravação." },

  // E-COMMERCE (módulo Tracking / loja checkout)
  { key: "ecommerce.checkout.started", group: "ecommerce", label: "Checkout iniciado", hint: "Cliente iniciou compra." },
  { key: "ecommerce.order.paid", group: "ecommerce", label: "Pedido pago", hint: "Compra confirmada." },
  { key: "ecommerce.order.refunded", group: "ecommerce", label: "Pedido reembolsado", hint: "Estorno registrado." },
  { key: "ecommerce.cart.abandoned", group: "ecommerce", label: "Carrinho abandonado", hint: "Checkout não concluído." },

  // GRUPOS
  { key: "group.member_joined", group: "grupos", label: "Novo membro no grupo", hint: "Entrada em grupo WhatsApp." },
  { key: "group.member_left", group: "grupos", label: "Membro saiu do grupo", hint: "Saída de grupo." },

  // AGENTES
  { key: "agent.outcome_reached", group: "agentes", label: "Agente atingiu objetivo", hint: "Outcome do agente IA." },
];

export const EVENT_GROUP_META: Record<ExternalEventGroup, { label: string }> = {
  leads: { label: "Leads" },
  mensagens: { label: "Mensagens" },
  crm: { label: "CRM" },
  tarefas: { label: "Tarefas" },
  campanhas: { label: "Campanhas" },
  tracking: { label: "Tracking" },
  ligacoes: { label: "Ligações" },
  ecommerce: { label: "E-commerce" },
  grupos: { label: "Grupos" },
  agentes: { label: "Agentes IA" },
};

// Ações que N8N / Make podem executar via inbound.
export const EXTERNAL_INBOUND_ACTIONS = [
  "create_lead",
  "update_lead",
  "move_stage",
  "add_tag",
  "add_note",
  "send_whatsapp_message",
  "create_task",
  "register_conversion",
  "social_post",
  "trigger_pipeline_event",
] as const;

export type ExternalInboundAction = (typeof EXTERNAL_INBOUND_ACTIONS)[number];

export type ExternalProvider = "n8n" | "make" | "zapier" | "custom";

export interface ProviderMetaDef {
  label: string;
  docHint: string;
  docUrl?: string;
  outboundPlaceholder: string;
  /** Se o provedor costuma validar assinatura HMAC no recebimento. */
  supportsSignature: boolean;
  /** Passo a passo mostrado no painel. */
  steps: string[];
  tips: string[];
}

export const PROVIDER_META: Record<ExternalProvider, ProviderMetaDef> = {
  n8n: {
    label: "n8n",
    docHint: "Use o nó Webhook do n8n como gatilho do workflow.",
    docUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/",
    outboundPlaceholder: "https://n8n.suaempresa.com/webhook/mkton",
    supportsSignature: true,
    steps: [
      "Abra sua instância n8n e crie um workflow novo.",
      "Adicione o nó Webhook como gatilho e escolha o método POST.",
      "Copie a Production URL do nó e cole no campo de URL aqui embaixo.",
      "Marque os eventos que o MKTOn deve enviar e ative o disparo.",
      "Clique em Enviar teste e confira o log logo abaixo.",
      "Para o n8n mandar ações de volta, use um nó HTTP Request apontando para a URL inbound.",
    ],
    tips: [
      "A assinatura HMAC vem no header X-MKTOn-Signature. No n8n você pode validar com um nó Code.",
      "Se o workflow estiver inativo, o n8n só aceita a Test URL. Ative o workflow para usar a Production URL.",
    ],
  },
  make: {
    label: "Make",
    docHint: "Use o módulo Webhooks (Custom Webhook) como gatilho do cenário.",
    docUrl: "https://www.make.com/en/help/tools/webhooks",
    outboundPlaceholder: "https://hook.eu2.make.com/xxxxxxxxxxxxxxxx",
    supportsSignature: true,
    steps: [
      "Acesse make.com e crie um cenário novo.",
      "Adicione o módulo Webhooks, opção Custom webhook, e clique em Add.",
      "Copie a URL gerada e cole no campo de URL aqui embaixo.",
      "Marque os eventos, ative o disparo e clique em Enviar teste.",
      "No Make, clique em Redetermine data structure antes do teste para ele aprender o formato.",
      "Para o Make agir de volta no MKTOn, use o módulo HTTP apontando para a URL inbound.",
    ],
    tips: [
      "O Make só grava a estrutura do payload no primeiro teste recebido.",
      "Deixe o cenário ligado (scheduling ON) para receber eventos em produção.",
    ],
  },
  zapier: {
    label: "Zapier",
    docHint: "Use o trigger Webhooks by Zapier, opção Catch Hook.",
    docUrl: "https://help.zapier.com/hc/en-us/articles/8496288690317",
    outboundPlaceholder: "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
    supportsSignature: false,
    steps: [
      "Acesse zapier.com e crie um Zap novo.",
      "Escolha o trigger Webhooks by Zapier e o evento Catch Hook.",
      "Copie a Custom Webhook URL e cole no campo de URL aqui embaixo.",
      "Marque os eventos, ative o disparo e clique em Enviar teste.",
      "Volte no Zapier e clique em Test trigger para ele capturar o payload.",
      "Monte as ações do Zap normalmente usando os campos recebidos.",
    ],
    tips: [
      "O Zapier não valida assinatura HMAC. Ela continua sendo enviada no header, mas você pode desligar.",
      "Para o Zapier agir de volta no MKTOn, use a ação Webhooks by Zapier, POST, apontando para a URL inbound.",
    ],
  },
  custom: {
    label: "Webhook personalizado",
    docHint: "Conecte qualquer plataforma que fale HTTP: sistemas próprios, ERPs, Pipedream, Retool e afins.",
    outboundPlaceholder: "https://api.suaempresa.com/hooks/mkton",
    supportsSignature: true,
    steps: [
      "Crie um endpoint HTTP POST na plataforma ou sistema de destino.",
      "Cole a URL desse endpoint no campo de URL aqui embaixo.",
      "Se o destino exigir autenticação, preencha o header de autenticação (ex.: Authorization: Bearer ...).",
      "Adicione headers extras se a plataforma precisar (ex.: X-Api-Key, Content-Language).",
      "Marque os eventos, ative o disparo e envie um teste.",
      "Para receber comandos de volta, use a URL inbound com as ações suportadas.",
    ],
    tips: [
      "Payload sempre em JSON: { event, workspace_id, occurred_at, data }.",
      "Assinatura HMAC-SHA256 do corpo vai no header X-MKTOn-Signature (pode ser desligada).",
      "Você pode configurar novas tentativas automáticas em caso de erro do destino.",
    ],
  },
};

/** Opções avançadas guardadas em external_automations.metadata. */
export interface AutomationHeader {
  key: string;
  value: string;
}

export interface AutomationOptions {
  signOutbound: boolean;
  authHeaderName: string;
  authHeaderValue: string;
  extraHeaders: AutomationHeader[];
  retries: number;
  requireInboundSignature: boolean;
}

export const DEFAULT_AUTOMATION_OPTIONS: AutomationOptions = {
  signOutbound: true,
  authHeaderName: "",
  authHeaderValue: "",
  extraHeaders: [],
  retries: 1,
  requireInboundSignature: true,
};

export function normalizeOptions(raw: unknown, provider: ExternalProvider): AutomationOptions {
  const o = (raw ?? {}) as Partial<AutomationOptions>;
  const supportsSig = PROVIDER_META[provider].supportsSignature;
  return {
    signOutbound: typeof o.signOutbound === "boolean" ? o.signOutbound : supportsSig,
    authHeaderName: typeof o.authHeaderName === "string" ? o.authHeaderName : "",
    authHeaderValue: typeof o.authHeaderValue === "string" ? o.authHeaderValue : "",
    extraHeaders: Array.isArray(o.extraHeaders)
      ? o.extraHeaders.filter((h): h is AutomationHeader => !!h && typeof h.key === "string").slice(0, 10)
      : [],
    retries: typeof o.retries === "number" ? Math.min(Math.max(o.retries, 0), 3) : 1,
    requireInboundSignature:
      typeof o.requireInboundSignature === "boolean" ? o.requireInboundSignature : supportsSig,
  };
}

