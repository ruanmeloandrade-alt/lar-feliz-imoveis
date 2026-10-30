// Edge Function: cora-proxy
// Único lugar do projeto que fala com a API do Banco Cora.
// Roda em Deno, usa Deno.createHttpClient para anexar o certificado mTLS
// emitido pelo Cora. Chamado APENAS pelos server functions do MKTOn via
// service_role; nunca pelo browser.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORA_CLIENT_ID = Deno.env.get("CORA_ACTIVE_CLIENT_ID") || Deno.env.get("CORA_CLIENT_ID") || "";
const CORA_CERTIFICATE_RAW = Deno.env.get("CORA_ACTIVE_CERTIFICATE") || Deno.env.get("CORA_CERTIFICATE") || "";
const CORA_PRIVATE_KEY_RAW = Deno.env.get("CORA_ACTIVE_PRIVATE_KEY") || Deno.env.get("CORA_PRIVATE_KEY") || "";
function normalizeEnv(value: string) {
  const raw = value.trim().toLowerCase();
  return ["production", "prod", "live", "prd", "producao", "produção"].includes(raw) ? "production" : "stage";
}

const CORA_ENV = normalizeEnv(Deno.env.get("CORA_ACTIVE_ENV") || Deno.env.get("CORA_ENV") || "stage");

const TOKEN_URL =
  CORA_ENV === "production"
    ? "https://matls-clients.api.cora.com.br/token"
    : "https://matls-clients.api.stage.cora.com.br/token";

const API_BASE =
  CORA_ENV === "production"
    ? "https://matls-clients.api.cora.com.br"
    : "https://matls-clients.api.stage.cora.com.br";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("CORA_PROXY_INTERNAL_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let httpClient: Deno.HttpClient | null = null;

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function tryDecodeBase64(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.includes("-----BEGIN") || !/^[A-Za-z0-9+/=]+$/.test(compact)) return value;
  try {
    const decoded = atob(compact);
    return decoded.includes("-----BEGIN") ? decoded : value;
  } catch {
    return value;
  }
}

function reflowPem(value: string) {
  const withMarkers = value
    .replace(/-----BEGIN ([^-]+)-----\s*/g, "-----BEGIN $1-----\n")
    .replace(/\s*-----END ([^-]+)-----/g, "\n-----END $1-----")
    .trim();

  return withMarkers.replace(
    /-----BEGIN ([^-]+)-----\n([\s\S]*?)\n-----END \1-----/g,
    (_match, label: string, body: string) => {
      const compactBody = body.replace(/\s+/g, "");
      const lines = compactBody.match(/.{1,64}/g) ?? [];
      return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
    },
  );
}

function wrapBareBase64(value: string, kind: "certificate" | "private_key") {
  const compact = value.replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/=]+$/.test(compact)) return value;
  let label = kind === "certificate" ? "CERTIFICATE" : "PRIVATE KEY";
  if (kind === "private_key") {
    try {
      const bytes = Uint8Array.from(atob(compact), (char) => char.charCodeAt(0));
      const marker = [0x02, 0x01, 0x00, 0x02];
      let foundMarker = false;
      for (let i = 0; i <= Math.min(bytes.length - marker.length, 18); i++) {
        if (marker.every((byte, j) => bytes[i + j] === byte)) foundMarker = true;
      }
      const isPkcs1Rsa = bytes[0] === 0x30 && foundMarker;
      if (isPkcs1Rsa) label = "RSA PRIVATE KEY";
    } catch {
      // mantém PRIVATE KEY
    }
  }
  const lines = compact.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function normalizePem(raw: string, kind: "certificate" | "private_key") {
  const label = kind === "certificate" ? "certificado" : "chave privada";
  if (!raw.trim()) throw new Error(`${kind}_missing`);

  let value = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  value = tryDecodeBase64(value)
    .replace(/\\n/g, "\n").replace(/\r/g, "\n").trim();
  value = tryDecodeBase64(value)
    .replace(/\\n/g, "\n").replace(/\r/g, "\n").trim();

  if (!/-----BEGIN /.test(value)) {
    value = wrapBareBase64(value, kind);
  }

  value = reflowPem(value);

  const beginRe = kind === "certificate"
    ? /-----BEGIN CERTIFICATE-----/
    : /-----BEGIN (RSA |EC )?PRIVATE KEY-----/;
  const endRe = kind === "certificate"
    ? /-----END CERTIFICATE-----/
    : /-----END (RSA |EC )?PRIVATE KEY-----/;

  if (!beginRe.test(value) || !endRe.test(value)) {
    const preview = raw.trim().slice(0, 24).replace(/\s+/g, " ");
    const want = kind === "certificate" ? "CERTIFICATE" : "PRIVATE KEY";
    throw new Error(
      `${kind}_invalid_pem: ${label} precisa estar em PEM (-----BEGIN ${want}-----). Recebido começando com: "${preview}…". Cole o conteúdo de texto do arquivo .pem/.crt/.key do Cora (não envie .pfx/.p12 binário).`,
    );
  }

  return `${value}\n`;
}

function getClient(): Deno.HttpClient {
  if (httpClient) return httpClient;
  const cert = normalizePem(CORA_CERTIFICATE_RAW, "certificate");
  const key = normalizePem(CORA_PRIVATE_KEY_RAW, "private_key");
  // @ts-ignore - createHttpClient existe no Deno runtime das Edge Functions
  try {
    httpClient = Deno.createHttpClient({ cert, key });
  } catch (e: any) {
    throw new Error(`cora_mtls_client_failed: ${String(e?.message ?? e)}`);
  }
  return httpClient!;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CORA_CLIENT_ID,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    // @ts-ignore client é Deno-specific
    client: getClient(),
  });
  if (!res.ok) {
    const text = await res.text();
    const envHint = CORA_ENV === "production" ? "produção" : "stage";
    throw new Error(`cora_token_failed: ${res.status} no ambiente ${envHint}. Verifique se client_id, certificado e chave privada pertencem ao mesmo ambiente. ${text}`);
  }
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

async function coraRequest(method: string, path: string, payload?: any, idempotencyKey?: string) {
  const token = await getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    // @ts-ignore
    client: getClient(),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    return { ok: false, status: res.status, error: json ?? text };
  }
  return { ok: true, status: res.status, data: json };
}

// ---------- Operações de alto nível ----------

async function createPix(args: {
  amount_cents: number;
  description: string;
  payer_name?: string;
  payer_tax_id?: string;
  payer_email?: string;
  payer_phone?: string;
  external_id: string;
  idempotency_key?: string;
  expires_in_minutes?: number;
}) {
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const channels: any[] = [];
  if (args.payer_email) channels.push({ channel: "EMAIL", contact: args.payer_email, rules: ["NOTIFY_ON_DUE_DATE"] });
  if (args.payer_phone) channels.push({ channel: "SMS", contact: args.payer_phone.replace(/\D/g, ""), rules: ["NOTIFY_ON_DUE_DATE"] });

  const payload: any = {
    code: args.external_id.slice(0, 30),
    customer: {
      name: args.payer_name ?? "Cliente",
      email: args.payer_email,
      document: {
        identity: args.payer_tax_id,
        type: String(args.payer_tax_id ?? "").length > 11 ? "CNPJ" : "CPF",
      },
    },
    services: [{ name: "PIX", description: args.description, amount: args.amount_cents }],
    payment_terms: { due_date: dueDate },
    notification: { name: args.payer_name ?? "Cliente", channels },
    payment_forms: ["PIX"],
  };
  return coraRequest("POST", "/v2/invoices", payload, args.idempotency_key || crypto.randomUUID());
}

async function diagnose() {
  const cert = normalizePem(CORA_CERTIFICATE_RAW, "certificate");
  const key = normalizePem(CORA_PRIVATE_KEY_RAW, "private_key");
  const token = await getToken();
  return {
    ok: true,
    data: {
      env: CORA_ENV === "production" ? "production" : "stage",
      certificateLoaded: cert.includes("-----BEGIN CERTIFICATE-----"),
      privateKeyLoaded: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(key),
      tokenReady: Boolean(token),
    },
  };
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
  const payload = {
    code: args.external_id.slice(0, 30),
    customer: {
      name: args.payer_name,
      email: args.payer_email,
      document: {
        identity: args.payer_tax_id,
        type: args.payer_tax_id.length > 11 ? "CNPJ" : "CPF",
      },
    },
    services: [{ name: "BOLETO", description: args.description, amount: args.amount_cents }],
    payment_terms: { due_date: args.due_date },
    notification: { name: args.payer_name, channels: args.payer_email ? [{ channel: "EMAIL", contact: args.payer_email, rules: ["NOTIFY_ON_DUE_DATE"] }] : [] },
  };
  return coraRequest("POST", "/v2/invoices", payload, args.idempotency_key || crypto.randomUUID());
}

async function getInvoiceStatus(id: string) {
  return coraRequest("GET", `/v2/invoices/${encodeURIComponent(id)}`);
}

async function listInvoices(args: Record<string, any>) {
  const params = new URLSearchParams();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(args?.start ?? "");
  const end = String(args?.end ?? "");
  if (start && !datePattern.test(start)) return { ok: false, error: "invalid_start_date" };
  if (end && !datePattern.test(end)) return { ok: false, error: "invalid_end_date" };
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (args?.state) params.set("state", String(args.state));
  if (args?.search) params.set("search", String(args.search));
  const page = Math.max(1, Number(args?.page ?? 1) || 1);
  const perPage = Math.min(200, Math.max(1, Number(args?.perPage ?? 200) || 200));
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  return coraRequest("GET", `/v2/invoices/?${params.toString()}`);
}

async function cancelInvoice(id: string) {
  return coraRequest("DELETE", `/v2/invoices/${encodeURIComponent(id)}`);
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const allowedTokens = [INTERNAL_TOKEN, SERVICE_ROLE].filter(Boolean).map((token) => `Bearer ${token}`);
  if (!allowedTokens.includes(auth)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!CORA_CLIENT_ID || !CORA_CERTIFICATE_RAW || !CORA_PRIVATE_KEY_RAW) {
    return new Response(JSON.stringify({ ok: false, error: "cora_not_configured: informe client_id, certificado e chave privada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  void createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400, headers: corsHeaders }); }
  const op = String(body?.op ?? "");

  try {
    let result: any;
    switch (op) {
      case "create_pix": result = await createPix(body.args); break;
      case "create_boleto": result = await createBoleto(body.args); break;
      case "get_invoice_status": result = await getInvoiceStatus(body.args.id); break;
      case "list_invoices": result = await listInvoices(body.args ?? {}); break;
      case "cancel_invoice": result = await cancelInvoice(body.args.id); break;
      case "diagnose": result = await diagnose(); break;
      default:
        return new Response(JSON.stringify({ error: "unknown_op" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
