// Execute real component bodies/events and the real request schemas with synthetic IO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import React from 'react';
import ts from 'typescript';
import {z} from 'zod';
import * as core from '../src/lib/slim-invitations.core.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ws=core.SLIM_INVITATION_WORKSPACE_ID,id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`,actor=id(1),other=id(2),invitationId=id(3),token=id(4),requestId=id(5),email='parceiro@example.invalid',fingerprint='a'.repeat(64);
const expiry=new Date(Date.now()+7*86400000).toISOString(),createdAt='2026-10-18T00:00:00Z';
const summary={id:invitationId,email,accessRole:'admin',accessDays:null,roleType:'parceiro',isPartner:true,status:'pending',expiresAt:expiry,createdAt,acceptedAt:null,revision:fingerprint};
const preview={version:1,status:'valid',workspaceId:ws,invitationId,workspaceName:'Saúde Slim',email,accessRole:'admin',accessDays:null,isPartner:true,invitationStatus:'pending',expiresAt:expiry};
const user={id:actor,email,email_confirmed_at:createdAt};
const pendingRef={workspaceId:ws,actorId:actor,requestId,action:'create',invitationId:null};
const key=(who=actor)=>`saude-slim:invitations:pending:v1:${ws}:${who}`;
function storage(){const rows=new Map();return {rows,getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const functionSource=read('src/lib/slim-invitations.functions.ts');
const schemas=Function('z','normalizeSlimInvitationEmail',functionSource.slice(functionSource.indexOf('const uuid='),functionSource.indexOf('const authenticated='))+'\nreturn {ContextSchema,ChangeSchema,LookupSchema,LinkSchema,AcceptSchema,scope};')(z,core.normalizeSlimInvitationEmail);
let dialogs;
function all(node,result=[]){if(Array.isArray(node)){node.forEach(n=>all(n,result));return result;}if(React.isValidElement(node)){result.push(node);if(node.type===dialogs.Dialog&&!node.props.open)return result;all(node.props.children,result);}return result;}
function textOf(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(textOf).join('');if(React.isValidElement(node)){if(node.type===dialogs.Dialog&&!node.props.open)return '';return textOf(node.props.children);}return String(node);}
const plain=tag=>function Plain(props){return React.createElement(tag,props,props.children);};
dialogs={Dialog:plain('div'),DialogContent:plain('section'),DialogHeader:plain('header'),DialogTitle:plain('h2'),DialogDescription:plain('p')};

function harness(file,name,props,config={}){
 const store=config.store??storage(),calls=[],copies=[],navigations=[],refreshes=[],listeners=new Set(),timers=new Map(),cache=new Map(),queries=new Map(),slots=[],effects=[];
 let cursor=0,tree,currentProps=props,changed=false,authUser=config.user===undefined?{...user}:config.user,nextTimer=0,blocker;
 const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i]))changed=true;slots[i]=value;}];},useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},useMemo(fn,deps){const i=cursor++;if(!(i in slots)||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},useEffect(fn,deps){const i=cursor++;if(!(i in slots)||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const deadline=send=>core.slimInvitationDeadline(send,{setTimer:(fn,ms)=>{assert.equal(ms,25000);const id=++nextTimer;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id)});
 const response=(name,data,fallback)=>{calls.push({name,data:structuredClone(data)});return config[name]?config[name](data):fallback();};
 const api={
  listSlimInvitations:async({data})=>{z.object(schemas.scope).strict().parse(data);return response('list',data,()=>({version:1,...data,invitations:config.rows??[{...summary}]}));},
  getSlimInvitationContext:async({data})=>{schemas.ContextSchema.parse(data);return response('context',data,()=>({version:1,workspaceId:data.workspaceId,actorId:data.actorId,action:data.action,email:data.email??email,invitationId:data.invitationId??null,expectedFingerprint:fingerprint,invitation:data.action==='create'?null:{...summary},pendingToReplace:config.pendingToReplace??0,canProceed:true,reason:null,requiredAccess:{accessRole:'admin',accessDays:null}}));},
  changeSlimInvitation:async({data})=>{schemas.ChangeSchema.parse(data);return response('change',data,()=>({version:1,workspaceId:data.workspaceId,actorId:data.actorId,requestId:data.requestId,action:data.action,targetId:data.action==='create'?null:data.payload.invitationId,invitationId,status:'confirmed',invitation:{...summary,email:data.action==='create'?data.payload.email:email,status:data.action==='revoke'?'revoked':'pending'}}));},
  lookupSlimInvitationChange:async({data})=>{schemas.LookupSchema.parse(data);return response('lookup',data,()=>({version:1,workspaceId:data.workspaceId,actorId:data.actorId,requestId:data.requestId,action:data.action,targetId:data.invitationId,invitationId:data.invitationId,status:'rejected',invitation:null,code:'attempt_closed',message:'Tentativa encerrada sem execução.'}));},
  getSlimInvitationLink:async({data})=>{schemas.LinkSchema.parse(data);return response('link',data,()=>({version:1,...data,token,expiresAt:expiry,revision:fingerprint,inviteUrl:`https://slimesaude.com/convite/${token}`}));},
  previewSlimInvitation:async({data})=>{z.object({token:z.string().uuid()}).strict().parse(data);return response('preview',data,()=>structuredClone(preview));},
  acceptSlimInvitation:async({data})=>{schemas.AcceptSchema.parse(data);return response('accept',data,()=>({version:1,workspaceId:ws,actorId:data.actorId,invitationId:data.invitationId,status:data.mode==='accept'?'accepted':'already_accepted',acceptedAt:createdAt,membershipRole:'admin',activeWorkspaceId:ws}));},
 };
 globalThis.window={localStorage:store,location:{assign:value=>navigations.push(value)},confirm:()=>config.discard!==false};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copies.push(value);if(config.clipboard)return config.clipboard(value);}}}});
 const auth={getSession:async()=>config.session?config.session():({data:{session:authUser?{user:authUser}:null},error:null}),getUser:async()=>config.getUser?config.getUser():({data:{user:authUser},error:null}),onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}};
 const queryClient={invalidateQueries:async value=>{refreshes.push(value);}};
 const useQuery=options=>{
  const queryKey=JSON.stringify(options.queryKey);if(!queries.has(queryKey))queries.set(queryKey,{data:undefined,error:null,isLoading:false,started:false});const q=queries.get(queryKey);
  if(!q.refetch)q.refetch=async()=>{try{q.data=await options.queryFn();q.error=null;return {data:q.data};}catch(error){q.error=error;return {error};}finally{q.isLoading=false;changed=true;}};
  if(options.enabled!==false&&!q.started){q.started=true;q.isLoading=true;effects.push(()=>{void q.refetch();});}return q;
 };
 const inert=()=>null,unexpected=()=>{throw new Error('Unexpected operation outside invitation UI');};
 const mocks={react:hooks,'@tanstack/react-start':{useServerFn:fn=>fn},'@tanstack/react-query':{useQuery,useQueryClient:()=>queryClient,useMutation:()=>({mutate:unexpected,isPending:false})},'@tanstack/react-router':{useBlocker:options=>{blocker=options;},createFileRoute:()=>options=>({...options,useParams:()=>({token})})},'@/components/ui/dialog':dialogs,'@/integrations/supabase/client':{supabase:{auth}},'@/lib/slim-invitations.functions':api,'@/lib/slim-invitations.core':{...core,slimInvitationDeadline:deadline}};
 function evaluate(source,filename,extra={}){
  const module={exports:{}};const compiled=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}});assert(!compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error),'Invalid TSX '+filename);
  Function('require','module','exports','React','bindings',compiled.outputText)(name=>{
   if(name in mocks)return mocks[name];if(/\.functions(?:\.tsx?)?$/.test(name))throw new Error('Missing explicit server-function mock: '+name);
   if(!name.startsWith('.')&&!name.startsWith('@/'))return require(name);const base=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(filename),name),target=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert(target,'Missing source '+name);return load(target);
  },module,module.exports,React,extra);return module.exports;
 }
 function load(relative){const filename=path.isAbsolute(relative)?relative:path.join(root,relative);if(cache.has(filename))return cache.get(filename);const result=evaluate(fs.readFileSync(filename,'utf8'),filename);cache.set(filename,result);return result;}
 let Component;
 if(file==='legacy'){
  const source=read('src/legacy/configuracoes.legacy.tsx'),start=source.indexOf('function EquipeTab('),end=source.indexOf('/* ---------- Faturamento ---------- */',start),roles=source.slice(source.indexOf('const PAPEIS ='),source.indexOf('type GroupDef ='));
  const extra={...require('lucide-react'),...hooks,useServerFn:fn=>fn,useQuery,useQueryClient:()=>queryClient,useMutation:()=>({mutate:unexpected,isPending:false}),SectionHeader:inert,Btn:plain('button'),GhostBtn:plain('button'),Field:plain('label'),Inp:plain('input'),UserPermissionsDialog:inert,SlimInvitationsPanel:inert,listWorkSectors:async()=>({sectors:[]}),removeMember:unexpected,updateMemberRole:unexpected,createEmployee:unexpected};
  const names=['useState','useServerFn','useQuery','useQueryClient','useMutation','Users','Wrench','MailPlus','UserPlus','Clock','Crown','Search','KeyRound','Trash2','Send','AlertCircle','Check','SectionHeader','Btn','GhostBtn','Field','Inp','UserPermissionsDialog','SlimInvitationsPanel','listWorkSectors','removeMember','updateMemberRole','createEmployee'];
  Component=evaluate(`const {${names.join(',')}}=bindings;\n${roles}\n${source.slice(start,end)}\nexport {EquipeTab,InviteDialog};`,path.join(root,'src/legacy/configuracoes.legacy.tsx'),extra)[name];
 }else Component=load(file)[name];
 assert(Component,'Missing component '+name);
 const render=()=>{cursor=0;changed=false;tree=Component(currentProps);};
 const flush=()=>{for(let round=0;round<20;round++){const batch=effects.splice(0);batch.forEach(run=>run());if(!changed&&!effects.length)return;render();}throw new Error('Unstable invitation component effects');};
 const find=predicate=>{const node=all(tree).find(predicate);assert(node,'Missing expected element in '+name);return node;};
 render();flush();
 return {calls,copies,navigations,refreshes,store,timers,get tree(){return tree;},get blocker(){return blocker;},text:()=>textOf(tree),all:predicate=>all(tree).filter(predicate),find,
  render(){render();flush();},update(next){currentProps={...currentProps,...next};render();flush();},
  click(label){const node=find(n=>(n.type==='button'||typeof n.type==='function')&&textOf(n.props.children)===label&&typeof n.props.onClick==='function');assert(!node.props.disabled,'Disabled: '+label);const result=node.props.onClick();render();flush();return result;},
  field(label,value){const node=find(n=>n.props['aria-label']===label);assert(!node.props.disabled);node.props.onChange({target:{value,checked:value}});render();flush();},
  submit(){const node=find(n=>n.type==='form');node.props.onSubmit({preventDefault(){}});render();flush();},
  emit(next){authUser=next;for(const listener of [...listeners])listener(next?'SIGNED_IN':'SIGNED_OUT',next?{user:next}:null);render();flush();},
  expire(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}},unmount(){for(const slot of slots)slot?.cleanup?.();},
 };
}
async function settle(h){for(let n=0;n<45;n++){await Promise.resolve();h.render();}}
async function owner(config={},props={}){const h=harness('src/components/settings/SlimInvitationsPanel.tsx','SlimInvitationsPanel',{workspaceId:ws,actorId:actor,isOwner:true,onChanged:()=>{},...props},config);await settle(h);return h;}
async function page(config={},props={}){const h=harness('src/routes/convite.$token.tsx','SlimInvitationAcceptPage',{token,...props},config);await settle(h);return h;}
async function reviewCreate(h){h.click('Gerar convite');h.field('E-mail do parceiro',' Parceiro@example.invalid ');h.field('Conceder acesso administrativo completo sem prazo',true);h.submit();await settle(h);}
const received=(data,patch={})=>({version:1,workspaceId:ws,actorId:data.actorId,requestId:data.requestId,action:data.action,targetId:data.action==='create'?null:data.payload?.invitationId??data.invitationId,invitationId,status:'confirmed',invitation:{...summary},...patch});
const accepted=(data,patch={})=>({version:1,workspaceId:ws,actorId:data.actorId,invitationId:data.invitationId,status:'accepted',acceptedAt:createdAt,membershipRole:'admin',activeWorkspaceId:ws,...patch});
let count=0;async function test(name,run){await run();count++;console.log('PASS invitations UI: '+name);}

await test('owner must select admin explicitly and review real replacement effects before any change',async()=>{
 const h=await owner({pendingToReplace:2});h.click('Gerar convite');assert.equal(h.find(n=>n.props.type==='checkbox').props.checked,false);h.field('E-mail do parceiro',email);h.submit();await settle(h);assert.equal(h.calls.filter(c=>c.name==='context').length,0);assert.equal(h.calls.filter(c=>c.name==='change').length,0);h.field('Conceder acesso administrativo completo sem prazo',true);h.submit();await settle(h);assert(h.text().includes('Substituir 2 convite(s)'));assert(h.text().includes('Administrativo completo, sem prazo'));assert.equal(h.calls.filter(c=>c.name==='change').length,0);h.unmount();
});
await test('actual strict change schema accepts one reviewed command and link is fetched separately',async()=>{
 const h=await owner();await reviewCreate(h);const click=h.find(n=>n.type==='button'&&textOf(n.props.children)==='Confirmar geração').props.onClick;click();click();await settle(h);const writes=h.calls.filter(c=>c.name==='change');assert.equal(writes.length,1);assert.deepEqual(writes[0].data.payload,{email,accessRole:'admin',accessDays:null});assert.equal(writes[0].data.approved,true);assert.equal(writes[0].data.expectedFingerprint,fingerprint);assert(!('invitationId'in writes[0].data));assert.equal(h.store.getItem(key()),null);assert.equal(h.calls.filter(c=>c.name==='link').length,0);assert.equal(h.copies.length,0);h.unmount();
});
await test('uncertain creation preserves reviewed email and opaque reference until explicit lookup',async()=>{
 const h=await owner({change:()=>{throw Error('offline');}});await reviewCreate(h);h.click('Confirmar geração');await settle(h);const saved=JSON.parse(h.store.getItem(key()));assert.deepEqual(Object.keys(saved).sort(),['version','workspaceId','actorId','requestId','action','invitationId'].sort());assert(!JSON.stringify(saved).includes(email));assert(h.text().includes(email));assert.equal(h.calls.filter(c=>c.name==='lookup').length,0);h.click('Consultar resultado sem repetir');await settle(h);assert.equal(h.calls.filter(c=>c.name==='change').length,1);assert.equal(h.calls.find(c=>c.name==='lookup').data.approved,true);assert.equal(h.store.getItem(key()),null);assert(h.text().includes('Tentativa encerrada sem execução'));h.unmount();
});
await test('deadline rejects once and late confirmed response cannot erase journal or show success',async()=>{
 const wire=deferred();let sent;const h=await owner({change:data=>{sent=data;return wire.promise;}});await reviewCreate(h);h.click('Confirmar geração');await settle(h);h.expire();await settle(h);assert(h.store.getItem(key()));assert(h.text().includes('prazo'));wire.resolve(received(sent));await settle(h);assert(h.store.getItem(key()));assert(!h.text().includes('Operação confirmada pelo servidor'));assert.equal(h.calls.filter(c=>c.name==='change').length,1);h.unmount();
});
await test('storage failure blocks before change and malformed receipt preserves the attempt',async()=>{
 const broken=storage();broken.setItem=()=>{throw Error('quota');};const a=await owner({store:broken});await reviewCreate(a);a.click('Confirmar geração');await settle(a);assert.equal(a.calls.filter(c=>c.name==='change').length,0);assert(a.text().includes('quota'));a.unmount();
 const h=await owner({change:data=>received(data,{actorId:other})});await reviewCreate(h);h.click('Confirmar geração');await settle(h);assert(h.store.getItem(key()));assert(!h.text().includes('Operação confirmada pelo servidor'));h.unmount();
});
await test('existing pending reference survives remount and another actor uses a separate key',async()=>{
 const store=storage();store.setItem(key(),JSON.stringify({version:1,...pendingRef}));const a=await owner({store});assert(a.text().includes('Conferir tentativa'));assert.equal(a.calls.filter(c=>c.name==='lookup').length,0);a.emit({...user,id:other});assert(store.getItem(key()));assert(!a.text().includes('Conferir tentativa'));a.unmount();
 const b=await owner({store,user:{...user,id:other}},{actorId:other});await reviewCreate(b);b.click('Confirmar geração');await settle(b);assert.equal(b.calls.filter(c=>c.name==='change').length,1);assert(store.getItem(key()));assert.equal(store.getItem(key(other)),null);b.unmount();const c=await owner({store});assert(c.text().includes('Conferir tentativa'));c.unmount();
});
await test('copy validates fetched link and waits for clipboard; denial never announces copied',async()=>{
 const clip=deferred(),h=await owner({clipboard:()=>clip.promise});h.click('Copiar link');await settle(h);assert.equal(h.calls.filter(c=>c.name==='link').length,1);assert.equal(h.copies.length,1);assert(!h.text().includes('Link copiado.'));clip.resolve();await settle(h);assert(h.text().includes('Link copiado.'));h.unmount();
 const denied=await owner({clipboard:()=>{throw Error('Permissão negada');}});denied.click('Copiar link');await settle(denied);assert(denied.text().includes('Cópia não confirmada'));assert(!denied.text().includes('Link copiado.'));assert(denied.find(n=>n.props['aria-label']==='Link do convite').props.value.includes('/convite/'));denied.unmount();
});
await test('late link after actor change never reaches clipboard or displayed state',async()=>{
 const wire=deferred(),h=await owner({link:()=>wire.promise});h.click('Copiar link');await settle(h);h.emit({...user,id:other});wire.resolve({version:1,workspaceId:ws,actorId:actor,invitationId,token,expiresAt:expiry,revision:fingerprint,inviteUrl:`https://slimesaude.com/convite/${token}`});await settle(h);assert.equal(h.copies.length,0);assert(!h.text().includes(token));h.unmount();
});
await test('renewal requires access choice; revocation requires a server review',async()=>{
 const h=await owner();h.click('Renovar');assert.equal(h.find(n=>n.props.type==='checkbox').props.checked,false);h.field('Conceder acesso administrativo completo sem prazo',true);h.submit();await settle(h);assert(h.text().includes('O link anterior será invalidado'));assert.equal(h.calls.filter(c=>c.name==='change').length,0);h.click('Confirmar renovação');await settle(h);assert.equal(h.calls.find(c=>c.name==='change').data.action,'renew');h.unmount();
 const r=await owner();r.click('Revogar');r.submit();await settle(r);assert(r.text().includes('Membros existentes e seus acessos permanecem'));assert.equal(r.calls.filter(c=>c.name==='change').length,0);r.click('Confirmar revogação');await settle(r);assert.equal(r.calls.find(c=>c.name==='change').data.action,'revoke');r.unmount();
});
await test('legacy and consumed invites cannot renew; explicit expired compatible invite can',async()=>{
 for(const row of [{...summary,accessRole:null},{...summary,status:'accepted'},{...summary,status:'revoked'}]){const h=await owner({rows:[row]});assert(h.find(n=>n.type==='button'&&textOf(n.props.children)==='Renovar').props.disabled);h.unmount();}const h=await owner({rows:[{...summary,status:'expired'}]});assert.equal(h.find(n=>n.type==='button'&&textOf(n.props.children)==='Renovar').props.disabled,false);h.unmount();
});
await test('list failure is not empty success and non-owner does not load invitations',async()=>{
 const h=await owner({list:()=>{throw Error('Indisponível');}});assert(h.text().includes('Não foi possível carregar os convites'));assert(!h.text().includes('Nenhum convite cadastrado'));h.unmount();const n=await owner({}, {isOwner:false});assert.equal(n.calls.length,0);assert(n.text().includes('Somente o dono'));n.unmount();
});
await test('anonymous invite offers only existing-account login with exact next',async()=>{
 const h=await page({user:null});assert(h.text().includes('criação de contas é feita pelo administrador'));assert(!h.text().includes('Criar conta'));h.click('Entrar para aceitar');const url=new URL(h.navigations[0],'https://slimesaude.com');assert.equal(url.pathname,'/auth');assert.equal(url.searchParams.get('next'),`/convite/${token}`);assert.equal(h.calls.filter(c=>c.name==='accept').length,0);h.unmount();
});
await test('wrong or unconfirmed email cannot accept, and preview outage is not invalid invitation',async()=>{
 for(const auth of [{...user,email:'outra@example.invalid'},{...user,email_confirmed_at:null}]){const h=await page({user:auth});assert.equal(h.all(n=>n.type==='button'&&textOf(n.props.children)==='Aceitar convite').length,0);assert.equal(h.calls.filter(c=>c.name==='accept').length,0);h.unmount();}const h=await page({preview:()=>{throw Error('Serviço indisponível');}});assert(h.text().includes('Não foi possível verificar o convite'));assert(!h.text().includes('Este convite não é válido'));h.unmount();
});
await test('explicit valid acceptance reloads only after a complete matching receipt',async()=>{
 const wire=deferred(),h=await page({accept:()=>wire.promise});const event=h.find(n=>n.type==='button'&&textOf(n.props.children)==='Aceitar convite').props.onClick;event();event();await settle(h);assert.equal(h.calls.filter(c=>c.name==='accept').length,1);assert.equal(h.navigations.length,0);const sent=h.calls.find(c=>c.name==='accept').data;assert.equal(sent.mode,'accept');assert.equal(sent.approved,true);wire.resolve(accepted(sent));await settle(h);assert.deepEqual(h.navigations,['/saude-slim']);assert.equal(h.blocker.shouldBlockFn(),false);h.unmount();
});
await test('acceptance uncertainty uses lookup and never silently resends acceptance',async()=>{
 let attempts=0;const h=await page({accept:data=>{if(data.mode==='accept'){if(++attempts===1)throw Error('offline');return accepted(data);}return accepted(data,{status:'pending',acceptedAt:null,membershipRole:null,activeWorkspaceId:null});}});h.click('Aceitar convite');await settle(h);assert.equal(h.calls.filter(c=>c.name==='accept').length,1);h.click('Consultar resultado sem repetir');await settle(h);assert.deepEqual(h.calls.filter(c=>c.name==='accept').map(c=>c.data.mode),['accept','lookup']);assert.equal(h.calls.find(c=>c.name==='accept'&&c.data.mode==='lookup').data.approved,undefined);assert.equal(h.navigations.length,0);assert(h.text().includes('Nenhum novo aceite foi enviado'));assert(h.text().includes('Aceitar convite após conferência'));await settle(h);assert.equal(h.calls.filter(c=>c.name==='accept').length,2);h.click('Aceitar convite após conferência');await settle(h);assert.deepEqual(h.calls.filter(c=>c.name==='accept').map(c=>c.data.mode),['accept','lookup','accept']);assert.equal(h.calls.filter(c=>c.name==='accept').at(-1).data.approved,true);assert.deepEqual(h.navigations,['/saude-slim']);h.unmount();
});
await test('lookup with another active company requires explicit entry and does not promote old role',async()=>{
 const h=await page({preview:()=>({...preview,invitationStatus:'accepted'}),accept:data=>accepted(data,{status:'already_member',membershipRole:'member',activeWorkspaceId:data.mode==='lookup'?id(90):ws})});h.click('Consultar acesso ao convite');await settle(h);assert.equal(h.navigations.length,0);assert(h.text().includes('Seu vínculo existente foi preservado'));h.click('Entrar na Saúde Slim');await settle(h);assert.deepEqual(h.calls.filter(c=>c.name==='accept').map(c=>c.data.mode),['lookup','accept']);assert.deepEqual(h.navigations,['/saude-slim']);h.unmount();
});
await test('foreign or incomplete acceptance receipt never navigates',async()=>{
 for(const patch of [{actorId:other},{invitationId:id(80)},{membershipRole:null},{activeWorkspaceId:id(90)}]){const h=await page({accept:data=>accepted(data,patch)});h.click('Aceitar convite');await settle(h);assert.equal(h.navigations.length,0);assert(h.text().includes('Consultar resultado sem repetir'));h.unmount();}
});
await test('late acceptance after token or actor change cannot navigate',async()=>{
 for(const kind of ['actor','token']){const wire=deferred(),h=await page({accept:()=>wire.promise});h.click('Aceitar convite');await settle(h);const sent=h.calls.find(c=>c.name==='accept').data;if(kind==='actor')h.emit({...user,id:other});else h.update({token:id(70)});wire.resolve(accepted(sent));await settle(h);assert.equal(h.navigations.length,0);assert(!h.text().includes('Aceite confirmado.'));h.unmount();}
});
await test('late preview cannot replace the preview of a newer token',async()=>{
 const wire=deferred(),h=await page({preview:data=>data.token===token?wire.promise:{...preview,invitationId:id(70),email:'atual@example.invalid'}});h.update({token:id(70)});await settle(h);wire.resolve(preview);await settle(h);assert(h.text().includes('atual@example.invalid'));assert(!h.text().includes('E-mail convidadoparceiro@example.invalid'));h.unmount();
});
await test('legacy team shows actual admin role and keeps that partner in Admins filter',async()=>{
 const bundle={profile:{id:actor},workspace:{id:ws},workspaceId:ws,actorId:actor,canManageInvitations:true,members:[{user_id:id(20),role:'admin',role_type:'parceiro',is_partner:true,access_expires_at:null,created_at:createdAt,profile:{display_name:'Parceiro administrador',email}}],invitations:[]};
 const h=harness('legacy','EquipeTab',{bundle,isOwner:true,onToast:()=>{}});await settle(h);assert(h.text().includes('Parceiro técnico · Administrador · sem prazo'));h.click('Admins');assert(h.text().includes('Parceiro administrador'));assert(!h.text().includes('Nenhuma pessoa encontrada'));h.unmount();
});
await test('existing administrative account form keeps its original submission payload',async()=>{
 const sent=[],h=harness('legacy','InviteDialog',{onClose:()=>{},onCreate:value=>sent.push(value),loading:false});await settle(h);
 const set=(predicate,value)=>{h.find(predicate).props.onChange({target:{value}});h.render();};
 set(n=>n.props.placeholder==='Nome do usuário','Usuário sintético');set(n=>n.props.placeholder==='usuario@empresa.com','usuario@example.invalid');set(n=>n.props.placeholder==='Defina uma senha inicial','synthetic-only-password');set(n=>n.props.placeholder==='Nome do primeiro setor (ex.: Comercial)','Comercial');h.submit();assert.deepEqual(sent,[{email:'usuario@example.invalid',password:'synthetic-only-password',full_name:'Usuário sintético',role_type:'funcionario',modules:[],sector_id:null,sector_name:'Comercial'}]);assert.equal(h.calls.length,0);h.unmount();
});
delete globalThis.window;delete globalThis.navigator;
console.log(`${count}/${count} invitation UI checks passed. Actual components/request schemas, synthetic transports only; no real account, invitation, access change or outbound message.`);
