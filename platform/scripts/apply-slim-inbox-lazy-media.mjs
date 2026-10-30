const endpoint = "/**\n * Authenticated single-attachment read. The history endpoint does not return\n * payload.media_url; the operator explicitly requests it by clicking a message.\n */\nexport const loadSlimLeadActivityMedia = createServerFn({ method: \"POST\" })\n  .middleware([attachSupabaseAuth, requireSupabaseAuth])\n  .inputValidator((d: unknown) =>\n    z.object({ leadId: z.string().uuid(), activityId: z.string().uuid() }).parse(d),\n  )\n  .handler(async ({ data, context }) => {\n    const sb = context.supabase as unknown as AnySb;\n    const wsId = await loadActiveWorkspace(sb, context.userId);\n    const { data: act, error } = await sb.from(\"lead_activities\")\n      .select(\"id,type,payload\")\n      .eq(\"workspace_id\", wsId)\n      .eq(\"lead_id\", data.leadId)\n      .eq(\"id\", data.activityId)\n      .maybeSingle();\n    if (error) throw new Error(\"Não foi possível carregar o anexo.\");\n    if (!act || ![\"message_in\", \"message_out\"].includes(String(act.type))) {\n      throw new Error(\"Anexo não disponível nesta conversa.\");\n    }\n    const payload = (act.payload ?? {}) as Record<string, unknown>;\n    if (payload.deleted_for_all === true || payload.deleted_for_me === true) {\n      throw new Error(\"A mensagem foi apagada.\");\n    }\n    const mediaUrl = slimAllowStoredMediaUrl(payload.media_url);\n    return { mediaUrl };\n  });\n\n";
const uiMediaBody = "  const loadStoredMediaFn = useServerFn(loadSlimLeadActivityMedia);\n  const resolveStickerFn = useServerFn(resolveLeadMessageMedia);\n  const manualMedia = useMutation({\n    retry: false,\n    mutationFn: async (): Promise<string> => {\n      if (!leadId) throw new Error(\"Não foi possível identificar a conversa.\");\n      const stored = await loadStoredMediaFn({ data: { leadId, activityId: msg.id } });\n      if (stored.mediaUrl) return stored.mediaUrl;\n      if (kind === \"sticker\" && msg.whatsappMessageId) {\n        const recovered = await resolveStickerFn({ data: { leadId, activityId: msg.id } });\n        if (recovered.mediaUrl) return recovered.mediaUrl;\n      }\n      throw new Error(\"O arquivo não está disponível no histórico desta conversa.\");\n    },\n  });\n  const displaySource = manualMedia.data ?? source;\n  const needsManualLoad = Boolean(leadId && !displaySource &&\n    (msg.mediaDeferred || rawSource.startsWith(\"data:\") ||\n      (kind === \"sticker\" && msg.whatsappMessageId)));\n\n";
const uiPlaceholder = "  if (needsManualLoad) {\n    return (\n      <div className=\"flex min-w-[220px] flex-col gap-2 rounded-md border px-3 py-2 text-xs\"\n        style={{ borderColor: \"var(--chat-divider)\" }}>\n        <div className=\"flex items-center gap-2\">\n          <Paperclip className=\"h-4 w-4 shrink-0\" />\n          <span className=\"min-w-0 flex-1 truncate\">{label}</span>\n        </div>\n        <button type=\"button\" disabled={manualMedia.isPending}\n          onClick={() => manualMedia.mutate()}\n          className=\"rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 hover:opacity-80\"\n          style={{ borderColor: \"var(--chat-divider)\" }}\n          aria-label={\"Abrir mídia: \" + label}>\n          {manualMedia.isPending ? \"Carregando anexo...\" : \"Abrir mídia\"}\n        </button>\n        {manualMedia.isError && (\n          <p role=\"alert\" className=\"text-xs\">\n            {manualMedia.error instanceof Error ? manualMedia.error.message : \"Não foi possível carregar o anexo.\"}\n          </p>\n        )}\n      </div>\n    );\n  }\n\n";
import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),marker='// SLIM_INBOX_MEDIA_ON_DEMAND_V1';
const plans=[];
function edit(path,fn){
 const url=new URL(path,root);let code=fs.readFileSync(url,'utf8');
 if(code.includes(marker))return;
 const once=(a,b)=>{const count=code.split(a).length-1;if(count!==1)throw new Error('[Media on demand] '+path+' anchor '+count+' '+a.slice(0,120));code=code.replace(a,()=>b);};
 const section=(a,b,run)=>{
  const i=code.indexOf(a),j=code.indexOf(b,i+a.length);
  if(i<0||j<0||code.split(a).length!==2)throw new Error('[Media on demand] Missing section '+path+': '+a);
  let part=code.slice(i,j);
  const replace=(x,y)=>{const n=part.split(x).length-1;if(n!==1)throw new Error('[Media on demand] Section anchor '+n+': '+x.slice(0,90));part=part.replace(x,()=>y);};
  const between=(x,y,value)=>{const start=part.indexOf(x),end=part.indexOf(y,start+x.length);if(start<0||end<0)throw new Error('[Media on demand] Section delimiter missing: '+x.slice(0,80));part=part.slice(0,start)+value+part.slice(end);};
  run({replace,between});
  code=code.slice(0,i)+part+code.slice(j);
 };
 fn({once,section});
 const parsed=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(parsed.parseDiagnostics.length)throw new Error('[Media on demand] Syntax '+path+': '+parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
 plans.push([url,code+'\n'+marker+'\n']);
}
edit('src/lib/leads.functions.legacy.ts',({once,section})=>{
 once('import { z } from "zod";','import { z } from "zod";\nimport { SLIM_LEAD_ACTIVITY_META_SELECT, slimProjectedActivity, slimAllowStoredMediaUrl, type SlimProjectedActivityRow } from "./slim-inbox-lazy-media.core";');
 once('  mediaUrl?: string | null;\n  mediaType?: string | null;',
      '  mediaUrl?: string | null;\n  mediaDeferred?: boolean;\n  transcription?: string | null;\n  mediaType?: string | null;');
 section('export const getLeadDetail =','export const addLeadNote =',({replace,between})=>{
  replace('.select("id, type, payload, occurred_at")','.select(SLIM_LEAD_ACTIVITY_META_SELECT)');
  between('      activities: (','\n    };\n    return detail;','      activities: ((acts ?? []) as SlimProjectedActivityRow[]).map(slimProjectedActivity),');
 });
 section('export const listLeadActivities =','/**\n * Envia uma reação',({replace,between})=>{
  replace('.select("id, type, payload, occurred_at")','.select(SLIM_LEAD_ACTIVITY_META_SELECT)');
  between('    const rawRows = (acts ?? []) as Array<{','    const oldest = pageRows[0];',
    '    const rawRows = (acts ?? []) as SlimProjectedActivityRow[];\n    const hasMore = rawRows.length > data.limit;\n    const limitedRows = rawRows.slice(0, data.limit);\n    const pageRows = isDelta ? limitedRows : limitedRows.slice().reverse();\n    const activities = pageRows.map(slimProjectedActivity);\n\n');
 });
 once('/**\n * Envia uma reação emoji para uma mensagem WhatsApp via Evolution.',endpoint+'/**\n * Envia uma reação emoji para uma mensagem WhatsApp via Evolution.');
});
edit('src/lib/inbox-mock.ts',({once})=>{
 once(' mediaUrl?: string | null;\n mediaType?:',' mediaUrl?: string | null;\n mediaDeferred?: boolean;\n mediaType?:');
});
edit('src/components/inbox/InboxPage.legacy.tsx',({once,section})=>{
 once('  resolveLeadMessageMedia,\n  deleteLeadMessage,','  resolveLeadMessageMedia,\n  loadSlimLeadActivityMedia,\n  deleteLeadMessage,');
 once('import { cn } from "@/lib/utils";','import { cn } from "@/lib/utils";\nimport { slimScrubInlineMedia } from "@/lib/slim-inbox-lazy-media.core";');
 section('readInboxHotSnapshot<LeadActivityPage[','readInboxHotSnapshot<GroupMessagePage[',({replace})=>{
  replace('activities: snapshot.items,','activities: snapshot.items.map(slimScrubInlineMedia),');
 });
 once('mergeThreadCacheRows(previous, cached.activities)','mergeThreadCacheRows(previous, cached.activities.map(slimScrubInlineMedia))');
 once('      mediaUrl: a.mediaUrl ?? null,\n      mediaType: a.mediaType ?? null,',
      '      mediaUrl: a.mediaUrl ?? null,\n      mediaDeferred: a.mediaDeferred === true,\n      mediaType: a.mediaType ?? null,');
 once('        mediaUrl: typeof payload?.media_url === "string" ? payload.media_url : null,',
      '        mediaUrl: typeof payload?.media_url === "string" && !payload.media_url.startsWith("data:") ? payload.media_url : null,\n        mediaDeferred: Boolean((typeof payload?.media_type === "string" && payload.media_type.trim()) || (typeof payload?.mime_type === "string" && payload.mime_type.trim()) || (typeof payload?.media_url === "string" && payload.media_url.startsWith("data:"))),');
 once('msg.mediaUrl && !isSticker && "w-fit min-w-[220px]"',
      '(msg.mediaUrl || msg.mediaDeferred) && !isSticker && "w-fit min-w-[220px]"');
 once('        {msg.mediaUrl || isSticker ? (','        {msg.mediaUrl || msg.mediaDeferred || isSticker ? (');
 once('        {(msg.mediaUrl || isSticker) && msg.text && !genericLabel && (',
      '        {(msg.mediaUrl || msg.mediaDeferred || isSticker) && msg.text && !genericLabel && (');
 section('function MediaAttachment({','function StickerAttachment({',({replace,between})=>{
  replace('  const source = msg.mediaUrl ?? "";',
    '  const rawSource = msg.mediaUrl ?? "";\n  const source = leadId && (msg.mediaDeferred || rawSource.startsWith("data:")) ? "" : rawSource;');
  between('  const resolveMediaFn = useServerFn(resolveLeadMessageMedia);','  const downloadName =',uiMediaBody);
  replace('  if (kind === "sticker") {',uiPlaceholder+'  if (kind === "sticker") {');
  replace('<StickerAttachment src={displaySource} loading={resolvedMediaQ.isLoading} />;',
          '<StickerAttachment src={displaySource} loading={manualMedia.isPending} />;');
 });
});
for(const [url,code] of plans)fs.writeFileSync(url,code);
console.log('[Media on demand] '+plans.length+' sources validated and patched. No production data changed.');
