import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySb, GoogleSecret } from "./google.server";

const Days = z.object({ days: z.number().int().min(1).max(365).optional() });

// ============================================================
// Conexão
// ============================================================

/** Status da central Google, com o que já está configurado por produto. */
export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./google.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readGoogleSecretSafe(sb, workspaceId);

    const { data: row } = await sb
      .from("integrations")
      .select("status,metadata,last_check_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google")
      .maybeSingle();

    const s = (secret ?? {}) as GoogleSecret;
    return {
      envReady: m.googleEnvReady(),
      connected:
        Boolean(secret?.refresh_token) &&
        (row as { status?: string } | null)?.status === "connected",
      email: s.email ?? null,
      scope: s.scope ?? null,
      products: s.products ?? [],
      lastCheckAt: (row as { last_check_at?: string } | null)?.last_check_at ?? null,
      config: {
        adsCustomerId: s.ads_customer_id ?? "",
        adsLoginCustomerId: s.ads_login_customer_id ?? "",
        adsDeveloperTokenSet: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
        ga4PropertyId: s.ga4_property_id ?? "",
        gtmAccountId: s.gtm_account_id ?? "",
        gtmContainerId: s.gtm_container_id ?? "",
        gbpAccount: s.gbp_account ?? "",
        gbpLocation: s.gbp_location ?? "",
        merchantId: s.merchant_id ?? "",
      },
      catalog: m.GOOGLE_PRODUCTS.map((p) => ({ id: p.id, label: p.label })),
    };
  });

/** Gera a URL de autorização da Conta Google. */
export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        redirectOrigin: z.string().url(),
        products: z.array(z.string().max(40)).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./google.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const { clientId } = m.googleEnv();
    const redirectUri = `${data.redirectOrigin}/api/public/oauth/google/callback`;
    const current = await m.readGoogleSecretSafe(sb, workspaceId);
    const products = m.normalizeGoogleProducts(data.products ?? current?.products);
    const state = await m.buildGoogleState(workspaceId, products);
    const scopes = m.googleScopesForProducts(products);
    return {
      authorizeUrl: m.buildGoogleAuthUrl({
        clientId,
        redirectUri,
        state,
        scopes,
        forceConsent: !current?.refresh_token,
      }),
      redirectUri,
      products,
      scopes,
    };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./google.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readGoogleSecretSafe(sb, workspaceId);
    if (secret?.refresh_token) await m.revokeGoogleToken(secret.refresh_token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("integrations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("provider", "google");
    return { ok: true };
  });

/** Salva configurações por produto. Credenciais técnicas ficam server-side. */
export const saveGoogleConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        adsCustomerId: z.string().trim().optional(),
        adsLoginCustomerId: z.string().trim().optional(),
        ga4PropertyId: z.string().trim().optional(),
        gtmAccountId: z.string().trim().optional(),
        gtmContainerId: z.string().trim().optional(),
        gbpAccount: z.string().trim().optional(),
        gbpLocation: z.string().trim().optional(),
        merchantId: z.string().trim().optional(),
        products: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./google.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const current = await m.readGoogleSecret(sb, workspaceId);

    const next: GoogleSecret = {
      ...current,
      ads_customer_id: data.adsCustomerId ?? current.ads_customer_id,
      ads_login_customer_id: data.adsLoginCustomerId ?? current.ads_login_customer_id,
      ads_developer_token: undefined,
      ga4_property_id: data.ga4PropertyId ?? current.ga4_property_id,
      gtm_account_id: data.gtmAccountId ?? current.gtm_account_id,
      gtm_container_id: data.gtmContainerId ?? current.gtm_container_id,
      gbp_account: data.gbpAccount ?? current.gbp_account,
      gbp_location: data.gbpLocation ?? current.gbp_location,
      merchant_id: data.merchantId ?? current.merchant_id,
      products: data.products ?? current.products,
    };
    await m.writeGoogleSecret(sb, {
      workspaceId,
      payload: next,
      metadata: {
        email: next.email ?? null,
        products: next.products ?? [],
        ads_customer_id: next.ads_customer_id ?? null,
        ga4_property_id: next.ga4_property_id ?? null,
        gtm_container_id: next.gtm_container_id ?? null,
        gbp_location: next.gbp_location ?? null,
        updated_at: new Date().toISOString(),
      },
      status: "connected",
    });
    return { ok: true };
  });

// helper interno compartilhado
async function ctxToken(context: { supabase: unknown; userId: string }) {
  const m = await import("./google.server");
  const sb = context.supabase as unknown as AnySb;
  const workspaceId = await m.activeWorkspace(sb, context.userId);
  const { token, secret } = await m.getGoogleAccessToken(sb, workspaceId);
  return { m, sb, workspaceId, token, secret };
}

// ============================================================
// Google Ads
// ============================================================

export const listGoogleAdsAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { m, token, secret } = await ctxToken(context);
    const dev = m.adsDeveloperToken(secret);
    const ids = await m.adsListAccessibleCustomers(token, dev);
    const accounts: Array<{ id: string; name: string; currency: string; manager: boolean }> = [];
    for (const id of ids.slice(0, 25)) {
      try {
        const rows = await m.adsSearch<{
          customer?: {
            id?: string;
            descriptiveName?: string;
            currencyCode?: string;
            manager?: boolean;
          };
        }>({
          token,
          developerToken: dev,
          customerId: id,
          loginCustomerId: secret.ads_login_customer_id,
          query: m.ADS_ACCOUNT_QUERY,
        });
        const c = rows[0]?.customer;
        accounts.push({
          id,
          name: c?.descriptiveName ?? `Conta ${id}`,
          currency: c?.currencyCode ?? "",
          manager: Boolean(c?.manager),
        });
      } catch {
        accounts.push({ id, name: `Conta ${id}`, currency: "", manager: false });
      }
    }
    return { accounts };
  });

export const listGoogleAdsCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    Days.extend({ customerId: z.string().trim().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    const customerId = data.customerId || secret.ads_customer_id;
    if (!customerId) throw new Error("Escolha a conta do Google Ads antes de carregar campanhas.");
    const dev = m.adsDeveloperToken(secret);
    const rows = await m.adsSearch<{
      campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
      metrics?: Record<string, string | number>;
    }>({
      token,
      developerToken: dev,
      customerId,
      loginCustomerId: secret.ads_login_customer_id,
      query: m.adsCampaignQuery(data.days ?? 30),
    });

    const campaigns = rows.map((r) => ({
      id: String(r.campaign?.id ?? ""),
      name: r.campaign?.name ?? "",
      status: r.campaign?.status ?? "",
      channel: r.campaign?.advertisingChannelType ?? "",
      cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0) * 100,
      cpc: Number(r.metrics?.averageCpc ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
      cpa: Number(r.metrics?.costPerConversion ?? 0) / 1_000_000,
    }));

    const totals = campaigns.reduce(
      (acc, c) => ({
        cost: acc.cost + c.cost,
        clicks: acc.clicks + c.clicks,
        impressions: acc.impressions + c.impressions,
        conversions: acc.conversions + c.conversions,
      }),
      { cost: 0, clicks: 0, impressions: 0, conversions: 0 },
    );
    return { campaigns, totals };
  });

// ============================================================
// Google Analytics 4
// ============================================================

export const listGa4Properties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { m, token } = await ctxToken(context);
    return { properties: await m.ga4ListProperties(token) };
  });

export const getGa4Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    Days.extend({
      propertyId: z.string().trim().optional(),
      dimension: z.string().trim().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    const propertyId = (data.propertyId || secret.ga4_property_id || "").replace("properties/", "");
    if (!propertyId) throw new Error("Escolha a propriedade do GA4 antes de ver o relatório.");
    const report = await m.ga4RunReport({
      token,
      propertyId,
      days: data.days ?? 28,
      dimension: data.dimension,
    });
    let realtime = 0;
    try {
      realtime = await m.ga4RealtimeUsers(token, propertyId);
    } catch {
      /* opcional */
    }
    return { ...report, realtime, propertyId };
  });

// ============================================================
// Google Tag Manager
// ============================================================

export const listGtmAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { m, token } = await ctxToken(context);
    return { accounts: await m.gtmListAccounts(token) };
  });

export const listGtmContainers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { m, token } = await ctxToken(context);
    return { containers: await m.gtmListContainers(token, data.accountId) };
  });

export const getGtmTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().trim().optional(),
        containerId: z.string().trim().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    const accountId = data.accountId || secret.gtm_account_id;
    const containerId = data.containerId || secret.gtm_container_id;
    if (!accountId || !containerId) throw new Error("Escolha a conta e o container do GTM.");
    return await m.gtmListTags(token, accountId, containerId);
  });

// ============================================================
// Google Business Profile
// ============================================================

export const listGbpAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { m, token } = await ctxToken(context);
    return { accounts: await m.gbpListAccounts(token) };
  });

export const listGbpLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { m, token } = await ctxToken(context);
    return { locations: await m.gbpListLocations(token, data.account) };
  });

export const getGbpPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Days.extend({ location: z.string().trim().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    const location = data.location || secret.gbp_location;
    if (!location) throw new Error("Escolha o local do Google Business Profile.");
    return await m.gbpPerformance(token, location, data.days ?? 30);
  });

export const listGbpReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ account: z.string().trim().optional(), location: z.string().trim().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    const account = data.account || secret.gbp_account;
    const location = data.location || secret.gbp_location;
    if (!account || !location)
      throw new Error("Escolha a conta e o local do Google Business Profile.");
    return await m.gbpListReviews(token, account, location);
  });

export const replyGbpReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ reviewId: z.string().min(1), comment: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    if (!secret.gbp_account || !secret.gbp_location)
      throw new Error("Escolha a conta e o local antes de responder.");
    return await m.gbpReplyReview(
      token,
      secret.gbp_account,
      secret.gbp_location,
      data.reviewId,
      data.comment,
    );
  });

// ============================================================
// Merchant Center
// ============================================================

export const listMerchantProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId: z.string().trim().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { m, token, secret } = await ctxToken(context);
    const merchantId = data.merchantId || secret.merchant_id;
    if (!merchantId) throw new Error("Informe o Merchant ID.");
    return { products: await m.merchantListProducts(token, merchantId) };
  });
