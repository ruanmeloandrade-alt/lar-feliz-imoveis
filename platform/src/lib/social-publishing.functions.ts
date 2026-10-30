import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualRetryPostPatch } from "@/lib/social-scheduler.core";

const RetrySchema = z.object({
  postId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export const retrySocialPostNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => RetrySchema.parse(value))
  .handler(async ({ data, context }) => {
    const { data: owned, error: ownershipError } = await context.supabase
      .from("social_posts")
      .select("id,status")
      .eq("id", data.postId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (ownershipError || !owned) throw new Error("Post não encontrado neste workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishSocialPostOperational } = await import("@/lib/social-publisher.ops.server");
    const now = new Date();

    const { error: resetError } = await supabaseAdmin
      .from("social_posts")
      .update(manualRetryPostPatch(now) as never)
      .eq("id", data.postId)
      .eq("workspace_id", data.workspaceId);
    if (resetError) throw new Error(resetError.message);

    // Apenas canais ainda não publicados voltam para pending. Canais publicados mantêm
    // platform_ref/published_at e serão ignorados pelo publisher, evitando duplicação.
    const { error: channelResetError } = await supabaseAdmin
      .from("social_post_channels")
      .update({ status: "pending", last_error: null } as never)
      .eq("post_id", data.postId)
      .eq("workspace_id", data.workspaceId)
      .neq("status", "published");
    if (channelResetError) throw new Error(channelResetError.message);

    const result = await publishSocialPostOperational(supabaseAdmin, data.postId);
    if (!result.ok) {
      const message =
        result.results
          .filter((item) => !item.ok)
          .map((item) => item.error)
          .filter(Boolean)
          .join(" | ") || "Uma ou mais redes falharam na publicação.";
      await supabaseAdmin
        .from("social_posts")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          last_error: message,
        } as never)
        .eq("id", data.postId);
    }
    return result;
  });
