import assert from 'node:assert/strict';
import { createSlimCopilotFixture } from './fixtures/slim-copilot-isolated.mjs';
import { buildSlimCopilotTools } from '../src/lib/slim-copilot.server.ts';
import { decideSlimCopilotProposalCore, listSlimCopilotProposalsCore } from '../src/lib/slim-copilot-approval.core.ts';
import { executeSlimCopilotTextClaim } from '../src/lib/slim-copilot-text.server.ts';

// Complete application handlers against actual in-memory PostgreSQL migrations.
// This small adapter only implements the Supabase query shapes used below. Every
// query runs under authenticated RLS; only final receipt storage uses service_role.
const f = await createSlimCopilotFixture();
const {db,ids}=f, identity={workspaceId:ids.workspace,actorId:ids.owner};
const sqlName=name=>{assert(/^[a-z_][a-z_0-9]*$/.test(name));return '"'+name+'"';};
const fields=columns=>columns.split(',').map(column=>{
 const alias=/^([a-z_][a-z_0-9]*):([a-z_][a-z_0-9]*)->>([a-z_][a-z_0-9]*)$/.exec(column);
 return alias?`${sqlName(alias[2])}->>'${alias[3]}' AS ${sqlName(alias[1])}`:sqlName(column);
}).join(',');
const trace=[],delivery=[];
const funcs={
 slim_copilot_create_proposal:['p_workspace_id','p_request_id','p_kind','p_payload'],
 slim_copilot_list_proposals:['p_workspace_id'],slim_copilot_get_proposal:['p_workspace_id','p_proposal_id'],
 slim_copilot_decide_proposal:['p_workspace_id','p_proposal_id','p_expected_version','p_decision'],
 slim_inbox_automation_state:['p_workspace_id','p_lead_id'],
};
const client={
 from(table){
  assert(['profiles','workspaces','workspace_members','leads','lead_activities','whatsapp_web_sessions','whatsapp_web_messages'].includes(table),'Unexpected table '+table);
  let columns='id',filters=[],orders=[],limit=null,insert=null,single=false;
  const run=async()=>{
   const params=[],bind=value=>{params.push(value);return '$'+params.length;};
   try{
    let query;
    if(insert){
     const keys=Object.keys(insert);query=`INSERT INTO public.${sqlName(table)}(${keys.map(sqlName).join(',')}) VALUES(${keys.map(key=>bind(insert[key])).join(',')}) RETURNING ${fields(columns)}`;
    }else{
     const where=filters.map(([type,key,value])=>type==='eq'?`${sqlName(key)}=${bind(value)}`:type==='in'?`${sqlName(key)} IN (${value.map(bind).join(',')})`:type==='is'?`${sqlName(key)} IS NULL`:assert.fail('Unknown filter')).join(' AND ');
     query=`SELECT ${fields(columns)} FROM public.${sqlName(table)}${where?' WHERE '+where:''}${orders.length?' ORDER BY '+orders.map(([key,opts])=>sqlName(key)+(opts?.ascending===false?' DESC':' ASC')).join(','):''}${limit===null?'':' LIMIT '+Number(limit)}`;
    }
    trace.push({table,write:Boolean(insert),columns});
    const {rows}=await db.query(query,params);return {data:single?(rows[0]??null):rows,error:null};
   }catch(error){return {data:null,error:{code:error.code,message:error.message}};}
  };
  const q={select(v){columns=v;return q;},eq(k,v){filters.push(['eq',k,v]);return q;},in(k,v){filters.push(['in',k,v]);return q;},is(k,v){filters.push(['is',k,v]);return q;},order(k,v){orders.push([k,v]);return q;},limit(v){assert(Number.isInteger(v)&&v>=0);limit=v;return q;},insert(v){insert=v;return q;},maybeSingle(){single=true;return run();},then(a,b){return run().then(a,b);}};
  return q;
 },
 async rpc(name,args){
  trace.push({rpc:name});
  if(name==='get_evolution_credentials'){
   assert.equal(args._session_id,ids.session);
   assert.equal(args._key,'synthetic-encryption-key');
   return {data:{workspace_id:ids.workspace,status:'conectado',instance_name:'synthetic-isolated',api_key:'synthetic-provider-key'},error:null};
  }
  assert(name in funcs,'Unexpected RPC '+name);
  const names=funcs[name];assert.deepEqual(Object.keys(args).sort(),[...names].sort());
  try{return {data:await f.scalar(`SELECT public.${sqlName(name)}(${names.map((_,i)=>'$'+(i+1)).join(',')})`,names.map(key=>args[key])),error:null};}
  catch(error){return {data:null,error:{code:error.code,message:error.message}};}
 },
};
const context={supabase:client,userId:ids.owner};
const approve=proposal=>({...identity,proposalId:proposal.id,expectedVersion:proposal.version,decision:'approve'});
const fetcher=async(url,request)=>{delivery.push({url,request});return new Response(JSON.stringify({key:{id:'WA-INTEGRATED-'+delivery.length,remoteJid:'5511900000001@s.whatsapp.net',fromMe:true}}),{status:201});};
async function finishText(claim,outcome){
 await f.setActor(ids.owner,'service_role');
 try{return await f.scalar('SELECT public.slim_copilot_finish_text($1,$2,$3,$4)',[claim.workspaceId,claim.proposalId,claim.claimToken,outcome]);}
 finally{await f.setActor(ids.owner);}
}
const deps={executeText:claim=>executeSlimCopilotTextClaim(context,claim,{fetcher}),finishText};
const forbidden=()=>{throw new Error('Execution is forbidden in this scenario');};
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS copilot integration: '+name);}
const savedFetch=globalThis.fetch,savedKey=process.env.INTEGRATION_ENCRYPTION_KEY,savedBase=process.env.EVOLUTION_BASE_URL;
globalThis.fetch=async()=>{throw new Error('External network is forbidden in PostgreSQL integration tests');};
process.env.INTEGRATION_ENCRYPTION_KEY='synthetic-encryption-key';process.env.EVOLUTION_BASE_URL='https://evolution.example.invalid';
try{
 // Additional existing live message columns used only by the approved-text adapter.
 await f.privileged(()=>db.exec('ALTER TABLE public.whatsapp_web_messages ADD COLUMN message_type text, ADD COLUMN delivery_status text'));
 await f.setActor();
 let moved;
 await test('real catalog only prepares immutable SQL proposal; no lead/run/event changes',async()=>{
  const tools=buildSlimCopilotTools(context,identity,'stage-human-turn');
  const result=await tools.propose_move_lead_stage.execute({leadId:ids.lead,stageId:ids.toStage});moved=result.proposal;
  assert.equal(moved.status,'pending');assert.equal(moved.kind,'move_lead_stage');
  assert.equal(await f.scalar('SELECT stage_id FROM public.leads WHERE id=$1',[ids.lead]),ids.fromStage);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.slim_stage_move_events'),0);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.salesbot_runs'),0);
  assert.equal(delivery.length,0);assert(!JSON.stringify(result).includes('claimToken'));
 });
 await test('stream retry reuses the same persisted proposal, then approval emits one event',async()=>{
  const replay=await buildSlimCopilotTools(context,identity,'stage-human-turn').propose_move_lead_stage.execute({stageId:ids.toStage,leadId:ids.lead});
  assert.equal(replay.proposal.id,moved.id);
  const first=await decideSlimCopilotProposalCore(client,ids.owner,approve(moved),{executeText:forbidden,finishText:forbidden});
  const next=await decideSlimCopilotProposalCore(client,ids.owner,approve(moved),{executeText:forbidden,finishText:forbidden});
  assert.equal(first.proposal.status,'succeeded');assert.equal(next.proposal.result.receiptId,first.proposal.result.receiptId);
  assert.equal(await f.scalar('SELECT stage_id FROM public.leads WHERE id=$1',[ids.lead]),ids.toStage);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.slim_stage_move_events'),1);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.salesbot_runs'),0);assert.equal(delivery.length,0);
 });
 await test('approved SalesBot reuses existing RPC, queues once, and stop targets its exact run',async()=>{
  const tools=buildSlimCopilotTools(context,identity,'bot-human-turn');
  const p=(await tools.propose_start_salesbot.execute({leadId:ids.lead,botId:ids.bot})).proposal;
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.salesbot_runs'),0);
  const first=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),{executeText:forbidden,finishText:forbidden});
  const again=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),{executeText:forbidden,finishText:forbidden});
  assert.equal(first.proposal.status,'succeeded');assert.equal(again.proposal.result.receiptId,first.proposal.result.receiptId);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.salesbot_runs'),1);
  assert.equal(await f.scalar('SELECT status FROM public.salesbot_runs WHERE id=$1',[first.proposal.result.receiptId]),'queued');
  const stop=(await buildSlimCopilotTools(context,identity,'stop-human-turn').propose_stop_salesbot.execute({leadId:ids.lead,runId:first.proposal.result.receiptId})).proposal;
  const stopped=await decideSlimCopilotProposalCore(client,ids.owner,approve(stop),{executeText:forbidden,finishText:forbidden});
  assert.equal(stopped.proposal.status,'succeeded');assert.equal(await f.scalar('SELECT status FROM public.salesbot_runs WHERE id=$1',[first.proposal.result.receiptId]),'finished');
  assert.equal(delivery.length,0);
 });
 await test('text prepares exact recipient and rejecting through backend never calls provider',async()=>{
  const p=(await buildSlimCopilotTools(context,identity,'text-reject-turn').propose_send_text.execute({leadId:ids.lead,text:'Somente proposta rejeitada.'})).proposal;
  assert.equal(p.preview.content,'Somente proposta rejeitada.');assert(p.preview.targetLabel.includes('+5511900000001'));
  const result=await decideSlimCopilotProposalCore(client,ids.owner,{...approve(p),decision:'reject'},{executeText:forbidden,finishText:forbidden});
  assert.equal(result.proposal.status,'rejected');assert.equal(delivery.length,0);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.whatsapp_web_messages'),0);
 });
 await test('real SQL claim and real text adapter persist provider/history/ledger once',async()=>{
  const content='Texto exato aprovado.\nSomente fixture local.';
  const p=(await buildSlimCopilotTools(context,identity,'text-approve-turn').propose_send_text.execute({leadId:ids.lead,text:content})).proposal;
  const first=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),deps);
  assert.equal(first.proposal.status,'succeeded');assert.equal(first.proposal.result.receiptId,'WA-INTEGRATED-1');assert.equal(first.proposal.result.historyPending,false);
  assert.deepEqual(JSON.parse(delivery[0].request.body),{number:'5511900000001',text:content});
  assert.equal(await f.scalar('SELECT body FROM public.whatsapp_web_messages WHERE id=$1',[p.id]),content);
  assert.equal(await f.scalar("SELECT payload->>'proposal_id' FROM public.lead_activities WHERE id=$1",[p.id]),p.id);
  const again=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),deps);assert.equal(again.proposal.status,'succeeded');assert.equal(delivery.length,1);
  const listed=await listSlimCopilotProposalsCore(client,ids.owner,identity);assert.equal(listed.proposals.find(row=>row.id===p.id).result.receiptId,'WA-INTEGRATED-1');
  assert(!JSON.stringify(listed).includes('claimToken'));assert(!JSON.stringify(first).includes('synthetic-provider-key'));
 });
 await test('lost ledger finish survives refresh as uncertain with no provider retry',async()=>{
  const p=(await buildSlimCopilotTools(context,identity,'text-lost-finish-turn').propose_send_text.execute({leadId:ids.lead,text:'Confirmação final perdida sintética.'})).proposal;
  const first=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),{executeText:deps.executeText,finishText:async()=>{throw new Error('Simulated DB receipt outage');}});
  assert.equal(first.proposal.status,'executing');assert.equal(delivery.length,2);
  await f.privileged(()=>db.query("UPDATE private.slim_copilot_proposals SET claimed_at=clock_timestamp()-interval '3 minutes' WHERE id=$1",[p.id]));
  const listed=await listSlimCopilotProposalsCore(client,ids.owner,identity);assert.equal(listed.proposals.find(row=>row.id===p.id).status,'uncertain');
  const again=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),deps);assert.equal(again.proposal.status,'uncertain');assert.equal(delivery.length,2);
 });
 await test('target change after durable claim stops the actual adapter before provider',async()=>{
  const p=(await buildSlimCopilotTools(context,identity,'text-target-change-turn').propose_send_text.execute({leadId:ids.lead,text:'Não enviar após a mudança.'})).proposal;
  const changedDeps={...deps,executeText:async claim=>{
   await f.privileged(()=>db.query("UPDATE public.leads SET custom_data=custom_data||'{\"do_not_contact\":true}' WHERE id=$1",[ids.lead]));
   return deps.executeText(claim);
  }};
  const result=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),changedDeps);
  assert.equal(result.proposal.status,'stale');assert.equal(delivery.length,2);
  await f.privileged(()=>db.query("UPDATE public.leads SET custom_data=custom_data-'do_not_contact' WHERE id=$1",[ids.lead]));
 });
 await test('changed stage before approval is stale and preserves the operator move',async()=>{
  const p=(await buildSlimCopilotTools(context,identity,'stale-stage-turn').propose_move_lead_stage.execute({leadId:ids.lead,stageId:ids.laterStage})).proposal;
  await f.privileged(()=>db.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2',[ids.fromStage,ids.lead]));
  const result=await decideSlimCopilotProposalCore(client,ids.owner,approve(p),{executeText:forbidden,finishText:forbidden});
  assert.equal(result.proposal.status,'stale');assert.equal(await f.scalar('SELECT stage_id FROM public.leads WHERE id=$1',[ids.lead]),ids.fromStage);
  assert.equal(await f.scalar('SELECT count(*)::int FROM public.slim_stage_move_events'),1);
 });
 await test('real SQL identities cannot cross actors or finish with authenticated JWT',async()=>{
  const p=(await buildSlimCopilotTools(context,identity,'permission-stage-turn').propose_move_lead_stage.execute({leadId:ids.lead,stageId:ids.toStage})).proposal;
  await f.setActor(ids.operator);
  const operatorClient={...context,userId:ids.operator};
  await assert.rejects(listSlimCopilotProposalsCore(client,ids.operator,identity),/operador mudou/);
  await assert.rejects(decideSlimCopilotProposalCore(client,ids.operator,{...approve(p),actorId:ids.operator},{executeText:forbidden,finishText:forbidden}),/decisão não foi confirmada/);
  assert(operatorClient.userId!==identity.actorId);
  await f.setActor(ids.owner);
  await assert.rejects(f.scalar('SELECT public.slim_copilot_finish_text($1,$2,$3,$4)',[ids.workspace,p.id,p.version,{status:'succeeded',result:{summary:'Forged',receiptId:'FORGED'}}]),/permission denied/);
  assert.equal(delivery.length,2);
 });
 console.log(`Copilot integration: ${passed}/${passed} passed; actual PostgreSQL migrations and application handlers, synthetic provider only.`);
}finally{
 globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.INTEGRATION_ENCRYPTION_KEY;else process.env.INTEGRATION_ENCRYPTION_KEY=savedKey;if(savedBase===undefined)delete process.env.EVOLUTION_BASE_URL;else process.env.EVOLUTION_BASE_URL=savedBase;
 await db.close();
}
