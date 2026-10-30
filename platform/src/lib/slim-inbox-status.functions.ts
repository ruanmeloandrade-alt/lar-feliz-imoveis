import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {ACTIVE_INBOX_BOT_STATES,type ConversationAutomation} from './slim-inbox-ui.core';
const Target=z.object({workspaceId:z.string().uuid(),actorId:z.string().uuid(),leadIds:z.array(z.string().uuid()).max(500)});
export const getSlimInboxIndicators=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>Target.parse(v)).handler(async({data,context})=>{
 const sb=context.supabase as any;
 if(context.userId!==data.actorId)throw new Error('O operador mudou. Reabra o Inbox.');
 const profile=await sb.from('profiles').select('current_workspace_id').eq('id',context.userId).maybeSingle();
 if(profile.error||profile.data?.current_workspace_id!==data.workspaceId)throw new Error('A empresa ativa mudou. Reabra o Inbox.');
 const ids=[...new Set(data.leadIds)];
 const states:Record<string,ConversationAutomation>={};
 if(!ids.length)return {workspaceId:data.workspaceId,actorId:context.userId,states};
 const leads=await sb.from('leads').select('id,active_conversation_agent_id,ai_paused').eq('workspace_id',data.workspaceId).in('id',ids);
 if(leads.error||!Array.isArray(leads.data))throw new Error('Não foi possível consultar os indicadores das conversas.');
 const visibleIds=leads.data.map((l:any)=>l.id);
 const agentIds=[...new Set(leads.data.map((l:any)=>l.active_conversation_agent_id).filter(Boolean))];
 let enabledAgents=new Set<string>();
 if(agentIds.length){const agents=await sb.from('conversation_ai_agents').select('id').eq('workspace_id',data.workspaceId).in('id',agentIds).eq('enabled',true);if(agents.error)throw new Error('Estado dos agentes temporariamente indisponível.');enabledAgents=new Set((agents.data??[]).map((a:any)=>a.id));}
 for(const lead of leads.data)states[lead.id]={botActive:false,aiActive:!lead.ai_paused&&enabledAgents.has(lead.active_conversation_agent_id)};
 if(visibleIds.length){
  let offset=0;
  for(;;){
   const runs=await sb.from('salesbot_runs').select('id,lead_id,status').eq('workspace_id',data.workspaceId).in('lead_id',visibleIds).in('status',[...ACTIVE_INBOX_BOT_STATES]).order('id').range(offset,offset+499);
   if(runs.error||!Array.isArray(runs.data))throw new Error('Estado dos SalesBots temporariamente indisponível.');
   for(const run of runs.data)if(states[run.lead_id])states[run.lead_id].botActive=true;
   if(runs.data.length<500)break;
   offset+=runs.data.length;if(offset>10000)throw new Error('Limite de leitura dos indicadores atingido.');
  }
 }
 return {workspaceId:data.workspaceId,actorId:context.userId,states};
});
