import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WhatsApp Cloud API via Embedded Signup da Meta.
 *
 * O cliente final não digita token, App Secret nem verify token. Ele clica em
 * "Conectar com o Meta", faz tudo dentro do fluxo oficial da Meta (escolher o
 * Business, criar/escolher a WABA, verificar o número) e a Meta devolve um
 * `code`. Aqui a gente troca esse code pelo token do negócio, assina o webhook
 * e registra o número. Depois disso a plataforma só cuida de modelos e envios.
 */

const GRAPH = "v23.0";
const PROVIDER = "whatsapp_cloud";

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} não configurado.`);
  return v;
}

const asJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as never;

type GraphError = { error?: { message?: string; error_user_msg?: string; code?: number } };

async function graph<T>(
  path: string,
  token: string,
  init?: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string>; body?: Record<string, unknown> },
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  if (init?.params) for (const [k, v] of Object.entries(init.params)) url.searchParams.set(k, v);
  const method = init?.method ?? "GET";
  const r = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    const e = (json as GraphError)?.error;
    throw new Error(e?.error_user_msg || e?.message || `Meta ${path} ${r.status}: ${text.slice(0, 300)}`);
  }
  return (json ?? {}) as T;
}

async function assertMember(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { eq: (c: string, d: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> } } } } },
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workspace_members").select("workspace_id")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace não encontrado ou sem permissão.");
}

type StoredWa = { access_token?: string };
type WaMeta = {
  waba_id?: string;
  business_id?: string | null;
  business_name?: string | null;
  phone_numbers?: Array<{
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    code_verification_status?: string;
    registered?: boolean;
  }>;
  default_phone_number_id?: string | null;
  webhook_subscribed?: boolean;
  connected_at?: string;
};

async function loadCreds(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  workspaceId: string,
) {
  const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
  const { data, error } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: PROVIDER, _key: encKey,
  });
  if (error) throw new Error(error.message);
  const token = (data as StoredWa | null)?.access_token;
  if (!token) throw new Error("WhatsApp Cloud ainda não conectado neste workspace.");
  return token;
}

/** Configuração pública necessária pro botão do Embedded Signup no navegador. */
export const getWhatsappEmbeddedConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const appId = process.env.META_APP_ID ?? null;
    const configId = process.env.META_WHATSAPP_CONFIG_ID ?? null;
    return {
      appId,
      configId,
      graphVersion: GRAPH,
      ready: Boolean(appId && configId && process.env.META_APP_SECRET && process.env.INTEGRATION_ENCRYPTION_KEY),
    };
  });

/** Status atual: número(s), WABA e assinatura de webhook. */
export const getWhatsappCloudStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: integ } = await context.supabase
      .from("integrations")
      .select("status,metadata,last_check_at")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER)
      .maybeSingle();

    const metadata = (integ?.metadata ?? null) as WaMeta | null;
    return {
      connected: integ?.status === "connected",
      lastCheckAt: integ?.last_check_at ?? null,
      wabaId: metadata?.waba_id ?? null,
      businessName: metadata?.business_name ?? null,
      webhookSubscribed: metadata?.webhook_subscribed ?? false,
      defaultPhoneNumberId: metadata?.default_phone_number_id ?? null,
      phoneNumbers: metadata?.phone_numbers ?? [],
      connectedAt: metadata?.connected_at ?? null,
    };
  });

/**
 * Finaliza o Embedded Signup: troca o code por token, assina o webhook da WABA
 * e registra o número na Cloud API.
 */
export const completeWhatsappEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    code: z.string().min(10),
    wabaId: z.string().min(3).optional(),
    phoneNumberId: z.string().min(3).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);

    const appId = requireEnv("META_APP_ID");
    const appSecret = requireEnv("META_APP_SECRET");
    const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");

    // 1) code -> business access token (Embedded Signup não usa redirect_uri)
    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", data.code);
    const tokenResp = await fetch(tokenUrl.toString());
    const tokenRes = await tokenResp.json().catch(() => ({})) as { access_token?: string } & GraphError;
    if (!tokenResp.ok) throw new Error(tokenRes?.error?.message ?? "Falha ao trocar o código da Meta.");
    const token = tokenRes.access_token;
    if (!token) throw new Error("A Meta não devolveu o token de acesso.");

    // 2) descobre a WABA quando o navegador não mandou
    let wabaId = data.wabaId ?? null;
    if (!wabaId) {
      const debug = await graph<{ data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } }>(
        "debug_token", token, { params: { input_token: token } },
      );
      const scopes = debug.data?.granular_scopes ?? [];
      wabaId = scopes.find((s) => s.scope === "whatsapp_business_management")?.target_ids?.[0] ?? null;
    }
    if (!wabaId) throw new Error("Não foi possível identificar a conta do WhatsApp Business. Refaça a conexão escolhendo a conta.");

    // 3) assina o app no webhook da WABA (é assim que as mensagens chegam pra gente)
    let webhookSubscribed = false;
    try {
      await graph(`${wabaId}/subscribed_apps`, token, { method: "POST" });
      webhookSubscribed = true;
    } catch (e) {
      console.warn("[wa cloud] subscribed_apps:", e instanceof Error ? e.message : e);
    }

    // 4) números da conta
    type PhoneRow = {
      id: string; display_phone_number?: string; verified_name?: string;
      quality_rating?: string; code_verification_status?: string; platform_type?: string;
    };
    const phones = await graph<{ data?: PhoneRow[] }>(`${wabaId}/phone_numbers`, token, {
      params: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type" },
    });
    const phoneRows = phones.data ?? [];
    const chosen = data.phoneNumberId ?? phoneRows[0]?.id ?? null;

    // 5) registra o número na Cloud API (PIN de 6 dígitos gerado por nós)
    const registered = new Set<string>();
    if (chosen) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      try {
        await graph(`${chosen}/register`, token, {
          method: "POST", body: { messaging_product: "whatsapp", pin },
        });
        registered.add(chosen);
      } catch (e) {
        // já registrado conta como sucesso
        const msg = e instanceof Error ? e.message : "";
        if (/already/i.test(msg)) registered.add(chosen);
        else console.warn("[wa cloud] register:", msg);
      }
    }

    // 6) nome do negócio (best-effort)
    let businessName: string | null = null;
    let businessId: string | null = null;
    try {
      const wabaInfo = await graph<{ id?: string; name?: string; owner_business_info?: { id?: string; name?: string } }>(
        `${wabaId}`, token, { params: { fields: "id,name,owner_business_info" } },
      );
      businessName = wabaInfo.owner_business_info?.name ?? wabaInfo.name ?? null;
      businessId = wabaInfo.owner_business_info?.id ?? null;
    } catch { /* opcional */ }

    const metadata: WaMeta = {
      waba_id: wabaId,
      business_id: businessId,
      business_name: businessName,
      phone_numbers: phoneRows.map((p) => ({
        id: p.id,
        display_phone_number: p.display_phone_number,
        verified_name: p.verified_name,
        quality_rating: p.quality_rating,
        code_verification_status: p.code_verification_status,
        registered: registered.has(p.id),
      })),
      default_phone_number_id: chosen,
      webhook_subscribed: webhookSubscribed,
      connected_at: new Date().toISOString(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: secErr } = await supabaseAdmin.rpc("set_integration_secret_service", {
      _workspace_id: data.workspaceId,
      _provider: PROVIDER,
      _plaintext: asJson({ access_token: token }),
      _key: encKey,
      _metadata: asJson(metadata),
      _status: "connected",
    });
    if (secErr) throw new Error(secErr.message);

    return {
      ok: true,
      wabaId,
      businessName,
      webhookSubscribed,
      phoneNumbers: metadata.phone_numbers ?? [],
      defaultPhoneNumberId: chosen,
    };
  });

/** Reconsulta números e assinatura direto na Meta e atualiza o cache local. */
export const refreshWhatsappCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    defaultPhoneNumberId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");

    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const prev = (integ?.metadata ?? {}) as WaMeta;
    const wabaId = prev.waba_id;
    if (!wabaId) throw new Error("Conta do WhatsApp Business não encontrada. Refaça a conexão.");

    type PhoneRow = {
      id: string; display_phone_number?: string; verified_name?: string;
      quality_rating?: string; code_verification_status?: string;
    };
    const phones = await graph<{ data?: PhoneRow[] }>(`${wabaId}/phone_numbers`, token, {
      params: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status" },
    });

    let webhookSubscribed = prev.webhook_subscribed ?? false;
    try {
      const subs = await graph<{ data?: Array<{ whatsapp_business_api_data?: { id?: string } }> }>(
        `${wabaId}/subscribed_apps`, token,
      );
      webhookSubscribed = (subs.data ?? []).length > 0;
    } catch { /* mantém valor anterior */ }

    const metadata: WaMeta = {
      ...prev,
      phone_numbers: (phones.data ?? []).map((p) => ({
        id: p.id,
        display_phone_number: p.display_phone_number,
        verified_name: p.verified_name,
        quality_rating: p.quality_rating,
        code_verification_status: p.code_verification_status,
        registered: prev.phone_numbers?.find((x) => x.id === p.id)?.registered ?? false,
      })),
      default_phone_number_id: data.defaultPhoneNumberId ?? prev.default_phone_number_id ?? phones.data?.[0]?.id ?? null,
      webhook_subscribed: webhookSubscribed,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("set_integration_secret_service", {
      _workspace_id: data.workspaceId,
      _provider: PROVIDER,
      _plaintext: asJson({ access_token: token }),
      _key: encKey,
      _metadata: asJson(metadata),
      _status: "connected",
    });

    return { ok: true, phoneNumbers: metadata.phone_numbers ?? [], webhookSubscribed, defaultPhoneNumberId: metadata.default_phone_number_id ?? null };
  });

/** Reassina o webhook da WABA (usado quando o status aparece pendente). */
export const subscribeWhatsappWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const prev = (integ?.metadata ?? {}) as WaMeta;
    if (!prev.waba_id) throw new Error("Conta do WhatsApp Business não encontrada.");
    await graph(`${prev.waba_id}/subscribed_apps`, token, { method: "POST" });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integrations")
      .update({ metadata: asJson({ ...prev, webhook_subscribed: true }) })
      .eq("workspace_id", data.workspaceId).eq("provider", PROVIDER);
    return { ok: true };
  });

/** Modelos (templates) da conta, direto da Meta. */
export const listWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const wabaId = ((integ?.metadata ?? {}) as WaMeta).waba_id;
    if (!wabaId) throw new Error("Conta do WhatsApp Business não encontrada.");

    type Tpl = {
      id: string; name: string; status: string; category?: string; language?: string;
      rejected_reason?: string;
      components?: Array<{ type: string; text?: string; format?: string; buttons?: Array<{ type: string; text?: string; url?: string; phone_number?: string }> }>;
    };
    const res = await graph<{ data?: Tpl[] }>(`${wabaId}/message_templates`, token, {
      params: { fields: "id,name,status,category,language,components,rejected_reason", limit: "100" },
    });
    return { templates: res.data ?? [] };
  });

/** Cria um modelo e já manda pra análise da Meta. */
export const createWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underline."),
    language: z.string().min(2).max(10),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
    header: z.string().max(60).optional(),
    body: z.string().min(1).max(1024),
    footer: z.string().max(60).optional(),
    buttons: z.array(z.object({
      type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
      text: z.string().min(1).max(25),
      url: z.string().url().optional(),
      phone_number: z.string().optional(),
    })).max(3).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const wabaId = ((integ?.metadata ?? {}) as WaMeta).waba_id;
    if (!wabaId) throw new Error("Conta do WhatsApp Business não encontrada.");

    const components: Array<Record<string, unknown>> = [];
    if (data.header) components.push({ type: "HEADER", format: "TEXT", text: data.header });
    components.push({ type: "BODY", text: data.body });
    if (data.footer) components.push({ type: "FOOTER", text: data.footer });
    if (data.buttons?.length) {
      components.push({
        type: "BUTTONS",
        buttons: data.buttons.map((b) =>
          b.type === "URL" ? { type: "URL", text: b.text, url: b.url }
          : b.type === "PHONE_NUMBER" ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number }
          : { type: "QUICK_REPLY", text: b.text },
        ),
      });
    }

    const res = await graph<{ id?: string; status?: string; category?: string }>(
      `${wabaId}/message_templates`, token,
      { method: "POST", body: { name: data.name, language: data.language, category: data.category, components } },
    );
    return { ok: true, id: res.id ?? null, status: res.status ?? "PENDING" };
  });

export const deleteWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const wabaId = ((integ?.metadata ?? {}) as WaMeta).waba_id;
    if (!wabaId) throw new Error("Conta do WhatsApp Business não encontrada.");
    await graph(`${wabaId}/message_templates`, token, { method: "DELETE", params: { name: data.name } });
    return { ok: true };
  });

/** Envia um modelo aprovado (usado no teste e nos disparos da plataforma). */
export const sendWhatsappTemplateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    to: z.string().min(8),
    templateName: z.string().min(1),
    language: z.string().min(2).default("pt_BR"),
    bodyParams: z.array(z.string()).optional(),
    phoneNumberId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const meta = (integ?.metadata ?? {}) as WaMeta;
    const phoneId = data.phoneNumberId ?? meta.default_phone_number_id;
    if (!phoneId) throw new Error("Nenhum número do WhatsApp selecionado.");

    const components = data.bodyParams?.length
      ? [{ type: "body", parameters: data.bodyParams.map((t) => ({ type: "text", text: t })) }]
      : undefined;

    const res = await graph<{ messages?: Array<{ id?: string }> }>(`${phoneId}/messages`, token, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        to: data.to.replace(/\D/g, ""),
        type: "template",
        template: { name: data.templateName, language: { code: data.language }, ...(components ? { components } : {}) },
      },
    });
    return { ok: true, messageId: res.messages?.[0]?.id ?? null };
  });

/** Envia texto livre dentro da janela de 24h (respostas do Inbox). */
export const sendWhatsappCloudText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    to: z.string().min(8),
    text: z.string().min(1).max(4096),
    phoneNumberId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const token = await loadCreds(context.supabase as never, data.workspaceId);
    const { data: integ } = await context.supabase
      .from("integrations").select("metadata").eq("workspace_id", data.workspaceId)
      .eq("provider", PROVIDER).maybeSingle();
    const meta = (integ?.metadata ?? {}) as WaMeta;
    const phoneId = data.phoneNumberId ?? meta.default_phone_number_id;
    if (!phoneId) throw new Error("Nenhum número do WhatsApp selecionado.");

    const res = await graph<{ messages?: Array<{ id?: string }> }>(`${phoneId}/messages`, token, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        to: data.to.replace(/\D/g, ""),
        type: "text",
        text: { body: data.text },
      },
    });
    return { ok: true, messageId: res.messages?.[0]?.id ?? null };
  });

export const disconnectWhatsappCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integrations").delete()
      .eq("workspace_id", data.workspaceId).eq("provider", PROVIDER);
    return { ok: true };
  });
