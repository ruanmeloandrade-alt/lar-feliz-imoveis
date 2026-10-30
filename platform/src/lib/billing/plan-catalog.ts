import type { PlanCode } from "./types";

export type PlanDeliverableGroup = {
  title: string;
  items: string[];
};

export type PlanPresentation = {
  name: string;
  tagline: string;
  storageGb: number;
  inheritsFrom?: PlanCode;
  groups: PlanDeliverableGroup[];
};

/**
 * Matriz comercial canônica dos planos MKTOn.
 *
 * Os ciclos 1m/3m/6m/1y alteram somente cobrança, vigência e bônus.
 * Entregáveis pertencem ao plano e nunca ao período contratado.
 * Todos os planos começam com a mesma franquia de 5 GB; capacidade adicional
 * é comercializada separadamente por add-ons de armazenamento.
 */
export const PLAN_PRESENTATION: Record<PlanCode, PlanPresentation> = {
  starter: {
    name: "Start",
    tagline: "Base completa para organizar sua operação comercial, atender leads e acompanhar resultados em um só lugar.",
    storageGb: 5,
    groups: [
      {
        title: "Funcionalidades incluídas",
        items: [
          "Gestor de CRM",
          "Funil",
          "Leads",
          "Inbox",
          "Automações",
          "Sales Bot",
          "Relatórios",
          "Formulários",
          "Empresas",
          "Produtos",
          "Arquivos",
          "Dashboard",
          "Calendário",
          "Suporte via chat",
        ],
      },
    ],
  },
  professional: {
    name: "Growth",
    tagline: "Mais produtividade, inteligência e leitura de dados para conectar CRM, mídia paga e Social Media.",
    storageGb: 5,
    inheritsFrom: "starter",
    groups: [
      {
        title: "Produtividade e IA",
        items: ["Fluxo de Trabalho", "Notas", "Agente IA", "Sales Bot de grupo", "Agente IA de grupo"],
      },
      {
        title: "Dados e mídia",
        items: [
          "Tracking",
          "Envio e recebimento de eventos do Meta Ads (CAPI)",
          "KPIs do Gestor de Tráfego em modo leitura",
          "KPIs do Social Media em modo leitura",
        ],
      },
    ],
  },
  business: {
    name: "Performance",
    tagline: "Transforma dados em ação com Tracking completo, automações executáveis de mídia e operação manual de Social Media.",
    storageGb: 5,
    inheritsFrom: "professional",
    groups: [
      {
        title: "Performance e automação",
        items: [
          "Tracking & Analytics completo",
          "Suporte prioritário via WhatsApp",
          "Automações executáveis do Gestor de Tráfego",
        ],
      },
      {
        title: "Social Media",
        items: ["Calendário de conteúdo", "Agendamento de publicações", "Gestão manual de conteúdo e legendas"],
      },
    ],
  },
  enterprise: {
    name: "Scale",
    tagline: "Operação avançada para escalar aquisição e conteúdo com inteligência artificial aplicada ao tráfego e ao Social Media.",
    storageGb: 5,
    inheritsFrom: "business",
    groups: [
      {
        title: "Gestor de Tráfego com IA",
        items: [
          "IA para análise de campanhas e oportunidades",
          "Automação inteligente de ações de tráfego",
          "Leitura consolidada de contas, campanhas, conjuntos e anúncios",
          "KPIs, diagnóstico e apoio à otimização",
        ],
      },
      {
        title: "Social Media com IA",
        items: [
          "IA para planejamento e criação de conteúdo",
          "Banco de ideias e campanhas orgânicas",
          "Geração assistida de legendas, hashtags e criativos",
          "Calendário editorial, agendamento e acompanhamento de KPIs",
        ],
      },
    ],
  },
};

/**
 * Áreas comuns continuam tecnicamente disponíveis em qualquer assinatura, mas
 * não são exibidas como um bloco comercial separado nos cards de planos.
 */
export const COMMON_PLAN_AREAS = ["Home", "Configurações", "Faculdade MKTOn"] as const;

/**
 * Entitlements canônicos por plano. Growth recebe leitura de KPIs sociais e de
 * tráfego sem liberar operação manual/IA do Social Media nem execução de mídia.
 */
export const PLAN_ENTITLEMENTS: Record<PlanCode, readonly string[]> = {
  starter: [
    "dashboard",
    "suporte_chat",
    "crm_mkton",
    "calendario",
  ],
  professional: [
    "dashboard",
    "suporte_chat",
    "crm_mkton",
    "calendario",
    "fluxo_trabalho",
    "notas",
    "agentes_ia",
    "automacoes_grupo",
    "tracking_crm",
    "meta_events",
    "trafego_kpis_read",
    "social_kpis_read",
  ],
  business: [
    "dashboard",
    "suporte_chat",
    "crm_mkton",
    "calendario",
    "fluxo_trabalho",
    "notas",
    "agentes_ia",
    "automacoes_grupo",
    "tracking_crm",
    "meta_events",
    "trafego_kpis_read",
    "social_kpis_read",
    "tracking",
    "suporte_prioritario",
    "trafego_automacoes",
    "social_calendar",
  ],
  enterprise: [
    "dashboard",
    "suporte_chat",
    "crm_mkton",
    "calendario",
    "fluxo_trabalho",
    "notas",
    "agentes_ia",
    "automacoes_grupo",
    "tracking_crm",
    "meta_events",
    "trafego_kpis_read",
    "social_kpis_read",
    "tracking",
    "suporte_prioritario",
    "trafego_automacoes",
    "social_calendar",
    "trafego_ia",
    "social_media_ia",
  ],
};

export function planDisplayName(code: PlanCode): string {
  return PLAN_PRESENTATION[code].name;
}

export function planStorageGb(code: PlanCode | string | null | undefined): number {
  if (!code || !(code in PLAN_PRESENTATION)) return 0;
  return PLAN_PRESENTATION[code as PlanCode].storageGb;
}

export function planEntitlements(code: PlanCode | string | null | undefined): string[] {
  if (!code || !(code in PLAN_ENTITLEMENTS)) return [];
  return [...PLAN_ENTITLEMENTS[code as PlanCode]];
}
