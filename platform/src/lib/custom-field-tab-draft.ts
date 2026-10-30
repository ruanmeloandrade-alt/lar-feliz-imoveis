// sessionStorage belongs to this tab. Definitions only; no lead values or tokens.
export function customFieldDraftKey(actorId?: string, workspaceId?: string, target?: string): string | null {
  return actorId && workspaceId && target
    ? `slim:custom-field-draft:${actorId}:${workspaceId}:${target}` : null;
}

export function readCustomFieldDraft<T>(key: string | null, fallback: T): T {
  if (!key || typeof sessionStorage === "undefined") return fallback;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const validShape = saved?.value && typeof saved.value === "object" && !Array.isArray(saved.value)
      && (!fallback || Object.entries(fallback).every(([name, value]) => Array.isArray(value)
        ? Array.isArray(saved.value[name]) : typeof saved.value[name] === typeof value));
    if (saved?.version === 1 && validShape && Date.now() - saved.at < 86_400_000) return saved.value as T;
  } catch { /* An unavailable tab store must not block editing. */ }
  return fallback;
}

export function writeCustomFieldDraft(key: string | null, value: unknown): void {
  if (!key || typeof sessionStorage === "undefined") return;
  try { sessionStorage.setItem(key, JSON.stringify({ version: 1, at: Date.now(), value })); } catch { /* Keep the in-memory draft. */ }
}

export function clearCustomFieldDraft(key: string | null): void {
  if (!key || typeof sessionStorage === "undefined") return;
  try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
}
