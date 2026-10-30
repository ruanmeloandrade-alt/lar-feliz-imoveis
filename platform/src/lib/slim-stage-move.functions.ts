import {createServerFn} from '@tanstack/react-start';import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {resolveSlimContactId} from './slim-contact-identity.core';
export const moveSlimLeadWithAutomations=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({leadId:z.string().uuid(),toStageId:z.string().uuid(),requestId:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;
 const p=await db.from('profiles').select('current_workspace_id').eq('id',context.userId).maybeSingle();
 if(p.error||!p.data?.current_workspace_id)throw new Error('Não foi possível identificar a empresa ativa.');
 const workspaceId=p.data.current_workspace_id;
 const {assertSlimOperator}=await import('./slim-workspace-operator.server');await assertSlimOperator(db,workspaceId,context.userId);
 const leadId=await resolveSlimContactId(db,workspaceId,data.leadId);
 const r=await db.rpc('slim_move_lead_and_emit',{_workspace_id:workspaceId,_lead_id:leadId,_stage_id:data.toStageId,_request_id:data.requestId});
 if(r.error)throw new Error('A movimentação não foi confirmada. Atualize o funil antes de repetir.');
 if(!r.data||r.data.ok!==true||r.data.leadId!==leadId)throw new Error('Resposta da movimentação não confirmada. Atualize o funil antes de repetir.');
 // The persisted event is consumed by the existing server worker, never by the browser.
 return {ok:true as const,automations:[] as Array<{actionId:string;title:string;ok:boolean}>,backendPending:false,automationQueued:Boolean(r.data.eventId),eventId:r.data.eventId as string|null,moved:Boolean(r.data.moved)};
});
