import { useEffect, useRef, useState } from 'react';
import { createClientOnlyFn, useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { SlimMfaSettings } from './SlimMfaSettings';
import { readIdlePref, writeIdlePref, type IdlePref } from '@/components/IdleLogoutGuard';
import { slimMfaTokenIdentity, type SlimMfaIdentity } from '@/lib/slim-mfa-transport.core';
import { updateSlimAccountPassword } from '@/lib/slim-security-account.functions';

const getBrowserAuth = createClientOnlyFn(() => supabase.auth);
const button = 'rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
const input = 'mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50';
const same = (a: SlimMfaIdentity | null, b: SlimMfaIdentity | null) => a?.actorId === b?.actorId && a?.sessionId === b?.sessionId;
function sessionIdentity(session: any): SlimMfaIdentity | null {
  if (!session) return null;
  const identity = slimMfaTokenIdentity(session.access_token);
  if (identity.actorId !== session.user?.id) throw new Error('Sessão inconsistente.');
  return identity;
}

/** Only controls backed by the current authentication service are mounted. */
export function SlimSecuritySettings() {
  const changePassword = useServerFn(updateSlimAccountPassword);
  const identity = useRef<SlimMfaIdentity | null>(null);
  const mounted = useRef(false), locked = useRef(false);
  const [ready, setReady] = useState(false), [saving, setSaving] = useState(false);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState(''), [tone, setTone] = useState<'status' | 'alert'>('status');
  const [idle, setIdle] = useState<IdlePref>({ enabled: true, minutes: 60 });
  const [idleMessage, setIdleMessage] = useState('');

  useEffect(() => {
    mounted.current = true;
    const auth = getBrowserAuth(); let eventSeen = false;
    const receive = (session: any) => {
      if (!mounted.current) return;
      let next: SlimMfaIdentity | null = null;
      try { next = sessionIdentity(session); } catch { /* An invalid identity cannot submit. */ }
      if (!same(identity.current, next)) {
        identity.current = next;
        setPassword(''); setConfirmation(''); setMessage('');
      }
      setReady(Boolean(next));
    };
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => { eventSeen = true; receive(session); });
    void auth.getSession().then(({ data, error }) => { if (!eventSeen) receive(error ? null : data.session); }).catch(() => { if (!eventSeen) receive(null); });
    setIdle(readIdlePref());
    const refreshIdle = () => { setIdle(readIdlePref()); };
    window.addEventListener('mkton:idle-pref', refreshIdle);
    window.addEventListener('storage', refreshIdle);
    return () => { mounted.current = false; identity.current = null; subscription.unsubscribe(); window.removeEventListener('mkton:idle-pref', refreshIdle); window.removeEventListener('storage', refreshIdle); };
  }, []);

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const captured = identity.current;
    if (locked.current || !ready || !captured || password.length < 8 || password.length > 128 || password !== confirmation) return;
    locked.current = true; setSaving(true); setMessage('');
    try {
      const { data, error } = await getBrowserAuth().getSession();
      if (error || !same(captured, sessionIdentity(data.session)) || !same(captured, identity.current)) throw new Error('Sessão alterada.');
      const result = await changePassword({ data: { expectedActorId: captured.actorId, expectedSessionId: captured.sessionId, password } });
      if (!mounted.current || !same(captured, identity.current)) return;
      if (result.actorId !== captured.actorId || result.sessionId !== captured.sessionId) throw new Error('Confirmação divergente.');
      setTone(result.status === 'confirmed' ? 'status' : 'alert');
      setMessage(result.message);
      if (result.status === 'confirmed') { setPassword(''); setConfirmation(''); }
    } catch {
      if (mounted.current && same(captured, identity.current)) {
        setTone('alert');
        setMessage('Não foi possível confirmar a alteração da senha. Nenhuma tentativa será repetida automaticamente. Confira sua conexão e a sessão antes de tentar novamente.');
      }
    } finally {
      locked.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const saveIdle = () => {
    try {
      const minutes = Math.max(1, Math.min(1440, Math.trunc(idle.minutes)));
      if (!Number.isFinite(minutes)) throw new Error('Prazo inválido.');
      writeIdlePref({ enabled: idle.enabled, minutes });
      setIdle({ enabled: idle.enabled, minutes });
      setIdleMessage('Preferência salva neste navegador.');
    } catch { setIdleMessage('Não foi possível salvar a preferência neste navegador.'); }
  };

  return <div className="min-w-0 space-y-8" data-slim-security-settings>
    <section aria-labelledby="slim-security-access" className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
      <h2 id="slim-security-access" className="text-base font-semibold">Proteção de acesso</h2>
      <p className="text-sm text-muted-foreground">O acesso aos dados exige uma sessão válida e as permissões da sua conta. Se você cadastrar e confirmar um autenticador, os próximos acessos também exigirão o código do aplicativo.</p>
      <p className="text-sm text-muted-foreground">O cadastro do autenticador é opcional. Sem um autenticador confirmado, você continua entrando com e-mail e senha.</p>
    </section>
    <section aria-labelledby="slim-security-password" className="space-y-4">
      <h3 id="slim-security-password" className="text-base font-semibold">Senha da conta</h3>
      <form onSubmit={submitPassword} className="space-y-4 max-w-xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Nova senha<input className={input} aria-label="Nova senha" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={!ready || saving} required /></label>
          <label className="text-sm">Repita a nova senha<input className={input} aria-label="Repita a nova senha" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={!ready || saving} required /></label>
        </div>
        <p className="text-xs text-muted-foreground">Use pelo menos oito caracteres. Escolha uma senha exclusiva para esta conta.</p>
        {confirmation && password !== confirmation && <p className="text-sm text-destructive">As senhas precisam ser iguais.</p>}
        <button type="submit" className={button + ' bg-primary text-primary-foreground hover:bg-primary/90'} disabled={!ready || saving || password.length < 8 || password !== confirmation}>{saving ? 'Aguardando confirmação…' : 'Salvar nova senha'}</button>
        {!ready && <p role="status" className="text-sm text-muted-foreground">Aguardando uma sessão válida para alterar a senha.</p>}
        {message && <p role={tone} className="rounded-md border border-border bg-muted/30 p-3 text-sm break-words">{message}</p>}
      </form>
    </section>
    <div className="border-t border-border pt-6"><SlimMfaSettings /></div>
    <section aria-labelledby="slim-security-idle" className="space-y-4 border-t border-border pt-6">
      <div className="space-y-1"><h3 id="slim-security-idle" className="text-base font-semibold">Saída por inatividade</h3><p className="text-sm text-muted-foreground">Preferência deste navegador. Encerra esta sessão após o período sem interação; os SalesBots e gatilhos continuam funcionando no servidor.</p></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={idle.enabled} onChange={e => { setIdle({ ...idle, enabled: e.target.checked }); setIdleMessage(''); }} />Ativar saída por inatividade</label>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Minutos sem atividade<input className={input + ' max-w-40'} type="number" min={1} max={1440} step={1} value={idle.minutes} disabled={!idle.enabled} onChange={e => { setIdle({ ...idle, minutes: Number(e.target.value) }); setIdleMessage(''); }} /></label><button type="button" className={button} onClick={saveIdle}>Salvar preferência</button></div>
      {idleMessage && <p role="status" className="text-sm text-muted-foreground">{idleMessage}</p>}
    </section>
  </div>;
}
