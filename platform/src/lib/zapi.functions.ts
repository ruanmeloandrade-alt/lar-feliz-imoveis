import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Z-API (WhatsApp não-oficial), gerenciamento de inst-ncia
// ============================================================
// Cada workspace conecta uma ou mais inst-ncias Z-API. As credenciais
// (token e client-token) ficam cifradas via pgp_sym_encrypt. O webhook_secret
// é gerado no banco e vai na URL de callback que o cliente cola na Z-API.

function encKey(): string {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

const ZAPI_BASE = "https://api.z-api.io/instances";

function zapiUrl(instanceId: string, token: string, path: string): string {
  return `${ZAPI_BASE}/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}${path}`;
}

function zapiHeaders(clientToken?: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) h["Client-Token"] = clientToken;
  return h;
}

type SbRpc = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type ZapiCreds = {
  workspace_id: string;
  instance_id: string;
  token: string;
  client_token: string | null;
  webhook_secret: string;
  status: string;
  phone_number: string | null;
};

async function loadCreds(supabase: SbRpc, sessionId: string): Promise<ZapiCreds> {
  const { data, error } = await supabase.rpc("get_zapi_credentials", {
    _session_id: sessionId,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "rpc error");
  if (!data) throw new Error("Sessão Z-API não encontrada.");
  return data as unknown as ZapiCreds;
}

// ---------- Salvar credenciais ----------
const SaveSchema = z.object({
  workspaceId: z.string().uuid(),
  instanceId: z.string().min(4).max(200),
  token: z.string().min(10),
  clientToken: z.string().optional().nullable(),
});

export const saveZapiCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const instanceId = data.instanceId.trim();
    const token = data.token.trim();
    const clientToken = data.clientToken?.trim() || null;

    // Testa credenciais antes de salvar: /status precisa responder 2xx
    const testUrl = zapiUrl(instanceId, token, "/status");
    let testResp: Response;
    try {
      testResp = await fetch(testUrl, { headers: zapiHeaders(clientToken) });
    } catch {
      throw new Error("Não consegui conectar em api.z-api.io. Verifique o ID da inst-ncia.");
    }
    if (testResp.status === 401 || testResp.status === 403) {
      throw new Error("Token ou Client-Token inválido para essa inst-ncia.");
    }
    if (!testResp.ok) {
      const t = await testResp.text().catch(() => "");
      throw new Error(`Z-API respondeu ${testResp.status}: ${t.slice(0, 160)}`);
    }

    const { data: sessId, error } = await sb.rpc("set_zapi_credentials", {
      _workspace_id: data.workspaceId,
      _instance_id: instanceId,
      _token: token,
      _client_token: clientToken,
      _key: encKey(),
    });
    if (error) throw new Error(error.message ?? "rpc error");
    return { sessionId: sessId as string };
  });

// ---------- Buscar QR Code ----------
const SessionSchema = z.object({ sessionId: z.string().uuid() });

export const fetchZapiQrCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.supabase as unknown as SbRpc, data.sessionId);
    // Se já está conectada, não pede QR
    const statusResp = await fetch(zapiUrl(creds.instance_id, creds.token, "/status"), {
      headers: zapiHeaders(creds.client_token),
    });
    const statusJson = (await statusResp.json().catch(() => ({}))) as {
      connected?: boolean;
      smartphoneConnected?: boolean;
    };
    if (statusJson.connected) {
      return { connected: true, qr: null as string | null };
    }

    const qrResp = await fetch(zapiUrl(creds.instance_id, creds.token, "/qr-code/image"), {
      headers: zapiHeaders(creds.client_token),
    });
    if (!qrResp.ok) {
      throw new Error(`Falha ao obter QR (${qrResp.status}).`);
    }
    const qrJson = (await qrResp.json().catch(() => ({}))) as { value?: string };
    return { connected: false, qr: qrJson.value ?? null };
  });

// ---------- Status atual + phone ----------
export const fetchZapiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);

    const resp = await fetch(zapiUrl(creds.instance_id, creds.token, "/status"), {
      headers: zapiHeaders(creds.client_token),
    });
    const json = (await resp.json().catch(() => ({}))) as {
      connected?: boolean;
      smartphoneConnected?: boolean;
    };

    let phone: string | null = null;
    if (json.connected) {
      const devResp = await fetch(zapiUrl(creds.instance_id, creds.token, "/device"), {
        headers: zapiHeaders(creds.client_token),
      });
      const devJson = (await devResp.json().catch(() => ({}))) as { phone?: string };
      phone = devJson.phone ?? null;
    }

    // Atualiza a sessão via server function (rpc simples via supabase client autenticado)
    type SbUpdate = {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<unknown> };
      };
    };
    const sbUpd = context.supabase as unknown as SbUpdate;
    const newStatus = json.connected ? "conectado" : json.smartphoneConnected === false ? "desconectado" : "aguardando_qr";
    await sbUpd
      .from("whatsapp_web_sessions")
      .update({
        status: newStatus,
        phone_number: phone,
        last_connected_at: json.connected ? new Date().toISOString() : null,
      })
      .eq("id", data.sessionId);

    return { connected: !!json.connected, phone, webhookSecret: creds.webhook_secret };
  });

// ---------- Registrar webhook (a URL pública do MKTOn) ----------
const WebhookSchema = z.object({
  sessionId: z.string().uuid(),
  callbackUrl: z.string().url(),
});

export const registerZapiWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WebhookSchema.parse(d))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.supabase as unknown as SbRpc, data.sessionId);
    // Endpoints Z-API para registrar callback de mensagem recebida e status
    const endpoints = [
      "/update-webhook-received",
      "/update-webhook-delivery",
      "/update-webhook-connected",
      "/update-webhook-disconnected",
    ];
    const results: Array<{ endpoint: string; ok: boolean; status: number }> = [];
    for (const ep of endpoints) {
      const r = await fetch(zapiUrl(creds.instance_id, creds.token, ep), {
        method: "PUT",
        headers: zapiHeaders(creds.client_token),
        body: JSON.stringify({ value: data.callbackUrl }),
      });
      results.push({ endpoint: ep, ok: r.ok, status: r.status });
    }
    return { ok: results.every((r) => r.ok), results };
  });

// ---------- Desconectar ----------
export const disconnectZapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.supabase as unknown as SbRpc, data.sessionId);
    await fetch(zapiUrl(creds.instance_id, creds.token, "/disconnect"), {
      method: "GET",
      headers: zapiHeaders(creds.client_token),
    });
    type SbUpdate = {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<unknown> };
      };
    };
    const sbUpd = context.supabase as unknown as SbUpdate;
    await sbUpd
      .from("whatsapp_web_sessions")
      .update({ status: "desconectado", last_disconnected_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return { ok: true };
  });

// ---------- Enviar mensagem de texto ----------
const SendTextSchema = z.object({
  sessionId: z.string().uuid(),
  phone: z.string().min(6),
  message: z.string().min(1).max(4096),
});

export const sendZapiText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendTextSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);
    const phone = data.phone.replace(/\D/g, "");
    const resp = await fetch(zapiUrl(creds.instance_id, creds.token, "/send-text"), {
      method: "POST",
      headers: zapiHeaders(creds.client_token),
      body: JSON.stringify({ phone, message: data.message }),
    });
    const json = (await resp.json().catch(() => ({}))) as { messageId?: string; id?: string; error?: string };
    if (!resp.ok) {
      throw new Error(`Z-API ${resp.status}: ${json.error ?? "falha ao enviar"}`);
    }
    const messageId = json.messageId ?? json.id ?? `local-${Date.now()}`;

    // Loga na tabela de mensagens
    type SbInsert = {
      from: (t: string) => { insert: (rows: Record<string, unknown>) => Promise<unknown> };
    };
    const sbIns = context.supabase as unknown as SbInsert;
    await sbIns.from("whatsapp_web_messages").insert({
      workspace_id: creds.workspace_id,
      session_id: data.sessionId,
      remote_jid: `${phone}@c.us`,
      to_jid: `${phone}@c.us`,
      message_id: messageId,
      from_me: true,
      message_type: "text",
      body: data.message,
      delivery_status: "sent",
      raw: JSON.parse(JSON.stringify(json)),
      received_at: new Date().toISOString(),
    });
    return { ok: true, messageId };
  });

// ---------- Listar sessões do workspace ----------
export const listZapiSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    type SbSel = {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: unknown,
          ) => { eq: (k: string, v: unknown) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> } };
        };
      };
    };
    const sb = context.supabase as unknown as SbSel;
    const { data: rows, error } = await sb
      .from("whatsapp_web_sessions")
      .select("id, instance_id, phone_number, status, last_connected_at, webhook_secret, created_at")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "zapi")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Falha ao listar sessões.");
    type Row = {
      id: string;
      instance_id: string | null;
      phone_number: string | null;
      status: string;
      last_connected_at: string | null;
      webhook_secret: string | null;
      created_at: string;
    };
    return { sessions: ((rows as unknown as Row[]) ?? []) as Row[] };
  });
