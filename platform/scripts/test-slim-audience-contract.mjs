import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createAudienceRequestTracker} from '../src/lib/slim-audience-request.ts';
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;
function check(name,fn){fn();n++;console.log('PASS audience integration: '+name);}
async function checkAsync(name,fn){await fn();n++;console.log('PASS audience integration: '+name);}
async function assertInvitationPreviewErrors(source){
 if(!source.includes('export const previewInvitation = previewSlimInvitation;')){
  assert(source.includes('Serviço de convites indisponível'));
  return;
 }
 assert(source.includes('from "@/lib/slim-invitations.functions"'));
 assert(!/\.rpc\(["']preview_invitation["']/.test(source));
 // Execute the modern preview, RPC wrapper and validator; only framework/database IO is synthetic.
 const require=createRequire(import.meta.url),{default:ts}=await import('typescript');
 const core=await import(new URL('src/lib/slim-invitations.core.ts',root).href);
 const token='bbbbbbbb-bbbb-4bbb-8bbb-000000000004',calls=[];
 let response={data:null,error:{code:'XX000',message:'synthetic private RPC error'}};
 const database={rpc(name,args){
  assert.equal(name,'slim_invitation_preview');assert.deepEqual(args,{p_token:token});calls.push({name,args});
  const query={retry(value){assert.equal(value,false);return query;},abortSignal(signal){assert(signal instanceof AbortSignal);return query;},then(resolve,reject){return Promise.resolve(response).then(resolve,reject);}};
  return query;
 }};
 const createServerFn=()=>{let parse=value=>value;return {middleware(){return this;},inputValidator(fn){parse=fn;return this;},handler(fn){return async({data})=>fn({data:parse(data)});}};};
 const modules={
  '@tanstack/react-start':{createServerFn},zod:require('zod'),'@/lib/slim-invitations.core':core,
  '@/integrations/supabase/auth-middleware':{requireSupabaseAuth:{}},'@/integrations/supabase/auth-attacher':{attachSupabaseAuth:{}},
  '@/integrations/supabase/saude-slim-env':{resolvePublicAppUrl(){throw Error('Unexpected origin lookup in preview');}},
  '@/integrations/supabase/client.server':{supabaseAdmin:database},
 };
 function compile(file){
  const compiled=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal(compiled.diagnostics?.length??0,0);const module={exports:{}};
  Function('require','module','exports',compiled.outputText)(name=>{assert(name in modules,'Unexpected preview import: '+name);return modules[name];},module,module.exports);
  return module.exports;
 }
 modules['@/lib/slim-invitations.server']=compile('src/lib/slim-invitations.server.ts');
 const {previewSlimInvitation}=compile('src/lib/slim-invitations.functions.ts');
 await assert.rejects(()=>previewSlimInvitation({data:{token}}),error=>/Serviço de convites indisponível/.test(error.message)&&!error.message.includes('synthetic private'));
 assert.equal(calls.length,1,'RPC error must not trigger an automatic retry');
 response={data:{version:1,status:'invalid',code:'INVITATION_UNAVAILABLE'},error:null};
 assert.deepEqual(await previewSlimInvitation({data:{token}}),response.data,'An invalid invitation is a validated result, distinct from service failure');
 assert.equal(calls.length,2);
}
check('same intent retains its request ID across retries',()=>{const r=createAudienceRequestTracker();assert.equal(r({a:1}),r({a:1}));});
check('changed intent gets another request ID',()=>{const r=createAudienceRequestTracker();assert.notEqual(r({a:1}),r({a:2}));});
check('acknowledged intent permits a new intentional send',()=>{const r=createAudienceRequestTracker();const id=r({a:1});r.reset();assert.notEqual(id,r({a:1}));});
const files=['src/lib/crm-audiences.functions.ts','src/lib/stage-automation-engine.server.ts','src/lib/stage-automations.functions.ts','src/server.ts','src/routes/disparo-em-massa.tsx','src/routes/crm.publicos.tsx','src/lib/security-settings.functions.ts','src/lib/settings.functions.ts'];
const before=files.map(read);
check('real sources contain the checked patch',()=>assert(before.every(s=>s.startsWith('// SLIM_AUDIENCE_OPERATIONS_V1'))));
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-audience-contract.mjs',import.meta.url))],{stdio:'inherit'});
check('patch is idempotent',()=>assert.deepEqual(files.map(read),before));
check('audience matching never uses SQL-array overlap on JSON tags',()=>{assert(!before[0].includes('.overlaps("tags"'));assert(before[0].includes('querySlimAudience(sb,wsId,f,limit)'));});
check('three outbound handlers enqueue using authenticated context',()=>{assert.equal((before[0].match(/return enqueueSlimAudience\(sb,wsId,data,rows,/g)||[]).length,3);assert(!before[0].includes('await sendEvolutionText('));assert.equal((before[0].match(/requestId: z.string\(\).uuid\(\).optional\(\)/g)||[]).length,3);});
check('manual and scheduled jobs share an atomic claim',()=>{assert(before[1].includes('admin.rpc("slim_claim_stage_job"'));assert(before[1].includes('await runJobById(admin,job.id)'));assert(before[1].includes('Automação desabilitada ou removida.'));});
check('worker boot, audience tabs and compatible redirect are wired',()=>{assert(before[3].includes('ensureSlimAudienceWorker();'));assert(before[4].includes("redirect({to:'/crm/publicos',search:{aba:'disparos'},replace:true})"));assert(before[5].includes('<SlimAudienceQueue scope={scope}'));const panel=read('src/components/crm/SlimMassBroadcastPanel.tsx');assert(panel.includes('requestId:requestTracker('));assert(panel.includes('result.queued'));assert(before[5].includes('<SlimMassBroadcastPanel active='));assert(before[5].includes('<SlimAudienceReport active='));});
await checkAsync('security and invitation errors are not false success',async()=>{assert(before[6].includes('if(saveError||!row)throw'));assert(before[6].includes('Configurações de segurança indisponíveis'));await assertInvitationPreviewErrors(before[7]);});
check('provider path uses own session credentials and a timeout',()=>{const s=read('src/lib/slim-audience-runtime.server.ts');assert(s.includes('get_evolution_credentials_service'));assert(s.includes('apikey:s.api_key'));assert(s.includes('AbortSignal.timeout(25000)'));assert(s.includes(".eq('active_conversation_agent_version',version)"));});
console.log(`${n}/${n} audience integration checks passed; no production mutations or delivery test performed.`);
