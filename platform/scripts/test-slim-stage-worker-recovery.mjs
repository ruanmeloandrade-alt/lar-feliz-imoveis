import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {normalizeTrigger,isAutomationConfigured} from '../src/lib/crm-mock.ts';
import {dispatchSlimStageMove,processSlimStageMoveEvents} from '../src/lib/slim-stage-move-worker.core.ts';

// Release gate: run after the existing checked build transforms. The engine
// functions below are extracted from the actual prepared source, not copied.
// All SQL runs in disposable PGlite. No runtime/provider module is imported.
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const source=read('src/lib/stage-automation-engine.server.ts');
assert(source.includes('deferExecution'),'Run this gate after the stage build transforms.');
assert(source.includes('slim_claim_stage_job'),'The production job claim must be present.');
const ast=ts.createSourceFile('engine.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function compile(name){
 const fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);assert(fn,name);
 return ts.transpileModule(fn.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
}
const matches=new Function('normalizeTrigger',compile('shouldRunForEvent')+';return shouldRunForEvent;')(normalizeTrigger);
const pg=new PGlite();
const ws=randomUUID(),actor=randomUUID(),leadId=randomUUID(),pipeline=randomUUID(),stage=randomUUID();
const oldLease=()=>new Date(Date.now()-180000).toISOString();
const action={id:'stage-bot',title:'SalesBot',enabled:true,stageIds:[stage],config:{kind:'salesbot',botId:randomUUID()},execution:{trigger:{kind:'created-or-moved'}}};
let checks=0,inline=0,executions=0,beforeCall=null;
const calls=[];
const rows=async(sql,args=[])=> (await pg.query(sql,args)).rows;
const count=async table=>Number((await rows('SELECT count(*) AS n FROM '+identifier(table)))[0].n);
function identifier(value){const name=value.trim();assert.match(name,/^[a-z_][a-z_0-9]*$/i);return '"'+name+'"';}
function parameter(value){return value&&typeof value==='object'&&!(value instanceof Date)?JSON.stringify(value):value;}

// The adapter delegates filtering, uniqueness and CAS to PostgreSQL. Hooks only
// inject transport errors or another owner's write at the request boundary.
const db={
 from(table){
  const plan={table,filters:[],columns:'*',patch:null,insert:null,order:null,limit:null,or:null};
  const q={
   select(columns){plan.columns=columns;return q;},
   eq(column,value){plan.filters.push([column,'=',value]);return q;},
   lt(column,value){plan.filters.push([column,'<',value]);return q;},
   lte(column,value){plan.filters.push([column,'<=',value]);return q;},
   gte(column,value){plan.filters.push([column,'>=',value]);return q;},
   order(column){plan.order=column;return q;},
   limit(value){plan.limit=value;return q;},
   or(expression){plan.or=expression;return q;},
   update(value){plan.patch=value;return q;},
   insert(value){plan.insert=value;return q;},
   maybeSingle(){return execute(true);},
   then(resolve,reject){return execute(false).then(resolve,reject);},
  };
  async function execute(single){
   calls.push({...plan,filters:[...plan.filters]});
   const injected=await beforeCall?.(plan);if(injected)return injected;
   const args=[],arg=value=>{args.push(parameter(value));return '$'+args.length;};
   const columns=plan.columns==='*'?'*':plan.columns.split(',').map(identifier).join(',');
   const where=plan.filters.map(([column,op,value])=>identifier(column)+op+arg(value));
   if(plan.or){
    const prefix='status.eq.pending,and(status.eq.dispatching,started_at.lt.';
    assert(plan.or.startsWith(prefix)&&plan.or.endsWith(')'),'Unexpected filter expression.');
    where.push("(status='pending' OR (status='dispatching' AND started_at<"+arg(plan.or.slice(prefix.length,-1))+'))');
   }
   const filter=where.length?' WHERE '+where.join(' AND '):'';
   let sql;
   if(plan.patch)sql='UPDATE '+identifier(table)+' SET '+Object.entries(plan.patch).map(([column,value])=>identifier(column)+'='+arg(value)).join(',')+filter+' RETURNING '+columns;
   else if(plan.insert){
    const fields=Object.keys(plan.insert);
    sql='INSERT INTO '+identifier(table)+'('+fields.map(identifier).join(',')+') VALUES('+fields.map(k=>arg(plan.insert[k])).join(',')+') RETURNING '+columns;
   }else{
    sql='SELECT '+columns+' FROM '+identifier(table)+filter;
    if(plan.order)sql+=' ORDER BY '+identifier(plan.order);
    if(plan.limit!==null)sql+=' LIMIT '+arg(plan.limit);
   }
   await pg.exec('SAVEPOINT adapter_call');
   try{
    const data=await rows(sql,args);await pg.exec('RELEASE SAVEPOINT adapter_call');
    assert(!single||data.length<=1,'maybeSingle received more than one row.');
    return {data:single?(data[0]??null):data,error:null};
   }catch(error){
    await pg.exec('ROLLBACK TO SAVEPOINT adapter_call');await pg.exec('RELEASE SAVEPOINT adapter_call');
    return {data:null,error:{code:error.code,message:error.message}};
   }
  }
  return q;
 },
 async rpc(name,args){
  const injected=await beforeCall?.({rpc:name,args});if(injected)return injected;
  const arg=name==='slim_claim_stage_move'?args._id:args._job_id;
  assert(['slim_claim_stage_move','slim_claim_stage_job'].includes(name));
  return {data:await rows('SELECT * FROM '+identifier(name)+'($1)',[arg]),error:null};
 },
};
const enqueue=new Function('loadLeadCtx','isAutomationConfigured','scheduleDelayMinutes','shouldRunForEvent','runJobById',"const stageDueAt=()=>Date.now(), normalizeTrigger=()=>({kind: \"created-or-moved\"}), STAGE_TIMER_KINDS=[], stageReminderTarget=()=>undefined;"+compile('enqueueLeadAutomationEvent')+';return enqueueLeadAutomationEvent;')(
 async()=>({id:leadId,workspaceId:ws,stageId:stage,pipelineId:pipeline}),isAutomationConfigured,()=>0,matches,async()=>{inline++;return {ok:true};},
);
const runClaimedJob=new Function('runJob',compile('runJobById')+';return runJobById;')(async()=>{executions++;return {ok:true};});
async function event(patch={}){
 const id=randomUUID();
 await pg.query('INSERT INTO slim_stage_move_events(id,workspace_id,lead_id,actor_id,to_stage_id,pipeline_id,status,attempts,started_at,event_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [id,ws,leadId,actor,stage,pipeline,patch.status??'pending',patch.attempts??0,patch.started_at??null,patch.event_kind??'moved']);
 return (await rows('SELECT * FROM slim_stage_move_events WHERE id=$1',[id]))[0];
}
const getEvent=async id=>(await rows('SELECT * FROM slim_stage_move_events WHERE id=$1',[id]))[0];
async function test(name,run){
 await pg.exec('BEGIN');inline=0;executions=0;beforeCall=null;calls.length=0;
 try{await run();assert.equal(inline,0,'Outbox must never execute a provider action inline.');checks++;console.log('PASS stage worker: '+name);}
 finally{beforeCall=null;await pg.exec('ROLLBACK');}
}
try{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA private;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspaces(id uuid PRIMARY KEY);
 CREATE TABLE pipelines(id uuid PRIMARY KEY);CREATE TABLE pipeline_stages(id uuid PRIMARY KEY,workspace_id uuid,pipeline_id uuid);
 CREATE TABLE leads(id uuid PRIMARY KEY,workspace_id uuid,merged_into_id uuid,status text DEFAULT 'active',stage_id uuid,pipeline_id uuid,updated_at timestamptz,last_message_from text DEFAULT 'lead');
 CREATE FUNCTION private.slim_workspace_access(uuid,text DEFAULT 'member') RETURNS boolean LANGUAGE sql AS $$SELECT true$$;`);
 await pg.exec(read('supabase/migrations/20261016153000_slim_stage_move_outbox.sql'));
 // Creation's additive column is supplied by this release; permissions and
 // creation RPC are validated in the separate migration acceptance suite.
 await pg.exec("ALTER TABLE slim_stage_move_events ADD COLUMN event_kind text NOT NULL DEFAULT 'moved' CHECK(event_kind IN('created','moved'));");
 const schema=read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql');
 for(const name of ['crm_stage_automations','crm_automation_jobs'])await pg.exec(schema.split('\n').find(line=>line.startsWith('CREATE TABLE public.'+name+' ')));
 await pg.exec('CREATE FUNCTION public.slim_claim_stage_job'+read('supabase/migrations/20261015120218_slim_durable_audience_delivery_queue.sql').split('CREATE FUNCTION public.slim_claim_stage_job')[1]);
 await pg.query('INSERT INTO auth.users VALUES($1)',[actor]);await pg.query('INSERT INTO workspaces VALUES($1)',[ws]);await pg.query('INSERT INTO pipelines VALUES($1)',[pipeline]);
 await pg.query('INSERT INTO pipeline_stages VALUES($1,$2,$3)',[stage,ws,pipeline]);
 await pg.query('INSERT INTO leads(id,workspace_id,stage_id,pipeline_id) VALUES($1,$2,$3,$4)',[leadId,ws,stage,pipeline]);
 await pg.query('INSERT INTO crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action) VALUES($1,$2,$3,$4,$5)',[ws,pipeline,stage,action.id,JSON.stringify(action)]);

 await test('legacy event retains moved matching and original dedupe identity',async()=>{
  const e=await event();delete e.event_kind;let input;
  await dispatchSlimStageMove(db,e,async(_,value)=>{input=value;return [];});
  assert.equal(input.event,'moved');assert.equal(input.eventId,'slim-stage-move:'+e.id);assert.equal(input.deferExecution,true);
 });
 await test('created event matches creation-only action and movement does not',async()=>{
  await pg.query('UPDATE crm_stage_automations SET action=$1',[JSON.stringify({...action,execution:{trigger:{kind:'created-only'}}})]);
  const created=await event({event_kind:'created'}),moved=await event();
  await dispatchSlimStageMove(db,created,enqueue);await dispatchSlimStageMove(db,moved,enqueue);
  const jobs=await rows('SELECT context,dedupe_key FROM crm_automation_jobs');assert.equal(jobs.length,1);
  assert.equal(jobs[0].context.event,'created');assert.equal(jobs[0].dedupe_key,action.id+':slim-stage-move:'+created.id);
 });
 await test('confirmed event keeps its bot job deferred and preserves unread state',async()=>{
  const e=await event();assert.equal(await processSlimStageMoveEvents(db,enqueue),1);
  const saved=await getEvent(e.id);assert.equal(saved.status,'dispatched');assert(saved.finished_at);assert.equal(saved.last_error,null);
  assert.equal((await rows('SELECT status FROM crm_automation_jobs'))[0].status,'pending');
  assert.equal((await rows('SELECT last_message_from FROM leads WHERE id=$1',[leadId]))[0].last_message_from,'lead');
 });
 await test('failed final acknowledgement recovers one durable job after lease expiry',async()=>{
  const e=await event();beforeCall=plan=>plan.patch?.status==='dispatched'?{data:null,error:{message:'response lost'}}:null;
  await assert.rejects(processSlimStageMoveEvents(db,enqueue),/confirmar/);
  assert.equal((await getEvent(e.id)).status,'dispatching');assert.equal(await count('crm_automation_jobs'),1);
  beforeCall=null;await pg.query('UPDATE slim_stage_move_events SET started_at=$1 WHERE id=$2',[oldLease(),e.id]);
  assert.equal(await processSlimStageMoveEvents(db,enqueue),1);assert.equal(await count('crm_automation_jobs'),1);
  const job=(await rows('SELECT id FROM crm_automation_jobs'))[0];await runClaimedJob(db,job.id);await runClaimedJob(db,job.id);
  assert.equal(executions,1);assert.equal((await getEvent(e.id)).attempts,2);
 });
 await test('active lease cannot be claimed or dispatched twice',async()=>{
  const e=await event();assert.equal((await db.rpc('slim_claim_stage_move',{_id:e.id})).data.length,1);
  assert.equal((await db.rpc('slim_claim_stage_move',{_id:e.id})).data.length,0);
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('expired fifth claim closes as error without replay',async()=>{
  const e=await event({status:'dispatching',attempts:5,started_at:oldLease()});
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);const saved=await getEvent(e.id);
  assert.equal(saved.status,'error');assert.equal(saved.attempts,5);assert(saved.finished_at);assert.match(saved.last_error,/Confira/);assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('unexpired fifth claim remains owned by its current worker',async()=>{
  const e=await event({status:'dispatching',attempts:5,started_at:new Date().toISOString()});
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);assert.equal((await getEvent(e.id)).status,'dispatching');assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('exhausted-lease sweep is bounded to four rows',async()=>{
  for(let i=0;i<7;i++)await event({status:'dispatching',attempts:5,started_at:oldLease()});
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);
  assert.equal((await rows("SELECT id FROM slim_stage_move_events WHERE status='error'")).length,4);
  assert.equal((await rows("SELECT id FROM slim_stage_move_events WHERE status='dispatching'")).length,3);
 });
 await test('normal dispatch remains bounded to four events',async()=>{
  for(let i=0;i<7;i++)await event();assert.equal(await processSlimStageMoveEvents(db,enqueue),4);
  assert.equal(await count('crm_automation_jobs'),4);assert.equal((await rows("SELECT id FROM slim_stage_move_events WHERE status='pending'")).length,3);
 });
 await test('sweep CAS preserves a lease renewed after it was selected',async()=>{
  const e=await event({status:'dispatching',attempts:5,started_at:oldLease()});let renewed=false;
  beforeCall=async plan=>{if(plan.patch?.status==='error'&&!renewed){renewed=true;await pg.query('UPDATE slim_stage_move_events SET started_at=clock_timestamp() WHERE id=$1',[e.id]);}return null;};
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);assert.equal((await getEvent(e.id)).status,'dispatching');assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('final CAS loss never counts a successful acknowledgement',async()=>{
  const e=await event();let changed=false;
  beforeCall=async plan=>{if(plan.patch?.status==='dispatched'&&!changed){changed=true;await pg.query("UPDATE slim_stage_move_events SET attempts=attempts+1,last_error='new owner' WHERE id=$1",[e.id]);}return null;};
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);const saved=await getEvent(e.id);
  assert.equal(saved.status,'dispatching');assert.equal(saved.attempts,2);assert.equal(saved.last_error,'new owner');assert.equal(await count('crm_automation_jobs'),1);
 });
 await test('enqueue failure is retained with bounded attempt and no bot',async()=>{
  const e=await event();assert.equal(await processSlimStageMoveEvents(db,async()=>[{ok:false}]),0);
  const saved=await getEvent(e.id);assert.equal(saved.status,'pending');assert.equal(saved.attempts,1);assert.equal(saved.finished_at,null);assert(saved.last_error);assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('fifth failed enqueue is terminal with a finished timestamp',async()=>{
  const e=await event({attempts:4});assert.equal(await processSlimStageMoveEvents(db,async()=>[{ok:false}]),0);
  const saved=await getEvent(e.id);assert.equal(saved.status,'error');assert.equal(saved.attempts,5);assert(saved.finished_at);
 });
 await test('retry-state CAS loss preserves the newer owner',async()=>{
  const e=await event();beforeCall=async plan=>{if(plan.patch?.status==='pending')await pg.query("UPDATE slim_stage_move_events SET status='dispatched',attempts=2,last_error='new owner' WHERE id=$1",[e.id]);return null;};
  assert.equal(await processSlimStageMoveEvents(db,async()=>[{ok:false}]),0);
  const saved=await getEvent(e.id);assert.equal(saved.status,'dispatched');assert.equal(saved.attempts,2);assert.equal(saved.last_error,'new owner');
 });
 await test('failed retry-state persistence is reported and keeps the claim',async()=>{
  const e=await event();beforeCall=plan=>plan.patch?.status==='pending'?{data:null,error:{message:'DB down'}}:null;
  await assert.rejects(processSlimStageMoveEvents(db,async()=>[{ok:false}]),/confirmar/);assert.equal((await getEvent(e.id)).status,'dispatching');
 });
 await test('sweep read failure does not masquerade as an empty healthy queue',async()=>{
  beforeCall=plan=>plan.table==='slim_stage_move_events'&&plan.filters?.some(([,op])=>op==='>=')?{data:null,error:{message:'DB down'}}:null;
  await assert.rejects(processSlimStageMoveEvents(db,enqueue),/tentativas interrompidas/);
 });
 await test('sweep write failure preserves the exhausted event for inspection',async()=>{
  const e=await event({status:'dispatching',attempts:5,started_at:oldLease()});beforeCall=plan=>plan.patch?.status==='error'?{data:null,error:{message:'DB down'}}:null;
  await assert.rejects(processSlimStageMoveEvents(db,enqueue),/encerrar/);assert.equal((await getEvent(e.id)).status,'dispatching');
 });
 await test('normal queue read failure is reported',async()=>{
  beforeCall=plan=>plan.or?{data:null,error:{message:'DB down'}}:null;await assert.rejects(processSlimStageMoveEvents(db,enqueue),/Fila de movimentações/);
 });
 await test('claim failure does not enqueue or mark the event complete',async()=>{
  const e=await event();beforeCall=plan=>plan.rpc?{data:null,error:{message:'DB down'}}:null;
  await assert.rejects(processSlimStageMoveEvents(db,enqueue),/reservar/);assert.equal((await getEvent(e.id)).status,'pending');assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('lead no longer in the destination is skipped without a job',async()=>{
  const e=await event();await pg.query('UPDATE leads SET stage_id=NULL WHERE id=$1',[leadId]);
  assert.equal(await processSlimStageMoveEvents(db,enqueue),1);assert.equal((await getEvent(e.id)).status,'skipped');assert.equal(await count('crm_automation_jobs'),0);
 });
 await test('lead read failure remains retryable instead of a false skipped result',async()=>{
  const e=await event();beforeCall=plan=>plan.table==='leads'?{data:null,error:{message:'DB down'}}:null;
  assert.equal(await processSlimStageMoveEvents(db,enqueue),0);assert.equal((await getEvent(e.id)).status,'pending');assert.equal(await count('crm_automation_jobs'),0);
 });
 assert.equal(await count('slim_stage_move_events'),0);assert.equal(await count('crm_automation_jobs'),0);
 console.log(`${checks}/${checks} isolated stage-worker recovery checks passed. No production query, contact movement, bot or message.`);
}finally{await pg.close();}
