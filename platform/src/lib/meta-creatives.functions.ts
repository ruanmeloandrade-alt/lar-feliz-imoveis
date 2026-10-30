import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "v20.0";
const PRESETS = [
  "today", "yesterday",
  "last_3d", "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
  "this_week_mon_today", "this_week_sun_today",
  "last_week_mon_sun", "last_week_sun_sat",
  "this_month", "last_month",
  "this_quarter", "last_quarter",
  "this_year", "last_year",
  "maximum",
] as const;
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;
const presetSchema = z.string().refine(
  (s) => (PRESETS as readonly string[]).includes(s) || CUSTOM_RE.test(s),
  { message: "preset inválido" },
);
function insightsField(preset: string, metrics: string): string {
  const m = preset.match(CUSTOM_RE);
  if (m) return `insights.time_range({'since':'${m[1]}','until':'${m[2]}'}){${metrics}}`;
  return `insights.date_preset(${preset}){${metrics}}`;
}

async function loadMetaToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
): Promise<string> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  const { data: sec, error } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "meta",
    _key: encKey,
  });
  if (error) throw new Error(error.message);
  if (!sec) throw new Error("Meta não conectada neste workspace.");
  const token = (sec as { access_token?: string }).access_token;
  if (!token) throw new Error("Access token Meta ausente.");
  return token;
}

async function metaGet<T = unknown>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Meta ${path} ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

type MetaAction = { action_type: string; value: string };
function sumAction(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  let n = 0;
  for (const a of actions) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

type AdRow = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    thumbnail_url?: string;
    image_url?: string;
    image_hash?: string;
    object_type?: string;
    video_id?: string;
    asset_feed_spec?: {
      videos?: Array<{ video_id?: string; thumbnail_url?: string; url_tags?: string }>;
      images?: Array<{ hash?: string; url?: string }>;
    };
    object_story_spec?: {
      link_data?: {
        message?: string; name?: string; description?: string;
        image_hash?: string; picture?: string;
        call_to_action?: { type?: string };
      };
      video_data?: {
        message?: string; title?: string;
        video_id?: string; image_url?: string; image_hash?: string;
        call_to_action?: { type?: string };
      };
    };
  };
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

export type CreativeMetric = {
  adId: string;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  adName: string;
  status: string;
  campaignId: string | null;
  adsetId: string | null;
  creativeId: string | null;
  headline: string;
  body: string;
  cta: string | null;
  thumbnail: string | null;
  mediaType: "image" | "video" | null;
  videoUrl: string | null;
  videoId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  leads: number;
  cpl: number;
  roas: number;
};

const CREATIVE_FIELDS = "id,name,title,body,thumbnail_url,image_url,image_hash,object_type,video_id,object_story_spec{link_data{message,name,description,image_hash,picture,call_to_action},video_data{message,title,video_id,image_url,image_hash,call_to_action}},asset_feed_spec{videos{video_id,thumbnail_url},images{hash,url}}";

/** Pega o melhor media possível a partir do creative bruto. */
function pickMediaHints(c: AdRow["creative"]): {
  videoId: string | null;
  imageHash: string | null;
  directImage: string | null;
  fallbackThumb: string | null;
} {
  const videoId = c?.video_id
    || c?.object_story_spec?.video_data?.video_id
    || c?.asset_feed_spec?.videos?.[0]?.video_id
    || null;
  const imageHash = c?.image_hash
    || c?.object_story_spec?.link_data?.image_hash
    || c?.object_story_spec?.video_data?.image_hash
    || c?.asset_feed_spec?.images?.[0]?.hash
    || null;
  const directImage = c?.image_url
    || c?.object_story_spec?.link_data?.picture
    || c?.object_story_spec?.video_data?.image_url
    || c?.asset_feed_spec?.images?.[0]?.url
    || null;
  const fallbackThumb = c?.thumbnail_url
    || c?.asset_feed_spec?.videos?.[0]?.thumbnail_url
    || null;
  return { videoId, imageHash, directImage, fallbackThumb };
}

/** Busca em paralelo source de vídeos e URLs full-res de imagens por hash. */
async function resolveMedia(
  token: string,
  jobs: Array<{ accountId: string; videoId: string | null; imageHash: string | null }>,
): Promise<{
  videos: Map<string, { source: string | null; picture: string | null }>;
  images: Map<string, string>; // key = `${accountId}:${hash}` -> url
}> {
  const videoIds = Array.from(new Set(jobs.map((j) => j.videoId).filter((v): v is string => !!v)));
  const imagesByAcct = new Map<string, Set<string>>();
  for (const j of jobs) {
    if (!j.imageHash) continue;
    if (!imagesByAcct.has(j.accountId)) imagesByAcct.set(j.accountId, new Set());
    imagesByAcct.get(j.accountId)!.add(j.imageHash);
  }

  const videoP = Promise.all(videoIds.map(async (vid) => {
    try {
      const v = await metaGet<{ source?: string; picture?: string }>(vid, token, { fields: "source,picture" });
      return [vid, { source: v.source ?? null, picture: v.picture ?? null }] as const;
    } catch {
      return [vid, { source: null, picture: null }] as const;
    }
  }));

  const imagesP = Promise.all(Array.from(imagesByAcct.entries()).map(async ([accountId, hashSet]) => {
    const hashes = Array.from(hashSet);
    try {
      const j = await metaGet<{ data?: Array<{ hash?: string; url?: string; permalink_url?: string }> }>(
        `${accountId}/adimages`,
        token,
        { hashes: JSON.stringify(hashes), fields: "hash,url,permalink_url" },
      );
      const out: Array<readonly [string, string]> = [];
      for (const row of j.data ?? []) {
        const url = row.url || row.permalink_url;
        if (row.hash && url) out.push([`${accountId}:${row.hash}`, url] as const);
      }
      return out;
    } catch {
      return [] as Array<readonly [string, string]>;
    }
  }));

  const [vArr, iArrs] = await Promise.all([videoP, imagesP]);
  return {
    videos: new Map(vArr),
    images: new Map(iArrs.flat()),
  };
}

/** Ranking de criativos por conta de anúncio + período. */
export const listCreativeRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adAccountId: z.string().min(3).optional(),
    adAccountIds: z.array(z.string().min(3)).max(50).optional(),
    preset: presetSchema.default("last_7d"),
    sortBy: z.enum(["spend", "ctr", "cpl", "roas", "clicks"]).default("spend"),
    limit: z.number().int().min(1).max(100).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    const { data: accounts, error: accountsError } = await context.supabase
      .from("meta_ad_accounts")
      .select("account_id,name,currency")
      .eq("workspace_id", data.workspaceId);
    if (accountsError) throw new Error(accountsError.message);

    const accountMap = new Map(
      (accounts ?? []).map((a: { account_id: string; name: string | null; currency: string | null }) => [a.account_id, a]),
    );
    const requestedIds = Array.from(new Set(
      data.adAccountIds?.length
        ? data.adAccountIds
        : data.adAccountId
          ? [data.adAccountId]
          : Array.from(accountMap.keys()),
    ));
    const invalidId = requestedIds.find((id) => !accountMap.has(id));
    if (invalidId) throw new Error("Ad account não pertence a este workspace.");
    if (requestedIds.length === 0) return { rows: [], preset: data.preset, sortBy: data.sortBy };

    const fields = [
      "id", "name", "status", "effective_status", "campaign_id", "adset_id",
      `creative{${CREATIVE_FIELDS}}`,
      insightsField(data.preset, "spend,impressions,clicks,ctr,cpc,actions,purchase_roas"),
    ].join(",");

    const byAccount = await Promise.all(requestedIds.map(async (accountId) => {
      const j = await metaGet<{ data: AdRow[] }>(`${accountId}/ads`, token, {
        fields, limit: String(data.limit),
      });
      const account = accountMap.get(accountId);
      const ads = j.data ?? [];

      // Resolver mídia em alta qualidade (video source + full-res images)
      const hints = ads.map((ad) => ({ ad, ...pickMediaHints(ad.creative) }));
      const media = await resolveMedia(token, hints.map((h) => ({
        accountId, videoId: h.videoId, imageHash: h.imageHash,
      })));

      return hints.map(({ ad, videoId, imageHash, directImage, fallbackThumb }): CreativeMetric => {
        const ins = ad.insights?.data?.[0];
        const spend = Number(ins?.spend ?? 0) || 0;
        const impressions = Number(ins?.impressions ?? 0) || 0;
        const clicks = Number(ins?.clicks ?? 0) || 0;
        const ctr = Number(ins?.ctr ?? 0) || 0;
        const cpc = Number(ins?.cpc ?? 0) || 0;
        const leads = sumAction(ins?.actions, [
          "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead",
        ]);
        const roas = Number(ins?.purchase_roas?.[0]?.value ?? 0) || 0;

        const linkData = ad.creative?.object_story_spec?.link_data;
        const videoData = ad.creative?.object_story_spec?.video_data;
        const headline = ad.creative?.title || linkData?.name || videoData?.title || "";
        const body = ad.creative?.body || linkData?.message || videoData?.message || "";
        const cta = linkData?.call_to_action?.type || videoData?.call_to_action?.type || null;

        const vInfo = videoId ? media.videos.get(videoId) : null;
        const hashUrl = imageHash ? media.images.get(`${accountId}:${imageHash}`) : null;
        const isVideo = !!videoId;
        const thumbnail = isVideo
          ? (vInfo?.picture || directImage || hashUrl || fallbackThumb || null)
          : (directImage || hashUrl || fallbackThumb || null);

        return {
          adId: ad.id,
          accountId,
          accountName: account?.name ?? null,
          currency: account?.currency ?? null,
          adName: ad.name ?? "(sem nome)",
          status: ad.effective_status ?? ad.status ?? "UNKNOWN",
          campaignId: ad.campaign_id ?? null,
          adsetId: ad.adset_id ?? null,
          creativeId: ad.creative?.id ?? null,
          headline, body, cta,
          thumbnail,
          mediaType: isVideo ? "video" : (thumbnail ? "image" : null),
          videoUrl: vInfo?.source ?? null,
          videoId: videoId,
          spend, impressions, clicks, ctr, cpc,
          leads, cpl: leads > 0 ? spend / leads : 0, roas,
        };
      });
    }));


    const rows = byAccount.flat();

    rows.sort((a, b) => {
      const va = (a[data.sortBy] as number) ?? 0;
      const vb = (b[data.sortBy] as number) ?? 0;
      // CPL menor = melhor; demais maior = melhor
      return data.sortBy === "cpl" ? va - vb : vb - va;
    });

    return { rows: rows.slice(0, data.limit), preset: data.preset, sortBy: data.sortBy };
  });

// =========================
// IA: Crítica + Variações
// =========================

type AiResolved = { provider: string; apiKey: string; baseUrl: string; defaultModel: string };

async function resolveAi(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
): Promise<AiResolved> {
  const { resolveWorkspaceAiKey } = await import("./workspace-ai-key.server");
  return await resolveWorkspaceAiKey(supabase, workspaceId);
}

async function aiChat(ai: AiResolved, system: string, user: string, opts?: { json?: boolean; model?: string }): Promise<string> {
  const r = await fetch(`${ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: opts?.model || ai.defaultModel,
      temperature: 0.7,
      response_format: opts?.json ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`IA falhou (${r.status}): ${t.slice(0, 300)}`);
  }
  const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "";
}

async function loadCreativeById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string, adId: string,
): Promise<CreativeMetric> {
  const token = await loadMetaToken(supabase, workspaceId);
  const fields = [
    "id", "name", "status", "effective_status", "campaign_id", "adset_id", "account_id",
    `creative{${CREATIVE_FIELDS}}`,
    "insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,purchase_roas}",
  ].join(",");
  const ad = await metaGet<AdRow & { account_id?: string }>(adId, token, { fields });

  // Validação de propriedade: account_id do ad precisa estar no workspace
  const acctIdRaw = ad.account_id ? `act_${ad.account_id}` : null;
  let accountMeta: { account_id: string; name: string | null; currency: string | null } | null = null;
  if (acctIdRaw) {
    const { data: acct } = await supabase
      .from("meta_ad_accounts").select("account_id,name,currency")
      .eq("workspace_id", workspaceId).eq("account_id", acctIdRaw).maybeSingle();
    if (!acct) throw new Error("Anúncio não pertence a este workspace.");
    accountMeta = acct;
  }

  const ins = ad.insights?.data?.[0];
  const spend = Number(ins?.spend ?? 0) || 0;
  const impressions = Number(ins?.impressions ?? 0) || 0;
  const clicks = Number(ins?.clicks ?? 0) || 0;
  const leads = sumAction(ins?.actions, [
    "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead",
  ]);
  const linkData = ad.creative?.object_story_spec?.link_data;
  const videoData = ad.creative?.object_story_spec?.video_data;

  const hint = pickMediaHints(ad.creative);
  const media = acctIdRaw
    ? await resolveMedia(token, [{ accountId: acctIdRaw, videoId: hint.videoId, imageHash: hint.imageHash }])
    : { videos: new Map(), images: new Map() };
  const vInfo = hint.videoId ? media.videos.get(hint.videoId) : null;
  const hashUrl = (acctIdRaw && hint.imageHash) ? media.images.get(`${acctIdRaw}:${hint.imageHash}`) : null;
  const isVideo = !!hint.videoId;
  const thumbnail = isVideo
    ? (vInfo?.picture || hint.directImage || hashUrl || hint.fallbackThumb || null)
    : (hint.directImage || hashUrl || hint.fallbackThumb || null);

  return {
    adId: ad.id,
    accountId: accountMeta?.account_id ?? acctIdRaw,
    accountName: accountMeta?.name ?? null,
    currency: accountMeta?.currency ?? null,
    adName: ad.name ?? "(sem nome)",
    status: ad.effective_status ?? ad.status ?? "UNKNOWN",
    campaignId: ad.campaign_id ?? null,
    adsetId: ad.adset_id ?? null,
    creativeId: ad.creative?.id ?? null,
    headline: ad.creative?.title || linkData?.name || videoData?.title || "",
    body: ad.creative?.body || linkData?.message || videoData?.message || "",
    cta: linkData?.call_to_action?.type || videoData?.call_to_action?.type || null,
    thumbnail,
    mediaType: isVideo ? "video" : (thumbnail ? "image" : null),
    videoUrl: vInfo?.source ?? null,
    videoId: hint.videoId,
    spend, impressions, clicks,
    ctr: Number(ins?.ctr ?? 0) || 0,
    cpc: Number(ins?.cpc ?? 0) || 0,
    leads, cpl: leads > 0 ? spend / leads : 0,
    roas: Number(ins?.purchase_roas?.[0]?.value ?? 0) || 0,
  };
}


export const getCreativeAiCritique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adId: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await loadCreativeById(context.supabase, data.workspaceId, data.adId);
    const ai = await resolveAi(context.supabase, data.workspaceId);
    const system = "Você é um especialista em copywriting e mídia paga (Meta Ads). Analisa criativos com base em métricas reais e sugere melhorias objetivas em português do Brasil. Seja direto, sem enrolação.";
    const user = `Analise este criativo (últimos 30 dias):

Nome do anúncio: ${c.adName}
Status: ${c.status}
Headline: ${c.headline || "(vazio)"}
Corpo (primary text): ${c.body || "(vazio)"}
CTA: ${c.cta || "(não definido)"}

Métricas:
- Gasto: R$ ${c.spend.toFixed(2)}
- Impressões: ${c.impressions}
- Cliques: ${c.clicks}
- CTR: ${c.ctr.toFixed(2)}%
- CPC: R$ ${c.cpc.toFixed(2)}
- Leads: ${c.leads}
- CPL: R$ ${c.cpl.toFixed(2)}
- ROAS: ${c.roas.toFixed(2)}x

Devolva em markdown 3 seções curtas:
### 🔍 Diagnóstico
(2-3 bullets sobre o que os números indicam)

### ⚠️ Problemas prováveis no criativo
(2-3 bullets sobre copy/gancho/CTA)

### ✅ O que testar agora
(3 sugestões acionáveis)`;
    const critique = await aiChat(ai, system, user);
    return { critique, creative: c, provider: ai.provider };
  });

export const generateCreativeVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adId: z.string().min(3),
    count: z.number().int().min(1).max(6).default(3),
    angle: z.string().max(300).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await loadCreativeById(context.supabase, data.workspaceId, data.adId);
    const ai = await resolveAi(context.supabase, data.workspaceId);
    const system = "Você é copywriter sênior de anúncios Meta Ads em pt-BR. Gera variações de texto com ângulos e ganchos DIFERENTES do original, mantendo a mesma oferta/produto. Retorna APENAS JSON válido, sem markdown.";
    const user = `Gere ${data.count} variações do criativo abaixo.

ORIGINAL:
Headline: ${c.headline || "(vazio)"}
Primary text: ${c.body || "(vazio)"}
CTA: ${c.cta || "SIGN_UP"}
${data.angle ? `\nÂngulo desejado: ${data.angle}` : ""}

Retorne JSON no formato:
{
  "variants": [
    { "headline": "...", "primary_text": "...", "cta": "SIGN_UP|LEARN_MORE|SHOP_NOW|SUBSCRIBE|CONTACT_US|GET_QUOTE|APPLY_NOW|DOWNLOAD", "angle": "explicação curta do ângulo" }
  ]
}

Regras:
- Headline: máx 40 caracteres.
- Primary text: 3-5 linhas com quebra dupla entre parágrafos.
- Nunca repita o original. Cada variação usa gancho/ângulo diferente (dor, curiosidade, prova social, urgência, contraste, story).
- Sem emojis excessivos.`;
    const raw = await aiChat(ai, system, user, { json: true });
    let parsed: { variants?: Array<{ headline: string; primary_text: string; cta: string; angle: string }> } = {};
    try { parsed = JSON.parse(raw); } catch {
      // fallback: tenta extrair bloco
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
    const variants = Array.isArray(parsed.variants) ? parsed.variants : [];
    return { variants, original: { headline: c.headline, body: c.body, cta: c.cta }, provider: ai.provider };
  });

export const compareCreativesWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    adIds: z.array(z.string().min(3)).min(2).max(4),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const creatives = await Promise.all(
      data.adIds.map((id) => loadCreativeById(context.supabase, data.workspaceId, id)),
    );
    const ai = await resolveAi(context.supabase, data.workspaceId);
    const system = "Você é analista sênior de mídia paga (Meta Ads). Compara criativos com base em métricas reais e explica quem está performando melhor e por quê, em pt-BR. Direto, sem enrolação.";
    const rows = creatives.map((c, i) => `Criativo ${String.fromCharCode(65 + i)}: ${c.adName}
Status: ${c.status}
Headline: ${c.headline || "(vazio)"}
Copy: ${c.body || "(vazio)"}
CTA: ${c.cta || "(não definido)"}
Gasto: R$ ${c.spend.toFixed(2)} | Impressões: ${c.impressions} | Cliques: ${c.clicks}
CTR: ${c.ctr.toFixed(2)}% | CPC: R$ ${c.cpc.toFixed(2)} | Leads: ${c.leads} | CPL: R$ ${c.cpl.toFixed(2)} | ROAS: ${c.roas.toFixed(2)}x`).join("\n\n---\n\n");
    const letters = creatives.map((_, i) => String.fromCharCode(65 + i)).join(", ");
    const user = `Compare os criativos abaixo (${letters}) e faça um teste A/B analítico:

${rows}

Responda em markdown com:

### 🏆 Vencedor provável
(Diga qual criativo (${letters}) está performando melhor e por qual métrica principal. Considere volume estatístico do gasto.)

### 📊 Leitura métrica
(Bullet curto por criativo: pontos fortes e fracos com base nos números.)

### 🎯 O que o vencedor faz melhor no criativo
(2-3 bullets sobre copy/gancho/CTA que provavelmente explicam a diferença.)

### 🧪 Próximos testes
(2-3 testes acionáveis: variar gancho, isolar ângulo, escalar o vencedor, matar o perdedor…)`;
    const analysis = await aiChat(ai, system, user);
    return { analysis, creatives, provider: ai.provider };
  });


// ============ Central de Criativos (folders + library) ============

const FolderInputSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
});

export const listCreativeFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meta_creative_folders")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCreativeFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FolderInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      parent_id: data.parentId ?? null,
      name: data.name,
      description: data.description,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("meta_creative_folders")
        .update(row).eq("id", data.id).eq("workspace_id", data.workspaceId)
        .select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("meta_creative_folders").insert(row).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteCreativeFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_creative_folders").delete()
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCreativesLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; folderId?: string | null; search?: string }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meta_creative_uploads")
      .select("id,folder_id,display_name,original_filename,storage_path,mime,kind,size_bytes,width,height,tags,created_at,ad_account_id")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (data.folderId === null) q = q.is("folder_id", null);
    else if (data.folderId) q = q.eq("folder_id", data.folderId);
    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`display_name.ilike.%${s}%,original_filename.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const UpdateCreativeSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  displayName: z.string().min(1).max(200).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(30).optional(),
});

export const updateCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateCreativeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, string | string[] | null> = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.folderId !== undefined) patch.folder_id = data.folderId;
    if (data.tags !== undefined) patch.tags = data.tags;
    const { data: updated, error } = await context.supabase
      .from("meta_creative_uploads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.id).eq("workspace_id", data.workspaceId)
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("meta_creative_uploads").select("storage_path")
      .eq("id", data.id).eq("workspace_id", data.workspaceId).maybeSingle();
    if (row?.storage_path) {
      await context.supabase.storage.from("meta-creatives").remove([row.storage_path]);
    }
    const { error } = await context.supabase
      .from("meta_creative_uploads").delete()
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCreativeSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; storagePath: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("meta_creative_uploads").select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("storage_path", data.storagePath).maybeSingle();
    if (!row) throw new Error("Criativo não encontrado.");
    const { data: signed, error } = await context.supabase.storage
      .from("meta-creatives").createSignedUrl(data.storagePath, 3600);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? "" };
  });

const RegisterCreativeSchema = z.object({
  workspaceId: z.string().uuid(),
  storagePath: z.string().min(1),
  mime: z.string().min(1),
  kind: z.enum(["image", "video"]),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  originalFilename: z.string().max(400).nullable().optional(),
  displayName: z.string().max(200).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  adAccountId: z.string().default(""),
});

export const registerCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterCreativeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      user_id: context.userId,
      ad_account_id: data.adAccountId || "",
      storage_path: data.storagePath,
      mime: data.mime,
      kind: data.kind,
      size_bytes: data.sizeBytes ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      original_filename: data.originalFilename ?? null,
      display_name: data.displayName ?? data.originalFilename ?? null,
      folder_id: data.folderId ?? null,
    };
    const { data: inserted, error } = await context.supabase
      .from("meta_creative_uploads").insert(row).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });
