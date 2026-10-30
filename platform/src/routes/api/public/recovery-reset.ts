import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hashRecoveryCode, normalizeRecoveryCode } from "@/lib/recovery-codes-shared";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(32),
  password: z.string().min(8).max(200),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/recovery-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ error: "Dados inválidos." }, 400);
        }

        const email = parsed.email.trim().toLowerCase();
        const codeHash = await hashRecoveryCode(normalizeRecoveryCode(parsed.code), email);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row } = await supabaseAdmin
          .from("account_recovery_codes")
          .select("id, user_id")
          .eq("email", email)
          .eq("code_hash", codeHash)
          .is("used_at", null)
          .maybeSingle();

        if (!row) {
          return json({ error: "Código de recuperação inválido ou já utilizado." }, 401);
        }

        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
          password: parsed.password,
        });
        if (updErr) return json({ error: updErr.message }, 400);

        // Código é de uso único: some do sistema imediatamente.
        await supabaseAdmin.from("account_recovery_codes").delete().eq("id", row.id);

        return json({ ok: true });
      },
    },
  },
});
