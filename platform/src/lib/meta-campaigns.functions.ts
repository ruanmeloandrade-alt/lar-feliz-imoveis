import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import {resolveWorkspaceAiKey} from "./workspace-ai-key.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "v23.0";

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} não configurado.`);
  return v;
}

const asJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMetaToken(supabase: any, workspaceId: string): Promise<string> {
  const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
  const { data: sec, error } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "meta",
    _key: encKey,
  });
  if (error) throw new Error(error.message);
  if (!sec) throw new Error("Meta não conectada neste workspace.");
  const token = (sec as { access_token?: string }).access_token;
  if (!token) throw new Error("Access token ausente.");
  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOwnsAdAccount(supabase: any, workspaceId: string, adAccountId: string): Promise<void> {
  const { data, error } = await supabase
    .from("meta_ad_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("account_id", adAccountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conta de anúncios não pertence a este workspace.");
}

async function logOperation(
  workspaceId: string,
  userId: string,
  adAccountId: string,
  operation: string,
  request: unknown,
  result: { ok: true; response: unknown; targetId?: string } | { ok: false; error: string },
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("meta_campaign_operations").insert({
      workspace_id: workspaceId,
      user_id: userId,
      ad_account_id: adAccountId,
      operation,
      target_id: result.ok ? (result.targetId ?? null) : null,
      request_payload: asJson(request),
      response_payload: result.ok ? asJson(result.response) : null,
      status: result.ok ? "success" : "error",
      error_message: result.ok ? null : result.error,
    });
  } catch (e) {
    console.warn("[meta ops log] falha:", e);
  }
}

async function metaPost<T = unknown>(path: string, token: string, body: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const form = new URLSearchParams();
  form.set("access_token", token);
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  const r = await fetch(url.toString(), { method: "POST", body: form });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}: ${txt.slice(0, 400)}`);
  return JSON.parse(txt) as T;
}

async function metaGet<T = unknown>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const txt = await r.text();
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}: ${txt.slice(0, 400)}`);
  return JSON.parse(txt) as T;
}

// ============================================================
// Criar campanha
// ============================================================
const OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_SALES",
] as const;

const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
] as const;

const CAMPAIGN_DESTINATIONS = [
  // Engajamento
  "MESSAGES", "VIDEO_VIEWS", "POST_ENGAGEMENT", "PAGE_LIKES", "EVENT_RESPONSES",
  // Leads
  "LEAD_FORM", "PHONE_CALL", "SITE_LEADS",
  // Vendas
  "WEBSITE", "CATALOG_SALES", "APP",
  // Tráfego
  "MESSENGER", "WHATSAPP", "INSTAGRAM_DIRECT",
  // Reconhecimento
  "REACH", "IMPRESSIONS", "BRAND_AWARENESS", "AD_RECALL_LIFT", "THRUPLAY",
  // App
  "APP_INSTALLS", "APP_EVENTS",
] as const;

export const createMetaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    name: z.string().trim().min(1).max(200),
    objective: z.enum(OBJECTIVES),
    destination: z.enum(CAMPAIGN_DESTINATIONS).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
    buyingType: z.enum(["AUCTION", "RESERVED"]).default("AUCTION"),
    dailyBudgetCents: z.number().int().positive().optional(),
    lifetimeBudgetCents: z.number().int().positive().optional(),
    spendCapCents: z.number().int().positive().optional(),
    startTime: z.string().optional(),
    stopTime: z.string().optional(),
    isCbo: z.boolean().default(false),
    bidStrategy: z.enum(BID_STRATEGIES).optional(),
    bidAmountCents: z.number().int().positive().optional(),
    isAbTest: z.boolean().default(false),
    specialAdCategories: z.array(z.enum(["NONE", "EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS"])).default(["NONE"]),
  }).refine((v) => {
    if (v.isCbo) return !!(v.dailyBudgetCents || v.lifetimeBudgetCents);
    return true;
  }, { message: "CBO exige orçamento diário ou vitalício na campanha." }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    const body: Record<string, string | number> = {
      name: data.name,
      objective: data.objective,
      status: data.status,
      buying_type: data.buyingType,
      special_ad_categories: JSON.stringify(data.specialAdCategories),
    };
    if (data.isCbo) {
      if (data.dailyBudgetCents) body.daily_budget = data.dailyBudgetCents;
      if (data.lifetimeBudgetCents) body.lifetime_budget = data.lifetimeBudgetCents;
    }
    if (data.spendCapCents) body.spend_cap = data.spendCapCents;
    if (data.startTime) body.start_time = data.startTime;
    if (data.stopTime) body.stop_time = data.stopTime;
    if (data.bidStrategy) body.bid_strategy = data.bidStrategy;
    if (data.bidAmountCents) body.bid_amount = data.bidAmountCents;
    if (data.isAbTest) body.is_ab_test = "true";

    try {
      const res = await metaPost<{ id: string }>(`${data.adAccountId}/campaigns`, token, body);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_campaign", data, { ok: true, response: res, targetId: res.id });
      return { id: res.id, destination: data.destination ?? null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_campaign", data, { ok: false, error: msg });
      throw e;
    }
  });

export const updateMetaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    campaignId: z.string().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    dailyBudgetCents: z.number().int().positive().optional(),
    lifetimeBudgetCents: z.number().int().positive().optional(),
    spendCapCents: z.number().int().nonnegative().optional(),
    bidStrategy: z.enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"]).optional(),
    specialAdCategories: z.array(z.enum(["NONE", "EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING", "FINANCIAL_PRODUCTS_SERVICES"])).optional(),
    startTime: z.string().datetime().optional(),
    stopTime: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    const body: Record<string, string | number> = {};
    if (data.name) body.name = data.name;
    if (data.status) body.status = data.status;
    if (data.dailyBudgetCents) body.daily_budget = data.dailyBudgetCents;
    if (data.lifetimeBudgetCents) body.lifetime_budget = data.lifetimeBudgetCents;
    if (data.spendCapCents !== undefined) body.spend_cap = data.spendCapCents;
    if (data.bidStrategy) body.bid_strategy = data.bidStrategy;
    if (data.specialAdCategories) body.special_ad_categories = JSON.stringify(data.specialAdCategories);
    if (data.startTime) body.start_time = data.startTime;
    if (data.stopTime) body.stop_time = data.stopTime;
    if (Object.keys(body).length === 0) throw new Error("Nenhum campo para atualizar.");

    try {
      const res = await metaPost<{ success: boolean }>(data.campaignId, token, body);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "update_campaign", { ...data, body }, { ok: true, response: res, targetId: data.campaignId });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "update_campaign", data, { ok: false, error: msg });
      throw e;
    }
  });

/** Retorna detalhes completos de uma campanha para o formulário de edição. */
export const getMetaCampaignDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    campaignId: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const fields = "id,name,status,effective_status,objective,buying_type,bid_strategy,daily_budget,lifetime_budget,spend_cap,special_ad_categories,start_time,stop_time,created_time,updated_time";
    const res = await metaGet<{
      id: string; name: string; status: string; effective_status: string;
      objective: string; buying_type?: string; bid_strategy?: string;
      daily_budget?: string; lifetime_budget?: string; spend_cap?: string;
      special_ad_categories?: string[]; start_time?: string; stop_time?: string;
      created_time?: string; updated_time?: string;
    }>(data.campaignId, token, { fields });
    return {
      id: res.id,
      name: res.name,
      status: res.status,
      effectiveStatus: res.effective_status,
      objective: res.objective,
      buyingType: res.buying_type ?? null,
      bidStrategy: res.bid_strategy ?? null,
      dailyBudget: res.daily_budget ? Number(res.daily_budget) / 100 : null,
      lifetimeBudget: res.lifetime_budget ? Number(res.lifetime_budget) / 100 : null,
      spendCap: res.spend_cap ? Number(res.spend_cap) / 100 : null,
      specialAdCategories: res.special_ad_categories ?? [],
      startTime: res.start_time ?? null,
      stopTime: res.stop_time ?? null,
      createdTime: res.created_time ?? null,
      updatedTime: res.updated_time ?? null,
    };
  });


// ============================================================
// Duplicação (usa endpoint /copies nativo da Meta)
// ------------------------------------------------------------
// Campanha: POST /{campaign_id}/copies?deep_copy=true copia adsets+ads.
// Ad Set:   POST /{adset_id}/copies copia todos os ads dele.
// Ad:       POST /{ad_id}/copies copia o ad (mesmo adset por padrão).
// Sempre volta em status PAUSED para revisão antes de publicar.
// ============================================================

export const duplicateMetaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    campaignId: z.string().min(1),
    deepCopy: z.boolean().default(true), // true = copia adsets + ads junto
    renameSuffix: z.string().max(60).default(", cópia"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const doCopy = async (deep: boolean) => metaPost<{ copied_campaign_id: string; ad_object_ids?: Array<{ ad_object_type: string; ad_object_id: string }> }>(
      `${data.campaignId}/copies`,
      token,
      {
        deep_copy: deep,
        status_option: "PAUSED",
        rename_options: JSON.stringify({ rename_suffix: data.renameSuffix }),
      },
    );
    try {
      let res;
      let shallowFallback = false;
      try {
        res = await doCopy(data.deepCopy);
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : String(inner);
        // Meta subcode 1885194 = "cópia grande demais", tenta shallow (só a campanha)
        if (data.deepCopy && msg.includes("1885194")) {
          res = await doCopy(false);
          shallowFallback = true;
        } else if (msg.includes("error_user_msg")) {
          // Extrai mensagem amigável do erro Meta
          const m = msg.match(/"error_user_msg":"([^"]+)"/);
          throw new Error(m ? m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : msg);
        } else {
          throw inner;
        }
      }
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "duplicate_campaign", { ...data, shallowFallback }, { ok: true, response: res, targetId: res.copied_campaign_id });
      return { ok: true, newCampaignId: res.copied_campaign_id, shallowFallback };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "duplicate_campaign", data, { ok: false, error: msg });
      throw e;
    }
  });


export const duplicateMetaAdSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adSetId: z.string().min(1),
    deepCopy: z.boolean().default(true), // copia os ads dentro do adset também
    renameSuffix: z.string().max(60).default(", cópia"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    try {
      const res = await metaPost<{ copied_adset_id: string }>(`${data.adSetId}/copies`, token, {
        deep_copy: data.deepCopy,
        status_option: "PAUSED",
        rename_options: JSON.stringify({ rename_suffix: data.renameSuffix }),
      });
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "duplicate_adset", data, { ok: true, response: res, targetId: res.copied_adset_id });
      return { ok: true, newAdSetId: res.copied_adset_id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "duplicate_adset", data, { ok: false, error: msg });
      throw e;
    }
  });

export const duplicateMetaAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adId: z.string().min(1),
    renameSuffix: z.string().max(60).default(", cópia"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    try {
      const res = await metaPost<{ copied_ad_id: string }>(`${data.adId}/copies`, token, {
        status_option: "PAUSED",
        rename_options: JSON.stringify({ rename_suffix: data.renameSuffix }),
      });
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "duplicate_ad", data, { ok: true, response: res, targetId: res.copied_ad_id });
      return { ok: true, newAdId: res.copied_ad_id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "duplicate_ad", data, { ok: false, error: msg });
      throw e;
    }
  });

// ============================================================
// Ad Set (público + orçamento por ad set)
// ============================================================


const OPTIMIZATION_GOALS = [
  "LINK_CLICKS", "REACH", "IMPRESSIONS", "LEAD_GENERATION", "OFFSITE_CONVERSIONS",
  "LANDING_PAGE_VIEWS", "POST_ENGAGEMENT", "PAGE_LIKES", "VIDEO_VIEWS",
] as const;

const BILLING_EVENTS = ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY"] as const;

export const createMetaAdSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    campaignId: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
    dailyBudgetCents: z.number().int().positive().optional(),
    lifetimeBudgetCents: z.number().int().positive().optional(),
    optimizationGoal: z.enum(OPTIMIZATION_GOALS),
    billingEvent: z.enum(BILLING_EVENTS).default("IMPRESSIONS"),
    startTime: z.string().optional(), // ISO
    endTime: z.string().optional(),
    targeting: z.object({
      geo_locations: z.object({
        countries: z.array(z.string().length(2)).optional(),
        regions: z.array(z.object({ key: z.string() })).optional(),
        cities: z.array(z.object({ key: z.string(), radius: z.number().optional(), distance_unit: z.string().optional() })).optional(),
        zips: z.array(z.object({ key: z.string() })).optional(),
        neighborhoods: z.array(z.object({ key: z.string() })).optional(),
        custom_locations: z.array(z.object({
          latitude: z.number(),
          longitude: z.number(),
          radius: z.number().min(1).max(80),
          distance_unit: z.enum(["kilometer", "mile"]).default("kilometer"),
          name: z.string().optional(),
          address_string: z.string().optional(),
        })).optional(),
        excluded_countries: z.array(z.string().length(2)).optional(),
        excluded_regions: z.array(z.object({ key: z.string() })).optional(),
        excluded_cities: z.array(z.object({ key: z.string() })).optional(),
        excluded_zips: z.array(z.object({ key: z.string() })).optional(),
        excluded_neighborhoods: z.array(z.object({ key: z.string() })).optional(),
        excluded_custom_locations: z.array(z.object({
          latitude: z.number(),
          longitude: z.number(),
          radius: z.number().min(1).max(80),
          distance_unit: z.enum(["kilometer", "mile"]).default("kilometer"),
          name: z.string().optional(),
          address_string: z.string().optional(),
        })).optional(),
      }).default({ countries: ["BR"] }),
      age_min: z.number().int().min(13).max(65).default(18),
      age_max: z.number().int().min(13).max(65).default(65),
      genders: z.array(z.number().int()).optional(), // 1 masc, 2 fem
      interests: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
      // Direcionamento detalhado real do Meta (interesses/comportamentos/demografia/etc.).
      // Itens dentro de uma chave = OR; entradas do array flexible_spec = AND.
      flexible_spec: z.array(z.record(z.string(), z.array(z.object({ id: z.string(), name: z.string().optional() })))).optional(),
      exclusions: z.record(z.string(), z.array(z.object({ id: z.string(), name: z.string().optional() }))).optional(),
      publisher_platforms: z.array(z.enum(["facebook", "instagram", "audience_network", "messenger"])).optional(),
      facebook_positions: z.array(z.string()).optional(),
      instagram_positions: z.array(z.string()).optional(),
      audience_network_positions: z.array(z.string()).optional(),
      messenger_positions: z.array(z.string()).optional(),
      device_platforms: z.array(z.enum(["mobile", "desktop"])).optional(),
    }),
    promotedObjectPixelId: z.string().optional(),
    promotedObjectCustomEvent: z.string().optional(), // ex: PURCHASE, LEAD
    promotedObjectPageId: z.string().optional(),
    promotedObjectInstagramActorId: z.string().optional(),
    promotedObjectApplicationId: z.string().optional(),
    // destination_type do ad set: WEBSITE, APP, MESSENGER, WHATSAPP, INSTAGRAM_DIRECT, PHONE_CALL, ON_AD, INSTAGRAM_PROFILE, UNDEFINED
    destinationType: z.string().optional(),
    // Limite de lance / teto de custo no nível do conjunto (centavos).
    bidAmountCents: z.number().int().positive().optional(),
    // Advantage+ Audience (targeting_automation.advantage_audience). Deixa o Meta
    // expandir o público além dos critérios definidos quando bom desempenho é previsto.
    advantageAudience: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    const body: Record<string, string | number> = {
      name: data.name,
      campaign_id: data.campaignId,
      status: data.status,
      optimization_goal: data.optimizationGoal,
      billing_event: data.billingEvent,
      targeting: JSON.stringify(data.targeting),
    };
    if (data.dailyBudgetCents) body.daily_budget = data.dailyBudgetCents;
    if (data.lifetimeBudgetCents) body.lifetime_budget = data.lifetimeBudgetCents;
    if (data.startTime) body.start_time = data.startTime;
    if (data.endTime) body.end_time = data.endTime;
    if (data.destinationType) body.destination_type = data.destinationType;
    if (data.bidAmountCents) body.bid_amount = data.bidAmountCents;
    if (data.advantageAudience) body.targeting_automation = JSON.stringify({ advantage_audience: 1 });
    if (data.promotedObjectPixelId || data.promotedObjectPageId || data.promotedObjectInstagramActorId || data.promotedObjectApplicationId) {
      const promoted: Record<string, string> = {};
      if (data.promotedObjectPixelId) promoted.pixel_id = data.promotedObjectPixelId;
      if (data.promotedObjectCustomEvent) promoted.custom_event_type = data.promotedObjectCustomEvent;
      if (data.promotedObjectPageId) promoted.page_id = data.promotedObjectPageId;
      if (data.promotedObjectInstagramActorId) promoted.instagram_actor_id = data.promotedObjectInstagramActorId;
      if (data.promotedObjectApplicationId) promoted.application_id = data.promotedObjectApplicationId;
      body.promoted_object = JSON.stringify(promoted);
    }

    try {
      const res = await metaPost<{ id: string }>(`${data.adAccountId}/adsets`, token, body);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_adset", data, { ok: true, response: res, targetId: res.id });
      return { id: res.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_adset", data, { ok: false, error: msg });
      throw e;
    }
  });

// ============================================================
// Upload de imagem para a Meta (a partir do Storage)
// ============================================================

export const uploadMetaImageToStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    fileBase64: z.string().min(10), // base64 (sem prefixo data:)
    mime: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
    filename: z.string().trim().min(1).max(200),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    const bin = Buffer.from(data.fileBase64, "base64");
    if (bin.length > 8 * 1024 * 1024) throw new Error("Imagem maior que 8MB.");

    // 1) sobe pro Storage (bucket privado, pasta = workspace_id)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.workspaceId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage.from("meta-creatives").upload(path, bin, {
      contentType: data.mime,
      upsert: false,
    });
    if (upErr) throw new Error(`Storage: ${upErr.message}`);

    // 2) envia pra Meta (endpoint /adimages aceita bytes base64 no field "bytes")
    let metaImageHash: string | null = null;
    try {
      const form = new URLSearchParams();
      form.set("access_token", token);
      form.set("bytes", data.fileBase64);
      const r = await fetch(`https://graph.facebook.com/${GRAPH}/${data.adAccountId}/adimages`, {
        method: "POST",
        body: form,
      });
      const txt = await r.text();
      if (!r.ok) throw new Error(`Meta upload ${r.status}: ${txt.slice(0, 400)}`);
      const j = JSON.parse(txt) as { images?: Record<string, { hash: string }> };
      metaImageHash = Object.values(j.images ?? {})[0]?.hash ?? null;
      if (!metaImageHash) throw new Error("Meta não retornou hash da imagem.");
    } catch (e) {
      // rollback: apaga do Storage se a Meta falhou
      await supabaseAdmin.storage.from("meta-creatives").remove([path]).catch(() => undefined);
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "upload_image", { path, mime: data.mime }, { ok: false, error: msg });
      throw e;
    }

    // 3) registra na tabela
    const { data: row, error: rowErr } = await supabaseAdmin.from("meta_creative_uploads").insert({
      workspace_id: data.workspaceId,
      user_id: context.userId,
      ad_account_id: data.adAccountId,
      storage_path: path,
      mime: data.mime,
      size_bytes: bin.length,
      kind: "image",
      meta_image_hash: metaImageHash,
      width: data.width ?? null,
      height: data.height ?? null,
      original_filename: data.filename,
    }).select("id").single();
    if (rowErr) throw new Error(rowErr.message);

    await logOperation(data.workspaceId, context.userId, data.adAccountId, "upload_image", { path }, { ok: true, response: { hash: metaImageHash }, targetId: metaImageHash });
    return { id: row.id, imageHash: metaImageHash, storagePath: path };
  });

// ============================================================
// Criar criativo + ad (na mesma request para simplificar UI)
// ============================================================

const CTA_TYPES = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "CONTACT_US",
  "GET_QUOTE", "APPLY_NOW", "BOOK_TRAVEL", "DOWNLOAD", "GET_OFFER",
  "MESSAGE_PAGE", "WHATSAPP_MESSAGE", "SEND_MESSAGE",
] as const;

export const createMetaCreativeAndAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adSetId: z.string().min(1),
    adName: z.string().trim().min(1).max(200),
    pageId: z.string().min(1),
    instagramActorId: z.string().optional(),
    message: z.string().trim().min(1).max(2000),
    headline: z.string().trim().min(1).max(255),
    description: z.string().trim().max(500).optional(),
    link: z.string().url(),
    callToAction: z.enum(CTA_TYPES).default("LEARN_MORE"),
    imageHash: z.string().min(4),
    // Par-metros de URL do rastreamento (Meta url_tags), ex: "utm_source=facebook&utm_campaign={{campaign.name}}"
    urlTags: z.string().max(2000).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    // valida que a page pertence ao workspace
    const { data: page } = await context.supabase
      .from("meta_pages")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (!page) throw new Error("Página não pertence a este workspace.");

    // 1) cria criativo
    const creativeBody: Record<string, string> = {
      name: `${data.adName} - creative`,
      object_story_spec: JSON.stringify({
        page_id: data.pageId,
        ...(data.instagramActorId ? { instagram_actor_id: data.instagramActorId } : {}),
        link_data: {
          message: data.message,
          link: data.link,
          name: data.headline,
          ...(data.description ? { description: data.description } : {}),
          ...(data.urlTags ? { url_tags: data.urlTags } : {}),
          image_hash: data.imageHash,
          call_to_action: {
            type: data.callToAction,
            value: { link: data.link },
          },
        },
      }),
      degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } }),
    };

    let creativeId: string;
    try {
      const res = await metaPost<{ id: string }>(`${data.adAccountId}/adcreatives`, token, creativeBody);
      creativeId = res.id;
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_creative", data, { ok: true, response: res, targetId: res.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_creative", data, { ok: false, error: msg });
      throw e;
    }

    // 2) cria ad
    try {
      const res = await metaPost<{ id: string }>(`${data.adAccountId}/ads`, token, {
        name: data.adName,
        adset_id: data.adSetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: data.status,
      });
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_ad", { adSetId: data.adSetId, creativeId }, { ok: true, response: res, targetId: res.id });
      return { adId: res.id, creativeId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "create_ad", { adSetId: data.adSetId, creativeId }, { ok: false, error: msg });
      throw e;
    }
  });

// ============================================================
// Buscas de interesse (autocomplete p/ público)
// ============================================================

export const searchMetaTargetingInterests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    query: z.string().trim().min(2).max(80),
    limit: z.number().int().min(1).max(50).default(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const j = await metaGet<{ data: Array<{ id: string; name: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number; topic?: string; path?: string[] }> }>(
      "search",
      token,
      { type: "adinterest", q: data.query, limit: String(data.limit), locale: "pt_BR" },
    );
    return { interests: j.data ?? [] };
  });

// Direcionamento detalhado completo: interesses + comportamentos + demografia + life events etc.
// Espelha o "Direcionamento detalhado" do Ads Manager (endpoint targetingsearch da conta de anúncio).
export const searchMetaDetailedTargeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    query: z.string().trim().min(2).max(80),
    limit: z.number().int().min(1).max(50).default(25),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    // targetingsearch retorna itens com id/name/type/audience_size/path, mesma fonte do Ads Manager.
    const j = await metaGet<{
      data: Array<{
        id: string;
        name: string;
        type: string; // interests | behaviors | demographics | life_events | family_statuses | income | industries | education_statuses | work_positions | work_employers | relationship_statuses | ...
        audience_size_lower_bound?: number;
        audience_size_upper_bound?: number;
        path?: string[];
        description?: string;
      }>;
    }>(`${data.adAccountId}/targetingsearch`, token, {
      q: data.query,
      limit: String(data.limit),
      locale: "pt_BR",
    });
    return { items: j.data ?? [] };
  });

// ============================================================
// Sugestão IA de direcionamento detalhado (lateral, fora do óbvio)
// Ideia: fugir da concorrência ampla. Recebe descrição do produto/público,
// pede à IA ~12 conceitos de público adjacente (hobbies, estilo de vida,
// influenciadores, canais de mídia, comportamentos de consumo que
// esse público tem), SEM ficar restrito ao produto, e valida cada
// conceito no /targetingsearch da Meta, devolvendo só os que existem
// de fato com audience_size decente.
// ============================================================
export const suggestDetailedTargetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    productContext: z.string().trim().min(10).max(1200),
    audienceContext: z.string().trim().max(1200).optional().default(""),
    country: z.string().trim().max(60).optional().default("Brasil"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    const provider = await resolveWorkspaceAiKey(context.supabase, data.workspaceId);

    // 1) IA gera conceitos laterais (não sobre o produto, sobre o público)
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const { generateText, Output } = await import("ai");
    const gateway = createOpenAICompatible({name:provider.provider,baseURL:provider.baseUrl,apiKey:provider.apiKey});

    const system = `Você é especialista em segmentação Meta Ads. Sua missão é gerar termos de "Direcionamento Detalhado" (interests / behaviors / demographics do Meta) que fujam da concorrência óbvia sobre o produto.

Regra de ouro: NÃO sugira o termo do produto nem sinônimos diretos. Sugira o QUE O PÚBLICO consome, faz, curte, assiste, lê, veste, compra em PARALELO, hobbies, estilos de vida, influenciadores, revistas, canais, marcas adjacentes, comportamentos de compra, contextos culturais.

Isso reduz custo por leilão porque foge da segmentação lotada.

Devolva 12 termos curtos (1-4 palavras cada) em português, prontos pra buscar no Ads Manager. Inclua uma mistura de:
- 4 interesses de estilo de vida / hobby
- 3 marcas ou personalidades que esse público segue
- 2 comportamentos de consumo
- 2 mídias/canais que o público consome
- 1 demografia peculiar`;

    const userPrompt = `País alvo: ${data.country}
Produto/oferta: ${data.productContext}
Público (se informado): ${data.audienceContext || "não informado, inferir a partir do produto"}

Gere os 12 termos agora, cada um com uma justificativa curta (máx 12 palavras) explicando a conexão lateral com o público.`;

    let concepts: Array<{ term: string; reasoning: string; angle: string }> = [];
    try {
      const { output } = await generateText({
        model: gateway("openai/gpt-5.5"),
        system,
        prompt: userPrompt,
        output: Output.object({
          schema: z.object({
            concepts: z.array(z.object({
              term: z.string().min(2).max(60),
              reasoning: z.string().max(160),
              angle: z.enum(["lifestyle", "brand", "behavior", "media", "demographic"]),
            })).min(6).max(14),
          }),
        }),
      });
      concepts = (output as { concepts: typeof concepts }).concepts;
    } catch (e) {
      throw new Error(`Falha ao gerar sugestões IA: ${(e as Error).message}`);
    }

    // 2) Valida cada conceito no targetingsearch da Meta (paralelo, tolerante a falha)
    type TargetItem = {
      id: string; name: string; type: string;
      audience_size_lower_bound?: number; audience_size_upper_bound?: number;
      path?: string[]; description?: string;
    };
    const results = await Promise.all(concepts.map(async (c) => {
      try {
        const j = await metaGet<{ data: TargetItem[] }>(
          `${data.adAccountId}/targetingsearch`,
          token,
          { q: c.term, limit: "3", locale: "pt_BR" },
        );
        const matches = (j.data ?? []).filter((m) => {
          const size = m.audience_size_lower_bound ?? 0;
          return size >= 50_000; // ignora públicos minúsculos
        });
        return { concept: c, matches: matches.slice(0, 2) };
      } catch {
        return { concept: c, matches: [] as TargetItem[] };
      }
    }));

    // Achata: cada match vira um card independente vinculado ao conceito de origem
    const suggestions = results
      .flatMap((r) => r.matches.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        path: m.path ?? [],
        audience_size_lower_bound: m.audience_size_lower_bound ?? null,
        audience_size_upper_bound: m.audience_size_upper_bound ?? null,
        origin_term: r.concept.term,
        reasoning: r.concept.reasoning,
        angle: r.concept.angle,
      })))
      // dedupe por id
      .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id && x.type === s.type) === i)
      .sort((a, b) => (b.audience_size_lower_bound ?? 0) - (a.audience_size_lower_bound ?? 0));

    return { suggestions, unmatched_terms: results.filter((r) => r.matches.length === 0).map((r) => r.concept.term) };
  });

// ============================================================
// Busca de geolocalização (adgeolocation), país, estado, cidade, bairro, CEP
// ============================================================

export const searchMetaGeoLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    query: z.string().trim().min(2).max(80),
    types: z.array(z.enum(["country", "region", "city", "zip", "neighborhood", "subcity", "geo_market"])).default(["country", "region", "city", "zip", "neighborhood"]),
    limit: z.number().int().min(1).max(30).default(15),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const j = await metaGet<{
      data: Array<{
        key: string;
        name: string;
        type: string;
        country_code?: string;
        country_name?: string;
        region?: string;
        supports_region?: boolean;
        supports_city?: boolean;
      }>;
    }>("search", token, {
      type: "adgeolocation",
      q: data.query,
      location_types: JSON.stringify(data.types),
      limit: String(data.limit),
      locale: "pt_BR",
    });
    return { locations: j.data ?? [] };
  });

// ============================================================
// Assets diretos da conta de anúncio (pages, IG, pixels, WABA)
// Puxa da Graph API na hora e persiste no workspace pra criação do anúncio funcionar.
// ============================================================

export const listAdAccountAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    type PageRow = { id: string; name?: string; instagram_business_account?: { id: string; username?: string } };
    type PixelRow = { id: string; name?: string };
    type WabaRow = { id: string; name?: string };
    type BizRow = { id: string; name?: string };

    // 1) Páginas: união de todas as fontes que o Meta expõe.
    //    - /me/accounts: páginas que o usuário administra pessoalmente
    //    - /{business_id}/owned_pages + /client_pages: páginas dentro de cada BM
    //    - /{ad_account}/promote_pages: whitelist da conta de anúncio (Ads Manager usa isso)
    //    - /{ad_account}?fields=business: descobre o BM dono da conta de anúncio,
    //       mesmo quando /me/businesses vier vazio (escopo business_management ausente)
    //    Isso replica o comportamento do Ads Manager: se está no BM, aparece.
    const pageFields = "id,name,instagram_business_account{id,username}";
    const debug: Record<string, number | string> = {};

    // Descobre BMs por duas vias: /me/businesses e o business dono da conta de anúncio.
    const [meBizRes, adAccountBizRes] = await Promise.all([
      metaGet<{ data: BizRow[] }>("me/businesses", token, { fields: "id,name", limit: "100" })
        .catch((e) => { debug.me_businesses_err = String((e as Error).message).slice(0, 200); return { data: [] as BizRow[] }; }),
      metaGet<{ business?: BizRow }>(data.adAccountId, token, { fields: "business{id,name}" })
        .catch((e) => { debug.ad_account_business_err = String((e as Error).message).slice(0, 200); return { business: undefined }; }),
    ]);
    const businessMap = new Map<string, BizRow>();
    for (const b of meBizRes.data ?? []) businessMap.set(b.id, b);
    if (adAccountBizRes.business?.id) businessMap.set(adAccountBizRes.business.id, adAccountBizRes.business);
    const businesses = Array.from(businessMap.values());
    debug.businesses_count = businesses.length;

    const pagePromises: Array<Promise<{ data: PageRow[]; _src: string }>> = [
      metaGet<{ data: PageRow[] }>("me/accounts", token, { fields: pageFields, limit: "200" })
        .then((r) => ({ ...r, _src: "me/accounts" }))
        .catch(() => ({ data: [], _src: "me/accounts" })),
      metaGet<{ data: PageRow[] }>(`${data.adAccountId}/promote_pages`, token, { fields: pageFields, limit: "100" })
        .catch(() => metaGet<{ data: PageRow[] }>(`${data.adAccountId}/promotable_pages`, token, { fields: pageFields, limit: "100" }))
        .then((r) => ({ ...r, _src: "promote_pages" }))
        .catch(() => ({ data: [], _src: "promote_pages" })),
    ];
    for (const b of businesses) {
      pagePromises.push(
        metaGet<{ data: PageRow[] }>(`${b.id}/owned_pages`, token, { fields: pageFields, limit: "200" })
          .then((r) => ({ ...r, _src: `owned_pages:${b.id}` }))
          .catch(() => ({ data: [], _src: `owned_pages:${b.id}` })),
        metaGet<{ data: PageRow[] }>(`${b.id}/client_pages`, token, { fields: pageFields, limit: "200" })
          .then((r) => ({ ...r, _src: `client_pages:${b.id}` }))
          .catch(() => ({ data: [], _src: `client_pages:${b.id}` })),
      );
    }

    // 2) Pixels: da conta de anúncio
    // 3) WABAs: connected_ da conta + owned/client de cada business
    const wabaPromises: Array<Promise<{ data: WabaRow[] }>> = [
      metaGet<{ data: WabaRow[] }>(`${data.adAccountId}/connected_whatsapp_business_accounts`, token, { fields: "id,name" }).catch(() => ({ data: [] })),
    ];
    for (const b of businesses) {
      wabaPromises.push(
        metaGet<{ data: WabaRow[] }>(`${b.id}/owned_whatsapp_business_accounts`, token, { fields: "id,name" }).catch(() => ({ data: [] })),
        metaGet<{ data: WabaRow[] }>(`${b.id}/client_whatsapp_business_accounts`, token, { fields: "id,name" }).catch(() => ({ data: [] })),
      );
    }

    const [pageResults, pixelsRes, ...wabaResults] = await Promise.all([
      Promise.all(pagePromises),
      metaGet<{ data: PixelRow[] }>(`${data.adAccountId}/adspixels`, token, { fields: "id,name", limit: "50" }).catch(() => ({ data: [] as PixelRow[] })),
      ...wabaPromises,
    ]);
    for (const r of pageResults) debug[`src_${r._src}`] = (r.data ?? []).length;

    // dedupe por id
    const pageMap = new Map<string, PageRow>();
    for (const r of pageResults) for (const p of r.data ?? []) if (!pageMap.has(p.id)) pageMap.set(p.id, p);
    const pages = Array.from(pageMap.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    const wabaMap = new Map<string, WabaRow>();
    for (const r of wabaResults) for (const w of r.data ?? []) if (!wabaMap.has(w.id)) wabaMap.set(w.id, w);
    const wabas = Array.from(wabaMap.values());

    const pixels = pixelsRes.data ?? [];

    if (pages.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("meta_pages").upsert(
        pages.map((p) => ({ workspace_id: data.workspaceId, page_id: p.id, page_name: p.name ?? null })),
        { onConflict: "workspace_id,page_id" },
      );
      const igRows = pages
        .filter((p) => p.instagram_business_account?.id)
        .map((p) => ({
          workspace_id: data.workspaceId,
          instagram_id: p.instagram_business_account!.id,
          page_id: p.id,
          username: p.instagram_business_account!.username ?? null,
        }));
      if (igRows.length) {
        await supabaseAdmin.from("meta_instagram_accounts").upsert(igRows, { onConflict: "workspace_id,instagram_id" });
      }
      if (pixels.length) {
        await supabaseAdmin.from("meta_pixels").upsert(
          pixels.map((p) => ({ workspace_id: data.workspaceId, pixel_id: p.id, pixel_name: p.name ?? null, ad_account_id: data.adAccountId })),
          { onConflict: "workspace_id,pixel_id" },
        );
      }
    }

    return {
      pages: pages.map((p) => ({
        page_id: p.id,
        page_name: p.name ?? null,
        instagram_id: p.instagram_business_account?.id ?? null,
        instagram_username: p.instagram_business_account?.username ?? null,
      })),
      pixels: pixels.map((p) => ({ pixel_id: p.id, pixel_name: p.name ?? null })),
      whatsapp_accounts: wabas.map((w) => ({ waba_id: w.id, name: w.name ?? null })),
      _debug: debug,
    };
  });



// ============================================================
// Listar uploads do workspace (galeria de criativos)
// ============================================================

export const listMetaCreativeUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("meta_creative_uploads")
      .select("id, ad_account_id, storage_path, mime, kind, meta_image_hash, width, height, original_filename, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.adAccountId) query = query.eq("ad_account_id", data.adAccountId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // gera signed URLs (1h) para preview
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const withUrls = await Promise.all((rows ?? []).map(async (r) => {
      const { data: signed } = await supabaseAdmin.storage.from("meta-creatives").createSignedUrl(r.storage_path, 3600);
      return { ...r, previewUrl: signed?.signedUrl ?? null };
    }));
    return { uploads: withUrls };
  });

// ============================================================
// Operações de auditoria (últimas ações executadas)
// ============================================================

export const listMetaCampaignOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    limit: z.number().int().min(1).max(200).default(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meta_campaign_operations")
      .select("id, ad_account_id, operation, target_id, status, error_message, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { operations: rows ?? [] };
  });

// ============================================================
// Get / Update Ad Set
// ============================================================

export const getMetaAdSetDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adSetId: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const fields = "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,bid_amount,bid_strategy,billing_event,optimization_goal,start_time,end_time,targeting{age_min,age_max,genders},pacing_type";
    const res = await metaGet<{
      id: string; name: string; status: string; effective_status: string;
      campaign_id: string; daily_budget?: string; lifetime_budget?: string;
      bid_amount?: string; bid_strategy?: string; billing_event?: string;
      optimization_goal?: string; start_time?: string; end_time?: string;
      targeting?: { age_min?: number; age_max?: number; genders?: number[] };
    }>(data.adSetId, token, { fields });
    return {
      id: res.id,
      name: res.name,
      status: res.status,
      effectiveStatus: res.effective_status,
      campaignId: res.campaign_id,
      dailyBudget: res.daily_budget ? Number(res.daily_budget) / 100 : null,
      lifetimeBudget: res.lifetime_budget ? Number(res.lifetime_budget) / 100 : null,
      bidAmount: res.bid_amount ? Number(res.bid_amount) / 100 : null,
      bidStrategy: res.bid_strategy ?? null,
      billingEvent: res.billing_event ?? null,
      optimizationGoal: res.optimization_goal ?? null,
      startTime: res.start_time ?? null,
      endTime: res.end_time ?? null,
      targeting: {
        ageMin: res.targeting?.age_min ?? null,
        ageMax: res.targeting?.age_max ?? null,
      },
    };
  });

export const updateMetaAdSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adSetId: z.string().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    dailyBudgetCents: z.number().int().positive().optional(),
    lifetimeBudgetCents: z.number().int().positive().optional(),
    bidAmountCents: z.number().int().nonnegative().optional(),
    optimizationGoal: z.enum(OPTIMIZATION_GOALS).optional(),
    billingEvent: z.enum(BILLING_EVENTS).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    ageMin: z.number().int().min(13).max(65).optional(),
    ageMax: z.number().int().min(13).max(65).optional(),
    genders: z.array(z.number().int()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const body: Record<string, string | number> = {};
    if (data.name) body.name = data.name;
    if (data.status) body.status = data.status;
    if (data.dailyBudgetCents) body.daily_budget = data.dailyBudgetCents;
    if (data.lifetimeBudgetCents) body.lifetime_budget = data.lifetimeBudgetCents;
    if (data.bidAmountCents !== undefined) body.bid_amount = data.bidAmountCents;
    if (data.optimizationGoal) body.optimization_goal = data.optimizationGoal;
    if (data.billingEvent) body.billing_event = data.billingEvent;
    if (data.startTime) body.start_time = data.startTime;
    if (data.endTime) body.end_time = data.endTime;
    // Targeting patch (parcial): idade e gênero
    if (data.ageMin !== undefined || data.ageMax !== undefined || data.genders) {
      const targetingPatch: Record<string, unknown> = {};
      if (data.ageMin !== undefined) targetingPatch.age_min = data.ageMin;
      if (data.ageMax !== undefined) targetingPatch.age_max = data.ageMax;
      if (data.genders) targetingPatch.genders = data.genders;
      body.targeting = JSON.stringify(targetingPatch);
    }
    if (Object.keys(body).length === 0) throw new Error("Nenhum campo para atualizar.");
    try {
      const res = await metaPost<{ success: boolean }>(data.adSetId, token, body);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "update_adset", { ...data, body }, { ok: true, response: res, targetId: data.adSetId });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "update_adset", data, { ok: false, error: msg });
      throw e;
    }
  });

// ============================================================
// Get / Update Ad
// ============================================================

export const getMetaAdDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adId: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const fields = "id,name,status,effective_status,adset_id,campaign_id,creative{id,name,thumbnail_url,body,title,call_to_action_type,image_url,video_id,link_url}";
    const res = await metaGet<{
      id: string; name: string; status: string; effective_status: string;
      adset_id: string; campaign_id: string;
      creative?: {
        id: string; name?: string; thumbnail_url?: string; body?: string; title?: string;
        call_to_action_type?: string; image_url?: string; video_id?: string; link_url?: string;
      };
    }>(data.adId, token, { fields });
    return {
      id: res.id,
      name: res.name,
      status: res.status,
      effectiveStatus: res.effective_status,
      adSetId: res.adset_id,
      campaignId: res.campaign_id,
      creative: res.creative ? {
        id: res.creative.id,
        name: res.creative.name ?? null,
        thumbnailUrl: res.creative.thumbnail_url ?? null,
        body: res.creative.body ?? null,
        title: res.creative.title ?? null,
        callToActionType: res.creative.call_to_action_type ?? null,
        imageUrl: res.creative.image_url ?? null,
        videoId: res.creative.video_id ?? null,
        linkUrl: res.creative.link_url ?? null,
      } : null,
    };
  });

export const updateMetaAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    adId: z.string().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const body: Record<string, string | number> = {};
    if (data.name) body.name = data.name;
    if (data.status) body.status = data.status;
    if (Object.keys(body).length === 0) throw new Error("Nenhum campo para atualizar.");
    try {
      const res = await metaPost<{ success: boolean }>(data.adId, token, body);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "update_ad", { ...data, body }, { ok: true, response: res, targetId: data.adId });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOperation(data.workspaceId, context.userId, data.adAccountId, "update_ad", data, { ok: false, error: msg });
      throw e;
    }
  });

// ============================================================
// Comparação com IA (KPIs + análise textual)
// ============================================================

export const analyzeMetaComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    level: z.enum(["campaigns", "adsets", "ads"]),
    period: z.string().default("last_30d"),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      objective: z.string().nullable().optional(),
      status: z.string(),
      spend: z.number(),
      impressions: z.number(),
      clicks: z.number(),
      ctr: z.number(),
      leads: z.number(),
      cpl: z.number(),
      roas: z.number(),
      currency: z.string().nullable().optional(),
    })).min(2).max(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const workspaceId=await requireActiveWorkspace(context.supabase,context.userId,{createIfMissing:false});
    const provider=await resolveWorkspaceAiKey(context.supabase,workspaceId);
    const table = data.items.map((i, idx) => (
      `#${idx + 1} "${i.name}" (${i.status})` +
      (i.objective ? ` · objetivo: ${i.objective}` : "") +
      ` · gasto: ${i.spend.toFixed(2)} ${i.currency ?? ""} · impressões: ${i.impressions} · cliques: ${i.clicks} · CTR: ${(i.ctr * 100).toFixed(2)}% · leads: ${i.leads} · CPL: ${i.cpl.toFixed(2)} · ROAS: ${i.roas.toFixed(2)}x`
    )).join("\n");
    const levelLabel = data.level === "campaigns" ? "campanhas" : data.level === "adsets" ? "conjuntos de anúncios" : "anúncios";
    const prompt = `Você é um analista sênior de tráfego pago Meta Ads. Compare estes ${levelLabel} (período ${data.period}) e responda em PT-BR, direto ao ponto (máx 220 palavras):\n\n${table}\n\nEstrutura:\n1. **Vencedor**: qual item performa melhor no geral e por quê.\n2. **Métricas-chave**: destaque 2-3 KPIs decisivos (CTR, CPL, ROAS).\n3. **Riscos**: onde os perdedores estão sangrando budget.\n4. **Ação recomendada**: pausar/escalar/duplicar cada um. Seja específico com o nome.`;
    try {
      const r = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.defaultModel,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!r.ok) {
        const txt = await r.text();
        return { verdict: `IA indisponível: ${r.status} ${txt.slice(0, 200)}`, winners: [] };
      }
      const json = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
      const verdict = json.choices?.[0]?.message?.content ?? "Sem resposta da IA.";
      return { verdict, winners: [] as string[] };
    } catch (e) {
      return { verdict: `Erro ao chamar IA: ${e instanceof Error ? e.message : String(e)}`, winners: [] };
    }
  });

// ============================================================
// Advantage+ Audience, preview de expansão
// Chama o delivery_estimate do Meta duas vezes (com e sem
// targeting_optimization=expansion_all) e devolve as faixas.
// ============================================================
type DeliveryEstimateResp = {
  data?: Array<{
    estimate_ready?: boolean;
    users_lower_bound?: number;
    users_upper_bound?: number;
    estimate_dau?: number;
    estimate_mau_lower_bound?: number;
    estimate_mau_upper_bound?: number;
  }>;
};

export const estimateAdvantageAudienceReach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().regex(/^act_\d+$/),
    optimizationGoal: z.string().default("REACH"),
    // targeting spec no mesmo formato que enviamos ao criar adset
    targeting: z.record(z.string(), z.unknown()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsAdAccount(context.supabase, data.workspaceId, data.adAccountId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    async function call(withExpansion: boolean) {
      const targeting = { ...(data.targeting as Record<string, unknown>) };
      if (withExpansion) {
        (targeting as { targeting_optimization?: string }).targeting_optimization = "expansion_all";
      }
      try {
        const res = await metaGet<DeliveryEstimateResp>(
          `${data.adAccountId}/delivery_estimate`,
          token,
          {
            optimization_goal: data.optimizationGoal,
            targeting_spec: JSON.stringify(targeting),
          },
        );
        const row = res.data?.[0];
        if (!row?.estimate_ready) return null;
        return {
          lower: row.users_lower_bound ?? 0,
          upper: row.users_upper_bound ?? 0,
          dau: row.estimate_dau ?? 0,
          mau_lower: row.estimate_mau_lower_bound ?? 0,
          mau_upper: row.estimate_mau_upper_bound ?? 0,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) } as const;
      }
    }

    const [baseline, expanded] = await Promise.all([call(false), call(true)]);
    return { baseline, expanded };
  });
