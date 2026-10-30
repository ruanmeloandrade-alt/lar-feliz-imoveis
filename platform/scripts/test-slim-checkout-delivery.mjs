import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {calculateCheckout} from '../src/lib/slim-checkout.core.ts';
import {normalizeCheckoutDelivery, CHECKOUT_SHIPPING_LIMIT} from '../src/lib/slim-checkout-delivery.core.ts';
import {validateOrderSnapshot, buildOrderReadModel} from '../src/lib/slim-order-read.core.ts';
import {buildSlimOrderReceiptPdf} from '../src/lib/slim-order-receipt.server.ts';
import {createCheckoutSession} from '../src/lib/slim-checkout-session.core.ts';

const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`,ws=id(1);
const product={id:id(4),workspaceId:ws,name:'Produto de teste',description:'Descrição com acentuação.',sku:'TESTE',priceCents:1999,stock:10,active:true};
const address=()=>({mode:'delivery',recipient:' Destinatário de teste ',phone:' +55 (11) 99999-9999 ',postalCode:' 01310-100 ',street:' Avenida Paulista ',number:' s/n ',complement:' Sala 2 ',neighborhood:' Bela Vista ',city:' São Paulo ',state:' sp ',notes:' Entregar na recepção '});
const draft=()=>({customer:{kind:'existing',id:id(3)},items:[{productId:product.id,quantity:3}],discount:{kind:'amount',cents:0},payment:{method:'pix',status:'pending',installments:1},notes:''});
const calc=(d=draft(),catalog=[product])=>calculateCheckout(ws,d,catalog);
const delivery=(shippingCents=1250)=>({...draft(),fulfillment:address(),shippingCents});
const receipt=q=>({requestId:id(100),workspaceId:ws,orderId:id(10),number:'SL-TESTE-1',status:'confirmed',totalCents:q.totalCents});
const document=q=>({quote:q,receipt:receipt(q),issuer:{name:'Saúde Slim',legalName:'Emitente de teste'},customer:{name:'Cliente de teste',email:'qa@example.invalid'},createdAt:'2026-10-17T12:00:00Z'});
function snapshot(q=calc(),n=1){return {version:1,workspaceId:ws,orderId:id(10+n),requestId:id(100+n),number:`SL-TESTE-${n}`,status:'confirmed',confirmedAt:'2026-10-17T12:00:00.000Z',cancelledAt:null,cancellationReason:null,customer:{id:id(3),name:'Cliente de teste',email:'qa@example.invalid',phone:'5511999999999'},issuer:{name:'Saúde Slim',legalName:'Emitente de teste',document:''},items:structuredClone(q.items),subtotalCents:q.subtotalCents,discountCents:q.discountCents,totalCents:q.totalCents,payment:{...q.payment},notes:q.notes,...normalizeCheckoutDelivery(q.fulfillment,q.shippingCents)};}
const pdfText=q=>Buffer.from(buildSlimOrderReceiptPdf(document(q))).toString('ascii').replace(/\\([0-7]{3})/g,(_,n)=>String.fromCharCode(parseInt(n,8)));
let checks=0;
async function test(name,fn){await fn();checks++;console.log(`PASS checkout delivery: ${name}`);}

await test('legacy draft preserves the exact quote shape with no inferred mode',()=>{
  const q=calc();
  assert.deepEqual(Object.keys(q),['workspaceId','customer','items','subtotalCents','discountCents','totalCents','payment','notes']);
  assert.equal(q.totalCents,5997);assert.deepEqual(normalizeCheckoutDelivery(undefined,undefined),{});
});
await test('legacy PDF remains byte-for-byte equal to the pre-change document',()=>{
  const bytes=buildSlimOrderReceiptPdf(document(calc()));
  assert.equal(bytes.length,5032);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'c21c2c10386206bb9250510edf1f857adb166efc180548eaf3d08431ad060ffd');
  assert(!pdfText(calc()).includes('Modalidade:'));assert(!pdfText(calc()).includes('Frete:'));
});
await test('legacy persisted snapshot keeps fields omitted',()=>{
  const s=snapshot();assert.deepEqual(validateOrderSnapshot(s,ws),s);
  assert(!('fulfillment' in s));assert(!('shippingCents' in s));
});
await test('explicit pickup has no address and no freight charge',()=>{
  const q=calc({...draft(),fulfillment:{mode:'pickup'},shippingCents:0});
  assert.deepEqual(q.fulfillment,{mode:'pickup'});assert.equal(q.shippingCents,0);assert.equal(q.totalCents,5997);
  assert(pdfText(q).includes('Modalidade: Retirada'));assert(pdfText(q).includes('Frete: R$ 0,00'));assert(!pdfText(q).includes('Endereço:'));
});
await test('delivery canonizes fields without changing the input or customer',()=>{
  const d=delivery(),original=structuredClone(d),q=calc(d);
  assert.deepEqual(d,original);assert.deepEqual(q.customer,{kind:'existing',id:id(3)});
  assert.deepEqual(q.fulfillment,{mode:'delivery',recipient:'Destinatário de teste',phone:'5511999999999',postalCode:'01310100',street:'Avenida Paulista',number:'s/n',complement:'Sala 2',neighborhood:'Bela Vista',city:'São Paulo',state:'SP',notes:'Entregar na recepção'});
  d.fulfillment.street='Outro endereço';assert.equal(q.fulfillment.street,'Avenida Paulista');
});
await test('freight increases the final total without becoming a stock item',()=>{
  const q=calc(delivery(1250));assert.equal(q.subtotalCents,5997);assert.equal(q.shippingCents,1250);assert.equal(q.totalCents,7247);
  assert.equal(q.items.length,1);assert.equal(q.items[0].totalCents,5997);assert.equal(q.items[0].quantity,3);assert.equal(product.stock,10);
});
await test('one cent freight remains exact',()=>assert.equal(calc(delivery(1)).totalCents,5998));
await test('zero freight is valid for delivery',()=>assert.equal(calc(delivery(0)).totalCents,5997));
await test('percentage discount applies only to products',()=>{
  const d=delivery(1250);d.discount={kind:'percent',basisPoints:1000};const q=calc(d);
  assert.equal(q.discountCents,600);assert.equal(q.items[0].discountCents,600);assert.equal(q.totalCents,6647);assert.equal(q.shippingCents,1250);
});
await test('a 100 percent discount leaves only freight payable',()=>{
  const d=delivery(1250);d.discount={kind:'percent',basisPoints:10000};const q=calc(d);
  assert.equal(q.totalCents,1250);assert.equal(q.items[0].totalCents,0);assert.equal(q.discountCents,5997);
});
await test('fixed discount cannot use freight to exceed the product subtotal',()=>{
  const d=delivery(1250);d.discount={kind:'amount',cents:5998};assert.throws(()=>calc(d));
});
for(const shippingCents of [-1,0.5,NaN,Infinity,CHECKOUT_SHIPPING_LIMIT+1,'1250',null,undefined]){
  await test(`rejects invalid or missing freight ${String(shippingCents)}`,()=>assert.throws(()=>calc({...delivery(),shippingCents})));
}
await test('freight without a fulfillment mode is rejected',()=>assert.throws(()=>calc({...draft(),shippingCents:0})));
await test('a null fulfillment mode is rejected',()=>assert.throws(()=>calc({...draft(),fulfillment:null,shippingCents:0})));
await test('pickup cannot include a charge or delivery fields',()=>{
  assert.throws(()=>calc({...draft(),fulfillment:{mode:'pickup'},shippingCents:1}));
  assert.throws(()=>calc({...draft(),fulfillment:{mode:'pickup',street:''},shippingCents:0}));
});
await test('unknown fulfillment mode and unknown fields are rejected',()=>{
  assert.throws(()=>calc({...delivery(),fulfillment:{...address(),mode:'courier'}}));
  assert.throws(()=>calc({...delivery(),fulfillment:{...address(),internalToken:'untrusted'}}));
});
await test('final total uses the shared integer monetary ceiling',()=>{
  const price=CHECKOUT_SHIPPING_LIMIT-1;
  const d=delivery(1);d.items[0].quantity=1;
  assert.equal(calc(d,[{...product,priceCents:price}]).totalCents,CHECKOUT_SHIPPING_LIMIT);
  d.shippingCents=2;assert.throws(()=>calc(d,[{...product,priceCents:price}]));
});
await test('maximum freight is valid when products are free',()=>{
  assert.equal(calc(delivery(CHECKOUT_SHIPPING_LIMIT),[{...product,priceCents:0}]).totalCents,CHECKOUT_SHIPPING_LIMIT);
});
for(const key of ['recipient','phone','postalCode','street','number','neighborhood','city','state']){
  await test(`delivery requires nonblank ${key}`,()=>assert.throws(()=>calc({...delivery(),fulfillment:{...address(),[key]:' '}})));
}
await test('optional complement and delivery notes must still be present strings',()=>{
  const f={...address(),complement:'',notes:''};assert.doesNotThrow(()=>calc({...delivery(),fulfillment:f}));
  for(const key of ['complement','notes']){const incomplete={...f};delete incomplete[key];assert.throws(()=>calc({...delivery(),fulfillment:incomplete}));}
});
for(const [key,max] of Object.entries({recipient:160,street:200,number:30,complement:120,neighborhood:100,city:100,notes:500})){
  await test(`delivery enforces ${key} limit ${max}`,()=>{
    assert.doesNotThrow(()=>calc({...delivery(),fulfillment:{...address(),[key]:'a'.repeat(max)}}));
    assert.throws(()=>calc({...delivery(),fulfillment:{...address(),[key]:'a'.repeat(max+1)}}));
  });
}
await test('address length counts UTF-16 units consistently with the input validator',()=>{
  assert.doesNotThrow(()=>calc({...delivery(),fulfillment:{...address(),recipient:'😀'.repeat(80)}}));
  assert.throws(()=>calc({...delivery(),fulfillment:{...address(),recipient:'😀'.repeat(81)}}));
});
for(const invalid of ['abc11999999999','5511999999999x','119999999','1'.repeat(16),'('.repeat(31)+'1199999999']){
  await test(`rejects malformed delivery phone ${invalid.slice(0,18)}`,()=>assert.throws(()=>calc({...delivery(),fulfillment:{...address(),phone:invalid}})));
}
await test('accepts the ten and fifteen digit phone boundaries',()=>{
  for(const phone of ['1133334444','123456789012345'])assert.equal(calc({...delivery(),fulfillment:{...address(),phone}}).fulfillment.phone,phone);
});
for(const postalCode of ['01310','01310 100','01310-1000','AB310100','01310_100']){
  await test(`rejects malformed CEP ${postalCode}`,()=>assert.throws(()=>calc({...delivery(),fulfillment:{...address(),postalCode}})));
}
await test('all Brazilian states are accepted and uppercase in the snapshot',()=>{
  for(const state of ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']){
    assert.equal(calc({...delivery(),fulfillment:{...address(),state:state.toLowerCase()}}).fulfillment.state,state);
  }
  for(const state of ['XX','SPO','S'])assert.throws(()=>calc({...delivery(),fulfillment:{...address(),state}}));
});
await test('controls are rejected before trimming in every delivery field',()=>{
  for(const key of Object.keys(address()).filter(key=>key!=='mode')){
    for(const control of ['\n','\t','\x00','\x7f','\x85']){
      assert.throws(()=>calc({...delivery(),fulfillment:{...address(),[key]:control+address()[key]}}));
    }
  }
});
await test('persisted delivery validates item totals plus freight',()=>{
  const s=snapshot(calc(delivery()));assert.deepEqual(validateOrderSnapshot(s,ws),s);
  const broken=structuredClone(s);broken.totalCents=s.subtotalCents;assert.throws(()=>validateOrderSnapshot(broken,ws));
});
await test('persisted total and freight cannot diverge or be silently defaulted',()=>{
  const s=snapshot(calc(delivery()));
  assert.throws(()=>validateOrderSnapshot({...s,shippingCents:s.shippingCents+1},ws));
  const missing=structuredClone(s);delete missing.shippingCents;assert.throws(()=>validateOrderSnapshot(missing,ws));
  const missingMode=structuredClone(s);delete missingMode.fulfillment;assert.throws(()=>validateOrderSnapshot(missingMode,ws));
});
await test('read metrics separate freight and preserve full paid pending cancelled totals',()=>{
  const paidDraft=delivery(1250);paidDraft.payment.status='paid';paidDraft.discount={kind:'amount',cents:500};
  const paid=snapshot(calc(paidDraft),1),pending=snapshot(calc(delivery(100)),2);
  const cancelled={...snapshot(calc(delivery(300)),3),status:'cancelled',cancelledAt:'2026-10-17T13:00:00.000Z',cancellationReason:'Teste isolado'};
  const legacy=snapshot(calc(),4);
  const model=buildOrderReadModel({workspaceId:ws,complete:true,orders:[paid,pending,cancelled,legacy]},ws);
  assert.equal(model.totals.shippingCents,1350);assert.equal(model.totals.subtotalCents,17991);assert.equal(model.totals.discountCents,500);
  assert.equal(model.totals.totalCents,18841);assert.equal(model.totals.receivedDeclaredCents,6747);assert.equal(model.totals.pendingPaymentCents,12094);
  assert.equal(model.totals.cancelledTotalCents,6297);assert.equal(model.totals.units,9);assert.equal(model.totals.confirmedCount,3);assert.equal(model.totals.cancelledCount,1);
});
await test('aggregate freight cannot overflow safe read limits',()=>{
  const q=calc(delivery(CHECKOUT_SHIPPING_LIMIT),[{...product,priceCents:0}]);
  assert.throws(()=>buildOrderReadModel({workspaceId:ws,complete:true,orders:[snapshot(q,1),snapshot(q,2)]},ws));
});
await test('delivery PDF includes destination address and independently labelled freight',()=>{
  const q=calc(delivery()),text=pdfText(q);
  for(const expected of ['Modalidade: Entrega','Destinatário: Destinatário de teste','Telefone de entrega: 5511999999999','Endereço: Avenida Paulista, s/n','Complemento: Sala 2','Bairro: Bela Vista','Cidade: São Paulo','UF: SP','CEP: 01310-100','Observações de entrega: Entregar na recepção','Subtotal: R$ 59,97','Desconto total: R$ 0,00','Frete: R$ 12,50','TOTAL DO PEDIDO: R$ 72,47'])assert(text.includes(expected),expected);
  assert.deepEqual(buildSlimOrderReceiptPdf(document(q)),buildSlimOrderReceiptPdf(document(q)));
});
await test('PDF rejects inconsistent freight rather than hiding it',()=>{
  const q=calc(delivery());assert.throws(()=>buildSlimOrderReceiptPdf(document({...q,shippingCents:q.shippingCents+1})));
  const missing=structuredClone(q);delete missing.fulfillment;assert.throws(()=>buildSlimOrderReceiptPdf(document(missing)));
});
await test('long delivery details are wrapped across deterministic PDF pages',()=>{
  const q=calc({...delivery(),notes:'Observação geral de teste. '.repeat(50),fulfillment:{...address(),recipient:'R'.repeat(160),street:'S'.repeat(200),notes:'N'.repeat(500)}});
  const text=pdfText(q);assert(text.includes('Página 2/2'));assert(text.includes('TOTAL DO PEDIDO: R$ 72,47'));
});
await test('review session preserves delivery snapshot and never repeats a lost confirmation',async()=>{
  const q=calc(delivery()),saved=structuredClone(q);let writes=0,submitted;
  const session=createCheckoutSession(q,{confirm:async(_id,value)=>{writes++;submitted=value;throw new Error('lost reply');},lookup:async()=>({state:'confirmed',receipt:receipt(saved)})},id(100));
  q.fulfillment.street='Alterado depois da revisão';q.shippingCents=0;
  await session.approve();assert.equal(session.get().state,'uncertain');assert.deepEqual(submitted,saved);
  await session.reconcile();assert.equal(session.get().state,'confirmed');assert.equal(writes,1);assert.deepEqual(session.get().quote,saved);
});
console.log(`${checks}/${checks} isolated checkout delivery checks passed. No production, stock write, customer write, or external transport.`);
