import assert from 'node:assert/strict';
import {aggregateBotMetrics,aggregateMessages,aggregateAgentRuns,classifyBotRun} from '../src/lib/slim-automation-metrics.core.ts';
import {readCompleteMetricRows} from '../src/lib/slim-metrics-reader.core.ts';
const now=Date.parse('2026-10-15T15:30:00Z'),day=86400000;
const bot={id:'b',local_id:'bot_local',name:'Teste',scope:'individual'};
const run={id:'r',salesbot_id:'b',lead_id:'l',status:'finished',started_at:new Date(now-day).toISOString(),finished_at:new Date(now-day+3000).toISOString()};
const sale={id:'s',lead_id:'l',kind:'comprou',sold_at:new Date(now-1000).toISOString()};
const agg=(over={})=>aggregateBotMetrics({bots:[bot],runs:[run],purchases:[],days:30,now,...over});
let n=0;async function check(name,fn){await fn();n++;console.log('PASS metrics: '+name);}
await check('finished run counts as launch, not active nor sale',()=>{const r=agg();assert.equal(r.totals.launched,1);assert.equal(r.totals.activeNow,0);assert.equal(r.totals.finished,1);assert.equal(r.totals.converted,0);});
await check('local and canonical bot IDs remain mapped',()=>assert.equal(agg().bots[0].localId,'bot_local'));
await check('all legitimate waiting states count active',()=>{for(const status of ['running','waiting_timer','waiting_message'])assert.equal(agg({runs:[{...run,status,finished_at:null}]}).totals.activeNow,1);});
await check('stopped run never active or successful',()=>{const r=agg({runs:[{...run,stopped_at:run.finished_at}]});assert.equal(r.totals.stopped,1);assert.equal(r.totals.finished,0);});
await check('unknown states not silently treated as active',()=>assert.equal(classifyBotRun({...run,status:'unknown',finished_at:null}),'other'));
await check('run with failed terminal result not successful',()=>assert.equal(agg({runs:[{...run,status:'error',last_error:'error'}]}).totals.failed,1));
await check('recovered finished or active state not overridden by an old error',()=>{assert.equal(classifyBotRun({...run,last_error:'old error'}),'finished');assert.equal(classifyBotRun({...run,status:'waiting_message',finished_at:null,last_error:'old error'}),'active');});
await check('empty denominator is unavailable, not invented percent',()=>{const r=agg({runs:[]});assert.equal(r.totals.conversionRate,null);assert.equal(r.totals.completionRate,null);});
await check('missing sales source does not erase execution counts',()=>{const r=agg({purchases:null});assert.equal(r.totals.launched,1);assert.equal(r.totals.conversionRate,null);});
await check('purchase attributed to preceding run',()=>assert.equal(agg({purchases:[sale]}).totals.converted,1));
await check('finishing a flow alone never means conversion',()=>assert.equal(agg().totals.conversionRate,0));
await check('several items and duplicate sales count one converted run',()=>assert.equal(agg({purchases:[sale,sale,{...sale,id:'s2'}]}).totals.converted,1));
await check('previous, future and unrelated sales excluded',()=>{for(const s of [{...sale,sold_at:new Date(now-40*day).toISOString()},{...sale,sold_at:new Date(now+day).toISOString()},{...sale,lead_id:'other'},{...sale,kind:'interesse'}])assert.equal(agg({purchases:[s]}).totals.converted,0);});
await check('only the last preceding run receives attribution',()=>{const r=agg({bots:[bot,{id:'b2',name:'Segundo'}],runs:[run,{...run,id:'r2',salesbot_id:'b2',started_at:new Date(now-2000).toISOString()}],purchases:[sale]});assert.equal(r.bots.find(b=>b.id==='b').converted,0);assert.equal(r.bots.find(b=>b.id==='b2').converted,1);});
await check('30 day attribution window enforced',()=>assert.equal(agg({runs:[{...run,started_at:new Date(now-40*day).toISOString()}],purchases:[sale],days:null}).totals.converted,0));
await check('period filters starts and excludes future runs',()=>assert.equal(agg({runs:[run,{...run,id:'old',started_at:new Date(now-100*day).toISOString()},{...run,id:'future',started_at:new Date(now+day).toISOString()}],days:7}).totals.launched,1));
await check('current active sessions include runs older than report period',()=>{const r=agg({runs:[{...run,status:'waiting_message',started_at:new Date(now-100*day).toISOString(),finished_at:null}],days:7});assert.equal(r.totals.launched,0);assert.equal(r.totals.activeNow,1);});
await check('duplicate run rows counted once',()=>assert.equal(agg({runs:[run,run]}).totals.launched,1));
await check('complete total independent of limited history preview',()=>{const r=agg({runs:Array.from({length:205},(_,i)=>({...run,id:'r'+i}))});assert.equal(r.totals.launched,205);assert.equal(r.history.length,100);assert.equal(r.historyTotal,205);});
await check('invalid periods rejected',()=>{for(const days of [0,-1,366,1.5])assert.throws(()=>agg({days}));});
await check('messages need outgoing acknowledgement',()=>{const m={id:'m',message_id:'x',session_id:'ses',from_me:true,remote_jid:'a@s.whatsapp.net',delivery_status:'sent',received_at:run.started_at};const r=aggregateMessages([m,m,{...m,id:'in',message_id:'in',from_me:false},{...m,id:'p',message_id:'p',delivery_status:'pending'},{...m,id:'g',message_id:'g',remote_jid:'a@g.us'}],now-7*day,now);assert.deepEqual(r,{sent:2,groupSent:1,directSent:1});});
await check('agent objectives are recorded booleans, not estimates',()=>{const r=aggregateAgentRuns([{id:'a',agent_id:'ag',lead_id:'l',started_at:run.started_at,interactions_count:3,objective_reached:false}],[],[],30,now);assert.equal(r.totals.objectives,0);assert.equal(r.totals.runs,1);});
await check('agent active state respects paused and merged conversations',()=>{const r=aggregateAgentRuns([],[{id:'ag',name:'Agente'}],[{id:'l',active_conversation_agent_id:'ag',ai_paused:false},{id:'x',active_conversation_agent_id:'ag',ai_paused:true}],30,now);assert.equal(r.totals.activeNow,1);});
function fake(rows, {cap=73, fail=false}={}) {
  const calls=[];
  return {
    calls,
    from(table) {
      let after='';
      const call={table, filters:[]}; calls.push(call);
      return {
        select(){return this;},
        eq(k,v){call.filters.push([k,v]);return this;},
        order(){return this;},
        limit(){return this;},
        gt(k,v){after=v;return this;},
        then(ok,bad){
          const response=fail ? {error:{code:'42501',message:'secret'}} : {data:rows.filter(r=>r.id>after).slice(0,cap),error:null};
          return Promise.resolve(response).then(ok,bad);
        }
      };
    }
  };
}
await check('keyset pagination exceeds server caps without missing rows',async()=>{const rows=Array.from({length:1237},(_,i)=>({id:String(i).padStart(8,'0')}));const d=fake(rows);assert.deepEqual(await readCompleteMetricRows(d,'w','salesbot_runs','id'),rows);assert(d.calls.every(c=>c.filters.some(([k,v])=>k==='workspace_id'&&v==='w')));});
await check('failed reads do not return zeros',async()=>{await assert.rejects(readCompleteMetricRows(fake([],{fail:true}),'w','salesbot_runs','id'),e=>!e.message.includes('secret')&&e.code==='42501');});
await check('missing workspace rejected before query',async()=>{const d=fake([]);await assert.rejects(readCompleteMetricRows(d,'','salesbot_runs','id'));assert.equal(d.calls.length,0);});
await check('safety limit causes explicit error',async()=>await assert.rejects(readCompleteMetricRows(fake(Array.from({length:20},(_,i)=>({id:String(i).padStart(3,'0')}))),'w','salesbot_runs','id',q=>q,10)));
console.log(`${n}/${n} automation metrics checks passed. No database changes or provider calls.`);
