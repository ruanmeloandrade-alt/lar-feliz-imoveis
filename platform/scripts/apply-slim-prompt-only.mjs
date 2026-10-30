import fs from 'node:fs';import ts from 'typescript';
// Independent conversation-agent change. Does not activate the blocked Funnel drawer integration.
const root=new URL('../',import.meta.url),mark='// SLIM_PROMPT_ONLY_V1',plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(mark))return;const once=(a,b)=>{if(code.split(a).length!==2)throw new Error(`[Prompt only] ${path}: nonunique anchor ${a.slice(0,100)}`);code=code.replace(a,()=>b);};const between=(a,b,next)=>{const start=code.indexOf(a),end=code.indexOf(b,start+a.length);if(start<0||end<0||code.split(a).length!==2)throw new Error(`[Prompt only] ${path}: missing block ${a}`);code=code.slice(0,start)+next+code.slice(end);};run({once,between});plans.push([path,code+'\n'+mark+'\n']);}
edit('src/components/automations/ConversationAgentsPanel.tsx',({once,between})=>{
 once('import { AgentTypeDialog, AgentModeBadge, type AgentMode } from "./AgentTypeDialog";','import { AgentModeBadge, type AgentMode } from "./AgentTypeDialog";\nimport {isLegacyObjectiveAgent,promptReadinessError} from "@/lib/slim-prompt-only.core";');
 once('  ObjectiveTreeEditor,\n','');
 once('onClick={() => setTypeOpen(true)}','onClick={() => {setNewMode("prompt");setTemplateSeed(null);setPickerOpen(true);}}');
 between('      {typeOpen && (','      {pickerOpen && (','');
 once('<AgentModeBadge mode={(s.mode ?? "prompt") as AgentMode} />','<AgentModeBadge mode="prompt" />\n                      {isLegacyObjectiveAgent(a.metadata)&&!a.system_prompt?.trim()&&<span className="text-[10px] text-amber-600">Preencher prompt</span>}');
 once('title="Ver conversas (replay em árvore)"','title="Ver histórico das conversas"');
 once('  const mode: AgentMode = forcedMode ?? initialSettings.mode ?? "prompt";','  const mode: AgentMode = "prompt";\n  const legacyNeedsReview=isLegacyObjectiveAgent(initial?.metadata);');
 once('    objectiveTree: tree as unknown,','    // Objective tree is retained in storage for audit, never submitted by the prompt editor.');
 once('      const payload = { ...payloadRef.current };',`      const payload = { ...payloadRef.current };
      // Opening an old agent must not silently convert its saved configuration by autosave.
      if(silent&&legacyNeedsReview&&!lastSavedAt)return;
      const promptError=promptReadinessError(payload.systemPrompt);
      if(promptError){if(!silent)setErr(promptError);return;}`);
 once('    [onSaved, saveFn, workspaceId, actions],','    [onSaved, saveFn, workspaceId, actions, legacyNeedsReview, lastSavedAt],');
 once('Tipo definido na criação, não pode ser alterado.','Atendimento por prompt. O fluxo de objetivos não é executado.');
 once('            <div className="mx-auto w-full max-w-5xl space-y-4">','            <div className="mx-auto w-full max-w-5xl space-y-4">\n              {legacyNeedsReview&&<p role="status" className="rounded border border-amber-500/30 p-3 text-xs">O fluxo anterior foi preservado para consulta, mas está desativado. Revise o prompt de atendimento e clique em Salvar. Abertura e autosave não convertem esse agente sem a primeira confirmação manual.</p>}');
 once('title="Objetivo do agente"','title="Encerramento do atendimento"');
 once('subtitle="A IA precisa levar a conversa até algum lugar, defina o que acontece quando ela atinge o objetivo ou o limite de interações."','subtitle="Defina o encaminhamento ao concluir o atendimento ou atingir o limite de interações."');
 once('  { id: "avancar-objetivo", label: "Avançar para próximo objetivo", needsTarget: false },\n','');
 once('                <ObjectiveTreeEditor \n                  value={tree} \n                  onChange={setTree} \n                  scope="individual" \n                  fullscreen \n                  workspaceId={workspaceId} \n                  onTest={() => setTestOpen(true)} \n                />','                <p className="p-4 text-sm">Use o prompt de atendimento. A edição por fluxo foi retirada.</p>');
});
edit('src/lib/conversation-agents.functions.ts',({once,between})=>{
 once('import { z } from "zod";','import { z } from "zod";\nimport {attachSupabaseAuth} from "@/integrations/supabase/auth-attacher";\nimport {mergePromptMetadata,promptReadinessError} from "./slim-prompt-only.core";');
 once('  mode: z.enum(["prompt", "objetivos"]).optional(),','  mode: z.literal("prompt").optional(),');
 between('export const upsertConversationAgent = createServerFn({ method: "POST" })','const DeleteSchema =',`export const upsertConversationAgent = createServerFn({method:"POST"})
 .middleware([attachSupabaseAuth,requireSupabaseAuth])
 .inputValidator((d:unknown)=>UpsertSchema.parse(d))
 .handler(async({data,context})=>{
  const db=context.supabase as any;
  const profile=await db.from('profiles').select('current_workspace_id').eq('id',context.userId).maybeSingle();
  if(profile.error||profile.data?.current_workspace_id!==data.workspaceId)throw new Error('A empresa ativa mudou. Reabra o editor.');
  const {assertSlimOperator}=await import('./slim-workspace-operator.server');
  await assertSlimOperator(db,data.workspaceId,context.userId);
  const validation=promptReadinessError(data.systemPrompt);
  if(data.enabled&&validation)throw new Error(validation);
  let previous:unknown={};
  if(data.id){
   const old=await db.from('conversation_ai_agents').select('metadata').eq('workspace_id',data.workspaceId).eq('id',data.id).maybeSingle();
   if(old.error||!old.data)throw new Error('Agente não encontrado nesta empresa.');
   previous=old.data.metadata;
  }
  const settings:Record<string,unknown>={mode:'prompt'};
  const names={language:'language',maxInteractions:'max_interactions',allowedActions:'allowed_actions',rules:'rules',sources:'sources',actions:'actions',links:'links',webhookTrigger:'webhook_trigger',outcome:'outcome'} as const;
  for(const [input,key]of Object.entries(names))if((data as any)[input]!==undefined)settings[key]=(data as any)[input];
  const payload={workspace_id:data.workspaceId,name:data.name,persona:data.persona??null,system_prompt:data.systemPrompt??null,model:data.model,temperature:data.temperature,max_tokens:data.maxTokens,cooldown_seconds:data.cooldownSeconds,enabled:data.enabled,metadata:mergePromptMetadata(previous,{settings})};
  if(data.id){
   const saved=await db.from('conversation_ai_agents').update(payload).eq('workspace_id',data.workspaceId).eq('id',data.id).select('id').maybeSingle();
   if(saved.error)throw new Error(saved.error.message);
   if(!saved.data)throw new Error('A alteração do agente não foi confirmada.');
   return {id:String(saved.data.id)};
  }
  const saved=await db.from('conversation_ai_agents').insert(payload).select('id').single();
  if(saved.error||!saved.data)throw new Error(saved.error?.message??'O cadastro do agente não foi confirmado.');
  return {id:String(saved.data.id)};
 });

`);
});
edit('src/lib/salesbot-runtime.server.ts',({once})=>{
 once('import type { WorkspaceAiKey } from "@/lib/workspace-ai-key.server";','import type { WorkspaceAiKey } from "@/lib/workspace-ai-key.server";\nimport {projectPromptAgent,promptReadinessError} from "./slim-prompt-only.core";');
 once('  return (data as { id: string; name: string; persona: string | null; system_prompt: string | null; model: string; metadata: unknown } | null) ?? null;','  return projectPromptAgent((data as { id: string; name: string; persona: string | null; system_prompt: string | null; model: string; metadata: unknown } | null) ?? null);');
 once('  if (!agent) return { reply: "", handoff: true, error: "Agente IA não encontrado" };','  if (!agent) return { reply: "", handoff: true, error: "Agente IA não encontrado" };\n  const readiness=promptReadinessError(agent.system_prompt);\n  if(readiness)return {reply:"",handoff:true,error:readiness};');
});
edit('src/routes/api/agent-test-chat.ts',({once})=>{
 once('import { describeConversationFacts, evaluateTrigger } from "@/lib/agent-trigger-eval";','import { describeConversationFacts, evaluateTrigger } from "@/lib/agent-trigger-eval";\nimport {promptReadinessError} from "@/lib/slim-prompt-only.core";');
 once('        let provider;',`        // Individual-agent test uses the same prompt-only contract as the live loader.
        // Group-agent configuration is a separate legacy module and is not changed here.
        if(body.config.scope==='1a1'){
          if(body.config.mode!=='prompt')return new Response('O fluxo de objetivos foi retirado. Reabra o editor e use o prompt.',{status:409});
          const invalid=promptReadinessError(body.config.systemPrompt);
          if(invalid)return new Response(invalid,{status:400});
          body.config={...body.config,mode:'prompt',tree:null};
        }
        let provider;`);
});
for(const [path,code]of plans){const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(source.parseDiagnostics.length)throw new Error(`[Prompt only] Invalid syntax ${path}: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);}
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Prompt only] ${plans.length} conversation-agent consumers updated. No stored agent, workflow, message or contact was changed by the build.`);
