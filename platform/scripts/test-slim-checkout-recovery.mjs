import assert from 'node:assert/strict';
import {validateCheckoutRecovery,finishCheckoutRecovery} from '../src/lib/slim-checkout-recovery.core.ts';
const expected={workspaceId:'00000001-0000-4000-8000-000000000001',requestId:'00000002-0000-4000-8000-000000000001',actorId:'00000003-0000-4000-8000-000000000001'};
const orderId='00000004-0000-4000-8000-000000000001';
const closed={...expected,state:'closed'};const existing={...expected,state:'existing',orderId,number:'SL-00000001',status:'confirmed',totalCents:5997};
let n=0;async function test(name,run){await run();n++;console.log('PASS recovery: '+name);}
function scenario(reply){let current={requestId:expected.requestId};const calls=[];return {calls,args:{approved:true,expected,send:async()=>{calls.push('send');if(reply instanceof Error)throw reply;return reply;},journal:{read:()=>current,clear:id=>{calls.push('clear:'+id);current=null;}}},get current(){return current;}};}
await test('closed attempt clears only after server acknowledgement',async()=>{const s=scenario(closed);assert.deepEqual(await finishCheckoutRecovery(s.args),closed);assert.deepEqual(s.calls,['send','clear:'+expected.requestId]);assert.equal(s.current,null);});
await test('existing order recovered with original amount',async()=>{const s=scenario(existing);assert.deepEqual(await finishCheckoutRecovery(s.args),existing);assert.equal(s.current,null);});
await test('existing cancellation not reported as a new sale',()=>{assert.equal(validateCheckoutRecovery({...existing,status:'cancelled'},expected).status,'cancelled');});
await test('in-flight confirmation preserves the pending reference',async()=>{const s=scenario({...expected,state:'processing'});assert.equal((await finishCheckoutRecovery(s.args)).state,'processing');assert(s.current);assert.deepEqual(s.calls,['send']);});
await test('no approval makes zero calls',async()=>{const s=scenario(closed);s.args.approved=false;await assert.rejects(finishCheckoutRecovery(s.args));assert.deepEqual(s.calls,[]);});
for(const field of ['workspaceId','actorId','requestId'])await test('mismatched '+field+' retains reference',async()=>{const s=scenario({...closed,[field]:orderId});await assert.rejects(finishCheckoutRecovery(s.args));assert(s.current);assert.deepEqual(s.calls,['send']);});
for(const state of ['not_found','error','accepted',null,undefined])await test('unknown state '+state+' cannot release checkout',async()=>{const s=scenario({...expected,state});await assert.rejects(finishCheckoutRecovery(s.args));assert(s.current);});
await test('network exception preserves reference',async()=>{const s=scenario(new Error('offline'));await assert.rejects(finishCheckoutRecovery(s.args),/offline/);assert(s.current);assert.equal(s.calls.length,1);});
for(const [field,value]of[['orderId','bad'],['number',''],['status','pending'],['totalCents',-1],['totalCents',1.001],['totalCents',Number.MAX_SAFE_INTEGER],['totalCents','5997']])await test('bad existing receipt '+field+'='+value+' is not accepted',async()=>{const s=scenario({...existing,[field]:value});await assert.rejects(finishCheckoutRecovery(s.args));assert(s.current);});
await test('storage failure does not become successful completion',async()=>{const s=scenario(closed);s.args.journal.clear=()=>{throw new Error('storage');};await assert.rejects(finishCheckoutRecovery(s.args),/storage/);assert(s.current);});
await test('a new attempt in another tab is never removed',async()=>{const s=scenario(closed);s.args.journal.read=()=>({requestId:orderId});await assert.rejects(finishCheckoutRecovery(s.args),/Outra tentativa/);assert.deepEqual(s.calls,['send']);});
await test('ineffective removal is reported',async()=>{const s=scenario(closed);s.args.journal.clear=()=>{};await assert.rejects(finishCheckoutRecovery(s.args),/limpar/);assert(s.current);});
await test('recovery has no confirm or cancel callback',()=>{const s=scenario(existing);assert(!('confirm'in s.args));assert(!('cancel'in s.args));});
console.log(`${n}/${n} checkout-recovery tests passed. Pure logic and local doubles, not production transactions.`);
