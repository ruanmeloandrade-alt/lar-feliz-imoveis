import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSlimMfaSnapshot } from './slim-mfa.core';

export type MfaStatus = {
  emailEnabled: boolean;
  emailVerifiedAt: string | null;
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  email: string | null;
  /** Central de e-mail do workspace configurada (necessária para enviar o código). */
  emailSenderReady: boolean;
  source: 'native';
  currentLevel: 'aal1' | 'aal2';
  unavailableMethods: string[];
};

/** Situação atual da verificação em duas etapas do usuário. */
export const getMfaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MfaStatus> => {
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data?.user) throw new Error('Não foi possível confirmar os autenticadores da conta.');
    const claims = context.claims as { aal?: string };
    const status = normalizeSlimMfaSnapshot(data.user, { currentLevel: claims.aal ?? 'aal1' }, context.userId);
    return {
      emailEnabled: false, emailVerifiedAt: null,
      totpEnabled: status.factors.some(factor => factor.status === 'verified'),
      passkeyEnabled: false, email: data.user.email ?? null, emailSenderReady: false,
      source: 'native', currentLevel: status.currentLevel,
      unavailableMethods: ['email', 'sms', 'passkey', 'recovery_codes'],
    };
  });

/** Compatibility endpoints stay closed until a complete native method exists. */
const unavailable = () => ({ ok: false as const, error: 'Este método está indisponível. Use o aplicativo autenticador nas configurações de Segurança.' });

export const sendEmailMfaCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => unavailable());

export const verifyEmailMfaCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(d))
  .handler(async () => unavailable());

export const setMfaMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ method: z.enum(["email", "totp", "passkey"]), enabled: z.boolean() }).parse(d))
  .handler(async () => unavailable());
