import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {slimSafeOperationalError} from '../src/lib/slim-operation-errors.core.ts';

// Run after the production stage transforms, just like the other stage gates.
// Actual run/receipt functions and the claim RPC are exercised against disposable
// PostgreSQL. Provider execution is an injected counter, never a runtime import.
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const source=read('src/lib/stage-automation-engine.server.ts');
assert(source.includes('admin.rpc("slim_claim_stage_job"'),'Prepare the stage build transforms first.');
assert(source.includes('O cliente saiu da etapa antes da execução.'),'Stage freshness transform must be present.');
const ast=ts.createSourceFile('engine.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=['SlimStageJobConfirmationError','runJobById','finishJob','runJob'];
const selected=names.map(name=>{
 const node=ast.statements.find(s=>(ts.isClassDeclaration(s)||ts.isFunctionDeclaration(s))&&s.name?.text===name);
 assert(node,'Missing production declaration: '+name);return node.getText(ast).replace(/^export\s+/,'');
}).join('\n');
const compiled=ts.transpileModule(selected,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const pg=new PGlite(),ws=randomUUID(),leadId=randomUUID(),pipeline=randomUUID(),stage=randomUUID();
const action={id:'receipt-bot',title:'SalesBot',enabled:true,config:{kind:'salesbot',botId:randomUUID()},execution:{}};
const normalLead={id:leadId,workspaceId:ws,stageId:stage,pipelineId:pipeline};
let lead=normalLead,passes=true,actionError=null,leadError=null,fault=null,beforeReceipt=null,claimError=false;
let executions=0,writes=0,claims=0,checks=0;
const queries=[];
const rows=async(sql,args=[])=> (await pg.query(sql,args)).rows;
const identifier=value=>{const name=value.trim();assert.match(name,/^[a-z_][a-z_0-9]*$/i);return '"'+name+'"';};
const db={
 from(table){
  let columns='*',patch=null;const filters=[];
  const q={select(value){columns=value;return q;},eq(column,value){filters.push([column,value]);return q;},update(value){patch=value;return q;},maybeSingle(){return execute(true);},then(a,b){return execute(false).then(a,b);}};
  async function execute(single){
   const plan={table,patch,filters:[...filters]};queries.push(plan);
   if(patch){
    writes++;await beforeReceipt?.(plan);
    if(fault==='error')return {data:null,error:{message:'Simulated database error'}};
    if(fault==='throw')throw new Error('password=private-secret-token');
    if(fault==='zero')return {data:null,error:null};
    if(fault==='wrong-id')return {data:{id:randomUUID()},error:null};
   }
   const args=[],arg=value=>{args.push(value);return '$'+args.length;};
   const where=filters.map(([column,value])=>identifier(column)+'='+arg(value)).join(' AND ');
   const projection=columns==='*'?'*':columns.split(',').map(identifier).join(',');
   const sql=patch
    ?'UPDATE '+identifier(table)+' SET '+Object.entries(patch).map(([column,value])=>identifier(column)+'='+arg(value)).join(',')+' WHERE '+where+' RETURNING '+projection
    :'SELECT '+projection+' FROM '+identifier(table)+(where?' WHERE '+where:'');
   const data=await rows(sql,args);
   if(patch&&fault==='committed-response-lost')return {data:null,error:{message:'Receipt response lost after commit'}};
   assert(!single||data.length<=1);
   return {data:single?(data[0]??null):data,error:null};
  }
  return q;
 },
 async rpc(name,args){
  assert.equal(name,'slim_claim_stage_job');claims++;
  if(claimError)return {data:null,error:{message:'Internal claim failure'}};
  return {data:await rows('SELECT * FROM slim_claim_stage_job($1)',[args._job_id]),error:null};
 },
};
const runtime=new Function('loadLeadCtx','passesExecutionRules','executeAction','stageResultError','slimSafeOperationalError',compiled+';return {runJobById,runJob,finishJob,SlimStageJobConfirmationError};')(
 async(_db,id,workspace)=>{assert.equal(id,leadId);assert.equal(workspace,ws);if(leadError)throw leadError;return lead;},
 ()=>passes,
 async()=>{executions++;if(actionError)throw actionError;},
 slimSafeOperationalError,
 slimSafeOperationalError,
);
async function seed({attempts=0,dueAt=new Date(Date.now()-1000).toISOString(),eventId='slim-stage-move:'+randomUUID()}={}){
 const id=randomUUID();
 await pg.query('INSERT INTO crm_automation_jobs(id,workspace_id,lead_id,pipeline_id,stage_id,action_id,action,context,attempts,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [id,ws,leadId,pipeline,stage,action.id,JSON.stringify(action),JSON.stringify({event_id:eventId}),attempts,dueAt]);
 return id;
}
const getJob=async id=>(await rows('SELECT * FROM crm_automation_jobs WHERE id=$1',[id]))[0];
async function noReplay(id,expectedExecutions){
 const before=writes,result=await runtime.runJobById(db,id);
 assert.equal(result.ok,true);assert.equal(result.skipped,true);
 assert.equal(executions,expectedExecutions);assert.equal(writes,before,'A failed/finished claim must not receive a second finish call.');
}
async function test(name,run){
 await pg.exec('BEGIN');lead=normalLead;passes=true;actionError=null;leadError=null;fault=null;beforeReceipt=null;claimError=false;executions=0;writes=0;claims=0;queries.length=0;
 try{await run();checks++;console.log('PASS stage job receipt: '+name);}finally{await pg.exec('ROLLBACK');}
}
try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE workspaces(id uuid PRIMARY KEY);CREATE TABLE leads(id uuid PRIMARY KEY);CREATE TABLE pipelines(id uuid PRIMARY KEY);CREATE TABLE pipeline_stages(id uuid PRIMARY KEY);');
 const schema=read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql');
 for(const name of ['crm_stage_automations','crm_automation_jobs'])await pg.exec(schema.split('\n').find(line=>line.startsWith('CREATE TABLE public.'+name+' ')));
 await pg.exec('CREATE FUNCTION public.slim_claim_stage_job'+read('supabase/migrations/20261015120218_slim_durable_audience_delivery_queue.sql').split('CREATE FUNCTION public.slim_claim_stage_job')[1]);
 for(const [table,id] of [['workspaces',ws],['leads',leadId],['pipelines',pipeline],['pipeline_stages',stage]])await pg.query('INSERT INTO '+identifier(table)+' VALUES($1)',[id]);
 await pg.query('INSERT INTO crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action) VALUES($1,$2,$3,$4,$5)',[ws,pipeline,stage,action.id,JSON.stringify(action)]);

 await test('successful action receives one confirmed receipt at the claimed attempt',async()=>{
  const id=await seed({attempts:3}),r=await runtime.runJobById(db,id),saved=await getJob(id);
  assert.equal(r.ok,true);assert.equal(r.confirmationPending,undefined);assert.equal(executions,1);assert.equal(writes,1);
  assert.equal(saved.status,'done');assert.equal(saved.attempts,4);assert(saved.executed_at);assert.equal(saved.last_error,null);await noReplay(id,1);
 });
 for(const kind of ['error','throw','zero','wrong-id'])await test('unconfirmed '+kind+' receipt preserves ownership and never repeats the action',async()=>{
  const id=await seed();fault=kind;const r=await runtime.runJobById(db,id);
  assert.equal(r.ok,false);assert.equal(r.confirmationPending,true);assert.match(r.error,/histórico.*não foi confirmado/);
  assert(!r.error.includes('private-secret'));assert.equal(executions,1);assert.equal(writes,1);
  assert.equal((await getJob(id)).status,'running');assert.equal((await getJob(id)).attempts,0);await noReplay(id,1);
 });
 await test('lost response after committed receipt is uncertain without executing again',async()=>{
  const id=await seed();fault='committed-response-lost';const r=await runtime.runJobById(db,id);
  assert.equal(r.confirmationPending,true);assert.equal((await getJob(id)).status,'done');assert.equal(executions,1);assert.equal(writes,1);await noReplay(id,1);
 });
 await test('CAS rejects an attempt replaced while the action was executing',async()=>{
  const id=await seed();beforeReceipt=async()=>{await pg.query("UPDATE crm_automation_jobs SET attempts=2,last_error='new owner' WHERE id=$1",[id]);};
  const r=await runtime.runJobById(db,id),saved=await getJob(id);
  assert.equal(r.confirmationPending,true);assert.equal(saved.status,'running');assert.equal(saved.attempts,2);assert.equal(saved.last_error,'new owner');assert.equal(writes,1);await noReplay(id,1);
 });
 await test('CAS preserves a cancellation made before receipt persistence',async()=>{
  const id=await seed();beforeReceipt=async()=>{await pg.query("UPDATE crm_automation_jobs SET status='cancelled' WHERE id=$1",[id]);};
  const r=await runtime.runJobById(db,id);assert.equal(r.confirmationPending,true);assert.equal((await getJob(id)).status,'cancelled');assert.equal(writes,1);await noReplay(id,1);
 });
 await test('action failure records a single bounded redacted error',async()=>{
  const id=await seed({attempts:2});actionError=new Error('Provider failed apikey=private-secret-token '+ 'x'.repeat(900));
  const r=await runtime.runJobById(db,id),saved=await getJob(id);
  assert.equal(r.ok,false);assert.equal(r.confirmationPending,undefined);assert.equal(executions,1);assert.equal(writes,1);assert.equal(saved.status,'error');assert.equal(saved.attempts,3);
  assert(saved.last_error.length<=512);assert(!saved.last_error.includes('private-secret'));assert.equal(r.error,saved.last_error);await noReplay(id,1);
 });
 for(const kind of ['error','throw','zero'])await test('action failure plus '+kind+' receipt reports uncertainty without a second finish',async()=>{
  const id=await seed();actionError=new Error('Action failed');fault=kind;const r=await runtime.runJobById(db,id);
  assert.equal(r.ok,false);assert.equal(r.confirmationPending,true);assert.match(r.error,/apresentou falha.*histórico não foi confirmado/);
  assert.equal(executions,1);assert.equal(writes,1);assert.equal((await getJob(id)).status,'running');await noReplay(id,1);
 });
 await test('obsolete stage is skipped using the actual claimed attempt number',async()=>{
  const id=await seed({attempts:4});lead={...normalLead,stageId:randomUUID()};const r=await runtime.runJobById(db,id),saved=await getJob(id);
  assert.equal(r.ok,true);assert.equal(r.skipped,true);assert.equal(r.confirmationPending,undefined);assert.equal(executions,0);assert.equal(writes,1);assert.equal(saved.status,'skipped');assert.equal(saved.attempts,5);await noReplay(id,0);
 });
 await test('disabled stage action is skipped before provider execution',async()=>{
  const id=await seed({attempts:1});await pg.query('UPDATE crm_stage_automations SET enabled=false');
  const r=await runtime.runJobById(db,id);assert.equal(r.ok,true);assert.equal(r.skipped,true);assert.equal(executions,0);assert.equal(writes,1);assert.equal((await getJob(id)).status,'skipped');await noReplay(id,0);
 });
 await test('removed stage action is skipped before provider execution',async()=>{
  const id=await seed();await pg.exec('DELETE FROM crm_stage_automations');
  const r=await runtime.runJobById(db,id);assert.equal(r.ok,true);assert.equal(r.skipped,true);assert.equal(executions,0);assert.equal(writes,1);await noReplay(id,0);
 });
 await test('removed lead is skipped with a confirmed receipt',async()=>{
  const id=await seed();lead=null;const r=await runtime.runJobById(db,id);
  assert.equal(r.ok,true);assert.equal(r.skipped,true);assert.equal(executions,0);assert.equal(writes,1);assert.equal((await getJob(id)).status,'skipped');await noReplay(id,0);
 });
 await test('failed execution conditions skip without starting the bot',async()=>{
  const id=await seed();passes=false;const r=await runtime.runJobById(db,id);
  assert.equal(r.ok,true);assert.equal(r.skipped,true);assert.equal(executions,0);assert.equal(writes,1);assert.equal((await getJob(id)).status,'skipped');await noReplay(id,0);
 });
 await test('failed skip receipt is uncertain without another update',async()=>{
  const id=await seed();passes=false;fault='zero';const r=await runtime.runJobById(db,id);
  assert.equal(r.ok,false);assert.equal(r.confirmationPending,true);assert.equal(executions,0);assert.equal(writes,1);assert.equal((await getJob(id)).status,'running');await noReplay(id,0);
 });
 await test('lead-context error records failure before any provider action',async()=>{
  const id=await seed();leadError=new Error('Lead unavailable');const r=await runtime.runJobById(db,id);
  assert.equal(r.ok,false);assert.equal(r.confirmationPending,undefined);assert.equal(executions,0);assert.equal(writes,1);assert.equal((await getJob(id)).status,'error');await noReplay(id,0);
 });
 await test('failed claim does not execute or write a receipt',async()=>{
  const id=await seed();claimError=true;await assert.rejects(runtime.runJobById(db,id),/reservar/);
  assert.equal(executions,0);assert.equal(writes,0);assert.equal((await getJob(id)).status,'pending');
 });
 await test('future job cannot bypass its due time',async()=>{
  const id=await seed({dueAt:new Date(Date.now()+60000).toISOString()}),r=await runtime.runJobById(db,id);
  assert.equal(r.skipped,true);assert.equal(executions,0);assert.equal(writes,0);assert.equal((await getJob(id)).status,'pending');
 });
 assert.equal((await rows('SELECT id FROM crm_automation_jobs')).length,0);
 console.log(`${checks}/${checks} isolated stage-job receipt checks passed. Provider action was only a counter; no production connection or message.`);
}finally{await pg.close();}
