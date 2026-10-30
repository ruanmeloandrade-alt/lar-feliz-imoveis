// Bounded AUTH transport only. No changes to customer, payments, Storage or REST writes.
// Password attempts never retry automatically; the user decides when to submit again.
export const SLIM_PASSWORD_LOGIN_DEADLINE_MS = 12_000;
export const SLIM_TOKEN_REFRESH_DEADLINE_MS = 20_000;
export type SlimAuthRequestKind = 'password' | 'refresh' | null;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

export function slimAuthRequestKind(input: RequestInfo | URL): SlimAuthRequestKind {
  try {
    const url = new URL(requestUrl(input));
    if (!url.pathname.endsWith('/auth/v1/token')) return null;
    const grant = url.searchParams.get('grant_type');
    return grant === 'password' ? 'password' : grant === 'refresh_token' ? 'refresh' : null;
  } catch {
    return null;
  }
}

export async function fetchSlimAuthWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  sender: typeof fetch = fetch,
  limits: {passwordMs?: number; refreshMs?: number} = {},
): Promise<Response> {
  const kind = slimAuthRequestKind(input);
  if (!kind) return sender(input, init);

  const timeoutMs = kind === 'password'
    ? (limits.passwordMs ?? SLIM_PASSWORD_LOGIN_DEADLINE_MS)
    : (limits.refreshMs ?? SLIM_TOKEN_REFRESH_DEADLINE_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Limite de autenticação inválido.');

  const controller = new AbortController();
  const upstream = [init?.signal, typeof Request !== 'undefined' && input instanceof Request ? input.signal : null]
    .filter((signal): signal is AbortSignal => Boolean(signal));
  const cancel = () => controller.abort();
  for (const signal of upstream) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', cancel, {once:true});
  }
  let expired = false;
  const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
  try {
    return await sender(input, {...init, signal:controller.signal});
  } catch (error) {
    if (expired && !upstream.some(signal => signal.aborted)) {
      throw new Error('Tempo limite para conectar à autenticação da Vanessa Simoni. O acesso não foi confirmado.', {cause:error});
    }
    throw error;
  } finally {
    clearTimeout(timer);
    for (const signal of upstream) signal.removeEventListener('abort', cancel);
  }
}

export function slimAuthFailureMessage(error: unknown): string {
  const err = error && typeof error === 'object'
    ? error as {message?:unknown;status?:unknown;code?:unknown;name?:unknown}
    : null;
  const message = typeof err?.message === 'string' ? err.message.trim() : '';
  const status = Number(err?.status);
  if (/invalid login credentials|e-mail ou senha inválidos/i.test(message)) return 'E-mail ou senha inválidos.';
  if (status === 429) return 'Muitas tentativas. Aguarde um momento antes de tentar novamente.';
  if ([502,503,504,522].includes(status) ||
      /(?:\b(?:502|503|504|522)\b|network|fetch failed|failed to fetch|connection|conexão|timeout|timed? out|tempo limite|abort|upstream|gateway)/i.test(message) ||
      err?.name === 'AuthRetryableFetchError') {
    return 'O serviço de autenticação da Vanessa Simoni está temporariamente indisponível. Não foi possível confirmar o acesso. Aguarde a recuperação da conexão e tente novamente.';
  }
  return message || 'Não foi possível autenticar. Tente novamente.';
}
