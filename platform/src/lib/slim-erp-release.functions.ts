import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertSlimOperator } from '@/lib/slim-workspace-operator.server';
import { checked, erpRows, loadErpOrder, loadErpOrders, lookupErpAttempt, quoteFromOrder, receiptFromOrder } from '@/lib/slim-erp-data.server';
import { orderUuid, validateOrderSnapshot } from '@/lib/slim-order-read.core';
import { parseMoneyCents } from '@/lib/slim-money.core';
import { normalizeCheckoutDelivery } from '@/lib/slim-checkout-delivery.core';
import { assertErpContext, confirmReceiptShape, erpRejection, ERP_LIMIT } from '@/lib/slim-erp-release.core';
import { isSlimContactPhoneConflict, SLIM_CONTACT_PHONE_CONFLICT } from '@/lib/slim-contact-errors.core';

// This release never instantiates a privileged client or sends customer data to a provider.
const WS = z.object({workspaceId:z.string().uuid()});
const ORDER = WS.extend({orderId:z.string().uuid()});
const cents = z.number().int().min(0).max(ERP_LIMIT);
const customer = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('existing'),id:z.string().uuid()}).strict(),
  z.object({kind:z.literal('new'),name:z.string().trim().min(1).max(160),email:z.union([z.literal(''),z.string().email().max(254)]),phone:z.string().max(40)}).strict(),
]);
const fulfillment = z.discriminatedUnion('mode',[
  z.object({mode:z.literal('pickup')}).strict(),
  z.object({mode:z.literal('delivery'),recipient:z.string().max(160),phone:z.string().max(40),postalCode:z.string().max(9),street:z.string().max(200),number:z.string().max(30),complement:z.string().max(120),neighborhood:z.string().max(100),city:z.string().max(100),state:z.string().max(2),notes:z.string().max(500)}).strict(),
]);
const QUOTE = WS.extend({
  customer, items:z.array(z.object({productId:z.string().uuid(),name:z.string().min(1).max(500),description:z.string().max(10000),sku:z.string().max(200),quantity:z.number().int().min(1).max(999999),unitPriceCents:cents,subtotalCents:cents,discountCents:cents,totalCents:cents}).strict()).min(1).max(100),
  subtotalCents:cents,discountCents:cents,totalCents:cents,
  fulfillment:fulfillment.optional(),shippingCents:cents.optional(),
  payment:z.object({method:z.enum(['pix','cash','debit_card','credit_card','bank_transfer','boleto','other']),status:z.enum(['pending','paid']),installments:z.number().int().min(1).max(24)}).strict(),
  notes:z.string().max(2000),
}).strict().superRefine((quote,ctx)=>{
  try{normalizeCheckoutDelivery(quote.fulfillment,quote.shippingCents);}
  catch(error){ctx.addIssue({code:z.ZodIssueCode.custom,path:['fulfillment'],message:error instanceof Error?error.message:'Entrega ou frete inválidos.'});}
});
async function scope(context:any,expected?:string,write=false) {
  const sb=context.supabase;
  const profile=checked(await sb.from('profiles').select('current_workspace_id').eq('id',context.userId).maybeSingle(),'Não foi possível identificar a empresa ativa.');
  const ws=orderUuid(profile?.current_workspace_id,'Empresa ativa');
  const [wr,mr]=await Promise.all([
    sb.from('workspaces').select('owner_id').eq('id',ws).maybeSingle(),
    sb.from('workspace_members').select('user_id,access_expires_at').eq('workspace_id',ws).eq('user_id',context.userId).maybeSingle(),
  ]);
  const w=checked(wr,'Falha ao verificar a empresa.'),m=checked(mr,'Falha ao verificar o vínculo.');
  assertErpContext(expected??ws,ws,context.userId,w?.owner_id??null,m);
  if(write)await assertSlimOperator(sb,ws,context.userId);
  return {sb,ws,actor:context.userId as string};
}
export const getSlimErpIdentity=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {ws,actor}=await scope(context);return {workspaceId:ws,actorId:actor};
});
export const getSlimErpContext=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>WS.parse(v)).handler(async({data,context})=>{
  const {sb,ws,actor}=await scope(context,data.workspaceId);
  const [products,customers]=await Promise.all([
    erpRows(sb,ws,'products','id,name,description,sku,price,promo_price,stock,active'),
    erpRows(sb,ws,'leads','id,name,email,phone,status,merged_into_id'),
  ]);
  return {workspaceId:ws,actorId:actor,
    catalog:products.map(p=>({id:p.id,workspaceId:ws,name:p.name,description:p.description??'',sku:p.sku??'',priceCents:parseMoneyCents(p.promo_price??p.price),stock:p.stock,active:p.active})),
    customers:customers.filter(c=>!c.merged_into_id&&!['archived','deleted','merged'].includes(c.status)).map(c=>({id:c.id,name:c.name,email:c.email??'',phone:c.phone??''})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),
  };
});
export const getSlimErpHistory=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>WS.parse(v)).handler(async({data,context})=>{
  const {sb,ws}=await scope(context,data.workspaceId);return loadErpOrders(sb,ws);
});
export const confirmSlimErpOrder=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>WS.extend({requestId:z.string().uuid(),quote:QUOTE}).parse(v)).handler(async({data,context})=>{
  let authorized:Awaited<ReturnType<typeof scope>>;
  try{authorized=await scope(context,data.workspaceId,true);}catch{return {state:'rejected' as const,message:'Não foi possível autorizar a confirmação nesta empresa. Nenhuma venda foi registrada por esta tentativa.'};}
  const {sb,ws}=authorized;
  if(data.quote.workspaceId!==ws)return {state:'rejected' as const,message:'A cotação não pertence à empresa ativa. Pedido não registrado.'};
  const result=await sb.rpc('slim_confirm_order',{_workspace_id:ws,_request_id:data.requestId,_quote:data.quote});
  if(result.error){
    const rejection=erpRejection(result.error);
    if(rejection)return {state:'rejected' as const,message:rejection,...(isSlimContactPhoneConflict(result.error)?{rejectionCode:SLIM_CONTACT_PHONE_CONFLICT}:{})};
    throw new Error('Resultado da confirmação indisponível. Consulte esta tentativa antes de repetir.');
  }
  const receipt=confirmReceiptShape(result.data,ws,data.requestId,data.quote.totalCents);
  return {state:'confirmed' as const,receipt};
});
export const lookupSlimErpOrder=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>WS.extend({requestId:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
  const {sb,ws,actor}=await scope(context,data.workspaceId);
  const outcome=await lookupErpAttempt(sb,ws,actor,data.requestId);if(outcome.state!=='not_found')return outcome;
  const closure=await sb.from('slim_checkout_attempt_closures').select('request_id').eq('workspace_id',ws).eq('request_id',data.requestId).eq('actor_id',actor).maybeSingle();
  if(closure.error)throw new Error('Não foi possível consultar o encerramento. A referência foi preservada.');
  return closure.data?{state:'rejected' as const,message:'Esta tentativa foi encerrada sem pedido. Uma confirmação atrasada com a mesma referência não será aceita.'}:outcome;
});
export const cancelSlimErpOrder=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>ORDER.extend({reason:z.string().trim().min(1).max(500)}).parse(v)).handler(async({data,context})=>{
  const {sb,ws}=await scope(context,data.workspaceId,true);
  const result=await sb.rpc('slim_cancel_order',{_workspace_id:ws,_order_id:data.orderId,_reason:data.reason});
  if(result.error)throw new Error(erpRejection(result.error)??'Cancelamento não confirmado. Atualize o histórico antes de repetir.');
  const {order}=await loadErpOrder(sb,ws,data.orderId);
  if(order.status!=='cancelled')throw new Error('Cancelamento ainda não confirmado.');
  return {ok:true,order};
});
export const getSlimOrderReceipt=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>ORDER.parse(v)).handler(async({data,context})=>{
  const {sb,ws}=await scope(context,data.workspaceId);
  const {row,order}=await loadErpOrder(sb,ws,data.orderId);
  const original=validateOrderSnapshot(row.snapshot,ws);
  const {buildSlimOrderReceiptPdf}=await import('@/lib/slim-order-receipt.server');
  const {createHash}=await import('node:crypto');
  const pdf=Buffer.from(buildSlimOrderReceiptPdf({quote:quoteFromOrder(original),receipt:receiptFromOrder(original),issuer:original.issuer,customer:original.customer,createdAt:original.confirmedAt}));
  return {workspaceId:ws,orderId:order.orderId,number:order.number,status:order.status,filename:`pedido-${order.number}.pdf`,sha256:createHash('sha256').update(pdf).digest('hex'),pdfBase64:pdf.toString('base64')};
});

// SLIM_CHECKOUT_RECOVERY_V1
