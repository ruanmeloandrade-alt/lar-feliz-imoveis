import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {normalizeCheckoutDelivery} from '../src/lib/slim-checkout-delivery.core.ts';
import {buildOrderReadModel,validateOrderSnapshot} from '../src/lib/slim-order-read.core.ts';

// Disposable PostgreSQL only. No credentials, network, Supabase calls or production writes.
// Only the delivery migration is applied. Blocked edit/delete migrations are excluded.
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const pg=new PGlite({extensions:{pgcrypto}});let passed=0;
const W='00000000-0000-4000-8000-000000000101',OTHER='00000000-0000-4000-8000-000000000102';
const owner='00000000-0000-4000-8000-000000000001',operator='00000000-0000-4000-8000-000000000002',viewer='00000000-0000-4000-8000-000000000003',expired='00000000-0000-4000-8000-000000000004',outsider='00000000-0000-4000-8000-000000000005';
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
const balance=id=>scalar('SELECT stock FROM public.products WHERE id=$1',[id]);
const count=t=>scalar(`SELECT count(*)::int FROM public.${t}`);
const row=id=>scalar('SELECT to_jsonb(o) FROM public.slim_orders o WHERE id=$1',[id]);
const confirm=(q,request=randomUUID(),workspace=W)=>scalar('SELECT public.slim_confirm_order($1,$2,$3)',[workspace,request,q]);
const cancel=id=>scalar("SELECT public.slim_cancel_order($1,$2,'Synthetic cancellation')",[W,id]);
async function actor(id=owner){await pg.exec('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function admin(){await pg.exec('RESET ROLE');}
async function reject(fn,code='22023'){
 await pg.exec('SAVEPOINT expected_rejection');let error;
 try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT expected_rejection');}
 await pg.exec('RELEASE SAVEPOINT expected_rejection');assert(error,'Expected operation to be rejected');assert.equal(error.code,code,error.message);
}
async function check(name,fn){await pg.exec('BEGIN');try{await fn();passed++;console.log('PASS delivery PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}}
function fulfillment(){return {mode:'delivery',recipient:'  Cliente sintético  ',phone:' +55 (11) 99999-0000 ',postalCode:' 01001-000 ',street:' Rua Sintética ',number:' 12 ',complement:'',neighborhood:' Centro ',city:' São Paulo ',state:' sp ',notes:' Portaria '};}
async function seed({price=950,stock=10,qty=2,discount=0,shipping=325,legacy=false,payment='pending'}={}){
 await admin();const product=randomUUID(),lead=randomUUID();
 await pg.query("INSERT INTO public.products(id,workspace_id,name,sku,description,price,stock) VALUES($1,$2,'Produto sintético','QA','',$3,$4)",[product,W,price/100,stock]);
 await pg.query("INSERT INTO public.leads(id,workspace_id,name,custom_data) VALUES($1,$2,'Cliente sintético','{\"address\":\"Original customer address\"}')",[lead,W]);
 const quote={workspaceId:W,customer:{kind:'existing',id:lead},items:[{productId:product,quantity:qty,unitPriceCents:price}],subtotalCents:qty*price,discountCents:discount,totalCents:qty*price-discount+(legacy?0:shipping),payment:{method:'pix',status:payment,installments:1},notes:'Original order note',...(legacy?{}:{fulfillment:fulfillment(),shippingCents:shipping})};
 await actor();return {product,lead,quote};
}
function snapshot(r){return validateOrderSnapshot({...r.snapshot,status:r.status,cancelledAt:r.cancelled_at,cancellationReason:r.cancellation_reason},W);}

try{
 await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
 await pg.exec('ALTER TABLE public.products ADD COLUMN promo_price numeric; CREATE TABLE public.slim_checkout_attempt_closures(workspace_id uuid,request_id uuid);');
 await pg.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0]);
 for(const table of ['workspaces','workspace_members','leads','products','lead_products','slim_orders','slim_stock_movements']){
  const column=table==='workspaces'?'id':'workspace_id';
  await pg.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.${table} TO authenticated; CREATE POLICY fixture_read ON public.${table} FOR SELECT TO authenticated USING(private.slim_workspace_access(${column}));`);
 }
 await pg.exec(read('scripts/fixtures/slim-confirm-order-live-contract.sql'));
 await pg.exec(read('scripts/fixtures/slim-legacy-cancel-contract.sql'));
 // Existing public invoker wrapper, installed only as part of this isolated fixture.
 await pg.exec("CREATE FUNCTION public.slim_confirm_order(_workspace_id uuid,_request_id uuid,_quote jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT private.slim_confirm_order(_workspace_id,_request_id,_quote)'; REVOKE ALL ON FUNCTION public.slim_confirm_order(uuid,uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.slim_confirm_order(uuid,uuid,jsonb) TO authenticated;");
 await pg.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])',[[owner,operator,viewer,expired,outsider]]);
 await pg.query("INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,'Synthetic workspace'),($3,$4,'Other workspace')",[W,owner,OTHER,outsider]);
 await pg.query("INSERT INTO workspace_members(workspace_id,user_id,role_type,access_expires_at) VALUES($1,$2,'funcionario',NULL),($1,$3,'visualizador',NULL),($1,$4,'funcionario',now()-interval '1 day')",[W,operator,viewer,expired]);
 const functionState=()=>scalar("SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'body',p.prosrc,'definer',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname='slim_confirm_order') OR p.proname='slim_cancel_order'");
 const previousFunctions=await functionState();
 await pg.exec('BEGIN');const legacy=await seed({legacy:true});const legacyReceipt=await confirm(legacy.quote);await admin();const legacyBefore=await row(legacyReceipt.orderId);await pg.exec('COMMIT');
 const migration=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('_slim_checkout_delivery_freight.sql'));assert.equal(migration.length,1);
 await pg.exec('BEGIN');await pg.exec(read('supabase/migrations/'+migration[0]));await pg.exec('COMMIT');
 const legacyAfter=await row(legacyReceipt.orderId);assert.equal(legacyAfter.shipping_cents,0);delete legacyAfter.shipping_cents;
 assert.deepEqual(legacyAfter,legacyBefore);assert.equal(await balance(legacy.product),8);passed++;console.log('PASS delivery PostgreSQL: existing order, request payload, snapshot and stock unchanged by migration');
 assert.deepEqual(await functionState(),previousFunctions);passed++;console.log('PASS delivery PostgreSQL: cancellation and public wrapper bodies, privileges and invoker unchanged');

 await check('legacy retry returns same order after migration',async()=>{await actor();assert.deepEqual(await confirm(legacy.quote,legacyReceipt.requestId),legacyReceipt);assert.equal(await count('slim_orders'),1);assert.equal(await balance(legacy.product),8);});
 await check('new legacy caller stays without inferred delivery data',async()=>{const s=await seed({legacy:true});const r=await row((await confirm(s.quote)).orderId);assert.equal(r.shipping_cents,0);assert(!Object.hasOwn(r.snapshot,'fulfillment'));assert(!Object.hasOwn(r.snapshot,'shippingCents'));snapshot(r);});
 await check('delivery stores canonical address, cents and one stock movement',async()=>{const s=await seed({discount:101,shipping:327});const receipt=await confirm(s.quote),r=await row(receipt.orderId);assert.equal(receipt.totalCents,2126);assert.equal(r.shipping_cents,327);assert.equal(r.snapshot.shippingCents,327);assert.deepEqual(r.snapshot.fulfillment,normalizeCheckoutDelivery(s.quote.fulfillment,327).fulfillment);assert.equal(await balance(s.product),8);assert.equal(await scalar('SELECT count(*)::int FROM slim_stock_movements WHERE order_id=$1',[receipt.orderId]),1);assert.equal(r.snapshot.items[0].discountCents,101);assert.equal(r.snapshot.items[0].totalCents,1799);snapshot(r);});
 await check('delivery does not overwrite existing customer address',async()=>{const s=await seed();const before=await scalar('SELECT to_jsonb(l) FROM leads l WHERE id=$1',[s.lead]);await confirm(s.quote);assert.deepEqual(await scalar('SELECT to_jsonb(l) FROM leads l WHERE id=$1',[s.lead]),before);});
 await check('pickup records no address and zero freight',async()=>{const s=await seed({shipping:0});s.quote.fulfillment={mode:'pickup'};const r=await row((await confirm(s.quote)).orderId);assert.deepEqual(r.snapshot.fulfillment,{mode:'pickup'});assert.equal(r.snapshot.shippingCents,0);assert.equal(r.total_cents,1900);});
 await check('free delivery remains explicit delivery',async()=>{const s=await seed({shipping:0});const r=await row((await confirm(s.quote)).orderId);assert.equal(r.snapshot.fulfillment.mode,'delivery');assert.equal(r.total_cents,1900);});
 await check('one-cent product and one-cent freight are preserved',async()=>{const s=await seed({price:1,qty:1,shipping:1});const r=await row((await confirm(s.quote)).orderId);assert.equal(r.subtotal_cents,1);assert.equal(r.shipping_cents,1);assert.equal(r.total_cents,2);});
 await check('full product discount leaves freight payable',async()=>{const s=await seed({discount:1900,shipping:327});const r=await row((await confirm(s.quote)).orderId);assert.equal(r.total_cents,327);assert.equal(r.snapshot.items[0].totalCents,0);assert.equal(r.snapshot.items[0].discountCents,1900);});
 await check('zero-price item accepts freight without allocating it to item',async()=>{const s=await seed({price:0,qty:1,shipping:1});const r=await row((await confirm(s.quote)).orderId);assert.equal(r.total_cents,1);assert.equal(r.snapshot.items[0].totalCents,0);});
 await check('maximum total is exact',async()=>{const s=await seed({price:0,qty:1,shipping:99999999999999});const r=await row((await confirm(s.quote)).orderId);assert.equal(r.total_cents,99999999999999);snapshot(r);});
 await check('largest remainder discount excludes freight',async()=>{const s=await seed({price:101,qty:1,discount:1,shipping:7});await admin();const second=randomUUID();await pg.query("INSERT INTO products(id,workspace_id,name,price,stock) VALUES($1,$2,'Second item',1.01,10)",[second,W]);s.quote.items.push({productId:second,quantity:1,unitPriceCents:101});s.quote.subtotalCents=202;s.quote.totalCents=208;await actor();const r=await row((await confirm(s.quote)).orderId);assert.deepEqual(r.snapshot.items.map(i=>i.discountCents),[1,0]);assert.equal(r.snapshot.items.reduce((n,i)=>n+i.totalCents,0),201);assert.equal(r.total_cents,208);});
 await check('same request reuses order with no additional debit',async()=>{const s=await seed(),id=randomUUID();const first=await confirm(s.quote,id);assert.deepEqual(await confirm(s.quote,id),first);assert.equal(await balance(s.product),8);assert.equal(await scalar('SELECT count(*)::int FROM slim_stock_movements WHERE order_id=$1',[first.orderId]),1);});
 await check('same request with changed freight is rejected',async()=>{const s=await seed(),id=randomUUID();await confirm(s.quote,id);await reject(()=>confirm({...s.quote,shippingCents:326,totalCents:2226},id));assert.equal(await balance(s.product),8);});
 await check('same request with changed address is rejected',async()=>{const s=await seed(),id=randomUUID();await confirm(s.quote,id);await reject(()=>confirm({...s.quote,fulfillment:{...s.quote.fulfillment,number:'13'}},id));assert.equal(await balance(s.product),8);});
 await check('another operator cannot reuse request',async()=>{const s=await seed(),id=randomUUID();await confirm(s.quote,id);await actor(operator);await reject(()=>confirm(s.quote,id));assert.equal(await balance(s.product),8);});
 await check('closed attempt blocks late confirmation',async()=>{const s=await seed(),id=randomUUID();await admin();await pg.query('INSERT INTO slim_checkout_attempt_closures(workspace_id,request_id) VALUES($1,$2)',[W,id]);await actor();await reject(()=>confirm(s.quote,id));assert.equal(await balance(s.product),10);assert.equal(await count('slim_orders'),1);});

 const invalidQuotes=[
  ['missing freight',q=>{delete q.shippingCents;}],['missing fulfillment',q=>{delete q.fulfillment;}],
  ['null freight',q=>{q.shippingCents=null;}],['string freight',q=>{q.shippingCents='325';}],
  ['fractional freight',q=>{q.shippingCents=3.25;}],['negative freight',q=>{q.shippingCents=-1;}],
  ['over-limit freight',q=>{q.shippingCents=100000000000000;}],['null fulfillment',q=>{q.fulfillment=null;}],
  ['unknown mode',q=>{q.fulfillment.mode='other';}],['pickup with freight',q=>{q.fulfillment={mode:'pickup'};}],
  ['pickup with address',q=>{q.fulfillment={mode:'pickup',street:'Street'};q.shippingCents=0;q.totalCents=1900;}],
  ['unknown address field',q=>{q.fulfillment.unrecognized='x';}],['missing optional-content field',q=>{delete q.fulfillment.complement;}],
  ['wrong address type',q=>{q.fulfillment.number=12;}],['empty recipient',q=>{q.fulfillment.recipient=' ';}],
  ['empty street',q=>{q.fulfillment.street='';}],['incomplete CEP',q=>{q.fulfillment.postalCode='12345';}],
  ['malformed CEP',q=>{q.fulfillment.postalCode='0100-1000';}],['invalid UF',q=>{q.fulfillment.state='ZZ';}],
  ['short phone',q=>{q.fulfillment.phone='123';}],['long phone',q=>{q.fulfillment.phone='1'.repeat(16);}],
  ['invalid phone characters',q=>{q.fulfillment.phone='5511999990000x';}],
  ['newline at field edge',q=>{q.fulfillment.street='Rua\n';}],['C1 control',q=>{q.fulfillment.notes='Portaria\u0085';}],
  ['UTF16 recipient limit',q=>{q.fulfillment.recipient='😀'.repeat(81);}],['oversized note',q=>{q.fulfillment.notes='x'.repeat(501);}],
 ];
 for(const [label,change] of invalidQuotes)await check(label+' rejected without order or stock change',async()=>{const s=await seed();change(s.quote);assert.throws(()=>normalizeCheckoutDelivery(s.quote.fulfillment,s.quote.shippingCents));await reject(()=>confirm(s.quote));assert.equal(await balance(s.product),10);assert.equal(await count('slim_orders'),1);assert.equal(await count('slim_stock_movements'),1);});
 for(const [label,change] of [
  ['total above limit',q=>{q.shippingCents=99999999999999;q.totalCents=q.subtotalCents+q.shippingCents;}],
  ['discount larger than products',q=>{q.discountCents=2000;q.totalCents=225;}],
  ['total omits freight',q=>{q.totalCents=1900;}],['stale price',q=>{q.items[0].unitPriceCents=949;}],
  ['insufficient stock',q=>{q.items[0].quantity=11;q.subtotalCents=10450;q.totalCents=10775;}],
 ])await check(label+' rejected atomically',async()=>{const s=await seed();change(s.quote);await reject(()=>confirm(s.quote));assert.equal(await balance(s.product),10);assert.equal(await count('slim_orders'),1);});
 await check('ECMAScript whitespace and non-BMP boundary match TypeScript',async()=>{const s=await seed();s.quote.fulfillment.recipient='\uFEFF'+'😀'.repeat(80)+'\u3000';s.quote.fulfillment.street='\u00a0Rua\u2000';const r=await row((await confirm(s.quote)).orderId);assert.deepEqual(r.snapshot.fulfillment,normalizeCheckoutDelivery(s.quote.fulfillment,s.quote.shippingCents).fulfillment);});
 await check('new customer creation remains transactional with delivery',async()=>{const s=await seed();s.quote.customer={kind:'new',name:'New synthetic customer',email:'qa@example.invalid',phone:'5511999991111'};const r=await row((await confirm(s.quote)).orderId);assert.equal(r.snapshot.customer.name,'New synthetic customer');assert.equal(r.snapshot.fulfillment.street,'Rua Sintética');assert.equal(await count('leads'),3);});
 await check('invalid delivery does not create a new customer',async()=>{const s=await seed();s.quote.customer={kind:'new',name:'Rejected synthetic customer',email:'qa@example.invalid',phone:'5511999991111'};s.quote.fulfillment.city='';await reject(()=>confirm(s.quote));assert.equal(await count('leads'),2);});
 await check('cancel twice reverses products once and preserves freight and snapshot',async()=>{const s=await seed(),receipt=await confirm(s.quote),before=await row(receipt.orderId);await cancel(receipt.orderId);await cancel(receipt.orderId);const after=await row(receipt.orderId);assert.equal(after.status,'cancelled');assert.equal(after.shipping_cents,325);assert.equal(after.total_cents,2225);assert.deepEqual(after.snapshot,before.snapshot);assert.equal(await balance(s.product),10);assert.equal(await scalar('SELECT count(*)::int FROM slim_stock_movements WHERE order_id=$1',[receipt.orderId]),2);assert.equal((await confirm(s.quote,receipt.requestId)).status,'cancelled');});
 await check('financial metrics include freight and units exclude it',async()=>{const p=await seed({shipping:325,payment:'paid'}),pr=await row((await confirm(p.quote)).orderId);const n=await seed({shipping:125}),nr=await row((await confirm(n.quote)).orderId);const c=await seed({shipping:25}),cr=await confirm(c.quote);await cancel(cr.orderId);const model=buildOrderReadModel({workspaceId:W,complete:true,orders:[snapshot(pr),snapshot(nr),snapshot(await row(cr.orderId))]},W);assert.equal(model.totals.totalCents,4250);assert.equal(model.totals.receivedDeclaredCents,2225);assert.equal(model.totals.pendingPaymentCents,2025);assert.equal(model.totals.cancelledTotalCents,1925);assert.equal(model.totals.shippingCents,450);assert.equal(model.totals.units,4);});
 for(const [label,id] of [['viewer',viewer],['expired member',expired],['other workspace owner',outsider]])await check(label+' denied without side effects',async()=>{const s=await seed();await actor(id);await reject(()=>confirm(s.quote),'42501');await admin();assert.equal(await balance(s.product),10);assert.equal(await count('slim_orders'),1);});
 await check('operator may confirm and other workspace cannot read',async()=>{const s=await seed();await actor(operator);const r=await confirm(s.quote);assert.equal(r.totalCents,2225);await actor(outsider);assert.equal(await count('slim_orders'),0);assert.equal(await count('slim_stock_movements'),0);});
 await check('unauthenticated identity denied',async()=>{const s=await seed();await actor('');await reject(()=>confirm(s.quote),'42501');});
 await check('foreign product and customer denied',async()=>{const s=await seed();await admin();const product=randomUUID(),lead=randomUUID();await pg.query("INSERT INTO products(id,workspace_id,name,price,stock) VALUES($1,$2,'Other product',9.50,10)",[product,OTHER]);await pg.query("INSERT INTO leads(id,workspace_id,name) VALUES($1,$2,'Other customer')",[lead,OTHER]);await actor();await reject(()=>confirm({...s.quote,items:[{productId:product,quantity:2,unitPriceCents:950}]}),'42501');await reject(()=>confirm({...s.quote,customer:{kind:'existing',id:lead}}),'42501');assert.equal(await balance(s.product),10);});
 await check('new column readable but direct order and stock writes denied',async()=>{assert.equal(await scalar("SELECT has_column_privilege('authenticated','public.slim_orders','shipping_cents','SELECT')"),true);for(const permission of ['INSERT','UPDATE'])assert.equal(await scalar(`SELECT has_column_privilege('authenticated','public.slim_orders','shipping_cents','${permission}')`),false);for(const table of ['slim_orders','slim_stock_movements'])for(const permission of ['INSERT','UPDATE','DELETE'])assert.equal(await scalar(`SELECT has_table_privilege('authenticated','public.${table}','${permission}')`),false);assert.equal(await scalar("SELECT has_function_privilege('anon','public.slim_confirm_order(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','private.slim_confirm_order(uuid,uuid,jsonb)','EXECUTE')"),false);});
 await check('column constraint independently rejects inconsistent freight total',async()=>{const s=await seed(),r=await confirm(s.quote);await admin();await reject(()=>pg.query('UPDATE slim_orders SET shipping_cents=326 WHERE id=$1',[r.orderId]),'23514');await reject(()=>pg.query('UPDATE slim_orders SET shipping_cents=-1,total_cents=1899 WHERE id=$1',[r.orderId]),'23514');});
 assert.equal(await count('slim_orders'),1);assert.equal(await count('slim_stock_movements'),1);assert.equal(await count('leads'),1);assert.equal(await count('products'),1);passed++;console.log('PASS delivery PostgreSQL: every synthetic business scenario rolled back');
 console.log(`${passed}/${passed} isolated PostgreSQL delivery checks passed. No production writes, blocked migrations or external sends. Independent concurrent connections and authenticated browser E2E not tested.`);
}finally{await pg.close();}
