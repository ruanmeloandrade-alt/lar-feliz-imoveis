import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Webhook público da Z-API. A URL contém um segredo por sessão:
//   /api/public/zapi/webhook/<webhook_secret>
// Não expomos IDs de workspace na URL, e o secret é rotacionado por sessão.

const PayloadSchema = z.object({
  type: z.string().optional(),
  phone: z.string().optional(),
  fromMe: z.boolean().optional(),
  momment: z.number().optional(),
  messageId: z.string().optional(),
  senderName: z.string().optional(),
  senderPhoto: z.string().optional(),
  chatName: z.string().optional(),
  text: z.object({ message: z.string().optional() }).optional(),
  image: z.object({ imageUrl: z.string().optional(), caption: z.string().optional() }).optional(),
  audio: z.object({ audioUrl: z.string().optional() }).optional(),
  video: z.object({ videoUrl: z.string().optional() }).optional(),
  document: z.object({ documentUrl: z.string().optional(), fileName: z.string().optional() }).optional(),
  status: z.string().optional(),
  connected: z.boolean().optional(),
}).passthrough();

export const Route = createFileRoute("/api/public/zapi/webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const secret = params.secret;
        if (!secret || secret.length < 20) {
          return new Response("bad secret", { status: 400 });
        }

        const raw = await request.text();
        let payload: z.infer<typeof PayloadSchema>;
        try {
          payload = PayloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!encKey) return new Response("server misconfigured", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve sessão pelo segredo (função SECURITY DEFINER com pgp_sym_decrypt do client-token)
        const { data: sessData, error: sessErr } = await supabaseAdmin.rpc("get_zapi_session_by_secret", {
          _webhook_secret: secret,
          _key: encKey,
        });
        if (sessErr || !sessData) {
          return new Response("unknown session", { status: 404 });
        }
        const sess = sessData as unknown as {
          session_id: string;
          workspace_id: string;
          instance_id: string;
          client_token: string | null;
        };

        // Validação opcional de Client-Token: se a instância tem client-token cadastrado, exigir header
        if (sess.client_token) {
          const header = request.headers.get("client-token") ?? request.headers.get("Client-Token");
          if (header !== sess.client_token) {
            return new Response("unauthorized", { status: 401 });
          }
        }

        const type = payload.type ?? "";

        // Conectado / desconectado
        if (type === "ConnectedCallback" || payload.connected === true) {
          await supabaseAdmin
            .from("whatsapp_web_sessions")
            .update({ status: "conectado", last_connected_at: new Date().toISOString() })
            .eq("id", sess.session_id);
          return Response.json({ ok: true });
        }
        if (type === "DisconnectedCallback" || payload.connected === false) {
          await supabaseAdmin
            .from("whatsapp_web_sessions")
            .update({ status: "desconectado", last_disconnected_at: new Date().toISOString() })
            .eq("id", sess.session_id);
          return Response.json({ ok: true });
        }

        // Status de entrega/leitura
        if (type === "MessageStatusCallback" && payload.messageId && payload.status) {
          await supabaseAdmin
            .from("whatsapp_web_messages")
            .update({ delivery_status: payload.status.toLowerCase() })
            .eq("message_id", payload.messageId)
            .eq("workspace_id", sess.workspace_id);
          return Response.json({ ok: true });
        }

        // Mensagem recebida/enviada
        if (type === "ReceivedCallback" || type === "SentCallback" || payload.text || payload.image || payload.audio) {
          const phone = (payload.phone ?? "").replace(/\D/g, "");
          if (!phone) return Response.json({ ok: true, skipped: "no phone" });

          const messageType = payload.image ? "image"
            : payload.audio ? "audio"
            : payload.video ? "video"
            : payload.document ? "document"
            : "text";
          const body =
            payload.text?.message ??
            payload.image?.caption ??
            payload.document?.fileName ??
            null;
          const mediaUrl =
            payload.image?.imageUrl ??
            payload.audio?.audioUrl ??
            payload.video?.videoUrl ??
            payload.document?.documentUrl ??
            null;

          const receivedAt = payload.momment
            ? new Date(payload.momment).toISOString()
            : new Date().toISOString();

          await supabaseAdmin.from("whatsapp_web_messages").upsert(
            {
              workspace_id: sess.workspace_id,
              session_id: sess.session_id,
              remote_jid: `${phone}@c.us`,
              message_id: payload.messageId ?? `wh-${Date.now()}`,
              from_me: !!payload.fromMe,
              sender_name: payload.senderName ?? payload.chatName ?? null,
              sender_phone: phone,
              message_type: messageType,
              body,
              media_url: mediaUrl,
              delivery_status: payload.fromMe ? "sent" : "received",
              raw: JSON.parse(JSON.stringify(payload)),
              received_at: receivedAt,
            },
            { onConflict: "message_id" },
          );
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true, ignored: type });
      },
    },
  },
});
