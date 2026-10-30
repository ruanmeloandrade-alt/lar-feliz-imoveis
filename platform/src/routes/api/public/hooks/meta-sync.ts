import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth";
import { adminClient, refreshMetaTokens, metaFetch, META_GRAPH } from "@/lib/meta-server";

// Cron endpoint chamado a cada 12h pelo pg_cron.
// Autenticação: header `apikey` com anon/publishable key do Supabase.
// Faz: refresh de tokens, revalidação, ressync leve, reassinatura de webhooks.

export const Route = createFileRoute("/api/public/hooks/meta-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();

        const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!encKey) {
          return new Response(JSON.stringify({ error: "INTEGRATION_ENCRYPTION_KEY não configurado" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const admin = adminClient();
        const result = {
          started_at: new Date().toISOString(),
          token_refresh: { checked: 0, refreshed: 0, failed: 0 } as { checked: number; refreshed: number; failed: number; errors?: unknown[] },
          workspaces_validated: 0,
          workspaces_invalid: 0,
          pages_resubscribed: 0,
          errors: [] as string[],
        };

        // 1) Renova long-lived tokens vencendo em <=7d
        try {
          const r = await refreshMetaTokens();
          result.token_refresh = r;
        } catch (e) {
          result.errors.push(`refresh: ${e instanceof Error ? e.message : String(e)}`);
        }

        // 2) Valida tokens conectados com GET /me
        const { data: integrations } = await admin
          .from("integrations")
          .select("workspace_id")
          .eq("provider", "meta")
          .eq("status", "connected");

        for (const it of integrations ?? []) {
          const wsId = it.workspace_id as string;
          try {
            const { data: sec } = await admin.rpc("get_integration_secret_service", {
              _workspace_id: wsId, _provider: "meta", _key: encKey,
            });
            const token = (sec as { access_token?: string } | null)?.access_token;
            if (!token) { result.workspaces_invalid++; continue; }

            const url = new URL(`https://graph.facebook.com/${META_GRAPH}/me`);
            url.searchParams.set("access_token", token);
            url.searchParams.set("fields", "id");
            await metaFetch(url.toString(), { workspaceId: wsId });
            result.workspaces_validated++;

            // 3) Reassina páginas/IG cujo messaging_subscribed_at é null ou > 30 dias
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
            const { data: pages } = await admin
              .from("meta_pages")
              .select("page_id, messaging_subscribed_at")
              .eq("workspace_id", wsId)
              .or(`messaging_subscribed_at.is.null,messaging_subscribed_at.lt.${thirtyDaysAgo}`);
            for (const p of pages ?? []) {
              const pageToken = await admin.rpc("get_meta_page_token", {
                _workspace_id: wsId, _page_id: p.page_id, _key: encKey,
              });
              const pt = (pageToken.data as string | null) ?? null;
              if (!pt) continue;
              try {
                const r = await fetch(`https://graph.facebook.com/${META_GRAPH}/${p.page_id}/subscribed_apps`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    access_token: pt,
                    subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads,message_reactions,feed,mention,leadgen",
                  }).toString(),
                });
                if (r.ok) {
                  await admin.from("meta_pages").update({ messaging_subscribed_at: new Date().toISOString(), messaging_error: null })
                    .eq("workspace_id", wsId).eq("page_id", p.page_id);
                  result.pages_resubscribed++;
                }
              } catch { /* noop */ }
            }
          } catch (e) {
            result.workspaces_invalid++;
            result.errors.push(`ws=${wsId}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        return new Response(JSON.stringify({ ...result, finished_at: new Date().toISOString() }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
