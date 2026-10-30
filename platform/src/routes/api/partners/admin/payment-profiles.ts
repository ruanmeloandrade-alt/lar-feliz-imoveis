import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";
import { assertSlimSessionSecurity, slimSessionSecurityResponse } from "@/lib/slim-session-security.core";

function bearerToken(request: Request) {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function adminContext(request: Request) {
  const token = bearerToken(request);
  if (!token) return { error: Response.json({ ok: false, error: "Não autenticado." }, { status: 401 }) } as const;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const userId = authData.user?.id;
  if (authError || !userId) return { error: Response.json({ ok: false, error: "Sessão inválida." }, { status: 401 }) } as const;

  let supabaseEnv;
  try {
    supabaseEnv = resolveServerSupabaseEnv();
  } catch {
    return { error: Response.json({ ok: false, error: "Configuração Supabase indisponível." }, { status: 503 }) } as const;
  }

  const userClient = createClient(supabaseEnv.url, supabaseEnv.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try { await assertSlimSessionSecurity(userClient); }
  catch (error) { return { error: slimSessionSecurityResponse(error) } as const; }
  const { data: isAdmin, error: adminError } = await (userClient as any).rpc("partner_program_is_admin", { _user_id: userId });
  if (adminError || isAdmin !== true) {
    return { error: Response.json({ ok: false, error: "Acesso restrito ao super admin." }, { status: 403 }) } as const;
  }

  return { supabaseAdmin, userClient, userId } as const;
}

export const Route = createFileRoute("/api/partners/admin/payment-profiles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const context = await adminContext(request);
        if ("error" in context) return context.error;

        const { data, error } = await (context.supabaseAdmin as any)
          .from("partner_program_payment_profiles")
          .select("id,user_id,document_type,document_last4,pix_key_type,pix_key_last4,holder_name,verification_status,verification_reason,version,updated_at")
          .order("updated_at", { ascending: false });
        if (error) {
          return Response.json({ ok: false, error: "Não foi possível carregar os dados de pagamento." }, { status: 500 });
        }
        return Response.json({ ok: true, profiles: data ?? [] });
      },
      POST: async ({ request }) => {
        const context = await adminContext(request);
        if ("error" in context) return context.error;

        const body = await request.json().catch(() => null) as any;
        const userId = String(body?.userId ?? "").trim();
        const status = String(body?.status ?? "").trim();
        const reason = String(body?.reason ?? "").trim() || null;
        if (!userId || !["verified", "rejected"].includes(status)) {
          return Response.json({ ok: false, error: "Dados de verificação inválidos." }, { status: 400 });
        }
        if (status === "rejected" && !reason) {
          return Response.json({ ok: false, error: "Informe o motivo da rejeição." }, { status: 400 });
        }

        const { error } = await (context.userClient as any).rpc("partner_program_verify_payment_profile", {
          p_user_id: userId,
          p_verified: status === "verified",
          p_reason: reason,
        });
        if (error) {
          return Response.json({ ok: false, error: error.message || "Não foi possível atualizar a verificação." }, { status: 400 });
        }
        return Response.json({ ok: true, status });
      },
    },
  },
});
