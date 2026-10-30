/**
 * Catálogo de KPIs do módulo Social Media.
 * Fontes: meta_pages, meta_instagram_accounts, social_posts, social_post_metrics.
 */

export type SocialKpiUnit = "number" | "percent";
export type SocialKpiChannel = "ig" | "fb" | "local";

export interface SocialKpiDef {
  key: string;
  label: string;
  group: string;
  unit: SocialKpiUnit;
  channels: SocialKpiChannel[];
  description?: string;
}

const META_CHANNELS: SocialKpiChannel[] = ["ig", "fb"];
const ALL_CHANNELS: SocialKpiChannel[] = ["ig", "fb", "local"];

export const SOCIAL_KPI_GROUPS = [
  "Audiência",
  "Engajamento",
  "Alcance e visualizações",
  "Publicações",
  "Performance média",
] as const;

export const SOCIAL_KPI_CATALOG: SocialKpiDef[] = [
  // Audiência
  { key: "followers_total", label: "Seguidores", group: "Audiência", unit: "number", channels: META_CHANNELS, description: "Seguidores da conta selecionada" },
  { key: "followers_instagram", label: "Seguidores no Instagram", group: "Audiência", unit: "number", channels: ["ig"] },
  { key: "followers_facebook", label: "Seguidores no Facebook", group: "Audiência", unit: "number", channels: ["fb"] },
  { key: "accounts_connected", label: "Canal selecionado", group: "Audiência", unit: "number", channels: META_CHANNELS },

  // Engajamento
  { key: "likes_total", label: "Curtidas", group: "Engajamento", unit: "number", channels: ["local"], description: "Somente em posts medidos pela plataforma" },
  { key: "comments_total", label: "Comentários", group: "Engajamento", unit: "number", channels: ["local"], description: "Somente em posts medidos pela plataforma" },
  { key: "shares_total", label: "Compartilhamentos", group: "Engajamento", unit: "number", channels: ["local"], description: "Somente em posts medidos pela plataforma" },
  { key: "saves_total", label: "Salvamentos", group: "Engajamento", unit: "number", channels: ["local"], description: "Somente em posts medidos pela plataforma" },
  { key: "interactions_total", label: "Interações", group: "Engajamento", unit: "number", channels: ALL_CHANNELS, description: "Interações reais disponibilizadas pelo canal" },
  { key: "engagement_rate_avg", label: "Taxa de engajamento", group: "Engajamento", unit: "percent", channels: ALL_CHANNELS },

  // Alcance e visualizações
  { key: "reach_total", label: "Alcance da conta", group: "Alcance e visualizações", unit: "number", channels: META_CHANNELS, description: "Insight de conta do canal selecionado" },
  { key: "impressions_total", label: "Visualizações/Impressões", group: "Alcance e visualizações", unit: "number", channels: META_CHANNELS, description: "Views/Impressions retornadas pela Meta" },
  { key: "profile_views_total", label: "Visitas ao perfil", group: "Alcance e visualizações", unit: "number", channels: ["ig"] },
  { key: "video_views_total", label: "Visualizações de vídeo", group: "Alcance e visualizações", unit: "number", channels: META_CHANNELS },

  // Publicações
  { key: "posts_published", label: "Posts publicados", group: "Publicações", unit: "number", channels: ALL_CHANNELS },
  { key: "posts_scheduled", label: "Posts agendados", group: "Publicações", unit: "number", channels: ALL_CHANNELS },
  { key: "posts_pending_approval", label: "Aguardando aprovação", group: "Publicações", unit: "number", channels: ALL_CHANNELS },
  { key: "posts_draft", label: "Rascunhos", group: "Publicações", unit: "number", channels: ALL_CHANNELS },
  { key: "posts_failed", label: "Publicações com falha", group: "Publicações", unit: "number", channels: ALL_CHANNELS },
  { key: "ideas_available", label: "Ideias no banco", group: "Publicações", unit: "number", channels: ["local"] },

  // Performance média
  { key: "likes_avg", label: "Curtidas por post", group: "Performance média", unit: "number", channels: ["local"] },
  { key: "comments_avg", label: "Comentários por post", group: "Performance média", unit: "number", channels: ["local"] },
  { key: "reach_avg", label: "Alcance por post", group: "Performance média", unit: "number", channels: ["local"] },
  { key: "impressions_avg", label: "Impressões por post", group: "Performance média", unit: "number", channels: ["local"] },
];

export const DEFAULT_SOCIAL_KPIS = [
  "followers_total",
  "reach_total",
  "impressions_total",
  "posts_published",
  "posts_scheduled",
  "engagement_rate_avg",
  "likes_total",
  "comments_total",
];
