// Tools do agente IA para o Gestor de Tráfego.
// Cada tool executa uma ação real na Meta usando o access_token do workspace.
// O agente decide quando e como chamar cada tool; a UI vê o resultado no chat.
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH = "v23.0";

type TurnImage = { index: number; base64: string; mime: string; name: string };

type Ctx = {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  turnImages: TurnImage[];
};

async function loadToken(sb: SupabaseClient, workspaceId: string): Promise<string> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  const { data: sec, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  if (error) throw new Error(error.message);
  const token = (sec as { access_token?: string } | null)?.access_token;
  if (!token) throw new Error("Meta não conectada neste workspace. Peça ao usuário para conectar em Integrações → Meta Ads.");
  return token;
}

async function assertOwns(sb: SupabaseClient, workspaceId: string, adAccountId: string) {
  const { data } = await sb.from("meta_ad_accounts")
    .select("id").eq("workspace_id", workspaceId).eq("account_id", adAccountId).maybeSingle();
  if (!data) throw new Error(`Conta ${adAccountId} não pertence a este workspace.`);
}

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const txt = await r.text();
  if (!r.ok) throw new Error(`Meta GET ${path} ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt) as T;
}

async function metaPost<T>(path: string, token: string, body: Record<string, string | number>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const form = new URLSearchParams();
  form.set("access_token", token);
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  const r = await fetch(url.toString(), { method: "POST", body: form });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Meta POST ${path} ${r.status}: ${txt.slice(0, 400)}`);
  return JSON.parse(txt) as T;
}

export function buildGestorTools(ctx: Ctx) {
  const { supabase, workspaceId, turnImages, userId } = ctx;

  return {
    list_ad_accounts: tool({
      description: "Lista as contas de anúncio conectadas neste workspace. Use antes de qualquer criação para saber qual conta usar.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase.from("meta_ad_accounts")
          .select("account_id,name,currency").eq("workspace_id", workspaceId);
        return { accounts: data ?? [] };
      },
    }),

    list_personas: tool({
      description: "Lista personas configuradas pelo usuário para este workspace. Cada persona traz: conta de anúncio, páginas/IG/WhatsApp vinculados, direcionamento detalhado (interesses com IDs reais da Meta), demografia e localizações. SEMPRE consulte antes de criar anúncio quando o usuário mencionar 'persona X' ou pedir 'use minha persona'. Reaproveite os IDs de interesses da persona sem inventar novos.",
      inputSchema: z.object({ name: z.string().optional().describe("Filtro opcional por nome (case-insensitive, substring)") }),
      execute: async ({ name }) => {
        let query = supabase.from("meta_personas").select("*").eq("workspace_id", workspaceId);
        if (name) query = query.ilike("name", `%${name}%`);
        const { data } = await query.order("created_at", { ascending: false });
        return { personas: data ?? [] };
      },
    }),

    list_strategies: tool({
      description: "Lista estratégias de anúncio pré-configuradas neste workspace. Cada estratégia é uma receita reutilizável (objetivo, orçamento, público, copy, posicionamentos + regras de automação executáveis). Quando o usuário mencionar 'usa a estratégia X' ou 'monta pela estratégia tal', SEMPRE chame esta tool antes de criar a campanha.",
      inputSchema: z.object({ name: z.string().optional().describe("Filtro opcional por nome (case-insensitive)") }),
      execute: async ({ name }) => {
        let q = supabase.from("meta_strategies").select("id,name,default_objective,description,ad_account_id,persona_id,enabled").eq("workspace_id", workspaceId).eq("enabled", true);
        if (name) q = q.ilike("name", `%${name}%`);
        const { data } = await q.order("created_at", { ascending: false });
        return { strategies: data ?? [] };
      },
    }),

    get_strategy: tool({
      description: "Retorna uma estratégia COMPLETA por id. Traz objetivo padrão, orçamento sugerido, persona vinculada, posicionamentos, diretrizes de copy e todas as regras de automação executáveis. Use logo depois de list_strategies para carregar o plano antes de montar a campanha.",
      inputSchema: z.object({ strategyId: z.string().uuid() }),
      execute: async ({ strategyId }) => {
        const { data, error } = await supabase.from("meta_strategies").select("*").eq("id", strategyId).eq("workspace_id", workspaceId).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Estratégia não encontrada.");
        return { strategy: data };
      },
    }),

    apply_strategy_to_campaign: tool({
      description: "Materializa as regras de automação de uma estratégia em uma campanha específica recém-criada. Cria linhas em meta_automation_rules com scope=campaign apontando pra campanha. SEMPRE chame isto DEPOIS de create_full_ad_from_image (ou de criar campanha manualmente) quando o usuário pediu para usar uma estratégia.",
      inputSchema: z.object({
        strategyId: z.string().uuid(),
        campaignId: z.string().describe("ID da campanha Meta recém-criada (formato numérico string)"),
      }),
      execute: async ({ strategyId, campaignId }) => {
        const { data: strat, error } = await supabase.from("meta_strategies").select("*").eq("id", strategyId).eq("workspace_id", workspaceId).maybeSingle();
        if (error) throw new Error(error.message);
        if (!strat) throw new Error("Estratégia não encontrada.");
        const rules = ((strat as { automation_rules?: unknown[] }).automation_rules ?? []) as Array<Record<string, unknown>>;
        if (rules.length === 0) return { created: 0, message: "Estratégia sem regras de automação." };
        const inserts = rules.map((r) => ({
          workspace_id: workspaceId,
          name: `[${(strat as { name: string }).name}] ${(r.name as string) ?? "regra"}`,
          enabled: (r.enabled as boolean) ?? true,
          scope_type: "campaign" as const,
          scope_id: campaignId,
          trigger_metric: r.trigger_metric as string,
          trigger_operator: r.trigger_operator as string,
          trigger_value: r.trigger_value as number,
          trigger_window: (r.trigger_window as string) ?? "last_7d",
          action_type: r.action_type as string,
          action_value: (r.action_value as number | null) ?? null,
          cooldown_minutes: (r.cooldown_minutes as number) ?? 720,
          created_by: userId,
        }));
        const { data: inserted, error: iErr } = await supabase.from("meta_automation_rules").insert(inserts).select("id");
        if (iErr) throw new Error(iErr.message);
        return { created: (inserted ?? []).length, message: `${(inserted ?? []).length} regras de automação criadas para a campanha ${campaignId}.` };
      },
    }),

    list_creative_folders: tool({
      description: "Lista as pastas da Central de Criativos deste workspace. Use quando o usuário mencionar 'pasta X', 'na pasta tal', para descobrir qual folder_id filtrar em search_creatives.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase.from("meta_creative_folders").select("id,name,description,parent_id").eq("workspace_id", workspaceId).order("name");
        return { folders: data ?? [] };
      },
    }),

    search_creatives: tool({
      description: "Busca criativos (imagens/vídeos) já enviados pelo usuário na Central de Criativos. Pode filtrar por pasta (folderId), por texto (name/tag) e por tipo (image|video). Retorna id, display_name, kind, storage_path, tags, folder_id. Use SEMPRE que o usuário disser 'usa o criativo tal', 'pega da pasta X', 'aquele vídeo Y'. Depois use get_creative_signed_url para materializar a URL antes de subir para a Meta.",
      inputSchema: z.object({
        folderId: z.string().uuid().nullable().optional().describe("null = raiz; undefined = todas as pastas"),
        query: z.string().optional().describe("Substring em display_name/original_filename/tags"),
        kind: z.enum(["image", "video"]).optional(),
      }),
      execute: async ({ folderId, query, kind }) => {
        let q = supabase.from("meta_creative_uploads")
          .select("id,folder_id,display_name,original_filename,storage_path,mime,kind,tags,width,height,created_at")
          .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
        if (folderId === null) q = q.is("folder_id", null);
        else if (folderId) q = q.eq("folder_id", folderId);
        if (kind) q = q.eq("kind", kind);
        if (query && query.trim()) {
          const s = query.trim();
          q = q.or(`display_name.ilike.%${s}%,original_filename.ilike.%${s}%`);
        }
        const { data } = await q;
        return { creatives: data ?? [] };
      },
    }),

    get_creative_signed_url: tool({
      description: "Gera uma URL assinada temporária (1h) para um criativo da biblioteca. Passe o storage_path retornado por search_creatives. Use a URL resultante como imagem/vídeo do anúncio ao criar campanhas.",
      inputSchema: z.object({ storagePath: z.string() }),
      execute: async ({ storagePath }) => {
        const { data, error } = await supabase.storage.from("meta-creatives").createSignedUrl(storagePath, 3600);
        if (error) throw new Error(error.message);
        return { url: data?.signedUrl ?? "" };
      },
    }),


    list_page_and_pixel: tool({
      description: "Lista Facebook Pages, Instagram accounts e Pixels ligados à conta de anúncio. Use antes de criar criativos para saber qual page_id / instagram_actor_id / pixel_id passar.",
      inputSchema: z.object({ adAccountId: z.string().describe("ID da conta de anúncio no formato act_XXXXXXX") }),
      execute: async ({ adAccountId }) => {
        await assertOwns(supabase, workspaceId, adAccountId);
        const [pages, ig, pixels] = await Promise.all([
          supabase.from("meta_pages").select("page_id,page_name").eq("workspace_id", workspaceId),
          supabase.from("meta_instagram_accounts").select("instagram_id,username,page_id").eq("workspace_id", workspaceId),
          supabase.from("meta_pixels").select("pixel_id,pixel_name").eq("workspace_id", workspaceId).eq("ad_account_id", adAccountId),
        ]);
        return {
          pages: pages.data ?? [],
          instagram: ig.data ?? [],
          pixels: pixels.data ?? [],
        };
      },
    }),

    search_detailed_targeting: tool({
      description: "Busca REAL no direcionamento detalhado da Meta (interesses, comportamentos, demografia). SEMPRE use isto antes de mandar qualquer ID de interesse, NUNCA invente IDs. Devolve id + name + type + audience_size para você escolher.",
      inputSchema: z.object({
        adAccountId: z.string(),
        query: z.string().min(2).describe("Termo a buscar, ex: 'empreendedorismo', 'academia', 'yoga'"),
        limit: z.number().int().min(1).max(30).default(15),
      }),
      execute: async ({ adAccountId, query, limit }) => {
        await assertOwns(supabase, workspaceId, adAccountId);
        const token = await loadToken(supabase, workspaceId);
        const j = await metaGet<{ data: Array<{ id: string; name: string; type: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number; path?: string[] }> }>(
          `${adAccountId}/targetingsearch`, token,
          { q: query, limit: String(limit), locale: "pt_BR" },
        );
        return { items: j.data ?? [] };
      },
    }),

    search_geo_locations: tool({
      description: "Busca cidades/regiões/países reais na Meta. Use para pegar a key correta antes de segmentar por localização.",
      inputSchema: z.object({
        query: z.string().min(2),
        types: z.array(z.enum(["country", "region", "city", "zip", "geo_market", "electoral_district"])).default(["city", "region", "country"]),
      }),
      execute: async ({ query, types }) => {
        const token = await loadToken(supabase, workspaceId);
        const j = await metaGet<{ data: Array<{ key: string; name: string; type: string; country_code?: string; region?: string }> }>(
          "search", token,
          { type: "adgeolocation", q: query, location_types: JSON.stringify(types), limit: "20" },
        );
        return { items: j.data ?? [] };
      },
    }),

    list_campaigns: tool({
      description: "Lista campanhas de uma conta de anúncio com status e objetivo. Use para o usuário escolher o alvo de pausa/duplicação.",
      inputSchema: z.object({ adAccountId: z.string(), limit: z.number().int().min(1).max(50).default(25) }),
      execute: async ({ adAccountId, limit }) => {
        await assertOwns(supabase, workspaceId, adAccountId);
        const token = await loadToken(supabase, workspaceId);
        const j = await metaGet<{ data: Array<{ id: string; name: string; status: string; effective_status: string; objective: string; daily_budget?: string }> }>(
          `${adAccountId}/campaigns`, token,
          { fields: "id,name,status,effective_status,objective,daily_budget", limit: String(limit) },
        );
        return { campaigns: j.data ?? [] };
      },
    }),

    set_object_status: tool({
      description: "Pausa (PAUSED) ou ativa (ACTIVE) uma campanha, adset ou anúncio.",
      inputSchema: z.object({
        objectId: z.string().describe("ID da campanha, adset ou ad"),
        status: z.enum(["ACTIVE", "PAUSED"]),
      }),
      execute: async ({ objectId, status }) => {
        const token = await loadToken(supabase, workspaceId);
        await metaPost(objectId, token, { status });
        return { ok: true, objectId, status };
      },
    }),

    update_campaign_budget: tool({
      description: "Altera o orçamento diário (em reais/moeda da conta) de uma campanha CBO. Use apenas se a campanha estiver com CBO ativo.",
      inputSchema: z.object({
        campaignId: z.string(),
        dailyBudget: z.number().positive().describe("Novo orçamento diário na moeda da conta (ex: 50 = R$50/dia)"),
      }),
      execute: async ({ campaignId, dailyBudget }) => {
        const token = await loadToken(supabase, workspaceId);
        await metaPost(campaignId, token, { daily_budget: Math.round(dailyBudget * 100) });
        return { ok: true, campaignId, dailyBudget };
      },
    }),

    list_turn_images: tool({
      description: "Lista imagens que o usuário anexou NESTA mensagem. Retorna o índice, nome e mime. Use este índice depois em create_full_ad_from_image.",
      inputSchema: z.object({}),
      execute: async () => ({
        images: turnImages.map((i) => ({ index: i.index, name: i.name, mime: i.mime })),
      }),
    }),

    create_full_ad_from_image: tool({
      description: "Cria uma campanha COMPLETA na Meta (campaign + adset + ad) usando uma imagem que o usuário anexou nesta mensagem. Faz upload da imagem, cria criativo e ad. Devolve os IDs. Sempre confirme os par-metros no chat antes de chamar.",
      inputSchema: z.object({
        adAccountId: z.string(),
        imageIndex: z.number().int().min(0).describe("Índice da imagem anexada (use list_turn_images)"),
        campaignName: z.string().max(200),
        objective: z.enum([
          "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS",
          "OUTCOME_SALES", "OUTCOME_AWARENESS", "OUTCOME_APP_PROMOTION",
        ]),
        dailyBudget: z.number().positive().describe("Orçamento diário em reais/moeda da conta"),
        adSetName: z.string().max(200),
        optimizationGoal: z.enum([
          "LINK_CLICKS", "OFFSITE_CONVERSIONS", "LEAD_GENERATION", "CONVERSATIONS",
          "REACH", "IMPRESSIONS", "POST_ENGAGEMENT", "LANDING_PAGE_VIEWS",
          "THRUPLAY", "VALUE",
        ]),
        ageMin: z.number().int().min(13).max(65).default(18),
        ageMax: z.number().int().min(13).max(65).default(65),
        genders: z.array(z.number().int().min(1).max(2)).default([]).describe("Vazio = todos, [1] = masc, [2] = fem"),
        countries: z.array(z.string().length(2)).default(["BR"]),
        detailedTargetingIds: z.array(z.string()).default([]).describe("IDs REAIS retornados por search_detailed_targeting. NUNCA inventar."),
        pageId: z.string(),
        instagramActorId: z.string().optional(),
        pixelId: z.string().optional(),
        adName: z.string().max(200),
        primaryText: z.string().max(2000).describe("Texto principal do anúncio"),
        headline: z.string().max(255),
        description: z.string().max(500).optional(),
        link: z.string().url(),
        callToAction: z.enum([
          "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "CONTACT_US",
          "GET_QUOTE", "APPLY_NOW", "DOWNLOAD", "GET_OFFER",
          "MESSAGE_PAGE", "WHATSAPP_MESSAGE", "SEND_MESSAGE",
        ]).default("LEARN_MORE"),
        activateNow: z.boolean().default(false).describe("Se true, sobe ACTIVE. Padrão = PAUSED (mais seguro)."),
      }),
      execute: async (i) => {
        const img = turnImages.find((t) => t.index === i.imageIndex);
        if (!img) throw new Error(`Imagem índice ${i.imageIndex} não encontrada. Chame list_turn_images antes.`);
        await assertOwns(supabase, workspaceId, i.adAccountId);
        const token = await loadToken(supabase, workspaceId);
        const status = i.activateNow ? "ACTIVE" : "PAUSED";

        // 1) upload imagem
        const form = new URLSearchParams();
        form.set("access_token", token);
        form.set("bytes", img.base64);
        const upR = await fetch(`https://graph.facebook.com/${GRAPH}/${i.adAccountId}/adimages`, { method: "POST", body: form });
        const upTxt = await upR.text();
        if (!upR.ok) throw new Error(`Upload imagem ${upR.status}: ${upTxt.slice(0, 300)}`);
        const upJ = JSON.parse(upTxt) as { images?: Record<string, { hash: string }> };
        const imageHash = Object.values(upJ.images ?? {})[0]?.hash;
        if (!imageHash) throw new Error("Meta não retornou hash da imagem.");

        // 2) campaign (CBO)
        const camp = await metaPost<{ id: string }>(`${i.adAccountId}/campaigns`, token, {
          name: i.campaignName,
          objective: i.objective,
          status,
          buying_type: "AUCTION",
          special_ad_categories: JSON.stringify(["NONE"]),
          daily_budget: Math.round(i.dailyBudget * 100),
        });

        // 3) adset (herda orçamento CBO da campanha)
        const targeting: Record<string, unknown> = {
          geo_locations: { countries: i.countries },
          age_min: i.ageMin,
          age_max: i.ageMax,
        };
        if (i.genders.length) targeting.genders = i.genders;
        if (i.detailedTargetingIds.length) {
          targeting.flexible_spec = [{ interests: i.detailedTargetingIds.map((id) => ({ id })) }];
        }
        const adsetBody: Record<string, string | number> = {
          name: i.adSetName,
          campaign_id: camp.id,
          status,
          optimization_goal: i.optimizationGoal,
          billing_event: "IMPRESSIONS",
          targeting: JSON.stringify(targeting),
        };
        if (i.pixelId && (i.optimizationGoal === "OFFSITE_CONVERSIONS" || i.optimizationGoal === "VALUE")) {
          adsetBody.promoted_object = JSON.stringify({ pixel_id: i.pixelId, custom_event_type: "PURCHASE" });
        }
        const adset = await metaPost<{ id: string }>(`${i.adAccountId}/adsets`, token, adsetBody);

        // 4) creative
        const creativeSpec = {
          page_id: i.pageId,
          ...(i.instagramActorId ? { instagram_actor_id: i.instagramActorId } : {}),
          link_data: {
            message: i.primaryText,
            link: i.link,
            name: i.headline,
            ...(i.description ? { description: i.description } : {}),
            image_hash: imageHash,
            call_to_action: { type: i.callToAction, value: { link: i.link } },
          },
        };
        const creative = await metaPost<{ id: string }>(`${i.adAccountId}/adcreatives`, token, {
          name: `${i.adName} - creative`,
          object_story_spec: JSON.stringify(creativeSpec),
        });

        // 5) ad
        const ad = await metaPost<{ id: string }>(`${i.adAccountId}/ads`, token, {
          name: i.adName,
          adset_id: adset.id,
          creative: JSON.stringify({ creative_id: creative.id }),
          status,
        });

        // log
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("meta_campaign_operations").insert({
            workspace_id: workspaceId, user_id: userId, ad_account_id: i.adAccountId,
            operation: "ai_create_full_ad",
            target_id: ad.id,
            request_payload: JSON.parse(JSON.stringify({ ...i, imageIndex: undefined })),
            response_payload: { campaignId: camp.id, adsetId: adset.id, creativeId: creative.id, adId: ad.id, imageHash },
            status: "success",
            error_message: null,
          });
        } catch { /* ignore */ }

        return {
          ok: true,
          status,
          campaignId: camp.id,
          adsetId: adset.id,
          creativeId: creative.id,
          adId: ad.id,
          imageHash,
          message: `Anúncio criado. Está ${status}. Abra o Gestor de Tráfego para revisar antes de ativar.`,
        };
      },
    }),

    list_custom_audiences: tool({
      description: "Lista os públicos personalizados (custom + lookalike) já cadastrados neste workspace, opcionalmente filtrando por conta de anúncio. Use antes de criar semelhante para pegar o audience_id de origem correto.",
      inputSchema: z.object({
        adAccountId: z.string().optional().describe("Filtro por conta (formato act_123... ou só o número)"),
      }),
      execute: async ({ adAccountId }) => {
        let q = supabase.from("meta_custom_audiences")
          .select("id,audience_id,name,audience_type,subtype,ad_account_id,approximate_count,retention_days")
          .eq("workspace_id", workspaceId);
        if (adAccountId) {
          const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
          q = q.eq("ad_account_id", acct);
        }
        const { data } = await q.order("created_at", { ascending: false }).limit(100);
        return { audiences: data ?? [] };
      },
    }),

    create_lookalike_audience: tool({
      description: "Cria um público SEMELHANTE (lookalike) na Meta a partir de um público personalizado existente. Aceita país (ISO-2, ex 'BR') e faixa de similaridade em % (0-10). Para vários splits (ex: 1-3% e 3-6%), chame a tool uma vez por split. Retorna o audience_id do novo público.",
      inputSchema: z.object({
        adAccountId: z.string().describe("Conta de anúncio (formato act_123... ou só o número)"),
        originAudienceId: z.string().describe("audience_id do público personalizado de origem (pegue via list_custom_audiences)"),
        country: z.string().length(2).describe("País ISO-2 (ex: BR, US, PT)"),
        startPercent: z.number().min(0).max(10).describe("% inicial da faixa (0-10)"),
        endPercent: z.number().min(1).max(10).describe("% final da faixa (1-10, maior que start)"),
        name: z.string().optional().describe("Nome opcional; se omitido, geramos automaticamente"),
      }),
      execute: async ({ adAccountId, originAudienceId, country, startPercent, endPercent, name }) => {
        if (endPercent <= startPercent) throw new Error("endPercent precisa ser maior que startPercent.");
        const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
        await assertOwns(supabase, workspaceId, acct);
        const token = await loadToken(supabase, workspaceId);
        const ratio = endPercent / 100;
        const startingRatio = startPercent / 100;
        const lookalikeSpec: Record<string, unknown> = { type: "similarity", country: country.toUpperCase(), ratio };
        if (startingRatio > 0) lookalikeSpec.starting_ratio = startingRatio;
        const finalName = name ?? `LAL ${startPercent}-${endPercent}% ${country.toUpperCase()}`;
        const res = await metaPost<{ id: string }>(`${acct}/customaudiences`, token, {
          name: finalName,
          subtype: "LOOKALIKE",
          origin_audience_id: originAudienceId,
          lookalike_spec: JSON.stringify(lookalikeSpec),
        });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("meta_custom_audiences").insert({
            workspace_id: workspaceId, ad_account_id: acct, audience_id: res.id,
            name: finalName, audience_type: "lookalike", subtype: "LOOKALIKE",
            origin: "chat_gestor", created_by: userId,
            lookalike_spec: { origin_audience_id: originAudienceId, country: country.toUpperCase(), ratio, starting_ratio: startingRatio },
          });
        } catch { /* noop */ }
        return { ok: true, audienceId: res.id, name: finalName, message: `Público semelhante criado (${startPercent}-${endPercent}% ${country.toUpperCase()}).` };
      },
    }),
  };
}
