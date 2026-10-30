import { createFileRoute } from "@tanstack/react-router";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";
import { assertSlimSessionSecurity, slimSessionSecurityResponse } from "@/lib/slim-session-security.core";

function bearerToken(request: Request) {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export const Route = createFileRoute("/api/partners/request-payout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearerToken(request);
        if (!token) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;
        const { data: authData, error: authError } = await admin.auth.getUser(token);
        const userId = authData.user?.id;
        if (authError || !userId) return Response.json({ ok: false, error: "Sessão inválida." }, { status: 401 });

        const { createClient } = await import("@supabase/supabase-js");
        let supabaseEnv;
        try {
          supabaseEnv = resolveServerSupabaseEnv();
        } catch {
          return Response.json({ ok: false, error: "Configuração de autenticação indisponível." }, { status: 503 });
        }

        const userClient = createClient(supabaseEnv.url, supabaseEnv.publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        try { await assertSlimSessionSecurity(userClient); }
        catch (error) { return slimSessionSecurityResponse(error); }

        const { data: profile, error: profileError } = await admin
          .from("partner_program_payment_profiles")
          .select("verification_status")
          .eq("user_id", userId)
          .maybeSingle();

        if (profileError) return Response.json({ ok: false, error: "Não foi possível validar seus dados de recebimento." }, { status: 500 });
        if (!profile || profile.verification_status !== "verified") {
          return Response.json({ ok: false, error: "Confirme e valide CPF/CNPJ, titular e PIX antes de solicitar um pagamento." }, { status: 409 });
        }

        const { data, error } = await (userClient as any).rpc("partner_program_request_payout");
        if (error) return Response.json({ ok: false, error: error.message || "Não foi possível solicitar o pagamento." }, { status: 400 });

        return Response.json({ ok: true, payoutId: data ?? null });
      },
    },
  },
});
