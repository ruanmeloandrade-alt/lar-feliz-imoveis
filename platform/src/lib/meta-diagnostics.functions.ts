import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";

export const getMetaDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Membro do workspace obrigatório
    const { data: mem } = await context.supabase
      .from("workspace_members").select("workspace_id")
      .eq("workspace_id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (!mem) throw new Error("Workspace não encontrado ou sem permissão.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;

    const [
      integResp, pagesResp, igResp, adResp, pxResp, eventsResp,
      countsResp1, countsResp7, countsResp30, errorsResp,
    ] = await Promise.all([
      admin.from("integrations").select("status,last_error,last_check_at,metadata,expires_at,created_at,updated_at")
        .eq("workspace_id", data.workspaceId).eq("provider", "meta").maybeSingle(),
      admin.from("meta_pages").select("page_id,page_name,messaging_subscribed_at,messaging_error,synced_at", { count: "exact" })
        .eq("workspace_id", data.workspaceId),
      admin.from("meta_instagram_accounts").select("instagram_id,username,messaging_subscribed_at,messaging_error,synced_at", { count: "exact" })
        .eq("workspace_id", data.workspaceId),
      admin.from("meta_ad_accounts").select("account_id,name,currency,synced_at", { count: "exact" })
        .eq("workspace_id", data.workspaceId),
      admin.from("meta_pixels").select("pixel_id,pixel_name,last_fired_time", { count: "exact" })
        .eq("workspace_id", data.workspaceId),
      admin.from("webhook_events")
        .select("id,event_type,event_id,signature_ok,processing_error,received_at,processed_at,payload")
        .eq("provider", "meta").eq("workspace_id", data.workspaceId)
        .order("received_at", { ascending: false }).limit(30),
      admin.from("webhook_events").select("id", { count: "exact", head: true })
        .eq("provider", "meta").eq("workspace_id", data.workspaceId)
        .gte("received_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      admin.from("webhook_events").select("id", { count: "exact", head: true })
        .eq("provider", "meta").eq("workspace_id", data.workspaceId)
        .gte("received_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      admin.from("webhook_events").select("id", { count: "exact", head: true })
        .eq("provider", "meta").eq("workspace_id", data.workspaceId)
        .gte("received_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
      admin.from("webhook_events").select("id", { count: "exact", head: true })
        .eq("provider", "meta").eq("workspace_id", data.workspaceId)
        .not("processing_error", "is", null)
        .gte("received_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
    ]);

    const integ = integResp.data;
    const expiresAt = integ?.expires_at ?? (integ?.metadata as { expires_at?: string } | null)?.expires_at ?? null;
    const daysToExpire = expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)) : null;
    const publicAppUrl = resolvePublicAppUrl();

    return {
      integration: integ ? {
        status: integ.status,
        connectedAt: (integ.metadata as { connected_at?: string } | null)?.connected_at ?? integ.created_at,
        expiresAt, daysToExpire,
        lastCheckAt: integ.last_check_at, lastError: integ.last_error,
        facebookUserName: (integ.metadata as { facebook_user_name?: string } | null)?.facebook_user_name ?? null,
        businesses: ((integ.metadata as { businesses?: Array<{ id: string; name?: string | null }> } | null)?.businesses) ?? [],
      } : null,
      resources: {
        pages: { count: pagesResp.count ?? 0, items: pagesResp.data ?? [] },
        instagram: { count: igResp.count ?? 0, items: igResp.data ?? [] },
        adAccounts: { count: adResp.count ?? 0, items: adResp.data ?? [] },
        pixels: { count: pxResp.count ?? 0, items: pxResp.data ?? [] },
      },
      webhook: {
        verifyTokenConfigured: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
        appSecretConfigured: !!process.env.META_APP_SECRET,
        callbackUrl: `${publicAppUrl}/api/public/webhooks/meta`,
        deauthorizeUrl: `${publicAppUrl}/api/public/oauth/meta/deauthorize`,
        dataDeletionUrl: `${publicAppUrl}/api/public/oauth/meta/data-deletion`,
      },
      events: {
        recent: eventsResp.data ?? [],
        counts: {
          last24h: countsResp1.count ?? 0,
          last7d: countsResp7.count ?? 0,
          last30d: countsResp30.count ?? 0,
          errorsLast7d: errorsResp.count ?? 0,
        },
      },
    };
  });
