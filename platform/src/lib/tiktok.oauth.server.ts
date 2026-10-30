const API = "https://business-api.tiktok.com/open_api/v1.3";
const AUTHORIZE = "https://ads.tiktok.com/marketing_api/auth";

export function tiktokAdsEnv() {
  const appId = process.env.TIKTOK_APP_ID;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "TikTok Ads OAuth não configurado: faltam TIKTOK_APP_ID e TIKTOK_APP_SECRET no servidor.",
    );
  }
  return { appId, appSecret };
}

export function tiktokAdsEnvReady() {
  return Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET);
}

function encKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

async function hmac(payload: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(signature).toString("base64url");
}

export async function buildTikTokAdsState(workspaceId: string) {
  const { appSecret } = tiktokAdsEnv();
  const payload = Buffer.from(JSON.stringify({ ws: workspaceId, t: Date.now() }), "utf8").toString(
    "base64url",
  );
  return `${payload}.${await hmac(payload, appSecret)}`;
}

export async function verifyTikTokAdsState(state: string): Promise<{ ws: string } | null> {
  const { appSecret } = tiktokAdsEnv();
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  if ((await hmac(payload, appSecret)) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ws?: string;
      t?: number;
    };
    if (!parsed.ws || !parsed.t || Date.now() - parsed.t > 15 * 60_000) return null;
    return { ws: parsed.ws };
  } catch {
    return null;
  }
}

export function buildTikTokAdsAuthUrl(args: { appId: string; redirectUri: string; state: string }) {
  const url = new URL(AUTHORIZE);
  url.searchParams.set("app_id", args.appId);
  url.searchParams.set("state", args.state);
  url.searchParams.set("redirect_uri", args.redirectUri);
  return url.toString();
}

export async function exchangeTikTokAdsCode(args: { authCode: string; redirectUri: string }) {
  const { appId, appSecret } = tiktokAdsEnv();
  const r = await fetch(`${API}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      auth_code: args.authCode,
      redirect_uri: args.redirectUri,
    }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`TikTok OAuth ${r.status}: ${txt.slice(0, 500)}`);
  const parsed = JSON.parse(txt) as {
    code?: number;
    message?: string;
    data?: { access_token?: string; advertiser_ids?: string[]; scope?: string[] };
  };
  if (parsed.code && parsed.code !== 0)
    throw new Error(parsed.message ?? `TikTok OAuth code ${parsed.code}`);
  if (!parsed.data?.access_token) throw new Error("TikTok não devolveu access_token.");
  return parsed.data;
}

export async function listAuthorizedTikTokAdvertisers(accessToken: string) {
  const url = new URL(`${API}/oauth2/advertiser/get/`);
  const r = await fetch(url.toString(), {
    headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`TikTok advertisers ${r.status}: ${txt.slice(0, 500)}`);
  const parsed = JSON.parse(txt) as {
    code?: number;
    message?: string;
    data?: { list?: Array<{ advertiser_id?: string; advertiser_name?: string; name?: string }> };
  };
  if (parsed.code && parsed.code !== 0)
    throw new Error(parsed.message ?? `TikTok advertisers code ${parsed.code}`);
  return (parsed.data?.list ?? [])
    .map((a) => ({
      id: a.advertiser_id ?? "",
      name: a.advertiser_name ?? a.name ?? a.advertiser_id ?? "Advertiser",
    }))
    .filter((a) => a.id);
}

export { encKey as tiktokIntegrationEncryptionKey };
