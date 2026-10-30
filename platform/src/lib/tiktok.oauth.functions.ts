import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function activeWorkspace(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const id = data?.current_workspace_id as string | undefined;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

export const startTikTokAdsOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ redirectOrigin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const oauth = await import("./tiktok.oauth.server");
    const workspaceId = await activeWorkspace(context.supabase, context.userId);
    const { appId } = oauth.tiktokAdsEnv();
    const redirectUri = `${data.redirectOrigin}/api/public/oauth/tiktok/callback`;
    const state = await oauth.buildTikTokAdsState(workspaceId);
    return { authorizeUrl: oauth.buildTikTokAdsAuthUrl({ appId, redirectUri, state }) };
  });

export const getTikTokAdsOAuthStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const oauth = await import("./tiktok.oauth.server");
    const workspaceId = await activeWorkspace(context.supabase, context.userId);
    const key = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
    const { data } = await context.supabase.rpc("get_integration_secret", {
      _workspace_id: workspaceId,
      _provider: "tiktok",
      _key: key,
    });
    const secret = (data ?? {}) as { access_token?: string; advertiser_id?: string };
    let advertisers: Array<{ id: string; name: string }> = [];
    if (secret.access_token) {
      try {
        advertisers = await oauth.listAuthorizedTikTokAdvertisers(secret.access_token);
      } catch {
        // Conexões legadas podem não permitir enumerar advertisers.
      }
    }
    return {
      envReady: oauth.tiktokAdsEnvReady(),
      connected: Boolean(secret.access_token),
      selectedAdvertiserId: secret.advertiser_id ?? null,
      advertisers,
      needsAdvertiserSelection: advertisers.length > 1 && !secret.advertiser_id,
    };
  });

export const selectTikTokAdvertiser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ advertiserId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const oauth = await import("./tiktok.oauth.server");
    const workspaceId = await activeWorkspace(context.supabase, context.userId);
    const key = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
    const { data: raw, error: readError } = await context.supabase.rpc("get_integration_secret", {
      _workspace_id: workspaceId,
      _provider: "tiktok",
      _key: key,
    });
    if (readError) throw new Error(readError.message);
    const secret = (raw ?? {}) as Record<string, unknown> & { access_token?: string };
    if (!secret.access_token) {
      throw new Error("Conecte o TikTok Ads antes de selecionar o advertiser.");
    }
    const advertisers = await oauth.listAuthorizedTikTokAdvertisers(secret.access_token);
    if (!advertisers.some((a) => a.id === data.advertiserId)) {
      throw new Error("Este advertiser não pertence à autorização TikTok deste workspace.");
    }
    const next = { ...secret, advertiser_id: data.advertiserId };
    const { error } = await context.supabase.rpc("set_integration_secret", {
      _workspace_id: workspaceId,
      _provider: "tiktok",
      _plaintext: JSON.parse(JSON.stringify(next)),
      _key: key,
      _metadata: JSON.parse(
        JSON.stringify({
          advertiser_id: data.advertiserId,
          oauth: true,
          updated_at: new Date().toISOString(),
        }),
      ),
      _status: "connected",
    });
    if (error) throw new Error(error.message);
    return { ok: true, advertiserId: data.advertiserId };
  });
