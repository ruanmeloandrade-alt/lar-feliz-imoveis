import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LOGIN_EMAIL_MAX_LENGTH,
  emailChangeErrorMessage,
  normalizeLoginEmail,
  sameLoginEmail,
} from "@/lib/account-email.core";

const ChangeMyEmailSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(LOGIN_EMAIL_MAX_LENGTH),
});

/**
 * Troca o e-mail de login da própria sessão autenticada.
 *
 * O userId nunca vem do cliente: ele é derivado por requireSupabaseAuth.
 * A operação administrativa fica exclusivamente no servidor e confirma o
 * novo e-mail na mesma gravação, portanto não depende do fluxo de OTP/link.
 */
export const changeMyLoginEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChangeMyEmailSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = normalizeLoginEmail(data.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const current = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (current.error || !current.data.user) {
      throw new Error("Não foi possível validar a conta atual.");
    }

    if (sameLoginEmail(current.data.user.email, email)) {
      throw new Error("O novo e-mail precisa ser diferente do e-mail atual.");
    }

    const result = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email,
      email_confirm: true,
    });

    if (result.error) {
      throw new Error(emailChangeErrorMessage(result.error.message || result.error));
    }

    const savedEmail = normalizeLoginEmail(result.data.user?.email ?? "");
    if (!savedEmail || savedEmail !== email) {
      throw new Error("O servidor não confirmou a gravação do novo e-mail.");
    }

    return { ok: true as const, email: savedEmail };
  });
