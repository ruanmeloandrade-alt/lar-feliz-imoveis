import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreativeAttributionRow = {
  id: string;
  displayName: string;
  originalFilename: string | null;
  metaImageHash: string | null;
  adAccountId: string;
  metaCreativeId: string | null;
  metaAdId: string | null;
  metaAdsetId: string | null;
  metaCampaignId: string | null;
  linkedAt: string | null;
  attributedEvents: number;
  attributedValue: number;
  attributionKey: "ad_id" | null;
};

export function matchesDeterministicAdAttribution(
  utmContent: string | null | undefined,
  adId: string | null | undefined,
): boolean {
  if (!utmContent || !adId) return false;
  return utmContent.trim() === adId.trim();
}

export const listCreativeAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    limit: z.number().int().min(1).max(200).default(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: uploads, error } = await context.supabase
      .from("meta_creative_uploads")
      .select("id,display_name,original_filename,meta_image_hash,ad_account_id,meta_creative_id,meta_ad_id,meta_adset_id,meta_campaign_id,linked_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const adIds = Array.from(new Set((uploads ?? [])
      .map((u: { meta_ad_id?: string | null }) => u.meta_ad_id)
      .filter((v: string | null | undefined): v is string => !!v)));

    const eventMap = new Map<string, { count: number; value: number }>();
    if (adIds.length) {
      const { data: events, error: eventsError } = await context.supabase
        .from("tracking_events")
        .select("utm_content,value")
        .eq("workspace_id", data.workspaceId)
        .in("utm_content", adIds);
      if (eventsError) throw new Error(eventsError.message);

      for (const event of events ?? []) {
        const key = typeof event.utm_content === "string" ? event.utm_content.trim() : "";
        if (!key || !adIds.includes(key)) continue;
        const prev = eventMap.get(key) ?? { count: 0, value: 0 };
        prev.count += 1;
        prev.value += typeof event.value === "number" ? event.value : Number(event.value ?? 0) || 0;
        eventMap.set(key, prev);
      }
    }

    const rows: CreativeAttributionRow[] = (uploads ?? []).map((u: {
      id: string;
      display_name?: string | null;
      original_filename?: string | null;
      meta_image_hash?: string | null;
      ad_account_id?: string | null;
      meta_creative_id?: string | null;
      meta_ad_id?: string | null;
      meta_adset_id?: string | null;
      meta_campaign_id?: string | null;
      linked_at?: string | null;
    }) => {
      const metric = u.meta_ad_id ? eventMap.get(u.meta_ad_id) : undefined;
      return {
        id: u.id,
        displayName: u.display_name || u.original_filename || "Criativo sem nome",
        originalFilename: u.original_filename ?? null,
        metaImageHash: u.meta_image_hash ?? null,
        adAccountId: u.ad_account_id ?? "",
        metaCreativeId: u.meta_creative_id ?? null,
        metaAdId: u.meta_ad_id ?? null,
        metaAdsetId: u.meta_adset_id ?? null,
        metaCampaignId: u.meta_campaign_id ?? null,
        linkedAt: u.linked_at ?? null,
        attributedEvents: metric?.count ?? 0,
        attributedValue: metric?.value ?? 0,
        attributionKey: u.meta_ad_id ? "ad_id" : null,
      };
    });

    return { rows };
  });
