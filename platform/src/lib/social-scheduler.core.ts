export const SOCIAL_PUBLISH_MAX_ATTEMPTS = 4;
export const SOCIAL_SCHEDULER_DEFAULT_LIMIT = 25;
export const SOCIAL_SCHEDULER_MAX_LIMIT = 100;

export type SocialPublishAttemptState = {
  attempts: number;
  maxAttempts?: number | null;
};

export type SocialChannelPublishState = {
  status: string;
};

export type SocialOperationalStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "retry_wait"
  | "failed";

export function clampSchedulerLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return SOCIAL_SCHEDULER_DEFAULT_LIMIT;
  return Math.min(SOCIAL_SCHEDULER_MAX_LIMIT, Math.max(1, Math.trunc(value!)));
}

export function retryDelayMs(attempts: number): number {
  const safeAttempt = Math.max(1, Math.trunc(attempts));
  return Math.min(60 * 60 * 1000, 60_000 * 2 ** (safeAttempt - 1));
}

export function nextRetryAt(now: Date, attempts: number): string {
  return new Date(now.getTime() + retryDelayMs(attempts)).toISOString();
}

export function shouldRetry(state: SocialPublishAttemptState): boolean {
  const maxAttempts = state.maxAttempts ?? SOCIAL_PUBLISH_MAX_ATTEMPTS;
  return state.attempts < maxAttempts;
}

export function normalizePublishError(error: unknown, maxLength = 1000): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "Falha desconhecida na publicação.");
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLength) || "Falha desconhecida na publicação.";
}

export function schedulerSecretMatches(
  expected: string | undefined,
  provided: string | null,
): boolean {
  if (!expected || !provided || expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

export function pendingPublishChannels<T extends SocialChannelPublishState>(channels: T[]): T[] {
  return channels.filter((channel) => channel.status !== "published");
}

export function allPublishChannelsSucceeded(channels: SocialChannelPublishState[]): boolean {
  return channels.length > 0 && channels.every((channel) => channel.status === "published");
}

export function resolveOperationalStatus(input: {
  status: string;
  nextAttemptAt?: string | null;
}): SocialOperationalStatus {
  if (input.status === "published") return "published";
  if (input.status === "publishing") return "publishing";
  if (input.status === "failed") return "failed";
  if (input.status === "scheduled" && input.nextAttemptAt) return "retry_wait";
  return "scheduled";
}

export function operationalStatusLabel(status: SocialOperationalStatus): string {
  const labels: Record<SocialOperationalStatus, string> = {
    scheduled: "Agendado",
    publishing: "Publicando",
    published: "Publicado",
    retry_wait: "Aguardando nova tentativa",
    failed: "Falhou",
  };
  return labels[status];
}

export function manualRetryPostPatch(now: Date) {
  return {
    status: "publishing" as const,
    publish_attempts: 1,
    last_publish_attempt_at: now.toISOString(),
    next_publish_attempt_at: null,
    last_error: null,
    failed_at: null,
    published_at: null,
  };
}
