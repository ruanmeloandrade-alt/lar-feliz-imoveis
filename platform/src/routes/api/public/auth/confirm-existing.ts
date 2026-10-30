import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";

const EMAIL_NOT_CONFIRMED = /email.*not.*confirm|confirm.*email/i;

function isEmailNotConfirmed(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "email_not_confirmed" || EMAIL_NOT_CONFIRMED.test(error?.message ?? "");
}

export const Route = createFileRoute("/api/public/auth/confirm-existing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
        const email = body?.email?.trim().toLowerCase() ?? "";
        const password = body?.password ?? "";

        if (!email || !email.includes("@") || !password) {
          return Response.json({ ok: false, error: "Credenciais inválidas." }, { status: 400 });
        }

        let supabaseEnv;
        try {
          supabaseEnv = resolveServerSupabaseEnv();
        } catch (error) {
          console.error("[auth-confirm-existing] Supabase public env unavailable");
          return Response.json({ ok: false, error: "Serviço de autenticação indisponível." }, { status: 503 });
        }

        const verifier = createClient(supabaseEnv.url, supabaseEnv.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        // This call must fail specifically because the email is unconfirmed. Invalid
        // credentials are never eligible for administrative confirmation.
        const { data: firstAttempt, error: firstError } = await verifier.auth.signInWithPassword({ email, password });
        if (!firstError && firstAttempt.session) {
          return Response.json({ ok: true, alreadyConfirmed: true });
        }
        if (!isEmailNotConfirmed(firstError)) {
          return Response.json({ ok: false, error: "E-mail ou senha inválidos." }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let userId: string | null = null;
        for (let page = 1; page <= 20 && !userId; page += 1) {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) {
            console.error("[auth-confirm-existing] listUsers", error.message);
            return Response.json({ ok: false, error: "Não foi possível validar a conta." }, { status: 500 });
          }
          const match = data.users.find((user) => user.email?.trim().toLowerCase() === email);
          if (match) userId = match.id;
          if (data.users.length < 1000) break;
        }

        if (!userId) {
          return Response.json({ ok: false, error: "E-mail ou senha inválidos." }, { status: 401 });
        }

        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
        if (confirmError) {
          console.error("[auth-confirm-existing] updateUserById", confirmError.message);
          return Response.json({ ok: false, error: "Não foi possível liberar esta conta." }, { status: 500 });
        }

        return Response.json({ ok: true, confirmed: true });
      },
    },
  },
});
