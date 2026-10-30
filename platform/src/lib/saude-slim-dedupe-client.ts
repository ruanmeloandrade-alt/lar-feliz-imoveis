/**
 * Operações de duplicidade dos clientes Vanessa Simoni.
 * Busca e rejeição usam RLS, mesclagem utiliza RPC atômica SECURITY INVOKER.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DuplicateLead, DuplicateGroup, DuplicateReason } from "@/lib/leads-dedupe.functions";

const sb = supabase as any;
type Lead = {
  id:string;name:string;email:string|null;phone:string|null;phone_normalized:string|null;
  value:number|null;created_at:string;updated_at:string;tags:unknown;
  custom_data: Record<string,unknown>|null;
  pipelines:{name:string}|null;pipeline_stages:{name:string}|null;
};
async function context() {
  const {data:user,error} = await supabase.auth.getUser();
  if(error||!user.user)throw new Error("Faça login para acessar duplicidades.");
  const {data:profile,error:pErr} = await sb.from("profiles")
    .select("current_workspace_id").eq("id",user.user.id).maybeSingle();
  if(pErr||!profile?.current_workspace_id)throw new Error("Workspace indisponível.");
  const {data:member,error:mErr} = await sb.from("workspace_members").select("role")
    .eq("workspace_id",profile.current_workspace_id).eq("user_id",user.user.id).maybeSingle();
  if(mErr||!member||!["owner","admin"].includes(member.role))
    throw new Error("Somente responsáveis autorizados podem gerenciar duplicidades.");
  return {ws:profile.current_workspace_id as string,userId:user.user.id};
}
function str(v:unknown):string|null{
  if(v==null)return null;
  const s=String(v).trim();return s||null;
}
function toLead(r:Lead):DuplicateLead {
  const custom=r.custom_data??{};
  return {
    id:r.id,name:r.name,email:r.email,phone:r.phone,
    stageName:r.pipeline_stages?.name??null,pipelineName:r.pipelines?.name??null,
    value:Number(r.value??0),createdAt:r.created_at,updatedAt:r.updated_at,
    company:str(custom.company_name),instagram:str(custom.instagram_handle),
    website:str(custom.website_url),country:str(custom.country),niche:str(custom.niche),
    tags:Array.isArray(r.tags)?r.tags.filter((t):t is string=>typeof t==="string"):[],
  };
}
export async function findSlimDuplicateLeads():Promise<{groups:DuplicateGroup[]}> {
  const {ws}=await context();
  const [leadsRes,dismissedRes]=await Promise.all([
    sb.from("leads")
      .select("id,name,email,phone,phone_normalized,value,created_at,updated_at,custom_data,tags,pipelines(name),pipeline_stages(name)")
      .eq("workspace_id",ws).eq("status","active").limit(5000),
    sb.from("lead_dedupe_dismissals").select("signature").eq("workspace_id",ws),
  ]);
  if(leadsRes.error)throw new Error(leadsRes.error.message);
  if(dismissedRes.error)throw new Error(dismissedRes.error.message);
  const rows=(leadsRes.data??[]) as Lead[];
  const dismissed=new Set<string>((dismissedRes.data??[]).map((r:{signature:string})=>r.signature));
  const byPhone=new Map<string,Lead[]>(),byEmail=new Map<string,Lead[]>(),byInstagram=new Map<string,Lead[]>();
  const add=(map:Map<string,Lead[]>,key:string,lead:Lead)=>{
    const arr=map.get(key)??[];arr.push(lead);map.set(key,arr);
  };
  for(const lead of rows){
    const normalized=String(lead.phone_normalized??lead.phone??"").replace(/\D/g,"").replace(/^0+/,"");
    if(normalized.length>=8)add(byPhone,normalized.slice(-11),lead);
    const email=(lead.email??"").trim().toLowerCase();
    if(email)add(byEmail,email,lead);
    const insta=String(lead.custom_data?.instagram_handle??"").trim().toLowerCase().replace(/^@/,"");
    if(insta)add(byInstagram,insta,lead);
  }
  const groups:DuplicateGroup[]=[];
  function collect(map:Map<string,Lead[]>,reason:DuplicateReason){
    for(const [key,leads] of map){
      if(leads.length<2)continue;
      const sig=`${reason}:${key}:${leads.map(l=>l.id).sort().join("|")}`;
      if(dismissed.has(sig))continue;
      groups.push({signature:sig,reason,key,leads:leads.map(toLead)});
    }
  }
  collect(byPhone,"phone");collect(byEmail,"email");collect(byInstagram,"instagram");
  const used=new Set<string>();
  return {groups:groups.filter(g=>{
    const key=g.leads.map(l=>l.id).sort().join("|");
    if(used.has(key))return false;used.add(key);return true;
  }).sort((a,b)=>b.leads.length-a.leads.length).slice(0,100)};
}
export async function dismissSlimDuplicateGroup({data}:{data:{signature:string}}) {
  const {ws,userId}=await context();
  if(!data.signature||data.signature.length>10000)throw new Error("Grupo inválido.");
  const {error}=await sb.from("lead_dedupe_dismissals").upsert(
    {workspace_id:ws,signature:data.signature,dismissed_by:userId},
    {onConflict:"workspace_id,signature",ignoreDuplicates:true}
  );
  if(error)throw new Error(error.message);
  return {ok:true};
}
export async function mergeSlimLeads({data}:{data:{primaryId:string;mergedIds:string[]}}):Promise<{ok:boolean;primaryId:string;mergedCount:number}> {
  await context();
  if(data.mergedIds.length<1||data.mergedIds.length>10||data.mergedIds.includes(data.primaryId))
    throw new Error("Seleção inválida para mesclagem.");
  const {data:merged,error}=await sb.rpc("saude_slim_merge_leads",{
    p_primary_id:data.primaryId,p_merged_ids:data.mergedIds,
  });
  if(error)throw new Error(error.message);
  return merged;
}
