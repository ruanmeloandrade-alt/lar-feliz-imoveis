import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {contactPhoneKey} from '../src/lib/slim-contact-identity.core.ts';
import {W,OTHER,owner,operator,outsider,historical,alias,nullAlias,historicalPhone,product,
 actorSql,createSql,confirmSql,directSql,quote,setupSql,guardMigration,businessStateSql,dependencyStateSql,permissionStateSql,literal} from './fixtures/slim-contact-guard-setup.mjs';

// Portable SQL gate: genuine PostgreSQL semantics in an isolated PGlite instance.
// Independent-client concurrency is a separate mandatory pre-release command;
// this file never claims that sequential execution validates concurrent writers.
const pg=new PGlite({extensions:{pgcrypto}});
let passed=0;
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
const state=()=>scalar(businessStateSql);
const admin=()=>pg.exec('RESET ROLE');
const actor=(id=owner)=>pg.exec(actorSql(id));
const count=table=>scalar(`SELECT count(*)::int FROM public.${table}`);
async function rejected(fn,code='23505',marker=code==='23505'){
 await pg.exec('SAVEPOINT expected_rejection');let error;
 try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT expected_rejection');}
 await pg.exec('RELEASE SAVEPOINT expected_rejection');assert(error,'Expected rejected write');assert.equal(error.code,code,error.message);
 if(marker){assert.equal(error.message,'Telefone já cadastrado. Selecione o cliente existente.');assert.equal(error.detail,'slim_leads_contact_phone_guard');assert.equal(error.constraint,'slim_leads_contact_phone_guard');}
 return error;
}
async function check(name,fn,isolation='READ COMMITTED'){
 await pg.exec(`BEGIN ISOLATION LEVEL ${isolation}`);
 try{await fn();passed++;console.log('PASS contact guard PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}
}
async function insert(phone,patch={}){const id=randomUUID();await pg.exec(directSql(phone,id,patch));return id;}
try{
 await pg.exec(setupSql());
 const before=await state(),dependencies=await scalar(dependencyStateSql),permissions=await scalar(permissionStateSql);
 await pg.exec('BEGIN');await pg.exec(guardMigration());await pg.exec('COMMIT');
 assert.deepEqual(await state(),before);assert.deepEqual(await scalar(dependencyStateSql),dependencies);assert.deepEqual(await scalar(permissionStateSql),permissions);
 passed++;console.log('PASS contact guard PostgreSQL: installation preserves aliases, original order/freight/stock/links, all existing functions and RLS/grants');

 await check('private trigger has full collision visibility and no application execution grant',async()=>{
  const fn=(await pg.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='private.slim_leads_contact_phone_guard()'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef,true);assert.equal(fn.provolatile,'v');
  for(const setting of ['search_path=""','row_security=off','lock_timeout=5s'])assert(fn.proconfig.includes(setting));
  for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar("SELECT has_function_privilege($1,'private.slim_leads_contact_phone_guard()','EXECUTE')",[role]),false);
  const trigger=await scalar("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='slim_leads_contact_phone_guard'");
  assert.match(trigger,/AFTER INSERT OR UPDATE ON public\.leads FOR EACH ROW/);
  await actor();await rejected(()=>pg.exec('SELECT private.slim_leads_contact_phone_guard()'),'42501',false);
 });
 await check('normalizer contract preflight rejects changed semantics before installing anything',async()=>{
  await pg.exec("CREATE OR REPLACE FUNCTION private.slim_funnel_contact_phone_key(_phone text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $$BEGIN RETURN _phone; END;$$");
  const error=await rejected(()=>pg.exec(guardMigration()),'P0001',false);assert.match(error.message,/contrato de telefone/);
 });
 await check('equivalent complete phones reject with stable public error and no contact identifiers',async()=>{
  for(const phone of ['+55 (11) 90000-0001','55.11.90000.0001','\u00a0+55\u2000(11)\u202f90000-0001\ufeff']){
   assert.equal(contactPhoneKey(phone),historicalPhone);const error=await rejected(()=>insert(phone));
   assert(!JSON.stringify({message:error.message,detail:error.detail}).includes(historical));
  }
  assert.deepEqual(await state(),before);
 });
 await check('NULL status occupies a phone identity and cannot be bypassed by a new NULL status row',async()=>{
  const phone='5511900000010';await insert(phone,{status:null});await rejected(()=>insert('+55 (11) 90000-0010',{status:null}));
 });
 await check('nonphones, group JIDs, channel IDs and phone_normalized alone do not become phone identities',async()=>{
  for(const phone of [null,'','  ','5511900000001@g.us','5511900000001@s.whatsapp.net','5511900000001@lid','instagram:5511900000001','1234567','1234567890123456']){
   assert.equal(contactPhoneKey(phone),null);await insert(phone,{source:'whatsapp_group'});await insert(phone,{source:'instagram-dm'});
  }
  const id=await insert(null,{source:'messenger',custom:{channel:'messenger',psid_or_igsid:historicalPhone}});
  await pg.query('UPDATE public.leads SET phone_normalized=$1 WHERE id=$2',[historicalPhone,id]);
 });
 await check('a real phone remains protected regardless of marketing source or channel label',async()=>{
  for(const source of ['instagram-dm','messenger','facebook','whatsapp_group','erp_checkout'])await rejected(()=>insert(historicalPhone,{source}));
 });
 await check('full phone keys preserve DDI and do not infer a missing DDI',async()=>{
  await insert('+1 (11) 90000-0001');await insert('11 90000-0001');
  assert.equal(await count('leads'),before.leads.length+2);
 });
 await check('inactive and linked aliases do not occupy new eligible identities',async()=>{
  for(const status of ['deleted','archived','merged']){const phone='5511'+String(9100000+['deleted','archived','merged'].indexOf(status));await insert(phone,{status});await insert(phone);}
  const phone='5511900000019';await pg.query("INSERT INTO public.leads(workspace_id,name,phone,merged_into_id) VALUES($1,'Linked alias',$2,$3)",[W,phone,historical]);await insert(phone);
 });
 await check('historical aliases allow ordinary edits, equivalent punctuation and NULL-to-active without relinking',async()=>{
  await actor(operator);
  await pg.query("UPDATE public.leads SET name='Reviewed alias',phone='+55 (11) 90000-0001',source='reviewed',value=12.34 WHERE id=ANY($1::uuid[])",[[alias,nullAlias]]);
  await pg.query("UPDATE public.leads SET status='active' WHERE id=$1",[nullAlias]);await admin();
  assert.equal(await count('leads'),before.leads.length);assert.equal(await scalar('SELECT lead_id FROM public.lead_products LIMIT 1'),alias);
  assert.deepEqual(await scalar('SELECT snapshot FROM public.slim_orders LIMIT 1'),before.orders[0].snapshot);
  assert.equal(await scalar('SELECT merged_into_id FROM public.leads WHERE id=$1',[alias]),null);
 });
 await check('changing an eligible phone rejects atomically and preserves its previous fields',async()=>{
  const id=await insert('5511900000020'),old=await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1',[id]);
  await rejected(()=>pg.query("UPDATE public.leads SET phone=$1,name='Must roll back' WHERE id=$2",[historicalPhone,id]));
  assert.deepEqual(await scalar('SELECT to_jsonb(l) FROM public.leads l WHERE id=$1',[id]),old);
 });
 for(const status of ['deleted','archived','merged'])await check('reactivating a '+status+' alias revalidates its phone',async()=>{
  const id=await insert(historicalPhone,{status});await rejected(()=>pg.query("UPDATE public.leads SET status='active' WHERE id=$1",[id]));assert.equal(await scalar('SELECT status FROM public.leads WHERE id=$1',[id]),status);
 });
 await check('clearing merged_into_id revalidates without rewriting an old alias',async()=>{
  const id=randomUUID();await pg.query("INSERT INTO public.leads(id,workspace_id,name,phone,merged_into_id) VALUES($1,$2,'Linked alias',$3,$4)",[id,W,historicalPhone,historical]);
  await rejected(()=>pg.query('UPDATE public.leads SET merged_into_id=NULL WHERE id=$1',[id]));assert.equal(await scalar('SELECT merged_into_id FROM public.leads WHERE id=$1',[id]),historical);
 });
 await check('only entering Slim is guarded; another workspace retains its existing behavior',async()=>{
  const id=await insert(historicalPhone,{workspace:OTHER});await insert(historicalPhone,{workspace:OTHER});
  await rejected(()=>pg.query('UPDATE public.leads SET workspace_id=$1 WHERE id=$2',[W,id]));assert.equal(await scalar('SELECT workspace_id FROM public.leads WHERE id=$1',[id]),OTHER);
 });
 await check('RLS-hidden duplicates still reject while caller read and write boundaries remain enforced',async()=>{
  const phone='5511900000030';await insert(phone,{custom:{hidden:true}});await actor(operator);
  assert.equal(await scalar('SELECT count(*)::int FROM public.leads WHERE phone=$1',[phone]),0);
  await rejected(()=>insert(phone));await rejected(()=>insert('5511900000031',{workspace:OTHER}),'42501',false);
  await actor(outsider);await rejected(()=>insert('5511900000032'),'42501',false);
 });
 await check('a duplicate INSERT batch rejects every row in that statement',async()=>{
  await rejected(()=>pg.exec(`INSERT INTO public.leads(workspace_id,name,phone) VALUES('${W}','First','5511900000040'),('${W}','Second','+55 (11) 90000-0040'),('${W}','Unrelated','5511900000041')`));assert.deepEqual(await state(),before);
 });
 await check('an UPDATE batch sees all final row identities and rejects all partial changes',async()=>{
  const a=await insert('5511900000050'),b=await insert('5511900000051'),old=await state();
  await rejected(()=>pg.query("UPDATE public.leads SET phone='5511900000052',name='Must roll back' WHERE id=ANY($1::uuid[])",[[a,b]]));assert.deepEqual(await state(),old);
 });
 await check('AFTER guard observes a BEFORE trigger that changes phone during a name-only update',async()=>{
  const id=await insert('5511900000060');
  await pg.exec(`CREATE FUNCTION public.fixture_rewrite_phone() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.name='Rewrite phone' THEN NEW.phone:='${historicalPhone}'; END IF; RETURN NEW; END;$$;
   CREATE TRIGGER fixture_rewrite_phone BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.fixture_rewrite_phone();`);
  await rejected(()=>pg.query("UPDATE public.leads SET name='Rewrite phone' WHERE id=$1",[id]));assert.equal(await scalar('SELECT phone FROM public.leads WHERE id=$1',[id]),'5511900000060');
 });
 for(const isolation of ['REPEATABLE READ','SERIALIZABLE'])await check('new protected writes reject '+isolation+' instead of reading a stale snapshot',async()=>{
  await rejected(()=>insert('5511900000070'),'0A000',false);await pg.query("UPDATE public.leads SET name='Same identity edit' WHERE id=$1",[alias]);await insert('5511900000070@g.us');
 },isolation);
 await check('function-local timeout restores the caller configuration',async()=>{
  await pg.exec("SET LOCAL lock_timeout='1234ms'");await insert('5511900000080');assert.equal(await scalar("SELECT current_setting('lock_timeout')"),'1234ms');
 });
 await check('Funnel creation still persists one event/receipt and replay returns that same result',async()=>{
  const request=randomUUID();await actor();const first=await scalar(createSql('5511900000090',request));assert.equal(first.ok,true);assert.equal(first.state,'pending');
  assert.deepEqual(await scalar(createSql('5511900000090',request)),first);await admin();
  assert.equal(await scalar('SELECT count(*)::int FROM public.slim_stage_move_events WHERE id=$1',[first.eventId]),1);
  assert.equal(await scalar('SELECT count(*)::int FROM private.slim_funnel_write_requests WHERE request_id=$1',[request]),1);
 });
 await check('checkout still preserves freight, cents, stock movements and receipt replay',async()=>{
  const request=randomUUID(),phone='5511900000100';await actor();const first=await scalar(confirmSql(phone,request));assert.equal(first.totalCents,2126);
  assert.deepEqual(await scalar(confirmSql(phone,request)),first);await admin();
  const saved=await scalar('SELECT to_jsonb(o) FROM public.slim_orders o WHERE id=$1',[first.orderId]);
  assert.equal(saved.shipping_cents,327);assert.deepEqual(saved.snapshot.fulfillment,quote(phone).fulfillment);assert.equal(saved.snapshot.items[0].discountCents,101);
  assert.equal(await scalar('SELECT stock FROM public.products WHERE id=$1',[product]),96);assert.equal(await scalar('SELECT count(*)::int FROM public.slim_stock_movements WHERE order_id=$1',[first.orderId]),1);
 });
 await check('a confirmed order earlier in a rejected statement has no partial financial effect',async()=>{
  await actor();const request=randomUUID();
  await rejected(()=>pg.exec(`DO $$BEGIN PERFORM public.slim_confirm_order('${W}','${request}',${literal(JSON.stringify(quote(null,{customerId:historical})))}::jsonb); INSERT INTO public.leads(workspace_id,name,phone) VALUES('${W}','Rejected after order','${historicalPhone}'); END;$$;`));
  await admin();assert.deepEqual(await state(),before);
 });
 assert.deepEqual(await state(),before);assert.deepEqual(await scalar(dependencyStateSql),dependencies);assert.deepEqual(await scalar(permissionStateSql),permissions);
 console.log(`${passed}/${passed} portable contact-guard PostgreSQL checks passed. Independent connections are verified only by test-slim-contact-guard-concurrency.mjs. No production writes or messages.`);
}finally{await pg.close();}
