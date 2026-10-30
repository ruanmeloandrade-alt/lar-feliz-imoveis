import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireActiveWorkspace} from './workspace-resolver.server';
export async function enqueueSlimAudience(sb:any,workspaceId:string,input:any,leads:Array<{id:string}>,kind:'text'|'agent'|'salesbot'){
 if(!leads.length)throw new Error('Nenhum cliente corresponde ao público.');
 if(kind==='agent'){const {resolveWorkspaceAiKey}=await import('./workspace-ai-key.server');await resolveWorkspaceAiKey(sb,workspaceId);}
 const {data,error}=await sb.rpc('slim_enqueue_audience_campaign',{_payload:{...input,workspaceId,kind,leadIds:leads.map(l=>l.id)}});
 if(error)throw new Error(error.message||'Não foi possível registrar o disparo.');
 if(!data?.campaignId||!Number.isFinite(data.queued))throw new Error('Resposta inválida ao registrar campanha.');
 const {kickSlimAudienceWorker}=await import('./slim-audience-runtime.server');kickSlimAudienceWorker();
 return {...data,total:leads.length,sent:0,failed:0,started:0,skipped:data.skipped??0};
}
export const listSlimAudienceCampaigns=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const sb=context.supabase as any;const ws=await requireActiveWorkspace(sb,context.userId);
 const c=await sb.from('slim_audience_campaigns').select('id,audience_name,kind,status,created_at,created_by').eq('workspace_id',ws).order('created_at',{ascending:false}).limit(20);
 if(c.error)throw new Error('Não foi possível consultar os disparos.');
 const campaigns=c.data??[];if(!campaigns.length)return {campaigns:[]};
 const ids=campaigns.map((x:any)=>x.id);const rows:any[]=[];
 for(;;){const r=await sb.from('slim_audience_deliveries').select('id,campaign_id,status,last_error').eq('workspace_id',ws).in('campaign_id',ids).order('id').range(rows.length,rows.length+499);
  if(r.error||!Array.isArray(r.data))throw new Error('Não foi possível consultar o progresso dos disparos.');
  if(!r.data.length)break;rows.push(...r.data);if(rows.length>20000)throw new Error('Histórico excedeu o limite de leitura.');
 }
 return {campaigns:campaigns.map((c:any)=>{
  const states:Record<string,number>={};const notes=new Set<string>();for(const d of rows.filter((r:any)=>r.campaign_id===c.id)){states[d.status]=(states[d.status]??0)+1;if(d.last_error)notes.add(d.last_error);}
  return {...c,states,total:Object.values(states).reduce((a,b)=>a+b,0),issues:[...notes].slice(0,3)};
 })};
});
export const cancelSlimAudienceCampaign=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>z.object({id:z.string().uuid()}).parse(x)).handler(async({data,context})=>{
 const {error}=await (context.supabase as any).rpc('slim_cancel_audience_campaign',{_campaign_id:data.id});
 if(error)throw new Error(error.message||'Não foi possível encerrar o disparo.');return {ok:true};
});
