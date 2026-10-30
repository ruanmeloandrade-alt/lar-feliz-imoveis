import assert from 'node:assert/strict';
import { readDashboardRows, readDashboardRpc, classifyDashboardLead, dashboardIssues, dashboardIssue, refreshEnabledDashboardQueries } from '../src/lib/slim-dashboard-data.core.ts';
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS dashboard: ${name}`); }
function database(rows, { cap = 500, failAt, code = '42501', invalid = false } = {}) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    return {
      select(columns) { call.columns = columns; return this; },
      eq(k, v) { call.filters.push([k,v]); return this; },
      order(k) { call.order = k; return this; },
      in(k,v) { call.filters.push([k,v]); return this; },
      is(k,v) { call.filters.push([k,v]); return this; },
      async range(from, to) { call.range = [from,to];
        if (failAt !== undefined && from >= failAt) return {data:null,error:{code,message:'secret-must-not-leak'}};
        return {data: invalid ? null : rows.slice(from,Math.min(to+1,from+cap)),error:null};
      },
    };
  } };
}
const ws = 'd16bc364-a874-4a69-8f0f-bbc8cf41e3f6';
await check('reads more than 1000 rows with a smaller server cap', async () => {
  const rows = Array.from({length:1237},(_,i)=>({id:String(i)})); const db=database(rows,{cap:173});
  const r=await readDashboardRows(db,ws,'leads','id,status'); assert.deepEqual(r.data,rows); assert.equal(r.error,null);
  assert.ok(db.calls.every(c=>c.filters.some(([k,v])=>k==='workspace_id'&&v===ws)));
  assert.ok(db.calls.every(c=>c.filters.some(([k,v])=>k==='status'&&v.includes('won')&&v.includes('lost'))));
  assert.ok(db.calls.every(c=>c.filters.some(([k,v])=>k==='merged_into_id'&&v===null)));
});
await check('required intermediate failure never returns partial totals',async()=>{
  const db=database(Array(900).fill({id:'x'}),{failAt:500});const r=await readDashboardRows(db,ws,'products','id');
  assert.equal(r.data,null);assert.equal(r.error.code,'42501');assert.equal(r.issue.state,'error');
});
await check('optional missing table is unavailable, not empty success',async()=>{
  const r=await readDashboardRows(database([],{failAt:0,code:'PGRST205'}),ws,'crm_form_submissions','id',{optional:true});
  assert.equal(r.error,null);assert.deepEqual(r.data,[]);assert.equal(r.issue.state,'unavailable');
});
await check('optional denied access remains a visible error',async()=>{
  const r=await readDashboardRows(database([],{failAt:0}),ws,'lead_custom_fields','id',{optional:true});
  assert.equal(r.issue.state,'error');assert.equal(r.issue.code,'42501');
});
await check('a truly empty dataset has no incident',async()=>{
  assert.deepEqual(await readDashboardRows(database([]),ws,'products','id'),{data:[],error:null});
});
await check('invalid payload is not silently accepted as empty',async()=>{
  assert.equal((await readDashboardRows(database([],{invalid:true}),ws,'products','id')).error.code,'INVALID_RESPONSE');
});
await check('explicit collection safety limit',async()=>{
  const r=await readDashboardRows(database(Array(15).fill({})),ws,'products','id',{maxRows:10,pageSize:4});assert.equal(r.data,null);assert.equal(r.error.code,'READ_LIMIT');
});
await check('purchase reads cannot include interest links',async()=>{
  const db=database([]);await readDashboardRows(db,ws,'lead_products','id',{purchased:true});assert.ok(db.calls[0].filters.some(([k,v])=>k==='kind'&&v==='comprou'));
});
await check('explicit lost and won override misleading stage names',()=>{
  assert.equal(classifyDashboardLead({status:'lost'},'Venda ganha'),'lost');assert.equal(classifyDashboardLead({status:'won'},'Perdida'),'won');
  assert.equal(classifyDashboardLead({status:'lost',stage_id:'s'},'Ganha',{venda_ganha_stage_id:'s'}),'lost');
});
await check('combined stage and pipeline rules intersect, not union',()=>{
  const rules={venda_ganha_stage_id:'s',venda_ganha_pipeline_id:'p'};
  assert.equal(classifyDashboardLead({stage_id:'other',pipeline_id:'p'},'Atendimento',rules),'open');
  assert.equal(classifyDashboardLead({stage_id:'s',pipeline_id:'other'},'Atendimento',rules),'open');
  assert.equal(classifyDashboardLead({stage_id:'s',pipeline_id:'p'},'Atendimento',rules),'won');
});
await check('single overrides and legacy stage inference preserved',()=>{
  assert.equal(classifyDashboardLead({stage_id:'s'},'Aberta',{venda_ganha_stage_id:'s'}),'won');
  assert.equal(classifyDashboardLead({pipeline_id:'p'},'Aberta',{venda_ganha_pipeline_id:'p'}),'won');
  assert.equal(classifyDashboardLead({},'Venda realizada'),'won');assert.equal(classifyDashboardLead({},'Cancelada'),'lost');assert.equal(classifyDashboardLead({},'Contato'),'open');
});
await check('missing tracking RPC does not interrupt the commercial data',async()=>{
  const r=await readDashboardRpc({from(){},rpc:async()=>({data:null,error:{code:'PGRST202'}})},ws,'tracking_overview');
  assert.equal(r.data,null);assert.equal(r.issue.state,'unavailable');
});
await check('RPC always uses the authorized workspace',async()=>{
  let used;await readDashboardRpc({from(){},rpc:async(n,args)=>{used=args;return {data:{events:0},error:null};}},ws,'tracking_overview',{_workspace_id:'other'});assert.equal(used._workspace_id,ws);
});
await check('raw errors and keys never enter dashboard diagnostics',()=>{
  const issue=dashboardIssue('leads',{code:'42501',message:'secret-must-not-leak'});assert.ok(!JSON.stringify(issue).includes('secret-must-not-leak'));
  assert.equal(dashboardIssues({issue},{issue}).length,1);
});
await check('refresh skips disabled modules',async()=>{
  const calls=[];await refreshEnabledDashboardQueries([{enabled:true,refetch:()=>calls.push('crm')},{enabled:false,refetch:()=>calls.push('tracking')}]);assert.deepEqual(calls,['crm']);
});
await check('empty workspace fails before requesting records',async()=>{
  const db=database([]);assert.ok((await readDashboardRows(db,'','leads','id')).error);assert.equal(db.calls.length,0);
});
console.log(`${passed}/${passed} dashboard data regression checks passed.`);
