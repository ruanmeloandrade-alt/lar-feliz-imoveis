import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseAdminEnv } from "@/integrations/supabase/saude-slim-env";
import type { Database } from "@/integrations/supabase/types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function page(
  body: string,
  status = 200,
  redirectQuery = "google=ok",
  autoRedirect = status < 400,
) {
  const redirectScript = autoRedirect
    ? `<script>setTimeout(()=>{window.location.href='/integracoes?${redirectQuery}'},1800)</script>`
    : "";
  return new Response(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>Google · MKTOn</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0d10;color:#e7e9ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:680px;padding:32px;border:1px solid #232733;border-radius:12px;background:#13161c;text-align:center}h1{margin:0 0 12px;font-size:20px}p{margin:0 0 8px;color:#9aa3b2;font-size:14px;line-height:1.5}code{display:block;background:#0b0d10;padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-word;text-align:left}.actions{margin-top:18px}.actions a{color:#fff;text-decoration:none;border:1px solid #343a46;padding:9px 14px;border-radius:8px}</style>
</head><body><main>${body}${autoRedirect ? "" : `<div class="actions"><a href="/integracoes?${redirectQuery}">Voltar para Integrações</a></div>`}</main>${redirectScript}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function classifyTokenExchangeError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid_client")) {
    return {
      title: "Client Secret recusado pelo Google",
      guidance:
        "O Client ID conseguiu abrir o consentimento, mas a autenticação do cliente falhou na troca do código. Isso indica Client Secret incorreto, incompleto ou pertencente a outro OAuth Client.",
    };
  }
  if (lower.includes("invalid_grant")) {
    return {
      title: "Código OAuth recusado pelo Google",
      guidance:
        "O Google recusou o authorization code. As causas usuais são código expirado/já utilizado ou incompatibilidade entre os parâmetros da autorização e da troca. A MKTOn usa o mesmo redirect URI nas duas etapas; registre a mensagem técnica abaixo para diagnóstico.",
    };
  }
  if (lower.includes("unauthorized") || lower.includes("google oauth proxy 401")) {
    return {
      title: "Backend OAuth não autorizou a troca",
      guidance:
        "O callback chegou até a MKTOn, mas a chamada interna ao proxy OAuth foi recusada antes de chegar ao Google.",
    };
  }
  return {
    title: "Falha ao trocar código por token",
    guidance:
      "A autorização chegou ao callback, mas a troca final por tokens falhou. A mensagem técnica abaixo foi preservada para identificar a causa exata.",
  };
}

export const Route = createFileRoute("/api/public/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");

        if (err) {
          return page(
            `<h1>Autorização recusada</h1><p><code>${escapeHtml(err)}</code></p>`,
            400,
            "google=error",
          );
        }
        if (!code || !state) {
          return page(
            `<h1>Callback Google ativo</h1><p>Esta é a URL de redirecionamento OAuth da central Google. Cadastre-a no seu projeto do Google Cloud.</p><p><code>${escapeHtml(`${url.origin}/api/public/oauth/google/callback`)}</code></p>`,
          );
        }

        const g = await import("@/lib/google.server");
        let st: { ws: string; products: string[] } | null = null;
        try {
          st = await g.verifyGoogleState(state);
        } catch (e) {
          return page(
            `<h1>Configuração incompleta</h1><p>${escapeHtml((e as Error).message)}</p>`,
            500,
            "google=error",
          );
        }
        if (!st)
          return page(
            `<h1>State inválido</h1><p>O pedido expirou. Tente conectar de novo pelo MKTOn.</p>`,
            400,
            "google=error",
          );

        let supabaseEnv;
        try {
          supabaseEnv = resolveServerSupabaseAdminEnv();
        } catch {
          supabaseEnv = null;
        }
        if (!supabaseEnv)
          return page(
            `<h1>Configuração incompleta</h1><p>Faltam variáveis do servidor.</p>`,
            500,
            "google=error",
          );

        const redirectUri = `${url.origin}/api/public/oauth/google/callback`;
        let tok;
        try {
          tok = await g.exchangeGoogleCode({ code, redirectUri });
        } catch (e) {
          const message = (e as Error).message || String(e);
          const classified = classifyTokenExchangeError(message);
          console.error("[google oauth] token exchange:", message);
          return page(
            `<h1>${classified.title}</h1><p>${classified.guidance}</p><p><code>${escapeHtml(message)}</code></p>`,
            500,
            "google=error",
            false,
          );
        }

        const info = await g.googleUserInfo(tok.access_token);

        const admin = createClient<Database>(supabaseEnv.url, supabaseEnv.serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        // preserva configurações já salvas (IDs, developer token, produtos)
        let previous: Record<string, unknown> = {};
        try {
          const { data } = await admin.rpc("get_integration_secret_service", {
            _workspace_id: st.ws,
            _provider: "google",
            _key: g.encKey(),
          });
          if (data) previous = data as Record<string, unknown>;
        } catch {
          /* primeira conexão */
        }

        const payload = {
          ...previous,
          access_token: tok.access_token,
          refresh_token: tok.refresh_token ?? (previous.refresh_token as string | undefined),
          expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
          scope: tok.scope ?? (previous.scope as string | undefined) ?? null,
          products: st.products,
          email: info.email ?? null,
        };

        if (!payload.refresh_token) {
          return page(
            `<h1>Google não devolveu refresh token</h1><p>Remova o acesso da MKTOn em myaccount.google.com/permissions e conecte de novo.</p>`,
            400,
            "google=error",
            false,
          );
        }

        const { error } = await admin.rpc("set_integration_secret_service", {
          _workspace_id: st.ws,
          _provider: "google",
          _plaintext: JSON.parse(JSON.stringify(payload)),
          _key: g.encKey(),
          _metadata: JSON.parse(
            JSON.stringify({
              email: info.email ?? null,
              name: info.name ?? null,
              scopes: (tok.scope ?? "").split(" ").length,
              products: st.products,
              connected_at: new Date().toISOString(),
            }),
          ),
          _status: "connected",
        });
        if (error) {
          console.error("[google oauth] set_integration_secret_service:", error);
          return page(
            `<h1>Falha ao salvar credencial</h1><p><code>${escapeHtml(error.message)}</code></p>`,
            500,
            "google=error",
            false,
          );
        }

        return page(
          `<h1>Conta Google conectada ✓</h1><p>${escapeHtml(info.email ?? "conta autorizada")}</p><p>As permissões selecionadas foram atualizadas. Voltando para Integrações…</p>`,
        );
      },
    },
  },
});
