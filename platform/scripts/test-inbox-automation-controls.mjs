import assert from 'node:assert/strict';
import { AutomationStoppedError, assertAutomationMayContinue, guardedAutomationFetch, withAgentGuard, withSalesbotGuard } from '../src/lib/inbox-automation-guards.server.ts';

function database() {
  const rows = { salesbot_runs: { id:'run-a', workspace_id:'ws-a', status:'running', stopped_at:null },
    leads: { id:'lead-a', workspace_id:'ws-a', ai_paused:false, active_conversation_agent_id:'agent-a', active_conversation_agent_version:1 } };
  const db = { from(table) {
    const filters = [];
    const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; },
      async maybeSingle() { const row = rows[table]; return { data: row && filters.every(([k,v]) => row[k] === v) ? { ...row } : null, error:null }; } };
    return q;
  } };
  return { rows, db };
}
let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS '+name); passed++; }
let sends = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { sends++; return new Response('{}', {status:200}); };
try {
 await test('active execution may continue', async () => {
   const {db} = database(); let ran=false;
   await withSalesbotGuard(db,{id:'run-a',workspace_id:'ws-a'},async()=>{await assertAutomationMayContinue();ran=true;}); assert.equal(ran,true);
 });
 await test('stopped run cannot start another block', async () => {
   const {db,rows} = database(); rows.salesbot_runs.status='finished'; rows.salesbot_runs.stopped_at='now'; let ran=false;
   await withSalesbotGuard(db,'run-a',async()=>{ran=true;}); assert.equal(ran,false);
 });
 await test('stop while awaiting typing delay blocks the outgoing request', async () => {
   const {db,rows} = database(); const before=sends;
   await withSalesbotGuard(db,'run-a',async()=>{await Promise.resolve();rows.salesbot_runs.stopped_at='now';await guardedAutomationFetch('https://example.invalid');});
   assert.equal(sends,before);
 });
 await test('workspace mismatch cannot execute', async () => {
   const {db}=database(); let ran=false;
   await withSalesbotGuard(db,{id:'run-a',workspace_id:'ws-b'},async()=>{ran=true;}); assert.equal(ran,false);
 });
 await test('agent generation completed after stop cannot send', async () => {
   const {db,rows}=database(); const before=sends;
   await assert.rejects(withAgentGuard(db,'ws-a','lead-a',async()=>{rows.leads.ai_paused=true;rows.leads.active_conversation_agent_version++;await guardedAutomationFetch('https://example.invalid');}),AutomationStoppedError);
   assert.equal(sends,before);
 });
 await test('stop and restart of same agent invalidates older generation', async () => {
   const {db,rows}=database();
   await assert.rejects(withAgentGuard(db,'ws-a','lead-a',async()=>{rows.leads.active_conversation_agent_version+=2;await assertAutomationMayContinue();}),AutomationStoppedError);
 });
 await test('replacement agent invalidates prior owner', async () => {
   const {db,rows}=database();
   await assert.rejects(withAgentGuard(db,'ws-a','lead-a',async()=>{rows.leads.active_conversation_agent_id='agent-b';await assertAutomationMayContinue();}),AutomationStoppedError);
 });
 await test('parallel conversations have isolated cancellation context', async () => {
   const a=database(), b=database(); let bRan=false;
   await Promise.all([
     withSalesbotGuard(a.db,'run-a',async()=>{await Promise.resolve();a.rows.salesbot_runs.stopped_at='now';await assertAutomationMayContinue();}),
     withSalesbotGuard(b.db,'run-a',async()=>{await Promise.resolve();await assertAutomationMayContinue();bRan=true;}),
   ]); assert.equal(bRan,true);
 });
 await test('database read failure blocks instead of silently sending', async () => {
   const {db}=database(); db.from=()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:{message:'offline'}})};return q;};
   await assert.rejects(withSalesbotGuard(db,'run-a',async()=>{}),/confirmar/);
 });
} finally { globalThis.fetch=originalFetch; }
console.log(`Inbox automation controls: ${passed}/9 PASS; external messages sent: 0`);
