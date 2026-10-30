import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { adminClient, parseSignedRequest, persistWebhookEvent } from "@/lib/meta-server";

// Data Deletion Request URL (App Review):
// https://saudeslim.com.br/api/public/oauth/meta/data-deletion
// A Meta chama este endpoint quando o usuário pede exclusão de dados.
// Deve responder com { url, confirmation_code } em JSON.

export const Route = createFileRoute("/api/public/oauth/meta/data-deletion")({
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
        const confirmationCode = createHash("sha256")
          .update(`${parsed?.user_id ?? "unknown"}:${Date.now()}:${Math.random()}`)
          .digest("hex").slice(0, 16);

        await persistWebhookEvent({
          provider: "meta", eventType: "data_deletion_request",
          payload: { signed_request_present: !!signed, parsed, confirmation_code: confirmationCode },
          signatureValid: !!parsed, processedAt: new Date(),
        });

        if (!parsed) {
          return new Response(JSON.stringify({ error: "invalid signed_request" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const fbUserId = String(parsed.user_id ?? "");
        const admin = adminClient();

        if (fbUserId) {
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
            // Apaga dados Meta desse usuário: integração, page tokens, subscriptions
            await admin.from("integrations").delete()
              .eq("workspace_id", wsId).eq("provider", "meta");
            await admin.from("integrations").delete()
              .eq("workspace_id", wsId).like("provider", "meta_page_%");
            // Marca páginas/IG/pixels como órfãos (mantém dados agregados anônimos, mas remove vínculo)
            await admin.from("meta_pages").delete().eq("workspace_id", wsId);
            await admin.from("meta_instagram_accounts").delete().eq("workspace_id", wsId);
            await admin.from("meta_ad_accounts").delete().eq("workspace_id", wsId);
            await admin.from("meta_pixels").delete().eq("workspace_id", wsId);
          }
        }

        const statusUrl = `https://saudeslim.com.br/settings/integracoes?meta=deleted&code=${confirmationCode}`;
        return new Response(JSON.stringify({
          url: statusUrl,
          confirmation_code: confirmationCode,
        }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
