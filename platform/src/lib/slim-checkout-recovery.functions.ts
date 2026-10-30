import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {assertSlimOperator} from '@/lib/slim-workspace-operator.server';
import {checked,loadErpOrder} from '@/lib/slim-erp-data.server';
import {assertErpContext} from '@/lib/slim-erp-release.core';
import {validateCheckoutRecovery} from '@/lib/slim-checkout-recovery.core';
const INPUT=z.object({workspaceId:z.string().uuid(),requestId:z.string().uuid(),approved:z.literal(true)}).strict();
export const closeSlimCheckoutAttempt=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>INPUT.parse(v)).handler(async({data,context})=>{
 const sb=context.supabase as any,actor=context.userId;
 const profile=checked(await sb.from('profiles').select('current_workspace_id').eq('id',actor).maybeSingle(),'Empresa ativa indisponível.');
 const ws=profile?.current_workspace_id;
 const [wr,mr]=await Promise.all([
  sb.from('workspaces').select('owner_id').eq('id',data.workspaceId).maybeSingle(),
  sb.from('workspace_members').select('user_id,access_expires_at').eq('workspace_id',data.workspaceId).eq('user_id',actor).maybeSingle(),
 ]);
 const w=checked(wr,'Empresa indisponível.'),member=checked(mr,'Vínculo indisponível.');
 assertErpContext(data.workspaceId,ws,actor,w?.owner_id??null,member);
 await assertSlimOperator(sb,data.workspaceId,actor);
 const result=await sb.rpc('slim_close_checkout_attempt',{_workspace_id:data.workspaceId,_request_id:data.requestId});
 if(result.error||!result.data)throw new Error('Recuperação não confirmada. A referência foi preservada; consulte novamente antes de criar outro pedido.');
 const expected={workspaceId:data.workspaceId,requestId:data.requestId,actorId:actor};
 const raw=result.data;
 if(raw.workspaceId!==data.workspaceId||raw.requestId!==data.requestId)throw new Error('Identificação da recuperação divergente.');
 if(raw.state==='closed')return validateCheckoutRecovery(raw,expected);
 if(raw.state==='processing')return validateCheckoutRecovery({...raw,actorId:actor},expected);
 if(raw.state!=='existing'||!z.string().uuid().safeParse(raw.orderId).success)throw new Error('Resultado inesperado da recuperação.');
 const {row,order}=await loadErpOrder(sb,data.workspaceId,raw.orderId);
 if(row.created_by!==actor||order.requestId!==data.requestId)throw new Error('Pedido não pertence à tentativa deste operador.');
 return validateCheckoutRecovery({...expected,state:'existing',orderId:order.orderId,number:order.number,status:order.status,totalCents:order.totalCents},expected);
});
