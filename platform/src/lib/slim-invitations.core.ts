/** Versioned invitation contracts. This module never reads accounts or performs a side effect. */
export const SLIM_INVITATION_WORKSPACE_ID = '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698';
export type SlimInvitationAction = 'create' | 'renew' | 'revoke';
export type SlimInvitationIdentity = {workspaceId:string;actorId:string};
export type SlimInvitationAttempt = SlimInvitationIdentity & {requestId:string;action:SlimInvitationAction;invitationId:string|null};
export type SlimInvitationListItem = {id:string;email:string;accessRole:string|null;accessDays:number|null;roleType:string|null;isPartner:boolean;status:string;expiresAt:string;createdAt:string;acceptedAt:string|null};
export type SlimInvitationSummary = SlimInvitationListItem & {revision:string};
export type SlimInvitationContext = SlimInvitationIdentity & {version:1;action:SlimInvitationAction;email:string|null;invitationId:string|null;expectedFingerprint:string;invitation:SlimInvitationSummary|null;pendingToReplace:number;canProceed:boolean;reason:string|null;requiredAccess:{accessRole:'admin';accessDays:null}};
export type SlimInvitationReceipt = SlimInvitationIdentity & {version:1;requestId:string;action:SlimInvitationAction;targetId:string|null;invitationId:string|null;status:'confirmed'|'rejected';invitation:SlimInvitationSummary|null;code?:string;message?:string};
export type SlimInvitationLink = SlimInvitationIdentity & {version:1;invitationId:string;token:string;expiresAt:string;revision:string;inviteUrl?:string};
export type SlimInvitationPreview = {version:1;status:'invalid';code?:string} | {version:1;status:'valid';workspaceId:string;invitationId:string;workspaceName:string;email:string;accessRole:string|null;accessDays:number|null;isPartner:boolean;invitationStatus:string;expiresAt:string};
export type SlimInvitationAcceptance = SlimInvitationIdentity & {version:1;invitationId:string|null;status:'accepted'|'already_member'|'already_accepted'|'pending'|'rejected';acceptedAt:string|null;membershipRole:string|null;activeWorkspaceId:string|null;code?:string;message?:string};

function fail(message='Resposta de convite incompatível. Consulte o resultado antes de continuar.'):never {throw new Error(message);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail();return value as Record<string,unknown>;}
function string(value:unknown,max=1000):string {if(typeof value!=='string'||!value.trim()||value.length>max)fail();return value;}
function nullableString(value:unknown,max=1000):string|null{return value===null?null:string(value,max);}
function bool(value:unknown):boolean {if(typeof value!=='boolean')fail();return value;}
function integer(value:unknown):number {if(!Number.isSafeInteger(value)||Number(value)<0)fail();return Number(value);}
function timestamp(value:unknown):string {const s=string(value,80);if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))fail();return s;}
function nullableTimestamp(value:unknown):string|null {return value===null?null:timestamp(value);}
export function slimInvitationUuid(value:unknown):string {const s=string(value,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s))fail('Identificador de convite inválido.');return s.toLowerCase();}
function nullableUuid(value:unknown):string|null{return value===null?null:slimInvitationUuid(value);}
export function normalizeSlimInvitationEmail(value:unknown):string {const s=string(value,200).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Informe um e-mail válido.');return s;}
function action(value:unknown):SlimInvitationAction {if(value!=='create'&&value!=='renew'&&value!=='revoke')fail('Ação de convite inválida.');return value;}
function fingerprint(value:unknown):string {const s=string(value,128);if(!/^[a-f0-9]{32,128}$/.test(s))fail();return s;}
export function slimInvitationIdentity(value:unknown):SlimInvitationIdentity {const r=object(value),workspaceId=slimInvitationUuid(r.workspaceId),actorId=slimInvitationUuid(r.actorId);if(workspaceId!==SLIM_INVITATION_WORKSPACE_ID)fail('Esta operação pertence à Vanessa Simoni.');return {workspaceId,actorId};}
export function slimInvitationAttempt(value:unknown):SlimInvitationAttempt {const r=object(value),identity=slimInvitationIdentity(r),operation=action(r.action),invitationId=nullableUuid(r.invitationId);if((operation==='create')!==(invitationId===null))fail('Alvo da tentativa de convite incompatível.');return {...identity,requestId:slimInvitationUuid(r.requestId),action:operation,invitationId};}
function matchingIdentity(value:Record<string,unknown>,expected:SlimInvitationIdentity):SlimInvitationIdentity {const actual=slimInvitationIdentity(value),wanted=slimInvitationIdentity(expected);if(actual.workspaceId!==wanted.workspaceId||actual.actorId!==wanted.actorId)fail('A resposta pertence a outra empresa ou usuário.');return actual;}
function version(r:Record<string,unknown>){if(r.version!==1)fail();}
function accessDays(value:unknown):number|null {if(value===null)return null;const days=integer(value);if(days<1||days>3650)fail();return days;}
function requiredAccess(value:unknown):{accessRole:'admin';accessDays:null}{const r=object(value);if(r.accessRole!=='admin'||r.accessDays!==null)fail('O acesso administrativo sem prazo precisa ser escolhido explicitamente.');return {accessRole:'admin',accessDays:null};}
export function slimInvitationEligible(value:Pick<SlimInvitationListItem,'accessRole'|'accessDays'|'isPartner'|'roleType'>):boolean {return value.accessRole==='admin'&&value.accessDays===null&&value.isPartner===true&&value.roleType==='parceiro';}
export function validateSlimInvitationListItem(value:unknown):SlimInvitationListItem {const r=object(value);return {id:slimInvitationUuid(r.id),email:normalizeSlimInvitationEmail(r.email),accessRole:nullableString(r.accessRole,60),accessDays:accessDays(r.accessDays),roleType:nullableString(r.roleType,60),isPartner:bool(r.isPartner),status:string(r.status,40),expiresAt:timestamp(r.expiresAt),createdAt:timestamp(r.createdAt),acceptedAt:nullableTimestamp(r.acceptedAt)};}
export function validateSlimInvitationSummary(value:unknown):SlimInvitationSummary {const r=object(value);return {...validateSlimInvitationListItem(r),revision:fingerprint(r.revision)};}
export function validateSlimInvitationList(value:unknown,expected:SlimInvitationIdentity):SlimInvitationIdentity & {version:1;invitations:SlimInvitationListItem[]} {const r=object(value);version(r);const identity=matchingIdentity(r,expected);if(!Array.isArray(r.invitations))fail();const invitations=r.invitations.map(validateSlimInvitationListItem);if(new Set(invitations.map(i=>i.id)).size!==invitations.length)fail('A lista de convites mudou durante a leitura. Atualize a lista.');return {version:1,...identity,invitations};}
export function validateSlimInvitationContext(value:unknown,expected:SlimInvitationIdentity & {action:SlimInvitationAction;email?:string;invitationId?:string|null}):SlimInvitationContext {
 const r=object(value);version(r);const identity=matchingIdentity(r,expected),operation=action(r.action),invitationId=nullableUuid(r.invitationId),email=r.email===null?null:normalizeSlimInvitationEmail(r.email),canProceed=bool(r.canProceed),reason=nullableString(r.reason);
 if(operation!==expected.action||invitationId!==(expected.invitationId??null)||(expected.email!==undefined&&email!==normalizeSlimInvitationEmail(expected.email)))fail('O contexto não corresponde ao convite revisado.');
 const invitation=r.invitation===null?null:validateSlimInvitationSummary(r.invitation);
 if(invitationId!==null&&invitation&&invitation.id!==invitationId)fail();
 if(operation!=='create'&&canProceed&&!invitation)fail();
 if(canProceed&&email===null)fail();
 if(!canProceed&&!reason)fail();
 if(canProceed&&operation==='renew'&&(!invitation||!slimInvitationEligible(invitation)||!['pending','expired'].includes(invitation.status)))fail();
 return {version:1,...identity,action:operation,email,invitationId,expectedFingerprint:fingerprint(r.expectedFingerprint),invitation,pendingToReplace:integer(r.pendingToReplace),canProceed,reason,requiredAccess:requiredAccess(r.requiredAccess)};
}
export function validateSlimInvitationReceipt(value:unknown,expected:SlimInvitationAttempt):SlimInvitationReceipt {
 const r=object(value);version(r);const wanted=slimInvitationAttempt(expected),identity=matchingIdentity(r,wanted),operation=action(r.action),targetId=nullableUuid(r.targetId),invitationId=nullableUuid(r.invitationId),requestId=slimInvitationUuid(r.requestId);
 if(operation!==wanted.action||targetId!==wanted.invitationId||requestId!==wanted.requestId)fail('O recibo não corresponde à tentativa de convite.');
 if(r.status!=='confirmed'&&r.status!=='rejected')fail();
 const invitation=r.invitation===null?null:validateSlimInvitationSummary(r.invitation);
 if(invitation&&(invitation.id!==invitationId))fail();
 if(operation!=='create'&&invitationId!==null&&invitationId!==targetId)fail();
 if(r.status==='confirmed'){
  if(!invitationId||!invitation)fail('A confirmação não contém o convite persistido.');
  if(operation==='revoke'){if(invitation.status!=='revoked')fail();}
  else if(invitation.status!=='pending'||!slimInvitationEligible(invitation))fail('O acesso confirmado difere do acesso revisado.');
  return {version:1,...identity,requestId,action:operation,targetId,invitationId,status:'confirmed',invitation};
 }
 return {version:1,...identity,requestId,action:operation,targetId,invitationId,status:'rejected',invitation,code:string(r.code,80),message:string(r.message,1000)};
}
export function validateSlimInvitationLink(value:unknown,expected:SlimInvitationIdentity & {invitationId:string}):SlimInvitationLink {
 const r=object(value);version(r);const identity=matchingIdentity(r,expected),invitationId=slimInvitationUuid(r.invitationId);if(invitationId!==slimInvitationUuid(expected.invitationId))fail('O link pertence a outro convite.');
 const result:SlimInvitationLink={version:1,...identity,invitationId,token:slimInvitationUuid(r.token),expiresAt:timestamp(r.expiresAt),revision:fingerprint(r.revision)};
 if(r.inviteUrl!==undefined){const url=new URL(string(r.inviteUrl,2048));if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!==`/convite/${result.token}`)fail('Link de convite inválido.');result.inviteUrl=url.href;}
 return result;
}
export function validateSlimInvitationPreview(value:unknown):SlimInvitationPreview {
 const r=object(value);version(r);if(r.status==='invalid')return {version:1,status:'invalid',...(r.code===undefined?{}:{code:string(r.code,80)})};
 if(r.status!=='valid'||slimInvitationUuid(r.workspaceId)!==SLIM_INVITATION_WORKSPACE_ID)fail('Prévia de convite incompatível.');
 return {version:1,status:'valid',workspaceId:SLIM_INVITATION_WORKSPACE_ID,invitationId:slimInvitationUuid(r.invitationId),workspaceName:string(r.workspaceName,240),email:normalizeSlimInvitationEmail(r.email),accessRole:nullableString(r.accessRole,60),accessDays:accessDays(r.accessDays),isPartner:bool(r.isPartner),invitationStatus:string(r.invitationStatus,40),expiresAt:timestamp(r.expiresAt)};
}
export function validateSlimInvitationAcceptance(value:unknown,expected:SlimInvitationIdentity & {invitationId:string;mode:'accept'|'lookup'}):SlimInvitationAcceptance {
 const r=object(value);version(r);const identity=matchingIdentity(r,expected),invitationId=nullableUuid(r.invitationId),acceptedAt=nullableTimestamp(r.acceptedAt),membershipRole=nullableString(r.membershipRole,60),activeWorkspaceId=nullableUuid(r.activeWorkspaceId);
 if(!['accepted','already_member','already_accepted','pending','rejected'].includes(String(r.status)))fail();
 if(invitationId!==slimInvitationUuid(expected.invitationId)&&!(r.status==='rejected'&&invitationId===null))fail('O resultado pertence a outro convite.');
 const status=r.status as SlimInvitationAcceptance['status'];
 if(status==='accepted'||status==='already_member'||status==='already_accepted'){
  if(!invitationId||!acceptedAt||!membershipRole)fail('O aceite não confirmou um vínculo vigente.');
  if(expected.mode==='accept'&&activeWorkspaceId!==identity.workspaceId)fail('O aceite não confirmou a seleção da Vanessa Simoni. Consulte o resultado.');
 }
 if(status==='pending'&&(expected.mode!=='lookup'||acceptedAt!==null))fail();
 return {version:1,...identity,invitationId,status,acceptedAt,membershipRole,activeWorkspaceId,...(status==='rejected'?{code:string(r.code,80),message:string(r.message,1000)}:{})};
}

/** A deadline settles once. It never starts a second send or accepts a late success. */
export function slimInvitationDeadline<T>(send:()=>PromiseLike<T>|T,{timeoutMs=25000,setTimer=setTimeout,clearTimer=clearTimeout}:{timeoutMs?:number;setTimer?:typeof setTimeout;clearTimer?:typeof clearTimeout}={}):Promise<T>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>25000)throw new Error('Prazo de convite inválido.');
 return new Promise<T>((resolve,reject)=>{let settled=false;const timer=setTimer(()=>{if(settled)return;settled=true;reject(new Error('A resposta do convite não chegou no prazo. Consulte o resultado da mesma tentativa.'));},timeoutMs);Promise.resolve().then(()=>{if(settled)return;return send();}).then(value=>{if(settled)return;settled=true;clearTimer(timer);resolve(value as T);},error=>{if(settled)return;settled=true;clearTimer(timer);reject(error);});});
}
type InvitationStore={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void};
export function sameSlimInvitationAttempt(a:SlimInvitationAttempt,b:SlimInvitationAttempt):boolean{return a.workspaceId===b.workspaceId&&a.actorId===b.actorId&&a.requestId===b.requestId&&a.action===b.action&&a.invitationId===b.invitationId;}
/** One key per company and actor; switching identity never erases the prior actor's recoverable reference. */
export function createSlimInvitationJournal({storage,key}:{storage:InvitationStore;key:string}){
 const keyParts=/^saude-slim:invitations:pending:v1:([^:]+):([^:]+)$/.exec(key);
 if(!keyParts)fail('A referência precisa estar vinculada à empresa e ao usuário.');
 const bound=slimInvitationIdentity({workspaceId:keyParts[1],actorId:keyParts[2]});
 function scoped(value:unknown):SlimInvitationAttempt {const next=slimInvitationAttempt(value);matchingIdentity(next,bound);return next;}
 function stored():SlimInvitationAttempt|null {const raw=storage.getItem(key);if(raw===null)return null;let r:Record<string,unknown>;try{r=object(JSON.parse(raw));}catch{fail('Referência de convite inválida. Atualize a sessão antes de continuar.');}if(r.version!==1||Object.keys(r).some(k=>!['version','workspaceId','actorId','requestId','action','invitationId'].includes(k)))fail('Referência de convite inválida.');return scoped(r);}
 function read(identity:SlimInvitationIdentity):SlimInvitationAttempt|null {const wanted=slimInvitationIdentity(identity),old=stored();return old&&old.workspaceId===wanted.workspaceId&&old.actorId===wanted.actorId?old:null;}
 return {read,begin(value:SlimInvitationAttempt){const next=scoped(value),old=stored();if(old&&!sameSlimInvitationAttempt(old,next))fail('Existe uma tentativa de convite pendente. Consulte o resultado antes de continuar.');storage.setItem(key,JSON.stringify({version:1,...next}));const saved=read(next);if(!saved||!sameSlimInvitationAttempt(saved,next))fail('Não foi possível preservar a referência. Nenhum convite foi enviado.');},clear(value:SlimInvitationAttempt){const expected=scoped(value),old=stored();if(!old)return;if(!sameSlimInvitationAttempt(old,expected))fail('Outra tentativa está pendente. A referência foi preservada.');storage.removeItem(key);if(stored())fail('Não foi possível limpar a referência. Consulte o resultado antes de continuar.');},reset(){storage.removeItem(key);if(storage.getItem(key)!==null)fail('Não foi possível limpar a referência da sessão anterior.');}};
}
