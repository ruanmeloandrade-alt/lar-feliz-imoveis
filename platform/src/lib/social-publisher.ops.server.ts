import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publishSocialPost } from "@/lib/social-publisher.server";
import { normalizePublishError } from "@/lib/social-scheduler.core";

type Admin = SupabaseClient<Database>;

export type OperationalPublishResult = Awaited<ReturnType<typeof publishSocialPost>> & {
  partial: boolean;
  failedChannels: number;
  publishedChannels: number;
};

export async function publishSocialPostOperational(
  admin: Admin,
  postId: string,
): Promise<OperationalPublishResult> {
  const result = await publishSocialPost(admin, postId);
  const failed = result.results.filter((item) => !item.ok);
  const published = result.results.filter((item) => item.ok);
  const partial = failed.length > 0 && published.length > 0;

  if (!result.ok) {
    const error = normalizePublishError(
      failed
        .map((item) => item.error)
        .filter(Boolean)
        .join(" | ") || "Uma ou mais redes falharam na publicação.",
    );

    // O publisher legado marca sucesso parcial como published. Corrigimos o agregado
    // imediatamente; o scheduler pode então reagendar sem duplicar os canais já publicados.
    const { error: updateError } = await admin
      .from("social_posts")
      .update({
        status: "failed",
        published_at: null,
        last_error: error,
      } as never)
      .eq("id", postId);
    if (updateError) {
      throw new Error(
        `Falha ao corrigir estado agregado do post ${postId}: ${updateError.message}`,
      );
    }
  }

  return {
    ...result,
    partial,
    failedChannels: failed.length,
    publishedChannels: published.length,
  };
}
