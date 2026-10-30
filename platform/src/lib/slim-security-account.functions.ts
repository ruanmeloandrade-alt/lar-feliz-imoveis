import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { resolveServerSupabaseEnv } from '@/integrations/supabase/saude-slim-env';
import { assertSlimPasswordContext, updateSlimPasswordNative, validateSlimPasswordChangeInput } from './slim-password-update.core';

export const updateSlimAccountPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSlimPasswordChangeInput)
  .handler(async ({ data, context }) => {
    assertSlimPasswordContext(data, context.userId, context.claims);
    const auth = getRequest().headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i);
    if (!auth?.[1]) throw new Error('A sessão não está disponível. Entre novamente antes de alterar a senha.');
    let env: ReturnType<typeof resolveServerSupabaseEnv>;
    try { env = resolveServerSupabaseEnv(); }
    catch { throw new Error('O serviço de autenticação está indisponível. Tente novamente mais tarde.'); }
    return updateSlimPasswordNative({ url: env.url, publishableKey: env.publishableKey, token: auth[1], change: data });
  });
