import assert from 'node:assert/strict';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {W,OTHER,owner,outsider,historical,alias,nullAlias,product,historicalPhone,actorSql,createSql,confirmSql,directSql,
 setupSql,guardMigration,businessStateSql,dependencyStateSql,permissionStateSql,literal} from './fixtures/slim-contact-guard-setup.mjs';

// Explicit LOCAL descriptor only. No DATABASE_URL, Supabase client, TCP fallback,
// download, installation or skip-as-success path. The test creates/drops its own
// disposable database and uses independent psql processes against real Postgres.
const descriptor=process.argv[2];
assert(descriptor,'Usage: node scripts/test-slim-contact-guard-concurrency.mjs /tmp/slim-pg-local.<suffix>/runtime.json');
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
   'PGAPPNAME=slim-contact-guard-'+label,join(runtime.bin,'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
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
const database='slim_contact_guard_'+randomUUID().replaceAll('-','');
let dbCreated=false,admin,observer,passed=0;
const evidence=[];
async function guardError(result,code='23505'){
 assert.equal(result.ok,false,'Expected the competing transaction to reject');assert.equal(result.error.code,code,result.error.message);
 if(code==='23505'){assert.equal(result.error.detail,'slim_leads_contact_phone_guard');assert.equal(result.error.constraint,'slim_leads_contact_phone_guard');assert.match(result.error.message,/Telefone já cadastrado\. Selecione o cliente existente\./);}
}
async function blocked(waiting,blocking){
 const deadline=Date.now()+2000;
 do{
  const info=await observer.scalar(`SELECT jsonb_build_object('waiting',EXISTS(SELECT 1 FROM pg_locks WHERE pid=${waiting} AND locktype='advisory' AND NOT granted),'blockedByFirst',${blocking}=ANY(pg_blocking_pids(${waiting})));`);
  if(info.waiting&&info.blockedByFirst)return info;
  await pause(20);
 }while(Date.now()<deadline);
 assert.fail('The second independent backend did not demonstrably wait on the first advisory lock.');
}
async function state(){return observer.scalar(businessStateSql);}
async function race(name,firstSql,secondSql,{finish='COMMIT',secondError='23505',verify}={}){
 const a=connection(database,name+'-one'),b=connection(database,name+'-two');
 try{
  const aPid=await a.scalar('SELECT pg_backend_pid();'),bPid=await b.scalar('SELECT pg_backend_pid();');assert.notEqual(aPid,bPid);
  const before=await state();await a.exec('BEGIN ISOLATION LEVEL READ COMMITTED;\n'+actorSql());await b.exec('BEGIN ISOLATION LEVEL READ COMMITTED;\n'+actorSql());
  const firstResult=await a.exec(firstSql);const pending=outcome(b.exec(secondSql));
  await blocked(bPid,aPid);await a.exec(finish+';');const result=await pending;
  if(secondError)await guardError(result,secondError);else{assert.equal(result.ok,true,result.error?.message);await b.exec('COMMIT;');}
  if(verify)await verify({before,after:await state(),firstResult,secondResult:result.lines});
  passed++;evidence.push({name,firstBackendPid:aPid,secondBackendPid:bPid,waitVerified:true,firstFinish:finish,secondResult:secondError??'committed'});
  console.log('PASS real PostgreSQL concurrency: '+name);
 }finally{await Promise.allSettled([a.end(),b.end()]);}
}
const assertOneLead=(before,after)=>{assert.equal(after.leads.length,before.leads.length+1);};
const unchangedCommerce=(before,after)=>{for(const key of ['orders','products','links','movements','documents','deliveries','changes'])assert.deepEqual(after[key],before[key],key);};
try{
 admin=connection('postgres','bootstrap');
 const server=await admin.scalar("SELECT jsonb_build_object('database',current_database(),'user',current_user,'version',current_setting('server_version'),'listen',current_setting('listen_addresses'),'unixSocket',inet_server_addr() IS NULL);");
 assert.equal(server.database,'postgres');assert.equal(server.user,'nobody');assert.equal(server.listen,'');assert.equal(server.unixSocket,true);assert.match(server.version,/^16\./);
 // SQL test roles are cluster-wide. Never alter an existing role or OS account.
 await admin.exec(`DO $$BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('authenticated','anon') AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'Unexpected privileged test role'; END IF;
 END;$$;`);
 await admin.exec('CREATE DATABASE '+database+';');dbCreated=true;
 observer=connection(database,'observer');await observer.exec(setupSql({includeRoles:false}));
 const baseline=await state(),dependencies=await observer.scalar(dependencyStateSql),permissions=await observer.scalar(permissionStateSql);
 await observer.exec('BEGIN;\n'+guardMigration()+'\nCOMMIT;');
 assert.deepEqual(await state(),baseline);assert.deepEqual(await observer.scalar(dependencyStateSql),dependencies);assert.deepEqual(await observer.scalar(permissionStateSql),permissions);
 passed++;console.log('PASS real PostgreSQL concurrency: exact current contracts loaded and guard installation preserves all synthetic baseline data/permissions');

 await race('direct creation versus direct creation',directSql('5511910000001',randomUUID()),directSql('+55 (11) 91000-0001',randomUUID()),{verify:({before,after})=>{assertOneLead(before,after);unchangedCommerce(before,after);assert.deepEqual(after.events,before.events);assert.deepEqual(after.requests,before.requests);}});
 await race('Funnel commit rejects competing checkout without partial sale',createSql('5511910000002',randomUUID()),confirmSql('+55 (11) 91000-0002',randomUUID()),{verify:({before,after})=>{assertOneLead(before,after);unchangedCommerce(before,after);assert.equal(after.events.length,before.events.length+1);assert.equal(after.requests.length,before.requests.length+1);}});
 await race('checkout commit rejects competing Funnel without partial event',confirmSql('5511910000003',randomUUID()),createSql('+55 (11) 91000-0003',randomUUID()),{verify:({before,after,firstResult})=>{
  assertOneLead(before,after);assert.deepEqual(after.events,before.events);assert.deepEqual(after.requests,before.requests);assert.equal(after.orders.length,before.orders.length+1);assert.equal(after.movements.length,before.movements.length+1);
  const receipt=JSON.parse(firstResult.at(-1)),order=after.orders.find(row=>row.id===receipt.orderId);assert.equal(receipt.totalCents,2126);assert.equal(order.shipping_cents,327);assert.equal(order.snapshot.fulfillment.mode,'delivery');
  assert.equal(after.products.find(p=>p.id===product).stock,before.products.find(p=>p.id===product).stock-2);
 }});
 await race('Funnel commit rejects competing direct integration',createSql('5511910000004',randomUUID()),directSql('5511910000004',randomUUID()),{verify:({before,after})=>{assertOneLead(before,after);unchangedCommerce(before,after);assert.equal(after.events.length,before.events.length+1);}});
 await race('rollback of direct writer releases checkout to commit exactly once',directSql('5511910000005',randomUUID()),confirmSql('5511910000005',randomUUID()),{finish:'ROLLBACK',secondError:null,verify:({before,after,secondResult})=>{
  assertOneLead(before,after);assert.equal(after.orders.length,before.orders.length+1);assert.equal(after.movements.length,before.movements.length+1);assert.deepEqual(after.events,before.events);
  const receipt=JSON.parse(secondResult.at(-1)),order=after.orders.find(row=>row.id===receipt.orderId);assert.equal(order.shipping_cents,327);assert.equal(receipt.totalCents,2126);assert.equal(after.products.find(p=>p.id===product).stock,before.products.find(p=>p.id===product).stock-2);
 }});
 const changing=randomUUID();await observer.exec(directSql('5511910000016',changing));
 await race('phone change waits and preserves its old identity after rejection',directSql('5511910000006',randomUUID()),`UPDATE public.leads SET phone='5511910000006',name='Must roll back' WHERE id='${changing}';`,{verify:({before,after})=>{assertOneLead(before,after);assert.deepEqual(after.leads.find(l=>l.id===changing),before.leads.find(l=>l.id===changing));unchangedCommerce(before,after);}});
 const reactivating=randomUUID();await observer.exec(directSql('5511910000007',reactivating,{status:'archived'}));
 await race('reactivation waits and remains archived after rejection',directSql('5511910000007',randomUUID()),`UPDATE public.leads SET status='active' WHERE id='${reactivating}';`,{verify:({before,after})=>{assertOneLead(before,after);assert.deepEqual(after.leads.find(l=>l.id===reactivating),before.leads.find(l=>l.id===reactivating));unchangedCommerce(before,after);}});
 const batchOne=randomUUID(),batchTwo=randomUUID();
 await race('competing multi-row statement rolls back its unrelated row too',directSql('5511910000008',randomUUID()),`INSERT INTO public.leads(id,workspace_id,name,phone) VALUES('${batchOne}','${W}','Batch collision','5511910000008'),('${batchTwo}','${W}','Batch unrelated','5511910000018');`,{verify:({before,after})=>{assertOneLead(before,after);assert(!after.leads.some(l=>[batchOne,batchTwo].includes(l.id)));unchangedCommerce(before,after);}});

 // Distinct workspace must complete while the Slim writer still holds its lock.
 {
  const a=connection(database,'other-workspace-one'),b=connection(database,'other-workspace-two');
  try{await a.exec('BEGIN;\n'+actorSql());await b.exec('BEGIN;\n'+actorSql(outsider));
   await a.exec(directSql('5511910000009',randomUUID()));await b.exec(directSql('5511910000009',randomUUID(),{workspace:OTHER}));await b.exec('COMMIT;');await a.exec('COMMIT;');
   passed++;console.log('PASS real PostgreSQL concurrency: another workspace commits before the Slim lock is released');
  }finally{await Promise.allSettled([a.end(),b.end()]);}
 }
 // A stalled creator must produce a bounded SQL rejection, never a second sale.
 {
  const a=connection(database,'timeout-one'),b=connection(database,'timeout-two');
  try{const before=await state(),aPid=await a.scalar('SELECT pg_backend_pid();'),bPid=await b.scalar('SELECT pg_backend_pid();');
   await a.exec('BEGIN;\n'+actorSql());await b.exec('BEGIN;\n'+actorSql());await a.exec(directSql('5511910000010',randomUUID()));
   const start=Date.now(),pending=outcome(b.exec(confirmSql('5511910000010',randomUUID())));await blocked(bPid,aPid);await guardError(await pending,'55P03');
   const elapsed=Date.now()-start;assert(elapsed>=4000&&elapsed<10000,'Expected the configured five-second lock timeout');await a.exec('ROLLBACK;');assert.deepEqual(await state(),before);
   passed++;evidence.push({name:'bounded lock wait',firstBackendPid:aPid,secondBackendPid:bPid,waitVerified:true,elapsedMs:elapsed,secondResult:'55P03'});console.log('PASS real PostgreSQL concurrency: lock timeout rejects without customer, order, stock or outbox effects');
  }finally{await Promise.allSettled([a.end(),b.end()]);}
 }
 // Opposite multi-key order can deadlock: PostgreSQL must reject one whole
 // transaction and allow the other to finish, without retrying either writer.
 {
  const a=connection(database,'deadlock-one'),b=connection(database,'deadlock-two');
  try{const before=await state(),aPid=await a.scalar('SELECT pg_backend_pid();'),bPid=await b.scalar('SELECT pg_backend_pid();');
   await a.exec('BEGIN;\n'+actorSql());await b.exec('BEGIN;\n'+actorSql());
   await a.exec(directSql('5511910000011',randomUUID()));await b.exec(directSql('5511910000012',randomUUID()));
   const pendingA=outcome(a.exec(directSql('5511910000012',randomUUID())));await blocked(aPid,bPid);
   const pendingB=outcome(b.exec(directSql('5511910000011',randomUUID()))),results=await Promise.all([pendingA,pendingB]);
   assert.equal(results.filter(r=>r.ok).length,1);const loser=results.find(r=>!r.ok);await guardError(loser,'40P01');
   await (results[0].ok?a:b).exec('COMMIT;');const after=await state();assert.equal(after.leads.length,before.leads.length+2);unchangedCommerce(before,after);
   assert.equal(await observer.scalar(`SELECT count(*)::int FROM (SELECT private.slim_funnel_contact_phone_key(phone) AS key FROM public.leads WHERE workspace_id='${W}' AND phone IN ('5511910000011','5511910000012') GROUP BY 1 HAVING count(*)>1) d;`),0);
   passed++;evidence.push({name:'opposite key order',firstBackendPid:aPid,secondBackendPid:bPid,waitVerified:true,secondResult:'one 40P01; one commit'});console.log('PASS real PostgreSQL concurrency: deadlock rejects the whole losing transaction without automatic replay');
  }finally{await Promise.allSettled([a.end(),b.end()]);}
 }
 const final=await state();
 for(const id of [historical,alias,nullAlias])assert.deepEqual(final.leads.find(l=>l.id===id),baseline.leads.find(l=>l.id===id));
 assert.deepEqual(final.orders.find(o=>o.id===baseline.orders[0].id),baseline.orders[0]);assert.deepEqual(final.links,baseline.links);
 assert.deepEqual(await observer.scalar(dependencyStateSql),dependencies);assert.deepEqual(await observer.scalar(permissionStateSql),permissions);
 const collisions=await observer.scalar(`SELECT jsonb_agg(jsonb_build_object('key',phone_key,'count',n) ORDER BY phone_key) FROM (SELECT private.slim_funnel_contact_phone_key(phone) phone_key,count(*)::int n FROM public.leads WHERE workspace_id='${W}' AND merged_into_id IS NULL AND (status IS NULL OR status NOT IN ('deleted','archived','merged')) GROUP BY 1 HAVING private.slim_funnel_contact_phone_key(phone) IS NOT NULL AND count(*)>1) groups;`);
 assert.deepEqual(collisions,[{key:historicalPhone,count:3}]);
 console.log(JSON.stringify({postgres:server.version,checks:passed,independentClients:evidence,baselineAliasesUnchanged:true,newEligibleCollisions:0}));
 console.log(`${passed}/${passed} real PostgreSQL concurrency checks passed. All data synthetic; disposable database removed on exit. No Supabase or commercial action.`);
}finally{
 await Promise.allSettled([...clients].filter(client=>client!==admin).map(client=>client.end()));
 if(dbCreated&&admin&&!admin.closed)await admin.exec('DROP DATABASE '+database+' WITH (FORCE);');
 if(admin)await admin.end();
}
