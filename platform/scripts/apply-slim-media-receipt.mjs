import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),MARK='// SLIM_MEDIA_ACK_RECEIPT_V1',plans=[];
function edit(path,fn){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(MARK))return;const once=(a,b)=>{assert.equal(code.split(a).length,2,'Media receipt unique anchor '+a.slice(0,80));code=code.replace(a,()=>b);};const block=(a,b,text)=>{const start=code.indexOf(a),end=code.indexOf(b,start+a.length);assert(start>=0&&end>=0&&code.split(a).length===2,'Media receipt block');code=code.slice(0,start)+text+code.slice(end);};const scopedOnce=(sectionStart,sectionEnd,from,to)=>{
 const begin=code.indexOf(sectionStart),end=code.indexOf(sectionEnd,begin+sectionStart.length);
 assert(begin>=0&&end>begin&&code.split(sectionStart).length===2,'Media receipt scoped section');
 const scoped=code.slice(begin,end);
 assert.equal(scoped.split(from).length,2,'Media receipt scoped anchor '+from.slice(0,80));
 code=code.slice(0,begin)+scoped.replace(from,()=>to)+code.slice(end);
};fn({once,block,scopedOnce});plans.push([path,code+'\n'+MARK+'\n']);}
edit('src/lib/leads.functions.ts',({once,block})=>{
 block('    const { error: messageError } = await sb.from("whatsapp_web_messages").upsert(', '    const { data: existingActivity } = await sb', `    try {
    const {persistAcknowledgedMedia}=await import('./slim-media-receipt.server');
    await persistAcknowledgedMedia(sb,{workspaceId,actorId:context.userId,leadId:data.leadId,sessionId,remoteJid:target.remoteJid,messageId,kind:data.kind,caption:data.caption,mediaUrl,deliveryStatus,occurredAt:now});

`);
 once('    return { ok: true, messageId, mediaUrl, deliveryStatus };',`    return { ok: true, messageId, mediaUrl, deliveryStatus, historyRecorded:true };
    } catch {
      console.error('[Saúde Slim mídia] Provedor confirmou a mensagem; persistência local não confirmada. Sem reenvio automático.');
      return {ok:true,messageId,mediaUrl,deliveryStatus,historyRecorded:false,warning:'O WhatsApp confirmou a aceitação do arquivo, mas o registro no histórico não foi concluído. Não reenvie sem conferir a conversa.'};
    }`);
});
edit('src/components/inbox/InboxPage.legacy.tsx',({scopedOnce})=>{
 scopedOnce('  const mediaMut = useMutation({','  const reactionFn = useServerFn(sendLeadReaction);','    onSuccess: (result) => {\n      if (result && typeof result === "object" && "historyPending" in result && result.historyPending === true) {',`    onSuccess: (result:any) => {
      if(result?.historyRecorded===false)toast.warning(result.warning,{duration:15000});
      if (result && typeof result === "object" && "historyPending" in result && result.historyPending === true) {`);
});
edit('scripts/test-slim-inbox-resumption-source.mjs',({once})=>once("assert(media.includes('remote_jid: target.remoteJid'));","assert(media.includes('remoteJid:target.remoteJid'));assert(read('src/lib/slim-media-receipt.core.ts').includes('remote_jid:value.remoteJid'));"));
for(const [path,code]of plans){const p=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(p.parseDiagnostics.length,0,path);}
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
execFileSync(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('./test-slim-media-receipt.mjs',import.meta.url))],{stdio:'inherit'});
console.log('Media receipt: scoped server persistence after provider acceptance; authenticated reads retained and no broad grants.');
