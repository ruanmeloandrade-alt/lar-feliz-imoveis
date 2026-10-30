// Helper server-only para falar com a API do Banco Cora por Integração Direta.
// Usado apenas dentro de server functions/rotas server. Nunca importar no browser.

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

const CORA_OPS = ["create_pix", "create_boleto", "get_invoice_status", "list_invoices", "cancel_invoice", "diagnose", "ensure_webhook"] as const;
export type CoraOp = (typeof CORA_OPS)[number];

type CoraResult<T = unknown> = { ok: boolean; status?: number; data?: T; error?: unknown };

type JsonRecord = Record<string, unknown>;
type CoraProxyResponse<T = unknown> = { ok?: boolean; status?: number; data?: T; error?: unknown };

let cachedToken: { token: string; expiresAt: number; env: "production" | "stage" } | null = null;
let requestAgent: HttpsAgent | null = null;

function normalizeEnv(value?: string | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["production", "prod", "live", "prd", "producao", "produção"].includes(raw)) return "production";
  return "stage";
}

function getCoraEnvValue(name: "CLIENT_ID" | "CERTIFICATE" | "PRIVATE_KEY" | "ENV") {
  return process.env[`CORA_ACTIVE_${name}`] || process.env[`CORA_${name}`];
}

function getCoraBase(envOverride?: "production" | "stage") {
  const env = envOverride ?? normalizeEnv(getCoraEnvValue("ENV"));
  return {
    env,
    tokenUrl: env === "production" ? "https://matls-clients.api.cora.com.br/token" : "https://matls-clients.api.stage.cora.com.br/token",
    apiBase: env === "production" ? "https://matls-clients.api.cora.com.br" : "https://matls-clients.api.stage.cora.com.br",
  };
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function tryDecodeBase64Text(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.includes("-----BEGIN") || !/^[A-Za-z0-9+/=]+$/.test(compact)) return value;
  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : value;
  } catch {
    return value;
  }
}

function isPkcs1RsaPrivateKeyDer(compactBase64: string) {
  try {
    const der = Buffer.from(compactBase64 + "=".repeat((4 - (compactBase64.length % 4)) % 4), "base64");
    return der[0] === 0x30 && der.subarray(4, 16).includes(0x02) && der.indexOf(Buffer.from([0x02, 0x01, 0x00, 0x02]), 0) > -1;
  } catch {
    return false;
  }
}

function wrapBareBase64(value: string, kind: "certificate" | "private_key") {
  const compact = value.replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/=]+$/.test(compact)) return value;
  const label = kind === "certificate" ? "CERTIFICATE" : isPkcs1RsaPrivateKeyDer(compact) ? "RSA PRIVATE KEY" : "PRIVATE KEY";
  const lines = compact.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function reflowPem(value: string) {
  const withMarkers = value
    .replace(/-----BEGIN ([^-]+)-----\s*/g, "-----BEGIN $1-----\n")
    .replace(/\s*-----END ([^-]+)-----/g, "\n-----END $1-----")
    .trim();

  return withMarkers.replace(/-----BEGIN ([^-]+)-----\n([\s\S]*?)\n-----END \1-----/g, (_match, label: string, body: string) => {
    const compactBody = body.replace(/\s+/g, "");
    const lines = compactBody.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
  });
}

function normalizePem(raw: string | undefined, kind: "certificate" | "private_key") {
  const label = kind === "certificate" ? "certificado" : "chave privada";
  if (!raw?.trim()) throw new Error(`${kind}_missing`);

  let value = stripWrappingQuotes(raw)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  value = tryDecodeBase64Text(value).replace(/\\n/g, "\n").replace(/\r/g, "\n").trim();
  value = tryDecodeBase64Text(value).replace(/\\n/g, "\n").replace(/\r/g, "\n").trim();

  if (!/-----BEGIN /.test(value)) value = wrapBareBase64(value, kind);
  value = reflowPem(value);

  const beginRe = kind === "certificate" ? /-----BEGIN CERTIFICATE-----/ : /-----BEGIN (RSA |EC )?PRIVATE KEY-----/;
  const endRe = kind === "certificate" ? /-----END CERTIFICATE-----/ : /-----END (RSA |EC )?PRIVATE KEY-----/;

  if (!beginRe.test(value) || !endRe.test(value)) {
    const preview = raw.trim().slice(0, 24).replace(/\s+/g, " ");
    const want = kind === "certificate" ? "CERTIFICATE" : "PRIVATE KEY/RSA PRIVATE KEY";
    throw new Error(`${kind}_invalid_pem: ${label} precisa estar em PEM/base64 válido (-----BEGIN ${want}-----). Recebido começando com: "${preview}…".`);
  }

  return `${value}\n`;
}

function getHttpsAgent() {
  if (requestAgent) return requestAgent;
  requestAgent = new HttpsAgent({
    cert: normalizePem(getCoraEnvValue("CERTIFICATE"), "certificate"),
    key: normalizePem(getCoraEnvValue("PRIVATE_KEY"), "private_key"),
  });
  return requestAgent;
}

function bodyToString(body: RequestInit["body"]) {
  if (!body) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Buffer) return body.toString("utf8");
  return String(body);
}

async function requestWithMtls(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  const body = bodyToString(init.body);
  const headers = { ...(init.headers as Record<string, string> | undefined) };
  if (body && !headers["Content-Length"]) headers["Content-Length"] = Buffer.byteLength(body).toString();

  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: init.method ?? "GET", headers, agent: getHttpsAgent() }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, text: async () => raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function getCoraClientId() {
  const clientId = getCoraEnvValue("CLIENT_ID")?.trim();
  if (!clientId) throw new Error("cora_client_id_missing");
  return clientId;
}

async function requestTokenForEnv(env: "production" | "stage") {
  const { tokenUrl } = getCoraBase(env);
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: getCoraClientId() });
  const res = await requestWithMtls(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: JsonRecord = {};
  try {
    json = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken;

  const preferredEnv = normalizeEnv(getCoraEnvValue("ENV"));
  const envs: ("production" | "stage")[] = [preferredEnv, preferredEnv === "production" ? "stage" : "production"];
  const failures: string[] = [];

  for (const env of envs) {
    const { res, json } = await requestTokenForEnv(env);
    if (res.ok && typeof json.access_token === "string") {
      cachedToken = {
        token: json.access_token,
        env,
        expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
      };
      return cachedToken;
    }
    failures.push(`${env}:${res.status}:${JSON.stringify(json)}`);
    if (res.status !== 401 && json.error !== "invalid_client") break;
  }

  throw new Error(`cora_token_failed: não foi possível autenticar na Cora. Verifique client_id, certificado e chave privada. Tentativas: ${failures.join(" | ")}`);
}

async function coraRequest<T = unknown>(method: string, path: string, payload?: unknown, idempotencyKey?: string): Promise<CoraResult<T>> {
  try {
    const token = await getToken();
    const { apiBase } = getCoraBase(token.env);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const res = await requestWithMtls(`${apiBase}${path}`, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) return { ok: false, status: res.status, error: json };
    return { ok: true, status: res.status, data: json as T };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

async function callCoraProxy<T = unknown>(op: CoraOp, args: Record<string, unknown>): Promise<CoraResult<T> | null> {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const token = process.env.CORA_PROXY_INTERNAL_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !token || process.env.CORA_DIRECT_MTLS === "true") return null;

  try {
    const res = await fetch(`${baseUrl}/functions/v1/cora-proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ op, args }),
    });
    const text = await res.text();
    let json: CoraProxyResponse<T> | null = null;
    try {
      json = text ? (JSON.parse(text) as CoraProxyResponse<T>) : null;
    } catch {
      json = { error: text };
    }
    if (!res.ok) return { ok: false, status: res.status, error: json?.error ?? json ?? text };
    return { ok: Boolean(json?.ok), status: json?.status ?? res.status, data: json?.data as T, error: json?.error };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

function tomorrowDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function cleanText(value: string, max = 100) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

async function createPix(args: {
  amount_cents: number;
  description: string;
  payer_name?: string;
  payer_tax_id?: string;
  payer_email?: string;
  payer_phone?: string;
  external_id: string;
  idempotency_key?: string;
}) {
  const taxId = String(args.payer_tax_id ?? "").replace(/\D/g, "");
  const channels: JsonRecord[] = [];
  if (args.payer_email) channels.push({ channel: "EMAIL", contact: args.payer_email, rules: ["NOTIFY_ON_DUE_DATE", "NOTIFY_WHEN_PAID"] });

  const payload: JsonRecord = {
    code: args.external_id.slice(0, 30),
    customer: {
      name: cleanText(args.payer_name || "Cliente MKTOn", 60),
      ...(args.payer_email ? { email: args.payer_email } : {}),
      document: {
        identity: taxId,
        type: taxId.length > 11 ? "CNPJ" : "CPF",
      },
    },
    services: [{ name: "MKTOn", description: cleanText(args.description || "Assinatura MKTOn"), amount: args.amount_cents }],
    payment_terms: { due_date: tomorrowDate() },
    payment_forms: ["PIX"],
  };

  if (channels.length) payload.notification = { name: cleanText(args.payer_name || "Cliente MKTOn", 60), channels };

  return coraRequest("POST", "/v2/invoices", payload, args.idempotency_key || randomUUID());
}

async function createBoleto(args: {
  amount_cents: number;
  description: string;
  payer_name: string;
  payer_tax_id: string;
  payer_email?: string;
  due_date: string;
  external_id: string;
  idempotency_key?: string;
}) {
  const taxId = String(args.payer_tax_id ?? "").replace(/\D/g, "");
  const payload = {
    code: args.external_id.slice(0, 30),
    customer: {
      name: cleanText(args.payer_name, 60),
      ...(args.payer_email ? { email: args.payer_email } : {}),
      document: { identity: taxId, type: taxId.length > 11 ? "CNPJ" : "CPF" },
    },
    services: [{ name: "BOLETO", description: cleanText(args.description), amount: args.amount_cents }],
    payment_terms: { due_date: args.due_date },
    ...(args.payer_email ? { notification: { name: cleanText(args.payer_name, 60), channels: [{ channel: "EMAIL", contact: args.payer_email, rules: ["NOTIFY_ON_DUE_DATE"] }] } } : {}),
  };
  return coraRequest("POST", "/v2/invoices", payload, args.idempotency_key || randomUUID());
}

async function diagnose() {
  const token = await getToken();
  return {
    ok: true,
    data: {
      env: token.env,
      clientId: getCoraClientId(),
      certificateLoaded: normalizePem(getCoraEnvValue("CERTIFICATE"), "certificate").includes("-----BEGIN CERTIFICATE-----"),
      privateKeyLoaded: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(normalizePem(getCoraEnvValue("PRIVATE_KEY"), "private_key")),
      tokenReady: Boolean(token.token),
    },
  };
}

async function ensureWebhook(args: { url: string }) {
  const basePayload = { url: args.url, resource: "invoice", trigger: "paid" };
  return coraRequest("POST", "/endpoints", basePayload, randomUUID());
}

async function getInvoiceStatus(id: string) {
  return coraRequest("GET", `/v2/invoices/${encodeURIComponent(id)}`);
}

async function listInvoices(args: Record<string, unknown>) {
  const params = new URLSearchParams();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(args.start ?? "");
  const end = String(args.end ?? "");
  if (start && !datePattern.test(start)) return { ok: false, error: "invalid_start_date" };
  if (end && !datePattern.test(end)) return { ok: false, error: "invalid_end_date" };
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (args.state) params.set("state", String(args.state));
  if (args.search) params.set("search", String(args.search));
  const page = Math.max(1, Number(args.page ?? 1) || 1);
  const perPage = Math.min(200, Math.max(1, Number(args.perPage ?? 200) || 200));
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  return coraRequest("GET", `/v2/invoices/?${params.toString()}`);
}

async function cancelInvoice(id: string) {
  return coraRequest("DELETE", `/v2/invoices/${encodeURIComponent(id)}`);
}

export async function callCora<T = unknown>(op: CoraOp, args: Record<string, unknown> = {}): Promise<CoraResult<T>> {
  const proxied = await callCoraProxy<T>(op, args);
  if (proxied) return proxied;

  switch (op) {
    case "create_pix":
      return createPix(args as Parameters<typeof createPix>[0]) as Promise<CoraResult<T>>;
    case "create_boleto":
      return createBoleto(args as Parameters<typeof createBoleto>[0]) as Promise<CoraResult<T>>;
    case "get_invoice_status":
      return getInvoiceStatus(String(args.id ?? "")) as Promise<CoraResult<T>>;
    case "list_invoices":
      return listInvoices(args) as Promise<CoraResult<T>>;
    case "cancel_invoice":
      return cancelInvoice(String(args.id ?? "")) as Promise<CoraResult<T>>;
    case "diagnose":
      return diagnose() as Promise<CoraResult<T>>;
    case "ensure_webhook":
      return ensureWebhook({ url: String(args.url ?? "") }) as Promise<CoraResult<T>>;
    default:
      return { ok: false, error: "unknown_op" };
  }
}