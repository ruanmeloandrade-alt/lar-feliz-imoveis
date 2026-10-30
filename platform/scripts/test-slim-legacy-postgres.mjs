import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {validateOrderSnapshot} from '../src/lib/slim-order-read.core.ts';
// No URL, credentials, Supabase client, network connection, production data or external effects.
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const pg=new PGlite({extensions:{pgcrypto}});let passed=0;
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
const W='00000000-0000-4000-8000-000000000101',OTHER='00000000-0000-4000-8000-000000000102';
const owner='00000000-0000-4000-8000-000000000001',operator='00000000-0000-4000-8000-000000000002',viewer='00000000-0000-4000-8000-000000000003',expired='00000000-0000-4000-8000-000000000004',outsider='00000000-0000-4000-8000-000000000005';
const pay={method:'pix',status:'pending',installments:1};
async function actor(id=owner){await pg.exec('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function admin(){await pg.exec('RESET ROLE');}
async function reject(fn,code='22023'){
 await pg.exec('SAVEPOINT expected_rejection');let caught;
 try{await fn();}catch(e){caught=e;await pg.exec('ROLLBACK TO SAVEPOINT expected_rejection');}
 await pg.exec('RELEASE SAVEPOINT expected_rejection');assert(caught,'Expected operation to be rejected');assert.equal(caught.code,code,caught.message);
}
async function check(name,fn){await pg.exec('BEGIN');try{await fn();passed++;console.log('PASS isolated PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}}
async function seed(options={}){
 const product=randomUUID(),lead=randomUUID(),qty=options.qty??3,price=options.price??'19.99',stock=options.stock??10;
 await pg.query('INSERT INTO public.products(id,workspace_id,name,sku,price,stock) VALUES($1,$2,$3,$4,$5,$6)',[product,W,'Synthetic product','QA',price,stock]);
 await pg.query("INSERT INTO public.leads(id,workspace_id,name,email,phone,source,value,status,created_at) VALUES($1,$2,'Synthetic customer','qa@example.invalid','','pedido_saude_slim',$3,$4,now()-interval '2 days')",[lead,W,options.total??Number(price)*Number(qty),options.status??'active']);
 if(!options.noItems)await pg.query("INSERT INTO public.lead_products(workspace_id,lead_id,product_id,quantity,unit_price,sold_at) VALUES($1,$2,$3,$4,$5,now()-interval '1 day')",[W,lead,product,qty,price]);
 return {lead,product};
}
const review=async()=>scalar('SELECT public.slim_review_legacy_sales($1)',[W]);
const source=async lead=>(await review()).find(r=>r.source.leadId===lead);
const approve=(row,stockMode='apply_missing',payment=pay,approved=true,workspace=W)=>scalar('SELECT public.slim_reconcile_legacy_sale($1,$2,$3,$4,$5,$6)',[workspace,row.source.leadId,row.fingerprint,stockMode,payment,approved]);
const balance=product=>scalar('SELECT stock FROM public.products WHERE id=$1',[product]);
const count=table=>scalar(`SELECT count(*)::int FROM public.${table}`);
try{
 await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
 const access=read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0];
 assert(access.includes('private.slim_workspace_access'));await pg.exec(access);
 for(const table of ['workspaces','workspace_members','leads','products','lead_products','slim_orders','slim_stock_movements']){
  await pg.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.${table} TO authenticated;`);
  const field=table==='workspaces'?'id':'workspace_id';await pg.exec(`CREATE POLICY fixture_read ON public.${table} FOR SELECT TO authenticated USING(private.slim_workspace_access(${field}));`);
 }
 for(const file of ['20261015235236_slim_reviewed_legacy_sales_reconciliation.sql','20261015235330_slim_legacy_integral_numeric_quantity.sql','20261015235409_slim_legacy_snapshot_column_qualification.sql'])await pg.exec(read('supabase/migrations/'+file));
 await pg.exec(read('scripts/fixtures/slim-legacy-cancel-contract.sql'));
 const expected={
  'private.slim_legacy_sale_source':'6e4506f4e89bd69035d80a44cc91a072d43375a5c34e49a53d1eb846b99aa98e',
  'public.slim_review_legacy_sales':'ebdcb550c2295228df992cc3d29d38ce76eecb778f99c98bda67fdf1caa206ac',
  'private.slim_reconcile_legacy_sale':'61916d0ef2b90026f97829ef7cb9267783d1c569458712cf884aaf2987929a22',
  'public.slim_reconcile_legacy_sale':'6da1a6ac7b347539f8afe2b2281daeac1d5fc7a6735afe03e71d429cdc948e7f',
 };
 for(const [name,hash] of Object.entries(expected))await check('exact SQL body parity '+name,async()=>{
  const r=(await pg.query("SELECT encode(extensions.digest(p.prosrc,'sha256'),'hex') AS hash,p.prosecdef AS definer,p.proconfig AS config FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=$1",[name])).rows[0];
  assert.equal(r.hash,hash);assert.equal(r.definer,name==='private.slim_reconcile_legacy_sale');assert(r.config.some(c=>c.startsWith('search_path=')));
 });
 await pg.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])',[[owner,operator,viewer,expired,outsider]]);
 await pg.query('INSERT INTO public.workspaces(id,owner_id,name) VALUES($1,$2,$3),($4,$5,$6)',[W,owner,'Synthetic workspace',OTHER,outsider,'Other synthetic workspace']);
 await pg.query("INSERT INTO public.workspace_members(workspace_id,user_id,role_type,access_expires_at) VALUES($1,$2,'funcionario',NULL),($1,$3,'visualizador',NULL),($1,$4,'funcionario',now()-interval '1 day')",[W,operator,viewer,expired]);
 await check('numeric 3.000, 59.97, stock 10 to 7 and valid snapshot',async()=>{const s=await seed();await actor();const r=await approve(await source(s.lead));assert.equal(await balance(s.product),7);const o=(await pg.query('SELECT * FROM public.slim_orders WHERE id=$1',[r.orderId])).rows[0];assert.equal(Number(o.total_cents),5997);const v=validateOrderSnapshot(o.snapshot,W);assert.equal(v.items[0].quantity,3);assert.equal(v.customer.id,s.lead);assert.equal(v.payment.status,'pending');assert.equal(await count('slim_stock_movements'),1);});
 await check('same origin twice creates one order and one stock debit',async()=>{const s=await seed();await actor();const row=await source(s.lead);const a=await approve(row),b=await approve(row);assert.equal(a.orderId,b.orderId);assert.equal(b.reused,true);assert.equal(await count('slim_orders'),1);assert.equal(await balance(s.product),7);});
 await check('already-accounted does not debit again, cancellation restores once',async()=>{const s=await seed({stock:7});await actor();const r=await approve(await source(s.lead),'already_accounted');assert.equal(await balance(s.product),7);await pg.query('SELECT public.slim_cancel_order($1,$2,$3)',[W,r.orderId,'Synthetic cancellation']);await pg.query('SELECT public.slim_cancel_order($1,$2,$3)',[W,r.orderId,'Repeated request']);assert.equal(await balance(s.product),10);assert.equal(await count('slim_stock_movements'),2);});
 await check('missing stock debit cancellation is idempotent',async()=>{const s=await seed();await actor();const row=await source(s.lead),r=await approve(row);await pg.query('SELECT public.slim_cancel_order($1,$2,$3)',[W,r.orderId,'Synthetic cancellation']);const again=await approve(row);assert.equal(again.status,'cancelled');assert.equal(again.orderId,r.orderId);assert.equal(await balance(s.product),10);});
 await check('separate purchases with the same name remain distinct',async()=>{const a=await seed(),b=await seed({price:'0.01',qty:1});await actor();const ra=await approve(await source(a.lead)),rb=await approve(await source(b.lead));assert.notEqual(ra.orderId,rb.orderId);assert.equal(await count('slim_orders'),2);assert.equal(await count('leads'),2);});
 await check('one cent is preserved',async()=>{const s=await seed({price:'0.01',qty:1});await actor();const r=await approve(await source(s.lead));assert.equal(Number(await scalar('SELECT total_cents FROM public.slim_orders WHERE id=$1',[r.orderId])),1);});
 await check('legitimate zero is preserved',async()=>{const s=await seed({price:'0.00',qty:1});await actor();const r=await approve(await source(s.lead));assert.equal(Number(await scalar('SELECT total_cents FROM public.slim_orders WHERE id=$1',[r.orderId])),0);});
 for(const [name,options] of [['fractional quantity',{qty:1.5}],['missing items',{noItems:true,total:101}],['insufficient stock',{stock:2}],['mismatched historical total',{total:99}],['archived origin',{status:'archived'}]])await check(name+' rejected atomically',async()=>{const s=await seed(options);await actor();await reject(()=>approveRow(s.lead));assert.equal(await count('slim_orders'),0);assert.equal(await count('slim_stock_movements'),0);assert.equal(await balance(s.product),options.stock??10);});
 async function approveRow(lead){return approve(await source(lead));}
 await check('stale fingerprint protects changed stock',async()=>{const s=await seed();await actor();const row=await source(s.lead);await admin();await pg.query('UPDATE public.products SET stock=9 WHERE id=$1',[s.product]);await actor();await reject(()=>approve(row));assert.equal(await balance(s.product),9);assert.equal(await count('slim_orders'),0);});
 await check('invalid installment does not mutate',async()=>{const s=await seed();await actor();const row=await source(s.lead);await reject(()=>approve(row,'apply_missing',{...pay,installments:2}));assert.equal(await count('slim_orders'),0);});
 await check('missing explicit approval denied',async()=>{const s=await seed();await actor();const row=await source(s.lead);await reject(()=>approve(row,'apply_missing',pay,false),'42501');assert.equal(await balance(s.product),10);});
 for(const [name,id] of [['viewer',viewer],['expired member',expired],['other workspace owner',outsider]])await check(name+' cannot reconcile',async()=>{const s=await seed();await actor();const row=await source(s.lead);await actor(id);await reject(()=>approve(row),'42501');await admin();assert.equal(await balance(s.product),10);assert.equal(await count('slim_orders'),0);});
 await check('authorized operator can reconcile',async()=>{const s=await seed();await actor(operator);await approve(await source(s.lead));assert.equal(await balance(s.product),7);});
 await check('wrong workspace cannot use a valid origin',async()=>{const s=await seed();await actor();const row=await source(s.lead);await reject(()=>approve(row,'apply_missing',pay,true,OTHER),'42501');});
 await check('RLS hides ledger and origins from unrelated user',async()=>{const s=await seed();await actor();await approve(await source(s.lead));await actor(outsider);assert.equal(await count('slim_orders'),0);assert.equal(await count('slim_stock_movements'),0);await reject(()=>review(),'42501');});
 await check('anonymous cannot execute the financial function',async()=>{assert.equal(await scalar("SELECT has_function_privilege('anon','public.slim_reconcile_legacy_sale(uuid,uuid,text,text,jsonb,boolean)','EXECUTE')"),false);});
 await check('operator cannot directly write ledger or stock log',async()=>{assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.slim_orders','INSERT')"),false);assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.slim_stock_movements','INSERT')"),false);});
 await check('snapshot survives catalog edits and cancellation',async()=>{const s=await seed();await actor();const r=await approve(await source(s.lead));const before=await scalar('SELECT snapshot FROM public.slim_orders WHERE id=$1',[r.orderId]);await admin();await pg.query("UPDATE public.products SET name='Changed after sale',price=99 WHERE id=$1",[s.product]);await actor();await pg.query('SELECT public.slim_cancel_order($1,$2,$3)',[W,r.orderId,'Synthetic cancellation']);assert.deepEqual(await scalar('SELECT snapshot FROM public.slim_orders WHERE id=$1',[r.orderId]),before);});
 await check('all business fixtures rolled back',async()=>{assert.equal(await count('slim_orders'),0);assert.equal(await count('products'),0);assert.equal(await count('leads'),0);assert.equal(await count('slim_stock_movements'),0);});
 console.log(`${passed}/${passed} isolated PostgreSQL acceptance checks passed. Exact legacy SQL bodies verified against read-only production fingerprints. No Supabase connection, production mutation or WhatsApp send. Multi-connection concurrency and browser E2E NOT tested.`);
}finally{await pg.close();}
