import { createServerFn } from "@tanstack/react-start";
import { renderSVG } from "uqr";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";
import { directWhatsappJidFromCanonicalDigits, normalizeInternationalPhone } from "@/lib/whatsapp-identity";

// ============================================================
// Evolution API (WhatsApp Web via Baileys, self-hosted)
// ============================================================
// Base URL e chave global vêm de secrets do sistema.
// Cada workspace cria N inst-ncias, cada inst-ncia guarda sua apikey
// própria (retornada pela Evolution ao criar) cifrada em token_encrypted.

function encKey(): string {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

function baseUrl(): string {
  const b = process.env.EVOLUTION_BASE_URL;
  if (!b) throw new Error("EVOLUTION_BASE_URL missing");
  return b.replace(/\/+$/, "");
}

function globalKey(): string {
  const k = process.env.EVOLUTION_GLOBAL_API_KEY;
  if (!k) throw new Error("EVOLUTION_GLOBAL_API_KEY missing");
  return k;
}

function publicBaseUrl(): string {
  return resolvePublicAppUrl();
}

function randomWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const EVOLUTION_EVENTS = [
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "SEND_MESSAGE",
  "CALL",
];

const QR_VPS_FIX_MESSAGE =
  "A Evolution na VPS respondeu sem QR Code (retorno count:0/sem code/base64). O app e o webhook estão recebendo chamadas; ajuste a configuração da VPS/container da Evolution (SERVER_URL, QRCODE_LIMIT, CONFIG_SESSION_PHONE_VERSION e cache/history) e recrie a inst-ncia.";

const PAIRING_VPS_FIX_MESSAGE =
  "O QR Code foi gerado, mas o WhatsApp recusou o pareamento. Isso costuma ser falha de handshake da Evolution/Baileys na VPS: revise cache/history e CONFIG_SESSION_PHONE_VERSION, reinicie o container e recrie a inst-ncia.";

function createPayload(instanceName: string, callbackUrl?: string) {
  return {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    Integration: "WHATSAPP-BAILEYS",
    ...(callbackUrl
      ? {
          webhookUrl: callbackUrl,
          webhookByEvents: false,
          webhookBase64: true,
          webhookEvents: EVOLUTION_EVENTS,
        }
      : {}),
  };
}

function webhookPayload(callbackUrl: string) {
  return {
    webhook: {
      enabled: true,
      url: callbackUrl,
      byEvents: false,
      base64: true,
      events: EVOLUTION_EVENTS,
    },
  };
}

async function evoFetch(
  path: string,
  init: { method?: string; apiKey?: string; body?: unknown } = {},
): Promise<{ status: number; ok: boolean; json: unknown }> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: init.apiKey ?? globalKey(),
  };
  const resp = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await resp.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: resp.status, ok: resp.ok, json };
}

function providerMessage(json: unknown, fallback: string): string {
  const j = json as {
    message?: string | string[];
    error?: string;
    response?: { message?: string | string[] };
    raw?: string;
  };
  const msg = j?.response?.message ?? j?.message ?? j?.error ?? j?.raw;
  if (Array.isArray(msg)) return msg.join(", ");
  return msg || fallback;
}

function looksLikeQrImage(value: string): boolean {
  const v = value.trim();
  return v.startsWith("data:image/") || v.startsWith("iVBOR") || v.startsWith("/9j/");
}

function looksLikeBase64ImageData(value: string): boolean {
  const v = value.trim();
  return v.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(v);
}

function renderQrDataUrl(payload: string): string {
  const svg = renderSVG(payload, { border: 1, ecc: "M" });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function findDeepString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const stack = [value as Record<string, unknown>];
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (typeof nested === "string" && nested.trim() && wanted.has(key.toLowerCase())) {
        return nested.trim();
      }
      if (nested && typeof nested === "object") stack.push(nested as Record<string, unknown>);
    }
  }
  return null;
}

function extractConnectionState(json: unknown): string | null {
  const state = findDeepString(json, ["state", "status", "connectionStatus"]);
  return state ? state.toLowerCase() : null;
}

function hasEmptyQrCount(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const record = json as Record<string, unknown>;
  if (Number(record.count) === 0) return true;
  const qrcode = record.qrcode;
  if (qrcode && typeof qrcode === "object" && Number((qrcode as Record<string, unknown>).count) === 0) return true;
  return false;
}

type QrPollResult = { qr: string | null; providerEmptyQr: boolean };

async function normalizeQrImage(json: unknown): Promise<string | null> {
  const directImage = findDeepString(json, ["base64", "image", "qrcodeBase64", "qrCodeBase64"]);
  if (directImage) {
    if (directImage.startsWith("data:image/")) return directImage;
    if (looksLikeQrImage(directImage) || looksLikeBase64ImageData(directImage)) return `data:image/png;base64,${directImage}`;
    return renderQrDataUrl(directImage);
  }

  const qrPayload = findDeepString(json, ["code", "qrcode", "qr", "pairingCode", "pairing_code"]);
  if (!qrPayload) return null;
  if (looksLikeQrImage(qrPayload)) {
    return qrPayload.startsWith("data:image/") ? qrPayload : `data:image/png;base64,${qrPayload}`;
  }
  return renderQrDataUrl(qrPayload);
}

type SbRpc = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type SbUpdate = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<unknown> };
  };
};

type EvoCreds = {
  workspace_id: string;
  instance_name: string;
  api_key: string;
  webhook_secret: string;
  status: string;
  phone_number: string | null;
};

type SbQrLookup = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => {
        maybeSingle: () => Promise<{
          data: {
            last_qr?: string | null;
            metadata?: { qr_generated_at?: string | null } | null;
            updated_at?: string | null;
          } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

const SAVED_QR_MAX_AGE_MS = 45_000;

function isSavedQrFresh(
  savedQr: {
    last_qr?: string | null;
    metadata?: { qr_generated_at?: string | null } | null;
    updated_at?: string | null;
  } | null,
  nowMs = Date.now(),
): boolean {
  if (!savedQr?.last_qr) return false;
  const timestamp = savedQr.metadata?.qr_generated_at ?? savedQr.updated_at ?? null;
  if (!timestamp) return false;
  const generatedAt = Date.parse(timestamp);
  if (!Number.isFinite(generatedAt)) return false;
  const age = nowMs - generatedAt;
  return age >= 0 && age <= SAVED_QR_MAX_AGE_MS;
}

async function loadCreds(supabase: SbRpc, sessionId: string): Promise<EvoCreds> {
  const { data, error } = await supabase.rpc("get_evolution_credentials", {
    _session_id: sessionId,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "rpc error");
  if (!data) throw new Error("Sessão Evolution não encontrada.");
  return data as unknown as EvoCreds;
}

// ---------- Criar inst-ncia + salvar credenciais ----------
const CreateSchema = z.object({
  workspaceId: z.string().uuid(),
  friendlyName: z.string().min(2).max(80),
});

export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;

    // Enforce plan-based number quota
    const { data: limitData, error: limErr } = await sb.rpc("whatsapp_number_limit", {
      _workspace_id: data.workspaceId,
    });
    if (limErr) throw new Error(limErr.message ?? "Falha ao ler limite do plano.");
    const { data: usedData, error: usedErr } = await sb.rpc("count_active_whatsapp_sessions", {
      _workspace_id: data.workspaceId,
    });
    if (usedErr) throw new Error(usedErr.message ?? "Falha ao contar sessões ativas.");
    const limit = Number(limitData ?? 0);
    const used = Number(usedData ?? 0);
    if (used >= limit) {
      throw new Error(
        `Limite do plano atingido: ${used}/${limit} números conectados. Faça upgrade de plano ou contrate Funcionários e WhatsApp Extras (R$ 33,00 por adicional, +1 usuário e +1 número).`,
      );
    }

    const slug = data.friendlyName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "wa";
    const instanceName = `ws_${data.workspaceId.slice(0, 8)}_${slug}_${Date.now().toString(36)}`;
    const webhookSecret = randomWebhookSecret();
    const callbackUrl = `${publicBaseUrl()}/api/public/evolution/webhook/${webhookSecret}`;

    // Cria já com webhook para não perder o primeiro evento de QR.
    const created = await evoFetch("/instance/create", {
      method: "POST",
      body: createPayload(instanceName, callbackUrl),
    });
    if (!created.ok) {
      const j = created.json as { message?: string; response?: { message?: string[] } };
      const msg = j?.response?.message?.join(", ") ?? j?.message ?? `HTTP ${created.status}`;
      throw new Error(`Evolution: ${msg}`);
    }
    const cj = created.json as {
      hash?: { apikey?: string } | string;
      instance?: { instanceName?: string; instanceId?: string };
    };
    const apiKey =
      typeof cj.hash === "string" ? cj.hash : cj.hash?.apikey ?? "";
    if (!apiKey) throw new Error("Evolution não retornou apikey da inst-ncia.");

    const initialQr = await normalizeQrImage(created.json);

    const { data: sessId, error } = await sb.rpc("set_evolution_credentials", {
      _workspace_id: data.workspaceId,
      _instance_name: instanceName,
      _api_key: apiKey,
      _webhook_secret: webhookSecret,
      _key: encKey(),
    });
    if (error) throw new Error(error.message ?? "rpc error");
    const sessionId = sessId as string;

    // Reforça o webhook por inst-ncia no formato do endpoint /webhook/set.
    const webhook = await evoFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: webhookPayload(callbackUrl),
    });

    if (!webhook.ok) {
      console.warn("Evolution webhook setup failed", webhook.status, webhook.json);
    }

    let finalQr = initialQr;
    let providerEmptyQr = false;
    if (!finalQr) {
      // Evolution 2.x often needs a follow-up /instance/connect (or restart) to emit the QR
      const poll = await triggerAndPollQr(context.supabase, sessionId, instanceName, apiKey);
      finalQr = poll.qr;
      providerEmptyQr = poll.providerEmptyQr;
    }

    if (finalQr) {
      await (context.supabase as unknown as SbUpdate)
        .from("whatsapp_web_sessions")
        .update({ status: "aguardando_qr", last_qr: finalQr, updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    } else {
      await (context.supabase as unknown as SbUpdate)
        .from("whatsapp_web_sessions")
        .update({
          status: "erro_qr",
          last_qr: null,
          metadata: {
            last_error: providerEmptyQr ? QR_VPS_FIX_MESSAGE : "Evolution não retornou QR após criação e polling.",
            checked_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
    }

    return { sessionId, instanceName, qr: finalQr };
  });

const SessionSchema = z.object({ sessionId: z.string().uuid() });

// ---------- Buscar QR Code ----------
async function readSavedQr(supabase: unknown, sessionId: string): Promise<string | null> {
  const { data: savedQr } = await (supabase as SbQrLookup)
    .from("whatsapp_web_sessions")
    .select("last_qr, metadata, updated_at")
    .eq("id", sessionId)
    .maybeSingle();
  return isSavedQrFresh(savedQr) ? savedQr?.last_qr ?? null : null;
}

async function triggerAndPollQr(
  supabase: unknown,
  sessionId: string,
  instanceName: string,
  apiKey?: string,
): Promise<QrPollResult> {
  const saved = await readSavedQr(supabase, sessionId);
  if (saved) return { qr: saved, providerEmptyQr: false };

  let providerEmptyQr = false;

  // 1) Try /instance/connect first, often returns QR inline
  const conn = await evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`, { apiKey });
  if (hasEmptyQrCount(conn.json)) providerEmptyQr = true;
  let qr = conn.ok ? await normalizeQrImage(conn.json) : null;
  if (qr) return { qr, providerEmptyQr };

  // 2) Instance may be stuck in 'close' state, restart to force Baileys to re-init
  await evoFetch(`/instance/restart/${encodeURIComponent(instanceName)}`, { method: "POST" });

  // 3) Poll DB (webhook writes QR) + /instance/connect for up to ~12s
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    qr = await readSavedQr(supabase, sessionId);
    if (qr) return { qr, providerEmptyQr };
    const retry = await evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`, { apiKey });
    if (hasEmptyQrCount(retry.json)) providerEmptyQr = true;
    if (retry.ok) {
      qr = await normalizeQrImage(retry.json);
      if (qr) return { qr, providerEmptyQr };
    }
  }
  return { qr: null, providerEmptyQr };
}

export const fetchEvolutionQrCode = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.supabase as unknown as SbRpc, data.sessionId);

    const state = await evoFetch(`/instance/connectionState/${encodeURIComponent(creds.instance_name)}`);
    if (extractConnectionState(state.json) === "open") {
      return { connected: true, qr: null as string | null };
    }

    const saved = await readSavedQr(context.supabase, data.sessionId);
    if (saved) return { connected: false, qr: saved };

    const poll = await triggerAndPollQr(context.supabase, data.sessionId, creds.instance_name, creds.api_key);
    const qr = poll.qr;
    if (!qr) {
      await (context.supabase as unknown as SbUpdate)
        .from("whatsapp_web_sessions")
        .update({
          status: "erro_qr",
          last_qr: null,
          metadata: {
            last_error: poll.providerEmptyQr ? QR_VPS_FIX_MESSAGE : "Evolution não retornou QR ao atualizar.",
            checked_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.sessionId);
      throw new Error(
        poll.providerEmptyQr
          ? QR_VPS_FIX_MESSAGE
          : "A Evolution não gerou o QR Code, a inst-ncia pode estar travada. Clique em \"Recriar inst-ncia\" para apagar e conectar de novo.",
      );
    }

    await (context.supabase as unknown as SbUpdate)
      .from("whatsapp_web_sessions")
      .update({ status: "aguardando_qr", last_qr: qr, updated_at: new Date().toISOString() })
      .eq("id", data.sessionId);

    return { connected: false, qr };
  });

// ---------- Recriar inst-ncia travada ----------
const RecreateSchema = z.object({ sessionId: z.string().uuid(), friendlyName: z.string().min(2).max(80) });
export const recreateEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RecreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);

    // Apaga a inst-ncia travada na Evolution
    await evoFetch(`/instance/logout/${encodeURIComponent(creds.instance_name)}`, { method: "DELETE" });
    await evoFetch(`/instance/delete/${encodeURIComponent(creds.instance_name)}`, { method: "DELETE" });

    // Marca a sessão antiga como removida
    await (context.supabase as unknown as SbUpdate)
      .from("whatsapp_web_sessions")
      .update({
        status: "desconectado",
        last_qr: null,
        last_disconnected_at: new Date().toISOString(),
        metadata: { deleted: true, deleted_at: new Date().toISOString(), reason: "recreate" },
      })
      .eq("id", data.sessionId);

    // Cria uma nova inst-ncia no lugar
    const slug = data.friendlyName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "wa";
    const instanceName = `ws_${creds.workspace_id.slice(0, 8)}_${slug}_${Date.now().toString(36)}`;
    const webhookSecret = randomWebhookSecret();
    const callbackUrl = `${publicBaseUrl()}/api/public/evolution/webhook/${webhookSecret}`;

    const created = await evoFetch("/instance/create", {
      method: "POST",
      body: createPayload(instanceName, callbackUrl),
    });
    if (!created.ok) {
      throw new Error(`Evolution: ${providerMessage(created.json, `HTTP ${created.status}`)}`);
    }
    const cj = created.json as { hash?: { apikey?: string } | string };
    const apiKey = typeof cj.hash === "string" ? cj.hash : cj.hash?.apikey ?? "";
    if (!apiKey) throw new Error("Evolution não retornou apikey da nova inst-ncia.");

    const initialQr = await normalizeQrImage(created.json);

    const { data: sessId, error } = await sb.rpc("set_evolution_credentials", {
      _workspace_id: creds.workspace_id,
      _instance_name: instanceName,
      _api_key: apiKey,
      _webhook_secret: webhookSecret,
      _key: encKey(),
    });
    if (error) throw new Error(error.message ?? "rpc error");
    const newSessionId = sessId as string;

    await evoFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: webhookPayload(callbackUrl),
    });

    let qr = initialQr;
    if (initialQr) {
      await (context.supabase as unknown as SbUpdate)
        .from("whatsapp_web_sessions")
        .update({ status: "aguardando_qr", last_qr: initialQr, updated_at: new Date().toISOString() })
        .eq("id", newSessionId);
    } else {
      const poll = await triggerAndPollQr(context.supabase, newSessionId, instanceName, apiKey);
      qr = poll.qr;
      if (qr) {
        await (context.supabase as unknown as SbUpdate)
          .from("whatsapp_web_sessions")
          .update({ status: "aguardando_qr", last_qr: qr, updated_at: new Date().toISOString() })
          .eq("id", newSessionId);
      } else {
        await (context.supabase as unknown as SbUpdate)
          .from("whatsapp_web_sessions")
          .update({
            status: "erro_qr",
            last_qr: null,
            metadata: {
              last_error: poll.providerEmptyQr ? QR_VPS_FIX_MESSAGE : "Evolution não retornou QR após recriação.",
              checked_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", newSessionId);
      }
    }

    return { sessionId: newSessionId, instanceName, qr };
  });

// ---------- Status atual + telefone ----------
export const fetchEvolutionStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);

    const state = await evoFetch(`/instance/connectionState/${encodeURIComponent(creds.instance_name)}`);
    const currentState = extractConnectionState(state.json);
    const connected = currentState === "open";

    let phone: string | null = null;
    if (connected) {
      const info = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(creds.instance_name)}`, {
        apiKey: globalKey(),
      });
      // v2.3.x retorna flat: [{ name, ownerJid, connectionStatus, ... }]
      // v1.x envelopa em { instance: { owner, wuid } }
      type EvoInst = { ownerJid?: string; owner?: string; wuid?: string; instance?: { ownerJid?: string; owner?: string; wuid?: string } };
      const arr = Array.isArray(info.json) ? (info.json as EvoInst[]) : [info.json as EvoInst];
      const first = arr[0] ?? {};
      const inst = first.instance ?? first;
      const jid = inst.ownerJid ?? inst.owner ?? inst.wuid ?? null;
      phone = jid ? jid.replace(/@.*/, "") : null;
    }

    const sbUpd = context.supabase as unknown as SbUpdate;
    const pairingFailed =
      currentState === "close" &&
      (creds.status === "aguardando_qr" || creds.status === "conectando" || creds.status === "falha_pareamento");
    const nextStatus = connected
      ? "conectado"
      : pairingFailed
        ? "falha_pareamento"
        : creds.status === "erro_qr"
          ? "erro_qr"
          : "aguardando_qr";
    await sbUpd
      .from("whatsapp_web_sessions")
      .update({
        status: nextStatus,
        phone_number: phone,
        last_connected_at: connected ? new Date().toISOString() : null,
        ...(pairingFailed
          ? {
              last_qr: null,
              last_disconnected_at: new Date().toISOString(),
              metadata: {
                last_error: PAIRING_VPS_FIX_MESSAGE,
                last_state: currentState,
                checked_at: new Date().toISOString(),
              },
            }
          : {}),
      })
      .eq("id", data.sessionId);

    return {
      connected,
      phone,
      webhookSecret: creds.webhook_secret,
      state: currentState ?? "unknown",
      pairingFailed,
      message: pairingFailed ? PAIRING_VPS_FIX_MESSAGE : null,
    };
  });

// ---------- Desconectar / apagar inst-ncia ----------
export const disconnectEvolution = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.supabase as unknown as SbRpc, data.sessionId);
    await evoFetch(`/instance/logout/${encodeURIComponent(creds.instance_name)}`, {
      method: "DELETE",
    });
    await evoFetch(`/instance/delete/${encodeURIComponent(creds.instance_name)}`, {
      method: "DELETE",
    });
    const sbUpd = context.supabase as unknown as SbUpdate;
    await sbUpd
      .from("whatsapp_web_sessions")
      .update({
        status: "desconectado",
        last_qr: null,
        last_disconnected_at: new Date().toISOString(),
        metadata: { deleted: true, deleted_at: new Date().toISOString() },
      })
      .eq("id", data.sessionId);
    return { ok: true };
  });

// ---------- Enviar texto ----------
const SendTextSchema = z.object({
  sessionId: z.string().uuid(),
  phone: z.string().min(6),
  message: z.string().min(1).max(4096),
});

export const sendEvolutionText = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SendTextSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);
    // Esta função é de baixo nível e recebe o número já completo. Dígitos sem
    // '+' são aceitos como internacionais confiáveis; nunca adicionamos +55.
    const normalized = normalizeInternationalPhone(data.phone, { allowTrustedBare: true });
    if (normalized.ok === false) {
      throw new Error(
        normalized.reason === "ambiguous"
          ? "Número internacional ambíguo."
          : "Número internacional inválido.",
      );
    }
    const remoteJid = directWhatsappJidFromCanonicalDigits(normalized.digits);
    if (!remoteJid) throw new Error("Número internacional inválido.");
    const resp = await evoFetch(`/message/sendText/${encodeURIComponent(creds.instance_name)}`, {
      method: "POST",
      apiKey: creds.api_key,
      body: { number: normalized.digits, text: data.message },
    });
    if (!resp.ok) {
      const j = resp.json as { message?: string };
      throw new Error(`Evolution ${resp.status}: ${j?.message ?? "falha ao enviar"}`);
    }
    const j = resp.json as { key?: { id?: string } };
    const messageId = j?.key?.id ?? `local-${Date.now()}`;

    type SbInsert = { from: (t: string) => { insert: (rows: Record<string, unknown>) => Promise<unknown> } };
    const sbIns = context.supabase as unknown as SbInsert;
    await sbIns.from("whatsapp_web_messages").insert({
      workspace_id: creds.workspace_id,
      session_id: data.sessionId,
      remote_jid: remoteJid,
      to_jid: remoteJid,
      message_id: messageId,
      from_me: true,
      message_type: "text",
      body: data.message,
      delivery_status: "sent",
      raw: JSON.parse(JSON.stringify(resp.json ?? {})),
      received_at: new Date().toISOString(),
    });
    return { ok: true, messageId };
  });

// ---------- Listar sessões Evolution do workspace ----------
export const listEvolutionSessions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
          .select("id, instance_id, phone_number, status, last_connected_at, webhook_secret, created_at, metadata")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "evolution")
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
      metadata?: { deleted?: boolean } | null;
    };
    const visible = ((rows as unknown as Row[]) ?? []).filter(
      (row) => row.metadata?.deleted !== true && row.status !== "desconectado",
    );
    return { sessions: visible as Row[] };
  });

// ---------- Quota de números do plano ----------
export const getWhatsappQuota = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const { data: lim, error: e1 } = await sb.rpc("whatsapp_number_limit", { _workspace_id: data.workspaceId });
    if (e1) throw new Error(e1.message ?? "quota rpc");
    const { data: used, error: e2 } = await sb.rpc("count_active_whatsapp_sessions", { _workspace_id: data.workspaceId });
    if (e2) throw new Error(e2.message ?? "quota rpc");
    return { limit: Number(lim ?? 0), used: Number(used ?? 0) };
  });
