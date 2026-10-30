import {resolveWorkspaceAiKey,type WorkspaceAiKey} from "./workspace-ai-key.server";
// Social Media, CRUD, resolução de provider de IA, geração de ideias.
// Client-safe: só declara server fns; imports server-only ficam nos handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Schemas ----------
const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });

const CreatePostSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().max(200).optional().nullable(),
  briefing: z.string().max(4000).optional().nullable(),
  copy: z.string().max(4000).optional().nullable(),
  hashtags: z.array(z.string()).max(30).default([]),
  cta: z.string().max(200).optional().nullable(),
  channels: z.array(z.enum(["fb_feed","fb_story","fb_reels","ig_feed","ig_story","ig_reels","tiktok","linkedin"])).default([]),
  targets: z.record(z.string(), z.string()).optional().default({}), // channel -> target_ref (page_id / instagram_id)
  scheduledAt: z.string().datetime().optional().nullable(), // ISO em UTC (client converte)
  status: z.enum(["draft","pending_approval","approved","scheduled"]).default("scheduled"),
  aiProvider: z.enum(["openai","gemini"]).optional().nullable(),
  aiPrompt: z.string().optional().nullable(),
  referenceUrls: z.array(z.string()).max(4).default([]),
  assets: z.array(z.object({
    storagePath: z.string(),
    kind: z.enum(["image","video"]),
    aspect: z.string().optional().nullable(),
    aiGenerated: z.boolean().default(false),
  })).default([]),
});


const UpdatePostSchema = z.object({
  postId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  patch: z.object({
    title: z.string().max(200).optional().nullable(),
    briefing: z.string().max(4000).optional().nullable(),
    copy: z.string().max(4000).optional().nullable(),
    hashtags: z.array(z.string()).max(30).optional(),
    cta: z.string().max(200).optional().nullable(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z.enum(["draft","pending_approval","approved","scheduled","published","failed","rejected"]).optional(),
  }),
});


const DeletePostSchema = z.object({ postId: z.string().uuid(), workspaceId: z.string().uuid() });

const ListPostsSchema = z.object({
  workspaceId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.array(z.string()).optional(),
});

// ---------- List ----------
export const listSocialPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListPostsSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("social_posts").select("*").eq("workspace_id", data.workspaceId).order("scheduled_at", { ascending: true, nullsFirst: false });
    if (data.from) q = q.gte("scheduled_at", data.from);
    if (data.to) q = q.lte("scheduled_at", data.to);
    if (data.status?.length) q = q.in("status", data.status as never[]);
    const { data: posts, error } = await q.limit(500);
    if (error) throw new Error(error.message);

    const ids = (posts ?? []).map((p) => (p as { id: string }).id);
    if (!ids.length) return { posts: [], channels: [], assets: [] };

    const [{ data: channels }, { data: assets }] = await Promise.all([
      context.supabase.from("social_post_channels").select("*").in("post_id", ids),
      context.supabase.from("social_post_assets").select("*").in("post_id", ids),
    ]);
    return { posts: posts ?? [], channels: channels ?? [], assets: assets ?? [] };
  });

// ---------- Create ----------
export const createSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreatePostSchema.parse(d))
  .handler(async ({ data, context }) => {
    const status = data.status;
    const { data: post, error } = await context.supabase.from("social_posts").insert({
      workspace_id: data.workspaceId,
      created_by: context.userId,
      title: data.title ?? null,
      briefing: data.briefing ?? null,
      copy: data.copy ?? null,
      hashtags: data.hashtags,
      cta: data.cta ?? null,
      status,
      scheduled_at: data.scheduledAt ?? null,
      ai_provider: data.aiProvider ?? null,
      ai_prompt: data.aiPrompt ?? null,
      reference_urls: data.referenceUrls,
    }).select("*").single();
    if (error) throw new Error(error.message);

    const postId = (post as { id: string }).id;

    if (data.channels.length) {
      const rows = data.channels.map((c) => ({
        post_id: postId, workspace_id: data.workspaceId, channel: c, status: "pending",
        target_ref: data.targets?.[c] ?? null,
      }));
      const { error: chErr } = await context.supabase.from("social_post_channels").insert(rows);
      if (chErr) throw new Error(chErr.message);
    }

    if (data.assets.length) {
      const rows = data.assets.map((a, i) => ({
        post_id: postId, workspace_id: data.workspaceId,
        storage_path: a.storagePath, kind: a.kind, aspect: a.aspect ?? null,
        ai_generated: a.aiGenerated, position: i,
      }));
      const { error: asErr } = await context.supabase.from("social_post_assets").insert(rows);
      if (asErr) throw new Error(asErr.message);
    }
    return { postId };
  });

// ---------- Update ----------
export const updateSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePostSchema.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.patch.title !== undefined) patch.title = data.patch.title;
    if (data.patch.briefing !== undefined) patch.briefing = data.patch.briefing;
    if (data.patch.copy !== undefined) patch.copy = data.patch.copy;
    if (data.patch.hashtags !== undefined) patch.hashtags = data.patch.hashtags;
    if (data.patch.cta !== undefined) patch.cta = data.patch.cta;
    if (data.patch.scheduledAt !== undefined) patch.scheduled_at = data.patch.scheduledAt;
    if (data.patch.status !== undefined) {
      patch.status = data.patch.status;
      patch.last_error = null;
      if (data.patch.status !== "published") patch.published_at = null;
    }
    const { error } = await context.supabase.from("social_posts").update(patch as never)
      .eq("id", data.postId).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    if (data.patch.status !== undefined) {
      const { error: chErr } = await context.supabase.from("social_post_channels")
        .update({ status: "pending", last_error: null, platform_ref: null, published_at: null } as never)
        .eq("post_id", data.postId)
        .eq("workspace_id", data.workspaceId)
        .neq("status", "published");
      if (chErr) throw new Error(chErr.message);
    }
    return { ok: true };
  });

// ---------- Sincronizar assets do post (carousel/edição) ----------
// Recebe a lista COMPLETA de assets na ordem desejada.
// Preserva os que já existem (por id), remove os ausentes, insere os novos.
export const syncSocialPostAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    postId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    assets: z.array(z.object({
      id: z.string().uuid().optional(),
      storagePath: z.string(),
      kind: z.enum(["image","video"]),
      aspect: z.string().optional().nullable(),
      aiGenerated: z.boolean().default(false),
    })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // ownership check
    const { data: post } = await context.supabase.from("social_posts")
      .select("id").eq("id", data.postId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (!post) throw new Error("Post não encontrado neste workspace.");

    const { data: existing } = await context.supabase.from("social_post_assets")
      .select("id").eq("post_id", data.postId);
    const keepIds = new Set(data.assets.map(a => a.id).filter((v): v is string => !!v));
    const toDelete = (existing ?? []).map(r => (r as { id: string }).id).filter(id => !keepIds.has(id));
    if (toDelete.length) {
      const { error } = await context.supabase.from("social_post_assets").delete().in("id", toDelete);
      if (error) throw new Error(error.message);
    }
    // atualiza posição dos existentes / insere novos
    for (let i = 0; i < data.assets.length; i++) {
      const a = data.assets[i];
      if (a.id) {
        const { error } = await context.supabase.from("social_post_assets")
          .update({ position: i } as never).eq("id", a.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await context.supabase.from("social_post_assets").insert({
          post_id: data.postId, workspace_id: data.workspaceId,
          storage_path: a.storagePath, kind: a.kind, aspect: a.aspect ?? null,
          ai_generated: a.aiGenerated, position: i,
        });
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });


// ---------- Delete ----------
export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeletePostSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("social_posts").delete()
      .eq("id", data.postId).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Publicar agora (chamado pelo dialog ou pelo chat) ----------
export const publishSocialPostNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    postId: z.string().uuid(), workspaceId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Confere ownership no workspace do usuário antes de subir pra admin.
    const { data: post, error } = await context.supabase.from("social_posts")
      .select("id,workspace_id").eq("id", data.postId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (error || !post) throw new Error("Post não encontrado neste workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishSocialPost } = await import("@/lib/social-publisher.server");
    await supabaseAdmin.from("social_posts").update({ status: "publishing" }).eq("id", data.postId);
    const r = await publishSocialPost(supabaseAdmin, data.postId);
    return r;
  });

// ---------- Resolver de provider de IA ----------
// Ordem: preferência do workspace → OpenAI se conectado → Gemini se conectado → null.
export const resolveAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    module: z.string().default("social_media"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: pref } = await context.supabase.from("ai_provider_prefs")
      .select("provider").eq("workspace_id", data.workspaceId).eq("module", data.module).maybeSingle();
    const explicit = (pref as { provider?: "openai"|"gemini" } | null)?.provider ?? null;

    const { data: integrations } = await context.supabase.from("integrations")
      .select("provider,status").eq("workspace_id", data.workspaceId).in("provider", ["openai","gemini"]);
    const rows = (integrations ?? []) as Array<{ provider: string; status: string }>;
    const hasOpenAI = rows.some((r) => r.provider === "openai" && r.status === "connected");
    const hasGemini = rows.some((r) => r.provider === "gemini" && r.status === "connected");

    if (explicit === "openai" && hasOpenAI) return { provider: "openai" as const, source: "preference" as const };
    if (explicit === "gemini" && hasGemini) return { provider: "gemini" as const, source: "preference" as const };
    if (hasOpenAI) return { provider: "openai" as const, source: "default" as const };
    if (hasGemini) return { provider: "gemini" as const, source: "fallback" as const };
    return { provider: null, source: "none" as const, message: "Conecte OpenAI ou Gemini em Integrações." };
  });

// Grava preferência de IA do módulo
export const setAiProviderPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    module: z.string().default("social_media"),
    provider: z.enum(["openai","gemini"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_provider_prefs").upsert({
      workspace_id: data.workspaceId, module: data.module, provider: data.provider,
    }, { onConflict: "workspace_id,module" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Alvos Meta conectados (páginas FB e contas IG) ----------
export const listMetaTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: pages }, { data: igs }] = await Promise.all([
      context.supabase.from("meta_pages")
        .select("page_id,page_name").eq("workspace_id", data.workspaceId).order("page_name"),
      context.supabase.from("meta_instagram_accounts")
        .select("instagram_id,username,page_id").eq("workspace_id", data.workspaceId).order("username"),
    ]);
    return {
      pages: ((pages ?? []) as Array<{ page_id: string; page_name: string | null }>)
        .map((p) => ({ page_id: p.page_id, name: p.page_name ?? p.page_id })),
      instagram: ((igs ?? []) as Array<{ instagram_id: string; username: string | null; page_id: string | null }>)
        .map((i) => ({ instagram_id: i.instagram_id, username: i.username ?? i.instagram_id, page_id: i.page_id ?? "" })),
    };

  });

// ---------- Ideias (banco) ----------

export const listSocialIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { data: ideas, error } = await context.supabase.from("social_ideas")
      .select("*").eq("workspace_id", data.workspaceId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { ideas: ideas ?? [] };
  });

// Lista os provedores de imagem conectados no workspace.
// Só entram geradores que realmente servem para social: Freepik, Recraft,
// Ideogram e Gemini (Nano Banana). OpenAI fica de fora de propósito.
export const listImageProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const order = ["ideogram", "recraft", "freepik", "gemini"] as const;
    const { data: rows } = await context.supabase.from("integrations")
      .select("provider,status").eq("workspace_id", data.workspaceId)
      .in("provider", order as unknown as string[]);
    const connected = new Set(
      ((rows ?? []) as Array<{ provider: string; status: string }>)
        .filter(r => r.status === "connected").map(r => r.provider),
    );
    const providers = order.filter(p => connected.has(p));
    return { providers, primary: providers[0] ?? null };
  });

// Salva o caminho da imagem gerada dentro da metadata da ideia.
export const setSocialIdeaImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    ideaId: z.string().uuid(),
    imagePath: z.string().min(1).max(500),
    provider: z.string().max(40).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("social_ideas")
      .select("metadata").eq("id", data.ideaId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ideia não encontrada.");
    const meta = ((row as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...meta,
      image_path: data.imagePath,
      image_provider: data.provider ?? null,
      image_generated_at: new Date().toISOString(),
    };
    const { error: upErr } = await context.supabase.from("social_ideas")
      .update({ metadata: nextMeta } as never)
      .eq("id", data.ideaId).eq("workspace_id", data.workspaceId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, imagePath: data.imagePath };
  });


// Exclui uma ideia do banco (Banco de ideias).
export const deleteSocialIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("social_ideas")
      .delete().eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Gera N ideias novas usando o Lovable AI Gateway.
// Aceita um brief (o que o usuário quer) e usa o contexto da marca pra gerar
// ideias úteis: hook, legenda completa, CTA, comentário fixado, tema em alta, hashtags e sugestão visual.
export const generateSocialIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    count: z.number().int().min(1).max(8).default(4),
    brief: z.string().max(500).optional().default(""),
    network: z.enum(["instagram", "facebook", "both", "tiktok", "youtube"]).optional().default("both"),
    format: z.enum(["feed", "reels", "story", "carrossel", "qualquer"]).optional().default("qualquer"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ws } = await context.supabase.from("workspaces")
      .select("name").eq("id", data.workspaceId).maybeSingle();
    const { data: prof } = await context.supabase.from("profiles")
      .select("niche,company_name").eq("id", context.userId).maybeSingle();
    const { data: brand } = await context.supabase.from("social_brand_context")
      .select("company_name,segment,tone_of_voice,target_audience,audience_pains,audience_desires,main_promise,differentials,positioning,products_services,visual_style,instagram_goal,facebook_goal,post_types,forbidden_themes,forbidden_words")
      .eq("workspace_id", data.workspaceId).maybeSingle();

    const niche = (prof as { niche?: string } | null)?.niche ?? (brand as { segment?: string } | null)?.segment ?? "geral";
    const company = (brand as { company_name?: string } | null)?.company_name
      ?? (prof as { company_name?: string } | null)?.company_name
      ?? (ws as { name?: string } | null)?.name ?? "a empresa";

    const provider = await resolveWorkspaceAiKey(context.supabase, data.workspaceId);
    const key = provider.apiKey;

    const b = (brand ?? {}) as Record<string, string | null>;
    const brandBlock = [
      `Segmento: ${b.segment ?? niche}`,
      b.tone_of_voice && `Tom de voz: ${b.tone_of_voice}`,
      b.target_audience && `Público: ${b.target_audience}`,
      b.audience_pains && `Dores: ${b.audience_pains}`,
      b.audience_desires && `Desejos: ${b.audience_desires}`,
      b.main_promise && `Promessa: ${b.main_promise}`,
      b.differentials && `Diferenciais: ${b.differentials}`,
      b.positioning && `Posicionamento: ${b.positioning}`,
      b.products_services && `Produtos/serviços: ${b.products_services}`,
      b.visual_style && `Estilo visual: ${b.visual_style}`,
      b.post_types && `Tipos de post preferidos: ${b.post_types}`,
      b.forbidden_themes && `Temas proibidos: ${b.forbidden_themes}`,
      b.forbidden_words && `Palavras proibidas: ${b.forbidden_words}`,
    ].filter(Boolean).join("\n");

    const briefLine = data.brief?.trim()
      ? `Pedido do usuário (obrigatório atender): "${data.brief.trim()}"`
      : `Pedido do usuário: (sem pedido específico, traga ideias fortes e atuais, alinhadas com a marca)`;

    const prompt = `Você é um estrategista sênior de conteúdo para redes sociais (Instagram, Facebook, TikTok, YouTube).
Gere ${data.count} ideias de post ALTAMENTE ÚTEIS e específicas para "${company}".
Rede-alvo: ${data.network}. Formato preferencial: ${data.format}.

${briefLine}

Contexto da marca:
${brandBlock}

Requisitos por ideia:
- title: título interno curto (≤ 60 chars).
- hook: primeira frase de impacto (≤ 90 chars).
- caption: legenda pronta para publicar (150-500 chars), com quebras de linha reais (use \\n), storytelling curto + chamada final.
- primary_cta: 1 CTA principal, direto.
- alt_ctas: 2 CTAs alternativos, curtos.
- pinned_comment: texto pronto para PRIMEIRO COMENTÁRIO FIXADO (link, oferta, contexto extra, 60-220 chars).
- hashtags: array de 5 a 8 hashtags (com #).
- trending_theme: tema/tendência ATUAL do nicho que a ideia explora (≤ 80 chars).
- format: "feed" | "reels" | "story" | "carrossel".
- image_prompt: descrição visual (≤ 140 chars) coerente com a marca.
- accent_color: hex sugerido para o card (ex: "#F59E0B").

Retorne JSON estrito: { "ideas": Idea[] }, sem texto fora do JSON.`;

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.defaultModel,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`Falha na IA: ${res.status}`);
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { ideas?: Array<Record<string, unknown>> } = {};
    try { parsed = JSON.parse(content); } catch { parsed = { ideas: [] }; }

    const asStr = (v: unknown, max = 1000) => typeof v === "string" ? v.slice(0, max) : "";
    const asArr = (v: unknown): string[] => Array.isArray(v) ? (v.filter(x => typeof x === "string") as string[]) : [];

    const rows = (parsed.ideas ?? []).slice(0, data.count).map((i) => {
      const title = asStr(i.title, 200) || "Ideia";
      const caption = asStr(i.caption, 2000);
      return {
        workspace_id: data.workspaceId,
        title,
        copy_suggestion: caption || null,
        niche,
        origin: "ai",
        metadata: {
          hook: asStr(i.hook, 200),
          caption,
          primary_cta: asStr(i.primary_cta, 120),
          alt_ctas: asArr(i.alt_ctas).slice(0, 3),
          pinned_comment: asStr(i.pinned_comment, 400),
          hashtags: asArr(i.hashtags).slice(0, 10),
          trending_theme: asStr(i.trending_theme, 140),
          format: asStr(i.format, 20) || data.format,
          image_prompt: asStr(i.image_prompt, 200),
          accent_color: asStr(i.accent_color, 12) || "#6366f1",
          network: data.network,
          brief: data.brief?.trim() || null,
        },
      };
    });
    if (rows.length) {
      const { error } = await context.supabase.from("social_ideas").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { created: rows.length };
  });

// ---------- Expandir uma ideia (detalhes profundos) ----------
// Gera plano de produção detalhado dependendo do formato:
// - feed/foto: photo_direction (composição, luz, elementos, cor), image_prompt refinado
// - carrossel: slides[] com título, texto e image_prompt por slide (5-8 slides)
// - story: story_frames[] com texto, image_prompt e sticker_hint (3-5 frames)
// - reels: reels_script { duration_seconds, hook, scenes[], cta, sound_hint, b_roll }
async function callGateway(prompt: string, provider: WorkspaceAiKey) {
  const key = provider.apiKey;
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.defaultModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Falha na IA: ${res.status}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content) as Record<string, unknown>; } catch { return {}; }
}

function brandBlockFrom(brand: Record<string, string | null> | null | undefined, niche: string) {
  const b = (brand ?? {}) as Record<string, string | null>;
  return [
    `Segmento: ${b.segment ?? niche}`,
    b.tone_of_voice && `Tom de voz: ${b.tone_of_voice}`,
    b.target_audience && `Público: ${b.target_audience}`,
    b.audience_pains && `Dores: ${b.audience_pains}`,
    b.audience_desires && `Desejos: ${b.audience_desires}`,
    b.main_promise && `Promessa: ${b.main_promise}`,
    b.differentials && `Diferenciais: ${b.differentials}`,
    b.visual_style && `Estilo visual: ${b.visual_style}`,
    b.forbidden_themes && `Temas proibidos: ${b.forbidden_themes}`,
    b.forbidden_words && `Palavras proibidas: ${b.forbidden_words}`,
  ].filter(Boolean).join("\n");
}

export const expandSocialIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ideaId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    force: z.boolean().optional().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: idea, error } = await context.supabase.from("social_ideas")
      .select("*").eq("id", data.ideaId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (error || !idea) throw new Error("Ideia não encontrada.");
    const row = idea as { id: string; title: string; copy_suggestion: string | null; niche: string | null; metadata: Record<string, unknown> };
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (!data.force && meta.expanded) return { ok: true as const, metadataJson: JSON.stringify(meta) };

    const { data: brand } = await context.supabase.from("social_brand_context")
      .select("company_name,segment,tone_of_voice,target_audience,audience_pains,audience_desires,main_promise,differentials,visual_style,forbidden_themes,forbidden_words")
      .eq("workspace_id", data.workspaceId).maybeSingle();
    const niche = row.niche ?? "geral";
    const format = String(meta.format ?? "feed").toLowerCase();
    const hook = String(meta.hook ?? row.title ?? "");
    const caption = String(meta.caption ?? row.copy_suggestion ?? "");
    const brandCtx = brandBlockFrom(brand as Record<string, string | null> | null, niche);

    const common = `Contexto da marca:\n${brandCtx}\n\nIdeia base:\nTítulo: ${row.title}\nHook: ${hook}\nLegenda: ${caption}\nFormato: ${format}\n`;
    let prompt = "";
    if (format === "carrossel") {
      prompt = `${common}\nGere um plano DETALHADO de carrossel Instagram (6 a 8 slides).
JSON estrito: {
  "photo_direction": string (direção de arte geral, ≤ 300 chars),
  "slides": Array<{ "n": number, "title": string (≤ 60 chars), "text": string (60-220 chars, ganchos e valor real), "image_prompt": string (≤ 200 chars, descrição visual detalhada, composição, cor, luz, elementos) }>,
  "closing_slide": { "text": string, "cta": string }
}. Slides devem ter narrativa: gancho → problema → virada → prova → aplicação → CTA. Sem texto fora do JSON.`;
    } else if (format === "story") {
      prompt = `${common}\nGere um plano de sequência de Stories (3 a 5 frames) que leva o espectador do gancho ao CTA.
JSON estrito: {
  "photo_direction": string,
  "story_frames": Array<{ "n": number, "text": string (≤ 90 chars, on-screen), "image_prompt": string (≤ 180 chars), "sticker_hint": string (enquete/pergunta/link/countdown) }>
}. Sem texto fora do JSON.`;
    } else if (format === "reels") {
      prompt = `${common}\nGere um ROTEIRO completo de Reels de 20 a 45 segundos, com cenas cronometradas.
JSON estrito: {
  "photo_direction": string (direção geral de estética),
  "reels_script": {
    "duration_seconds": number,
    "hook": string (primeiros 3s, retenção),
    "scenes": Array<{ "n": number, "time": string (ex "0-3s"), "action": string (o que acontece na cena), "on_screen_text": string, "voiceover": string }>,
    "cta": string,
    "sound_hint": string (tipo de trilha/áudio em alta ou sugestão),
    "b_roll": string (ideias de imagens/planos extras)
  }
}. Sem texto fora do JSON.`;
    } else {
      prompt = `${common}\nGere direção de arte detalhada para foto única de Feed.
JSON estrito: {
  "photo_direction": string (composição, luz, cores, elementos, mood, ≤ 400 chars),
  "image_prompt": string (prompt visual pronto pra IA de imagem, ≤ 220 chars),
  "shot_list": Array<string> (3 variações rápidas do enquadramento),
  "props": Array<string>
}. Sem texto fora do JSON.`;
    }

    const parsed = await callGateway(prompt, await resolveWorkspaceAiKey(context.supabase, data.workspaceId));
    const nextMeta = { ...meta, ...parsed, expanded: true, expanded_at: new Date().toISOString() };
    const { error: upErr } = await context.supabase.from("social_ideas")
      .update({ metadata: nextMeta } as never).eq("id", data.ideaId).eq("workspace_id", data.workspaceId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, metadataJson: JSON.stringify(nextMeta) };
  });

// ---------- Refinar ideia iterativamente (Melhorar Prompt) ----------
export const refineSocialIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ideaId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    instruction: z.string().min(2).max(1000),
    targetImageProvider: z.enum(["ideogram", "recraft", "freepik", "gemini"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: idea, error } = await context.supabase.from("social_ideas")
      .select("*").eq("id", data.ideaId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (error || !idea) throw new Error("Ideia não encontrada.");
    const row = idea as { id: string; title: string; copy_suggestion: string | null; niche: string | null; metadata: Record<string, unknown> };
    const meta = (row.metadata ?? {}) as Record<string, unknown>;

    const { data: brand } = await context.supabase.from("social_brand_context")
      .select("company_name,segment,tone_of_voice,target_audience,audience_pains,audience_desires,main_promise,differentials,visual_style,forbidden_themes,forbidden_words")
      .eq("workspace_id", data.workspaceId).maybeSingle();
    const brandCtx = brandBlockFrom(brand as Record<string, string | null> | null, row.niche ?? "geral");

    const current = JSON.stringify({ title: row.title, caption: row.copy_suggestion, metadata: meta }, null, 2);
    
    let imageGuidelines = "";
    if (data.targetImageProvider === "ideogram") {
      imageGuidelines = "\nDIRETRIZES IDEOGRAM V2: Foque em descrições tipográficas claras se houver texto. Use termos como 'cinematic', 'artistic', ou 'vibrant' conforme o estilo. O Ideogram entende renderização de texto perfeitamente, então especifique as palavras exatas entre aspas no image_prompt.";
    } else if (data.targetImageProvider === "recraft") {
      imageGuidelines = "\nDIRETRIZES RECRAFT: Priorize 'vector art', 'digital illustration' ou estilos de design limpos. Ótimo para ícones e ilustrações técnicas.";
    } else if (data.targetImageProvider === "freepik") {
      imageGuidelines = "\nDIRETRIZES FREEPIK (FLUX): Foque em fotorrealismo extremo, iluminação natural e detalhes táteis. Descreva a cena como uma fotografia real.";
    }

    const prompt = `Você está REFINANDO uma ideia de post existente com base no pedido do usuário.
Mantenha o que ficar bom, ajuste o que o usuário pediu, e retorne a IDEIA COMPLETA e ATUALIZADA.
${imageGuidelines}

Contexto da marca:
${brandCtx}

Ideia atual (JSON):
${current}

Pedido de refino do usuário:
"${data.instruction}"

Retorne JSON estrito com a estrutura completa atualizada:
{
  "title": string,
  "caption": string,
  "metadata": {
    "hook": string,
    "caption": string,
    "primary_cta": string,
    "alt_ctas": string[],
    "pinned_comment": string,
    "hashtags": string[],
    "trending_theme": string,
    "format": "feed"|"reels"|"story"|"carrossel",
    "image_prompt": "string (REFINADO PARA O GERADOR ${data.targetImageProvider?.toUpperCase() ?? "IA"} SEGUINDO AS DIRETRIZES)",
    "accent_color": string,
    "photo_direction": string,
    "slides": (mesma estrutura anterior, se carrossel),
    "story_frames": (se story),
    "reels_script": (se reels),
    "shot_list": (se feed foto única)
  }
}
Preserve chaves não modificadas. Sem texto fora do JSON.`;

    const parsed = await callGateway(prompt, await resolveWorkspaceAiKey(context.supabase, data.workspaceId));
    const nextTitle = typeof parsed.title === "string" ? parsed.title.slice(0, 200) : row.title;
    const nextCaption = typeof parsed.caption === "string" ? parsed.caption.slice(0, 2000) : row.copy_suggestion;
    const nextMetaPatch = (parsed.metadata && typeof parsed.metadata === "object") ? parsed.metadata as Record<string, unknown> : {};
    const history = Array.isArray(meta.refinement_history) ? [...(meta.refinement_history as unknown[])] : [];
    history.push({ at: new Date().toISOString(), instruction: data.instruction });
    const nextMeta = { ...meta, ...nextMetaPatch, expanded: true, refinement_history: history };

    const { error: upErr } = await context.supabase.from("social_ideas")
      .update({ title: nextTitle, copy_suggestion: nextCaption, metadata: nextMeta } as never)
      .eq("id", data.ideaId).eq("workspace_id", data.workspaceId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, title: nextTitle, caption: nextCaption ?? "", metadataJson: JSON.stringify(nextMeta) };
  });

// ---------- Gerar calendário editorial ----------
// Cria N rascunhos de post distribuídos nos dias/horários escolhidos, dentro do mês pedido.
// A IA distribui os pilares de conteúdo pelas datas e gera título/legenda/hashtags/CTA para cada post.
// Todos os posts entram como status "draft", o usuário revisa e agenda.
export const generateEditorialCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    year: z.number().int().min(2024).max(2100),
    month: z.number().int().min(0).max(11), // 0-11
    postsPerWeek: z.number().int().min(1).max(14).default(3),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).default([1, 3, 5]), // 0=dom
    hour: z.number().int().min(0).max(23).default(10),
    minute: z.number().int().min(0).max(59).default(0),
    pillars: z.array(z.string().min(1).max(60)).min(1).max(8),
    channels: z.array(z.enum(["fb_feed","fb_story","fb_reels","ig_feed","ig_story","ig_reels"])).min(1).default(["ig_feed"]),
    brief: z.string().max(400).optional().default(""),
    brandId: z.string().uuid().optional().nullable(),
    targetImageProvider: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // 1) Monta as datas de agendamento dentro do mês.
    const dates: Date[] = [];
    const first = new Date(Date.UTC(data.year, data.month, 1));
    const daysInMonth = new Date(Date.UTC(data.year, data.month + 1, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(data.year, data.month, d, data.hour, data.minute, 0));
      if (data.weekdays.includes(dt.getUTCDay())) dates.push(dt);
    }
    // Limita pela cadência semanal * ~4.3 semanas.
    const maxPosts = Math.min(dates.length, Math.ceil(data.postsPerWeek * 4.5));
    const chosen = dates.slice(0, maxPosts);
    if (!chosen.length) return { created: 0 };

    // 2) Contexto de marca.
    const { data: brand } = await context.supabase.from("social_brand_context")
      .select("company_name,segment,tone_of_voice,target_audience,audience_pains,audience_desires,main_promise,differentials,visual_style,products_services,post_types,forbidden_themes,forbidden_words")
      .eq("workspace_id", data.workspaceId).maybeSingle();
    const { data: prof } = await context.supabase.from("profiles")
      .select("niche,company_name").eq("id", context.userId).maybeSingle();
    const niche = (prof as { niche?: string } | null)?.niche ?? "geral";
    const brandCtx = brandBlockFrom(brand as Record<string, string | null> | null, niche);
    const company = (brand as { company_name?: string } | null)?.company_name
      ?? (prof as { company_name?: string } | null)?.company_name ?? "a empresa";

    // 3) Prompt de IA gerando 1 ideia por data com pilar rotacionado.
    const monthName = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][data.month];
    const scheduleBlock = chosen.map((dt, i) => `#${i+1}, ${dt.toISOString()}, pilar sugerido: "${data.pillars[i % data.pillars.length]}"`).join("\n");
    const prompt = `Você é um estrategista de conteúdo. Monte um CALENDÁRIO EDITORIAL de ${monthName}/${data.year} para "${company}".

${data.brief?.trim() ? `Pedido: ${data.brief.trim()}` : ""}

Contexto da marca:
${brandCtx}

Pilares (rotacionar): ${data.pillars.join(" | ")}
Redes/canais alvo: ${data.channels.join(", ")}

Datas obrigatórias (não reordenar, mesma ordem no output):
${scheduleBlock}

Para cada data, gere UM post. Retorne JSON estrito:
{ "posts": Array<{
  "n": number,
  "pillar": string,
  "title": string (≤ 70 chars),
  "hook": string (≤ 90 chars),
  "caption": string (150-500 chars, use \\n),
  "cta": string (≤ 80 chars),
  "hashtags": string[] (5-8, com #),
  "format": "feed"|"reels"|"story"|"carrossel"
}> }
Sem texto fora do JSON.`;
    const parsed = await callGateway(prompt, await resolveWorkspaceAiKey(context.supabase, data.workspaceId));
    const items = Array.isArray((parsed as { posts?: unknown }).posts) ? (parsed as { posts: Array<Record<string, unknown>> }).posts : [];

    // 4) Insere posts + channels.
    const asStr = (v: unknown, max = 500) => typeof v === "string" ? v.slice(0, max) : "";
    const asArr = (v: unknown): string[] => Array.isArray(v) ? (v.filter(x => typeof x === "string") as string[]) : [];

    let created = 0;
    for (let i = 0; i < chosen.length; i++) {
      const it = items[i] ?? {};
      const title = asStr(it.title, 200) || `Post ${i + 1}, ${data.pillars[i % data.pillars.length]}`;
      const caption = asStr(it.caption, 2000);
      const hashtags = asArr(it.hashtags).slice(0, 10);
      const cta = asStr(it.cta, 200);
      const pillar = asStr(it.pillar, 60) || data.pillars[i % data.pillars.length];
      const format = asStr(it.format, 20) || "feed";
      const scheduledAt = chosen[i].toISOString();

      const { data: inserted, error: insErr } = await context.supabase.from("social_posts").insert({
        workspace_id: data.workspaceId,
        created_by: context.userId,
        title,
        briefing: `Pilar: ${pillar}\nHook: ${asStr(it.hook, 200)}`,
        copy: caption,
        hashtags,
        cta,
        status: "draft",
        scheduled_at: scheduledAt,
        metadata: { pillar, format, source: "editorial-calendar" },
      } as never).select("id").single();
      if (insErr || !inserted) continue;

      const postId = (inserted as { id: string }).id;
      const chRows = data.channels.map((c) => ({
        post_id: postId, workspace_id: data.workspaceId, channel: c, status: "pending",
      }));
      await context.supabase.from("social_post_channels").insert(chRows as never);
      created++;
    }
    return { created };
  });
