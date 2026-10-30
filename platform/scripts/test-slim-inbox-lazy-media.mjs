import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
 SLIM_LEAD_ACTIVITY_META_SELECT,
 slimProjectedActivity,
 slimScrubInlineMedia,
 slimAllowStoredMediaUrl,
 slimInboxStoredMediaPath,
} from '../src/lib/slim-inbox-lazy-media.core.ts';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS inbox lazy media: '+name);}
const baseRow={
 id:'activity-a',type:'message_in',occurred_at:'2026-10-16T12:00:00Z',
 preview_text:'Áudio recebido',media_type:'audio',mime_type:'audio/ogg; codecs=opus',
 file_name:'gravacao.ogg',duration_seconds:'8',whatsapp_message_id:'provider-a',
 reactions:['👍',{emoji:'❤️',fromMe:false}],deleted_for_me:'false',
 deleted_for_all:'false',error_text:null,transcription:'Olá',
};
await test('metadata select excludes root payload and embedded media URL',()=>{
 assert(!SLIM_LEAD_ACTIVITY_META_SELECT.split(',').includes('payload'));
 assert(!SLIM_LEAD_ACTIVITY_META_SELECT.includes('media_url'));
 assert(SLIM_LEAD_ACTIVITY_META_SELECT.includes('payload->>text'));
 assert(SLIM_LEAD_ACTIVITY_META_SELECT.includes('payload->reactions'));
});
await test('audio is represented by metadata until explicitly opened',()=>{
 const v=slimProjectedActivity(baseRow);
 assert.equal(v.mediaUrl,null);assert.equal(v.mediaDeferred,true);
 assert.equal(v.mimeType,'audio/ogg; codecs=opus');
 assert.equal(v.durationSeconds,8);assert.equal(v.whatsappMessageId,'provider-a');
 assert.deepEqual(v.reactions,baseRow.reactions);
 assert.equal(v.transcription,'Olá');
});
await test('documents preserve name and sender with no inline bytes',()=>{
 const v=slimProjectedActivity({...baseRow,type:'message_out',media_type:'document',file_name:'contrato.pdf'});
 assert.equal(v.mediaDeferred,true);assert.equal(v.fileName,'contrato.pdf');assert.equal(v.from,'us');
});
await test('plain text and read receipts do not create phantom attachments',()=>{
 for(const type of ['message_in','conversation_read']){
  const v=slimProjectedActivity({...baseRow,type,media_type:null,mime_type:null,file_name:null,preview_text:'Texto'});
  assert.equal(v.mediaDeferred,false);assert.equal(v.mediaUrl,null);
 }
});
await test('deleted flags remain correct when PostgreSQL returns text values',()=>{
 const v=slimProjectedActivity({...baseRow,deleted_for_me:'true',deleted_for_all:'false'});
 assert.equal(v.deletedForMe,true);assert.equal(v.deletedForAll,false);
});
await test('old cached base64 is stripped from React state',()=>{
 const v=slimScrubInlineMedia({id:'old',mediaUrl:'data:audio/ogg;base64,QUJD'});
 assert.deepEqual(v,{id:'old',mediaUrl:null,mediaDeferred:true});
});
await test('valid external media is kept intact in an existing cached message',()=>{
 const input={mediaUrl:'https://example.org/private-file',mediaDeferred:false};
 assert.equal(slimScrubInlineMedia(input),input);
});
await test('stored audio with codecs attribute and PDF URLs remain downloadable',()=>{
 assert.equal(slimAllowStoredMediaUrl('data:audio/ogg; codecs=opus;base64,QUJD'),'data:audio/ogg; codecs=opus;base64,QUJD');
 assert.equal(slimAllowStoredMediaUrl('data:application/pdf;base64,JVBERi0x'),'data:application/pdf;base64,JVBERi0x');
 assert.equal(slimAllowStoredMediaUrl('https://example.org/private/signed.pdf'),'https://example.org/private/signed.pdf');
});
await test('unsafe URL protocols and invalid data URLs are not returned',()=>{
 for(const v of ['javascript:alert(1)','data:text/html;base64,PC9odG1sPg==','data:audio/ogg;base64,<script>','file:///tmp/a','',null])
   assert.equal(slimAllowStoredMediaUrl(v),null);
});
await test('history list and lead detail use lightweight metadata',()=>{
 const s=read('src/lib/leads.functions.legacy.ts');
 for(const name of ['getLeadDetail','listLeadActivities']){
  const section=s.split('export const '+name+' =')[1];
  assert(section, 'missing '+name);
  assert(section.includes('.select(SLIM_LEAD_ACTIVITY_META_SELECT)'));
  assert(!section.split('.select(SLIM_LEAD_ACTIVITY_META_SELECT)')[0].includes('.select("id, type, payload, occurred_at")'));
 }
 assert(s.includes('const activities = pageRows.map(slimProjectedActivity)'));
});
await test('large payload loads through one separately authenticated endpoint',()=>{
 const s=read('src/lib/leads.functions.legacy.ts');
 const snippet=s.split('export const loadSlimLeadActivityMedia =')[1]?.split('export const sendLeadReaction =')[0];
 assert(snippet);
 for(const needle of ['requireSupabaseAuth','loadActiveWorkspace','eq("workspace_id", wsId)','eq("lead_id", data.leadId)','eq("id", data.activityId)','slimAllowStoredMediaUrl(payload.media_url)'])
   assert(snippet.includes(needle),needle);
 assert(snippet.includes('if (error) throw'));
 assert(!snippet.includes('.update('));
 assert(!snippet.includes('.insert('));
 assert(!snippet.includes('console.log('));
});
await test('client does not eagerly fetch attachments on mount or cache base64 in query store',()=>{
 const s=read('src/components/inbox/InboxPage.legacy.tsx');
 const block=s.split('function MediaAttachment({')[1]?.split('function StickerAttachment({')[0];
 assert(block);
 assert(block.includes('useMutation({'));
 assert(block.includes('onClick={() => manualMedia.mutate()}'));
 assert(block.includes('retry: false'));
 assert(!block.includes('useQuery({'));
 assert(!block.includes('enabled: shouldResolveSticker'));
 assert(block.includes('if (needsManualLoad)'));
 assert(block.includes('role="alert"'));
});
await test('chat renders delayed media rather than a mock audio or blank bubble',()=>{
 const s=read('src/components/inbox/InboxPage.legacy.tsx');
 const bubble=s.split('function MessageBubble({')[1]?.split('function MediaAttachment({')[0];
 assert(bubble.includes('msg.mediaDeferred || isSticker'));
 assert(s.includes('mediaDeferred: a.mediaDeferred === true'));
 assert(s.includes('loadSlimLeadActivityMedia,'));
});
await test('Realtime and hot/cold cache do not retain inline base64',()=>{
 const s=read('src/components/inbox/InboxPage.legacy.tsx');
 assert(s.includes('activities: snapshot.items.map(slimScrubInlineMedia)'));
 assert(s.includes('cached.activities.map(slimScrubInlineMedia)'));
 assert(s.includes('!payload.media_url.startsWith("data:")'));
 assert(s.includes('mediaDeferred: Boolean('));
});
await test('server function and UI sources parse as TypeScript and TSX',()=>{
 const files=['src/lib/slim-inbox-lazy-media.core.ts','src/lib/leads.functions.legacy.ts','src/lib/inbox-mock.ts','src/components/inbox/InboxPage.legacy.tsx'];
 for(const path of files){
  const ast=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,path);
 }
});

function extractedHandler(name,dependencies){
 const path='src/lib/leads.functions.legacy.ts',source=read(path);
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const statement=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
 assert(statement, name);
 const decl=statement.declarationList.declarations.find(d=>d.name.getText(ast)===name);
 const builder={middleware(){return builder;},inputValidator(){return builder;},handler(fn){return fn;}};
 const names=['createServerFn','attachSupabaseAuth','requireSupabaseAuth','z',...Object.keys(dependencies)];
 const fakeZ={object:()=>({parse:v=>v}),string:()=>({uuid(){return this;}})};
 const values=[()=>builder,()=>{},()=>{},fakeZ,...Object.values(dependencies)];
 const compiled=ts.transpileModule('const runnable = '+decl.initializer.getText(ast)+';',
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...names,compiled+';return runnable;')(...values);
}

function fixture(rows=[]){
 const requests=[];
 const db={from(table){
  assert.equal(table,'lead_activities');
  const filters=[];
  const q={
   select(cols){requests.push({query:cols});return q;},
   eq(key,value){filters.push({key,value});return q;},
   maybeSingle:async()=>{
    const row=rows.find(row=>filters.every(f=>row[f.key]===f.value));
    return {data:row??null,error:null};
   },
  };
  return q;
 }};
 return {db,requests};
}
const authorizedHandler=extractedHandler('loadSlimLeadActivityMedia',{
 loadActiveWorkspace:async(_db,user)=>user==='user-ws'?'ws':'other-workspace',
 slimAllowStoredMediaUrl,
 slimInboxStoredMediaPath,
});
await test('real endpoint only returns media URL for authorized workspace, lead and activity',async()=>{
 const media={id:'a',type:'message_in',workspace_id:'ws',lead_id:'l',payload:{media_url:'data:application/pdf;base64,JVBERi0x',text:'private note'}};
 const f=fixture([media]);
 const result=await authorizedHandler({data:{leadId:'l',activityId:'a'},context:{supabase:f.db,userId:'user-ws'}});
 assert.equal(result.mediaUrl,'data:application/pdf;base64,JVBERi0x');
 assert.equal('text' in result,false);assert.equal('payload' in result,false);
 assert.equal(f.requests[0].query,'id,type,payload');
});
await test('real endpoint rejects another workspace or another lead',async()=>{
 const f=fixture([{id:'a',type:'message_in',workspace_id:'ws',lead_id:'l',payload:{media_url:'https://x.test/path'}}]);
 for(const [leadId,userId] of [['other','user-ws'],['l','intruder']])
  await assert.rejects(authorizedHandler({data:{leadId,activityId:'a'},context:{supabase:f.db,userId}}),/Anexo não disponível/);
});
await test('real endpoint refuses media in notes and deleted messages',async()=>{
 const f=fixture([
  {id:'note',type:'note',workspace_id:'ws',lead_id:'l',payload:{media_url:'https://x.test/path'}},
  {id:'deleted',type:'message_in',workspace_id:'ws',lead_id:'l',payload:{media_url:'https://x.test/path',deleted_for_me:true}},
 ]);
 for(const activityId of ['note','deleted'])await assert.rejects(authorizedHandler({data:{leadId:'l',activityId},context:{supabase:f.db,userId:'user-ws'}}));
});
await test('real endpoint refuses unsafe stored URLs without exposing a bad redirect',async()=>{
 const f=fixture([{id:'a',type:'message_in',workspace_id:'ws',lead_id:'l',payload:{media_url:'javascript:alert(1)'}}]);
 const result=await authorizedHandler({data:{leadId:'l',activityId:'a'},context:{supabase:f.db,userId:'user-ws'}});
 assert.equal(result.mediaUrl,null);
});
await test('release script applies once; no unrelated changed sources',()=>{
 const changed=['src/lib/leads.functions.legacy.ts','src/lib/inbox-mock.ts','src/components/inbox/InboxPage.legacy.tsx'];
 const before=changed.map(read);
 execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-inbox-lazy-media.mjs',import.meta.url))],{stdio:'inherit'});
 assert.deepEqual(changed.map(read),before);
});
console.log(passed+'/'+passed+' on-demand media checks passed. No live customer media read or WhatsApp sent.');

// SLIM_EVOLUTION_MEDIA_RECOVERY_V1
