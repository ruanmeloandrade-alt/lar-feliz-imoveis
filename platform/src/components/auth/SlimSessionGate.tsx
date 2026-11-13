import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createClientOnlyFn } from '@tanstack/react-start';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { createBrowserSlimAuthGateController, exitSlimAuthGate } from '@/lib/slim-auth-gate.client';
import { safeSlimAuthReturn, type SlimAuthGateController, type SlimAuthGateState } from '@/lib/slim-auth-gate.core';
const makeBrowserController = createClientOnlyFn(() => createBrowserSlimAuthGateController());
const exitBrowser = createClientOnlyFn(() => exitSlimAuthGate());
const initial: SlimAuthGateState = { phase: 'loading', snapshot: null, message: '', revision: 0 };
const button = 'rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
const loginTransitionKey = 'vanessa-login-transition';
const verificationDuration = 5_000;

export function beginLoginVerification() {
  try { window.sessionStorage.setItem(loginTransitionKey, String(Date.now())); } catch { /* Storage may be unavailable. */ }
}

export function SlimSessionGate({ children, allowSignedOut = false, onReady, makeController = makeBrowserController, exit = exitBrowser }: { children: ReactNode; allowSignedOut?: boolean; onReady?: () => void; makeController?: () => SlimAuthGateController; exit?: () => Promise<void> }) {
  const controller = useRef<SlimAuthGateController | null>(null);
  const [state, setState] = useState(initial), [code, setCode] = useState(''), [factorId, setFactorId] = useState(''), [exitError, setExitError] = useState(''), [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false), mounted = useRef(true);
  const [showLoginVerification, setShowLoginVerification] = useState(false);
  const startedVerification = useRef<number | null>(null);
  useEffect(() => {
    if (allowSignedOut) return;
    try {
      const requested = Number(window.sessionStorage.getItem(loginTransitionKey));
      window.sessionStorage.removeItem(loginTransitionKey);
      const now = Date.now();
      if (requested > 0 && now - requested >= 0 && now - requested < 60_000) {
        startedVerification.current = now;
      }
    } catch { /* Continue with the normal security check. */ }
    if (startedVerification.current === null) return;
    const remaining = verificationDuration - (Date.now() - startedVerification.current);
    if (remaining <= 0) return;
    setShowLoginVerification(true);
    const timer = setTimeout(() => setShowLoginVerification(false), remaining);
    return () => clearTimeout(timer);
  }, [allowSignedOut]);
  useEffect(() => {
    mounted.current = true;
    const active = makeController(); controller.current = active;
    const unsubscribe = active.subscribe(setState); void active.start();
    const focus = () => active.refresh(); window.addEventListener('focus', focus);
    return () => { mounted.current = false; window.removeEventListener('focus', focus); unsubscribe(); active.dispose(); controller.current = null; };
  }, [makeController]);
  const factors = state.snapshot?.factors.filter(factor => factor.status === 'verified') ?? [];
  useEffect(() => { setCode(''); setFactorId(''); setExitError(''); }, [state.revision]);
  useEffect(() => { if (state.phase === 'ready') onReady?.(); }, [state.phase, onReady]);
  useEffect(() => {
    if (state.phase !== 'signed_out' || allowSignedOut || state.message) return;
    const next = safeSlimAuthReturn(window.location.pathname + window.location.search);
    window.location.replace(`/auth${next ? '?' + new URLSearchParams({ next }).toString() : ''}`);
  }, [state.phase, state.message, allowSignedOut]);
  if ((state.phase === 'ready' && !showLoginVerification) || (state.phase === 'signed_out' && allowSignedOut && !state.message)) return <>{children}</>;
  if (state.phase === 'loading' || state.phase === 'ready' || (showLoginVerification && state.phase === 'challenge')) {
    return (
      <main className="vanessa-verification grid min-h-dvh place-items-center px-4 py-8 text-white" data-slim-session-gate>
        <section className="w-full max-w-xs rounded-xl border border-[#513438] bg-[#20191c] p-5 shadow-2xl" aria-labelledby="vanessa-verification-title">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs font-semibold text-[#e1cbd0]">
            Vanessa Simoni
            <LockKeyhole size={14} aria-hidden="true" />
          </div>
          <div className="flex items-center gap-3 py-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#975157] bg-[#462429] text-[#ffb8b5]">
              <ShieldCheck size={23} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 id="vanessa-verification-title" className="text-base font-semibold tracking-tight">Verificação de segurança</h1>
              <p role="status" className="mt-0.5 text-sm text-[#d6bec4]">{state.phase === 'ready' ? 'Sessão confirmada.' : 'Conferindo sua sessão…'}</p>
            </div>
          </div>
          {!showLoginVerification ? (
            <Loader2 className="size-4 animate-spin text-[#ffd17a] motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div className="vanessa-verification-progress h-full rounded-full" style={{ animationDuration: `${verificationDuration}ms` }} />
            </div>
          )}
        </section>
      </main>
    );
  }
  const selected = factorId || factors[0]?.id || '', waiting = state.phase === 'working';
  async function leave() {
    if (leavingRef.current) return; leavingRef.current = true; setLeaving(true); setExitError(''); setCode('');
    try { await exit(); if (mounted.current) window.location.replace('/auth'); }
    catch (error) { if (mounted.current) setExitError(error instanceof Error ? error.message : 'Não foi possível sair. Tente novamente.'); }
    finally { if (mounted.current) setLeaving(false); leavingRef.current = false; }
  }
  return <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground" data-slim-session-gate>
    <section className="w-full max-w-md min-w-0 rounded-xl border border-border bg-card p-6 shadow-sm space-y-5" aria-labelledby="slim-session-title">
      <div className="flex items-center gap-3"><span className="rounded-lg bg-primary/15 p-3 text-primary"><ShieldCheck className="h-6 w-6" /></span><div><p className="text-xs text-muted-foreground">Vanessa Simoni</p><h1 id="slim-session-title" className="text-xl font-semibold">{waiting ? 'Verificação de segurança' : state.phase === 'challenge' ? 'Verifique sua identidade' : 'Acesso ainda não liberado'}</h1></div></div>
      {waiting ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{state.phase === 'working' ? 'Confirmando o código do autenticador…' : 'Aguarde a confirmação de segurança.'}</p> : state.phase === 'challenge' ? <>
        <p className="text-sm leading-relaxed text-muted-foreground">Sua conta possui verificação em dois fatores. Informe o código atual do aplicativo autenticador para continuar.</p>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); const value = code; setCode(''); void controller.current?.verify(selected, value); }}>
          {factors.length > 1 && <label className="grid gap-2 text-sm">Autenticador<select aria-label="Escolher autenticador" className="h-10 min-w-0 rounded-md border border-border bg-background px-3" value={selected} onChange={event => { setFactorId(event.target.value); setCode(''); }}>{factors.map(factor => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></label>}
          <label className="grid gap-2 text-sm">Código de seis números<input aria-label="Código de seis números" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-12 min-w-0 w-full rounded-md border border-border bg-background px-3 text-center text-xl tracking-[0.3em] outline-none focus:ring-2 focus:ring-primary" /></label>
          <button type="submit" className={button + ' w-full bg-primary text-primary-foreground hover:bg-primary/90'} disabled={code.length !== 6 || !selected || leaving}>Confirmar e continuar</button>
        </form>
      </> : state.phase === 'unsupported' ? <p className="text-sm leading-relaxed text-muted-foreground">Esta conta possui um fator verificado que não pode ser usado nesta tela. Nenhum fator foi removido. Entre pelo método cadastrado ou solicite orientação ao administrador.</p> : null}
      {(state.message || exitError) && <p role="alert" className="rounded-lg border border-border bg-muted/30 p-3 text-sm break-words">{exitError || state.message}</p>}
      <div className="flex flex-wrap gap-2">{!waiting && state.phase !== 'signed_out' && <button type="button" className={button} onClick={() => controller.current?.refresh()} disabled={leaving}>{state.phase === 'uncertain' ? 'Consultar resultado' : 'Tentar novamente'}</button>}<button type="button" className={button} onClick={() => void leave()} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair desta sessão'}</button></div>
    </section>
  </main>;
}
