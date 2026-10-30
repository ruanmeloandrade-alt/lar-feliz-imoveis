import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";
import { z } from "zod";

const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_API_URL = "https://api.canva.com/rest/v1";
const CANVA_SCOPES = [
  "app:read", "app:write",
  "asset:read", "asset:write",
  "brandtemplate:content:read", "brandtemplate:content:write", "brandtemplate:meta:read",
  "comment:read", "comment:write",
  "design:content:read", "design:content:write", "design:meta:read",
  "design:permission:read", "design:permission:write",
  "folder:read", "folder:write", "folder:permission:read", "folder:permission:write",
  "profile:read",
].join(" ");

function canvaRedirectUri() {
  return `${resolvePublicAppUrl()}/api/public/oauth/canva/callback`;
}

type CanvaDesignSummary = {
  id: string;
  title?: string;
  thumbnail?: { url?: string };
  urls?: { edit_url?: string; view_url?: string };
};

type CanvaJob<T> = {
  job?: {
    id: string;
    status: "in_progress" | "success" | "failed";
    asset?: { id: string; type: "image" | "video"; thumbnail?: { url?: string } };
    result?: T;
    urls?: string[];
    error?: { code?: string; message?: string };
  };
};

type SocialPostForCanva = {
  id: string;
  workspace_id: string;
  title: string | null;
  briefing: string | null;
  copy: string | null;
  cta: string | null;
  hashtags: string[] | null;
  metadata: Record<string, unknown> | null;
  canva_design_id: string | null;
};

type SocialAssetForCanva = {
  id: string;
  storage_path: string;
  kind: string;
  aspect: string | null;
  position: number | null;
};

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(48));
  const verifier = b64url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  return { verifier, challenge, state };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function b64std(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}

async function canvaRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CANVA_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message : `Canva HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

async function getCanvaAccessToken(admin: any): Promise<string> {
  const { data: connection, error } = await admin
    .from("social_canva_connections")
    .select("id,access_token,refresh_token,expires_at")
    .is("workspace_id", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!connection?.access_token) throw new Error("Canva ainda não está conectado.");

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now() + 120_000) return connection.access_token as string;

  if (!connection.refresh_token) throw new Error("Token Canva expirado. Reconecte a conta global.");
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Credenciais Canva não configuradas.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token as string,
  });
  const res = await fetch(`${CANVA_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || typeof json.access_token !== "string") {
    console.error("[canva] refresh failed", res.status, json);
    throw new Error("Token Canva expirou. Reconecte a conta global.");
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  const nextRefresh = typeof json.refresh_token === "string" ? json.refresh_token : connection.refresh_token;
  const expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
  await admin
    .from("social_canva_connections")
    .update({
      access_token: json.access_token,
      refresh_token: nextRefresh,
      expires_at,
      scope: typeof json.scope === "string" ? json.scope : undefined,
    })
    .eq("id", connection.id);
  return json.access_token;
}

function dimensionsFrom(channel?: string | null, aspect?: string | null) {
  if (channel === "ig_story" || channel === "ig_reels" || channel === "tiktok" || aspect === "9:16") {
    return { width: 1080, height: 1920, aspect: "9:16" };
  }
  if (channel === "linkedin") return { width: 1200, height: 627, aspect: "1.91:1" };
  if (aspect === "4:5" || channel === "ig_feed") return { width: 1080, height: 1350, aspect: "4:5" };
  return { width: 1080, height: 1080, aspect: "1:1" };
}

function parseBriefing(post: SocialPostForCanva) {
  const raw = post.briefing ?? "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const briefing = (parsed.briefing ?? {}) as Record<string, unknown>;
    const visual = (parsed.visual ?? {}) as Record<string, unknown>;
    const strategy = (parsed.strategy ?? {}) as Record<string, unknown>;
    return {
      raw,
      hook: String(briefing.hook ?? strategy.angle ?? post.title ?? ""),
      body: String(briefing.body ?? post.copy ?? ""),
      caption: String(briefing.caption ?? post.copy ?? ""),
      cta: String(briefing.cta ?? post.cta ?? ""),
      visual: String(visual.creative_direction ?? visual.final_prompt ?? ""),
    };
  } catch {
    return {
      raw,
      hook: post.title ?? "",
      body: post.copy ?? raw,
      caption: post.copy ?? "",
      cta: post.cta ?? "",
      visual: raw,
    };
  }
}

function valueForDatasetKey(key: string, post: SocialPostForCanva) {
  const k = key.toLowerCase();
  const brief = parseBriefing(post);
  if (k.includes("title") || k.includes("titulo") || k.includes("headline") || k.includes("hook") || k.includes("chamada")) {
    return brief.hook || post.title || "Post MKTOn";
  }
  if (k.includes("cta") || k.includes("acao") || k.includes("action")) return brief.cta || post.cta || "Saiba mais";
  if (k.includes("hashtag")) return (post.hashtags ?? []).join(" ");
  if (k.includes("visual") || k.includes("brief") || k.includes("prompt") || k.includes("direcao")) return brief.visual || brief.raw;
  if (k.includes("caption") || k.includes("legenda") || k.includes("copy") || k.includes("body") || k.includes("texto")) {
    return brief.caption || brief.body || post.copy || "";
  }
  return brief.hook || brief.caption || post.title || "";
}

async function waitForJob<T>(token: string, path: string, label: string, attempts = 12): Promise<NonNullable<CanvaJob<T>["job"]>> {
  for (let i = 0; i < attempts; i++) {
    const result = await canvaRequest<CanvaJob<T>>(token, path);
    if (!result.job) throw new Error(`${label}: resposta inválida.`);
    if (result.job.status === "success") return result.job;
    if (result.job.status === "failed") throw new Error(result.job.error?.message || `${label} falhou.`);
    await sleep(900 + i * 250);
  }
  throw new Error(`${label} ainda está processando. Tente novamente em instantes.`);
}

async function uploadAssetToCanva(token: string, admin: any, asset: SocialAssetForCanva, name: string) {
  if (asset.kind !== "image") return null;
  const { data, error } = await admin.storage.from("social-media").createSignedUrl(asset.storage_path, 600);
  if (error || !data?.signedUrl) return null;
  const job = await canvaRequest<CanvaJob<{ asset?: { id: string } }>>(token, "/url-asset-uploads", {
    method: "POST",
    body: JSON.stringify({ name: name.slice(0, 255) || "Arte MKTOn", url: data.signedUrl }),
  });
  if (!job.job?.id) throw new Error("Canva não iniciou o upload da mídia.");
  const done = await waitForJob<{ asset?: { id: string } }>(token, `/url-asset-uploads/${job.job.id}`, "Upload da mídia no Canva");
  return done.asset?.id ?? null;
}

async function saveDesignOnPost(admin: any, post: SocialPostForCanva, design: CanvaDesignSummary, extra: Record<string, unknown>) {
  const metadata = { ...(post.metadata ?? {}) } as Record<string, unknown>;
  const previousCanva = (metadata.canva ?? {}) as Record<string, unknown>;
  metadata.canva = {
    ...previousCanva,
    ...extra,
    designId: design.id,
    editUrl: design.urls?.edit_url ?? previousCanva.editUrl ?? null,
    viewUrl: design.urls?.view_url ?? previousCanva.viewUrl ?? null,
    thumbnailUrl: design.thumbnail?.url ?? previousCanva.thumbnailUrl ?? null,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await admin
    .from("social_posts")
    .update({ canva_design_id: design.id, metadata })
    .eq("id", post.id)
    .eq("workspace_id", post.workspace_id);
  if (error) throw new Error(error.message);
}

const PostCanvaSchema = z.object({
  workspaceId: z.string().uuid(),
  postId: z.string().uuid(),
  templateId: z.string().trim().max(255).optional().nullable(),
});

async function loadPostBundle(context: { supabase: any }, workspaceId: string, postId: string) {
  const { data: post, error } = await context.supabase
    .from("social_posts")
    .select("id,workspace_id,title,briefing,copy,cta,hashtags,metadata,canva_design_id")
    .eq("id", postId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new Error("Post não encontrado neste workspace.");
  const [{ data: channels }, { data: assets }] = await Promise.all([
    context.supabase.from("social_post_channels").select("channel").eq("post_id", postId).eq("workspace_id", workspaceId),
    context.supabase.from("social_post_assets").select("id,storage_path,kind,aspect,position").eq("post_id", postId).eq("workspace_id", workspaceId).order("position"),
  ]);
  return {
    post: post as SocialPostForCanva,
    channel: ((channels ?? [])[0] as { channel?: string } | undefined)?.channel ?? null,
    assets: (assets ?? []) as SocialAssetForCanva[],
  };
}

/** Super-admin only. Returns the Canva authorize URL to open in a new tab. */
export const startCanvaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.CANVA_CLIENT_ID;
    if (!clientId) throw new Error("CANVA_CLIENT_ID not configured");

    // Only super_admin can initiate the global connection
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Forbidden: only super_admin can connect Canva globally");

    const { verifier, challenge, state } = await pkce();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("canva_oauth_states" as never)
      .insert({ state, code_verifier: verifier, initiated_by: context.userId } as never);

    const url = new URL(CANVA_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", canvaRedirectUri());
    url.searchParams.set("scope", CANVA_SCOPES);
    url.searchParams.set("code_challenge_method", "s256");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("state", state);

    return { authorizeUrl: url.toString() };
  });

export const getCanvaConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("social_canva_connections" as never)
      .select("id,canva_user_id,scope,created_at,expires_at")
      .is("workspace_id", null)
      .maybeSingle();
    return (data ?? null) as null | {
      id: string; canva_user_id: string | null; scope: string | null;
      created_at: string; expires_at: string | null;
    };
  });

export const disconnectCanva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "super_admin",
    });
    if (!isSuper) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("social_canva_connections" as never).delete().is("workspace_id", null);
    return { ok: true };
  });

export const listCanvaBrandTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().max(80).optional().default("") }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = await getCanvaAccessToken(supabaseAdmin as any);
    const params = new URLSearchParams({ limit: "100", dataset: "non_empty", sort_by: "modified_descending" });
    if (data.query.trim()) params.set("query", data.query.trim());
    const response = await canvaRequest<{ items?: Array<{ id: string; title?: string; view_url?: string; create_url?: string }> }>(
      token,
      `/brand-templates?${params.toString()}`,
    );
    return {
      templates: (response.items ?? []).map((t) => ({
        id: t.id,
        title: t.title ?? t.id,
        viewUrl: t.view_url ?? null,
        createUrl: t.create_url ?? null,
      })),
    };
  });

export const openOrCreateCanvaDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PostCanvaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { post, channel, assets } = await loadPostBundle(context, data.workspaceId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const token = await getCanvaAccessToken(admin);

    if (post.canva_design_id && !data.templateId) {
      try {
        const response = await canvaRequest<{ design: CanvaDesignSummary }>(token, `/designs/${post.canva_design_id}`);
        await saveDesignOnPost(admin, post, response.design, { mode: "existing" });
        return {
          designId: response.design.id,
          editUrl: response.design.urls?.edit_url ?? null,
          viewUrl: response.design.urls?.view_url ?? null,
          thumbnailUrl: response.design.thumbnail?.url ?? null,
          created: false,
        };
      } catch (error) {
        console.warn("[canva] could not refresh design link, creating a new design", error);
      }
    }

    const firstAsset = assets[0] ?? null;
    const assetId = firstAsset ? await uploadAssetToCanva(token, admin, firstAsset, post.title ?? "Arte MKTOn") : null;
    const title = (post.title || parseBriefing(post).hook || "Post MKTOn").slice(0, 255);

    if (data.templateId) {
      const datasetResponse = await canvaRequest<{ dataset?: Record<string, { type?: string }> }>(
        token,
        `/brand-templates/${encodeURIComponent(data.templateId)}/dataset`,
      );
      const dataset = datasetResponse.dataset ?? {};
      const autofillData: Record<string, { type: "text"; text: string } | { type: "image"; asset_id: string }> = {};
      for (const [key, field] of Object.entries(dataset)) {
        if (field?.type === "text") autofillData[key] = { type: "text", text: valueForDatasetKey(key, post).slice(0, 10_000) };
        if (field?.type === "image" && assetId) autofillData[key] = { type: "image", asset_id: assetId };
      }
      if (!Object.keys(autofillData).length) {
        throw new Error("Esse template Canva não tem campos compatíveis para autofill.");
      }

      const job = await canvaRequest<CanvaJob<{ type: "create_design"; design: CanvaDesignSummary }>>(token, "/autofills", {
        method: "POST",
        body: JSON.stringify({
          type: "create_from_brand_template",
          brand_template_id: data.templateId,
          title,
          data: autofillData,
        }),
      });
      if (!job.job?.id) throw new Error("Canva não iniciou o autofill.");
      const done = await waitForJob<{ type: "create_design"; design: CanvaDesignSummary }>(token, `/autofills/${job.job.id}`, "Autofill do Canva", 14);
      const design = done.result?.design;
      if (!design?.id) throw new Error("Autofill finalizou sem design retornado.");
      await saveDesignOnPost(admin, post, design, { mode: "autofill", templateId: data.templateId, autofillJobId: job.job.id });
      return {
        designId: design.id,
        editUrl: design.urls?.edit_url ?? null,
        viewUrl: design.urls?.view_url ?? null,
        thumbnailUrl: design.thumbnail?.url ?? null,
        created: true,
      };
    }

    const dims = dimensionsFrom(channel, firstAsset?.aspect ?? null);
    const response = await canvaRequest<{ design: CanvaDesignSummary }>(token, "/designs", {
      method: "POST",
      body: JSON.stringify({
        type: "type_and_asset",
        design_type: { type: "custom", width: dims.width, height: dims.height },
        ...(assetId ? { asset_id: assetId } : {}),
        title,
      }),
    });
    await saveDesignOnPost(admin, post, response.design, { mode: assetId ? "asset_design" : "blank_design", aspect: dims.aspect });
    return {
      designId: response.design.id,
      editUrl: response.design.urls?.edit_url ?? null,
      viewUrl: response.design.urls?.view_url ?? null,
      thumbnailUrl: response.design.thumbnail?.url ?? null,
      created: true,
    };
  });

export const importCanvaDesignToPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PostCanvaSchema.omit({ templateId: true }).extend({
    designId: z.string().trim().max(255).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { post, channel, assets } = await loadPostBundle(context, data.workspaceId, data.postId);
    const designId = data.designId || post.canva_design_id;
    if (!designId) throw new Error("Abra/crie o design no Canva antes de importar a arte final.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const token = await getCanvaAccessToken(admin);
    const dims = dimensionsFrom(channel, assets[0]?.aspect ?? null);

    const exportJob = await canvaRequest<CanvaJob<unknown>>(token, "/exports", {
      method: "POST",
      body: JSON.stringify({
        design_id: designId,
        format: { type: "png", export_quality: "regular", width: dims.width },
      }),
    });
    if (!exportJob.job?.id) throw new Error("Canva não iniciou a exportação.");
    const done = await waitForJob<unknown>(token, `/exports/${exportJob.job.id}`, "Exportação do Canva", 16);
    const downloadUrl = done.urls?.[0];
    if (!downloadUrl) throw new Error("Canva exportou sem URL de download.");

    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) throw new Error(`Falha ao baixar export do Canva: ${fileRes.status}`);
    const bytes = await fileRes.arrayBuffer();
    const storagePath = `${data.workspaceId}/posts/canva-${data.postId}-${crypto.randomUUID()}.png`;
    const upload = await admin.storage.from("social-media").upload(storagePath, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const nextPosition = assets.length ? Math.max(...assets.map((a) => a.position ?? 0)) + 1 : 0;
    const insert = await admin.from("social_post_assets").insert({
      post_id: data.postId,
      workspace_id: data.workspaceId,
      storage_path: storagePath,
      kind: "image",
      aspect: dims.aspect,
      ai_generated: false,
      position: nextPosition,
      canva_design_id: designId,
      format: "png",
      metadata: { source: "canva_export", exportJobId: exportJob.job.id, importedAt: new Date().toISOString() },
    }).select("id,storage_path,kind,aspect,ai_generated,position,canva_design_id").single();
    if (insert.error) throw new Error(insert.error.message);

    const metadata = { ...(post.metadata ?? {}) } as Record<string, unknown>;
    metadata.canva = {
      ...((metadata.canva ?? {}) as Record<string, unknown>),
      designId,
      lastExportJobId: exportJob.job.id,
      lastImportedPath: storagePath,
      lastImportedAt: new Date().toISOString(),
    };
    await admin.from("social_posts").update({ canva_design_id: designId, metadata }).eq("id", data.postId).eq("workspace_id", data.workspaceId);

    return { ok: true, asset: insert.data, storagePath };
  });
