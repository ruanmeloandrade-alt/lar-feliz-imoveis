export type SlimPasswordChangeInput = { expectedActorId: string; expectedSessionId: string; password: string };
export type SlimPasswordUpdateResult = {
  version: 1; status: 'confirmed' | 'rejected' | 'uncertain'; actorId: string; sessionId: string;
  code: 'PASSWORD_UPDATED' | 'PASSWORD_REJECTED' | 'PASSWORD_REAUTH_REQUIRED' | 'PASSWORD_UPDATE_UNCERTAIN'; message: string;
};
export const SLIM_PASSWORD_UPDATE_TIMEOUT_MS = 8_000;
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function validateSlimPasswordChangeInput(value: unknown): SlimPasswordChangeInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Confira os dados da alteração de senha.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['expectedActorId', 'expectedSessionId', 'password'].includes(key)) || typeof row.expectedActorId !== 'string' || !uuid.test(row.expectedActorId) || typeof row.expectedSessionId !== 'string' || !uuid.test(row.expectedSessionId)) throw new Error('A conta ou sessão não foi identificada. Atualize a página antes de alterar a senha.');
  if (typeof row.password !== 'string' || row.password.length < 8 || row.password.length > 128) throw new Error('A nova senha deve ter entre 8 e 128 caracteres.');
  return { expectedActorId: row.expectedActorId.toLowerCase(), expectedSessionId: row.expectedSessionId.toLowerCase(), password: row.password };
}
export function assertSlimPasswordContext(input: SlimPasswordChangeInput, userId: unknown, claims: unknown): void {
  const row = claims && typeof claims === 'object' ? claims as { sub?: unknown; session_id?: unknown } : null;
  if (typeof userId !== 'string' || userId.toLowerCase() !== input.expectedActorId || typeof row?.sub !== 'string' || row.sub.toLowerCase() !== input.expectedActorId || typeof row.session_id !== 'string' || row.session_id.toLowerCase() !== input.expectedSessionId) throw new Error('A conta ou sessão mudou. Atualize a página antes de alterar a senha.');
}

/** Native update of the JWT owner only. No administrative credential or retry. */
export async function updateSlimPasswordNative(
  options: { url: string; publishableKey: string; token: string; change: SlimPasswordChangeInput },
  sender: typeof fetch = fetch,
): Promise<SlimPasswordUpdateResult> {
  const change = validateSlimPasswordChangeInput(options.change);
  if (!options.publishableKey.startsWith('sb_publishable_') || !options.token || /\s/.test(options.token)) throw new Error('A autenticação da conta está indisponível. Entre novamente.');
  const origin = new URL(options.url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('O serviço de autenticação está indisponível.');
  const identity = { version: 1 as const, actorId: change.expectedActorId, sessionId: change.expectedSessionId };
  const uncertain = (): SlimPasswordUpdateResult => ({ ...identity, status: 'uncertain', code: 'PASSWORD_UPDATE_UNCERTAIN', message: 'Não foi possível confirmar a alteração. A senha pode ter sido atualizada. Não envie novamente automaticamente; confira o acesso antes de decidir uma nova alteração.' });
  const controller = new AbortController(), deadline = Date.now() + SLIM_PASSWORD_UPDATE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, SLIM_PASSWORD_UPDATE_TIMEOUT_MS); });
  const work = async (): Promise<SlimPasswordUpdateResult> => {
    const response = await sender(new URL('/auth/v1/user', origin).href, {
      method: 'PUT', headers: { apikey: options.publishableKey, Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: change.password }), signal: controller.signal, redirect: 'error', cache: 'no-store',
    });
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 131_072 || controller.signal.aborted || Date.now() >= deadline) throw new Error('unconfirmed'); chunks.push(part.value); }
    } finally { if (reader) void reader.cancel().catch(() => {}); }
    if (controller.signal.aborted || Date.now() >= deadline) return uncertain();
    const bytes = new Uint8Array(size); let offset = 0; chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== 'object' || Array.isArray(body)) return uncertain(); }
    catch { return uncertain(); }
    if (!response.ok) {
      if (response.status < 400 || response.status >= 500 || response.status === 408) return uncertain();
      const nativeCode = typeof body.code === 'string' ? body.code : body.error_code;
      if (nativeCode === 'reauthentication_needed' || nativeCode === 'reauthentication_not_valid') return { ...identity, status: 'rejected', code: 'PASSWORD_REAUTH_REQUIRED', message: 'O serviço exige uma autenticação recente. Entre novamente antes de alterar a senha.' };
      const message = nativeCode === 'weak_password' ? 'A nova senha não atende aos requisitos do serviço. Escolha uma senha mais forte.' : nativeCode === 'same_password' ? 'Escolha uma senha diferente da atual.' : response.status === 429 ? 'O serviço limitou novas tentativas. Aguarde antes de tentar novamente.' : 'O serviço recusou a alteração da senha. Confira sua sessão e os requisitos da nova senha.';
      return { ...identity, status: 'rejected', code: 'PASSWORD_REJECTED', message };
    }
    const user = body.user && typeof body.user === 'object' ? body.user as { id?: unknown } : body;
    if (typeof user.id !== 'string' || user.id.toLowerCase() !== change.expectedActorId) return uncertain();
    return { ...identity, status: 'confirmed', code: 'PASSWORD_UPDATED', message: 'A alteração da senha desta conta foi confirmada.' };
  };
  try { const result = await Promise.race([work(), timeout]); return controller.signal.aborted || Date.now() >= deadline ? uncertain() : result; }
  catch { controller.abort(); return uncertain(); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
