import {z} from 'zod';
import {recoverUnchangedGroupCreation} from './slim-group-recovery.core.ts';
import {mergePromptMetadata,promptReadinessError} from './slim-prompt-only.core';

type Obj=Record<string,unknown>;type Db={from:(table:string)=>any};
const object=(v:unknown):Obj=>v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const Trigger=z.object({id:z.string().min(1).max(160),type:z.enum(['mention','keyword','all_messages','member_join','member_leave','webhook','schedule','lead_stage_change','link_not_allowed']),enabled:z.boolean(),config:z.record(z.string(),z.unknown())});
const Rule=z.object({id:z.string().optional(),logic:z.enum(['e','ou']),conditions:z.array(z.object({field:z.string(),op:z.string(),value:z.string(),fieldId:z.string().optional()})).max(100),action:z.object({type:z.string(),target:z.string(),targetLabel:z.string().optional()})});
export const GroupPromptInputSchema=z.object({
 id:z.string().uuid().optional(),creationRequestId:z.string().uuid().optional(),expectedUpdatedAt:z.string().datetime({offset:true}).optional(),workspaceId:z.string().uuid(),
 name:z.string().trim().min(1).max(120),persona:z.string().max(2000).optional(),systemPrompt:z.string().max(20000).optional(),
 model:z.string().min(1).max(120).optional(),temperature:z.number().min(0).max(2).optional(),maxTokens:z.number().int().min(64).max(8192).optional(),
 respondOnlyWhenMentioned:z.boolean().optional(),cooldownSeconds:z.number().int().min(0).max(3600).optional(),enabled:z.boolean().optional(),
 triggers:z.array(Trigger).max(100).optional(),mode:z.literal('prompt').default('prompt'),language:z.string().max(20).optional(),maxInteractions:z.number().int().min(0).max(1000).optional(),
 allowedActions:z.array(z.string()).max(100).optional(),rules:z.array(Rule).max(100).optional(),sources:z.array(z.record(z.string(),z.unknown())).max(100).optional(),actions:z.array(z.record(z.string(),z.unknown())).max(100).optional(),
 outcome:z.union([z.array(z.object({id:z.string(),action:z.string(),target:z.string(),message:z.string().optional()})).max(100),z.object({action:z.string(),target:z.string(),farewell:z.string().optional()})]).optional(),
 session:z.object({mode:z.enum(['grupo-aberto','por-membro']),open_on:z.enum(['regra','palavra-chave','mencao','pergunta']),open_keywords:z.string().max(4000),respond_in:z.enum(['grupo','privado','ambos']),timeout_minutes:z.number().int().min(1).max(1440),max_concurrent:z.number().int().min(0).max(500),intro_message:z.string().max(8000)}).optional(),
}).superRefine((v,ctx)=>{if(!v.id&&!v.creationRequestId)ctx.addIssue({code:'custom',message:'Referência de criação ausente. Reabra o editor.',path:['creationRequestId']});if(JSON.stringify(v).length>250000)ctx.addIssue({code:'custom',message:'Configuração acima do limite permitido.'});});
export type GroupPromptInput=z.infer<typeof GroupPromptInputSchema>;

/** Public configuration fields only. Old tree is archived, never replaced by editor input. */
export function buildGroupPromptPayload(input:GroupPromptInput,previous:unknown={}):Obj{
 const old=object(previous);const patch:Obj={mode:'prompt'};
 const settingsNames={language:'language',maxInteractions:'max_interactions',allowedActions:'allowed_actions',rules:'rules',sources:'sources',actions:'actions',outcome:'outcome',session:'session'} as const;
 for(const [field,key]of Object.entries(settingsNames))if(input[field as keyof GroupPromptInput]!==undefined)patch[key]=input[field as keyof GroupPromptInput];
 const fields={persona:'persona',systemPrompt:'system_prompt',model:'model',temperature:'temperature',maxTokens:'max_tokens',respondOnlyWhenMentioned:'respond_only_when_mentioned',cooldownSeconds:'cooldown_seconds',enabled:'enabled',triggers:'triggers'} as const;
 const payload:Obj={workspace_id:input.workspaceId,name:input.name,persona:null,system_prompt:null,model:'openai/gpt-5.5',temperature:0.7,max_tokens:1024,respond_only_when_mentioned:true,cooldown_seconds:30,enabled:true,triggers:[]};
 for(const [field,column]of Object.entries(fields)){if(old[column]!==undefined)payload[column]=old[column];if(input[field as keyof GroupPromptInput]!==undefined)payload[column]=input[field as keyof GroupPromptInput];}
 if(input.triggers!==undefined){const active=input.triggers.filter(t=>t.enabled);payload.respond_only_when_mentioned=input.triggers.length?active.some(t=>t.type==='mention')&&!active.some(t=>t.type==='all_messages'):payload.respond_only_when_mentioned;}
 payload.metadata=mergePromptMetadata(old.metadata,{settings:patch});
 const invalid=promptReadinessError(payload.system_prompt);if(payload.enabled&&invalid)throw new Error(invalid);
 return payload;
}
export function stableGroupJson(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stableGroupJson).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableGroupJson((value as Obj)[k])).join(',')+'}';
 return JSON.stringify(value)??'null';
}
/** Every group editor entry checks current workspace, membership and expiry. */
export async function authorizeGroupActor(db:Db,workspaceId:string,actorId:string,write=false):Promise<void>{
 if(!actorId)throw new Error('Sessão expirada.');
 const profile=await db.from('profiles').select('current_workspace_id').eq('id',actorId).maybeSingle();
 if(profile.error||profile.data?.current_workspace_id!==workspaceId)throw new Error('A empresa ativa mudou. Reabra a Central de Grupos.');
 const [ws,member]=await Promise.all([db.from('workspaces').select('owner_id').eq('id',workspaceId).maybeSingle(),db.from('workspace_members').select('role_type,access_expires_at').eq('workspace_id',workspaceId).eq('user_id',actorId).maybeSingle()]);
 if(ws.error||member.error||!ws.data)throw new Error('Não foi possível conferir a permissão da empresa.');
 if(ws.data.owner_id===actorId)return;
 const m=member.data;
 if(!m||!m.role_type||(m.access_expires_at&&(!Number.isFinite(Date.parse(m.access_expires_at))||Date.parse(m.access_expires_at)<=Date.now()))||(write&&m.role_type==='visualizador'))throw new Error('Sem permissão para esta operação nos agentes de grupo.');
}
export async function saveGroupPromptAgent(db:Db,raw:unknown,actorId:string):Promise<{id:string;updatedAt:string;recovered:boolean}>{
 const data=GroupPromptInputSchema.parse(raw);await authorizeGroupActor(db,data.workspaceId,actorId,true);
 let previous:Obj={};
 if(data.id){const r=await db.from('group_ai_agents').select('*').eq('workspace_id',data.workspaceId).eq('id',data.id).maybeSingle();if(r.error||!r.data)throw new Error('Agente não encontrado nesta empresa.');previous=r.data;if(data.expectedUpdatedAt&&data.expectedUpdatedAt!==previous.updated_at)throw new Error('Este agente foi alterado por outro salvamento. Reabra o editor antes de salvar.');}
 const payload=buildGroupPromptPayload(data,previous);
 if(data.id){
  const r=await db.from('group_ai_agents').update(payload).eq('workspace_id',data.workspaceId).eq('id',data.id).eq('updated_at',previous.updated_at).select('id,updated_at').maybeSingle();
  if(r.error)throw new Error(r.error.message);if(!r.data)throw new Error('O agente mudou durante o salvamento. A atualização não foi aplicada.');
  return {id:r.data.id,updatedAt:r.data.updated_at,recovered:false};
 }
 const findAttempt=async()=>{const r=await db.from('group_ai_agents').select('*').eq('workspace_id',data.workspaceId).eq('creation_request_id',data.creationRequestId).maybeSingle();if(r.error)throw new Error('Não foi possível conferir a tentativa de criação. Nenhuma nova tentativa foi iniciada.');return r.data;};
 const recover=(row:any)=>recoverUnchangedGroupCreation(row,payload,actorId);
 const old=await findAttempt();if(old)return recover(old);
 const r=await db.from('group_ai_agents').insert({...payload,created_by:actorId,creation_request_id:data.creationRequestId,creation_payload:payload}).select('id,updated_at').single();
 if(r.error){if(r.error.code==='23505'){const winner=await findAttempt();if(winner)return recover(winner);}throw new Error(r.error.message);}
 if(!r.data?.id)throw new Error('A criação não foi confirmada. Preserve a tentativa e confira a lista antes de repetir.');
 return {id:r.data.id,updatedAt:r.data.updated_at,recovered:false};
}

// SLIM_GROUP_RECOVERY_GUARD_V1
