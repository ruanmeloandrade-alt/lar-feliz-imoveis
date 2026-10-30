/**
 * Adaptador de Clientes/CRM da Vanessa Simoni para Supabase.
 * Mesma interface de dados do módulo original, com sessão e RLS.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LeadDetailResponse, LeadListRow } from "@/lib/leads.functions";
import {loadContactIdentityIndex,resolveSlimContactId} from "./slim-contact-identity.core";
import {readSlimContactHistory} from "./slim-contact-history.core";
const sb = supabase as any;
type DbLead = {
  id: string; name: string; email: string | null; phone: string | null; value: number | string | null;
  stage_id: string | null; pipeline_id: string | null; crm_source_id: string | null;
  external_id: string | null; last_message_from: string | null;
  tags: unknown; custom_data: unknown; keep_files: boolean;
  created_at: string; updated_at: string; 
  pipeline_stages: { name: string } | null;
  pipelines: { name: string } | null;
  crm_sources: { provider: string; display_name: string } | null;
};
async function workspace(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("É necessário entrar na Vanessa Simoni.");
  const { data: p, error: pError } = await sb.from("profiles").select("current_workspace_id")
    .eq("id", data.user.id).maybeSingle();
  if (pError) throw new Error(pError.message);
  const ws = p?.current_workspace_id;
  if (!ws) throw new Error("Nenhum workspace ativo.");
  const { data: m, error: mError } = await sb.from("workspace_members").select("id,role")
    .eq("user_id", data.user.id).eq("workspace_id", ws).maybeSingle();
  if (mError || !m) throw new Error("Usuário sem acesso ao workspace.");
  // A matriz de permissões ainda não está migrada. Fail-closed para funções CRM
  // até que o serviço de autorização por equipe seja implantado.
  if (!["owner", "admin"].includes(m.role)) throw new Error("Permissão de CRM indisponível para este perfil.");
  return ws;
}
function check(res: { error: { message: string } | null; data: any }) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
function rowToList(r: DbLead): LeadListRow {
  return {
    id:r.id,name:r.name,email:r.email,phone:r.phone,value:Number(r.value??0),
    stageId:r.stage_id,stageName:r.pipeline_stages?.name??null,
    pipelineName:r.pipelines?.name??null,sourceId:r.crm_source_id,
    sourceProvider:r.crm_sources?.provider??"manual",
    sourceDisplayName:r.crm_sources?.display_name??"Vanessa Simoni",
    externalId:r.external_id,createdAt:r.created_at,updatedAt:r.updated_at,
    lastMessageFrom:r.last_message_from==="lead"?"lead":r.last_message_from==="us"?"us":"none",
    tags:Array.isArray(r.tags)?r.tags.filter((v):v is string=>typeof v==="string"):[],
  };
}

export async function loadSlimLeads(): Promise<{leads:LeadListRow[]}> {
  const ws = await workspace();
  const data=check(await sb.from("leads")
    .select("id,name,email,phone,value,stage_id,pipeline_id,crm_source_id,external_id,last_message_from,tags,created_at,updated_at,pipeline_stages(name),pipelines(name),crm_sources(provider,display_name)")
    .eq("workspace_id",ws).eq("status","active").is("merged_into_id",null)
    .order("updated_at",{ascending:false}).limit(500)) as DbLead[];
  const identity=await loadContactIdentityIndex(sb,ws);
  return {leads:(data??[]).filter(row=>identity.resolve(row.id)===row.id).map(rowToList)};
}

export async function loadSlimLeadDetail({data}:{data:{leadId:string}}):Promise<LeadDetailResponse> {
  const ws=await workspace();
  data={leadId:await resolveSlimContactId(sb,ws,data.leadId)};
  const r=check(await sb.from("leads")
    .select("id,name,email,phone,value,stage_id,pipeline_id,crm_source_id,external_id,last_message_from,tags,custom_data,keep_files,created_at,updated_at,pipeline_stages(name),pipelines(name),crm_sources(provider,display_name)")
    .eq("workspace_id",ws).eq("id",data.leadId).maybeSingle()) as DbLead|null;
  if(!r)throw new Error("Cliente não encontrado.");
  const {data:acts,error:actError}=await sb.from("lead_activities")
    .select("id,type,payload,occurred_at")
    .eq("workspace_id",ws).eq("lead_id",r.id).order("occurred_at",{ascending:false}).limit(100);
  if(actError)throw new Error(actError.message);
  const identity=await loadContactIdentityIndex(sb,ws);
  const unifiedHistory=await readSlimContactHistory(sb,ws,r.id,identity.family(r.id),{limit:100});
  const phoneDigits = (r.phone ?? "").replace(/\D/g, "");
  const whatsappUrl = phoneDigits.length >= 8 ? "https://wa.me/" + phoneDigits : null;
  const custom=r.custom_data && typeof r.custom_data==="object" && !Array.isArray(r.custom_data)
    ? Object.entries(r.custom_data as Record<string,unknown>).map(([id,value])=>({
        id,name:id,type:"text",displayValue:typeof value==="string"?value:JSON.stringify(value??"")
      }))
    : [];
  return {
    lead:{
      id:r.id,name:r.name,email:r.email,phone:r.phone,value:Number(r.value??0),
      stageId:r.stage_id,stageName:r.pipeline_stages?.name??null,
      pipelineId:r.pipeline_id,pipelineName:r.pipelines?.name??null,
      sourceId:r.crm_source_id,sourceProvider:r.crm_sources?.provider??"manual",
      sourceDisplayName:r.crm_sources?.display_name??"Vanessa Simoni",
      externalId:r.external_id,externalUrl:null,
      whatsappUrl,
      tags:Array.isArray(r.tags)?r.tags.filter((v):v is string=>typeof v==="string"):[],
      customFields:custom,createdAt:r.created_at,updatedAt:r.updated_at,keepFiles:!!r.keep_files
    },
    activities:unifiedHistory.activities,
  };
}

// SLIM_CONTACT_IDENTITY_V1

// SLIM_CONTACT_IDENTITY_COMPAT_V1
