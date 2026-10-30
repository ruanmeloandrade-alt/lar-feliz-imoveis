import assert from 'node:assert/strict';
import {persistedOrder,loadErpOrders,lookupErpAttempt,receiptFromOrder,quoteFromOrder,erpRows,ORDER_CHANGE_COLUMNS} from '../src/lib/slim-erp-data.server.ts';
import {checkoutJournal} from '../src/lib/slim-checkout-journal.core.ts';
import {assertErpContext,confirmReceiptShape,erpRejection} from '../src/lib/slim-erp-release.core.ts';
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`,ws=id(1),actor=id(2);
function snapshot(n=1){return {version:1,workspaceId:ws,orderId:id(n+10),requestId:id(n+100),number:`SL-${n}`,status:'confirmed',confirmedAt:'2026-10-15T12:00:00Z',cancelledAt:null,cancellationReason:null,customer:{id:id(3),name:'Teste',email:'qa@example.invalid',phone:'+5511999999999'},issuer:{name:'Saúde Slim',legalName:'',document:''},items:[{productId:id(4),sku:'T',name:'Teste',description:'Produto',quantity:3,unitPriceCents:1999,subtotalCents:5997,discountCents:0,totalCents:5997}],subtotalCents:5997,discountCents:0,totalCents:5997,payment:{method:'pix',status:'pending',installments:1},notes:''};}
function row(n=1){const s=snapshot(n);return {id:s.orderId,workspace_id:ws,request_id:s.requestId,created_by:actor,customer_id:s.customer.id,status:s.status,subtotal_cents:s.subtotalCents,discount_cents:s.discountCents,total_cents:s.totalCents,snapshot:s,confirmed_at:s.confirmedAt,cancelled_at:null,cancellation_reason:null};}
function db(rows,{cap=500,failAt=Infinity}={}){const calls=[];return {calls,from(table){const filters=[],data=table==='slim_order_changes'?[]:rows;calls.push({table,filters});return {select(columns){if(table==='slim_order_changes')assert.equal(columns,ORDER_CHANGE_COLUMNS);return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},async maybeSingle(){return {data:data.find(r=>filters.every(([k,v])=>r[k]===v))??null,error:null};},async range(from,to){if(table==='slim_order_changes'){assert(filters.some(([k,v])=>k==='workspace_id'&&v===ws));assert(filters.some(([k,v])=>k==='state'&&v==='completed'));}return from>=failAt?{data:null,error:{code:'42501'}}:{data:data.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(from,Math.min(to+1,from+cap)),error:null};}};}};}
let n=0;async function test(label,fn){await fn();n++;console.log('PASS ERP '+label);}
await test('canonical persisted IDs and exact cents',()=>assert.equal(persistedOrder(row(),ws).totalCents,5997));
await test('row total tampering rejected',()=>assert.throws(()=>persistedOrder({...row(),total_cents:1},ws)));
await test('row customer tampering rejected',()=>assert.throws(()=>persistedOrder({...row(),customer_id:id(7)},ws)));
await test('foreign workspace rejected',()=>assert.throws(()=>persistedOrder({...row(),workspace_id:id(7)},ws)));
await test('latest cancellation overlays immutable original snapshot',()=>{const r=row();const o=persistedOrder({...r,status:'cancelled',cancelled_at:'2026-10-15T13:00:00Z',cancellation_reason:'Teste'},ws);assert.equal(o.status,'cancelled');assert.equal(r.snapshot.status,'confirmed');assert.throws(()=>receiptFromOrder(o));});
await test('more than 1000 records with a capped server page',async()=>{const d=db(Array.from({length:1201},(_,i)=>row(i+1)),{cap:67});assert.equal((await loadErpOrders(d,ws)).orders.length,1201);assert(d.calls.every(c=>c.filters.some(([k,v])=>k==='workspace_id'&&v===ws)));});
await test('partial page error never yields partial revenue',async()=>await assert.rejects(loadErpOrders(db(Array.from({length:701},(_,i)=>row(i+1)),{failAt:500}),ws)));
await test('empty complete history distinct from error',async()=>assert.deepEqual((await loadErpOrders(db([]),ws)).orders,[]));
await test('lookup uses actor workspace and request identity',async()=>{const d=db([row()]);const r=await lookupErpAttempt(d,ws,actor,id(101));assert.equal(r.state,'confirmed');assert(d.calls[0].filters.some(([k,v])=>k==='created_by'&&v===actor));});
await test('lookup wrong actor is not found',async()=>assert.equal((await lookupErpAttempt(db([row()]),ws,id(8),id(101))).state,'not_found'));
await test('cancelled attempt cannot appear as a confirmed order',async()=>{const r=await lookupErpAttempt(db([{...row(),status:'cancelled',cancelled_at:'2026-10-15T13:00:00Z',cancellation_reason:'Teste'}]),ws,actor,id(101));assert.equal(r.state,'rejected');});
await test('PDF quote copies stored item values, no catalog input',()=>{const s=snapshot();const q=quoteFromOrder(s);q.items[0].name='changed';assert.equal(s.items[0].name,'Teste');assert.equal(q.totalCents,5997);});
await test('scope absent blocks reads',async()=>await assert.rejects(erpRows(db([]),'','slim_orders','id')));
function memory(){const rows=new Map();return {rows,getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};}
await test('journal stores no customer, price, document or credential',()=>{const s=memory(),j=checkoutJournal(s,ws,actor);j.begin(id(5));assert.deepEqual(j.read(),{version:1,workspaceId:ws,actorId:actor,requestId:id(5)});assert.equal(Object.keys(JSON.parse([...s.rows.values()][0])).length,4);});
await test('journal survives a new component instance',()=>{const s=memory();checkoutJournal(s,ws,actor).begin(id(5));assert.equal(checkoutJournal(s,ws,actor).read().requestId,id(5));});
await test('different unresolved attempt cannot be overwritten',()=>{const j=checkoutJournal(memory(),ws,actor);j.begin(id(5));assert.throws(()=>j.begin(id(6)));});
await test('same request id does not duplicate journal',()=>{const s=memory(),j=checkoutJournal(s,ws,actor);j.begin(id(5));j.begin(id(5));assert.equal(s.rows.size,1);});
await test('another attempt cannot clear the original reference',()=>{const j=checkoutJournal(memory(),ws,actor);j.begin(id(5));j.clear(id(6));assert(j.read());j.clear(id(5));assert.equal(j.read(),null);});
await test('storage failure blocks before submit',()=>assert.throws(()=>checkoutJournal({getItem:()=>null,setItem:()=>{throw Error('quota')},removeItem(){}},ws,actor).begin(id(5))));
await test('cross workspace journal records rejected',()=>{const s=memory();s.setItem(`saude-slim:erp:pending:${ws}:${actor}`,JSON.stringify({version:1,workspaceId:id(7),actorId:actor,requestId:id(5)}));assert.throws(()=>checkoutJournal(s,ws,actor).read());});
await test('owner access does not require duplicate membership',()=>assert.doesNotThrow(()=>assertErpContext(ws,ws,actor,actor,null)));
await test('active member may read own company',()=>assert.doesNotThrow(()=>assertErpContext(ws,ws,actor,id(7),{user_id:actor,access_expires_at:null})));
await test('wrong company denied',()=>assert.throws(()=>assertErpContext(id(7),ws,actor,actor,null)));
await test('wrong user denied even when membership shape exists',()=>assert.throws(()=>assertErpContext(ws,ws,actor,id(7),{user_id:id(7),access_expires_at:null})));
await test('expired membership denied',()=>assert.throws(()=>assertErpContext(ws,ws,actor,id(7),{user_id:actor,access_expires_at:'2020-01-01T00:00:00Z'})));
await test('malformed expiration never grants access',()=>assert.throws(()=>assertErpContext(ws,ws,actor,id(7),{user_id:actor,access_expires_at:'invalid'})));
await test('no membership is no access',()=>assert.throws(()=>assertErpContext(ws,ws,actor,id(7),null)));
const receipt={workspaceId:ws,requestId:id(101),orderId:id(11),number:'SL-00000001',status:'confirmed',totalCents:5997};
await test('complete receipt shape passes',()=>assert.deepEqual(confirmReceiptShape(receipt,ws,id(101),5997),receipt));
for(const [key,value] of Object.entries({workspaceId:id(8),requestId:id(9),orderId:'bad-id',number:'',status:'cancelled',totalCents:0}))await test('receipt rejects mismatch '+key,()=>assert.throws(()=>confirmReceiptShape({...receipt,[key]:value},ws,id(101),5997)));
await test('transport errors not reported as definite rejection',()=>{assert.equal(erpRejection({code:'PGRST000',message:'unavailable'}),null);assert.equal(erpRejection(new Error('timeout')),null);});
await test('known validation rejection keeps safe user message',()=>assert.equal(erpRejection({code:'22023',message:'O preço mudou. Revise o pedido.'}),'O preço mudou. Revise o pedido.'));
await test('raw unexpected SQL detail is not exposed as validation message',()=>assert(!erpRejection({code:'23503',message:'secret-internal-value'}).includes('secret-internal-value')));
console.log(`${n}/${n} ERP release logic checks passed. No production writes or external transport.`);
