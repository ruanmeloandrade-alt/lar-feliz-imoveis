import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "v23.0";

const SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "pages_manage_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "instagram_manage_insights",
  "instagram_content_publish",
  "leads_retrieval",
  "read_insights",
  "catalog_management",
];

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} não configurado.`);
  return v;
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

async function sign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

export async function buildMetaState(workspaceId: string): Promise<string> {
  const secret = requireEnv("META_APP_SECRET");
  const payload = b64url(JSON.stringify({ ws: workspaceId, t: Date.now() }));
  const sig = await sign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyMetaState(state: string): Promise<{ ws: string; t: number } | null> {
  const secret = requireEnv("META_APP_SECRET");
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload, secret);
  if (expected !== sig) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!obj?.ws || typeof obj.ws !== "string") return null;
    // 30 min de validade
    if (Date.now() - obj.t > 30 * 60 * 1000) return null;
    return obj;
  } catch { return null; }
}

/** Retorna a URL de autorização Meta para o workspace ativo. */
export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), redirectOrigin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    // Confirma que o usuário pertence ao workspace
    const { data: mem, error: memErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!mem) throw new Error("Workspace não encontrado ou sem permissão.");

    const appId = requireEnv("META_APP_ID");
    const state = await buildMetaState(data.workspaceId);
    const redirectUri = `${data.redirectOrigin}/api/public/oauth/meta/callback`;

    const url = new URL(`https://www.facebook.com/${GRAPH}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(","));
    // Reabre permissões recusadas em uma autorização anterior.
    url.searchParams.set("auth_type", "rerequest");

    return { authorizeUrl: url.toString(), redirectUri };
  });

// Cast helper: força um valor a caber no tipo Json gerado do Supabase.
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as never;

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

async function fetchAllPaged<T>(path: string, token: string, params?: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let next: string | null = url.toString();
  let guard = 0;
  while (next && guard++ < 20) {
    const r = await fetch(next);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Meta ${path} ${r.status}: ${txt.slice(0, 300)}`);
    }
    const j = (await r.json()) as { data: T[]; paging?: { next?: string } };
    out.push(...(j.data ?? []));
    next = j.paging?.next ?? null;
  }
  return out;
}

export type MetaDiscoverablePage = {
  id: string;
  name?: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string };
  discovery_source?: "direct" | "business_owned" | "business_client";
  business_id?: string | null;
  business_name?: string | null;
};

/** Descobre Páginas por /me/accounts e por portfolios empresariais acessíveis. */
export async function discoverMetaPagesForToken(token: string): Promise<MetaDiscoverablePage[]> {
  const fields = "id,name,category,access_token,tasks,instagram_business_account{id,username}";
  const pages = new Map<string, MetaDiscoverablePage>();

  const merge = (page: MetaDiscoverablePage, extra: Partial<MetaDiscoverablePage>) => {
    const previous = pages.get(page.id);
    pages.set(page.id, {
      ...previous,
      ...page,
      ...extra,
      access_token: page.access_token ?? previous?.access_token,
      tasks: page.tasks ?? previous?.tasks,
      instagram_business_account: page.instagram_business_account ?? previous?.instagram_business_account,
    });
  };

  try {
    const direct = await fetchAllPaged<MetaDiscoverablePage>("me/accounts", token, { fields, limit: "100" });
    for (const page of direct) merge(page, { discovery_source: "direct" });
  } catch (error) {
    console.warn("[meta pages] /me/accounts falhou:", error);
  }

  type Business = { id: string; name?: string };
  let businesses: Business[] = [];
  try {
    businesses = await fetchAllPaged<Business>("me/businesses", token, { fields: "id,name", limit: "100" });
  } catch (error) {
    console.warn("[meta pages] /me/businesses indisponível:", error);
  }

  for (const business of businesses) {
    for (const edge of ["owned_pages", "client_pages"] as const) {
      let found: MetaDiscoverablePage[] = [];
      try {
        found = await fetchAllPaged<MetaDiscoverablePage>(business.id + "/" + edge, token, { fields, limit: "100" });
      } catch (error) {
        try {
          found = await fetchAllPaged<MetaDiscoverablePage>(business.id + "/" + edge, token, {
            fields: "id,name,category,tasks,instagram_business_account{id,username}",
            limit: "100",
          });
        } catch {
          console.warn("[meta pages] " + business.id + "/" + edge + " indisponível:", error);
          continue;
        }
      }
      for (const page of found) {
        merge(page, {
          discovery_source: edge === "owned_pages" ? "business_owned" : "business_client",
          business_id: business.id,
          business_name: business.name ?? null,
        });
      }
    }
  }

  await Promise.all(Array.from(pages.values()).map(async (page) => {
    if (page.access_token) return;
    try {
      const detail = await metaGet<MetaDiscoverablePage>(page.id, token, { fields });
      merge(detail, {
        discovery_source: page.discovery_source,
        business_id: page.business_id ?? null,
        business_name: page.business_name ?? null,
      });
    } catch { /* Página visível no portfolio, mas sem Page Access Token para este usuário. */ }
  }));

  return Array.from(pages.values()).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id, "pt-BR"));
}

/** Lista contas de anúncio já sincronizadas no workspace (DB only, rápido). */
export const listMetaSyncedAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("meta_ad_accounts")
      .select("account_id,name,currency,account_status,business_id")
      .eq("workspace_id", data.workspaceId)
      .order("name", { ascending: true });
    return { accounts: (rows ?? []) as Array<{ account_id: string; name: string | null; currency: string | null; account_status: number | null; business_id: string | null }> };
  });

/** Lista ativos disponíveis na conta Meta conectada (sem gravar nada). */
export const listMetaAvailableAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
    const { data: sec, error: secErr } = await context.supabase.rpc("get_integration_secret", {
      _workspace_id: data.workspaceId,
      _provider: "meta",
      _key: encKey,
    });
    if (secErr) throw new Error(secErr.message);
    if (!sec) throw new Error("Meta não conectada neste workspace.");
    const token = (sec as { access_token?: string }).access_token;
    if (!token) throw new Error("Access token ausente.");

    type AdAcct = { id: string; name?: string; currency?: string; account_status?: number; business?: { id?: string; name?: string } };
    const [accounts, pages] = await Promise.all([
      fetchAllPaged<AdAcct>("me/adaccounts", token, { fields: "id,name,currency,account_status,business", limit: "100" }),
      discoverMetaPagesForToken(token),
    ]);

    const [{ data: savedAccts }, { data: savedPages }, { data: savedInstagram }] = await Promise.all([
      context.supabase.from("meta_ad_accounts").select("account_id").eq("workspace_id", data.workspaceId),
      context.supabase.from("meta_pages").select("page_id").eq("workspace_id", data.workspaceId),
      context.supabase.from("meta_instagram_accounts").select("instagram_id").eq("workspace_id", data.workspaceId),
    ]);
    const selAccts = new Set((savedAccts ?? []).map((r) => r.account_id));
    const selPages = new Set((savedPages ?? []).map((r) => r.page_id));
    const selInstagram = new Set((savedInstagram ?? []).map((r) => r.instagram_id));

    const instagram = pages
      .filter((p) => Boolean(p.instagram_business_account?.id))
      .map((p) => ({
        id: p.instagram_business_account!.id,
        username: p.instagram_business_account?.username ?? null,
        pageId: p.id,
        pageName: p.name ?? p.id,
        selected: selInstagram.has(p.instagram_business_account!.id),
        canConnect: Boolean(p.access_token),
      }));

    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        currency: a.currency ?? null,
        status: a.account_status ?? null,
        businessName: a.business?.name ?? null,
        selected: selAccts.has(a.id),
      })),
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        category: p.category ?? null,
        selected: selPages.has(p.id),
        canConnect: Boolean(p.access_token),
        source: p.discovery_source ?? "direct",
        businessName: p.business_name ?? null,
        instagramId: p.instagram_business_account?.id ?? null,
      })),
      instagram,
    };
  });

/** Sincroniza recursos da Meta (ad accounts, pages, IG, pixels) para o workspace ativo. */
export const syncMetaWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    accountIds: z.array(z.string()).optional(),
    pageIds: z.array(z.string()).optional(),
    instagramIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
    const { data: sec, error: secErr } = await context.supabase.rpc("get_integration_secret", {
      _workspace_id: data.workspaceId,
      _provider: "meta",
      _key: encKey,
    });
    if (secErr) throw new Error(secErr.message);
    if (!sec) throw new Error("Meta não conectada neste workspace.");
    const token = (sec as { access_token?: string }).access_token;
    if (!token) throw new Error("Access token ausente.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const acctFilter = data.accountIds ? new Set(data.accountIds) : null;
    const pageFilter = data.pageIds ? new Set(data.pageIds) : null;
    const instagramFilter = data.instagramIds ? new Set(data.instagramIds) : null;

    type AdAcct = { id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number; business?: { id?: string } };
    const allAccounts = await fetchAllPaged<AdAcct>("me/adaccounts", token, {
      fields: "id,name,currency,timezone_name,account_status,business",
      limit: "100",
    });
    const accounts = acctFilter ? allAccounts.filter((a) => acctFilter.has(a.id)) : allAccounts;

    if (acctFilter) {
      const keep = accounts.map((a) => a.id);
      const inList = keep.length ? "(" + keep.map((s) => '"' + s + '"').join(",") + ")" : '("")';
      await supabaseAdmin.from("meta_ad_accounts").delete().eq("workspace_id", data.workspaceId).not("account_id", "in", inList);
      await supabaseAdmin.from("meta_pixels").delete().eq("workspace_id", data.workspaceId).not("ad_account_id", "in", inList);
    }

    for (const a of accounts) {
      await supabaseAdmin.from("meta_ad_accounts").upsert({
        workspace_id: data.workspaceId,
        account_id: a.id,
        name: a.name ?? null,
        currency: a.currency ?? null,
        timezone_name: a.timezone_name ?? null,
        account_status: a.account_status ?? null,
        business_id: a.business?.id ?? null,
        raw: asJson(a),
        synced_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,account_id" });
    }

    const allPages = await discoverMetaPagesForToken(token);
    const instagramParentPageIds = new Set(
      allPages
        .filter((p) => p.instagram_business_account?.id && instagramFilter?.has(p.instagram_business_account.id))
        .map((p) => p.id),
    );
    const effectivePageFilter = pageFilter || instagramFilter
      ? new Set([...(pageFilter ?? []), ...instagramParentPageIds])
      : null;
    const pages = effectivePageFilter ? allPages.filter((p) => effectivePageFilter.has(p.id)) : allPages;

    if (effectivePageFilter) {
      const keep = pages.map((p) => p.id);
      const inList = keep.length ? "(" + keep.map((s) => '"' + s + '"').join(",") + ")" : '("")';
      const provList = keep.length ? "(" + keep.map((s) => '"meta_page_' + s + '"').join(",") + ")" : '("")';
      await supabaseAdmin.from("meta_pages").delete().eq("workspace_id", data.workspaceId).not("page_id", "in", inList);
      await supabaseAdmin.from("integrations").delete().eq("workspace_id", data.workspaceId).like("provider", "meta_page_%").not("provider", "in", provList);
    }

    if (instagramFilter) {
      const keep = Array.from(instagramFilter);
      const inList = keep.length ? "(" + keep.map((s) => '"' + s + '"').join(",") + ")" : '("")';
      await supabaseAdmin.from("meta_instagram_accounts").delete().eq("workspace_id", data.workspaceId).not("instagram_id", "in", inList);
    } else if (effectivePageFilter) {
      const keep = pages.map((p) => p.id);
      const inList = keep.length ? "(" + keep.map((s) => '"' + s + '"').join(",") + ")" : '("")';
      await supabaseAdmin.from("meta_instagram_accounts").delete().eq("workspace_id", data.workspaceId).not("page_id", "in", inList);
    }

    let instagramCount = 0;
    for (const p of pages) {
      if (!p.access_token) continue;
      await supabaseAdmin.rpc("set_integration_secret_service", {
        _workspace_id: data.workspaceId,
        _provider: "meta_page_" + p.id,
        _plaintext: asJson({ page_access_token: p.access_token }),
        _key: encKey,
        _metadata: asJson({ page_id: p.id, page_name: p.name ?? null }),
        _status: "connected",
      });

      let msgSubscribedAt: string | null = null;
      let msgError: string | null = null;
      try {
        const response = await fetch("https://graph.facebook.com/" + GRAPH + "/" + p.id + "/subscribed_apps", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token: p.access_token,
            subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads,message_reactions",
          }).toString(),
        });
        if (response.ok) msgSubscribedAt = new Date().toISOString();
        else msgError = "HTTP " + response.status + ": " + (await response.text().catch(() => "")).slice(0, 200);
      } catch (error) {
        msgError = error instanceof Error ? error.message : "erro desconhecido";
      }

      await supabaseAdmin.from("meta_pages").upsert({
        workspace_id: data.workspaceId,
        page_id: p.id,
        page_name: p.name ?? null,
        category: p.category ?? null,
        tasks: p.tasks ?? null,
        raw: asJson({ ...p, access_token: undefined }),
        synced_at: new Date().toISOString(),
        messaging_subscribed_at: msgSubscribedAt,
        messaging_error: msgError,
      }, { onConflict: "workspace_id,page_id" });

      const igId = p.instagram_business_account?.id;
      if (!igId || (instagramFilter && !instagramFilter.has(igId))) continue;
      try {
        const igDetail = await metaGet<{ id: string; username?: string; profile_picture_url?: string; followers_count?: number }>(
          igId,
          p.access_token,
          { fields: "id,username,profile_picture_url,followers_count" },
        );

        let igMsgSubscribedAt: string | null = null;
        let igMsgError: string | null = null;
        try {
          const response = await fetch("https://graph.facebook.com/" + GRAPH + "/" + igId + "/subscribed_apps", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: p.access_token,
              subscribed_fields: "messages,messaging_postbacks,message_reactions",
            }).toString(),
          });
          if (response.ok) igMsgSubscribedAt = new Date().toISOString();
          else igMsgError = "HTTP " + response.status + ": " + (await response.text().catch(() => "")).slice(0, 200);
        } catch (error) {
          igMsgError = error instanceof Error ? error.message : "erro desconhecido";
        }

        await supabaseAdmin.from("meta_instagram_accounts").upsert({
          workspace_id: data.workspaceId,
          instagram_id: igDetail.id,
          page_id: p.id,
          username: igDetail.username ?? null,
          profile_picture_url: igDetail.profile_picture_url ?? null,
          followers_count: igDetail.followers_count ?? null,
          raw: asJson(igDetail),
          synced_at: new Date().toISOString(),
          messaging_subscribed_at: igMsgSubscribedAt,
          messaging_error: igMsgError,
        }, { onConflict: "workspace_id,instagram_id" });
        instagramCount++;
      } catch (error) {
        console.warn("[meta sync] IG lookup falhou p/ page " + p.id + ":", error);
      }
    }

    type Pixel = { id: string; name?: string; last_fired_time?: string };
    let pixelCount = 0;
    for (const a of accounts) {
      try {
        const pixels = await fetchAllPaged<Pixel>(a.id + "/adspixels", token, {
          fields: "id,name,last_fired_time",
          limit: "50",
        });
        for (const pixel of pixels) {
          await supabaseAdmin.from("meta_pixels").upsert({
            workspace_id: data.workspaceId,
            ad_account_id: a.id,
            pixel_id: pixel.id,
            pixel_name: pixel.name ?? null,
            last_fired_time: pixel.last_fired_time ?? null,
            raw: asJson(pixel),
            synced_at: new Date().toISOString(),
          }, { onConflict: "workspace_id,pixel_id" });
          pixelCount++;
        }
      } catch (error) {
        console.warn("[meta sync] pixels falhou p/ " + a.id + ":", error);
      }
    }

    return {
      ok: true,
      adAccounts: accounts.length,
      pages: pages.length,
      instagram: instagramCount,
      pixels: pixelCount,
    };
  });

export const getMetaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: integ } = await context.supabase
      .from("integrations")
      .select("status,metadata,last_check_at")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "meta")
      .maybeSingle();

    const [{ count: adAccounts }, { count: pages }, { count: instagram }, { count: pixels }] = await Promise.all([
      context.supabase.from("meta_ad_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", data.workspaceId),
      context.supabase.from("meta_pages").select("id", { count: "exact", head: true }).eq("workspace_id", data.workspaceId),
      context.supabase.from("meta_instagram_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", data.workspaceId),
      context.supabase.from("meta_pixels").select("id", { count: "exact", head: true }).eq("workspace_id", data.workspaceId),
    ]);

    return {
      connected: integ?.status === "connected",
      metadata: (integ?.metadata ?? null) as unknown as { [k: string]: string | number | boolean | null } | null,
      lastCheckAt: integ?.last_check_at ?? null,
      counts: {
        adAccounts: adAccounts ?? 0,
        pages: pages ?? 0,
        instagram: instagram ?? 0,
        pixels: pixels ?? 0,
      },
    };
  });

export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ws = data.workspaceId;
    // 1) Credenciais (token principal + tokens de página cifrados)
    await supabaseAdmin.from("integrations").delete()
      .eq("workspace_id", ws).eq("provider", "meta");
    await supabaseAdmin.from("integrations").delete()
      .eq("workspace_id", ws).like("provider", "meta_page_%");
    // 2) Ativos cacheados (páginas, IG, ad accounts, pixels, criativos, eventos, operações)
    // Ordem respeita FKs quando existem; erros isolados são ignorados pra não travar limpeza.
    const tables = [
      "meta_creative_uploads",
      "meta_lead_events",
      "meta_campaign_operations",
      "meta_instagram_accounts",
      "meta_pages",
      "meta_pixels",
      "meta_ad_accounts",
    ] as const;
    for (const t of tables) {
      try { await supabaseAdmin.from(t).delete().eq("workspace_id", ws); } catch { /* segue limpando */ }
    }
    void context;
    return { ok: true };
  });

/** Lista status de assinatura de mensagens por página e conta IG. */
export const listMessagingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: pages }, { data: igs }] = await Promise.all([
      context.supabase.from("meta_pages")
        .select("page_id,page_name,messaging_subscribed_at,messaging_error")
        .eq("workspace_id", data.workspaceId),
      context.supabase.from("meta_instagram_accounts")
        .select("instagram_id,username,page_id,messaging_subscribed_at,messaging_error")
        .eq("workspace_id", data.workspaceId),
    ]);
    return {
      pages: (pages ?? []) as Array<{ page_id: string; page_name: string | null; messaging_subscribed_at: string | null; messaging_error: string | null }>,
      instagram: (igs ?? []) as Array<{ instagram_id: string; username: string | null; page_id: string | null; messaging_subscribed_at: string | null; messaging_error: string | null }>,
    };
  });

function normalizeInsightValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  if (typeof value === "object" && value) {
    return Object.values(value as Record<string, unknown>).reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
  }
  return 0;
}

function readInsightValue(row: unknown, mode: "sum" | "latest" = "sum"): number {
  const item = row as { total_value?: { value?: unknown }; values?: Array<{ value?: unknown }> };
  const total = item.total_value?.value;
  const totalValue = normalizeInsightValue(total);
  if (totalValue > 0) return totalValue;

  const points = item.values ?? [];
  if (mode === "latest") {
    for (let i = points.length - 1; i >= 0; i--) {
      const latest = normalizeInsightValue(points[i]?.value);
      if (latest > 0) return latest;
    }
    return 0;
  }

  return points.reduce<number>((sum, point) => sum + normalizeInsightValue(point.value), 0);
}

type InsightMetricConfig = string | {
  metric: string;
  outputKey?: string;
  period?: string;
  mode?: "sum" | "latest";
  metricType?: string;
};

async function fetchMetaInsightMetrics(objectId: string, token: string, metrics: InsightMetricConfig[], since: string, until: string) {
  const values: Record<string, number> = {};
  const errors: string[] = [];

  await Promise.all(metrics.map(async (config) => {
    const metric = typeof config === "string" ? config : config.metric;
    const outputKey = typeof config === "string" ? config : (config.outputKey ?? config.metric);
    const period = typeof config === "string" ? "day" : (config.period ?? "day");
    const mode = typeof config === "string" ? "sum" : (config.mode ?? "sum");
    try {
      const url = new URL(`https://graph.facebook.com/${GRAPH}/${objectId}/insights`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("metric", metric);
      url.searchParams.set("period", period);
      url.searchParams.set("since", since);
      url.searchParams.set("until", until);
      if (typeof config !== "string" && config.metricType) url.searchParams.set("metric_type", config.metricType);
      const res = await fetch(url.toString());
      const text = await res.text();
      if (!res.ok) {
        errors.push(`${outputKey}: HTTP ${res.status}`);
        return;
      }
      const json = text ? JSON.parse(text) as { data?: unknown[] } : { data: [] };
      const row = json.data?.[0];
      values[outputKey] = row ? readInsightValue(row, mode) : 0;
    } catch (e) {
      errors.push(`${outputKey}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }));

  return { values, errors };
}

const SocialInsightAccountSchema = z.object({
  channelType: z.enum(["ig", "fb"]),
  accountId: z.string().min(1),
});

export const listSocialInsightChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: pages }, { data: igs }] = await Promise.all([
      context.supabase.from("meta_pages")
        .select("page_id,page_name,raw")
        .eq("workspace_id", data.workspaceId)
        .order("page_name", { ascending: true }),
      context.supabase.from("meta_instagram_accounts")
        .select("instagram_id,username,profile_picture_url,followers_count,page_id")
        .eq("workspace_id", data.workspaceId)
        .order("username", { ascending: true }),
    ]);

    const instagram = (igs ?? []).map((ig) => ({
      id: ig.instagram_id,
      type: "ig" as const,
      label: ig.username ? `@${ig.username}` : `Instagram ${ig.instagram_id}`,
      pageId: ig.page_id,
      avatarUrl: ig.profile_picture_url ?? null,
      followers: ig.followers_count ?? null,
    }));
    const facebook = (pages ?? []).map((page) => {
      const raw = (page.raw ?? {}) as Record<string, unknown>;
      const fanCount = Number(raw.fan_count ?? raw.followers_count ?? 0);
      return {
        id: page.page_id,
        type: "fb" as const,
        label: page.page_name || `Facebook ${page.page_id}`,
        pageId: page.page_id,
        avatarUrl: null,
        followers: Number.isFinite(fanCount) && fanCount > 0 ? fanCount : null,
      };
    });

    return { channels: [...instagram, ...facebook] };
  });

export const getMetaSocialAccountInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    channelType: z.enum(["ig", "fb"]).optional(),
    accountId: z.string().min(1).optional(),
    accounts: z.array(SocialInsightAccountSchema).min(1).optional(),
  }).refine((value) => Boolean(value.accounts?.length || (value.channelType && value.accountId)), {
    message: "Selecione ao menos uma conta social.",
  }).parse(d))
  .handler(async ({ data, context }) => {
    const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
    const [{ data: mem }, { data: isSuper }] = await Promise.all([
      context.supabase.from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    if (!mem && !isSuper) throw new Error("Sem permissão neste workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = start.toISOString().slice(0, 10);
    const until = end.toISOString().slice(0, 10);

    const requested = Array.from(new Map(
      (data.accounts?.length ? data.accounts : [{ channelType: data.channelType!, accountId: data.accountId! }])
        .map((account) => [`${account.channelType}:${account.accountId}`, account]),
    ).values());

    const fetchIgAccount = async (accountId: string) => {
      const { data: ig } = await context.supabase.from("meta_instagram_accounts")
        .select("instagram_id,username,page_id,followers_count")
        .eq("workspace_id", data.workspaceId)
        .eq("instagram_id", accountId)
        .maybeSingle();
      if (!ig?.page_id) throw new Error("Conta Instagram não encontrada ou sem Página vinculada.");

      const { data: token } = await supabaseAdmin.rpc("get_meta_page_token", {
        _workspace_id: data.workspaceId,
        _page_id: ig.page_id,
        _key: encKey,
      });
      if (!token) throw new Error("Token da Página Meta ausente. Reconecte a integração Meta.");

      let currentFollowers = Number(ig.followers_count) || 0;
      try {
        const fresh = await metaGet<{ followers_count?: number }>(ig.instagram_id, String(token), { fields: "followers_count" });
        currentFollowers = Number(fresh.followers_count) || currentFollowers;
      } catch { /* mantém cache local */ }

      const metricResult = await fetchMetaInsightMetrics(
        ig.instagram_id,
        String(token),
        [
          { metric: "reach", outputKey: "reach_28", period: "days_28", mode: "latest" },
          "reach",
          "views",
          "impressions",
          "profile_views",
          "accounts_engaged",
          "total_interactions",
          "likes",
          "comments",
          "shares",
          "saves",
          "replies",
          "plays",
        ],
        since,
        until,
      );
      const m = metricResult.values;
      const followers = currentFollowers;
      const reach = m.reach_28 || m.reach || 0;
      const interactions = m.total_interactions || m.accounts_engaged || ((m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0) + (m.replies || 0));

      return {
        source: "meta_graph" as const,
        channelType: "ig" as const,
        accountId: ig.instagram_id,
        label: ig.username ? `@${ig.username}` : `Instagram ${ig.instagram_id}`,
        since,
        until,
        errors: metricResult.errors,
        values: {
          followers_total: followers,
          followers_instagram: followers,
          accounts_connected: 1,
          reach_total: reach,
          impressions_total: m.views || m.impressions || 0,
          profile_views_total: m.profile_views || 0,
          video_views_total: m.plays || m.views || 0,
          likes_total: m.likes || 0,
          comments_total: m.comments || 0,
          shares_total: m.shares || 0,
          saves_total: m.saves || 0,
          interactions_total: interactions,
          engagement_rate_avg: reach > 0 ? (interactions / reach) * 100 : 0,
        },
      };
    };

    const fetchFbPage = async (accountId: string) => {
      const { data: page } = await context.supabase.from("meta_pages")
      .select("page_id,page_name,raw")
      .eq("workspace_id", data.workspaceId)
      .eq("page_id", accountId)
      .maybeSingle();
      if (!page?.page_id) throw new Error("Página Facebook não encontrada.");

      const { data: token } = await supabaseAdmin.rpc("get_meta_page_token", {
        _workspace_id: data.workspaceId,
        _page_id: page.page_id,
        _key: encKey,
      });
      if (!token) throw new Error("Token da Página Meta ausente. Reconecte a integração Meta.");

      const raw = (page.raw ?? {}) as Record<string, unknown>;
      let followers = Number(raw.followers_count ?? raw.fan_count ?? 0) || 0;
      try {
        const fresh = await metaGet<{ followers_count?: number; fan_count?: number }>(page.page_id, String(token), { fields: "followers_count,fan_count" });
        followers = Number(fresh.followers_count ?? fresh.fan_count ?? followers) || followers;
      } catch { /* mantém cache local */ }

      const metricResult = await fetchMetaInsightMetrics(
        page.page_id,
        String(token),
        [
          { metric: "page_impressions_unique", outputKey: "page_reach_28", period: "days_28", mode: "latest" },
          "page_impressions",
          "page_impressions_unique",
          "page_engaged_users",
          "page_post_engagements",
          "page_video_views",
          "page_actions_post_reactions_total",
        ],
        since,
        until,
      );
      const m = metricResult.values;
      const reach = m.page_reach_28 || m.page_impressions_unique || 0;
      const interactions = m.page_post_engagements || m.page_engaged_users || 0;

      return {
        source: "meta_graph" as const,
        channelType: "fb" as const,
        accountId: page.page_id,
        label: page.page_name || `Facebook ${page.page_id}`,
        since,
        until,
        errors: metricResult.errors,
        values: {
          followers_total: followers,
          followers_facebook: followers,
          accounts_connected: 1,
          reach_total: reach,
          impressions_total: m.page_impressions || 0,
          video_views_total: m.page_video_views || 0,
          likes_total: m.page_actions_post_reactions_total || 0,
          comments_total: 0,
          shares_total: 0,
          interactions_total: interactions,
          engagement_rate_avg: reach > 0 ? (interactions / reach) * 100 : 0,
        },
      };
    };

    const totals: Record<string, number> = {};
    const errors: string[] = [];
    const labels: string[] = [];
    let successfulAccounts = 0;

    for (const account of requested) {
      try {
        const result = account.channelType === "ig"
          ? await fetchIgAccount(account.accountId)
          : await fetchFbPage(account.accountId);
        labels.push(result.label);
        successfulAccounts += 1;
        for (const [key, value] of Object.entries(result.values)) {
          if (key === "engagement_rate_avg" || key === "accounts_connected") continue;
          totals[key] = (totals[key] ?? 0) + (Number(value) || 0);
        }
        errors.push(...result.errors.map((err) => `${result.label}: ${err}`));
      } catch (e) {
        errors.push(`${account.channelType === "ig" ? "Instagram" : "Facebook"} ${account.accountId}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }

    const reach = totals.reach_total || 0;
    const interactions = totals.interactions_total || 0;
    totals.accounts_connected = successfulAccounts;
    totals.engagement_rate_avg = reach > 0 ? (interactions / reach) * 100 : 0;

    return {
      source: "meta_graph" as const,
      channelType: requested.length === 1 ? requested[0].channelType : "mixed",
      accountId: requested.length === 1 ? requested[0].accountId : null,
      label: labels.join(", "),
      since,
      until,
      errors,
      values: totals,
    };
  });

/** Reassina eventos de mensagem em todas as páginas/IG conectadas. */
export const subscribeMessaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    pageIds: z.array(z.string()).optional(),
    instagramIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica membership
    const { data: mem } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem) throw new Error("Sem permissão neste workspace.");

    // Filtros opcionais: quando informados, assina apenas o que o usuario escolheu.
    const wantPages = data.pageIds && data.pageIds.length ? new Set(data.pageIds) : null;
    const wantIgs = data.instagramIds && data.instagramIds.length ? new Set(data.instagramIds) : null;
    const selective = !!(wantPages || wantIgs);

    const pagesQuery = supabaseAdmin
      .from("meta_pages")
      .select("page_id")
      .eq("workspace_id", data.workspaceId);
    const { data: allPages } = await pagesQuery;

    // Paginas necessarias: as escolhidas + as donas dos IGs escolhidos (para ter token).
    let igOwnerPages = new Set<string>();
    if (wantIgs) {
      const { data: igRows } = await supabaseAdmin
        .from("meta_instagram_accounts")
        .select("instagram_id,page_id")
        .eq("workspace_id", data.workspaceId)
        .in("instagram_id", Array.from(wantIgs));
      for (const r of (igRows ?? [])) if (r.page_id) igOwnerPages.add(r.page_id);
    }

    const pages = (allPages ?? []).filter((p) =>
      !selective || (wantPages?.has(p.page_id) ?? false) || igOwnerPages.has(p.page_id));

    let pagesOk = 0, pagesFail = 0, igsOk = 0, igsFail = 0;

    for (const p of pages) {
      const subscribePage = !selective || (wantPages?.has(p.page_id) ?? false);

      const { data: tok } = await supabaseAdmin.rpc("get_meta_page_token", {
        _workspace_id: data.workspaceId,
        _page_id: p.page_id,
        _key: encKey,
      });
      const pageToken = tok as string | null;
      if (!pageToken) { pagesFail++; continue; }

      // Messenger
      if (subscribePage) try {

        const r = await fetch(`https://graph.facebook.com/${GRAPH}/${p.page_id}/subscribed_apps`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token: pageToken,
            subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads,message_reactions",
          }).toString(),
        });
        if (r.ok) {
          pagesOk++;
          await supabaseAdmin.from("meta_pages")
            .update({ messaging_subscribed_at: new Date().toISOString(), messaging_error: null })
            .eq("workspace_id", data.workspaceId).eq("page_id", p.page_id);
        } else {
          pagesFail++;
          const txt = (await r.text().catch(() => "")).slice(0, 200);
          await supabaseAdmin.from("meta_pages")
            .update({ messaging_error: `HTTP ${r.status}: ${txt}` })
            .eq("workspace_id", data.workspaceId).eq("page_id", p.page_id);
        }
      } catch (e) {
        pagesFail++;
        await supabaseAdmin.from("meta_pages")
          .update({ messaging_error: e instanceof Error ? e.message : "erro" })
          .eq("workspace_id", data.workspaceId).eq("page_id", p.page_id);
      }

      // IG ligado a esta página
      const { data: igsAll } = await supabaseAdmin
        .from("meta_instagram_accounts")
        .select("instagram_id")
        .eq("workspace_id", data.workspaceId)
        .eq("page_id", p.page_id);
      const igs = (igsAll ?? []).filter((ig) => !selective || (wantIgs?.has(ig.instagram_id) ?? false));
      for (const ig of igs) {

        try {
          const r = await fetch(`https://graph.facebook.com/${GRAPH}/${ig.instagram_id}/subscribed_apps`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: pageToken,
              subscribed_fields: "messages,messaging_postbacks,message_reactions",
            }).toString(),
          });
          if (r.ok) {
            igsOk++;
            await supabaseAdmin.from("meta_instagram_accounts")
              .update({ messaging_subscribed_at: new Date().toISOString(), messaging_error: null })
              .eq("workspace_id", data.workspaceId).eq("instagram_id", ig.instagram_id);
          } else {
            igsFail++;
            const txt = (await r.text().catch(() => "")).slice(0, 200);
            await supabaseAdmin.from("meta_instagram_accounts")
              .update({ messaging_error: `HTTP ${r.status}: ${txt}` })
              .eq("workspace_id", data.workspaceId).eq("instagram_id", ig.instagram_id);
          }
        } catch (e) {
          igsFail++;
          await supabaseAdmin.from("meta_instagram_accounts")
            .update({ messaging_error: e instanceof Error ? e.message : "erro" })
            .eq("workspace_id", data.workspaceId).eq("instagram_id", ig.instagram_id);
        }
      }
    }

    return { ok: true, pagesOk, pagesFail, igsOk, igsFail };
  });





// ============================================================
// Fase 2, Insights API (KPIs agregados + campanhas)
// ============================================================

// Presets aceitos pela Graph API do Meta (date_preset) + "custom:YYYY-MM-DD:YYYY-MM-DD"
// para intervalos personalizados (converte para time_range no request).
const DATE_PRESETS = [
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
  (s) => (DATE_PRESETS as readonly string[]).includes(s) || CUSTOM_RE.test(s),
  { message: "preset inválido" },
);

/** Par-metros de data para /insights (endpoint direto). */
function dateParams(preset: string): Record<string, string> {
  const m = preset.match(CUSTOM_RE);
  if (m) return { time_range: JSON.stringify({ since: m[1], until: m[2] }) };
  return { date_preset: preset };
}

/** Sintaxe de expansão para o campo `insights` dentro de outras chamadas. */
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
  const encKey = requireEnv("INTEGRATION_ENCRYPTION_KEY");
  const { data: sec, error } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "meta",
    _key: encKey,
  });
  if (error) throw new Error(error.message);
  if (!sec) throw new Error("Meta não conectada neste workspace.");
  const token = (sec as { access_token?: string }).access_token;
  if (!token) throw new Error("Access token ausente.");
  return token;
}

type MetaAction = { action_type: string; value: string };
type MetaInsightRow = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  unique_clicks?: string;
  unique_ctr?: string;
  inline_link_clicks?: string;
  unique_inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  cost_per_unique_click?: string;
  cost_per_unique_inline_link_click?: string;
  outbound_clicks?: MetaAction[];
  outbound_clicks_ctr?: MetaAction[];
  cost_per_outbound_click?: MetaAction[];
  unique_outbound_clicks?: MetaAction[];
  unique_outbound_clicks_ctr?: MetaAction[];
  social_spend?: string;
  full_view_impressions?: string;
  full_view_reach?: string;
  estimated_ad_recallers?: string;
  estimated_ad_recall_rate?: string;
  cost_per_estimated_ad_recallers?: string;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  purchase_roas?: MetaAction[];
  website_purchase_roas?: MetaAction[];
  video_play_actions?: MetaAction[];
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p95_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
  video_15_sec_watched_actions?: MetaAction[];
  video_30_sec_watched_actions?: MetaAction[];
  video_avg_time_watched_actions?: MetaAction[];
};

function sumAction(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  let n = 0;
  for (const a of actions) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

function sumAll(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;
  let n = 0;
  for (const a of actions) n += Number(a.value) || 0;
  return n;
}

const ACTION_TYPES = {
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_lead", "onsite_conversion.messenger_lead"],
  purchases: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
  websitePurchases: ["offsite_conversion.fb_pixel_purchase", "website_purchase"],
  storeAssistedPurchases: ["offline_conversion.purchase", "store_visit_purchase", "onsite_conversion.purchase_assisted"],
  addToCart: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"],
  wishlistAdds: ["add_to_wishlist", "offsite_conversion.fb_pixel_add_to_wishlist", "omni_add_to_wishlist"],
  initiateCheckout: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"],
  addPaymentInfo: ["add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"],
  viewContent: ["view_content", "offsite_conversion.fb_pixel_view_content", "omni_view_content"],
  completeRegistration: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration", "omni_complete_registration"],
  subscribe: ["subscribe", "offsite_conversion.fb_pixel_subscribe"],
  appActivations: ["app_activation", "mobile_app_activate_app", "app_custom_event.fb_mobile_activate_app"],
  ratingsSubmitted: ["rate", "app_custom_event.fb_mobile_rate"],
  getDirectionsClicks: ["find_location", "onsite_conversion.get_directions_click"],
  appAdClicks: ["app_ad_click", "mobile_app_ad_click"],
  phoneNumberClicks: ["phone_call", "phone_number_click", "onsite_conversion.phone_call", "onsite_conversion.call_confirm_grouped"],
  workflowCompletions: ["workflow_completion", "onsite_conversion.workflow_completion"],
  achievementsUnlocked: ["achievement_unlocked", "app_custom_event.fb_mobile_achievement_unlocked"],
  contact: ["contact", "offsite_conversion.fb_pixel_contact"],
  donate: ["donate", "offsite_conversion.fb_pixel_donate"],
  appEngagement: ["app_engagement", "mobile_app_engagement"],
  appStoryEngagement: ["app_story_engagement"],
  customEvents: ["custom_event", "offsite_conversion.fb_pixel_custom"],
  creditSpends: ["spent_credits", "app_custom_event.fb_mobile_spent_credits"],
  schedule: ["schedule", "offsite_conversion.fb_pixel_schedule"],
  appAdImpressions: ["app_ad_impression", "mobile_app_ad_impression"],
  submitApplication: ["submit_application", "offsite_conversion.fb_pixel_submit_application"],
  appInstalls: ["mobile_app_install", "app_install", "omni_app_install"],
  facebookPurchaseMessages: ["onsite_conversion.messaging_purchase", "onsite_conversion.facebook_purchase_message"],
  levelsAchieved: ["level_achieved", "app_custom_event.fb_mobile_level_achieved"],
  offlineConversions: ["offline_conversion", "offline_conversion.other"],
  ordersCreated: ["order_created", "onsite_conversion.order_created"],
  ordersShipped: ["order_shipped", "onsite_conversion.order_shipped"],
  startTrial: ["start_trial", "offsite_conversion.fb_pixel_start_trial"],
  search: ["search", "offsite_conversion.fb_pixel_search"],
  findLocation: ["find_location", "offsite_conversion.fb_pixel_find_location"],
  customizeProduct: ["customize_product"],
  postEngagement: ["post_engagement"],
  pageEngagement: ["page_engagement"],
  postReaction: ["post_reaction"],
  postComment: ["comment"],
  postShare: ["post"],
  postSave: ["onsite_conversion.post_save"],
  pageLike: ["like"],
  linkClick: ["link_click"],
  photoView: ["photo_view"],
  instagramProfileVisits: ["onsite_conversion.ig_profile_visit", "instagram_profile_visit"],
  instagramFollows: ["onsite_conversion.ig_follow", "instagram_follow"],
  checkins: ["checkin"],
  eventResponses: ["rsvp", "event_response"],
  groupJoinRequests: ["group_join_request"],
  effectShares: ["effect_share"],
  reminderSet: ["onsite_conversion.reminder_set", "reminder_set"],
  messagingSubscriptions: ["onsite_conversion.messaging_user_subscribed", "messaging_user_subscribed"],
  messagingContacts: ["onsite_conversion.messaging_first_reply", "onsite_conversion.total_messaging_connection", "messaging_contact"],
  newMessagingContacts: ["onsite_conversion.messaging_first_reply", "onsite_conversion.new_messaging_connection"],
  returningMessagingContacts: ["onsite_conversion.messaging_returning_user", "returning_messaging_contact"],
  messagingConversationsStarted: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_conversation_started"],
  messagingConversationsReplied: ["onsite_conversion.messaging_conversation_replied_7d", "onsite_conversion.messaging_first_reply"],
  welcomeMessageViews: ["onsite_conversion.messaging_welcome_message_view"],
  messengerCalls: ["onsite_conversion.messenger_call", "messenger_call"],
  phoneCalls: ["phone_call", "onsite_conversion.phone_call"],
  callbackRequests: ["onsite_conversion.callback_request_submitted", "callback_request"],
} as const;

function cost(spend: number, count: number): number {
  return count > 0 ? spend / count : 0;
}

/**
 * Retorna o "resultado real" da campanha/adset/anúncio de acordo com o objetivo
 * declarado na Meta e (opcionalmente) a otimização do conjunto. Isso evita
 * mostrar "0 leads" para campanhas de mensagem, tráfego, engajamento etc.
 */
export function resultFromObjective(
  objective: string | null | undefined,
  actions: MetaAction[] | undefined,
  spend: number,
  opts?: { optimizationGoal?: string | null; impressions?: number; reach?: number; clicks?: number },
): { count: number; label: string; costLabel: string; cost: number } {
  const obj = (objective ?? "").toUpperCase();
  const opt = (opts?.optimizationGoal ?? "").toUpperCase();

  const msgStarted = sumAction(actions, [...ACTION_TYPES.messagingConversationsStarted]);
  const lds = sumAction(actions, [...ACTION_TYPES.leads]);
  const purch = sumAction(actions, [...ACTION_TYPES.purchases]);
  const linkClicks = sumAction(actions, [...ACTION_TYPES.linkClick]);
  const postEng = sumAction(actions, [...ACTION_TYPES.postEngagement]);
  const pageEng = sumAction(actions, [...ACTION_TYPES.pageEngagement]);
  const pageLikes = sumAction(actions, [...ACTION_TYPES.pageLike]);
  const installs = sumAction(actions, [...ACTION_TYPES.appInstalls]);
  const videoViews = sumAction(actions, ["video_view"]);
  const thruplays = sumAction(actions, ["video_thruplay_watched_actions"]);
  const impressions = opts?.impressions ?? 0;
  const reach = opts?.reach ?? 0;

  const pack = (count: number, label: string, costLabel: string) => ({
    count,
    label,
    costLabel,
    cost: count > 0 ? spend / count : 0,
  });

  // Mensagens (objetivo de conversas): prioridade máxima quando houver sinal claro
  if (
    obj.includes("MESSAGES") ||
    opt === "CONVERSATIONS" ||
    opt === "REPLIES" ||
    (msgStarted > 0 && (obj.includes("ENGAGEMENT") || obj.includes("MESSAG")))
  ) {
    return pack(msgStarted, "Conversas iniciadas", "Custo por conversa");
  }

  // Leads (formulário / instant form / messenger lead)
  if (obj.includes("LEAD") || opt === "LEAD_GENERATION" || opt === "QUALITY_LEAD") {
    return pack(lds, "Leads", "Custo por lead");
  }

  // Vendas / Conversões
  if (obj.includes("SALES") || obj.includes("CONVERSION") || obj.includes("CATALOG") || opt === "OFFSITE_CONVERSIONS" || opt === "VALUE") {
    return pack(purch, "Compras", "Custo por compra");
  }

  // Tráfego
  if (obj.includes("TRAFFIC") || obj.includes("LINK_CLICKS") || opt === "LINK_CLICKS" || opt === "LANDING_PAGE_VIEWS") {
    const lpv = sumAction(actions, ["landing_page_view"]);
    if (opt === "LANDING_PAGE_VIEWS" && lpv > 0) return pack(lpv, "Visitas à página", "Custo por visita");
    const count = linkClicks > 0 ? linkClicks : (opts?.clicks ?? 0);
    return pack(count, "Cliques no link", "Custo por clique");
  }

  // App
  if (obj.includes("APP") || opt === "APP_INSTALLS") {
    return pack(installs, "Instalações", "Custo por instalação");
  }

  // Vídeo
  if (obj.includes("VIDEO_VIEWS") || opt === "THRUPLAY" || opt === "VIDEO_VIEWS") {
    const count = thruplays > 0 ? thruplays : videoViews;
    return pack(count, "Visualizações de vídeo", "Custo por visualização");
  }

  // Awareness / Reach
  if (obj.includes("AWARENESS") || obj.includes("REACH") || opt === "REACH" || opt === "AD_RECALL_LIFT" || opt === "IMPRESSIONS") {
    if (obj.includes("REACH") || opt === "REACH") return pack(reach, "Alcance", "Custo por 1k pessoas alcançadas");
    return pack(impressions, "Impressões", "CPM");
  }

  // Engajamento (default quando o objetivo é ENGAGEMENT sem sinal de mensagem)
  if (obj.includes("ENGAGEMENT") || obj.includes("POST_ENGAGEMENT") || opt === "POST_ENGAGEMENT" || opt === "PAGE_LIKES" || opt === "EVENT_RESPONSES") {
    if (opt === "PAGE_LIKES" && pageLikes > 0) return pack(pageLikes, "Curtidas na página", "Custo por curtida");
    const count = postEng > 0 ? postEng : pageEng;
    return pack(count, "Engajamentos", "Custo por engajamento");
  }

  // Fallback inteligente: escolhe o maior sinal disponível
  const candidates: Array<{ c: number; l: string; cl: string }> = [
    { c: msgStarted, l: "Conversas iniciadas", cl: "Custo por conversa" },
    { c: lds, l: "Leads", cl: "Custo por lead" },
    { c: purch, l: "Compras", cl: "Custo por compra" },
    { c: linkClicks, l: "Cliques no link", cl: "Custo por clique" },
    { c: postEng, l: "Engajamentos", cl: "Custo por engajamento" },
  ];
  const best = candidates.sort((a, b) => b.c - a.c)[0];
  if (best.c > 0) return pack(best.c, best.l, best.cl);
  return pack(0, "Resultados", "Custo por resultado");
}

const INSIGHT_FIELDS = [
  "spend","impressions","clicks","ctr","cpc","cpm","reach","frequency",
  "unique_clicks","unique_ctr","inline_link_clicks","unique_inline_link_clicks","inline_link_click_ctr",
  "cost_per_inline_link_click","cost_per_unique_click","cost_per_unique_inline_link_click",
  "outbound_clicks","outbound_clicks_ctr","cost_per_outbound_click",
  "unique_outbound_clicks","unique_outbound_clicks_ctr",
  "social_spend","full_view_impressions","full_view_reach",
  "estimated_ad_recallers","estimated_ad_recall_rate","cost_per_estimated_ad_recallers",
  "quality_ranking","engagement_rate_ranking","conversion_rate_ranking",
  "actions","action_values","cost_per_action_type",
  "purchase_roas","website_purchase_roas",
  "video_play_actions","video_p25_watched_actions","video_p50_watched_actions",
  "video_p75_watched_actions","video_p95_watched_actions","video_p100_watched_actions",
  "video_thruplay_watched_actions","video_15_sec_watched_actions","video_30_sec_watched_actions",
  "video_avg_time_watched_actions",
].join(",");

/** KPIs agregados de todas as ad accounts do workspace para o período pedido. */
export const getMetaInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    preset: presetSchema.default("last_7d"),
    accountIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    let q = context.supabase
      .from("meta_ad_accounts")
      .select("account_id,currency,name")
      .eq("workspace_id", data.workspaceId);
    if (data.accountIds && data.accountIds.length > 0) {
      q = q.in("account_id", data.accountIds);
    }
    const { data: accts } = await q;

    const accounts = (accts ?? []) as { account_id: string; currency: string | null; name: string | null }[];
    if (accounts.length === 0) {
      return { totals: null, byAccount: [], currency: null, preset: data.preset };
    }

    let spend = 0, impressions = 0, clicks = 0, leads = 0, purchases = 0, websitePurchases = 0, storeAssistedPurchases = 0, purchaseValue = 0, reach = 0;
    let linkClicks = 0, uniqueLinkClicks = 0, uniqueClicks = 0, landingPageViews = 0;
    let outboundClicks = 0, uniqueOutboundClicks = 0, photoClicks = 0, businessAiClicks = 0, shopClicks = 0;
    let addToCart = 0, wishlistAdds = 0, initiateCheckout = 0, viewContent = 0, completeRegistration = 0;
    let addPaymentInfo = 0, search = 0, subscribe = 0, startTrial = 0, contact = 0, customizeProduct = 0, donate = 0, findLocation = 0, schedule = 0, submitApplication = 0;
    let appActivations = 0, ratingsSubmitted = 0, getDirectionsClicks = 0, appAdClicks = 0, phoneNumberClicks = 0, workflowCompletions = 0, achievementsUnlocked = 0;
    let appEngagement = 0, appStoryEngagement = 0, customEvents = 0, creditSpends = 0, appAdImpressions = 0, appInstalls = 0, facebookPurchaseMessages = 0, levelsAchieved = 0, offlineConversions = 0, ordersCreated = 0, ordersShipped = 0;
    let postEngagement = 0, pageEngagement = 0, postReaction = 0, postComment = 0, postShare = 0, postSave = 0, pageLike = 0, linkClickActions = 0, photoView = 0;
    let instagramProfileVisits = 0, instagramFollows = 0, checkins = 0, eventResponses = 0, groupJoinRequests = 0, effectShares = 0, reminderSet = 0;
    let messagingSubscriptions = 0, messagingContacts = 0, newMessagingContacts = 0, returningMessagingContacts = 0, messagingConversationsStarted = 0, messagingConversationsReplied = 0, welcomeMessageViews = 0, messengerCalls = 0, phoneCalls = 0, callbackRequests = 0;
    let videoPlays = 0, videoP25 = 0, videoP50 = 0, videoP75 = 0, videoP95 = 0, videoP100 = 0, video15s = 0, video30s = 0, videoThruplay = 0, videoViews = 0, videoContinuousPlays = 0, uniqueVideoContinuousPlays = 0;
    let videoAvgWatchTime = 0, videoAvgCount = 0;
    let purchaseValueActual = 0, websitePurchaseValue = 0, leadValue = 0, addToCartValue = 0, initiateCheckoutValue = 0, subscribeValue = 0, donateValue = 0, omniPurchaseValue = 0, totalActionValue = 0;
    let websitePurchaseRoasSum = 0, websitePurchaseRoasSpend = 0;
    let socialSpend = 0, fullViewImpressions = 0, fullViewReach = 0;
    let estRecallers = 0, estRecallRate = 0, estRecallRateCount = 0;
    let freqSum = 0, freqCount = 0;
    let uniqueCtrSum = 0, uniqueCtrCount = 0;
    let inlineLinkCtrSum = 0, inlineLinkCtrCount = 0;
    let uniqueInlineLinkCtrSum = 0, uniqueInlineLinkCtrCount = 0;
    let uniqueOutboundCtrSum = 0, uniqueOutboundCtrCount = 0;
    let qualityRanking: string | null = null, engagementRanking: string | null = null, conversionRanking: string | null = null;
    const byAccount: Array<{ accountId: string; name: string | null; spend: number; leads: number; cpl: number; roas: number; currency: string | null }> = [];

    await Promise.all(accounts.map(async (a) => {
      try {
        const j = await metaGet<{ data: MetaInsightRow[] }>(`${a.account_id}/insights`, token, {
          ...dateParams(data.preset),
          fields: INSIGHT_FIELDS,
          level: "account",
        });
        const row = j.data?.[0];
        if (!row) return;
        const s = Number(row.spend) || 0;
        const imp = Number(row.impressions) || 0;
        const clk = Number(row.clicks) || 0;
        const rch = Number(row.reach) || 0;
        const freq = Number(row.frequency) || 0;
        const uClk = Number(row.unique_clicks) || 0;
        const lnk = Number(row.inline_link_clicks) || 0;
        const uLnk = Number(row.unique_inline_link_clicks) || 0;
        const lpv = sumAction(row.actions, ["landing_page_view"]);
        const lds = sumAction(row.actions, [...ACTION_TYPES.leads]);
        const purch = sumAction(row.actions, [...ACTION_TYPES.purchases]);
        const webPurch = sumAction(row.actions, [...ACTION_TYPES.websitePurchases]);
        const storePurch = sumAction(row.actions, [...ACTION_TYPES.storeAssistedPurchases]);
        const purchVal = sumAction(row.action_values, [...ACTION_TYPES.purchases]);
        const webPurchVal = sumAction(row.action_values, [...ACTION_TYPES.websitePurchases]);
        const ldsVal = sumAction(row.action_values, [...ACTION_TYPES.leads]);
        const atc = sumAction(row.actions, [...ACTION_TYPES.addToCart]);
        const watc = sumAction(row.actions, [...ACTION_TYPES.wishlistAdds]);
        const ic  = sumAction(row.actions, [...ACTION_TYPES.initiateCheckout]);
        const vc  = sumAction(row.actions, [...ACTION_TYPES.viewContent]);
        const cr  = sumAction(row.actions, [...ACTION_TYPES.completeRegistration]);
        const api = sumAction(row.actions, [...ACTION_TYPES.addPaymentInfo]);
        const sr = sumAction(row.actions, [...ACTION_TYPES.search]);
        const sub = sumAction(row.actions, [...ACTION_TYPES.subscribe]);
        const st = sumAction(row.actions, [...ACTION_TYPES.startTrial]);
        const ct = sumAction(row.actions, [...ACTION_TYPES.contact]);
        const cp = sumAction(row.actions, [...ACTION_TYPES.customizeProduct]);
        const dn = sumAction(row.actions, [...ACTION_TYPES.donate]);
        const fl = sumAction(row.actions, [...ACTION_TYPES.findLocation]);
        const sc = sumAction(row.actions, [...ACTION_TYPES.schedule]);
        const sa = sumAction(row.actions, [...ACTION_TYPES.submitApplication]);
        const act = sumAction(row.actions, [...ACTION_TYPES.appActivations]);
        const rating = sumAction(row.actions, [...ACTION_TYPES.ratingsSubmitted]);
        const directions = sumAction(row.actions, [...ACTION_TYPES.getDirectionsClicks]);
        const appClick = sumAction(row.actions, [...ACTION_TYPES.appAdClicks]);
        const phoneClick = sumAction(row.actions, [...ACTION_TYPES.phoneNumberClicks]);
        const workflow = sumAction(row.actions, [...ACTION_TYPES.workflowCompletions]);
        const achievement = sumAction(row.actions, [...ACTION_TYPES.achievementsUnlocked]);
        const appEng = sumAction(row.actions, [...ACTION_TYPES.appEngagement]);
        const appStory = sumAction(row.actions, [...ACTION_TYPES.appStoryEngagement]);
        const custom = sumAction(row.actions, [...ACTION_TYPES.customEvents]);
        const credits = sumAction(row.actions, [...ACTION_TYPES.creditSpends]);
        const appImp = sumAction(row.actions, [...ACTION_TYPES.appAdImpressions]);
        const installs = sumAction(row.actions, [...ACTION_TYPES.appInstalls]);
        const fbMsgPurchase = sumAction(row.actions, [...ACTION_TYPES.facebookPurchaseMessages]);
        const levels = sumAction(row.actions, [...ACTION_TYPES.levelsAchieved]);
        const offline = sumAction(row.actions, [...ACTION_TYPES.offlineConversions]);
        const createdOrders = sumAction(row.actions, [...ACTION_TYPES.ordersCreated]);
        const shippedOrders = sumAction(row.actions, [...ACTION_TYPES.ordersShipped]);
        const pe = sumAction(row.actions, [...ACTION_TYPES.postEngagement]);
        const pge = sumAction(row.actions, [...ACTION_TYPES.pageEngagement]);
        const pr = sumAction(row.actions, [...ACTION_TYPES.postReaction]);
        const pc = sumAction(row.actions, [...ACTION_TYPES.postComment]);
        const psh = sumAction(row.actions, [...ACTION_TYPES.postShare]);
        const psv = sumAction(row.actions, [...ACTION_TYPES.postSave]);
        const pl = sumAction(row.actions, [...ACTION_TYPES.pageLike]);
        const lca = sumAction(row.actions, [...ACTION_TYPES.linkClick]);
        const pv = sumAction(row.actions, [...ACTION_TYPES.photoView]);
        const igVisit = sumAction(row.actions, [...ACTION_TYPES.instagramProfileVisits]);
        const igFollow = sumAction(row.actions, [...ACTION_TYPES.instagramFollows]);
        const chk = sumAction(row.actions, [...ACTION_TYPES.checkins]);
        const events = sumAction(row.actions, [...ACTION_TYPES.eventResponses]);
        const groups = sumAction(row.actions, [...ACTION_TYPES.groupJoinRequests]);
        const effects = sumAction(row.actions, [...ACTION_TYPES.effectShares]);
        const reminders = sumAction(row.actions, [...ACTION_TYPES.reminderSet]);
        const msgSubs = sumAction(row.actions, [...ACTION_TYPES.messagingSubscriptions]);
        const msgContacts = sumAction(row.actions, [...ACTION_TYPES.messagingContacts]);
        const newMsgContacts = sumAction(row.actions, [...ACTION_TYPES.newMessagingContacts]);
        const retMsgContacts = sumAction(row.actions, [...ACTION_TYPES.returningMessagingContacts]);
        const msgStarted = sumAction(row.actions, [...ACTION_TYPES.messagingConversationsStarted]);
        const msgReplied = sumAction(row.actions, [...ACTION_TYPES.messagingConversationsReplied]);
        const welcomeViews = sumAction(row.actions, [...ACTION_TYPES.welcomeMessageViews]);
        const mCalls = sumAction(row.actions, [...ACTION_TYPES.messengerCalls]);
        const pCalls = sumAction(row.actions, [...ACTION_TYPES.phoneCalls]);
        const callbacks = sumAction(row.actions, [...ACTION_TYPES.callbackRequests]);
        const vp = sumAll(row.video_play_actions);
        const v25 = sumAll(row.video_p25_watched_actions);
        const v50 = sumAll(row.video_p50_watched_actions);
        const v75 = sumAll(row.video_p75_watched_actions);
        const v95 = sumAll(row.video_p95_watched_actions);
        const v100 = sumAll(row.video_p100_watched_actions);
        const v15 = sumAll(row.video_15_sec_watched_actions);
        const v30 = sumAll(row.video_30_sec_watched_actions);
        const vv  = sumAction(row.actions, ["video_view"]);
        const tp  = sumAll(row.video_thruplay_watched_actions);
        const vAvg = sumAll(row.video_avg_time_watched_actions);
        const oc = sumAll(row.outbound_clicks);
        const uoc = sumAll(row.unique_outbound_clicks);
        const roas = Number(row.purchase_roas?.[0]?.value) || 0;
        const webRoas = Number(row.website_purchase_roas?.[0]?.value) || 0;

        spend += s; impressions += imp; clicks += clk; reach += rch; leads += lds; purchases += purch; websitePurchases += webPurch; storeAssistedPurchases += storePurch;
        purchaseValue += s * roas;
        if (webRoas > 0) { websitePurchaseRoasSum += webRoas * s; websitePurchaseRoasSpend += s; }
        purchaseValueActual += purchVal; websitePurchaseValue += webPurchVal; leadValue += ldsVal;
        addToCartValue += sumAction(row.action_values, [...ACTION_TYPES.addToCart]); initiateCheckoutValue += sumAction(row.action_values, [...ACTION_TYPES.initiateCheckout]);
        subscribeValue += sumAction(row.action_values, [...ACTION_TYPES.subscribe]); donateValue += sumAction(row.action_values, [...ACTION_TYPES.donate]); omniPurchaseValue += sumAction(row.action_values, ["omni_purchase"]); totalActionValue += sumAll(row.action_values);
        linkClicks += lnk; uniqueLinkClicks += uLnk; uniqueClicks += uClk; landingPageViews += lpv; outboundClicks += oc; uniqueOutboundClicks += uoc;
        photoClicks += pv; businessAiClicks += sumAction(row.actions, ["business_ai_click"]); shopClicks += sumAction(row.actions, ["shop_click", "onsite_conversion.shop_click"]);
        addToCart += atc; wishlistAdds += watc; initiateCheckout += ic; viewContent += vc; completeRegistration += cr;
        addPaymentInfo += api; search += sr; subscribe += sub; startTrial += st; contact += ct;
        customizeProduct += cp; donate += dn; findLocation += fl; schedule += sc; submitApplication += sa;
        appActivations += act; ratingsSubmitted += rating; getDirectionsClicks += directions; appAdClicks += appClick; phoneNumberClicks += phoneClick; workflowCompletions += workflow; achievementsUnlocked += achievement;
        appEngagement += appEng; appStoryEngagement += appStory; customEvents += custom; creditSpends += credits; appAdImpressions += appImp; appInstalls += installs; facebookPurchaseMessages += fbMsgPurchase; levelsAchieved += levels; offlineConversions += offline; ordersCreated += createdOrders; ordersShipped += shippedOrders;
        postEngagement += pe; pageEngagement += pge; postReaction += pr; postComment += pc; postShare += psh;
        postSave += psv; pageLike += pl; linkClickActions += lca; photoView += pv;
        instagramProfileVisits += igVisit; instagramFollows += igFollow; checkins += chk; eventResponses += events; groupJoinRequests += groups; effectShares += effects; reminderSet += reminders;
        messagingSubscriptions += msgSubs; messagingContacts += msgContacts; newMessagingContacts += newMsgContacts; returningMessagingContacts += retMsgContacts; messagingConversationsStarted += msgStarted; messagingConversationsReplied += msgReplied; welcomeMessageViews += welcomeViews; messengerCalls += mCalls; phoneCalls += pCalls; callbackRequests += callbacks;
        videoPlays += vp; videoP25 += v25; videoP50 += v50; videoP75 += v75; videoP95 += v95; videoP100 += v100;
        video15s += v15; video30s += v30; videoViews += vv; videoContinuousPlays += vv; uniqueVideoContinuousPlays += v100; videoThruplay += tp;
        if (vAvg > 0 && vp > 0) { videoAvgWatchTime += vAvg * vp; videoAvgCount += vp; }
        socialSpend += Number(row.social_spend) || 0;
        fullViewImpressions += Number(row.full_view_impressions) || 0;
        fullViewReach += Number(row.full_view_reach) || 0;
        estRecallers += Number(row.estimated_ad_recallers) || 0;
        const err = Number(row.estimated_ad_recall_rate) || 0;
        if (err > 0) { estRecallRate += err * imp; estRecallRateCount += imp; }
        if (freq > 0) { freqSum += freq * imp; freqCount += imp; }
        const uctr = Number(row.unique_ctr) || 0;
        if (uctr > 0) { uniqueCtrSum += uctr * imp; uniqueCtrCount += imp; }
        const ilctr = Number(row.inline_link_click_ctr) || 0;
        if (ilctr > 0) { inlineLinkCtrSum += ilctr * imp; inlineLinkCtrCount += imp; }
        if (uLnk > 0 && rch > 0) { uniqueInlineLinkCtrSum += (uLnk / rch) * 100 * rch; uniqueInlineLinkCtrCount += rch; }
        const uoctr = Number(row.unique_outbound_clicks_ctr?.[0]?.value) || 0;
        if (uoctr > 0) { uniqueOutboundCtrSum += uoctr * imp; uniqueOutboundCtrCount += imp; }
        if (row.quality_ranking && row.quality_ranking !== "UNKNOWN") qualityRanking = row.quality_ranking;
        if (row.engagement_rate_ranking && row.engagement_rate_ranking !== "UNKNOWN") engagementRanking = row.engagement_rate_ranking;
        if (row.conversion_rate_ranking && row.conversion_rate_ranking !== "UNKNOWN") conversionRanking = row.conversion_rate_ranking;

        byAccount.push({
          accountId: a.account_id,
          name: a.name,
          spend: s,
          leads: lds,
          cpl: lds > 0 ? s / lds : 0,
          roas,
          currency: a.currency,
        });
      } catch (e) {
        console.warn(`[meta insights] ${a.account_id} falhou:`, e);
      }
    }));

    const results = leads || purchases || messagingConversationsStarted || newMessagingContacts || linkClicks || postEngagement;
    const resultValue = purchaseValueActual || leadValue || totalActionValue;
    const totals = {
      spend, impressions, clicks, reach, leads, purchases, websitePurchases, storeAssistedPurchases,
      results,
      costPerResult: cost(spend, results),
      resultRate: impressions > 0 ? (results / impressions) * 100 : 0,
      resultValue,
      resultRoas: spend > 0 ? resultValue / spend : 0,
      budgetUsedPercent: 0,
      linkClicks, uniqueLinkClicks, uniqueClicks, landingPageViews, outboundClicks, uniqueOutboundClicks,
      photoClicks, businessAiClicks, shopClicks,
      addToCart, wishlistAdds, initiateCheckout, viewContent, completeRegistration,
      addPaymentInfo, search, subscribe, startTrial, contact, customizeProduct, donate, findLocation, schedule, submitApplication,
      appActivations, ratingsSubmitted, getDirectionsClicks, appAdClicks, phoneNumberClicks, workflowCompletions, achievementsUnlocked,
      appEngagement, appStoryEngagement, customEvents, creditSpends, appAdImpressions, appInstalls, facebookPurchaseMessages, levelsAchieved, offlineConversions, ordersCreated, ordersShipped,
      postEngagement, pageEngagement, postReaction, postComment, postShare, postSave, pageLike, linkClickActions, photoView,
      instagramProfileVisits, instagramFollows, checkins, eventResponses, groupJoinRequests, effectShares, reminderSet,
      messagingSubscriptions, messagingContacts, newMessagingContacts, returningMessagingContacts, messagingConversationsStarted, messagingConversationsReplied, welcomeMessageViews, messengerCalls, phoneCalls, callbackRequests,
      videoPlays, videoP25, videoP50, videoP75, videoP95, videoP100, video15s, video30s, videoViews, videoContinuousPlays, uniqueVideoContinuousPlays, videoThruplay,
      views: impressions,
      videoAvgWatchTime: videoAvgCount > 0 ? videoAvgWatchTime / videoAvgCount : 0,
      videoHoldRate: videoPlays > 0 ? (videoP100 / videoPlays) * 100 : 0,
      videoRetentionP25: videoPlays > 0 ? (videoP25 / videoPlays) * 100 : 0,
      videoRetentionP50: videoPlays > 0 ? (videoP50 / videoPlays) * 100 : 0,
      videoRetentionP75: videoPlays > 0 ? (videoP75 / videoPlays) * 100 : 0,
      videoRetentionP95: videoPlays > 0 ? (videoP95 / videoPlays) * 100 : 0,
      socialSpend, fullViewImpressions, fullViewReach,
      estimatedAdRecallers: estRecallers,
      estimatedAdRecallRate: estRecallRateCount > 0 ? estRecallRate / estRecallRateCount : 0,
      costPerEstimatedRecaller: estRecallers > 0 ? spend / estRecallers : 0,
      frequency: freqCount > 0 ? freqSum / freqCount : 0,
      uniqueCtr: uniqueCtrCount > 0 ? uniqueCtrSum / uniqueCtrCount : 0,
      inlineLinkClickCtr: inlineLinkCtrCount > 0 ? inlineLinkCtrSum / inlineLinkCtrCount : 0,
      uniqueInlineLinkClickCtr: uniqueInlineLinkCtrCount > 0 ? uniqueInlineLinkCtrSum / uniqueInlineLinkCtrCount : 0,
      cpl: leads > 0 ? spend / leads : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      cppMetaAccountsReached: reach > 0 ? (spend / reach) * 1000 : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpp: purchases > 0 ? spend / purchases : 0,
      costPerWebsitePurchase: cost(spend, websitePurchases),
      costPerAtc: cost(spend, addToCart),
      costPerWishlistAdd: cost(spend, wishlistAdds),
      costPerIc: cost(spend, initiateCheckout),
      costPerAddPaymentInfo: cost(spend, addPaymentInfo),
      costPerLpv: cost(spend, landingPageViews),
      costPerLinkClick: cost(spend, linkClicks),
      costPerUniqueLinkClick: cost(spend, uniqueLinkClicks),
      costPerOutboundClick: cost(spend, outboundClicks),
      costPerUniqueOutboundClick: cost(spend, uniqueOutboundClicks),
      costPerUniqueClick: cost(spend, uniqueClicks),
      costPerViewContent: cost(spend, viewContent),
      costPerCompleteRegistration: cost(spend, completeRegistration),
      costPerSubscribe: cost(spend, subscribe),
      costPerContact: cost(spend, contact),
      costPerDonate: cost(spend, donate),
      costPerAppInstall: cost(spend, appInstalls),
      costPerSubmitApplication: cost(spend, submitApplication),
      costPerStartTrial: cost(spend, startTrial),
      costPerSearch: cost(spend, search),
      costPerFindLocation: cost(spend, findLocation),
      costPerCustomEvent: cost(spend, customEvents),
      costPerPostEngagement: cost(spend, postEngagement),
      costPerPageEngagement: cost(spend, pageEngagement),
      costPerPageLike: cost(spend, pageLike),
      costPerEventResponse: cost(spend, eventResponses),
      costPerGroupJoinRequest: cost(spend, groupJoinRequests),
      costPerMessagingSubscription: cost(spend, messagingSubscriptions),
      costPerMessagingConversationStarted: cost(spend, messagingConversationsStarted),
      costPerNewMessagingContact: cost(spend, newMessagingContacts),
      costPerThruplay: cost(spend, videoThruplay),
      costPerVideoPlay: cost(spend, videoPlays),
      costPerVideoView: cost(spend, videoViews),
      costPerVideoContinuousPlay: cost(spend, videoContinuousPlays),
      outboundCtr: impressions > 0 ? (outboundClicks / impressions) * 100 : 0,
      uniqueOutboundCtr: uniqueOutboundCtrCount > 0 ? uniqueOutboundCtrSum / uniqueOutboundCtrCount : 0,
      roas: spend > 0 ? purchaseValue / spend : 0,
      roasActual: spend > 0 ? purchaseValueActual / spend : 0,
      websitePurchaseRoas: websitePurchaseRoasSpend > 0 ? websitePurchaseRoasSum / websitePurchaseRoasSpend : 0,
      purchaseValue,
      purchaseValueActual,
      websitePurchaseValue,
      leadValue,
      addToCartValue,
      initiateCheckoutValue,
      subscribeValue,
      donateValue,
      omniPurchaseValue,
      totalActionValue,
      qualityRanking, engagementRanking, conversionRanking,
    };

    return {
      totals,
      byAccount: byAccount.sort((a, b) => b.spend - a.spend),
      currency: accounts.find((x) => x.currency)?.currency ?? null,
      preset: data.preset,
    };
  });

type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  insights?: { data?: MetaInsightRow[] };
};

/** Lista campanhas com insights do período pedido. */
export const listMetaCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    preset: presetSchema.default("last_7d"),
    limit: z.number().int().min(1).max(200).default(50),
    accountIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    let q = context.supabase
      .from("meta_ad_accounts")
      .select("account_id,currency,name")
      .eq("workspace_id", data.workspaceId);
    if (data.accountIds && data.accountIds.length > 0) {
      q = q.in("account_id", data.accountIds);
    }
    const { data: accts } = await q;

    const accounts = (accts ?? []) as { account_id: string; currency: string | null; name: string | null }[];

    const rows: Array<{
      accountId: string; accountName: string | null; currency: string | null;
      id: string; name: string; status: string; effectiveStatus: string; objective: string | null;
      dailyBudget: number | null; thumbnailUrl: string | null;
      spend: number; impressions: number; clicks: number; ctr: number;
      leads: number; cpl: number; purchases: number; roas: number;
      results: number; resultLabel: string; costPerResult: number; costPerResultLabel: string;
    }> = [];

    const thumbByCampaign = new Map<string, string>();

    await Promise.all(accounts.map(async (a) => {
      const thumbsPromise = (async () => {
        try {
          const t = await metaGet<{ data: Array<{ campaign_id: string; creative?: { thumbnail_url?: string; image_url?: string } }> }>(
            `${a.account_id}/ads`, token,
            { fields: "campaign_id,creative{thumbnail_url,image_url}", limit: "200" },
          );
          for (const ad of t.data ?? []) {
            const url = ad.creative?.thumbnail_url || ad.creative?.image_url;
            if (url && !thumbByCampaign.has(ad.campaign_id)) thumbByCampaign.set(ad.campaign_id, url);
          }
        } catch { /* silencioso */ }
      })();

      try {
        const j = await metaGet<{ data: MetaCampaign[] }>(`${a.account_id}/campaigns`, token, {
          fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,${insightsField(data.preset, "spend,impressions,clicks,ctr,reach,actions,purchase_roas")}`,
          limit: String(data.limit),
        });
        await thumbsPromise;
        for (const c of j.data ?? []) {
          const ins = c.insights?.data?.[0];
          const spend = Number(ins?.spend) || 0;
          const imp = Number(ins?.impressions) || 0;
          const clk = Number(ins?.clicks) || 0;
          const lds = sumAction(ins?.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
          const purch = sumAction(ins?.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);
          const roas = Number(ins?.purchase_roas?.[0]?.value) || 0;
          const result = resultFromObjective(c.objective, ins?.actions, spend, {
            impressions: imp,
            reach: Number(ins?.reach) || 0,
            clicks: clk,
          });
          rows.push({
            accountId: a.account_id, accountName: a.name, currency: a.currency,
            id: c.id, name: c.name, status: c.status, effectiveStatus: c.effective_status,
            objective: c.objective ?? null,
            dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            thumbnailUrl: thumbByCampaign.get(c.id) ?? null,
            spend, impressions: imp, clicks: clk,
            ctr: Number(ins?.ctr) || 0,
            leads: lds, cpl: lds > 0 ? spend / lds : 0,
            purchases: purch, roas,
            results: result.count, resultLabel: result.label,
            costPerResult: result.cost, costPerResultLabel: result.costLabel,
          });
        }
      } catch (e) {
        console.warn(`[meta campaigns] ${a.account_id} falhou:`, e);
      }
    }));

    rows.sort((x, y) => y.spend - x.spend);
    return { campaigns: rows, preset: data.preset };
  });

/** Pausa ou reativa uma campanha. */
export const setMetaCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    campaignId: z.string().min(1),
    status: z.enum(["ACTIVE", "PAUSED"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${data.campaignId}`);
    const body = new URLSearchParams({ status: data.status, access_token: token });
    const r = await fetch(url.toString(), { method: "POST", body });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Meta status ${r.status}: ${txt.slice(0, 300)}`);
    }
    void context;
    return { ok: true };
  });

type MetaAdSet = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  campaign_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  insights?: { data?: MetaInsightRow[] };
};

type MetaAd = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  campaign_id: string;
  adset_id: string;
  insights?: { data?: MetaInsightRow[] };
};

/** Lista conjuntos de anúncios do workspace (opcionalmente filtrando por campanhas). */
export const listMetaAdSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    preset: presetSchema.default("last_7d"),
    limit: z.number().int().min(1).max(200).default(50),
    accountIds: z.array(z.string()).optional(),
    campaignIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    let q = context.supabase
      .from("meta_ad_accounts")
      .select("account_id,currency,name")
      .eq("workspace_id", data.workspaceId);
    if (data.accountIds && data.accountIds.length > 0) q = q.in("account_id", data.accountIds);
    const { data: accts } = await q;
    const accounts = (accts ?? []) as { account_id: string; currency: string | null; name: string | null }[];

    const rows: Array<{
      accountId: string; accountName: string | null; currency: string | null;
      id: string; name: string; status: string; effectiveStatus: string; campaignId: string;
      campaignObjective: string | null;
      dailyBudget: number | null; optimizationGoal: string | null; thumbnailUrl: string | null;
      spend: number; impressions: number; clicks: number; ctr: number;
      leads: number; cpl: number; roas: number; reach: number;
      results: number; resultLabel: string; costPerResult: number; costPerResultLabel: string;
    }> = [];

    const thumbByAdSet = new Map<string, string>();

    await Promise.all(accounts.map(async (a) => {
      const thumbsPromise = (async () => {
        try {
          const t = await metaGet<{ data: Array<{ adset_id: string; creative?: { thumbnail_url?: string; image_url?: string } }> }>(
            `${a.account_id}/ads`, token,
            { fields: "adset_id,creative{thumbnail_url,image_url}", limit: "200" },
          );
          for (const ad of t.data ?? []) {
            const url = ad.creative?.thumbnail_url || ad.creative?.image_url;
            if (url && !thumbByAdSet.has(ad.adset_id)) thumbByAdSet.set(ad.adset_id, url);
          }
        } catch { /* silencioso */ }
      })();

      try {
        const j = await metaGet<{ data: Array<MetaAdSet & { campaign?: { objective?: string } }> }>(`${a.account_id}/adsets`, token, {
          fields: `id,name,status,effective_status,campaign_id,campaign{objective},daily_budget,lifetime_budget,optimization_goal,${insightsField(data.preset, "spend,impressions,clicks,ctr,reach,actions,purchase_roas")}`,
          limit: String(data.limit),
        });
        await thumbsPromise;
        for (const s of j.data ?? []) {
          if (data.campaignIds && data.campaignIds.length > 0 && !data.campaignIds.includes(s.campaign_id)) continue;
          const ins = s.insights?.data?.[0];
          const spend = Number(ins?.spend) || 0;
          const imp = Number(ins?.impressions) || 0;
          const clk = Number(ins?.clicks) || 0;
          const rch = Number(ins?.reach) || 0;
          const lds = sumAction(ins?.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
          const roas = Number(ins?.purchase_roas?.[0]?.value) || 0;
          const campObjective = s.campaign?.objective ?? null;
          const result = resultFromObjective(campObjective, ins?.actions, spend, {
            optimizationGoal: s.optimization_goal ?? null,
            impressions: imp,
            reach: rch,
            clicks: clk,
          });
          rows.push({
            accountId: a.account_id, accountName: a.name, currency: a.currency,
            id: s.id, name: s.name, status: s.status, effectiveStatus: s.effective_status,
            campaignId: s.campaign_id,
            campaignObjective: campObjective,
            dailyBudget: s.daily_budget ? Number(s.daily_budget) / 100 : null,
            optimizationGoal: s.optimization_goal ?? null,
            thumbnailUrl: thumbByAdSet.get(s.id) ?? null,
            spend, impressions: imp, clicks: clk,
            ctr: Number(ins?.ctr) || 0,
            leads: lds, cpl: lds > 0 ? spend / lds : 0, roas,
            reach: rch,
            results: result.count, resultLabel: result.label,
            costPerResult: result.cost, costPerResultLabel: result.costLabel,
          });
        }
      } catch (e) {
        console.warn(`[meta adsets] ${a.account_id} falhou:`, e);
      }
    }));

    rows.sort((x, y) => y.spend - x.spend);
    return { adsets: rows, preset: data.preset };
  });

/** Lista anúncios do workspace, opcionalmente filtrado por campanhas/adsets. */
export const listMetaAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    preset: presetSchema.default("last_7d"),
    limit: z.number().int().min(1).max(200).default(50),
    accountIds: z.array(z.string()).optional(),
    campaignIds: z.array(z.string()).optional(),
    adsetIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    let q = context.supabase
      .from("meta_ad_accounts")
      .select("account_id,currency,name")
      .eq("workspace_id", data.workspaceId);
    if (data.accountIds && data.accountIds.length > 0) q = q.in("account_id", data.accountIds);
    const { data: accts } = await q;
    const accounts = (accts ?? []) as { account_id: string; currency: string | null; name: string | null }[];

    const rows: Array<{
      accountId: string; accountName: string | null; currency: string | null;
      id: string; name: string; status: string; effectiveStatus: string;
      campaignId: string; adsetId: string; thumbnailUrl: string | null;
      campaignObjective: string | null; optimizationGoal: string | null;
      spend: number; impressions: number; clicks: number; ctr: number;
      leads: number; cpl: number; roas: number; reach: number;
      results: number; resultLabel: string; costPerResult: number; costPerResultLabel: string;
    }> = [];

    await Promise.all(accounts.map(async (a) => {
      try {
        const j = await metaGet<{ data: Array<MetaAd & { creative?: { thumbnail_url?: string; image_url?: string }; campaign?: { objective?: string }; adset?: { optimization_goal?: string } }> }>(
          `${a.account_id}/ads`, token, {
          fields: `id,name,status,effective_status,campaign_id,adset_id,campaign{objective},adset{optimization_goal},creative{thumbnail_url,image_url},${insightsField(data.preset, "spend,impressions,clicks,ctr,reach,actions,purchase_roas")}`,
          limit: String(data.limit),
        });
        for (const ad of j.data ?? []) {
          if (data.campaignIds && data.campaignIds.length > 0 && !data.campaignIds.includes(ad.campaign_id)) continue;
          if (data.adsetIds && data.adsetIds.length > 0 && !data.adsetIds.includes(ad.adset_id)) continue;
          const ins = ad.insights?.data?.[0];
          const spend = Number(ins?.spend) || 0;
          const imp = Number(ins?.impressions) || 0;
          const clk = Number(ins?.clicks) || 0;
          const rch = Number(ins?.reach) || 0;
          const lds = sumAction(ins?.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
          const roas = Number(ins?.purchase_roas?.[0]?.value) || 0;
          const campObjective = ad.campaign?.objective ?? null;
          const optGoal = ad.adset?.optimization_goal ?? null;
          const result = resultFromObjective(campObjective, ins?.actions, spend, {
            optimizationGoal: optGoal, impressions: imp, reach: rch, clicks: clk,
          });
          rows.push({
            accountId: a.account_id, accountName: a.name, currency: a.currency,
            id: ad.id, name: ad.name, status: ad.status, effectiveStatus: ad.effective_status,
            campaignId: ad.campaign_id, adsetId: ad.adset_id,
            thumbnailUrl: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
            campaignObjective: campObjective, optimizationGoal: optGoal,
            spend, impressions: imp, clicks: clk,
            ctr: Number(ins?.ctr) || 0,
            leads: lds, cpl: lds > 0 ? spend / lds : 0, roas,
            reach: rch,
            results: result.count, resultLabel: result.label,
            costPerResult: result.cost, costPerResultLabel: result.costLabel,
          });
        }
      } catch (e) {
        console.warn(`[meta ads] ${a.account_id} falhou:`, e);
      }
    }));

    rows.sort((x, y) => y.spend - x.spend);
    return { ads: rows, preset: data.preset };
  });

/** Pausa/ativa um ad set ou anúncio individual. */
export const setMetaObjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    objectId: z.string().min(1),
    status: z.enum(["ACTIVE", "PAUSED"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${data.objectId}`);
    const body = new URLSearchParams({ status: data.status, access_token: token });
    const r = await fetch(url.toString(), { method: "POST", body });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Meta status ${r.status}: ${txt.slice(0, 300)}`);
    }
    void context;
    return { ok: true };
  });



// ============================================================
// Fase 3, Sugestões de IA para o Gestor de Tráfego
// ============================================================

export const getMetaAiSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    preset: presetSchema.default("last_7d"),
    accountIds: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);

    let q = context.supabase
      .from("meta_ad_accounts").select("account_id,currency,name").eq("workspace_id", data.workspaceId);
    if (data.accountIds && data.accountIds.length > 0) {
      q = q.in("account_id", data.accountIds);
    }
    const { data: accts } = await q;
    const accounts = (accts ?? []) as { account_id: string; currency: string | null; name: string | null }[];
    if (accounts.length === 0) return { suggestions: [], summary: "Nenhuma conta de anúncios selecionada." };

    // Pega campanhas com insights (reaproveita lógica compacta)
    type Row = {
      id: string; name: string; adAccountId: string; status: string; effective: string;
      spend: number; clicks: number; imp: number; ctr: number; leads: number; cpl: number; roas: number;
      objective: string | null;
      results: number; resultLabel: string; costPerResult: number; costPerResultLabel: string;
    };
    const rows: Row[] = [];
    await Promise.all(accounts.map(async (a) => {
      try {
        const j = await metaGet<{ data: MetaCampaign[] }>(`${a.account_id}/campaigns`, token, {
          fields: `id,name,status,effective_status,objective,${insightsField(data.preset, "spend,impressions,clicks,ctr,reach,actions,purchase_roas")}`,
          limit: "80",
        });
        for (const c of j.data ?? []) {
          const ins = c.insights?.data?.[0];
          const spend = Number(ins?.spend) || 0;
          if (spend <= 0 && c.effective_status !== "ACTIVE") continue;
          const imp = Number(ins?.impressions) || 0;
          const clk = Number(ins?.clicks) || 0;
          const rch = Number(ins?.reach) || 0;
          const lds = sumAction(ins?.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
          const result = resultFromObjective(c.objective, ins?.actions, spend, {
            impressions: imp, reach: rch, clicks: clk,
          });
          rows.push({
            id: c.id, name: c.name, adAccountId: a.account_id,
            status: c.status, effective: c.effective_status,
            objective: c.objective ?? null,
            spend, clicks: clk, imp, ctr: Number(ins?.ctr) || 0,
            leads: lds, cpl: lds > 0 ? spend / lds : 0,
            roas: Number(ins?.purchase_roas?.[0]?.value) || 0,
            results: result.count, resultLabel: result.label,
            costPerResult: result.cost, costPerResultLabel: result.costLabel,
          });
        }
      } catch (e) { console.warn(`[ai suggestions] ${a.account_id} falhou:`, e); }
    }));

    if (rows.length === 0) return { suggestions: [], summary: "Sem campanhas com dados no período." };

    // Resolve chave de IA do workspace (isolamento multi-tenant obrigatório)
    const { resolveWorkspaceAiKey } = await import("@/lib/workspace-ai-key.server");
    const aiKey = await resolveWorkspaceAiKey(context.supabase as any, data.workspaceId);

    const currency = accounts.find((x) => x.currency)?.currency ?? "BRL";
    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

    const compact = rows
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        campanha: r.name,
        status: r.effective,
        objetivo: r.objective,
        resultado_tipo: r.resultLabel,
        resultado_qtd: r.results,
        custo_por_resultado: Number(r.costPerResult.toFixed(2)),
        invest: Number(r.spend.toFixed(2)),
        ctr_pct: Number(r.ctr.toFixed(2)),
        roas: Number(r.roas.toFixed(2)),
      }));

    const systemPrompt = `Você é um gestor de tráfego sênior especialista em Meta Ads.
Analise os dados abaixo (moeda ${currency}) e devolva sugestões acionáveis em PT-BR.

REGRA CRÍTICA, LEIA O OBJETIVO DA CAMPANHA:
Cada campanha tem um objetivo declarado ("objetivo"). O resultado esperado MUDA conforme o objetivo:
- MESSAGES / ENGAGEMENT com mensagem → resultado é "Conversas iniciadas". NUNCA critique por "0 leads".
- OUTCOME_LEADS / LEAD_GENERATION → resultado é "Leads" (formulário / instant form).
- OUTCOME_SALES / CONVERSIONS → resultado é "Compras".
- OUTCOME_TRAFFIC → resultado é "Cliques no link / visitas".
- OUTCOME_ENGAGEMENT (post) → resultado é "Engajamentos".
- OUTCOME_AWARENESS / REACH → resultado é "Alcance / impressões".
Cada linha já traz "resultado_tipo" e "resultado_qtd" pré-calculados corretamente. USE ESSES CAMPOS para julgar performance; NÃO julgue mensagens por leads nem tráfego por conversões.

Cada sugestão deve ter:
- action: "pause" | "increase_budget" | "decrease_budget" | "duplicate" | "review_creative" | "review_audience" | "other"
- campaign_id: id EXATO da campanha da lista (ou "" para geral)
- campaign: nome EXATO da campanha (ou "geral")
- reason: motivo curto (1 frase) citando o resultado_tipo correto
- details: 2-4 frases citando NÚMEROS CONCRETOS do resultado_tipo dessa campanha específica (ex: "29 conversas iniciadas a R$ 2,55 cada"), CTR, ROAS, investimento, e o que fazer na prática
- priority: "alta" | "media" | "baixa"
Retorne APENAS JSON válido:
{"summary":"...", "suggestions":[{"action":"...","campaign_id":"...","campaign":"...","reason":"...","details":"...","priority":"..."}]}
Máximo 6 sugestões.`;

    const userPrompt = `Período: ${data.preset}
Total investido: ${totalSpend.toFixed(2)} ${currency}

Campanhas (cada uma com seu resultado_tipo correto conforme o objetivo):
${JSON.stringify(compact, null, 2)}`;

    const r = await fetch(`${aiKey.baseUrl}/chat/completions`, {
      method: "POST",
      headers: aiKey.provider === "lovable"
        ? { "Content-Type": "application/json", "Lovable-API-Key": aiKey.apiKey }
        : { "Content-Type": "application/json", Authorization: `Bearer ${aiKey.apiKey}` },
      body: JSON.stringify({
        model: aiKey.defaultModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      if (r.status === 429) throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (r.status === 402) throw new Error("Créditos de IA esgotados. Recarregue em Planos & Créditos.");
      throw new Error(`Falha na IA (${r.status}): ${txt.slice(0, 200)}`);
    }
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: { summary?: string; suggestions?: Array<{ action: string; campaign_id?: string; campaign: string; reason: string; details?: string; priority: string }> } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const byName = new Map(rows.map((r) => [r.name, r]));
    const suggestions = (parsed.suggestions ?? []).map((s) => {
      const match = (s.campaign_id && byId.get(s.campaign_id)) || byName.get(s.campaign) || null;
      return {
        action: s.action,
        campaign: s.campaign,
        campaignId: match?.id ?? s.campaign_id ?? "",
        adAccountId: match?.adAccountId ?? "",
        reason: s.reason,
        details: s.details ?? "",
        priority: s.priority,
        metrics: match ? {
          spend: Number(match.spend.toFixed(2)),
          leads: match.leads,
          cpl: Number(match.cpl.toFixed(2)),
          ctr: Number(match.ctr.toFixed(2)),
          roas: Number(match.roas.toFixed(2)),
          status: match.effective,
          objective: match.objective,
          results: match.results,
          resultLabel: match.resultLabel,
          costPerResult: Number(match.costPerResult.toFixed(2)),
          costPerResultLabel: match.costPerResultLabel,
        } : null,
      };
    });

    return {
      summary: parsed.summary ?? "",
      suggestions,
      totalSpend, totalLeads, avgCpl, currency,
    };
  });


/* ============================================================
 * Conversions API (CAPI), envio server-side de eventos do CRM
 * ==========================================================*/

function sha256Hex(v: string): string {
  // Import dinÃ¢mico: reduz footprint em rotas que não usam CAPI.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
}

function normalizePhone(p: string): string {
  return p.replace(/\D+/g, "");
}

async function loadActiveWs(sb: unknown, userId: string): Promise<string> {
  const supa = sb as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { current_workspace_id?: string } | null }> } } } };
  const { data } = await supa.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const wsId = data?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

/**
 * Envia um evento para a Meta Conversions API a partir de um lead.
 * Faz hash SHA-256 de email/telefone/external_id e usa fbc/fbp capturados
 * pelo Pixel do site (colunas leads.fb_*) pra dedupe com o Pixel do browser.
 */
export const sendMetaConversionsEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      leadId: z.string().uuid(),
      pixelId: z.string().min(1),
      eventName: z.string().min(1),           // "Lead" | "Purchase" | "LeadLost" | ...
      value: z.number().optional(),
      currency: z.string().optional(),
      testEventCode: z.string().optional(),
      actionSource: z.enum(["system_generated", "website", "chat", "phone_call", "email"]).default("system_generated"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown;
    const wsId = await loadActiveWs(sb, context.userId);
    // Prefere System User Token (não expira) se configurado; senão cai no OAuth do usuário.
    const supaRpc = sb as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> };
    const encK = requireEnv("INTEGRATION_ENCRYPTION_KEY");
    const { data: capiSec } = await supaRpc.rpc("get_integration_secret", {
      _workspace_id: wsId, _provider: "meta_capi", _key: encK,
    });
    const capiToken = (capiSec as { access_token?: string } | null)?.access_token ?? null;
    const token = capiToken ?? (await loadMetaToken(sb, wsId));

    const supa = sb as { from: (t: string) => any };
    const { data: leadRow, error: lErr } = await supa.from("leads")
      .select("id, workspace_id, email, phone, name, value, fb_fbc, fb_fbp, fb_external_id, fb_event_id, fb_client_ip, fb_client_ua")
      .eq("id", data.leadId).eq("workspace_id", wsId).maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!leadRow) throw new Error("Lead não encontrado.");
    const lead = leadRow as {
      email: string | null; phone: string | null; name: string | null; value: number | null;
      fb_fbc: string | null; fb_fbp: string | null; fb_external_id: string | null;
      fb_event_id: string | null; fb_client_ip: string | null; fb_client_ua: string | null;
    };

    const user_data: Record<string, unknown> = {};
    if (lead.email) user_data.em = [sha256Hex(lead.email)];
    if (lead.phone) user_data.ph = [sha256Hex(normalizePhone(lead.phone))];
    if (lead.name) {
      const parts = lead.name.trim().split(/\s+/);
      user_data.fn = [sha256Hex(parts[0])];
      if (parts.length > 1) user_data.ln = [sha256Hex(parts[parts.length - 1])];
    }
    const externalId = lead.fb_external_id ?? data.leadId;
    user_data.external_id = [sha256Hex(externalId)];
    if (lead.fb_fbc) user_data.fbc = lead.fb_fbc;
    if (lead.fb_fbp) user_data.fbp = lead.fb_fbp;
    if (lead.fb_client_ip) user_data.client_ip_address = lead.fb_client_ip;
    if (lead.fb_client_ua) user_data.client_user_agent = lead.fb_client_ua;

    // Dedupe: reaproveita event_id do click (se veio do Pixel do site), senão
    // deriva um determinístico por (lead, evento) para não duplicar em reenvio.
    const event_id = lead.fb_event_id
      ? `${lead.fb_event_id}:${data.eventName}`
      : `${data.leadId}:${data.eventName}`;

    const custom_data: Record<string, unknown> = {};
    const v = data.value ?? Number(lead.value ?? 0);
    if (v > 0) {
      if (!data.currency) throw new Error("Moeda não informada, configure a moeda padrão do workspace.");
      custom_data.value = v;
      custom_data.currency = data.currency;
    }

    const eventPayload = {
      event_name: data.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      action_source: data.actionSource,
      user_data,
      custom_data,
    };

    const body: Record<string, unknown> = { data: [eventPayload], access_token: token };
    if (data.testEventCode) body.test_event_code = data.testEventCode;

    const url = `https://graph.facebook.com/${GRAPH}/${data.pixelId}/events`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseText = await r.text();
    const ok = r.ok;

    // Auditoria em lead_activities
    await supa.from("lead_activities").insert({
      workspace_id: wsId,
      lead_id: data.leadId,
      type: "meta_capi_sent",
      payload: {
        pixel_id: data.pixelId,
        event_name: data.eventName,
        event_id,
        status: r.status,
        ok,
        response: responseText.slice(0, 500),
        test: !!data.testEventCode,
      },
      occurred_at: new Date().toISOString(),
    });

    if (!ok) throw new Error(`Meta CAPI ${r.status}: ${responseText.slice(0, 300)}`);
    return { ok: true, event_id, status: r.status };
  });

/**
 * Salva o System User Token da Meta (Business Manager → System Users → Token).
 * Esse token não expira e é o recomendado pra produção da Conversions API.
 * Valida chamando /me?fields=id antes de gravar.
 */
export const saveMetaCapiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      accessToken: z.string().min(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = data.accessToken.trim().replace(/^Bearer\s+/i, "");
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Meta rejeitou o token (${r.status}): ${txt.slice(0, 200)}`);
    }
    const me = await r.json() as { id?: string; name?: string };
    const encK = requireEnv("INTEGRATION_ENCRYPTION_KEY");
    const supa = context.supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> };
    const { error } = await supa.rpc("set_integration_secret", {
      _workspace_id: data.workspaceId,
      _provider: "meta_capi",
      _plaintext: { access_token: token },
      _key: encK,
      _metadata: { system_user_id: me.id ?? null, system_user_name: me.name ?? null },
      _status: "connected",
    });
    if (error) throw new Error(error.message ?? "rpc error");
    return { ok: true, systemUser: me };
  });

/** Remove o System User Token, o CAPI volta a usar o token OAuth do usuário. */
export const deleteMetaCapiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await supa.from("integration_secrets")
      .delete().eq("workspace_id", data.workspaceId).eq("provider", "meta_capi");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Retorna status do token CAPI (masked). */
export const getMetaCapiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as { from: (t: string) => any };
    const { data: row } = await supa.from("integration_secrets")
      .select("status, metadata, updated_at")
      .eq("workspace_id", data.workspaceId).eq("provider", "meta_capi").maybeSingle();
    return { configured: !!row, ...(row ?? {}) };
  });

// ============================================================
// Séries temporais (gráficos por item)
// ------------------------------------------------------------
// Retorna insights DIÁRIOS de um objeto (campanha/adset/anúncio) no período.
// Usado pelo diálogo "Ver Gráficos" do Ads Manager.
// ============================================================

type MetaSeriesRow = {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  reach?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaAction[];
};

export const getMetaObjectTimeSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    objectIds: z.array(z.string().min(1)).min(1).max(30),
    level: z.enum(["campaigns", "adsets", "ads"]),
    preset: presetSchema.default("last_14d"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const level = data.level === "campaigns" ? "campaign" : data.level === "adsets" ? "adset" : "ad";

    const fetchOne = async (objectId: string) => {
      try {
        const j = await metaGet<{ data: MetaSeriesRow[] }>(`${objectId}/insights`, token, {
          ...dateParams(data.preset),
          fields: "spend,impressions,clicks,ctr,reach,cpc,cpm,actions,action_values,purchase_roas",
          level,
          time_increment: "1",
        });
        const points = (j.data ?? []).map((r) => {
          const leads = sumAction(r.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
          const purchases = sumAction(r.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);
          const revenue = sumAction(r.action_values, ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);
          const roasArr = r.purchase_roas ?? [];
          const roas = roasArr.length ? Number(roasArr[0]?.value) || 0 : 0;
          return {
            date: r.date_start,
            spend: Number(r.spend) || 0,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
            ctr: Number(r.ctr) || 0,
            reach: Number(r.reach) || 0,
            cpc: Number(r.cpc) || 0,
            cpm: Number(r.cpm) || 0,
            leads,
            purchases,
            revenue,
            roas,
          };
        });
        return { objectId, points };
      } catch (e) {
        return { objectId, points: [], error: e instanceof Error ? e.message : String(e) };
      }
    };

    // Busca em lotes de 5 para nao estourar rate limit da Meta com muitos itens
    const series: Array<{ objectId: string; points: Array<Record<string, number | string>>; error?: string }> = [];
    for (let i = 0; i < data.objectIds.length; i += 5) {
      const chunk = data.objectIds.slice(i, i + 5);
      const res = await Promise.all(chunk.map(fetchOne));
      series.push(...res);
    }

    return { level: data.level, preset: data.preset, series };
  });

