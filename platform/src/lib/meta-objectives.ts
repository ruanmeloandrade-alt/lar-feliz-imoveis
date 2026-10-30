// Fonte única de objetivos + destinos (metas específicas) da Meta Ads.
// Usado em: Estratégias, Personas, NewCampaignDialog. Mantém tudo em sincronia.

export type MetaObjective =
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_APP_PROMOTION";

export type MetaDestination =
  | "MESSAGES" | "VIDEO_VIEWS" | "POST_ENGAGEMENT" | "PAGE_LIKES" | "EVENT_RESPONSES"
  | "PROFILE_VISITS" | "REELS_PLAYS"
  | "LEAD_FORM" | "PHONE_CALL" | "SITE_LEADS"
  | "WEBSITE" | "CATALOG_SALES" | "APP"
  | "MESSENGER" | "WHATSAPP" | "INSTAGRAM_DIRECT"
  | "REACH" | "IMPRESSIONS" | "BRAND_AWARENESS" | "AD_RECALL_LIFT" | "THRUPLAY"
  | "APP_INSTALLS" | "APP_EVENTS"
  | "STORE_VISITS";

export const OBJECTIVES: Array<{ v: MetaObjective; l: string; sub: string }> = [
  { v: "OUTCOME_LEADS",         l: "Cadastros / Leads", sub: "Formulários, WhatsApp, ligações, site" },
  { v: "OUTCOME_SALES",         l: "Vendas",            sub: "Conversão no site, catálogo, WhatsApp" },
  { v: "OUTCOME_TRAFFIC",       l: "Tráfego",           sub: "Cliques pro site, app, WhatsApp, DM" },
  { v: "OUTCOME_ENGAGEMENT",    l: "Engajamento",       sub: "Mensagens, vídeo, publicação, página, perfil, eventos" },
  { v: "OUTCOME_AWARENESS",     l: "Reconhecimento",    sub: "Alcance, impressões, marca, ad recall, vídeo" },
  { v: "OUTCOME_APP_PROMOTION", l: "Promoção de app",   sub: "Instalações e eventos in-app" },
];

export const DESTINATIONS_BY_OBJECTIVE: Record<MetaObjective, Array<{ v: MetaDestination; l: string; sub: string }>> = {
  OUTCOME_ENGAGEMENT: [
    { v: "MESSAGES",         l: "Mensagens",                  sub: "WhatsApp / Instagram Direct / Messenger" },
    { v: "VIDEO_VIEWS",      l: "Visualizações de vídeo",     sub: "ThruPlay ou 2s contínuos" },
    { v: "REELS_PLAYS",      l: "Reproduções de Reels",       sub: "Views em Reels do Instagram/Facebook" },
    { v: "POST_ENGAGEMENT",  l: "Engajamento com publicação", sub: "Curtidas, comentários, compartilhamentos" },
    { v: "PAGE_LIKES",       l: "Curtidas na Página",         sub: "Cresce a base da Página do Facebook" },
    { v: "PROFILE_VISITS",   l: "Visitas no perfil (IG/FB)",  sub: "Leva tráfego pro perfil da conta" },
    { v: "EVENT_RESPONSES",  l: "Participações em evento",    sub: "Confirmações de presença" },
  ],
  OUTCOME_LEADS: [
    { v: "LEAD_FORM",  l: "Formulário instantâneo",    sub: "Coleta lead dentro da Meta" },
    { v: "MESSAGES",   l: "Mensagens",                 sub: "WhatsApp / Direct / Messenger" },
    { v: "PHONE_CALL", l: "Chamadas",                  sub: "Ligação direta pra empresa" },
    { v: "SITE_LEADS", l: "Site (conversão via Pixel)", sub: "Leva ao site e otimiza no evento de Lead" },
  ],
  OUTCOME_SALES: [
    { v: "WEBSITE",       l: "Site (Pixel + evento)", sub: "Otimiza por Purchase, AddToCart etc." },
    { v: "CATALOG_SALES", l: "Catálogo",              sub: "Anúncios dinâmicos de produto" },
    { v: "MESSAGES",      l: "Mensagens",             sub: "Vende via WhatsApp / Direct" },
    { v: "PHONE_CALL",    l: "Chamadas",              sub: "Fecha por telefone" },
    { v: "STORE_VISITS",  l: "Visitas à loja física", sub: "Direciona pro endereço mais próximo" },
  ],
  OUTCOME_TRAFFIC: [
    { v: "WEBSITE",           l: "Site",              sub: "Cliques no link" },
    { v: "APP",               l: "App",               sub: "Abrir o app" },
    { v: "MESSENGER",         l: "Messenger",         sub: "Abre conversa" },
    { v: "WHATSAPP",          l: "WhatsApp",          sub: "Abre conversa" },
    { v: "INSTAGRAM_DIRECT",  l: "Instagram Direct",  sub: "Abre conversa no Direct" },
    { v: "PHONE_CALL",        l: "Chamadas",          sub: "Ligação" },
  ],
  OUTCOME_AWARENESS: [
    { v: "REACH",            l: "Alcance",                sub: "Pessoas únicas" },
    { v: "IMPRESSIONS",      l: "Impressões",             sub: "Total de exibições" },
    { v: "BRAND_AWARENESS",  l: "Reconhecimento da marca", sub: "Ad recall estimado" },
    { v: "AD_RECALL_LIFT",   l: "Lembrança do anúncio",   sub: "Ad recall lift" },
    { v: "THRUPLAY",         l: "Visualizações de vídeo", sub: "ThruPlay ≥ 15s" },
    { v: "VIDEO_VIEWS",      l: "Views de vídeo (2s)",    sub: "2 segundos contínuos" },
  ],
  OUTCOME_APP_PROMOTION: [
    { v: "APP_INSTALLS", l: "Instalações",     sub: "Novas instalações do app" },
    { v: "APP_EVENTS",   l: "Eventos no app",  sub: "Compra, cadastro, custom" },
  ],
};

export function labelForObjective(code: string | null | undefined): string {
  if (!code) return "";
  return OBJECTIVES.find((o) => o.v === code)?.l ?? code;
}

export function labelForDestination(objective: string | null | undefined, dest: string | null | undefined): string {
  if (!objective || !dest) return "";
  const list = DESTINATIONS_BY_OBJECTIVE[objective as MetaObjective] ?? [];
  return list.find((d) => d.v === dest)?.l ?? dest;
}
