import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),mark='// SLIM_INBOX_DB_RELIEF_V1',plans=[];
function edit(path,run){
 const url=new URL(path,root),before=fs.readFileSync(url,'utf8');
 if(before.includes(mark))return;
 let code=before;
 const once=(oldText,newText)=>{const count=code.split(oldText).length-1;if(count!==1)throw new Error('[Inbox DB relief] '+path+' ambiguous anchor: '+oldText.slice(0,80)+' count '+count);code=code.replace(oldText,newText);};
 run(once);
 const parsed=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(parsed.parseDiagnostics.length)throw new Error('[Inbox DB relief] Syntax: '+path+' '+parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
 plans.push([url,code+'\n'+mark+'\n']);
}
edit('src/lib/leads.functions.legacy.ts',once=>{
 once('  productIds: string[];\n  conversationStatus:', '  productIds: string[];\n  readStateUnavailable?: boolean;\n  conversationStatus:');
 once('  let unreadByLead = new Map<string, number>();','  let unreadByLead = new Map<string, number>();\n  let activityUnavailable=false;\n  let activityTruncated=false;');
 once('    const activityLimit = Math.min(2_000, Math.max(400, pageLeadIds.length * 20));','    const activityLimit = Math.min(160, Math.max(30, pageLeadIds.length * 4));');
 // Project JSONB leaf values, never full embedded PDF/audio base64 in the Inbox list.
 once('      .select("lead_id, type, payload, occurred_at")\n      .eq("workspace_id", wsId)\n      .in("lead_id", pageLeadIds)',
      '      .select("lead_id,type,occurred_at,preview_text:payload->>text,media_type:payload->>media_type,file_name:payload->>file_name")\n      .eq("workspace_id", wsId)\n      .in("lead_id", pageLeadIds)');
 once('    const recentRows = (recentActs ?? []) as Array<{\n      lead_id: string;\n      type: string;\n      payload: Record<string, unknown> | null;\n      occurred_at: string;\n    }>;',
      '    const recentRows = ((recentActs ?? []) as Array<{\n      lead_id:string;type:string;preview_text:string|null;media_type:string|null;file_name:string|null;occurred_at:string;\n    }>).map(row => ({ lead_id:row.lead_id,type:row.type,occurred_at:row.occurred_at,\n      payload:{text:row.preview_text,media_type:row.media_type,file_name:row.file_name} }));');
 once('      .limit(activityLimit);\n    if (recentActsError) throw new Error(recentActsError.message);',
  '      .limit(activityLimit)\n      .abortSignal(AbortSignal.timeout(4_000));\n    activityUnavailable=Boolean(recentActsError);\n    if(activityUnavailable)console.warn("[Inbox] Leitura de prévias indisponível. Conversas preservadas.");');
 once('    const { computeUnreadCountsFromActivities } = await import("@/lib/inbox-read-state");','    activityTruncated = recentRows.length >= activityLimit;\n    const { computeUnreadCountsFromActivities } = await import("@/lib/inbox-read-state");');
 once('      lastMessagePreview: preview?.text ?? "Sem mensagens ainda.",','      lastMessagePreview: preview?.text ?? (activityUnavailable ? "Prévia indisponível. Abra a conversa." : "Sem mensagens ainda."),');
 once('      unreadCount: unreadByLead.get(row.id) ?? 0,','      unreadCount: unreadByLead.get(row.id) ?? 0,\n      readStateUnavailable: activityUnavailable || (activityTruncated && !previews.has(row.id)),');
});
edit('src/lib/inbox-mock.ts',once=>{
 once(' unreadCount?: number;\n lastMessageFrom:', ' unreadCount?: number;\n readStateUnavailable?: boolean;\n lastMessageFrom:');
});
edit('src/components/inbox/InboxPage.legacy.tsx',once=>{
 once('          unreadCount: c.unreadCount,\n          messages: [],','          unreadCount: c.unreadCount,\n          readStateUnavailable: c.readStateUnavailable,\n          messages: [],');
 once('{indicator && <span data-conversation-indicator={indicator.kind}',
      '{conv.readStateUnavailable && <span role="status" title="Estado de leitura não conferido. Abra a conversa para verificar." className="text-xs text-amber-600 dark:text-amber-300" aria-label="Estado de leitura indisponível">?</span>}\n             {!conv.readStateUnavailable && indicator && <span data-conversation-indicator={indicator.kind}');
 // Realtime is primary; avoid re-downloading 4.5MB inline files every 5s.
 once('    refetchInterval: 5_000,\n    refetchIntervalInBackground: true,',
      '    refetchInterval: 25_000,\n    refetchIntervalInBackground: false,');
});
for(const[url,value]of plans)fs.writeFileSync(url,value);
console.log('[Inbox DB relief] '+plans.length+' sources parsed, published only after build. No customer data changed.');
