import {createFileRoute,useBlocker} from '@tanstack/react-router';
import {useEffect,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {supabase} from '@/integrations/supabase/client';
import {previewSlimInvitation,acceptSlimInvitation} from '@/lib/slim-invitations.functions';
import {slimInvitationDeadline,slimInvitationUuid,validateSlimInvitationAcceptance,validateSlimInvitationPreview,type SlimInvitationAcceptance,type SlimInvitationPreview} from '@/lib/slim-invitations.core';

export const Route=createFileRoute('/convite/$token')({head:()=>({meta:[{title:'Convite · Vanessa Simoni'}]}),component:ConvitePage});
function ConvitePage(){const {token}=Route.useParams();return <SlimInvitationAcceptPage key={token} token={token}/>;}
type User={id:string;email:string;confirmed:boolean};
const readable=(value:unknown)=>value instanceof Error?value.message:'Não foi possível conferir o convite.';
const terminal=(result:SlimInvitationAcceptance)=>['accepted','already_member','already_accepted'].includes(result.status);
const button='w-full rounded-md border px-4 py-2.5 text-sm font-medium disabled:opacity-50';

export function SlimInvitationAcceptPage({token}:{token:string}){
 const load=useServerFn(previewSlimInvitation),accept=useServerFn(acceptSlimInvitation);
 const [preview,setPreview]=useState<SlimInvitationPreview|null>(null),[loading,setLoading]=useState(true),[previewError,setPreviewError]=useState(''),[reload,setReload]=useState(0);
 const [user,setUser]=useState<User|null>(null),[authLoading,setAuthLoading]=useState(true),[authError,setAuthError]=useState('');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[result,setResult]=useState<SlimInvitationAcceptance|null>(null),[error,setError]=useState('');
 const live=useRef(false),pageEpoch=useRef(0),authEpoch=useRef(0),actor=useRef<string|null>(null),flight=useRef(false),currentToken=useRef(token);currentToken.current=token;
 const current=(page:number,identityVersion?:number,actorId?:string)=>live.current&&page===pageEpoch.current&&currentToken.current===token&&(identityVersion===undefined||identityVersion===authEpoch.current)&&(actorId===undefined||actorId===actor.current);
 useEffect(()=>{
  live.current=true;const page=++pageEpoch.current;authEpoch.current++;actor.current=null;flight.current=false;
  setPreview(null);setPreviewError('');setLoading(true);setUser(null);setAuthLoading(true);setAuthError('');setBusy(false);setUncertain(false);setResult(null);setError('');
  let authEvents=0,userRead=0;
  const syncUser=(id:string|null)=>{
   if(!current(page))return;
   if(actor.current!==id){actor.current=id;authEpoch.current++;flight.current=false;setBusy(false);setUncertain(false);setResult(null);setError('');setUser(null);}
   const read=++userRead;setAuthError('');
   if(!id){setUser(null);setAuthLoading(false);return;}setAuthLoading(true);
   // Leave the auth callback before requesting the verified user.
   void Promise.resolve().then(()=>supabase.auth.getUser()).then(({data,error})=>{
    if(!current(page)||read!==userRead||actor.current!==id)return;
    if(error)throw error;if(!data.user||data.user.id!==id)throw new Error('A sessão mudou. Entre novamente para conferir o convite.');
    setUser({id:data.user.id,email:(data.user.email??'').trim().toLowerCase(),confirmed:Boolean(data.user.email_confirmed_at)});setAuthLoading(false);
   }).catch(cause=>{if(current(page)&&read===userRead){setUser(null);setAuthLoading(false);setAuthError(readable(cause));}});
  };
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{authEvents++;syncUser(session?.user.id??null);});
  const before=authEvents;
  void supabase.auth.getSession().then(({data,error})=>{if(!current(page)||before!==authEvents)return;if(error)throw error;syncUser(data.session?.user.id??null);}).catch(cause=>{if(current(page)){setAuthLoading(false);setAuthError(readable(cause));}});
  let validToken:string;
  try{validToken=slimInvitationUuid(token);}catch{setPreviewError('Este link de convite é inválido.');setLoading(false);return()=>{live.current=false;pageEpoch.current++;data.subscription.unsubscribe();};}
  void slimInvitationDeadline(()=>load({data:{token:validToken}})).then(value=>{if(current(page))setPreview(validateSlimInvitationPreview(value));}).catch(cause=>{if(current(page))setPreviewError(readable(cause));}).finally(()=>{if(current(page))setLoading(false);});
  return()=>{live.current=false;pageEpoch.current++;authEpoch.current++;data.subscription.unsubscribe();};
 },[token,load,reload]);
 useBlocker({enableBeforeUnload:()=>flight.current,shouldBlockFn:()=>flight.current});
 async function submit(mode:'accept'|'lookup'){
  if(flight.current||!user||authLoading||preview?.status!=='valid')return;
  const page=pageEpoch.current,identityVersion=authEpoch.current,actorId=user.id;
  if(!user.confirmed||user.email!==preview.email){setError('Entre com o e-mail confirmado indicado no convite.');return;}
  flight.current=true;setBusy(true);setError('');setResult(null);
  const expected={workspaceId:preview.workspaceId,actorId,invitationId:preview.invitationId,mode};
  try{
   const input=mode==='accept'?{...expected,mode:'accept' as const,token:slimInvitationUuid(token),approved:true as const}:{...expected,mode:'lookup' as const,token:slimInvitationUuid(token)};
   const raw=await slimInvitationDeadline(()=>accept({data:input}));
   if(!current(page,identityVersion,actorId))return;
   const confirmed=validateSlimInvitationAcceptance(raw,expected);setResult(confirmed);
   if(confirmed.status==='rejected'){setUncertain(false);setError(confirmed.message??'O convite não pôde ser aceito.');}
   else if(confirmed.status==='pending'){setUncertain(true);setError('A consulta confirmou que este convite ainda está pendente. Nenhum novo aceite foi enviado. Confira o acesso e confirme abaixo se desejar aceitar.');}
   else{
    setUncertain(false);
    if(terminal(confirmed)&&confirmed.membershipRole&&confirmed.activeWorkspaceId===confirmed.workspaceId){
     flight.current=false;setBusy(false);
     // Reload after a confirmed company selection, discarding the former permission cache.
     window.location.assign('/saude-slim');
    }
   }
  }catch(cause){if(current(page,identityVersion,actorId)){setUncertain(true);setError(`${readable(cause)} Consulte o resultado antes de aceitar novamente.`);}}
  finally{if(current(page,identityVersion,actorId)){flight.current=false;setBusy(false);}}
 }
 function signin(){const next=`/convite/${slimInvitationUuid(token)}`;window.location.assign(`/auth?${new URLSearchParams({next}).toString()}`);}
 const invitation=preview?.status==='valid'?preview:null;
 const eligible=Boolean(invitation&&invitation.accessRole==='admin'&&invitation.accessDays===null&&invitation.isPartner);
 const emailMatches=Boolean(user&&invitation&&user.email===invitation.email),expired=Boolean(invitation&&Date.parse(invitation.expiresAt)<=Date.now());
 const confirmed=Boolean(result&&terminal(result)),rejected=result?.status==='rejected';
 const pendingAfterLookup=result?.status==='pending'&&eligible&&invitation?.invitationStatus==='pending'&&!expired;
 return <main className="grid min-h-screen place-items-center bg-background p-6"><section className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-xl" aria-busy={loading||busy}>
  <header><h1 className="text-lg font-semibold">Convite · Vanessa Simoni</h1><p className="mt-1 text-sm text-muted-foreground">Confira o acesso antes de aceitar.</p></header>
  {loading&&<p role="status" className="text-sm">Carregando convite...</p>}
  {previewError&&<div className="space-y-2"><p role="alert" className="text-sm text-destructive">Não foi possível verificar o convite. {previewError}</p><button type="button" className={button} disabled={busy} onClick={()=>setReload(value=>value+1)}>Conferir convite novamente</button></div>}
  {preview?.status==='invalid'&&<p role="alert" className="text-sm text-destructive">Este convite não é válido. Peça ao administrador um link atual.</p>}
  {invitation&&<>
   <dl className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm"><div><dt className="text-muted-foreground">Empresa</dt><dd className="font-medium">{invitation.workspaceName}</dd></div><div><dt className="text-muted-foreground">E-mail convidado</dt><dd className="break-words font-medium">{invitation.email}</dd></div><div><dt className="text-muted-foreground">Acesso aprovado para um novo vínculo</dt><dd>{eligible?'Parceiro técnico · administrativo completo, sem prazo':'Acesso incompatível com este fluxo. Peça um novo convite ao administrador.'}</dd></div><div><dt className="text-muted-foreground">Validade do link</dt><dd>{new Date(invitation.expiresAt).toLocaleString('pt-BR')}</dd></div></dl>
   {eligible&&<p className="text-xs text-muted-foreground">O link tem validade; o acesso aceito não tem prazo. Ações exclusivas do dono permanecem exclusivas do dono. Se você já for membro, seu papel atual será preservado.</p>}
   {authLoading?<p role="status" className="text-sm">Conferindo sua sessão...</p>:authError?<p role="alert" className="text-sm text-destructive">{authError}</p>:!user?<div className="space-y-3"><p className="text-sm">Entre com o e-mail indicado para aceitar. A criação de contas é feita pelo administrador da Vanessa Simoni.</p><button type="button" className={`${button} bg-primary text-primary-foreground`} onClick={signin}>Entrar para aceitar</button></div>:!emailMatches?<p role="alert" className="text-sm text-destructive">Você entrou como {user.email}. Saia e entre com {invitation.email} para conferir este convite.</p>:!user.confirmed?<p role="alert" className="text-sm text-destructive">O e-mail da sua conta precisa estar confirmado antes do aceite. Solicite ajuda ao administrador.</p>:confirmed?<div className="space-y-3"><p role="status" className="text-sm">{result?.status==='already_member'?'Seu vínculo existente foi preservado.':'Aceite confirmado. Seu vínculo está vigente.'}</p>{result?.activeWorkspaceId!==invitation.workspaceId&&<><p className="text-sm">A Vanessa Simoni ainda não está selecionada nesta sessão.</p><button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={busy} onClick={()=>void submit('accept')}>Entrar na Vanessa Simoni</button></>}</div>:uncertain?<div className="space-y-3"><p className="text-sm">Consulte o aceite desta mesma pessoa e deste convite. A consulta não cria acesso nem seleciona outra empresa.</p><button type="button" className={button} disabled={busy} onClick={()=>void submit('lookup')}>{busy?'Conferindo...':'Consultar resultado sem repetir'}</button>{pendingAfterLookup&&<button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={busy} onClick={()=>void submit('accept')}>Aceitar convite após conferência</button>}</div>:rejected?<p className="text-sm">Peça ao administrador para conferir o convite e o vínculo da sua conta.</p>:!eligible?<p role="alert" className="text-sm text-destructive">Este convite não tem a aprovação de acesso exigida.</p>:invitation.invitationStatus==='accepted'?<button type="button" className={button} disabled={busy} onClick={()=>void submit('lookup')}>Consultar acesso ao convite</button>:invitation.invitationStatus!=='pending'?<p role="alert" className="text-sm text-destructive">Este convite não está disponível para aceite.</p>:expired?<p role="alert" className="text-sm text-destructive">Este link expirou. Peça ao administrador para renovar o convite.</p>:<div className="space-y-3"><p className="text-sm">Ao aceitar, você confirma o acesso indicado e entra na Vanessa Simoni.</p><button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={busy} onClick={()=>void submit('accept')}>{busy?'Confirmando aceite...':'Aceitar convite'}</button></div>}
  </>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section></main>;
}
