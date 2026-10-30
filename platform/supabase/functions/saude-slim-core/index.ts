import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// Backend próprio da Saúde Slim. Sem credenciais privilegiadas, Evolution ou serviços legados.
const PROJECT_ID = "vyzvfcgpjjzvcjegzzza";
const BASE = `https://${PROJECT_ID}.supabase.co`;
const ALLOWED_ORIGINS = new Set(["https://slimesaude.com", "https://www.slimesaude.com"]);

function headers(origin: string | null) {
  const h: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
function respond(status: number, obj: unknown, origin: string | null) {
  return new Response(JSON.stringify(obj), { status, headers: headers(origin) });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return respond(403, { error: "Origem não autorizada" }, null);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "GET") return respond(405, { error: "Método não permitido" }, origin);
  const auth = request.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(401, { error: "Sessão necessária" }, origin);

  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const base = Deno.env.get("SUPABASE_URL") || BASE;
  if (!publicKey || base !== BASE) return respond(503, { error: "Configuração de backend indisponível" }, origin);

  try {
    const supabase = createClient(base, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: identity, error: authError } = await supabase.auth.getUser(token);
    if (authError || !identity.user) return respond(401, { error: "Sessão inválida" }, origin);

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("current_workspace_id").eq("id", identity.user.id).maybeSingle();
    if (profileError) return respond(503, { error: "Não foi possível validar o perfil" }, origin);
    if (!profile?.current_workspace_id) return respond(409, { error: "Nenhum workspace ativo" }, origin);
    const workspaceId = profile.current_workspace_id;

    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members").select("id").eq("workspace_id", workspaceId)
      .eq("user_id", identity.user.id).maybeSingle();
    if (membershipError || !membership) return respond(403, { error: "Workspace não autorizado" }, origin);

    const url = new URL(request.url);
    const resource = url.pathname.split("/").filter(Boolean).pop() || "overview";
    const count = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    if (resource === "overview" || resource === "saude-slim-core") {
      const [leads, won, products, sessions] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "won"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        supabase.from("whatsapp_web_sessions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      ]);
      const errors = [leads.error, won.error, products.error, sessions.error].filter(Boolean);
      if (errors.length) return respond(503, { error: "Falha na consulta do workspace" }, origin);
      return respond(200, { project: "saude-slim", workspaceId, counts: {
        leads: leads.count, sales: won.count, products: products.count, whatsappSessions: sessions.count
      } }, origin);
    }

    const specs: Record<string, { table: string; columns: string; sort: string }> = {
      "leads": { table: "leads", columns: "id,name,email,phone,status,stage_id,value,created_at", sort: "created_at" },
      "sales": { table: "leads", columns: "id,name,email,phone,value,status,created_at,updated_at", sort: "updated_at" },
      "products": { table: "products", columns: "id,catalog_id,name,sku,price,promo_price,stock,active,created_at", sort: "created_at" },
      "pipelines": { table: "pipelines", columns: "id,name,position,created_at", sort: "position" },
      "stages": { table: "pipeline_stages", columns: "id,name,pipeline_id,position,created_at", sort: "position" },
    };
    const spec = specs[resource];
    if (!spec) return respond(404, { error: "Rota não disponível" }, origin);
    let query = supabase.from(spec.table).select(spec.columns).eq("workspace_id", workspaceId);
    if (resource === "sales") query = query.eq("status", "won");
    const { data, error } = await query.order(spec.sort, { ascending: resource === "stages" || resource === "pipelines" }).limit(count);
    if (error) return respond(503, { error: "Consulta indisponível", resource }, origin);
    return respond(200, { resource, workspaceId, rows: data ?? [] }, origin);
  } catch {
    return respond(500, { error: "Erro interno" }, origin);
  }
});
