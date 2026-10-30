import { createFileRoute } from "@tanstack/react-router";

/**
 * Pixel de abertura de e-mail do MKTOn.
 * Uso no HTML do e-mail:
 *   <img src="https://SEU_DOMINIO/api/public/track/open.gif?w=WORKSPACE&c=CAMPANHA" width="1" height="1" />
 *
 * Registra um evento `email_open` em tracking_events e devolve um GIF 1x1
 * transparente, sempre com status 200 para nunca quebrar o layout do e-mail.
 */

// GIF 1x1 transparente
const GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function gifResponse() {
  const bin = atob(GIF_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/public/track/open.gif")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const w = url.searchParams.get("w") ?? "";
          if (!/^[0-9a-f-]{36}$/i.test(w)) return gifResponse();

          const campaign = (url.searchParams.get("c") ?? "sem-campanha").slice(0, 120);
          const contact = (url.searchParams.get("e") ?? "").slice(0, 160);
          const ua = request.headers.get("user-agent") ?? "";

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("tracking_events").insert({
            workspace_id: w,
            event_name: "email_open",
            utm_source: "mailing",
            utm_medium: "email",
            utm_campaign: campaign,
            props: contact ? { contact } : {},
            user_agent: ua.slice(0, 500),
            ip:
              (request.headers.get("cf-connecting-ip") ??
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                "").slice(0, 60),
            country: request.headers.get("cf-ipcountry"),
          } as never);
        } catch {
          /* nunca falha para o leitor do e-mail */
        }
        return gifResponse();
      },
    },
  },
});
