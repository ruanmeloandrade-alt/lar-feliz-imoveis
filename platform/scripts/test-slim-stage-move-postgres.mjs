import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
// Isolated, disposable PostgreSQL. No connection to the user's Supabase or messaging service.
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8'),pg=new PGlite({extensions:{pgcrypto}});let n=0;
const W=randomUUID(),OTHER=randomUUID(),owner=randomUUID(),operator=randomUUID(),viewer=randomUUID(),outsider=randomUUID(),pipe=randomUUID(),foreignPipe=randomUUID(),from=randomUUID(),to=randomUUID(),foreignStage=randomUUID(),lead=randomUUID(),sibling=randomUUID();
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
async function actor(id=owner){await pg.exec('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function test(name,fn){await pg.exec('BEGIN');try{await fn();n++;console.log('PASS stage move PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}}
async function reject(fn,code='42501'){await pg.exec('SAVEPOINT rejected');let error;try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT rejected');}await pg.exec('RELEASE SAVEPOINT rejected');assert(error,'Expected rejection');assert.equal(error.code,code,error.message);}
const move=(request=randomUUID(),stage=to,ws=W,id=lead)=>scalar('SELECT public.slim_move_lead_and_emit($1,$2,$3,$4)',[ws,id,stage,request]);
const count=()=>scalar('SELECT count(*)::int FROM public.slim_stage_move_events');
try{
 await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
 await pg.exec('CREATE TABLE public.pipelines(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id));CREATE TABLE public.pipeline_stages(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id));ALTER TABLE public.leads ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id),ADD COLUMN stage_id uuid REFERENCES public.pipeline_stages(id),ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp(),ADD COLUMN last_message_from text DEFAULT \'lead\';');
 await pg.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0]);
 const migration=readdirSync(new URL('supabase/migrations/',root)).filter(p=>p.endsWith('_slim_stage_move_outbox.sql'));assert.equal(migration.length,1);await pg.exec(read('supabase/migrations/'+migration[0]));
 for(const id of [owner,operator,viewer,outsider])await pg.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
 await pg.query("INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,'Workspace test'),($3,$4,'Foreign workspace')",[W,owner,OTHER,outsider]);
 await pg.query("INSERT INTO workspace_members(workspace_id,user_id,role_type) VALUES($1,$2,'funcionario'),($1,$3,'visualizador')",[W,operator,viewer]);
 await pg.query('INSERT INTO pipelines VALUES($1,$2),($3,$4)',[pipe,W,foreignPipe,OTHER]);
 await pg.query('INSERT INTO pipeline_stages VALUES($1,$2,$3),($4,$2,$3),($5,$6,$7)',[from,W,pipe,to,foreignStage,OTHER,foreignPipe]);
 await pg.query("INSERT INTO leads(id,workspace_id,name,pipeline_id,stage_id) VALUES($1,$2,'Chosen lead',$3,$4),($5,$2,'Other lead',$3,$4)",[lead,W,pipe,from,sibling]);
 await pg.exec('GRANT SELECT ON public.leads TO authenticated;');
 await test('move and event committed together',async()=>{await actor();const r=await move();assert.equal(r.moved,true);assert.equal(r.state,'pending');assert.equal(await scalar('SELECT stage_id FROM leads WHERE id=$1',[lead]),to);assert.equal(await count(),1);});
 await test('duplicate request yields same event and no second movement',async()=>{await actor();const id=randomUUID(),a=await move(id),b=await move(id);assert.deepEqual(a,b);assert.equal(await count(),1);});
 await test('same stage with another request creates no event',async()=>{await actor();await move();const r=await move();assert.equal(r.moved,false);assert.equal(r.eventId,null);assert.equal(await count(),1);});
 await test('same reference cannot select another stage',async()=>{await actor();const id=randomUUID();await move(id);await reject(()=>move(id,from),'22023');assert.equal(await count(),1);});
 await test('expired membership denied',async()=>{await pg.query("UPDATE workspace_members SET access_expires_at=clock_timestamp()-interval '1 hour' WHERE user_id=$1",[operator]);await actor(operator);await reject(()=>move());});
 await test('viewer cannot move',async()=>{await actor(viewer);await reject(()=>move());assert.equal(await count(),0);});
 await test('authorized operator can move',async()=>{await actor(operator);assert.equal((await move()).moved,true);});
 await test('foreign operator denied',async()=>{await actor(outsider);await reject(()=>move());assert.equal(await count(),0);});
 await test('foreign destination denied without modifying source',async()=>{await actor();await reject(()=>move(randomUUID(),foreignStage));assert.equal(await scalar('SELECT stage_id FROM leads WHERE id=$1',[lead]),from);assert.equal(await count(),0);});
 await test('missing contact denied',async()=>{await actor();await reject(()=>move(randomUUID(),to,W,randomUUID()));});
 await test('merged contact rejected before movement',async()=>{await pg.query('UPDATE leads SET merged_into_id=$1 WHERE id=$2',[sibling,lead]);await actor();await reject(()=>move());assert.equal(await count(),0);});
 await test('another operator cannot reuse earlier approval reference',async()=>{const id=randomUUID();await actor();await move(id);await actor(operator);await reject(()=>move(id),'22023');});
 await test('movement leaves unread state and other contacts untouched',async()=>{await actor();await move();assert.equal(await scalar('SELECT stage_id FROM leads WHERE id=$1',[sibling]),from);assert.equal(await scalar('SELECT last_message_from FROM leads WHERE id=$1',[lead]),'lead');});
 await test('failure during update rolls event back too',async()=>{await pg.exec("CREATE FUNCTION public.test_reject_move() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'test update failure' USING ERRCODE='22023'; END$$;CREATE TRIGGER test_reject_move BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.test_reject_move();");await actor();await reject(()=>move(),'22023');assert.equal(await count(),0);assert.equal(await scalar('SELECT stage_id FROM leads WHERE id=$1',[lead]),from);});
 await test('event is invisible to another company',async()=>{await actor();await move();await actor(outsider);assert.equal(await count(),0);});
 await test('ordinary operator cannot change or claim event directly',async()=>{await actor();assert.equal(await scalar("SELECT has_table_privilege('authenticated','public.slim_stage_move_events','UPDATE')"),false);assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.slim_claim_stage_move(uuid)','EXECUTE')"),false);});
 await test('only one worker claim wins while lease is active',async()=>{await actor();const r=await move();await pg.exec('SET LOCAL ROLE service_role');assert.equal((await pg.query('SELECT * FROM slim_claim_stage_move($1)',[r.eventId])).rows.length,1);assert.equal((await pg.query('SELECT * FROM slim_claim_stage_move($1)',[r.eventId])).rows.length,0);});
 await test('stale enqueue lease can be recovered with new attempt number',async()=>{await actor();const r=await move();await pg.exec('SET LOCAL ROLE service_role');await pg.query('SELECT * FROM slim_claim_stage_move($1)',[r.eventId]);await pg.query("UPDATE slim_stage_move_events SET started_at=clock_timestamp()-interval '3 minutes' WHERE id=$1",[r.eventId]);const result=await pg.query('SELECT * FROM slim_claim_stage_move($1)',[r.eventId]);assert.equal(result.rows[0].attempts,2);});
 await test('anonymous cannot move contact or read events',async()=>{assert.equal(await scalar("SELECT has_function_privilege('anon','public.slim_move_lead_and_emit(uuid,uuid,uuid,uuid)','EXECUTE')"),false);assert.equal(await scalar("SELECT has_table_privilege('anon','public.slim_stage_move_events','SELECT')"),false);});
 assert.equal(await count(),0);assert.equal(await scalar('SELECT count(*)::int FROM slim_orders'),0);
 console.log(`${n}/${n} isolated stage-move PostgreSQL checks passed. No real lead moved or SalesBot started.`);
}finally{await pg.close();}
