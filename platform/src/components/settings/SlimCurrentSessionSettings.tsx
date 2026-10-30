import { useEffect, useRef, useState } from 'react';
import { createClientOnlyFn } from '@tanstack/react-start';
import { exitSlimAuthGate } from '@/lib/slim-auth-gate.client';

const leaveBrowserSession = createClientOnlyFn(() => exitSlimAuthGate());

/** This surface describes the native current session, not the legacy heartbeat ledger. */
export function SlimCurrentSessionSettings() {
  const mounted = useRef(false), locked = useRef(false);
  const [leaving, setLeaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const leave = async () => {
    if (locked.current) return;
    locked.current = true; setLeaving(true); setError('');
    try {
      await leaveBrowserSession();
      if (mounted.current) window.location.replace('/auth');
    } catch {
      if (mounted.current) setError('Não foi possível encerrar esta sessão. Confira sua conexão e tente novamente.');
    } finally { locked.current = false; if (mounted.current) setLeaving(false); }
  };
  return <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="slim-current-session-title" data-slim-current-session>
    <div className="space-y-2"><h2 id="slim-current-session-title" className="text-base font-semibold">Este navegador</h2><p className="text-sm text-muted-foreground">Você está usando sua sessão de acesso à Vanessa Simoni. A validade da sessão e as permissões da conta são conferidas nas operações protegidas.</p></div>
    <p className="text-sm text-muted-foreground">O botão abaixo encerra somente esta sessão. Os SalesBots e gatilhos continuam funcionando no servidor.</p>
    <button type="button" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void leave()} disabled={leaving}>{leaving ? 'Encerrando sessão…' : 'Sair deste navegador'}</button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">A lista e o encerramento de sessões de outros dispositivos não estão disponíveis nesta versão.</p>
  </section>;
}
