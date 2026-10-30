import { orderUuid, validateOrderSnapshot, validateOrderBatch, type OrderSnapshot } from './slim-order-read.core.ts';
import type { CheckoutQuote, ConfirmedCheckout } from './slim-checkout.core';
export type ErpDb = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<any> };
export const ORDER_COLUMNS = 'id,workspace_id,request_id,created_by,customer_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,snapshot,confirmed_at,cancelled_at,cancellation_reason';
export const ORDER_CHANGE_COLUMNS = 'id,workspace_id,actor_id,order_id,operation,state,reason,replacement_order_id,created_at';
export function checked<T = any>(result: {data: T; error?: unknown}, message: string): T { if (result.error) throw new Error(message); return result.data; }
export async function erpRows(db: ErpDb, ws: string, table: string, columns: string,filters:Record<string,string>={}) {
  orderUuid(ws, 'Empresa'); const out: any[] = [];
  for (;;) {
    let query=db.from(table).select(columns).eq('workspace_id', ws);
    for(const [field,value] of Object.entries(filters))query=query.eq(field,value);
    const result = await query.order('id').range(out.length, out.length + 499);
    const rows = checked(result, `Não foi possível consultar ${table}. Nenhum total parcial foi apresentado.`);
    if (!Array.isArray(rows)) throw new Error('Resposta de leitura inválida.');
    if (!rows.length) return out;
    out.push(...rows); if (out.length > 100000) throw new Error('Limite de leitura excedido. Refine o histórico.');
  }
}
export function persistedOrder(row: any, ws: string): OrderSnapshot {
  if (!row || row.workspace_id !== ws || row.id !== row.snapshot?.orderId || row.customer_id !== row.snapshot?.customer?.id || row.request_id !== row.snapshot?.requestId) throw new Error('Identificação do pedido inconsistente.');
  const result = validateOrderSnapshot({...row.snapshot, status: row.status, confirmedAt: row.confirmed_at, cancelledAt: row.cancelled_at, cancellationReason: row.cancellation_reason}, ws);
  if (result.totalCents !== Number(row.total_cents) || result.subtotalCents !== Number(row.subtotal_cents) || result.discountCents !== Number(row.discount_cents) || (result.shippingCents ?? 0) !== Number(row.shipping_cents ?? 0)) throw new Error('Total persistido não corresponde ao documento.');
  return result;
}
export async function loadErpOrder(db: ErpDb, ws: string, id: string) {
  orderUuid(id, 'Pedido'); const row = checked(await db.from('slim_orders').select(ORDER_COLUMNS).eq('workspace_id', ws).eq('id', id).maybeSingle(), 'Não foi possível consultar o pedido.');
  if (!row) throw new Error('Pedido não encontrado nesta empresa.');
  return {row, order: persistedOrder(row, ws)};
}
export async function loadErpOrders(db: ErpDb, ws: string) {
  const [rows,changes]=await Promise.all([
    erpRows(db,ws,'slim_orders',ORDER_COLUMNS),
    erpRows(db,ws,'slim_order_changes',ORDER_CHANGE_COLUMNS,{state:'completed'}),
  ]);
  const orders=rows.map(row=>persistedOrder(row,ws)),byId=new Map(orders.map(order=>[order.orderId,order]));
  const rowsById=new Map(rows.map(row=>[row.id,row]));
  for(const change of changes){
    if(change.workspace_id!==ws||change.state!=='completed')throw new Error('Alteração de outra empresa ou sem conclusão persistida.');
    const order=byId.get(orderUuid(change.order_id,'Pedido alterado'));
    if(!order||order.change)throw new Error('Histórico de alterações incompleto ou duplicado. Nenhum total parcial foi apresentado.');
    if(change.operation==='edit'){
      const replacement=rowsById.get(change.replacement_order_id);
      if(!replacement||replacement.request_id!==change.id||replacement.created_by!==change.actor_id)throw new Error('Referência da substituição não corresponde ao pedido gravado.');
    }
    order.change={requestId:change.id,operation:change.operation,reason:change.reason,createdAt:change.created_at,replacementOrderId:change.replacement_order_id,actorId:change.actor_id};
  }
  return validateOrderBatch({workspaceId: ws, complete: true, orders}, ws);
}
export function receiptFromOrder(order: OrderSnapshot): ConfirmedCheckout {
  if (order.status !== 'confirmed') throw new Error('Este pedido foi cancelado.');
  return {requestId:order.requestId,workspaceId:order.workspaceId,orderId:order.orderId,number:order.number,status:'confirmed',totalCents:order.totalCents};
}
export function quoteFromOrder(order: OrderSnapshot): CheckoutQuote {
  return {workspaceId:order.workspaceId,customer:{kind:'existing',id:order.customer.id},items:structuredClone(order.items),subtotalCents:order.subtotalCents,discountCents:order.discountCents,totalCents:order.totalCents,payment:order.payment as CheckoutQuote['payment'],notes:order.notes,...(order.fulfillment===undefined?{}:{fulfillment:structuredClone(order.fulfillment),shippingCents:order.shippingCents})};
}
export async function lookupErpAttempt(db: ErpDb, ws: string, actor: string, request: string) {
  orderUuid(request,'Tentativa'); const row = checked(await db.from('slim_orders').select(ORDER_COLUMNS).eq('workspace_id',ws).eq('request_id',request).eq('created_by',actor).maybeSingle(),'Consulta da tentativa indisponível.');
  if (!row) return {state:'not_found' as const};
  const order=persistedOrder(row,ws);
  return order.status==='cancelled' ? {state:'rejected' as const,message:`Pedido ${order.number} já cancelado. Consulte o histórico.`} : {state:'confirmed' as const,receipt:receiptFromOrder(order)};
}
