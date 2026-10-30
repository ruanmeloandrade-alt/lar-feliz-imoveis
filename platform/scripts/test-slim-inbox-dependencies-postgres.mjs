import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
// Synthetic in-memory PostgreSQL. Never opens a connection to Supabase or Evolution.
const pg=new PGlite({extensions:{pgcrypto}}),root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const W='00000000-0000-4000-8000-000000000101',OTHER='00000000-0000-4000-8000-000000000102',owner='00000000-0000-4000-8000-000000000001',viewer='00000000-0000-4000-8000-000000000002',expired='00000000-0000-4000-8000-000000000003',outsider='00000000-0000-4000-8000-000000000004';let n=0;
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
async function actor(id=owner){await pg.exec('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function reject(fn,code='42501'){await pg.exec('SAVEPOINT rejected');let error;try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT rejected');}await pg.exec('RELEASE SAVEPOINT rejected');assert(error,'Expected rejection');assert.equal(error.code,code,error.message);}
async function test(name,fn){await pg.exec('BEGIN');try{await fn();n++;console.log('PASS Inbox dependencies PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}}
const lead=randomUUID(),foreignLead=randomUUID(),session=randomUUID(),foreignSession=randomUUID();
const label=()=>scalar("INSERT INTO public.inbox_labels(workspace_id,group_name,name,color) VALUES($1,'Geral','Interesse','#ffffff') RETURNING id",[W]);
const group=(s=session,w=W)=>scalar("INSERT INTO public.whatsapp_groups(workspace_id,session_id,group_jid,name) VALUES($1,$2,'1234567890-123@g.us','Synthetic group') RETURNING id",[w,s]);
try{
 await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
 await pg.exec('CREATE TABLE public.whatsapp_web_sessions(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id));CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;');
 await pg.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0]);
 for(const t of ['workspaces','workspace_members','leads','whatsapp_web_sessions']){const col=t==='workspaces'?'id':'workspace_id';await pg.exec(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.${t} FROM PUBLIC,anon,authenticated;GRANT SELECT ON public.${t} TO authenticated;CREATE POLICY fixture_read ON public.${t} FOR SELECT TO authenticated USING(private.slim_workspace_access(${col}));`);}
 await pg.exec(read('supabase/migrations/20261016121810_slim_inbox_labels_groups_media.sql'));
 for(const id of [owner,viewer,expired,outsider])await pg.query('INSERT INTO auth.users VALUES($1)',[id]);
 await pg.query("INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,'Synthetic workspace'),($3,$4,'Other workspace')",[W,owner,OTHER,outsider]);
 await pg.query("INSERT INTO workspace_members(workspace_id,user_id,role_type,access_expires_at) VALUES($1,$2,'visualizador',NULL),($1,$3,'funcionario',now()-interval '1 day')",[W,viewer,expired]);
 await pg.query("INSERT INTO leads(id,workspace_id,name) VALUES($1,$2,'Synthetic lead'),($3,$4,'Other lead')",[lead,W,foreignLead,OTHER]);
 await pg.query('INSERT INTO whatsapp_web_sessions VALUES($1,$2),($3,$4)',[session,W,foreignSession,OTHER]);
 await test('operator can create and read a real label',async()=>{await actor();const id=await label();assert.equal(await scalar('SELECT name FROM inbox_labels WHERE id=$1',[id]),'Interesse');});
 await test('empty label names rejected',async()=>{await actor();await reject(()=>pg.query("INSERT INTO inbox_labels(workspace_id,name) VALUES($1,' ')",[W]),'23514');});
 await test('same label identity cannot be duplicated',async()=>{await actor();await label();await reject(label,'23505');});
 await test('existing client receives label without creating another client',async()=>{await actor();const id=await label();await pg.query('INSERT INTO inbox_label_assignments(workspace_id,label_id,thread_ref) VALUES($1,$2,$3)',[W,id,lead]);assert.equal(await scalar('SELECT count(*)::int FROM inbox_label_assignments'),1);assert.equal(await scalar('SELECT count(*)::int FROM leads'),1);});
 await test('unrelated lead cannot receive label',async()=>{await actor();const id=await label();await reject(()=>pg.query('INSERT INTO inbox_label_assignments(workspace_id,label_id,thread_ref) VALUES($1,$2,$3)',[W,id,foreignLead]));});
 await test('invented conversation rejected',async()=>{await actor();const id=await label();await reject(()=>pg.query('INSERT INTO inbox_label_assignments(workspace_id,label_id,thread_ref) VALUES($1,$2,$3)',[W,id,randomUUID()]));});
 await test('viewer cannot create labels',async()=>{await actor(viewer);await reject(label);});
 await test('expired membership cannot create labels',async()=>{await actor(expired);await reject(label);});
 await test('other tenant cannot see labels',async()=>{await actor();await label();await actor(outsider);assert.equal(await scalar('SELECT count(*)::int FROM inbox_labels'),0);});
 await test('viewer sees labels but cannot remove them',async()=>{await actor();await label();await actor(viewer);await pg.exec('DELETE FROM inbox_labels');assert.equal(await scalar('SELECT count(*)::int FROM inbox_labels'),1);});
 await test('group metadata persists under its own session',async()=>{await actor();const id=await group();assert.equal(await scalar('SELECT session_id FROM whatsapp_groups WHERE id=$1',[id]),session);});
 await test('cross-workspace session rejected',async()=>{await actor();await reject(()=>group(foreignSession));});
 await test('group metadata supports label assignments',async()=>{await actor();const id=await label(),g=await group();await pg.query('INSERT INTO inbox_label_assignments(workspace_id,label_id,thread_ref) VALUES($1,$2,$3)',[W,id,'group:'+g]);assert.equal(await scalar('SELECT count(*)::int FROM inbox_label_assignments'),1);});
 await test('bucket is private and bounded',async()=>{assert.equal(await scalar("SELECT public FROM storage.buckets WHERE id='inbox-outgoing'"),false);assert.equal(Number(await scalar("SELECT file_size_limit FROM storage.buckets WHERE id='inbox-outgoing'")),16777216);});
 await test('operator can store and read outgoing media metadata',async()=>{await actor();await pg.query("INSERT INTO storage.objects(bucket_id,name) VALUES('inbox-outgoing',$1)",[W+'/'+lead+'/photo.jpg']);assert.equal(await scalar('SELECT count(*)::int FROM storage.objects'),1);});
 await test('other workspace cannot upload into our path',async()=>{await actor(outsider);await reject(()=>pg.query("INSERT INTO storage.objects(bucket_id,name) VALUES('inbox-outgoing',$1)",[W+'/'+lead+'/photo.jpg']));});
 await test('viewer cannot upload outgoing files',async()=>{await actor(viewer);await reject(()=>pg.query("INSERT INTO storage.objects(bucket_id,name) VALUES('inbox-outgoing',$1)",[W+'/'+lead+'/photo.jpg']));});
 await test('malformed storage path fails closed without UUID cast exception',async()=>{await actor();await reject(()=>pg.query("INSERT INTO storage.objects(bucket_id,name) VALUES('inbox-outgoing','not-a-uuid/customer/file')"));});
 await test('stored media is invisible in another company',async()=>{await actor();await pg.query("INSERT INTO storage.objects(bucket_id,name) VALUES('inbox-outgoing',$1)",[W+'/'+lead+'/photo.jpg']);await actor(outsider);assert.equal(await scalar('SELECT count(*)::int FROM storage.objects'),0);});
 await test('anonymous cannot read label table',async()=>assert.equal(await scalar("SELECT has_table_privilege('anon','public.inbox_labels','SELECT')"),false));
 assert.equal(await scalar('SELECT count(*)::int FROM public.inbox_labels'),0);assert.equal(await scalar('SELECT count(*)::int FROM public.whatsapp_groups'),0);assert.equal(await scalar('SELECT count(*)::int FROM public.slim_orders'),0);
 console.log(`${n}/${n} isolated Inbox dependencies checks passed. No actual Storage upload, group creation or customer message was sent.`);
}finally{await pg.close();}
