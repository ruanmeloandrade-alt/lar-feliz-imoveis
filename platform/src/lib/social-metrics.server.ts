// Coleta real de métricas orgânicas (Instagram/Facebook) dos posts publicados.
// Roda no servidor via cron — nunca depende do navegador aberto.
// Isolamento: sempre filtra por workspace_id do próprio post.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ensurePageToken } from "./social-publisher.server";

type Admin = SupabaseClient<Database>;

const GRAPH = "v21.0";

type Metrics = {
  likes: number; comments: number; shares: number; saves: number;
  reach: number; impressions: number; video_views: number;
  raw: Record<string, unknown>;
};

const empty = (): Metrics => ({
  likes: 0, comments: 0, shares: 0, saves: 0,
  reach: 0, impressions: 0, video_views: 0, raw: {},
});

let lastGraphError: string | null = null;

async function graph<T>(path: string, token: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  try {
    const r = await fetch(url.toString());
    const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!r.ok || j?.error) {
      lastGraphError = j?.error?.message ?? `Graph ${r.status}`;
      return null;
    }
    return j as T;
  } catch (err) {
    lastGraphError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

async function igMetrics(mediaId: string, token: string): Promise<Metrics> {
  const m = empty();
  lastGraphError = null;
  const base = await graph<{ like_count?: number; comments_count?: number; media_product_type?: string }>(
    mediaId, token, { fields: "like_count,comments_count,media_product_type" },
  );
  if (base) {
    m.likes = Number(base.like_count ?? 0);
    m.comments = Number(base.comments_count ?? 0);
    m.raw["media"] = base;
  }
  const ins = await graph<{ data?: Array<{ name: string; values?: Array<{ value?: number }> }> }>(
    `${mediaId}/insights`, token, { metric: "reach,saved,shares,views,total_interactions" },
  );
  for (const row of ins?.data ?? []) {
    const v = Number(row.values?.[0]?.value ?? 0);
    if (row.name === "reach") m.reach = v;
    else if (row.name === "saved") m.saves = v;
    else if (row.name === "shares") m.shares = v;
    else if (row.name === "views") { m.video_views = v; m.impressions = v; }
  }
  if (ins?.data) m.raw["insights"] = ins.data;
  if (!m.impressions) m.impressions = m.reach;
  if (!base && !ins) throw new Error(lastGraphError ?? "Meta não retornou métricas para esta mídia.");
  return m;
}

async function fbMetrics(postId: string, token: string): Promise<Metrics> {
  const m = empty();
  lastGraphError = null;
  const base = await graph<{
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  }>(postId, token, { fields: "likes.summary(true).limit(0),comments.summary(true).limit(0),shares" });
  if (base) {
    m.likes = Number(base.likes?.summary?.total_count ?? 0);
    m.comments = Number(base.comments?.summary?.total_count ?? 0);
    m.shares = Number(base.shares?.count ?? 0);
    m.raw["post"] = base;
  }
  const ins = await graph<{ data?: Array<{ name: string; values?: Array<{ value?: number }> }> }>(
    `${postId}/insights`, token,
    { metric: "post_impressions,post_impressions_unique,post_video_views" },
  );
  for (const row of ins?.data ?? []) {
    const v = Number(row.values?.[0]?.value ?? 0);
    if (row.name === "post_impressions") m.impressions = v;
    else if (row.name === "post_impressions_unique") m.reach = v;
    else if (row.name === "post_video_views") m.video_views = v;
  }
  if (ins?.data) m.raw["insights"] = ins.data;
  if (!m.reach) m.reach = m.impressions;
  if (!base && !ins) throw new Error(lastGraphError ?? "Meta não retornou métricas para este post.");
  return m;
}

/**
 * Sincroniza métricas dos posts publicados nos últimos `days` dias.
 * Retorna quantos canais foram atualizados e os erros por canal.
 */
export async function syncSocialMetrics(
  admin: Admin,
  opts: { days?: number; limit?: number; workspaceId?: string } = {},
): Promise<{ processed: number; updated: number; errors: Array<{ channelId: string; error: string }> }> {
  const encKey = process.env["INTEGRATION_ENCRYPTION_KEY"];
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");

  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  let q = admin.from("social_post_channels")
    .select("id,post_id,workspace_id,channel,platform_ref,published_at")
    .eq("status", "published")
    .not("platform_ref", "is", null)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.workspaceId) q = q.eq("workspace_id", opts.workspaceId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string; post_id: string; workspace_id: string;
    channel: string; platform_ref: string | null;
  }>;

  const errors: Array<{ channelId: string; error: string }> = [];
  const tokenCache = new Map<string, string | null>();
  let updated = 0;

  for (const ch of rows) {
    try {
      const isIg = ch.channel.startsWith("ig_");
      const isFb = ch.channel.startsWith("fb_");
      if (!isIg && !isFb) continue;

      // Resolve a página dona do token (workspace do próprio post).
      let pageId: string | null = null;
      if (isIg) {
        const { data: ig } = await admin.from("meta_instagram_accounts")
          .select("page_id").eq("workspace_id", ch.workspace_id).limit(1).maybeSingle();
        pageId = (ig as { page_id?: string } | null)?.page_id ?? null;
      } else {
        const { data: pg } = await admin.from("meta_pages")
          .select("page_id").eq("workspace_id", ch.workspace_id).limit(1).maybeSingle();
        pageId = (pg as { page_id?: string } | null)?.page_id ?? null;
      }
      if (!pageId) throw new Error("Página Meta não conectada neste workspace.");

      const cacheKey = `${ch.workspace_id}:${pageId}`;
      if (!tokenCache.has(cacheKey)) {
        tokenCache.set(cacheKey, await ensurePageToken(admin, ch.workspace_id, pageId, encKey));
      }
      const token = tokenCache.get(cacheKey);
      if (!token) throw new Error("Token da Meta ausente. Reconecte em Integrações.");

      const m = isIg
        ? await igMetrics(String(ch.platform_ref), token)
        : await fbMetrics(String(ch.platform_ref), token);

      const denom = m.reach || m.impressions || 0;
      const interactions = m.likes + m.comments + m.shares + m.saves;
      const engagement = denom > 0 ? Number(((interactions / denom) * 100).toFixed(2)) : null;

      const { error: upErr } = await admin.from("social_post_metrics").upsert({
        workspace_id: ch.workspace_id,
        post_id: ch.post_id,
        channel: ch.channel,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        saves: m.saves,
        reach: m.reach,
        impressions: m.impressions,
        video_views: m.video_views,
        engagement_rate: engagement,
        raw: m.raw as never,
        collected_at: new Date().toISOString(),
      } as never, { onConflict: "post_id,channel" });
      if (upErr) throw new Error(upErr.message);
      updated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.from("social_post_channels").update({ last_error: msg }).eq("id", ch.id);
      errors.push({ channelId: ch.id, error: msg });
    }
  }

  return { processed: rows.length, updated, errors };
}
