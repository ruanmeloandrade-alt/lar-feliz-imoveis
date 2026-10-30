// Synthetic component rendering and event handlers. No browser, network or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=fileURLToPath(new URL('../',import.meta.url)),nativeRequire=createRequire(import.meta.url);
function loadSource(relative,reactBindings=React,cache=new Map()){
 const file=path.isAbsolute(relative)?relative:path.join(root,relative);
 if(cache.has(file))return cache.get(file).exports;
 const source=fs.readFileSync(file,'utf8'),module={exports:{}};cache.set(file,module);
 const result=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}});
 assert(!result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error),'Invalid TSX: '+relative);
 new Function('require','module','exports','React',result.outputText)(name=>{
  if(name==='react')return reactBindings;
  if(!name.startsWith('.')&&!name.startsWith('@/'))return nativeRequire(name);
  const base=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(file),name);
  const target=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
  assert(target,'Missing source dependency '+name);return loadSource(target,reactBindings,cache);
 },module,module.exports,React);
 return module.exports;
}
function elements(node,result=[]){
 if(Array.isArray(node)){for(const child of node)elements(child,result);return result;}
 if(React.isValidElement(node)){result.push(node);elements(node.props.children,result);}return result;
}
function harness(file,exportName,props){
 const slots=[];let cursor=0,tree;
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},useEffect(){},useMemo:fn=>fn()};
 const Component=loadSource(file,hooks)[exportName];
 const render=()=>{cursor=0;tree=Component(props);return tree;};render();
 const find=predicate=>{const value=elements(tree).find(predicate);assert(value,'Expected component element');return value;};
 return {render,html:()=>renderToStaticMarkup(tree),find,
  field:label=>find(e=>e.props['aria-label']===label),
  change(label,value){find(e=>e.props['aria-label']===label).props.onChange({target:{value}});render();},
  click(label){find(e=>e.type==='button'&&e.props.children===label).props.onClick();render();},
  choose(label){find(e=>e.props['aria-label']===label).props.onChange();render();},
 };
}
const ws='aaaaaaaa-1111-4111-8111-111111111111',customerId='bbbbbbbb-2222-4222-8222-222222222222',productId='cccccccc-3333-4333-8333-333333333333';
const orderId='dddddddd-4444-4444-8444-444444444444',requestId='eeeeeeee-5555-4555-8555-555555555555';
const delivery={mode:'delivery',recipient:'Destinatário Teste',phone:'5511999999999',postalCode:'01310100',street:'Avenida Paulista',number:'100',complement:'Sala 2',neighborhood:'Bela Vista',city:'São Paulo',state:'SP',notes:'Receber na portaria'};
const fields={'Destinatário':delivery.recipient,'Telefone para entrega':'+55 (11) 99999-9999','CEP de entrega':'01310-100','Logradouro de entrega':delivery.street,'Número de entrega':delivery.number,'Complemento de entrega':delivery.complement,'Bairro de entrega':delivery.neighborhood,'Cidade de entrega':delivery.city,'UF de entrega':'sp','Observações de entrega':delivery.notes,'Frete em reais':'12,34'};
function checkout(){
 const calls=[];const h=harness('src/components/erp/SlimCheckout.tsx','SlimCheckout',{workspaceId:ws,catalog:[{id:productId,workspaceId:ws,name:'Produto Teste',description:'',sku:'TESTE',priceCents:1999,stock:10,active:true}],customers:[{id:customerId,name:'Cliente Teste'}],transport:{confirm:async(id,quote)=>{calls.push(structuredClone(quote));return {requestId:id,workspaceId:ws,orderId,number:'SL-TESTE',status:'confirmed',totalCents:quote.totalCents};},lookup:async()=>({state:'not_found'})},onConfirmed:()=>{}});
 h.find(e=>e.type==='select'&&e.props.value==='').props.onChange({target:{value:customerId}});h.render();h.click('Adicionar');
 return {...h,calls};
}
function fillDelivery(h){h.choose('Entrega no endereço');for(const [label,value]of Object.entries(fields))h.change(label,value);}
async function settle(h){for(let i=0;i<8;i++)await Promise.resolve();h.render();}
let checks=0;async function test(name,run){await run();checks++;console.log('PASS checkout delivery UI: '+name);}

await test('new checkout defaults to explicit pickup and zero freight',()=>{
 const h=checkout();assert.equal(h.field('Retirada').props.checked,true);assert(!h.html().includes('CEP de entrega'));assert(h.html().includes('Retirada sem cobrança de frete'));assert.match(h.html(),/<dt>Frete<\/dt><dd>R\$ 0,00/);
});
await test('delivery exposes the required bounded fields and optional complement/notes',()=>{
 const h=checkout();h.choose('Entrega no endereço');
 const bounds={'Destinatário':160,'Telefone para entrega':40,'CEP de entrega':9,'Logradouro de entrega':200,'Número de entrega':30,'Bairro de entrega':100,'Cidade de entrega':100,'UF de entrega':2};
 for(const [name,max]of Object.entries(bounds)){assert.equal(h.field(name).props.required,true,name);assert.equal(h.field(name).props.maxLength,max,name);}
 assert(!h.field('Complemento de entrega').props.required);assert.equal(h.field('Complemento de entrega').props.maxLength,120);assert(!h.field('Observações de entrega').props.required);assert.equal(h.field('Observações de entrega').props.maxLength,500);
});
await test('incomplete delivery cannot open a confirmation or send a request',()=>{
 const h=checkout();h.choose('Entrega no endereço');h.click('Revisar pedido');assert(!h.html().includes('>Confirmar pedido<'));assert.equal(h.calls.length,0);assert(h.html().includes('role="alert"'));
});
await test('review renders normalized recipient, address, freight and final total',()=>{
 const h=checkout();fillDelivery(h);h.click('Revisar pedido');const html=h.html();assert(html.includes('Destinatário Teste'));assert(html.includes('5511999999999'));assert(html.includes('Avenida Paulista'));assert(html.includes('São Paulo/SP'));assert(html.includes('CEP 01310100'));assert(html.includes('Receber na portaria'));assert(html.includes('R$ 12,34'));assert(html.includes('R$ 32,33'));assert.equal(h.find(e=>e.type==='fieldset').props.disabled,true);assert.equal(h.calls.length,0);
});
await test('confirmation submits the reviewed delivery snapshot once',async()=>{
 const h=checkout();fillDelivery(h);h.click('Revisar pedido');h.click('Confirmar pedido');await settle(h);assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].fulfillment,delivery);assert.equal(h.calls[0].shippingCents,1234);assert.equal(h.calls[0].totalCents,3233);assert(h.html().includes('Pedido SL-TESTE confirmado'));
});
await test('return to editing refreshes the reviewed address and freight',()=>{
 const h=checkout();fillDelivery(h);h.click('Revisar pedido');h.click('Voltar e corrigir');h.change('Número de entrega','200');h.change('Frete em reais','0');h.click('Revisar pedido');const html=h.html();assert(html.includes('200'));assert(html.includes('R$ 19,99'));assert.match(html,/<dt>Frete<\/dt><dd>R\$ 0,00/);
});
await test('switching back to pickup submits no delivery address or stale freight',async()=>{
 const h=checkout();fillDelivery(h);h.choose('Retirada');h.click('Revisar pedido');h.click('Confirmar pedido');await settle(h);assert.deepEqual(h.calls[0].fulfillment,{mode:'pickup'});assert.equal(h.calls[0].shippingCents,0);assert.equal(h.calls[0].totalCents,1999);
});
await test('invalid freight blocks review instead of becoming zero',()=>{
 const h=checkout();fillDelivery(h);h.change('Frete em reais','-1');h.click('Revisar pedido');assert(h.html().includes('role="alert"'));assert(!h.html().includes('>Confirmar pedido<'));assert.equal(h.calls.length,0);
});
function history(patch={}){
 const order={version:1,workspaceId:ws,orderId,requestId,number:'SL-TESTE',status:'confirmed',confirmedAt:'2026-10-17T22:00:00Z',cancelledAt:null,cancellationReason:null,customer:{id:customerId,name:'Cliente Teste',email:'',phone:''},issuer:{name:'Saúde Slim',legalName:'',document:''},items:[{productId,sku:'TESTE',name:'Produto Teste',description:'',quantity:1,unitPriceCents:1999,subtotalCents:1999,discountCents:0,totalCents:1999}],subtotalCents:1999,discountCents:0,totalCents:3233,payment:{method:'pix',status:'pending',installments:1},notes:'',fulfillment:delivery,shippingCents:1234,...patch};
 const h=harness('src/components/erp/SlimOrderHistory.tsx','SlimOrderHistory',{workspaceId:ws,response:{workspaceId:ws,complete:true,orders:[order]},loading:false,onDocument:()=>{}});h.click('Detalhes');return h;
}
await test('history displays stored delivery and separate freight alongside the final total',()=>{
 const html=history().html();assert(html.includes('Entrega no endereço'));assert(html.includes('Destinatário Teste'));assert(html.includes('Avenida Paulista'));assert(html.includes('Sala 2'));assert(html.includes('Receber na portaria'));assert(html.includes('Frete: R$ 12,34'));assert(html.includes('Total do pedido: R$ 32,33'));
});
await test('legacy order keeps absent modality and zero freight without inventing pickup',()=>{
 const html=history({fulfillment:undefined,shippingCents:undefined,totalCents:1999}).html();assert(html.includes('Modalidade de entrega não registrada neste pedido.'));assert(!html.includes('Retirada'));assert(html.includes('Frete: R$ 0,00'));assert(html.includes('Total do pedido: R$ 19,99'));
});
await test('pickup history is explicitly identified and has no address',()=>{
 const html=history({fulfillment:{mode:'pickup'},shippingCents:0,totalCents:1999}).html();assert(html.includes('Retirada'));assert(!html.includes('Avenida Paulista'));assert(html.includes('Frete: R$ 0,00'));
});
console.log(`Checkout delivery UI: ${checks} checks passed; no production calls.`);
