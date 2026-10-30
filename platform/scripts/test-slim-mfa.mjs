import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createClient} from '@supabase/supabase-js';
import {createClientOnlyFn} from '@tanstack/start-fn-stubs';

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const bundled=buildSync({stdin:{contents:'export * from "./src/lib/slim-mfa.core.ts"; export * from "./src/lib/slim-mfa-transport.core.ts";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'}).outputFiles[0].text;
const box={exports:{}};Function('module','exports','require',bundled)(box,box.exports,require);const core=box.exports;
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`,actor=id(1),sessionId=id(2),other=id(3),otherSession=id(4),first=id(10),second=id(11),challengeId=id(20);
const secret='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',qr='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M0 0h20v20H0z"/></svg>';
const token=(who=actor,sid=sessionId,aal='aal1')=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:who,session_id:sid,aal,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic-signature`;
const factor=(i=first,status='unverified',extra={})=>({id:i,status,factor_type:'totp',friendly_name:'Autenticador sintético',...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const flush=async(n=5)=>{for(let i=0;i<n;i++)await new Promise(setImmediate)};
let count=0;const check=async(name,run)=>{await run();count++;console.log('PASS native MFA: '+name)};
function fixture(config={}){
 const state={who:actor,sid:sessionId,aal:config.aal??'aal1',factors:structuredClone(config.factors??[]),calls:[],listeners:new Set(),...config};
 const user=()=>({id:state.who,email:'operator@example.invalid',factors:structuredClone(state.factors)});
 const session=()=>state.who?{access_token:token(state.who,state.sid,state.aal),refresh_token:'synthetic-refresh',user:user()}:null;
 const invoke=(name,data,fn)=>{state.calls.push({name,data});return typeof state[name]==='function'?state[name](data,fn):fn()};
 const auth={
  getSession:()=>invoke('getSession',null,async()=>({data:{session:session()},error:null})),
  getUser:jwt=>invoke('getUser',jwt,async()=>({data:{user:user()},error:null})),
  onAuthStateChange(fn){state.listeners.add(fn);return{data:{subscription:{unsubscribe:()=>state.listeners.delete(fn)}}}},
  mfa:{
   getAuthenticatorAssuranceLevel:jwt=>invoke('aal',jwt,async()=>({data:{currentLevel:state.aal,nextLevel:state.aal},error:null})),
   enroll:input=>invoke('enroll',input,async()=>{state.factors.push(factor());return{data:{id:first,type:'totp',totp:{secret,qr_code:'data:image/svg+xml;utf-8,'+qr}},error:null}}),
   challenge:input=>invoke('challenge',input,async()=>({data:{id:challengeId},error:null})),
   verify:input=>invoke('verify',input,async()=>{state.factors.find(f=>f.id===input.factorId).status='verified';state.aal='aal2';state.listeners.forEach(fn=>fn('MFA_CHALLENGE_VERIFIED',session()));return{data:{user:user()},error:null}}),
   unenroll:input=>invoke('unenroll',input,async()=>{state.factors=state.factors.filter(f=>f.id!==input.factorId);return{data:{id:input.factorId},error:null}}),
  },
 };
 const controller=core.createSlimMfaController(auth,{deadlineMs:config.deadlineMs??20000});
 const switchTo=(who=other,sid=otherSession)=>{state.who=who;state.sid=sid;state.factors=[];state.aal='aal1';state.listeners.forEach(fn=>fn(who?'SIGNED_IN':'SIGNED_OUT',session()))};
 return{state,auth,controller,user,session,switchTo};
}
async function opened(config={}){const f=fixture(config);await f.controller.start();await flush();return f}
const mutations=f=>f.state.calls.filter(c=>['enroll','challenge','verify','unenroll'].includes(c.name));

await check('snapshot reads native factors and removes secret/account metadata from DTO',()=>{
 const result=core.normalizeSlimMfaSnapshot({id:actor,factors:[factor(first,'verified',{secret,phone:'hidden'})],app_metadata:{secret}},{currentLevel:'aal1'},actor);
 assert.equal(result.factors[0].status,'verified');assert.equal(result.currentLevel,'aal1');assert.equal(result.nextLevel,'aal2');assert(!JSON.stringify(result).includes(secret));assert(!JSON.stringify(result).includes('hidden'));
});
await check('last factor removed does not retain a fabricated next-level protection',()=>{const s=core.normalizeSlimMfaSnapshot({id:actor,factors:[]},{currentLevel:'aal2',nextLevel:'aal2'},actor);assert.equal(s.nextLevel,'aal1');assert.equal(s.verifiedCount,0)});
await check('invalid actor, duplicate factor and malformed response are rejected',()=>{for(const u of [{id:other,factors:[]},{id:actor,factors:[factor(),factor()]},{id:actor,factors:null}])assert.throws(()=>core.normalizeSlimMfaSnapshot(u,{currentLevel:'aal1'},actor))});
await check('other native factor types are preserved in assurance count and never offered for TOTP removal',()=>{const s=core.normalizeSlimMfaSnapshot({id:actor,factors:[factor(first,'verified',{factor_type:'phone'})]},{currentLevel:'aal1'},actor);assert.equal(s.verifiedCount,1);assert.equal(s.factors.length,0)});
await check('enrollment QR is self-contained and empty or external QR is rejected',()=>{const s=core.normalizeSlimMfaEnrollment({id:first,type:'totp',totp:{secret,qr_code:'data:image/svg+xml;utf-8,'+qr}});assert(s.qr.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg'));for(const v of ['', 'https://example.invalid/qr', 'data:text/html,wrong'])assert.throws(()=>core.normalizeSlimMfaEnrollment({id:first,type:'totp',totp:{secret,qr_code:v}}))});
await check('native errors are sanitized instead of exposing tokens, secret or code',()=>{const r=core.slimMfaMessage({message:secret,code:'unknown_secret_error'},true);assert(r.uncertain);assert(!r.message.includes(secret));assert(!r.message.includes('unknown_secret_error'))});
await check('opening the panel only reads the session and native user',async()=>{const f=await opened();assert.equal(f.controller.getState().phase,'ready');assert.equal(mutations(f).length,0);assert(f.state.calls.filter(c=>c.name==='getUser').every(c=>typeof c.data==='string'));f.controller.dispose()});
await check('a failed native read is unavailable and never means disabled',async()=>{const f=await opened({getUser:async()=>({data:{user:null},error:{status:503}})});assert.equal(f.controller.getState().phase,'unavailable');assert.equal(f.controller.getState().snapshot,null);assert.equal(mutations(f).length,0);f.controller.dispose()});
await check('explicit enrollment returns visible QR only after pending native factor is confirmed',async()=>{const f=await opened();await f.controller.enroll();const s=f.controller.getState();assert.equal(s.phase,'ready');assert.equal(s.enrollment.factorId,first);assert.equal(s.snapshot.factors[0].status,'unverified');assert.equal(mutations(f).length,1);f.controller.dispose()});
await check('existing pending enrollment cannot cause a second enroll after remount',async()=>{const f=await opened({factors:[factor()]});await f.controller.enroll();assert.equal(mutations(f).length,0);assert(f.controller.getState().message.includes('Já existe'));f.controller.dispose()});
await check('valid verification challenges one factor and confirms its actual session state',async()=>{const f=await opened({factors:[factor()]});await f.controller.verify(first,'123456');assert.deepEqual(mutations(f).map(c=>c.name),['challenge','verify']);assert.equal(mutations(f)[1].data.challengeId,challengeId);assert.equal(f.controller.getState().snapshot.currentLevel,'aal2');assert.equal(f.controller.getState().snapshot.factors[0].status,'verified');f.controller.dispose()});
await check('malformed code is rejected before a native challenge',async()=>{const f=await opened({factors:[factor()]});await f.controller.verify(first,'12345');assert.equal(mutations(f).length,0);assert(f.controller.getState().message.includes('seis'));f.controller.dispose()});
await check('wrong factor never reaches challenge or removal',async()=>{const f=await opened({factors:[factor()]});await f.controller.verify(second,'123456');await f.controller.remove(second,true);assert.equal(mutations(f).length,0);f.controller.dispose()});
await check('known invalid verification preserves pending enrollment and never claims success',async()=>{const f=await opened({verify:async()=>({data:null,error:{code:'mfa_verification_failed',status:422}})});await f.controller.enroll();await f.controller.verify(first,'123456');assert.equal(f.controller.getState().phase,'ready');assert.equal(f.controller.getState().enrollment.factorId,first);assert(f.controller.getState().message.includes('Código inválido'));f.controller.dispose()});
await check('removing a verified factor requires a verified session',async()=>{const f=await opened({factors:[factor(first,'verified')]});await f.controller.remove(first,true);assert.equal(mutations(f).length,0);assert(f.controller.getState().message.includes('Verifique a sessão'));f.controller.dispose()});
await check('individual removal requires explicit approval and preserves other factors',async()=>{const f=await opened({aal:'aal2',factors:[factor(first,'verified'),factor(second,'verified')]});await f.controller.remove(first,false);assert.equal(mutations(f).length,0);await f.controller.remove(first,true);assert.deepEqual(mutations(f).map(c=>c.data.factorId),[first]);assert.deepEqual(f.state.factors.map(f=>f.id),[second]);assert.equal(f.controller.getState().phase,'ready');f.controller.dispose()});
await check('native removal error is respected rather than reporting a local flag success',async()=>{const f=await opened({factors:[factor()],unenroll:async()=>({data:null,error:{status:403,code:'forbidden'}})});await f.controller.remove(first,true);assert.equal(f.state.factors.length,1);assert(!f.controller.getState().message.includes('remoção foi confirmada'));f.controller.dispose()});
await check('successful removal with divergent follow-up remains uncertain',async()=>{const f=await opened({factors:[factor()],unenroll:async()=>({data:{id:first},error:null})});await f.controller.remove(first,true);assert.equal(f.controller.getState().phase,'uncertain');assert.equal(f.controller.getState().pending.kind,'remove');f.controller.dispose()});
await check('timeout retains operation, performs no retry and lookup reconciles pending native factor',async()=>{const slow=deferred();const f=await opened({deadlineMs:35,enroll:async(_input,run)=>{const result=await run();await slow.promise;return result}});await f.controller.enroll();assert.equal(f.controller.getState().phase,'uncertain');assert.equal(mutations(f).length,1);assert.equal(f.controller.getState().enrollment,null);await f.controller.refresh();assert.equal(mutations(f).length,1);assert.equal(f.controller.getState().snapshot.factors[0].status,'unverified');slow.resolve();await flush();await f.controller.enroll();assert.equal(mutations(f).length,1);f.controller.dispose()});
await check('uncertain removal lookup confirms absence without replaying DELETE',async()=>{const f=await opened({factors:[factor()],unenroll:async(_input,run)=>{await run();throw new Error('network')}});await f.controller.remove(first,true);assert.equal(f.controller.getState().phase,'uncertain');await f.controller.refresh();assert.equal(f.controller.getState().phase,'ready');assert(f.controller.getState().message.includes('remoção foi confirmada'));assert.equal(mutations(f).length,1);f.controller.dispose()});
await check('actor change clears QR immediately and does not submit an old code',async()=>{const f=await opened();await f.controller.enroll();f.switchTo();assert.equal(f.controller.getState().enrollment,null);await flush();await f.controller.verify(first,'123456');assert.equal(f.controller.getState().actorId,other);assert.equal(mutations(f).length,1);f.controller.dispose()});
await check('late old-account result cannot unlock refresh for a new account',async()=>{const old=deferred(),newRead=deferred();const f=await opened({enroll:async(_i,run)=>{const r=await run();await old.promise;return r}});const operation=f.controller.enroll();await flush();f.state.getUser=async()=>{await newRead.promise;return{data:{user:f.user()},error:null}};f.switchTo();await flush();old.resolve();await operation;await flush();assert.equal(f.controller.getState().phase,'loading');await f.controller.enroll();assert.equal(mutations(f).length,1);newRead.resolve();await flush();assert.equal(f.controller.getState().actorId,other);assert.equal(f.controller.getState().phase,'ready');f.controller.dispose()});
await check('unmount erases enrollment data and ignores late completion',async()=>{const f=await opened();await f.controller.enroll();f.controller.dispose();assert.equal(f.controller.getState().enrollment,null);assert.equal(f.state.listeners.size,0)});

function lease(paths,extra={}){const signal=new AbortController();return{signal,close:core.beginSlimMfaTransport({actorId:actor,sessionId,signal:signal.signal,current:()=>true,deadline:Date.now()+20000,paths,...extra})}}
const headers={Authorization:'Bearer '+token()};
await check('MFA transport leaves password, refresh, REST and other fetch options untouched',async()=>{for(const url of ['https://example.invalid/auth/v1/token?grant_type=password','https://example.invalid/auth/v1/token?grant_type=refresh_token','https://example.invalid/rest/v1/leads']){const init={method:'POST',headers,body:'synthetic'},response=new Response('{}');let seen;assert.equal(await core.fetchSlimMfaWithDeadline(url,init,async(a,b)=>{seen=[a,b];return response}),response);assert.equal(seen[1],init)}});
await check('unscoped late MFA write fails before network',async()=>{let sent=0;await assert.rejects(core.fetchSlimMfaWithDeadline('https://example.invalid/auth/v1/factors',{method:'POST',headers},async()=>{sent++;return new Response('{}')}));assert.equal(sent,0)});
await check('MFA scope binds actor, session, method and the selected factor',async()=>{const l=lease([`DELETE /factors/${first}`]);let sent=0;try{for(const init of [{method:'DELETE',headers:{Authorization:'Bearer '+token(other,otherSession)}},{method:'POST',headers},{method:'DELETE',headers:{Authorization:'Bearer '+token(actor,otherSession)}}])await assert.rejects(core.fetchSlimMfaWithDeadline(`https://example.invalid/auth/v1/factors/${first}`,init,async()=>{sent++;return new Response('{}')}));await assert.rejects(core.fetchSlimMfaWithDeadline(`https://example.invalid/auth/v1/factors/${second}`,{method:'DELETE',headers},async()=>{sent++;return new Response('{}')}));assert.equal(sent,0)}finally{l.close()}});
await check('timeout aborts native fetch and cannot return a successful response',async()=>{const l=lease(['POST /factors'],{deadline:Date.now()+20});let aborted=false;try{await assert.rejects(core.fetchSlimMfaWithDeadline('https://example.invalid/auth/v1/factors',{method:'POST',headers},(_i,init)=>new Promise(resolve=>init.signal.addEventListener('abort',()=>{aborted=true;resolve(new Response('{}'))},{once:true}))));assert(aborted)}finally{l.close()}});
await check('actor change after response headers prevents verification body from reaching SDK',async()=>{let live=true;const l=lease([`POST /factors/${first}/verify`],{current:()=>live});try{await assert.rejects(core.fetchSlimMfaWithDeadline(`https://example.invalid/auth/v1/factors/${first}/verify`,{method:'POST',headers},async()=>{live=false;return new Response(JSON.stringify({access_token:'synthetic-sensitive-response'}))}))}finally{l.close()}});
await check('verification response for a different actor never reaches native session storage',async()=>{const l=lease([`POST /factors/${first}/verify`]);try{for(const value of [{user:{id:other},access_token:token(other,otherSession,'aal2')},{user:{id:actor},access_token:token(other,otherSession,'aal2')}])await assert.rejects(core.fetchSlimMfaWithDeadline(`https://example.invalid/auth/v1/factors/${first}/verify`,{method:'POST',headers},async()=>new Response(JSON.stringify(value))))}finally{l.close()}});
await check('oversized MFA response is rejected and never delivered to native session storage',async()=>{const l=lease(['POST /factors']);try{await assert.rejects(core.fetchSlimMfaWithDeadline('https://example.invalid/auth/v1/factors',{method:'POST',headers},async()=>new Response('x'.repeat(131073))))}finally{l.close()}});

function harness(f){
 const slots=[],effects=[];let cursor=0,tree,changed=false;
 const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i]))changed=true;slots[i]=next}]},useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i]},useEffect(fn,deps){const i=cursor++;if(!(i in slots)||!equal(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn()})}}};
 const src=fs.readFileSync(root+'src/components/settings/SlimMfaSettings.tsx','utf8');
 const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};Function('require','module','exports',compiled)(name=>name==='react'?hooks:name==='@tanstack/react-start'?{createClientOnlyFn}:name==='@/lib/slim-mfa.client'?{createBrowserSlimMfaController:()=>f.controller}:require(name),mod,mod.exports);
 const component=mod.exports.SlimMfaSettings;const props={makeController:()=>f.controller};
 const render=()=>{cursor=0;changed=false;tree=component(props);while(effects.length)effects.shift()()};
 const all=(node,out=[])=>{if(Array.isArray(node))node.forEach(n=>all(n,out));else if(React.isValidElement(node)){out.push(node);all(node.props.children,out)}return out};
 const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):String(node);
 const find=fn=>{const n=all(tree).find(fn);assert(n,'UI node missing');return n};
 return{render,async settle(){for(let i=0;i<10;i++){await flush(1);if(changed||!tree)render()}},text:()=>text(tree),html:()=>renderToStaticMarkup(tree),find,click(label){const n=find(n=>n.type==='button'&&text(n)===label);assert(!n.props.disabled,label+' disabled');n.props.onClick?.({preventDefault(){}})},code(value){find(n=>n.type==='input'&&n.props['aria-label']==='Código de seis números').props.onChange({target:{value}})},approve(){find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}})},submit(){find(n=>n.type==='form').props.onSubmit({preventDefault(){}})},unmount(){slots.forEach(s=>s?.cleanup?.())}};
}
async function panel(config={}){const f=fixture(config),h=harness(f);h.render();await h.settle();return{f,h}}
await check('real UI starts with a read and separates account factor from session assurance',async()=>{const{f,h}=await panel({factors:[factor(first,'verified')]});assert(h.text().includes('Autenticador cadastrado'));assert(h.text().includes('acesso convencional'));assert(!h.text().includes('AAL'));assert.equal(mutations(f).length,0);h.unmount()});
await check('real UI generates QR only after explicit review and displays it while pending',async()=>{const{f,h}=await panel();h.click('Adicionar autenticador');await h.settle();assert.equal(mutations(f).length,0);assert(h.text().includes('outras sessões'));h.click('Gerar QR para minha conta');await h.settle();assert(h.html().includes('data-slim-mfa-enrollment'));assert(h.html().includes('QR Code para cadastrar'));assert(h.text().includes(secret));assert.equal(mutations(f).length,1);h.unmount()});
await check('real UI requires code and acknowledgement before confirming a new factor',async()=>{const{f,h}=await panel({factors:[factor()]});h.click('Informar código');await h.settle();h.code('123456');await h.settle();h.submit();await h.settle();assert.equal(mutations(f).length,0);h.approve();await h.settle();h.submit();await h.settle();assert.deepEqual(mutations(f).map(c=>c.name),['challenge','verify']);assert(h.text().includes('sessão está verificada'));h.unmount()});
await check('real UI removal keeps other factors and returns to add flow after removal',async()=>{const{f,h}=await panel({factors:[factor()]});h.click('Remover');await h.settle();assert.equal(mutations(f).length,0);h.approve();await h.settle();h.click('Confirmar remoção');await h.settle();assert.equal(mutations(f).length,1);assert(h.text().includes('Adicionar autenticador'));h.unmount()});
await check('real UI clears QR and code when account changes',async()=>{const{f,h}=await panel();h.click('Adicionar autenticador');await h.settle();h.click('Gerar QR para minha conta');await h.settle();h.code('123456');await h.settle();f.switchTo();await h.settle();assert(!h.html().includes(secret));assert(!h.html().includes('123456'));assert(!h.html().includes('data-slim-mfa-enrollment'));assert.equal(mutations(f).length,1);h.unmount()});
await check('real UI marks unsupported methods unavailable without activation buttons',async()=>{const{h}=await panel();assert(h.text().includes('e-mail, SMS, passkeys e códigos de recuperação estão indisponíveis'));assert(h.text().includes('todos os acessos e operações'));assert(!h.html().includes('Gerar códigos'));assert(!h.html().includes('type="checkbox"'));h.unmount()});

await check('real Supabase SDK obeys selected-factor transport and persists only the verified synthetic session',async()=>{
 let factors=[],aal='aal1';const calls=[];
 const nativeUser=()=>({id:actor,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',created_at:'2026-10-18T00:00:00Z',factors});
 const body=()=>({access_token:token(actor,sessionId,aal),refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user:nativeUser()});
 const sdk=createClient('https://mfa-fixture.invalid','synthetic-publishable-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'slim-mfa-isolated-test'},global:{fetch:(input,init)=>core.fetchSlimMfaWithDeadline(input,init,async(url,request)=>{
  const path=new URL(String(url)).pathname,method=request.method??'GET';calls.push({path,method});let result;
  if(path==='/auth/v1/user')result=nativeUser();
  else if(path==='/auth/v1/factors'&&method==='POST'){factors=[factor()];result={id:first,type:'totp',totp:{secret,qr_code:qr}}}
  else if(path.endsWith('/challenge'))result={id:challengeId,type:'totp',expires_at:Math.floor(Date.now()/1000)+60};
  else if(path.endsWith('/verify')){factors[0].status='verified';aal='aal2';result=body()}
  else if(path===`/auth/v1/factors/${first}`&&method==='DELETE'){factors=[];result={id:first}}
  else throw Error('Unexpected synthetic route');
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 })}});
 const set=await sdk.auth.setSession(body());assert.equal(set.error,null);
 const c=core.createSlimMfaController(sdk.auth);await c.start();await flush(10);await c.enroll();assert.equal(c.getState().enrollment.factorId,first);await c.verify(first,'123456');assert.equal(c.getState().snapshot.currentLevel,'aal2');await c.remove(first,true);assert.equal(c.getState().snapshot.factors.length,0);assert.equal(calls.filter(r=>r.method==='DELETE').length,1);assert.equal(calls.filter(r=>r.path==='/auth/v1/factors').length,1);c.dispose();sdk.auth.stopAutoRefresh();
});

await check('server status no longer reads local MFA settings or silently converts read errors to disabled',async()=>{
 const src=fs.readFileSync(root+'src/lib/mfa.functions.ts','utf8');const start=src.indexOf('export const getMfaStatus'),end=src.indexOf('/** Envia um código',start);const scope=src.slice(start,end);assert(!scope.includes('.from('));assert(scope.includes('auth.getUser()'));assert(scope.includes('normalizeSlimMfaSnapshot'));
 const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const fn={middleware(){return this},inputValidator(){return this},handler(handler){return handler}};const mod={exports:{}};
 Function('require','module','exports',compiled)(name=>name==='@tanstack/react-start'?{createServerFn:()=>({...fn})}:name==='@/integrations/supabase/auth-middleware'?{requireSupabaseAuth:{}}:name==='./slim-mfa.core'?core:require(name),mod,mod.exports);
 const run=(response)=>mod.exports.getMfaStatus({context:{userId:actor,claims:{aal:'aal1'},supabase:{auth:{getUser:async()=>response}}}});
 const value=await run({data:{user:{id:actor,email:'synthetic@example.invalid',factors:[factor(first,'verified')]}},error:null});assert(value.totpEnabled);assert.equal(value.source,'native');assert.equal(value.currentLevel,'aal1');assert(value.unavailableMethods.includes('recovery_codes'));await assert.rejects(run({data:{user:null},error:{status:503}}));await assert.rejects(run({data:{user:{id:other,factors:[]}},error:null}));
});
await check('legacy security mounts the native panel and never mounts incomplete recovery controls',()=>{
 const src=fs.readFileSync(root+'src/legacy/configuracoes.legacy.tsx','utf8');const section=src.slice(src.indexOf('function TwoFactorSection('),src.indexOf('/* ---------- Chave de segurança / Passkey'));
 assert(section.includes('<SlimMfaSettings />'));assert(!section.includes('.mfa.enroll'));assert(src.includes('const recoveryAvailable = false;'));assert(src.includes('enabled: recoveryAvailable'));assert(src.includes('{recoveryAvailable && <div'));
 const client=fs.readFileSync(root+'src/integrations/supabase/client.ts','utf8');assert(client.includes('fetchSlimMfaWithDeadline(input, { ...init, headers }, fetchSlimAuthWithDeadline)'));assert(client.includes('persistSession: true'));assert(client.includes('autoRefreshToken: true'));
});
console.log(`${count}/${count} native MFA checks passed. Synthetic SDK, component and transport only; no real factors, sessions or accounts modified.`);
