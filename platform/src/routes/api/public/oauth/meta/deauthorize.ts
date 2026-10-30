import { createFileRoute } from "@tanstack/react-router";
import { adminClient, parseSignedRequest, persistWebhookEvent } from "@/lib/meta-server";

// Deauthorize Callback URL (App Review):
// https://saudeslim.com.br/api/public/oauth/meta/deauthorize
// A Meta chama este endpoint quando o usuário remove o app.
// Payload: signed_request=<sig>.<payload_b64url>

export const Route = createFileRoute("/api/public/oauth/meta/deauthorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ct = request.headers.get("content-type") ?? "";
        let signed = "";
        if (ct.includes("application/x-www-form-urlencoded")) {
          const form = await request.formData();
          signed = String(form.get("signed_request") ?? "");
        } else {
          const bodyText = await request.text();
          const params = new URLSearchParams(bodyText);
          signed = params.get("signed_request") ?? "";
          if (!signed) {
            try { signed = (JSON.parse(bodyText) as { signed_request?: string }).signed_request ?? ""; } catch { /* noop */ }
          }
        }

        const parsed = signed ? parseSignedRequest(signed) : null;
        await persistWebhookEvent({
          provider: "meta", eventType: "deauthorize",
          payload: { signed_request_present: !!signed, parsed },
          signatureValid: !!parsed, processedAt: new Date(),
        });

        if (!parsed) {
          return new Response(JSON.stringify({ ok: false, error: "invalid signed_request" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const fbUserId = String(parsed.user_id ?? "");
        if (!fbUserId) {
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }

        const admin = adminClient();
        // Encontra todas integrations meta com esse facebook_user_id no metadata
        const { data: rows } = await admin
          .from("integrations")
          .select("workspace_id, metadata")
          .eq("provider", "meta");

        const targets = (rows ?? []).filter((r) => {
          const meta = (r.metadata ?? {}) as { facebook_user_id?: string };
          return meta.facebook_user_id === fbUserId;
        });

        for (const t of targets) {
          const wsId = t.workspace_id as string;
          await admin.from("integrations")
            .update({
              status: "revoked",
              credentials_encrypted: null as never,
              last_error: "usuário revogou acesso na Meta (deauthorize webhook)",
              last_check_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", wsId).eq("provider", "meta");
          // limpa page tokens
          await admin.from("integrations").delete()
            .eq("workspace_id", wsId).like("provider", "meta_page_%");
        }

        return new Response(JSON.stringify({ ok: true, revoked_workspaces: targets.length }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
