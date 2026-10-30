// Publisher Meta para Social Media. Server-only.
// Isolamento: sempre lê meta_pages / meta_instagram_accounts do MESMO workspace_id
// do post, nunca cruza dados entre workspaces.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

const GRAPH = "v21.0";

type ChannelRow = {
  id: string;
  post_id: string;
  workspace_id: string;
  channel: "fb_feed" | "fb_story" | "fb_reels" | "ig_feed" | "ig_story" | "ig_reels" | "tiktok" | "linkedin";
  status: string;
  target_ref: string | null;
};

type AssetRow = {
  id: string; post_id: string; storage_path: string; kind: string; position: number; aspect: string | null;
};

type PostRow = {
  id: string; workspace_id: string; copy: string | null; cta: string | null; hashtags: string[];
};

function buildCaption(p: PostRow): string {
  const parts: string[] = [];
  if (p.copy) parts.push(p.copy);
  if (p.cta) parts.push(p.cta);
  if (p.hashtags?.length) parts.push(p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
  return parts.join("\n\n").slice(0, 2200);
}

async function signAssetUrls(admin: Admin, assets: AssetRow[]): Promise<string[]> {
  const urls: string[] = [];
  for (const a of assets.sort((x, y) => x.position - y.position)) {
    const { data, error } = await admin.storage.from("social-media").createSignedUrl(a.storage_path, 60 * 60);
    if (error || !data?.signedUrl) throw new Error(`Falha ao assinar asset ${a.id}: ${error?.message ?? "sem URL"}`);
    urls.push(data.signedUrl);
  }
  return urls;
}

async function fbPublish(pageId: string, token: string, caption: string, imageUrl: string | null): Promise<string> {
  if (imageUrl) {
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/photos`);
    url.searchParams.set("url", imageUrl);
    url.searchParams.set("caption", caption);
    url.searchParams.set("access_token", token);
    const r = await fetch(url.toString(), { method: "POST" });
    const j = await r.json() as { id?: string; post_id?: string; error?: { message?: string } };
    if (!r.ok || j.error) throw new Error(`FB photos: ${j.error?.message ?? r.statusText}`);
    return String(j.post_id ?? j.id);
  }
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/feed`);
  url.searchParams.set("message", caption);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), { method: "POST" });
  const j = await r.json() as { id?: string; error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(`FB feed: ${j.error?.message ?? r.statusText}`);
  return String(j.id);
}

async function fbStoryPublish(pageId: string, token: string, imageUrl: string | null, videoUrl: string | null): Promise<string> {
  // Facebook Photo Stories: publica foto direto (photo_stories) ou video_stories.
  if (videoUrl) {
    // Video Stories (upload_phase=start/finish com file_url)
    const startUrl = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/video_stories`);
    startUrl.searchParams.set("upload_phase", "start");
    startUrl.searchParams.set("access_token", token);
    const rs = await fetch(startUrl.toString(), { method: "POST" });
    const js = await rs.json() as { video_id?: string; upload_url?: string; error?: { message?: string } };
    if (!rs.ok || !js.video_id) throw new Error(`FB story start: ${js.error?.message ?? rs.statusText}`);

    // Envia o vídeo por URL (hosted upload)
    const upUrl = js.upload_url ?? "";
    if (upUrl) {
      const up = await fetch(upUrl, { method: "POST", headers: { file_url: videoUrl, Authorization: `OAuth ${token}` } });
      if (!up.ok) throw new Error(`FB story upload: ${up.statusText}`);
    }

    const finishUrl = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/video_stories`);
    finishUrl.searchParams.set("upload_phase", "finish");
    finishUrl.searchParams.set("video_id", js.video_id);
    finishUrl.searchParams.set("access_token", token);
    const rf = await fetch(finishUrl.toString(), { method: "POST" });
    const jf = await rf.json() as { post_id?: string; success?: boolean; error?: { message?: string } };
    if (!rf.ok || jf.error) throw new Error(`FB story finish: ${jf.error?.message ?? rf.statusText}`);
    return String(jf.post_id ?? js.video_id);
  }
  if (!imageUrl) throw new Error("FB Story exige imagem ou vídeo.");
  // Photo Stories: passo 1 sobe a foto sem publicar; passo 2 promove a story.
  const photoUrl = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/photos`);
  photoUrl.searchParams.set("url", imageUrl);
  photoUrl.searchParams.set("published", "false");
  photoUrl.searchParams.set("access_token", token);
  const rp = await fetch(photoUrl.toString(), { method: "POST" });
  const jp = await rp.json() as { id?: string; error?: { message?: string } };
  if (!rp.ok || !jp.id) throw new Error(`FB story photo: ${jp.error?.message ?? rp.statusText}`);

  const storyUrl = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/photo_stories`);
  storyUrl.searchParams.set("photo_id", jp.id);
  storyUrl.searchParams.set("access_token", token);
  const rs = await fetch(storyUrl.toString(), { method: "POST" });
  const js = await rs.json() as { post_id?: string; success?: boolean; error?: { message?: string } };
  if (!rs.ok || js.error) throw new Error(`FB photo_stories: ${js.error?.message ?? rs.statusText}`);
  return String(js.post_id ?? jp.id);
}

async function fbReelsPublish(pageId: string, token: string, caption: string, videoUrl: string | null): Promise<string> {
  if (!videoUrl) throw new Error("FB Reels exige vídeo.");
  // Start
  const startUrl = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/video_reels`);
  startUrl.searchParams.set("upload_phase", "start");
  startUrl.searchParams.set("access_token", token);
  const rs = await fetch(startUrl.toString(), { method: "POST" });
  const js = await rs.json() as { video_id?: string; upload_url?: string; error?: { message?: string } };
  if (!rs.ok || !js.video_id) throw new Error(`FB reels start: ${js.error?.message ?? rs.statusText}`);

  // Upload via URL
  if (js.upload_url) {
    const up = await fetch(js.upload_url, { method: "POST", headers: { file_url: videoUrl, Authorization: `OAuth ${token}` } });
    if (!up.ok) throw new Error(`FB reels upload: ${up.statusText}`);
  }

  // Finish + publish
  const finishUrl = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/video_reels`);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_id", js.video_id);
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  finishUrl.searchParams.set("description", caption);
  finishUrl.searchParams.set("access_token", token);
  const rf = await fetch(finishUrl.toString(), { method: "POST" });
  const jf = await rf.json() as { post_id?: string; success?: boolean; error?: { message?: string } };
  if (!rf.ok || jf.error) throw new Error(`FB reels finish: ${jf.error?.message ?? rf.statusText}`);
  return String(jf.post_id ?? js.video_id);
}

async function igPublish(
  igUserId: string, token: string, caption: string, imageUrls: string[],
  kind: "ig_feed" | "ig_story" | "ig_reels", videoUrl: string | null,
): Promise<string> {
  if (kind === "ig_reels" && !videoUrl) throw new Error("Reels exige vídeo.");
  let creationId: string;

  if (kind === "ig_reels" && videoUrl) {
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${igUserId}/media`);
    url.searchParams.set("media_type", "REELS");
    url.searchParams.set("video_url", videoUrl);
    url.searchParams.set("caption", caption);
    url.searchParams.set("access_token", token);
    const r = await fetch(url.toString(), { method: "POST" });
    const j = await r.json() as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) throw new Error(`IG reels container: ${j.error?.message ?? r.statusText}`);
    creationId = j.id;
  } else if (kind === "ig_story") {
    if (!imageUrls[0]) throw new Error("Story exige imagem.");
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${igUserId}/media`);
    url.searchParams.set("media_type", "STORIES");
    url.searchParams.set("image_url", imageUrls[0]);
    url.searchParams.set("access_token", token);
    const r = await fetch(url.toString(), { method: "POST" });
    const j = await r.json() as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) throw new Error(`IG story container: ${j.error?.message ?? r.statusText}`);
    creationId = j.id;
  } else if (imageUrls.length > 1) {
    // Carrossel
    const childIds: string[] = [];
    for (const u of imageUrls.slice(0, 10)) {
      const url = new URL(`https://graph.facebook.com/${GRAPH}/${igUserId}/media`);
      url.searchParams.set("image_url", u);
      url.searchParams.set("is_carousel_item", "true");
      url.searchParams.set("access_token", token);
      const r = await fetch(url.toString(), { method: "POST" });
      const j = await r.json() as { id?: string; error?: { message?: string } };
      if (!r.ok || !j.id) throw new Error(`IG carousel child: ${j.error?.message ?? r.statusText}`);
      childIds.push(j.id);
    }
    const cUrl = new URL(`https://graph.facebook.com/${GRAPH}/${igUserId}/media`);
    cUrl.searchParams.set("media_type", "CAROUSEL");
    cUrl.searchParams.set("children", childIds.join(","));
    cUrl.searchParams.set("caption", caption);
    cUrl.searchParams.set("access_token", token);
    const r = await fetch(cUrl.toString(), { method: "POST" });
    const j = await r.json() as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) throw new Error(`IG carousel: ${j.error?.message ?? r.statusText}`);
    creationId = j.id;
  } else {
    if (!imageUrls[0]) throw new Error("Post IG exige imagem.");
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${igUserId}/media`);
    url.searchParams.set("image_url", imageUrls[0]);
    url.searchParams.set("caption", caption);
    url.searchParams.set("access_token", token);
    const r = await fetch(url.toString(), { method: "POST" });
    const j = await r.json() as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) throw new Error(`IG feed container: ${j.error?.message ?? r.statusText}`);
    creationId = j.id;
  }

  // publish
  const pUrl = new URL(`https://graph.facebook.com/${GRAPH}/${igUserId}/media_publish`);
  pUrl.searchParams.set("creation_id", creationId);
  pUrl.searchParams.set("access_token", token);
  const pr = await fetch(pUrl.toString(), { method: "POST" });
  const pj = await pr.json() as { id?: string; error?: { message?: string } };
  if (!pr.ok || !pj.id) throw new Error(`IG publish: ${pj.error?.message ?? pr.statusText}`);
  return String(pj.id);
}

export async function ensurePageToken(admin: Admin, workspaceId: string, pageId: string, encKey: string): Promise<string | null> {
  const { data: existing } = await admin.rpc("get_meta_page_token", {
    _workspace_id: workspaceId,
    _page_id: pageId,
    _key: encKey,
  });
  if (existing) return String(existing);
  // Self-heal: puxa o token da página usando o access_token do workspace `meta`.
  const { data: metaSec } = await (admin as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }).rpc("get_integration_secret_service", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  const userToken = (metaSec as { access_token?: string } | null)?.access_token;
  if (!userToken) return null;
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}`);
    url.searchParams.set("fields", "access_token,name");
    url.searchParams.set("access_token", userToken);
    const r = await fetch(url.toString());
    const j = await r.json() as { access_token?: string; name?: string; error?: { message?: string } };
    if (!r.ok || !j.access_token) return null;
    await admin.rpc("set_integration_secret_service", {
      _workspace_id: workspaceId,
      _provider: `meta_page_${pageId}`,
      _plaintext: { page_access_token: j.access_token },
      _key: encKey,
      _metadata: { page_id: pageId, page_name: j.name ?? null },
      _status: "connected",
    });
    return j.access_token;
  } catch { return null; }
}

export async function publishSocialPost(admin: Admin, postId: string): Promise<{
  ok: boolean; results: Array<{ channelId: string; ok: boolean; platformRef?: string; error?: string }>;
}> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");

  const { data: postRaw, error: pErr } = await admin
    .from("social_posts").select("id,workspace_id,copy,cta,hashtags").eq("id", postId).single();
  if (pErr || !postRaw) throw new Error(`Post ${postId} não encontrado: ${pErr?.message}`);
  const post = postRaw as PostRow;


  const [{ data: chRaw }, { data: asRaw }] = await Promise.all([
    admin.from("social_post_channels").select("id,post_id,workspace_id,channel,status,target_ref").eq("post_id", postId),
    admin.from("social_post_assets").select("id,post_id,storage_path,kind,position,aspect").eq("post_id", postId),
  ]);
  const channels = (chRaw ?? []) as ChannelRow[];
  const assets = (asRaw ?? []) as AssetRow[];
  // Divide assets por variante (feed vs story/reels) usando aspect como tag.
  const feedAssets = assets.filter((a) => (a.aspect ?? "").toLowerCase().startsWith("feed"));
  const storyAssets = assets.filter((a) => {
    const t = (a.aspect ?? "").toLowerCase();
    return t.startsWith("story") || t.startsWith("reel") || t.startsWith("vertical");
  });
  const caption = buildCaption(post);

  async function assetsFor(channel: ChannelRow["channel"]) {
    const isStory = channel.endsWith("_story") || channel.endsWith("_reels");
    let pool = isStory ? storyAssets : feedAssets;
    if (pool.length === 0) pool = assets; // fallback: usa tudo
    const imgs = pool.filter((a) => a.kind === "image");
    const vids = pool.filter((a) => a.kind === "video");
    const imageUrls = imgs.length ? await signAssetUrls(admin, imgs) : [];
    const videoUrl = vids.length ? (await signAssetUrls(admin, vids))[0] : null;
    return { imageUrls, videoUrl };
  }


  const results: Array<{ channelId: string; ok: boolean; platformRef?: string; error?: string }> = [];

  for (const ch of channels) {
    if (ch.status === "published") { results.push({ channelId: ch.id, ok: true }); continue; }

    try {
      // Isolamento reforçado: só busca no workspace_id do próprio post.
      if (ch.channel === "fb_feed" || ch.channel === "fb_story" || ch.channel === "fb_reels") {
        let pageId = ch.target_ref;
        if (!pageId) {
          const { data: pg } = await admin.from("meta_pages")
            .select("page_id").eq("workspace_id", post.workspace_id).limit(1).maybeSingle();
          pageId = (pg as { page_id?: string } | null)?.page_id ?? null;
        }
        if (!pageId) throw new Error("Nenhuma Página do Facebook conectada.");
        const token = await ensurePageToken(admin, post.workspace_id, pageId, encKey);
        if (!token) throw new Error("Token da Página ausente. Reconecte Meta em Integrações.");

        const { imageUrls, videoUrl } = await assetsFor(ch.channel);
        const ref = ch.channel === "fb_feed"
          ? await fbPublish(pageId, String(token), caption, imageUrls[0] ?? null)
          : ch.channel === "fb_story"
            ? await fbStoryPublish(pageId, String(token), imageUrls[0] ?? null, videoUrl)
            : await fbReelsPublish(pageId, String(token), caption, videoUrl);
        await admin.from("social_post_channels").update({
          status: "published", platform_ref: ref, published_at: new Date().toISOString(), last_error: null,
        }).eq("id", ch.id);
        results.push({ channelId: ch.id, ok: true, platformRef: ref });
      } else if (ch.channel === "ig_feed" || ch.channel === "ig_story" || ch.channel === "ig_reels") {
        let igId = ch.target_ref;
        let pageIdForToken: string | null = null;
        if (!igId) {
          const { data: ig } = await admin.from("meta_instagram_accounts")
            .select("instagram_id,page_id").eq("workspace_id", post.workspace_id).limit(1).maybeSingle();
          igId = (ig as { instagram_id?: string } | null)?.instagram_id ?? null;
          pageIdForToken = (ig as { page_id?: string } | null)?.page_id ?? null;
        } else {
          const { data: ig } = await admin.from("meta_instagram_accounts")
            .select("page_id").eq("workspace_id", post.workspace_id).eq("instagram_id", igId).maybeSingle();
          pageIdForToken = (ig as { page_id?: string } | null)?.page_id ?? null;
        }
        if (!igId || !pageIdForToken) throw new Error("Conta Instagram não conectada.");
        const token = await ensurePageToken(admin, post.workspace_id, pageIdForToken, encKey);
        if (!token) throw new Error("Token do IG ausente. Reconecte Meta em Integrações.");

        const { imageUrls, videoUrl } = await assetsFor(ch.channel);
        const ref = await igPublish(igId, String(token), caption, imageUrls, ch.channel, videoUrl);
        await admin.from("social_post_channels").update({
          status: "published", platform_ref: ref, published_at: new Date().toISOString(), last_error: null,
        }).eq("id", ch.id);
        results.push({ channelId: ch.id, ok: true, platformRef: ref });
      } else {
        throw new Error(`Canal ${ch.channel} ainda não suportado.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.from("social_post_channels").update({ status: "failed", last_error: msg }).eq("id", ch.id);
      results.push({ channelId: ch.id, ok: false, error: msg });
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.ok);
  const anyOk = results.some((r) => r.ok);
  await admin.from("social_posts").update({
    status: allOk ? "published" : (anyOk ? "published" : "failed"),
    published_at: allOk ? new Date().toISOString() : null,
    last_error: allOk ? null : results.filter((r) => !r.ok).map((r) => r.error).join(" | ").slice(0, 1000),
  }).eq("id", postId);

  return { ok: allOk, results };
}
