import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncSessionGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid(), sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { syncSlimSessionGroups } = await import("./slim-group-sync.server");
    return syncSlimSessionGroups(context.supabase as any, data, context.userId);
  });
