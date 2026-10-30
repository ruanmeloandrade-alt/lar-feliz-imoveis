import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {assertSlimChatMembership} from './slim-chat-membership.core';
export interface GroupKpiReport {
 totalGroups:number|null;totalMessages:number|null;avgEngagement:string|null;
 botExecutions:number|null;aiConversions:number|null;successRate:string|null;
 issues?:Array<{source:string;message:string;code:string}>;
}
// Compatibility endpoint: no estimated conversions or fixed performance percentages.
export const getGroupReports=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.object({days:z.number().int().min(1).max(365).default(30)}).parse(input??{}))
 .handler(async({data,context}):Promise<GroupKpiReport>=>{
  const sb=context.supabase as any;
  const p=await sb.from('profiles').select('current_workspace_id').eq('id',context.userId).maybeSingle();
  if(p.error||!p.data?.current_workspace_id)throw new Error('Empresa ativa indisponível para o relatório.');
  const ws=p.data.current_workspace_id;await assertSlimChatMembership(sb,ws,context.userId);
  const {loadSlimAutomationMetrics}=await import('./slim-automation-metrics.server');
  const report=await loadSlimAutomationMetrics(sb,ws,data.days,true);
  return {totalGroups:report.groups?.count??null,totalMessages:report.messages?.groupSent??null,
   avgEngagement:null,botExecutions:null,aiConversions:null,successRate:null,
   issues:report.issues};
 });
