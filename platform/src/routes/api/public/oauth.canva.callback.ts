import { createFileRoute } from "@tanstack/react-router";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";

const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

function canvaRedirectUri() {
  return `${resolvePublicAppUrl()}/api/public/oauth/canva/callback`;
}

function html(title: string, body: string, ok: boolean) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;background:#0b0b10;color:#e6e6e6;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
      .card{max-width:520px;background:#141420;border:1px solid #262633;border-radius:16px;padding:32px;text-align:center}
      h1{margin:0 0 8px;font-size:20px}
      p{margin:8px 0;line-height:1.5;color:#b8b8c8}
      .dot{width:56px;height:56px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;font-size:28px;background:${ok ? "#0f3d2e" : "#3d0f15"};color:${ok ? "#4ade80" : "#f87171"}}
      button{margin-top:16px;padding:10px 16px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer}
    </style></head><body>
    <div class="card">
      <div class="dot">${ok ? "✓" : "!"}</div>
      <h1>${title}</h1>
      ${body}
      <button onclick="window.close()">Fechar janela</button>
    </div></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/canva/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        if (err) return html("Autorização negada", `<p>${err}</p>`, false);
        if (!code || !state) return html("Requisição inválida", `<p>Parâmetros ausentes.</p>`, false);

        const clientId = process.env.CANVA_CLIENT_ID;
        const clientSecret = process.env.CANVA_CLIENT_SECRET;
        if (!clientId || !clientSecret) return html("Configuração ausente", `<p>Credenciais Canva não configuradas.</p>`, false);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look up + consume PKCE state
        const { data: stateRow } = await supabaseAdmin
          .from("canva_oauth_states" as never)
          .select("code_verifier,expires_at")
          .eq("state", state)
          .maybeSingle() as { data: { code_verifier: string; expires_at: string } | null };

        if (!stateRow) return html("Estado inválido", `<p>Sessão de autorização expirada. Tente conectar novamente.</p>`, false);
        if (new Date(stateRow.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("canva_oauth_states" as never).delete().eq("state", state);
          return html("Sessão expirada", `<p>O link expirou. Inicie o processo novamente.</p>`, false);
        }

        // Exchange code -> tokens
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: stateRow.code_verifier,
          redirect_uri: canvaRedirectUri(),
        });
        const basic = btoa(`${clientId}:${clientSecret}`);
        const tokRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        const tokJson = await tokRes.json().catch(() => ({} as Record<string, unknown>));
        if (!tokRes.ok) {
          console.error("[canva] token exchange failed", tokRes.status, tokJson);
          return html("Falha na autorização", `<p>Não foi possível trocar o código: ${tokRes.status}</p>`, false);
        }

        const access_token = tokJson.access_token as string;
        const refresh_token = (tokJson.refresh_token as string | undefined) ?? null;
        const expires_in = (tokJson.expires_in as number | undefined) ?? 3600;
        const scope = (tokJson.scope as string | undefined) ?? null;
        const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

        // Optional: fetch profile
        let canva_user_id: string | null = null;
        try {
          const pr = await fetch("https://api.canva.com/rest/v1/users/me", {
            headers: { Authorization: `Bearer ${access_token}` },
          });
          if (pr.ok) {
            const pj = await pr.json();
            canva_user_id = pj?.team_user?.user_id ?? pj?.user?.id ?? null;
          }
        } catch { /* ignore */ }

        // Upsert global connection (workspace_id null)
        await supabaseAdmin.from("social_canva_connections" as never).delete().is("workspace_id", null);
        const { error: insErr } = await supabaseAdmin
          .from("social_canva_connections" as never)
          .insert({
            workspace_id: null,
            access_token,
            refresh_token,
            expires_at,
            scope,
            canva_user_id,
          } as never);
        if (insErr) {
          console.error("[canva] insert connection failed", insErr);
          return html("Erro ao salvar conexão", `<p>${insErr.message}</p>`, false);
        }

        await supabaseAdmin.from("canva_oauth_states" as never).delete().eq("state", state);

        return html("Canva conectado!", `<p>A conta Canva da MKTOn foi vinculada com sucesso. Você já pode fechar esta janela e voltar para o app.</p>`, true);
      },
    },
  },
});
