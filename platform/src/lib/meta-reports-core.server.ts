// Renderiza e envia relatórios agendados de tráfego Meta.
// Server-only. Isolamento por workspace_id em cada chamada.

import { META_KPI_CATALOG } from "@/lib/meta-dashboard-kpis";
import { presetToMetaParams } from "@/lib/meta-report-presets";

const GRAPH = "v23.0";
const GATEWAY_URL = "https://api.resend.com";

type ReportRow = {
  id: string;
  workspace_id: string;
  name: string;
  preset: string;
  channels: string[];
  recipients_email: string[];
  recipients_whatsapp: string[];
  include_ai_suggestions: boolean;
  title_template?: string | null;
  intro_text?: string | null;
  footer_text?: string | null;
  selected_kpis?: string[] | null;
};

type MetaAction = { action_type: string; value: string };
type Insight = {
  spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; cpm?: string; reach?: string; frequency?: string;
  unique_clicks?: string; unique_ctr?: string; inline_link_clicks?: string; unique_inline_link_clicks?: string; inline_link_click_ctr?: string;
  outbound_clicks?: MetaAction[]; unique_outbound_clicks?: MetaAction[]; unique_outbound_clicks_ctr?: MetaAction[];
  social_spend?: string; full_view_impressions?: string; full_view_reach?: string;
  estimated_ad_recallers?: string; estimated_ad_recall_rate?: string;
  actions?: MetaAction[]; action_values?: MetaAction[]; purchase_roas?: Array<{ value: string }>; website_purchase_roas?: Array<{ value: string }>;
  video_play_actions?: MetaAction[]; video_p25_watched_actions?: MetaAction[]; video_p50_watched_actions?: MetaAction[]; video_p75_watched_actions?: MetaAction[]; video_p95_watched_actions?: MetaAction[]; video_p100_watched_actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[]; video_15_sec_watched_actions?: MetaAction[]; video_30_sec_watched_actions?: MetaAction[]; video_avg_time_watched_actions?: MetaAction[];
};

function sumAction(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  let n = 0;
  for (const a of actions) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

function sumAll(actions: MetaAction[] | undefined): number {
  return (actions ?? []).reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function cost(spend: number, count: number): number {
  return count > 0 ? spend / count : 0;
}

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
  messagingConversationsStarted: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_conversation_started"],
  newMessagingContacts: ["onsite_conversion.messaging_first_reply", "onsite_conversion.new_messaging_connection"],
  instagramProfileVisits: ["onsite_conversion.ig_profile_visit", "instagram_profile_visit"],
  instagramFollows: ["onsite_conversion.ig_follow", "instagram_follow"],
} as const;

const INSIGHT_FIELDS = [
  "spend","impressions","clicks","ctr","cpc","cpm","reach","frequency",
  "unique_clicks","unique_ctr","inline_link_clicks","unique_inline_link_clicks","inline_link_click_ctr",
  "outbound_clicks","unique_outbound_clicks","unique_outbound_clicks_ctr",
  "social_spend","full_view_impressions","full_view_reach","estimated_ad_recallers","estimated_ad_recall_rate",
  "actions","action_values","purchase_roas","website_purchase_roas",
  "video_play_actions","video_p25_watched_actions","video_p50_watched_actions","video_p75_watched_actions","video_p95_watched_actions","video_p100_watched_actions",
  "video_thruplay_watched_actions","video_15_sec_watched_actions","video_30_sec_watched_actions","video_avg_time_watched_actions",
].join(",");

function addTotals(total: Record<string, number>, row: Insight): Record<string, number> {
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
  const postEngagement = sumAction(row.actions, [...ACTION_TYPES.postEngagement]);
  const pageEngagement = sumAction(row.actions, [...ACTION_TYPES.pageEngagement]);
  const pageLike = sumAction(row.actions, [...ACTION_TYPES.pageLike]);
  const videoPlays = sumAll(row.video_play_actions);
  const videoViews = sumAction(row.actions, ["video_view"]);
  const videoThruplay = sumAll(row.video_thruplay_watched_actions);
  const videoP25 = sumAll(row.video_p25_watched_actions), videoP50 = sumAll(row.video_p50_watched_actions), videoP75 = sumAll(row.video_p75_watched_actions), videoP95 = sumAll(row.video_p95_watched_actions), videoP100 = sumAll(row.video_p100_watched_actions);
  const newMessagingContacts = sumAction(row.actions, [...ACTION_TYPES.newMessagingContacts]);
  const messagingConversationsStarted = sumAction(row.actions, [...ACTION_TYPES.messagingConversationsStarted]);
  const results = leads || purchases || messagingConversationsStarted || newMessagingContacts || linkClicks || postEngagement;
  const purchaseValueActual = sumAction(row.action_values, [...ACTION_TYPES.purchases]);
  const totalActionValue = sumAll(row.action_values);
  const values: Record<string, number> = {
    spend, impressions, clicks, reach, leads, purchases, websitePurchases, results,
    resultValue: purchaseValueActual || totalActionValue, linkClicks, uniqueLinkClicks, uniqueClicks, outboundClicks, uniqueOutboundClicks, landingPageViews,
    addToCart: sumAction(row.actions, [...ACTION_TYPES.addToCart]), wishlistAdds: sumAction(row.actions, [...ACTION_TYPES.wishlistAdds]), initiateCheckout: sumAction(row.actions, [...ACTION_TYPES.initiateCheckout]), addPaymentInfo: sumAction(row.actions, [...ACTION_TYPES.addPaymentInfo]), viewContent: sumAction(row.actions, [...ACTION_TYPES.viewContent]), completeRegistration: sumAction(row.actions, [...ACTION_TYPES.completeRegistration]), subscribe: sumAction(row.actions, [...ACTION_TYPES.subscribe]), contact: sumAction(row.actions, [...ACTION_TYPES.contact]), donate: sumAction(row.actions, [...ACTION_TYPES.donate]), appInstalls: sumAction(row.actions, [...ACTION_TYPES.appInstalls]), submitApplication: sumAction(row.actions, [...ACTION_TYPES.submitApplication]), startTrial: sumAction(row.actions, [...ACTION_TYPES.startTrial]), search: sumAction(row.actions, [...ACTION_TYPES.search]), findLocation: sumAction(row.actions, [...ACTION_TYPES.findLocation]), customEvents: sumAction(row.actions, [...ACTION_TYPES.customEvents]),
    postEngagement, pageEngagement, postReaction: sumAction(row.actions, [...ACTION_TYPES.postReaction]), postComment: sumAction(row.actions, [...ACTION_TYPES.postComment]), postShare: sumAction(row.actions, [...ACTION_TYPES.postShare]), postSave: sumAction(row.actions, [...ACTION_TYPES.postSave]), pageLike, linkClickActions: sumAction(row.actions, [...ACTION_TYPES.linkClick]), photoView: sumAction(row.actions, [...ACTION_TYPES.photoView]), instagramProfileVisits: sumAction(row.actions, [...ACTION_TYPES.instagramProfileVisits]), instagramFollows: sumAction(row.actions, [...ACTION_TYPES.instagramFollows]),
    newMessagingContacts, messagingConversationsStarted, videoPlays, videoViews, videoContinuousPlays: videoViews, uniqueVideoContinuousPlays: videoP100, video15s: sumAll(row.video_15_sec_watched_actions), video30s: sumAll(row.video_30_sec_watched_actions), videoThruplay, videoP25, videoP50, videoP75, videoP95, videoP100, videoAvgWatchTime: sumAll(row.video_avg_time_watched_actions), views: impressions,
    socialSpend: Number(row.social_spend) || 0, fullViewImpressions: Number(row.full_view_impressions) || 0, fullViewReach: Number(row.full_view_reach) || 0, estimatedAdRecallers: Number(row.estimated_ad_recallers) || 0,
    purchaseValueActual, websitePurchaseValue: sumAction(row.action_values, [...ACTION_TYPES.websitePurchases]), totalActionValue,
  };
  for (const [k, v] of Object.entries(values)) total[k] = (total[k] ?? 0) + v;
  total._frequencyWeight = (total._frequencyWeight ?? 0) + impressions;
  total._frequencyWeighted = (total._frequencyWeighted ?? 0) + (Number(row.frequency) || 0) * impressions;
  total._roasSpend = (total._roasSpend ?? 0) + spend;
  total._roasWeighted = (total._roasWeighted ?? 0) + (Number(row.purchase_roas?.[0]?.value) || 0) * spend;
  return total;
}

function finalizeTotals(t: Record<string, number>): Record<string, number> {
  const spend = t.spend ?? 0, impressions = t.impressions ?? 0, clicks = t.clicks ?? 0, reach = t.reach ?? 0;
  const resultValue = t.resultValue ?? 0;
  Object.assign(t, {
    costPerResult: cost(spend, t.results ?? 0), resultRate: impressions > 0 ? ((t.results ?? 0) / impressions) * 100 : 0, resultRoas: spend > 0 ? resultValue / spend : 0,
    frequency: (t._frequencyWeight ?? 0) > 0 ? (t._frequencyWeighted ?? 0) / t._frequencyWeight : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, cpc: cost(spend, clicks), cpm: impressions > 0 ? (spend / impressions) * 1000 : 0, cppMetaAccountsReached: reach > 0 ? (spend / reach) * 1000 : 0,
    uniqueCtr: reach > 0 ? ((t.uniqueClicks ?? 0) / reach) * 100 : 0, inlineLinkClickCtr: impressions > 0 ? ((t.linkClicks ?? 0) / impressions) * 100 : 0, uniqueInlineLinkClickCtr: reach > 0 ? ((t.uniqueLinkClicks ?? 0) / reach) * 100 : 0, outboundCtr: impressions > 0 ? ((t.outboundClicks ?? 0) / impressions) * 100 : 0, uniqueOutboundCtr: reach > 0 ? ((t.uniqueOutboundClicks ?? 0) / reach) * 100 : 0,
    cpl: cost(spend, t.leads ?? 0), cpp: cost(spend, t.purchases ?? 0), costPerWebsitePurchase: cost(spend, t.websitePurchases ?? 0), costPerAtc: cost(spend, t.addToCart ?? 0), costPerWishlistAdd: cost(spend, t.wishlistAdds ?? 0), costPerIc: cost(spend, t.initiateCheckout ?? 0), costPerAddPaymentInfo: cost(spend, t.addPaymentInfo ?? 0), costPerViewContent: cost(spend, t.viewContent ?? 0), costPerCompleteRegistration: cost(spend, t.completeRegistration ?? 0), costPerSubscribe: cost(spend, t.subscribe ?? 0), costPerContact: cost(spend, t.contact ?? 0), costPerDonate: cost(spend, t.donate ?? 0), costPerAppInstall: cost(spend, t.appInstalls ?? 0), costPerSubmitApplication: cost(spend, t.submitApplication ?? 0), costPerStartTrial: cost(spend, t.startTrial ?? 0), costPerSearch: cost(spend, t.search ?? 0), costPerFindLocation: cost(spend, t.findLocation ?? 0), costPerCustomEvent: cost(spend, t.customEvents ?? 0), costPerLpv: cost(spend, t.landingPageViews ?? 0), costPerLinkClick: cost(spend, t.linkClicks ?? 0), costPerUniqueLinkClick: cost(spend, t.uniqueLinkClicks ?? 0), costPerOutboundClick: cost(spend, t.outboundClicks ?? 0), costPerUniqueOutboundClick: cost(spend, t.uniqueOutboundClicks ?? 0), costPerUniqueClick: cost(spend, t.uniqueClicks ?? 0), costPerPostEngagement: cost(spend, t.postEngagement ?? 0), costPerPageEngagement: cost(spend, t.pageEngagement ?? 0), costPerPageLike: cost(spend, t.pageLike ?? 0), costPerThruplay: cost(spend, t.videoThruplay ?? 0), costPerVideoPlay: cost(spend, t.videoPlays ?? 0), costPerVideoView: cost(spend, t.videoViews ?? 0), costPerVideoContinuousPlay: cost(spend, t.videoContinuousPlays ?? 0),
    roas: (t._roasSpend ?? 0) > 0 ? (t._roasWeighted ?? 0) / t._roasSpend : 0, roasActual: spend > 0 ? (t.purchaseValueActual ?? 0) / spend : 0,
    videoRetentionP25: (t.videoPlays ?? 0) > 0 ? ((t.videoP25 ?? 0) / t.videoPlays) * 100 : 0, videoRetentionP50: (t.videoPlays ?? 0) > 0 ? ((t.videoP50 ?? 0) / t.videoPlays) * 100 : 0, videoRetentionP75: (t.videoPlays ?? 0) > 0 ? ((t.videoP75 ?? 0) / t.videoPlays) * 100 : 0, videoRetentionP95: (t.videoPlays ?? 0) > 0 ? ((t.videoP95 ?? 0) / t.videoPlays) * 100 : 0, videoHoldRate: (t.videoPlays ?? 0) > 0 ? ((t.videoP100 ?? 0) / t.videoPlays) * 100 : 0,
  });
  delete t._frequencyWeight; delete t._frequencyWeighted; delete t._roasSpend; delete t._roasWeighted;
  return t;
}

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

async function loadToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string,
): Promise<string | null> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return null;
  const { data, error } = await supabase.rpc("get_integration_secret_service", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  if (error) return null;
  return (data as { access_token?: string } | null)?.access_token ?? null;
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtMetric(unit: string, value: number): string {
  if (!Number.isFinite(value) || value === 0) return unit === "currency" ? fmtBRL(0) : "0";
  if (unit === "currency") return fmtBRL(value);
  if (unit === "percent") return `${value.toFixed(2)}%`;
  if (unit === "roas") return `${value.toFixed(2)}x`;
  if (unit === "duration_sec") return `${Math.round(value)}s`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

export async function renderReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, row: ReportRow,
): Promise<{ subject: string; html: string; text: string; totals: Record<string, number> }> {
  const token = await loadToken(supabase, row.workspace_id);
  const { data: accts } = await supabase.from("meta_ad_accounts")
    .select("account_id, name, currency").eq("workspace_id", row.workspace_id);
  const accounts = (accts ?? []) as Array<{ account_id: string; name: string | null; currency: string | null }>;

  const aggregate: Record<string, number> = {};
  const perAccount: Array<{ name: string; spend: number; leads: number; results: number; roas: number; ctr: number }> = [];

  if (token && accounts.length) {
    await Promise.all(accounts.map(async (a) => {
      try {
        const j = await metaGet<{ data: Insight[] }>(`${a.account_id}/insights`, token, {
          ...presetToMetaParams(row.preset), level: "account",
          fields: INSIGHT_FIELDS,
        });
        const r = j.data?.[0]; if (!r) return;
        addTotals(aggregate, r);
        const accountTotals = finalizeTotals(addTotals({}, r));
        perAccount.push({
          name: a.name || a.account_id,
          spend: accountTotals.spend ?? 0,
          leads: accountTotals.leads ?? 0,
          results: accountTotals.results ?? 0,
          roas: accountTotals.roasActual || accountTotals.roas || 0,
          ctr: accountTotals.ctr ?? 0,
        });
      } catch { /* ignore per-account errors */ }
    }));
  }

  const totals = finalizeTotals(aggregate);
  const spend = totals.spend ?? 0;
  const leads = totals.leads ?? 0;
  const cpl = totals.cpl ?? 0;
  const purchases = totals.purchases ?? 0;
  const roas = totals.roasActual || totals.roas || 0;
  const ctr = totals.ctr ?? 0;

  // KPIs escolhidos manualmente pelo usuário (ordenados) OU default por prioridade.
  const kpiByKey = new Map(META_KPI_CATALOG.map((k) => [k.key, k]));
  const selected = (row.selected_kpis ?? []).filter((k) => kpiByKey.has(k));
  const priorityKeys = new Set(["spend", "results", "cost_per_result", "leads", "cpl", "purchases", "cpp", "roas", "impressions", "reach", "frequency", "cpm", "clicks", "ctr", "cpc", "link_clicks", "landing_page_views", "video_thruplay", "cost_per_thruplay", "messaging_conversations_started", "new_messaging_contacts"]);
  const metricRows = selected.length > 0
    ? selected.map((k) => kpiByKey.get(k)!).filter((k) => k.totalsField)
    : META_KPI_CATALOG
        .filter((k) => k.totalsField && (priorityKeys.has(k.key) || (totals[k.totalsField] ?? 0) > 0))
        .slice(0, 40);

  // Placeholders suportados em título/intro/rodapé.
  const interpolate = (tpl: string): string => tpl
    .replace(/\{nome\}/gi, row.name)
    .replace(/\{investido\}/gi, fmtBRL(spend))
    .replace(/\{leads\}/gi, String(leads))
    .replace(/\{cpl\}/gi, leads > 0 ? fmtBRL(cpl) : "N/D")
    .replace(/\{compras\}/gi, String(purchases))
    .replace(/\{roas\}/gi, roas > 0 ? roas.toFixed(2) + "x" : "N/D")
    .replace(/\{ctr\}/gi, `${ctr.toFixed(2)}%`);

  const titleTpl = (row.title_template && row.title_template.trim())
    || `📊 {nome} · {investido} investido · {leads} leads`;
  const subject = interpolate(titleTpl);
  const introText = row.intro_text ? interpolate(row.intro_text).trim() : "";
  const footerText = row.footer_text ? interpolate(row.footer_text).trim() : "";

  const rowsHtml = perAccount.sort((a, b) => b.spend - a.spend).map((a) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${a.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmtBRL(a.spend)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${a.leads}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${a.roas > 0 ? a.roas.toFixed(2) + "x" : "N/D"}</td>
    </tr>`).join("");

  const kpisHtml = metricRows.map((k) => {
    const value = totals[k.totalsField!] ?? 0;
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${k.label}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmtMetric(k.unit, value)}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f7f7fa;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #eee">
    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.1em">MKTOn · Relatório de Tráfego</div>
    <h1 style="margin:8px 0 12px;font-size:22px">${subject}</h1>
    ${introText ? `<p style="font-size:13px;color:#333;white-space:pre-wrap;margin:0 0 16px">${introText}</p>` : ""}
    <h2 style="font-size:14px;margin:20px 0 8px">KPIs do Meta Ads</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
      <tbody>${kpisHtml}</tbody>
    </table>
    ${perAccount.length ? `
    <h2 style="font-size:14px;margin:20px 0 8px">Por conta de anúncios</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#fafafa">
        <th style="text-align:left;padding:8px">Conta</th>
        <th style="text-align:right;padding:8px">Investido</th>
        <th style="text-align:right;padding:8px">Leads</th>
        <th style="text-align:right;padding:8px">ROAS</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>` : ""}
    ${footerText ? `<p style="font-size:12px;color:#555;white-space:pre-wrap;margin:20px 0 0">${footerText}</p>` : ""}
    <p style="color:#888;font-size:11px;margin-top:24px">Enviado automaticamente pelo MKTOn - Gestor de Tráfego IA.</p>
  </div></body></html>`;

  // Texto plano para WhatsApp (WhatsApp não aceita HTML).
  const textMetrics = metricRows.map((k) => `• ${k.label}: ${fmtMetric(k.unit, totals[k.totalsField!] ?? 0)}`).join("\n");
  const parts: string[] = [`*${subject}*`];
  if (introText) parts.push(introText);
  parts.push(`📊 *KPIs do Meta Ads*\n${textMetrics}`);
  if (perAccount.length) {
    const accLines = perAccount.sort((a, b) => b.spend - a.spend)
      .map((a) => `• ${a.name}: ${fmtBRL(a.spend)} · ${a.leads} leads · ${a.roas > 0 ? a.roas.toFixed(2) + "x" : "N/D"}`).join("\n");
    parts.push(`🏦 *Por conta*\n${accLines}`);
  }
  if (footerText) parts.push(footerText);
  const text = parts.join("\n\n");

  return { subject, html, text, totals };
}

async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  const rk = process.env.RESEND_API_KEY;
  if (!rk) throw new Error("Resend não configurado neste sistema.");
  const r = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${rk}`,
    },
    body: JSON.stringify({
      from: "MKTOn Relatórios <onboarding@resend.dev>",
      to, subject, html,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function sendWhatsApp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string, numbers: string[], text: string,
): Promise<void> {
  if (!numbers.length) return;
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  const { data: sess } = await supabase
    .from("whatsapp_web_sessions")
    .select("id, provider, status")
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado")
    .order("last_connected_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!sess) throw new Error("Nenhuma sessão Evolution conectada para enviar o relatório.");

  if (sess.provider === "evolution") {
    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    const { data: cred, error: credError } = await supabase.rpc("get_evolution_credentials_service", { _session_id: sess.id, _key: encKey });
    if (credError) throw new Error(`Credenciais Evolution: ${credError.message}`);
    const instance = (cred as { instance_name?: string; api_key?: string } | null)?.instance_name;
    const apiKey = (cred as { api_key?: string } | null)?.api_key;
    if (!base || !instance || !apiKey) throw new Error("Credenciais Evolution incompletas.");
    const errors: string[] = [];
    for (const n of numbers) {
      const dest = n.replace(/\D/g, "");
      try {
        const r = await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({ number: dest, text }),
        });
        if (!r.ok) {
          const bodyText = (await r.text()).slice(0, 300);
          errors.push(`${dest}: HTTP ${r.status} ${bodyText}`);
          console.error(`[reports] Evolution sendText falhou p/ ${dest}: ${r.status} ${bodyText}`);
        }
      } catch (e) {
        errors.push(`${dest}: ${(e as Error).message}`);
        console.error(`[reports] Evolution sendText exceção p/ ${dest}: ${(e as Error).message}`);
      }
    }
    if (errors.length === numbers.length) {
      throw new Error(`Evolution recusou o envio: ${errors.join(" | ")}`);
    }
    if (errors.length > 0) {
      throw new Error(`Envio parcial. Falhas: ${errors.join(" | ")}`);
    }
  } else {
    throw new Error(`Provider WhatsApp "${sess.provider}" ainda sem envio de relatório.`);
  }
}

export async function executeReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, row: ReportRow,
): Promise<{ email: boolean; whatsapp: boolean; error?: string; totals?: Record<string, number> }> {
  const { subject, html, text, totals } = await renderReport(supabase, row);
  const wantsEmail = row.channels.includes("email") && row.recipients_email.length > 0;
  const wantsWa = row.channels.includes("whatsapp") && row.recipients_whatsapp.length > 0;
  const errs: string[] = [];
  const okCh: string[] = [];
  let eok = false, wok = false;
  if (wantsEmail) {
    try { await sendEmail(row.recipients_email, subject, html); eok = true; okCh.push("email"); }
    catch (e) { errs.push(`email: ${(e as Error).message}`); }
  }
  if (wantsWa) {
    try { await sendWhatsApp(supabase, row.workspace_id, row.recipients_whatsapp, text); wok = true; okCh.push("whatsapp"); }
    catch (e) { errs.push(`whatsapp: ${(e as Error).message}`); }
  }
  const error = errs.length ? errs.join(" | ") : undefined;
  try {
    await supabase.from("scheduled_report_runs").insert({
      report_id: row.id === "adhoc" || row.id === "preview" ? null : row.id,
      workspace_id: row.workspace_id,
      status: error ? (okCh.length ? "partial" : "error") : "ok",
      channels_ok: okCh, error: error ?? null, totals,
      name: row.name, preset: row.preset,
      kind: row.id === "adhoc" ? "adhoc" : "scheduled",
      recipients_whatsapp: row.recipients_whatsapp ?? [],
    });
  } catch { /* histórico é best-effort */ }
  return { email: eok, whatsapp: wok, error, totals };
}

export function computeNextRunAt(
  frequency: "daily" | "weekly" | "biweekly" | "monthly",
  timezone: string,
  hourLocal: number,
  minuteLocal: number,
  weeklyDay: number,
): string {
  // Simplificado: assume offset fixo (BR São Paulo = -3). O cron horário reavalia frequentemente.
  const now = new Date();
  const tzOffsetHours = timezone === "America/Sao_Paulo" ? -3 : 0;
  const next = new Date(now);
  next.setUTCHours(hourLocal - tzOffsetHours, minuteLocal, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === "weekly") {
    while (next.getUTCDay() !== weeklyDay) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === "biweekly") {
    while (next.getUTCDay() !== weeklyDay) next.setUTCDate(next.getUTCDate() + 1);
    // Empurra 7 dias adicionais para virar quinzenal a partir do primeiro disparo
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    // Próximo mesmo dia do mês; se já passou este mês, vai para o próximo
    const target = new Date(next);
    if (target.getTime() <= now.getTime()) target.setUTCMonth(target.getUTCMonth() + 1);
    return target.toISOString();
  }
  return next.toISOString();
}
