import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createClient as nativeCreateClient} from '@supabase/supabase-js';

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
function load(file,modules={}){
 const source=fs.readFileSync(root+file,'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};Function('require','module','exports',code)(name=>Object.hasOwn(modules,name)?modules[name]:require(name),mod,mod.exports);return mod.exports;
}
const core=load('src/lib/slim-session-security.core.ts');
const actor='aaaaaaaa-aaaa-4aaa-8aaa-000000000001',session='aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const token=[{alg:'HS256',typ:'JWT'},{sub:actor,session_id:session,role:'authenticated',aud:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.synthetic-signature';
const decision=(message)=>({data:null,error:{code:'42501',message,details:'synthetic-sensitive-details',hint:'synthetic-sensitive-hint'}});
const success={data:true,error:null};
let total=0;async function check(name,fn){await fn();total++;console.log('PASS session security: '+name)};

function fixture(result=success,options={}){
 const events=[],clients=[];
 const request=new Request('https://app.example.invalid/api/synthetic',{headers:{Authorization:'Bearer '+token}});
 const user={id:actor,aud:'authenticated',role:'authenticated',created_at:'2026-10-18T00:00:00Z',factors:[]};
 const authResult=()=>options.invalidAuth?{data:{user:null},error:{status:401,message:'invalid synthetic token'}}:{data:{user},error:null};
 const send=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url),headers=new Headers(init?.headers);
  assert.equal(url.origin,'https://security-fixture.invalid');
  assert.equal(headers.get('Authorization'),'Bearer '+token);
  if(url.pathname==='/auth/v1/user'){events.push({kind:'auth'});return Response.json(options.invalidAuth?{message:'invalid synthetic token',code:'bad_jwt'}:user,{status:options.invalidAuth?401:200})}
  if(url.pathname==='/rest/v1/rpc/slim_assert_session_security'){
   events.push({kind:'guard',method:init.method,body:init.body,signal:init.signal});
   if(options.sendGuard)return options.sendGuard(init);
   return Response.json(result.error??result.data,{status:result.error?options.rpcStatus??403:200});
  }
  if(url.pathname==='/rest/v1/user_roles'){events.push({kind:'roles'});return Response.json([{role:'admin'}])}
  if(url.pathname==='/rest/v1/rpc/partner_program_is_admin'){events.push({kind:'admin-role'});return Response.json(options.notAdmin!==true)}
  if(url.pathname==='/rest/v1/rpc/partner_program_request_payout'){events.push({kind:'payout'});return Response.json('synthetic-payout-id')}
  if(url.pathname==='/rest/v1/rpc/partner_program_verify_payment_profile'){events.push({kind:'verify-payment'});return Response.json(true)}
  throw Error('Unexpected synthetic route '+url.pathname);
 };
 const createClient=(url,key,opts)=>{
  assert.equal(url,'https://security-fixture.invalid');assert.equal(key,'sb_publishable_synthetic_only');
  assert.equal(opts.auth.persistSession,false);assert.equal(opts.auth.autoRefreshToken,false);
  const client=nativeCreateClient(url,key,{...opts,auth:{...opts.auth,detectSessionInUrl:false},global:{...opts.global,fetch:send}});clients.push(client);return client;
 };
 const caller=createClient('https://security-fixture.invalid','sb_publishable_synthetic_only',{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const profile={id:'synthetic-profile',verification_status:options.unverified?'pending':'verified',document_last4:'0000',pix_key_last4:'0000'};
 const assertGuard=()=>{assert(events.some(e=>e.kind==='guard'),'admin data accessed before session guard');assert.equal(result.data,true);assert.equal(result.error,null)};
 const admin={auth:{getUser:async value=>{assert.equal(value,token);events.push({kind:'admin-auth'});return authResult()}},from(name){assertGuard();events.push({kind:'admin-read',name});const q={select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:profile,error:null}),then(resolve,reject){return Promise.resolve({data:[profile],error:null}).then(resolve,reject)}};return q},rpc:async(name,input)=>{assertGuard();events.push({kind:'admin-write',name,input});return{data:'synthetic-profile',error:null}}};
 const modules={
  '@supabase/supabase-js':{createClient},'@/lib/slim-session-security.core':core,
  '@/integrations/supabase/saude-slim-env':{resolveServerSupabaseEnv:()=>{if(options.envFailure)throw Error('synthetic-secret-env-error');return{url:'https://security-fixture.invalid',publishableKey:'sb_publishable_synthetic_only'}}},
  './saude-slim-env':{resolveServerSupabaseEnv:()=>({url:'https://security-fixture.invalid',publishableKey:'sb_publishable_synthetic_only'})},
  '@tanstack/react-start/server':{getRequest:()=>request},
  '@tanstack/start-client-core':{createMiddleware:()=>{const m={client(fn){this.clientHandler=fn;return this},server(fn){this.serverHandler=fn;return this}};return m}},
  '@tanstack/react-start':{createServerFn:()=>({handler:fn=>fn})},
  '@tanstack/react-router':{createFileRoute:()=>config=>config},
  '@/integrations/supabase/client.server':{supabaseAdmin:admin},
  '@/lib/slim-chat-membership.core':{assertSlimChatMembership:async()=>{}},
  './client':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:token}},error:null})}}},
 };
 return{events,caller,modules,request,clients,admin};
}
const isCode=code=>error=>error instanceof core.SlimSessionSecurityError&&error.code===code&&!error.message.includes('synthetic-sensitive');

await check('real SDK calls only the argument-free security RPC with the original JWT',async()=>{const f=fixture();assert.equal(await core.assertSlimSessionSecurity(f.caller),true);assert.equal(f.events.length,1);assert.equal(f.events[0].method,'POST');assert.equal(f.events[0].body,'{}');assert(f.events[0].signal instanceof AbortSignal)});
await check('only boolean true can authorize; truthy, absent and structured results fail closed',async()=>{for(const data of [false,null,'true',1,[],{allowed:true},[true]])await assert.rejects(core.assertSlimSessionSecurity(fixture({data,error:null}).caller),isCode('SLIM_SECURITY_UNAVAILABLE'))});
await check('MFA required is mapped only from exact SQLSTATE and message',async()=>{await assert.rejects(core.assertSlimSessionSecurity(fixture(decision('SLIM_MFA_REQUIRED')).caller),isCode('SLIM_MFA_REQUIRED'));for(const error of [{code:'P0001',message:'SLIM_MFA_REQUIRED'},{code:'42501',message:'SLIM_MFA_REQUIRED synthetic-sensitive'}])await assert.rejects(core.assertSlimSessionSecurity(fixture({data:null,error}).caller),isCode('SLIM_SECURITY_UNAVAILABLE'))});
await check('revoked session is distinct from MFA challenge and unavailable service',async()=>{await assert.rejects(core.assertSlimSessionSecurity(fixture(decision('SLIM_SESSION_INVALID')).caller),isCode('SLIM_SESSION_INVALID'))});
await check('server errors are sanitized and are never retried by real PostgREST client',async()=>{const f=fixture({data:null,error:{code:'503',message:'synthetic-sensitive-error'}},{rpcStatus:503});await assert.rejects(core.assertSlimSessionSecurity(f.caller),isCode('SLIM_SECURITY_UNAVAILABLE'));assert.equal(f.events.length,1)});
await check('invalid caller and thrown transport exception cannot authorize',async()=>{await assert.rejects(core.assertSlimSessionSecurity({rpc:null}),isCode('SLIM_SECURITY_UNAVAILABLE'));const f=fixture(success,{sendGuard:async()=>{throw Error('synthetic-sensitive-token')}});await assert.rejects(core.assertSlimSessionSecurity(f.caller),isCode('SLIM_SECURITY_UNAVAILABLE'));assert.equal(f.events.length,1)});
async function acceleratedTimeout(fn){const original=globalThis.setTimeout,seen=[];globalThis.setTimeout=(handler,delay,...args)=>{seen.push(delay);return original(handler,delay===8000?10:delay,...args)};try{await fn();assert(seen.includes(8000))}finally{globalThis.setTimeout=original}}
await check('8 second timeout aborts and refuses late success even when transport resolves on abort',async()=>acceleratedTimeout(async()=>{let aborted=false;const f=fixture(success,{sendGuard:init=>new Promise(resolve=>init.signal.addEventListener('abort',()=>{aborted=true;resolve(Response.json(true))},{once:true}))});await assert.rejects(core.assertSlimSessionSecurity(f.caller),isCode('SLIM_SECURITY_UNAVAILABLE'));assert(aborted);assert.equal(f.events.length,1)}));
await check('8 second overall deadline settles even if a transport ignores abort',async()=>acceleratedTimeout(async()=>{const f=fixture(success,{sendGuard:()=>new Promise(()=>{})});await assert.rejects(core.assertSlimSessionSecurity(f.caller),isCode('SLIM_SECURITY_UNAVAILABLE'));assert.equal(f.events.length,1)}));
await check('HTTP errors preserve safe status/code and never include raw payloads',async()=>{for(const[code,status]of[['SLIM_MFA_REQUIRED',403],['SLIM_SESSION_INVALID',401],['SLIM_SECURITY_UNAVAILABLE',503]]){const response=core.slimSessionSecurityResponse(new core.SlimSessionSecurityError(code));assert.equal(response.status,status);assert.equal((await response.json()).code,code);assert.equal(response.headers.get('Cache-Control'),'no-store')}const body=await core.slimSessionSecurityResponse(Error('synthetic-sensitive-secret')).text();assert(!body.includes('synthetic-sensitive'))});

await check('actual middleware confirms security before returning caller context',async()=>{const f=fixture(),m=load('src/integrations/supabase/auth-middleware.ts',f.modules).requireSupabaseAuth;let context;await m.serverHandler({next:async value=>{context=value.context;assert(f.events.some(e=>e.kind==='guard'))}});assert.equal(context.userId,actor);assert.equal(context.claims.sub,actor);assert(context.supabase);assert.equal(f.events.filter(e=>e.kind==='guard').length,1)});
await check('actual middleware denied or unavailable session never reaches the handler',async()=>{for(const result of[decision('SLIM_MFA_REQUIRED'),decision('SLIM_SESSION_INVALID'),{data:false,error:null}]){const f=fixture(result),m=load('src/integrations/supabase/auth-middleware.ts',f.modules).requireSupabaseAuth;let called=false;await assert.rejects(m.serverHandler({next:async()=>{called=true}}));assert.equal(called,false)}});
await check('actual middleware rejects absent or invalid JWT before the security RPC',async()=>{for(const mode of['absent','invalid']){const f=fixture(success,{invalidAuth:mode==='invalid'});if(mode==='absent')f.request.headers.delete('Authorization');const m=load('src/integrations/supabase/auth-middleware.ts',f.modules).requireSupabaseAuth;await assert.rejects(m.serverHandler({next:async()=>assert.fail('unauthorized handler')}));assert(!f.events.some(e=>e.kind==='guard'))}});
await check('client middleware still forwards the current session token without refresh or persistence',async()=>{const f=fixture(),m=load('src/integrations/supabase/auth-middleware.ts',f.modules).requireSupabaseAuth;let sent;await m.clientHandler({next:async value=>{sent=value.headers}});assert.equal(sent.Authorization,'Bearer '+token);assert.equal(f.events.length,0)});
await check('actual bearer verifies identity then calls guard and preserves caller client',async()=>{const f=fixture(),mod=load('src/lib/ai-agent/auth-bearer.server.ts',f.modules);const ctx=await mod.verifyBearer(f.request);assert.equal(ctx.userId,actor);assert(ctx.supabase);assert.deepEqual(f.events.map(e=>e.kind),['auth','guard'])});
await check('actual bearer propagates MFA denial before any workspace or business operation',async()=>{const f=fixture(decision('SLIM_MFA_REQUIRED')),mod=load('src/lib/ai-agent/auth-bearer.server.ts',f.modules);await assert.rejects(mod.verifyBearer(f.request),isCode('SLIM_MFA_REQUIRED'));assert.deepEqual(f.events.map(e=>e.kind),['auth','guard'])});
await check('manual roles handler queries roles only after the guard passes',async()=>{const f=fixture(),mod=load('src/lib/auth.functions.ts',f.modules);assert.deepEqual(await mod.getCurrentUserRoles(),{roles:['admin'],isAdmin:true});assert.deepEqual(f.events.map(e=>e.kind),['auth','guard','roles'])});
await check('manual roles handler cannot swallow MFA denial into a misleading empty permission result',async()=>{const f=fixture(decision('SLIM_MFA_REQUIRED')),mod=load('src/lib/auth.functions.ts',f.modules);await assert.rejects(mod.getCurrentUserRoles(),isCode('SLIM_MFA_REQUIRED'));assert(!f.events.some(e=>e.kind==='roles'))});

process.env.PARTNER_PROGRAM_ENCRYPTION_KEY='synthetic-key-for-isolated-tests-only';
const cases=[
 ['payment profile GET','src/routes/api/partners/payment-profile.ts','GET',null,'admin-read'],
 ['payment profile POST','src/routes/api/partners/payment-profile.ts','POST',{documentType:'cpf',document:'00000000000',pixKeyType:'random',pixKey:'synthetic-pix',holderName:'Synthetic Person'},'admin-write'],
 ['payment profiles admin GET','src/routes/api/partners/admin/payment-profiles.ts','GET',null,'admin-read'],
 ['payment profiles admin POST','src/routes/api/partners/admin/payment-profiles.ts','POST',{userId:actor,status:'verified'},'verify-payment'],
 ['payout POST','src/routes/api/partners/request-payout.ts','POST',null,'payout'],
];
for(const[name,file,method,body,effect]of cases){
 const request=()=>new Request('https://app.example.invalid/api/synthetic',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 await check(name+' denies MFA before any admin data read/write',async()=>{const f=fixture(decision('SLIM_MFA_REQUIRED')),route=load(file,f.modules).Route;const result=await route.server.handlers[method]({request:request()});assert.equal(result.status,403);assert.equal((await result.json()).code,'SLIM_MFA_REQUIRED');assert(!f.events.some(e=>['admin-read','admin-write','roles','payout','verify-payment','admin-role'].includes(e.kind)));assert.equal(f.events.filter(e=>e.kind==='guard').length,1)});
 await check(name+' distinguishes revoked session and unavailable guard with no private effect',async()=>{for(const[denial,status,code]of[[decision('SLIM_SESSION_INVALID'),401,'SLIM_SESSION_INVALID'],[{data:null,error:{code:'503',message:'synthetic-sensitive'}},503,'SLIM_SECURITY_UNAVAILABLE']]){const f=fixture(denial),route=load(file,f.modules).Route;const result=await route.server.handlers[method]({request:request()});assert.equal(result.status,status);assert.equal((await result.json()).code,code);assert(!f.events.some(e=>['admin-read','admin-write','payout','verify-payment','admin-role'].includes(e.kind)))}});
 await check(name+' retains existing permissions and operation after positive guard',async()=>{const f=fixture(),route=load(file,f.modules).Route;const response=await route.server.handlers[method]({request:request()});assert.equal(response.status,200);const guard=f.events.findIndex(e=>e.kind==='guard'),action=f.events.findIndex(e=>e.kind===effect);assert(guard>=0&&action>guard);assert.equal(f.events.filter(e=>e.kind==='guard').length,1)});
}
await check('passing MFA does not grant partner administrator privileges',async()=>{const f=fixture(success,{notAdmin:true}),route=load('src/routes/api/partners/admin/payment-profiles.ts',f.modules).Route;const response=await route.server.handlers.GET({request:f.request});assert.equal(response.status,403);assert(!f.events.some(e=>e.kind==='admin-read'))});
await check('passing MFA does not bypass the verified payment-profile requirement',async()=>{const f=fixture(success,{unverified:true}),route=load('src/routes/api/partners/request-payout.ts',f.modules).Route;const response=await route.server.handlers.POST({request:new Request(f.request,{method:'POST'})});assert.equal(response.status,409);assert(!f.events.some(e=>e.kind==='payout'))});
console.log(`${total}/${total} session-security runtime checks passed. Real SDK and real handlers with synthetic requests only; no production, accounts, factors or commercial operations.`);
