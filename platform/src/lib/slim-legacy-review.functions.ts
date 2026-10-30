import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireActiveWorkspace} from '@/lib/workspace-resolver.server';
import {assertSlimOperator} from '@/lib/slim-workspace-operator.server';
import {assessLegacyReview} from '@/lib/slim-legacy-review.core';
import {legacyReconciliationReadiness,assertLegacyReconciliationReady} from '@/lib/slim-legacy-readiness.core';
const WS=z.object({workspaceId:z.string().uuid()});
async function scope(context:any,expected:string,write=false){
 const sb=context.supabase;const ws=await requireActiveWorkspace(sb,context.userId,{createIfMissing:false});
 if(ws!==expected)throw new Error('A empresa ativa mudou. Reabra a conferência.');
 if(write)await assertSlimOperator(sb,ws,context.userId);return {sb,ws};
}
export const reviewSlimLegacySales=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>WS.parse(v)).handler(async({data,context})=>{
 const {sb,ws}=await scope(context,data.workspaceId);
 const r=await sb.rpc('slim_review_legacy_sales',{_workspace_id:ws});
 if(r.error||!Array.isArray(r.data))throw new Error('Não foi possível conferir as vendas anteriores. Nenhum dado foi alterado.');
 for(const row of r.data)assessLegacyReview(row,ws);
 return {workspaceId:ws,rows:r.data,reconciliation:legacyReconciliationReadiness()};
});
export const reconcileSlimLegacySale=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>WS.extend({leadId:z.string().uuid(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),stockMode:z.enum(['apply_missing','already_accounted']),approved:z.literal(true),payment:z.object({method:z.enum(['pix','cash','debit_card','credit_card','bank_transfer','boleto','other']),status:z.enum(['paid','pending']),installments:z.number().int().min(1).max(24)}).strict()}).strict().parse(v)).handler(async({data,context})=>{
 const {sb,ws}=await scope(context,data.workspaceId,true);
 assertLegacyReconciliationReady();
 const r=await sb.rpc('slim_reconcile_legacy_sale',{_workspace_id:ws,_lead_id:data.leadId,_fingerprint:data.fingerprint,_stock_mode:data.stockMode,_payment:data.payment,_approved:data.approved});
 if(r.error){
  if(['22023','42501'].includes(r.error.code))return {state:'rejected' as const,message:r.error.message};
  throw new Error('Resultado indisponível. Consulte a venda anterior antes de repetir a aprovação.');
 }
 const result=z.object({orderId:z.string().uuid(),number:z.string().min(1),status:z.enum(['confirmed','cancelled']),reused:z.boolean()}).parse(r.data);
 return {state:'confirmed' as const,...result};
});

// SLIM_LEGACY_READINESS_HOLD
