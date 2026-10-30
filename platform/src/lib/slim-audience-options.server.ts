import { readAudienceRows, audienceTags } from './slim-audience.core';
export async function slimAudienceOptions(sb:any,ws:string) {
  const [pipes,stages,srcs,leads,fields,members,companies] = await Promise.all([
    readAudienceRows(sb,ws,'pipelines','id,name'),
    readAudienceRows(sb,ws,'pipeline_stages','id,name,pipeline_id,position'),
    readAudienceRows(sb,ws,'crm_sources','id,provider,display_name'),
    readAudienceRows(sb,ws,'leads','id,tags'),
    readAudienceRows(sb,ws,'lead_custom_fields','id,name,field_type,active'),
    readAudienceRows(sb,ws,'workspace_members','id,user_id,access_expires_at'),
    readAudienceRows(sb,ws,'companies','id,name'),
  ]);
  const ids=members.map((m:any)=>m.user_id);const profiles:any[]=[];
  for(let i=0;i<ids.length;i+=100){
    const r=await sb.from('profiles').select('id,display_name,full_name').in('id',ids.slice(i,i+100));
    if(r.error)throw new Error('Não foi possível carregar os nomes da equipe.');
    profiles.push(...(r.data??[]));
  }
  const names=new Map(profiles.map((p:any)=>[p.id,p.display_name||p.full_name]));
  const sources=srcs.map((s:any)=>({id:s.id,provider:s.provider,name:s.display_name}));
  return {
    pipelines:pipes.map((p:any)=>({id:p.id,name:p.name,stages:stages.filter((s:any)=>s.pipeline_id===p.id).sort((a:any,b:any)=>a.position-b.position).map((s:any)=>({id:s.id,name:s.name}))})),
    sources,providers:[...new Set(sources.map((s:any)=>s.provider))].sort(),
    tags:[...new Set(leads.flatMap((l:any)=>audienceTags(l.tags)))].sort(),
    customFields:fields.filter((f:any)=>f.active!==false).map((f:any)=>({id:f.id,name:f.name,fieldType:f.field_type})),
    users:members.filter((m:any)=>!m.access_expires_at||Date.parse(m.access_expires_at)>Date.now()).map((m:any)=>({id:m.user_id,name:names.get(m.user_id)||'Membro da equipe'})),
    companies:companies.map((c:any)=>({id:c.id,name:c.name})),
  };
}
