export type MktonStageSpec = {
  key: string;
  name: string;
  purpose: string;
  botMode?: "none" | "salesbot" | "ai" | "task-only";
};

export type MktonFunnelSpec = {
  key: string;
  /** Nome do funil QUE JÁ EXISTE no workspace Mkton. */
  name: string;
  purpose: string;
  stages: MktonStageSpec[];
};

/**
 * Configuração operacional da conta administrativa Mkton.
 *
 * REGRA: estes funis já existem. O provisionamento deve localizá-los pelo nome
 * e organizar somente etapas/automações/bots/agentes/tarefas/tags/campos.
 * Nunca deve criar um segundo funil quando o alvo não for encontrado.
 */
export const MKTON_OPERATION_VERSION = "2026-08-10.3";

export const MKTON_FUNNELS: MktonFunnelSpec[] = [
  {
    key: "lead_entry",
    name: "Leads de Entrada",
    purpose: "Receber, rastrear, atender e converter o lead de aquisição em cadastro.",
    stages: [
      {
        key: "reception",
        name: "Recepção de Lead",
        purpose: "Identificar origem, tracking e rota correta do lead.",
        botMode: "salesbot",
      },
      {
        key: "in_service",
        name: "Em Atendimento",
        purpose: "Júlia Braga conduz o lead ao cadastro sem vender por preço.",
        botMode: "ai",
      },
      {
        key: "follow",
        name: "Follow",
        purpose: "Recuperar leads sem resposta com cadência e CTA forte.",
        botMode: "salesbot",
      },
      {
        key: "registered",
        name: "Cadastro Realizado",
        purpose: "Registrar conversão e encaminhar ao funil Cadastro.",
        botMode: "salesbot",
      },
      {
        key: "cad_lost",
        name: "CAD Lost",
        purpose: "Marcar aquisição não convertida e encaminhar para Reativação.",
        botMode: "salesbot",
      },
    ],
  },
  {
    key: "registration",
    name: "Cadastro",
    purpose:
      "Ativar o cadastro, implementar rapidamente, acompanhar os 20 dias grátis e converter em assinatura.",
    stages: [
      {
        key: "new_cad",
        name: "New Cad",
        purpose:
          "Dar boas-vindas, capturar briefing e buscar agendamento da call de implementação.",
        botMode: "salesbot",
      },
      {
        key: "trial",
        name: "Trial",
        purpose: "Acompanhar ativação, uso e conversão ao longo dos 20 dias gratuitos.",
        botMode: "salesbot",
      },
      {
        key: "offers",
        name: "Ofertas",
        purpose: "Último ciclo comercial após o trial, com CTA forte e AIDA em cada mensagem.",
        botMode: "salesbot",
      },
      {
        key: "signed",
        name: "Assinou",
        purpose: "Registrar assinatura, KPIs, campos e tags e enviar ao Pós-venda.",
        botMode: "salesbot",
      },
      {
        key: "expired",
        name: "Trial Expirado",
        purpose: "Registrar não conversão e enviar à Reativação.",
        botMode: "salesbot",
      },
    ],
  },
  {
    key: "post_sale",
    name: "Pós-venda",
    purpose: "Onboarding, retenção, coleta de feedback/prova social e renovação.",
    stages: [
      {
        key: "onboarding",
        name: "Onboarding",
        purpose: "Primeiros 3 dias com acompanhamento intenso e coleta natural de feedback.",
        botMode: "salesbot",
      },
      {
        key: "standby",
        name: "Standby",
        purpose: "Acompanhamento periódico do cliente ativo.",
        botMode: "salesbot",
      },
      {
        key: "renewal",
        name: "Renovação do Plano",
        purpose: "Iniciar lembretes aproximadamente 15 dias antes do fim da vigência.",
        botMode: "salesbot",
      },
      {
        key: "renewed",
        name: "Venda Fechada",
        purpose: "Registrar renovação e devolver o cliente ao Standby.",
        botMode: "salesbot",
      },
      {
        key: "lost",
        name: "Venda Perdida",
        purpose: "Registrar churn/não renovação e enviar à Reativação.",
        botMode: "salesbot",
      },
    ],
  },
  {
    key: "reactivation",
    name: "Reativação",
    purpose: "Reativar por até 18 meses com abordagem adaptada ao histórico do lead.",
    stages: [
      {
        key: "entry",
        name: "Entrada Reativação",
        purpose: "Receber leads vindos de entrada, cadastro ou pós-venda preservando sua origem.",
        botMode: "salesbot",
      },
      {
        key: "standby",
        name: "Standby Reativação",
        purpose: "Janela de espera entre ciclos de contato.",
        botMode: "none",
      },
      {
        key: "conversion",
        name: "Em Conversão",
        purpose: "Resposta ativa Júlia/IA com objetivo adequado ao histórico.",
        botMode: "ai",
      },
      {
        key: "converted",
        name: "Convertido",
        purpose: "Interromper a reativação e devolver ao fluxo correspondente.",
        botMode: "salesbot",
      },
      {
        key: "retire",
        name: "Encerrar Base",
        purpose: "Saída após cerca de 18 meses sem conversão e com proteções de segurança.",
        botMode: "task-only",
      },
    ],
  },
  {
    key: "social",
    name: "Rede Social",
    purpose: "Tratar contatos sociais sem transformar DM em canal principal de venda.",
    stages: [
      {
        key: "reception",
        name: "Recepção Social",
        purpose: "Registrar rede, conteúdo/campanha e primeiro contato.",
        botMode: "salesbot",
      },
      {
        key: "qualification",
        name: "Qualificação IA",
        purpose: "Quando houver resposta, IA qualifica e tenta gerar cadastro/WhatsApp.",
        botMode: "ai",
      },
      {
        key: "whatsapp",
        name: "Encaminhado para WhatsApp",
        purpose: "Registrar migração para o canal comercial principal.",
        botMode: "none",
      },
      {
        key: "registered",
        name: "Cadastro Realizado",
        purpose: "Registrar conversão social e encaminhar ao Cadastro.",
        botMode: "salesbot",
      },
      {
        key: "lost",
        name: "Sem Conversão",
        purpose: "Encaminhar para Reativação sem insistência excessiva em DM.",
        botMode: "salesbot",
      },
    ],
  },
  {
    key: "affiliate",
    name: "Afiliado",
    purpose: "Acompanhar cadastro, primeira venda e progressão comercial sem bot de conversão.",
    stages: [
      {
        key: "registering",
        name: "Em Cadastro",
        purpose: "Afiliado/parceiro em processo de cadastro.",
        botMode: "task-only",
      },
      {
        key: "registered",
        name: "Cadastrado",
        purpose: "Cadastro concluído, ainda sem primeira venda.",
        botMode: "task-only",
      },
      {
        key: "first_sale",
        name: "Primeira Venda",
        purpose: "Primeira conversão registrada.",
        botMode: "task-only",
      },
      {
        key: "progression",
        name: "Em Progressão",
        purpose: "Acompanhar evolução até metas comerciais ainda a definir.",
        botMode: "task-only",
      },
      {
        key: "active",
        name: "Ativo",
        purpose: "Afiliado/parceiro recorrente.",
        botMode: "task-only",
      },
    ],
  },
];

export const MKTON_EXISTING_FUNNELS_OUT_OF_SCOPE = [
  "Grupo",
  "Prospecção",
  "Software RB Media",
] as const;

export const MKTON_TRACKING_FIELDS = [
  "origem_canal",
  "origem_plataforma",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "youtube_video",
  "origem_conversao",
  "link_tracking_cadastro",
  "nicho",
  "status_jornada",
  "status_trial",
  "inicio_trial",
  "fim_trial",
  "status_assinatura",
  "plano",
  "inicio_plano",
  "fim_plano",
  "status_onboarding",
  "status_renovacao",
  "origem_reativacao",
] as const;

export const MKTON_REQUIRED_TAG_PREFIXES = [
  "origem:",
  "canal:",
  "nicho:",
  "jornada:",
  "trial:",
  "cliente:",
  "reativacao:",
] as const;

export const MKTON_AUTOMATION_RULES = {
  noResponseToFollowMinutes: 40,
  freeTrialDays: 20,
  activationWindowDays: 7,
  conversionStartsDay: 15,
  postTrialOfferWindowDays: 15,
  onboardingIntensiveDays: 3,
  renewalLeadDays: 15,
  reactivationMaxMonths: 18,
  followMaxMessages: 10,
  reactivationMinStandbyDays: 15,
  reactivationMaxStandbyDays: 30,
} as const;

export const MKTON_DEFERRED_SCOPE = {
  groups: "O funil Grupo já existe, mas a automação aguarda definição operacional do usuário.",
  prospecting: "O funil Prospecção já existe e não faz parte deste bloco.",
  rbMedia: "O funil Software RB Media já existe e será configurado na segunda frente.",
  affiliateSalesThresholds:
    "Metas de progressão por volume de vendas ainda não foram fornecidas; não ativar movimentação automática por volume até definição.",
} as const;
