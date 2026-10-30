import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;
function check(name,fn){fn();n++;console.log('PASS Inbox DB relief: '+name);}
const src=read('src/lib/leads.functions.legacy.ts'),ui=read('src/components/inbox/InboxPage.legacy.tsx'),models=read('src/lib/inbox-mock.ts');
check('preview queries bounded and abortable',()=>{assert(src.includes('Math.min(160, Math.max(30, pageLeadIds.length * 4))'));assert(src.includes('.abortSignal(AbortSignal.timeout(4_000))'));});
check('query timeout cannot drop lead list',()=>{assert(!src.includes('if (recentActsError) throw'));assert(src.includes('activityUnavailable=Boolean(recentActsError)'));});
check('preview query does not include full base64 payload',()=>{const part=src.slice(src.indexOf('const activityLimit ='),src.indexOf('const recentRows ='));assert(part.includes('preview_text:payload->>text'));assert(part.includes('media_type:payload->>media_type'));assert(part.includes('file_name:payload->>file_name'));assert(!part.includes('.select("lead_id, type, payload, occurred_at")'));});
check('preview aliases keep unread and text formatting contract',()=>{assert(src.includes('payload:{text:row.preview_text,media_type:row.media_type,file_name:row.file_name}'));assert(src.includes('computeUnreadCountsFromActivities(recentRows)'));});
check('active chat query does not load large files in background every five seconds',()=>{const part=ui.slice(ui.indexOf('const activitiesQ = useQuery({'),ui.indexOf('const groupMessagesQ = useQuery({'));assert(part.includes('refetchInterval: 25_000'));assert(part.includes('refetchIntervalInBackground: false'));assert(!part.includes('refetchInterval: 5_000'));});
check('unread uncertainty remains visible',()=>{assert(src.includes('readStateUnavailable: activityUnavailable'));assert(ui.includes('Estado de leitura indisponível'));assert(ui.includes('!conv.readStateUnavailable && indicator'));});
check('old messages and per-thread loading preserved',()=>{assert(src.includes('listLeadConversations'));assert(src.includes('lead_activities'));assert(src.includes('listLeadActivities'));});
check('lead and conversation identity preserved',()=>{assert(ui.includes('leadId: c.leadId'));assert(models.includes('readStateUnavailable?: boolean'));});
const paths=['src/lib/leads.functions.legacy.ts','src/lib/inbox-mock.ts','src/components/inbox/InboxPage.legacy.tsx'];
check('transformed sources syntax valid',()=>{for(const p of paths)assert.equal(ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS).parseDiagnostics.length,0,p);});
const previous=paths.map(read);execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-inbox-db-relief.mjs',import.meta.url))],{stdio:'inherit'});
check('idempotent patch',()=>assert.deepEqual(paths.map(read),previous));
console.log(n+'/'+n+' Inbox DB relief focused checks passed. No browser E2E or WhatsApp test claimed.');
