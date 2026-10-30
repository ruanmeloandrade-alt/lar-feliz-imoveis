import fs from 'node:fs';import ts from 'typescript';
const root=new URL('../',import.meta.url),mark='// SLIM_GROUP_PROMPT_V1',plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(mark))return;
 const once=(a,b)=>{if(code.split(a).length!==2)throw new Error(`[Group prompt] ${path}: nonunique anchor ${a.slice(0,100)}`);code=code.replace(a,()=>b);};
 const between=(a,b,next)=>{const start=code.indexOf(a),end=code.indexOf(b,start+a.length);if(start<0||end<0||code.split(a).length!==2)throw new Error(`[Group prompt] Missing block ${a}`);code=code.slice(0,start)+next+code.slice(end);};
 run({once,between});plans.push([path,code+'\n'+mark+'\n']);
}
edit('src/components/automations/CentralDeGrupos.tsx',({once,between})=>{
 once('import { AgentTypeDialog, AgentModeBadge, type AgentMode } from "./AgentTypeDialog";','import { AgentModeBadge, type AgentMode } from "./AgentTypeDialog";\nimport {isLegacyObjectiveAgent,promptReadinessError} from "@/lib/slim-prompt-only.core";');
 once('  ObjectiveTreeEditor,\n','');
 once('<TabButton active={tab === "bots"} onClick={() => setTab("bots")} icon={MessageSquare} label="Salesbots de grupo" />','<TabButton active={tab === "bots"} onClick={() => setTab("bots")} icon={MessageSquare} label="Salesbots de grupo" />\n        <TabButton active={tab === "agentes"} onClick={() => setTab("agentes")} icon={Sparkles} label="Agentes IA" />');
 once('        {tab === "bots" && (',`        {tab==='agentes'&&(agentsQ.isError?<div role="alert" className="rounded border border-destructive/30 p-4 text-sm text-destructive">Não foi possível carregar os agentes de grupo. {agentsQ.error instanceof Error?agentsQ.error.message:''}<button type="button" className="ml-3 underline" onClick={()=>void agentsQ.refetch()}>Tentar novamente</button></div>:<AgentesGrupoTab key={workspaceId??'none'} workspaceId={workspaceId} agents={agentsQ.data??[]} loading={agentsQ.isLoading} onChange={()=>void agentsQ.refetch()}/>)}
        {tab === "bots" && (`);
 once('onClick={() => setTypeOpen(true)}','onClick={() => {setNewMode("prompt");setTemplateSeed(null);setPickerOpen(true);}}');
 between('      {typeOpen && (','      {pickerOpen && (','');
 once('  const mode: AgentMode = forcedMode ?? initialSettings.mode ?? "prompt";','  const mode: AgentMode = "prompt";\n  const legacyNeedsReview=isLegacyObjectiveAgent(initial?.metadata);');
 once('  const [agentId, setAgentId] = useState<string | undefined>(initial?.id);','  const [agentId, setAgentId] = useState<string | undefined>(initial?.id||undefined);\n  const [saveVersion,setSaveVersion]=useState<string|undefined>((initial as (Agent&{updated_at?:string})|undefined)?.updated_at);\n  const creationRequestId=useRef(crypto.randomUUID());');
 once('    id: agentId,','    id: agentId,\n    creationRequestId:creationRequestId.current,\n    expectedUpdatedAt:saveVersion,');
 once('    objectiveTree: tree as unknown,','    // Archived objective_tree is not sent by this editor.');
 once('  const lastSyncedRef = useRef<string>("");','  const lastSyncedRef = useRef<string>(JSON.stringify(payloadRef.current));\n  const dirtySinceRef=useRef<number|null>(null);\n  const failedSaveRef=useRef(false);\n  const payloadSignature=JSON.stringify(payloadRef.current);\n  useEffect(()=>{if(payloadSignature===lastSyncedRef.current)dirtySinceRef.current=null;else if(dirtySinceRef.current===null)dirtySinceRef.current=Date.now();},[payloadSignature]);');
 once('      const payload = { ...payloadRef.current };',`      const payload = structuredClone(payloadRef.current);
      if(silent&&(failedSaveRef.current||((legacyNeedsReview||!agentId)&&!lastSavedAt)))return;
      const invalid=promptReadinessError(payload.systemPrompt);
      if(payload.enabled&&invalid){if(!silent)setErr(invalid);return;}`);
 once('        const res = (await saveFn({ data: payload as never })) as { id?: string } | undefined;\n        if (res?.id) setAgentId(res.id);\n        lastSyncedRef.current = JSON.stringify({ ...payloadRef.current, id: res?.id ?? payload.id });',`        const res=(await saveFn({data:payload as never})) as {id:string;updatedAt:string};
        if(!res?.id||!res.updatedAt)throw new Error('O servidor não confirmou o salvamento. Confira a lista antes de tentar novamente.');
        setAgentId(res.id);setSaveVersion(res.updatedAt);failedSaveRef.current=false;
        lastSyncedRef.current=JSON.stringify({...payload,id:res.id,expectedUpdatedAt:res.updatedAt});
        dirtySinceRef.current=null;`);
 once('        if (!silent) setErr((e as Error).message);','        failedSaveRef.current=true;setErr((e as Error).message);');
 once('    [actions, onSaved, saveFn, workspaceId],','    [actions, onSaved, saveFn, workspaceId,legacyNeedsReview,agentId,lastSavedAt],');
 once('  useEffect(() => {\n    const t = setInterval(() => {\n      void doSave(true);\n    }, 60_000);\n    return () => clearInterval(t);\n  }, [doSave]);',`  const saveLatest=useRef(doSave);saveLatest.current=doSave;
  useEffect(()=>{const timer=setInterval(()=>{if(dirtySinceRef.current!==null&&Date.now()-dirtySinceRef.current>=120000)void saveLatest.current(true);},1000);return()=>clearInterval(timer);},[]);
  const closeEditor=()=>{if(savingRef.current)return;if(JSON.stringify(payloadRef.current)!==lastSyncedRef.current&&!window.confirm('Existem alterações não salvas. Fechar sem salvar?'))return;onClose();};`);
 once('    <Modal\n      onClose={onClose}\n      size="full"','    <Modal\n      onClose={closeEditor}\n      size="full"');
 once('Tipo definido na criação, não pode ser alterado.','Configuração por prompt. A árvore antiga não é executada no teste.');
 once('      <div className="space-y-3">\n\n        {mode === "prompt" ? (','      <div className="space-y-3">\n        {legacyNeedsReview&&<p role="status" className="rounded border border-amber-500/30 p-3 text-xs">A árvore anterior está arquivada. Revise o prompt e clique em Salvar. O primeiro salvamento de conversão não é automático.</p>}\n        <p role="status" className="text-xs text-muted-foreground">Configuração e teste do agente. O atendimento automático em grupos ainda precisa da integração de execução; salvar não inicia mensagens.</p>\n        {mode === "prompt" ? (');
 once('title="Objetivo do agente no grupo"','title="Encerramento do atendimento no grupo"');
 once('subtitle="Sem um destino claro o moderador conversa pra sempre. Diga o que ele faz quando cumpre o objetivo ou bate no limite de interações."','subtitle="Defina o encaminhamento ao concluir o atendimento ou atingir o limite de interações."');
 once('<ObjectiveTreeEditor value={tree} onChange={setTree} scope="grupo" fullscreen workspaceId={workspaceId} onTest={() => setTestOpen(true)} />','<p>O editor de objetivos foi retirado. Utilize o prompt.</p>');
 // Scope the Close anchor by its neighboring save handler; other group dialogs have a Close button too.
 once('<button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border">\n            Fechar\n          </button>\n          <button\n            onClick={() => void doSave(false)}','<button onClick={closeEditor} disabled={saving} className="text-xs px-3 py-1.5 rounded border border-border">\n            Fechar\n          </button>\n          <button\n            onClick={() => void doSave(false)}');
 once('            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar','            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {saving?"Salvando...":"Salvar"}');
 once('        <div className="flex items-center justify-end gap-3 pt-2">','        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">\n          <span className="mr-auto text-xs text-muted-foreground">{payloadSignature!==lastSyncedRef.current?"Alterações não salvas":"Sem alterações pendentes"}</span>\n          <button type="button" className="rounded border px-3 py-1.5 text-xs" disabled={saving||Boolean(promptReadinessError(form.systemPrompt))} onClick={()=>setTestOpen(true)}>Testar prompt</button>');
 once('  if (q.isLoading) return <div className="p-5 text-xs text-muted-foreground text-center">Carregando relatório...</div>;','  if (q.isLoading) return <div className="p-5 text-xs text-muted-foreground text-center">Carregando relatório...</div>;\n  if(q.isError)return <div role="alert" className="p-5 text-sm text-destructive">Relatório de grupos indisponível. A falha de consulta não representa ausência de atendimentos.</div>;');
});
edit('src/lib/whatsapp-groups.functions.legacy.ts',({once,between})=>{
 once('import { z } from "zod";','import { z } from "zod";\nimport {attachSupabaseAuth} from "@/integrations/supabase/auth-attacher";\nimport {GroupPromptInputSchema,saveGroupPromptAgent,authorizeGroupActor} from "./slim-group-prompt.core";\nimport {mergePromptMetadata} from "./slim-prompt-only.core";');
 between('export const listGroupAiAgents = createServerFn({ method: "POST" })','const TriggerSchema =',`export const listGroupAiAgents=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>ListAgentsSchema.parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;await authorizeGroupActor(db,data.workspaceId,context.userId);
 const rows:AgentRow[]=[];
 for(let start=0;start<10000;start+=500){const r=await db.from('group_ai_agents').select('id,workspace_id,name,persona,system_prompt,model,temperature,max_tokens,respond_only_when_mentioned,cooldown_seconds,enabled,triggers,metadata,updated_at').eq('workspace_id',data.workspaceId).order('id').range(start,start+499);if(r.error||!Array.isArray(r.data))throw new Error('Não foi possível carregar os agentes de grupo.');rows.push(...r.data);if(r.data.length<500)return rows.sort((a:any,b:any)=>b.updated_at.localeCompare(a.updated_at));}
 throw new Error('Limite de leitura dos agentes atingido; a lista não foi truncada silenciosamente.');
});

`);
 between('const UpsertAgentSchema = z.object({','const DeleteAgentSchema =',`export const upsertGroupAiAgent=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>GroupPromptInputSchema.parse(v)).handler(({data,context})=>saveGroupPromptAgent(context.supabase as any,data,context.userId));

`);
 between('export const deleteGroupAiAgent = createServerFn({ method: "POST" })','/* ============ Relatório de agentes IA de grupo ============ */',`export const deleteGroupAiAgent=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>DeleteAgentSchema.parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;await authorizeGroupActor(db,data.workspaceId,context.userId,true);
 const linked=await db.from('whatsapp_groups').select('id').eq('workspace_id',data.workspaceId).eq('active_ai_agent_id',data.agentId).limit(1);
 if(linked.error)throw new Error('Não foi possível conferir os vínculos do agente.');if(linked.data?.length)throw new Error('Desvincule o agente dos grupos antes de excluí-lo.');
 const r=await db.from('group_ai_agents').delete().eq('workspace_id',data.workspaceId).eq('id',data.agentId).select('id').maybeSingle();if(r.error||!r.data)throw new Error('Exclusão não confirmada nesta empresa.');return {ok:true};
});
export const duplicateGroupAiAgent=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>DeleteAgentSchema.extend({name:z.string().trim().min(1).max(120).optional()}).parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;await authorizeGroupActor(db,data.workspaceId,context.userId,true);
 const r=await db.from('group_ai_agents').select('*').eq('workspace_id',data.workspaceId).eq('id',data.agentId).maybeSingle();if(r.error||!r.data)throw new Error('Agente não encontrado nesta empresa.');const row=r.data;
 const payload={workspace_id:data.workspaceId,name:(data.name||row.name+' (cópia)').slice(0,120),persona:row.persona,system_prompt:row.system_prompt,model:row.model,temperature:row.temperature,max_tokens:row.max_tokens,respond_only_when_mentioned:row.respond_only_when_mentioned,cooldown_seconds:row.cooldown_seconds,triggers:row.triggers,metadata:mergePromptMetadata(row.metadata,{settings:{mode:'prompt'}}),enabled:false};
 const saved=await db.from('group_ai_agents').insert({...payload,created_by:context.userId,creation_request_id:crypto.randomUUID(),creation_payload:payload}).select('id').single();if(saved.error||!saved.data)throw new Error('A duplicação não foi confirmada. Confira a lista antes de repetir.');return {id:saved.data.id};
});

`);
});
edit('src/routes/api/agent-test-chat.ts',({once})=>{
 once('        let provider;',`        // Group simulation has the same prompt-only boundary; no archived tree reaches buildSystem.
        if(body.config.scope!=='1a1'&&body.config.scope!=='grupo')return new Response('Escopo de teste inválido.',{status:400});
        if(body.config.scope==='grupo'){
          if(body.config.mode!=='prompt')return new Response('Use o prompt do agente de grupo. O fluxo de objetivos foi retirado.',{status:409});
          const invalid=promptReadinessError(body.config.systemPrompt);if(invalid)return new Response(invalid,{status:400});
          body.config={...body.config,mode:'prompt',tree:null};
        }
        let provider;`);
});
for(const [path,code]of plans){const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(source.parseDiagnostics.length)throw new Error(`[Group prompt] Invalid syntax ${path}: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);}
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Group prompt] ${plans.length} consumers updated. No live agent, group, message or order changed.`);
