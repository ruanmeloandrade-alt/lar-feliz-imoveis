const storedSigner = "    const path = slimInboxStoredMediaPath(payload, wsId, data.leadId);\n    if (path) {\n      const { supabaseAdmin } = await import(\"@/integrations/supabase/client.server\");\n      const signed = await supabaseAdmin.storage.from(\"inbox-outgoing\").createSignedUrl(path, 3600);\n      if (signed.error || !signed.data?.signedUrl) throw new Error(\"Não foi possível abrir o anexo armazenado.\");\n      return { mediaUrl: signed.data.signedUrl };\n    }\n    const mediaUrl = slimAllowStoredMediaUrl(payload.media_url);\n    return { mediaUrl };";
const recoveryBlock = "    // Bounded on-demand retrieval; no session restart, retry or base64 in JSONB.\n    const { downloadRecoveredEvolutionMedia } = await import(\"./slim-evolution-media-recovery.server\");\n    const result = await downloadRecoveredEvolutionMedia({\n      url: base + \"/chat/getBase64FromMediaMessage/\" + encodeURIComponent(c.instance_name),\n      apiKey: c.api_key,\n      key,\n      declaredMimeType: typeof payload.mime_type === \"string\" ? payload.mime_type : null,\n      messageType: w.message_type,\n    });\n    const path = wsId + \"/\" + data.leadId + \"/recovered/\" + data.activityId +\n      \"-\" + crypto.randomUUID() + \".\" + result.extension;\n    // Storage RLS permits an authenticated operator to upload to own workspace.\n    const storage = (sb as any).storage.from(\"inbox-outgoing\");\n    const { mediaPreparation } = await import(\"./slim-media-transport.server\");\n    const uploaded = await mediaPreparation(\n      storage.upload(path, result.bytes, { contentType: result.mimeType, upsert: false }),\n      \"Armazenamento da mídia recuperada\", 20_000,\n    );\n    if (uploaded.error) throw new Error(\"Não foi possível armazenar o anexo recuperado.\");\n    const signed = await mediaPreparation(storage.createSignedUrl(path, 3600), \"Link de anexo\", 15_000);\n    if (signed.error || !signed.data?.signedUrl) throw new Error(\"Link do anexo indisponível.\");\n    const saved = await admin.from(\"lead_activities\")\n      .update({ payload: { ...payload, media_storage_path: path, media_url: null,\n        mime_type: result.mimeType, media_type: String(payload.media_type ?? w.message_type ?? \"document\") } })\n      .eq(\"id\", data.activityId).eq(\"workspace_id\", wsId).eq(\"lead_id\", data.leadId)\n      .select(\"id\").maybeSingle();\n    if (saved.error || !saved.data) throw new Error(\"Arquivo recuperado, mas o registro não foi confirmado.\");\n";
const guard = "    if (payload.deleted_for_me === true || payload.deleted_for_all === true) throw new Error(\"Mensagem apagada.\");\n    const { supabaseAdmin } = await import(\"@/integrations/supabase/client.server\");\n    const admin = supabaseAdmin as any;\n    const storedPath = slimInboxStoredMediaPath(payload, wsId, data.leadId);\n    if (storedPath) {\n      const signed = await admin.storage.from(\"inbox-outgoing\").createSignedUrl(storedPath, 3600);\n      if (signed.error || !signed.data?.signedUrl) throw new Error(\"Anexo armazenado indisponível.\");\n      return { ok: true, mediaUrl: signed.data.signedUrl, mimeType: typeof payload.mime_type === \"string\" ? payload.mime_type : null };\n    }\n    const waMsgId = payload.whatsapp_message_id as string | undefined;";
import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),mark='// SLIM_EVOLUTION_MEDIA_RECOVERY_V1',plans=[];
function edit(path,run) {
 const url=new URL(path,root);let code=fs.readFileSync(url,'utf8');
 if(code.includes(mark))return;
 const once=(a,b)=>{const n=code.split(a).length-1;if(n!==1)throw new Error('[Evolution media recovery] '+path+' anchor '+n+': '+a.slice(0,120));code=code.replace(a,()=>b)};
 const between=(a,b,replacement)=>{
  const i=code.indexOf(a),j=code.indexOf(b,i+a.length);
  if(i<0||j<0)throw new Error('[Evolution media recovery] block absent '+path+': '+a);
  code=code.slice(0,i)+replacement+code.slice(j);
 };

 const within=(a,b,fn)=>{
  const i=code.indexOf(a),j=code.indexOf(b,i+a.length);
  if(i<0||j<0||code.split(a).length!==2)throw new Error('[Evolution media recovery] scoped region missing '+path+': '+a);
  let part=code.slice(i,j);
  const one=(old,next)=>{
   const n=part.split(old).length-1;
   if(n!==1)throw new Error('[Evolution media recovery] scoped anchor '+n+' '+old.slice(0,95));
   part=part.replace(old,()=>next);
  };
  const span=(old,end,replacement)=>{
   const x=part.indexOf(old),y=part.indexOf(end,x+old.length);
   if(x<0||y<0)throw new Error('[Evolution media recovery] scoped block absent '+old.slice(0,90));
   part=part.slice(0,x)+replacement+part.slice(y);
  };
  fn({once:one,between:span});
  code=code.slice(0,i)+part+code.slice(j);
 };
 run({once,between,within});
 const parsed=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(parsed.parseDiagnostics.length)throw new Error('[Evolution media recovery] syntax '+path+': '+parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
 plans.push([url,code+'\n'+mark+'\n']);
}
edit('src/lib/leads.functions.legacy.ts',({once,between,within})=>{
 once('import { SLIM_LEAD_ACTIVITY_META_SELECT, slimProjectedActivity, slimAllowStoredMediaUrl, type SlimProjectedActivityRow } from "./slim-inbox-lazy-media.core";',
      'import { SLIM_LEAD_ACTIVITY_META_SELECT, slimProjectedActivity, slimAllowStoredMediaUrl, slimInboxStoredMediaPath, type SlimProjectedActivityRow } from "./slim-inbox-lazy-media.core";');
 once('    const mediaUrl = slimAllowStoredMediaUrl(payload.media_url);\n    return { mediaUrl };',storedSigner);
 within('export const resolveLeadMessageMedia =','/**\n * Envia mídia (imagem',({once,between})=>{
 once('.select("id, payload")\n      .eq("id", data.activityId)',
      '.select("id, type, payload")\n      .eq("id", data.activityId)');
 once('    if (!act) throw new Error("Mensagem não encontrada.");',
      '    if (!act || !["message_in", "message_out"].includes(String((act as {type?:string}).type))) throw new Error("Mensagem não encontrada nesta conversa.");');
 once('    const waMsgId = payload.whatsapp_message_id as string | undefined;',guard);
 between('    const findDeepString = (value: unknown, keys: string[]): string | null => {',
         '    return { ok: true, mediaUrl, mimeType };',recoveryBlock);
 once('    return { ok: true, mediaUrl, mimeType };',
      '    return { ok: true, mediaUrl: signed.data.signedUrl, mimeType: result.mimeType };');
 });
});
edit('src/components/inbox/InboxPage.legacy.tsx',({once})=>{
 once('const resolveStickerFn = useServerFn(resolveLeadMessageMedia);',
      'const recoverMediaFn = useServerFn(resolveLeadMessageMedia);');
 once('if (kind === "sticker" && msg.whatsappMessageId) {',
      'if (msg.whatsappMessageId) {');
 once('const recovered = await resolveStickerFn({ data: { leadId, activityId: msg.id } });',
      'const recovered = await recoverMediaFn({ data: { leadId, activityId: msg.id } });');
});
edit('scripts/test-slim-inbox-lazy-media.mjs',({once})=>{
 once(' slimAllowStoredMediaUrl,\n} from',' slimAllowStoredMediaUrl,\n slimInboxStoredMediaPath,\n} from');
 once(' slimAllowStoredMediaUrl,\n});',' slimAllowStoredMediaUrl,\n slimInboxStoredMediaPath,\n});');
});
for(const [url,code] of plans)fs.writeFileSync(url,code);
console.log('[Evolution media recovery] '+plans.length+' bounded scoped consumers validated, no real media or DB updated.');
