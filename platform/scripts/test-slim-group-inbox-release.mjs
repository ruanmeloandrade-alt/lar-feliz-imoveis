import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {parseSlimInboxGroupConversationKey} from '../src/lib/slim-inbox-group-key.core.ts';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let passed=0;
async function check(title,fn){await fn();passed++;console.log('PASS slim group Inbox: '+title);}

const S1='33333333-3333-4333-8333-333333333333',S2='44444444-4444-4444-8444-444444444444';
await check('composite key preserves original WhatsApp session/JID',()=>{
 assert.deepEqual(parseSlimInboxGroupConversationKey(S1+'|100001@g.us','100001@g.us'),{sessionId:S1,groupJid:'100001@g.us'});
 assert.equal(parseSlimInboxGroupConversationKey('100001@g.us'),null);
});
await check('wrong group hint or invalid UUID cannot be routed',()=>{
 assert.throws(()=>parseSlimInboxGroupConversationKey(S1+'|100001@g.us','200002@g.us'),/não corresponde/);
 assert.throws(()=>parseSlimInboxGroupConversationKey('not-a-session|100001@g.us'),/inválida/);
 assert.throws(()=>parseSlimInboxGroupConversationKey(S1+'|invalid'),/inválida/);
});
await check('source passes search term to paginated SQL function',()=>{
 const s=read('src/lib/whatsapp-groups.functions.legacy.ts');
 const section=s.split('export const listInboxGroupConversations =')[1].split('const InboxGroupMessageCursorSchema')[0];
 assert(section.includes('list_inbox_group_conversations_page'));
 assert(section.includes('_search: data.search?.trim() || null'));
 assert(section.includes('_cursor_at: data.cursor?.lastMessageAt'));
 assert(section.includes('_cursor_key: data.cursor?.key'));
});
await check('read and send use session-bound conversation key',()=>{
 const s=read('src/lib/whatsapp-groups.functions.legacy.ts');
 const reader=s.split('export const listInboxGroupMessages =')[1].split('export const sendGroupMessage =')[0];
 const resolver=s.split('async function resolveGroupTarget(')[1].split('export const sendGroupMessage =')[0];
 assert(reader.includes('parseSlimInboxGroupConversationKey(data.groupId, data.groupJid)'));
 assert(reader.includes('sessionId = parsed.sessionId'));
 assert(reader.includes('.eq("session_id", sessionId)'));
 assert(resolver.includes('parseSlimInboxGroupConversationKey(groupId, groupJidHint)'));
 assert(resolver.includes('session.status !== "conectado"'));
 assert(resolver.includes('.eq("workspace_id", wsId)'));
});
await check('PDF/audio group send is limited and not retried or restarted',()=>{
 const s=read('src/lib/whatsapp-groups.functions.legacy.ts').split('export const sendGroupMedia =')[1];
 assert(s.includes('decodeSlimMedia(data.base64)'));
 assert(s.includes('boundedMediaRequest({url,apiKey:creds.api_key,payload:body})'));
 assert(s.includes('mediaPreparation('));
 assert(!s.includes('await fetch(url, {'));
 assert(!s.includes('/instance/restart'));
 assert(s.includes('throw new MediaSendUncertain()'));
});
await check('an acknowledged send with failed history is not resent',()=>{
 const s=read('src/lib/whatsapp-groups.functions.legacy.ts').split('export const sendGroupMedia =')[1];
 assert(s.includes('if (persisted.error) return { ok: true, messageId, mediaUrl, historyPending: true }'));
 assert(s.includes('if (!messageId) throw new MediaSendUncertain()'));
 assert(s.includes('upsert: false'));
});
await check('group UI warns for acknowledged history failure and reduces background polling',()=>{
 const ui=read('src/components/inbox/InboxPage.legacy.tsx');
 assert(ui.includes('result.historyPending === true'));
 assert(ui.includes('WhatsApp confirmou o envio'));
 const section=ui.slice(ui.indexOf('const groupMessagesQ = useQuery({'),ui.indexOf('const effectiveActivityPage ='));
 assert(section.includes('refetchInterval: 25_000'));
 assert(section.includes('refetchIntervalInBackground: false'));
});
await check('migration uses INVOKER and auth-only execution',()=>{
 const sql=read('supabase/migrations/20261017171636_slim_group_inbox_conversation_list.sql');
 assert(sql.includes('private.slim_workspace_access'));
 assert(sql.includes("WHERE m.workspace_id = _workspace_id"));
 assert(sql.includes('REVOKE ALL ON FUNCTION'));
 assert(sql.includes('FROM PUBLIC,anon'));
 assert(sql.includes('TO authenticated'));
 assert(!sql.includes('SECURITY DEFINER'));
});
await check('changed code parses TypeScript',()=>{
 for(const p of ['src/lib/slim-inbox-group-key.core.ts','src/lib/whatsapp-groups.functions.legacy.ts','src/components/inbox/InboxPage.legacy.tsx']){
  const file=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(file.parseDiagnostics.length,0,p);
 }
});


await check('text group send is bounded with one acknowledged provider response',()=>{
 const code=read('src/lib/whatsapp-groups.functions.legacy.ts')
   .split('export const sendGroupMessage =')[1].split('export const sendGroupMedia =')[0];
 assert(code.includes('boundedMediaRequest({'));
 assert(code.includes('timeoutMs: 25_000'));
 assert(code.includes('maxBodyBytes: 64 * 1024'));
 assert(code.includes('if (!messageId) throw new MediaSendUncertain()'));
 assert(!code.includes('await fetch('));
 assert(!code.includes('/instance/restart'));
});
await check('acknowledged text with unrecorded history is not silently reported complete',()=>{
 const code=read('src/lib/whatsapp-groups.functions.legacy.ts')
  .split('export const sendGroupMessage =')[1].split('export const sendGroupMedia =')[0];
 assert(code.includes('if (persisted.error) return { ok: true, messageId, historyPending: true }'));
 assert(code.includes('return { ok: true, messageId, historyPending: false }'));
 const ui=read('src/components/inbox/InboxPage.legacy.tsx');
 const textSend=ui.split('const sendMut = useMutation({')[1].split('const sendMediaFn =')[0];
 assert(textSend.includes('result.historyPending === true'));
 assert(textSend.includes('Confira antes de reenviar'));
});

const pg=new PGlite();
try{
 await pg.exec("CREATE SCHEMA IF NOT EXISTS private; CREATE ROLE authenticated; CREATE ROLE anon;");
 await pg.exec("CREATE TABLE public.whatsapp_groups(id uuid primary key,workspace_id uuid,session_id uuid,group_jid text,name text,subject text,description text,picture_url text,participants_count integer,last_synced_at timestamptz,updated_at timestamptz,created_at timestamptz);");
 await pg.exec("CREATE TABLE public.whatsapp_web_messages(id uuid primary key,workspace_id uuid,session_id uuid,remote_jid text,body text,message_type text,from_me boolean,sender_name text,received_at timestamptz);");
 await pg.exec("CREATE FUNCTION private.slim_workspace_access(_workspace_id uuid,_level text DEFAULT 'member') RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _workspace_id::text=current_setting('slim.test_ws',true) $$;");
 await pg.exec(read('supabase/migrations/20261017171636_slim_group_inbox_conversation_list.sql'));
 const W1='11111111-1111-4111-8111-111111111111',W2='22222222-2222-4222-8222-222222222222';
 const id=()=>randomUUID();
 const insert=async(ws,session,jid,body,time)=>pg.query(
 'INSERT INTO public.whatsapp_web_messages (id,workspace_id,session_id,remote_jid,body,message_type,from_me,sender_name,received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
 [id(),ws,session,jid,body,'text',false,'Operador',time]);
 await insert(W1,S1,'100001@g.us','old','2026-10-17T12:00:00Z');
 await insert(W1,S1,'100001@g.us','new','2026-10-17T15:00:00Z');
 await insert(W1,S1,'200002@g.us','second','2026-10-17T14:00:00Z');
 await insert(W2,S2,'300003@g.us','foreign','2026-10-17T16:00:00Z');
 const query=(ws,limit=40,cursorAt=null,cursorKey=null,search=null)=>pg.query(
 'SELECT * FROM public.list_inbox_group_conversations_page($1,$2,$3,$4,$5)',[ws,limit,cursorAt,cursorKey,search]);
 await check('SQL denies group listing without an authorized workspace',async()=>{
  const r=await query(W1);assert.equal(r.rows.length,0);
 });
 await pg.query("select set_config('slim.test_ws',$1,false)",[W1]);
 await check('SQL lists history-only groups despite empty metadata table',async()=>{
  const r=await query(W1);
  assert.equal(r.rows.length,2);
  assert.equal(r.rows[0].body,'new');
  assert.equal(r.rows[0].group_id,null);
  assert.equal(r.rows[0].group_jid,'100001@g.us');
  assert.equal(r.rows[0].session_id,S1);
 });
 await check('SQL tenant scope prevents foreign group leakage',async()=>{
  const r=await query(W2);assert.equal(r.rows.length,0);
 });
 await check('SQL search occurs before pagination',async()=>{
  const r=await query(W1,10,null,null,'200002');assert.equal(r.rows.length,1);assert.equal(r.rows[0].group_jid,'200002@g.us');
 });
 await check('SQL cursor preserves chronological order',async()=>{
  const r=await query(W1,1);assert.equal(r.rows.length,2);
  const c=r.rows[0];
  const next=await query(W1,1,new Date(c.last_message_at).toISOString(),c.conversation_key);
  assert.equal(next.rows.length,1);assert.equal(next.rows[0].group_jid,'200002@g.us');
 });
 await check('SQL metadata joins do not remove history-only groups',async()=>{
  await pg.query("INSERT INTO public.whatsapp_groups(id,workspace_id,session_id,group_jid,name,participants_count,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now(),now())",[id(),W1,S1,'100001@g.us','Equipe teste',5]);
  const r=await query(W1);
  assert.equal(r.rows.length,2);assert.equal(r.rows[0].name,'Equipe teste');assert.equal(r.rows[0].participants_count,5);
 });
 await check('anonymous cannot call SQL function',async()=>{
  const r=await pg.query("SELECT has_function_privilege('anon','public.list_inbox_group_conversations_page(uuid,integer,timestamptz,text,text)','EXECUTE') AS allowed");
  assert.equal(r.rows[0].allowed,false);
 });
}finally{await pg.close();}
console.log(passed+'/'+passed+' group Inbox checks passed. Synthetic PostgreSQL only; no live WhatsApp messages or leads changed.');
