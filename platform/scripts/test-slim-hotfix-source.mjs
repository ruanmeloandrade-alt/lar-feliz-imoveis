import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {dispatchSlimStageMove,processSlimStageMoveEvents} from '../src/lib/slim-stage-move-worker.core.ts';
import {readSlimMediaFile,sendSlimMediaOnce} from '../src/lib/slim-media-file.client.ts';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;async function test(name,fn){await fn();n++;console.log('PASS prioritized hotfix: '+name);}
const stageReady=JSON.parse(read('scripts/slim-stage-move-release.json')).enabled===true;
const paths=['src/routes/saude-slim.tsx','src/lib/leads.functions.ts','src/components/inbox/InboxPage.legacy.tsx','src/lib/saude-slim-funnel-client.ts','src/lib/stage-automation-engine.server.ts','src/lib/slim-audience-runtime.server.ts','src/lib/slim-stage-move.functions.ts','src/lib/slim-stage-move-worker.core.ts','src/lib/slim-stage-move-worker.server.ts','src/lib/slim-media-transport.server.ts','src/lib/slim-media-file.client.ts','src/lib/slim-media-io.ts'];
const [history,media,inbox,client,engine,worker]=paths.map(read);
await test('all changed sources parse after earlier transforms',()=>{for(const p of paths){const a=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(a.parseDiagnostics.length,0,p);}});
await test('one sales list without inactive CRM requests',()=>{assert.equal(history.split('mode="history"').length-1,1);for(const s of ['getSaudeSlimSalesHistory','getSaudeSlimSalesProducts','<details','<header','useQuery'])assert(!history.includes(s));});
await test('history search and document actions retained',()=>{const ui=read('src/components/erp/SlimOrderHistory.tsx');assert(ui.includes('>Pesquisar</button>'));assert(ui.includes('<table'));assert(ui.includes('openDocument(order)'));});
await test('media contains no restart or connection preflight',()=>{assert(!media.includes('/instance/restart'));assert(!media.includes('/instance/connectionState'));assert(!media.includes('restartEvolutionInstance'));assert(media.includes('boundedMediaRequest(args)'));assert(media.includes('decodeSlimMedia(data.base64)'));assert(media.includes('getRequest()?.signal.aborted'));});
await test('one provider request and no automatic mutation retry',()=>{const send=media.split('export const sendLeadMedia')[1];assert.equal(send.split('await sendEvolutionMediaRequest(').length-1,1);const mut=inbox.split('const mediaMut = useMutation({')[1].split('const reactionFn')[0];assert(mut.includes('retry:false'));assert(mut.includes('readSlimMediaFile(file)'));assert(mut.includes('sendSlimMediaOnce(async signal=>'));assert(!mut.includes('setDraft('));assert(!mut.includes('String.fromCharCode'));assert(mut.includes('signal,'));});
await test('previous history remains on demand without fifty-page auto loops',()=>{assert(!inbox.includes('page < 50 && cursor'));assert(inbox.includes('async function loadMoreActivities()'));assert(inbox.includes('async function loadMoreGroupMessages()'));assert(!inbox.includes('window.setInterval(refreshLeadHead'));assert.equal(inbox.split('refetchInterval: 20_000').length-1,2);});
await test('stage UI binds new RPC only when schema installation is verified',()=>{const move=client.split('export async function moveSlimLead(')[1].split('export async function updateSlimStage(')[0];if(stageReady){assert(move.includes('moveSlimLeadWithAutomations'));assert(!move.includes('.update('));assert(!move.includes('last_message_from'));assert(!move.includes('backendPending:true'));assert(move.includes('stageMoveRequests.delete(key)'));}else{assert(!client.includes('moveSlimLeadWithAutomations'));assert(move.includes('backendPending:true'));assert(client.includes('resolveSlimContactId'));}});
await test('prepared server retains canonical identity and permission checks',()=>{const s=read('src/lib/slim-stage-move.functions.ts');for(const t of ['requireSupabaseAuth','assertSlimOperator','resolveSlimContactId','slim_move_lead_and_emit'])assert(s.includes(t));assert(!s.includes('startSalesbotRun'));});
await test('new worker binding follows schema readiness without replacing old jobs',()=>{assert.equal(worker.includes('await tickSlimStageMoveEvents()'),stageReady);assert(worker.includes('void processStageJobs()'));if(stageReady){const guard=worker.indexOf('if(!await dbReadyForQueue(db))return;');const tick=worker.indexOf('await tickSlimStageMoveEvents()');assert(guard>=0&&tick>guard);assert(!worker.includes('void tickSlimStageMoveEvents()'));}assert(engine.includes('delay === 0 && !input.deferExecution'));assert(engine.includes('if(stageActionsError)throw'));});
function fakeDb(){
 const state={lead:{id:'lead',stage_id:'stage',pipeline_id:'pipeline',status:'active',merged_into_id:null},fail:false,updates:[]};
 const db={from(){let patch,exhaustedSweep=false;const q={
  select(){return q;},eq(){return q;},or(){return q;},lt(){return q;},gte(){exhaustedSweep=true;return q;},order(){return q;},limit(){return q;},
  update(v){patch=v;return q;},
  async maybeSingle(){
   if(patch){state.updates.push(patch);return {data:{id:'event'},error:null};}
   return {data:state.lead,error:state.fail?{}:null};
  },
  then(a,b){return Promise.resolve({data:exhaustedSweep?[]:[{id:'event'}],error:null}).then(a,b);},
 };return q;},async rpc(){return {data:[{id:'event',workspace_id:'ws',lead_id:'lead',to_stage_id:'stage',pipeline_id:'pipeline',from_stage_id:'old',attempts:1}],error:null};}};
 return {db,state};
}
const event={id:'event',workspace_id:'ws',lead_id:'lead',to_stage_id:'stage',pipeline_id:'pipeline',from_stage_id:'old'};
await test('prepared event passes stable identity and defer flag to enqueue',async()=>{const f=fakeDb();let args;const outcome=await dispatchSlimStageMove(f.db,event,async(_,input)=>{args=input;return [{ok:true,queuedFor:'now'}];});assert.equal(outcome,'dispatched');assert.equal(args.eventId,'slim-stage-move:event');assert.equal(args.event,'moved');assert.equal(args.deferExecution,true);assert.equal(args.stageId,'stage');});
await test('contact moved away cannot start an obsolete stage bot',async()=>{const f=fakeDb();f.state.lead.stage_id='another';let called=false;assert.equal(await dispatchSlimStageMove(f.db,event,async()=>{called=true;return [];}),'skipped');assert.equal(called,false);});
await test('read failure is not silently acknowledged',async()=>{const f=fakeDb();f.state.fail=true;await assert.rejects(dispatchSlimStageMove(f.db,event,async()=>[]));});
await test('failed enqueue retains event for bounded retry',async()=>{const f=fakeDb();await processSlimStageMoveEvents(f.db,async()=>[{ok:false}]);assert.equal(f.state.updates[0].status,'pending');assert(f.state.updates[0].last_error);});
await test('completed enqueue records dispatched outcome',async()=>{const f=fakeDb();assert.equal(await processSlimStageMoveEvents(f.db,async()=>[{ok:true}]),1);assert.equal(f.state.updates[0].status,'dispatched');});
const ast=ts.createSourceFile('engine.ts',engine,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='enqueueLeadAutomationEvent');assert(fn);
const compiled=ts.transpileModule(fn.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
await test('real enqueue persists an immediate SalesBot job without inline execution',async()=>{
 const calls=[],action={id:'configured-action',title:'SalesBot',enabled:true,config:{kind:'salesbot',botId:'configured-bot'},execution:{delayMinutes:0},stageIds:['stage']};let executed=0;
 const db={from(table){let value;const q={select(){return q;},eq(){return q;},order(){return q;},insert(v){value=v;calls.push(v);return q;},maybeSingle:async()=>({data:{id:'job'},error:null}),then(a,b){return Promise.resolve({data:[{stage_id:'stage',action,enabled:true}],error:null}).then(a,b);}};return q;}};
 const run=new Function('loadLeadCtx','isAutomationConfigured','scheduleDelayMinutes','shouldRunForEvent','runJobById',"const stageDueAt=()=>Date.now(), normalizeTrigger=()=>({kind: \"created-or-moved\"}), STAGE_TIMER_KINDS=[], stageReminderTarget=()=>undefined;"+compiled+';return enqueueLeadAutomationEvent;')(
  async()=>({id:'lead',workspaceId:'ws',stageId:'stage',pipelineId:'pipeline'}),()=>true,()=>0,()=>true,async()=>{executed++;return {ok:true};});
 const r=await run(db,{leadId:'lead',workspaceId:'ws',event:'moved',eventId:'stable-event',deferExecution:true});assert.equal(executed,0);assert.equal(calls.length,1);assert.equal(calls[0].dedupe_key,'configured-action:stable-event');assert.equal(calls[0].status,'pending');assert.equal(r[0].ok,true);assert(r[0].queuedFor);
});
await test('browser operation deadline releases UI and aborts single request',async()=>{let calls=0,signal;await assert.rejects(sendSlimMediaOnce(async s=>{calls++;signal=s;return new Promise(()=>{});},10),/não foi confirmado/);assert.equal(calls,1);assert.equal(signal.aborted,true);});
const previousReader=globalThis.FileReader;
try{
 globalThis.FileReader=class{result='data:application/pdf;base64,JVBERg==';readAsDataURL(){queueMicrotask(()=>this.onload?.());}abort(){this.onabort?.();}};
 await test('asynchronous file reader preserves base64',async()=>assert.equal(await readSlimMediaFile({size:4}), 'JVBERg=='));
 await test('empty and oversize media rejected before reading',async()=>{await assert.rejects(readSlimMediaFile({size:0}));await assert.rejects(readSlimMediaFile({size:16777217}));});
}finally{globalThis.FileReader=previousReader;}
await test('entire hotfix transform is idempotent',()=>{const targets=[...paths,'scripts/test-slim-erp-release-source.mjs'],before=targets.map(read);execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-history-media-stage-hotfix.mjs',import.meta.url))],{stdio:'inherit'});assert.deepEqual(targets.map(read),before);});
console.log(`${n}/${n} prioritized hotfix checks passed. Stage production bindings enabled: ${stageReady}. Prepared logic and isolated SQL do not prove live migration, browser or WhatsApp delivery.`);
