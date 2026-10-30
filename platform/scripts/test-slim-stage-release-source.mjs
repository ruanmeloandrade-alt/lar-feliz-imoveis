import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const release=JSON.parse(read('scripts/slim-stage-move-release.json'));
let n=0;
function test(name,fn){fn();n++;console.log('PASS stage release: '+name);}
test('enabled only for the verified real migration',()=>{assert.equal(release.enabled,true);assert(release.reason.includes('20261016215531'));});
const funnel=read('src/lib/saude-slim-funnel-client.ts');
const engine=read('src/lib/stage-automation-engine.server.ts');
const runtime=read('src/lib/slim-audience-runtime.server.ts');
const worker=read('src/lib/slim-stage-move-worker.server.ts');
const api=read('src/lib/slim-stage-move.functions.ts');
const ui=read('src/legacy/crm.funis-de-venda.legacy.tsx');
test('funnel writes via authenticated atomic RPC not in browser',()=>{
 const move=funnel.split('export async function moveSlimLead(')[1]?.split('export async function updateSlimStage(')[0];
 assert(move && move.includes('moveSlimLeadWithAutomations'));
 assert(!move.includes('.from("leads").update('));
 assert(!move.includes('last_message_from'));
 assert(move.includes('stageMoveRequests.delete(key)'));
});
test('server movement is scoped and idempotent',()=>{
 for(const marker of ['requireSupabaseAuth','assertSlimOperator','resolveSlimContactId','_request_id:data.requestId','r.data.leadId!==leadId'])assert(api.includes(marker));
});
test('scheduler invokes staged events after DB readiness and before regular jobs',()=>{
 assert(runtime.includes('await tickSlimStageMoveEvents()'));
 assert(runtime.includes('void processStageJobs().catch(report)'));
 const block=runtime.slice(runtime.indexOf('async function processStageJobs()'),runtime.indexOf('export function ensureSlimAudienceWorker()'));
 const guard=block.indexOf('if(!await dbReadyForQueue(db))return;');
 const tick=block.indexOf('await tickSlimStageMoveEvents()');
 const jobs=block.indexOf("const {tickStageAutomationJobs}=await import");
 assert(guard>=0&&tick>guard&&jobs>tick);
 assert(!runtime.includes('void tickSlimStageMoveEvents()'));
});
test('worker retains bounded event processing and stable event IDs',()=>{
 assert(worker.includes('processSlimStageMoveEvents'));
 const core=read('src/lib/slim-stage-move-worker.core.ts');
 assert(core.includes("eventId:'slim-stage-move:'+event.id"));
 assert(core.includes('deferExecution:true'));
 assert(core.includes('attempts'));
});
test('stage action job is asynchronous and skips obsolete stage',()=>{
 assert(engine.includes('if (delay === 0 && !input.deferExecution)'));
 assert(engine.includes('if(stageActionsError)throw'));
 assert(engine.includes("String(job.context?.event_id??'').startsWith('slim-stage-move:')"));
});
test('Kanban movement preserves unread and sender indicators',()=>{
 const move=ui.slice(ui.indexOf('function moveLead(leadId:'),ui.indexOf('// ---- Novo Lead (dialog)'));
 assert(!move.includes('lastMessageFrom: "us"'));
 assert(!move.includes('unreadCount: 0'));
 assert(move.includes('automationQueued'));
 assert(move.includes('toast.error(e instanceof Error'));
 assert(move.includes('reloadFunnels(crmSourceId).catch'));
});
test('existing editor and chat route remain available',()=>{
 assert(ui.includes('function handleLeadClick('));
 assert(ui.includes('onLeadClick={handleLeadClick}'));
 assert(ui.includes('listStageAutomationsServer'));
 assert(ui.includes('saveStageAutomationsServer'));
});
test('all changed TypeScript/TSX sources parse',()=>{
 for(const p of ['src/lib/saude-slim-funnel-client.ts','src/lib/stage-automation-engine.server.ts','src/lib/slim-audience-runtime.server.ts','src/lib/slim-stage-move-worker.server.ts','src/legacy/crm.funis-de-venda.legacy.tsx']){
  const ast=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,p);
 }
});
console.log(n+'/'+n+' stage release checks. Migration and grants checked separately on live database; no real leads moved or messages sent.');
