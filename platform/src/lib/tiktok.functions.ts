import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySb, TikTokAdvertiser, TikTokProfile } from "./tiktok.server";

const SaveSchema = z.object({
  accessToken: z.string().min(10),
  businessId: z.string().trim().optional(),
  advertiserId: z.string().trim().optional(),
  pixelId: z.string().trim().optional(),
  pixelAccessToken: z.string().trim().optional(),
});

const VideoSchema = z.object({ cursor: z.number().int().optional() });
const CommentsSchema = z.object({ videoId: z.string().min(1), cursor: z.number().int().optional() });
const ReplySchema = z.object({
  videoId: z.string().min(1),
  commentId: z.string().min(1),
  text: z.string().trim().min(1).max(150),
});
const ModerateSchema = z.object({ commentIds: z.array(z.string().min(1)).min(1), hide: z.boolean() });
const LikeSchema = z.object({ commentId: z.string().min(1), like: z.boolean() });
const PixelSchema = z.object({
  eventName: z.string().trim().min(1),
  url: z.string().trim().url().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  value: z.number().optional(),
  currency: z.string().trim().length(3).optional(),
  testEventCode: z.string().trim().optional(),
});

export const saveTikTokIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const token = data.accessToken.trim();

    let profile: TikTokProfile | null = null;
    let advertiser: TikTokAdvertiser | null = null;
    const errors: string[] = [];

    if (data.businessId) {
      try {
        profile = await m.fetchTikTokProfile(token, data.businessId);
      } catch (e) {
        errors.push(`Conta orgânica: ${(e as Error).message}`);
      }
    }
    if (data.advertiserId) {
      try {
        advertiser = await m.fetchTikTokAdvertiser(token, data.advertiserId);
      } catch (e) {
        errors.push(`Ads: ${(e as Error).message}`);
      }
    }
    if (!profile && !advertiser) {
      throw new Error(
        errors.length
          ? errors.join(" | ")
          : "Informe pelo menos um Business ID (conta TikTok) ou Advertiser ID (TikTok Ads) para validar o token.",
      );
    }

    await m.writeTikTokSecret(sb, {
      workspaceId,
      payload: {
        access_token: token,
        business_id: data.businessId || undefined,
        advertiser_id: data.advertiserId || undefined,
        pixel_id: data.pixelId || undefined,
        pixel_access_token: data.pixelAccessToken || undefined,
      },
      metadata: {
        masked: m.maskToken(token),
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        followers_count: profile?.followers_count ?? null,
        video_count: profile?.video_count ?? null,
        advertiser_name: advertiser?.advertiser_name ?? null,
        advertiser_currency: advertiser?.currency ?? null,
        pixel_id: data.pixelId || null,
        organic_ok: !!profile,
        ads_ok: !!advertiser,
        partial_errors: errors,
        connected_at: new Date().toISOString(),
      },
      status: "connected",
    });

    return { ok: true, profile, advertiser, warnings: errors };
  });

export const getTikTokStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const { data } = await sb
      .from("integrations")
      .select("status,metadata,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", "tiktok")
      .maybeSingle();
    const row = data as { status?: string; metadata?: Record<string, unknown>; updated_at?: string } | null;
    return {
      connected: row?.status === "connected",
      status: row?.status ?? "disconnected",
      metadata: (row?.metadata ?? {}) as Record<string, string | number | boolean | null>,
      updatedAt: row?.updated_at ?? null,
    };
  });

export const disconnectTikTok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const { error } = await sb
      .from("integrations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("provider", "tiktok");
    if (error) throw new Error(error.message ?? "Falha ao desconectar TikTok.");
    return { ok: true };
  });

export const listTikTokVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.business_id) throw new Error("Conta orgânica do TikTok não conectada (Business ID ausente).");
    return m.fetchTikTokVideos(secret.access_token, secret.business_id, data.cursor);
  });

export const listTikTokComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommentsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.business_id) throw new Error("Conta orgânica do TikTok não conectada (Business ID ausente).");
    return m.fetchTikTokComments(secret.access_token, secret.business_id, data.videoId, data.cursor);
  });

export const replyTikTokComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReplySchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.business_id) throw new Error("Conta orgânica do TikTok não conectada (Business ID ausente).");
    const res = await m.replyTikTokCommentApi(secret.access_token, {
      businessId: secret.business_id,
      videoId: data.videoId,
      commentId: data.commentId,
      text: data.text,
    });
    return { ok: true, commentId: res.comment_id ?? null };
  });

export const moderateTikTokComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ModerateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.business_id) throw new Error("Conta orgânica do TikTok não conectada (Business ID ausente).");
    await m.hideTikTokCommentApi(secret.access_token, {
      businessId: secret.business_id,
      commentIds: data.commentIds,
      hide: data.hide,
    });
    return { ok: true };
  });

export const likeTikTokComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LikeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.business_id) throw new Error("Conta orgânica do TikTok não conectada (Business ID ausente).");
    await m.likeTikTokCommentApi(secret.access_token, {
      businessId: secret.business_id,
      commentId: data.commentId,
      like: data.like,
    });
    return { ok: true };
  });

export const listTikTokCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.advertiser_id) throw new Error("TikTok Ads não conectado (Advertiser ID ausente).");
    const list = await m.fetchTikTokCampaigns(secret.access_token, secret.advertiser_id);
    return { campaigns: list };
  });

export const sendTikTokPixelEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PixelSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./tiktok.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readTikTokSecret(sb, workspaceId);
    if (!secret.pixel_id) throw new Error("Pixel TikTok não configurado nesta central.");
    await m.sendTikTokPixelEventApi({
      token: secret.pixel_access_token || secret.access_token,
      pixelId: secret.pixel_id,
      eventName: data.eventName,
      url: data.url,
      email: data.email,
      phone: data.phone,
      value: data.value,
      currency: data.currency,
      testEventCode: data.testEventCode,
    });
    return { ok: true };
  });
