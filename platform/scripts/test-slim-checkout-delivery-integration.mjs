import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {calculateCheckout,verifyCheckoutReceipt} from '../src/lib/slim-checkout.core.ts';
import {normalizeCheckoutDelivery} from '../src/lib/slim-checkout-delivery.core.ts';
import {persistedOrder,quoteFromOrder,lookupErpAttempt,loadErpOrders,ORDER_COLUMNS,ORDER_CHANGE_COLUMNS} from '../src/lib/slim-erp-data.server.ts';
import {buildOrderReadModel} from '../src/lib/slim-order-read.core.ts';
import {createCheckoutSession} from '../src/lib/slim-checkout-session.core.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('src/lib/slim-erp-release.functions.ts');
// Execute the real schema declarations without server middleware or network imports.
const schema=Function('z','ERP_LIMIT','normalizeCheckoutDelivery',source.slice(source.indexOf('const WS ='),source.indexOf('async function scope('))+'\nreturn QUOTE;')(z,99999999999999,normalizeCheckoutDelivery);
const id=n=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`,ws=id(1),actor=id(2);
const fulfillment={mode:'delivery',recipient:'Maria Teste',phone:'5511999999999',postalCode:'01001000',street:'Praça da Sé',number:'10',complement:'Sala 2',neighborhood:'Sé',city:'São Paulo',state:'SP',notes:'Portaria'};
const catalog=[{id:id(4),workspaceId:ws,name:'Produto teste',description:'Teste isolado',sku:'T',priceCents:1999,stock:10,active:true}];
const draft={customer:{kind:'existing',id:id(3)},items:[{productId:id(4),quantity:3}],discount:{kind:'percent',basisPoints:1000},payment:{method:'pix',status:'paid',installments:1},notes:'',fulfillment,shippingCents:1251};
const quote=calculateCheckout(ws,draft,catalog);
function row(){const snapshot={version:1,...structuredClone(quote),orderId:id(10),requestId:id(11),number:'SL-TESTE',status:'confirmed',confirmedAt:'2026-10-18T00:00:00Z',cancelledAt:null,cancellationReason:null,customer:{id:id(3),name:'Cliente teste',phone:'5511988888888',email:''},issuer:{name:'Saúde Slim',legalName:'',document:''}};return {id:snapshot.orderId,workspace_id:ws,request_id:snapshot.requestId,created_by:actor,customer_id:id(3),status:'confirmed',subtotal_cents:5997,discount_cents:600,shipping_cents:1251,total_cents:6648,snapshot,confirmed_at:snapshot.confirmedAt,cancelled_at:null,cancellation_reason:null};}
function db(rows){const calls=[];return {calls,from(table){const filters=[],data=table==='slim_order_changes'?[]:rows;calls.push({table,filters});return {select(columns){assert.equal(columns,table==='slim_order_changes'?ORDER_CHANGE_COLUMNS:ORDER_COLUMNS);return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},async maybeSingle(){return {data:data.find(r=>filters.every(([k,v])=>r[k]===v))??null,error:null};},async range(from,to){if(table==='slim_order_changes'){assert(filters.some(([k,v])=>k==='workspace_id'&&v===ws));assert(filters.some(([k,v])=>k==='state'&&v==='completed'));}return {data:data.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(from,to+1),error:null};}};}};}
let n=0;async function test(name,fn){await fn();n++;console.log('PASS delivery integration: '+name);}
await test('real strict server schema accepts delivery quote',()=>assert.equal(schema.parse(quote).totalCents,6648));
await test('legacy quote keeps both new fields absent',()=>{const q=structuredClone(quote);delete q.fulfillment;delete q.shippingCents;q.totalCents=5397;const parsed=schema.parse(q);assert(!('fulfillment' in parsed));assert(!('shippingCents' in parsed));});
await test('delivery without freight rejected before transport',()=>{const q=structuredClone(quote);delete q.shippingCents;assert.equal(schema.safeParse(q).success,false);});
await test('freight without delivery rejected before transport',()=>{const q=structuredClone(quote);delete q.fulfillment;assert.equal(schema.safeParse(q).success,false);});
await test('pickup cannot retain delivery charge',()=>assert.equal(schema.safeParse({...quote,fulfillment:{mode:'pickup'}}).success,false));
await test('strict server schema rejects arbitrary address fields',()=>assert.equal(schema.safeParse({...quote,fulfillment:{...fulfillment,ownerId:actor}}).success,false));
await test('incomplete delivery rejected by real server schema',()=>assert.equal(schema.safeParse({...quote,fulfillment:{...fulfillment,recipient:''}}).success,false));
await test('decimal negative and over-limit freight rejected',()=>{for(const shippingCents of [-1,0.5,NaN,100000000000000])assert.equal(schema.safeParse({...quote,shippingCents}).success,false);});
await test('persisted freight matches the snapshot',()=>assert.equal(persistedOrder(row(),ws).shippingCents,1251));
await test('column and snapshot freight mismatch rejected',()=>assert.throws(()=>persistedOrder({...row(),shipping_cents:1250},ws)));
await test('foreign workspace remains denied',()=>assert.throws(()=>persistedOrder({...row(),workspace_id:id(9)},ws)));
await test('document quote deep copies stored delivery and freight',()=>{const order=persistedOrder(row(),ws),q=quoteFromOrder(order);assert.deepEqual(q.fulfillment,fulfillment);assert.equal(q.shippingCents,1251);q.fulfillment.street='Outra rua';assert.equal(order.fulfillment.street,'Praça da Sé');});
await test('recovery confirms full total with freight and same identity',async()=>{const d=db([row()]),result=await lookupErpAttempt(d,ws,actor,id(11));assert.equal(result.state,'confirmed');assert.equal(verifyCheckoutReceipt(quote,id(11),result.receipt).totalCents,6648);assert(d.calls[0].filters.some(([key,value])=>key==='created_by'&&value===actor));});
await test('history and Dashboard use shipping separately without adding units',async()=>{const batch=await loadErpOrders(db([row()]),ws);const {totals}=buildOrderReadModel(batch,ws);assert.equal(totals.subtotalCents,5997);assert.equal(totals.discountCents,600);assert.equal(totals.shippingCents,1251);assert.equal(totals.receivedDeclaredCents,6648);assert.equal(totals.units,3);});
await test('cancellation preserves original delivery and removes full total from active revenue',async()=>{const r=row();r.status='cancelled';r.cancelled_at='2026-10-18T01:00:00Z';r.cancellation_reason='Teste';const batch=await loadErpOrders(db([r]),ws),model=buildOrderReadModel(batch,ws);assert.deepEqual(model.rows[0].fulfillment,fulfillment);assert.equal(model.totals.cancelledTotalCents,6648);assert.equal(model.totals.shippingCents,0);assert.equal(model.totals.totalCents,0);assert.equal(r.snapshot.status,'confirmed');});
await test('review freezes address and freight before confirmation',async()=>{let sent;const q=structuredClone(quote);const receipt={requestId:id(11),workspaceId:ws,orderId:id(10),number:'SL-TESTE',status:'confirmed',totalCents:6648};const session=createCheckoutSession(q,{confirm:async(request,body)=>{sent=body;return receipt;},lookup:async()=>({state:'not_found'})},id(11));q.fulfillment.street='Rascunho alterado';q.shippingCents=0;await session.approve();assert.equal(sent.fulfillment.street,'Praça da Sé');assert.equal(sent.shippingCents,1251);});
await test('Dashboard renders separate product discount and freight values',()=>{const ui=read('src/components/erp/SlimErpWorkspace.tsx');assert(ui.includes('totals.shippingCents'));assert(ui.includes('Descontos nos produtos'));assert(ui.includes('Frete dos pedidos confirmados'));});
console.log(`${n}/${n} checkout delivery integration checks passed. Synthetic data only; no production write or external transport.`);
