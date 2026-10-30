import {useEffect,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import {useBlocker} from '@tanstack/react-router';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {supabase} from '@/integrations/supabase/client';
import {listSlimInvitations,getSlimInvitationContext,changeSlimInvitation,lookupSlimInvitationChange,getSlimInvitationLink} from '@/lib/slim-invitations.functions';
import {
 createSlimInvitationJournal,normalizeSlimInvitationEmail,sameSlimInvitationAttempt,slimInvitationDeadline,slimInvitationEligible,
 validateSlimInvitationContext,validateSlimInvitationLink,validateSlimInvitationList,validateSlimInvitationReceipt,
 type SlimInvitationAction,type SlimInvitationAttempt,type SlimInvitationContext,type SlimInvitationReceipt,
} from '@/lib/slim-invitations.core';

type Props={workspaceId:string;actorId:string;isOwner:boolean;onChanged?:()=>unknown};
type Target={action:SlimInvitationAction;invitationId:string|null};
const readable=(value:unknown)=>value instanceof Error?value.message:'Não foi possível concluir a operação de convite.';
const date=(value:string)=>new Date(value).toLocaleString('pt-BR');
const labels={create:'Gerar convite',renew:'Renovar convite',revoke:'Revogar convite'};
const statuses:Record<string,string>={pending:'Pendente',accepted:'Aceito',revoked:'Revogado',expired:'Expirado'};
const button='rounded-md border px-3 py-2 text-sm disabled:opacity-50';

export function SlimInvitationsPanel({workspaceId,actorId,isOwner,onChanged}:Props){
 const list=useServerFn(listSlimInvitations),context=useServerFn(getSlimInvitationContext),change=useServerFn(changeSlimInvitation),lookup=useServerFn(lookupSlimInvitationChange),getLink=useServerFn(getSlimInvitationLink);
 const [ready,setReady]=useState(false),[identityError,setIdentityError]=useState('');
 const [target,setTarget]=useState<Target|null>(null),[email,setEmail]=useState(''),[adminChosen,setAdminChosen]=useState(false);
 const [review,setReview]=useState<SlimInvitationContext|null>(null),[attempt,setAttempt]=useState<SlimInvitationAttempt|null>(null),[receipt,setReceipt]=useState<SlimInvitationReceipt|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[journalError,setJournalError]=useState(''),[notice,setNotice]=useState('');
 const [link,setLink]=useState<{invitationId:string;url:string}|null>(null);
 const live=useRef(false),epoch=useRef(0),flight=useRef(false),identity=useRef({workspaceId,actorId});identity.current={workspaceId,actorId};
 const journal=()=>createSlimInvitationJournal({storage:window.localStorage,key:`saude-slim:invitations:pending:v1:${workspaceId}:${actorId}`});
 const current=(ticket:number)=>live.current&&ticket===epoch.current&&identity.current.workspaceId===workspaceId&&identity.current.actorId===actorId;
 const invalidateIdentity=()=>{epoch.current++;flight.current=false;setBusy(false);setReady(false);setIdentityError('A sessão ou empresa mudou. Reabra a página de convites.');setTarget(null);setReview(null);setAttempt(null);setReceipt(null);setEmail('');setAdminChosen(false);setLink(null);setNotice('');setError('');};
 useEffect(()=>{
  live.current=true;flight.current=false;setBusy(false);const ticket=++epoch.current;let authEvents=0,invalidated=false;
  setReady(false);setIdentityError('');setTarget(null);setReview(null);setReceipt(null);setEmail('');setAdminChosen(false);setLink(null);setNotice('');setError('');
  try{setAttempt(journal().read({workspaceId,actorId}));setJournalError('');}catch(cause){setAttempt(null);setJournalError(readable(cause));}
  const observe=(id:string|null)=>{if(!current(ticket)||invalidated)return;if(id!==actorId){invalidated=true;invalidateIdentity();return;}setReady(true);};
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{authEvents++;observe(session?.user.id??null);});
  const before=authEvents;
  void supabase.auth.getSession().then(({data,error})=>{if(before!==authEvents||!current(ticket))return;if(error)throw error;observe(data.session?.user.id??null);}).catch(cause=>{if(current(ticket)){setReady(false);setIdentityError(readable(cause));}});
  return()=>{live.current=false;epoch.current++;data.subscription.unsubscribe();};
 },[workspaceId,actorId]);
 const listQ=useQuery({queryKey:['slim-invitations',workspaceId,actorId],enabled:ready&&isOwner,queryFn:async()=>validateSlimInvitationList(await list({data:{workspaceId,actorId}}),{workspaceId,actorId}),retry:false,refetchOnWindowFocus:false});
 const dirty=Boolean(target&&!receipt&&!attempt&&(email.trim()||adminChosen||review));
 function canLeave(){if(flight.current)return false;return !dirty||window.confirm('Descartar a revisão deste convite?');}
 useBlocker({enableBeforeUnload:()=>flight.current||dirty,shouldBlockFn:()=>!canLeave()});
 function close(){if(!canLeave())return;setTarget(null);setReview(null);setReceipt(null);setEmail('');setAdminChosen(false);setError('');}
 function open(action:SlimInvitationAction,invitationId:string|null){
  if(!ready||!isOwner||flight.current||attempt||journalError)return;
  setTarget({action,invitationId});setReview(null);setReceipt(null);setEmail('');setAdminChosen(false);setError('');setLink(null);setNotice('');
 }
 function begin(){if(!ready||!isOwner||flight.current)throw new Error('Aguarde a operação atual ou reabra a sessão.');flight.current=true;setBusy(true);setError('');return epoch.current;}
 function finish(ticket:number){if(current(ticket)){flight.current=false;setBusy(false);}}
 async function refresh(){const ticket=epoch.current;try{await listQ.refetch();if(current(ticket))await onChanged?.();}catch(cause){if(current(ticket))setNotice(`Operação confirmada. Atualização da lista: ${readable(cause)}`);}}
 async function prepare(){
  if(!target||attempt)return;
  let ticket:number;
  try{if(target.action!=='revoke'&&!adminChosen)throw new Error('Escolha explicitamente o acesso administrativo completo, sem prazo.');if(target.action==='create')normalizeSlimInvitationEmail(email);ticket=begin();}catch(cause){setError(readable(cause));return;}
  try{
   const expected=target.action==='create'?{workspaceId,actorId,action:'create' as const,invitationId:null,email:normalizeSlimInvitationEmail(email)}:{workspaceId,actorId,action:target.action,invitationId:target.invitationId!};
   const result=validateSlimInvitationContext(await slimInvitationDeadline(()=>context({data:expected})),expected);
   if(!current(ticket))return;setReview(result);
  }catch(cause){if(current(ticket))setError(readable(cause));}finally{finish(ticket);}
 }
 function acceptReceipt(raw:unknown,ref:SlimInvitationAttempt,reviewed:SlimInvitationContext|null){
  const result=validateSlimInvitationReceipt(raw,ref);
  if(result.status==='confirmed'&&reviewed&&result.invitation?.email!==reviewed.email)throw new Error('O convite confirmado não corresponde ao e-mail revisado. Consulte a tentativa.');
  const saved=journal().read({workspaceId,actorId});if(!saved||!sameSlimInvitationAttempt(saved,ref))throw new Error('A referência local mudou. Confira a tentativa antes de continuar.');
  journal().clear(ref);setAttempt(null);setReceipt(result);setLink(null);
  if(result.status==='confirmed'){setNotice(result.action==='create'?'Convite gerado. Obtenha o link em “Copiar link”.':result.action==='renew'?'Convite renovado. O link anterior deixou de funcionar.':'Convite revogado. O acesso de membros existentes não foi alterado.');void refresh();}
  else setError(result.message??'A operação foi rejeitada. Nenhuma repetição foi enviada.');
 }
 async function confirm(){
  if(flight.current||!review?.canProceed||!target||attempt||receipt)return;
  let ticket:number,ref:SlimInvitationAttempt;
  try{ticket=begin();ref={workspaceId,actorId,requestId:crypto.randomUUID(),action:review.action,invitationId:review.invitationId};journal().begin(ref);setAttempt(ref);}catch(cause){flight.current=false;setBusy(false);setError(readable(cause));return;}
  const reviewed=review;
  try{
   const common={workspaceId,actorId,requestId:ref.requestId,expectedFingerprint:reviewed.expectedFingerprint,approved:true as const};
   const input=reviewed.action==='create'?{...common,action:'create' as const,payload:{email:normalizeSlimInvitationEmail(reviewed.email),accessRole:'admin' as const,accessDays:null}}:{...common,action:reviewed.action,payload:{invitationId:reviewed.invitationId!}};
   const result=await slimInvitationDeadline(()=>change({data:input}));
   if(!current(ticket))return;acceptReceipt(result,ref,reviewed);
  }catch(cause){if(current(ticket))setError(`${readable(cause)} A referência foi preservada. Consulte o resultado sem repetir a operação.`);}finally{finish(ticket);}
 }
 async function recover(){
  if(!attempt)return;let ticket:number;
  try{ticket=begin();}catch(cause){setError(readable(cause));return;}
  const ref=attempt;
  try{
   const saved=journal().read({workspaceId,actorId});if(!saved||!sameSlimInvitationAttempt(saved,ref))throw new Error('A referência local mudou. Reabra a página.');
   const input=ref.action==='create'?{...ref,action:'create' as const,invitationId:null,approved:true as const}:{...ref,action:ref.action,invitationId:ref.invitationId!,approved:true as const};
   const result=await slimInvitationDeadline(()=>lookup({data:input}));
   if(!current(ticket))return;acceptReceipt(result,ref,review);
  }catch(cause){if(current(ticket))setError(readable(cause));}finally{finish(ticket);}
 }
 async function copy(invitationId:string){
  if(attempt||journalError)return;let ticket:number;
  try{ticket=begin();setLink(null);setNotice('');}catch(cause){setError(readable(cause));return;}
  try{
   const expected={workspaceId,actorId,invitationId},result=validateSlimInvitationLink(await slimInvitationDeadline(()=>getLink({data:expected})),expected);
   if(!current(ticket))return;
   if(!result.inviteUrl||Date.parse(result.expiresAt)<=Date.now())throw new Error('O link não está válido. Atualize ou renove o convite.');
   setLink({invitationId,url:result.inviteUrl});
   if(!navigator.clipboard?.writeText)throw new Error('O navegador não permitiu copiar. Selecione o link exibido e copie manualmente.');
   await navigator.clipboard.writeText(result.inviteUrl);
   if(current(ticket))setNotice('Link copiado. Compartilhe-o com a pessoa convidada.');
  }catch(cause){if(current(ticket))setError(`Cópia não confirmada. ${readable(cause)}`);}finally{finish(ticket);}
 }
 const pendingVisible=Boolean(target&&attempt),locked=!ready||busy||Boolean(attempt)||Boolean(journalError),rows=listQ.data?.invitations??[];
 if(!isOwner)return <section className="rounded-xl border p-4 text-sm text-muted-foreground">Somente o dono da Vanessa Simoni pode gerenciar convites.</section>;
 return <section className="space-y-4" aria-label="Convites de parceiros" aria-busy={busy||listQ.isLoading}>
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Convites de parceiros</h2><p className="text-xs text-muted-foreground">Gere um link e compartilhe quando desejar. Nenhuma mensagem é enviada por este formulário.</p></div><div className="flex gap-2"><button type="button" className={button} disabled={locked||Boolean(listQ.error)} onClick={()=>open('create',null)}>Gerar convite</button><button type="button" className={button} disabled={!ready||busy} onClick={()=>void listQ.refetch()}>Atualizar convites</button></div></header>
  {identityError&&<p role="alert" className="text-sm text-destructive">{identityError}</p>}{!ready&&!identityError&&<p role="status" className="text-sm">Conferindo a sessão...</p>}
  {journalError&&<p role="alert" className="text-sm text-destructive">{journalError}</p>}
  {attempt&&!target&&<div className="rounded-lg border border-amber-500/40 p-4 space-y-2"><p className="text-sm">Existe uma tentativa de convite sem resultado confirmado.</p><p className="break-all text-xs">Referência: {attempt.requestId}</p><button type="button" className={button} disabled={!ready||busy} onClick={()=>{setTarget({action:attempt.action,invitationId:attempt.invitationId});setReceipt(null);setReview(null);setError('');}}>Conferir tentativa</button></div>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&!target&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {link&&<label className="block text-sm">Link obtido para o convite<input aria-label="Link do convite" className="mt-1 w-full rounded-md border bg-background p-2 text-xs" value={link.url} readOnly onFocus={event=>event.target.select()}/></label>}
  {listQ.error?<p role="alert" className="text-sm text-destructive">Não foi possível carregar os convites. {readable(listQ.error)}</p>:ready&&listQ.isLoading?<p role="status">Carregando convites...</p>:ready&&listQ.data&&rows.length===0?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum convite cadastrado.</p>:ready&&<div className="grid gap-3 xl:grid-cols-2">{rows.map(row=>{
   const eligible=slimInvitationEligible(row),pending=row.status==='pending',unconsumed=pending||row.status==='expired',expired=Date.parse(row.expiresAt)<=Date.now();
   return <article key={row.id} className="rounded-xl border p-4 space-y-3"><div><h3 className="break-words text-sm font-medium">{row.email}</h3><p className="text-xs text-muted-foreground">{eligible?'Parceiro técnico · acesso administrativo completo, sem prazo':'Acesso legado: confira o contrato antes de conceder novo acesso.'}</p><p className="mt-1 text-xs">{pending&&expired?'Link expirado':statuses[row.status]??row.status} · validade do link: {date(row.expiresAt)}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked||!pending||!eligible||expired} onClick={()=>void copy(row.id)}>Copiar link</button><button type="button" className={button} disabled={locked||!unconsumed||!eligible} onClick={()=>open('renew',row.id)}>Renovar</button><button type="button" className={`${button} text-destructive`} disabled={locked||!unconsumed} onClick={()=>open('revoke',row.id)}>Revogar</button></div></article>;
  })}</div>}
  <Dialog open={Boolean(target)&&ready} onOpenChange={openValue=>{if(!openValue)close();}}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{target?labels[target.action]:'Convite'}</DialogTitle><DialogDescription>Confira o destinatário, o acesso e o efeito da operação antes de confirmar.</DialogDescription></DialogHeader>
   {pendingVisible?<div className="space-y-3"><p className="text-sm">{busy?'Aguardando retorno do servidor...':'A tentativa precisa ser conferida. A consulta recupera o comprovante ou encerra uma tentativa que não foi executada, sem repetir a operação.'}</p>{review&&<p className="text-sm">Destinatário revisado: <strong>{review.email}</strong></p>}<p className="break-all text-xs">Referência: {attempt!.requestId}</p><button type="button" className={button} disabled={busy} onClick={()=>void recover()}>{busy?'Aguardando...':'Consultar resultado sem repetir'}</button></div>:receipt?<div className="space-y-3"><p role={receipt.status==='confirmed'?'status':'alert'} className="text-sm">{receipt.status==='confirmed'?'Operação confirmada pelo servidor.':receipt.message}</p>{receipt.invitation&&<p className="text-sm">{receipt.invitation.email} · {statuses[receipt.invitation.status]??receipt.invitation.status}</p>}{receipt.status==='confirmed'&&receipt.action!=='revoke'&&receipt.invitationId&&<button type="button" className={button} disabled={busy} onClick={()=>void copy(receipt.invitationId!)}>Copiar link</button>}</div>:review?<div className="space-y-3"><dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">E-mail</dt><dd className="break-words font-medium">{review.email??'Convite indisponível'}</dd></div><div><dt className="text-muted-foreground">Efeito</dt><dd>{review.action==='create'?`Gerar link válido por sete dias.${review.pendingToReplace?` Substituir ${review.pendingToReplace} convite(s) pendente(s), invalidando os links anteriores.`:''}`:review.action==='renew'?'Gerar um novo link válido por sete dias. O link anterior será invalidado.':'Invalidar o convite pendente. Membros existentes e seus acessos permanecem como estão.'}</dd></div>{review.action!=='revoke'&&<div><dt className="text-muted-foreground">Acesso escolhido</dt><dd className="font-medium">Administrativo completo, sem prazo. Ações exclusivas do dono permanecem exclusivas do dono. Um vínculo existente não será promovido.</dd></div>}</dl>{!review.canProceed&&<p role="alert" className="text-sm text-destructive">{review.reason}</p>}<div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={busy||!review.canProceed} onClick={()=>void confirm()}>Confirmar {review.action==='create'?'geração':review.action==='renew'?'renovação':'revogação'}</button><button type="button" className={button} disabled={busy} onClick={()=>{setReview(null);setError('');}}>Voltar e corrigir</button></div></div>:<form className="space-y-4" onSubmit={event=>{event.preventDefault();void prepare();}}>
    {target?.action==='create'&&<label className="block text-sm">E-mail do parceiro<input aria-label="E-mail do parceiro" type="email" autoComplete="email" required maxLength={200} className="mt-1 w-full rounded-md border bg-background p-2" value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label>}
    {target?.action!=='revoke'?<><label className="flex items-start gap-2 text-sm"><input aria-label="Conceder acesso administrativo completo sem prazo" type="checkbox" checked={adminChosen} disabled={busy} onChange={event=>setAdminChosen(event.target.checked)}/><span>Escolho acesso administrativo completo, sem prazo, para este parceiro.</span></label><p className="text-xs text-muted-foreground">Outros níveis de acesso e prazo não estão disponíveis neste fluxo porque ainda não são aplicados de forma uniforme no sistema. O link expira em sete dias; o acesso aceito não tem prazo.</p></>:<p className="text-sm">A próxima etapa mostrará o convite que será revogado. Essa operação não remove membros nem altera permissões existentes.</p>}
    <button type="submit" className={`${button} bg-primary text-primary-foreground`} disabled={busy||(target?.action!=='revoke'&&!adminChosen)}>{busy?'Conferindo...':'Revisar convite'}</button>
   </form>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&receipt&&<p role="status" className="text-sm">{notice}</p>}{link&&receipt&&<input aria-label="Link confirmado do convite" className="w-full rounded-md border bg-background p-2 text-xs" value={link.url} readOnly onFocus={event=>event.target.select()}/>}
   <button type="button" className={button} disabled={busy} onClick={close}>Fechar</button>
  </DialogContent></Dialog>
 </section>;
}
