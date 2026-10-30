import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {newSlimDbProbeState,probeSlimDbReadiness} from '../src/lib/slim-db-readiness.server.ts';
import {sharedSlimDbBackoff,noteDbSuccess} from '../src/lib/slim-db-worker-backoff.core.ts';
let n=0;async function check(label,fn){noteDbSuccess(sharedSlimDbBackoff());await fn();n++;console.log('PASS slim DB readiness: '+label);}
function fakeDb(impl){
  const calls={select:0,limit:0,abortSignal:0,queries:0};
  const db={from(table){
    assert.equal(table,'workspaces');calls.queries++;
    const q={select(value){assert.equal(value,'id');calls.select++;return q;},
      limit(count){assert.equal(count,1);calls.limit++;return q;},
      abortSignal(signal){assert(signal instanceof AbortSignal);calls.abortSignal++;return impl(signal);}};
    return q;
  }};return {db,calls};
}
await check('successful read-only probe enables worker',async()=>{
 const s=newSlimDbProbeState(),f=fakeDb(async()=>({data:[],error:null}));
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>1000),true);
 assert.equal(f.calls.queries,1);assert.equal(f.calls.select,1);
 assert.equal(f.calls.limit,1);assert.equal(f.calls.abortSignal,1);
 assert.equal(s.healthyUntil,16000);
});
await check('cached healthy state does not requery on every worker poll',async()=>{
 const s=newSlimDbProbeState(),f=fakeDb(async()=>({data:[],error:null}));
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>1000),true);
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>1001),true);
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>15999),true);
 assert.equal(f.calls.queries,1);
});
await check('unavailable DB gives exponential cooloff before retry',async()=>{
 const s=newSlimDbProbeState(),f=fakeDb(async()=>({data:null,error:{code:'57014'}}));
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>1000),false);
 assert.equal(s.retryAfter,16000);
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>14000),false);
 assert.equal(f.calls.queries,1);
});
await check('time-out network rejection does not claim a queue',async()=>{
 const s=newSlimDbProbeState(),f=fakeDb(async()=>{throw new Error('timeout')});
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>1000),false);
 assert.equal(s.healthyUntil,0);
 assert.equal(f.calls.queries,1);
});
await check('single shared concurrent probe avoids duplicate request',async()=>{
 let release;const blocked=new Promise(done=>{release=done});
 const s=newSlimDbProbeState(),f=fakeDb(async()=>{await blocked;return {data:[],error:null}});
 const a=probeSlimDbReadiness(f.db,s,()=>2000);
 const b=probeSlimDbReadiness(f.db,s,()=>2000);
 release();const output=await Promise.all([a,b]);
 assert.deepEqual(output,[true,true]);assert.equal(f.calls.queries,1);
});
await check('failed probe never spends more work while under cooldown',async()=>{
 const s=newSlimDbProbeState(),f=fakeDb(async()=>({error:{message:'timeout'}}));
 await probeSlimDbReadiness(f.db,s,()=>1000);
 await probeSlimDbReadiness(f.db,s,()=>2000);
 await probeSlimDbReadiness(f.db,s,()=>3000);
 assert.equal(f.calls.queries,1);
});
await check('normal operation automatically resumes following successful read',async()=>{
 const s=newSlimDbProbeState();
 let fail=true;const f=fakeDb(async()=>fail?{error:{message:'timeout'}}:{data:[],error:null});
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>1000),false);
 fail=false;
 // The shared transport cooldown is cleared when an independent DB read succeeds.
 noteDbSuccess(sharedSlimDbBackoff());
 assert.equal(await probeSlimDbReadiness(f.db,s,()=>16001),true);
 assert.equal(f.calls.queries,2);
});
await check('worker source gates Inbox, audiences and stage jobs',async()=>{
 const inbox=fs.readFileSync(new URL('../src/lib/inbox-automation-worker.server.ts',import.meta.url),'utf8');
 const aud=fs.readFileSync(new URL('../src/lib/slim-audience-runtime.server.ts',import.meta.url),'utf8');
 assert(inbox.includes('if (!await dbReadyForQueue(db)) return;'));
 assert(aud.includes('if(!await dbReadyForQueue(db))return;'));
 assert.equal(aud.split('if(!await dbReadyForQueue(db))return;').length-1,2);
 assert(inbox.indexOf('dbReadyForQueue(db)')<inbox.indexOf('slim_claim_inbox_salesbots'));
 assert(aud.indexOf('dbReadyForQueue(db)')<aud.indexOf("slim_claim_audience_delivery"));
});
await check('all changed TypeScript sources parse without syntax errors',async()=>{
 for(const path of ['src/lib/slim-db-readiness.server.ts','src/lib/inbox-automation-worker.server.ts','src/lib/slim-audience-runtime.server.ts']){
  const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,path);
 }
});
console.log(n+'/'+n+' DB readiness tests passed; controlled dependencies, no production writes or real notifications.');
