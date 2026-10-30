import { useEffect, useRef, useState } from 'react';
import { createClientOnlyFn } from '@tanstack/react-start';
import { createBrowserSlimMfaController } from '@/lib/slim-mfa.client';
import type { SlimMfaController, SlimMfaState } from '@/lib/slim-mfa.core';

const makeBrowserController = createClientOnlyFn(() => createBrowserSlimMfaController());
const initial: SlimMfaState = { actorId: null, phase: 'loading', snapshot: null, enrollment: null, pending: null, message: '' };
const button = 'rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed';
const primary = button + ' bg-primary text-primary-foreground hover:bg-primary/90';

export function SlimMfaSettings({ makeController = makeBrowserController }: { makeController?: () => SlimMfaController }) {
  const controller = useRef<SlimMfaController | null>(null);
  const [state, setState] = useState<SlimMfaState>(initial);
  const [addReview, setAddReview] = useState(false);
  const [selected, setSelected] = useState<{ id: string; action: 'verify' | 'remove' } | null>(null);
  const [code, setCode] = useState('');
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    const active = makeController(); controller.current = active;
    const unsubscribe = active.subscribe(setState); void active.start();
    return () => { unsubscribe(); active.dispose(); controller.current = null; };
  }, [makeController]);
  useEffect(() => { setCode(''); setSelected(null); setApproved(false); setAddReview(false); setCopied(''); }, [state.actorId]);
  useEffect(() => {
    if (state.phase !== 'ready') { setCode(''); setCopied(''); }
    if (state.phase === 'loading' || state.phase === 'signed_out' || state.phase === 'unavailable') { setSelected(null); setApproved(false); setAddReview(false); }
  }, [state.phase]);
  useEffect(() => { if (selected && state.snapshot && !state.snapshot.factors.some(f => f.id === selected.id)) { setSelected(null); setApproved(false); } }, [state.snapshot, selected]);
  const ready = state.phase === 'ready';
  const waiting = state.phase === 'working' || state.phase === 'loading';
  const snapshot = state.snapshot;
  const factor = snapshot?.factors.find(f => f.id === selected?.id);
  const pending = snapshot?.factors.some(f => f.status === 'unverified') ?? false;
  const enrollment = state.enrollment;
  const chosenId = enrollment?.factorId ?? (selected?.action === 'verify' ? selected.id : null);
  const chosen = snapshot?.factors.find(f => f.id === chosenId);
  const newFactor = chosen?.status === 'unverified';
  const choose = (id: string, action: 'verify' | 'remove') => { setSelected({ id, action }); setCode(''); setApproved(false); setCopied(''); setAddReview(false); if (action === 'remove') controller.current?.hideSecret(); };
  const copy = async () => {
    const active = controller.current, captured = active?.getState();
    if (!active || !captured?.enrollment || captured.phase !== 'ready') return;
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(captured.enrollment.secret);
      if (controller.current === active && active.getState().actorId === captured.actorId && active.getState().enrollment?.factorId === captured.enrollment.factorId) setCopied('Chave copiada. Guarde-a somente no seu aplicativo autenticador.');
    } catch { if (controller.current === active && active.getState().actorId === captured.actorId) setCopied('Não foi possível copiar a chave. Você pode digitá-la no aplicativo.'); }
  };
  return <section aria-labelledby="slim-mfa-title" className="min-w-0 space-y-4" data-slim-mfa>
    <header className="space-y-1"><h3 id="slim-mfa-title" className="text-base font-semibold">Aplicativo autenticador</h3><p className="text-sm text-muted-foreground">Gerencie os autenticadores da sua conta e confira a verificação desta sessão.</p></header>
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1" aria-live="polite">
          <p className="font-semibold">{state.phase === 'signed_out' ? 'Sessão não disponível' : !snapshot ? 'Estado ainda não confirmado' : snapshot.factors.some(f => f.status === 'verified') ? 'Autenticador cadastrado' : pending ? 'Cadastro pendente' : 'Nenhum autenticador cadastrado'}</p>
          {snapshot && <p className="text-sm text-muted-foreground">{snapshot.currentLevel === 'aal2' && snapshot.verifiedCount > 0 ? 'Esta sessão está verificada em dois fatores.' : snapshot.currentLevel === 'aal2' ? 'Não há fator cadastrado. Esta sessão ainda carrega uma verificação anterior.' : 'Esta sessão usa o acesso convencional. Um fator cadastrado não confirma esta sessão sozinho.'}</p>}
        </div>
        <button type="button" className={button} disabled={waiting || state.phase === 'signed_out'} onClick={() => { setCode(''); void controller.current?.refresh(); }}>{waiting ? state.phase === 'working' ? 'Aguardando confirmação…' : 'Consultando…' : 'Consultar estado'}</button>
      </div>
      {state.message && <p role={state.phase === 'uncertain' || state.phase === 'unavailable' ? 'alert' : 'status'} className="rounded-md border border-border bg-muted/40 p-3 text-sm break-words">{state.message}</p>}
      {state.phase === 'signed_out' && <p className="text-sm text-muted-foreground">Entre na sua conta para consultar os autenticadores. Esta tela não encerrou sua sessão.</p>}
      {snapshot && <ul className="space-y-3" aria-label="Autenticadores da conta">{snapshot.factors.map(item => <li key={item.id} className="min-w-0 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-medium break-words">{item.name}</p><p className="text-xs text-muted-foreground">{item.status === 'verified' ? 'Cadastrado e confirmado' : 'Pendente de confirmação'}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!ready} onClick={() => choose(item.id, 'verify')}>{item.status === 'verified' ? 'Verificar sessão' : 'Informar código'}</button><button type="button" className={button} disabled={!ready} onClick={() => choose(item.id, 'remove')}>Remover</button></div></div>
        {item.status === 'unverified' && enrollment?.factorId !== item.id && <p className="mt-2 text-xs text-muted-foreground">O QR não pode ser recuperado após sair da tela. Se este fator já está no seu aplicativo, informe um código. Caso contrário, remova apenas este cadastro antes de criar outro.</p>}
      </li>)}</ul>}
      {ready && !enrollment && !selected && !addReview && <button type="button" className={primary} disabled={pending || Boolean(snapshot?.verifiedCount && snapshot.currentLevel !== 'aal2')} onClick={() => { setAddReview(true); setApproved(false); }}>Adicionar autenticador</button>}
      {ready && snapshot && !enrollment && !selected && snapshot.verifiedCount > 0 && snapshot.currentLevel !== 'aal2' && <p className="text-xs text-muted-foreground">Verifique esta sessão com um fator existente para adicionar outro autenticador.</p>}
      {addReview && <div className="rounded-lg border border-primary/30 p-4 space-y-3"><h4 className="font-semibold">Cadastrar um autenticador nesta conta</h4><p className="text-sm text-muted-foreground">O próximo passo gera um QR exclusivo. O cadastro só será concluído depois de você informar um código do aplicativo. A confirmação inicial pelo serviço encerra as outras sessões desta conta; esta sessão continua aberta.</p><p className="text-sm text-muted-foreground">O cadastro é opcional. Ao confirmar um autenticador, os próximos acessos desta conta exigirão o código do aplicativo.</p><div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={!ready || pending} onClick={() => { setAddReview(false); setSelected(null); setApproved(false); void controller.current?.enroll(); }}>Gerar QR para minha conta</button><button type="button" className={button} disabled={!ready} onClick={() => setAddReview(false)}>Cancelar</button></div></div>}
      {enrollment && <div className="min-w-0 grid gap-4 sm:grid-cols-[176px_minmax(0,1fr)] rounded-lg border border-primary/30 p-4" data-slim-mfa-enrollment>
        <img src={enrollment.qr} alt="QR Code para cadastrar o aplicativo autenticador" className="h-44 w-44 max-w-full rounded-md bg-white p-2" />
        <div className="min-w-0 space-y-3"><h4 className="font-semibold">Leia o QR com seu aplicativo</h4><p className="text-sm text-muted-foreground">Se preferir, digite esta chave no aplicativo:</p><code className="block break-all rounded-md bg-muted p-2 text-sm select-all">{enrollment.secret}</code><button type="button" className={button} disabled={!ready} onClick={() => void copy()}>Copiar chave</button>{copied && <p role="status" className="text-xs text-muted-foreground">{copied}</p>}<p className="text-xs text-muted-foreground">A chave fica apenas nesta tela. Ao sair, ela é apagada da memória da tela; o cadastro pendente permanece na conta.</p></div>
      </div>}
      {chosenId && chosen && selected?.action !== 'remove' && <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={event => { event.preventDefault(); if (!ready || code.length !== 6 || newFactor && !approved) return; const entered = code; setCode(''); void controller.current?.verify(chosenId, entered); }}>
        <h4 className="font-semibold">{newFactor ? 'Confirmar o cadastro' : 'Verificar esta sessão'}</h4>
        <label className="block text-sm">Código de seis números<input className="mt-1 block w-full max-w-64 rounded-md border border-input bg-background px-3 py-2 text-base" aria-label="Código de seis números" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={!ready} /></label>
        {newFactor && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} disabled={!ready} /><span>Conferi o aplicativo. Entendo que confirmar este novo autenticador encerra as outras sessões da minha conta.</span></label>}
        <div className="flex flex-wrap gap-2"><button type="submit" className={primary} disabled={!ready || code.length !== 6 || Boolean(newFactor && !approved)}>Confirmar código</button><button type="button" className={button} disabled={!ready} onClick={() => { controller.current?.hideSecret(); setSelected(null); setCode(''); setApproved(false); }}>Ocultar e voltar</button></div>
      </form>}
      {selected?.action === 'remove' && factor && <div className="space-y-3 rounded-lg border border-destructive/40 p-4"><h4 className="font-semibold">Remover {factor.name}</h4><p className="text-sm text-muted-foreground">Somente este autenticador será removido. {factor.status === 'verified' ? 'Você deixará de usar os códigos dele nesta conta. A remoção exige uma sessão verificada em dois fatores.' : 'Este cadastro ainda não foi confirmado.'}</p><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} disabled={!ready} /><span>Confirmo a remoção deste autenticador.</span></label><div className="flex flex-wrap gap-2"><button type="button" className={button + ' text-destructive'} disabled={!ready || !approved} onClick={() => { void controller.current?.remove(factor.id, approved); setApproved(false); }}>Confirmar remoção</button><button type="button" className={button} disabled={!ready} onClick={() => { setSelected(null); setApproved(false); }}>Cancelar remoção</button></div></div>}
    </div>
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2"><h4 className="text-sm font-semibold">Outros métodos</h4><p className="text-sm text-muted-foreground">Código por e-mail, SMS, passkeys e códigos de recuperação estão indisponíveis nesta versão. Eles não devem ser usados como alternativa de recuperação do autenticador.</p></div>
    <p className="text-xs leading-relaxed text-muted-foreground">Para contas com autenticador confirmado, todos os acessos e operações privadas exigem uma sessão verificada em dois fatores. Contas sem fator confirmado continuam usando e-mail e senha.</p>
  </section>;
}
