import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {slimInboxStoredMediaPath} from '../src/lib/slim-inbox-lazy-media.core.ts';
import {downloadRecoveredEvolutionMedia,safeRecoveredMediaType,
  SLIM_EVOLUTION_READ_DEADLINE_MS,SLIM_EVOLUTION_RESPONSE_MAX_BYTES,
} from '../src/lib/slim-evolution-media-recovery.server.ts';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let passed=0;
async function check(title,fn){await fn();passed++;console.log('PASS Evolution recovery: '+title);}
const args={url:'https://safe.test/chat/getBase64FromMediaMessage/slim',apiKey:'fake-private-key',key:{id:'fake-id',remoteJid:'lead@s.whatsapp.net'},messageType:'documentMessage'};
await check('one provider POST returns exact PDF, without retry',async()=>{
 let calls=0;const bytes=Buffer.from('%PDF-1.4\nsynthetic');
 const r=await downloadRecoveredEvolutionMedia(args,{fetcher:async(_,init)=>{calls++;assert.equal(init.method,'POST');assert.equal(init.headers.apikey,'fake-private-key');assert(init.signal);return Response.json({data:{base64:bytes.toString('base64'),mimetype:'application/pdf'}})}});
 assert.equal(calls,1);assert.deepEqual(r.bytes,bytes);assert.equal(r.extension,'pdf');
});
await check('audio Opus codec MIME preserved',async()=>{
 const bytes=Buffer.from([0,1,8,120,255]);
 const r=await downloadRecoveredEvolutionMedia({...args,messageType:'audioMessage'},{fetcher:async()=>Response.json({response:{mediaBase64:'data:audio/ogg; codecs=opus;base64,'+bytes.toString('base64'),mimetype:'audio/ogg; codecs=opus'}})});
 assert.deepEqual(r.bytes,bytes);assert.equal(r.mimeType,'audio/ogg; codecs=opus');assert.equal(r.extension,'ogg');
});
await check('unsafe HTML and newline MIME replaced with safe fallback',()=>{
 assert.equal(safeRecoveredMediaType('text/html','audio/ogg').mimeType,'audio/ogg');
 assert.equal(safeRecoveredMediaType('image/png\r\nContent-Disposition:attachment','image/webp').mimeType,'image/webp');
 assert.equal(safeRecoveredMediaType(null,'unknown').mimeType,'application/octet-stream');
});
await check('provider rejection never exposes API key',async()=>{
 let calls=0;
 await assert.rejects(downloadRecoveredEvolutionMedia(args,{fetcher:async()=>{calls++;return new Response('apikey=fake-private-key',{status:503})}}),e=>e.message.includes('não disponibilizou')&&!e.message.includes('fake-private-key'));
 assert.equal(calls,1);
});
await check('declared oversized response rejected before reading',async()=>{
 await assert.rejects(downloadRecoveredEvolutionMedia(args,{maxResponseBytes:180,fetcher:async()=>new Response('tiny',{headers:{'content-length':'181'}})}),/limite de recuperação/);
});
await check('stream above response budget aborted',async()=>{
 await assert.rejects(downloadRecoveredEvolutionMedia(args,{maxResponseBytes:150,fetcher:async()=>new Response('x'.repeat(250))}),/limite de recuperação/);
});
await check('stalled provider ignoring abort still times out once',async()=>{
 let calls=0;await assert.rejects(downloadRecoveredEvolutionMedia(args,{timeoutMs:10,fetcher:async()=>{calls++;return new Promise(()=>{})}}),/demorou demais/);assert.equal(calls,1);
});
await check('bad JSON or base64 rejected',async()=>{
 await assert.rejects(downloadRecoveredEvolutionMedia(args,{fetcher:async()=>new Response('not JSON')}),/inválido/);
 await assert.rejects(downloadRecoveredEvolutionMedia(args,{fetcher:async()=>Response.json({base64:'%%%%'})}),/inválido/);
});
await check('missing media reported correctly',async()=>{
 await assert.rejects(downloadRecoveredEvolutionMedia(args,{fetcher:async()=>Response.json({message:'no media'})}),/não retornou/);
});
await check('private object scope cannot cross workspace or lead',()=>{
 const ws='workspace',lead='lead',path=ws+'/'+lead+'/recovered/a1.pdf';
 assert.equal(slimInboxStoredMediaPath({media_storage_path:path},ws,lead),path);
 assert.equal(slimInboxStoredMediaPath({media_storage_path:path},ws,'other'),null);
 assert.equal(slimInboxStoredMediaPath({media_storage_path:ws+'/'+lead+'/../other'},ws,lead),null);
});
await check('expired old signed link can be re-signed only from same tenant',()=>{
 const ws='workspace',lead='lead',path=ws+'/'+lead+'/contract.pdf';
 const url='https://vyzvfcgpjjzvcjegzzza.supabase.co/storage/v1/object/sign/inbox-outgoing/'+path+'?token=expired';
 assert.equal(slimInboxStoredMediaPath({media_url:url},ws,lead),path);
 assert.equal(slimInboxStoredMediaPath({media_url:url},ws,'sibling'),null);
 assert.equal(slimInboxStoredMediaPath({media_url:url.replace('supabase.co','bad.site')},ws,lead),null);
});
await check('on-demand reader re-signs Storage object after authorization',()=>{
 const s=read('src/lib/leads.functions.legacy.ts');
 const part=s.split('export const loadSlimLeadActivityMedia =')[1].split('export const sendLeadReaction =')[0];
 assert(part.includes('slimInboxStoredMediaPath(payload, wsId, data.leadId)'));
 assert(part.includes('createSignedUrl(path, 3600)'));
 assert(part.includes('slimAllowStoredMediaUrl(payload.media_url)'));
 assert(part.includes('.eq("lead_id", data.leadId)')&&part.includes('.eq("workspace_id", wsId)'));
});
await check('fallback is bounded and never writes inline media or restarts Evolution',()=>{
 const s=read('src/lib/leads.functions.legacy.ts');
 const part=s.split('export const resolveLeadMessageMedia =')[1].split('export const sendLeadMedia =')[0];
 assert(part.includes('downloadRecoveredEvolutionMedia('));
 assert(part.includes('media_storage_path: path, media_url: null'));
 assert(part.includes('storage.upload(path, result.bytes'));
 assert(part.includes('contentType: result.mimeType, upsert: false'));
 assert(!part.includes('media_url: mediaUrl'));
 assert(!part.includes('data:'+'$'+'{mimeType};base64'));
 assert(!part.includes('/instance/restart'));
});
await check('Storage policies remain scoped to authenticated operator',()=>{
 const part=read('src/lib/leads.functions.legacy.ts').split('export const resolveLeadMessageMedia =')[1].split('export const sendLeadMedia =')[0];
 assert(part.includes('const storage = (sb as any).storage.from("inbox-outgoing")'));
 assert(!part.includes('admin.storage.from("inbox-outgoing").upload('));
 assert(part.includes('.eq("workspace_id", wsId).eq("lead_id", data.leadId)'));
});
await check('any missing media kind can be recovered only by click',()=>{
 const part=read('src/components/inbox/InboxPage.legacy.tsx').split('function MediaAttachment({')[1].split('function StickerAttachment({')[0];
 assert(part.includes('const recoverMediaFn = useServerFn(resolveLeadMessageMedia)'));
 assert(part.includes('if (msg.whatsappMessageId) {'));
 assert(!part.includes('if (kind === "sticker" && msg.whatsappMessageId) {'));
 assert(part.includes('onClick={() => manualMedia.mutate()}'));
 assert(!part.includes('useQuery({'));
});
await check('TS/TSX sources parse',()=>{
 for(const name of ['src/lib/slim-evolution-media-recovery.server.ts','src/lib/slim-inbox-lazy-media.core.ts','src/lib/leads.functions.legacy.ts','src/components/inbox/InboxPage.legacy.tsx']){
  const ast=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,name);
 }
});
await check('build transform is idempotent',()=>{
 const files=['src/lib/leads.functions.legacy.ts','src/components/inbox/InboxPage.legacy.tsx','scripts/test-slim-inbox-lazy-media.mjs'];
 const before=files.map(read);
 execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-evolution-media-recovery.mjs',import.meta.url))],{stdio:'inherit'});
 assert.deepEqual(before,files.map(read));
});
console.log(passed+'/'+passed+' safe Evolution media recovery checks. No production writes or WhatsApp sent.');
