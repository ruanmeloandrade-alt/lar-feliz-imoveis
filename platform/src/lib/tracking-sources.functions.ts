// Status real de cada fonte de tracking (verde, amarelo, vermelho).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SourceStatus = "ok" | "partial" | "off";

export type TrackingSourceStatuses = Record<string, { status: SourceStatus; detail: string }>;

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

export const getTrackingSourceStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TrackingSourceStatuses> => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const ws = data.workspaceId;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [sites, metaInt, metaPages, metaPixels, waSessions, waCalls, shopEvents, googleEvents, emailEvents, emailOpens, leads] =
      await Promise.all([
        sb.from("tracking_sites").select("id,verified,last_event_at").eq("workspace_id", ws),
        sb.from("integrations").select("provider,status,last_error").eq("workspace_id", ws).eq("provider", "meta").maybeSingle(),
        sb.from("meta_pages").select("page_id").eq("workspace_id", ws),
        sb.from("meta_pixels").select("id").eq("workspace_id", ws),
        sb.from("whatsapp_web_sessions").select("id,status").eq("workspace_id", ws),
        sb.from("whatsapp_call_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
        sb.from("tracking_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws)
          .in("event_name", ["purchase", "add_to_cart", "begin_checkout"]),
        sb.from("tracking_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws)
          .not("gclid", "is", null).gte("created_at", since),
        sb.from("tracking_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws)
          .eq("utm_medium", "email").gte("created_at", since),
        sb.from("tracking_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws)
          .eq("event_name", "email_open").gte("created_at", since),
        sb.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
      ]);

    const siteRows = (sites?.data ?? []) as Array<{ verified: boolean | null; last_event_at: string | null }>;
    const siteOk = siteRows.some((s) => s.verified && s.last_event_at);
    const out: TrackingSourceStatuses = {};

    out.site = siteOk
      ? { status: "ok", detail: "Pixel instalado e recebendo eventos." }
      : siteRows.length > 0
        ? { status: "partial", detail: "Site cadastrado, mas nenhum evento chegou ainda." }
        : { status: "off", detail: "Nenhum site cadastrado." };

    out.ecommerce = (shopEvents?.count ?? 0) > 0
      ? { status: "ok", detail: "Eventos de loja chegando." }
      : siteOk
        ? { status: "partial", detail: "Pixel ativo, mas sem eventos de carrinho ou compra." }
        : { status: "off", detail: "Script de e-commerce não instalado." };

    const metaStatus = String((metaInt?.data as { status?: string } | null)?.status ?? "");
    const metaConnected = metaStatus === "connected" || metaStatus === "conectado" || metaStatus === "active";
    const hasAssets = ((metaPages?.data ?? []).length > 0) || ((metaPixels?.data ?? []).length > 0);
    out.meta = metaConnected && hasAssets
      ? { status: "ok", detail: "Conta Meta conectada com página e pixel selecionados." }
      : metaConnected || metaStatus
        ? { status: "partial", detail: metaConnected ? "Conectado, mas falta escolher página ou pixel." : "Conexão iniciada e ainda não concluída, reconecte em Integrações." }
        : { status: "off", detail: "Meta ainda não conectado em Integrações." };

    const waRows = (waSessions?.data ?? []) as Array<{ status: string | null }>;
    const waConnected = waRows.some((s) => ["connected","conectado","open"].includes((s.status ?? "").toLowerCase()));
    out.wa_calls = waConnected && (waCalls?.count ?? 0) > 0
      ? { status: "ok", detail: "Sessão conectada e chamadas importadas." }
      : waConnected
        ? { status: "partial", detail: "Sessão conectada, aguardando a primeira chamada." }
        : { status: "off", detail: "Nenhuma sessão WhatsApp conectada." };

    // gclid comprova apenas que o MKTOn reconheceu a origem Google Ads. O envio da
    // conversão ao Google acontece no navegador pelo gtag/GTM configurado no guia;
    // sem uma confirmação da API do Google Ads, este status não pode ser "ok".
    out.google = (googleEvents?.count ?? 0) > 0
      ? {
          status: "partial",
          detail: "Clique Google Ads (gclid) identificado. A atribuição no MKTOn está ativa; confirme no Google Ads se o gtag/GTM recebeu a conversão.",
        }
      : siteOk
        ? {
            status: "partial",
            detail: "Pixel do site ativo, aguardando visita com gclid. O envio de conversão ao Google depende do gtag/GTM configurado no guia.",
          }
        : { status: "off", detail: "Instale primeiro o pixel do site; depois configure o envio ao Google via gtag/GTM no guia." };

    const clicks = emailEvents?.count ?? 0;
    const opens = emailOpens?.count ?? 0;
    out.email = clicks > 0
      ? { status: "ok", detail: `Cliques vindos de e-mail identificados${opens > 0 ? ` e ${opens} abertura(s) registrada(s)` : ""}.` }
      : opens > 0
        ? { status: "partial", detail: "Pixel de abertura funcionando, mas ninguém clicou nos links rastreados ainda." }
        : { status: "off", detail: "Nenhum clique ou abertura de e-mail nos últimos 7 dias." };

    out.crm = (leads?.count ?? 0) > 0
      ? { status: "ok", detail: "CRM ativo e recebendo leads." }
      : { status: "partial", detail: "CRM ativo, ainda sem leads registrados." };

    return out;
  });
