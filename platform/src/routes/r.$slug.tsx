import { createFileRoute } from "@tanstack/react-router";

/**
 * Link curto rastreado do agente IA: /r/<slug>
 * Registra o clique como evento real no Tracking (event_name = "link_click")
 * e redireciona pro destino com as UTMs do agente/etapa.
 */
export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slug = String(params.slug ?? "").slice(0, 80);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link } = await supabaseAdmin
          .from("tracked_links")
          .select(
            "id, workspace_id, site_id, target_url, agent_name, context_label, link_label, clicks, utm_source, utm_medium, utm_campaign, utm_content",
          )
          .eq("slug", slug)
          .maybeSingle();

        if (!link) {
          return new Response("Link não encontrado", { status: 404 });
        }

        const incoming = new URL(request.url);
        const leadId = incoming.searchParams.get("lead") ?? null;
        const attributionToken = crypto.randomUUID();

        let target: URL;
        try {
          target = new URL(link.target_url as string);
        } catch {
          return new Response("Destino inválido", { status: 500 });
        }
        const setIfEmpty = (k: string, v: string | null) => {
          if (v && !target.searchParams.get(k)) target.searchParams.set(k, v);
        };
        setIfEmpty("utm_source", (link.utm_source as string) ?? "agente-ia");
        setIfEmpty("utm_medium", (link.utm_medium as string) ?? "chat");
        setIfEmpty("utm_campaign", (link.utm_campaign as string) ?? null);
        setIfEmpty("utm_content", (link.utm_content as string) ?? null);
        setIfEmpty("mkt_link", slug);
        setIfEmpty("mkt_attr", attributionToken);
        // Preserva a atribuição até o signup. O endpoint pós-cadastro valida
        // token do clique + workspace + e-mail antes de aceitar este id.
        setIfEmpty("mkt_lead", leadId);

        try {
          const { data: evRow } = await supabaseAdmin
            .from("tracking_events")
            .insert({
              workspace_id: link.workspace_id,
              site_id: link.site_id,
              event_name: "link_click",
              page_url: target.toString(),
              page_path: target.pathname,
              referrer: request.headers.get("referer"),
              utm_source: link.utm_source,
              utm_medium: link.utm_medium,
              utm_campaign: link.utm_campaign,
              utm_content: link.utm_content,
              lead_id: leadId,
              source_class: "cliente",
              user_agent: request.headers.get("user-agent"),
              props: {
                tracked_link_slug: slug,
                attribution_token: attributionToken,
                agent_name: link.agent_name,
                context_label: link.context_label,
                link_label: link.link_label,
              },
            } as never)
            .select("id")
            .single();

          // Contagem atômica (evita perder cliques simultâneos).
          await supabaseAdmin.rpc("tracked_link_register_click", { _link_id: link.id as string } as never);

          const { dispatchTracking } = await import("@/lib/tracking-dispatcher.server");
          await dispatchTracking(supabaseAdmin as never, {
            workspaceId: link.workspace_id as string,
            eventRowId: Number((evRow as { id: number } | null)?.id ?? 0) || null,
            eventName: "link_click",
            leadId,
            siteId: (link.site_id as string) ?? null,
            value: null,
            currency: null,
            pageUrl: target.toString(),
            pagePath: target.pathname,
            anonId: null,
            sessionId: null,
            utm: {
              utm_source: (link.utm_source as string) ?? null,
              utm_medium: (link.utm_medium as string) ?? null,
              utm_campaign: (link.utm_campaign as string) ?? null,
              utm_term: null,
              utm_content: (link.utm_content as string) ?? null,
            },
            isFirstVisit: false,
            isHotVisit: false,
            eventId: null,
          });
        } catch {
          // Nunca bloqueia o redirect por falha de registro.
        }

        return new Response(null, {
          status: 302,
          headers: { Location: target.toString(), "Cache-Control": "no-store" },
        });
      },
    },
  },
});