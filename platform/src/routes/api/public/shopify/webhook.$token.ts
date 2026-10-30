import { createFileRoute } from "@tanstack/react-router";

// Webhook do Shopify → MKTOn.
// URL: /api/public/shopify/webhook/<webhook_token>
// O Shopify assina o corpo com HMAC-SHA256 (header X-Shopify-Hmac-Sha256)
// usando a "API secret key" do app customizado da loja.

export const Route = createFileRoute("/api/public/shopify/webhook/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { token } = params as { token: string };
        const raw = await request.text();
        const topic = request.headers.get("x-shopify-topic") ?? "";
        const shopHeader = request.headers.get("x-shopify-shop-domain") ?? "";
        const hmac = request.headers.get("x-shopify-hmac-sha256");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const m = await import("@/lib/shopify.server");

        const { data: rows } = await supabaseAdmin
          .from("integrations")
          .select("workspace_id, status, metadata")
          .eq("provider", "shopify");

        const row = (rows ?? []).find(
          (r) => ((r.metadata ?? {}) as Record<string, unknown>).webhook_token === token,
        );
        if (!row || row.status !== "connected") {
          return json({ error: "Token inválido." }, 401);
        }

        let secret: { shop_domain: string; api_secret?: string };
        try {
          secret = await m.readShopifySecretService(
            supabaseAdmin as unknown as Parameters<ShopifyMod["readShopifySecretService"]>[0],
            row.workspace_id,
          );
        } catch {
          return json({ error: "Integração indisponível." }, 401);
        }

        if (!secret.api_secret || !m.verifyShopifyHmac(secret.api_secret, raw, hmac)) {
          return json({ error: "Assinatura inválida." }, 401);
        }
        if (shopHeader && secret.shop_domain && shopHeader !== secret.shop_domain) {
          return json({ error: "Loja não confere." }, 401);
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return json({ error: "Payload inválido." }, 400);
        }

        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const crm = m.readCrmSettings(metadata);
        const admin = supabaseAdmin as unknown as Parameters<ShopifyMod["upsertShopifyLead"]>[0];

        try {
          await handleTopic(admin, m, row.workspace_id, crm, topic, payload);
          await supabaseAdmin
            .from("integrations")
            .update({
              last_check_at: new Date().toISOString(),
              last_error: null,
              metadata: { ...metadata, last_topic: topic, last_event_at: new Date().toISOString() },
            })
            .eq("workspace_id", row.workspace_id)
            .eq("provider", "shopify");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro ao processar webhook";
          await supabaseAdmin
            .from("integrations")
            .update({ last_error: msg.slice(0, 300) })
            .eq("workspace_id", row.workspace_id)
            .eq("provider", "shopify");
          return json({ error: msg }, 500);
        }

        return json({ ok: true }, 200);
      },
    },
  },
});

type ShopifyMod = typeof import("@/lib/shopify.server");

async function handleTopic(
  admin: Parameters<ShopifyMod["upsertShopifyLead"]>[0],
  m: ShopifyMod,
  workspaceId: string,
  crm: ReturnType<ShopifyMod["readCrmSettings"]>,
  topic: string,
  payload: Record<string, unknown>,
) {
  if (!crm.enabled) return;

  const money = (v: unknown) => Number(v ?? 0) || 0;

  if (topic === "customers/create" || topic === "customers/update") {
    const c = payload as {
      id?: number; first_name?: string; last_name?: string; email?: string; phone?: string;
      total_spent?: string; default_address?: { phone?: string };
    };
    const phone = c.phone || c.default_address?.phone || null;
    if (crm.onlyWithPhone && m.digitsOnly(phone).length < 8) return;
    await m.upsertShopifyLead(admin, {
      workspaceId,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Cliente Shopify",
      email: c.email ?? null,
      phone,
      value: money(c.total_spent),
      externalId: c.id ? `shopify:customer:${c.id}` : null,
      pipelineId: crm.pipelineId,
      stageId: crm.customerStageId,
      tag: crm.tag,
      note: "🛒 Novo cadastro na loja Shopify.",
    });
    return;
  }

  if (topic === "checkouts/create") {
    const ch = payload as {
      id?: number; email?: string; phone?: string; total_price?: string;
      customer?: { first_name?: string; last_name?: string; phone?: string };
    };
    const phone = ch.phone || ch.customer?.phone || null;
    if (crm.onlyWithPhone && m.digitsOnly(phone).length < 8) return;
    await m.upsertShopifyLead(admin, {
      workspaceId,
      name: [ch.customer?.first_name, ch.customer?.last_name].filter(Boolean).join(" ") || ch.email || "Checkout Shopify",
      email: ch.email ?? null,
      phone,
      value: money(ch.total_price),
      externalId: ch.id ? `shopify:checkout:${ch.id}` : null,
      pipelineId: crm.pipelineId,
      stageId: crm.customerStageId,
      tag: crm.tag,
      note: "🧺 Iniciou um checkout na loja e ainda não finalizou.",
    });
    return;
  }

  if (topic.startsWith("orders/")) {
    const o = payload as {
      id?: number; name?: string; email?: string; phone?: string; total_price?: string; currency?: string;
      customer?: { first_name?: string; last_name?: string; phone?: string; email?: string };
      line_items?: { title?: string; quantity?: number }[];
    };
    const phone = o.phone || o.customer?.phone || null;
    const items = (o.line_items ?? []).map((i) => `${i.quantity ?? 1}x ${i.title ?? "item"}`).join(", ");
    const stageId =
      topic === "orders/paid" ? crm.paidStageId || crm.orderStageId : crm.orderStageId || crm.customerStageId;
    const label =
      topic === "orders/paid"
        ? "💰 Pedido pago"
        : topic === "orders/cancelled"
          ? "❌ Pedido cancelado"
          : "🧾 Novo pedido";
    await m.upsertShopifyLead(admin, {
      workspaceId,
      name:
        [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") ||
        o.email ||
        o.customer?.email ||
        "Comprador Shopify",
      email: o.email ?? o.customer?.email ?? null,
      phone,
      value: money(o.total_price),
      externalId: o.id ? `shopify:order:${o.id}` : null,
      pipelineId: crm.pipelineId,
      stageId: topic === "orders/cancelled" ? null : stageId,
      tag: crm.tag,
      note: `${label} ${o.name ?? ""} no Shopify. Valor: ${o.total_price ?? 0} ${o.currency ?? ""}. Itens: ${items || "-"}`,
    });
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
