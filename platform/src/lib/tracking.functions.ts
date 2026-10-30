// Tracking, CRUD de sites/domínios instrumentados pelo pixel MKTOn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });

async function assertMember(supabase: unknown, workspaceId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data, error } = await s
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a este workspace");
}

export const listTrackingSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const { data: rows, error } = await supabase
      .from("tracking_sites")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    type SiteRow = {
      id: string;
      workspace_id: string;
      name: string;
      domain: string;
      pixel_token: string;
      verified: boolean;
      last_event_at: string | null;
      events_24h: number;
      events_7d?: number;
      created_at: string;
    };
    const sites = (rows ?? []) as unknown as SiteRow[];
    if (sites.length === 0) return sites as SiteRow[];


    // Contagem real de eventos por site (24h e 7d) direto da tabela de eventos.
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const counts = await Promise.all(
      sites.map(async (s) => {
        const siteId = String(s.id);
        const [c24, c7d, last] = await Promise.all([
          supabase
            .from("tracking_events")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", data.workspaceId)
            .eq("site_id", siteId)
            .gte("created_at", since24),
          supabase
            .from("tracking_events")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", data.workspaceId)
            .eq("site_id", siteId)
            .gte("created_at", since7d),
          supabase
            .from("tracking_events")
            .select("created_at")
            .eq("workspace_id", data.workspaceId)
            .eq("site_id", siteId)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
        return {
          events_24h: c24.count ?? 0,
          events_7d: c7d.count ?? 0,
          last_event_at:
            (last.data?.[0] as { created_at?: string } | undefined)?.created_at ??
            (s.last_event_at as string | null) ??
            null,
        };
      }),
    );

    return sites.map((s, i) => ({ ...s, ...counts[i] }));
  });

/**
 * Todas as fontes de tracking do workspace (não só sites):
 * pixel MKTOn, contas de anúncio Meta, páginas/Instagram, Google, WhatsApp
 * e demais integrações conectadas — com KPIs reais medidos nos eventos.
 */
export const listTrackingSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = data.workspaceId;
    await assertMember(supabase, ws, userId);

    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const countEvents = async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apply: (q: any) => any,
      since: string,
    ): Promise<number> => {
      const q = sb
        .from("tracking_events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .gte("created_at", since);
      const res = (await apply(q)) as { count: number | null };
      return res.count ?? 0;
    };


    const [
      adAccounts,
      pages,
      igAccounts,
      integrations,
      waSessions,
      leads7d,
    ] = await Promise.all([
      sb.from("meta_ad_accounts").select("id, account_id, name, currency, synced_at").eq("workspace_id", ws),
      sb.from("meta_pages").select("id, page_id, name").eq("workspace_id", ws),
      sb.from("meta_instagram_accounts").select("id, ig_id, username").eq("workspace_id", ws),
      sb.from("integrations").select("provider, status, last_check_at, last_error").eq("workspace_id", ws),
      sb
        .from("whatsapp_web_sessions")
        .select("id, provider, phone_number, status")
        .eq("workspace_id", ws),
      sb
        .from("leads")
        .select("source")
        .eq("workspace_id", ws)
        .gte("created_at", since7d)
        .limit(5000),
    ]);

    const leadSources = ((leads7d.data ?? []) as Array<{ source: string | null }>).map((l) =>
      String(l.source ?? "").toLowerCase(),
    );
    const leadsMatching = (terms: string[]) =>
      leadSources.filter((s) => terms.some((t) => s.includes(t))).length;

    type Source = {
      id: string;
      kind: "site" | "meta_ads" | "meta_page" | "instagram" | "google" | "whatsapp" | "integracao";
      name: string;
      detail: string;
      status: "ok" | "pending" | "error";
      metrics: Array<{ label: string; value: string }>;
    };

    const sources: Source[] = [];

    // ---- Meta Ads (fbclid + utm_source facebook/instagram/meta)
    const metaFilter = (q: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).or(
        "fbclid.not.is.null,utm_source.ilike.%facebook%,utm_source.ilike.%instagram%,utm_source.ilike.%meta%",
      );
    const metaIntegration = ((integrations.data ?? []) as Array<{ provider: string; status: string; last_check_at: string | null }>).find(
      (i) => i.provider === "meta",
    );
    const [metaClicks24, metaClicks7] = await Promise.all([
      countEvents(metaFilter, since24),
      countEvents(metaFilter, since7d),
    ]);
    for (const acc of (adAccounts.data ?? []) as Array<{ id: string; account_id: string; name: string | null; currency: string | null; synced_at: string | null }>) {
      sources.push({
        id: `meta-${acc.id}`,
        kind: "meta_ads",
        name: acc.name || `Conta ${acc.account_id}`,
        detail: `Meta Ads · ${acc.account_id}${acc.currency ? ` · ${acc.currency}` : ""}`,
        status: metaIntegration?.status === "connected" ? "ok" : metaIntegration ? "error" : "pending",
        metrics: [
          { label: "Cliques pagos 24h", value: metaClicks24.toLocaleString("pt-BR") },
          { label: "Cliques pagos 7d", value: metaClicks7.toLocaleString("pt-BR") },
          { label: "Leads 7d (Meta)", value: leadsMatching(["meta", "facebook", "instagram", "fb"]).toLocaleString("pt-BR") },
          { label: "Última sync", value: acc.synced_at ? new Date(acc.synced_at).toLocaleString("pt-BR") : "-" },
        ],
      });
    }

    for (const p of (pages.data ?? []) as Array<{ id: string; page_id: string; name: string | null }>) {
      sources.push({
        id: `page-${p.id}`,
        kind: "meta_page",
        name: p.name || `Página ${p.page_id}`,
        detail: `Facebook Page · ${p.page_id}`,
        status: "ok",
        metrics: [
          { label: "Leads 7d", value: leadsMatching(["facebook", "messenger"]).toLocaleString("pt-BR") },
        ],
      });
    }

    for (const ig of (igAccounts.data ?? []) as Array<{ id: string; ig_id: string; username: string | null }>) {
      sources.push({
        id: `ig-${ig.id}`,
        kind: "instagram",
        name: ig.username ? `@${ig.username}` : `Instagram ${ig.ig_id}`,
        detail: `Instagram Direct · ${ig.ig_id}`,
        status: "ok",
        metrics: [
          { label: "Leads 7d", value: leadsMatching(["instagram", "ig"]).toLocaleString("pt-BR") },
        ],
      });
    }

    // ---- Google (gclid)
    const googleIntegration = ((integrations.data ?? []) as Array<{ provider: string; status: string }>).find((i) =>
      i.provider.startsWith("google"),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleFilter = (q: unknown) => (q as any).or("gclid.not.is.null,utm_source.ilike.%google%");
    const [g24, g7] = await Promise.all([countEvents(googleFilter, since24), countEvents(googleFilter, since7d)]);
    if (googleIntegration || g7 > 0) {
      sources.push({
        id: "google",
        kind: "google",
        name: "Google / Google Ads",
        detail: googleIntegration ? "Integração conectada" : "Detectado pelos parâmetros gclid/utm",
        status: googleIntegration?.status === "connected" ? "ok" : "pending",
        metrics: [
          { label: "Cliques 24h", value: g24.toLocaleString("pt-BR") },
          { label: "Cliques 7d", value: g7.toLocaleString("pt-BR") },
          { label: "Leads 7d", value: leadsMatching(["google", "gads", "adwords"]).toLocaleString("pt-BR") },
        ],
      });
    }

    // ---- WhatsApp
    for (const s of (waSessions.data ?? []) as Array<{ id: string; provider: string; phone_number: string | null; status: string }>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const waFilter = (q: unknown) => (q as any).in("event_name", ["whatsapp_click", "whatsapp_lead"]);
      const [w24, w7] = await Promise.all([countEvents(waFilter, since24), countEvents(waFilter, since7d)]);
      sources.push({
        id: `wa-${s.id}`,
        kind: "whatsapp",
        name: s.phone_number ? `WhatsApp ${s.phone_number}` : "WhatsApp",
        detail: `${s.provider} · ${s.status}`,
        status: s.status === "conectado" ? "ok" : "pending",
        metrics: [
          { label: "Cliques WhatsApp 24h", value: w24.toLocaleString("pt-BR") },
          { label: "Cliques WhatsApp 7d", value: w7.toLocaleString("pt-BR") },
          { label: "Leads 7d", value: leadsMatching(["whatsapp", "wa"]).toLocaleString("pt-BR") },
        ],
      });
    }

    // ---- Demais integrações conectadas (TikTok, Shopify, e-mail, etc)
    const IGNORE = new Set(["meta", "openai", "gemini"]);
    for (const i of (integrations.data ?? []) as Array<{ provider: string; status: string; last_check_at: string | null; last_error: string | null }>) {
      if (IGNORE.has(i.provider) || i.provider.startsWith("meta_page_") || i.provider.startsWith("google")) continue;
      sources.push({
        id: `int-${i.provider}`,
        kind: "integracao",
        name: i.provider.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        detail: i.last_error ? i.last_error.slice(0, 80) : "Integração conectada ao workspace",
        status: i.status === "connected" ? "ok" : "pending",
        metrics: [
          { label: "Leads 7d", value: leadsMatching([i.provider.toLowerCase()]).toLocaleString("pt-BR") },
          { label: "Última checagem", value: i.last_check_at ? new Date(i.last_check_at).toLocaleString("pt-BR") : "-" },
        ],
      });
    }

    return sources;
  });




const CreateSiteSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  domain: z.string().min(3).max(200),
});

function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return d;
}

export const createTrackingSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSiteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const domain = normalizeDomain(data.domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new Error("Domínio inválido. Use por exemplo: seu-site.com.br");
    }
    const { data: row, error } = await supabase
      .from("tracking_sites")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        domain,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const DeleteSiteSchema = z.object({
  workspaceId: z.string().uuid(),
  siteId: z.string().uuid(),
});

export const deleteTrackingSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteSiteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const { error } = await supabase
      .from("tracking_sites")
      .delete()
      .eq("id", data.siteId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
