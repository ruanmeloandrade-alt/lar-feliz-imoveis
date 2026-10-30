
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const before=JSON.parse(readFileSync(new URL('./fixtures/slim-all-bots-before-readable.json',import.meta.url),'utf8'));
const operation=readFileSync(new URL('./operations/slim-all-bots-readable-20261019.sql',import.meta.url),'utf8');
const nativeSave=readFileSync(new URL('./fixtures/slim-salesbot-save-current.sql',import.meta.url),'utf8');
const db=new PGlite();
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table profiles(id uuid primary key,current_workspace_id uuid);
create table workspace_members(workspace_id uuid,user_id uuid);
create table salesbots(id uuid primary key default gen_random_uuid(),workspace_id uuid,local_id text,name text,scope text,gatilhos jsonb,settings jsonb,revision integer default 1,is_active boolean,updated_at timestamptz);
create table salesbot_blocks(id uuid primary key,salesbot_id uuid references salesbots(id),workspace_id uuid,local_id text,type text,config jsonb,position_x integer,position_y integer,next_block_id uuid);
create table salesbot_revisions(workspace_id uuid,salesbot_id uuid,revision integer,source_event text,actor_user_id uuid,request_id uuid);
`);
await db.exec(nativeSave);
const ws='c49945db-1960-461a-9339-a43b8403bdd9',owner='faaad2a3-52ef-41a6-846b-ee1f64f3ed38';
await db.query('insert into profiles values ($1,$2)',[owner,ws]);
await db.query('insert into workspace_members values ($1,$2)',[ws,owner]);
for(const b of before){
 await db.query('insert into salesbots(id,workspace_id,local_id,name,scope,gatilhos,settings,revision,is_active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[b.id,ws,b.local_id,b.name,b.settings.scope,b.gatilhos,b.settings,b.revision,b.is_active]);
 await db.query(`insert into salesbot_blocks select x.id,$1,$2,x.local_id,x.type,x.config,x.position_x,x.position_y,x.next_block_id from jsonb_to_recordset($3::jsonb) as x(id uuid,local_id text,type text,config jsonb,position_x integer,position_y integer,next_block_id uuid)`,[b.id,ws,JSON.stringify(b.blocks)]);
}
await db.exec(operation);
const first=await db.query('select id,revision,is_active,gatilhos from salesbots order by id');
for(const row of first.rows){
 const prior=before.find(b=>b.id===row.id);assert.equal(row.revision,prior.revision+1);assert.equal(row.is_active,prior.is_active);assert.deepEqual(row.gatilhos,prior.gatilhos);
}
assert.equal((await db.query('select count(*)::integer n from salesbot_blocks')).rows[0].n,562);
assert.equal((await db.query('select count(*)::integer n from salesbot_revisions')).rows[0].n,19);
assert.equal((await db.query(`select count(*)::integer n from salesbot_blocks where jsonb_path_exists(config,'$.roleta[*] ? (@.tipo == "regex")')`)).rows[0].n,0);
await assert.rejects(()=>db.exec(operation),/salesbot_revision_conflict/);
await db.exec('rollback');
assert.deepEqual((await db.query('select id,revision,is_active,gatilhos from salesbots order by id')).rows,first.rows);
assert.equal((await db.query('select count(*)::integer n from salesbot_revisions')).rows[0].n,19);
// Conflict in the middle must roll back the preceding bots too.
await db.query('update salesbots set revision=revision+1 where id=$1',[before[10].id]);
const mixed=await db.query('select id,revision from salesbots order by id');
const retry=operation.replaceAll(/'(91bf2fd5-069d-4aac-8997-[0-9]+)'/g,(match,id)=>"'"+id.replace('91bf2fd5','92bf2fd5')+"'");
const expectedRetry=before.reduce((sql,b)=>sql.replace("'"+b.local_id+"',\n"+b.revision+",","'"+b.local_id+"',\n"+(b.revision+1)+","),retry);
assert.notEqual(expectedRetry,retry);
await assert.rejects(()=>db.exec(expectedRetry),/salesbot_revision_conflict/);await db.exec('rollback');
assert.deepEqual((await db.query('select id,revision from salesbots order by id')).rows,mixed.rows);
await db.close();
console.log('PASS PostgreSQL: native RPC; 19 graphs/562 blocks; flags and triggers preserved; stale revision and mid-transaction conflict roll back without partial writes.');
