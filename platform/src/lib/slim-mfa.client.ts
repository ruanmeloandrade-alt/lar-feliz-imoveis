import { supabase } from '@/integrations/supabase/client';
import { createSlimMfaController, type SlimMfaAuth } from './slim-mfa.core';

export function createBrowserSlimMfaController() {
  return createSlimMfaController(supabase.auth as unknown as SlimMfaAuth);
}
