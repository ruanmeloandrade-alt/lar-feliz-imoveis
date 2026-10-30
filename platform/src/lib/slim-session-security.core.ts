/** Session authorization only. The RPC derives its identity from the caller JWT. */
export const SLIM_SESSION_SECURITY_TIMEOUT_MS = 8_000;
export type SlimSessionSecurityCode = 'SLIM_MFA_REQUIRED' | 'SLIM_SESSION_INVALID' | 'SLIM_SECURITY_UNAVAILABLE';
type RpcResult = { data: unknown; error: unknown };
type RpcQuery = PromiseLike<RpcResult> & { abortSignal(signal: AbortSignal): RpcQuery; retry(enabled: false): RpcQuery };
export type SlimSessionSecurityClient = { rpc: unknown };

const messages: Record<SlimSessionSecurityCode, string> = {
  SLIM_MFA_REQUIRED: 'Confirme o código do seu autenticador para continuar.',
  SLIM_SESSION_INVALID: 'Esta sessão não está mais válida. Entre novamente para continuar.',
  SLIM_SECURITY_UNAVAILABLE: 'Não foi possível confirmar a segurança desta sessão. Consulte novamente em instantes.',
};
export class SlimSessionSecurityError extends Error {
  readonly code: SlimSessionSecurityCode;
  constructor(code: SlimSessionSecurityCode) { super(messages[code]); this.name = 'SlimSessionSecurityError'; this.code = code; }
}
function denied(error: unknown): SlimSessionSecurityError {
  const value = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : null;
  if (value?.code === '42501' && (value.message === 'SLIM_MFA_REQUIRED' || value.message === 'SLIM_SESSION_INVALID')) return new SlimSessionSecurityError(value.message);
  return new SlimSessionSecurityError('SLIM_SECURITY_UNAVAILABLE');
}

export async function assertSlimSessionSecurity(caller: SlimSessionSecurityClient): Promise<true> {
  const controller = new AbortController();
  const deadline = Date.now() + SLIM_SESSION_SECURITY_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new SlimSessionSecurityError('SLIM_SECURITY_UNAVAILABLE')); }, SLIM_SESSION_SECURITY_TIMEOUT_MS);
  });
  try {
    if (typeof caller?.rpc !== 'function') throw new SlimSessionSecurityError('SLIM_SECURITY_UNAVAILABLE');
    const query = (caller as { rpc(name: 'slim_assert_session_security'): RpcQuery }).rpc('slim_assert_session_security').abortSignal(controller.signal).retry(false);
    const result = await Promise.race([Promise.resolve(query), timeout]);
    if (controller.signal.aborted || Date.now() >= deadline) throw new SlimSessionSecurityError('SLIM_SECURITY_UNAVAILABLE');
    if (result?.error) throw denied(result.error);
    if (result?.data !== true) throw new SlimSessionSecurityError('SLIM_SECURITY_UNAVAILABLE');
    return true;
  } catch (error) {
    if (error instanceof SlimSessionSecurityError) throw error;
    throw denied(error);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Only allowlisted messages/codes reach an HTTP response. */
export function slimSessionSecurityResponse(error: unknown): Response {
  const safe = error instanceof SlimSessionSecurityError ? error : new SlimSessionSecurityError('SLIM_SECURITY_UNAVAILABLE');
  const status = safe.code === 'SLIM_MFA_REQUIRED' ? 403 : safe.code === 'SLIM_SESSION_INVALID' ? 401 : 503;
  return Response.json({ ok: false, code: safe.code, error: safe.message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
