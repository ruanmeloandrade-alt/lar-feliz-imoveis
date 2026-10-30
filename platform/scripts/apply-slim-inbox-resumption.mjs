import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),mark='// SLIM_INBOX_RESUMPTION_V1',plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(mark))return;
 const once=(from,to)=>{const n=code.split(from).length-1;if(n!==1)throw new Error(`[Inbox resume] ${path}: ${n} matches for ${from.slice(0,100)}`);code=code.replace(from,()=>to);};
 const all=(from,to,count)=>{const n=code.split(from).length-1;if(n!==count)throw new Error(`[Inbox resume] ${path}: expected ${count} matches; got ${n}: ${from.slice(0,80)}`);code=code.split(from).join(to);};
 const block=(start,end,replacement)=>{if(code.split(start).length!==2)throw new Error(`[Inbox resume] Nonunique start: ${start}`);const a=code.indexOf(start),b=code.indexOf(end,a+start.length);if(b<0)throw new Error(`[Inbox resume] Missing end: ${end}`);code=code.slice(0,a)+replacement+code.slice(b);};
 run({once,all,block});plans.push([path,code+'\n'+mark+'\n']);
}
edit('src/components/inbox/InboxPage.legacy.tsx',({once,all,block})=>{
 once('import { cn } from "@/lib/utils";',`import { cn } from "@/lib/utils";
import {SlimInboxVoiceControls} from './SlimInboxVoiceControls';
import {conversationIndicator,uniqueConversationRows,type ConversationAutomation} from '@/lib/slim-inbox-ui.core';
import {getSlimInboxIndicators} from '@/lib/slim-inbox-status.functions';`);
 once('import {\n  listForms,\n  buildFormShareUrl,\n  renderFormMessage,\n  DEFAULT_FORM_MESSAGE_TEMPLATE,\n  type FormRecord,\n} from "@/lib/forms.functions";','');
 once('return [...directLeads, ...groups].sort(','return uniqueConversationRows([...directLeads, ...groups]).sort(');
 once('  const enrichedConversations = useMemo(',`  const loadIndicators=useServerFn(getSlimInboxIndicators);
  const indicatorIds=useMemo(()=>[...new Set(conversations.filter(c=>!c.isGroup).map(c=>c.id))].sort().slice(0,500),[conversations]);
  const indicatorQuery=useQuery({queryKey:['inbox','indicators',workspaceId,cacheScope?.userId,indicatorIds],queryFn:()=>loadIndicators({data:{workspaceId:workspaceId!,actorId:cacheScope!.userId,leadIds:indicatorIds}}),enabled:channel==='leads'&&!!workspaceId&&!!cacheScope&&indicatorIds.length>0,retry:1,staleTime:5000,refetchInterval:10000});
  const enrichedConversations = useMemo(`);
 once('        labels: Array.from(new Set([...(c.labels ?? []), ...(conversationLabels[c.id] ?? [])])),',`        labels: Array.from(new Set([...(c.labels ?? []), ...(conversationLabels[c.id] ?? [])])),
        labelNames:Object.fromEntries(labelGroups.flatMap(g=>g.labels.map(l=>[l.id,l.name]))),
        automation:indicatorQuery.data?.workspaceId===workspaceId&&indicatorQuery.data.actorId===cacheScope?.userId?indicatorQuery.data.states[c.id]:undefined,`);
 once('    [conversations, conversationLabels],','    [conversations, conversationLabels, labelGroups, indicatorQuery.data, workspaceId, cacheScope?.userId],');
 block('  function createLabel(groupName:', '  function updateLabel(',`  async function createLabel(groupName:string,labelName:string,color?:string):Promise<void>{
    const name=labelName.trim();if(!name)throw new Error('Informe o nome da etiqueta.');
    try{await upsertInboxLabelFn({data:{group_name:groupName.trim()||'Geral',name,color:color||'oklch(0.78 0.14 162)'}});await refreshInboxLabels();toast.success('Etiqueta criada.');}
    catch(error){toast.error(error instanceof Error?error.message:'Falha ao criar etiqueta.');throw error;}
  }

`);
 all('onCreateLabel: (groupName: string, labelName: string, color?: string) => void;','onCreateLabel: (groupName: string, labelName: string, color?: string) => Promise<void>;',2);
 once('  const [newColor, setNewColor] = useState<string>(LABEL_COLOR_PALETTE[4]);','  const [newColor, setNewColor] = useState<string>(LABEL_COLOR_PALETTE[4]);\n  const [labelSaving,setLabelSaving]=useState(false);const labelSaveLock=useRef(false);');
 once('onClick={() => {\n                  onCreateLabel(groupName, labelName, newColor);\n                  setLabelName("");\n                }}',`onClick={async()=>{
                  if(labelSaveLock.current)return;labelSaveLock.current=true;setLabelSaving(true);const submitted=labelName;
                  try{await onCreateLabel(groupName,submitted,newColor);setLabelName(current=>current===submitted?'':current);}catch{/* Keep the operator's input on failure. */}finally{labelSaveLock.current=false;setLabelSaving(false);}
                }}`);
 once('disabled={!labelName.trim()}','disabled={labelSaving || !labelName.trim()}');
 once('<Plus className="w-3 h-3" /> Adicionar','<Plus className="w-3 h-3" /> {labelSaving ? "Adicionando..." : "Adicionar"}');
 once('  const waiting = unanswered && unread > 0;',`  const waiting = unanswered && unread > 0;
  const indicator=conversationIndicator({lastMessageFrom:conv.lastMessageFrom,unreadCount:unread,opened:active,automation:(conv as ChatConversation&{automation?:ConversationAutomation}).automation});`);
 once('<Tag className="w-2.5 h-2.5" /> {label}','<Tag className="w-2.5 h-2.5" /> {(conv as ChatConversation&{labelNames?:Record<string,string>}).labelNames?.[label]??label}');
 once(`{unanswered && (
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: "#f59e0b",
                  boxShadow: "0 0 0 2px color-mix(in oklab, #f59e0b 35%, transparent)",
                }}
                title="Conversa não respondida, última mensagem foi do lead"
              />
            )}`,`{indicator && <span data-conversation-indicator={indicator.kind} className="h-2.5 w-2.5 rounded-full border border-slate-400/60" style={{backgroundColor:indicator.color}} title={indicator.label} aria-label={indicator.label} />}`);
 once('    if (!isLead || !cacheScope || readMarkedRef.current === conversation.id) return;\n    readMarkedRef.current = conversation.id;\n    markReadFn({ data: { leadId: conversation.id } }).catch(() => {',`    const markKey=cacheScope?.workspaceId+':'+conversation.id+':'+conversation.lastMessageAt;
    if (!isLead || !cacheScope || readMarkedRef.current === markKey) return;
    readMarkedRef.current = markKey;
    markReadFn({ data: { leadId: conversation.id } }).then(()=>queryClient.invalidateQueries({queryKey:['inbox','lead-conversations']})).catch(() => {`);
 once('    conversation.id,\n    markReadFn,','    conversation.id,\n    conversation.lastMessageAt,\n    markReadFn,');
 once('    mutationFn: async (file: File) => {','    mutationFn: async ({file,caption}:{file:File;caption?:string}) => {');
 all('caption: draft.trim() || undefined,','caption,',2);
 once('      setDraft("");\n      if (isGroupThread) {','      // The next draft belongs to the operator, not to the finished upload.\n      if (isGroupThread) {');
 block('  // Gravação de áudio (Mic)','  const [draft, setDraft]', '  // Voice recording and dictation live in SlimInboxVoiceControls.\n');
 block('  const [formMenuOpen, setFormMenuOpen]', '  const scrollRef', '');
 once('  const scrollRef = useRef<HTMLDivElement>(null);','  const scrollRef = useRef<HTMLDivElement>(null);\n  const composerInputRef=useRef<HTMLInputElement>(null);');
 once('      sendMut.mutate(text);\n      setDraft("");','      sendMut.mutate(text);\n      setDraft("");\n      composerInputRef.current?.focus();');
 once('                alert("Arquivo acima de 16MB. WhatsApp não aceita esse tamanho.");','                alert("Arquivo acima do limite de 16 MB deste envio.");');
 once('              mediaMut.mutate(file);','              const caption=draft.trim()||undefined;\n              mediaMut.mutate({file,caption});\n              setDraft("");');
 once('disabled={!canSend || mediaMut.isPending || recording}','disabled={!canSend || mediaMut.isPending || sendMut.isPending}');
 block('          <div className="relative">\n            <IconBtn\n              label="Enviar formulário"','          {emojiOpen && (','');
 once('          <input\n            value={draft}','          <input\n            ref={composerInputRef}\n            aria-label="Mensagem"\n            value={draft}');
 once('disabled={!canSend || sendMut.isPending || recording}','disabled={!canSend}');
 block('            placeholder={\n              !canSend','            className="flex-1 h-10',`            placeholder={!canSend?'Envio indisponível neste canal':isGroupThread?'Mensagem para o grupo':'Digite uma mensagem'}
`);
 block('          {draft.trim() && !recording ? (','        </div>\n      )}',`          {draft.trim()&&<IconBtn label="Enviar" onClick={send} accent disabled={sendMut.isPending||sendingTextRef.current||!canSend}><Send className="h-4 w-4"/></IconBtn>}
          {canSend&&workspaceId&&cacheScope&&<SlimInboxVoiceControls key={workspaceId+':'+cacheScope.userId+':'+conversation.id} workspaceId={workspaceId} actorId={cacheScope.userId} disabled={mediaMut.isPending||sendMut.isPending} onInteractionStateChange={setVoiceInteraction} onAudio={file=>mediaMut.mutateAsync({file,caption:undefined})} onText={text=>{setDraft(current=>current?current+' '+text:text);composerInputRef.current?.focus();}}/>}
`);
 once('      {sendMut.error && (',`      {mediaMut.error&&<div role="alert" className="px-5 py-2 text-xs text-destructive">Envio do arquivo não confirmado: {mediaMut.error instanceof Error?mediaMut.error.message:'Falha no envio.'} Confira a conversa antes de reenviar.{mediaMut.variables?.caption&&<p className="mt-1 break-words">Legenda preservada: {mediaMut.variables.caption}</p>}</div>}
      {sendMut.error && (`);
 once('          {sendMut.error instanceof Error ? sendMut.error.message : "erro desconhecido"}','          {sendMut.error instanceof Error ? sendMut.error.message : "erro desconhecido"}\n          {sendMut.variables&&<p className="mt-1 break-words">Texto da tentativa: {sendMut.variables}</p>}');
});
edit('src/lib/inbox-labels.functions.ts',({once})=>{
 once('const { data: prof } = await supabase','const { data: prof, error: profileError } = await supabase');
 once('  const wsId = (prof as','  if(profileError)throw new Error("Não foi possível identificar a empresa ativa.");\n  const wsId = (prof as');
 once('const { data: assigns } = await sb','const { data: assigns, error: assignmentError } = await sb');
 once('    const map: Record<string, string[]> = {};','    if(assignmentError)throw new Error("Não foi possível carregar as etiquetas das conversas.");\n    const map: Record<string, string[]> = {};');
 once('group_name: z.string().min(1).max(80),','group_name: z.string().trim().min(1).max(80),');
 once('name: z.string().min(1).max(80),','name: z.string().trim().min(1).max(80),');
 once('const payload = { workspace_id: wsId, group_name: data.group_name, name: data.name, color: data.color };','const payload = { workspace_id: wsId, group_name: data.group_name, name: data.name, color: data.color, updated_at:new Date().toISOString() };');
 once('const { error } = await sb.from("inbox_labels").update(payload).eq("id", data.id).eq("workspace_id", wsId);\n      if (error) throw new Error(error.message);','const { data:saved,error } = await sb.from("inbox_labels").update(payload).eq("id", data.id).eq("workspace_id", wsId).select("id").maybeSingle();\n      if (error) throw new Error(error.message);\n      if(!saved)throw new Error("Etiqueta não encontrada nesta empresa.");');
 once('.from("inbox_labels").insert(payload).select("id").single()','.from("inbox_labels").upsert(payload,{onConflict:"workspace_id,group_name,name"}).select("id").single()');
});
edit('src/lib/leads.functions.ts',({once,all,block})=>{
 once('  base64: z.string().min(1),','  base64: z.string().min(1).max(22369624),');
 once('    const workspaceId = await loadActiveWorkspace(sb, context.userId);','    const workspaceId = await loadActiveWorkspace(sb, context.userId);\n    const {assertSlimOperator}=await import("@/lib/slim-workspace-operator.server");\n    await assertSlimOperator(sb as any,workspaceId,context.userId);');
 block('    const phoneDigits = (leadRow.phone', '    const { data: creds, error: credsError }',`    const {preferredWhatsappSessionId,resolveLeadWhatsappRoutingTarget}=await import('@/lib/whatsapp-session-routing.server');
    const target=await resolveLeadWhatsappRoutingTarget(sb,{workspaceId,leadId:data.leadId,phone:leadRow.phone,preferredSessionId:preferredWhatsappSessionId(leadRow.custom_data)});
    const sessionId=target.sessionId,phoneDigits=target.number;

`);
 once('    const safeName = data.fileName.replace','    if(bytes.length<1||bytes.length>16*1024*1024)throw new Error("Arquivo fora do limite permitido de 16 MB.");\n    const safeName = data.fileName.replace');
 all('`${phoneDigits}@s.whatsapp.net`','target.remoteJid',2);
 once('          session_id: sessionId,\n          delivery_status: deliveryStatus,','          session_id: sessionId,\n          whatsapp_session_id:sessionId,\n          whatsapp_remote_jid:target.remoteJid,\n          whatsapp_conversation_key:target.conversationKey,\n          delivery_status: deliveryStatus,');
});
edit('src/lib/whatsapp-groups.functions.ts',({once})=>{
 once('    const creds = await loadCreds(sb, data.sessionId);\n    const workspaceId = data.workspaceId ?? (await loadActiveWorkspace(sb, context.userId));',`    const workspaceId=await loadActiveWorkspace(sb,context.userId);
    if(data.workspaceId&&data.workspaceId!==workspaceId)throw new Error('A empresa ativa mudou. Reabra o Inbox.');
    const {assertSlimOperator}=await import('@/lib/slim-workspace-operator.server');await assertSlimOperator(sb as any,workspaceId,context.userId);
    const session=await sb.from('whatsapp_web_sessions').select('id').eq('workspace_id',workspaceId).eq('id',data.sessionId).maybeSingle();
    if(session.error||!session.data)throw new Error('A sessão não pertence à empresa ativa.');
    const cache=await sb.from('whatsapp_groups').select('id').eq('workspace_id',workspaceId).limit(1);
    if(cache.error)throw new Error('O cadastro de grupos não está disponível. Nenhum grupo foi criado por esta tentativa.');
    const creds = await loadCreds(sb, data.sessionId);`);
 once('    const groupJid = deepString(creation.body, ["groupJid", "jid", "id"]);','    const groupJid = deepString(creation.body, ["groupJid", "jid", "id"]);\n    if(!groupJid||!groupJid.endsWith("@g.us"))throw new Error("A resposta não confirmou o grupo. Confira o WhatsApp antes de repetir a criação.");');
});
// Parse all changed TS/TSX before writing any transformed file.
const files=[...plans.map(([path])=>path),'src/components/inbox/SlimInboxVoiceControls.tsx','src/lib/slim-inbox-status.functions.ts','src/lib/slim-inbox-ui.core.ts'];
for(const path of files){const code=plans.find(([p])=>p===path)?.[1]??fs.readFileSync(new URL(path,root),'utf8');const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(source.parseDiagnostics.length)throw new Error(`[Inbox resume] ${path}: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);}
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Inbox resume] ${plans.length} sources updated; syntax verified. No messages or database writes.`);
