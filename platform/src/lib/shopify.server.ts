// Central Shopify: helpers server-only.
// APIs usadas:
// - Admin REST API 2024-10 (loja, produtos, pedidos, clientes, webhooks)
// - Webhooks assinados por HMAC-SHA256 com o "API secret key" do app customizado

import crypto from "crypto";

export const SHOPIFY_API_VERSION = "2024-10";

export type SbRpc = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
export type AnySb = SbRpc & { from: (t: string) => any };

export function encKey() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

export async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

export interface ShopifySecret {
  shop_domain: string;
  access_token: string;
  api_secret?: string;
}

/** Normaliza "minhaloja", "https://minhaloja.myshopify.com/admin" → "minhaloja.myshopify.com". */
export function normalizeShopDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s) throw new Error("Informe o domínio da loja (exemplo: minhaloja.myshopify.com).");
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) {
    throw new Error(
      "O domínio precisa ser o endereço .myshopify.com da loja (exemplo: minhaloja.myshopify.com), não o domínio próprio.",
    );
  }
  return s;
}

export function maskToken(t: string) {
  if (t.length <= 8) return "****";
  return `${t.slice(0, 6)}...${t.slice(-4)}`;
}

export async function readShopifySecret(sb: SbRpc, workspaceId: string): Promise<ShopifySecret> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "shopify",
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais do Shopify.");
  if (!data) throw new Error("Shopify não conectado neste workspace.");
  const s = data as ShopifySecret;
  if (!s.access_token || !s.shop_domain) {
    throw new Error("Credenciais do Shopify incompletas. Reconecte a integração.");
  }
  return s;
}

export async function readShopifySecretService(sb: SbRpc, workspaceId: string): Promise<ShopifySecret> {
  const { data, error } = await sb.rpc("get_integration_secret_service", {
    _workspace_id: workspaceId,
    _provider: "shopify",
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais do Shopify.");
  if (!data) throw new Error("Shopify não conectado.");
  return data as ShopifySecret;
}

export async function writeShopifySecret(
  sb: SbRpc,
  args: { workspaceId: string; payload: ShopifySecret; metadata: Record<string, unknown>; status: string },
) {
  const { error } = await sb.rpc("set_integration_secret", {
    _workspace_id: args.workspaceId,
    _provider: "shopify",
    _plaintext: args.payload as unknown as Record<string, unknown>,
    _key: encKey(),
    _metadata: args.metadata,
    _status: args.status,
  });
  if (error) throw new Error(error.message ?? "Falha ao salvar credenciais do Shopify.");
}

/** Chamada padrão da Admin REST API. */
export async function shopifyFetch<T>(
  args: {
    shop: string;
    token: string;
    path: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const url = new URL(`https://${args.shop}/admin/api/${SHOPIFY_API_VERSION}/${args.path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(args.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    method: args.method ?? "GET",
    headers: {
      "X-Shopify-Access-Token": args.token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(
        "O Shopify recusou o token (401/403). Confira se o Access Token foi copiado inteiro e se o app tem os escopos de leitura marcados.",
      );
    }
    if (resp.status === 404) {
      throw new Error("Endereço da loja não encontrado no Shopify (404). Revise o domínio .myshopify.com.");
    }
    if (resp.status === 429) {
      throw new Error("O Shopify pediu para esperar (limite de chamadas). Tente de novo em alguns segundos.");
    }
    throw new Error(`Shopify recusou a chamada (${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Shopify respondeu em formato inesperado.");
  }
}

// ---------------------------------------------------------------- leitura

export interface ShopifyShop {
  id?: number;
  name?: string;
  email?: string;
  domain?: string;
  myshopify_domain?: string;
  currency?: string;
  country_name?: string;
  plan_display_name?: string;
  timezone?: string;
}

export async function fetchShop(shop: string, token: string): Promise<ShopifyShop> {
  const r = await shopifyFetch<{ shop: ShopifyShop }>({ shop, token, path: "shop.json" });
  return r.shop ?? {};
}

export interface ShopifyProduct {
  id?: number;
  title?: string;
  handle?: string;
  status?: string;
  product_type?: string;
  vendor?: string;
  image?: { src?: string } | null;
  variants?: { id?: number; title?: string; price?: string; sku?: string; inventory_quantity?: number }[];
}

export async function fetchProducts(shop: string, token: string, limit = 30): Promise<ShopifyProduct[]> {
  const r = await shopifyFetch<{ products: ShopifyProduct[] }>({
    shop,
    token,
    path: "products.json",
    query: { limit, fields: "id,title,handle,status,product_type,vendor,image,variants" },
  });
  return r.products ?? [];
}

export interface ShopifyOrder {
  id?: number;
  name?: string;
  order_number?: number;
  created_at?: string;
  total_price?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  order_status_url?: string;
  customer?: ShopifyCustomer | null;
  phone?: string | null;
  email?: string | null;
  line_items?: { title?: string; quantity?: number; price?: string }[];
}

export async function fetchOrders(shop: string, token: string, limit = 30, status = "any"): Promise<ShopifyOrder[]> {
  const r = await shopifyFetch<{ orders: ShopifyOrder[] }>({
    shop,
    token,
    path: "orders.json",
    query: { limit, status },
  });
  return r.orders ?? [];
}

export interface ShopifyCustomer {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  orders_count?: number;
  total_spent?: string;
  created_at?: string;
  tags?: string;
  default_address?: { phone?: string | null; city?: string | null; province?: string | null } | null;
}

export async function fetchCustomers(shop: string, token: string, limit = 30): Promise<ShopifyCustomer[]> {
  const r = await shopifyFetch<{ customers: ShopifyCustomer[] }>({
    shop,
    token,
    path: "customers.json",
    query: { limit },
  });
  return r.customers ?? [];
}

export async function fetchCount(shop: string, token: string, resource: "products" | "orders" | "customers") {
  try {
    const r = await shopifyFetch<{ count: number }>({ shop, token, path: `${resource}/count.json` });
    return r.count ?? 0;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- webhooks

export const SHOPIFY_TOPICS = [
  "customers/create",
  "customers/update",
  "orders/create",
  "orders/paid",
  "orders/cancelled",
  "checkouts/create",
] as const;
export type ShopifyTopic = (typeof SHOPIFY_TOPICS)[number];

interface WebhookRow {
  id?: number;
  topic?: string;
  address?: string;
}

export async function listWebhooks(shop: string, token: string): Promise<WebhookRow[]> {
  const r = await shopifyFetch<{ webhooks: WebhookRow[] }>({ shop, token, path: "webhooks.json", query: { limit: 250 } });
  return r.webhooks ?? [];
}

export async function syncWebhooks(
  shop: string,
  token: string,
  callbackUrl: string,
  topics: readonly string[],
): Promise<{ created: string[]; kept: string[]; removed: number }> {
  const existing = await listWebhooks(shop, token);
  const mine = existing.filter((w) => (w.address ?? "").startsWith(callbackUrl.split("?")[0]));
  const created: string[] = [];
  const kept: string[] = [];
  let removed = 0;

  for (const topic of topics) {
    const found = mine.find((w) => w.topic === topic && w.address === callbackUrl);
    if (found) {
      kept.push(topic);
      continue;
    }
    await shopifyFetch({
      shop,
      token,
      path: "webhooks.json",
      method: "POST",
      body: { webhook: { topic, address: callbackUrl, format: "json" } },
    });
    created.push(topic);
  }

  for (const w of mine) {
    if (w.id && (!topics.includes(w.topic ?? "") || w.address !== callbackUrl)) {
      try {
        await shopifyFetch({ shop, token, path: `webhooks/${w.id}.json`, method: "DELETE" });
        removed += 1;
      } catch { /* ignora */ }
    }
  }

  return { created, kept, removed };
}

/** Confere a assinatura HMAC do webhook do Shopify (base64 do SHA-256 sobre o corpo cru). */
export function verifyShopifyHmac(apiSecret: string, rawBody: string, header: string | null): boolean {
  if (!apiSecret || !header) return false;
  const digest = crypto.createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

// ---------------------------------------------------------------- CRM

export interface ShopifyCrmSettings {
  enabled: boolean;
  pipelineId: string | null;
  customerStageId: string | null;
  orderStageId: string | null;
  paidStageId: string | null;
  onlyWithPhone: boolean;
  tag: string;
}

export const DEFAULT_CRM_SETTINGS: ShopifyCrmSettings = {
  enabled: false,
  pipelineId: null,
  customerStageId: null,
  orderStageId: null,
  paidStageId: null,
  onlyWithPhone: false,
  tag: "shopify",
};

export function readCrmSettings(metadata: Record<string, unknown> | null | undefined): ShopifyCrmSettings {
  const raw = (metadata?.crm ?? {}) as Partial<ShopifyCrmSettings>;
  return { ...DEFAULT_CRM_SETTINGS, ...raw };
}

export function digitsOnly(v: string | null | undefined) {
  return (v ?? "").replace(/\D+/g, "");
}

export async function ensureShopifySource(admin: AnySb, workspaceId: string): Promise<string | null> {
  const { data: existing } = await admin
    .from("crm_sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "shopify")
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created } = await admin
    .from("crm_sources")
    .insert({ workspace_id: workspaceId, provider: "shopify", display_name: "Shopify" })
    .select("id")
    .maybeSingle();
  return (created as { id: string } | null)?.id ?? null;
}

export interface UpsertLeadArgs {
  workspaceId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  value?: number | null;
  externalId?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  tag: string;
  note?: string | null;
}

/** Cria ou atualiza o lead vindo do Shopify (dedupe por e-mail e telefone). */
export async function upsertShopifyLead(
  admin: AnySb,
  args: UpsertLeadArgs,
): Promise<{ leadId: string | null; created: boolean }> {
  const email = args.email?.trim().toLowerCase() || null;
  const phone = args.phone?.trim() || null;
  let leadId: string | null = null;

  if (email) {
    const { data } = await admin
      .from("leads")
      .select("id")
      .eq("workspace_id", args.workspaceId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) leadId = (data as { id: string }).id;
  }
  if (!leadId && phone) {
    const d = digitsOnly(phone);
    if (d.length >= 8) {
      const { data } = await admin
        .from("leads")
        .select("id")
        .eq("workspace_id", args.workspaceId)
        .ilike("phone", `%${d.slice(-8)}%`)
        .limit(1)
        .maybeSingle();
      if (data) leadId = (data as { id: string }).id;
    }
  }

  let created = false;
  let previousStageId: string | null = null;
  if (leadId) {
    const { data: current } = await admin.from("leads").select("stage_id")
      .eq("id", leadId).eq("workspace_id", args.workspaceId).maybeSingle();
    previousStageId = (current as { stage_id?: string | null } | null)?.stage_id ?? null;
  }
  let targetPipelineId = args.pipelineId ?? null;
  if (args.stageId) {
    const { data: targetStage } = await admin.from("pipeline_stages").select("pipeline_id")
      .eq("id", args.stageId).eq("workspace_id", args.workspaceId).maybeSingle();
    if (!targetStage) throw new Error("Etapa Shopify não pertence a este workspace.");
    const actualPipelineId = (targetStage as { pipeline_id: string }).pipeline_id;
    if (targetPipelineId && targetPipelineId !== actualPipelineId) throw new Error("Etapa Shopify não pertence ao funil configurado.");
    targetPipelineId = actualPipelineId;
  }
  if (!leadId) {
    const sourceId = await ensureShopifySource(admin, args.workspaceId);
    const { data, error } = await admin
      .from("leads")
      .insert({
        workspace_id: args.workspaceId,
        crm_source_id: sourceId,
        name: args.name || email || phone || "Cliente Shopify",
        email,
        phone,
        value: args.value ?? 0,
        source: "shopify",
        external_id: args.externalId ?? null,
        pipeline_id: targetPipelineId,
        stage_id: args.stageId ?? null,
        tags: [args.tag],
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message ?? "Falha ao criar lead do Shopify.");
    leadId = (data as { id: string } | null)?.id ?? null;
    created = true;
  } else {
    const patch: Record<string, unknown> = {};
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    if (args.value != null && args.value > 0) patch.value = args.value;
    if (args.stageId) {
      patch.stage_id = args.stageId;
      if (targetPipelineId) patch.pipeline_id = targetPipelineId;
    }
    if (Object.keys(patch).length) {
      await admin.from("leads").update(patch).eq("id", leadId).eq("workspace_id", args.workspaceId);
    }
  }

  if (leadId && args.note) {
    await admin.from("lead_activities").insert({
      workspace_id: args.workspaceId,
      lead_id: leadId,
      type: "note",
      payload: { text: args.note, source: "shopify" },
    });
  }

  if (leadId) {
    const { dispatchCrmLeadCreated, dispatchCrmStageMoved, dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
    if (created) {
      await dispatchCrmLeadCreated(admin as never, {
        workspaceId: args.workspaceId, leadId, pipelineId: targetPipelineId, stageId: args.stageId ?? null,
      });
    } else {
      if (args.stageId && args.stageId !== previousStageId && targetPipelineId) {
        await dispatchCrmStageMoved(admin as never, {
          workspaceId: args.workspaceId, leadId, newStageId: args.stageId, newPipelineId: targetPipelineId, fromStageId: previousStageId,
        });
      }
      if (email) await dispatchCrmFieldUpdated(admin as never, { workspaceId: args.workspaceId, leadId, fieldName: "email" });
      if (phone) await dispatchCrmFieldUpdated(admin as never, { workspaceId: args.workspaceId, leadId, fieldName: "phone" });
      if (args.value != null && args.value > 0) await dispatchCrmFieldUpdated(admin as never, { workspaceId: args.workspaceId, leadId, fieldName: "value" });
    }
  }
  return { leadId, created };
}
