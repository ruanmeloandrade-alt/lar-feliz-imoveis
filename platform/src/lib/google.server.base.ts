// Central Google: helpers server-only.
// Um único OAuth cobre Google Ads, Analytics (GA4), Tag Manager,
// Business Profile, Merchant Center e os produtos Workspace
// (Agenda, Drive, Sheets, Docs, Gmail).

export type SbRpc = {
  rpc: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
export type AnySb = SbRpc & { from: (t: string) => any };

export const GOOGLE_PROVIDER = "google";
export const GOOGLE_ADS_API = "https://googleads.googleapis.com/v25";

/** Produtos que o usuário pode ligar/desligar dentro da central. */
export const GOOGLE_PRODUCTS = [
  { id: "ads", label: "Google Ads" },
  { id: "analytics", label: "Google Analytics 4" },
  { id: "tagmanager", label: "Google Tag Manager" },
  { id: "business", label: "Google Business Profile" },
  { id: "merchant", label: "Google Merchant Center" },
  { id: "calendar", label: "Google Agenda" },
  { id: "drive", label: "Google Drive" },
  { id: "sheets", label: "Google Sheets" },
  { id: "docs", label: "Google Docs" },
  { id: "gmail", label: "Gmail (envio)" },
] as const;

export const GOOGLE_BASE_SCOPES = ["openid", "email", "profile"] as const;
export const GOOGLE_DEFAULT_PRODUCTS = [
  "ads",
  "analytics",
  "tagmanager",
  "business",
  "merchant",
  "gmail",
] as const;
export const GOOGLE_PRODUCT_SCOPES: Record<string, readonly string[]> = {
  ads: ["https://www.googleapis.com/auth/adwords"],
  analytics: ["https://www.googleapis.com/auth/analytics.readonly"],
  tagmanager: ["https://www.googleapis.com/auth/tagmanager.readonly"],
  business: ["https://www.googleapis.com/auth/business.manage"],
  merchant: ["https://www.googleapis.com/auth/content"],
  calendar: ["https://www.googleapis.com/auth/calendar"],
  drive: ["https://www.googleapis.com/auth/drive"],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  docs: ["https://www.googleapis.com/auth/documents"],
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
};

export function normalizeGoogleProducts(products?: readonly string[]): string[] {
  const valid = new Set(GOOGLE_PRODUCTS.map((p) => p.id));
  const clean = Array.from(
    new Set((products ?? []).filter((p) => valid.has(p as (typeof GOOGLE_PRODUCTS)[number]["id"]))),
  );
  return clean.length > 0 ? clean : [...GOOGLE_DEFAULT_PRODUCTS];
}

export function googleScopesForProducts(products?: readonly string[]): string[] {
  const selected = normalizeGoogleProducts(products);
  return Array.from(
    new Set([...GOOGLE_BASE_SCOPES, ...selected.flatMap((p) => GOOGLE_PRODUCT_SCOPES[p] ?? [])]),
  );
}

export const GOOGLE_SCOPES = googleScopesForProducts();

export function encKey() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return k;
}

export function googleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth não configurado no servidor. Cadastre GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

export function googleEnvReady(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

export interface GoogleSecret {
  refresh_token?: string;
  access_token?: string;
  expires_at?: string;
  scope?: string;
  email?: string;
  /** Google Ads */
  ads_developer_token?: string;
  ads_customer_id?: string;
  ads_login_customer_id?: string;
  /** GA4 */
  ga4_property_id?: string;
  /** GTM */
  gtm_account_id?: string;
  gtm_container_id?: string;
  /** Business Profile */
  gbp_account?: string;
  gbp_location?: string;
  /** Merchant Center */
  merchant_id?: string;
  /** Produtos ativos escolhidos pelo usuário */
  products?: string[];
}

export async function readGoogleSecret(sb: SbRpc, workspaceId: string): Promise<GoogleSecret> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: GOOGLE_PROVIDER,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais Google.");
  if (!data) throw new Error("Conta Google não conectada neste workspace.");
  return data as GoogleSecret;
}

export async function readGoogleSecretSafe(
  sb: SbRpc,
  workspaceId: string,
): Promise<GoogleSecret | null> {
  try {
    return await readGoogleSecret(sb, workspaceId);
  } catch {
    return null;
  }
}

export async function writeGoogleSecret(
  sb: SbRpc,
  args: {
    workspaceId: string;
    payload: GoogleSecret;
    metadata: Record<string, unknown>;
    status: string;
    service?: boolean;
  },
) {
  const fn = args.service ? "set_integration_secret_service" : "set_integration_secret";
  const { error } = await sb.rpc(fn, {
    _workspace_id: args.workspaceId,
    _provider: GOOGLE_PROVIDER,
    _plaintext: JSON.parse(JSON.stringify(args.payload)),
    _key: encKey(),
    _metadata: JSON.parse(JSON.stringify(args.metadata)),
    _status: args.status,
  });
  if (error) throw new Error(error.message ?? "Falha ao salvar credenciais Google.");
}

// ============================================================
// OAuth
// ============================================================

export function buildGoogleAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
  forceConsent?: boolean;
}) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", args.clientId);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", (args.scopes ?? GOOGLE_SCOPES).join(" "));
  u.searchParams.set("access_type", "offline");
  if (args.forceConsent) u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", args.state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

export async function exchangeGoogleCode(args: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleEnv();
  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Troca de código falhou (${r.status}): ${txt.slice(0, 300)}`);
  return JSON.parse(txt) as TokenResponse;
}

export async function refreshGoogleToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const txt = await r.text();
  if (!r.ok)
    throw new Error(`Renovação do token Google falhou (${r.status}): ${txt.slice(0, 300)}`);
  return JSON.parse(txt) as TokenResponse;
}

/** Retorna um access token válido, renovando e persistindo quando necessário. */
export async function getGoogleAccessToken(
  sb: SbRpc,
  workspaceId: string,
  secretIn?: GoogleSecret,
): Promise<{ token: string; secret: GoogleSecret }> {
  const secret = secretIn ?? (await readGoogleSecret(sb, workspaceId));
  const stillValid =
    secret.access_token &&
    secret.expires_at &&
    new Date(secret.expires_at).getTime() - Date.now() > 60_000;
  if (stillValid) return { token: secret.access_token as string, secret };

  if (!secret.refresh_token) {
    throw new Error("Conta Google sem refresh token. Reconecte a Conta Google.");
  }
  const tok = await refreshGoogleToken(secret.refresh_token);
  const next: GoogleSecret = {
    ...secret,
    access_token: tok.access_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    scope: tok.scope ?? secret.scope,
  };
  await writeGoogleSecret(sb, {
    workspaceId,
    payload: next,
    metadata: { email: next.email ?? null, refreshed_at: new Date().toISOString() },
    status: "connected",
  });
  return { token: tok.access_token, secret: next };
}

export async function googleUserInfo(
  token: string,
): Promise<{ email?: string; name?: string; picture?: string }> {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return {};
  return (await r.json()) as { email?: string; name?: string; picture?: string };
}

export async function revokeGoogleToken(token: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    /* melhor esforço */
  }
}

// ============================================================
// Chamada genérica
// ============================================================

async function gfetch<T>(
  url: string,
  token: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string>; label?: string },
): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) {
    throw new Error(`${init?.label ?? "Google"} ${r.status}: ${txt.slice(0, 400)}`);
  }
  return (txt ? JSON.parse(txt) : {}) as T;
}

// ============================================================
// Google Ads (Marketing API v25, GAQL)
// ============================================================

export function cleanCustomerId(id?: string | null): string {
  return (id ?? "").replace(/\D/g, "");
}

export function adsDeveloperToken(_secret: GoogleSecret): string {
  const t = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!t) {
    throw new Error(
      "Google Ads ainda não foi habilitado pelo administrador da Vanessa Simoni: configure GOOGLE_ADS_DEVELOPER_TOKEN no servidor. O cliente final não deve informar Developer Token.",
    );
  }
  return t;
}

export async function adsListAccessibleCustomers(
  token: string,
  developerToken: string,
): Promise<string[]> {
  const r = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${token}`, "developer-token": developerToken },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google Ads ${r.status}: ${txt.slice(0, 400)}`);
  const j = JSON.parse(txt) as { resourceNames?: string[] };
  return (j.resourceNames ?? []).map((n) => n.split("/")[1]).filter(Boolean);
}

export async function adsSearch<T = Record<string, unknown>>(args: {
  token: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
  query: string;
}): Promise<T[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
    "developer-token": args.developerToken,
    "Content-Type": "application/json",
  };
  const login = cleanCustomerId(args.loginCustomerId);
  if (login) headers["login-customer-id"] = login;

  const r = await fetch(
    `${GOOGLE_ADS_API}/customers/${cleanCustomerId(args.customerId)}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query: args.query, pageSize: 500 }),
    },
  );
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google Ads ${r.status}: ${txt.slice(0, 500)}`);
  const j = JSON.parse(txt) as { results?: T[] };
  return j.results ?? [];
}

export function adsCampaignQuery(days: number) {
  const d = Math.max(1, Math.min(365, days));
  return `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,
           metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING LAST_${d === 7 ? "7" : d === 14 ? "14" : "30"}_DAYS
    ORDER BY metrics.cost_micros DESC
  `.trim();
}

export const ADS_ACCOUNT_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1";

// ============================================================
// Google Analytics 4
// ============================================================

export interface Ga4PropertySummary {
  property: string;
  displayName: string;
  account: string;
  accountName?: string;
}

export async function ga4ListProperties(token: string): Promise<Ga4PropertySummary[]> {
  const j = await gfetch<{
    accountSummaries?: Array<{
      account?: string;
      displayName?: string;
      propertySummaries?: Array<{ property?: string; displayName?: string }>;
    }>;
  }>("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", token, {
    label: "GA4 Admin",
  });

  const out: Ga4PropertySummary[] = [];
  for (const a of j.accountSummaries ?? []) {
    for (const p of a.propertySummaries ?? []) {
      if (!p.property) continue;
      out.push({
        property: p.property.replace("properties/", ""),
        displayName: p.displayName ?? p.property,
        account: a.account ?? "",
        accountName: a.displayName,
      });
    }
  }
  return out;
}

export interface Ga4Row {
  dimension: string;
  sessions: number;
  users: number;
  views: number;
  conversions: number;
}

export async function ga4RunReport(args: {
  token: string;
  propertyId: string;
  days: number;
  dimension?: string;
}) {
  const body = {
    dateRanges: [{ startDate: `${Math.max(1, args.days)}daysAgo`, endDate: "today" }],
    dimensions: [{ name: args.dimension ?? "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "keyEvents" },
    ],
    limit: 25,
  };
  const j = await gfetch<{
    rows?: Array<{ dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }>;
    totals?: Array<{ metricValues?: { value?: string }[] }>;
  }>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${args.propertyId}:runReport`,
    args.token,
    { method: "POST", body, label: "GA4 Data" },
  );

  const rows: Ga4Row[] = (j.rows ?? []).map((r) => ({
    dimension: r.dimensionValues?.[0]?.value ?? "(sem dado)",
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    users: Number(r.metricValues?.[1]?.value ?? 0),
    views: Number(r.metricValues?.[2]?.value ?? 0),
    conversions: Number(r.metricValues?.[3]?.value ?? 0),
  }));
  const t = j.totals?.[0]?.metricValues;
  const totals = {
    sessions: Number(t?.[0]?.value ?? rows.reduce((s, r) => s + r.sessions, 0)),
    users: Number(t?.[1]?.value ?? rows.reduce((s, r) => s + r.users, 0)),
    views: Number(t?.[2]?.value ?? rows.reduce((s, r) => s + r.views, 0)),
    conversions: Number(t?.[3]?.value ?? rows.reduce((s, r) => s + r.conversions, 0)),
  };
  return { rows, totals };
}

export async function ga4RealtimeUsers(token: string, propertyId: string): Promise<number> {
  const j = await gfetch<{ rows?: Array<{ metricValues?: { value?: string }[] }> }>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    token,
    { method: "POST", body: { metrics: [{ name: "activeUsers" }] }, label: "GA4 Realtime" },
  );
  return Number(j.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

// ============================================================
// Google Tag Manager
// ============================================================

export interface GtmAccount {
  accountId: string;
  name: string;
  path: string;
}
export interface GtmContainer {
  containerId: string;
  name: string;
  publicId: string;
  path: string;
}

export async function gtmListAccounts(token: string): Promise<GtmAccount[]> {
  const j = await gfetch<{ account?: Array<{ accountId?: string; name?: string; path?: string }> }>(
    "https://tagmanager.googleapis.com/tagmanager/v2/accounts",
    token,
    { label: "GTM" },
  );
  return (j.account ?? []).map((a) => ({
    accountId: a.accountId ?? "",
    name: a.name ?? a.accountId ?? "",
    path: a.path ?? `accounts/${a.accountId}`,
  }));
}

export async function gtmListContainers(token: string, accountId: string): Promise<GtmContainer[]> {
  const j = await gfetch<{
    container?: Array<{ containerId?: string; name?: string; publicId?: string; path?: string }>;
  }>(`https://tagmanager.googleapis.com/tagmanager/v2/accounts/${accountId}/containers`, token, {
    label: "GTM",
  });
  return (j.container ?? []).map((c) => ({
    containerId: c.containerId ?? "",
    name: c.name ?? "",
    publicId: c.publicId ?? "",
    path: c.path ?? "",
  }));
}

export interface GtmTag {
  name: string;
  type: string;
  firing: number;
  paused?: boolean;
}

export async function gtmListTags(token: string, accountId: string, containerId: string) {
  const ws = await gfetch<{ workspace?: Array<{ workspaceId?: string; name?: string }> }>(
    `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${accountId}/containers/${containerId}/workspaces`,
    token,
    { label: "GTM workspaces" },
  );
  const wsId = ws.workspace?.[0]?.workspaceId;
  if (!wsId) return { tags: [] as GtmTag[], triggers: [] as { name: string; type: string }[] };

  const base = `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${accountId}/containers/${containerId}/workspaces/${wsId}`;
  const [tagsRes, trigRes] = await Promise.all([
    gfetch<{
      tag?: Array<{ name?: string; type?: string; firingTriggerId?: string[]; paused?: boolean }>;
    }>(`${base}/tags`, token, { label: "GTM tags" }),
    gfetch<{ trigger?: Array<{ name?: string; type?: string }> }>(`${base}/triggers`, token, {
      label: "GTM triggers",
    }),
  ]);
  return {
    tags: (tagsRes.tag ?? []).map((t) => ({
      name: t.name ?? "",
      type: t.type ?? "",
      firing: t.firingTriggerId?.length ?? 0,
      paused: t.paused ?? false,
    })),
    triggers: (trigRes.trigger ?? []).map((t) => ({ name: t.name ?? "", type: t.type ?? "" })),
  };
}

// ============================================================
// Google Business Profile
// ============================================================

export interface GbpAccount {
  name: string;
  accountName: string;
  type?: string;
}
export interface GbpLocation {
  name: string;
  title: string;
  storeCode?: string;
  phone?: string;
  address?: string;
}

export async function gbpListAccounts(token: string): Promise<GbpAccount[]> {
  const j = await gfetch<{
    accounts?: Array<{ name?: string; accountName?: string; type?: string }>;
  }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=100", token, {
    label: "Business Profile",
  });
  return (j.accounts ?? []).map((a) => ({
    name: a.name ?? "",
    accountName: a.accountName ?? a.name ?? "",
    type: a.type,
  }));
}

export async function gbpListLocations(token: string, account: string): Promise<GbpLocation[]> {
  const fields = "name,title,storeCode,phoneNumbers,storefrontAddress";
  const j = await gfetch<{
    locations?: Array<{
      name?: string;
      title?: string;
      storeCode?: string;
      phoneNumbers?: { primaryPhone?: string };
      storefrontAddress?: {
        addressLines?: string[];
        locality?: string;
        administrativeArea?: string;
      };
    }>;
  }>(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=${fields}&pageSize=100`,
    token,
    { label: "Business Profile" },
  );
  return (j.locations ?? []).map((l) => ({
    name: l.name ?? "",
    title: l.title ?? "",
    storeCode: l.storeCode,
    phone: l.phoneNumbers?.primaryPhone,
    address: [
      l.storefrontAddress?.addressLines?.join(", "),
      l.storefrontAddress?.locality,
      l.storefrontAddress?.administrativeArea,
    ]
      .filter(Boolean)
      .join(" - "),
  }));
}

const GBP_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
];

export async function gbpPerformance(token: string, location: string, days: number) {
  const end = new Date();
  const start = new Date(Date.now() - Math.max(1, days) * 86400000);
  const loc = location.includes("/") ? location.split("/").pop() : location;
  const u = new URL(
    `https://businessprofileperformance.googleapis.com/v1/locations/${loc}:fetchMultiDailyMetricsTimeSeries`,
  );
  for (const m of GBP_METRICS) u.searchParams.append("dailyMetrics", m);
  u.searchParams.set("dailyRange.start_date.year", String(start.getUTCFullYear()));
  u.searchParams.set("dailyRange.start_date.month", String(start.getUTCMonth() + 1));
  u.searchParams.set("dailyRange.start_date.day", String(start.getUTCDate()));
  u.searchParams.set("dailyRange.end_date.year", String(end.getUTCFullYear()));
  u.searchParams.set("dailyRange.end_date.month", String(end.getUTCMonth() + 1));
  u.searchParams.set("dailyRange.end_date.day", String(end.getUTCDate()));

  const j = await gfetch<{
    multiDailyMetricTimeSeries?: Array<{
      dailyMetricTimeSeries?: Array<{
        dailyMetric?: string;
        timeSeries?: { datedValues?: Array<{ value?: string }> };
      }>;
    }>;
  }>(u.toString(), token, { label: "Business Profile Performance" });

  const totals: Record<string, number> = {};
  for (const group of j.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const key = series.dailyMetric ?? "";
      const sum = (series.timeSeries?.datedValues ?? []).reduce(
        (s, v) => s + Number(v.value ?? 0),
        0,
      );
      totals[key] = (totals[key] ?? 0) + sum;
    }
  }
  return {
    impressions:
      (totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH ?? 0) +
      (totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH ?? 0) +
      (totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS ?? 0) +
      (totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS ?? 0),
    calls: totals.CALL_CLICKS ?? 0,
    websiteClicks: totals.WEBSITE_CLICKS ?? 0,
    directions: totals.BUSINESS_DIRECTION_REQUESTS ?? 0,
    conversations: totals.BUSINESS_CONVERSATIONS ?? 0,
    raw: totals,
  };
}

export async function gbpListReviews(token: string, account: string, location: string) {
  const loc = location.includes("/") ? location.split("/").pop() : location;
  const j = await gfetch<{
    reviews?: Array<{
      reviewId?: string;
      comment?: string;
      starRating?: string;
      createTime?: string;
      reviewer?: { displayName?: string };
      reviewReply?: { comment?: string; updateTime?: string };
    }>;
    averageRating?: number;
    totalReviewCount?: number;
  }>(
    `https://mybusiness.googleapis.com/v4/${account}/locations/${loc}/reviews?pageSize=50`,
    token,
    { label: "Business Profile Reviews" },
  );
  return {
    averageRating: j.averageRating ?? 0,
    total: j.totalReviewCount ?? j.reviews?.length ?? 0,
    reviews: (j.reviews ?? []).map((r) => ({
      id: r.reviewId ?? "",
      author: r.reviewer?.displayName ?? "Cliente",
      rating: r.starRating ?? "",
      comment: r.comment ?? "",
      createdAt: r.createTime ?? "",
      reply: r.reviewReply?.comment ?? null,
    })),
  };
}

export async function gbpReplyReview(
  token: string,
  account: string,
  location: string,
  reviewId: string,
  comment: string,
) {
  const loc = location.includes("/") ? location.split("/").pop() : location;
  await gfetch(
    `https://mybusiness.googleapis.com/v4/${account}/locations/${loc}/reviews/${reviewId}/reply`,
    token,
    { method: "PUT", body: { comment }, label: "Business Profile Reply" },
  );
  return { ok: true };
}

// ============================================================
// Merchant Center
// ============================================================

export async function merchantListProducts(token: string, merchantId: string) {
  const j = await gfetch<{
    resources?: Array<{
      id?: string;
      title?: string;
      price?: { value?: string; currency?: string };
      availability?: string;
      link?: string;
      imageLink?: string;
    }>;
  }>(
    `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products?maxResults=50`,
    token,
    { label: "Merchant Center" },
  );
  return (j.resources ?? []).map((p) => ({
    id: p.id ?? "",
    title: p.title ?? "",
    price: p.price ? `${p.price.value ?? ""} ${p.price.currency ?? ""}`.trim() : "",
    availability: p.availability ?? "",
    link: p.link ?? "",
    image: p.imageLink ?? "",
  }));
}

// ============================================================
// State assinado (HMAC) para o fluxo OAuth
// ============================================================

async function hmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

export async function buildGoogleState(
  workspaceId: string,
  products?: readonly string[],
): Promise<string> {
  const { clientSecret } = googleEnv();
  const payload = Buffer.from(
    JSON.stringify({ ws: workspaceId, t: Date.now(), products: normalizeGoogleProducts(products) }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${await hmac(payload, clientSecret)}`;
}

export async function verifyGoogleState(
  state: string,
): Promise<{ ws: string; t: number; products: string[] } | null> {
  const { clientSecret } = googleEnv();
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload, clientSecret)) !== sig) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ws?: string;
      t?: number;
      products?: string[];
    };
    if (!obj?.ws || typeof obj.ws !== "string") return null;
    if (Date.now() - (obj.t ?? 0) > 30 * 60 * 1000) return null;
    return { ws: obj.ws, t: obj.t ?? 0, products: normalizeGoogleProducts(obj.products) };
  } catch {
    return null;
  }
}
