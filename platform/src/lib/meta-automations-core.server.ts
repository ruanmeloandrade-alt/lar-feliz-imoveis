// Executor de regras de automação Meta. Server-only.
// Multi-tenant: cada regra tem workspace_id próprio e só toca dados/tokens
// desse workspace.

import { META_KPI_CATALOG } from "@/lib/meta-dashboard-kpis";

const GRAPH = "v23.0";

type MetaAction = { action_type: string; value: string };
type VideoAction = { action_type?: string; value: string };
type Insight = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  actions?: MetaAction[];
  purchase_roas?: Array<{ value: string }>;
  frequency?: string;
  inline_link_clicks?: string;
  unique_inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  unique_clicks?: string;
  unique_ctr?: string;
  outbound_clicks?: MetaAction[];
  unique_outbound_clicks?: MetaAction[];
  unique_outbound_clicks_ctr?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  cost_per_thruplay?: Array<{ value: string }>;
  action_values?: MetaAction[];
  website_purchase_roas?: Array<{ value: string }>;
  video_play_actions?: VideoAction[];
  video_15_sec_watched_actions?: VideoAction[];
  video_30_sec_watched_actions?: VideoAction[];
  video_p25_watched_actions?: VideoAction[];
  video_p50_watched_actions?: VideoAction[];
  video_p75_watched_actions?: VideoAction[];
  video_p95_watched_actions?: VideoAction[];
  video_p100_watched_actions?: VideoAction[];
  video_thruplay_watched_actions?: VideoAction[];
  video_avg_time_watched_actions?: VideoAction[];
};

export type AutomationRule = {
  id: string;
  workspace_id: string;
  name: string;
  enabled: boolean;
  scope_type: "workspace" | "ad_account" | "campaign" | "adset" | "ad";
  scope_id: string | null;
  trigger_metric: string;
  trigger_operator: "gt" | "gte" | "lt" | "lte" | "eq";
  trigger_value: number;
  trigger_window: string;
  action_type: string;
  action_value: number | null;
  action_config?: Record<string, unknown> | null;
  cooldown_minutes: number;
  scan_interval_minutes: number | null;
  last_run_at: string | null;
};

/** Condição individual (métrica / operador / valor) usada no gatilho e no "se" das ações. */
export type RuleCondition = { metric: string; operator: AutomationRule["trigger_operator"]; value: number };

/** Uma ação individual dentro de uma regra. Uma regra pode ter várias. */
export type ActionSpec = {
  type: string;
  value: number | null;
  valueMode: "percent" | "absolute";
  params?: Record<string, unknown>;
  /** "se" opcional: a ação só roda quando estas condições baterem. */
  conditions?: RuleCondition[];
  conditionLogic?: "and" | "or";
};

/** Objeto Meta que a regra está observando. */
export type AutomationTarget = { level: "campaign" | "adset" | "ad"; id: string };


function sumAction(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  let n = 0;
  for (const a of actions) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}
function sumVideo(a: VideoAction[] | undefined): number {
  if (!a) return 0;
  let n = 0;
  for (const x of a) n += Number(x.value) || 0;
  return n;
}

function sumAll(actions: MetaAction[] | VideoAction[] | undefined): number {
  if (!actions) return 0;
  return actions.reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function cost(spend: number, count: number): number {
  return count > 0 ? spend / count : 0;
}

const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const PURCHASE_TYPES = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];
const ACTION_TYPES = {
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_lead", "onsite_conversion.messenger_lead"],
  purchases: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
  websitePurchases: ["offsite_conversion.fb_pixel_purchase", "website_purchase"],
  addToCart: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"],
  wishlistAdds: ["add_to_wishlist", "offsite_conversion.fb_pixel_add_to_wishlist", "omni_add_to_wishlist"],
  initiateCheckout: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"],
  addPaymentInfo: ["add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"],
  viewContent: ["view_content", "offsite_conversion.fb_pixel_view_content", "omni_view_content"],
  completeRegistration: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration", "omni_complete_registration"],
  subscribe: ["subscribe", "offsite_conversion.fb_pixel_subscribe"],
  contact: ["contact", "offsite_conversion.fb_pixel_contact"],
  donate: ["donate", "offsite_conversion.fb_pixel_donate"],
  appInstalls: ["mobile_app_install", "app_install", "omni_app_install"],
  submitApplication: ["submit_application", "offsite_conversion.fb_pixel_submit_application"],
  startTrial: ["start_trial", "offsite_conversion.fb_pixel_start_trial"],
  search: ["search", "offsite_conversion.fb_pixel_search"],
  findLocation: ["find_location", "offsite_conversion.fb_pixel_find_location"],
  customEvents: ["custom_event", "offsite_conversion.fb_pixel_custom"],
  postEngagement: ["post_engagement"],
  pageEngagement: ["page_engagement"],
  postReaction: ["post_reaction"],
  postComment: ["comment"],
  postShare: ["post"],
  postSave: ["onsite_conversion.post_save"],
  pageLike: ["like"],
  linkClick: ["link_click"],
  photoView: ["photo_view"],
  landingPageView: ["landing_page_view"],
  instagramProfileVisits: ["onsite_conversion.ig_profile_visit", "instagram_profile_visit"],
  instagramFollows: ["onsite_conversion.ig_follow", "instagram_follow"],
  messagingSubscriptions: ["onsite_conversion.messaging_user_subscribed", "messaging_user_subscribed"],
  newMessagingContacts: ["onsite_conversion.messaging_first_reply", "onsite_conversion.new_messaging_connection"],
  messagingConversationsStarted: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_conversation_started"],
  messengerCalls: ["onsite_conversion.messenger_call", "messenger_call"],
  phoneCalls: ["phone_call", "onsite_conversion.phone_call"],
} as const;

const KPI_FIELD_BY_KEY = new Map(META_KPI_CATALOG.map((k) => [k.key, k.totalsField]));

function computeTotals(row: Insight): Record<string, number> {
  const spend = Number(row.spend) || 0;
  const impressions = Number(row.impressions) || 0;
  const clicks = Number(row.clicks) || 0;
  const reach = Number(row.reach) || 0;
  const leads = sumAction(row.actions, [...ACTION_TYPES.leads]);
  const purchases = sumAction(row.actions, [...ACTION_TYPES.purchases]);
  const websitePurchases = sumAction(row.actions, [...ACTION_TYPES.websitePurchases]);
  const linkClicks = Number(row.inline_link_clicks) || sumAction(row.actions, [...ACTION_TYPES.linkClick]);
  const uniqueLinkClicks = Number(row.unique_inline_link_clicks) || 0;
  const uniqueClicks = Number(row.unique_clicks) || 0;
  const outboundClicks = sumAll(row.outbound_clicks);
  const uniqueOutboundClicks = sumAll(row.unique_outbound_clicks);
  const landingPageViews = sumAction(row.actions, [...ACTION_TYPES.landingPageView]);
  const addToCart = sumAction(row.actions, [...ACTION_TYPES.addToCart]);
  const wishlistAdds = sumAction(row.actions, [...ACTION_TYPES.wishlistAdds]);
  const initiateCheckout = sumAction(row.actions, [...ACTION_TYPES.initiateCheckout]);
  const addPaymentInfo = sumAction(row.actions, [...ACTION_TYPES.addPaymentInfo]);
  const viewContent = sumAction(row.actions, [...ACTION_TYPES.viewContent]);
  const completeRegistration = sumAction(row.actions, [...ACTION_TYPES.completeRegistration]);
  const subscribe = sumAction(row.actions, [...ACTION_TYPES.subscribe]);
  const contact = sumAction(row.actions, [...ACTION_TYPES.contact]);
  const donate = sumAction(row.actions, [...ACTION_TYPES.donate]);
  const appInstalls = sumAction(row.actions, [...ACTION_TYPES.appInstalls]);
  const submitApplication = sumAction(row.actions, [...ACTION_TYPES.submitApplication]);
  const startTrial = sumAction(row.actions, [...ACTION_TYPES.startTrial]);
  const search = sumAction(row.actions, [...ACTION_TYPES.search]);
  const findLocation = sumAction(row.actions, [...ACTION_TYPES.findLocation]);
  const customEvents = sumAction(row.actions, [...ACTION_TYPES.customEvents]);
  const postEngagement = sumAction(row.actions, [...ACTION_TYPES.postEngagement]);
  const pageEngagement = sumAction(row.actions, [...ACTION_TYPES.pageEngagement]);
  const pageLike = sumAction(row.actions, [...ACTION_TYPES.pageLike]);
  const videoPlays = sumVideo(row.video_play_actions);
  const videoViews = sumAction(row.actions, ["video_view"]);
  const videoThruplay = sumVideo(row.video_thruplay_watched_actions);
  const videoP25 = sumVideo(row.video_p25_watched_actions);
  const videoP50 = sumVideo(row.video_p50_watched_actions);
  const videoP75 = sumVideo(row.video_p75_watched_actions);
  const videoP95 = sumVideo(row.video_p95_watched_actions);
  const videoP100 = sumVideo(row.video_p100_watched_actions);
  const video15s = sumVideo(row.video_15_sec_watched_actions);
  const video30s = sumVideo(row.video_30_sec_watched_actions);
  const videoAvgWatchTime = sumVideo(row.video_avg_time_watched_actions);
  const newMessagingContacts = sumAction(row.actions, [...ACTION_TYPES.newMessagingContacts]);
  const messagingConversationsStarted = sumAction(row.actions, [...ACTION_TYPES.messagingConversationsStarted]);
  const results = leads || purchases || messagingConversationsStarted || newMessagingContacts || linkClicks || postEngagement;
  const purchaseValueActual = sumAction(row.action_values, [...ACTION_TYPES.purchases]);
  const websitePurchaseValue = sumAction(row.action_values, [...ACTION_TYPES.websitePurchases]);
  const totalActionValue = sumAll(row.action_values);

  return {
    spend, impressions, clicks, reach, leads, purchases, websitePurchases, results,
    costPerResult: cost(spend, results), resultRate: impressions > 0 ? (results / impressions) * 100 : 0,
    resultValue: purchaseValueActual || totalActionValue, resultRoas: spend > 0 ? ((purchaseValueActual || totalActionValue) / spend) : 0,
    linkClicks, uniqueLinkClicks, uniqueClicks, outboundClicks, uniqueOutboundClicks, landingPageViews,
    addToCart, wishlistAdds, initiateCheckout, addPaymentInfo, viewContent, completeRegistration, subscribe, contact, donate,
    appInstalls, submitApplication, startTrial, search, findLocation, customEvents,
    postEngagement, pageEngagement, postReaction: sumAction(row.actions, [...ACTION_TYPES.postReaction]), postComment: sumAction(row.actions, [...ACTION_TYPES.postComment]), postShare: sumAction(row.actions, [...ACTION_TYPES.postShare]), postSave: sumAction(row.actions, [...ACTION_TYPES.postSave]), pageLike, linkClickActions: sumAction(row.actions, [...ACTION_TYPES.linkClick]), photoView: sumAction(row.actions, [...ACTION_TYPES.photoView]),
    instagramProfileVisits: sumAction(row.actions, [...ACTION_TYPES.instagramProfileVisits]), instagramFollows: sumAction(row.actions, [...ACTION_TYPES.instagramFollows]),
    messagingSubscriptions: sumAction(row.actions, [...ACTION_TYPES.messagingSubscriptions]), newMessagingContacts, messagingConversationsStarted,
    messengerCalls: sumAction(row.actions, [...ACTION_TYPES.messengerCalls]), phoneCalls: sumAction(row.actions, [...ACTION_TYPES.phoneCalls]),
    videoPlays, videoViews, videoContinuousPlays: videoViews, video15s, video30s, videoThruplay, videoP25, videoP50, videoP75, videoP95, videoP100,
    videoAvgWatchTime, videoHoldRate: videoPlays > 0 ? (videoP100 / videoPlays) * 100 : 0,
    videoRetentionP25: videoPlays > 0 ? (videoP25 / videoPlays) * 100 : 0, videoRetentionP50: videoPlays > 0 ? (videoP50 / videoPlays) * 100 : 0, videoRetentionP75: videoPlays > 0 ? (videoP75 / videoPlays) * 100 : 0, videoRetentionP95: videoPlays > 0 ? (videoP95 / videoPlays) * 100 : 0,
    frequency: Number(row.frequency) || 0, cpm: Number(row.cpm) || cost(spend, impressions) * 1000, cpc: Number(row.cpc) || cost(spend, clicks), ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    uniqueCtr: Number(row.unique_ctr) || 0, inlineLinkClickCtr: Number(row.inline_link_click_ctr) || (impressions > 0 ? (linkClicks / impressions) * 100 : 0), uniqueInlineLinkClickCtr: reach > 0 ? (uniqueLinkClicks / reach) * 100 : 0,
    outboundCtr: impressions > 0 ? (outboundClicks / impressions) * 100 : 0, uniqueOutboundCtr: Number(row.unique_outbound_clicks_ctr?.[0]?.value) || 0,
    cpl: cost(spend, leads), cpp: cost(spend, purchases), costPerWebsitePurchase: cost(spend, websitePurchases), costPerAtc: cost(spend, addToCart), costPerWishlistAdd: cost(spend, wishlistAdds), costPerIc: cost(spend, initiateCheckout), costPerAddPaymentInfo: cost(spend, addPaymentInfo), costPerViewContent: cost(spend, viewContent), costPerCompleteRegistration: cost(spend, completeRegistration), costPerSubscribe: cost(spend, subscribe), costPerContact: cost(spend, contact), costPerDonate: cost(spend, donate), costPerAppInstall: cost(spend, appInstalls), costPerSubmitApplication: cost(spend, submitApplication), costPerStartTrial: cost(spend, startTrial), costPerSearch: cost(spend, search), costPerFindLocation: cost(spend, findLocation), costPerCustomEvent: cost(spend, customEvents),
    costPerLpv: cost(spend, landingPageViews), costPerLinkClick: cost(spend, linkClicks), costPerUniqueLinkClick: cost(spend, uniqueLinkClicks), costPerOutboundClick: cost(spend, outboundClicks), costPerUniqueOutboundClick: cost(spend, uniqueOutboundClicks), costPerUniqueClick: cost(spend, uniqueClicks), costPerPostEngagement: cost(spend, postEngagement), costPerPageEngagement: cost(spend, pageEngagement), costPerPageLike: cost(spend, pageLike), costPerThruplay: cost(spend, videoThruplay), costPerVideoPlay: cost(spend, videoPlays), costPerVideoView: cost(spend, videoViews), costPerVideoContinuousPlay: cost(spend, videoViews),
    roas: Number(row.purchase_roas?.[0]?.value) || 0, roasActual: spend > 0 ? purchaseValueActual / spend : 0, websitePurchaseRoas: Number(row.website_purchase_roas?.[0]?.value) || 0,
    purchaseValueActual, websitePurchaseValue, totalActionValue, views: impressions,
  };
}

function computeMetric(metric: string, row: Insight): number {
  const totals = computeTotals(row);
  const field = KPI_FIELD_BY_KEY.get(metric);
  if (field && typeof totals[field] === "number") return totals[field];
  const spend = Number(row.spend) || 0;
  const clicks = Number(row.clicks) || 0;
  const imp = Number(row.impressions) || 0;
  const leads = sumAction(row.actions, LEAD_TYPES);
  const purchases = sumAction(row.actions, PURCHASE_TYPES);
  const linkClicks = Number(row.inline_link_clicks) || 0;
  const thruplay = sumVideo(row.video_thruplay_watched_actions);

  switch (metric) {
    case "cpl": return leads > 0 ? spend / leads : 0;
    case "roas": return Number(row.purchase_roas?.[0]?.value) || 0;
    case "ctr": return imp > 0 ? (clicks / imp) * 100 : 0;
    case "ctr_link": return Number(row.inline_link_click_ctr) || (imp > 0 ? (linkClicks / imp) * 100 : 0);
    case "spend": return spend;
    case "cpc": return clicks > 0 ? spend / clicks : 0;
    case "cpm": return Number(row.cpm) || (imp > 0 ? (spend / imp) * 1000 : 0);
    case "frequency": return Number(row.frequency) || 0;
    case "reach": return Number(row.reach) || 0;
    case "impressions": return imp;
    case "clicks": return clicks;
    case "link_clicks": return linkClicks;
    case "purchases": return purchases;
    case "cost_per_purchase": return purchases > 0 ? spend / purchases : 0;
    case "results": return leads > 0 ? leads : purchases;
    case "cost_per_result": {
      const r = leads > 0 ? leads : purchases;
      return r > 0 ? spend / r : 0;
    }
    case "video_p25": return sumVideo(row.video_p25_watched_actions);
    case "video_p50": return sumVideo(row.video_p50_watched_actions);
    case "video_p75": return sumVideo(row.video_p75_watched_actions);
    case "video_p95": return sumVideo(row.video_p95_watched_actions);
    case "video_complete": return sumVideo(row.video_p100_watched_actions);
    case "thruplay": return thruplay;
    case "cost_per_thruplay": return thruplay > 0 ? spend / thruplay : 0;
    case "video_avg_time": return sumVideo(row.video_avg_time_watched_actions);
    default: return 0;
  }
}

function evalOp(op: AutomationRule["trigger_operator"], a: number, b: number): boolean {
  switch (op) {
    case "gt": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
    case "eq": return Math.abs(a - b) < 1e-9;
  }
}

const INSIGHTS_FIELDS = [
  "spend","impressions","clicks","ctr","cpc","cpm","reach","frequency",
  "unique_clicks","unique_ctr","inline_link_clicks","unique_inline_link_clicks","inline_link_click_ctr",
  "outbound_clicks","unique_outbound_clicks","unique_outbound_clicks_ctr",
  "actions","action_values","purchase_roas","website_purchase_roas",
  "video_play_actions","video_15_sec_watched_actions","video_30_sec_watched_actions",
  "video_p25_watched_actions","video_p50_watched_actions","video_p75_watched_actions",
  "video_p95_watched_actions","video_p100_watched_actions",
  "video_thruplay_watched_actions","video_avg_time_watched_actions",
].join(",");

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

async function metaPost(path: string, token: string, body: Record<string, string>): Promise<void> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const fd = new URLSearchParams({ ...body, access_token: token });
  const r = await fetch(url.toString(), { method: "POST", body: fd });
  if (!r.ok) throw new Error(`Meta POST ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function loadWorkspaceToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  workspaceId: string,
): Promise<string> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  const { data, error } = await supabaseAdmin.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Meta não conectada.");
  const token = (data as { access_token?: string }).access_token;
  if (!token) throw new Error("Access token ausente.");
  return token;
}

type RunResult = {
  matched: boolean;
  metric_value: number | null;
  action_taken: string | null;
  status: "ok" | "skipped" | "error";
  error?: string;
  campaign_id?: string | null;
};

const OPS: ReadonlyArray<AutomationRule["trigger_operator"]> = ["gt", "gte", "lt", "lte", "eq"];

function parseConditions(raw: unknown): RuleCondition[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((c) => ({
      metric: String(c.metric ?? ""),
      operator: (OPS.includes(c.operator as AutomationRule["trigger_operator"]) ? c.operator : "gt") as AutomationRule["trigger_operator"],
      value: Number(c.value ?? 0),
    }))
    .filter((c) => c.metric && Number.isFinite(c.value));
}

/** Condições do gatilho ("quando disparar"). Formato novo = lista com E/OU; legado = trigger_* da regra. */
export function ruleConditions(rule: AutomationRule): { conditions: RuleCondition[]; logic: "and" | "or" } {
  const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
  const list = parseConditions(cfg.conditions);
  const logic = cfg.conditionLogic === "or" ? "or" : "and";
  if (list.length > 0) return { conditions: list, logic };
  return {
    conditions: [{ metric: rule.trigger_metric, operator: rule.trigger_operator, value: rule.trigger_value }],
    logic: "and",
  };
}

/** Avalia uma lista de condições contra uma linha de insights. */
export function evaluateConditions(conditions: RuleCondition[], logic: "and" | "or", row: Insight): boolean {
  if (conditions.length === 0) return true;
  const results = conditions.map((c) => evalOp(c.operator, computeMetric(c.metric, row), c.value));
  return logic === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** Lê as ações da regra. Suporta o formato novo (lista) e o legado (uma ação só). */
export function ruleActions(rule: AutomationRule): ActionSpec[] {
  const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(cfg.actions) ? (cfg.actions as Array<Record<string, unknown>>) : [];
  const list: ActionSpec[] = raw
    .map((a) => ({
      type: String(a.type ?? ""),
      value: a.value === null || a.value === undefined || a.value === "" ? null : Number(a.value),
      valueMode: (a.valueMode === "absolute" ? "absolute" : "percent") as "percent" | "absolute",
      params: (a.params && typeof a.params === "object" ? a.params as Record<string, unknown> : {}),
      conditions: parseConditions(a.conditions),
      conditionLogic: (a.conditionLogic === "or" ? "or" : "and") as "and" | "or",
    }))
    .filter((a) => a.type);
  if (list.length > 0) return list;
  return [{
    type: rule.action_type,
    value: rule.action_value ?? null,
    valueMode: ((rule as unknown as { action_value_mode?: string }).action_value_mode === "absolute" ? "absolute" : "percent"),
  }];
}

/** Resolve a hierarquia (campanha/conjunto/anúncio) do objeto observado. */
async function resolveTarget(target: AutomationTarget, token: string): Promise<{ campaignId: string; adsetId: string | null; adId: string | null }> {
  if (target.level === "campaign") return { campaignId: target.id, adsetId: null, adId: null };
  if (target.level === "adset") {
    const i = await metaGet<{ campaign_id?: string }>(target.id, token, { fields: "campaign_id" });
    return { campaignId: i.campaign_id ?? "", adsetId: target.id, adId: null };
  }
  const i = await metaGet<{ campaign_id?: string; adset_id?: string }>(target.id, token, { fields: "campaign_id,adset_id" });
  return { campaignId: i.campaign_id ?? "", adsetId: i.adset_id ?? null, adId: target.id };
}

async function changeBudget(objectId: string, kind: "increase" | "decrease", spec: ActionSpec, token: string): Promise<string> {
  const raw = Number(spec.value ?? 0);
  if (raw <= 0) throw new Error("Valor da ação de orçamento inválido.");
  const info = await metaGet<{ daily_budget?: string; lifetime_budget?: string }>(objectId, token, { fields: "daily_budget,lifetime_budget" });
  const budgetField = info.daily_budget ? "daily_budget" : info.lifetime_budget ? "lifetime_budget" : null;
  if (!budgetField) throw new Error("Objeto sem orçamento próprio (o orçamento pode estar em outro nível).");
  const cur = Number(info[budgetField]) || 0;
  if (cur <= 0) throw new Error("Orçamento atual inválido.");
  let next: number;
  if (spec.valueMode === "absolute") {
    const deltaMinor = Math.round(raw * 100);
    next = kind === "increase" ? cur + deltaMinor : cur - deltaMinor;
  } else {
    const mult = kind === "increase" ? 1 + raw / 100 : 1 - raw / 100;
    next = Math.round(cur * mult);
  }
  next = Math.max(100, next);
  await metaPost(objectId, token, { [budgetField]: String(next) });
  return `${budgetField}:${cur}->${next}`;
}

/**
 * Executa UMA ação sobre o objeto observado.
 * Quando a regra observa um conjunto ou anúncio específico, a ação recai
 * exatamente sobre ele. Quando observa a campanha, cai nos filhos dela.
 */
async function applyAction(
  rule: AutomationRule,
  spec: ActionSpec,
  target: AutomationTarget,
  ids: { campaignId: string; adsetId: string | null; adId: string | null },
  token: string,
): Promise<string> {
  const action = spec.type;
  const campaignId = ids.campaignId;

  if (action === "notify_only") {
    const msg = String((spec.params ?? {}).message ?? "").trim();
    await notifyWorkspace(rule, msg || `Regra "${rule.name}" disparou.`, campaignId);
    return "notified";
  }

  if (action === "create_workflow_task" || action === "create_calendar_task") {
    return createAutomationTask(rule, spec, campaignId, token);
  }
  if (action === "pause_campaign") { await metaPost(campaignId, token, { status: "PAUSED" }); return "paused_campaign"; }
  if (action === "activate_campaign") { await metaPost(campaignId, token, { status: "ACTIVE" }); return "activated_campaign"; }

  if (action === "increase_budget" || action === "decrease_budget") {
    const kind = action === "increase_budget" ? "increase" : "decrease";
    const objectId = ids.adsetId ?? campaignId;
    return changeBudget(objectId, kind, spec, token);
  }

  if (action === "duplicate_campaign") {
    const p = spec.params ?? {};
    const dupe = await metaPostJson<{ copied_campaign_id?: string; id?: string }>(`${campaignId}/copies`, token, {
      deep_copy: "true",
      status_option: dupStatusOption(p),
    });
    const newId = dupe.copied_campaign_id ?? dupe.id ?? null;
    if (newId) await applyDuplicateTweaks(newId, campaignId, p, token);
    return `duplicated_campaign${newId ? `:${newId}` : ""}`;
  }

  // Nível conjunto: se a regra aponta um conjunto (direto ou via anúncio), age só nele.
  if (action === "pause_adset" || action === "activate_adset" || action === "duplicate_adset") {
    const adsets = ids.adsetId
      ? [{ id: ids.adsetId }]
      : ((await metaGet<{ data: Array<{ id: string }> }>(`${campaignId}/adsets`, token, { fields: "id", limit: "50" })).data ?? []);
    for (const s of adsets) {
      if (action === "pause_adset") await metaPost(s.id, token, { status: "PAUSED" });
      else if (action === "activate_adset") await metaPost(s.id, token, { status: "ACTIVE" });
      else {
        const p = spec.params ?? {};
        const dupe = await metaPostJson<{ copied_adset_id?: string; id?: string }>(`${s.id}/copies`, token, {
          deep_copy: "true", status_option: dupStatusOption(p),
        });
        const newId = dupe.copied_adset_id ?? dupe.id ?? null;
        if (newId) await applyDuplicateTweaks(newId, s.id, p, token);
      }
    }
    return `${action}:${adsets.length}`;
  }

  // Nível anúncio: se a regra aponta um anúncio, age só nele; se aponta conjunto, nos anúncios dele.
  if (action === "pause_ad" || action === "activate_ad" || action === "duplicate_ad") {
    let ads: Array<{ id: string }>;
    if (ids.adId) ads = [{ id: ids.adId }];
    else if (ids.adsetId) ads = (await metaGet<{ data: Array<{ id: string }> }>(`${ids.adsetId}/ads`, token, { fields: "id", limit: "100" })).data ?? [];
    else ads = (await metaGet<{ data: Array<{ id: string }> }>(`${campaignId}/ads`, token, { fields: "id", limit: "100" })).data ?? [];
    for (const a of ads) {
      if (action === "pause_ad") await metaPost(a.id, token, { status: "PAUSED" });
      else if (action === "activate_ad") await metaPost(a.id, token, { status: "ACTIVE" });
      else {
        const p = spec.params ?? {};
        const dupe = await metaPostJson<{ copied_ad_id?: string; id?: string }>(`${a.id}/copies`, token, {
          status_option: dupStatusOption(p),
        });
        const newId = dupe.copied_ad_id ?? dupe.id ?? null;
        if (newId) await applyDuplicateTweaks(newId, a.id, p, token, true);
      }
    }
    return `${action}:${ads.length}`;
  }

  void target;



  // ---- Audiências ----
  // Cria um público personalizado a partir do escopo (campanha atual).
  // action_config: { audienceType, retentionDays, nameTemplate, pixelId?, pageId?, igId?, percent? }
  if (action === "create_audience_from_source") {
    const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
    const audienceType = String(cfg.audienceType ?? "engagement_page");
    const retentionDays = Number(cfg.retentionDays ?? 30);
    const nameTemplate = String(cfg.nameTemplate ?? "Auto · {{campaign_name}} · {{date}}");
    const camp = await metaGet<{ name?: string; account_id?: string }>(campaignId, token, { fields: "name,account_id" });
    const accountId = camp.account_id ? (camp.account_id.startsWith("act_") ? camp.account_id : `act_${camp.account_id}`) : null;
    if (!accountId) throw new Error("Conta de anúncio da campanha não encontrada.");
    const name = nameTemplate
      .replace("{{campaign_name}}", camp.name ?? campaignId)
      .replace("{{date}}", new Date().toISOString().slice(0, 10));

    // Regra mínima por tipo
    let subtype = "ENGAGEMENT";
    let ruleJson: Record<string, unknown> = {};
    if (audienceType === "website") {
      subtype = "WEBSITE";
      if (!cfg.pixelId) throw new Error("Pixel obrigatório para público de site.");
      ruleJson = {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: String(cfg.pixelId), type: "pixel" }],
            retention_seconds: retentionDays * 86400,
            filter: { operator: "and", filters: [{ field: "url", operator: "i_contains", value: String(cfg.urlContains ?? "") }] },
          }],
        },
      };
    } else if (audienceType === "video") {
      const ads = await metaGet<{ data: Array<{ creative?: { video_id?: string } }> }>(`${campaignId}/ads`, token, { fields: "creative{video_id}", limit: "50" });
      const videoIds = Array.from(new Set((ads.data ?? []).map((a) => a.creative?.video_id).filter(Boolean))) as string[];
      if (!videoIds.length) throw new Error("Nenhum vídeo encontrado nos anúncios da campanha.");
      const percent = Number(cfg.percent ?? 25);
      ruleJson = {
        inclusions: {
          operator: "or",
          rules: videoIds.map((vid) => ({
            event_sources: [{ id: vid, type: "video" }],
            retention_seconds: retentionDays * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: `video_view_${percent}_pcnt` }] },
          })),
        },
      };
    } else if (audienceType === "engagement_page") {
      if (!cfg.pageId) throw new Error("pageId obrigatório.");
      ruleJson = {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: String(cfg.pageId), type: "page" }],
            retention_seconds: retentionDays * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "page_engaged" }] },
          }],
        },
      };
    } else if (audienceType === "engagement_ig") {
      if (!cfg.igId) throw new Error("igId obrigatório.");
      ruleJson = {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: String(cfg.igId), type: "ig_business" }],
            retention_seconds: retentionDays * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "ig_business_profile_all" }] },
          }],
        },
      };
    } else {
      throw new Error(`audienceType não suportado em automação: ${audienceType}`);
    }

    const res = await metaPostJson<{ id: string }>(`${accountId}/customaudiences`, token, {
      name, subtype, retention_days: String(retentionDays), rule: JSON.stringify(ruleJson), prefill: "1",
    });
    // Persiste no banco pra outras regras encadearem
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("meta_custom_audiences").insert({
        workspace_id: rule.workspace_id,
        ad_account_id: accountId,
        audience_id: res.id,
        name,
        audience_type: audienceType,
        subtype,
        retention_days: retentionDays,
        rule: ruleJson as never,
        origin: "automation",
        source_rule_id: rule.id,
        source_campaign_id: campaignId,
      });
    } catch (e) {
      console.warn("[automation] persist audience falhou:", (e as Error).message);
    }
    return `created_audience:${res.id}`;
  }

  // Cria lookalike a partir do último público criado por esta regra (ou audienceId em config).
  if (action === "create_lookalike_from_audience") {
    const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
    const originAudienceId = String(cfg.audienceId ?? "") || (await findLatestAudienceForRule(rule.id)) || "";
    if (!originAudienceId) throw new Error("Nenhum público de origem encontrado.");
    const country = String(cfg.country ?? "BR").toUpperCase();
    const ratio = Number(cfg.ratio ?? 0.01);
    const startingRatio = cfg.startingRatio != null ? Number(cfg.startingRatio) : null;
    const camp = await metaGet<{ account_id?: string; name?: string }>(campaignId, token, { fields: "name,account_id" });
    const accountId = camp.account_id ? (camp.account_id.startsWith("act_") ? camp.account_id : `act_${camp.account_id}`) : null;
    if (!accountId) throw new Error("Conta de anúncio da campanha não encontrada.");
    const rangeLabel = startingRatio != null
      ? `${Math.round(startingRatio * 100)}-${Math.round(ratio * 100)}%`
      : `${Math.round(ratio * 100)}%`;
    const name = `LAL ${rangeLabel} · ${camp.name ?? campaignId}`;
    const lookalikeSpec: Record<string, unknown> = { ratio, country, type: "similarity" };
    if (startingRatio != null) lookalikeSpec.starting_ratio = startingRatio;
    const res = await metaPostJson<{ id: string }>(`${accountId}/customaudiences`, token, {
      name, subtype: "LOOKALIKE",
      origin_audience_id: originAudienceId,
      lookalike_spec: JSON.stringify(lookalikeSpec),
    });
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("meta_custom_audiences").insert({
        workspace_id: rule.workspace_id, ad_account_id: accountId, audience_id: res.id,
        name, audience_type: "lookalike", subtype: "LOOKALIKE",
        origin: "automation", source_rule_id: rule.id, source_campaign_id: campaignId,
        lookalike_spec: { origin_audience_id: originAudienceId, country, ratio, starting_ratio: startingRatio } as never,
      });
    } catch { /* noop */ }
    return `created_lookalike:${res.id}`;
  }

  // Duplica o(s) conjunto(s) da campanha e injeta um custom audience no targeting.
  if (action === "duplicate_adset_with_audience") {
    const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
    const audienceId = String(cfg.audienceId ?? "") || (await findLatestAudienceForRule(rule.id)) || "";
    if (!audienceId) throw new Error("Nenhum público informado para injetar.");
    const adsets = await metaGet<{ data: Array<{ id: string }> }>(`${campaignId}/adsets`, token, { fields: "id", limit: "50" });
    for (const s of adsets.data ?? []) {
      const dupe = await metaPostJson<{ copied_adset_id?: string; ad_object_ids?: Array<{ copied_id: string }> }>(
        `${s.id}/copies`, token, { deep_copy: "true", status_option: "PAUSED" },
      );
      const newId = dupe.copied_adset_id ?? dupe.ad_object_ids?.[0]?.copied_id;
      if (!newId) continue;
      const info = await metaGet<{ targeting?: Record<string, unknown> }>(newId, token, { fields: "targeting" });
      const targeting = (info.targeting ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(targeting.custom_audiences) ? targeting.custom_audiences as Array<{ id: string }> : [];
      targeting.custom_audiences = [...existing.filter((a) => a.id !== audienceId), { id: audienceId }];
      await metaPost(newId, token, { targeting: JSON.stringify(targeting) });
    }
    return `duplicated_adset_with_audience:${audienceId}`;
  }

  return "unsupported";
}

// Helpers extras usados apenas pelas ações de audiência.
async function metaPostJson<T>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const fd = new URLSearchParams({ ...body, access_token: token });
  const r = await fetch(url.toString(), { method: "POST", body: fd });
  const text = await r.text();
  if (!r.ok) throw new Error(`Meta POST ${path} ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

async function findLatestAudienceForRule(ruleId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("meta_custom_audiences")
      .select("audience_id").eq("source_rule_id", ruleId).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return (data as { audience_id?: string } | null)?.audience_id ?? null;
  } catch { return null; }
}


/** status_option da cópia (PAUSED por padrão). */
function dupStatusOption(p: Record<string, unknown>): string {
  return String(p.copyStatus ?? "PAUSED").toUpperCase() === "ACTIVE" ? "ACTIVE" : "PAUSED";
}

/** Ajustes na cópia recém-criada: renomear com sufixo e ajustar orçamento. */
async function applyDuplicateTweaks(
  newId: string,
  sourceId: string,
  p: Record<string, unknown>,
  token: string,
  isAd = false,
): Promise<void> {
  const suffix = String(p.nameSuffix ?? "").trim();
  if (suffix) {
    try {
      const info = await metaGet<{ name?: string }>(sourceId, token, { fields: "name" });
      const base = info.name ?? "";
      if (base) await metaPost(newId, token, { name: `${base} ${suffix}`.slice(0, 380) });
    } catch (e) { console.warn("[automation] rename copy:", (e as Error).message); }
  }
  const budgetChange = Number(p.budgetChange ?? 0);
  if (!isAd && budgetChange !== 0) {
    const kind = budgetChange > 0 ? "increase" : "decrease";
    try {
      await changeBudget(newId, kind, {
        type: "adjust", value: Math.abs(budgetChange),
        valueMode: (p.budgetMode === "absolute" ? "absolute" : "percent"),
      }, token);
    } catch (e) { console.warn("[automation] budget on copy:", (e as Error).message); }
  }
}

/** Notificação in-app para todos os membros do workspace. */
async function notifyWorkspace(rule: AutomationRule, message: string, campaignId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members } = await supabaseAdmin.from("workspace_members")
      .select("user_id").eq("workspace_id", rule.workspace_id);
    const rows = ((members ?? []) as Array<{ user_id: string }>).map((m) => ({
      workspace_id: rule.workspace_id,
      user_id: m.user_id,
      type: "automation",
      title: `Automação: ${rule.name}`,
      body: `${message}${campaignId ? ` (campanha ${campaignId})` : ""}`,
    }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
  } catch (e) {
    console.warn("[automation] notify:", (e as Error).message);
  }
}

/** Cria tarefa no fluxo de trabalho ou no calendário a partir da ação da regra. */
async function createAutomationTask(
  rule: AutomationRule,
  spec: ActionSpec,
  campaignId: string,
  token: string,
): Promise<string> {
  const p = spec.params ?? {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let campaignName = campaignId;
  try {
    const info = await metaGet<{ name?: string }>(campaignId, token, { fields: "name" });
    if (info.name) campaignName = info.name;
  } catch { /* noop */ }
  const title = (String(p.title ?? "").trim() || `Revisar ${campaignName}`)
    .replace("{{campaign_name}}", campaignName)
    .replace("{{rule_name}}", rule.name)
    .slice(0, 160);
  const description = `Gerado pela automação "${rule.name}". Campanha: ${campaignName}.`;

  if (spec.type === "create_workflow_task") {
    let pipelineId = String(p.pipelineId ?? "") || null;
    if (!pipelineId) {
      const { data } = await supabaseAdmin.from("workflow_pipelines")
        .select("id").eq("workspace_id", rule.workspace_id)
        .order("is_default", { ascending: false }).order("position").limit(1).maybeSingle();
      pipelineId = (data as { id?: string } | null)?.id ?? null;
    }
    if (!pipelineId) throw new Error("Nenhum pipeline de trabalho configurado.");
    const { data: stage } = await supabaseAdmin.from("workflow_stages")
      .select("id").eq("workspace_id", rule.workspace_id).eq("pipeline_id", pipelineId)
      .order("position").limit(1).maybeSingle();
    const stageId = (stage as { id?: string } | null)?.id ?? null;
    if (!stageId) throw new Error("O pipeline não tem etapas configuradas.");
    const dueDays = Number(p.dueInDays ?? 1);
    const { data: owner } = await supabaseAdmin.from("workspace_members")
      .select("user_id").eq("workspace_id", rule.workspace_id)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const createdBy = (owner as { user_id?: string } | null)?.user_id;
    if (!createdBy) throw new Error("Workspace sem membros para atribuir a tarefa.");
    const { data: created, error } = await supabaseAdmin.from("workflow_tasks").insert({
      workspace_id: rule.workspace_id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      created_by: createdBy,
      title,
      description,
      priority: String(p.priority ?? "media"),
      status: "todo",
      due_at: new Date(Date.now() + Math.max(0, dueDays) * 86400_000).toISOString(),
      tags: ["automacao", "meta"],
    }).select("id").single();
    if (error) throw new Error(error.message);
    return `workflow_task:${(created as { id: string }).id}`;
  }

  const inDays = Number(p.dueInDays ?? 1);
  const start = new Date(Date.now() + Math.max(0, inDays) * 86400_000);
  const durationMin = Number(p.durationMin ?? 30);
  const { data: created, error } = await supabaseAdmin.from("tasks").insert({
    workspace_id: rule.workspace_id,
    title,
    description,
    kind: (["tarefa", "reuniao", "evento"].includes(String(p.kind)) ? String(p.kind) : "tarefa") as "tarefa" | "reuniao" | "evento",
    status: "pendente",
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + Math.max(5, durationMin) * 60_000).toISOString(),
    external_source: "meta_automation",
    external_id: rule.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return `calendar_task:${(created as { id: string }).id}`;
}

/** Avalia UMA regra e executa a ação se bater. */
export async function evaluateRule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  rule: AutomationRule,
): Promise<RunResult[]> {
  // Intervalo de leitura (scan_interval). Se ainda não passou desde a última execução, pula.
  const scan = rule.scan_interval_minutes ?? rule.cooldown_minutes ?? 30;
  if (rule.last_run_at) {
    const next = new Date(rule.last_run_at).getTime() + scan * 60_000;
    if (Date.now() < next) {
      return [{ matched: false, metric_value: null, action_taken: null, status: "skipped", error: "scan_interval" }];
    }
  }

  const token = await loadWorkspaceToken(supabaseAdmin, rule.workspace_id);
  const results: RunResult[] = [];

  // Descobre os objetos observados (campanha, conjunto ou anúncio)
  let targets: AutomationTarget[] = [];

  if (rule.scope_type === "ad" && rule.scope_id) {
    targets = [{ level: "ad", id: rule.scope_id }];
  } else if (rule.scope_type === "adset" && rule.scope_id) {
    targets = [{ level: "adset", id: rule.scope_id }];
  } else if (rule.scope_type === "campaign" && rule.scope_id) {
    targets = [{ level: "campaign", id: rule.scope_id }];
  } else {
    const q = supabaseAdmin.from("meta_ad_accounts").select("account_id").eq("workspace_id", rule.workspace_id);
    if (rule.scope_type === "ad_account" && rule.scope_id) q.eq("account_id", rule.scope_id);
    const { data: accts } = await q;
    for (const a of (accts ?? []) as Array<{ account_id: string }>) {
      try {
        const j = await metaGet<{ data: Array<{ id: string; effective_status: string }> }>(`${a.account_id}/campaigns`, token, {
          fields: "id,effective_status", limit: "100",
        });
        for (const c of j.data ?? []) {
          if (c.effective_status === "ACTIVE") targets.push({ level: "campaign", id: c.id });
        }
      } catch (e) {
        console.warn(`[automation] list campaigns ${a.account_id}: ${(e as Error).message}`);
      }
    }
  }

  const actions = ruleActions(rule);
  const trigger = ruleConditions(rule);

  for (const t of targets) {
    try {
      const j = await metaGet<{ data: Insight[] }>(`${t.id}/insights`, token, {
        date_preset: rule.trigger_window,
        fields: INSIGHTS_FIELDS,
      });
      const row = j.data?.[0];
      if (!row) {
        results.push({ matched: false, metric_value: null, action_taken: null, status: "skipped", campaign_id: t.id, error: "no_insights" });
        continue;
      }
      const value = computeMetric(trigger.conditions[0]?.metric ?? rule.trigger_metric, row);
      const matched = evaluateConditions(trigger.conditions, trigger.logic, row);
      if (!matched) {
        results.push({ matched: false, metric_value: value, action_taken: null, status: "ok", campaign_id: t.id });
        continue;
      }

      const ids = await resolveTarget(t, token);
      const taken: string[] = [];
      let failure: string | null = null;
      for (const spec of actions) {
        const guard = spec.conditions ?? [];
        if (guard.length > 0 && !evaluateConditions(guard, spec.conditionLogic ?? "and", row)) {
          taken.push(`${spec.type} (ignorada: condição "se" não atendida)`);
          continue;
        }
        try {
          taken.push(await applyAction(rule, spec, t, ids, token));
        } catch (e) {
          failure = `${spec.type}: ${(e as Error).message}`;
          break; // encadeamento para na primeira falha para não deixar estado torto
        }
      }
      results.push({
        matched: true,
        metric_value: value,
        action_taken: taken.join(" + ") || null,
        status: failure ? "error" : "ok",
        campaign_id: ids.campaignId || t.id,
        error: failure ?? undefined,
      });
    } catch (e) {
      results.push({
        matched: false, metric_value: null, action_taken: null, status: "error",
        campaign_id: t.id, error: (e as Error).message,
      });
    }
  }


  return results;
}
