import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { attachSupabaseAuth } from '@/integrations/supabase/auth-attacher';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Reads/reconstructs exactly one authorized attachment, only after the user's click. */
export const loadSlimGroupMessageMedia = createServerFn({ method: 'POST' })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    groupId: z.string().min(1).max(220),
    messageId: z.string().uuid(),
  }).strict().parse(value))
  .handler(async ({ data, context }): Promise<{ mediaUrl: string; mimeType: string | null }> => {
    const { loadSlimGroupMediaServer } = await import('./slim-group-media.server');
    // The generated Database type still lists the inherited schema/RPC names.
    return loadSlimGroupMediaServer(context.supabase as unknown as Parameters<typeof loadSlimGroupMediaServer>[0], context.userId, data);
  });
