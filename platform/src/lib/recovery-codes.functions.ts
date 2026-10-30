import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// No recovery codes are generated while their recovery flow is unavailable.
const unavailable = () => { throw new Error('Códigos de recuperação indisponíveis nesta versão.'); };
export const getRecoveryCodesStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ remaining: number; total: number; createdAt: string | null }> => unavailable());
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ codes: string[] }> => unavailable());
