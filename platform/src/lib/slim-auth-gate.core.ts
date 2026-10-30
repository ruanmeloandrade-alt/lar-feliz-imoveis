import { createSlimMfaController, type SlimMfaAuth, type SlimMfaSnapshot, type SlimMfaState } from './slim-mfa.core.ts';
import { slimMfaTokenIdentity } from './slim-mfa-transport.core.ts';

export type SlimAuthGateState = { phase: 'loading' | 'ready' | 'signed_out' | 'challenge' | 'unsupported' | 'working' | 'uncertain' | 'unavailable'; snapshot: SlimMfaSnapshot | null; message: string; revision: number };
export function safeSlimAuthReturn(value?: string): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try { const url = new URL(value, 'https://slim-return.invalid'); return url.origin === 'https://slim-return.invalid' && !['/auth', '/admin'].includes(url.pathname) ? url.pathname + url.search + url.hash : null; } catch { return null; }
}
export function isSlimRecoveryLocation(path: string, search = '', hash = ''): boolean {
  return path === '/auth' && (new URLSearchParams(search).get('mode') === 'recovery' || new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery');
}
export function createSlimAuthGateController(auth: SlimMfaAuth, assertSecurity: () => Promise<true>, options: { deadlineMs?: number } = {}) {
  const native = createSlimMfaController(auth, options);
  let state: SlimAuthGateState = { phase: 'loading', snapshot: null, message: '', revision: 0 };
  let epoch = 0, disposed = false, scheduled = false, verifyBusy = false, recheckRequested = false;
  let granted: { actorId: string; sessionId: string; snapshot: SlimMfaSnapshot } | null = null;
  let authSubscription: { unsubscribe(): void } | null = null;
  const listeners = new Set<(state: SlimAuthGateState) => void>();
  const publish = (patch: Partial<SlimAuthGateState>) => {
    if (disposed) return;
    // A read for an already accepted session must not unmount in-progress work.
    // Actor/session changes clear this grant synchronously; failures clear it below.
    if (patch.phase === 'loading' && granted) patch = { ...patch, phase: 'ready', snapshot: granted.snapshot };
    else if (patch.phase && patch.phase !== 'ready') granted = null;
    state = { ...state, ...patch }; listeners.forEach(fn => fn(state));
  };
  const refresh = () => { if (disposed || verifyBusy) return; recheckRequested = true; epoch++; publish({ phase: 'loading', snapshot: null, message: '', revision: state.revision + 1 }); void native.refresh(); };
  const schedule = () => {
    if (disposed || verifyBusy) return;
    recheckRequested = true; epoch++; publish({ phase: 'loading', snapshot: null, message: '', revision: state.revision + 1 });
    if (scheduled) return; scheduled = true;
    setTimeout(() => { scheduled = false; if (!disposed) void native.refresh(); }, 0);
  };
  async function validate(snapshot: SlimMfaSnapshot, capture: number) {
    const current = () => !disposed && epoch === capture;
    let timer: ReturnType<typeof setTimeout>;
    try {
      const run = async () => {
        const first = await auth.getSession(); if (!current()) return;
        if (first.error || !first.data?.session?.access_token) throw { code: 'SLIM_SESSION_INVALID' };
        const token = first.data.session.access_token;
        const identity = slimMfaTokenIdentity(token);
        if (identity.actorId !== snapshot.actorId) throw { code: 'SLIM_SESSION_INVALID' };
        if (granted && (identity.actorId !== granted.actorId || identity.sessionId !== granted.sessionId)) { granted = null; publish({ phase: 'loading', snapshot: null }); }
        const confirmed = await assertSecurity(); if (!current()) return;
        if (confirmed !== true) throw { code: 'SLIM_SECURITY_UNAVAILABLE' };
        const last = await auth.getSession(); if (!current()) return;
        if (last.error || last.data?.session?.access_token !== token) { schedule(); return; }
        granted = { ...identity, snapshot };
        publish({ phase: 'ready', snapshot, message: '' });
      };
      await Promise.race([run(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject({ code: 'SLIM_SECURITY_UNAVAILABLE' }), options.deadlineMs ?? 12_000); })]);
    } catch (error: any) {
      if (!current()) return; epoch++;
      publish({ phase: error?.code === 'SLIM_SESSION_INVALID' ? 'signed_out' : 'unavailable', snapshot: null, message: error?.code === 'SLIM_SESSION_INVALID' ? 'Esta sessão não é mais válida. Entre novamente.' : error?.code === 'SLIM_MFA_REQUIRED' ? 'A conta exige uma verificação adicional. Consulte o estado para continuar.' : 'Não foi possível confirmar a segurança da sessão. Tente novamente.' });
    } finally { clearTimeout(timer!); }
  }
  const unsubscribeNative = native.subscribe((next: SlimMfaState) => {
    if (disposed) return;
    if (next.phase === 'loading') recheckRequested = false;
    if (next.phase === 'ready' && recheckRequested) { schedule(); return; }
    const capture = ++epoch, snapshot = next.snapshot;
    if (next.phase !== 'ready' || !snapshot) { publish({ phase: next.phase === 'ready' ? 'unavailable' : next.phase, snapshot: null, message: next.message, revision: state.revision + 1 }); return; }
    if (snapshot.verifiedCount > 0 && snapshot.currentLevel !== 'aal2') {
      const supported = snapshot.factors.some(factor => factor.status === 'verified');
      publish({ phase: supported ? 'challenge' : 'unsupported', snapshot, message: next.message, revision: state.revision + 1 }); return;
    }
    publish({ phase: 'loading', snapshot: null, message: '', revision: state.revision + 1 }); void validate(snapshot, capture);
  });
  return {
    getState: () => state,
    subscribe(fn: (state: SlimAuthGateState) => void) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; },
    async start() {
      authSubscription = auth.onAuthStateChange((event, session) => {
        if (granted) {
          try {
            const identity = slimMfaTokenIdentity(session?.access_token);
            if (identity.actorId !== granted.actorId || identity.sessionId !== granted.sessionId || session?.user?.id !== identity.actorId) granted = null;
          } catch { granted = null; }
        }
        if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED', 'TOKEN_REFRESHED', 'MFA_CHALLENGE_VERIFIED', 'PASSWORD_RECOVERY'].includes(event)) schedule();
      }).data.subscription;
      await native.start();
    },
    refresh,
    async verify(factorId: string, code: string) {
      if (disposed || verifyBusy || state.phase !== 'challenge' || !state.snapshot?.factors.some(f => f.id === factorId && f.status === 'verified') || !/^\d{6}$/.test(code)) return;
      verifyBusy = true; try { await native.verify(factorId, code); } finally { verifyBusy = false; }
    },
    dispose() { disposed = true; granted = null; epoch++; authSubscription?.unsubscribe(); unsubscribeNative(); native.dispose(); listeners.clear(); },
  };
}
export type SlimAuthGateController = ReturnType<typeof createSlimAuthGateController>;
