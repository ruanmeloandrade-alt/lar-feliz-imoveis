import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH = "v23.0";

type Ctx = {
  supabase: SupabaseClient;
  workspaceId: string;
};

type MetaAction = { action_type?: string; value?: string };

type MetaAdPerformance = {
  id?: string;
  name?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: { id?: string };
  insights?: {
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
      cpc?: string;
      actions?: MetaAction[];
      purchase_roas?: MetaAction[];
    }>;
  };
};

async function loadMetaToken(supabase: SupabaseClient, workspaceId: string): Promise<string | null> {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) return null;
  const { data, error } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "meta",
    _key: key,
  });
  if (error) return null;
  return ((data as { access_token?: string } | null)?.access_token ?? null);
}

function sumActions(actions: MetaAction[] | undefined, names: string[]) {
  return (actions ?? []).reduce((sum, row) => names.includes(row.action_type ?? "") ? sum + (Number(row.value) || 0) : sum, 0);
}

async function loadAdPerformance(adId: string, token: string): Promise<MetaAdPerformance | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${adId}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", "id,name,campaign_id,adset_id,creative{id},insights.date_preset(last_7d){spend,impressions,clicks,ctr,cpc,actions,purchase_roas}");
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  return response.json() as Promise<MetaAdPerformance>;
}

export function buildCreativePerformanceTools({ supabase, workspaceId }: Ctx) {
  return {
    search_creatives: tool({
      description: "Busca criativos reais da Central de Criativos e, quando existe vínculo determinístico com anúncio Meta, acrescenta performance real dos últimos 7 dias. Use para escolher ou recomendar criativos. Só trate um criativo como comparável por desempenho quando performance.recommendationEligible=true; nunca infira performance por nome, arquivo ou ID parcial.",
      inputSchema: z.object({
        folderId: z.string().uuid().nullable().optional().describe("null = raiz; undefined = todas as pastas"),
        query: z.string().optional().describe("Substring em display_name/original_filename"),
        kind: z.enum(["image", "video"]).optional(),
      }),
      execute: async ({ folderId, query, kind }) => {
        let q = supabase.from("meta_creative_uploads")
          .select("id,folder_id,display_name,original_filename,storage_path,mime,kind,tags,width,height,created_at,ad_account_id,meta_creative_id,meta_ad_id,meta_adset_id,meta_campaign_id,linked_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (folderId === null) q = q.is("folder_id", null);
        else if (folderId) q = q.eq("folder_id", folderId);
        if (kind) q = q.eq("kind", kind);
        if (query?.trim()) {
          const s = query.trim();
          q = q.or(`display_name.ilike.%${s}%,original_filename.ilike.%${s}%`);
        }

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const uploads = (data ?? []) as Array<Record<string, unknown>>;
        const token = await loadMetaToken(supabase, workspaceId);

        const enriched = await Promise.all(uploads.map(async (upload) => {
          const adId = typeof upload.meta_ad_id === "string" ? upload.meta_ad_id : null;
          if (!adId) {
            return {
              ...upload,
              performance: {
                source: "meta",
                period: "last_7d",
                status: "unlinked",
                recommendationEligible: false,
                reason: "Criativo sem vínculo determinístico com ad_id; não há performance comprovada para recomendar por resultado.",
              },
            };
          }
          if (!token) {
            return {
              ...upload,
              performance: {
                source: "meta",
                period: "last_7d",
                status: "unavailable",
                recommendationEligible: false,
                reason: "Vínculo com ad_id existe, mas a leitura de performance Meta está indisponível nesta execução.",
              },
            };
          }

          const ad = await loadAdPerformance(adId, token);
          const ins = ad?.insights?.data?.[0];
          if (!ad || !ins) {
            return {
              ...upload,
              performance: {
                source: "meta",
                period: "last_7d",
                status: "no_delivery_data",
                recommendationEligible: false,
                reason: "Anúncio vinculado sem dados de entrega no período; não comparar como vencedor/perdedor.",
              },
            };
          }

          const spend = Number(ins.spend ?? 0) || 0;
          const impressions = Number(ins.impressions ?? 0) || 0;
          const clicks = Number(ins.clicks ?? 0) || 0;
          const leads = sumActions(ins.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
          const roas = Number(ins.purchase_roas?.[0]?.value ?? 0) || 0;
          const eligible = impressions > 0 && spend > 0;

          return {
            ...upload,
            performance: {
              source: "meta",
              period: "last_7d",
              status: eligible ? "measured" : "no_delivery_data",
              recommendationEligible: eligible,
              adId,
              adName: ad.name ?? null,
              campaignId: ad.campaign_id ?? upload.meta_campaign_id ?? null,
              adsetId: ad.adset_id ?? upload.meta_adset_id ?? null,
              creativeId: ad.creative?.id ?? upload.meta_creative_id ?? null,
              spend,
              impressions,
              clicks,
              ctr: Number(ins.ctr ?? 0) || 0,
              cpc: Number(ins.cpc ?? 0) || 0,
              leads,
              cpl: leads > 0 ? spend / leads : null,
              roas,
              reason: eligible
                ? "Performance Meta medida no anúncio ligado por ad_id exato. Compare métricas conforme o objetivo da estratégia."
                : "Sem entrega suficiente no período para recomendar por performance.",
            },
          };
        }));

        const measuredCount = enriched.filter((row) => (row as { performance?: { recommendationEligible?: boolean } }).performance?.recommendationEligible).length;
        return {
          creatives: enriched,
          performanceSummary: {
            source: "meta",
            period: "last_7d",
            measuredCount,
            canRankByPerformance: measuredCount >= 2,
            guidance: measuredCount >= 2
              ? "Há pelo menos dois criativos com entrega real comparável. Recomende conforme objetivo e explique as métricas usadas."
              : "Dados insuficientes para declarar vencedor. Pode recomendar por adequação estratégica, deixando explícito que não é uma recomendação baseada em performance.",
          },
        };
      },
    }),
  };
}
