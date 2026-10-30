import assert from 'node:assert/strict';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {W,OTHER,owner,literal,actorSql,setupSql,invitationMigration,stateSql,permissionStateSql,functionStateSql,
 contextSql,changeSql,lookupSql,linkSql,acceptSql,createPayload} from './fixtures/slim-invitations-setup.mjs';
import {validateSlimInvitationReceipt,validateSlimInvitationAcceptance,validateSlimInvitationLink} from '../src/lib/slim-invitations.core.ts';

// Explicit LOCAL descriptor only. No DATABASE_URL, Supabase client, TCP fallback,
// download, installation or skip-as-success path. The test creates/drops its own
// disposable database and uses independent psql processes against real Postgres.
const descriptor=process.argv[2];
assert(descriptor,'Usage: node scripts/test-slim-invitations-concurrency.mjs /tmp/slim-pg-local.<suffix>/runtime.json');
assert.match(realpathSync(descriptor),/^\/tmp\/slim-pg-local\.[A-Za-z0-9]+\/runtime\.json$/);
const runtime=JSON.parse(readFileSync(descriptor,'utf8'));
assert.equal(runtime.root,realpathSync(join(descriptor,'..')));
assert.equal(runtime.bin,join(runtime.root,'rootfs/usr/lib/postgresql/16/bin'));
assert.equal(runtime.lib,join(runtime.root,'rootfs/usr/lib/x86_64-linux-gnu'));
assert.equal(runtime.socket,join(runtime.root,'socket'));
assert.equal(runtime.osUser,'nobody');assert.equal(runtime.dbUser,'nobody');assert.equal(runtime.database,'postgres');
assert.equal(runtime.listenAddresses,'');assert.equal(runtime.authLocal,'peer');
assert(Number.isInteger(runtime.port)&&runtime.port>1024&&runtime.port<65536);
const socket=statSync(runtime.socket);assert.equal(socket.uid,65534);assert.equal(socket.mode&0o777,0o700);
assert(statSync(join(runtime.socket,'.s.PGSQL.'+runtime.port)).isSocket());
assert.equal(process.getuid(),0,'Run this local harness as root so psql can use the existing nobody account via runuser.');

class Psql {
 constructor(database,label){
  this.pending=null;this.line='';this.stderr='';this.closed=false;
  this.child=spawn('/usr/sbin/runuser',['-u','nobody','--','env','-i','PATH=/usr/bin:/bin','LD_LIBRARY_PATH='+runtime.lib,
   'PGAPPNAME=slim-invitations-'+label,join(runtime.bin,'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
   '-P','pager=off','-h',runtime.socket,'-p',String(runtime.port),'-U',runtime.dbUser,'-d',database],{stdio:['pipe','pipe','pipe']});
  this.done=new Promise(resolve=>{this.child.once('close',code=>{
   this.closed=true;this.exitCode=code;
   if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);const error=new Error(this.stderr.trim()||'Local psql closed before confirming its statement.');
    error.code=this.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];error.detail=this.stderr.match(/DETAIL:\s+([^\n]+)/)?.[1];
    error.constraint=this.stderr.match(/CONSTRAINT NAME:\s+([^\n]+)/)?.[1];p.reject(error);}
   resolve();
  });});
  this.child.once('error',error=>{if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}});
  this.child.stdout.setEncoding('utf8');this.child.stderr.setEncoding('utf8');
  this.child.stderr.on('data',chunk=>{this.stderr+=chunk;});
  this.child.stdout.on('data',chunk=>{
   this.line+=chunk;let end;
   while((end=this.line.indexOf('\n'))>=0){const line=this.line.slice(0,end).replace(/\r$/,'');this.line=this.line.slice(end+1);
    const p=this.pending;if(!p)continue;
    if(line===p.marker){this.pending=null;clearTimeout(p.timer);p.resolve(p.lines);}else if(line!=='')p.lines.push(line);
   }
  });
 }
 exec(sql){
  assert(!this.pending&&!this.closed,'Each independent psql process executes one statement sequence at a time.');
  this.stderr='';const marker='SLIM_LOCAL_DONE_'+randomUUID().replaceAll('-','');
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.child.kill('SIGTERM');},15000);
   this.pending={marker,lines:[],resolve,reject,timer};this.child.stdin.write(sql+'\n\\echo '+marker+'\n');
  });
 }
 async scalar(sql){const lines=await this.exec(sql);assert(lines.length>0,'Expected local query result');return JSON.parse(lines.at(-1));}
 async end(){
  if(this.closed)return;
  if(this.pending)this.child.kill('SIGTERM');else this.child.stdin.end('\\q\n');
  const kill=setTimeout(()=>this.child.kill('SIGKILL'),1500);
  try{await this.done;}finally{clearTimeout(kill);}
 }
}
const clients=new Set();
const connection=(database,label)=>{const value=new Psql(database,label);clients.add(value);return value;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const outcome=promise=>promise.then(lines=>({ok:true,lines}),error=>({ok:false,error}));

const database='slim_invitations_'+randomUUID().replaceAll('-','');
let dbCreated=false,admin,observer,passed=0,personNumber=0;
const evidence=[];
const identity={workspaceId:W,actorId:owner};
const state=()=>observer.scalar(stateSql);
const decoded=lines=>JSON.parse(lines.at(-1));
const attempt=(request,action='create',invitationId=null)=>({...identity,requestId:request,action,invitationId});
function receipt(value,request,action='create',id=null){return validateSlimInvitationReceipt(value,attempt(request,action,id));}
function acceptance(value,person,invite,mode='accept'){return validateSlimInvitationAcceptance(value,{workspaceId:W,actorId:person.id,invitationId:invite.id,mode});}
async function actorRead(sql,actor=owner){
 await observer.exec('BEGIN;\n'+actorSql(actor));
 try{const result=await observer.scalar(sql);await observer.exec('COMMIT;');return result;}
 catch(error){if(!observer.closed)await observer.exec('ROLLBACK;');throw error;}
}
async function person(){
 const id=randomUUID(),email=`qa.concurrency.${++personNumber}@example.invalid`;
 // This observer only exists inside the disposable local database.
 await observer.exec(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${literal(id)},${literal(email)},clock_timestamp());
 INSERT INTO public.profiles(id,current_workspace_id) VALUES(${literal(id)},${literal(OTHER)});`);
 return {id,email};
}
async function review(email,action='create',id=null){const value=await actorRead(contextSql({action,email,id}));assert.equal(value.canProceed,true,value.reason);return value;}
async function prepared(person){
 const context=await review(person.email),request=randomUUID();
 const result=receipt(await actorRead(changeSql({request,payload:createPayload(person.email),fingerprint:context.expectedFingerprint})),request);
 assert.equal(result.status,'confirmed');
 const id=result.invitationId,link=validateSlimInvitationLink(await actorRead(linkSql(id)),{...identity,invitationId:id});
 return {id,token:link.token};
}
async function blocked(waiting,blocking){
 const deadline=Date.now()+2000;
 do{
  const info=await observer.scalar(`SELECT jsonb_build_object('waiting',EXISTS(SELECT 1 FROM pg_locks WHERE pid=${waiting} AND locktype='advisory' AND NOT granted),'blockedByFirst',${blocking}=ANY(pg_blocking_pids(${waiting})));`);
  if(info.waiting&&info.blockedByFirst)return;
  await pause(20);
 }while(Date.now()<deadline);
 assert.fail('The second independent backend did not demonstrably wait on the first advisory lock.');
}
async function race(name,firstSql,secondSql,{firstActor=owner,secondActor=owner,finish='COMMIT',verify}={}){
 const a=connection(database,name+'-one'),b=connection(database,name+'-two');
 try{
  const aPid=await a.scalar('SELECT pg_backend_pid();'),bPid=await b.scalar('SELECT pg_backend_pid();');assert.notEqual(aPid,bPid);
  const before=await state();
  await a.exec('BEGIN ISOLATION LEVEL READ COMMITTED;\n'+actorSql(firstActor));
  await b.exec('BEGIN ISOLATION LEVEL READ COMMITTED;\n'+actorSql(secondActor));
  const first=await a.scalar(firstSql),pending=outcome(b.exec(secondSql));
  await blocked(bPid,aPid);await a.exec(finish+';');const result=await pending;
  assert.equal(result.ok,true,result.error?.message);const second=decoded(result.lines);await b.exec('COMMIT;');
  await verify({first,second,before,after:await state()});
  passed++;evidence.push({name,firstBackendPid:aPid,secondBackendPid:bPid,waitVerified:true,firstFinish:finish,secondStatus:second.status,secondCode:second.code??null});
  console.log('PASS real PostgreSQL invitations: '+name);
 }finally{await Promise.allSettled([a.end(),b.end()]);}
}
function sameAccounts(before,after){for(const key of ['users','profiles','members','modules','permissions'])assert.deepEqual(after[key],before[key],key);}
try{
 admin=connection('postgres','bootstrap');
 const server=await admin.scalar("SELECT jsonb_build_object('database',current_database(),'user',current_user,'version',current_setting('server_version'),'listen',current_setting('listen_addresses'),'unixSocket',inet_server_addr() IS NULL);");
 assert.equal(server.database,'postgres');assert.equal(server.user,'nobody');assert.equal(server.listen,'');assert.equal(server.unixSocket,true);assert.match(server.version,/^16\./);
 await admin.exec(`DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('authenticated','anon') AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'Unexpected privileged test role'; END IF;
 END;$$;`);
 await admin.exec('CREATE DATABASE '+database+';');dbCreated=true;
 observer=connection(database,'observer');await observer.exec(setupSql({includeRoles:false}));
 const baseline=await state(),policies=await observer.scalar(permissionStateSql),functions=await observer.scalar(functionStateSql);
 await observer.exec('BEGIN;\n'+invitationMigration()+'\nCOMMIT;');
 assert.deepEqual(await state(),baseline);assert.deepEqual(await observer.scalar(permissionStateSql),policies);assert.deepEqual(await observer.scalar(functionStateSql),functions);
 passed++;console.log('PASS real PostgreSQL invitations: migration preserves every existing synthetic account, member, profile, invitation, permission and function');
 {
  const p=await person(),invite=await prepared(p);
  await race('two acceptances create one membership',acceptSql(invite.token,{actor:p.id}),acceptSql(invite.token,{actor:p.id}),{firstActor:p.id,secondActor:p.id,verify:({first,second,before,after})=>{
   assert.equal(acceptance(first,p,invite).status,'accepted');assert.equal(acceptance(second,p,invite).status,'already_accepted');
   assert.equal(first.acceptedAt,second.acceptedAt);assert.equal(after.members.length,before.members.length+1);
   const members=after.members.filter(m=>m.workspace_id===W&&m.user_id===p.id);assert.equal(members.length,1);
   assert.equal(members[0].role,'admin');assert.equal(members[0].role_type,'parceiro');assert.equal(members[0].is_partner,true);assert.equal(members[0].access_expires_at,null);
   assert.equal(after.profiles.find(row=>row.id===p.id).current_workspace_id,W);
   assert.deepEqual(after.modules,before.modules);assert.deepEqual(after.permissions,before.permissions);assert.deepEqual(after.users,before.users);
  }});
 }
 {
  const p=await person(),invite=await prepared(p),context=await review(p.email,'renew',invite.id),request=randomUUID();
  await race('renewal invalidates a concurrently accepted old token',changeSql({request,action:'renew',payload:{invitationId:invite.id},fingerprint:context.expectedFingerprint}),acceptSql(invite.token,{actor:p.id}),{secondActor:p.id,verify:({first,second,before,after})=>{
   assert.equal(receipt(first,request,'renew',invite.id).status,'confirmed');
   assert.equal(acceptance(second,p,invite).status,'rejected');assert.equal(second.code,'INVITATION_UNAVAILABLE');sameAccounts(before,after);
   const latest=after.invites.find(i=>i.id===invite.id);assert.equal(latest.status,'pending');assert.notEqual(latest.token,invite.token);
  }});
 }
 {
  const p=await person(),invite=await prepared(p),context=await review(p.email,'renew',invite.id),request=randomUUID();
  await race('acceptance invalidates the competing renewal review',acceptSql(invite.token,{actor:p.id}),changeSql({request,action:'renew',payload:{invitationId:invite.id},fingerprint:context.expectedFingerprint}),{firstActor:p.id,verify:({first,second,before,after})=>{
   assert.equal(acceptance(first,p,invite).status,'accepted');assert.equal(receipt(second,request,'renew',invite.id).status,'rejected');assert.equal(second.code,'STALE_CONTEXT');
   assert.equal(after.members.length,before.members.length+1);const latest=after.invites.find(i=>i.id===invite.id);assert.equal(latest.status,'accepted');assert.equal(latest.token,invite.token);
   assert.deepEqual(after.modules,before.modules);assert.deepEqual(after.permissions,before.permissions);
  }});
 }
 {
  const p=await person(),invite=await prepared(p),context=await review(p.email,'revoke',invite.id),request=randomUUID();
  await race('revocation prevents a concurrent acceptance',changeSql({request,action:'revoke',payload:{invitationId:invite.id},fingerprint:context.expectedFingerprint}),acceptSql(invite.token,{actor:p.id}),{secondActor:p.id,verify:({first,second,before,after})=>{
   assert.equal(receipt(first,request,'revoke',invite.id).status,'confirmed');assert.equal(acceptance(second,p,invite).status,'rejected');assert.equal(second.code,'INVITATION_REVOKED');sameAccounts(before,after);
  }});
 }
 {
  const p=await person(),context=await review(p.email),request=randomUUID();
  await race('lookup waits for the same creation and recovers its receipt',changeSql({request,payload:createPayload(p.email),fingerprint:context.expectedFingerprint}),lookupSql({request}),{verify:({first,second,before,after})=>{
   assert.equal(receipt(first,request).status,'confirmed');assert.deepEqual(receipt(second,request),receipt(first,request));sameAccounts(before,after);
   assert.equal(after.invites.length,before.invites.length+1);assert.equal(after.invites.filter(i=>i.email===p.email).length,1);
  }});
 }
 {
  const p=await person(),context=await review(p.email),request=randomUUID(),change=changeSql({request,payload:createPayload(p.email),fingerprint:context.expectedFingerprint});
  await race('absent lookup closes the attempt before a delayed creation',lookupSql({request}),change,{verify:({first,second,before,after})=>{
   assert.equal(receipt(first,request).status,'rejected');assert.equal(first.code,'REQUEST_CLOSED');assert.deepEqual(receipt(second,request),receipt(first,request));assert.deepEqual(after,before);
  }});
  const late=receipt(await actorRead(change),request);assert.equal(late.code,'REQUEST_CLOSED');
  assert.equal(await observer.scalar(`SELECT count(*)::integer FROM public.workspace_invitations WHERE email=${literal(p.email)};`),0);
 }
 {
  const p=await person(),context=await review(p.email),request=randomUUID();
  await race('rollback releases lookup to close without a phantom invitation',changeSql({request,payload:createPayload(p.email),fingerprint:context.expectedFingerprint}),lookupSql({request}),{finish:'ROLLBACK',verify:({first,second,before,after})=>{
   assert.equal(receipt(first,request).status,'confirmed');assert.equal(receipt(second,request).status,'rejected');assert.equal(second.code,'REQUEST_CLOSED');assert.deepEqual(after,before);
  }});
 }
 // The invitation starts valid, then expires while acceptance waits for the
 // recipient's profile row. Observe the real row lock before crossing its TTL.
 {
  const p=await person(),invite=await prepared(p),a=connection(database,'expiry-holder'),b=connection(database,'expiry-acceptor');
  try{
   const aPid=await a.scalar('SELECT pg_backend_pid();'),bPid=await b.scalar('SELECT pg_backend_pid();');assert.notEqual(aPid,bPid);
   await a.exec(`BEGIN; SELECT id FROM public.profiles WHERE id=${literal(p.id)} FOR UPDATE;`);
   await b.exec('BEGIN;\n'+actorSql(p.id));
   await observer.exec(`UPDATE public.workspace_invitations SET expires_at=clock_timestamp()+interval '1200 milliseconds' WHERE id=${literal(invite.id)};`);
   const before=await state(),pending=outcome(b.exec(acceptSql(invite.token,{actor:p.id})));
   let rowWait=false;const waitUntil=Date.now()+900;
   do{
    rowWait=await observer.scalar(`SELECT to_jsonb(${aPid}=ANY(pg_blocking_pids(${bPid})) AND EXISTS(SELECT 1 FROM pg_locks WHERE pid=${bPid} AND NOT granted AND locktype IN ('tuple','transactionid')));`);
    if(rowWait)break;
    await pause(15);
   }while(Date.now()<waitUntil);
   assert.equal(rowWait,true,'Acceptance must demonstrably wait on the held profile row.');
   assert.equal(await observer.scalar(`SELECT to_jsonb(expires_at>clock_timestamp()) FROM public.workspace_invitations WHERE id=${literal(invite.id)};`),true,'The token must still be valid after the profile wait is observed.');
   const expiryDeadline=Date.now()+2200;let expired=false;
   do{
    expired=await observer.scalar(`SELECT to_jsonb(expires_at<=clock_timestamp()) FROM public.workspace_invitations WHERE id=${literal(invite.id)};`);
    if(expired)break;
    await pause(20);
   }while(Date.now()<expiryDeadline);
   assert.equal(expired,true);await a.exec('COMMIT;');const result=await pending;
   assert.equal(result.ok,true,result.error?.message);const rejected=acceptance(decoded(result.lines),p,invite);
   assert.equal(rejected.status,'rejected');assert.equal(rejected.code,'INVITATION_EXPIRED');await b.exec('COMMIT;');
   assert.deepEqual(await state(),before,'Crossing TTL must not consume the invite, create a membership, or select the profile company.');
   passed++;evidence.push({name:'expiry while waiting for profile row',firstBackendPid:aPid,secondBackendPid:bPid,rowWaitVerified:true,validWhenWaitObserved:true,expiredBeforeRelease:true,secondCode:rejected.code});
   console.log('PASS real PostgreSQL invitations: expiry during a verified profile-row wait rejects without account or membership effects');
  }finally{await Promise.allSettled([a.end(),b.end()]);}
 }
 const final=await state();
 for(const key of ['users','profiles','members','invites'])for(const row of baseline[key])assert.deepEqual(final[key].find(x=>x.id===row.id),row,'Existing '+key+' preserved');
 assert.deepEqual(final.modules,baseline.modules);assert.deepEqual(final.permissions,baseline.permissions);
 assert.deepEqual(await observer.scalar(permissionStateSql),policies);assert.deepEqual(await observer.scalar(functionStateSql),functions);
 assert.equal(await observer.scalar(`SELECT count(*)::integer FROM (SELECT workspace_id,user_id FROM public.workspace_members GROUP BY workspace_id,user_id HAVING count(*)>1) duplicated;`),0);
 console.log(JSON.stringify({postgres:server.version,checks:passed,independentClients:evidence,baselineAccountsAndPermissionsUnchanged:true,newDuplicateMemberships:0}));
 console.log(`${passed}/${passed} real PostgreSQL invitation checks passed. Synthetic accounts only; disposable database removed on exit. No Supabase, email or WhatsApp operation.`);
}finally{
 await Promise.allSettled([...clients].filter(client=>client!==admin).map(client=>client.end()));
 if(dbCreated&&admin&&!admin.closed)await admin.exec('DROP DATABASE '+database+' WITH (FORCE);');
 if(admin)await admin.end();
}
