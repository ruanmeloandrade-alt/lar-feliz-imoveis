import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {W,OTHER,owner,admin,recipient,unconfirmed,outsider,existing,expired,noProfile,legacy,legacyToken,otherInvite,otherToken,emails,
 actorSql,serviceSql,contextSql,changeSql,lookupSql,linkSql,previewSql,acceptSql,createPayload,invitationMigration,setupSql,stateSql,permissionStateSql,functionStateSql,literal} from './fixtures/slim-invitations-setup.mjs';

// Portable isolated SQL gate. Real independent clients are proved by the separate
// mandatory local concurrency gate; this file never substitutes sequential calls for it.
const pg=new PGlite({extensions:{pgcrypto}});let passed=0;
const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
const actor=(id=owner)=>pg.exec(actorSql(id));
const reset=()=>pg.exec('RESET ROLE');
const state=()=>scalar(stateSql);
async function check(name,fn){await pg.exec('BEGIN');try{await fn();passed++;console.log('PASS invitations SQL: '+name);}finally{await pg.exec('ROLLBACK');}}
async function sqlError(fn,code){await pg.exec('SAVEPOINT expected_error');let error;try{await fn();}catch(e){error=e;await pg.exec('ROLLBACK TO SAVEPOINT expected_error');}
 await pg.exec('RELEASE SAVEPOINT expected_error');assert(error,'Expected SQL rejection');assert.equal(error.code,code,error.message);return error;}
const rejected=(value,code)=>{assert.equal(value.status,'rejected');assert.equal(value.code,code);assert(value.message);return value;};
async function create(email=emails.recipient){await actor();const context=await scalar(contextSql({email}));assert.equal(context.canProceed,true,context.reason);
 const request=randomUUID(),result=await scalar(changeSql({request,payload:createPayload(email),fingerprint:context.expectedFingerprint}));assert.equal(result.status,'confirmed',result.message);
 const link=await scalar(linkSql(result.invitationId));return {context,request,result,link};}
async function change(id,action){await actor();const context=await scalar(contextSql({action,id}));const request=randomUUID();const result=await scalar(changeSql({request,action,payload:{invitationId:id},fingerprint:context.expectedFingerprint}));return{context,request,result};}
async function membership(id=recipient){await reset();return scalar(`SELECT (SELECT to_jsonb(m) FROM public.workspace_members m WHERE workspace_id='${W}' AND user_id=${literal(id)})`);}
try{
 await pg.exec(setupSql());const baseline=await state(),permissions=await scalar(permissionStateSql),functions=await scalar(functionStateSql);
 await pg.exec('BEGIN');await pg.exec(invitationMigration());await pg.exec('COMMIT');
 assert.deepEqual(await state(),baseline);assert.deepEqual(await scalar(permissionStateSql),permissions);assert.deepEqual(await scalar(functionStateSql),functions);
 assert.equal(await scalar('SELECT count(*)::int FROM public.workspace_invitations WHERE access_role IS NOT NULL OR accepted_at IS NOT NULL OR accepted_by IS NOT NULL'),0);
 passed++;console.log('PASS invitations SQL: installation changes no original rows, permission grants/policies or functions; legacy access stays NULL');

 await check('only six public INVOKER RPCs; checked private definers; no anonymous preview or ledger access',async()=>{
  const names=['context','change','change_lookup','link','preview','accept'];
  for(const name of names){
   const row=(await pg.query("SELECT p.oid,p.prosecdef,p.proconfig,p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",['slim_invitation_'+name])).rows[0];
   assert(row);assert.equal(row.prosecdef,false);assert(row.proconfig.includes('search_path=""'));
   for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar('SELECT has_function_privilege($1,$2::oid,\'EXECUTE\')',[role,row.oid]),role===(name==='preview'?'service_role':'authenticated'));
   const impl=(await pg.query("SELECT prosecdef,proconfig FROM pg_proc WHERE oid=to_regprocedure($1)",[row.signature.replace('public.','').replace('slim_invitation_'+name+'(','private.slim_invitation_'+name+'_impl(')])).rows[0];
   assert.equal(impl.prosecdef,true);for(const setting of ['search_path=""','row_security=off','lock_timeout=5s'])assert(impl.proconfig.includes(setting));
  }
  assert.equal(await scalar("SELECT count(*)::int FROM pg_attribute WHERE attrelid='public.workspace_invitations'::regclass AND attname='access_role' AND atthasdef"),0);
  for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar("SELECT has_table_privilege($1,'private.slim_invitation_requests','SELECT,INSERT,UPDATE,DELETE')",[role]),false);
  await actor();await sqlError(()=>scalar(previewSql(legacyToken)),'42501');await sqlError(()=>scalar('SELECT count(*) FROM private.slim_invitation_requests'),'42501');
  await pg.exec(serviceSql);await sqlError(()=>scalar(contextSql()),'42501');
  await reset();await sqlError(()=>scalar(`SELECT private.slim_invitation_preview_impl('${legacyToken}')`),'42501');
 });
 await check('actual owner required, actor bound, and other workspace refused even for its owner',async()=>{
  await actor(admin);await sqlError(()=>scalar(contextSql({actor:admin})),'42501');await sqlError(()=>scalar(contextSql({actor:owner})),'42501');
  await reset();await pg.query("UPDATE public.workspace_members SET role='owner' WHERE user_id=$1",[admin]);await actor(admin);await sqlError(()=>scalar(contextSql({actor:admin})),'42501');
  await actor(outsider);await sqlError(()=>scalar(contextSql({actor:outsider,workspace:OTHER})),'42501');
  await actor();const blocked=await scalar(contextSql({action:'renew',id:otherInvite}));assert.equal(blocked.canProceed,false);assert.equal(blocked.email,null);assert.equal(blocked.invitation,null);assert.match(blocked.reason,/nesta empresa/);
 });
 await check('explicit admin choice, null duration and approval are mandatory; invalid attempts make no invitation',async()=>{
  await actor();const context=await scalar(contextSql());
  for(const payload of [{email:emails.recipient},{email:emails.recipient,accessRole:'member',accessDays:null},{email:emails.recipient,accessRole:'admin',accessDays:7},{email:emails.recipient,accessRole:'admin'}, {...createPayload(),isPartner:true}])
   rejected(await scalar(changeSql({request:randomUUID(),payload,fingerprint:context.expectedFingerprint})),'INVALID_ACCESS');
  for(const approved of [false,null])rejected(await scalar(changeSql({request:randomUUID(),fingerprint:context.expectedFingerprint,approved})),'APPROVAL_REQUIRED');
  await reset();assert.deepEqual(await state(),baseline);
 });
 await check('normalizes exact email only, exposes token-free context and persists reviewed admin/no-expiry metadata',async()=>{
  const email='  QA.Recipient@Example.Invalid  ',created=await create(email);
  assert.equal(created.context.email,emails.recipient);assert.equal(created.result.invitation.email,emails.recipient);assert.equal(created.result.targetId,null);
  assert.deepEqual(created.context.requiredAccess,{accessRole:'admin',accessDays:null});assert.equal(created.result.invitation.accessRole,'admin');
  assert.equal(created.result.invitation.accessDays,null);assert.equal(created.result.invitation.roleType,'parceiro');assert.equal(created.result.invitation.isPartner,true);
  assert.match(created.result.invitation.revision,/^[0-9a-f]{64}$/);assert(!JSON.stringify(created.context).includes(created.link.token));assert(!JSON.stringify(created.result).includes(created.link.token));
  await reset();const row=await scalar('SELECT to_jsonb(i) FROM public.workspace_invitations i WHERE id=$1',[created.result.invitationId]);
  assert.deepEqual(row.modules,[]);assert.equal(row.invited_by,owner);assert.equal(row.accepted_by,null);assert.equal(row.accepted_at,null);
  const receipt=await scalar('SELECT receipt FROM private.slim_invitation_requests WHERE request_id=$1',[created.request]);assert.deepEqual(receipt,created.result);assert(!JSON.stringify(receipt).includes(created.link.token));
 });
 await check('replaces all reviewed pending aliases atomically and rejects stale review',async()=>{
  await reset();await pg.query("INSERT INTO public.workspace_invitations(workspace_id,email,token,invited_by) VALUES($1,$2,$3,$4),($1,$5,$6,$4)",[W,' QA.Recipient@Example.Invalid ',randomUUID(),owner,emails.recipient,randomUUID()]);
  await actor();const context=await scalar(contextSql());assert.equal(context.pendingToReplace,2);
  const first=await scalar(changeSql({request:randomUUID(),fingerprint:context.expectedFingerprint}));assert.equal(first.status,'confirmed');
  rejected(await scalar(changeSql({request:randomUUID(),fingerprint:context.expectedFingerprint})),'STALE_CONTEXT');await reset();
  assert.equal(await scalar("SELECT count(*)::int FROM public.workspace_invitations WHERE workspace_id=$1 AND private.slim_invitation_email(email)=$2 AND status='pending'",[W,emails.recipient]),1);
  assert.equal(await scalar("SELECT count(*)::int FROM public.workspace_invitations WHERE workspace_id=$1 AND private.slim_invitation_email(email)=$2 AND status='revoked'",[W,emails.recipient]),2);
 });
 await check('insertion failure rolls back revocation of pending invitations',async()=>{
  const old=await create();await reset();const before=await state();
  await pg.exec(`CREATE FUNCTION public.fixture_reject_invite() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Synthetic insertion failure'; END;$$; CREATE TRIGGER fixture_reject_invite BEFORE INSERT ON public.workspace_invitations FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_invite();`);
  await actor();const context=await scalar(contextSql());await sqlError(()=>scalar(changeSql({request:randomUUID(),fingerprint:context.expectedFingerprint})),'P0001');await reset();assert.deepEqual(await state(),before);
  assert.equal(await scalar('SELECT status FROM public.workspace_invitations WHERE id=$1',[old.result.invitationId]),'pending');
 });
 await check('replay and lookup return immutable receipt; changed payload/fingerprint/action/target/actor cannot reuse the UUID',async()=>{
  const created=await create();assert.deepEqual(await scalar(changeSql({request:created.request,fingerprint:created.context.expectedFingerprint})),created.result);
  assert.deepEqual(await scalar(lookupSql({request:created.request})),created.result);
  rejected(await scalar(changeSql({request:created.request,payload:createPayload('qa.other@example.invalid'),fingerprint:created.context.expectedFingerprint})),'REQUEST_MISMATCH');
  rejected(await scalar(changeSql({request:created.request,fingerprint:'f'.repeat(64)})),'REQUEST_MISMATCH');
  rejected(await scalar(lookupSql({request:created.request,action:'revoke',id:created.result.invitationId})),'REQUEST_MISMATCH');
  const renewed=await change(created.result.invitationId,'renew');assert.equal(renewed.result.status,'confirmed');
  assert.deepEqual(await scalar(lookupSql({request:created.request})),created.result);
  rejected(await scalar(lookupSql({request:renewed.request,action:'renew',id:legacy})),'REQUEST_MISMATCH');
  await reset();await pg.query('UPDATE public.workspaces SET owner_id=$1 WHERE id=$2',[admin,W]);await actor(admin);
  rejected(await scalar(lookupSql({request:created.request,actor:admin})),'REQUEST_MISMATCH');
 });
 await check('absent lookup closes the reference and blocks late execution without creating an invitation',async()=>{
  await actor();const context=await scalar(contextSql()),request=randomUUID();const closed=rejected(await scalar(lookupSql({request})),'REQUEST_CLOSED');
  assert.deepEqual(await scalar(changeSql({request,fingerprint:context.expectedFingerprint})),closed);
  assert.deepEqual(await scalar(lookupSql({request})),closed);await reset();assert.deepEqual(await state(),baseline);
 });
 await check('renew changes token and expiry; expired compatible invites renew; consumed/revoked/legacy never reopen',async()=>{
  const created=await create();await reset();await pg.query("UPDATE public.workspace_invitations SET expires_at=clock_timestamp()-interval '1 day',status='expired' WHERE id=$1",[created.result.invitationId]);
  const renewal=await change(created.result.invitationId,'renew');assert.equal(renewal.result.status,'confirmed');
  const link=await scalar(linkSql(created.result.invitationId));assert.notEqual(link.token,created.link.token);assert(new Date(link.expiresAt)>new Date());
  await pg.exec(serviceSql);assert.equal((await scalar(previewSql(created.link.token))).status,'invalid');assert.equal((await scalar(previewSql(link.token))).status,'valid');
  const revoked=await change(created.result.invitationId,'revoke');assert.equal(revoked.result.status,'confirmed');
  const noRenew=await change(created.result.invitationId,'renew');rejected(noRenew.result,'INVITATION_UNAVAILABLE');
  const legacyRenew=await change(legacy,'renew');rejected(legacyRenew.result,'INVALID_ACCESS');await reset();
  assert.equal(await scalar('SELECT access_role FROM public.workspace_invitations WHERE id=$1',[legacy]),null);
 });
 await check('owner sees actual membership blockers; existing and expired members cannot be freshly invited',async()=>{
  await actor();for(const email of [emails.owner,emails.existing,emails.expired]){const context=await scalar(contextSql({email}));assert.equal(context.canProceed,false);assert.match(context.reason,/vínculo existente/);
   rejected(await scalar(changeSql({request:randomUUID(),payload:createPayload(email),fingerprint:context.expectedFingerprint})),'ALREADY_MEMBER');}
 });
 await check('preview is service-only and reports legacy/expired/revoked/accepted separately without token or owner id',async()=>{
  const created=await create();await pg.exec(serviceSql);let preview=await scalar(previewSql(created.link.token));assert.equal(preview.status,'valid');assert.equal(preview.workspaceName,'Synthetic Saúde Slim');
  assert.equal(preview.email,emails.recipient);assert.equal(preview.accessRole,'admin');assert.equal(preview.accessDays,null);assert(!JSON.stringify(preview).includes(created.link.token));assert(!JSON.stringify(preview).includes(owner));
  assert.equal((await scalar(previewSql(legacyToken))).accessRole,null);assert.equal((await scalar(previewSql(otherToken))).status,'invalid');
  await reset();await pg.query("UPDATE public.workspace_invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[created.result.invitationId]);await pg.exec(serviceSql);
  assert.equal((await scalar(previewSql(created.link.token))).invitationStatus,'expired');
  await reset();await pg.query("UPDATE public.workspace_invitations SET status='revoked' WHERE id=$1",[created.result.invitationId]);await pg.exec(serviceSql);assert.equal((await scalar(previewSql(created.link.token))).invitationStatus,'revoked');
 });
 await check('accept rejects approval, actor, exact-email, unconfirmed-email and other-workspace errors without partial state',async()=>{
  const created=await create();await reset();const before=await state();await actor(recipient);
  rejected(await scalar(acceptSql(created.link.token,{approved:false})),'APPROVAL_REQUIRED');await sqlError(()=>scalar(acceptSql(created.link.token,{actor:outsider})),'42501');
  rejected(await scalar(acceptSql(otherToken)),'INVITATION_UNAVAILABLE');await actor(outsider);rejected(await scalar(acceptSql(created.link.token,{actor:outsider})),'EMAIL_MISMATCH');
  await reset();await pg.query('UPDATE auth.users SET email=$1 WHERE id=$2',['qa.recipient+different@example.invalid',recipient]);await actor(recipient);rejected(await scalar(acceptSql(created.link.token)),'EMAIL_MISMATCH');
  await reset();await pg.query('UPDATE auth.users SET email=$1 WHERE id=$2',[emails.recipient,recipient]);assert.deepEqual(await state(),before);
  const nonconfirmed=await create(emails.unconfirmed);await actor(unconfirmed);rejected(await scalar(acceptSql(nonconfirmed.link.token,{actor:unconfirmed})),'EMAIL_UNCONFIRMED');assert.equal(await membership(unconfirmed),null);
 });
 await check('new member, category, no expiry, consumed invite and own active workspace commit together; permission rows stay intact',async()=>{
  const created=await create();await reset();const before=await state();await actor(recipient);
  const result=await scalar(acceptSql(created.link.token));assert.equal(result.status,'accepted');assert.equal(result.actorId,recipient);assert.equal(result.workspaceId,W);assert.equal(result.activeWorkspaceId,W);assert.equal(result.membershipRole,'admin');assert(result.acceptedAt);
  const member=await membership();assert.equal(member.role,'admin');assert.equal(member.role_type,'parceiro');assert.equal(member.is_partner,true);assert.equal(member.access_expires_at,null);
  const after=await state();assert.deepEqual(after.modules,before.modules);assert.deepEqual(after.permissions,before.permissions);assert.deepEqual(after.users,before.users);
  assert.deepEqual(after.profiles.filter(p=>p.id!==recipient),before.profiles.filter(p=>p.id!==recipient));
  assert.equal(await scalar('SELECT accepted_by FROM public.workspace_invitations WHERE id=$1',[created.result.invitationId]),recipient);
  assert.equal(await scalar('SELECT status FROM public.workspace_invitations WHERE id=$1',[created.result.invitationId]),'accepted');
  await actor();assert.deepEqual(await scalar(lookupSql({request:created.request})),created.result);await sqlError(()=>scalar(linkSql(created.result.invitationId)),'22023');
  const renewal=await change(created.result.invitationId,'renew');rejected(renewal.result,'INVITATION_UNAVAILABLE');
 });
 await check('existing member arriving after review is preserved exactly, including both permission tables',async()=>{
  const created=await create();await reset();await pg.query("INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type,is_partner,access_expires_at) VALUES($1,$2,'member','visualizador',false,clock_timestamp()+interval '9 days')",[W,recipient]);
  const member=await membership(),before=await state();await actor(recipient);const result=await scalar(acceptSql(created.link.token));assert.equal(result.status,'already_member');assert.equal(result.membershipRole,'member');
  assert.deepEqual(await membership(),member);const after=await state();assert.deepEqual(after.modules,before.modules);assert.deepEqual(after.permissions,before.permissions);
 });
 await check('expired existing member is rejected rather than renewed',async()=>{
  const created=await create();await reset();await pg.query("INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type,is_partner,access_expires_at) VALUES($1,$2,'member','funcionario',false,clock_timestamp()-interval '1 day')",[W,recipient]);
  const before=await state();await actor(recipient);rejected(await scalar(acceptSql(created.link.token)),'MEMBERSHIP_EXPIRED');await reset();assert.deepEqual(await state(),before);
 });
 await check('missing profile rejects before membership; profile-trigger failure rolls back all acceptance effects',async()=>{
  const missing=await create(emails.noProfile);await actor(noProfile);rejected(await scalar(acceptSql(missing.link.token,{actor:noProfile})),'PROFILE_UNAVAILABLE');assert.equal(await membership(noProfile),null);
  const created=await create();await reset();const before=await state();
  await pg.exec(`CREATE FUNCTION public.fixture_reject_profile() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${recipient}'::uuid THEN RAISE EXCEPTION 'Synthetic profile failure'; END IF; RETURN NEW; END;$$;CREATE TRIGGER fixture_reject_profile BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_profile();`);
  await actor(recipient);await sqlError(()=>scalar(acceptSql(created.link.token)),'P0001');await reset();assert.deepEqual(await state(),before);assert.equal(await membership(),null);
  assert.equal(await scalar('SELECT accepted_by FROM public.workspace_invitations WHERE id=$1',[created.result.invitationId]),null);
 });
 await check('pending lookup never consumes or grants; accepted lookup never selects workspace again; explicit entry does',async()=>{
  const created=await create();await reset();const before=await state();await actor(recipient);assert.equal((await scalar(acceptSql(created.link.token,{mode:'lookup',approved:false}))).status,'pending');
  await reset();assert.deepEqual(await state(),before);await actor(recipient);await scalar(acceptSql(created.link.token));
  await reset();await pg.query('UPDATE public.profiles SET current_workspace_id=$1 WHERE id=$2',[OTHER,recipient]);const accepted=await state();await actor(recipient);
  const recovered=await scalar(acceptSql(created.link.token,{mode:'lookup',approved:false}));assert.equal(recovered.status,'already_accepted');assert.equal(recovered.activeWorkspaceId,OTHER);await reset();assert.deepEqual(await state(),accepted);
  await actor(recipient);const entered=await scalar(acceptSql(created.link.token));assert.equal(entered.status,'already_accepted');assert.equal(entered.activeWorkspaceId,W);
  const sameMember=await membership();await actor(recipient);assert.equal((await scalar(acceptSql(created.link.token))).status,'already_accepted');assert.deepEqual(await membership(),sameMember);
 });
 await check('accepted replay does not regrant removed or expired membership',async()=>{
  const created=await create();await actor(recipient);await scalar(acceptSql(created.link.token));await reset();
  await pg.query("UPDATE public.workspace_members SET access_expires_at=clock_timestamp()-interval '1 second' WHERE workspace_id=$1 AND user_id=$2",[W,recipient]);
  const expiredState=await state();await actor(recipient);for(const mode of ['accept','lookup'])rejected(await scalar(acceptSql(created.link.token,{mode})),'MEMBERSHIP_EXPIRED');await reset();assert.deepEqual(await state(),expiredState);
  await pg.query('DELETE FROM public.workspace_members WHERE workspace_id=$1 AND user_id=$2',[W,recipient]);const removed=await state();await actor(recipient);
  for(const mode of ['accept','lookup'])rejected(await scalar(acceptSql(created.link.token,{mode})),'MEMBERSHIP_REMOVED');await reset();assert.deepEqual(await state(),removed);
 });
 await check('legacy, revoked, expired and already-consumed-by-another invitations never grant membership',async()=>{
  const created=await create();await reset();await pg.query("UPDATE public.workspace_invitations SET access_role=NULL WHERE id=$1",[created.result.invitationId]);await actor(recipient);rejected(await scalar(acceptSql(created.link.token)),'INVALID_ACCESS');
  await reset();await pg.query("UPDATE public.workspace_invitations SET access_role='admin',status='revoked' WHERE id=$1",[created.result.invitationId]);await actor(recipient);rejected(await scalar(acceptSql(created.link.token)),'INVITATION_REVOKED');
  await reset();await pg.query("UPDATE public.workspace_invitations SET status='pending',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[created.result.invitationId]);await actor(recipient);rejected(await scalar(acceptSql(created.link.token)),'INVITATION_EXPIRED');
  await reset();await pg.query("UPDATE public.workspace_invitations SET status='accepted',accepted_by=$1,accepted_at=clock_timestamp() WHERE id=$2",[outsider,created.result.invitationId]);await actor(recipient);rejected(await scalar(acceptSql(created.link.token)),'INVITATION_CONSUMED');assert.equal(await membership(),null);
 });
 console.log(`${passed}/${passed} isolated invitation SQL checks passed. No real account, invitation, membership, profile or message was changed. Concurrency is a separate required local gate.`);
}finally{await pg.close();}
