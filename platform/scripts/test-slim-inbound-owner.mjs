import assert from 'node:assert/strict';
import { routeInboundAgentOwnership, waitingEventsAcceptInbound, InboundOwnerBusyError } from '../src/lib/slim-inbound-owner.core.ts';
import { withAgentGuard, withSalesbotGuard, guardedAutomationFetch, AutomationStoppedError } from '../src/lib/inbox-automation-guards.server.ts';

export function fixture() {
  const rows = {
    leads: [{ id:'lead', workspace_id:'ws', phone:'5511999990000', ai_paused:false, active_conversation_agent_id:'agent', active_conversation_agent_version:2 }],
    salesbot_runs: [], conversation_ai_agents: [{ id:'agent', workspace_id:'ws', enabled:true }], lead_activities: [],
  };
  const failures = {}; const writes = [];
  const db = { from(table) {
    const filters=[]; let operation='select', patch=null;
    const run = async single => {
      if(failures[table]) return {data:null,error:{message:'controlled failure'}};
      let data=(rows[table]??[]).filter(row=>filters.every(fn=>fn(row)));
      if(operation==='update') {for(const row of data){Object.assign(row,patch);writes.push({table,patch:{...patch}});}}
      if(operation==='insert') {data=[structuredClone(patch)];rows[table].push(...data);writes.push({table,patch});}
      return {data:single?(data[0]?structuredClone(data[0]):null):structuredClone(data),error:null};
    };
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},update(v){operation='update';patch=v;return q;},insert(v){operation='insert';patch=v;return q;},single(){return run(true);},maybeSingle(){return run(true);},then(a,b){return run(false).then(a,b);}};
    return q;
  }};
  const calls={resume:0,turn:0,options:[],owners:[]};
  const deps={resume:async options=>{calls.resume++;calls.options.push(options);options?.onAgentClaimed?.(options.onlyRunId);},turn:async owner=>{calls.turn++;calls.owners.push(owner);return {reply:'ok',handoff:false};}};
  const addRun=(patch={})=>{const row={id:'run',workspace_id:'ws',lead_id:'lead',status:'waiting_message',stopped_at:null,variables:{ia_agent_id:'agent'},...patch};rows.salesbot_runs.push(row);return row;};
  return {rows,failures,writes,db,calls,deps,addRun,run:()=>routeInboundAgentOwnership(db,{workspaceId:'ws',leadId:'lead'},deps)};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS inbound ownership: '+name);}
await test('direct owner gets one turn and no conventional resume',async()=>{const f=fixture();assert.equal(await f.run(),true);assert.equal(f.calls.turn,1);assert.equal(f.calls.resume,0);assert.deepEqual(f.calls.owners[0],{id:'agent',phone:'5511999990000',version:2});});
await test('waiting IA run exclusively receives inbound',async()=>{const f=fixture();f.addRun();assert.equal(await f.run(),true);assert.equal(f.calls.turn,0);assert.equal(f.calls.options[0].onlyRunId,'run');});
await test('finishing IA run cannot cause second direct answer',async()=>{const f=fixture();const r=f.addRun();f.deps.resume=async o=>{o.onAgentClaimed('run');r.status='finished';};assert.equal(await f.run(),true);assert.equal(f.calls.turn,0);});
await test('handoff to another agent cannot reuse same inbound',async()=>{const f=fixture();f.addRun();f.deps.resume=async o=>{o.onAgentClaimed('run');f.rows.leads[0].active_conversation_agent_id='next';f.rows.salesbot_runs.length=0;};assert.equal(await f.run(),true);assert.equal(f.calls.turn,0);});
await test('run clears ownership without releasing inbound to globals',async()=>{const f=fixture();f.addRun();f.deps.resume=async o=>{o.onAgentClaimed('run');f.rows.leads[0].active_conversation_agent_id=null;};assert.equal(await f.run(),true);});
await test('lost atomic run claim does not fall back to direct IA',async()=>{const f=fixture();f.addRun();f.deps.resume=async()=>{};await assert.rejects(f.run(),InboundOwnerBusyError);assert.equal(f.calls.turn,0);});
await test('claim for a different run is not accepted',async()=>{const f=fixture();f.addRun();f.deps.resume=async o=>o.onAgentClaimed('other');await assert.rejects(f.run(),InboundOwnerBusyError);});
await test('busy run is retriable, not a successful silent drop',async()=>{const f=fixture();f.addRun({status:'running'});await assert.rejects(f.run(),InboundOwnerBusyError);assert.equal(f.calls.turn+f.calls.resume,0);});
await test('timer-owned IA is not bypassed',async()=>{const f=fixture();f.addRun({status:'waiting_timer'});await assert.rejects(f.run(),InboundOwnerBusyError);});
await test('conflicting active IA runs fail closed',async()=>{const f=fixture();f.addRun();f.addRun({id:'run-2'});await assert.rejects(f.run(),InboundOwnerBusyError);});
await test('run with different assigned agent fails closed',async()=>{const f=fixture();f.addRun({variables:{ia_agent_id:'other'}});await assert.rejects(f.run(),InboundOwnerBusyError);});
await test('paused IA owner cannot resume or wake global bots',async()=>{const f=fixture();f.addRun();f.rows.leads[0].ai_paused=true;assert.equal(await f.run(),true);assert.equal(f.calls.turn+f.calls.resume,0);});
await test('stopped run is not treated as owner',async()=>{const f=fixture();f.addRun({stopped_at:'now'});await f.run();assert.equal(f.calls.turn,1);});
await test('foreign workspace runs do not claim local conversation',async()=>{const f=fixture();f.addRun({workspace_id:'other',status:'running'});await f.run();assert.equal(f.calls.turn,1);});
await test('other lead runs do not claim local conversation',async()=>{const f=fixture();f.addRun({lead_id:'other',status:'running'});await f.run();assert.equal(f.calls.turn,1);});
await test('no IA owner preserves conventional dispatcher',async()=>{const f=fixture();f.rows.leads[0].active_conversation_agent_id=null;assert.equal(await f.run(),false);assert.equal(f.calls.resume,1);assert.equal(f.calls.turn,0);});
await test('conventional run assigning IA does not also start globals',async()=>{const f=fixture();f.rows.leads[0].active_conversation_agent_id=null;f.deps.resume=async()=>{f.rows.leads[0].active_conversation_agent_id='agent';};assert.equal(await f.run(),true);assert.equal(f.calls.turn,0);});
await test('lead read error is not no owner',async()=>{const f=fixture();f.failures.leads=true;await assert.rejects(f.run(),/confirmar/);assert.equal(f.calls.turn+f.calls.resume,0);});
await test('run read error is not an empty run list',async()=>{const f=fixture();f.failures.salesbot_runs=true;await assert.rejects(f.run(),/confirmar/);assert.equal(f.calls.turn+f.calls.resume,0);});
await test('missing lead cannot execute',async()=>{const f=fixture();f.rows.leads.length=0;await assert.rejects(f.run(),/não encontrada/);});
await test('resume error cannot fall back to direct IA',async()=>{const f=fixture();f.addRun();f.deps.resume=async()=>{throw new Error('resume failed');};await assert.rejects(f.run(),/resume failed/);assert.equal(f.calls.turn,0);});
await test('handoff updates same owner and writes one audit',async()=>{const f=fixture();f.deps.turn=async()=>({reply:'ok',handoff:true});await f.run();assert.equal(f.rows.leads[0].active_conversation_agent_id,null);assert.equal(f.rows.lead_activities.length,1);});
await test('handoff never clears newer assigned agent',async()=>{const f=fixture();f.deps.turn=async()=>{f.rows.leads[0].active_conversation_agent_id='new';return {reply:'ok',handoff:true};};await f.run();assert.equal(f.rows.leads[0].active_conversation_agent_id,'new');assert.equal(f.writes.length,0);});
await test('handoff never clears restarted same agent',async()=>{const f=fixture();f.deps.turn=async()=>{f.rows.leads[0].active_conversation_agent_version++;return {reply:'ok',handoff:true};};await f.run();assert.equal(f.rows.leads[0].active_conversation_agent_id,'agent');assert.equal(f.writes.length,0);});
await test('returned turn error is not authorization for handoff',async()=>{const f=fixture();f.deps.turn=async()=>({reply:'',handoff:true,error:'controlled failure'});await f.run();assert.equal(f.writes.length,0);});
await test('invalid version prevents direct execution',async()=>{const f=fixture();f.rows.leads[0].active_conversation_agent_version='invalid';await assert.rejects(f.run(),/Versão/);assert.equal(f.calls.turn,0);});
await test('button responses reach their existing execution branch',()=>assert.equal(waitingEventsAcceptInbound([{type:'botao-clicado'}]),true));
await test('message and batch waits remain supported',()=>{assert(waitingEventsAcceptInbound([{type:'msg-recebida'}]));assert(waitingEventsAcceptInbound([{type:'lote-msgs'}]));});
await test('form and media waits are not woken by plain inbound',()=>{assert.equal(waitingEventsAcceptInbound([{type:'formulario-enviado'}]),false);assert.equal(waitingEventsAcceptInbound([{type:'video-aberto'}]),false);assert.equal(waitingEventsAcceptInbound([]),false);});
await test('legacy absent waitingEvents keeps existing behavior',()=>{assert(waitingEventsAcceptInbound(undefined));assert(waitingEventsAcceptInbound(null));});
await test('controlled concurrent run claim invokes only one owner',async()=>{const f=fixture();const row=f.addRun();let accepted=0;f.deps.resume=async o=>{if(row.status!=='waiting_message')return;row.status='running';accepted++;o.onAgentClaimed('run');await Promise.resolve();};const result=await Promise.allSettled([f.run(),f.run()]);assert.equal(accepted,1);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls.turn,0);});

let httpCalls=0;const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{httpCalls++;return new Response('{}');};
try {
 await test('expected active agent and version permit guarded effect',async()=>{const f=fixture();const n=httpCalls;await withAgentGuard(f.db,'ws','lead',()=>guardedAutomationFetch('https://test.invalid'),'agent',2);assert.equal(httpCalls,n+1);});
 await test('stale requested agent blocked before callback',async()=>{const f=fixture();let called=false;await assert.rejects(withAgentGuard(f.db,'ws','lead',async()=>{called=true;},'other'),AutomationStoppedError);assert.equal(called,false);});
 await test('stale expected version blocked before callback',async()=>{const f=fixture();await assert.rejects(withAgentGuard(f.db,'ws','lead',async()=>{},'agent',1),AutomationStoppedError);});
 await test('disabled agent blocked before provider request',async()=>{const f=fixture();f.rows.conversation_ai_agents[0].enabled=false;const n=httpCalls;await assert.rejects(withAgentGuard(f.db,'ws','lead',()=>guardedAutomationFetch('https://test.invalid'),'agent'),AutomationStoppedError);assert.equal(httpCalls,n);});
 await test('disable while generating blocks next request',async()=>{const f=fixture();const n=httpCalls;await assert.rejects(withAgentGuard(f.db,'ws','lead',async()=>{f.rows.conversation_ai_agents[0].enabled=false;await guardedAutomationFetch('https://test.invalid');},'agent'),AutomationStoppedError);assert.equal(httpCalls,n);});
 await test('agent read failure is not permission to send',async()=>{const f=fixture();f.failures.conversation_ai_agents=true;await assert.rejects(withAgentGuard(f.db,'ws','lead',async()=>{},'agent'),/habilitado/);});
 await test('agent of another workspace cannot send',async()=>{const f=fixture();f.rows.conversation_ai_agents[0].workspace_id='other';await assert.rejects(withAgentGuard(f.db,'ws','lead',async()=>{},'agent'),AutomationStoppedError);});
 await test('resumed agent inherits SalesBot stop protection',async()=>{const f=fixture();const row=f.addRun({status:'running'});const n=httpCalls;const outcome=await withSalesbotGuard(f.db,{id:'run',workspace_id:'ws'},()=>withAgentGuard(f.db,'ws','lead',async()=>{row.stopped_at='now';await guardedAutomationFetch('https://test.invalid');},'agent'));assert.equal(outcome,undefined);assert.equal(httpCalls,n);});
 await test('existing guard callers without optional owner remain compatible',async()=>{const f=fixture();await withAgentGuard(f.db,'ws','lead',async()=>{});});
} finally {globalThis.fetch=originalFetch;}
console.log(`${passed}/${passed} inbound ownership checks passed. Controlled dependencies only; no real AI, database writes or WhatsApp delivery.`);
