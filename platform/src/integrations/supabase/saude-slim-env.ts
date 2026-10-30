const FORBIDDEN_SUPABASE_PROJECT_REFS = new Set([
  "wqriaxzymngkntccljjp",
  "xmoiyffwmolwmjzeuqjf",
  "vyzvfcgpjjzvcjegzzza",
]);

export const SAUDE_SLIM_SUPABASE_REF = "fnuhmypmhcwecziswbat" as const;
export const SAUDE_SLIM_SUPABASE_URL = `https://${SAUDE_SLIM_SUPABASE_REF}.supabase.co` as const;

type SupabaseEnvSource = "browser" | "server" | "server-admin";

export type SaudeSlimSupabaseEnv = {
  projectId: string;
  url: string;
  publishableKey?: string;
  serviceRoleKey?: string;
};

function runtimeEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env?.[key];
}

function viteEnv(key: string): string | undefined {
  return import.meta.env?.[key];
}

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function projectRefFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const [projectRef] = url.hostname.split(".");
    if (!url.hostname.endsWith(".supabase.co") || !projectRef) return null;
    return projectRef;
  } catch {
    return null;
  }
}

function assertSaudeSlimSupabaseEnv(env: Partial<SaudeSlimSupabaseEnv>, source: SupabaseEnvSource) {
  const missing = [
    !env.projectId ? (source === "browser" ? "VITE_SUPABASE_PROJECT_ID" : "SUPABASE_PROJECT_ID") : "",
    !env.url ? (source === "browser" ? "VITE_SUPABASE_URL" : "SUPABASE_URL") : "",
    source !== "server-admin" && !env.publishableKey
      ? (source === "browser" ? "VITE_SUPABASE_PUBLISHABLE_KEY" : "SUPABASE_PUBLISHABLE_KEY")
      : "",
    source === "server-admin" && !env.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `[Vanessa Simoni Supabase] Missing required environment variable(s): ${missing.join(
        ", ",
      )}. Configure an exclusive Vanessa Simoni Supabase project before running the backend.`,
    );
  }

  if (!env.projectId || !env.url) {
    throw new Error("[Vanessa Simoni Supabase] Invalid Supabase environment.");
  }

  const projectId = env.projectId.trim();
  const urlProjectRef = projectRefFromUrl(env.url);

  if (!urlProjectRef) {
    throw new Error("[Vanessa Simoni Supabase] SUPABASE_URL must be a valid https://<project-ref>.supabase.co URL.");
  }

  const forbiddenRef = [projectId, urlProjectRef].find((value) => FORBIDDEN_SUPABASE_PROJECT_REFS.has(value));
  if (forbiddenRef) {
    throw new Error(
      `[Vanessa Simoni Supabase] Refusing to use inherited Supabase project "${forbiddenRef}". Configure a project dedicated to Vanessa Simoni.`,
    );
  }

  if (projectId !== urlProjectRef) {
    throw new Error(
      `[Vanessa Simoni Supabase] SUPABASE_PROJECT_ID (${projectId}) does not match SUPABASE_URL project ref (${urlProjectRef}).`,
    );
  }

  if (projectId !== SAUDE_SLIM_SUPABASE_REF || env.url !== SAUDE_SLIM_SUPABASE_URL) {
    throw new Error("[Vanessa Simoni Supabase] Refusing non-Vanessa Simoni Supabase project.");
  }

  if (source !== "server-admin" && !env.publishableKey?.startsWith("sb_publishable_")) {
    throw new Error("[Vanessa Simoni Supabase] Public clients require the Vanessa Simoni sb_publishable_ key.");
  }

  if (source === "server-admin" && env.serviceRoleKey?.startsWith("sb_publishable_")) {
    throw new Error("[Vanessa Simoni Supabase] Admin clients require a server-side service role key.");
  }
}

export function resolveBrowserSupabaseEnv(): Required<Pick<SaudeSlimSupabaseEnv, "projectId" | "url" | "publishableKey">> {
  const env = {
    projectId: present(viteEnv("VITE_SUPABASE_PROJECT_ID")),
    url: present(viteEnv("VITE_SUPABASE_URL")),
    publishableKey: present(viteEnv("VITE_SUPABASE_PUBLISHABLE_KEY")),
  };
  assertSaudeSlimSupabaseEnv(env, "browser");
  return env as Required<Pick<SaudeSlimSupabaseEnv, "projectId" | "url" | "publishableKey">>;
}

export function resolveServerSupabaseEnv(): Required<Pick<SaudeSlimSupabaseEnv, "projectId" | "url" | "publishableKey">> {
  const env = {
    projectId: present(runtimeEnv("SUPABASE_PROJECT_ID")),
    url: present(runtimeEnv("SUPABASE_URL")),
    publishableKey: present(runtimeEnv("SUPABASE_PUBLISHABLE_KEY")),
  };
  assertSaudeSlimSupabaseEnv(env, "server");
  return env as Required<Pick<SaudeSlimSupabaseEnv, "projectId" | "url" | "publishableKey">>;
}

export function resolveServerSupabaseAdminEnv(): Required<Pick<SaudeSlimSupabaseEnv, "projectId" | "url" | "serviceRoleKey">> {
  const env = {
    projectId: present(runtimeEnv("SUPABASE_PROJECT_ID")),
    url: present(runtimeEnv("SUPABASE_URL")),
    serviceRoleKey: present(runtimeEnv("SUPABASE_SERVICE_ROLE_KEY")),
  };
  assertSaudeSlimSupabaseEnv(env, "server-admin");
  return env as Required<Pick<SaudeSlimSupabaseEnv, "projectId" | "url" | "serviceRoleKey">>;
}

export function resolvePublicAppUrl(): string {
  const raw = present(runtimeEnv("PUBLIC_APP_URL")) ?? present(runtimeEnv("APP_PUBLIC_URL"));
  if (!raw) {
    throw new Error("[Vanessa Simoni] PUBLIC_APP_URL or APP_PUBLIC_URL must be configured.");
  }

  const url = new URL(raw);
  if (url.hostname === "mkton.io" || url.hostname.endsWith(".lovable.app")) {
    throw new Error("[Vanessa Simoni] Refusing inherited public app URL. Configure the Vanessa Simoni public URL.");
  }

  return url.toString().replace(/\/+$/, "");
}
