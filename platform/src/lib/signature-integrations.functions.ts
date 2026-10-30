import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProviderSchema = z.enum(["clicksign", "zapsign"]);
const SaveSchema = z.object({
  provider: ProviderSchema,
  apiToken: z.string().trim().min(8).max(2048),
  webhookSecret: z.string().trim().max(512).optional(),
  callbackUrl: z.string().url().max(2048).optional(),
  environment: z.enum(["production", "sandbox"]).optional(),
});
const ProviderOnlySchema = z.object({ provider: ProviderSchema });

type AnySb = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data, error } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

function toCatalogStatus(status?: string | null): "conectado" | "desconectado" | "em_preparacao" {
  if (status === "connected" || status === "conectado") return "conectado";
  if (status === "needs_reconnect" || status === "pending" || status === "em_preparacao") return "em_preparacao";
  return "desconectado";
}

async function setSecret(sb: AnySb, workspaceId: string, provider: string, payload: Record<string, unknown>, metadata: Record<string, unknown>, status: string) {
  const { error } = await sb.rpc("set_integration_secret", {
    _workspace_id: workspaceId,
    _provider: provider,
    _plaintext: payload,
    _key: encKey(),
    _metadata: metadata,
    _status: status,
  });
  if (error) throw new Error(error.message || `Falha ao salvar ${provider}.`);
}

function validateCallbackUrl(raw?: string): string {
  if (!raw) throw new Error("URL pública da Vanessa Simoni não informada para configurar o webhook ZapSign.");
  const u = new URL(raw);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !local) throw new Error("Webhook ZapSign exige URL HTTPS.");
  u.pathname = "/api/zapsign-webhook";
  u.search = "";
  u.hash = "";
  return u.toString();
}

async function configureZapSignWebhook(apiToken: string, webhookSecret: string, callbackUrl: string) {
  const headers = { Authorization: `Bearer ${apiToken.replace(/^Bearer\s+/i, "")}`, "Content-Type": "application/json", Accept: "application/json" };
  const create = await fetch("https://api.zapsign.com.br/api/v1/user/company/webhook/", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: callbackUrl, type: "doc_signed" }),
  });
  const createText = await create.text();
  if (!create.ok) throw new Error(`ZapSign recusou o webhook (${create.status}): ${createText.slice(0, 300)}`);
  const created = createText ? JSON.parse(createText) as { id?: string | number } : {};
  if (!created.id) throw new Error("ZapSign não retornou o ID do webhook.");

  const header = await fetch("https://api.zapsign.com.br/api/v1/user/company/webhook/header/", {
    method: "POST",
    headers,
    body: JSON.stringify({ id: created.id, headers: [{ name: "x-mkton-zapsign-secret", value: webhookSecret }] }),
  });
  if (!header.ok) {
    const text = await header.text().catch(() => "");
    throw new Error(`ZapSign não aceitou o cabeçalho de segurança do webhook (${header.status}): ${text.slice(0, 300)}`);
  }
  return String(created.id);
}

export const getSignatureCatalogStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);
    const providers = ["clicksign", "zapsign", "docusign"] as const;
    const { data, error } = await sb.from("integrations")
      .select("provider,status,metadata")
      .eq("workspace_id", workspaceId)
      .in("provider", [...providers]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ provider: string; status: string; metadata?: Record<string, unknown> | null }>;
    const out: Record<string, { status: "conectado" | "desconectado" | "em_preparacao"; technicalStatus: { label: string; value: string }[] }> = {};
    for (const provider of providers) {
      const row = rows.find((r) => r.provider === provider);
      const status = toCatalogStatus(row?.status);
      out[provider] = {
        status,
        technicalStatus: [
          { label: "Status", value: status === "conectado" ? "Conectado" : status === "em_preparacao" ? "Requer atenção" : "Desconectado" },
          ...(row?.metadata?.masked ? [{ label: "Chave", value: String(row.metadata.masked) }] : []),
          ...(provider === "docusign" && row?.metadata?.account_id ? [{ label: "Conta", value: String(row.metadata.account_id) }] : []),
        ],
      };
    }
    return out;
  });

export const saveSignatureIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => SaveSchema.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);

    if (data.provider === "clicksign") {
      const clicksign = await import("@/lib/clicksign.server");
      const secret = { access_token: data.apiToken, environment: data.environment || "production" as const, webhook_secret: data.webhookSecret || undefined };
      await clicksign.testClicksign(secret);
      await setSecret(sb, workspaceId, "clicksign", secret, { masked: mask(data.apiToken), environment: secret.environment }, "connected");
      return { ok: true, provider: "clicksign" as const };
    }

    const zapsign = await import("@/lib/zapsign.server");
    await zapsign.testZapSign({ api_token: data.apiToken });
    const webhookSecret = data.webhookSecret || `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
    const callbackUrl = validateCallbackUrl(data.callbackUrl);
    const webhookId = await configureZapSignWebhook(data.apiToken, webhookSecret, callbackUrl);
    await setSecret(sb, workspaceId, "zapsign", { api_token: data.apiToken, webhook_secret: webhookSecret }, { masked: mask(data.apiToken), webhook_id: webhookId, webhook_url: callbackUrl }, "connected");
    return { ok: true, provider: "zapsign" as const, webhookId };
  });

export const testSignatureIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ProviderOnlySchema.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await activeWorkspace(sb, context.userId);
    if (data.provider === "clicksign") {
      const clicksign = await import("@/lib/clicksign.server");
      const secret = await clicksign.readClicksignSecret(sb, workspaceId);
      await clicksign.testClicksign(secret);
    } else {
      const zapsign = await import("@/lib/zapsign.server");
      const secret = await zapsign.readZapSignSecret(sb, workspaceId);
      await zapsign.testZapSign(secret);
    }
    return { ok: true };
  });
