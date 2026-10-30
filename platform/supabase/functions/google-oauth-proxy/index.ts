// Edge Function: google-oauth-proxy
// Centraliza o uso de GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET nos Secrets da Lovable Cloud.
// O app nunca precisa receber o Client Secret.

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? Deno.env.get("APP_PUBLIC_URL") ?? "";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function oauthReady() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function allowedRedirectUri(raw: string) {
  try {
    const url = new URL(raw);
    const appUrl = new URL(PUBLIC_APP_URL);
    if (url.protocol !== "https:") return false;
    if (url.pathname !== "/api/public/oauth/google/callback") return false;
    return url.hostname === appUrl.hostname;
  } catch {
    return false;
  }
}

function buildAuthorizeUrl(args: {
  redirectUri: string;
  state: string;
  scopes: string[];
  forceConsent: boolean;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", args.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  if (args.forceConsent) url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", args.state);
  return url.toString();
}

function isInternal(req: Request) {
  if (!SERVICE_ROLE) return false;
  return req.headers.get("Authorization") === `Bearer ${SERVICE_ROLE}`;
}

async function exchangeCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    return json({ ok: false, error: `google_token_exchange_failed`, status: response.status, detail: text.slice(0, 500) }, 502);
  }
  return new Response(text, { status: 200, headers: JSON_HEADERS });
}

async function refreshToken(refreshToken: string) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    return json({ ok: false, error: `google_token_refresh_failed`, status: response.status, detail: text.slice(0, 500) }, 502);
  }
  return new Response(text, { status: 200, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Entrada pública do OAuth. Não expõe segredo; apenas redireciona para accounts.google.com.
  if (req.method === "GET" && url.searchParams.get("op") === "start") {
    if (!oauthReady()) return json({ ok: false, error: "google_oauth_not_configured" }, 503);

    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const forceConsent = url.searchParams.get("force_consent") === "1";
    const scopes = (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean);

    if (!allowedRedirectUri(redirectUri)) return json({ ok: false, error: "invalid_redirect_uri" }, 400);
    if (!state || scopes.length === 0) return json({ ok: false, error: "missing_oauth_parameters" }, 400);

    return Response.redirect(buildAuthorizeUrl({ redirectUri, state, scopes, forceConsent }), 302);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!isInternal(req)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!oauthReady()) return json({ ok: false, error: "google_oauth_not_configured" }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const op = String(body.op ?? "");
  if (op === "diagnose") return json({ ok: true, ready: true });

  if (op === "exchange") {
    const code = String(body.code ?? "");
    const redirectUri = String(body.redirectUri ?? "");
    if (!code || !allowedRedirectUri(redirectUri)) return json({ ok: false, error: "invalid_exchange_parameters" }, 400);
    return exchangeCode(code, redirectUri);
  }

  if (op === "refresh") {
    const refreshTokenValue = String(body.refreshToken ?? "");
    if (!refreshTokenValue) return json({ ok: false, error: "missing_refresh_token" }, 400);
    return refreshToken(refreshTokenValue);
  }

  return json({ ok: false, error: "unknown_op" }, 400);
});
