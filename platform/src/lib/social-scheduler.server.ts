import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publishSocialPostOperational } from "@/lib/social-publisher.ops.server";
import {
  clampSchedulerLimit,
  nextRetryAt,
  normalizePublishError,
  shouldRetry,
  SOCIAL_PUBLISH_MAX_ATTEMPTS,
} from "@/lib/social-scheduler.core";

type Admin = SupabaseClient<Database>;

type DuePost = {
  id: string;
  publish_attempts: number | null;
  max_publish_attempts: number | null;
};

export type SocialSchedulerResult = {
  scanned: number;
  claimed: number;
  published: number;
  retried: number;
  failed: number;
  skipped: number;
  errors: Array<{ postId: string; error: string }>;
};

async function requeueOrFail(
  admin: Admin,
  post: DuePost,
  attempts: number,
  error: unknown,
  now: Date,
) {
  const message = normalizePublishError(error);
  const maxAttempts = post.max_publish_attempts ?? SOCIAL_PUBLISH_MAX_ATTEMPTS;
  const retry = shouldRetry({ attempts, maxAttempts });
  const patch = retry
    ? {
        status: "scheduled",
        next_publish_attempt_at: nextRetryAt(now, attempts),
        last_publish_attempt_at: now.toISOString(),
        last_error: message,
        failed_at: null,
      }
    : {
        status: "failed",
        next_publish_attempt_at: null,
        last_publish_attempt_at: now.toISOString(),
        last_error: message,
        failed_at: now.toISOString(),
      };
  const { error: updateError } = await admin
    .from("social_posts")
    .update(patch as never)
    .eq("id", post.id);
  if (updateError) {
    throw new Error(`Falha ao persistir retry do post ${post.id}: ${updateError.message}`);
  }
  return { retry, message };
}

export async function runSocialScheduler(
  admin: Admin,
  options: { now?: Date; limit?: number } = {},
): Promise<SocialSchedulerResult> {
  const now = options.now ?? new Date();
  const limit = clampSchedulerLimit(options.limit);
  const result: SocialSchedulerResult = {
    scanned: 0,
    claimed: 0,
    published: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await admin
    .from("social_posts")
    .select("id,publish_attempts,max_publish_attempts")
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .or(`next_publish_attempt_at.is.null,next_publish_attempt_at.lte.${now.toISOString()}`)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Falha ao buscar posts agendados: ${error.message}`);
  const posts = (data ?? []) as unknown as DuePost[];
  result.scanned = posts.length;

  for (const post of posts) {
    const attempts = (post.publish_attempts ?? 0) + 1;
    const { data: claimed, error: claimError } = await admin
      .from("social_posts")
      .update({
        status: "publishing",
        publish_attempts: attempts,
        last_publish_attempt_at: now.toISOString(),
        next_publish_attempt_at: null,
        failed_at: null,
      } as never)
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (claimError) {
      result.failed += 1;
      result.errors.push({ postId: post.id, error: normalizePublishError(claimError) });
      continue;
    }
    if (!claimed) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    try {
      const publication = await publishSocialPostOperational(admin, post.id);
      if (!publication.ok) {
        const failures = publication.results
          .filter((item) => !item.ok)
          .map((item) => item.error)
          .filter(Boolean);
        throw new Error(failures.join(" | ") || "Uma ou mais redes falharam na publicação.");
      }
      const { error: doneError } = await admin
        .from("social_posts")
        .update({
          status: "published",
          published_at: now.toISOString(),
          last_error: null,
          next_publish_attempt_at: null,
          failed_at: null,
        } as never)
        .eq("id", post.id);
      if (doneError) throw doneError;
      result.published += 1;
    } catch (error) {
      try {
        const state = await requeueOrFail(admin, post, attempts, error, now);
        if (state.retry) result.retried += 1;
        else result.failed += 1;
        result.errors.push({ postId: post.id, error: state.message });
      } catch (persistError) {
        result.failed += 1;
        result.errors.push({ postId: post.id, error: normalizePublishError(persistError) });
      }
    }
  }

  return result;
}
