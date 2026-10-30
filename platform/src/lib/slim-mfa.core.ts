import { beginSlimMfaTransport, slimMfaTokenIdentity, type SlimMfaIdentity } from './slim-mfa-transport.core.ts';

export type SlimMfaFactor = { id: string; name: string; status: 'verified' | 'unverified' };
export type SlimMfaSnapshot = { actorId: string; factors: SlimMfaFactor[]; currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2'; verifiedCount: number };
export type SlimMfaEnrollment = { factorId: string; qr: string; secret: string };
export type SlimMfaPending = { kind: 'enroll' | 'verify' | 'remove'; factorId: string | null };
export type SlimMfaState = { actorId: string | null; phase: 'loading' | 'ready' | 'working' | 'uncertain' | 'unavailable' | 'signed_out'; snapshot: SlimMfaSnapshot | null; enrollment: SlimMfaEnrollment | null; pending: SlimMfaPending | null; message: string };
type NativeResult = { data: any; error?: any };
export type SlimMfaAuth = {
  getSession(): Promise<NativeResult>; getUser(jwt?: string): Promise<NativeResult>;
  onAuthStateChange(callback: (event: string, session: any) => void): { data: { subscription: { unsubscribe(): void } } };
  mfa: { getAuthenticatorAssuranceLevel(jwt?: string): Promise<NativeResult>; enroll(input: any): Promise<NativeResult>; challenge(input: any): Promise<NativeResult>; verify(input: any): Promise<NativeResult>; unenroll(input: any): Promise<NativeResult> };
};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export class SlimMfaError extends Error {
  constructor(public code: string, public known = true) { super(code); }
}
const invalid = () => new SlimMfaError('MFA_RESPONSE', false);
function checked(result: NativeResult) { if (result?.error) throw result.error; if (!result?.data) throw invalid(); return result.data; }
export function normalizeSlimMfaSnapshot(user: any, aal: any, expectedActor: string): SlimMfaSnapshot {
  if (!uuid.test(expectedActor) || user?.id !== expectedActor || !['aal1', 'aal2'].includes(aal?.currentLevel) || (user.factors !== undefined && !Array.isArray(user.factors))) throw invalid();
  const all = user.factors ?? []; const ids = new Set<string>(); let verifiedCount = 0;
  const factors: SlimMfaFactor[] = [];
  for (const factor of all) {
    if (!uuid.test(factor?.id) || ids.has(factor.id) || !['verified', 'unverified'].includes(factor.status) || typeof factor.factor_type !== 'string') throw invalid();
    ids.add(factor.id); if (factor.status === 'verified') verifiedCount++;
    if (factor.factor_type !== 'totp') continue;
    if (factor.friendly_name != null && (typeof factor.friendly_name !== 'string' || factor.friendly_name.length > 256)) throw invalid();
    factors.push({ id: factor.id, name: factor.friendly_name?.trim() || 'Aplicativo autenticador', status: factor.status });
  }
  // The JWT can remain aal2 after the last factor was removed. Fresh factors own nextLevel.
  return { actorId: expectedActor, factors, currentLevel: aal.currentLevel, nextLevel: verifiedCount ? 'aal2' : 'aal1', verifiedCount };
}
export function normalizeSlimMfaEnrollment(value: any): SlimMfaEnrollment {
  if (!uuid.test(value?.id) || value?.type !== 'totp' || typeof value.totp?.secret !== 'string' || !/^[A-Z2-7]{16,256}={0,6}$/.test(value.totp.secret)) throw invalid();
  const qr = value.totp.qr_code;
  if (typeof qr !== 'string' || qr.length > 180_000) throw invalid();
  let svg = qr.startsWith('data:image/svg+xml;utf-8,') ? qr.slice('data:image/svg+xml;utf-8,'.length) : qr;
  if (!svg.trimStart().startsWith('<svg')) throw invalid();
  return { factorId: value.id, secret: value.totp.secret, qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
export function slimMfaMessage(error: any, effectStarted = false): { message: string; uncertain: boolean } {
  const code = String(error?.code ?? ''); const status = Number(error?.status);
  if (code === 'MFA_CONTEXT') return { message: 'A conta ou a sessão mudou. Confira o estado antes de continuar.', uncertain: effectStarted };
  if (code === 'MFA_BUSY') return { message: 'A tentativa anterior ainda está encerrando. Consulte o estado antes de continuar.', uncertain: effectStarted };
  if (code === 'MFA_PENDING') return { message: 'Já existe um cadastro pendente. Confirme o código ou remova esse cadastro antes de adicionar outro.', uncertain: false };
  if (code === 'MFA_APPROVAL') return { message: 'Confirme a remoção do autenticador escolhido.', uncertain: false };
  if (code === 'MFA_CODE') return { message: 'Digite os seis números do aplicativo autenticador.', uncertain: false };
  if (code === 'MFA_FACTOR') return { message: 'O autenticador escolhido mudou ou não está mais disponível. Consulte o estado.', uncertain: false };
  if (code === 'MFA_AAL' || /insufficient_aal|mfa_verification_required/.test(code)) return { message: 'Verifique a sessão com um autenticador cadastrado antes desta ação.', uncertain: false };
  if (/mfa_verification_failed|mfa_challenge_expired/.test(code)) return { message: 'Código inválido ou vencido. Confira o horário do celular e informe um código atual.', uncertain: false };
  if (status === 429 || /rate_limit/.test(code)) return { message: 'Muitas tentativas. Aguarde antes de tentar novamente.', uncertain: false };
  if (/mfa_totp_enroll_not_enabled|mfa_totp_verify_not_enabled/.test(code)) return { message: 'O autenticador está indisponível no serviço de autenticação.', uncertain: false };
  if (/mfa_factor_limit_exceeded/.test(code)) return { message: 'O serviço atingiu o limite de autenticadores desta conta. Confira os fatores existentes.', uncertain: false };
  const known = error instanceof SlimMfaError ? error.known : status >= 400 && status < 500;
  return { message: effectStarted && !known ? 'Não foi possível confirmar o resultado. Consulte o estado; a ação não será repetida automaticamente.' : 'Não foi possível confirmar o estado do autenticador. Tente consultar novamente.', uncertain: effectStarted && !known };
}

export function createSlimMfaController(auth: SlimMfaAuth, options: { deadlineMs?: number; openTransport?: typeof beginSlimMfaTransport } = {}) {
  let state: SlimMfaState = { actorId: null, phase: 'loading', snapshot: null, enrollment: null, pending: null, message: '' };
  let identity: SlimMfaIdentity | null = null, epoch = 0, disposed = false, busy = false;
  let operationAbort: AbortController | null = null;
  let subscription: { unsubscribe(): void } | null = null;
  const listeners = new Set<(state: SlimMfaState) => void>();
  const publish = (patch: Partial<SlimMfaState>) => { if (disposed) return; state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); };
  const current = (capture: number) => !disposed && capture === epoch;
  const assertCurrent = (capture: number, signal?: AbortSignal) => { if (!current(capture) || signal?.aborted) throw new SlimMfaError('MFA_CONTEXT'); };
  const same = (a: SlimMfaIdentity | null, b: SlimMfaIdentity | null) => a?.actorId === b?.actorId && a?.sessionId === b?.sessionId;
  const observedSession = (session: any): SlimMfaIdentity | null => {
    if (!session) return null;
    const result = slimMfaTokenIdentity(session.access_token);
    if (result.actorId !== session.user?.id) throw new SlimMfaError('MFA_CONTEXT');
    return result;
  };
  async function bounded<T>(run: (signal: AbortSignal, deadline: number) => Promise<T>, ms: number) {
    const abort = new AbortController(); operationAbort = abort;
    const deadline = Date.now() + ms; let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new SlimMfaError('MFA_TIMEOUT', false)); }, ms); });
    try { return await Promise.race([run(abort.signal, deadline), expired]); }
    finally { clearTimeout(timer!); if (operationAbort === abort) operationAbort = null; }
  }
  async function read(capture: number, signal?: AbortSignal): Promise<SlimMfaSnapshot> {
    assertCurrent(capture, signal);
    const session = checked(await auth.getSession()).session; assertCurrent(capture, signal);
    const observed = observedSession(session);
    if (!observed || !same(observed, identity)) throw new SlimMfaError('MFA_CONTEXT');
    const [userResult, aalResult] = await Promise.all([auth.getUser(session.access_token), auth.mfa.getAuthenticatorAssuranceLevel(session.access_token)]);
    assertCurrent(capture, signal);
    const result = normalizeSlimMfaSnapshot(checked(userResult).user, checked(aalResult), observed.actorId);
    const after = checked(await auth.getSession()).session; assertCurrent(capture, signal);
    if (!same(observedSession(after), observed)) throw new SlimMfaError('MFA_CONTEXT');
    return result;
  }
  async function refresh() {
    if (disposed || busy) return; busy = true;
    const capture = epoch; const previous = state.pending;
    publish({ phase: 'loading', message: '' });
    try {
      if (!identity) {
        const session = checked(await bounded(() => auth.getSession(), Math.min(options.deadlineMs ?? 20_000, 10_000))).session;
        if (current(capture)) changeIdentity(session);
        return;
      }
      const snapshot = await bounded(signal => read(capture, signal), Math.min(options.deadlineMs ?? 20_000, 10_000));
      if (!current(capture)) return;
      const factor = previous?.factorId ? snapshot.factors.find(f => f.id === previous.factorId) : null;
      const notice = previous?.kind === 'remove' && !factor ? 'A remoção foi confirmada pela consulta.' : previous?.kind === 'verify' && factor?.status === 'verified' ? 'O autenticador está cadastrado. Confira abaixo o nível atual da sessão.' : previous?.kind === 'enroll' && snapshot.factors.some(f => f.status === 'unverified') ? 'Há um cadastro pendente. O QR só está disponível na tela que o gerou. Se necessário, remova esse cadastro antes de começar outro.' : previous ? 'Estado consultado. Nenhuma ação foi repetida.' : '';
      const enrollment = state.enrollment && snapshot.factors.some(f => f.id === state.enrollment!.factorId && f.status === 'unverified') ? state.enrollment : null;
      publish({ phase: 'ready', snapshot, enrollment, pending: null, message: notice });
    } catch (error) { if (current(capture)) publish({ phase: previous ? 'uncertain' : 'unavailable', snapshot: null, enrollment: null, message: slimMfaMessage(error, Boolean(previous)).message }); }
    finally { if (current(capture)) busy = false; }
  }
  function changeIdentity(session: any) {
    let next: SlimMfaIdentity | null; try { next = observedSession(session); } catch { next = null; }
    if (same(next, identity) && state.phase !== 'loading') return;
    operationAbort?.abort(); epoch++; identity = next; busy = false;
    publish({ actorId: next?.actorId ?? null, phase: next ? 'loading' : 'signed_out', snapshot: null, enrollment: null, pending: null, message: '' });
    if (next) queueMicrotask(() => { void refresh(); });
  }
  async function start() {
    subscription = auth.onAuthStateChange((_event, session) => { if (!disposed) { let next; try { next = observedSession(session); } catch { next = null; } if (!same(identity, next)) changeIdentity(session); } }).data.subscription;
    const capture = epoch;
    try { const result = await bounded(() => auth.getSession(), Math.min(options.deadlineMs ?? 20_000, 10_000)); if (current(capture)) changeIdentity(checked(result).session); }
    catch { if (current(capture)) publish({ phase: 'unavailable', message: 'Não foi possível consultar a sessão. Tente novamente.' }); }
  }
  async function effect(kind: SlimMfaPending['kind'], factorId: string | null, code?: string, approved?: boolean) {
    if (disposed || busy || state.phase !== 'ready' || !identity) return;
    if (factorId !== null && !uuid.test(factorId)) return;
    busy = true; const capture = epoch; let started = false, contextRead = false;
    const pending = { kind, factorId };
    publish({ phase: 'working', pending, message: '' });
    try {
      await bounded(async (signal, deadline) => {
        const snapshot = await read(capture, signal); assertCurrent(capture, signal);
        contextRead = true;
        publish({ snapshot });
        const factor = snapshot.factors.find(f => f.id === factorId);
        if (kind === 'enroll' && snapshot.factors.some(f => f.status === 'unverified')) throw new SlimMfaError('MFA_PENDING');
        if (kind !== 'enroll' && !factor) throw new SlimMfaError('MFA_FACTOR');
        if (kind === 'verify' && !/^\d{6}$/.test(code ?? '')) throw new SlimMfaError('MFA_CODE');
        if (kind === 'remove' && approved !== true) throw new SlimMfaError('MFA_APPROVAL');
        if ((kind === 'enroll' && snapshot.verifiedCount > 0 || kind === 'remove' && factor?.status === 'verified') && snapshot.currentLevel !== 'aal2') throw new SlimMfaError('MFA_AAL');
        const paths = kind === 'enroll' ? ['POST /factors'] : kind === 'remove' ? [`DELETE /factors/${factorId}`] : [`POST /factors/${factorId}/challenge`, `POST /factors/${factorId}/verify`];
        const close = (options.openTransport ?? beginSlimMfaTransport)({ ...identity!, signal, deadline, paths, current: () => current(capture) });
        try {
          assertCurrent(capture, signal); started = true;
          if (kind === 'enroll') {
            const result = normalizeSlimMfaEnrollment(checked(await auth.mfa.enroll({ factorType: 'totp', friendlyName: `Vanessa Simoni ${new Date().toISOString().slice(0, 19)}`, issuer: 'Vanessa Simoni' })));
            assertCurrent(capture, signal);
            const next = await read(capture, signal);
            if (!next.factors.some(f => f.id === result.factorId && f.status === 'unverified')) throw invalid();
            publish({ phase: 'ready', snapshot: next, enrollment: result, pending: null, message: 'Leia o QR com seu aplicativo e confirme um código para concluir o cadastro.' });
          } else if (kind === 'verify') {
            const challenge = checked(await auth.mfa.challenge({ factorId })); assertCurrent(capture, signal);
            if (!uuid.test(challenge.id)) throw invalid();
            const verified = checked(await auth.mfa.verify({ factorId, challengeId: challenge.id, code })); assertCurrent(capture, signal);
            if (verified.user?.id !== identity!.actorId) throw invalid();
            const next = await read(capture, signal);
            if (!next.factors.some(f => f.id === factorId && f.status === 'verified') || next.currentLevel !== 'aal2') throw invalid();
            publish({ phase: 'ready', snapshot: next, enrollment: null, pending: null, message: 'Código confirmado. O autenticador está cadastrado e esta sessão foi verificada.' });
          } else {
            const removed = checked(await auth.mfa.unenroll({ factorId })); assertCurrent(capture, signal);
            if (removed.id !== factorId) throw invalid();
            const next = await read(capture, signal);
            if (next.factors.some(f => f.id === factorId)) throw invalid();
            publish({ phase: 'ready', snapshot: next, enrollment: state.enrollment?.factorId === factorId ? null : state.enrollment, pending: null, message: 'A remoção do autenticador escolhido foi confirmada.' });
          }
        } finally { close(); }
      }, options.deadlineMs ?? 20_000);
    } catch (error) {
      if (current(capture)) { const result = slimMfaMessage(error, started); publish({ phase: result.uncertain ? 'uncertain' : contextRead ? 'ready' : 'unavailable', pending: result.uncertain ? pending : null, message: result.message, ...(!contextRead ? { snapshot: null } : {}), ...(result.uncertain || !contextRead ? { enrollment: null } : {}) }); }
    } finally { if (current(capture)) busy = false; }
  }
  return {
    start, refresh, getState: () => state,
    subscribe(fn: (state: SlimMfaState) => void) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; },
    enroll: () => effect('enroll', null), verify: (factorId: string, code: string) => effect('verify', factorId, code), remove: (factorId: string, approved: boolean) => effect('remove', factorId, undefined, approved),
    hideSecret() { publish({ enrollment: null }); },
    dispose() { disposed = true; epoch++; operationAbort?.abort(); subscription?.unsubscribe(); listeners.clear(); state = { ...state, enrollment: null, snapshot: null, pending: null, actorId: null }; },
  };
}
export type SlimMfaController = ReturnType<typeof createSlimMfaController>;
