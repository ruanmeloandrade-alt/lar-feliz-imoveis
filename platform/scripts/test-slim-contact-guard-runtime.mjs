// Actual ERP handlers, canonical creator, Workspace transport and Checkout events.
// Framework/storage/database doubles use synthetic data only. No external IO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {createSlimCanonicalContact} from '../src/lib/slim-contact-identity.core.ts';
import {isSlimContactPhoneConflict,SLIM_CONTACT_PHONE_GUARD,SLIM_CONTACT_PHONE_CONFLICT,SLIM_CONTACT_PHONE_MESSAGE} from '../src/lib/slim-contact-errors.core.ts';
import {erpRejection} from '../src/lib/slim-erp-release.core.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),nativeRequire=createRequire(import.meta.url);
const id=n=>`eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12,'0')}`,ws=id(1),actor=id(2),customer=id(3),product=id(4),request=id(5);
const guard={code:'23505',details:SLIM_CONTACT_PHONE_GUARD,message:SLIM_CONTACT_PHONE_MESSAGE};
const persisted={id:customer,workspace_id:ws,name:'Cliente concorrente',phone:'+5511999999999',email:'',source:'cadastro_manual_saude_slim',status:'active',merged_into_id:null,created_at:'2026-10-18T00:00:00Z',custom_data:{endereco:'Cadastro preservado'},value:19.99};
const catalog=[{id:product,workspaceId:ws,name:'Produto sintético',description:'Teste isolado',sku:'S',priceCents:1999,stock:10,active:true}];
const fulfillment={mode:'delivery',recipient:'Cliente sintético',phone:'5511999999999',postalCode:'01001000',street:'Praça da Sé',number:'10',complement:'Sala 2',neighborhood:'Sé',city:'São Paulo',state:'SP',notes:'Portaria'};
const draft={customer:{kind:'new',name:'Cliente sintético',email:'teste@example.invalid',phone:'+5511999999999'},items:[{productId:product,quantity:2}],discount:{kind:'amount',cents:101},payment:{method:'pix',status:'pending',installments:1},notes:'Manter anotação',fulfillment,shippingCents:1251};
function storage(){const rows=new Map();return {rows,getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}

function fakeDb(error=guard){
 const calls=[],tables={profiles:[{id:actor,current_workspace_id:ws}],workspaces:[{id:ws,owner_id:actor}],workspace_members:[],leads:[],products:[{id:product,workspace_id:ws,name:catalog[0].name,description:catalog[0].description,sku:'S',price:'19.99',promo_price:null,stock:10,active:true}]};
 const db={calls,tables,failCatalog:false,beforeRpc:null,from(table){
  const call={kind:'read',table,filters:[]};calls.push(call);const result=()=>{if(db.failCatalog&&['leads','products'].includes(table))throw new Error('Catálogo indisponível');return tables[table].filter(row=>call.filters.every(([key,value])=>row[key]===value));};
  return {select(){return this;},eq(key,value){call.filters.push([key,value]);return this;},order(){return this;},async maybeSingle(){return {data:result()[0]??null,error:null};},async range(from,to){return {data:result().slice(from,to+1),error:null};}};
 },async rpc(name,args){calls.push({kind:'rpc',name,args:structuredClone(args)});db.beforeRpc?.(name,args);assert.equal(name,'slim_confirm_order','No unrelated RPC or recovery may run');if(error instanceof Error)throw error;
  if(error){tables.leads=[structuredClone(persisted)];return {data:null,error};}
  return {data:{workspaceId:ws,requestId:args._request_id,orderId:id(10),number:'SL-SINTETICO',status:'confirmed',totalCents:args._quote.totalCents},error:null};
 }};return db;
}

function nodes(node,all=[]){if(Array.isArray(node)){node.forEach(item=>nodes(item,all));return all;}if(React.isValidElement(node)){all.push(node);nodes(node.props.children,all);}return all;}
function environment(db=fakeDb()){
 const cache=new Map(),store=storage(),queries=new Map(),auth={name:'synthetic-auth'},attacher={name:'synthetic-attacher'};
 let active=null,refreshes=0;
 globalThis.window={localStorage:store,confirm:()=>{throw new Error('Unexpected confirmation dialog');}};
 const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,useState(initial){const owner=active,i=owner.cursor++;if(!(i in owner.slots))owner.slots[i]=typeof initial==='function'?initial():initial;return [owner.slots[i],next=>{owner.slots[i]=typeof next==='function'?next(owner.slots[i]):next;}];},useRef(value){const i=active.cursor++;if(!(i in active.slots))active.slots[i]={current:value};return active.slots[i];},useMemo(fn,deps){const i=active.cursor++;if(!(i in active.slots)||!same(active.slots[i].deps,deps))active.slots[i]={deps,value:fn()};return active.slots[i].value;},useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},useEffect(fn,deps){const owner=active,i=owner.cursor++;if(!(i in owner.slots)||!same(owner.slots[i].deps,deps)){const previous=owner.slots[i];owner.slots[i]={deps,cleanup:previous?.cleanup};owner.effects.push(()=>{previous?.cleanup?.();owner.slots[i].cleanup=fn();});}}};
 const unexpected=()=>{throw new Error('Unexpected unrelated mutation or query');};
 const createServerFn=()=>{let parse=value=>value;return {middleware(list){assert(list.includes(auth));assert(list.every(item=>item===auth||item===attacher));return this;},inputValidator(fn){parse=fn;return this;},handler(fn){return async(args={})=>fn({data:parse(args.data),context:args.context??{supabase:db,userId:actor}});}};};
 const inert=()=>null;
 const mocks={
  react:hooks,'@tanstack/react-start':{createServerFn,useServerFn:fn=>fn},
  '@/integrations/supabase/auth-middleware':{requireSupabaseAuth:auth},'@/integrations/supabase/auth-attacher':{attachSupabaseAuth:attacher},
  '@/components/ui/dialog':{Dialog:inert,DialogContent:inert,DialogHeader:inert,DialogTitle:inert,DialogDescription:inert},
  './SlimOrderChangeDialog':{SlimOrderChangeDialog:inert},'@tanstack/react-router':{Link:inert,useBlocker:()=>{}},
  '@/lib/slim-checkout-recovery.functions':{closeSlimCheckoutAttempt:unexpected},
  '@/lib/slim-receipt-dispatch.functions':{prepareSlimReceiptDispatch:unexpected,approveSlimReceiptDispatch:unexpected,lookupSlimReceiptDispatch:unexpected},
  '@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:unexpected}),useQuery:options=>{
   const key=options.queryKey.join(':');if(!queries.has(key)){
    const q={data:options.queryKey[0]==='slim-erp-context'?{workspaceId:ws,actorId:actor,catalog,customers:[]}:null,error:null,isLoading:false};
    q.refetch=async()=>{assert.equal(options.queryKey[0],'slim-erp-context');refreshes++;try{q.data=await options.queryFn();q.error=null;return {data:q.data};}catch(error){q.error=error;throw error;}};queries.set(key,q);
   }return queries.get(key);
  }},
 };
 function load(relative){
  const file=path.isAbsolute(relative)?relative:path.join(root,relative);if(cache.has(file))return cache.get(file).exports;
  let source=fs.readFileSync(file,'utf8');
  // Execute only the real release transform's session edit, in memory. No shared source is changed.
  if(file.split(path.sep).join('/').endsWith('/slim-checkout-session.core.ts')&&!source.includes('// SLIM_ERP_RELEASE_V1')){
   const script=fs.readFileSync(path.join(root,'scripts/apply-slim-erp-release.mjs'),'utf8'),start=script.indexOf("edit('src/lib/slim-checkout-session.core.ts'"),end=script.indexOf('\nedit(',start+1);assert(start>=0&&end>start);
   Function('edit',script.slice(start,end))((target,run)=>{assert.equal(target,'src/lib/slim-checkout-session.core.ts');run((from,to)=>{assert.equal(source.split(from).length,2);source=source.replace(from,()=>to);});});
  }
  if(file.split(path.sep).join('/').endsWith('/SlimErpWorkspace.tsx'))source+='\nexport {Workspace as TestWorkspace};\n';
  const module={exports:{}};cache.set(file,module);
  const compiled=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}});assert(!compiled.diagnostics?.some(item=>item.category===ts.DiagnosticCategory.Error));
  Function('require','module','exports','React',compiled.outputText)(name=>{
   if(name in mocks)return mocks[name];
   if(/\.functions(?:\.tsx?)?$/.test(name)&&!name.endsWith('/slim-erp-release.functions'))throw new Error('Missing explicit IO mock: '+name);
   if(!name.startsWith('.')&&!name.startsWith('@/'))return nativeRequire(name);
   const base=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(file),name),target=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert(target,'Missing source '+name);return load(target);
  },module,module.exports,React);return module.exports;
 }
 function mount(Component,initialProps){const owner={slots:[],effects:[],cursor:0},instance={props:initialProps,tree:null,render(next=instance.props){instance.props=next;active=owner;owner.cursor=0;instance.tree=Component(next);active=null;const effects=owner.effects.splice(0);effects.forEach(fn=>fn());return instance.tree;},find(predicate){const value=nodes(instance.tree).find(predicate);assert(value,'Missing component element');return value;},unmount(){for(const slot of owner.slots)slot?.cleanup?.();}};instance.render();return instance;}
 const api=load('src/lib/slim-erp-release.functions.ts'),checkoutCore=load('src/lib/slim-checkout.core.ts'),sessionCore=load('src/lib/slim-checkout-session.core.ts');
 function workspace(){const h=mount(load('src/components/erp/SlimErpWorkspace.tsx').TestWorkspace,{mode:'checkout',workspaceId:ws,actorId:actor});h.render();return h;}
 return {db,store,api,checkoutCore,sessionCore,mount,load,workspace,get refreshes(){return refreshes;}};
}
async function settle(...instances){for(let i=0;i<35;i++)await Promise.resolve();instances.forEach(h=>h.render());}
const checkoutNode=h=>h.find(node=>typeof node.type==='function'&&node.type.name==='SlimCheckout');
const button=(h,text)=>h.find(node=>node.type==='button'&&node.props.children===text);
const field=(h,label)=>h.find(node=>node.props['aria-label']===label);
const journalKey=`saude-slim:erp:pending:${ws}:${actor}`;
let count=0;async function test(name,fn){delete globalThis.window;await fn();count++;console.log('PASS contact guard runtime: '+name);}

await test('guard requires exact SQLSTATE and marker, never a similar message',()=>{
 assert(isSlimContactPhoneConflict(guard));assert(isSlimContactPhoneConflict({code:'23505',constraint:SLIM_CONTACT_PHONE_GUARD}));
 for(const value of [null,'23505',{...guard,code:'40001'},{code:'23505',message:SLIM_CONTACT_PHONE_MESSAGE},{code:'23505',details:SLIM_CONTACT_PHONE_GUARD+' suffix'},{code:'23505',hint:SLIM_CONTACT_PHONE_GUARD},{code:'23505',constraint:'existing_whatsapp_unique'}])assert.equal(isSlimContactPhoneConflict(value),false);
 assert.equal(erpRejection({...guard,message:'private detail must not leak'}),SLIM_CONTACT_PHONE_MESSAGE);
});
await test('old validation rejections and unknown uniqueness classifications are preserved',()=>{
 assert.equal(erpRejection({code:'22023',message:'O preço mudou. Revise o pedido.'}),'O preço mudou. Revise o pedido.');
 for(const code of ['23505','40001','55P03','PGRST000'])assert.equal(erpRejection({code,message:SLIM_CONTACT_PHONE_MESSAGE}),null);
});
await test('real confirm handler returns identified rejection after one RPC',async()=>{
 const e=environment(),quote=e.checkoutCore.calculateCheckout(ws,draft,catalog),result=await e.api.confirmSlimErpOrder({data:{workspaceId:ws,requestId:request,quote}});
 assert.deepEqual(result,{state:'rejected',message:SLIM_CONTACT_PHONE_MESSAGE,rejectionCode:SLIM_CONTACT_PHONE_CONFLICT});assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);assert.deepEqual(e.db.calls.find(c=>c.kind==='rpc').args._quote,quote);
});
await test('real handler keeps unrecognized uniqueness timeout and lock errors uncertain',async()=>{
 for(const error of [{code:'23505',message:SLIM_CONTACT_PHONE_MESSAGE},{code:'23505',details:'other_index',message:'duplicate'}, {code:'55P03',message:'lock timeout'},new Error('network timeout')]){
  const e=environment(fakeDb(error)),quote=e.checkoutCore.calculateCheckout(ws,draft,catalog);await assert.rejects(e.api.confirmSlimErpOrder({data:{workspaceId:ws,requestId:request,quote}}));assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);
 }
});
await test('real handler preserves normal receipt and independent validation response',async()=>{
 for(const error of [null,{code:'22023',message:'O preço mudou. Revise o pedido.'}]){const e=environment(fakeDb(error)),quote=e.checkoutCore.calculateCheckout(ws,draft,catalog),result=await e.api.confirmSlimErpOrder({data:{workspaceId:ws,requestId:request,quote}});assert.equal(result.state,error?'rejected':'confirmed');assert(!('rejectionCode'in result));if(!error)assert.equal(result.receipt.totalCents,quote.totalCents);}
});

function racingContactDb(error,reveal=true){let reads=0,inserts=0;return {get metrics(){return {reads,inserts};},from(table){assert.equal(table,'leads');let operation='read';const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},insert(){operation='insert';return q;},single(){return q;},async then(resolve,reject){try{if(operation==='insert'){inserts++;return resolve({data:null,error});}reads++;return resolve({data:reads>1&&reveal?[structuredClone(persisted)]:[],error:null});}catch(e){return reject(e);}}};return q;}};}
await test('canonical creator recovers the new guard without another INSERT or edits',async()=>{
 const db=racingContactDb(guard),before=structuredClone(persisted),result=await createSlimCanonicalContact(db,ws,{name:'Do not overwrite',phone:persisted.phone});assert.deepEqual(result,{id:customer,created:false});assert.deepEqual(db.metrics,{reads:2,inserts:1});assert.deepEqual(persisted,before);
});
await test('existing WhatsApp unique-index recovery remains unchanged',async()=>{
 const db=racingContactDb({code:'23505',message:'duplicate key on existing WhatsApp index'});assert.deepEqual(await createSlimCanonicalContact(db,ws,{name:'Synthetic',phone:persisted.phone}),{id:customer,created:false});assert.deepEqual(db.metrics,{reads:2,inserts:1});
});
await test('canonical guard without a visible persisted contact never fabricates success',async()=>{
 const db=racingContactDb(guard,false);await assert.rejects(createSlimCanonicalContact(db,ws,{name:'Synthetic',phone:persisted.phone}),{message:SLIM_CONTACT_PHONE_MESSAGE});assert.deepEqual(db.metrics,{reads:2,inserts:1});
});

await test('real Workspace and Checkout keep draft, refresh clients and require a new review',async()=>{
 const e=environment(),w=e.workspace(),first=checkoutNode(w),h=e.mount(first.type,{...first.props,initialDraft:structuredClone(draft)});
 e.db.beforeRpc=()=>{const pending=JSON.parse(e.store.getItem(journalKey));assert.equal(pending.workspaceId,ws);assert.equal(pending.actorId,actor);assert.equal(Object.keys(pending).length,4);};
 button(h,'Revisar pedido').props.onClick();h.render();button(h,'Confirmar pedido').props.onClick();await settle(w,h);h.render({...checkoutNode(w).props,initialDraft:structuredClone(draft)});
 assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);assert.equal(e.refreshes,1);assert.equal(e.store.getItem(journalKey),null);assert.equal(checkoutNode(w).key,first.key);assert(checkoutNode(w).props.customers.some(c=>c.id===customer));
 assert.equal(h.find(n=>n.type==='fieldset').props.disabled,false);assert.equal(field(h,'Frete em reais').props.value,'12,51');assert.equal(field(h,'Logradouro de entrega').props.value,fulfillment.street);assert.equal(field(h,'Quantidade de Produto sintético').props.value,2);assert(h.find(n=>n.props.value==='Manter anotação'));assert(h.find(n=>n.props.children===SLIM_CONTACT_PHONE_MESSAGE));
 const firstQuote=e.db.calls.find(c=>c.kind==='rpc').args._quote;assert.deepEqual(firstQuote.fulfillment,fulfillment);assert.equal(firstQuote.discountCents,101);
 // Selecting the newly visible customer changes only the next explicit review.
 h.find(n=>n.type==='input'&&n.props.type==='radio'&&!n.props.name&&!n.props.checked).props.onChange();h.render();h.find(n=>n.type==='select'&&n.props.value==='').props.onChange({target:{value:customer}});h.render();button(h,'Revisar pedido').props.onClick();h.render();assert(button(h,'Confirmar pedido'));assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);
 assert.equal(field(h,'Frete em reais').props.value,'12,51');assert.equal(field(h,'Número de entrega').props.value,fulfillment.number);w.unmount();h.unmount();
});
await test('unrecognized error preserves real session review and opaque journal with no retry',async()=>{
 const e=environment(fakeDb({code:'23505',message:SLIM_CONTACT_PHONE_MESSAGE})),w=e.workspace(),transport=checkoutNode(w).props.transport,quote=e.checkoutCore.calculateCheckout(ws,draft,catalog),session=e.sessionCore.createCheckoutSession(quote,transport,request);
 await Promise.all([session.approve(),session.approve()]);await settle(w);assert.equal(session.get().state,'uncertain');assert.deepEqual(session.get().quote,quote);assert.equal(JSON.parse(e.store.getItem(journalKey)).requestId,request);assert.equal(e.refreshes,0);assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);await assert.rejects(session.approve());assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);w.unmount();
});
await test('catalog read failure cannot convert a definite rejection to an uncertain sale',async()=>{
 const db=fakeDb();db.failCatalog=true;const e=environment(db),w=e.workspace(),quote=e.checkoutCore.calculateCheckout(ws,draft,catalog),session=e.sessionCore.createCheckoutSession(quote,checkoutNode(w).props.transport,request);await session.approve();await settle(w);
 assert.equal(session.get().state,'rejected');assert.equal(session.get().error,SLIM_CONTACT_PHONE_MESSAGE);assert.deepEqual(session.get().quote,quote);assert.equal(e.store.getItem(journalKey),null);assert.equal(e.refreshes,1);assert(checkoutNode(w).props.loadError);assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);w.unmount();
});
await test('unrelated validation rejection does not refresh the customer catalog',async()=>{
 const e=environment(fakeDb({code:'22023',message:'O preço mudou. Revise o pedido.'})),w=e.workspace(),quote=e.checkoutCore.calculateCheckout(ws,draft,catalog),session=e.sessionCore.createCheckoutSession(quote,checkoutNode(w).props.transport,request);await session.approve();await settle(w);assert.equal(session.get().state,'rejected');assert.equal(e.refreshes,0);assert.equal(e.store.getItem(journalKey),null);assert.equal(e.db.calls.filter(c=>c.kind==='rpc').length,1);w.unmount();
});
delete globalThis.window;
console.log(`${count}/${count} contact-guard runtime checks passed. Actual handlers/components, synthetic transports only; no production operation or outbound message.`);
