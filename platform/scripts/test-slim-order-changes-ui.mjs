// Actual component bodies and event handlers with synthetic transport/storage. No browser or production calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=fileURLToPath(new URL('../',import.meta.url)),nativeRequire=createRequire(import.meta.url);
const ws='aaaaaaaa-1111-4111-8111-111111111111',actor='aaaaaaaa-2222-4222-8222-222222222222',customerId='bbbbbbbb-2222-4222-8222-222222222222',productId='cccccccc-3333-4333-8333-333333333333';
const orderId='dddddddd-4444-4444-8444-444444444444',requestId='eeeeeeee-5555-4555-8555-555555555555',replacementId='dddddddd-6666-4666-8666-666666666666';
const fingerprint='a'.repeat(64),journalKey=`saude-slim:erp:change-pending:${ws}:${actor}`;
const syntheticPdf=Buffer.from('%PDF-1.4\n% Synthetic component transport fixture\n%%EOF\n');
const delivery={mode:'delivery',recipient:'Destinatário Teste',phone:'5511999999999',postalCode:'01310100',street:'Avenida Paulista',number:'100',complement:'Sala 2',neighborhood:'Bela Vista',city:'São Paulo',state:'SP',notes:'Receber na portaria'};
const order={version:1,workspaceId:ws,orderId,requestId,number:'SL-ORIGINAL',status:'confirmed',confirmedAt:'2026-10-17T22:00:00Z',cancelledAt:null,cancellationReason:null,customer:{id:customerId,name:'Cliente Teste',email:'teste@example.invalid',phone:'5511999999999'},issuer:{name:'Saúde Slim',legalName:'',document:''},items:[{productId,sku:'TESTE',name:'Produto Teste',description:'Descrição',quantity:2,unitPriceCents:1999,subtotalCents:3998,discountCents:101,totalCents:3897}],subtotalCents:3998,discountCents:101,totalCents:5131,payment:{method:'credit_card',status:'paid',installments:3},notes:'Observação preservada',fulfillment:delivery,shippingCents:1234};
const catalog=[{id:productId,workspaceId:ws,name:'Produto Teste',description:'Descrição',sku:'TESTE',priceCents:1999,stock:2,active:true}];
const context={workspaceId:ws,actorId:actor,order:structuredClone(order),fingerprint,catalog,customers:[{id:customerId,name:'Cliente Teste',email:'teste@example.invalid',phone:'5511999999999'}]};
const draft={customer:{kind:'existing',id:customerId},items:[{productId,quantity:2}],discount:{kind:'amount',cents:101},payment:{...order.payment},notes:order.notes,fulfillment:structuredClone(delivery),shippingCents:1234};
const expected=(operation='edit',id=requestId)=>({workspaceId:ws,actorId:actor,orderId,requestId:id,operation});
const terminal=(data,state='completed',replacementStatus='confirmed')=>({...expected(data.operation,data.requestId),state,replacementOrderId:state==='completed'&&data.operation==='edit'?replacementId:null,replacementStatus:state==='completed'&&data.operation==='edit'?replacementStatus:null,receipt:state==='completed'&&data.operation==='edit'&&replacementStatus==='confirmed'?{workspaceId:ws,requestId:data.requestId,orderId:replacementId,number:'SL-REVISADO',status:'confirmed',totalCents:data.quote?.totalCents??5131}:null});
function storage(){const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
let store=storage(),discard=true,prompts=0;
globalThis.window={get localStorage(){return store;},confirm:()=>{prompts++;return discard;},prompt:()=> 'Cancelamento de teste'};
function pending(operation='edit'){const value={version:1,...expected(operation)};store.setItem(journalKey,JSON.stringify(value));return value;}
const plain=tag=>({children})=>React.createElement(tag,null,children);
const dialogs={Dialog:plain('div'),DialogContent:plain('section'),DialogHeader:plain('header'),DialogTitle:plain('h2'),DialogDescription:plain('p')};
// apply-slim-erp-release installs this error class before shipping. Keep the session implementation real.
class CheckoutRejected extends Error{}
function loadSource(relative,hooks,mocks,cache=new Map()){
 const file=path.isAbsolute(relative)?relative:path.join(root,relative);if(cache.has(file))return cache.get(file).exports;
 let source=fs.readFileSync(file,'utf8');if(file.split(path.sep).join('/').endsWith('/SlimErpWorkspace.tsx'))source+='\nexport {Workspace as TestWorkspace};\n';
 const module={exports:{}};cache.set(file,module);
 const compiled=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}});
 assert(!compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error),'Invalid TSX: '+relative);
 new Function('require','module','exports','React',compiled.outputText)(name=>{
  if(name==='react')return hooks;if(name in mocks)return mocks[name];
  if(/\.functions(?:\.tsx?)?$/.test(name))throw new Error('Component harness is missing an explicit server-function mock: '+name);
  if(!name.startsWith('.')&&!name.startsWith('@/'))return nativeRequire(name);
  const base=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(file),name);
  const target=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert(target,'Missing dependency '+name);
  const result=loadSource(target,hooks,mocks,cache);return target.endsWith('/slim-checkout-session.core.ts')?{...result,CheckoutRejected:result.CheckoutRejected??CheckoutRejected}:result;
 },module,module.exports,React);return module.exports;
}
function nodes(node,result=[]){if(Array.isArray(node)){node.forEach(n=>nodes(n,result));return result;}if(React.isValidElement(node)){result.push(node);nodes(node.props.children,result);}return result;}
function harness(file,name,initialProps,config={}){
 const slots=[],effects=[],queries=[];let cursor=0,topCursor=0,tree,changed=false,props=initialProps,blocker;
 const depsEqual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i]))changed=true;slots[i]=value;}];},
  useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},
  useMemo(fn,deps){const i=cursor++;if(!(i in slots)||!depsEqual(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
  useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
  useEffect(fn,deps){const i=cursor++;if(!(i in slots)||!depsEqual(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
 };
 const server={getSlimOrderChangeContext:async()=>config.context??context,confirmSlimOrderChange:async({data})=>config.confirm?config.confirm(data):terminal(data),lookupSlimOrderChange:async({data})=>config.lookup?config.lookup(data):terminal(data,'closed')};
 const release={getSlimErpIdentity:async()=>({workspaceId:ws,actorId:actor}),getSlimErpContext:async()=>context,getSlimErpHistory:async()=>({workspaceId:ws,complete:true,orders:[order]}),confirmSlimErpOrder:async()=>{throw new Error('New order transport was not expected');},lookupSlimErpOrder:async()=>({state:'not_found'}),cancelSlimErpOrder:async({data})=>{config.cancel?.(data);return {};},getSlimOrderReceipt:async({data})=>{config.document?.(data);return {workspaceId:ws,orderId:data.orderId,number:'SL-ORIGINAL',status:'confirmed',filename:'test.pdf',pdfBase64:syntheticPdf.toString('base64'),sha256:createHash('sha256').update(syntheticPdf).digest('hex')};}};
 const unexpectedOperation=async()=>{throw new Error('An unrelated recovery or receipt operation was invoked by the order-change component test.');};
 const queryClient={invalidateQueries:async()=>{config.refresh?.();}};
 const mocks={'@/components/ui/dialog':dialogs,'@/lib/slim-order-changes.functions':server,'@/lib/slim-erp-release.functions':release,
  // These IO imports are added by the production transforms. Pure stock/PDF validators remain real.
  '@/lib/slim-checkout-recovery.functions':{closeSlimCheckoutAttempt:unexpectedOperation},
  '@/lib/slim-receipt-dispatch.functions':{prepareSlimReceiptDispatch:unexpectedOperation,approveSlimReceiptDispatch:unexpectedOperation,lookupSlimReceiptDispatch:unexpectedOperation},
  '@tanstack/react-start':{useServerFn:fn=>fn},'@tanstack/react-router':{useBlocker:options=>{blocker=options;},Link:plain('a')},
  '@tanstack/react-query':{useQueryClient:()=>queryClient,useQuery:options=>{queries.push(options);const key=options.queryKey[0];return {data:key==='slim-erp-identity'?{workspaceId:ws,actorId:actor}:key==='slim-erp-orders'?{workspaceId:ws,complete:true,orders:[order]}:key==='slim-erp-context'?context:config.context??context,error:config.queryError,isLoading:false,refetch:async()=>({data:await options.queryFn()})};}},
 };
 const Component=loadSource(file,hooks,mocks)[name];assert(Component,'Missing component '+name);
 const render=()=>{cursor=0;tree=Component(props);topCursor=cursor;return tree;};
 const flush=()=>{for(let rounds=0;rounds<15;rounds++){const batch=effects.splice(0);changed=false;batch.forEach(fn=>fn());if(!changed&&!effects.length)return;render();}throw new Error('Unstable component effects');};
 const find=predicate=>{const found=nodes(tree).find(predicate);assert(found,'Expected element in '+name);return found;};
 render();flush();
 return {render:()=>{render();flush();return tree;},html:()=>{cursor=topCursor;return renderToStaticMarkup(tree);},find,all:predicate=>nodes(tree).filter(predicate),queries,get blocker(){return blocker;},
  props:component=>find(e=>typeof e.type==='function'&&e.type.name===component).props,
  change(label,value){find(e=>e.props['aria-label']===label).props.onChange({target:{value}});render();flush();},
  click(label){const element=find(e=>e.type==='button'&&e.props.children===label);assert(!element.props.disabled,'Button disabled: '+label);const value=element.props.onClick();render();flush();return value;},
  choose(label){find(e=>e.props['aria-label']===label).props.onChange();render();flush();},
  update(next){props={...props,...next};render();flush();},unmount(){for(const slot of slots)slot?.cleanup?.();},
 };
}
async function settle(h){for(let n=0;n<30;n++)await Promise.resolve();h.render();}
function checkout(options={}){
 const calls=[],reasons=[];const transport={confirm:async(id,quote)=>{calls.push(structuredClone(quote));return {workspaceId:ws,requestId:id,orderId:replacementId,number:'SL-REVISADO',status:'confirmed',totalCents:quote.totalCents};},lookup:async()=>({state:'not_found'})};
 const h=harness('src/components/erp/SlimCheckout.tsx','SlimCheckout',{workspaceId:ws,catalog,customers:context.customers,initialDraft:structuredClone(draft),transport:null,onConfirmed:()=>{},revision:{orderNumber:order.number,originalTotalCents:order.totalCents,createTransport:value=>{reasons.push(value);return transport;}},...options});return {...h,calls,reasons};
}
function editor(operation='edit',config={},props={}){
 const completed=[],documents=[],closed=[];
 const h=harness('src/components/erp/SlimOrderChangeDialog.tsx','SlimOrderChangeEditor',{workspaceId:ws,actorId:actor,target:{orderId,operation},startingReference:null,journalError:'',onJournalChanged:()=>{},onClose:()=>closed.push(true),onCompleted:r=>completed.push(r),onDocument:id=>documents.push(id),...props},config);return {...h,get blocker(){return h.blocker;},completed,documents,closed};
}
let checks=0;async function test(name,run){store=storage();discard=true;prompts=0;await run();checks++;console.log('PASS order changes UI: '+name);}

await test('revision populates delivery, freight, discount, payment, customer and original item quantities',()=>{
 const h=checkout();for(const [label,value]of Object.entries({'Destinatário':delivery.recipient,'Telefone para entrega':delivery.phone,'CEP de entrega':delivery.postalCode,'Logradouro de entrega':delivery.street,'Número de entrega':delivery.number,'Complemento de entrega':delivery.complement,'Bairro de entrega':delivery.neighborhood,'Cidade de entrega':delivery.city,'UF de entrega':delivery.state,'Observações de entrega':delivery.notes,'Frete em reais':'12,34','Quantidade de Produto Teste':2}))assert.equal(h.find(e=>e.props['aria-label']===label).props.value,value,label);
 assert(h.find(e=>e.type==='select'&&e.props.value===customerId));assert(h.find(e=>e.type==='select'&&e.props.value==='credit_card'));assert(h.find(e=>e.type==='input'&&e.props.value==='1,01'));assert(h.find(e=>e.type==='input'&&e.props.value===3));assert(h.html().includes(order.notes));assert(!h.html().includes('Novo cliente'));
});
await test('revision requires a reason and sends nothing while reviewing',()=>{
 const h=checkout();h.click('Revisar alteração');assert(h.html().includes('Informe o motivo'));assert.equal(h.calls.length,0);h.change('Motivo da alteração','  Corrigir endereço  ');h.click('Revisar alteração');assert.deepEqual(h.reasons,['Corrigir endereço']);assert.equal(h.find(e=>e.type==='fieldset').props.disabled,true);assert.equal(h.calls.length,0);
});
await test('restorable original quantities allow an address-only revision at zero current stock',async()=>{
 const h=checkout();assert.equal(h.find(e=>e.props['aria-label']==='Quantidade de Produto Teste').props.max,2);h.change('Número de entrega','200');h.change('Motivo da alteração','Corrigir endereço');h.click('Revisar alteração');h.click('Confirmar alteração');await settle(h);assert.equal(h.calls.length,1);assert.equal(h.calls[0].items[0].quantity,2);assert.equal(h.calls[0].fulfillment.number,'200');assert.equal(h.calls[0].shippingCents,1234);assert.equal(h.calls[0].totalCents,5131);
});
await test('current prices and the original total are both visible before approval',()=>{
 const h=checkout({catalog:catalog.map(p=>({...p,priceCents:2099}))});h.change('Motivo da alteração','Revisão do pedido');h.click('Revisar alteração');const html=h.html();assert(html.includes('preços atuais'));assert(html.includes('Total original: R$ 51,31'));assert(html.includes('R$ 53,31'));assert.equal(h.calls.length,0);
});
await test('inactive original product cannot be approved until removed or replaced',()=>{
 const h=checkout({catalog:catalog.map(p=>({...p,active:false}))});h.change('Motivo da alteração','Corrigir endereço');h.click('Revisar alteração');assert(h.html().includes('Produto indisponível'));assert(!h.html().includes('>Confirmar alteração<'));assert.equal(h.calls.length,0);
});
await test('legacy absence stays unselected and requires an explicit delivery choice',()=>{
 const initialDraft=structuredClone(draft);delete initialDraft.fulfillment;delete initialDraft.shippingCents;const h=checkout({initialDraft});assert.equal(h.find(e=>e.props['aria-label']==='Retirada').props.checked,false);assert.equal(h.find(e=>e.props['aria-label']==='Entrega no endereço').props.checked,false);h.change('Motivo da alteração','Completar modalidade');h.click('Revisar alteração');assert(!h.html().includes('>Confirmar alteração<'));h.choose('Retirada');h.click('Revisar alteração');assert(h.html().includes('>Confirmar alteração<'));
});
await test('return to editing refreshes freight and a double approval submits exactly once',async()=>{
 const h=checkout();h.change('Motivo da alteração','Frete combinado');h.click('Revisar alteração');h.click('Voltar e corrigir');h.change('Frete em reais','0');h.click('Revisar alteração');const click=h.find(e=>e.type==='button'&&e.props.children==='Confirmar alteração').props.onClick;click();click();await settle(h);assert.equal(h.calls.length,1);assert.equal(h.calls[0].shippingCents,0);assert.equal(h.calls[0].totalCents,3897);assert.deepEqual(h.calls[0].fulfillment,delivery);
});
await test('dialog hydrates checkout from the authorized snapshot and uses a separate edit transport',async()=>{
 const calls=[];const h=editor('edit',{confirm:data=>{calls.push(data);return terminal(data);}});const p=h.props('SlimCheckout');assert.deepEqual(p.initialDraft,draft);assert.equal(p.transport,null);assert.equal(p.revision.orderNumber,'SL-ORIGINAL');const form=checkout(p);form.change('Motivo da alteração','Corrigir endereço');form.click('Revisar alteração');form.click('Confirmar alteração');await settle(form);await settle(h);assert.equal(calls.length,1);assert.equal(calls[0].operation,'edit');assert.equal(calls[0].fingerprint,fingerprint);assert.equal(calls[0].actorId,actor);assert.equal(calls[0].approved,true);assert.equal(calls[0].reason,'Corrigir endereço');assert.deepEqual(calls[0].quote.fulfillment,delivery);assert.equal(store.getItem(journalKey),null);assert(h.html().includes('Alteração do pedido concluída'));
});
await test('wrong workspace or actor cannot mount an editable checkout',()=>{
 const h=editor('edit',{context:{...context,actorId:'ffffffff-1111-4111-8111-111111111111'}});assert.equal(h.all(e=>e.type?.name==='SlimCheckout').length,0);assert(h.html().includes('operador ou o pedido mudou'));
});
await test('mount reads pending identifiers locally without querying or confirming the ledger',()=>{
 pending('delete');let lookups=0,confirms=0;const locks=[];const h=harness('src/components/erp/SlimOrderChangeDialog.tsx','SlimOrderChangeDialog',{workspaceId:ws,actorId:actor,target:null,onClose:()=>{},onCompleted:()=>{},onDocument:()=>{},onLockChange:v=>locks.push(v)},{lookup:()=>{lookups++;},confirm:()=>{confirms++;}});assert(h.html().includes('Conferir alteração pendente'));assert.equal(lookups,0);assert.equal(confirms,0);assert.equal(locks.at(-1),true);
});
await test('delete requires a reason, reviews its effect and approves one request despite double click',async()=>{
 const calls=[];let release;const gate=new Promise(resolve=>{release=resolve;});const h=editor('delete',{confirm:async data=>{calls.push(data);await gate;return terminal(data);}});h.click('Revisar exclusão');assert(h.html().includes('Informe um motivo'));h.change('Motivo da exclusão','  Pedido duplicado  ');h.click('Revisar exclusão');assert(h.html().includes('quantidades voltarão ao estoque uma única vez'));const click=h.find(e=>e.type==='button'&&e.props.children==='Confirmar exclusão').props.onClick;click();click();await settle(h);assert.equal(calls.length,1);assert.equal(calls[0].quote,null);assert.equal(calls[0].approved,true);assert.equal(calls[0].reason,'Pedido duplicado');assert.equal(calls[0].operation,'delete');assert(store.getItem(journalKey));release();await settle(h);assert.equal(store.getItem(journalKey),null);assert(h.html().includes('Pedido excluído da lista operacional'));assert.equal(h.completed.length,1);
});
await test('deleting a cancelled order explains that no additional stock reversal occurs',()=>{
 const cancelled={...order,status:'cancelled',cancelledAt:'2026-10-17T23:00:00Z',cancellationReason:'Cancelado antes'};const h=editor('delete',{context:{...context,order:cancelled,catalog:[],customers:[]}});assert(h.html().includes('sem um novo estorno de estoque'));
});
await test('uncertain deletion preserves the journal and explicit recovery closes without resending',async()=>{
 const calls=[],lookups=[];const h=editor('delete',{confirm:data=>{calls.push(data);throw new Error('Conexão interrompida');},lookup:data=>{lookups.push(data);return terminal(data,'closed');}});h.change('Motivo da exclusão','Pedido duplicado');h.click('Revisar exclusão');h.click('Confirmar exclusão');await settle(h);assert.equal(calls.length,1);assert.equal(lookups.length,0);assert(store.getItem(journalKey));assert(h.html().includes('Consultar resultado sem repetir'));assert(!h.html().includes('>Confirmar exclusão<'));h.click('Consultar resultado sem repetir');await settle(h);assert.equal(calls.length,1);assert.equal(lookups.length,1);assert.equal(lookups[0].approved,true);assert.equal(store.getItem(journalKey),null);assert(h.html().includes('Tentativa encerrada sem alteração'));
});
await test('explicit recovery recognizes completed deletion without requiring a new-order receipt',async()=>{
 const ref=pending('delete'),lookups=[];const h=editor('delete',{lookup:data=>{lookups.push(data);return terminal(data);}},{startingReference:ref});assert.equal(lookups.length,0);assert(h.queries.every(q=>q.enabled===false));h.click('Consultar resultado sem repetir');await settle(h);assert.equal(lookups.length,1);assert.equal(h.completed[0].receipt,null);assert(h.html().includes('Pedido excluído da lista operacional'));
});
await test('recovered edit with an already cancelled replacement is terminal and offers both documents',async()=>{
 const ref=pending('edit');const h=editor('edit',{lookup:data=>terminal(data,'completed','cancelled')},{startingReference:ref});h.click('Consultar resultado sem repetir');await settle(h);assert(h.html().includes('pedido substituto está cancelado'));assert(!h.html().includes('>Confirmar alteração<'));h.click('Documento original');assert.deepEqual(h.documents,[orderId]);assert.equal(store.getItem(journalKey),null);
});
await test('storage failure prevents an approved operation from reaching the server',async()=>{
 let sends=0;store.setItem=()=>{throw new Error('Não foi possível preservar a referência');};const h=editor('delete',{confirm:()=>{sends++;}});h.change('Motivo da exclusão','Corrigir pedido');h.click('Revisar exclusão');h.click('Confirmar exclusão');await settle(h);assert.equal(sends,0);assert(h.html().includes('Não foi possível preservar a referência'));
});
await test('mismatched receipt stays uncertain and does not clear the original reference',async()=>{
 const h=editor('delete',{confirm:data=>({...terminal(data),orderId:replacementId})});h.change('Motivo da exclusão','Corrigir pedido');h.click('Revisar exclusão');h.click('Confirmar exclusão');await settle(h);assert(store.getItem(journalKey));assert.equal(h.completed.length,0);assert(h.html().includes('Consultar resultado sem repetir'));
});
await test('dirty close is confirmed and pending operations block dismissal',async()=>{
 const h=editor('delete');h.change('Motivo da exclusão','Ainda em revisão');discard=false;h.find(e=>e.type===dialogs.Dialog).props.onOpenChange(false);assert.equal(prompts,1);assert.equal(h.closed.length,0);assert.equal(h.blocker.shouldBlockFn(),true);
 let release;const gate=new Promise(resolve=>{release=resolve;});const busy=editor('delete',{confirm:async data=>{await gate;return terminal(data);}});busy.change('Motivo da exclusão','Pedido duplicado');busy.click('Revisar exclusão');busy.click('Confirmar exclusão');await settle(busy);busy.find(e=>e.type===dialogs.Dialog).props.onOpenChange(false);assert.equal(busy.closed.length,0);assert.equal(busy.blocker.shouldBlockFn(),true);release();await settle(busy);
});
await test('closing an uncertain attempt preserves it for later recovery',async()=>{
 const ref=pending('edit');const h=editor('edit',{}, {startingReference:ref});h.click('Fechar e manter referência');assert.equal(h.closed.length,1);assert.equal(JSON.parse(store.getItem(journalKey)).requestId,requestId);
});
await test('confirmation deadline keeps the attempt and ignores a later successful network response',async()=>{
 const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;let expire,release;const gate=new Promise(resolve=>{release=resolve;});let data;
 globalThis.setTimeout=(fn,ms)=>{assert.equal(ms,25000);expire=fn;return 1;};globalThis.clearTimeout=()=>{};
 try{const h=editor('delete',{confirm:async input=>{data=input;await gate;return terminal(input);}});h.change('Motivo da exclusão','Pedido duplicado');h.click('Revisar exclusão');h.click('Confirmar exclusão');await settle(h);assert(data);expire();await settle(h);assert(h.html().includes('Consultar resultado sem repetir'));assert(store.getItem(journalKey));release();await settle(h);assert.equal(h.completed.length,0);assert(store.getItem(journalKey));assert(!h.html().includes('Pedido excluído da lista operacional'));}finally{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;}
});
await test('a response after context unmount does not notify a different workspace UI',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const h=editor('delete',{confirm:async data=>{await gate;return terminal(data);}});h.change('Motivo da exclusão','Pedido duplicado');h.click('Revisar exclusão');h.click('Confirmar exclusão');await settle(h);h.unmount();release();for(let n=0;n<30;n++)await Promise.resolve();assert.equal(h.completed.length,0);
});

const changedOrder=(operation='edit')=>({...structuredClone(order),number:'SL-ALTERADO',status:'cancelled',cancelledAt:'2026-10-17T23:00:00Z',cancellationReason:'Revisão solicitada',change:{requestId:'ffffffff-5555-4555-8555-555555555555',operation,reason:'Endereço corrigido',createdAt:'2026-10-17T23:00:00Z',replacementOrderId:operation==='edit'?replacementId:null,actorId:actor}});
const replacementOrder=()=>({...structuredClone(order),orderId:replacementId,requestId:'ffffffff-5555-4555-8555-555555555555',number:'SL-VIGENTE'});
function history(orders,options={}){return harness('src/components/erp/SlimOrderHistory.tsx','SlimOrderHistory',{workspaceId:ws,response:{workspaceId:ws,complete:true,orders},loading:false,onDocument:()=>{},onCancel:()=>{},onEdit:()=>{},onDelete:()=>{},...options});}
await test('history defaults to operational rows and retains cancel alongside edit and delete',()=>{
 const h=history([changedOrder(),replacementOrder()]);const html=h.html();assert(html.includes('SL-VIGENTE'));assert(!html.includes('SL-ALTERADO'));assert(html.includes('Cancelar e estornar'));assert(html.includes('>Editar<'));assert(html.includes('>Excluir<'));assert(html.includes('Total dos pedidos confirmados'));
});
await test('changes view exposes reason, actor, replacement, original delivery and PDF without mutation buttons',()=>{
 const documents=[];const h=history([changedOrder(),replacementOrder()],{onDocument:o=>documents.push(o)});h.click('Alterações');assert(h.html().includes('Substituído por revisão'));assert(!h.html().includes('>Excluir<'));assert(!h.html().includes('>Editar<'));assert(!h.html().includes('Cancelar e estornar'));h.click('Detalhes');const html=h.html();assert(html.includes('Endereço corrigido'));assert(html.includes(actor));assert(html.includes(replacementId));assert(html.includes('Avenida Paulista'));assert(html.includes('Frete: R$ 12,34'));h.click('Documento original');assert.equal(documents[0].orderId,orderId);assert(!html.includes('Total dos pedidos confirmados'));
});
await test('logical deletion receives its own history label and remains searchable through form submit',()=>{
 const h=history([changedOrder('delete')]);h.click('Alterações');assert(h.html().includes('Excluído da lista'));const input=h.find(e=>e.type==='input'&&e.props.maxLength===300);input.props.onChange({target:{value:'Não corresponde'}});h.render();assert(h.html().includes('SL-ALTERADO'));h.find(e=>e.type==='form').props.onSubmit({preventDefault(){}});h.render();assert(h.html().includes('Nenhum pedido corresponde'));h.click('Limpar filtros');assert(h.html().includes('SL-ALTERADO'));
});
await test('ERP workspace wires both reviewed actions, preserves cancellation, and opens the requested original PDF',async()=>{
 const cancels=[],documents=[];const h=harness('src/components/erp/SlimErpWorkspace.tsx','TestWorkspace',{mode:'history',workspaceId:ws,actorId:actor},{cancel:data=>cancels.push(data),document:data=>documents.push(data)});h.props('SlimOrderChangeDialog').onLockChange(false);h.render();h.props('SlimOrderHistory').onEdit(structuredClone(order));h.render();assert.deepEqual(h.props('SlimOrderChangeDialog').target,{orderId,operation:'edit'});h.props('SlimOrderChangeDialog').onClose();h.render();h.props('SlimOrderHistory').onDelete(structuredClone(order));h.render();assert.deepEqual(h.props('SlimOrderChangeDialog').target,{orderId,operation:'delete'});h.props('SlimOrderChangeDialog').onClose();h.render();await h.props('SlimOrderHistory').onCancel(structuredClone(order));assert.equal(cancels.length,1);await h.props('SlimOrderHistory').onDocument(structuredClone(order));assert.deepEqual(documents,[{workspaceId:ws,orderId}]);
});
console.log(`Order changes UI: ${checks} checks passed; synthetic transport only, no production writes.`);
