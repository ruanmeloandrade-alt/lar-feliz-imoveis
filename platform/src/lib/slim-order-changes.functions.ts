import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {assertSlimOperator} from '@/lib/slim-workspace-operator.server';
import {checked,erpRows,persistedOrder} from '@/lib/slim-erp-data.server';
import {assertErpContext,erpRejection,ERP_LIMIT} from '@/lib/slim-erp-release.core';
import {orderUuid} from '@/lib/slim-order-read.core';
import {parseMoneyCents} from '@/lib/slim-money.core';
import {orderChangeCatalog,orderChangeFingerprint,orderChangeReason,validateOrderChangeQuote,validateOrderChangeResult,type OrderChangeContext} from '@/lib/slim-order-changes.core';

const ORDER=z.object({workspaceId:z.string().uuid(),orderId:z.string().uuid(),operation:z.enum(['edit','delete'])}).strict();
const ATTEMPT=ORDER.extend({actorId:z.string().uuid(),requestId:z.string().uuid()}).strict();
const cents=z.number().int().min(0).max(ERP_LIMIT);
const fulfillment=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('pickup')}).strict(),
 z.object({mode:z.literal('delivery'),recipient:z.string().max(160),phone:z.string().max(40),postalCode:z.string().max(9),street:z.string().max(200),number:z.string().max(30),complement:z.string().max(120),neighborhood:z.string().max(100),city:z.string().max(100),state:z.string().max(2),notes:z.string().max(500)}).strict(),
]);
const QUOTE=z.object({
 workspaceId:z.string().uuid(),customer:z.object({kind:z.literal('existing'),id:z.string().uuid()}).strict(),
 items:z.array(z.object({productId:z.string().uuid(),name:z.string().min(1).max(500),description:z.string().max(10000),sku:z.string().max(200),quantity:z.number().int().min(1).max(999999),unitPriceCents:cents,subtotalCents:cents,discountCents:cents,totalCents:cents}).strict()).min(1).max(100),
 subtotalCents:cents,discountCents:cents,totalCents:cents,fulfillment,shippingCents:cents,
 payment:z.object({method:z.enum(['pix','cash','debit_card','credit_card','bank_transfer','boleto','other']),status:z.enum(['pending','paid']),installments:z.number().int().min(1).max(24)}).strict(),notes:z.string().max(2000),
}).strict().refine(quote=>JSON.stringify(quote).length<=200000,'A revisão excede o limite permitido.').transform(quote=>validateOrderChangeQuote(quote,quote.workspaceId));
const CONFIRM=ATTEMPT.extend({fingerprint:z.string().regex(/^[a-f\d]{64}$/),reason:z.string().transform(orderChangeReason),approved:z.literal(true),quote:QUOTE.nullable()}).strict().superRefine((value,ctx)=>{
 if((value.operation==='edit'&&value.quote===null)||(value.operation==='delete'&&value.quote!==null))ctx.addIssue({code:z.ZodIssueCode.custom,path:['quote'],message:'A cotação não corresponde à operação aprovada.'});
 if(value.quote&&value.quote.workspaceId!==value.workspaceId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['workspaceId'],message:'A cotação pertence a outra empresa.'});
});
const RECOVERY=ATTEMPT.extend({approved:z.literal(true)}).strict();

/** Reuse the ERP membership and operator guards with the authenticated client only. */
async function scope(context:any,expectedWorkspace:string,expectedActor?:string){
 const sb=context.supabase,actor=orderUuid(context.userId,'Operador');
 if(expectedActor!==undefined&&expectedActor!==actor)throw new Error('O operador mudou. Reabra a alteração na sessão atual.');
 const profile=checked(await sb.from('profiles').select('current_workspace_id').eq('id',actor).maybeSingle(),'Não foi possível identificar a empresa ativa.');
 const ws=orderUuid(profile?.current_workspace_id,'Empresa ativa');
 const [wr,mr]=await Promise.all([
  sb.from('workspaces').select('owner_id').eq('id',ws).maybeSingle(),
  sb.from('workspace_members').select('user_id,access_expires_at').eq('workspace_id',ws).eq('user_id',actor).maybeSingle(),
 ]);
 const workspace=checked(wr,'Falha ao verificar a empresa.'),member=checked(mr,'Falha ao verificar o vínculo.');
 assertErpContext(expectedWorkspace,ws,actor,workspace?.owner_id??null,member);
 await assertSlimOperator(sb,ws,actor);
 return {sb,ws,actor};
}
function changeError(error:unknown,fallback:string):Error{
 const value=error as {code?:unknown;message?:unknown}|null;
 if(value&&['22023','42501'].includes(String(value.code))&&typeof value.message==='string'&&value.message.length<=700&&/^(O pedido |A alteração |A aprovação |A tentativa |Tentativa |Alteração |Referência |Conteúdo |Consulte o envio |Selecione )/.test(value.message))return new Error(value.message);
 return new Error(erpRejection(error)??fallback);
}
export const getSlimOrderChangeContext=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((value:unknown)=>ORDER.parse(value)).handler(async({data,context}):Promise<OrderChangeContext>=>{
 const {sb,ws,actor}=await scope(context,data.workspaceId);
 const result=await sb.rpc('slim_order_change_context',{_workspace_id:ws,_order_id:data.orderId});
 if(result.error)throw changeError(result.error,'Não foi possível abrir a revisão do pedido.');
 const raw=result.data;
 const order=persistedOrder(raw?.row,ws),fingerprint=orderChangeFingerprint(raw?.fingerprint);
 if(order.orderId!==data.orderId)throw new Error('O contexto retornou outro pedido. Reabra a revisão.');
 if(data.operation==='delete')return {workspaceId:ws,actorId:actor,order,fingerprint,catalog:[],customers:[]};
 if(order.status!=='confirmed')throw new Error('Pedido cancelado não pode ser editado.');
 const [products,customers]=await Promise.all([
  erpRows(sb,ws,'products','id,name,description,sku,price,promo_price,stock,active'),
  erpRows(sb,ws,'leads','id,name,email,phone,status,merged_into_id'),
 ]);
 const catalog=orderChangeCatalog(ws,order,products.map(p=>({id:p.id,workspaceId:ws,name:p.name,description:p.description??'',sku:p.sku??'',priceCents:parseMoneyCents(p.promo_price??p.price),stock:p.stock,active:p.active})));
 return {workspaceId:ws,actorId:actor,order,fingerprint,catalog,
  customers:customers.filter(c=>!c.merged_into_id&&!['archived','deleted','merged'].includes(c.status)).map(c=>({id:orderUuid(c.id,'Cliente'),name:c.name,email:c.email??'',phone:c.phone??''})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),
 };
});
export const confirmSlimOrderChange=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((value:unknown)=>CONFIRM.parse(value)).handler(async({data,context})=>{
 const {sb,ws,actor}=await scope(context,data.workspaceId,data.actorId);
 const result=await sb.rpc('slim_change_order',{_workspace_id:ws,_order_id:data.orderId,_request_id:data.requestId,_operation:data.operation,_fingerprint:data.fingerprint,_quote:data.quote,_reason:data.reason,_approved:data.approved});
 if(result.error)throw changeError(result.error,'Resultado da alteração indisponível. Consulte a tentativa sem reenviar.');
 return validateOrderChangeResult({...result.data,actorId:actor},{workspaceId:ws,actorId:actor,orderId:data.orderId,requestId:data.requestId,operation:data.operation},data.quote?.totalCents);
});
/** This approved recovery closes a never-committed request; never call it from an automatic query. */
export const lookupSlimOrderChange=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((value:unknown)=>RECOVERY.parse(value)).handler(async({data,context})=>{
 const {sb,ws,actor}=await scope(context,data.workspaceId,data.actorId);
 const result=await sb.rpc('slim_lookup_order_change',{_workspace_id:ws,_order_id:data.orderId,_request_id:data.requestId,_operation:data.operation});
 if(result.error)throw changeError(result.error,'A recuperação não foi confirmada. A referência da alteração foi preservada.');
 return validateOrderChangeResult({...result.data,actorId:actor},{workspaceId:ws,actorId:actor,orderId:data.orderId,requestId:data.requestId,operation:data.operation});
});
