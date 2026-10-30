import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrackedLinkSite = { id: string; name: string; domain: string; verified: boolean };

export type TrackedLink = {
  id: string;
  slug: string;
  targetUrl: string;
  siteId: string | null;
  agentName: string | null;
  contextLabel: string | null;
  linkLabel: string | null;
  clicks: number;
  lastClickAt: string | null;
};

/** Sites com pixel MKTOn instalado no workspace — base pra decidir se o link é rastreável. */
export const listTrackedLinkSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TrackedLinkSite[]> => {
    const { data: rows, error } = await context.supabase
      .from("tracking_sites")
      .select("id, name, domain, verified")
      .eq("workspace_id", data.workspaceId)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? "",
      domain: (r.domain as string) ?? "",
      verified: Boolean(r.verified),
    }));
  });

function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Cria (ou atualiza) o link curto rastreado do agente: /r/<slug>. */
export const createTrackedLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        targetUrl: z.string().url(),
        slug: z.string().min(2).max(60).optional(),
        agentId: z.string().uuid().nullable().optional(),
        agentName: z.string().max(120).optional(),
        contextLabel: z.string().max(160).optional(),
        linkLabel: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<TrackedLink> => {
    const host = (() => {
      try {
        return new URL(data.targetUrl).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return "";
      }
    })();

    const { data: sites, error: sitesErr } = await context.supabase
      .from("tracking_sites")
      .select("id, domain")
      .eq("workspace_id", data.workspaceId);
    if (sitesErr) throw new Error(sitesErr.message);

    const site = (sites ?? []).find((s) => {
      const d = String(s.domain ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
      return d && (host === d || host.endsWith(`.${d}`));
    });
    if (!site) {
      throw new Error(
        "Esse domínio ainda não está no Tracking. Cadastre o site em Tracking → Fontes para poder gerar link rastreado.",
      );
    }

    const base =
      slugify(data.slug ?? `${data.agentName ?? "agente"}-${data.linkLabel ?? data.contextLabel ?? "link"}`) ||
      "agente-link";

    let slug = base;
    for (let i = 0; i < 6; i++) {
      const { data: exists } = await context.supabase
        .from("tracked_links")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!exists) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
    }

    const { data: row, error } = await context.supabase
      .from("tracked_links")
      .insert({
        workspace_id: data.workspaceId,
        slug,
        target_url: data.targetUrl,
        site_id: site.id as string,
        agent_id: data.agentId ?? null,
        agent_name: data.agentName ?? null,
        context_label: data.contextLabel ?? null,
        link_label: data.linkLabel ?? null,
        utm_source: "agente-ia",
        utm_medium: "chat",
        utm_campaign: slugify(data.agentName ?? "agente-ia") || "agente-ia",
        utm_content: slugify(data.contextLabel ?? data.linkLabel ?? "") || null,
        created_by: context.userId,
      })
      .select("id, slug, target_url, site_id, agent_name, context_label, link_label, clicks, last_click_at")
      .single();
    if (error) throw new Error(error.message);

    return {
      id: row.id as string,
      slug: row.slug as string,
      targetUrl: row.target_url as string,
      siteId: (row.site_id as string) ?? null,
      agentName: (row.agent_name as string) ?? null,
      contextLabel: (row.context_label as string) ?? null,
      linkLabel: (row.link_label as string) ?? null,
      clicks: Number(row.clicks ?? 0),
      lastClickAt: (row.last_click_at as string) ?? null,
    };
  });

/** Links rastreados do workspace (opcionalmente de um agente) com cliques reais. */
export const listTrackedLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid(), agentId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<TrackedLink[]> => {
    let q = context.supabase
      .from("tracked_links")
      .select("id, slug, target_url, site_id, agent_name, context_label, link_label, clicks, last_click_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      targetUrl: r.target_url as string,
      siteId: (r.site_id as string) ?? null,
      agentName: (r.agent_name as string) ?? null,
      contextLabel: (r.context_label as string) ?? null,
      linkLabel: (r.link_label as string) ?? null,
      clicks: Number(r.clicks ?? 0),
      lastClickAt: (r.last_click_at as string) ?? null,
    }));
  });
