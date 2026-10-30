/**
 * Núcleo funcional do funil Vanessa Simoni no Supabase Auth/RLS.
 * Mantém os DTOs da interface original. A execução de SalesBots e dos gatilhos
 * continua dependendo de backend separado, nunca roda no browser.
 */
import { supabase } from "@/integrations/supabase/client";
import {createSlimUiContact} from "./slim-contact-route.functions";
import {loadContactIdentityIndex,resolveSlimContactId} from "./slim-contact-identity.core";
import {moveSlimLeadWithAutomations} from "./slim-stage-move.functions";
const stageMoveRequests=new Map<string,string>();
const sb=supabase as any;
async function ctx(){
  const {data:auth,error:err}=await supabase.auth.getUser();
  if(err||!auth.user)throw new Error("Faça login na Vanessa Simoni.");
  const uid=auth.user.id;
  const {data:prof,error:e}=await sb.from("profiles").select("current_workspace_id")
    .eq("id",uid).maybeSingle();
  if(e||!prof?.current_workspace_id)throw new Error("Workspace indisponível.");
  const ws=prof.current_workspace_id as string;
  const {data:m,error:em}=await sb.from("workspace_members").select("role")
    .eq("user_id",uid).eq("workspace_id",ws).maybeSingle();
  if(em||!m)throw new Error("Não há acesso autorizado ao funil.");
  return {ws,uid,role:String(m.role)};
}
const rows=(res:any):any[]=>{
  if(res.error)throw new Error(res.error.message);
  return res.data??[];
};
const requiresEditor=(role:string)=>{
  if(!["owner","admin"].includes(role))
    throw new Error("Sem permissão para modificar o funil.");
};
export async function listSlimSources(){
  const {ws}=await ctx();
  const sources=rows(await sb.from("crm_sources").select("id,provider,display_name,is_default")
    .eq("workspace_id",ws).order("is_default",{ascending:false}));
  return {sources};
}
export async function listSlimFunnels({data}:{data:{crmSourceId:string}}){
  const {ws}=await ctx();
  const linked=rows(await sb.from("crm_source_funnels").select("pipeline_id")
    .eq("workspace_id",ws).eq("crm_source_id",data.crmSourceId));
  const ids=linked.map((x:any)=>x.pipeline_id);
  if(!ids.length)return {funnels:[]};
  const [p,st,lr]=await Promise.all([
    sb.from("pipelines").select("id,name,position").eq("workspace_id",ws).in("id",ids).order("position"),
    sb.from("pipeline_stages").select("id,pipeline_id,name,color,description,position,created_at")
      .eq("workspace_id",ws).in("pipeline_id",ids).order("position"),
    sb.from("leads").select("id,pipeline_id,stage_id,name,value,created_at,email,phone,tags,last_message_from,company_id")
      .eq("workspace_id",ws).eq("crm_source_id",data.crmSourceId).eq("status","active").is("merged_into_id",null).limit(5000),
  ]);
  const identity=await loadContactIdentityIndex(sb,ws);
  const pipes=rows(p),stages=rows(st),leads=rows(lr).filter(lead=>identity.resolve(lead.id)===lead.id);
  return {funnels:pipes.map((pipe:any)=>({
    id:pipe.id,name:pipe.name,
    stages:stages.filter((stage:any)=>stage.pipeline_id===pipe.id).map((stage:any)=>({
      id:stage.id,name:stage.name,color:stage.color??null,
      description:stage.description??null,
      status:/ganh|venda/i.test(stage.name)?"ganha":/perdid/i.test(stage.name)?"perdida":"aberta",
      leads:leads.filter((lead:any)=>lead.stage_id===stage.id).map((lead:any)=>({
        id:lead.id,name:lead.name,value:Number(lead.value??0),
        lastMessageFrom:lead.last_message_from??"none",
        companyId:lead.company_id,createdAt:lead.created_at,
        email:lead.email,phone:lead.phone,
        tags:Array.isArray(lead.tags)?lead.tags:[],
      }))
    }))
  }))};
}
export async function listSlimUsers(){
  const {ws}=await ctx();
  const members=rows(await sb.from("workspace_members").select("user_id")
    .eq("workspace_id",ws));
  const ids=members.map((m:any)=>m.user_id);
  if(!ids.length)return {users:[]};
  const profiles=rows(await sb.from("profiles").select("id,display_name,full_name").in("id",ids));
  const byId=new Map(profiles.map((p:any)=>[p.id,p]));
  return {users:ids.map((id:string)=>({
    id,name:byId.get(id)?.display_name||byId.get(id)?.full_name||"Usuário"
  }))};
}
export async function moveSlimLead({data}:{data:{leadId:string;toStageId:string}}){
  const key=data.leadId+':'+data.toStageId;
  let requestId=stageMoveRequests.get(key);
  if(!requestId){requestId=crypto.randomUUID();stageMoveRequests.set(key,requestId);}
  const result=await moveSlimLeadWithAutomations({data:{...data,requestId}});
  stageMoveRequests.delete(key);
  return result;
}

export async function updateSlimStage({data}:{
 data:{stageId:string;name?:string;color?:string|null;description?:string|null}
}) {
 const {ws,role}=await ctx();requiresEditor(role);
 const patch:Record<string,unknown>={};
 if(data.name!==undefined) {
   if(!data.name.trim())throw new Error("Informe o nome da etapa.");
   patch.name=data.name.trim();
 }
 if(data.color!==undefined) patch.color=data.color;
 if(data.description!==undefined) patch.description=data.description;
 if(Object.keys(patch).length===0)return {ok:true};
 const {data:updated,error}=await sb.from("pipeline_stages").update(patch)
   .eq("workspace_id",ws).eq("id",data.stageId).select("id").maybeSingle();
 if(error)throw new Error(error.message);
 if(!updated)throw new Error("Etapa não encontrada.");
 return {ok:true};
}
export async function createSlimStage({data}:{
 data:{pipelineId:string;name:string;color?:string|null}
}) {
 const {ws,role}=await ctx();requiresEditor(role);
 const {data:pipe,error:pe}=await sb.from("pipelines").select("id")
   .eq("workspace_id",ws).eq("id",data.pipelineId).maybeSingle();
 if(pe||!pipe)throw new Error("Funil não encontrado.");
 const {data:stages,error:se}=await sb.from("pipeline_stages").select("position")
   .eq("workspace_id",ws).eq("pipeline_id",data.pipelineId);
 if(se)throw new Error(se.message);
 const position=Math.max(0,...(stages??[]).map((s:any)=>Number(s.position??0)))+1;
 const {data:created,error}=await sb.from("pipeline_stages").insert({
   workspace_id:ws,pipeline_id:data.pipelineId,name:data.name.trim(),
   position,color:data.color??"#3b82f6",
 }).select("id").single();
 if(error)throw new Error(error.message);
 return {stageId:created.id};
}
export async function renameSlimPipeline({data}:{data:{pipelineId:string;name:string}}) {
 const {ws,role}=await ctx();requiresEditor(role);
 if(!data.name.trim())throw new Error("Informe o nome do funil.");
 const {data:updated,error}=await sb.from("pipelines").update({
   name:data.name.trim(),updated_at:new Date().toISOString(),
 }).eq("workspace_id",ws).eq("id",data.pipelineId).select("id").maybeSingle();
 if(error)throw new Error(error.message);
 if(!updated)throw new Error("Funil não encontrado.");
 return {ok:true};
}

/** Cria o funil e suas etapas padrão para a fonte do workspace ativo. */
export async function createSlimFunnel({data}:{data:{crmSourceId:string;name:string}}):Promise<{pipelineId:string}> {
  const {ws,role}=await ctx();requiresEditor(role);
  const name=data.name?.trim();
  if(!name||name.length>120)throw new Error("Informe um nome válido para o funil.");
  const {data:source,error:sourceError}=await sb.from("crm_sources")
    .select("id").eq("workspace_id",ws).eq("id",data.crmSourceId).maybeSingle();
  if(sourceError||!source)throw new Error("Fonte do CRM inválida.");
  const {data:existing,error:positionsError}=await sb.from("pipelines")
    .select("position").eq("workspace_id",ws);
  if(positionsError)throw new Error(positionsError.message);
  const position=Math.max(0,...(existing??[]).map((v:any)=>Number(v.position??0)))+1;
  const {data:created,error}=await sb.from("pipelines").insert({
    workspace_id:ws,crm_source_id:source.id,name,position,
  }).select("id").single();
  if(error)throw new Error(error.message);
  const pipelineId=created.id as string;
  try{
    const {error:linkError}=await sb.from("crm_source_funnels").insert({
      workspace_id:ws,crm_source_id:source.id,pipeline_id:pipelineId,
    });
    if(linkError)throw new Error(linkError.message);
    const stages=[
      ["Novo lead","#3b82f6"],["Em contato","#8b5cf6"],["Qualificação","#06b6d4"],
      ["Proposta","#f59e0b"],["Negociação","#ef4444"],["Venda realizada","#10b981"],
      ["Perdida","#6b7280"],
    ].map(([name,color],i)=>({
      workspace_id:ws,pipeline_id:pipelineId,name,color,position:i+1,
    }));
    const {error:stageError}=await sb.from("pipeline_stages").insert(stages);
    if(stageError)throw new Error(stageError.message);
  }catch(e){
    await sb.from("pipelines").delete().eq("workspace_id",ws).eq("id",pipelineId);
    throw e;
  }
  return {pipelineId};
}

/** A mesma tentativa de cadastro conserva sua referência até a confirmação do servidor. */
export async function createSlimLead({data}:{
  data:{crmSourceId:string;pipelineId:string;stageId:string;name:string;
    email?:string;phone?:string;value?:number;requestId:string}
}):Promise<{id:string;leadId:string;eventId:string|null;automationQueued:boolean}> {
  const name=data.name?.trim();
  if(!name||name.length>200)throw new Error("Nome do cliente inválido.");
  if(!data.requestId)throw new Error("A tentativa de cadastro não foi identificada. Abra novamente o formulário.");
  const {createSlimLeadWithAutomations}=await import("./slim-funnel-mutations.functions");
  const result=await createSlimLeadWithAutomations({data:{
    ...data,name,email:data.email?.trim()||"",phone:data.phone?.trim()||"",
    value:data.value??0,
  }});
  if(!result||typeof result.id!=="string"||!result.id||result.leadId!==result.id
    ||typeof result.automationQueued!=="boolean")
    throw new Error("O cadastro não foi confirmado. Confira o funil antes de repetir.");
  return result;
}

/** Move somente a seleção explícita e registra seus eventos na mesma transação. */
export async function bulkMoveSlimLeads({data}:{
  data:{leadIds:string[];targetPipelineId:string;targetStageId:string;requestId:string}
}):Promise<{ok:true;count:number;movedCount:number;unchangedCount:number;eventIds:string[]}> {
  if(data.leadIds.length<1||data.leadIds.length>100)
    throw new Error("Selecione de 1 a 100 clientes para mover de uma vez.");
  if(new Set(data.leadIds).size!==data.leadIds.length)
    throw new Error("A seleção contém clientes repetidos. Atualize o funil.");
  if(!data.requestId)throw new Error("A tentativa de movimentação não foi identificada. Selecione novamente o destino.");
  const {bulkMoveSlimLeadsWithAutomations}=await import("./slim-funnel-mutations.functions");
  const result=await bulkMoveSlimLeadsWithAutomations({data:{
    leadIds:[...data.leadIds].sort(),toStageId:data.targetStageId,requestId:data.requestId,
  }});
  if(!result||result.ok!==true||result.count!==data.leadIds.length
    ||!Number.isInteger(result.movedCount)||!Number.isInteger(result.unchangedCount)
    ||result.movedCount<0||result.unchangedCount<0
    ||result.movedCount+result.unchangedCount!==result.count||!Array.isArray(result.eventIds))
    throw new Error("A movimentação não foi confirmada. Confira o funil antes de repetir.");
  return result;
}

export async function setDefaultSlimSource({data}:{data:{crmSourceId:string}}):Promise<{ok:true}>{
  const {ws,role}=await ctx();requiresEditor(role);
  const {data:source,error:sourceError}=await sb.from("crm_sources").select("id")
    .eq("workspace_id",ws).eq("id",data.crmSourceId).maybeSingle();
  if(sourceError||!source)throw new Error("Fonte indisponível.");
  const {error:resetError}=await sb.from("crm_sources").update({is_default:false}).eq("workspace_id",ws);
  if(resetError)throw new Error(resetError.message);
  const {error}=await sb.from("crm_sources").update({is_default:true})
    .eq("workspace_id",ws).eq("id",data.crmSourceId);
  if(error)throw new Error(error.message);
  return {ok:true};
}

/** Reordena as etapas existentes de um mesmo funil; a entrada é validada antes da gravação. */
export async function reorderSlimStages({data}:{
  data:{pipelineId:string;stageIds:string[]}
}):Promise<{ok:true}> {
  const {ws,role}=await ctx();requiresEditor(role);
  const {data:existing,error}=await sb.from("pipeline_stages").select("id")
    .eq("workspace_id",ws).eq("pipeline_id",data.pipelineId);
  if(error)throw new Error(error.message);
  const ids=(existing??[]).map((item:{id:string})=>item.id);
  if(!ids.length||ids.length!==data.stageIds.length
     ||new Set(data.stageIds).size!==ids.length
     ||data.stageIds.some(id=>!ids.includes(id)))
    throw new Error("A ordem das etapas não corresponde ao funil selecionado.");
  // Atualização por IDs do próprio workspace. Falhas retornam erro, nunca são ocultadas.
  for(const [i,id] of data.stageIds.entries()){
    const {error:updateError}=await sb.from("pipeline_stages")
      .update({position:i+1}).eq("workspace_id",ws).eq("pipeline_id",data.pipelineId).eq("id",id);
    if(updateError)throw new Error(updateError.message);
  }
  return {ok:true};
}

// SLIM_CONTACT_IDENTITY_V1

// SLIM_HISTORY_MEDIA_STAGE_HOTFIX_V1
