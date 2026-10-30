import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {assertSlimChatMembership} from './slim-chat-membership.core';
async function scope(sb:any,userId:string,expected?:string){
 const {data,error}=await sb.from('profiles').select('current_workspace_id').eq('id',userId).maybeSingle();
 if(error||!data?.current_workspace_id)throw new Error('Não foi possível identificar a empresa ativa.');
 if(expected&&expected!==data.current_workspace_id)throw new Error('A empresa ativa mudou. Atualize as métricas.');
 await assertSlimChatMembership(sb,data.current_workspace_id,userId);return data.current_workspace_id as string;
}
export const getSlimMetricsWorkspace=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>({id:await scope(context.supabase,context.userId)}));
export const getSlimAutomationMetrics=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({workspaceId:z.string().uuid(),days:z.number().int().min(1).max(365).nullable().default(null),details:z.boolean().default(false)}).parse(input)).handler(async({data,context})=>{
 const ws=await scope(context.supabase,context.userId,data.workspaceId);
 const {loadSlimAutomationMetrics}=await import('./slim-automation-metrics.server');
 return loadSlimAutomationMetrics(context.supabase,ws,data.days,data.details);
});
