import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type TurnImage = { index: number; base64: string; mime: string; name: string };
type Ctx = {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  turnImages: TurnImage[];
};

type TikTokSecret = {
  access_token?: string;
  advertiser_id?: string;
};

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
const GOOGLE_ADS_API = "https://googleads.googleapis.com/v25";

function encryptionKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  return key;
}

async function integrationSecret(
  sb: SupabaseClient,
  workspaceId: string,
  provider: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: provider,
    _key: encryptionKey(),
  });
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null) ?? null;
}

async function googleRuntime(sb: SupabaseClient, workspaceId: string) {
  const m = await import("../google.server");
  const { token, secret } = await m.getGoogleAccessToken(sb as never, workspaceId);
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    throw new Error(
      "Google Ads indisponível: GOOGLE_ADS_DEVELOPER_TOKEN precisa ser configurado pela Vanessa Simoni no servidor. O cliente não deve informar esse token.",
    );
  }
  return { m, token, secret, developerToken };
}

async function googleMutateCampaignStatus(args: {
  token: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
  campaignId: string;
  status: "ENABLED" | "PAUSED";
}) {
  const customerId = args.customerId.replace(/\D/g, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
    "developer-token": args.developerToken,
    "Content-Type": "application/json",
  };
  const login = (args.loginCustomerId ?? "").replace(/\D/g, "");
  if (login) headers["login-customer-id"] = login;
  const r = await fetch(`${GOOGLE_ADS_API}/customers/${customerId}/campaigns:mutate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${customerId}/campaigns/${args.campaignId}`,
            status: args.status,
          },
          updateMask: "status",
        },
      ],
      partialFailure: false,
      validateOnly: false,
    }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google Ads ${r.status}: ${txt.slice(0, 500)}`);
  return txt ? JSON.parse(txt) : {};
}

async function tiktokSecret(sb: SupabaseClient, workspaceId: string): Promise<TikTokSecret> {
  const secret = (await integrationSecret(sb, workspaceId, "tiktok")) as TikTokSecret | null;
  if (!secret?.access_token) {
    throw new Error("TikTok Ads não conectado neste workspace.");
  }
  return secret;
}

async function tiktokGet<T>(
  path: string,
  token: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${TIKTOK_API}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: { "Access-Token": token, "Content-Type": "application/json" },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`TikTok ${path} ${r.status}: ${txt.slice(0, 500)}`);
  const parsed = JSON.parse(txt) as { code?: number; message?: string } & T;
  if (parsed.code && parsed.code !== 0) {
    throw new Error(`TikTok ${path}: ${parsed.message ?? `code ${parsed.code}`}`);
  }
  return parsed;
}

async function tiktokPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const r = await fetch(`${TIKTOK_API}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`TikTok ${path} ${r.status}: ${txt.slice(0, 500)}`);
  const parsed = JSON.parse(txt) as { code?: number; message?: string } & T;
  if (parsed.code && parsed.code !== 0) {
    throw new Error(`TikTok ${path}: ${parsed.message ?? `code ${parsed.code}`}`);
  }
  return parsed;
}

async function listTikTokAdvertisersInternal(sb: SupabaseClient, workspaceId: string) {
  const secret = await tiktokSecret(sb, workspaceId);
  try {
    const r = await tiktokGet<{
      data?: { list?: Array<{ advertiser_id?: string; advertiser_name?: string }> };
    }>("oauth2/advertiser/get/", secret.access_token as string, {});
    const list = r.data?.list ?? [];
    if (list.length) return list;
  } catch {
    // Tokens legados podem não ter permissão para enumerar advertisers.
  }
  if (!secret.advertiser_id) return [];
  try {
    const r = await tiktokGet<{
      data?: { list?: Array<{ advertiser_id?: string; name?: string; advertiser_name?: string }> };
    }>("advertiser/info/", secret.access_token as string, {
      advertiser_ids: JSON.stringify([secret.advertiser_id]),
      fields: JSON.stringify(["advertiser_id", "name"]),
    });
    return (r.data?.list ?? []).map((a) => ({
      advertiser_id: a.advertiser_id ?? secret.advertiser_id,
      advertiser_name: a.advertiser_name ?? a.name ?? `Advertiser ${secret.advertiser_id}`,
    }));
  } catch {
    return [
      {
        advertiser_id: secret.advertiser_id,
        advertiser_name: `Advertiser ${secret.advertiser_id}`,
      },
    ];
  }
}

function isoDate(daysAgo: number) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function tiktokReport(args: {
  token: string;
  advertiserId: string;
  level: "campaign" | "adgroup" | "ad";
  days: number;
}) {
  const map = {
    campaign: { dataLevel: "AUCTION_CAMPAIGN", dimension: "campaign_id" },
    adgroup: { dataLevel: "AUCTION_ADGROUP", dimension: "adgroup_id" },
    ad: { dataLevel: "AUCTION_AD", dimension: "ad_id" },
  } as const;
  const spec = map[args.level];
  const r = await tiktokGet<{
    data?: {
      list?: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>;
    };
  }>("report/integrated/get/", args.token, {
    advertiser_id: args.advertiserId,
    service_type: "AUCTION",
    report_type: "BASIC",
    data_level: spec.dataLevel,
    dimensions: JSON.stringify([spec.dimension]),
    metrics: JSON.stringify([
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "conversion",
      "cost_per_conversion",
    ]),
    start_date: isoDate(Math.max(1, Math.min(args.days, 365)) - 1),
    end_date: isoDate(0),
    page: "1",
    page_size: "1000",
  });
  return r.data?.list ?? [];
}

export function buildPaidMediaProviderTools(ctx: Ctx) {
  const { supabase, workspaceId } = ctx;
  return {
    list_google_ad_accounts: tool({
      description:
        "Lista as contas Google Ads autorizadas pelo cliente. O OAuth é do cliente; Developer Token é credencial técnica da Vanessa Simoni no servidor.",
      inputSchema: z.object({}),
      execute: async () => {
        const { m, token, secret, developerToken } = await googleRuntime(supabase, workspaceId);
        const ids = await m.adsListAccessibleCustomers(token, developerToken);
        const accounts = [] as Array<{
          id: string;
          name: string;
          currency: string;
          manager: boolean;
        }>;
        for (const id of ids.slice(0, 50)) {
          try {
            const rows = await m.adsSearch<{
              customer?: {
                id?: string;
                descriptiveName?: string;
                currencyCode?: string;
                manager?: boolean;
              };
            }>({
              token,
              developerToken,
              customerId: id,
              loginCustomerId: secret.ads_login_customer_id,
              query: m.ADS_ACCOUNT_QUERY,
            });
            const c = rows[0]?.customer;
            accounts.push({
              id,
              name: c?.descriptiveName ?? `Conta ${id}`,
              currency: c?.currencyCode ?? "",
              manager: Boolean(c?.manager),
            });
          } catch {
            accounts.push({ id, name: `Conta ${id}`, currency: "", manager: false });
          }
        }
        return { accounts, selectedCustomerId: secret.ads_customer_id ?? null };
      },
    }),

    list_google_campaigns: tool({
      description: "Lista campanhas Google Ads com gasto, impressões, cliques, CTR e conversões.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        days: z.number().int().min(1).max(365).default(30),
      }),
      execute: async ({ customerId, days }) => {
        const { m, token, secret, developerToken } = await googleRuntime(supabase, workspaceId);
        const id = customerId || secret.ads_customer_id;
        if (!id) throw new Error("Selecione uma conta Google Ads antes de listar campanhas.");
        const rows = await m.adsSearch({
          token,
          developerToken,
          customerId: id,
          loginCustomerId: secret.ads_login_customer_id,
          query: m.adsCampaignQuery(days),
        });
        return { customerId: id, campaigns: rows };
      },
    }),

    list_google_ad_groups: tool({
      description: "Lista conjuntos/grupos de anúncios Google Ads com métricas.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        campaignId: z.string().optional(),
        days: z.number().int().min(1).max(90).default(30),
      }),
      execute: async ({ customerId, campaignId, days }) => {
        const { m, token, secret, developerToken } = await googleRuntime(supabase, workspaceId);
        const id = customerId || secret.ads_customer_id;
        if (!id) throw new Error("Selecione uma conta Google Ads.");
        const where = campaignId ? ` AND campaign.id = ${campaignId.replace(/\D/g, "")}` : "";
        const query = `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions FROM ad_group WHERE segments.date DURING LAST_${days <= 7 ? "7" : days <= 14 ? "14" : "30"}_DAYS${where} ORDER BY metrics.cost_micros DESC`;
        const rows = await m.adsSearch({
          token,
          developerToken,
          customerId: id,
          loginCustomerId: secret.ads_login_customer_id,
          query,
        });
        return { customerId: id, adGroups: rows };
      },
    }),

    list_google_ads: tool({
      description: "Lista anúncios Google Ads com campanha, grupo, status e métricas.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        adGroupId: z.string().optional(),
        days: z.number().int().min(1).max(90).default(30),
      }),
      execute: async ({ customerId, adGroupId, days }) => {
        const { m, token, secret, developerToken } = await googleRuntime(supabase, workspaceId);
        const id = customerId || secret.ads_customer_id;
        if (!id) throw new Error("Selecione uma conta Google Ads.");
        const where = adGroupId ? ` AND ad_group.id = ${adGroupId.replace(/\D/g, "")}` : "";
        const query = `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions FROM ad_group_ad WHERE segments.date DURING LAST_${days <= 7 ? "7" : days <= 14 ? "14" : "30"}_DAYS${where} ORDER BY metrics.cost_micros DESC`;
        const rows = await m.adsSearch({
          token,
          developerToken,
          customerId: id,
          loginCustomerId: secret.ads_login_customer_id,
          query,
        });
        return { customerId: id, ads: rows };
      },
    }),

    set_google_campaign_status: tool({
      description:
        "Pausa ou ativa uma campanha Google Ads real. Use somente quando o usuário pedir explicitamente a ação.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        campaignId: z.string().min(1),
        status: z.enum(["ENABLED", "PAUSED"]),
      }),
      execute: async ({ customerId, campaignId, status }) => {
        const { token, secret, developerToken } = await googleRuntime(supabase, workspaceId);
        const id = customerId || secret.ads_customer_id;
        if (!id) throw new Error("Selecione uma conta Google Ads.");
        const result = await googleMutateCampaignStatus({
          token,
          developerToken,
          customerId: id,
          loginCustomerId: secret.ads_login_customer_id,
          campaignId,
          status,
        });
        return { ok: true, customerId: id, campaignId, status, result };
      },
    }),

    list_tiktok_advertisers: tool({
      description: "Lista advertisers TikTok Ads autorizados/conectados ao workspace.",
      inputSchema: z.object({}),
      execute: async () => ({
        advertisers: await listTikTokAdvertisersInternal(supabase, workspaceId),
      }),
    }),

    list_tiktok_campaigns: tool({
      description: "Lista campanhas TikTok Ads do advertiser conectado.",
      inputSchema: z.object({ advertiserId: z.string().optional() }),
      execute: async ({ advertiserId }) => {
        const secret = await tiktokSecret(supabase, workspaceId);
        const id = advertiserId || secret.advertiser_id;
        if (!id) throw new Error("Selecione um Advertiser TikTok Ads.");
        const r = await tiktokGet<{ data?: { list?: unknown[] } }>(
          "campaign/get/",
          secret.access_token as string,
          { advertiser_id: id, page: "1", page_size: "1000" },
        );
        return { advertiserId: id, campaigns: r.data?.list ?? [] };
      },
    }),

    list_tiktok_ad_groups: tool({
      description: "Lista grupos de anúncios TikTok Ads do advertiser conectado.",
      inputSchema: z.object({
        advertiserId: z.string().optional(),
        campaignId: z.string().optional(),
      }),
      execute: async ({ advertiserId, campaignId }) => {
        const secret = await tiktokSecret(supabase, workspaceId);
        const id = advertiserId || secret.advertiser_id;
        if (!id) throw new Error("Selecione um Advertiser TikTok Ads.");
        const params: Record<string, string> = { advertiser_id: id, page: "1", page_size: "1000" };
        if (campaignId) params.filtering = JSON.stringify({ campaign_ids: [campaignId] });
        const r = await tiktokGet<{ data?: { list?: unknown[] } }>(
          "adgroup/get/",
          secret.access_token as string,
          params,
        );
        return { advertiserId: id, adGroups: r.data?.list ?? [] };
      },
    }),

    list_tiktok_ads: tool({
      description: "Lista anúncios TikTok Ads do advertiser conectado.",
      inputSchema: z.object({
        advertiserId: z.string().optional(),
        adGroupId: z.string().optional(),
      }),
      execute: async ({ advertiserId, adGroupId }) => {
        const secret = await tiktokSecret(supabase, workspaceId);
        const id = advertiserId || secret.advertiser_id;
        if (!id) throw new Error("Selecione um Advertiser TikTok Ads.");
        const params: Record<string, string> = { advertiser_id: id, page: "1", page_size: "1000" };
        if (adGroupId) params.filtering = JSON.stringify({ adgroup_ids: [adGroupId] });
        const r = await tiktokGet<{ data?: { list?: unknown[] } }>(
          "ad/get/",
          secret.access_token as string,
          params,
        );
        return { advertiserId: id, ads: r.data?.list ?? [] };
      },
    }),

    get_tiktok_ads_metrics: tool({
      description:
        "Busca métricas reais TikTok Ads (gasto, impressões, cliques, CTR e conversões) por campanha, grupo ou anúncio.",
      inputSchema: z.object({
        advertiserId: z.string().optional(),
        level: z.enum(["campaign", "adgroup", "ad"]).default("campaign"),
        days: z.number().int().min(1).max(365).default(30),
      }),
      execute: async ({ advertiserId, level, days }) => {
        const secret = await tiktokSecret(supabase, workspaceId);
        const id = advertiserId || secret.advertiser_id;
        if (!id) throw new Error("Selecione um Advertiser TikTok Ads.");
        return {
          advertiserId: id,
          level,
          rows: await tiktokReport({
            token: secret.access_token as string,
            advertiserId: id,
            level,
            days,
          }),
        };
      },
    }),

    set_tiktok_campaign_status: tool({
      description:
        "Pausa ou ativa uma campanha TikTok Ads real. Use somente quando o usuário pedir explicitamente.",
      inputSchema: z.object({
        advertiserId: z.string().optional(),
        campaignId: z.string().min(1),
        status: z.enum(["ENABLE", "DISABLE"]),
      }),
      execute: async ({ advertiserId, campaignId, status }) => {
        const secret = await tiktokSecret(supabase, workspaceId);
        const id = advertiserId || secret.advertiser_id;
        if (!id) throw new Error("Selecione um Advertiser TikTok Ads.");
        const result = await tiktokPost("campaign/status/update/", secret.access_token as string, {
          advertiser_id: id,
          campaign_ids: [campaignId],
          operation_status: status,
        });
        return { ok: true, advertiserId: id, campaignId, status, result };
      },
    }),
  };
}

export async function buildPaidMediaProviderContext(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string> {
  const lines: string[] = [];

  try {
    const { m, token, secret, developerToken } = await googleRuntime(supabase, workspaceId);
    const customerId = secret.ads_customer_id;
    if (!customerId) {
      lines.push("## Google Ads\nOAuth conectado, mas nenhuma customer account foi selecionada.");
    } else {
      const rows = await m.adsSearch({
        token,
        developerToken,
        customerId,
        loginCustomerId: secret.ads_login_customer_id,
        query: m.adsCampaignQuery(7),
      });
      lines.push(
        `## Google Ads (últimos 7 dias)\nConta selecionada: ${customerId}\nCampanhas retornadas: ${rows.length}. As tools do Gestor podem listar contas, campanhas, grupos/anúncios, métricas e pausar/ativar campanhas.`,
      );
    }
  } catch (e) {
    lines.push(`## Google Ads\nIndisponível: ${(e as Error).message}`);
  }

  try {
    const secret = await tiktokSecret(supabase, workspaceId);
    const advertisers = await listTikTokAdvertisersInternal(supabase, workspaceId);
    const advertiserId = secret.advertiser_id || advertisers[0]?.advertiser_id;
    if (!advertiserId) {
      lines.push(
        "## TikTok Ads\nToken presente, mas nenhum Advertiser foi selecionado/encontrado.",
      );
    } else {
      const report = await tiktokReport({
        token: secret.access_token as string,
        advertiserId,
        level: "campaign",
        days: 7,
      });
      lines.push(
        `## TikTok Ads (últimos 7 dias)\nAdvertiser: ${advertiserId}\nLinhas de métricas: ${report.length}. As tools do Gestor podem listar advertisers, campanhas, grupos/anúncios, métricas e pausar/ativar campanhas.`,
      );
    }
  } catch (e) {
    lines.push(`## TikTok Ads\nIndisponível: ${(e as Error).message}`);
  }

  return lines.join("\n\n");
}
