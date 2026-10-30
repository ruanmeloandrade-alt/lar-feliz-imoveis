// Onda 4, Campanhas orgânicas, aprovações, métricas e aprendizado.
// Client-safe: só declara server fns; imports server-only ficam nos handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCampaignSchedule, campaignDateIsInsidePeriod } from "@/lib/social-campaign-rules";
import { integrationVaultFailure } from "@/lib/integration-vault";

const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });

// ═══════════════════ CAMPANHAS ═══════════════════

const CampaignFormat = z.enum(["feed", "reels", "carrossel", "story", "video_longo"]);
const CampaignChannel = z.enum([
  "fb_feed",
  "ig_feed",
  "ig_story",
  "ig_reels",
  "tiktok",
  "linkedin",
]);

const CadenceSchema = z.object({
  kind: z.enum(["daily", "weekly", "custom"]).default("weekly"),
  perWeek: z.number().int().min(1).max(21).default(3),
  days: z.array(z.number().int().min(0).max(6)).default([1, 3, 5]),
  hour: z.number().int().min(0).max(23).default(9),
  minute: z.number().int().min(0).max(59).default(0),
});

const FormatQuotaSchema = z.object({
  format: CampaignFormat,
  quantity: z.number().int().min(0).max(200).default(0),
  notes: z.string().max(400).optional().nullable(),
  slides: z.number().int().min(2).max(20).optional().nullable(),
  durationSec: z.number().int().min(1).max(3600).optional().nullable(),
});

const CampaignIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  format: CampaignFormat.default("feed"),
  angle: z.string().max(400).optional().nullable(),
  copy: z.string().max(1200).optional().nullable(),
});


const LogoPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number().positive(),
});

const PostSlideSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.string().optional().nullable(),
  storagePath: z.string().optional().nullable(),
  imagePrompt: z.string().max(4000).optional().nullable(),
  title: z.string().max(300).optional().nullable(),
  logoOverlayUrl: z.string().optional().nullable(),
  logoPosition: LogoPositionSchema.optional().nullable(),
});

const PostItemSchema = z.object({
  id: z.string().min(1),
  format: CampaignFormat,
  slides: z.number().int().min(2).max(20).optional().nullable(),
  durationSec: z.number().int().min(1).max(3600).optional().nullable(),
  title: z.string().max(300).default("Post"),
  briefing: z.string().max(5000).optional().nullable(),
  caption: z.string().max(5000).optional().nullable(),
  hashtags: z.string().max(3000).optional().nullable(),
  firstComment: z.string().max(3000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageStoragePath: z.string().optional().nullable(),
  logoOverlayUrl: z.string().optional().nullable(),
  logoPosition: LogoPositionSchema.optional().nullable(),
  imagePrompt: z.string().max(5000).optional().nullable(),
  date: z.string().max(10).optional().nullable(),
  time: z.string().max(5).optional().nullable(),
  fromIdeaId: z.string().optional().nullable(),
  placement: z.array(z.string()).optional(),
  channelTargets: z.record(
    z.string(),
    z.object({ ref: z.string().min(1), label: z.string().min(1).max(300) }),
  ).optional(),
  slidesData: z.array(PostSlideSchema).optional(),
});

const ChannelTargetSchema = z.object({
  ref: z.string().min(1),
  label: z.string().min(1).max(300),
});

const PostDraftSchema = z.object({
  briefing: z.string().max(5000).optional().nullable(),
  title: z.string().max(300).optional().nullable(),
  caption: z.string().max(5000).optional().nullable(),
  firstComment: z.string().max(3000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imagePrompt: z.string().max(5000).optional().nullable(),
  channels: z.array(CampaignChannel).optional().nullable(),
  fromIdeaId: z.string().optional().nullable(),
});

const PostSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120).default("Conjunto"),
  audience: z.string().max(300).optional().nullable(),
  tone: z.string().max(300).optional().nullable(),
  channels: z.array(CampaignChannel).default([]),
  channelTargets: z.record(z.string(), ChannelTargetSchema).optional(),
  formats: z.array(FormatQuotaSchema).default([]),
  cadence: CadenceSchema.default({
    kind: "weekly",
    perWeek: 3,
    days: [1, 3, 5],
    hour: 9,
    minute: 0,
  }),
  hooks: z.array(z.string().max(200)).default([]),
  ctas: z.array(z.string().max(200)).default([]),
  ideas: z.array(CampaignIdeaSchema).default([]),
  posts: z.array(PostItemSchema).default([]),
  brandId: z.string().uuid().optional().nullable(),
});

const CampaignPlanSchema = z
  .object({
    // Legado (compat). Novo modelo usa `sets`.
    formats: z.array(FormatQuotaSchema).default([]),
    cadence: CadenceSchema.default({
      kind: "weekly",
      perWeek: 3,
      days: [1, 3, 5],
      hour: 9,
      minute: 0,
    }),
    tone: z.string().max(300).optional().nullable(),
    audience: z.string().max(300).optional().nullable(),
    kpis: z.array(z.string().max(80)).default([]),
    campaignChannels: z.array(CampaignChannel).optional(),
    drafts: z.record(z.string(), PostDraftSchema).optional(),
    hooks: z.array(z.string().max(200)).default([]),
    ctas: z.array(z.string().max(200)).default([]),
    media: z
      .array(
        z.object({
          id: z.string().min(1),
          format: CampaignFormat,
          storagePath: z.string().min(1),
          source: z.enum(["upload", "ai"]).default("upload"),
          prompt: z.string().max(2000).optional().nullable(),
          width: z.number().int().min(1).max(4000),
          height: z.number().int().min(1).max(4000),
        }),
      )
      .default([]),
    // Novo, conjuntos de posts (estilo Meta Ads).
    sets: z.array(PostSetSchema).optional(),
  })
  .default({
    formats: [],
    cadence: { kind: "weekly", perWeek: 3, days: [1, 3, 5], hour: 9, minute: 0 },
    tone: null,
    audience: null,
    kpis: [],
    hooks: [],
    ctas: [],
    media: [],
  });

const CampaignInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(2).max(120),
  theme: z.string().max(200).optional().nullable(),
  objective: z.string().max(400).optional().nullable(),
  description: z.string().max(1200).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  channels: z.array(CampaignChannel).default([]),
  color: z.string().max(20).default("#6366f1"),
  status: z.enum(["active", "planned", "done", "paused"]).default("planned"),
  plan: CampaignPlanSchema.optional(),
  ideas: z.array(CampaignIdeaSchema).default([]),
});

export const listSocialCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("social_campaigns")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { campaigns: rows ?? [] };
  });

export const createSocialCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CampaignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("social_campaigns")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        theme: data.theme ?? null,
        objective: data.objective ?? null,
        description: data.description ?? null,
        starts_at: data.startsAt ?? null,
        ends_at: data.endsAt ?? null,
        channels: data.channels as never,
        color: data.color,
        status: data.status,
        plan: (data.plan ?? {}) as never,
        ideas: (data.ideas ?? []) as never,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { campaign: row };
  });

export const updateSocialCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        campaignId: z.string().uuid(),
        patch: CampaignInput.omit({ workspaceId: true }).partial(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.theme !== undefined) patch.theme = p.theme;
    if (p.objective !== undefined) patch.objective = p.objective;
    if (p.description !== undefined) patch.description = p.description;
    if (p.startsAt !== undefined) patch.starts_at = p.startsAt;
    if (p.endsAt !== undefined) patch.ends_at = p.endsAt;
    if (p.channels !== undefined) patch.channels = p.channels as never;
    if (p.color !== undefined) patch.color = p.color;
    if (p.status !== undefined) patch.status = p.status;
    if (p.plan !== undefined) patch.plan = p.plan as never;
    if (p.ideas !== undefined) patch.ideas = p.ideas as never;
    const { error } = await context.supabase
      .from("social_campaigns")
      .update(patch as never)
      .eq("id", data.campaignId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSocialCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        campaignId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_campaigns")
      .delete()
      .eq("id", data.campaignId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const attachPostToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        postId: z.string().uuid(),
        campaignId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_posts")
      .update({ campaign_id: data.campaignId } as never)
      .eq("id", data.postId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Gera drafts de posts para uma campanha, distribuindo por cadência.
export const generateCampaignPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        campaignId: z.string().uuid(),
        replaceExistingDrafts: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: camp, error: err0 } = await context.supabase
      .from("social_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (err0) throw new Error(err0.message);
    if (!camp) throw new Error("Campanha não encontrada.");

    type Cadence = {
      kind: "daily" | "weekly" | "custom";
      perWeek: number;
      days: number[];
      hour: number;
      minute: number;
    };
    type FormatQuota = { format: string; quantity: number; notes?: string | null; slides?: number | null; durationSec?: number | null };
    type Idea = {
      id: string;
      title: string;
      format: string;
      angle?: string | null;
      copy?: string | null;
    };
    type PostItem = {
      id: string;
      format: string;
      slides?: number | null;
      durationSec?: number | null;
      title: string;
      briefing?: string | null;
      caption?: string | null;
      hashtags?: string | null;
      firstComment?: string | null;
      imageUrl?: string | null;
      imageStoragePath?: string | null;
      imagePrompt?: string | null;
      slidesData?: Array<{ storagePath?: string | null; imageUrl?: string | null }>;
      placement?: string[];
      channelTargets?: Record<string, { ref: string; label: string }>;
      date?: string | null;
      time?: string | null;
    };
    type PostSet = {
      id: string;
      name?: string;
      audience?: string | null;
      tone?: string | null;
      channels?: string[];
      channelTargets?: Record<string, { ref: string; label: string }>;
      formats?: FormatQuota[];
      cadence?: Cadence;
      hooks?: string[];
      ctas?: string[];
      ideas?: Idea[];
      posts?: PostItem[];
    };
    type Plan = {
      formats?: FormatQuota[];
      cadence?: Cadence;
      tone?: string | null;
      audience?: string | null;
      hooks?: string[];
      ctas?: string[];
      media?: Array<{
        id: string;
        format: string;
        storagePath: string;
        source?: "upload" | "ai";
        prompt?: string | null;
        width?: number;
        height?: number;
      }>;
      sets?: PostSet[];
    };
    const c = camp as unknown as {
      starts_at: string | null;
      ends_at: string | null;
      channels: string[] | null;
      name: string;
      plan: Plan;
      ideas: Idea[];
    };

    const plan = (c.plan ?? {}) as Plan;
    const legacyIdeas = (c.ideas ?? []) as Idea[];
    const defaultCadence: Cadence = {
      kind: "weekly",
      perWeek: 3,
      days: [1, 3, 5],
      hour: 9,
      minute: 0,
    };

    // Sets: usa `plan.sets` se existir, senão constrói um único set a partir dos campos legados.
    const sets: PostSet[] = plan.sets?.length
      ? plan.sets
      : [
          {
            id: "legacy",
            name: "Conjunto principal",
            audience: plan.audience ?? null,
            tone: plan.tone ?? null,
            channels: (c.channels ?? []) as string[],
            formats: plan.formats ?? [],
            cadence: plan.cadence ?? defaultCadence,
            hooks: plan.hooks ?? [],
            ctas: plan.ctas ?? [],
            ideas: legacyIdeas,
          },
        ];

    const start0 = c.starts_at ? new Date(c.starts_at) : new Date();
    const end0 = c.ends_at
      ? new Date(c.ends_at)
      : new Date(start0.getTime() + 30 * 24 * 60 * 60 * 1000);

    const campaignStartDay = start0.toISOString().slice(0, 10);
    const campaignEndDay = end0.toISOString().slice(0, 10);
    const computeDates = (total: number, cadence: Cadence): Date[] =>
      buildCampaignSchedule(total, campaignStartDay, campaignEndDay, cadence);

    if (data.replaceExistingDrafts) {
      await context.supabase
        .from("social_posts")
        .delete()
        .eq("workspace_id", data.workspaceId)
        .eq("campaign_id", data.campaignId)
        .eq("status", "draft");
    }

    const campaignMedia = plan.media ?? [];
    type Row = {
      workspace_id: string;
      campaign_id: string;
      title: string;
      briefing: string | null;
      copy: string | null;
      scheduled_at: string;
      status: "draft";
      created_by: string;
      metadata: Record<string, unknown>;
    };
    const rows: Row[] = [];
    let pieceIndex = 0;

    for (const set of sets) {
      const cadence = set.cadence ?? defaultCadence;

      // Novo modelo: se o conjunto tem posts explícitos, eles mandam.
      if (set.posts?.length) {
        const explicit = set.posts;
        const fallbackDates = computeDates(explicit.length, cadence);
        explicit.forEach((p, i) => {
          const when = p.date
            ? new Date(`${p.date}T${p.time || "09:00"}:00Z`)
            : fallbackDates[i];
          if (!when || !campaignDateIsInsidePeriod(when, campaignStartDay, campaignEndDay)) {
            throw new Error(
              `O post "${p.title || `Post ${i + 1}`}" está fora do período da campanha (${campaignStartDay} a ${campaignEndDay}).`,
            );
          }
          const requestedChannels = (p.placement ?? []).filter((channel) =>
            CampaignChannel.safeParse(channel).success,
          );
          const ch = (requestedChannels.length ? requestedChannels : set.channels ?? []) as string[];
          const channels = ch;
          const copyParts = [
            p.caption,
            p.hashtags,
            p.firstComment ? `Primeiro comentário: ${p.firstComment}` : null,
          ].filter(Boolean) as string[];
          rows.push({
            workspace_id: data.workspaceId,
            campaign_id: data.campaignId,
            title: p.title || `${c.name} · ${set.name ?? "Conjunto"} · Post ${i + 1}`,
            briefing: p.briefing ?? null,
            copy: copyParts.length ? copyParts.join("\n\n") : null,
            scheduled_at: when.toISOString(),
            status: "draft",
            created_by: context.userId,
            metadata: {
              format: p.format,
              channels,
              targets: Object.fromEntries(
                channels
                  .map((channel) => [channel, p.channelTargets?.[channel]?.ref ?? set.channelTargets?.[channel]?.ref ?? null])
                  .filter((entry) => !!entry[1]),
              ),
              slides: p.slides ?? null,
              duration_sec: p.durationSec ?? null,
              image_url: p.imageUrl ?? null,
              image_storage_path: p.imageStoragePath ?? null,
              slide_storage_paths: (p.slidesData ?? [])
                .map((slide) => slide.storagePath)
                .filter(Boolean),
              image_prompt: p.imagePrompt ?? null,
              hashtags: p.hashtags ?? null,
              first_comment: p.firstComment ?? null,
              campaign_piece_index: pieceIndex++,
              campaign_set_id: set.id,
              campaign_set_name: set.name ?? null,
            },
          });
        });
        continue;
      }

      const formats = set.formats ?? [];
      const ideas = set.ideas ?? [];
      const totalFromFormats = formats.reduce((s, f) => s + (f.quantity ?? 0), 0);
      const total = Math.max(ideas.length, totalFromFormats);
      if (!total) continue;

      const formatPool: string[] = [];
      for (const f of formats)
        for (let i = 0; i < (f.quantity ?? 0); i++) formatPool.push(f.format);
      while (formatPool.length < total)
        formatPool.push(formatPool[formatPool.length % Math.max(1, formatPool.length)] ?? "feed");

      const dates = computeDates(total, cadence);
      const channelFor = (fmt: string): string[] => {
        const ch = (set.channels ?? []) as string[];
        if (!ch.length)
          return fmt === "reels" ? ["ig_reels"] : fmt === "story" ? ["ig_story"] : ["ig_feed"];
        return ch;
      };

      for (let i = 0; i < total; i++) {
        const idea = ideas[i];
        const fmt = (idea?.format ?? formatPool[i] ?? "feed") as string;
        const hook = (set.hooks?.length ? set.hooks[i % set.hooks.length] : null) ?? null;
        const cta = (set.ctas?.length ? set.ctas[i % set.ctas.length] : null) ?? null;
        const formatNotes = formats.find((f) => f.format === fmt)?.notes ?? null;
        const briefingParts = [
          set.name ? `Conjunto: ${set.name}` : null,
          idea?.angle ?? formatNotes,
          set.audience ? `Público: ${set.audience}` : null,
          set.tone ? `Tom: ${set.tone}` : null,
          hook ? `Gancho sugerido: ${hook}` : null,
        ].filter(Boolean) as string[];

        rows.push({
          workspace_id: data.workspaceId,
          campaign_id: data.campaignId,
          title: idea?.title ?? `${c.name} · ${set.name ?? "Conjunto"} · Peça ${i + 1}`,
          briefing: briefingParts.length ? briefingParts.join("\n") : null,
          copy: idea?.copy ?? (cta ? `${hook ? `${hook}\n\n` : ""}${cta}` : null),
          scheduled_at: dates[i].toISOString(),
          status: "draft",
          created_by: context.userId,
          metadata: {
            format: fmt,
            channels: channelFor(fmt),
            targets: Object.fromEntries(
              channelFor(fmt)
                .map((channel) => [channel, set.channelTargets?.[channel]?.ref ?? null])
                .filter((entry) => !!entry[1]),
            ),
            campaign_piece_index: pieceIndex++,
            campaign_set_id: set.id,
            campaign_set_name: set.name ?? null,
            campaign_media_available: campaignMedia.filter((m) => m.format === fmt).length,
          },
        });
      }
    }

    if (!rows.length) return { created: 0 };
    const { data: inserted, error } = await context.supabase
      .from("social_posts")
      .insert(rows as never)
      .select("id, metadata");
    if (error) throw new Error(error.message);

    const channelRows: Array<Record<string, unknown>> = [];
    for (const post of inserted ?? []) {
      const meta = ((post as { id: string; metadata?: { channels?: string[]; targets?: Record<string, string> } }).metadata ?? {});
      for (const channel of meta.channels ?? []) {
        if (!CampaignChannel.safeParse(channel).success) continue;
        channelRows.push({
          post_id: (post as { id: string }).id,
          workspace_id: data.workspaceId,
          channel,
          status: "pending",
          target_ref: meta.targets?.[channel] ?? null,
        });
      }
    }
    if (channelRows.length) {
      const { error: channelErr } = await context.supabase.from("social_post_channels").insert(channelRows as never);
      if (channelErr) throw new Error(channelErr.message);
    }

    const assetRows: Array<Record<string, unknown>> = [];
    const formatUsage = new Map<string, number>();
    for (const post of inserted ?? []) {
      const meta =
        (
          post as {
            id: string;
            metadata?: {
              format?: string;
              image_storage_path?: string | null;
              slide_storage_paths?: string[];
            };
          }
        ).metadata ?? {};
      const fmt = meta.format ?? "feed";
      const generatedPaths =
        Array.isArray(meta.slide_storage_paths) && meta.slide_storage_paths.length
          ? meta.slide_storage_paths
          : meta.image_storage_path
            ? [meta.image_storage_path]
            : [];
      if (generatedPaths.length) {
        generatedPaths.forEach((storagePath, position) => {
          assetRows.push({
            post_id: (post as { id: string }).id,
            workspace_id: data.workspaceId,
            storage_path: storagePath,
            kind: "image",
            aspect: fmt,
            ai_generated: true,
            position,
          });
        });
        continue;
      }
      const medias = campaignMedia.filter((m) => m.format === fmt);
      if (!medias.length) continue;
      const useIndex = formatUsage.get(fmt) ?? 0;
      const media = medias[useIndex % medias.length];
      formatUsage.set(fmt, useIndex + 1);
      assetRows.push({
        post_id: (post as { id: string }).id,
        workspace_id: data.workspaceId,
        storage_path: media.storagePath,
        kind: "image",
        aspect: fmt,
        ai_generated: media.source === "ai",
        position: 0,
      });
    }
    if (assetRows.length) {
      const { error: assetErr } = await context.supabase
        .from("social_post_assets")
        .insert(assetRows as never);
      if (assetErr) throw new Error(assetErr.message);
    }
    return { created: rows.length, channelsAttached: channelRows.length, assetsAttached: assetRows.length };
  });

export const logApprovalAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        postId: z.string().uuid(),
        action: z.enum(["submitted", "approved", "rejected", "changes_requested", "reverted"]),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error: logErr } = await context.supabase.from("social_post_approvals").insert({
      workspace_id: data.workspaceId,
      post_id: data.postId,
      actor_id: context.userId,
      action: data.action,
      notes: data.notes ?? null,
    });
    if (logErr) throw new Error(logErr.message);

    const patch: Record<string, unknown> = {};
    if (data.action === "submitted") patch.submitted_for_approval_at = now;
    if (data.action === "approved") {
      patch.approved_by = context.userId;
      patch.approved_at = now;
      patch.rejection_reason = null;
    }
    if (data.action === "rejected") {
      patch.rejection_reason = data.notes ?? null;
    }
    if (data.action === "changes_requested") {
      patch.review_notes = data.notes ?? null;
    }
    if (Object.keys(patch).length) {
      await context.supabase
        .from("social_posts")
        .update(patch as never)
        .eq("id", data.postId)
        .eq("workspace_id", data.workspaceId);
    }
    return { ok: true };
  });

export const listApprovalHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        postId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("social_post_approvals")
      .select("*")
      .eq("post_id", data.postId)
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });

// ═══════════════════ MÉTRICAS ═══════════════════

export const upsertPostMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        postId: z.string().uuid(),
        channel: z.string().min(2),
        likes: z.number().int().min(0).default(0),
        comments: z.number().int().min(0).default(0),
        shares: z.number().int().min(0).default(0),
        saves: z.number().int().min(0).default(0),
        reach: z.number().int().min(0).default(0),
        impressions: z.number().int().min(0).default(0),
        videoViews: z.number().int().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const engagement =
      data.reach > 0
        ? Number(
            (((data.likes + data.comments + data.shares + data.saves) / data.reach) * 100).toFixed(
              2,
            ),
          )
        : null;
    const { error } = await context.supabase.from("social_post_metrics").upsert(
      {
        workspace_id: data.workspaceId,
        post_id: data.postId,
        channel: data.channel,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
        saves: data.saves,
        reach: data.reach,
        impressions: data.impressions,
        video_views: data.videoViews,
        engagement_rate: engagement,
        collected_at: new Date().toISOString(),
      },
      { onConflict: "post_id,channel" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, engagement };
  });

export const listPublishedWithMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { data: posts, error } = await context.supabase
      .from("social_posts")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (posts ?? []).map((p) => (p as { id: string }).id);
    if (!ids.length) return { posts: [], metrics: [], assets: [] };
    const [{ data: metrics }, { data: assets }] = await Promise.all([
      context.supabase.from("social_post_metrics").select("*").in("post_id", ids),
      context.supabase.from("social_post_assets").select("*").in("post_id", ids),
    ]);
    return { posts: posts ?? [], metrics: metrics ?? [], assets: assets ?? [] };
  });

// Resumo de aprendizado: top e piores posts pra IA usar como referência.
export const getLearningSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { data: metrics } = await context.supabase
      .from("social_post_metrics")
      .select("post_id,channel,likes,comments,shares,saves,reach,engagement_rate")
      .eq("workspace_id", data.workspaceId)
      .order("engagement_rate", { ascending: false, nullsFirst: false })
      .limit(50);
    const list = (metrics ?? []) as Array<{
      post_id: string;
      channel: string;
      likes: number;
      comments: number;
      reach: number;
      engagement_rate: number | null;
    }>;
    if (!list.length) return { summary: null, topPostIds: [] as string[] };

    const top = list.slice(0, 5);
    const bottom = list.slice(-3);
    const postIds = Array.from(new Set([...top, ...bottom].map((m) => m.post_id)));
    const { data: posts } = await context.supabase
      .from("social_posts")
      .select("id,title,copy,hashtags,briefing")
      .in("id", postIds);
    const byId = new Map(
      (posts ?? []).map((p) => [
        (p as { id: string }).id,
        p as {
          id: string;
          title: string | null;
          copy: string | null;
          hashtags: string[] | null;
        },
      ]),
    );

    const fmt = (m: (typeof list)[0]) => {
      const p = byId.get(m.post_id);
      if (!p) return null;
      return `- [${m.channel} · eng ${m.engagement_rate ?? "?"}% · ${m.reach} alc] ${p.title ?? "(sem título)"}, ${(p.copy ?? "").slice(0, 120)}`;
    };
    const topBlock = top.map(fmt).filter(Boolean).join("\n");
    const botBlock = bottom.map(fmt).filter(Boolean).join("\n");

    const summary = [
      "APRENDIZADO, desempenho histórico deste workspace:",
      topBlock ? `POSTS DE MAIOR ENGAJAMENTO:\n${topBlock}` : "",
      botBlock ? `POSTS DE MENOR ENGAJAMENTO:\n${botBlock}` : "",
      "USE esse padrão pra sugerir formatos, -ngulos e ganchos parecidos com os de cima. EVITE os padrões dos de baixo.",
    ]
      .filter(Boolean)
      .join("\n\n");

    return { summary, topPostIds: top.map((t) => t.post_id) };
  });

// ═══════════════════ REFINAR BRIEFING DO POST ═══════════════════
// Recebe o rascunho do briefing e devolve versão refinada + prompt de imagem
// pronto pra gerar arte, título sugerido, legenda sugerida.
export const refinePostBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        briefing: z.string().min(3).max(4000),
        format: z.enum(["feed", "reels", "carrossel", "story"]).default("feed"),
        tone: z.string().max(300).optional().nullable(),
        audience: z.string().max(300).optional().nullable(),
        campaignName: z.string().max(200).optional().nullable(),
        campaignObjective: z.string().max(400).optional().nullable(),
        targetImageProvider: z
          .enum(["ideogram", "recraft", "freepik", "gemini"])
          .optional()
          .nullable(),
        targetTextProvider: z.enum(["openai", "gemini"]).optional().nullable(),
        brandId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) throw integrationVaultFailure("encryption-key-missing:refine-post");
    const { data: integrations } = await context.supabase
      .from("integrations")
      .select("provider,status")
      .eq("workspace_id", data.workspaceId)
      .in("provider", ["openai", "gemini"]);
    const connected = new Set(
      ((integrations ?? []) as Array<{ provider: string; status: string }>)
        .filter((r) => r.status === "connected")
        .map((r) => r.provider),
    );
    const requestedTextProvider = data.targetTextProvider;
    const textProvider = requestedTextProvider && connected.has(requestedTextProvider)
      ? requestedTextProvider
      : connected.has("openai")
        ? "openai"
        : connected.has("gemini")
          ? "gemini"
          : null;
    if (!textProvider)
      throw new Error(
        "Conecte sua API Key da OpenAI ou Gemini em Integrações para gerar legendas, tags e prompts.",
      );
    const { data: secret, error: secretError } = await context.supabase.rpc(
      "get_integration_secret",
      { _workspace_id: data.workspaceId, _provider: textProvider, _key: encKey },
    );
    if (secretError) throw integrationVaultFailure("get_integration_secret:refine-post", secretError.message);
    const key =
      (secret as { api_key?: string; apiKey?: string } | null)?.api_key ??
      (secret as { api_key?: string; apiKey?: string } | null)?.apiKey;
    if (!key) throw new Error(`API Key de ${textProvider} não encontrada.`);
    const imageGuidelines =
      data.targetImageProvider === "ideogram"
        ? "\nDIRETRIZES IDEOGRAM V3 PRO: Este modelo é o estado da arte em tipografia e realismo fotográfico. " +
          '1. TEXTO: Sempre coloque textos entre aspas duplas, ex: a neon sign saying "MKTOn". ' +
          "2. ESTILO: Use descritores de alta fidelidade como '8k resolution', 'cinematic lighting', 'macro photography', 'hyper-realistic textures'. " +
          "3. COMPOSIÇÃO: Especifique profundidade de campo (bokeh) e posição dos elementos. " +
          "4. FIDELIDADE: O prompt deve ser em inglês, detalhando cores, materiais e clima."
        : data.targetImageProvider === "recraft"
          ? "\nDIRETRIZES RECRAFT V3: Especialista em design gráfico e vetores. " +
            "Use estilos como 'vector art', 'flat design', '3D render clean', 'minimalist icon' ou 'corporate illustration'. Ideal para assets limpos e branding."
          : data.targetImageProvider === "freepik"
            ? "\nDIRETRIZES FREEPIK (FLUX.1): Foco total em fotorrealismo e anatomia humana perfeita. " +
              "Use descrições de iluminação natural, texturas de pele, tecidos e ambientes reais. Evite termos genéricos, prefira detalhes técnicos de fotografia (ISO, f-stop)."
            : data.targetImageProvider === "gemini"
              ? "\nDIRETRIZES GEMINI IMAGEN: Foco em criatividade e prompts conceituais rápidos. Bom para posts de story e briefings abstratos."
              : "";

    // Busca contexto da marca se houver brandId ou workspaceId
    let brandContext = "";
    const effectiveBrandId = data.brandId;

    let brandQuery = context.supabase
      .from("social_brand_context")
      .select("*")
      .eq("workspace_id", data.workspaceId);

    if (effectiveBrandId) {
      brandQuery = brandQuery.eq("id", effectiveBrandId);
    }

    const { data: brand } = await brandQuery.maybeSingle();

    if (brand) {
      const b = brand as {
        company_name?: string | null;
        segment?: string | null;
        visual_style?: string | null;
        estilo_visual_desejado?: string | null;
        brand_colors?: string | null;
        main_promise?: string | null;
        promessa_principal?: string | null;
        target_audience?: string | null;
        visual_memory?: string | null;
        palavras_proibidas?: string[] | null;
      };
      brandContext =
        `\nREFERÊNCIA DA MARCA:\n` +
        `- Nome: ${b.company_name || "N/A"}\n` +
        `- Segmento: ${b.segment || "N/A"}\n` +
        `- Estilo Visual: ${b.visual_style || b.estilo_visual_desejado || "N/A"}\n` +
        `- Cores: ${b.brand_colors || "N/A"}\n` +
        `- Promessa: ${b.main_promise || b.promessa_principal || "N/A"}\n` +
        `- Público: ${b.target_audience || "N/A"}\n` +
        `- Memória Visual (IA): ${b.visual_memory || "N/A"}\n` +
        `- Proibido: ${(b.palavras_proibidas || []).join(", ") || "N/A"}`;

      // Busca referências específicas (like/dislike)
      const { data: refs } = await context.supabase
        .from("social_brand_references")
        .select("label,analysis,sentiment")
        .eq("workspace_id", data.workspaceId)
        .eq("is_active", true)
        .eq("status", "ready");

      if (refs && refs.length > 0) {
        const likes = refs
          .filter((r: { sentiment?: string | null }) => r.sentiment === "like")
          .map((r: { label?: string | null }) => r.label || "Ref Positiva")
          .join(", ");
        const dislikes = refs
          .filter((r: { sentiment?: string | null }) => r.sentiment === "dislike")
          .map((r: { label?: string | null }) => r.label || "Ref Negativa")
          .join(", ");
        brandContext += `\n- Referências Positivas: ${likes || "Nenhum"}`;
        brandContext += `\n- Referências Negativas (EVITAR): ${dislikes || "Nenhum"}`;
      }
    }

    const prompt = [
      "Você é diretor de arte + copywriter sênior de social media.",
      `Contexto da campanha: ${data.campaignName ?? "(sem nome)"}, objetivo: ${data.campaignObjective ?? "(não informado)"}.`,
      "CONSIDERE a marca do cliente como o tom principal da comunicação.",
      brandContext,
      data.audience ? `Público-alvo: ${data.audience}.` : "",
      data.tone ? `Tom de voz: ${data.tone}.` : "",
      `Formato do post: ${data.format}.`,
      `Briefing bruto do cliente:\n"""${data.briefing}"""`,
      imageGuidelines,
      "",
      "Devolva SOMENTE um JSON válido com o formato exato:",
      `{`,
      `  "refinedBriefing": "briefing reescrito, mais claro, com direção editorial, cor emocional, elementos obrigatórios e o que não pode faltar",`,
      `  "imagePrompt": "prompt em inglês, altamente descritivo, para gerar a arte visual (composição, luz, paleta, elementos, estilo). Se for carrossel, descreva uma série de 4 imagens coerentes com textos curtos em inglês em cada slide que seguem o método AIDA.",`,
      `  "suggestedTitle": "título curto pra usar no calendário editorial (max 60 caracteres)",`,
      `  "suggestedCaption": "legenda pronta em pt-BR (max 1200 chars) com gancho + desenvolvimento + CTA. Para carrossel, inclua o texto que deve aparecer escrito EM CADA SLIDE (ex: Slide 1: Texto X, Slide 2: Texto Y) no briefing refinado ou aqui.",`,
      `  "suggestedHashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],`,
      `  "suggestedFirstComment": "primeiro comentário fixado com reforço do CTA, sem depender das hashtags"`,
      `}`,
      "",
      "CRÍTICO PARA CARROSSEL:",
      "1. A ALMA do carrossel é a legenda ESCRITA NA IMAGEM. Cada imagem PRECISA ter um texto curto e estratégico.",
      "2. O carrossel deve seguir o método AIDA (Atenção, Interesse, Desejo, Ação).",
      "3. Não gere blocos gigantes de texto para a imagem. Use frases curtas que instiguem o lead a arrastar para o próximo slide.",
      "4. No prompt de imagem (imagePrompt), especifique EXATAMENTE qual texto curto deve estar escrito em cada um dos 4 slides (Slide 1: '...', Slide 2: '...', etc).",
      "5. Garanta consistência visual entre os slides.",
    ]
      .filter(Boolean)
      .join("\n");
    let raw = "{}";
    if (textProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      raw = json.choices?.[0]?.message?.content ?? "{}";
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    }
    const aiResult = JSON.parse(raw);

    // A geração de imagem ocorre client-side para manter o contexto de autenticação e streaming UI
    return { ...aiResult, carouselImages: [] };
  });
