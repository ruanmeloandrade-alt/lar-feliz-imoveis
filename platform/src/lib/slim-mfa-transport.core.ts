/** Bounds only explicit native MFA requests. No token, code or secret is persisted. */
export type SlimMfaIdentity = { actorId: string; sessionId: string };
type Scope = SlimMfaIdentity & { signal: AbortSignal; current: () => boolean; deadline: number; paths: Set<string> };
let active: Scope | null = null;
export class SlimMfaTransportError extends Error {
  constructor(public code: 'MFA_TIMEOUT' | 'MFA_CONTEXT' | 'MFA_BUSY' | 'MFA_RESPONSE') { super(code); }
}
export function slimMfaTokenIdentity(token: unknown): SlimMfaIdentity {
  try {
    if (typeof token !== 'string') throw 0;
    const body = token.split('.')[1];
    const value = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
    if (!uuid.test(value.sub) || !uuid.test(value.session_id)) throw 0;
    // Correlation only: Supabase validates the JWT and owns authorization.
    return { actorId: value.sub, sessionId: value.session_id };
  } catch { throw new SlimMfaTransportError('MFA_CONTEXT'); }
}
export function beginSlimMfaTransport(scope: Omit<Scope, 'paths'> & { paths: string[] }): () => void {
  if (active) throw new SlimMfaTransportError('MFA_BUSY');
  const value = { ...scope, paths: new Set(scope.paths) };
  active = value;
  return () => { if (active === value) active = null; };
}
export async function fetchSlimMfaWithDeadline(input: RequestInfo | URL, init: RequestInit | undefined, send: typeof fetch = fetch): Promise<Response> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input));
  const path = url.pathname.match(/\/auth\/v1(\/factors(?:\/[^/]+(?:\/(?:challenge|verify))?)?)$/)?.[1];
  if (!path) return send(input, init);
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  if (method === 'GET') return send(input, init);
  const scope = active;
  if (!scope) throw new SlimMfaTransportError('MFA_CONTEXT');
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
  const identity = slimMfaTokenIdentity(headers.get('Authorization')?.replace(/^Bearer\s+/i, ''));
  const check = () => {
    if (scope.signal.aborted || Date.now() >= scope.deadline) throw new SlimMfaTransportError('MFA_TIMEOUT');
    if (!scope.current() || identity.actorId !== scope.actorId || identity.sessionId !== scope.sessionId || !scope.paths.has(`${method} ${path}`)) throw new SlimMfaTransportError('MFA_CONTEXT');
  };
  check();
  const controller = new AbortController();
  const signals = [scope.signal, init?.signal, request?.signal].filter((s): s is AbortSignal => Boolean(s));
  const abort = () => controller.abort();
  signals.forEach(s => { if (s.aborted) abort(); else s.addEventListener('abort', abort, { once: true }); });
  const timer = setTimeout(abort, Math.min(8_000, scope.deadline - Date.now()));
  try {
    const response = await send(input, { ...init, headers, signal: controller.signal });
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try { while (true) { check(); const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 131_072) throw new SlimMfaTransportError('MFA_RESPONSE'); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => {}); }
    }
    check();
    if (controller.signal.aborted) throw new SlimMfaTransportError('MFA_TIMEOUT');
    const bytes = new Uint8Array(size); let offset = 0;
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    // verify() saves the returned session inside the SDK. Validate its actor before
    // handing the body to that method, not after the SDK has already saved it.
    if (response.ok && method === 'POST' && path.endsWith('/verify')) {
      try {
        const verified = JSON.parse(new TextDecoder().decode(bytes));
        if (verified.user?.id !== scope.actorId || slimMfaTokenIdentity(verified.access_token).actorId !== scope.actorId) throw 0;
      } catch { throw new SlimMfaTransportError('MFA_RESPONSE'); }
    }
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding'); responseHeaders.delete('content-length');
    return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch (error) {
    if (controller.signal.aborted) throw new SlimMfaTransportError('MFA_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); signals.forEach(s => s.removeEventListener('abort', abort)); }
}
