import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";
import { assertSlimSessionSecurity, slimSessionSecurityResponse } from "@/lib/slim-session-security.core";

async function checkSessionSecurity(token: string): Promise<Response | null> {
  try {
    const env = resolveServerSupabaseEnv();
    const caller = createClient(env.url, env.publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await assertSlimSessionSecurity(caller);
    return null;
  } catch (error) { return slimSessionSecurityResponse(error); }
}

function bearerToken(request: Request) {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export const Route = createFileRoute("/api/partners/payment-profile")({
  server: { handlers: {
    GET: async ({ request }) => {
      const token = bearerToken(request);
      if (!token) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      const userId = authData.user?.id;
      if (authError || !userId) return Response.json({ ok: false, error: "Sessão inválida." }, { status: 401 });
      const denied = await checkSessionSecurity(token);
      if (denied) return denied;
      const { data, error } = await (supabaseAdmin as any).from("partner_program_payment_profiles")
        .select("id,document_type,document_last4,pix_key_type,pix_key_last4,holder_name,verification_status,verification_reason,version,updated_at")
        .eq("user_id", userId).maybeSingle();
      if (error) return Response.json({ ok: false, error: "Não foi possível carregar seus dados de pagamento." }, { status: 500 });
      return Response.json({ ok: true, profile: data ?? null });
    },
    POST: async ({ request }) => {
      const token = bearerToken(request);
      if (!token) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
      const encryptionKey = process.env.PARTNER_PROGRAM_ENCRYPTION_KEY;
      if (!encryptionKey || encryptionKey.length < 16) return Response.json({ ok: false, error: "Configuração segura de pagamento indisponível." }, { status: 503 });
      const body = await request.json().catch(() => null) as any;
      const documentType = String(body?.documentType ?? "").toLowerCase();
      const document = String(body?.document ?? "").replace(/\s+/g, "").trim();
      const pixKeyType = String(body?.pixKeyType ?? "").toLowerCase();
      const pixKey = String(body?.pixKey ?? "").trim();
      const holderName = String(body?.holderName ?? "").trim();
      if (!["cpf","cnpj"].includes(documentType) || !["cpf","cnpj","email","phone","random"].includes(pixKeyType)) return Response.json({ ok: false, error: "Tipo de documento ou PIX inválido." }, { status: 400 });
      if (document.length < 5 || pixKey.length < 3 || holderName.length < 2) return Response.json({ ok: false, error: "Dados de pagamento inválidos." }, { status: 400 });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      const userId = authData.user?.id;
      if (authError || !userId) return Response.json({ ok: false, error: "Sessão inválida." }, { status: 401 });
      const denied = await checkSessionSecurity(token);
      if (denied) return denied;
      const { data, error } = await (supabaseAdmin as any).rpc("partner_program_set_payment_profile_service", {
        p_user_id: userId, p_document_type: documentType, p_document: document, p_pix_key_type: pixKeyType,
        p_pix_key: pixKey, p_holder_name: holderName, p_encryption_key: encryptionKey,
      });
      if (error) return Response.json({ ok: false, error: "Não foi possível salvar os dados de pagamento." }, { status: 500 });
      return Response.json({ ok: true, profileId: data, verificationStatus: "pending" });
    },
  } },
});
