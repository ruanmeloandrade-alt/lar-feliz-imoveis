import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveServerSupabaseAdminEnv } from "@/integrations/supabase/saude-slim-env";
import { discoverMetaPagesForToken, verifyMetaState } from "@/lib/meta.functions";

const GRAPH = "v23.0";

function page(body: string, status = 200, redirectQuery = "meta=ok") {
  return new Response(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>Meta · MKTOn</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0d10;color:#e7e9ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:520px;padding:32px;border:1px solid #232733;border-radius:12px;background:#13161c;text-align:center}h1{margin:0 0 12px;font-size:20px}p{margin:0 0 8px;color:#9aa3b2;font-size:14px;line-height:1.5}a{color:#7dd3fc;text-decoration:none}code{background:#0b0d10;padding:2px 6px;border-radius:4px;font-size:12px}</style>
</head><body><main>${body}</main><script>setTimeout(()=>{window.location.href='/integracoes?${redirectQuery}'},1600)</script></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const errDesc = url.searchParams.get("error_description");

        if (err) {
          console.error("[meta oauth] provider error:", err, errDesc);
          return page(`<h1>Autorização recusada</h1><p><code>${err}</code></p><p>${errDesc ?? ""}</p>`, 400, "meta=error");
        }
        if (!code || !state) {
          return page(`<h1>Callback Meta ativo</h1><p>Esta é a URL de redirecionamento OAuth. Fluxo aguardando <code>code</code> e <code>state</code>.</p>`);
        }

        const st = await verifyMetaState(state);
        if (!st) return page(`<h1>State inválido</h1><p>A requisição pode ter expirado. Tente conectar novamente pelo MKTOn.</p>`, 400, "meta=error");

        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        let supabaseEnv;
        try {
          supabaseEnv = resolveServerSupabaseAdminEnv();
        } catch {
          supabaseEnv = null;
        }
        if (!appId || !appSecret || !encKey || !supabaseEnv) {
          console.error("[meta oauth] env faltando");
          return page(`<h1>Configuração incompleta</h1><p>Faltam variáveis do servidor.</p>`, 500, "meta=error");
        }

        const redirectUri = `${url.origin}/api/public/oauth/meta/callback`;

        // 1) troca code por short-lived token
        const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH}/oauth/access_token`);
        tokenUrl.searchParams.set("client_id", appId);
        tokenUrl.searchParams.set("client_secret", appSecret);
        tokenUrl.searchParams.set("redirect_uri", redirectUri);
        tokenUrl.searchParams.set("code", code);
        const tokRes = await fetch(tokenUrl.toString());
        if (!tokRes.ok) {
          const txt = await tokRes.text().catch(() => "");
          console.error("[meta oauth] token exchange falhou:", tokRes.status, txt.slice(0, 500));
          return page(`<h1>Falha ao trocar código por token</h1><p>${tokRes.status}</p>`, 500, "meta=error");
        }
        const tokJson = (await tokRes.json()) as { access_token: string; token_type?: string; expires_in?: number };

        // 2) upgrade para long-lived token (60 dias)
        let accessToken = tokJson.access_token;
        let expiresIn = tokJson.expires_in ?? 3600;
        try {
          const llUrl = new URL(`https://graph.facebook.com/${GRAPH}/oauth/access_token`);
          llUrl.searchParams.set("grant_type", "fb_exchange_token");
          llUrl.searchParams.set("client_id", appId);
          llUrl.searchParams.set("client_secret", appSecret);
          llUrl.searchParams.set("fb_exchange_token", accessToken);
          const llRes = await fetch(llUrl.toString());
          if (llRes.ok) {
            const j = (await llRes.json()) as { access_token: string; expires_in?: number };
            accessToken = j.access_token;
            expiresIn = j.expires_in ?? 60 * 24 * 3600;
          }
        } catch (e) { console.warn("[meta oauth] long-lived upgrade falhou:", e); }

        // 3) pega ID do usuário Facebook + nome
        let fbUserId: string | null = null;
        let fbUserName: string | null = null;
        try {
          const meRes = await fetch(`https://graph.facebook.com/${GRAPH}/me?fields=id,name&access_token=${accessToken}`);
          if (meRes.ok) {
            const me = (await meRes.json()) as { id?: string; name?: string };
            fbUserId = me.id ?? null;
            fbUserName = me.name ?? null;
          }
        } catch (e) { console.warn("[meta oauth] /me falhou:", e); }

        // 3.1) Business Managers, Páginas, Instagram, Contas de anúncios, Pixels e Catálogos
        //      (best-effort, falha em um bloco não interrompe a conexão)
        type IdName = { id: string; name?: string };
        type Business = { id: string; name?: string; owned_ad_accounts?: { data?: IdName[] }; owned_pages?: { data?: IdName[] } };
        type AdAcct = { id: string; name?: string; currency?: string; account_status?: number };
        type Pixel = { id: string; name?: string };
        type Catalog = { id: string; name?: string; product_count?: number; vertical?: string };

        async function safeGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
          try {
            const u = new URL(`https://graph.facebook.com/${GRAPH}/${path}`);
            u.searchParams.set("access_token", accessToken);
            for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
            const r = await fetch(u.toString());
            if (!r.ok) { console.warn(`[meta oauth] ${path} ${r.status}`); return null; }
            return (await r.json()) as T;
          } catch (e) { console.warn(`[meta oauth] ${path} fail`, e); return null; }
        }

        const permissionsRes = await safeGet<{ data?: Array<{ permission: string; status: string }> }>("me/permissions", { limit: "200" });
        const grantedPermissions = (permissionsRes?.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
        const declinedPermissions = (permissionsRes?.data ?? []).filter((p) => p.status === "declined").map((p) => p.permission);

        const bmRes = await safeGet<{ data?: Business[] }>("me/businesses", { fields: "id,name", limit: "100" });
        const businesses = bmRes?.data ?? [];

        const catalogs: Catalog[] = [];
        for (const b of businesses) {
          const c = await safeGet<{ data?: Catalog[] }>(`${b.id}/owned_product_catalogs`, { fields: "id,name,product_count,vertical", limit: "100" });
          for (const cat of c?.data ?? []) catalogs.push(cat);
        }

        const adAcctRes = await safeGet<{ data?: AdAcct[] }>("me/adaccounts", { fields: "id,name,currency,account_status", limit: "200" });
        const adAccounts = adAcctRes?.data ?? [];

        const pages = await discoverMetaPagesForToken(accessToken);
        const instagram = pages
          .map((p) => p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null, page_id: p.id } : null)
          .filter(Boolean);

        const pixels: Array<Pixel & { ad_account_id: string }> = [];
        for (const a of adAccounts.slice(0, 25)) {
          const px = await safeGet<{ data?: Pixel[] }>(`${a.id}/adspixels`, { fields: "id,name", limit: "50" });
          for (const p of px?.data ?? []) pixels.push({ ...p, ad_account_id: a.id });
        }

        // 4) grava integração usando service role
        const admin = createClient<Database>(supabaseEnv.url, supabaseEnv.serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        const { error: rpcErr } = await admin.rpc("set_integration_secret_service", {
          _workspace_id: st.ws,
          _provider: "meta",
          _plaintext: JSON.parse(JSON.stringify({
            access_token: accessToken,
            token_type: "bearer",
            facebook_user_id: fbUserId,
          })),
          _key: encKey,
          _metadata: JSON.parse(JSON.stringify({
            facebook_user_id: fbUserId,
            facebook_user_name: fbUserName,
            expires_at: expiresAt,
            connected_at: new Date().toISOString(),
            businesses: businesses.map((b) => ({ id: b.id, name: b.name ?? null })),
            catalogs: catalogs.map((c) => ({ id: c.id, name: c.name ?? null, product_count: c.product_count ?? null, vertical: c.vertical ?? null })),
            ad_accounts_count: adAccounts.length,
            pages_count: pages.length,
            instagram_count: instagram.length,
            pixels_count: pixels.length,
            granted_permissions: grantedPermissions,
            declined_permissions: declinedPermissions,
          })),
          _status: "connected",
        });
        if (rpcErr) {
          console.error("[meta oauth] set_integration_secret:", rpcErr);
          return page(`<h1>Falha ao salvar credencial</h1><p><code>${rpcErr.message}</code></p>`, 500, "meta=error");
        }

        return page(`<h1>Meta conectada com sucesso ✓</h1><p>${businesses.length} Business Manager · ${pages.length} páginas · ${instagram.length} Instagram · ${adAccounts.length} contas de anúncios · ${pixels.length} pixels · ${catalogs.length} catálogos.</p><p>Voltando para Integrações…</p>`);

      },
    },
  },
});
