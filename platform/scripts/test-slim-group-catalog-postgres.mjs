import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

// Synthetic PostgreSQL only. No Supabase, Evolution, customer or group send.
const pg=new PGlite({extensions:{pgcrypto}});
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261018185403_slim_group_catalog_recovery.sql');
const [W,OTHER,owner,operator,viewer,expired,outsider,missingProfile,S1,S2,EMPTY,FOREIGN,existing]=Array.from({length:13},()=>randomUUID());
let passed=0;
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
const sync=(workspace=W,session=null)=>scalar('SELECT public.slim_sync_group_catalog($1::uuid,$2::uuid)',[workspace,session]);
async function actor(id=owner){await pg.exec('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function reject(fn,message){
 await pg.exec('SAVEPOINT rejected');let error;
 try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT rejected');}
 await pg.exec('RELEASE SAVEPOINT rejected');
 assert(error,'Expected rejection');assert.equal(error.code,'42501',error.message);
 if(message)assert.match(error.message,message);
}
async function test(name,fn){await pg.exec('BEGIN');try{await fn();passed++;console.log('PASS group catalog PostgreSQL: '+name);}finally{await pg.exec('ROLLBACK');}}
const snapshot=()=>scalar(`SELECT jsonb_build_object(
 'groups',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.whatsapp_groups g),
 'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.whatsapp_web_messages m),
 'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.whatsapp_web_sessions s),
 'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p))`);
try{
 await pg.exec(read('scripts/fixtures/slim-legacy-isolated-schema.sql'));
 await pg.exec(`
  CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),current_workspace_id uuid);
  CREATE TABLE public.whatsapp_web_sessions(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id));
  CREATE TABLE public.whatsapp_web_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,session_id uuid NOT NULL,remote_jid text,body text,raw jsonb,received_at timestamptz NOT NULL DEFAULT now());
 `);
 await pg.exec(read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0]);
 const inbox=read('supabase/migrations/20261016121810_slim_inbox_labels_groups_media.sql');
 await pg.exec(inbox.slice(inbox.indexOf('CREATE TABLE public.whatsapp_groups'),inbox.indexOf('CREATE TABLE public.inbox_label_assignments')));
 await pg.exec(`ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.whatsapp_groups FROM PUBLIC,anon,authenticated;
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.whatsapp_groups TO authenticated;
  GRANT ALL ON public.whatsapp_groups TO service_role;`);
 await pg.exec(inbox.split('\n').filter(line=>line.startsWith('CREATE POLICY slim_inbox_groups_')).join('\n'));
 for(const table of ['workspaces','workspace_members','whatsapp_web_sessions','whatsapp_web_messages']){
  const column=table==='workspaces'?'id':'workspace_id';
  await pg.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
   GRANT SELECT ON public.${table} TO authenticated;
   CREATE POLICY fixture_read ON public.${table} FOR SELECT TO authenticated USING(private.slim_workspace_access(${column}));`);
 }
 await pg.exec(`ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.profiles TO authenticated;
  CREATE POLICY fixture_profile ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
  -- Native session/MFA guard is covered by test-slim-session-security-postgres.mjs.
  -- This deterministic stub verifies the new RPC propagates both guard failures before INSERT.
  CREATE FUNCTION public.slim_assert_session_security() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
  DECLARE err text:=nullif(current_setting('fixture.security_error',true),'');
  BEGIN
   IF err IS NOT NULL THEN RAISE EXCEPTION '%',err USING ERRCODE='42501';END IF;
   IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SLIM_SESSION_INVALID' USING ERRCODE='42501';END IF;
   RETURN true;
  END;$$;
  REVOKE ALL ON FUNCTION public.slim_assert_session_security() FROM PUBLIC,anon,authenticated,service_role;
  GRANT EXECUTE ON FUNCTION public.slim_assert_session_security() TO authenticated;
  CREATE FUNCTION private.slim_session_security_allowed() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('fixture.security_error',true),'') IS NULL $$;
  REVOKE ALL ON FUNCTION private.slim_session_security_allowed() FROM PUBLIC,anon;
  GRANT EXECUTE ON FUNCTION private.slim_session_security_allowed() TO authenticated;
 `);
 for(const table of ['profiles','whatsapp_web_sessions','whatsapp_web_messages','whatsapp_groups'])await pg.exec(`CREATE POLICY slim_session_security ON public.${table} AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.slim_session_security_allowed())) WITH CHECK((SELECT private.slim_session_security_allowed()));`);
 for(const id of [owner,operator,viewer,expired,outsider,missingProfile])await pg.query('INSERT INTO auth.users VALUES($1)',[id]);
 await pg.query("INSERT INTO public.workspaces(id,owner_id,name) VALUES($1,$2,'Synthetic workspace'),($3,$4,'Other workspace')",[W,owner,OTHER,outsider]);
 for(const id of [owner,operator,viewer,expired,outsider])await pg.query('INSERT INTO public.profiles VALUES($1,$2)',[id,id===outsider?OTHER:W]);
 await pg.query(`INSERT INTO public.workspace_members(workspace_id,user_id,role_type,access_expires_at) VALUES
  ($1,$2,'funcionario',NULL),($1,$3,'visualizador',NULL),($1,$4,'funcionario',now()-interval '1 day'),($1,$5,'funcionario',NULL)`,[W,operator,viewer,expired,missingProfile]);
 for(const session of [S1,S2,EMPTY])await pg.query('INSERT INTO public.whatsapp_web_sessions VALUES($1,$2)',[session,W]);
 await pg.query('INSERT INTO public.whatsapp_web_sessions VALUES($1,$2)',[FOREIGN,OTHER]);
 await pg.query(`INSERT INTO public.whatsapp_groups(id,workspace_id,session_id,group_jid,name,subject,description,picture_url,participants_count,is_admin,is_announce,invite_code,active_bot_id,active_ai_agent_id,rules,metadata,last_synced_at)
  VALUES($1,$2,$3,'111-222@g.us','Configured name','Existing subject','Existing description','https://example.invalid/picture',17,true,true,'synthetic-code',$4,$5,'{"enabled":true,"rule":"keep"}','{"source":"evolution","custom":"preserve"}','2026-10-01T12:00:00Z')`,[existing,W,S1,randomUUID(),randomUUID()]);
 const history=[
  [W,S1,'111-222@g.us'],[W,S1,'120363000001@g.us'],[W,S1,'120363000001@g.us'],
  [W,S2,'120363000001@g.us'],[W,S1,'333-444@g.us'],
  [W,S1,'user@s.whatsapp.net'],[W,S1,'invalid@g.us'],[W,S1,'---@g.us'],[W,S1,' 123@g.us'],
  [W,FOREIGN,'555-666@g.us'],[OTHER,S1,'777-888@g.us'],[OTHER,FOREIGN,'999-000@g.us']
 ];
 for(const [ws,session,jid] of history)await pg.query(`INSERT INTO public.whatsapp_web_messages(workspace_id,session_id,remote_jid,body,raw,received_at) VALUES($1,$2,$3,'Synthetic private body','{"media":"never copy","message":"fixture"}','2026-10-17T10:00:00Z')`,[ws,session,jid]);
 const beforeInstall=await snapshot();
 const guardBefore=await scalar("SELECT jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl) FROM pg_proc WHERE oid='public.slim_assert_session_security()'::regprocedure");
 await pg.exec(migration);
 assert.deepEqual(await snapshot(),beforeInstall,'Installing the function must not recover data');
 assert.deepEqual(await scalar("SELECT jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl) FROM pg_proc WHERE oid='public.slim_assert_session_security()'::regprocedure"),guardBefore,'Native security guard/grants must stay intact');
 assert.match(migration,/PERFORM public\.slim_assert_session_security\(\)/);
 assert.doesNotMatch(migration,/\b(?:UPDATE|DELETE|TRUNCATE)\b/i);

 await test('RPC is invoker, authenticated only, and preserves the security guard',async()=>{
  assert.equal(await scalar("SELECT prosecdef FROM pg_proc WHERE oid='public.slim_sync_group_catalog(uuid,uuid)'::regprocedure"),false);
  assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.slim_sync_group_catalog(uuid,uuid)','EXECUTE')"),true);
  for(const role of ['anon','service_role']){
   assert.equal(await scalar(`SELECT has_function_privilege('${role}','public.slim_sync_group_catalog(uuid,uuid)','EXECUTE')`),false);
   await pg.exec(`SET LOCAL ROLE ${role}`);await reject(()=>sync());await pg.exec('RESET ROLE');
  }
 });
 await test('owner recovers only valid same-workspace session/JID pairs',async()=>{
  await actor();assert.deepEqual(await sync(),{recovered:3,total:4});
  const rows=(await pg.query('SELECT session_id,group_jid FROM public.whatsapp_groups WHERE id<>$1 ORDER BY session_id,group_jid',[existing])).rows;
  assert.equal(rows.length,3);assert(rows.every(row=>[S1,S2].includes(row.session_id)));
  assert.equal(rows.filter(row=>row.group_jid==='120363000001@g.us').length,2);
 });
 await test('session filter and the same JID in another session remain separate',async()=>{
  await actor();assert.deepEqual(await sync(W,S2),{recovered:1,total:1});
  assert.deepEqual(await sync(W,S1),{recovered:2,total:3});
  assert.deepEqual(await sync(W,EMPTY),{recovered:0,total:0});
 });
 await test('second recovery is zero and existing names, bots, rules and history are unchanged',async()=>{
  const before=await snapshot();await actor();await sync();const original=await scalar('SELECT to_jsonb(g) FROM public.whatsapp_groups g WHERE id=$1',[existing]);
  assert.deepEqual(original,before.groups[0]);assert.deepEqual(await sync(),{recovered:0,total:4});
  await pg.exec('RESET ROLE');const after=await snapshot();
  assert.deepEqual(after.messages,before.messages);assert.deepEqual(after.sessions,before.sessions);assert.deepEqual(after.profiles,before.profiles);
  const first=after.groups;await actor();await sync();await pg.exec('RESET ROLE');assert.deepEqual((await snapshot()).groups,first);
 });
 await test('recovered metadata is provisional and contains no message/media payload',async()=>{
  await actor();await sync();const rows=(await pg.query('SELECT * FROM public.whatsapp_groups WHERE id<>$1',[existing])).rows;
  for(const row of rows){
   assert.match(row.name,/^Grupo WhatsApp [0-9-]{1,6}$/);assert.equal(row.last_synced_at,null);
   assert.equal(row.active_bot_id,null);assert.equal(row.active_ai_agent_id,null);assert.deepEqual(row.rules,{});
   assert.equal(row.metadata.source,'inbox_history');assert.equal(Date.parse(row.metadata.history_latest_at),Date.parse('2026-10-17T10:00:00Z'));
   assert.deepEqual(Object.keys(row.metadata).sort(),['history_latest_at','recovered_at','source']);
   assert.doesNotMatch(JSON.stringify(row),/Synthetic private body|never copy/);
  }
 });
 await test('active employee operator can recover the catalog',async()=>{await actor(operator);assert.deepEqual(await sync(),{recovered:3,total:4});});
 await test('viewer may read existing groups but cannot recover',async()=>{await actor(viewer);assert.equal(await scalar('SELECT count(*)::int FROM whatsapp_groups'),1);await reject(()=>sync());});
 await test('expired member and outsider cannot recover',async()=>{for(const id of [expired,outsider]){await actor(id);await reject(()=>sync());}});
 await test('wrong or missing active workspace cannot be changed implicitly',async()=>{
  await pg.query('UPDATE public.profiles SET current_workspace_id=$1 WHERE id=$2',[OTHER,owner]);
  await actor();await reject(()=>sync());await reject(()=>sync(OTHER));await reject(()=>sync(null));
  await actor(missingProfile);await reject(()=>sync());
 });
 await test('foreign and unknown sessions are rejected before recovery',async()=>{await actor();await reject(()=>sync(W,FOREIGN));await reject(()=>sync(W,randomUUID()));assert.equal(await scalar('SELECT count(*)::int FROM whatsapp_groups'),1);});
 for(const code of ['SLIM_SESSION_INVALID','SLIM_MFA_REQUIRED'])await test(code+' is propagated with no data writes',async()=>{
  const before=await snapshot();await actor();await pg.query("SELECT set_config('fixture.security_error',$1,true)",[code]);
  await reject(()=>sync(),new RegExp(code));await pg.exec('RESET ROLE');assert.deepEqual(await snapshot(),before);
 });
 assert.deepEqual(await snapshot(),beforeInstall);
 console.log(`${passed}/${passed} isolated group catalog checks passed. No external connection, group operation, message or automation ran.`);
}finally{await pg.close();}
