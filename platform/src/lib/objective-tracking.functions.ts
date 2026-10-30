import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadObjectiveTrackingOptions } from "@/lib/objective-tracking.server";

export const listObjectiveTrackingOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    loadObjectiveTrackingOptions(context.supabase as never, data.workspaceId, context.userId),
  );