import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {selectSlimEmployeeWorkspace} from '../src/lib/slim-employee-workspace.server.ts';
import {validateEmployeeSetup} from '../src/lib/slim-settings-validation.core.ts';

// Local synthetic IO only. No Auth account, membership, password or profile is changed remotely.
const W='00000000-0000-4000-8000-000000000101',PERSONAL='00000000-0000-4000-8000-000000000102';
const U='00000000-0000-4000-8000-000000000001',OTHER='00000000-0000-4000-8000-000000000002';
const SECTOR='00000000-0000-4000-8000-000000000201';
const target=reusedExistingUser=>({workspaceId:W,userId:U,reusedExistingUser});
function dbFixture(options={}){
 const state={profile:{id:U,current_workspace_id:PERSONAL},member:{workspace_id:W,user_id:U,access_expires_at:null},...structuredClone(options.state??{})};
 const calls=[];
 const db={state,calls,from(table){
  const q={table,op:'select',filters:[],columns:null};let result;
  const chain={select(columns){q.columns=columns;return chain;},eq(key,value){q.filters.push([key,value]);return chain;},is(key,value){q.filters.push([key,value]);q.isNull=true;return chain;},
   update(value){q.op='update';q.value=structuredClone(value);return chain;},upsert(value){q.op='upsert';q.value=structuredClone(value);return chain;},
   maybeSingle(){return chain;},retry(value){q.retry=value;return chain;},abortSignal(signal){q.signal=signal;return chain;},
   then(resolve,reject){result??=Promise.resolve().then(async()=>{
    calls.push(q);
    if(!options.handlerMode||q.retry!==undefined){assert.equal(q.retry,false);assert(q.signal instanceof AbortSignal);assert.equal(q.signal.aborted,false);}
    const overridden=await options.handle?.(q,db);if(overridden!==undefined)return overridden;
    if(q.op==='upsert'){
     assert(['workspace_members','workflow_sector_members','module_permissions','user_permissions'].includes(table),'Unexpected upsert '+table);
     if(table==='workspace_members')state.member={...state.member,...q.value};
     return {data:null,error:null};
    }
    if(table==='permission_templates')return {data:null,error:null};
    assert(['workspace_members','profiles'].includes(table),'Unexpected table '+table);
    const row=table==='profiles'?state.profile:state.member;
    const match=row&&q.filters.every(([key,value])=>row[key]===value);
    if(q.op==='update'){
     assert.equal(table,'profiles');assert.deepEqual(Object.keys(q.value),['current_workspace_id']);
     if(match)Object.assign(row,q.value);
    }
    return {data:match?structuredClone(row):null,error:null};
   });return result.then(resolve,reject);},
  };return chain;
 }};return db;
}
const updates=db=>db.calls.filter(q=>q.op==='update');
let passed=0;
async function test(name,work){await work();passed++;console.log('PASS employee workspace: '+name);}

await test('new employee leaves the workspace filled by the Auth trigger',async()=>{
 const db=dbFixture();assert.deepEqual(await selectSlimEmployeeWorkspace(db,target(false)),{currentWorkspaceId:W,changed:true});
 assert.equal(db.state.profile.current_workspace_id,W);assert.equal(updates(db).length,1);
 assert.deepEqual(updates(db)[0].filters,[['id',U],['current_workspace_id',PERSONAL]]);
 assert.equal(updates(db)[0].columns,'id,current_workspace_id');
});
await test('reused identity keeps its previous choice without an update',async()=>{
 const db=dbFixture();assert.deepEqual(await selectSlimEmployeeWorkspace(db,target(true)),{currentWorkspaceId:PERSONAL,changed:false});
 assert.equal(db.state.profile.current_workspace_id,PERSONAL);assert.equal(updates(db).length,0);
});
await test('reused identity with null workspace is filled using the null guard',async()=>{
 const db=dbFixture({state:{profile:{id:U,current_workspace_id:null}}});
 assert.deepEqual(await selectSlimEmployeeWorkspace(db,target(true)),{currentWorkspaceId:W,changed:true});assert.equal(updates(db)[0].isNull,true);
});
await test('new identity already on the correct workspace confirms the same destination',async()=>{
 const db=dbFixture({state:{profile:{id:U,current_workspace_id:W}}});assert.deepEqual(await selectSlimEmployeeWorkspace(db,target(false)),{currentWorkspaceId:W,changed:false});
});
await test('missing, foreign, expired or unconfirmed membership cannot select a workspace',async()=>{
 const candidates=[null,{workspace_id:PERSONAL,user_id:U},{workspace_id:W,user_id:OTHER},{workspace_id:W,user_id:U,access_expires_at:'2000-01-01T00:00:00Z'}];
 for(const member of candidates){const db=dbFixture({state:{member}});await assert.rejects(selectSlimEmployeeWorkspace(db,target(false)),/vínculo/);assert.equal(updates(db).length,0);}
 const failed=dbFixture({handle:q=>q.table==='workspace_members'?{data:null,error:{message:'Synthetic DB failure'}}:undefined});
 await assert.rejects(selectSlimEmployeeWorkspace(failed,target(false)),/vínculo/);assert.equal(updates(failed).length,0);
});
await test('missing or invalid profile receipt stops before the update',async()=>{
 for(const value of [null,{id:OTHER,current_workspace_id:PERSONAL},{id:U,current_workspace_id:'invalid'}]){
  const db=dbFixture({handle:q=>q.table==='profiles'?{data:value,error:null}:undefined});await assert.rejects(selectSlimEmployeeWorkspace(db,target(false)),/confirmar a empresa/);assert.equal(updates(db).length,0);
 }
});
await test('update error, missing row and mismatched receipt are not reported as success',async()=>{
 for(const result of [{data:null,error:{message:'Synthetic failure'}},{data:null,error:null},{data:{id:OTHER,current_workspace_id:W},error:null},{data:{id:U,current_workspace_id:PERSONAL},error:null}]){
  const db=dbFixture({handle:q=>q.op==='update'?result:undefined});await assert.rejects(selectSlimEmployeeWorkspace(db,target(false)),/confirmar a empresa/);assert.equal(updates(db).length,1);
 }
});
await test('a concurrent choice is preserved by comparing the previously observed workspace',async()=>{
 const db=dbFixture({handle:(q,current)=>{if(q.op==='update')current.state.profile.current_workspace_id=OTHER;}});
 await assert.rejects(selectSlimEmployeeWorkspace(db,target(false)),/confirmar a empresa/);assert.equal(db.state.profile.current_workspace_id,OTHER);assert.equal(updates(db).length,1);
});
await test('timeout aborts without retry; a late membership response cannot start the update',async()=>{
 let resolveMembership;
 const db=dbFixture({handle:q=>q.table==='workspace_members'?new Promise(resolve=>{resolveMembership=resolve;}):undefined});
 await assert.rejects(selectSlimEmployeeWorkspace(db,target(false),{timeoutMs:5}),/confirmar a empresa/);
 assert.equal(db.calls.length,1);assert.equal(db.calls[0].signal.aborted,true);
 resolveMembership({data:{workspace_id:W,user_id:U,access_expires_at:null},error:null});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(updates(db).length,0);
});
await test('timeout during the single update remains unconfirmed',async()=>{
 const db=dbFixture({handle:q=>q.op==='update'?new Promise(()=>{}):undefined});
 await assert.rejects(selectSlimEmployeeWorkspace(db,target(false),{timeoutMs:5}),/confirmar a empresa/);assert.equal(updates(db).length,1);assert.equal(updates(db)[0].signal.aborted,true);
});

// Compile the actual createEmployee block, including its validator, with only its IO replaced.
const source=readFileSync(new URL('../src/lib/settings.functions.ts',import.meta.url),'utf8');
const start=source.indexOf('const CreateEmployeeSchema ='),end=source.indexOf('const InvIdSchema',start);
assert(start>=0&&end>start,'createEmployee source boundaries must remain unambiguous');
const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function createHandler(db,reused,observed){
 let validations;
 const createServerFn=()=>({middleware(){return this;},inputValidator(validate){validations=validate;return this;},handler(fn){return args=>fn({...args,data:validations(args.data)});}});
 db.auth={admin:{
  createUser:async()=>reused?{data:null,error:{message:'User already registered'}}:{data:{user:{id:U}},error:null},
  listUsers:async()=>({data:{users:[{id:U,email:'synthetic@example.invalid'}]},error:null}),
 }};
 const load=id=>{
  if(id==='@/integrations/supabase/client.server')return {supabaseAdmin:db};
  if(id==='@/lib/slim-employee-workspace.server')return {selectSlimEmployeeWorkspace:async(admin,value)=>{observed.push(structuredClone(value));return selectSlimEmployeeWorkspace(admin,value);}};
  throw new Error('Unexpected import in real handler: '+id);
 };
 const exports={};
 new Function('exports','require','createServerFn','z','attachSupabaseAuth','requireSupabaseAuth','activeWorkspace','isOwner','requireSector','validateEmployeeSetup',compiled)(
  exports,load,createServerFn,z,{}, {},async()=>W,async()=>true,async()=>{},validateEmployeeSetup,
 );
 return exports.createEmployee;
}
for(const reused of [false,true])await test(`real provisioning derives reused=${reused} from Auth, ignoring submitted flags`,async()=>{
 const db=dbFixture({handlerMode:true}),observed=[],handler=createHandler(db,reused,observed);
 const result=await handler({data:{email:'synthetic@example.invalid',password:'synthetic-password',full_name:'Synthetic employee',role_type:'funcionario',sector_id:SECTOR,modules:[],reusedExistingUser:!reused,userId:OTHER},context:{supabase:{},userId:OTHER}});
 assert.deepEqual(observed,[target(reused)]);assert.deepEqual(result,{ok:true,userId:U,reusedExistingUser:reused});
 assert.equal(db.state.profile.current_workspace_id,reused?PERSONAL:W);
 assert.equal(db.calls.filter(q=>q.op==='upsert'&&q.table==='workspace_members').length,1,'Existing provisioning membership only');
});
console.log(`${passed}/${passed} employee workspace checks passed with synthetic IO. No real accounts, sessions, passwords or memberships changed.`);
