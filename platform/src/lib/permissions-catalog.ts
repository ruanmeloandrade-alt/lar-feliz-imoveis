// Catálogo de permissões granulares por usuário (por workspace).
// A matriz é montada com base no plano do workspace: apenas os módulos que o
// plano libera aparecem no editor de permissões.

export type CrudAction = "create" | "view" | "edit" | "delete" | "export";

export type LeadScope = "none" | "assigned" | "team" | "all";

export interface EntityAccess {
  create: LeadScope;
  view: LeadScope;
  edit: LeadScope;
  delete: LeadScope;
  export: LeadScope;
}

export interface ModuleAccess {
  enabled: boolean;
  entities?: Record<string, EntityAccess>;
  // filtros opcionais para módulos com pipelines/etapas
  pipelines?: string[]; // ids permitidos (vazio = todos)
  stages?: string[];    // ids permitidos (vazio = todas do pipeline permitido)
  extras?: Record<string, boolean>;
}

export interface UserPermissions {
  modules: Record<string, ModuleAccess>;
}

/**
 * Definição do que aparece na matriz. Cada módulo pode ter entidades (CRUD)
 * e/ou controles extras (checkboxes livres).
 */
export interface ModuleDef {
  id: string;                 // chave interna
  label: string;              // rótulo pro dono
  tag: string;                // categoria
  planKey: string;            // key usada no array `plans.modules`
  entities?: { id: string; label: string }[];
  hasPipelines?: boolean;     // liga o seletor de pipelines/etapas
  extras?: { id: string; label: string; desc?: string }[];
  alwaysAvailable?: boolean;  // aparece independente do plano (ex.: CRM MKTOn)
}

export const MODULES_MATRIX: ModuleDef[] = [
  {
    id: "crm",
    label: "CRM Vanessa Simoni",
    tag: "COMERCIAL",
    planKey: "crm_mkton",
    alwaysAvailable: true,
    hasPipelines: true,
    entities: [
      { id: "leads",     label: "Leads" },
      { id: "contacts",  label: "Contatos" },
      { id: "companies", label: "Empresas" },
      { id: "tasks",     label: "Tarefas" },
      { id: "products",  label: "Produtos" },
    ],
  },
  {
    id: "inbox",
    label: "Inbox / Chat",
    tag: "ATENDIMENTO",
    planKey: "crm_mkton",
    alwaysAvailable: true,
    hasPipelines: true,
    entities: [
      { id: "conversations", label: "Conversas" },
      { id: "templates",     label: "Modelos" },
    ],
    extras: [
      { id: "reply_all_stages", label: "Responder leads de qualquer etapa", desc: "Se desligado, só responde nas etapas permitidas abaixo." },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard & Relatórios",
    tag: "ANÁLISE",
    planKey: "dashboard",
    alwaysAvailable: true,
    entities: [
      { id: "kpis",    label: "KPIs" },
      { id: "reports", label: "Relatórios" },
    ],
    extras: [
      { id: "export_reports", label: "Exportar relatórios (CSV/PDF)" },
    ],
  },
  {
    id: "campanhas",
    label: "Campanhas & Disparos",
    tag: "MARKETING",
    planKey: "crm_mkton",
    alwaysAvailable: true,
    entities: [
      { id: "campaigns", label: "Campanhas" },
      { id: "registrations", label: "Cadastros" },
    ],
  },
  {
    id: "automacoes",
    label: "Automações (Salesbot)",
    tag: "AUTOMAÇÃO",
    planKey: "agentes_ia",
    entities: [
      { id: "bots", label: "Bots" },
    ],
  },
  {
    id: "gestor-trafego",
    label: "Gestor de Tráfego IA",
    tag: "MÍDIA",
    planKey: "trafego_ia",
    entities: [
      { id: "campanhas", label: "Campanhas de anúncio" },
      { id: "criativos", label: "Criativos" },
    ],
  },
  {
    id: "social-media",
    label: "Social Media",
    tag: "CONTEÚDO",
    planKey: "social_media_ia",
    entities: [
      { id: "posts",     label: "Posts" },
      { id: "calendar",  label: "Calendário" },
    ],
    extras: [
      { id: "approve_posts", label: "Aprovar publicações" },
    ],
  },
  {
    id: "tracking",
    label: "Tracking & Analytics",
    tag: "TRACKING",
    planKey: "tracking",
    entities: [
      { id: "events", label: "Eventos" },
      { id: "utms",   label: "UTMs" },
    ],
  },
  {
    id: "faculdade",
    label: "Faculdade MarketOn",
    tag: "ENSINO",
    planKey: "suporte_chat",
    alwaysAvailable: true,
    entities: [
      { id: "content", label: "Conteúdos" },
    ],
  },
];

export const LEAD_SCOPE_LABEL: Record<LeadScope, string> = {
  none: "Negado",
  assigned: "Se for responsável",
  team: "Da equipe/grupo dele",
  all: "Permitido (tudo)",
};

export function defaultEntityAccess(scope: LeadScope = "none"): EntityAccess {
  return { create: scope, view: scope, edit: scope, delete: scope, export: scope };
}

export function defaultPermissions(): UserPermissions {
  const modules: Record<string, ModuleAccess> = {};
  for (const m of MODULES_MATRIX) {
    modules[m.id] = {
      enabled: false,
      entities: m.entities
        ? Object.fromEntries(m.entities.map((e) => [e.id, defaultEntityAccess("none")]))
        : undefined,
      pipelines: m.hasPipelines ? [] : undefined,
      stages: m.hasPipelines ? [] : undefined,
      extras: m.extras ? Object.fromEntries(m.extras.map((x) => [x.id, false])) : undefined,
    };
  }
  return { modules };
}

/** Filtra o catálogo pelos módulos que o plano do workspace libera. */
export function matrixForPlan(planModules: string[] | null | undefined): ModuleDef[] {
  const set = new Set(planModules ?? []);
  return MODULES_MATRIX.filter((m) => m.alwaysAvailable || set.has(m.planKey));
}
