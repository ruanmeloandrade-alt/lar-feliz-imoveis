import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
function load(file,modules={}){const code=ts.transpileModule(fs.readFileSync(root+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};Function('require','module','exports',code)(name=>Object.hasOwn(modules,name)?modules[name]:require(name),mod,mod.exports);return mod.exports}
const catalog=load('src/lib/slim-group-catalog.server.ts'),technical=load('src/lib/whatsapp-group-context.server.ts');
const uid=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const actor=uid(1),ws=uid(2),groupId=uid(3),sid=uid(4),other=uid(5),botId=uid(6),leadId=uid(7);
const rule={id:'schedule-1',enabled:true,type:'schedule',config:{scheduledAt:'2035-01-01T12:00:00.000Z',actionType:'start_bot',botId}},rules={triggers:[rule]};
function fixture(options={}){
 const events=[];let adminCreated=0;
 const group={id:groupId,workspace_id:ws,session_id:sid,group_jid:'123456@g.us',name:'Synthetic group',subject:null,rules};
 const send=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url),table=url.pathname.split('/').at(-1),kind=new Headers(init.headers).get('x-synthetic-client'),method=init.method??'GET',body=init.body?JSON.parse(init.body):null;
  assert.equal(url.origin,'https://group-schedule-fixture.invalid');const event={table,kind,method,body,params:Object.fromEntries(url.searchParams),signal:init.signal};events.push(event);
  if(table==='profiles')return Response.json({current_workspace_id:options.wrongWorkspace?other:ws});
  if(table==='workspaces')return Response.json({id:ws,owner_id:options.owner?actor:other});
  if(table==='workspace_members'){if(options.memberError)return Response.json({message:'membership unavailable'},{status:503});return Response.json(options.noMember?null:{workspace_id:ws,user_id:actor,role_type:options.viewer?'visualizador':'funcionario',access_expires_at:options.expired?'2000-01-01T00:00:00Z':null})}
  if(table==='whatsapp_groups'&&method==='GET'){
   if(options.holdGroup)return new Promise(resolve=>init.signal.addEventListener('abort',()=>resolve(Response.json(group)),{once:true}));
   return Response.json(options.noGroup?null:group);
  }
  if(table==='whatsapp_web_sessions'){
   assert.equal(method,'GET');assert.equal(event.params.id,'eq.'+sid);assert.equal(event.params.workspace_id,'eq.'+ws);assert.equal(event.params.order,undefined);
   if(options.sessionError)return Response.json({message:'session unavailable'},{status:503});
   return Response.json({id:options.wrongSession?other:sid,workspace_id:ws,status:options.disconnected?'disconnected':'connected',metadata:{deleted:!!options.deleted},provider:'evolution'});
  }
  if(table==='salesbots')return Response.json([{id:botId,scope:options.wrongBot?'contato':'grupo'}]);
  if(table==='whatsapp_groups'&&method==='PATCH'){
   assert.equal(kind,'caller');assert.deepEqual(Object.keys(body).sort(),['rules','updated_at']);assert.equal(event.params.session_id,'eq.'+sid);assert.equal(event.params.group_jid,'eq.'+group.group_jid);
   if(options.saveError)return Response.json({message:'update rejected'},{status:403});
   if(options.changedIdentity)return Response.json(null);
   const saved={...group,rules:body.rules};if(options.badReceipt)saved[options.badReceipt]=other;return Response.json(saved);
  }
  if(table==='leads'&&method==='GET'){assert.equal(event.params['custom_data->>whatsapp_session_id'],'eq.'+sid);return Response.json({id:leadId})}
  if(table==='salesbot_runs'&&method==='GET')return Response.json(options.pending??[]);
  if(table==='salesbot_runs'&&['POST','PATCH','DELETE'].includes(method))return new Response(null,{status:204});
  throw Error('Unexpected synthetic query '+kind+' '+method+' '+table);
 };
 const client=kind=>createClient('https://group-schedule-fixture.invalid','sb_publishable_synthetic_only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{'x-synthetic-client':kind},fetch:send}});
 const caller=client('caller'),admin=client('admin');
 const module=load('src/lib/whatsapp-group-schedule.functions.ts',{
  '@tanstack/react-start':{createServerFn:()=>{let validate;const chain={middleware(){return chain},inputValidator(fn){validate=fn;return chain},handler(fn){return({data,context})=>fn({data:validate(data),context})}};return chain}},
  '@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}},
  '@/lib/meta-server':{adminClient:()=>{adminCreated++;assert(events.some(e=>e.table==='whatsapp_groups'&&e.method==='GET'));assert(events.filter(e=>['profiles','workspaces','workspace_members'].includes(e.table)).length>=3);return admin}},
  './slim-group-catalog.server':catalog,'./whatsapp-group-context.server':technical,'./execution-context':{createRootContext:(id,kind,bot)=>({id,kind,bot})},
 });
 return{events,get adminCreated(){return adminCreated},list:()=>module.listGroupScheduleStatus({data:{workspaceId:ws,groupId},context:{supabase:caller,userId:actor}}),save:(value=rules)=>module.saveGroupRulesAndSchedules({data:{workspaceId:ws,groupId,rules:value},context:{supabase:caller,userId:actor}})};
}
let total=0;async function check(name,fn){await fn();total++;console.log('PASS group schedule: '+name)}
const writes=f=>f.events.filter(e=>e.method!=='GET');
await check('viewer can read schedule status only after active-workspace membership check',async()=>{const f=fixture({viewer:true}),out=await f.list();assert.equal(out[0].ruleId,rule.id);assert.equal(f.adminCreated,1);assert.equal(writes(f).length,0);assert.equal(f.events.findIndex(e=>e.table==='whatsapp_groups'),3)});
await check('viewer cannot save or instantiate an admin client',async()=>{const f=fixture({viewer:true});await assert.rejects(f.save(),/consultar os grupos/);assert.equal(f.adminCreated,0);assert.equal(f.events.length,3)});
for(const[name,options]of[['different active workspace',{wrongWorkspace:true}],['expired membership',{expired:true}],['missing membership',{noMember:true}],['membership service error',{memberError:true}]])await check(name+' denies both handlers before group/admin access',async()=>{for(const op of['list','save']){const f=fixture(options);await assert.rejects(f[op]());assert.equal(f.adminCreated,0);assert.equal(writes(f).length,0);assert.equal(f.events.length,3)}});
await check('operator saves using caller RLS, confirms identity, then schedules with original session',async()=>{const f=fixture(),out=await f.save();assert.equal(out.ok,true);assert.equal(out.reboundSession,false);assert.equal(out.scheduled,1);const saved=f.events.findIndex(e=>e.table==='whatsapp_groups'&&e.method==='PATCH'),internal=f.events.findIndex(e=>e.kind==='admin');assert(saved>=0&&internal>saved);assert.equal(f.adminCreated,1);const run=writes(f).find(e=>e.table==='salesbot_runs');assert.equal(run.body.workspace_id,ws);assert.equal(run.body.lead_id,leadId);assert.equal(run.body.status,'waiting_timer');assert.equal(run.body.variables.group_jid,'123456@g.us');assert.equal(writes(f).filter(e=>e.table==='whatsapp_groups').length,1)});
for(const[name,options]of[['disconnected original session',{disconnected:true}],['deleted original session',{deleted:true}],['different returned session',{wrongSession:true}],['session lookup error',{sessionError:true}]])await check(name+' never searches/rebinds to another session and performs no write',async()=>{const f=fixture(options);await assert.rejects(f.save(),/sessão de origem/);assert.equal(f.adminCreated,0);assert.equal(writes(f).length,0);assert.equal(f.events.filter(e=>e.table==='whatsapp_web_sessions').length,1)});
await check('unconfirmed or failed rules update never starts schedule synchronization',async()=>{for(const options of[{saveError:true},{changedIdentity:true},...['id','workspace_id','session_id','group_jid'].map(badReceipt=>({badReceipt}))]){const f=fixture(options);await assert.rejects(f.save(),/confirmar o salvamento/);assert.equal(f.adminCreated,0);assert(!f.events.some(e=>e.table==='salesbot_runs'||e.table==='leads'))}});
await check('non-group SalesBot and malformed schedule are rejected without writes',async()=>{const f=fixture({wrongBot:true});await assert.rejects(f.save(),/SalesBot de grupo/);assert.equal(writes(f).length,0);assert.equal(f.adminCreated,0);const g=fixture();await assert.rejects(g.save({triggers:[{...rule,config:{...rule.config,scheduledAt:'invalid'}}]}),/data e hora/);assert.equal(writes(g).length,0)});
await check('missing group and oversized rules fail before any privileged operation',async()=>{const f=fixture({noGroup:true});await assert.rejects(f.save(),/Grupo não encontrado/);assert.equal(f.adminCreated,0);const g=fixture();await assert.rejects(g.save({large:'a'.repeat(100001)}),/limite/);assert.equal(g.adminCreated,0);assert.equal(writes(g).length,0)});
await check('existing waiting_timer run keeps update semantics and original identity',async()=>{const f=fixture({pending:[{id:uid(8),salesbot_id:botId,status:'waiting_timer',waiting_until:rule.config.scheduledAt,variables:{group_schedule:true,group_id:groupId,group_rule_id:rule.id}}]}),out=await f.save();assert.equal(out.updated,1);assert.equal(out.scheduled,0);const changed=writes(f).find(e=>e.table==='salesbot_runs');assert.equal(changed.method,'PATCH');assert.equal(changed.params.status,'eq.waiting_timer');assert.equal(changed.body.variables.group_id,groupId)});
await check('shared deadline aborts native SDK and refuses late successful reads without writes',async()=>{const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timer(fn,ms===15000?30:ms,...args);try{const f=fixture({holdGroup:true});await assert.rejects(f.save(),/prazo|consultar os grupos/);await new Promise(resolve=>timer(resolve,0));assert.equal(f.adminCreated,0);assert.equal(writes(f).length,0);const held=f.events.find(e=>e.table==='whatsapp_groups');assert(held);assert.equal(held.signal.aborted,true)}finally{globalThis.setTimeout=timer}});
console.log(`${total}/${total} group schedule scope checks passed; real handlers, shared authorization, native SDK and synthetic transport only.`);
