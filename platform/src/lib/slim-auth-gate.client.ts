import { supabase } from '@/integrations/supabase/client';
import { createSlimAuthGateController } from './slim-auth-gate.core';
import type { SlimMfaAuth } from './slim-mfa.core';
import { assertSlimSessionSecurity } from './slim-session-security.core';
export function createBrowserSlimAuthGateController() {
  return createSlimAuthGateController(supabase.auth as unknown as SlimMfaAuth, () => assertSlimSessionSecurity(supabase));
}
export async function exitSlimAuthGate() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error('Não foi possível sair desta sessão. Tente novamente.');
}
