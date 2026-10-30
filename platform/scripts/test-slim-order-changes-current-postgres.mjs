import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {normalizeCheckoutDelivery} from '../src/lib/slim-checkout-delivery.core.ts';
import {validateOrderSnapshot} from '../src/lib/slim-order-read.core.ts';
import {receiptConsentMaterial} from '../src/lib/slim-receipt-dispatch.core.ts';

// Disposable PostgreSQL only. Current freight + complete document/consent contracts.
// The historical edit/delete proposal and its simplified document fixture are never loaded.
// No credentials, network, external transport or production writes.
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const pg=new PGlite({extensions:{pgcrypto}});let passed=0;
const W='00000000-0000-4000-8000-000000000101',OTHER='00000000-0000-4000-8000-000000000102';
const owner='00000000-0000-4000-8000-000000000001',operator='00000000-0000-4000-8000-000000000002',viewer='00000000-0000-4000-8000-000000000003',expired='00000000-0000-4000-8000-000000000004',outsider='00000000-0000-4000-8000-000000000005';
const phone='+5511999999999',pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'),b64=pdf.toString('base64');
const hash=value=>createHash('sha256').update(value).digest('hex'),sha=hash(pdf);
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
const count=table=>scalar(`SELECT count(*)::int FROM public.${table}`);
const balance=id=>scalar('SELECT stock FROM public.products WHERE id=$1',[id]);
const row=id=>scalar('SELECT to_jsonb(o) FROM public.slim_orders o WHERE id=$1',[id]);
const context=(id,workspace=W)=>scalar('SELECT public.slim_order_change_context($1,$2)',[workspace,id]);
const change=(s,operation='edit',quote=s.q,request=randomUUID(),overrides={})=>{
 const input={workspace:W,order:s.order,request,operation,fingerprint:s.fp,quote,reason:'Operator-reviewed synthetic correction',approved:true,...overrides};
 return scalar('SELECT public.slim_change_order($1,$2,$3,$4,$5,$6,$7,$8)',[input.workspace,input.order,input.request,input.operation,input.fingerprint,input.quote,input.reason,input.approved]);
};
const lookup=(s,request,operation='edit')=>scalar('SELECT public.slim_lookup_order_change($1,$2,$3,$4)',[W,s.order,request,operation]);
const cancel=id=>scalar("SELECT public.slim_cancel_order($1,$2,'Synthetic explicit cancellation')",[W,id]);
async function actor(id=owner){await pg.exec('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function admin(){await pg.exec('RESET ROLE');}
async function reject(fn,code='22023'){
 await pg.exec('SAVEPOINT expected_rejection');let error;
 try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT expected_rejection');}
 await pg.exec('RELEASE SAVEPOINT expected_rejection');assert(error,'Expected operation to be rejected');assert.equal(error.code,code,error.message);
}
async function check(name,fn,isolation='READ COMMITTED'){
 await pg.exec(`BEGIN ISOLATION LEVEL ${isolation}`);
 try{await fn();passed++;console.log('PASS current order changes PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}
}
function delivery(){return {mode:'delivery',recipient:'Cliente sintético',phone:'5511999999999',postalCode:'01001000',street:'Rua Sintética',number:'12',complement:'Sala 1',neighborhood:'Centro',city:'São Paulo',state:'SP',notes:'Portaria'};}
function revised(s,{qty=2,price=950,discount=0,shipping=325,fulfillment=s.q.fulfillment,payment=s.q.payment}={}){
 return {...structuredClone(s.q),items:[{productId:s.product,quantity:qty,unitPriceCents:price}],subtotalCents:qty*price,discountCents:discount,totalCents:qty*price-discount+shipping,fulfillment,shippingCents:shipping,payment};
}
async function seed({qty=2,stock=10,shipping=325,legacy=false,mode='delivery'}={}){
 await admin();const product=randomUUID(),lead=randomUUID(),session=randomUUID();
 await pg.query("INSERT INTO public.products(id,workspace_id,name,sku,description,price,stock) VALUES($1,$2,'Produto sintético','QA','Descrição sintética',9.50,$3)",[product,W,stock]);
 await pg.query("INSERT INTO public.leads(id,workspace_id,name,phone,custom_data) VALUES($1,$2,'Cliente sintético',$3,'{\"address\":\"Cadastro original\"}')",[lead,W,phone]);
 await pg.query('INSERT INTO public.whatsapp_web_sessions(id,workspace_id) VALUES($1,$2)',[session,W]);
 const q={workspaceId:W,customer:{kind:'existing',id:lead},items:[{productId:product,quantity:qty,unitPriceCents:950}],subtotalCents:qty*950,discountCents:0,totalCents:qty*950+(legacy?0:shipping),payment:{method:'pix',status:'pending',installments:1},notes:'Observação original',...(legacy?{}:{fulfillment:mode==='pickup'?{mode:'pickup'}:delivery(),shippingCents:shipping})};
 await actor();const receipt=await scalar('SELECT public.slim_confirm_order($1,$2,$3)',[W,randomUUID(),q]);
 const saved=await row(receipt.orderId),fp=await scalar("SELECT encode(extensions.digest(snapshot::text||'|'||status,'sha256'),'hex') FROM public.slim_orders WHERE id=$1",[receipt.orderId]);
 return {product,lead,session,q,receipt,order:receipt.orderId,fp,snapshot:saved.snapshot,at:saved.confirmed_at};
}
async function archive(s,overrides={}){
 const value={workspace:W,order:s.order,version:1,sha,filename:'pedido-'+s.snapshot.number+'.pdf',pdf:b64,actor:owner,...overrides};
 return scalar('INSERT INTO public.slim_order_documents(workspace_id,order_id,version,sha256,filename,pdf_base64,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[value.workspace,value.order,value.version,value.sha,value.filename,value.pdf,value.actor]);
}
async function reserve(s,document,overrides={}){
 const value={workspace:W,document,request:randomUUID(),actor:owner,session:s.session,phone,status:'pending',...overrides};
 const consent=overrides.consent??hash(receiptConsentMaterial(value.document,sha,s.order,value.session,value.phone,value.request));
 return scalar('INSERT INTO public.slim_order_document_deliveries(workspace_id,document_id,request_id,actor_id,session_id,phone,status,consent_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[value.workspace,value.document,value.request,value.actor,value.session,value.phone,value.status,consent]);
}
async function finish(id,status){await pg.query('UPDATE public.slim_order_document_deliveries SET status=$2,message_id=$3,last_error=$4 WHERE id=$1',[id,status,status==='accepted'?'synthetic-provider-receipt':null,status==='uncertain'?'PROVIDER_RESULT_UNKNOWN':status==='rejected'?'PROVIDER_REJECTED':null]);}
const businessState=()=>scalar(`SELECT jsonb_build_object(
 'orders',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM public.slim_orders o),
 'products',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.products p),
 'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]') FROM public.slim_stock_movements m),
 'documents',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.slim_order_documents d),
 'deliveries',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.slim_order_document_deliveries d),
 'leads',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.leads l))`);
const dependencyState=()=>scalar("SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'body',p.prosrc,'definer',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('slim_confirm_order','slim_cancel_order','slim_guard_caller_document')");
const permissionState=()=>scalar("SELECT jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('slim_orders','slim_stock_movements','slim_order_documents','slim_order_document_deliveries')");
function validate(saved){return validateOrderSnapshot({...saved.snapshot,status:saved.status,cancelledAt:saved.cancelled_at,cancellationReason:saved.cancellation_reason},W);}
async function assertOriginal(s){const saved=await row(s.order);assert.equal(saved.status,'confirmed');assert.deepEqual(saved.snapshot,s.snapshot);assert.equal(await balance(s.product),10-s.q.items[0].quantity);assert.equal(await scalar('SELECT count(*)::int FROM public.slim_order_changes WHERE order_id=$1',[s.order]),0);}

try{
 await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
 // Existing confirm only reads these closure keys; the complete document schema is loaded below.
 await pg.exec('ALTER TABLE public.products ADD COLUMN promo_price numeric; CREATE TABLE public.slim_checkout_attempt_closures(workspace_id uuid,request_id uuid);');
 await pg.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0]);
 await pg.exec(read('scripts/fixtures/slim-document-isolated-schema.sql'));
 for(const table of ['workspaces','workspace_members','leads','products','lead_products','slim_orders','slim_stock_movements','whatsapp_web_sessions','slim_order_documents','slim_order_document_deliveries']){
  await pg.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.${table} TO authenticated; CREATE POLICY fixture_read ON public.${table} FOR SELECT TO authenticated USING(private.slim_workspace_access(${table==='workspaces'?'id':'workspace_id'}));`);
 }
 await pg.exec(read('scripts/fixtures/slim-confirm-order-live-contract.sql'));
 await pg.exec(read('scripts/fixtures/slim-legacy-cancel-contract.sql'));
 await pg.exec("CREATE FUNCTION public.slim_confirm_order(_workspace_id uuid,_request_id uuid,_quote jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT private.slim_confirm_order(_workspace_id,_request_id,_quote)'; REVOKE ALL ON FUNCTION public.slim_confirm_order(uuid,uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.slim_confirm_order(uuid,uuid,jsonb) TO authenticated;");
 await pg.exec('BEGIN');await pg.exec(read('supabase/migrations/20261018001819_slim_checkout_delivery_freight.sql'));await pg.exec('COMMIT');
 await pg.exec(read('supabase/migrations/20261016102253_slim_document_caller_rls_and_immutable_consent.sql'));
 await pg.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])',[[owner,operator,viewer,expired,outsider]]);
 await pg.query("INSERT INTO public.workspaces(id,owner_id,name) VALUES($1,$2,'Synthetic workspace'),($3,$4,'Other workspace')",[W,owner,OTHER,outsider]);
 await pg.query("INSERT INTO public.workspace_members(workspace_id,user_id,role_type,access_expires_at) VALUES($1,$2,'funcionario',NULL),($1,$3,'visualizador',NULL),($1,$4,'funcionario',now()-interval '1 day')",[W,operator,viewer,expired]);

 // Pre-existing current order, archived PDF and accepted delivery prove installation is structural.
 await pg.exec('BEGIN');const baseline=await seed(),baselineDoc=await archive(baseline),baselineDelivery=await reserve(baseline,baselineDoc);await finish(baselineDelivery,'accepted');await admin();await pg.exec('COMMIT');
 const beforeBusiness=await businessState(),beforeDependencies=await dependencyState(),beforePermissions=await permissionState();
 const files=readdirSync(new URL('supabase/migrations/',root)).filter(file=>file.endsWith('_slim_order_changes_delivery_reviewed.sql'));assert.equal(files.length,1);
 await pg.exec('BEGIN');await pg.exec(read('supabase/migrations/'+files[0]));await pg.exec('COMMIT');
 assert.deepEqual(await businessState(),beforeBusiness);passed++;console.log('PASS current order changes PostgreSQL: installation preserves existing order, freight, payment, PDF, delivery receipt and stock');
 assert.deepEqual(await dependencyState(),beforeDependencies);assert.deepEqual(await permissionState(),beforePermissions);passed++;console.log('PASS current order changes PostgreSQL: current confirm/cancel/document guard bodies, authorization and existing grants unchanged');

 await check('context preserves current delivery fields without request payload',async()=>{const s=await seed(),c=await context(s.order);assert.equal(c.fingerprint,s.fp);assert.equal(c.row.shipping_cents,325);assert.deepEqual(c.row.snapshot.fulfillment,s.snapshot.fulfillment);assert(!Object.hasOwn(c.row,'request_payload'));});
 await check('edit preserves address, freight, source document and sale period',async()=>{
  const s=await seed(),doc=await archive(s),originalDocument=await scalar('SELECT to_jsonb(d) FROM slim_order_documents d WHERE id=$1',[doc]);
  const result=await change(s),saved=await row(result.replacementOrderId),original=await row(s.order);
  assert.equal(result.state,'completed');assert.equal(result.receipt.totalCents,2225);assert.equal(saved.shipping_cents,325);assert.deepEqual(saved.snapshot.fulfillment,s.snapshot.fulfillment);validate(saved);
  assert.equal(original.status,'cancelled');assert.deepEqual(original.snapshot,s.snapshot);assert.equal(saved.confirmed_at,s.at);assert.equal(saved.snapshot.confirmedAt,s.snapshot.confirmedAt);assert.equal(saved.snapshot.revisionOf,s.order);
  assert.equal(await balance(s.product),8);assert.equal(await scalar('SELECT count(*)::int FROM slim_stock_movements WHERE order_id IN ($1,$2)',[s.order,result.replacementOrderId]),3);
  const ledger=await scalar('SELECT to_jsonb(c) FROM slim_order_changes c WHERE id=$1',[result.requestId]);assert.deepEqual(ledger.source_snapshot,s.snapshot);assert.equal(ledger.source_status,'confirmed');assert.equal(ledger.actor_id,owner);
  assert.deepEqual(await scalar('SELECT to_jsonb(d) FROM slim_order_documents d WHERE id=$1',[doc]),originalDocument);
 });
 await check('edit changes address, freight, discount and paid total coherently',async()=>{
  const s=await seed(),q=revised(s,{qty:3,discount:100,shipping:499,fulfillment:{...delivery(),street:' Rua Revisada ',number:'34',notes:'Novo local'},payment:{method:'credit_card',status:'paid',installments:2}});
  const result=await change(s,'edit',q),saved=await row(result.replacementOrderId);assert.equal(saved.total_cents,3249);assert.equal(result.receipt.totalCents,3249);assert.equal(saved.shipping_cents,499);assert.equal(saved.snapshot.payment.status,'paid');assert.equal(saved.snapshot.payment.installments,2);assert.deepEqual(saved.snapshot.fulfillment,normalizeCheckoutDelivery(q.fulfillment,499).fulfillment);validate(saved);assert.deepEqual((await row(s.order)).snapshot,s.snapshot);
 });
 await check('delivery can become pickup with zero freight and no address',async()=>{const s=await seed(),result=await change(s,'edit',revised(s,{shipping:0,fulfillment:{mode:'pickup'}})),saved=await row(result.replacementOrderId);assert.deepEqual(saved.snapshot.fulfillment,{mode:'pickup'});assert.equal(saved.shipping_cents,0);assert.equal(saved.total_cents,1900);validate(saved);});
 await check('pickup can become delivery with freight',async()=>{const s=await seed({shipping:0,mode:'pickup'}),result=await change(s,'edit',revised(s,{shipping:125,fulfillment:delivery()})),saved=await row(result.replacementOrderId);assert.equal(saved.shipping_cents,125);assert.equal(saved.total_cents,2025);assert.deepEqual(saved.snapshot.fulfillment,delivery());validate(saved);});
 await check('legacy source requires an explicit delivery choice for revision',async()=>{const s=await seed({legacy:true});assert(!Object.hasOwn((await context(s.order)).row.snapshot,'fulfillment'));await reject(()=>change(s));await assertOriginal(s);const result=await change(s,'edit',revised(s,{shipping:0,fulfillment:{mode:'pickup'}}));assert.equal((await row(result.replacementOrderId)).snapshot.fulfillment.mode,'pickup');assert(!Object.hasOwn((await row(s.order)).snapshot,'fulfillment'));});
 await check('zero remaining stock reuses only the source quantities',async()=>{const s=await seed({stock:2});assert.equal(await balance(s.product),0);const result=await change(s);assert.equal(result.state,'completed');assert.equal(await balance(s.product),0);assert.equal(await scalar('SELECT count(*)::int FROM slim_stock_movements WHERE order_id IN ($1,$2)',[s.order,result.replacementOrderId]),3);});
 await check('replacement may remove the old product and debit a current product',async()=>{const s=await seed();await admin();const product=randomUUID();await pg.query("INSERT INTO products(id,workspace_id,name,price,stock) VALUES($1,$2,'Outro produto',12.00,3)",[product,W]);await actor();const q={...s.q,items:[{productId:product,quantity:1,unitPriceCents:1200}],subtotalCents:1200,totalCents:1525};await change(s,'edit',q);assert.equal(await balance(s.product),10);assert.equal(await balance(product),2);});
 await check('reviewed current price is used while source price stays immutable',async()=>{const s=await seed();await admin();await pg.query('UPDATE products SET price=10 WHERE id=$1',[s.product]);await actor();const result=await change(s,'edit',revised(s,{price:1000}));assert.equal(result.receipt.totalCents,2325);assert.equal((await row(result.replacementOrderId)).snapshot.items[0].unitPriceCents,1000);assert.equal((await row(s.order)).snapshot.items[0].unitPriceCents,950);});
 const failures=[
  ['stock shortage',s=>revised(s,{qty:11})],['stale price',s=>revised(s,{price:949})],
  ['invalid payment',s=>({...s.q,payment:{method:'pix',status:'paid',installments:2}})],
  ['total omits freight',s=>({...s.q,totalCents:1900})],
  ['invalid address',s=>({...s.q,fulfillment:{...delivery(),city:''}})],
  ['pickup with freight',s=>({...s.q,fulfillment:{mode:'pickup'}})],
  ['new customer during revision',s=>({...s.q,customer:{kind:'new',name:'Unapproved new customer'}})],
 ];
 for(const [label,quote] of failures)await check(label+' rolls back reversal and replacement',async()=>{const s=await seed(),before=await businessState();await reject(()=>change(s,'edit',quote(s)));assert.deepEqual(await businessState(),before);await assertOriginal(s);});
 await check('inactive source product cannot be sold by revision',async()=>{const s=await seed();await admin();await pg.query('UPDATE products SET active=false WHERE id=$1',[s.product]);await actor();await reject(()=>change(s));await assertOriginal(s);});
 await check('missing approval, reason and stale fingerprint cannot mutate',async()=>{const s=await seed();await reject(()=>change(s,'edit',s.q,randomUUID(),{approved:false}),'42501');await reject(()=>change(s,'edit',s.q,randomUUID(),{reason:' '}));await reject(()=>change(s,'edit',s.q,randomUUID(),{fingerprint:'0'.repeat(64)}));await assertOriginal(s);});
 await check('identical approved edit and lookup return one result without another stock movement',async()=>{const s=await seed(),request=randomUUID(),q=revised(s,{qty:3}),first=await change(s,'edit',q,request),before=await businessState();assert.deepEqual(await change(s,'edit',q,request),first);assert.deepEqual(await lookup(s,request),first);assert.deepEqual(await businessState(),before);});
 await check('changed payload or another request cannot revise the same source',async()=>{const s=await seed(),request=randomUUID();await change(s,'edit',s.q,request);await reject(()=>change(s,'edit',revised(s,{shipping:326}),request));await reject(()=>change(s));await reject(()=>context(s.order));assert.equal(await scalar('SELECT count(*)::int FROM slim_order_changes WHERE order_id=$1',[s.order]),1);});
 await check('ordinary checkout request cannot be reused for a change or recovery',async()=>{const s=await seed(),before=await businessState();await reject(()=>change(s,'delete',null,s.receipt.requestId));await reject(()=>lookup(s,s.receipt.requestId));assert.deepEqual(await businessState(),before);});
 await check('same request binds operator, source order and operation',async()=>{const s=await seed(),other=await seed(),request=randomUUID();await change(s,'edit',s.q,request);await reject(()=>change(other,'edit',other.q,request));await reject(()=>change(s,'delete',null,request));await reject(()=>lookup(s,request,'delete'),'42501');await actor(operator);await reject(()=>change(s,'edit',s.q,request));await reject(()=>lookup(s,request),'42501');});
 await check('delete retains freight, payment, original snapshot and PDF with a single reversal',async()=>{const s=await seed(),doc=await archive(s),originalDoc=await scalar('SELECT to_jsonb(d) FROM slim_order_documents d WHERE id=$1',[doc]),request=randomUUID(),result=await change(s,'delete',null,request);assert.equal(result.replacementOrderId,null);assert.equal(result.receipt,null);assert.equal(await balance(s.product),10);const saved=await row(s.order);assert.equal(saved.status,'cancelled');assert.equal(saved.shipping_cents,325);assert.deepEqual(saved.snapshot,s.snapshot);assert.deepEqual(await scalar('SELECT to_jsonb(d) FROM slim_order_documents d WHERE id=$1',[doc]),originalDoc);assert.deepEqual(await change(s,'delete',null,request),result);assert.deepEqual(await lookup(s,request,'delete'),result);assert.equal(await scalar('SELECT count(*)::int FROM slim_stock_movements WHERE order_id=$1',[s.order]),2);});
 await check('cancelled source can be logically deleted without second reversal',async()=>{const s=await seed();await cancel(s.order);s.fp=(await context(s.order)).fingerprint;await reject(()=>change(s));const before=await businessState();await change(s,'delete',null);assert.deepEqual(await businessState(),before);assert.equal(await balance(s.product),10);assert.equal(await scalar('SELECT source_status FROM slim_order_changes WHERE order_id=$1',[s.order]),'cancelled');});
 await check('cancelled replacement remains a completed change without a confirmed receipt',async()=>{const s=await seed(),request=randomUUID(),result=await change(s,'edit',s.q,request);await cancel(result.replacementOrderId);const recovered=await lookup(s,request);assert.equal(recovered.state,'completed');assert.equal(recovered.replacementStatus,'cancelled');assert.equal(recovered.replacementOrderId,result.replacementOrderId);assert.equal(recovered.receipt,null);const before=await businessState();assert.deepEqual(await change(s,'edit',s.q,request),recovered);assert.deepEqual(await businessState(),before);});
 await check('recovering an absent attempt closes only that attempt and blocks late approval',async()=>{const s=await seed(),request=randomUUID(),before=await businessState(),closed=await lookup(s,request);assert.equal(closed.state,'closed');assert.equal(closed.receipt,null);assert.deepEqual(await lookup(s,request),closed);await reject(()=>change(s,'edit',s.q,request));assert.deepEqual(await businessState(),before);assert.equal((await change(s)).state,'completed');});

 for(const status of ['pending','uncertain'])for(const operation of ['edit','delete'])await check(status+' document reservation blocks '+operation,async()=>{const s=await seed(),doc=await archive(s),attempt=await reserve(s,doc);if(status==='uncertain')await finish(attempt,status);const before=await businessState();await reject(()=>change(s,operation,operation==='delete'?null:s.q));assert.deepEqual(await businessState(),before);await assertOriginal(s);});
 for(const status of ['accepted','rejected'])await check(status+' document delivery is preserved through an allowed revision',async()=>{const s=await seed(),doc=await archive(s),attempt=await reserve(s,doc);await finish(attempt,status);const before=await scalar('SELECT to_jsonb(d) FROM slim_order_document_deliveries d WHERE id=$1',[attempt]);await change(s);assert.deepEqual(await scalar('SELECT to_jsonb(d) FROM slim_order_document_deliveries d WHERE id=$1',[attempt]),before);});
 for(const operation of ['edit','delete'])await check('new document reservation after '+operation+' is rejected',async()=>{const s=await seed(),doc=await archive(s);await change(s,operation,operation==='delete'?null:s.q);await reject(()=>reserve(s,doc));assert.equal(await scalar('SELECT count(*)::int FROM slim_order_document_deliveries WHERE document_id=$1',[doc]),0);});
 await check('new archive of an altered origin is rejected and replacement archive is allowed',async()=>{const s=await seed(),result=await change(s);await reject(()=>archive(s));const replacement=await row(result.replacementOrderId),replacementSource={...s,order:result.replacementOrderId,snapshot:replacement.snapshot};assert(await archive(replacementSource));});
 await check('existing consent, author and connected-session guards still run after the barrier',async()=>{const s=await seed();await reject(()=>archive(s,{actor:operator}),'42501');await reject(()=>archive(s,{sha:'a'.repeat(64)}));const doc=await archive(s);await reject(()=>reserve(s,doc,{consent:'0'.repeat(64)}));await reject(()=>reserve(s,doc,{actor:operator}),'42501');await admin();await pg.query("UPDATE whatsapp_web_sessions SET status='desconectado' WHERE id=$1",[s.session]);await actor();await reject(()=>reserve(s,doc),'42501');});
 await check('barrier is ordered before the existing guards and requires no order UPDATE grant',async()=>{
  const triggers=(await pg.query("SELECT c.relname,t.tgname,p.proname,p.prosecdef FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE c.relname IN ('slim_order_documents','slim_order_document_deliveries') AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
  for(const table of ['slim_order_documents','slim_order_document_deliveries']){const list=triggers.filter(t=>t.relname===table);assert.equal(list[0].proname,'slim_guard_order_change_document');assert.equal(list[0].prosecdef,false);assert.equal(list[1].proname,'slim_guard_caller_document');}
  assert.equal(await scalar("SELECT has_any_column_privilege('authenticated','public.slim_orders','UPDATE')"),false);
 });
 await check('stale transaction snapshots are refused for changes, recovery and document inserts',async()=>{const s=await seed();await reject(()=>change(s),'25001');await reject(()=>lookup(s,randomUUID()),'25001');await reject(()=>archive(s),'25001');await assertOriginal(s);},'REPEATABLE READ');

 for(const [label,id] of [['viewer',viewer],['expired member',expired],['other company owner',outsider]])await check(label+' cannot read context, change or recover',async()=>{const s=await seed();await actor(id);await reject(()=>context(s.order),'42501');await reject(()=>change(s),'42501');await reject(()=>lookup(s,randomUUID()),'42501');await admin();await assertOriginal(s);});
 await check('authorized operator can revise and ledger remains workspace isolated',async()=>{const s=await seed();await actor(operator);const result=await change(s);assert.equal(result.state,'completed');assert.equal(await scalar('SELECT actor_id FROM slim_order_changes WHERE id=$1',[result.requestId]),operator);await actor(outsider);assert.equal(await count('slim_order_changes'),0);assert.equal(await count('slim_orders'),0);});
 await check('foreign source, product and customer are rejected atomically',async()=>{const s=await seed();await reject(()=>context(s.order,OTHER),'42501');await reject(()=>change(s,'edit',s.q,randomUUID(),{workspace:OTHER}),'42501');await admin();const foreignProduct=randomUUID(),foreignLead=randomUUID();await pg.query("INSERT INTO products(id,workspace_id,name,price,stock) VALUES($1,$2,'Foreign product',9.50,10)",[foreignProduct,OTHER]);await pg.query("INSERT INTO leads(id,workspace_id,name) VALUES($1,$2,'Foreign customer')",[foreignLead,OTHER]);await actor();await reject(()=>change(s,'edit',{...s.q,items:[{productId:foreignProduct,quantity:2,unitPriceCents:950}]}),'42501');await reject(()=>change(s,'edit',{...s.q,customer:{kind:'existing',id:foreignLead}}),'42501');await assertOriginal(s);});
 await check('public RPCs are invoker, anonymous execution and direct ledger writes denied',async()=>{
  const signatures=['public.slim_order_change_context(uuid,uuid)','public.slim_change_order(uuid,uuid,uuid,text,text,jsonb,text,boolean)','public.slim_lookup_order_change(uuid,uuid,uuid,text)'];
  for(const signature of signatures){assert.equal(await scalar('SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature]),false);assert.equal(await scalar("SELECT has_function_privilege('anon',$1,'EXECUTE')",[signature]),false);}
  for(const permission of ['INSERT','UPDATE','DELETE'])assert.equal(await scalar('SELECT has_table_privilege($1,$2,$3)',['authenticated','public.slim_order_changes',permission]),false);
  const s=await seed();await reject(()=>pg.query("INSERT INTO slim_order_changes(id,workspace_id,actor_id,order_id,operation,state) VALUES($1,$2,$3,$4,'delete','closed')",[randomUUID(),W,owner,s.order]),'42501');await actor('');await reject(()=>change(s),'42501');
 });
 await check('ledger rejects incomplete completed rows even for a database owner',async()=>{const s=await seed();await admin();await reject(()=>pg.query("INSERT INTO slim_order_changes(id,workspace_id,actor_id,order_id,operation,state) VALUES($1,$2,$3,$4,'delete','completed')",[randomUUID(),W,owner,s.order]),'23514');});

 assert.deepEqual(await businessState(),beforeBusiness);assert.equal(await count('slim_order_changes'),0);passed++;console.log('PASS current order changes PostgreSQL: every business scenario rolled back to the pre-migration synthetic baseline');
 console.log(`${passed}/${passed} current PostgreSQL order-change checks passed. Complete freight/document contracts; sequential barrier scenarios. Independent concurrent connections and authenticated browser E2E not tested. No production order changed or message sent.`);
}finally{await pg.close();}
