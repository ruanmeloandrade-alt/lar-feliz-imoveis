import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; grant usage on schema public,auth,private to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text);
create table public.workspaces(id uuid primary key,owner_id uuid);
create table public.workspace_members(workspace_id uuid,user_id uuid,role text,access_expires_at timestamptz);
create table public.profiles(id uuid,display_name text,full_name text);
create table public.workflow_sectors(id uuid primary key,workspace_id uuid);
create table public.workflow_sector_members(sector_id uuid,user_id uuid);
create table public.salesbot_blocks(id uuid primary key,workspace_id uuid,salesbot_id uuid);
create table public.salesbot_runs(id uuid primary key,workspace_id uuid,salesbot_id uuid,status text,variables jsonb,stopped_at timestamptz,waiting_until timestamptz,current_block_id uuid,updated_at timestamptz);
grant all on public.salesbot_runs,public.salesbot_blocks to service_role;
create function private.slim_session_security_allowed() returns boolean language sql stable as $$select coalesce(current_setting('test.session',true),'')='valid'$$;
create function private.slim_workspace_access(ws uuid,level text default 'member') returns boolean language sql stable security definer as $$
select exists(select 1 from public.workspace_members m where m.workspace_id=ws and m.user_id=auth.uid() and (m.access_expires_at is null or m.access_expires_at>now()) and (level<>'admin' or m.role='admin'))$$;
grant select on public.workflow_sectors,public.workflow_sector_members,public.workspace_members to authenticated;
`);
for (const name of ['20261024104500_slim_salesbot_round_robin.sql','20261024104600_slim_team_chat_delivery.sql','20261024105500_slim_salesbot_batch_pause.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
const u='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',ws='00000000-0000-4000-8000-000000000010',foreign='00000000-0000-4000-8000-000000000020',block='00000000-0000-4000-8000-000000000030';
await db.exec(`insert into auth.users values ('${u}','qa@example.com'),('${other}','other@example.com');insert into public.workspaces values ('${ws}','${u}'),('${foreign}','${other}');insert into public.workspace_members values ('${ws}','${u}','admin',null),('${foreign}','${other}','admin',null);insert into public.profiles values ('${u}','QA',null),('${other}','Other',null);insert into public.salesbot_blocks values ('${block}','${ws}','${u}');`);
async function asActor(role,actor,session,fn){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('test.session',$2,true)",[actor,session]);await db.exec('set local role '+role);const result=await fn();await db.exec('rollback');return result;}catch(error){await db.exec('rollback');throw error;}}
const picks=await asActor('service_role','','valid',async()=>{const out=[];for(let n=0;n<6;n++)out.push((await db.query(`select public.salesbot_rr_next('${block}',2) n`)).rows[0].n);return out;});assert.deepEqual(picks,[0,1,0,1,0,1]);
await db.query(`insert into public.salesbot_runs(id,workspace_id,salesbot_id,status,variables) values ($1,$2,$3,'waiting_message',$4)`,[other,ws,u,{salesbot_waiting_branch:{waitingEvents:[{type:'lote-msgs',remaining:2}]}}]);
await asActor('service_role','','valid',async()=>{
 const decrement=async()=> (await db.query(`select public.salesbot_batch_decrement($1,'QA',null,null,$2) result`,[other,block])).rows[0].result;
 assert.deepEqual(await decrement(),{success:true,completed:false,remaining:1});
 assert.deepEqual(await decrement(),{success:true,completed:true,remaining:0});
 assert.equal((await decrement()).success,false,'a completed batch cannot resume twice');
});
await assert.rejects(()=>asActor('authenticated',u,'valid',()=>db.query(`select public.salesbot_batch_decrement($1,'QA',null,null,$2)`,[other,block])),/permission denied/);
await assert.rejects(()=>asActor('authenticated',u,'valid',()=>db.query(`select public.salesbot_rr_next('${block}',2)`)),/permission denied/);
await asActor('authenticated',u,'valid',async()=>{
 assert.equal((await db.query(`select * from public.list_workspace_users('${ws}')`)).rows.length,1);
 assert.equal((await db.query(`select * from public.list_workspace_users('${foreign}')`)).rows.length,0);
 assert.equal((await db.query(`select public.can_admin_workspace('${other}','${foreign}') ok`)).rows[0].ok,false);
});
await db.query(`insert into public.team_messages(workspace_id,to_user_id,body,origin) values ($1,$2,'QA system','salesbot')`,[ws,u]);
await asActor('authenticated',u,'valid',async()=>{assert.equal((await db.query('select * from public.team_messages')).rows.length,1);});
await asActor('authenticated',other,'valid',async()=>{assert.equal((await db.query('select * from public.team_messages')).rows.length,0);});
await asActor('authenticated',u,'invalid',async()=>{assert.equal((await db.query('select * from public.team_messages')).rows.length,0);assert.equal((await db.query(`select * from public.list_workspace_users('${ws}')`)).rows.length,0);});
for(const sql of [
 `insert into public.team_messages(workspace_id,to_user_id,from_user_id,body) values ('${foreign}','${other}','${u}','wrong workspace')`,
 `insert into public.team_messages(workspace_id,to_user_id,from_user_id,body) values ('${ws}','${other}','${u}','wrong recipient')`,
 `insert into public.team_messages(workspace_id,to_user_id,body,origin) values ('${ws}','${u}','forged system','salesbot')`,
 `update public.team_messages set body='tampered'`,
]) await assert.rejects(()=>asActor('authenticated',u,'valid',()=>db.exec(sql)),/permission denied|row-level security/);
await asActor('authenticated',u,'valid',()=>db.query(`insert into public.team_messages(workspace_id,to_user_id,from_user_id,body) values ($1,$2,$2,'QA self')`,[ws,u]));

const source=readFileSync(new URL('../src/lib/salesbot-runtime.server.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('runtime.ts',source,ts.ScriptTarget.Latest,true);
function find(node,test){if(test(node))return node;let result;node.forEachChild(child=>{if(!result)result=find(child,test);});return result;}
function clause(kind){return find(ast,node=>ts.isCaseClause(node)&&node.expression.getText(ast)===JSON.stringify(kind)).getText(ast);}
function execute(kind,env){const js=ts.transpileModule('async function test(b){switch(b.type){'+clause(kind)+'}}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return Function(...Object.keys(env),js+';return test')(...Object.values(env));}
await assert.rejects(()=>execute('round-robin',{supabaseAdmin:{rpc:async()=>({data:null,error:{message:'unavailable'}})},run:{}})({type:'round-robin',config:{roleta:[{id:'a',nextBlockId:'target'}]}}),/reservar/);
const logs=[];
const query={select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:u}})};
const run={id:u,workspace_id:ws},lead={id:other};
const fakeDb={from:table=>table==='workspace_members'?query:{insert:async()=>table==='team_messages'?{error:{message:'database unavailable'}}:{error:null}}};
await execute('msg-interna',{supabaseAdmin:fakeDb,run,lead,interpolate:text=>text,log:async(_db,_run,_block,status,message)=>logs.push({status,message})})({type:'msg-interna',config:{texto:'QA',msgInternaDestinoId:u}});
assert.deepEqual(logs.map(row=>row.status),['error'],'failed delivery must not also log success');
const types=readFileSync(new URL('../src/lib/salesbot-types.ts',import.meta.url),'utf8');
const typeAst=ts.createSourceFile('types.ts',types,ts.ScriptTarget.Latest,true);
const filter=find(typeAst,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='filterBlockCatalogByScope');
const filterJs=ts.transpileModule(filter.getText(typeAst).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const catalog=[{kind:'enviar-dm'},{kind:'comentario'},{kind:'enviar-mensagem'}];
const filterFn=Function('BLOCK_CATALOG','BLOCK_KINDS_HIDDEN_FOR_GROUP','BLOCK_KINDS_SOCIAL_COMENTARIO','BLOCK_KINDS_ONLY_GROUP',filterJs+';return filterBlockCatalogByScope')(catalog,[],['comentario','enviar-dm','enviar-mensagem'],[]);
for(const scope of ['individual','grupo','social-comentario'])assert.deepEqual(filterFn(scope),[{kind:'enviar-mensagem'}]);
const actions=find(typeAst,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='filterAcoesByScope');
const actionsJs=ts.transpileModule(actions.getText(typeAst).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const actionsFn=Function('ACAO_OPCOES','ACOES_GRUPO',actionsJs+';return filterAcoesByScope')([{value:'enviar-email'},{value:'nota'}],['enviar-email','nota']);
for(const scope of ['individual','grupo'])assert.deepEqual(actionsFn(scope),[{value:'nota'}]);
const identitySource=readFileSync(new URL('../src/lib/slim-contact-identity.core.ts',import.meta.url),'utf8');
const identityAst=ts.createSourceFile('identity.ts',identitySource,ts.ScriptTarget.Latest,true);
const identityCode=['contactPhoneKey','contactWhatsappSession','buildContactIdentityIndex'].map(name=>find(identityAst,node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(identityAst).replace(/^export /,'')).join('\n');
const identityJs=ts.transpileModule(identityCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const indexFn=Function('UUID',identityJs+';return buildContactIdentityIndex')(/^[0-9a-f-]{36}$/i);
const contact=(id,session)=>({id,workspace_id:ws,name:'QA',phone:'+5521999999999',status:'active',source:'cadastro_manual_saude_slim',merged_into_id:null,created_at:'2026-10-24',custom_data:session?{whatsapp_session_id:session}:{}});
assert.equal(indexFn([contact(u)],ws).forPhone('5521999999999','session-a').id,u,'a unique unbound manual contact can receive its first attested session');
assert.equal(indexFn([contact(u,'session-a')],ws).forPhone('5521999999999','session-b'),null,'never reuse another session contact');
assert.equal(indexFn([contact(u),contact(other)],ws).forPhone('5521999999999','session-a'),null,'ambiguous unbound contacts fail closed');
assert.equal(indexFn([contact(u,'session-a'),contact(other,'session-b')],ws).forPhone('5521999999999','session-b').id,other);
assert.equal(indexFn([contact(u),contact(other,'session-b')],ws).forPhone('5521999999999','session-a'),null);
const action=find(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='runAction');
const fieldClause=find(action,node=>ts.isCaseClause(node)&&node.expression.getText(ast)==='"definir-campo"');
const fieldJs=ts.transpileModule('async function test(block){const cfg=block.config,val="";switch(cfg.acaoTipo){'+fieldClause.getText(ast).replaceAll('const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");','')+'}}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const valueHelper=find(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='customValueToText');
const valueJs=ts.transpileModule(valueHelper.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const displayValue=Function(valueJs+';return customValueToText')();
let currentValue={display:'A'},writes=0;const fired=[];
const fieldQuery={select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:u,name:'QA'},error:null})};
const valuesQuery={select(){return this},eq(){return this},maybeSingle:async()=>({data:{value:currentValue},error:null}),upsert:async row=>{writes++;currentValue=row.value;return{error:null}}};
const setField=Function('supabaseAdmin','run','lead','customValueToText','enqueueLeadAutomationEvent','dispatchCustomFieldChanged',fieldJs+';return test')({from:table=>table==='lead_custom_fields'?fieldQuery:valuesQuery},run,{id:other},displayValue,async()=>{},async(_db,input)=>fired.push(input));
const fieldBlock={config:{acaoTipo:'definir-campo',campoId:u,campoValor:'B',campoOrigem:'manual'}};
assert.equal((await setField(fieldBlock)).ok,true);assert.equal(fired.length,1);assert.equal(fired[0].fieldId,u);assert.equal(fired[0].value,'B');
assert.equal((await setField(fieldBlock)).ok,true);assert.equal(fired.length,1);assert.equal(writes,1,'unchanged values must not fire bots again');
for(const inHours of [true,false])for(const type of ['exceto-expediente','exceto-fora-expediente'])for(const multi of [true,false]){
 const changes=[];const start=new Date(Date.now()+120000),end=new Date(Date.now()+240000);
 const update={eq(){return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};
 const db={from:()=>({update:patch=>{changes.push(patch);return update;}})};
 const pause=execute('pausar',{supabaseAdmin:db,run:{id:u,variables:{}},lead:{},bhCfg:{},isBusinessHoursNow:()=>inHours,nextBusinessHoursStart:()=>start,nextBusinessHoursEnd:()=>end,SHORT_PAUSE_MAX_MS:60000,log:async()=>{}});
 await pause({id:block,type:'pausar',next_block_id:'next',config:multi?{pausas:[{id:'p',tipo:type,nextBlockId:'next'}]}:{pausaTipo:type}});
 const expectedWait=type==='exceto-expediente'?inHours:!inHours;
 assert.equal(changes.length>0,expectedWait,`${type}, inHours=${inHours}, multi=${multi}`);
 if(expectedWait)assert.equal(changes[0].waiting_until,(type==='exceto-expediente'?end:start).toISOString());
}
for(const multi of [true,false]){
 const pause=execute('pausar',{supabaseAdmin:{},run:{id:u,variables:{}},lead:{},findLatestSentMedia:()=>null});
 await assert.rejects(()=>pause({id:block,type:'pausar',config:multi?{pausas:[{id:'a',tipo:'audio-aberto'}]}:{pausaTipo:'audio-aberto'}}),/Envie a mídia/);
}
const resume=find(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='resumeRunsOnMediaEvent');
const resumeJs=ts.transpileModule(resume.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const expected of [null,'different','actual']){
 const updates=[];const rows=[{id:u,current_block_id:null,variables:{salesbot_waiting_branch:{waitingEvents:[{type:'audio-aberto',messageId:expected}]}}}];
 const query={select(){return this},eq(){return this},then(resolve){return Promise.resolve({data:rows}).then(resolve)},update(patch){updates.push(patch);return this}};
 const resumeFn=Function(resumeJs+';return resumeRunsOnMediaEvent')();
 await resumeFn({from:()=>query},{workspaceId:ws,leadId:other,messageId:'actual',status:'read'});
 assert.equal(updates.length,expected==='actual'?1:0,'read receipts must match the exact media message');
}
await db.close();
console.log('PASS: real PostgreSQL migrations/RLS/session restrictions, recipient/workspace isolation, system sender protection, atomic distribution, actual runtime reports failed delivery/allocation, social blocks hidden in all pickers.');
