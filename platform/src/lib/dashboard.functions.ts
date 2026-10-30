// SLIM_DASHBOARD_DATA_CONTRACT_V1
import { readDashboardRows, readDashboardRpc, dashboardIssues, classifyDashboardLead, type DashboardIssue } from "@/lib/slim-dashboard-data.core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatWorkspaceError, requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { META_KPI_CATALOG } from "@/lib/meta-dashboard-kpis";
import type {
 CentralCommandItem,
 DashboardMetricsResponse,
 DrilldownLead,
 EvolutionPoint,
 FunnelStage,
 KpiCardData,
} from "@/lib/mock-dashboard";

type AnySb = {
 from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type DbSource = {
 id: string;
 provider: string;
 display_name: string;
};

type DbPipeline = {
 id: string;
 name: string;
 position: number | null;
};

type DbStage = {
 id: string;
 pipeline_id: string;
 name: string;
 position: number | null;
};

type DbLead = {
 status?: string;
 id: string;
 pipeline_id: string | null;
 stage_id: string | null;
 name: string;
 email: string | null;
 phone: string | null;
 value: number | string | null;
 external_id: string | null;
 external_updated_at: string | null;
 last_message_from: string | null;
 tags: unknown;
 created_at: string;
 updated_at: string;
};

function humanizeKpiKey(key: string) {
 return key.split(".").slice(1).join(" · ").replace(/_/g, " ") || key;
}

function tagLabel(value: unknown): string | null {
 if (typeof value === "string") return value.trim() || null;
 if (value && typeof value === "object") {
  const obj = value as Record<string, unknown>;
  const raw = obj.name ?? obj.label ?? obj.tag_name ?? obj.value;
  if (typeof raw === "string") return raw.trim() || null;
 }
 return null;
}

function customDisplayValue(value: unknown): string {
 if (value && typeof value === "object" && !Array.isArray(value)) {
  const obj = value as { display?: unknown; raw?: unknown };
  if (obj.display !== undefined && obj.display !== null && String(obj.display).trim()) return String(obj.display).trim();
  if (Array.isArray(obj.raw)) return obj.raw.map(String).filter(Boolean).join(", ").trim();
  if (obj.raw !== undefined && obj.raw !== null) return String(obj.raw).trim();
 }
 if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ").trim();
 if (value === null || value === undefined) return "";
 return String(value).trim();
}

function dailySeries(leads: Array<{ created_at: string }>, days: number) {
 const today = new Date();
 const points: number[] = [];
 for (let offset = days - 1; offset >= 0; offset -= 1) {
 const d = new Date(today);
 d.setDate(today.getDate() - offset);
 const key = d.toISOString().slice(0, 10);
 points.push(leads.filter((lead) => {
 const t = new Date(lead.created_at).getTime();
 return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === key;
 }).length);
 }
 return points;
}

export type KpiRuleOption = { id: string; name: string };

export type KpiStageOption = { id: string; name: string; pipeline_id: string; pipeline_name: string };

export type DashboardDataResponse = {
 metrics: DashboardMetricsResponse;
 drilldownLeads: DrilldownLead[];
 syncError: string | null;
 options: {
 pipelines: KpiRuleOption[];
 originTags: KpiRuleOption[];
 stages: KpiStageOption[];
 };
 applied: {
 data_source?: "mkton";
 valor_pipeline_id?: string | null;
 conversao_pipeline_id?: string | null;
 conversao_posvenda_pipeline_id?: string | null;
 conversao_posvenda_stage_id?: string | null;
 venda_ganha_pipeline_id?: string | null;
 venda_ganha_stage_id?: string | null;
 };
};

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
 return requireActiveWorkspace(supabase, userId);
}

function emptyKpi(kpi_key: string, label: string, unit: KpiCardData["unit"], description: string): KpiCardData {
 return {
 kpi_key,
 label,
 value: null,
 unit,
 delta_pct: null,
 status: "no_data",
 source: "mkton",
 source_label: "Vanessa Simoni",
 description,
 sparkline: null,
 drilldown_available: false,
 size_key: "sm",
 };
}

function emptyDashboard(sourceLabel = "Vanessa Simoni", syncError: string | null = null): DashboardDataResponse {
 const metrics: DashboardMetricsResponse = {
 read_at: new Date().toISOString(),
 read_status: syncError? "error": "stale",
 period_label: "Todos os leads",
 source_label: sourceLabel,
 funnel_label: " - ",
 leads_loaded: 0,
 central: [
 {
 id: "saude-slim-empty",
 title: "Vanessa Simoni",
 caption: syncError?? "Cadastre clientes e configure funis na Vanessa Simoni para preencher a dashboard.",
 badge_text: syncError? "erro": "pendente",
 badge_tone: syncError? "danger": "warn",
 icon: "controller",
 },
 ],
 kpis: [
 emptyKpi("leads_recebidos", "Leads Recebidos", "count", "Sem dados ainda"),
 emptyKpi("em_atendimento", "Em Atendimento", "count", "Sem dados ainda"),
 emptyKpi("sem_tarefa_futura", "Sem Tarefa Futura", "count", "Aguardando integração de tarefas"),
 emptyKpi("leads_urgentes", "Leads Urgentes", "count", "Aguardando regra de urgência"),
 emptyKpi("vendas_ganhas", "Vendas Ganhas", "currency_brl", "Sem dados ainda"),
 emptyKpi("vendas_perdidas", "Vendas Perdidas", "count", "Sem dados ainda"),
 emptyKpi("taxa_conversao", "Taxa de Conversão", "percent", "Sem dados ainda"),
 emptyKpi("valor_pipeline", "Valor no Pipeline", "currency_brl", "Sem dados ainda"),
 ],
 funnel: [],
 evolution: buildEvolution([]),
 };
 metrics.kpis = metrics.kpis.map((kpi) => ({...kpi, source_label: sourceLabel }));
 return { metrics, drilldownLeads: [], syncError, options: { pipelines: [], originTags: [], stages: [] }, applied: {} };
}

function stageStatus(stageName: string | undefined): "won" | "lost" | "open" {
 const name = (stageName?? "").toLowerCase();
 if (/ganh|venda\s*realiz|won|success/.test(name)) return "won";
 if (/perdid|lost|loss|descart/.test(name)) return "lost";
 return "open";
}

function toNumber(value: number | string | null | undefined): number {
 const n = Number(value?? 0);
 return Number.isFinite(n)? n: 0;
}

function buildEvolution(leads: DbLead[], range?: { from?: string; to?: string }): EvolutionPoint[] {
 const to = range?.to ? new Date(range.to) : new Date();
 let from: Date;
 if (range?.from) {
  from = new Date(range.from);
 } else {
  from = new Date(to);
  from.setDate(to.getDate() - 29);
 }
 const dayMs = 24 * 60 * 60 * 1000;
 const totalDays = Math.max(1, Math.min(180, Math.round((to.getTime() - from.getTime()) / dayMs) + 1));
 const points: EvolutionPoint[] = [];
 for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
  const d = new Date(to);
  d.setDate(to.getDate() - offset);
  const key = d.toISOString().slice(0, 10);
  points.push({ day: key, leads: 0, ganhas: 0, perdidas: 0 });
 }
 const byDay = new Map(points.map((point) => [point.day, point]));
 for (const lead of leads) {
  const key = new Date(lead.created_at).toISOString().slice(0, 10);
  const point = byDay.get(key);
  if (point) point.leads += 1;
 }
 return points;
}


function kpi(
 kpi_key: string,
 label: string,
 value: number | null,
 unit: KpiCardData["unit"],
 description: string,
 sourceLabel: string,
 sparkline: number[] | null,
 status: KpiCardData["status"] = value === null? "no_data": "ok",
 source: KpiCardData["source"] = "mkton",
): KpiCardData {
 return {
 kpi_key,
 label,
 value,
 unit,
 delta_pct: null,
 status,
 source,
 source_label: sourceLabel,
 description,
 sparkline,
 drilldown_available: value!== null,
 size_key: "sm",
 };
}

const META_GRAPH_VERSION = "v23.0";

type MetaAction = { action_type: string; value: string };
type MetaInsightRow = {
 spend?: string;
 impressions?: string;
 clicks?: string;
 reach?: string;
 frequency?: string;
 inline_link_clicks?: string;
 actions?: MetaAction[];
 action_values?: MetaAction[];
 purchase_roas?: MetaAction[];
 website_purchase_roas?: MetaAction[];
 video_play_actions?: MetaAction[];
 video_thruplay_watched_actions?: MetaAction[];
};

type DashboardMetaTotals = {
 spend: number;
 impressions: number;
 clicks: number;
 reach: number;
 frequency: number;
 linkClicks: number;
 landingPageViews: number;
 leads: number;
 purchases: number;
 purchaseValue: number;
 addToCart: number;
 checkout: number;
 messagingConversations: number;
 videoViews: number;
 thruplays: number;
 postEngagement: number;
 pageEngagement: number;
 results: number;
};

const META_ACTION_TYPES = {
 leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_lead", "onsite_conversion.messenger_lead"],
 purchases: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "website_purchase"],
 addToCart: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"],
 checkout: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"],
 landingPageViews: ["landing_page_view"],
 linkClick: ["link_click"],
 messagingConversations: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_conversation_started"],
 postEngagement: ["post_engagement"],
 pageEngagement: ["page_engagement"],
 videoViews: ["video_view"],
} as const;

function sumMetaAction(actions: MetaAction[] | undefined, types: readonly string[]): number {
 if (!actions) return 0;
 return actions.reduce((sum, action) => sum + (types.includes(action.action_type) ? Number(action.value) || 0 : 0), 0);
}

function sumMetaAll(actions: MetaAction[] | undefined): number {
 if (!actions) return 0;
 return actions.reduce((sum, action) => sum + (Number(action.value) || 0), 0);
}

async function fetchMetaJson<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
 const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
 url.searchParams.set("access_token", token);
 for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
 const response = await fetch(url.toString());
 if (!response.ok) {
  const text = await response.text().catch(() => "");
  throw new Error(`Meta ${response.status}: ${text.slice(0, 200)}`);
 }
 return response.json() as Promise<T>;
}

async function loadDashboardMetaTotals(sb: AnySb, workspaceId: string): Promise<DashboardMetaTotals | null> {
 const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
 if (!encKey) return null;
 const { data: secret, error: secretError } = await sb.rpc("get_integration_secret", {
  _workspace_id: workspaceId,
  _provider: "meta",
  _key: encKey,
 });
 if (secretError || !secret) return null;
 const token = (secret as { access_token?: string }).access_token;
 if (!token) return null;

 const { data: accounts } = await sb.from("meta_ad_accounts").select("account_id, dashboard_enabled").eq("workspace_id", workspaceId).eq("dashboard_enabled", true).limit(50);
 const accountRows = (accounts ?? []) as Array<{ account_id: string }>;
 if (accountRows.length === 0) return null;

 const totals: DashboardMetaTotals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  reach: 0,
  frequency: 0,
  linkClicks: 0,
  landingPageViews: 0,
  leads: 0,
  purchases: 0,
  purchaseValue: 0,
  addToCart: 0,
  checkout: 0,
  messagingConversations: 0,
  videoViews: 0,
  thruplays: 0,
  postEngagement: 0,
  pageEngagement: 0,
  results: 0,
 };
 let frequencyWeight = 0;

 await Promise.all(accountRows.map(async (account) => {
  try {
   const json = await fetchMetaJson<{ data?: MetaInsightRow[] }>(`${account.account_id}/insights`, token, {
    date_preset: "last_7d",
    level: "account",
    fields: "spend,impressions,clicks,reach,frequency,inline_link_clicks,actions,action_values,purchase_roas,website_purchase_roas,video_play_actions,video_thruplay_watched_actions",
   });
   const row = json.data?.[0];
   if (!row) return;
   const spend = Number(row.spend) || 0;
   const impressions = Number(row.impressions) || 0;
   const clicks = Number(row.clicks) || 0;
   const reach = Number(row.reach) || 0;
   const frequency = Number(row.frequency) || 0;
   const leads = sumMetaAction(row.actions, META_ACTION_TYPES.leads);
   const purchases = sumMetaAction(row.actions, META_ACTION_TYPES.purchases);
   const messaging = sumMetaAction(row.actions, META_ACTION_TYPES.messagingConversations);
   const linkClicks = Number(row.inline_link_clicks) || sumMetaAction(row.actions, META_ACTION_TYPES.linkClick);
   const postEngagement = sumMetaAction(row.actions, META_ACTION_TYPES.postEngagement);

   totals.spend += spend;
   totals.impressions += impressions;
   totals.clicks += clicks;
   totals.reach += reach;
   totals.linkClicks += linkClicks;
   totals.landingPageViews += sumMetaAction(row.actions, META_ACTION_TYPES.landingPageViews);
   totals.leads += leads;
   totals.purchases += purchases;
   totals.purchaseValue += sumMetaAction(row.action_values, META_ACTION_TYPES.purchases) || spend * (Number(row.purchase_roas?.[0]?.value) || Number(row.website_purchase_roas?.[0]?.value) || 0);
   totals.addToCart += sumMetaAction(row.actions, META_ACTION_TYPES.addToCart);
   totals.checkout += sumMetaAction(row.actions, META_ACTION_TYPES.checkout);
   totals.messagingConversations += messaging;
   totals.videoViews += sumMetaAction(row.actions, META_ACTION_TYPES.videoViews) || sumMetaAll(row.video_play_actions);
   totals.thruplays += sumMetaAll(row.video_thruplay_watched_actions);
   totals.postEngagement += postEngagement;
   totals.pageEngagement += sumMetaAction(row.actions, META_ACTION_TYPES.pageEngagement);
   totals.results += leads || purchases || messaging || linkClicks || postEngagement;
   if (frequency > 0 && impressions > 0) {
    totals.frequency += frequency * impressions;
    frequencyWeight += impressions;
   }
  } catch (error) {
   console.warn("[dashboard meta] insights falhou", error);
  }
 }));

 totals.frequency = frequencyWeight > 0 ? totals.frequency / frequencyWeight : 0;
 return totals;
}

function metaDashboardCard(key: string, totals: DashboardMetaTotals | null): KpiCardData {
 const noData = () => kpi(key, humanizeKpiKey(key), null, "count", "Meta conectada, mas sem dados disponíveis para este KPI.", "Meta Ads", null, "no_data", "meta");
 if (!totals) return noData();
 const cost = (count: number) => count > 0 ? totals.spend / count : 0;
 const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
 const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
 const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
 const roas = totals.spend > 0 ? totals.purchaseValue / totals.spend : 0;
 const spark = [0, Math.max(0, totals.spend * 0.65), Math.max(0, totals.spend * 0.82), totals.spend];
 switch (key) {
  case "meta.spend_7d": return kpi(key, "Investimento (7d)", totals.spend, "currency_brl", "Gasto total no Meta Ads nos últimos 7 dias", "Meta Ads", spark, "ok", "meta");
  case "meta.cpl_7d": return kpi(key, "CPL (7d)", cost(totals.leads), "currency_brl", "Custo por lead no Meta Ads", "Meta Ads", null, "ok", "meta");
  case "meta.ctr_7d": return kpi(key, "CTR (7d)", ctr, "percent", "Cliques divididos por impressões", "Meta Ads", null, "ok", "meta");
  case "meta.cpc_7d": return kpi(key, "CPC (7d)", cpc, "currency_brl", "Custo por clique", "Meta Ads", null, "ok", "meta");
  case "meta.cpm_7d": return kpi(key, "CPM (7d)", cpm, "currency_brl", "Custo por mil impressões", "Meta Ads", null, "ok", "meta");
  case "meta.leads_7d": return kpi(key, "Leads (7d)", totals.leads, "count", "Leads atribuídos pelo Meta Ads", "Meta Ads", null, "ok", "meta");
  case "meta.results_7d": return kpi(key, "Resultados (7d)", totals.results, "count", "Principal resultado agregado da conta", "Meta Ads", null, "ok", "meta");
  case "meta.cost_per_result_7d": return kpi(key, "Custo por resultado", cost(totals.results), "currency_brl", "Investimento dividido por resultados", "Meta Ads", null, "ok", "meta");
  case "meta.impressions_7d": return kpi(key, "Impressões (7d)", totals.impressions, "count", "Total de impressões", "Meta Ads", null, "ok", "meta");
  case "meta.reach_7d": return kpi(key, "Alcance (7d)", totals.reach, "count", "Pessoas únicas alcançadas", "Meta Ads", null, "ok", "meta");
  case "meta.frequency_7d": return kpi(key, "Frequência (7d)", totals.frequency, "count", "Média de impressões por pessoa", "Meta Ads", null, "ok", "meta");
  case "meta.clicks_7d": return kpi(key, "Cliques (7d)", totals.clicks, "count", "Cliques totais", "Meta Ads", null, "ok", "meta");
  case "meta.link_clicks_7d": return kpi(key, "Cliques no link (7d)", totals.linkClicks, "count", "Cliques em links dos anúncios", "Meta Ads", null, "ok", "meta");
  case "meta.landing_page_views_7d": return kpi(key, "Landing page views", totals.landingPageViews, "count", "Visualizações de página de destino", "Meta Ads", null, "ok", "meta");
  case "meta.purchases_7d": return kpi(key, "Compras (7d)", totals.purchases, "count", "Compras atribuídas", "Meta Ads", null, "ok", "meta");
  case "meta.cost_per_purchase_7d": return kpi(key, "Custo por compra", cost(totals.purchases), "currency_brl", "Investimento dividido por compras", "Meta Ads", null, "ok", "meta");
  case "meta.roas_7d": return kpi(key, "ROAS (7d)", roas, "count", "Retorno sobre gasto em anúncios", "Meta Ads", null, "ok", "meta");
  case "meta.messaging_conversations_7d": return kpi(key, "Conversas iniciadas", totals.messagingConversations, "count", "Conversas iniciadas por campanhas de mensagem", "Meta Ads", null, "ok", "meta");
  case "meta.cost_per_conversation_7d": return kpi(key, "Custo por conversa", cost(totals.messagingConversations), "currency_brl", "Investimento dividido por conversas", "Meta Ads", null, "ok", "meta");
  case "meta.add_to_cart_7d": return kpi(key, "Add to cart (7d)", totals.addToCart, "count", "Adições ao carrinho", "Meta Ads", null, "ok", "meta");
  case "meta.checkout_7d": return kpi(key, "Checkouts iniciados", totals.checkout, "count", "Inícios de checkout", "Meta Ads", null, "ok", "meta");
  case "meta.video_views_7d": return kpi(key, "Views de vídeo", totals.videoViews, "count", "Visualizações de vídeo", "Meta Ads", null, "ok", "meta");
  case "meta.thruplays_7d": return kpi(key, "ThruPlays", totals.thruplays, "count", "Reproduções qualificadas de vídeo", "Meta Ads", null, "ok", "meta");
  case "meta.post_engagement_7d": return kpi(key, "Engajamento em post", totals.postEngagement, "count", "Engajamentos em publicações", "Meta Ads", null, "ok", "meta");
  case "meta.page_engagement_7d": return kpi(key, "Engajamento na página", totals.pageEngagement, "count", "Engajamentos na página", "Meta Ads", null, "ok", "meta");
  default: {
   // Generic resolver for the full META_KPI_CATALOG (~150 KPIs).
   const rawKey = key.startsWith("meta.") ? key.slice(5) : key;
   const def = META_KPI_CATALOG.find((k) => k.key === rawKey);
   if (!def) return noData();
   const unit: KpiCardData["unit"] =
    def.unit === "currency" ? "currency_brl" :
    def.unit === "percent" ? "percent" :
    "count";
   const totalsRecord = totals as unknown as Record<string, number | undefined>;
   const rawValue = def.totalsField ? totalsRecord[def.totalsField] : undefined;
   const hasValue = typeof rawValue === "number" && Number.isFinite(rawValue);
   return kpi(
    key,
    def.label,
    hasValue ? rawValue! : null,
    unit,
    def.description ?? `${def.group} · Meta Ads`,
    "Meta Ads",
    null,
    hasValue ? "ok" : "no_data",
    "meta",
   );
  }
 }
}

function buildCentral(total: number, open: number, won: number, lost: number, valueOpen: number, syncError: string | null): CentralCommandItem[] {
 if (syncError) {
 return [
 {
 id: "sync-error",
 title: "Erro no carregamento",
 caption: syncError,
 badge_text: "revisar",
 badge_tone: "danger",
 icon: "alert",
 },
 ];
 }
 return [
 {
 id: "crm-loaded",
 title: "Vanessa Simoni",
 caption: `${total} leads no CRM.`,
 badge_text: "online",
 badge_tone: "success",
 icon: "controller",
 },
 {
 id: "pipeline-open",
 title: "Pipeline aberto",
 caption: `${open} leads em etapas abertas somando ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valueOpen)}.`,
 badge_text: "crm",
 badge_tone: "info",
 icon: "reading",
 },
 {
 id: "won-lost",
 title: "Fechamentos",
 caption: `${won} ganhos e ${lost} perdidos.`,
 badge_text: "resultado",
 badge_tone: won >= lost? "success": "warn",
 icon: "catalog",
 },
 ];
}

export const getDashboardData = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) =>
 z
.object({
 data_source: z.enum(["mkton"]).optional(),
 valor_pipeline_id: z.string().optional(),
 conversao_pipeline_id: z.string().optional(),
 conversao_posvenda_pipeline_id: z.string().optional(),
 conversao_posvenda_stage_id: z.string().optional(),
 venda_ganha_pipeline_id: z.string().optional(),
 venda_ganha_stage_id: z.string().optional(),
 conversao_origem_tag: z.string().optional(),
 date_from: z.string().optional(),
 date_to: z.string().optional(),
 period_label: z.string().optional(),
 })
.partial()
.parse(d?? {}),
 )
.handler(async ({ context, data }) => {
 const rules = data?? {};
 const sb = context.supabase as unknown as AnySb;
 let wsId: string;
 try {
  wsId = await loadActiveWorkspace(sb, context.userId);
 } catch (error) {
  return emptyDashboard("Backend indisponível", formatWorkspaceError(error));
 }

 const { data: source, error: sourceError } = await sb
.from("crm_sources")
.select("id, provider, display_name")
.eq("workspace_id", wsId)
.eq("provider", "mkton")
.maybeSingle();
 if (sourceError) throw new Error(sourceError.message);
 const crmSource = source as DbSource | null;
 const sourceLabel = crmSource?.display_name || "Vanessa Simoni";

 const [{ data: pipelines, error: pipelinesError }, { data: stages, error: stagesError }, { data: leads, error: leadsError }] = await Promise.all([
 readDashboardRows(sb, wsId, "pipelines", "id, name, position"),
 readDashboardRows(sb, wsId, "pipeline_stages", "id, pipeline_id, name, position"),
 readDashboardRows(sb, wsId, "leads", "id, status, pipeline_id, stage_id, name, email, phone, value, external_id, external_updated_at, last_message_from, tags, created_at, updated_at"),
 ]);
 if (pipelinesError) throw new Error(pipelinesError.message);
 if (stagesError) throw new Error(stagesError.message);
 if (leadsError) throw new Error(leadsError.message);

 const pipelineRows = ((pipelines?? []) as DbPipeline[]).sort((a,b)=>(a.position??0)-(b.position??0));
 const pipelineIds = new Set(pipelineRows.map((p) => p.id));
 const stageRows = ((stages?? []) as DbStage[]).filter((stage) => pipelineIds.has(stage.pipeline_id)).sort((a,b)=>(a.position??0)-(b.position??0));
 const allLeadRows = (leads?? []) as DbLead[];

 // Filtro por período (opcional)
 const dateFromMs = rules.date_from ? new Date(rules.date_from).getTime() : null;
 const dateToMs = rules.date_to ? new Date(rules.date_to).getTime() + (24 * 60 * 60 * 1000 - 1) : null;
 const hasPeriodFilter = dateFromMs != null || dateToMs != null;
 const leadRows = hasPeriodFilter
  ? allLeadRows.filter((lead) => {
    const t = new Date(lead.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    if (dateFromMs != null && t < dateFromMs) return false;
    if (dateToMs != null && t > dateToMs) return false;
    return true;
   })
  : allLeadRows;

 const effectiveSyncError: string | null = null;

 if (leadRows.length === 0 && pipelineRows.length === 0) {
 return emptyDashboard(`${sourceLabel} sem dados ainda`, effectiveSyncError);
 }


 const stageById = new Map(stageRows.map((stage) => [stage.id, stage]));
 const pipelineById = new Map(pipelineRows.map((pipeline) => [pipeline.id, pipeline]));

 const wonStageOverride = rules.venda_ganha_stage_id || null;
 const wonPipelineOverride = rules.venda_ganha_pipeline_id || null;
 const hasWonOverride = Boolean(wonStageOverride || wonPipelineOverride);
 function classify(lead: DbLead): "won" | "lost" | "open" {
   return classifyDashboardLead(lead, stageById.get(lead.stage_id ?? "")?.name, rules);
 }

 const openLeads = leadRows.filter((lead) => classify(lead) === "open");
 const wonLeads = leadRows.filter((lead) => classify(lead) === "won");
 const lostLeads = leadRows.filter((lead) => classify(lead) === "lost");
 const valueOpen = openLeads.reduce((sum, lead) => sum + toNumber(lead.value), 0);
 const valueWon = wonLeads.reduce((sum, lead) => sum + toNumber(lead.value), 0);

 const valorPipelineId = rules.valor_pipeline_id || null;
 const valorPipelineLeads = valorPipelineId
? openLeads.filter((lead) => lead.pipeline_id === valorPipelineId)
: openLeads;
 const valorPipelineTotal = valorPipelineLeads.reduce((sum, lead) => sum + toNumber(lead.value), 0);
 const valorPipelineName = valorPipelineId? pipelineById.get(valorPipelineId)?.name?? null: null;

 const conversaoPipelineId = rules.conversao_pipeline_id || null;
 const posvendaPipelineId = rules.conversao_posvenda_pipeline_id || null;
 const posvendaStageId = rules.conversao_posvenda_stage_id || null;

 const conversaoBase = conversaoPipelineId
? leadRows.filter((lead) => lead.pipeline_id === conversaoPipelineId)
: leadRows;

 const hasPosvendaRule = Boolean(posvendaPipelineId || posvendaStageId);
 const conversaoPosvenda = hasPosvendaRule
? conversaoBase.filter((lead) => {
 if (posvendaStageId && lead.stage_id === posvendaStageId) return true;
 if (posvendaPipelineId && lead.pipeline_id === posvendaPipelineId) return true;
 return false;
 })
: conversaoBase.filter((lead) => classify(lead) === "won");

 const conversion = conversaoBase.length > 0? conversaoPosvenda.length / conversaoBase.length: null;
 const conversaoDesc = (() => {
 const baseTxt = conversaoPipelineId
? `leads do funil "${pipelineById.get(conversaoPipelineId)?.name?? "?"}"`
: "todos os leads";
 if (posvendaStageId) {
 const st = stageById.get(posvendaStageId);
 return `Leads na etapa de pós-venda "${st?.name?? "?"}" ÷ ${baseTxt}.`;
 }
 if (posvendaPipelineId) {
 return `Leads no funil de pós-venda "${pipelineById.get(posvendaPipelineId)?.name?? "?"}" ÷ ${baseTxt}.`;
 }
 return `Vendas ganhas ÷ ${baseTxt}. Defina o funil/etapa de pós-venda para refinar.`;
 })();

 const tagSet = new Set<string>();
 for (const lead of leadRows) {
 if (Array.isArray(lead.tags)) for (const t of lead.tags as unknown[]) {
  const s = tagLabel(t);
 if (s) tagSet.add(s);
 }
 }
 const originTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, "pt-BR")).map((name) => ({ id: name, name }));
 const pipelineOptions = pipelineRows.map((p) => ({ id: p.id, name: p.name }));
 const stageOptions: KpiStageOption[] = stageRows.map((s) => ({
 id: s.id,
 name: s.name,
 pipeline_id: s.pipeline_id,
 pipeline_name: pipelineById.get(s.pipeline_id)?.name?? "Funil",
 }));

 const evolution = buildEvolution(leadRows, { from: rules.date_from, to: rules.date_to });
 const sparkline = evolution.map((point) => point.leads);
 const maxStageCount = Math.max(
...stageRows.map((stage) => leadRows.filter((lead) => lead.stage_id === stage.id).length),
 1,
 );

 const funnel: FunnelStage[] = stageRows.map((stage) => {
 const stageLeads = leadRows.filter((lead) => lead.stage_id === stage.id);
 return {
 stage_id: stage.id,
 stage_name: stage.name,
 funnel_name: pipelineById.get(stage.pipeline_id)?.name?? "Funil",
 count: stageLeads.length,
 pct_of_top: stageLeads.length / maxStageCount,
 value_brl: stageLeads.reduce((sum, lead) => sum + toNumber(lead.value), 0),
 };
 });

 const valorPipelineLabel = valorPipelineName? `Valor no Pipeline · ${valorPipelineName}`: "Valor no Pipeline";
 const valorPipelineDesc = valorPipelineName
? `Valor dos leads em aberto no funil "${valorPipelineName}".`
: "Valor somado dos leads ainda abertos (todos os funis).";

 const metrics: DashboardMetricsResponse = {
 read_at: new Date().toISOString(),
 read_status: effectiveSyncError? "error": "success",
 period_label: rules.period_label || (hasPeriodFilter ? "Período personalizado" : "Todo o período"),
 source_label: sourceLabel,
 funnel_label: pipelineRows.length === 1? pipelineRows[0].name: "Todos os funis",
 leads_loaded: leadRows.length,
 central: buildCentral(leadRows.length, openLeads.length, wonLeads.length, lostLeads.length, valueOpen, effectiveSyncError),
 kpis: [
 kpi("leads_recebidos", "Leads Recebidos", leadRows.length, "count", "Total de leads no CRM.", sourceLabel, sparkline),
 kpi("em_atendimento", "Em Atendimento", openLeads.length, "count", "Leads em etapas abertas do funil.", sourceLabel, sparkline),
 kpi("sem_tarefa_futura", "Sem Tarefa Futura", null, "count", "Aguardando integração de tarefas.", sourceLabel, null),
 kpi("leads_urgentes", "Leads Urgentes", null, "count", "Aguardando regra real de urgência.", sourceLabel, null),
 kpi("vendas_ganhas", "Vendas Ganhas", valueWon, "currency_brl", "Valor dos leads em etapas ganhas.", sourceLabel, sparkline),
 kpi("vendas_perdidas", "Vendas Perdidas", lostLeads.length, "count", "Leads em etapas perdidas.", sourceLabel, sparkline),
 kpi("taxa_conversao", "Taxa de Conversão", conversion, "percent", conversaoDesc, sourceLabel, sparkline),
 kpi("valor_pipeline", valorPipelineLabel, valorPipelineTotal, "currency_brl", valorPipelineDesc, sourceLabel, sparkline),
 ],
 funnel,
 evolution,
 };

 const drilldownLeads: DrilldownLead[] = leadRows.map((lead) => {
 const stage = stageById.get(lead.stage_id?? "");
 const pipeline = stage? pipelineById.get(stage.pipeline_id): lead.pipeline_id? pipelineById.get(lead.pipeline_id): null;
 const status = classify(lead);
  const tags = Array.isArray(lead.tags)? (lead.tags as unknown[]).map(tagLabel).filter(Boolean) as string[]: [];
 return {
 lead_id: lead.id,
 stage_id: lead.stage_id,
 status_key: status,
 name: lead.name,
 phone: lead.phone?? "Não informado",
 email: lead.email,
 stage_name: stage?.name?? "Sem etapa",
 funnel_name: pipeline?.name?? "Funil",
 responsible: "Vanessa Simoni",
 status_tags: [
 {
 label: status === "won"? "Ganho": status === "lost"? "Perdido": "Aberto",
 tone: status === "won"? "success": status === "lost"? "danger": "info",
 },
 ],
 value_brl: toNumber(lead.value),
 origin: "Vanessa Simoni",
 created_at: lead.created_at,
 updated_at: lead.external_updated_at?? lead.updated_at,
 custom_fields: [],
 crm_tags: tags,
 };
 });

 return {
 metrics,
 drilldownLeads,
 syncError: effectiveSyncError,
 options: { pipelines: pipelineOptions, originTags, stages: stageOptions },
 applied: {
 data_source: "mkton",
 valor_pipeline_id: valorPipelineId,
 conversao_pipeline_id: conversaoPipelineId,
 conversao_posvenda_pipeline_id: posvendaPipelineId,
 conversao_posvenda_stage_id: posvendaStageId,
 venda_ganha_pipeline_id: wonPipelineOverride,
 venda_ganha_stage_id: wonStageOverride,
 },
 };
 });

export const getCustomKpiCards = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((d: unknown) => z.object({
 kpiKeys: z.array(z.string().min(1)).max(80),
 data_source: z.enum(["mkton"]).optional(),
 venda_ganha_pipeline_id: z.string().optional(),
 venda_ganha_stage_id: z.string().optional(),
}).parse(d))
.handler(async ({ data, context }) => {
 const sb = context.supabase as unknown as AnySb;
 let wsId: string;
 try {
  wsId = await loadActiveWorkspace(sb, context.userId);
 } catch {
  return { cards: [] as KpiCardData[] };
 }
 const keys = Array.from(new Set(data.kpiKeys));
 if (keys.length === 0) return { cards: [] as KpiCardData[] };

 const { data: source } = await sb
.from("crm_sources")
.select("id, provider, display_name")
.eq("workspace_id", wsId)
.eq("provider", "mkton")
.maybeSingle();

 const crmSource = source as DbSource | null;
 const sourceLabel = crmSource?.display_name || "Vanessa Simoni";

 const [leadsRes, pipelinesRes, stagesRes, fieldsRes, customValuesRes, tasksRes, companiesRes] = await Promise.all([
 readDashboardRows(sb, wsId, "leads", "id, status, pipeline_id, stage_id, value, tags, created_at"),
 readDashboardRows(sb, wsId, "pipelines", "id, name"),
 readDashboardRows(sb, wsId, "pipeline_stages", "id, pipeline_id, name"),
 readDashboardRows(sb, wsId, "lead_custom_fields", "id, name, field_type", { optional: true }),
 readDashboardRows(sb, wsId, "lead_custom_field_values", "lead_id, field_id, value", { optional: true }),
 readDashboardRows(sb, wsId, "tasks", "id, status, start_at", { optional: true }),
 readDashboardRows(sb, wsId, "companies", "id"),
 ]);
 for (const result of [leadsRes, pipelinesRes, stagesRes, companiesRes]) {
   if (result.error) throw new Error(result.error.message);
 }

 const leads = (leadsRes.data?? []) as Array<{ id: string; pipeline_id: string | null; stage_id: string | null; value: number | string | null; tags: unknown; created_at: string }>;
 const pipelineById = new Map(((pipelinesRes.data?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
 const stages = (stagesRes.data?? []) as Array<{ id: string; pipeline_id: string; name: string }>;
 const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const fieldById = new Map(((fieldsRes.data?? []) as Array<{ id: string; name: string; field_type: string }>).map((field) => [field.id, field]));
  const activeLeadIds = new Set(leads.map((lead) => lead.id));
  const customValues = ((customValuesRes.data?? []) as Array<{ lead_id: string; field_id: string; value: unknown }>).filter((row) => activeLeadIds.has(row.lead_id));
  const tasks = (tasksRes.data?? []) as Array<{ id: string; status: string | null; start_at: string | null }>;
  const companies = (companiesRes.data?? []) as Array<{ id: string }>;

 const wonStageOverride = data.venda_ganha_stage_id || null;
 const wonPipelineOverride = data.venda_ganha_pipeline_id || null;
 const hasWonOverride = Boolean(wonStageOverride || wonPipelineOverride);
 function classify(lead: { status?: string; pipeline_id: string | null; stage_id: string | null }): "won" | "lost" | "open" {
   return classifyDashboardLead(lead, stageById.get(lead.stage_id ?? "")?.name, data);
 }
 const openLeads = leads.filter((lead) => classify(lead) === "open");
 const wonLeads = leads.filter((lead) => classify(lead) === "won");
 const lostLeads = leads.filter((lead) => classify(lead) === "lost");
 const valueOpen = openLeads.reduce((sum, lead) => sum + toNumber(lead.value), 0);
 const valueWon = wonLeads.reduce((sum, lead) => sum + toNumber(lead.value), 0);
 const now = Date.now();
 const day = 24 * 60 * 60 * 1000;
 const leadsInDays = (days: number) => leads.filter((lead) => {
 const created = new Date(lead.created_at).getTime();
 return Number.isFinite(created) && created <= now && created >= now - days * day;
 }).length;
  const openTasks = tasks.filter((task) => task.status === "pendente");
  const overdueTasks = openTasks.filter((task) => {
   const start = task.start_at ? new Date(task.start_at).getTime() : Number.NaN;
   return Number.isFinite(start) && start < now;
  });

  const metaTotals = keys.some((key) => key.startsWith("meta.")) ? await loadDashboardMetaTotals(sb, wsId) : null;

  // Chaves novas usam `crm.`; chaves antigas salvas no navegador podem vir como `mkton.`.
 function matchSuffix(key: string): string | null {
   if (key.startsWith("crm.")) return key.slice(4);
    if (key.startsWith("mkton.pipeline.")) return key.slice(6);
    if (key.startsWith("mkton.stage.")) return key.slice(6);
    if (key.startsWith("mkton.tag.")) return key.slice(6);
    if (key.startsWith("mkton.field.")) return `custom_${key.slice(6)}`;
    if (key.startsWith("mkton.")) return key.slice(6);
   return null;
 }

 const cards = keys.map((key): KpiCardData => {
  const optionalIssue = key.includes("tasks_") ? tasksRes.issue
    : /(?:custom_field|mkton\.field\.)/.test(key) ? (fieldsRes.issue ?? customValuesRes.issue) : undefined;
  if (optionalIssue) return { ...emptyKpi(key, humanizeKpiKey(key), "count", optionalIssue.message), source_label: sourceLabel };
  if (key.startsWith("meta.")) return metaDashboardCard(key, metaTotals);
   if (key === "mkton.tasks_open") return kpi(key, "Tarefas em aberto", openTasks.length, "count", "Tarefas pendentes no calendário", sourceLabel, null);
   if (key === "mkton.tasks_overdue") return kpi(key, "Tarefas atrasadas", overdueTasks.length, "count", "Tarefas vencidas e não concluídas", sourceLabel, null);
   if (key === "mkton.companies_total") return kpi(key, "Empresas cadastradas", companies.length, "count", "Total de empresas no CRM", sourceLabel, null);
 const suffix = matchSuffix(key);
 if (suffix === "leads_total") return kpi(key, "Leads totais", leads.length, "count", "Total de leads no CRM", sourceLabel, null);
 if (suffix === "leads_abertos") return kpi(key, "Leads em aberto", openLeads.length, "count", "Leads em etapas abertas", sourceLabel, null);
 if (suffix === "leads_ganhos") return kpi(key, "Leads ganhos", wonLeads.length, "count", "Leads em etapas ganhas", sourceLabel, null);
 if (suffix === "leads_perdidos") return kpi(key, "Leads perdidos", lostLeads.length, "count", "Leads em etapas perdidas", sourceLabel, null);
 if (suffix === "valor_pipeline") return kpi(key, "Valor do pipeline", valueOpen, "currency_brl", "Soma dos leads em aberto", sourceLabel, null);
 if (suffix === "valor_ganho") return kpi(key, "Valor ganho", valueWon, "currency_brl", "Soma dos leads ganhos", sourceLabel, null);
 if (suffix === "ticket_medio") return kpi(key, "Ticket médio", wonLeads.length? valueWon / wonLeads.length: 0, "currency_brl", "Valor médio por venda ganha", sourceLabel, null);
 if (suffix === "taxa_conversao") return kpi(key, "Taxa de conversão", leads.length? wonLeads.length / leads.length: 0, "percent", "Ganhos ÷ total de leads", sourceLabel, null);
 if (suffix === "leads_24h") return kpi(key, "Leads recebidos (24h)", leadsInDays(1), "count", "Criados nas últimas 24h", sourceLabel, dailySeries(leads, 2));
 if (suffix === "leads_7d") return kpi(key, "Leads recebidos (7d)", leadsInDays(7), "count", "Criados nos últimos 7 dias", sourceLabel, dailySeries(leads, 7));
 if (suffix === "leads_30d") return kpi(key, "Leads recebidos (30d)", leadsInDays(30), "count", "Criados nos últimos 30 dias", sourceLabel, dailySeries(leads, 30));

 const pipelineMatch = suffix?.match(/^pipeline\.([^.]+)\.(count|value)$/);
 if (pipelineMatch) {
 const [, pipelineId, mode] = pipelineMatch;
 const selected = leads.filter((lead) => lead.pipeline_id === pipelineId);
 const pipelineName = pipelineById.get(pipelineId)?? "funil";
 return kpi(key, mode === "value"? `Valor · ${pipelineName}`: `Leads · ${pipelineName}`, mode === "value"? selected.reduce((sum, lead) => sum + toNumber(lead.value), 0): selected.length, mode === "value"? "currency_brl": "count", `KPI do funil ${pipelineName}`, sourceLabel, null);
 }

 const stageMatch = suffix?.match(/^stage\.([^.]+)\.(count|value)$/);
 if (stageMatch) {
 const [, stageId, mode] = stageMatch;
 const stage = stageById.get(stageId);
 const selected = leads.filter((lead) => lead.stage_id === stageId);
 const stageName = stage?.name?? "etapa";
 const pipelineName = stage? pipelineById.get(stage.pipeline_id)?? "Funil": "Funil";
 return kpi(
 key,
 mode === "value"? `Valor · ${stageName}`: `Leads · ${stageName}`,
 mode === "value"? selected.reduce((sum, lead) => sum + toNumber(lead.value), 0): selected.length,
 mode === "value"? "currency_brl": "count",
 `${pipelineName} · ${stageName}`,
 sourceLabel,
 dailySeries(selected, 7),
 );
 }

 const tagMatch = suffix?.match(/^tag\.(.+)$/);
 if (tagMatch) {
 const tagName = tagMatch[1];
  const count = leads.filter((lead) => Array.isArray(lead.tags) && (lead.tags as unknown[]).map(tagLabel).includes(tagName)).length;
 return kpi(key, `Tag · ${tagName}`, count, "count", `Leads com a tag "${tagName}"`, sourceLabel, null);
 }

  const fieldMatch = suffix?.match(/^custom_field\.([^.]+)\.(filled|unique|sum|avg)$/);
  if (fieldMatch) {
  const [, fieldId, mode] = fieldMatch;
  const field = fieldById.get(fieldId);
  const fieldName = field?.name?? "campo personalizado";
  const values = customValues.filter((row) => row.field_id === fieldId).map((row) => customDisplayValue(row.value)).filter(Boolean);
  if (mode === "filled") return kpi(key, `${fieldName} preenchido`, values.length, "count", `Leads com ${fieldName} preenchido`, sourceLabel, null);
  if (mode === "unique") return kpi(key, `${fieldName} únicos`, new Set(values.map((value) => value.toLowerCase())).size, "count", `Valores únicos em ${fieldName}`, sourceLabel, null);
  const nums = values.map((value) => Number(String(value).replace(/\./g, "").replace(",", "."))).filter((value) => Number.isFinite(value));
  if (mode === "sum") return kpi(key, `Soma · ${fieldName}`, nums.reduce((sum, value) => sum + value, 0), "count", `Soma numérica de ${fieldName}`, sourceLabel, null);
  if (mode === "avg") return kpi(key, `Média · ${fieldName}`, nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0, "count", `Média numérica de ${fieldName}`, sourceLabel, null);
  }

  const legacyFieldOptionMatch = suffix?.match(/^custom_field\.([^.]+)\.(?:enum|option|value)\.(.+)$/);
  if (legacyFieldOptionMatch) {
   const [, fieldId, optionToken] = legacyFieldOptionMatch;
   const field = fieldById.get(fieldId);
   const fieldName = field?.name?? "campo personalizado";
   const count = customValues.filter((row) => {
    if (row.field_id !== fieldId) return false;
    const display = customDisplayValue(row.value).toLowerCase();
    const token = optionToken.toLowerCase();
    const raw = row.value && typeof row.value === "object" && !Array.isArray(row.value)
     ? (row.value as Record<string, unknown>).raw
     : row.value;
    const rawText = Array.isArray(raw) ? raw.map(String).join(",").toLowerCase() : String(raw ?? "").toLowerCase();
    return display === token || rawText === token || rawText.split(",").map((v) => v.trim()).includes(token);
   }).length;
   return kpi(key, `Opção · ${fieldName}`, count, "count", `Leads com opção específica em ${fieldName}`, sourceLabel, null);
  }

 return kpi(key, humanizeKpiKey(key), null, "count", "KPI aguardando dados.", sourceLabel, null, "no_data");
 });

 return { cards };
 });
