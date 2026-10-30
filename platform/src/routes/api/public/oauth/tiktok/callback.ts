import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseAdminEnv } from "@/integrations/supabase/saude-slim-env";
import type { Database } from "@/integrations/supabase/types";

function page(body: string, status = 200, query = "tiktok=ok") {
  return new Response(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>TikTok Ads · MKTOn</title></head><body style="font-family:system-ui;background:#0b0d10;color:#e7e9ee;display:flex;align-items:center;justify-content:center;min-height:100vh"><main style="max-width:520px;padding:32px;border:1px solid #232733;border-radius:12px;background:#13161c;text-align:center">${body}</main><script>setTimeout(()=>{window.location.href='/integracoes?${query}'},1600)</script></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const authCode = url.searchParams.get("auth_code") ?? url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error") ?? url.searchParams.get("error_description");
        if (error) return page(`<h1>Autorização recusada</h1><p>${error}</p>`, 400, "tiktok=error");
        if (!authCode || !state) {
          return page(
            `<h1>Callback TikTok Ads ativo</h1><p>Cadastre esta URL no app TikTok for Business:</p><code>${url.origin}/api/public/oauth/tiktok/callback</code>`,
          );
        }

        const oauth = await import("@/lib/tiktok.oauth.server");
        const verified = await oauth.verifyTikTokAdsState(state);
        if (!verified)
          return page(
            "<h1>State inválido ou expirado</h1><p>Inicie a conexão novamente pela MKTOn.</p>",
            400,
            "tiktok=error",
          );

        let supabaseEnv;
        try {
          supabaseEnv = resolveServerSupabaseAdminEnv();
        } catch {
          supabaseEnv = null;
        }
        if (!supabaseEnv)
          return page(
            "<h1>Configuração incompleta</h1><p>Supabase server-side não configurado.</p>",
            500,
            "tiktok=error",
          );

        let token;
        try {
          token = await oauth.exchangeTikTokAdsCode({
            authCode,
            redirectUri: `${url.origin}/api/public/oauth/tiktok/callback`,
          });
        } catch (e) {
          return page(
            `<h1>Falha na autorização TikTok</h1><p>${(e as Error).message}</p>`,
            500,
            "tiktok=error",
          );
        }

        const admin = createClient<Database>(supabaseEnv.url, supabaseEnv.serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const key = oauth.tiktokIntegrationEncryptionKey();
        let previous: Record<string, unknown> = {};
        try {
          const { data } = await admin.rpc("get_integration_secret_service", {
            _workspace_id: verified.ws,
            _provider: "tiktok",
            _key: key,
          });
          if (data) previous = data as Record<string, unknown>;
        } catch {
          /* primeira autorização */
        }

        let advertisers: Array<{ id: string; name: string }> = [];
        try {
          advertisers = await oauth.listAuthorizedTikTokAdvertisers(token.access_token as string);
        } catch {
          /* seleção poderá ser refeita na UI */
        }
        const previousAdvertiser = previous.advertiser_id as string | undefined;
        const selected =
          previousAdvertiser && advertisers.some((a) => a.id === previousAdvertiser)
            ? previousAdvertiser
            : advertisers.length === 1
              ? advertisers[0].id
              : undefined;

        const payload = {
          ...previous,
          access_token: token.access_token,
          advertiser_id: selected,
          oauth_authorized: true,
          oauth_scope: token.scope ?? null,
        };
        const { error: saveError } = await admin.rpc("set_integration_secret_service", {
          _workspace_id: verified.ws,
          _provider: "tiktok",
          _plaintext: JSON.parse(JSON.stringify(payload)),
          _key: key,
          _metadata: JSON.parse(
            JSON.stringify({
              oauth: true,
              advertiser_id: selected ?? null,
              advertisers: advertisers.map((a) => ({ id: a.id, name: a.name })),
              connected_at: new Date().toISOString(),
            }),
          ),
          _status: "connected",
        });
        if (saveError)
          return page(
            `<h1>Falha ao salvar TikTok</h1><p>${saveError.message}</p>`,
            500,
            "tiktok=error",
          );

        const selection =
          advertisers.length > 1 && !selected
            ? "<p>Autorização concluída. Escolha o advertiser na MKTOn.</p>"
            : `<p>Advertiser: ${selected ?? "autorizado"}</p>`;
        return page(`<h1>TikTok Ads conectado ✓</h1>${selection}<p>Voltando para Integrações…</p>`);
      },
    },
  },
});
