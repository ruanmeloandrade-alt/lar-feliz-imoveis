// Meta Custom Audiences, server functions.
// Cria/lê/sincroniza públicos personalizados, lookalikes e salvos por workspace.
// Todos os endpoints são scoped por workspace_id (multi-tenant).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "v23.0";

async function loadToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
): Promise<string> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  const { data, error } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Meta não conectada neste workspace.");
  const token = (data as { access_token?: string }).access_token;
  if (!token) throw new Error("Access token ausente.");
  return token;
}

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

async function metaPost<T = unknown>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const fd = new URLSearchParams({ ...body, access_token: token });
  const r = await fetch(url.toString(), { method: "POST", body: fd });
  const text = await r.text();
  if (!r.ok) throw new Error(`Meta POST ${path} ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

async function metaDelete<T = unknown>(path: string, token: string): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), { method: "DELETE" });
  if (!r.ok) throw new Error(`Meta DEL ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

async function assertMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
) {
  const { data } = await supabase.from("workspace_members")
    .select("workspace_id").eq("workspace_id", workspaceId).maybeSingle();
  if (!data) throw new Error("Sem acesso ao workspace.");
}

// Tipos de público que o painel expõe. Mapeiam para os subtypes e regras
// do Marketing API.
export const AUDIENCE_TYPES = [
  "website",            // WEBSITE, Pixel (visitantes/URL/evento)
  "customer_list",      // CUSTOM, lista de clientes (CSV com hash SHA-256)
  "catalog",            // ENGAGEMENT, interações com catálogo (product_set)
  "video",              // ENGAGEMENT, visualizações de vídeo
  "lead_form",          // ENGAGEMENT, abriu/enviou formulário de lead
  "instant_experience", // ENGAGEMENT, abriu/interagiu com canvas
  "shopping",           // ENGAGEMENT, interagiu com loja do Facebook/IG
  "engagement_ig",      // ENGAGEMENT, perfil do Instagram
  "events",             // ENGAGEMENT, evento do Facebook
  "engagement_page",    // ENGAGEMENT, página do Facebook
  "marketplace",        // ENGAGEMENT, classificados do Facebook / listings
  "lookalike",          // LOOKALIKE
  "saved",              // saved audience (targeting spec)
] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

// ---------- Schemas ----------

const RuleValue = z.record(z.string(), z.unknown());

const CreateSchema = z.object({
  workspaceId: z.string().uuid(),
  adAccountId: z.string().min(3),
  name: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
  type: z.enum(AUDIENCE_TYPES),
  retentionDays: z.number().int().min(1).max(180).default(30),
  // Config específico do tipo, inclusion/exclusion rules, pixel_id, event_source, ratio, country, targetingSpec, etc.
  config: RuleValue.default({}),
});

const LookalikeSchema = z.object({
  workspaceId: z.string().uuid(),
  adAccountId: z.string().min(3),
  name: z.string().min(2).max(200),
  originAudienceId: z.string().min(3),
  countries: z.array(z.string().length(2)).min(1).max(50),
  ratio: z.number().min(0.01).max(0.20).default(0.01), // topo do range (ou ratio único)
  startingRatio: z.number().min(0).max(0.20).optional(), // começo do range; se omitido, LAL "clássico" de 0→ratio
});

const CustomerListSchema = z.object({
  workspaceId: z.string().uuid(),
  audienceId: z.string().min(3),
  // Lista já normalizada e hashed (SHA-256 lower-hex) por chave.
  // Cliente responsável pela normalização/hash, evita mandar PII em claro pro server.
  users: z.array(z.object({
    EMAIL: z.string().optional(),
    PHONE: z.string().optional(),
    FN: z.string().optional(),
    LN: z.string().optional(),
    CT: z.string().optional(),
    ST: z.string().optional(),
    ZIP: z.string().optional(),
    COUNTRY: z.string().optional(),
    DOBY: z.string().optional(),
    GEN: z.string().optional(),
    MADID: z.string().optional(),
    EXTERN_ID: z.string().optional(),
  })).max(10000),
  schema: z.array(z.string()).min(1),
});

// ---------- Rule builders (Flexible Rule Spec) ----------

type Rule = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRule(type: AudienceType, cfg: any): Rule | null {
  switch (type) {
    case "website": {
      // Config esperado: { pixelId, mode: 'all_visitors'|'url_contains'|'event', urlContains?, eventName?, retentionDays }
      const pixelId = String(cfg.pixelId ?? "");
      if (!pixelId) throw new Error("Pixel obrigatório para público de site.");
      const filters: Array<Record<string, unknown>> = [
        { field: "url", operator: "i_contains", value: cfg.urlContains ?? "" },
      ];
      const inclusions: Record<string, unknown> = {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: pixelId, type: "pixel" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: cfg.mode === "url_contains"
              ? { operator: "and", filters }
              : cfg.mode === "event"
                ? { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.eventName ?? "PageView" }] }
                : { operator: "and", filters: [{ field: "url", operator: "i_contains", value: "" }] },
          },
        ],
      };
      return { inclusions };
    }
    case "video": {
      // Config: { videoIds: string[], percent: 25|50|75|95|100, retentionDays }
      const videos = (cfg.videoIds ?? []) as string[];
      if (!videos.length) throw new Error("Selecione ao menos 1 vídeo.");
      const percent = Number(cfg.percent ?? 25);
      const eventName = `video_view_${percent}_pcnt`;
      return {
        inclusions: {
          operator: "or",
          rules: videos.map((vid) => ({
            event_sources: [{ id: vid, type: "video" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: eventName }] },
          })),
        },
      };
    }
    case "engagement_page": {
      // Config: { pageId, action: 'page_engaged'|'page_liked'|'post_engagement'|'messaged_page' }
      const pageId = String(cfg.pageId ?? "");
      if (!pageId) throw new Error("Selecione uma página do Facebook.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: pageId, type: "page" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "page_engaged" }] },
          }],
        },
      };
    }
    case "engagement_ig": {
      const igId = String(cfg.igId ?? "");
      if (!igId) throw new Error("Selecione uma conta do Instagram.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: igId, type: "ig_business" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "ig_business_profile_all" }] },
          }],
        },
      };
    }
    case "lead_form": {
      const formIds = (cfg.formIds ?? []) as string[];
      const pageId = String(cfg.pageId ?? "");
      if (!formIds.length && !pageId) throw new Error("Selecione lead forms ou uma página.");
      return {
        inclusions: {
          operator: "or",
          rules: (formIds.length ? formIds : [pageId]).map((id) => ({
            event_sources: [{ id, type: formIds.length ? "lead_ad" : "page" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "leadgen_form_submit" }] },
          })),
        },
      };
    }
    case "catalog": {
      const productSetId = String(cfg.productSetId ?? "");
      if (!productSetId) throw new Error("Selecione um conjunto de produtos do catálogo.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: productSetId, type: "product_set" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "AddToCart" }] },
          }],
        },
      };
    }
    case "instant_experience": {
      const canvasId = String(cfg.canvasId ?? "");
      if (!canvasId) throw new Error("Selecione uma experiência instant-nea.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: canvasId, type: "canvas" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "canvas_opened" }] },
          }],
        },
      };
    }
    case "shopping": {
      const pageId = String(cfg.pageId ?? "");
      if (!pageId) throw new Error("Selecione uma página com loja.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: pageId, type: "shop" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "shop_view" }] },
          }],
        },
      };
    }
    case "events": {
      const eventId = String(cfg.eventId ?? "");
      if (!eventId) throw new Error("Selecione um evento do Facebook.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: eventId, type: "event" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "event_responded" }] },
          }],
        },
      };
    }
    case "marketplace": {
      const pageId = String(cfg.pageId ?? "");
      if (!pageId) throw new Error("Selecione uma página com anúncios no Marketplace.");
      return {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: pageId, type: "marketplace" }],
            retention_seconds: (cfg.retentionDays ?? 30) * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: cfg.action ?? "marketplace_view" }] },
          }],
        },
      };
    }
    default:
      return null;
  }
}

function subtypeFor(type: AudienceType): string {
  switch (type) {
    case "website": return "WEBSITE";
    case "customer_list": return "CUSTOM";
    case "lookalike": return "LOOKALIKE";
    case "saved": return "SAVED";
    default: return "ENGAGEMENT";
  }
}

// ---------- Server functions ----------

export const listAudiences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    let q = context.supabase.from("meta_custom_audiences")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data.adAccountId) q = q.eq("ad_account_id", data.adAccountId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { audiences: rows ?? [] };
  });

export const syncAudiencesFromMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    const acct = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    type Row = {
      id: string; name: string; description?: string; subtype?: string;
      retention_days?: number; approximate_count?: number; delivery_status?: { code: number; description: string };
      rule?: Record<string, unknown>;
    };
    const j = await metaGet<{ data: Row[] }>(`${acct}/customaudiences`, token, {
      fields: "id,name,description,subtype,retention_days,approximate_count,delivery_status,operation_status,rule",
      limit: "200",
    });
    const rows = j.data ?? [];
    const upserts = rows.map((r) => ({
      workspace_id: data.workspaceId,
      ad_account_id: acct,
      audience_id: r.id,
      name: r.name,
      description: r.description ?? null,
      audience_type: (r.subtype === "LOOKALIKE" ? "lookalike" : r.subtype === "WEBSITE" ? "website" : r.subtype === "ENGAGEMENT" ? "engagement_page" : r.subtype === "CUSTOM" ? "customer_list" : r.subtype === "APP" ? "app_activity" : "custom"),
      subtype: r.subtype ?? null,
      retention_days: r.retention_days ?? null,
      rule: (r.rule ?? null) as never,
      approximate_count: r.approximate_count ?? null,
      delivery_status: r.delivery_status?.description ?? null,
      origin: "meta_sync",
      meta_metadata: r as never,
    }));
    if (upserts.length) {
      const { error } = await context.supabase.from("meta_custom_audiences").upsert(upserts, {
        onConflict: "workspace_id,ad_account_id,audience_id",
      });
      if (error) throw new Error(error.message);
    }
    return { synced: upserts.length };
  });

export const createAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    const acct = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    const subtype = subtypeFor(data.type);

    const body: Record<string, string> = {
      name: data.name,
      subtype,
      description: data.description ?? "",
    };

    if (data.type === "saved") {
      // saved audiences endpoint different, delegate below
    } else if (data.type === "customer_list") {
      // Customer list: sem rule; a lista é enviada em passos separados via uploadCustomerListChunk.
      body.customer_file_source = String((data.config as { customer_file_source?: string }).customer_file_source ?? "USER_PROVIDED_ONLY");
      body.retention_days = String(data.retentionDays);
    } else {
      const rule = buildRule(data.type, data.config);
      if (rule) {
        body.rule = JSON.stringify(rule);
        body.retention_days = String(data.retentionDays);
        // Preenchimento retroativo (Meta popula o público com histórico do Pixel/evento).
        // Só para website; nos outros subtypes o Meta ignora esse campo.
        const prefillCfg = (data.config as { prefill?: boolean }).prefill;
        if (data.type === "website" && prefillCfg !== false) body.prefill = "1";
      }
    }

    // Special ad category (habitação/emprego/crédito) restringe LAL e é opt-in.
    const specialCat = (data.config as { specialAdCategory?: string }).specialAdCategory;
    if (specialCat && specialCat !== "NONE") body.special_ad_category = specialCat;

    let audienceId: string;
    let extraMeta: Record<string, unknown> = {};

    if (data.type === "saved") {
      const cfg = data.config as { targeting?: unknown };
      const res = await metaPost<{ id: string }>(`${acct}/saved_audiences`, token, {
        name: data.name,
        targeting: JSON.stringify(cfg.targeting ?? {}),
      });
      audienceId = res.id;
      extraMeta = { targeting: cfg.targeting };
    } else {
      const res = await metaPost<{ id: string }>(`${acct}/customaudiences`, token, body);
      audienceId = res.id;
    }

    const { data: row, error } = await context.supabase.from("meta_custom_audiences").insert({
      workspace_id: data.workspaceId,
      ad_account_id: acct,
      audience_id: audienceId,
      name: data.name,
      description: data.description ?? null,
      audience_type: data.type,
      subtype,
      retention_days: data.retentionDays,
      rule: ((data.config as Record<string, unknown>) ?? {}) as never,
      origin: "manual",
      meta_metadata: extraMeta as never,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { audience: row };
  });

export const createLookalike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LookalikeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    const acct = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    const lookalikeSpec: Record<string, unknown> = {
      type: "similarity",
      ratio: data.ratio,
      country: data.countries[0],
    };
    if (typeof data.startingRatio === "number") {
      lookalikeSpec.starting_ratio = data.startingRatio;
    }
    const spec = { origin_audience_id: data.originAudienceId, country: data.countries[0], ratio: data.ratio, starting_ratio: data.startingRatio ?? null };
    const res = await metaPost<{ id: string }>(`${acct}/customaudiences`, token, {
      name: data.name,
      subtype: "LOOKALIKE",
      origin_audience_id: data.originAudienceId,
      lookalike_spec: JSON.stringify(lookalikeSpec),
    });
    const { data: row, error } = await context.supabase.from("meta_custom_audiences").insert({
      workspace_id: data.workspaceId,
      ad_account_id: acct,
      audience_id: res.id,
      name: data.name,
      audience_type: "lookalike",
      subtype: "LOOKALIKE",
      origin: "manual",
      lookalike_spec: spec as never,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { audience: row };
  });

// Busca países no Meta (typeahead da UI de novo público semelhante).
// Retorna o mesmo formato usado pela ferramenta oficial: [{ key: "BR", name: "Brazil", ... }].
export const searchGeoCountries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    query: z.string().min(1).max(60),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadToken(context.supabase, data.workspaceId);
    const res = await metaGet<{ data: Array<{ key: string; name: string; country_code?: string; type?: string }> }>(
      "search",
      token,
      {
        type: "adgeolocation",
        location_types: JSON.stringify(["country"]),
        q: data.query,
        limit: "20",
      },
    );
    const countries = (res.data ?? [])
      .map((c) => ({ code: (c.country_code ?? c.key ?? "").toUpperCase(), name: c.name }))
      .filter((c) => c.code.length === 2);
    return { countries };
  });

export const uploadCustomerListChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CustomerListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    const payload = {
      schema: data.schema,
      data: data.users.map((u) => data.schema.map((k) => (u as Record<string, string>)[k] ?? "")),
    };
    await metaPost(`${data.audienceId}/users`, token, {
      payload: JSON.stringify(payload),
    });
    return { uploaded: data.users.length };
  });

export const deleteAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { data: row, error: e0 } = await context.supabase.from("meta_custom_audiences")
      .select("audience_id,ad_account_id").eq("id", data.id).eq("workspace_id", data.workspaceId).maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!row) throw new Error("Público não encontrado.");
    try {
      const token = await loadToken(context.supabase, data.workspaceId);
      await metaDelete(row.audience_id, token);
    } catch (e) {
      console.warn("[audiences] delete no Meta falhou:", (e as Error).message);
    }
    const { error } = await context.supabase.from("meta_custom_audiences")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshAudienceStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { data: row } = await context.supabase.from("meta_custom_audiences")
      .select("audience_id").eq("id", data.id).eq("workspace_id", data.workspaceId).maybeSingle();
    if (!row) throw new Error("Público não encontrado.");
    const token = await loadToken(context.supabase, data.workspaceId);
    const j = await metaGet<{ approximate_count?: number; delivery_status?: { description?: string } }>(row.audience_id, token, {
      fields: "approximate_count,delivery_status,operation_status,retention_days",
    });
    await context.supabase.from("meta_custom_audiences").update({
      approximate_count: j.approximate_count ?? null,
      delivery_status: j.delivery_status?.description ?? null,
    }).eq("id", data.id).eq("workspace_id", data.workspaceId);
    return j;
  });

// ---------- Asset discovery para o painel ----------
// Puxa da Graph API os recursos que o Meta expõe pra montar públicos:
// pixels, páginas, contas de Instagram (via páginas), catálogos + product_sets,
// e depois por página: vídeos, lead forms, canvases (experiência instant-nea), eventos.

export const listAudienceAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    const acct = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;

    type PageRow = { id: string; name?: string; instagram_business_account?: { id: string; username?: string } };
    type PixelRow = { id: string; name?: string };
    type BizRow = { id: string; name?: string };
    type CatalogRow = { id: string; name?: string };

    const [meBiz, adAccountBiz] = await Promise.all([
      metaGet<{ data: BizRow[] }>("me/businesses", token, { fields: "id,name", limit: "100" }).catch(() => ({ data: [] as BizRow[] })),
      metaGet<{ business?: BizRow }>(acct, token, { fields: "business{id,name}" }).catch(() => ({ business: undefined as BizRow | undefined })),
    ]);
    const bizMap = new Map<string, BizRow>();
    for (const b of meBiz.data ?? []) bizMap.set(b.id, b);
    if (adAccountBiz.business?.id) bizMap.set(adAccountBiz.business.id, adAccountBiz.business);
    const businesses = Array.from(bizMap.values());

    const pageFields = "id,name,instagram_business_account{id,username}";
    const pageJobs: Array<Promise<{ data: PageRow[] }>> = [
      metaGet<{ data: PageRow[] }>("me/accounts", token, { fields: pageFields, limit: "200" }).catch(() => ({ data: [] })),
      metaGet<{ data: PageRow[] }>(`${acct}/promote_pages`, token, { fields: pageFields, limit: "100" })
        .catch(() => metaGet<{ data: PageRow[] }>(`${acct}/promotable_pages`, token, { fields: pageFields, limit: "100" }))
        .catch(() => ({ data: [] })),
    ];
    const catalogJobs: Array<Promise<{ data: CatalogRow[] }>> = [];
    for (const b of businesses) {
      pageJobs.push(
        metaGet<{ data: PageRow[] }>(`${b.id}/owned_pages`, token, { fields: pageFields, limit: "200" }).catch(() => ({ data: [] })),
        metaGet<{ data: PageRow[] }>(`${b.id}/client_pages`, token, { fields: pageFields, limit: "200" }).catch(() => ({ data: [] })),
      );
      catalogJobs.push(
        metaGet<{ data: CatalogRow[] }>(`${b.id}/owned_product_catalogs`, token, { fields: "id,name", limit: "50" }).catch(() => ({ data: [] })),
        metaGet<{ data: CatalogRow[] }>(`${b.id}/client_product_catalogs`, token, { fields: "id,name", limit: "50" }).catch(() => ({ data: [] })),
      );
    }

    const [pageResults, pixelsRes, catalogResults] = await Promise.all([
      Promise.all(pageJobs),
      metaGet<{ data: PixelRow[] }>(`${acct}/adspixels`, token, { fields: "id,name", limit: "50" }).catch(() => ({ data: [] as PixelRow[] })),
      Promise.all(catalogJobs),
    ]);

    const pageMap = new Map<string, PageRow>();
    for (const r of pageResults) for (const p of r.data ?? []) if (!pageMap.has(p.id)) pageMap.set(p.id, p);
    const pages = Array.from(pageMap.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    const catalogMap = new Map<string, CatalogRow>();
    for (const r of catalogResults) for (const c of r.data ?? []) if (!catalogMap.has(c.id)) catalogMap.set(c.id, c);
    const catalogs = Array.from(catalogMap.values());

    const igAccounts = pages
      .filter((p) => p.instagram_business_account?.id)
      .map((p) => ({
        id: p.instagram_business_account!.id,
        username: p.instagram_business_account!.username ?? null,
        page_id: p.id,
        page_name: p.name ?? null,
      }));

    return {
      pixels: (pixelsRes.data ?? []).map((p) => ({ id: p.id, name: p.name ?? null })),
      pages: pages.map((p) => ({ id: p.id, name: p.name ?? null })),
      instagram: igAccounts,
      catalogs: catalogs.map((c) => ({ id: c.id, name: c.name ?? null })),
    };
  });

// Lista vídeos de uma página (mantido por compatibilidade).
export const listPageVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    pageId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    type V = { id: string; title?: string; description?: string; created_time?: string };
    const j = await metaGet<{ data: V[] }>(`${data.pageId}/videos`, token, {
      fields: "id,title,description,created_time",
      limit: "100",
    }).catch(() => ({ data: [] as V[] }));
    return { videos: (j.data ?? []).map((v) => ({ id: v.id, title: v.title || v.description?.slice(0, 60) || v.id })) };
  });

// Lista vídeos por fonte: página do Facebook, perfil do Instagram ou conta de anúncio.
// Conta de anúncio não pode depender só de /advideos: muitos vídeos usados em
// campanhas aparecem apenas dentro do creative do anúncio.
export const listAvailableVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    source: z.enum(["page", "instagram", "ad_account"]),
    sourceId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    type Video = {
      id: string;
      title: string;
      thumbnail: string | null;
      source: "page" | "instagram" | "ad_account";
      origin: string;
      created_time?: string | null;
    };
    const out: Video[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    const pushVideo = (video: Video) => {
      if (!video.id || seen.has(video.id)) return;
      seen.add(video.id);
      out.push(video);
    };

    const safeGet = async <T,>(label: string, path: string, params: Record<string, string>): Promise<T | null> => {
      try { return await metaGet<T>(path, token, params); }
      catch (e) {
        warnings.push(`${label}: ${(e as Error).message}`);
        return null;
      }
    };

    if (data.source === "page") {
      type V = { id: string; title?: string; description?: string; picture?: string };
      const j = await safeGet<{ data: V[] }>("Vídeos da página", `${data.sourceId}/videos`, {
        fields: "id,title,description,picture,created_time",
        limit: "100",
      });
      for (const v of j?.data ?? []) {
        pushVideo({ id: v.id, title: v.title || v.description?.slice(0, 60) || v.id, thumbnail: v.picture ?? null, source: "page", origin: "Página" });
      }

      type Post = {
        id: string;
        message?: string;
        created_time?: string;
        attachments?: { data?: Array<{
          media_type?: string;
          title?: string;
          description?: string;
          target?: { id?: string; url?: string };
          media?: { image?: { src?: string } };
        }> };
      };
      const posts = await safeGet<{ data: Post[] }>("Posts com vídeo da página", `${data.sourceId}/published_posts`, {
        fields: "id,message,created_time,attachments{media_type,title,description,target,media}",
        limit: "100",
      });
      for (const post of posts?.data ?? []) {
        for (const att of post.attachments?.data ?? []) {
          const type = String(att.media_type ?? "").toLowerCase();
          const videoId = att.target?.id;
          if (!videoId || !type.includes("video")) continue;
          pushVideo({
            id: videoId,
            title: att.title || att.description?.slice(0, 70) || post.message?.slice(0, 70) || `Vídeo do post ${post.id}`,
            thumbnail: att.media?.image?.src ?? null,
            source: "page",
            origin: "Post da página",
            created_time: post.created_time ?? null,
          });
        }
      }
    } else if (data.source === "instagram") {
      type M = { id: string; media_type?: string; media_product_type?: string; caption?: string; thumbnail_url?: string; media_url?: string; timestamp?: string };
      const j = await safeGet<{ data: M[] }>("Vídeos/Reels do Instagram", `${data.sourceId}/media`, {
        fields: "id,media_type,media_product_type,caption,thumbnail_url,media_url,timestamp",
        limit: "100",
      });
      for (const m of j?.data ?? []) {
        if (m.media_type === "VIDEO" || m.media_product_type === "REELS") {
          pushVideo({
            id: m.id,
            title: m.caption?.slice(0, 80) || `IG ${m.media_product_type || m.media_type || "vídeo"} ${m.id}`,
            thumbnail: m.thumbnail_url ?? m.media_url ?? null,
            source: "instagram",
            origin: m.media_product_type === "REELS" ? "Instagram Reels" : "Instagram",
            created_time: m.timestamp ?? null,
          });
        }
      }
    } else if (data.source === "ad_account") {
      const actId = data.sourceId.startsWith("act_") ? data.sourceId : `act_${data.sourceId}`;
      type V = { id: string; title?: string; description?: string; picture?: string; created_time?: string };
      const j = await safeGet<{ data: V[] }>("Biblioteca de vídeos da conta", `${actId}/advideos`, {
        fields: "id,title,description,picture,created_time",
        limit: "200",
      });
      for (const v of j?.data ?? []) {
        pushVideo({
          id: v.id,
          title: v.title || v.description?.slice(0, 70) || v.id,
          thumbnail: v.picture ?? null,
          source: "ad_account",
          origin: "Biblioteca da conta",
          created_time: v.created_time ?? null,
        });
      }

      type Ad = {
        id: string;
        name?: string;
        effective_status?: string;
        creative?: {
          id?: string;
          name?: string;
          title?: string;
          thumbnail_url?: string;
          video_id?: string;
          object_story_spec?: { video_data?: { video_id?: string; title?: string; message?: string; image_url?: string } };
          asset_feed_spec?: { videos?: Array<{ video_id?: string; thumbnail_url?: string }> };
        };
      };
      const ads = await safeGet<{ data: Ad[] }>("Vídeos usados em anúncios", `${actId}/ads`, {
        fields: "id,name,effective_status,creative{id,name,title,thumbnail_url,video_id,object_story_spec{video_data{video_id,title,message,image_url}},asset_feed_spec{videos{video_id,thumbnail_url}}}",
        limit: "500",
      });
      for (const ad of ads?.data ?? []) {
        const creative = ad.creative;
        const directVideoIds = [
          creative?.video_id,
          creative?.object_story_spec?.video_data?.video_id,
          ...(creative?.asset_feed_spec?.videos ?? []).map((v) => v.video_id),
        ].filter((v): v is string => !!v);
        for (const videoId of directVideoIds) {
          const assetThumb = creative?.asset_feed_spec?.videos?.find((v) => v.video_id === videoId)?.thumbnail_url;
          pushVideo({
            id: videoId,
            title: creative?.title || creative?.object_story_spec?.video_data?.title || creative?.name || ad.name || videoId,
            thumbnail: creative?.thumbnail_url || creative?.object_story_spec?.video_data?.image_url || assetThumb || null,
            source: "ad_account",
            origin: `Anúncio${ad.effective_status ? ` · ${ad.effective_status}` : ""}`,
          });
        }
      }

      type Creative = NonNullable<Ad["creative"]>;
      const creatives = await safeGet<{ data: Creative[] }>("Criativos com vídeo", `${actId}/adcreatives`, {
        fields: "id,name,title,thumbnail_url,video_id,object_story_spec{video_data{video_id,title,message,image_url}},asset_feed_spec{videos{video_id,thumbnail_url}}",
        limit: "500",
      });
      for (const creative of creatives?.data ?? []) {
        const creativeVideoIds = [
          creative.video_id,
          creative.object_story_spec?.video_data?.video_id,
          ...(creative.asset_feed_spec?.videos ?? []).map((v) => v.video_id),
        ].filter((v): v is string => !!v);
        for (const videoId of creativeVideoIds) {
          const assetThumb = creative.asset_feed_spec?.videos?.find((v) => v.video_id === videoId)?.thumbnail_url;
          pushVideo({
            id: videoId,
            title: creative.title || creative.object_story_spec?.video_data?.title || creative.name || videoId,
            thumbnail: creative.thumbnail_url || creative.object_story_spec?.video_data?.image_url || assetThumb || null,
            source: "ad_account",
            origin: "Criativo da conta",
          });
        }
      }
    }
    return { videos: out, warnings };
  });

// Lista lead forms de uma página.
export const listPageLeadForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    pageId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    type F = { id: string; name?: string; status?: string };
    const j = await metaGet<{ data: F[] }>(`${data.pageId}/leadgen_forms`, token, {
      fields: "id,name,status",
      limit: "100",
    }).catch(() => ({ data: [] as F[] }));
    return { forms: (j.data ?? []).map((f) => ({ id: f.id, name: f.name ?? f.id, status: f.status ?? null })) };
  });

// Lista canvases (Instant Experiences) de uma página.
export const listPageCanvases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    pageId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    type C = { id: string; name?: string; is_published?: boolean };
    const j = await metaGet<{ data: C[] }>(`${data.pageId}/canvases`, token, {
      fields: "id,name,is_published",
      limit: "100",
    }).catch(() => ({ data: [] as C[] }));
    return { canvases: (j.data ?? []).map((c) => ({ id: c.id, name: c.name ?? c.id })) };
  });

// Lista eventos de uma página.
export const listPageEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    pageId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    type E = { id: string; name?: string; start_time?: string };
    const j = await metaGet<{ data: E[] }>(`${data.pageId}/events`, token, {
      fields: "id,name,start_time",
      limit: "100",
    }).catch(() => ({ data: [] as E[] }));
    return { events: (j.data ?? []).map((e) => ({ id: e.id, name: e.name ?? e.id, start_time: e.start_time ?? null })) };
  });

// Lista product sets de um catálogo.
export const listCatalogProductSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    catalogId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const token = await loadToken(context.supabase, data.workspaceId);
    type PS = { id: string; name?: string };
    const j = await metaGet<{ data: PS[] }>(`${data.catalogId}/product_sets`, token, {
      fields: "id,name",
      limit: "100",
    }).catch(() => ({ data: [] as PS[] }));
    return { productSets: (j.data ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id })) };
  });
