import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySb } from "./shopify.server";

const SaveSchema = z.object({
  shopDomain: z.string().trim().min(3),
  accessToken: z.string().trim().min(10),
  apiSecret: z.string().trim().optional(),
});

const ListSchema = z.object({ limit: z.number().int().min(1).max(100).optional() });

const CrmSchema = z.object({
  enabled: z.boolean(),
  pipelineId: z.string().uuid().nullable(),
  customerStageId: z.string().uuid().nullable(),
  orderStageId: z.string().uuid().nullable(),
  paidStageId: z.string().uuid().nullable(),
  onlyWithPhone: z.boolean(),
  tag: z.string().trim().min(1).max(30),
});

const WebhookSchema = z.object({
  topics: z.array(z.string().min(3)).min(1).max(10),
  baseUrl: z.string().trim().url().optional(),
});

const ImportSchema = z.object({ limit: z.number().int().min(1).max(250).optional() });

function baseUrlFromRequest(explicit?: string) {
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host");
  if (!host) throw new Error("Não consegui descobrir o endereço público do Vanessa Simoni para registrar os webhooks.");
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export const saveShopifyIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const shop = m.normalizeShopDomain(data.shopDomain);
    const token = data.accessToken.trim();

    const info = await m.fetchShop(shop, token);

    const { data: current } = await sb
      .from("integrations")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify")
      .maybeSingle();
    const prevMeta = ((current as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;

    const [products, orders, customers] = await Promise.all([
      m.fetchCount(shop, token, "products"),
      m.fetchCount(shop, token, "orders"),
      m.fetchCount(shop, token, "customers"),
    ]);

    await m.writeShopifySecret(sb, {
      workspaceId,
      payload: { shop_domain: shop, access_token: token, api_secret: data.apiSecret || undefined },
      metadata: {
        ...prevMeta,
        masked: m.maskToken(token),
        shop_domain: shop,
        shop_name: info.name ?? null,
        shop_email: info.email ?? null,
        shop_currency: info.currency ?? null,
        shop_plan: info.plan_display_name ?? null,
        primary_domain: info.domain ?? null,
        counts: { products, orders, customers },
        has_api_secret: !!data.apiSecret,
        webhook_token: (prevMeta.webhook_token as string) || m.randomToken(),
        connected_at: new Date().toISOString(),
      },
      status: "connected",
    });

    return { ok: true, shop: info, counts: { products, orders, customers } };
  });

export const getShopifyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const { data } = await sb
      .from("integrations")
      .select("status,metadata,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify")
      .maybeSingle();
    const row = data as { status?: string; metadata?: Record<string, unknown>; updated_at?: string } | null;
    const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
    return {
      connected: row?.status === "connected",
      status: row?.status ?? "disconnected",
      metadata: JSON.parse(JSON.stringify(metadata)) as Record<string, string | number | boolean | null>,
      crm: m.readCrmSettings(metadata),
      updatedAt: row?.updated_at ?? null,
    };
  });

export const disconnectShopify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const { error } = await sb
      .from("integrations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify");
    if (error) throw new Error(error.message ?? "Falha ao desconectar o Shopify.");
    return { ok: true };
  });

export const listShopifyProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const s = await m.readShopifySecret(sb, workspaceId);
    const products = await m.fetchProducts(s.shop_domain, s.access_token, data.limit ?? 30);
    return { products };
  });

export const listShopifyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const s = await m.readShopifySecret(sb, workspaceId);
    const orders = await m.fetchOrders(s.shop_domain, s.access_token, data.limit ?? 30);
    const revenue = orders.reduce((acc, o) => acc + Number(o.total_price ?? 0), 0);
    return { orders, revenue, currency: orders[0]?.currency ?? null };
  });

export const listShopifyCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const s = await m.readShopifySecret(sb, workspaceId);
    const customers = await m.fetchCustomers(s.shop_domain, s.access_token, data.limit ?? 30);
    return { customers };
  });

export const saveShopifyCrmSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CrmSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const { data: row } = await sb
      .from("integrations")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify")
      .maybeSingle();
    if (!row) throw new Error("Conecte o Shopify antes de configurar o gatilho do CRM.");
    const metadata = ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    const { error } = await sb
      .from("integrations")
      .update({ metadata: { ...metadata, crm: data } })
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify");
    if (error) throw new Error(error.message ?? "Falha ao salvar o gatilho do CRM.");
    return { ok: true, crm: data };
  });

export const syncShopifyWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WebhookSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const s = await m.readShopifySecret(sb, workspaceId);
    if (!s.api_secret) {
      throw new Error(
        "Para ligar os webhooks é preciso salvar também a API secret key do app do Shopify. Sem ela não dá para conferir se a mensagem veio mesmo do Shopify.",
      );
    }

    const { data: row } = await sb
      .from("integrations")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify")
      .maybeSingle();
    const metadata = ((row as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const token = (metadata.webhook_token as string) || m.randomToken();
    const callbackUrl = `${baseUrlFromRequest(data.baseUrl)}/api/public/shopify/webhook/${token}`;

    const result = await m.syncWebhooks(s.shop_domain, s.access_token, callbackUrl, data.topics);

    await sb
      .from("integrations")
      .update({
        metadata: {
          ...metadata,
          webhook_token: token,
          webhook_url: callbackUrl,
          webhook_topics: data.topics,
          webhooks_synced_at: new Date().toISOString(),
        },
      })
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify");

    return { ok: true, callbackUrl, ...result };
  });

export const importShopifyCustomersToCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const m = await import("./shopify.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const s = await m.readShopifySecret(sb, workspaceId);

    const { data: row } = await sb
      .from("integrations")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "shopify")
      .maybeSingle();
    const crm = m.readCrmSettings(((row as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>);

    const customers = await m.fetchCustomers(s.shop_domain, s.access_token, data.limit ?? 50);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const c of customers) {
      const phone = c.phone || c.default_address?.phone || null;
      if (crm.onlyWithPhone && m.digitsOnly(phone).length < 8) {
        skipped += 1;
        continue;
      }
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      const r = await m.upsertShopifyLead(sb, {
        workspaceId,
        name: name || c.email || "Cliente Shopify",
        email: c.email,
        phone,
        value: Number(c.total_spent ?? 0) || 0,
        externalId: c.id ? `shopify:customer:${c.id}` : null,
        pipelineId: crm.pipelineId,
        stageId: crm.customerStageId,
        tag: crm.tag,
        note: `🛒 Cliente importado do Shopify. Pedidos: ${c.orders_count ?? 0}. Total gasto: ${c.total_spent ?? 0}.`,
      });
      if (r.created) created += 1;
      else updated += 1;
    }

    return { ok: true, total: customers.length, created, updated, skipped };
  });
