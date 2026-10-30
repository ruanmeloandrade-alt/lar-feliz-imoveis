import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let checks=0;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),W=id(100),OTHER=id(101),sessions=[id(201),id(202),id(203)],leads=[id(1),id(2),id(3)];
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function reject(sql,args,code){await assert.rejects(db.query(sql,args),error=>error.code===code);checks++;}
try{
 await db.exec(`create role anon;create role authenticated;create schema private;
 create table whatsapp_web_sessions(id uuid primary key,workspace_id uuid,phone_number text,status text);
 create table leads(id uuid primary key,workspace_id uuid,phone_normalized text,source text,custom_data jsonb,merged_into_id uuid,stage_id uuid,status text);
 create unique index leads_wa_workspace_phone_active_unique on leads(workspace_id,phone_normalized) where source='whatsapp' and merged_into_id is null and phone_normalized is not null;
 create table whatsapp_web_messages(id uuid primary key,workspace_id uuid,session_id uuid,body text);
 create table salesbot_runs(id uuid primary key,lead_id uuid,status text,variables jsonb);
 create table slim_audience_campaigns(id uuid primary key,workspace_id uuid,session_id uuid,kind text);
 create table slim_audience_deliveries(id uuid primary key default gen_random_uuid(),campaign_id uuid,workspace_id uuid,lead_id uuid,recipient_key text,phone text,unique(campaign_id,recipient_key));`);
 for(const [n,s]of sessions.entries())await db.query('insert into whatsapp_web_sessions values($1,$2,$3,$4)',[s,W,'55000000000'+n,'conectado']);
 await db.query('insert into whatsapp_web_sessions values($1,$2,$3,$4)',[id(204),OTHER,'550000000004','conectado']);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261019190229_slim_whatsapp_origin.sql',import.meta.url),'utf8'));
 for(const [n,s]of sessions.entries()){
  await db.query("insert into leads values($1,$2,'5599999999999','whatsapp',$3,null,$4,'active')",[leads[n],W,JSON.stringify({whatsapp_session_id:s}),id(400+n)]);checks++;
  await db.query("insert into salesbot_runs values($1,$2,'running',$3)",[id(500+n),leads[n],JSON.stringify({followup:'independent-'+n})]);
 }
 assert.equal(await scalar('select count(*)::int from leads'),3);checks++;
 await reject("insert into leads values($1,$2,'5599999999999','whatsapp',$3,null,null,'active')",[id(4),W,JSON.stringify({whatsapp_session_id:sessions[0]})],'23505');
 await reject('update leads set custom_data=$1 where id=$2',[JSON.stringify({whatsapp_session_id:sessions[1]}),leads[0]],'23514');
 await reject("update leads set custom_data='{}' where id=$1",[leads[0]],'23514');
 await reject('update leads set workspace_id=$1 where id=$2',[OTHER,leads[0]],'23514');
 await reject('update leads set merged_into_id=$1 where id=$2',[leads[1],leads[0]],'23514');
 await reject("insert into leads values($1,$2,'5599999999998','whatsapp',$3,null,null,'active')",[id(5),W,JSON.stringify({whatsapp_session_id:id(204)})],'23514');
 await db.query("update leads set stage_id=$1,custom_data=custom_data||'{\"followup\":true}'::jsonb where id=$2",[id(900),leads[0]]);
 assert.equal(await scalar("select custom_data->>'whatsapp_session_id' from leads where id=$1",[leads[0]]),sessions[0]);checks++;
 assert.equal(await scalar('select stage_id::text from leads where id=$1',[leads[1]]),id(401));checks++;
 assert.equal(await scalar("select variables->>'followup' from salesbot_runs where lead_id=$1",[leads[1]]),'independent-1');checks++;
 await db.query("insert into whatsapp_web_messages values($1,$2,$3,'Original')",[id(700),W,sessions[0]]);
 await reject('update whatsapp_web_messages set session_id=$1 where id=$2',[sessions[1],id(700)],'23514');
 assert.equal(await scalar('select body from whatsapp_web_messages where id=$1',[id(700)]),'Original');checks++;
 await db.query("insert into slim_audience_campaigns values($1,$2,$3,'text')",[id(800),W,sessions[0]]);
 for(const [n,lead]of leads.entries()){
  await db.query("insert into slim_audience_deliveries(campaign_id,workspace_id,lead_id,recipient_key,phone) values($1,$2,$3,'legacy-phone','5599999999999')",[id(800),W,lead]);
  assert.equal(await scalar('select origin_session_id::text from slim_audience_deliveries where lead_id=$1',[lead]),sessions[n]);checks++;
 }
 assert.equal(await scalar('select count(*)::int from slim_audience_deliveries'),3);checks++;
 await reject("insert into slim_audience_deliveries(campaign_id,workspace_id,lead_id,recipient_key,phone) values($1,$2,$3,'another-key','5599999999999')",[id(800),W,leads[0]],'23505');
 console.log(`PASS WhatsApp origin: ${checks} PostgreSQL checks. Three cards, one phone, independent stages/bots, immutable origin, tenant isolation and preserved messages.`);
}finally{await db.close();}
