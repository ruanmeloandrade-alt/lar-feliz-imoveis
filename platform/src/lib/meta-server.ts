// Helpers server-only para integração Meta (HMAC, signed_request, token refresh, tratamento de erro).
// Importar apenas de outros .server.ts ou dentro de handlers (server functions / server routes).

import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseAdminEnv } from "@/integrations/supabase/saude-slim-env";
import type { Database } from "@/integrations/supabase/types";

export const META_GRAPH = "v23.0";

// Códigos de erro OAuth Meta que indicam token inválido/expirado
export const META_AUTH_ERROR_CODES = new Set([190, 463, 467, 102, 104, 200]);

export class MetaAuthError extends Error {
  constructor(public code: number, public subcode: number | null, public fbtrace: string | null, message: string) {
    super(message);
    this.name = "MetaAuthError";
  }
}

type GraphError = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    type?: string;
  };
};

export function adminClient() {
  const { url, serviceRoleKey: key } = resolveServerSupabaseAdminEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

/** Verifica header X-Hub-Signature-256 vindo dos webhooks Meta contra META_APP_SECRET. */
export function verifyMetaHmac(rawBody: string, headerValue: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[meta hmac] META_APP_SECRET não configurado, rejeitando.");
    return false;
  }
  if (!headerValue || !headerValue.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Decodifica signed_request da Meta (deauthorize / data deletion). Formato: <sig>.<payload_b64url>. */
export function parseSignedRequest(signedRequest: string):
  | { user_id?: string; algorithm?: string; issued_at?: number; expires?: number; [k: string]: unknown }
  | null {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[meta signed_request] META_APP_SECRET não configurado.");
    return null;
  }
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;
  try {
    const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const expected = createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
    const payload = JSON.parse(
      Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    if (payload.algorithm && String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return payload;
  } catch {
    return null;
  }
}

/** fetch envelopando Graph API. Detecta OAuthException, marca integrations.status='needs_reconnect'. */
export async function metaFetch<T = unknown>(
  url: string,
  opts: { workspaceId?: string; init?: RequestInit } = {},
): Promise<T> {
  const r = await fetch(url, opts.init);
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // não-JSON
  }
  if (!r.ok || (json as GraphError)?.error) {
    const err = (json as GraphError)?.error;
    const code = err?.code ?? r.status;
    const message = err?.message ?? `HTTP ${r.status}: ${text.slice(0, 200)}`;
    if (META_AUTH_ERROR_CODES.has(code) && opts.workspaceId) {
      try {
        const admin = adminClient();
        await admin.rpc("mark_integration_needs_reconnect", {
          _workspace_id: opts.workspaceId,
          _provider: "meta",
          _error: `OAuthException ${code}: ${message}`.slice(0, 500),
        });
      } catch (e) {
        console.warn("[metaFetch] mark_needs_reconnect falhou:", e);
      }
      throw new MetaAuthError(code, err?.error_subcode ?? null, err?.fbtrace_id ?? null, message);
    }
    throw new Error(`Meta ${code}: ${message}`);
  }
  return (json ?? {}) as T;
}

/**
 * Renova long-lived token da Meta 7 dias antes do vencimento.
 * Usa fb_exchange_token que aceita long-lived token como input.
 * Retorna quantos foram processados.
 */
export async function refreshMetaTokens(): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
  errors: Array<{ workspaceId: string; error: string }>;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!appId || !appSecret || !encKey) {
    throw new Error("META_APP_ID/META_APP_SECRET/INTEGRATION_ENCRYPTION_KEY não configurados.");
  }
  const admin = adminClient();

  const cutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: integrations, error } = await admin
    .from("integrations")
    .select("workspace_id, expires_at, status")
    .eq("provider", "meta")
    .lte("expires_at", cutoff)
    .in("status", ["connected", "needs_reconnect"]);
  if (error) throw new Error(error.message);

  const errors: Array<{ workspaceId: string; error: string }> = [];
  let refreshed = 0;
  let failed = 0;

  for (const row of integrations ?? []) {
    const wsId = row.workspace_id as string;
    try {
      const { data: sec, error: secErr } = await admin.rpc("get_integration_secret_service", {
        _workspace_id: wsId,
        _provider: "meta",
        _key: encKey,
      });
      if (secErr) throw new Error(secErr.message);
      if (!sec) throw new Error("secret ausente");
      const currentToken = (sec as { access_token?: string; facebook_user_id?: string }).access_token;
      const fbUserId = (sec as { facebook_user_id?: string }).facebook_user_id ?? null;
      if (!currentToken) throw new Error("access_token ausente no secret");

      const url = new URL(`https://graph.facebook.com/${META_GRAPH}/oauth/access_token`);
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", appId);
      url.searchParams.set("client_secret", appSecret);
      url.searchParams.set("fb_exchange_token", currentToken);

      const j = await metaFetch<{ access_token: string; expires_in?: number }>(url.toString(), { workspaceId: wsId });
      const newExpires = new Date(Date.now() + (j.expires_in ?? 60 * 24 * 3600) * 1000);

      const { error: rErr } = await admin.rpc("refresh_meta_integration_token", {
        _workspace_id: wsId,
        _new_plaintext: JSON.parse(JSON.stringify({
          access_token: j.access_token,
          token_type: "bearer",
          facebook_user_id: fbUserId,
        })),
        _key: encKey,
        _expires_at: newExpires.toISOString(),
      });
      if (rErr) throw new Error(rErr.message);
      refreshed++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ workspaceId: wsId, error: msg });
      if (!(e instanceof MetaAuthError)) {
        // erros que não são auth-related também sinalizam
        try {
          await admin.rpc("mark_integration_needs_reconnect", {
            _workspace_id: wsId,
            _provider: "meta",
            _error: `refresh falhou: ${msg}`.slice(0, 500),
          });
        } catch { /* noop */ }
      }
    }
  }

  return { checked: integrations?.length ?? 0, refreshed, failed, errors };
}

/**
 * Persiste um evento bruto do webhook em webhook_events.
 * Idempotente por (provider, event_id). Nunca lança.
 */
export async function persistWebhookEvent(args: {
  provider: string;
  eventType: string;
  eventId?: string | null;
  workspaceId?: string | null;
  payload: unknown;
  signatureValid: boolean;
  processingError?: string | null;
  processedAt?: Date | null;
}): Promise<void> {
  try {
    const admin = adminClient();
    const eventId = args.eventId ?? `${args.provider}:${args.eventType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await admin.from("webhook_events").upsert(
      {
        provider: args.provider,
        event_id: eventId,
        event_type: args.eventType,
        workspace_id: args.workspaceId ?? null,
        payload: JSON.parse(JSON.stringify(args.payload)),
        signature_ok: args.signatureValid,
        processing_error: args.processingError ?? null,
        processed_at: args.processedAt ? args.processedAt.toISOString() : null,
        received_at: new Date().toISOString(),
      } as never,
      { onConflict: "provider,event_id" },
    );
  } catch (e) {
    console.error("[persistWebhookEvent] falha:", e);
  }
}
