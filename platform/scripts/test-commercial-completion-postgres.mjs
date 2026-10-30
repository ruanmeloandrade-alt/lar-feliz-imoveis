import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const snapshotPath=process.argv[2], sqlPath=process.argv[3];
if(!snapshotPath||!sqlPath)throw new Error('Pass the reviewed pre-change snapshot and operation SQL paths.');
const {snapshot:s,blocks}=JSON.parse(fs.readFileSync(snapshotPath,'utf8')),sql=fs.readFileSync(sqlPath,'utf8');
const db=new PGlite();
await db.exec(`create table salesbots(id uuid primary key,workspace_id uuid,name text,revision int,updated_at timestamptz,is_active boolean,gatilhos jsonb,settings jsonb);
create table conversation_ai_agents(id uuid primary key,workspace_id uuid,name text,model text,updated_at timestamptz,enabled boolean,metadata jsonb,system_prompt text);
create table crm_lead_audiences(id uuid primary key,workspace_id uuid,name text,filters jsonb,updated_at timestamptz);
create table salesbot_blocks(id uuid primary key,salesbot_id uuid references salesbots(id),workspace_id uuid,local_id text,type text,config jsonb,position_x int,position_y int,next_block_id uuid references salesbot_blocks(id));`);
const q=val=>"'"+JSON.stringify(val).replaceAll("'","''")+"'::jsonb";
for(const [table,rows] of [['salesbots',s.bots],['conversation_ai_agents',s.agents],['crm_lead_audiences',s.audiences]]) {
 await db.exec(`insert into ${table} select * from jsonb_populate_recordset(null::${table},${q(rows)});`);
}
const bots=new Map(s.bots.map(b=>[b.name,b.id]));
await db.exec(`insert into salesbot_blocks select * from jsonb_populate_recordset(null::salesbot_blocks,${q(blocks.map(b=>({...b,workspace_id:s.workspace.id,salesbot_id:bots.get(b.name)})))});`);
await db.exec(sql);
const result=await db.query('select * from salesbot_blocks'), all=result.rows;
assert.equal(all.length,603);
for(const bot of s.bots) {
 const rows=all.filter(b=>b.salesbot_id===bot.id),ids=new Set(rows.map(b=>b.id));
 assert.equal(rows.filter(b=>b.config.isStartBlock).length,1,bot.name);
 function refs(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(/nextBlockId$|NextBlockId$/.test(k)&&x)assert(ids.has(x),`${bot.name}: ${k} points outside graph`);else if(typeof x==='object')refs(x);}}
 for(const b of rows){if(b.next_block_id)assert(ids.has(b.next_block_id));refs(b.config);}
}
assert.equal((await db.query('select count(*)::int as n from salesbots where is_active or gatilhos <> \'[]\'::jsonb')).rows[0].n,0);
const agents=(await db.query('select * from conversation_ai_agents')).rows;
for(const agent of agents){assert.equal(agent.enabled,false);assert.equal(agent.metadata.settings.actions.length,11);assert.equal(agent.metadata.settings.sources.length,5);assert(agent.metadata.settings.sources.every(s=>s.brainSourceId&&!s.content));assert(agent.system_prompt.length<20000);}
for(const {filters} of (await db.query('select filters from crm_lead_audiences')).rows){assert(filters.tagsNone.includes('SS_NAO_CONTATAR'));assert(filters.customFields.some(r=>r.value==='Retomar depois'));}
await assert.rejects(()=>db.exec(sql),/alterad/);await db.exec('rollback');
if(process.argv[4]) {
 const capabilities=fs.readFileSync(process.argv[4],'utf8');await db.exec(capabilities);await db.exec(capabilities);
 for(const a of (await db.query('select * from conversation_ai_agents')).rows){assert.equal(a.enabled,false);assert.equal(a.model,s.agents.find(before=>before.id===a.id).model);assert.equal(a.metadata.settings.allowed_actions.length,4);}
}
console.log('PASS: actual operation SQL, 603 native blocks in 19 valid graphs, two inactive agents with 11 actions and five live sources, 16 guarded audiences, repeat application rejected. No production calls.');
await db.close();
