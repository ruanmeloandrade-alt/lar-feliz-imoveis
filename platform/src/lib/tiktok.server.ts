// Central TikTok: helpers server-only para Business API + Marketing API + Events API.
// Documentação usada:
// - Business Account API v1.3 (perfil, vídeos, comentários)
// - Marketing API v1.3 (advertiser, campanhas, relatórios)
// - Events API 2.0 (pixel server-side)

export const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

export type SbRpc = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
export type AnySb = SbRpc & { from: (t: string) => any };

export function encKey() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

export async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

export interface TikTokSecret {
  access_token: string;
  business_id?: string;
  advertiser_id?: string;
  pixel_id?: string;
  pixel_access_token?: string;
}

export async function readTikTokSecret(sb: SbRpc, workspaceId: string): Promise<TikTokSecret> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "tiktok",
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais TikTok.");
  if (!data) throw new Error("TikTok não conectado neste workspace.");
  const s = data as TikTokSecret;
  if (!s.access_token) throw new Error("Access Token do TikTok ausente. Reconecte a integração.");
  return s;
}

export async function writeTikTokSecret(
  sb: SbRpc,
  args: {
    workspaceId: string;
    payload: TikTokSecret;
    metadata: Record<string, unknown>;
    status: string;
  },
) {
  const { error } = await sb.rpc("set_integration_secret", {
    _workspace_id: args.workspaceId,
    _provider: "tiktok",
    _plaintext: args.payload as unknown as Record<string, unknown>,
    _key: encKey(),
    _metadata: args.metadata,
    _status: args.status,
  });
  if (error) throw new Error(error.message ?? "Falha ao salvar credenciais TikTok.");
}

interface TikTokEnvelope<T> {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T;
}

/** Chamada padrão da API TikTok (envelope code/message/data). */
export async function tiktokFetch<T>(
  path: string,
  opts: {
    token: string;
    method?: "GET" | "POST";
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const url = new URL(`${TIKTOK_API}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      "Access-Token": opts.token,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await resp.text();
  let json: TikTokEnvelope<T>;
  try {
    json = JSON.parse(text) as TikTokEnvelope<T>;
  } catch {
    throw new Error(`TikTok respondeu algo inesperado (${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(
      `TikTok recusou a chamada (code ${json.code ?? resp.status}): ${json.message ?? text.slice(0, 200)}`,
    );
  }
  return (json.data ?? ({} as T)) as T;
}

export interface TikTokProfile {
  business_id?: string;
  username?: string;
  display_name?: string;
  profile_image?: string;
  followers_count?: number;
  likes_count?: number;
  video_count?: number;
}

export async function fetchTikTokProfile(token: string, businessId: string): Promise<TikTokProfile> {
  const data = await tiktokFetch<TikTokProfile>("/business/get/", {
    token,
    query: {
      business_id: businessId,
      fields: JSON.stringify([
        "username",
        "display_name",
        "profile_image",
        "followers_count",
        "likes_count",
        "video_count",
      ]),
    },
  });
  return { ...data, business_id: businessId };
}

export interface TikTokAdvertiser {
  advertiser_id?: string;
  advertiser_name?: string;
  currency?: string;
  status?: string;
  timezone?: string;
}

export async function fetchTikTokAdvertiser(token: string, advertiserId: string): Promise<TikTokAdvertiser> {
  const data = await tiktokFetch<{ list?: TikTokAdvertiser[] }>("/advertiser/info/", {
    token,
    query: {
      advertiser_ids: JSON.stringify([advertiserId]),
      fields: JSON.stringify(["advertiser_id", "advertiser_name", "currency", "status", "timezone"]),
    },
  });
  const row = data.list?.[0];
  if (!row) throw new Error("Advertiser ID não encontrado para este Access Token.");
  return row;
}

export interface TikTokVideo {
  item_id?: string;
  video_id?: string;
  caption?: string;
  thumbnail_url?: string;
  share_url?: string;
  create_time?: number;
  comment_count?: number;
  like_count?: number;
  view_count?: number;
  share_count?: number;
}

export async function fetchTikTokVideos(
  token: string,
  businessId: string,
  cursor?: number,
): Promise<{ videos: TikTokVideo[]; cursor?: number; hasMore?: boolean }> {
  const data = await tiktokFetch<{
    videos?: TikTokVideo[];
    cursor?: number;
    has_more?: boolean;
  }>("/business/video/list/", {
    token,
    query: {
      business_id: businessId,
      max_count: 20,
      cursor,
      fields: JSON.stringify([
        "item_id",
        "caption",
        "thumbnail_url",
        "share_url",
        "create_time",
        "comment_count",
        "like_count",
        "view_count",
        "share_count",
      ]),
    },
  });
  return { videos: data.videos ?? [], cursor: data.cursor, hasMore: data.has_more };
}

export interface TikTokComment {
  comment_id?: string;
  text?: string;
  username?: string;
  nickname?: string;
  create_time?: number;
  like_count?: number;
  reply_count?: number;
  status?: string;
  video_id?: string;
  parent_comment_id?: string;
  owner?: boolean;
}

export async function fetchTikTokComments(
  token: string,
  businessId: string,
  videoId: string,
  cursor?: number,
): Promise<{ comments: TikTokComment[]; cursor?: number; hasMore?: boolean }> {
  const data = await tiktokFetch<{
    comments?: TikTokComment[];
    cursor?: number;
    has_more?: boolean;
  }>("/business/comment/list/", {
    token,
    query: {
      business_id: businessId,
      video_id: videoId,
      max_count: 30,
      cursor,
      status: "PUBLIC",
      sort_field: "create_time",
      sort_order: "DESC",
    },
  });
  return { comments: data.comments ?? [], cursor: data.cursor, hasMore: data.has_more };
}

export async function replyTikTokCommentApi(
  token: string,
  args: { businessId: string; videoId: string; commentId: string; text: string },
) {
  return tiktokFetch<{ comment_id?: string }>("/business/comment/reply/create/", {
    token,
    method: "POST",
    body: {
      business_id: args.businessId,
      video_id: args.videoId,
      comment_id: args.commentId,
      text: args.text,
    },
  });
}

export async function hideTikTokCommentApi(
  token: string,
  args: { businessId: string; commentIds: string[]; hide: boolean },
) {
  return tiktokFetch<Record<string, unknown>>("/business/comment/hide/", {
    token,
    method: "POST",
    body: {
      business_id: args.businessId,
      comment_ids: args.commentIds,
      action: args.hide ? "HIDE" : "UNHIDE",
    },
  });
}

export async function likeTikTokCommentApi(
  token: string,
  args: { businessId: string; commentId: string; like: boolean },
) {
  return tiktokFetch<Record<string, unknown>>("/business/comment/like/", {
    token,
    method: "POST",
    body: {
      business_id: args.businessId,
      comment_id: args.commentId,
      action: args.like ? "LIKE" : "UNLIKE",
    },
  });
}

export interface TikTokCampaignRow {
  campaign_id?: string;
  campaign_name?: string;
  objective_type?: string;
  operation_status?: string;
  budget?: number;
  budget_mode?: string;
}

export async function fetchTikTokCampaigns(token: string, advertiserId: string): Promise<TikTokCampaignRow[]> {
  const data = await tiktokFetch<{ list?: TikTokCampaignRow[] }>("/campaign/get/", {
    token,
    query: { advertiser_id: advertiserId, page_size: 50 },
  });
  return data.list ?? [];
}

/** Events API 2.0 server-side (pixel TikTok). */
export async function sendTikTokPixelEventApi(args: {
  token: string;
  pixelId: string;
  eventName: string;
  eventId?: string;
  url?: string;
  testEventCode?: string;
  email?: string;
  phone?: string;
  value?: number;
  currency?: string;
}) {
  const enc = await Promise.all(
    [args.email?.trim().toLowerCase(), args.phone?.replace(/[^\d+]/g, "")].map(async (raw) => {
      if (!raw) return undefined;
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }),
  );
  return tiktokFetch<Record<string, unknown>>("/event/track/", {
    token: args.token,
    method: "POST",
    body: {
      event_source: "web",
      event_source_id: args.pixelId,
      ...(args.testEventCode ? { test_event_code: args.testEventCode } : {}),
      data: [
        {
          event: args.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: args.eventId ?? `mkton-${Date.now()}`,
          user: { email: enc[0], phone: enc[1] },
          page: args.url ? { url: args.url } : undefined,
          properties:
            args.value !== undefined
              ? { value: args.value, currency: args.currency ?? "BRL" }
              : undefined,
        },
      ],
    },
  });
}

export function maskToken(t: string) {
  if (t.length <= 8) return "****";
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}
