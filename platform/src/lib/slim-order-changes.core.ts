/** Reviewed order changes use their own ledger; a missing new-order receipt is not a failed deletion. */
import {calculateCheckout, type CatalogItem, type CheckoutQuote, type ConfirmedCheckout} from './slim-checkout.core.ts';
import {confirmReceiptShape, ERP_LIMIT} from './slim-erp-release.core.ts';
import {orderUuid, validateOrderSnapshot, type OrderSnapshot} from './slim-order-read.core.ts';

export type OrderChangeOperation = 'edit' | 'delete';
export type OrderChangeIdentity = {workspaceId:string; actorId:string; orderId:string; requestId:string; operation:OrderChangeOperation};
export type OrderChangeResult = OrderChangeIdentity & {
 state:'completed'|'closed'; replacementOrderId:string|null;
 replacementStatus:'confirmed'|'cancelled'|null; receipt:ConfirmedCheckout|null;
};
export type OrderChangeContext = {
 workspaceId:string; actorId:string; order:OrderSnapshot; fingerprint:string;
 catalog:CatalogItem[]; customers:Array<{id:string; name:string; email:string; phone:string}>;
};
export function orderChangeIdentity(value:unknown):OrderChangeIdentity {
 const r=value as Partial<OrderChangeIdentity>|null;
 if(!r || !['edit','delete'].includes(String(r.operation)))throw new Error('Operação de alteração inválida.');
 return {workspaceId:orderUuid(r.workspaceId,'Empresa'),actorId:orderUuid(r.actorId,'Operador'),orderId:orderUuid(r.orderId,'Pedido'),requestId:orderUuid(r.requestId,'Tentativa'),operation:r.operation as OrderChangeOperation};
}
export function orderChangeFingerprint(value:unknown):string {
 if(typeof value!=='string'||!/^[a-f\d]{64}$/.test(value))throw new Error('Referência de revisão inválida. Reabra o pedido.');
 return value;
}
export function orderChangeReason(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.trim().length>500||/[\x00-\x1f\x7f]/.test(value))throw new Error('Informe um motivo de até 500 caracteres para a alteração.');
 return value.trim();
}
export function validateOrderChangeResult(value:unknown,expected:OrderChangeIdentity,totalCents?:number):OrderChangeResult {
 const wanted=orderChangeIdentity(expected),r=value as Record<string,unknown>|null;
 const actual=orderChangeIdentity(value);
 if(Object.keys(wanted).some(key=>wanted[key as keyof OrderChangeIdentity]!==actual[key as keyof OrderChangeIdentity]))throw new Error('A resposta pertence a outra alteração. A referência pendente foi preservada.');
 if(!r||!['completed','closed'].includes(String(r.state)))throw new Error('Resultado da alteração ainda não confirmado. Consulte a tentativa sem reenviar.');
 if(r.state==='closed'||wanted.operation==='delete'){
  if(r.replacementOrderId!==null||r.replacementStatus!==null||r.receipt!==null)throw new Error('Resultado da alteração inconsistente.');
  return {...actual,state:r.state as 'completed'|'closed',replacementOrderId:null,replacementStatus:null,receipt:null};
 }
 const replacementOrderId=orderUuid(r.replacementOrderId,'Pedido substituto');
 if(replacementOrderId===wanted.orderId||!['confirmed','cancelled'].includes(String(r.replacementStatus)))throw new Error('Pedido substituto não confirmado pelo histórico.');
 let receipt:ConfirmedCheckout|null=null;
 if(r.replacementStatus==='confirmed'){
  const amount=(r.receipt as Record<string,unknown>|null)?.totalCents;
  if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<0||amount>ERP_LIMIT||(totalCents!==undefined&&amount!==totalCents))throw new Error('Total do pedido substituto divergente.');
  receipt=confirmReceiptShape(r.receipt,wanted.workspaceId,wanted.requestId,amount);
  if(receipt.orderId!==replacementOrderId)throw new Error('O recibo pertence a outro pedido substituto.');
 }else if(r.receipt!==null)throw new Error('Pedido substituto cancelado não possui confirmação vigente.');
 return {...actual,state:'completed',replacementOrderId,replacementStatus:r.replacementStatus as 'confirmed'|'cancelled',receipt};
}

/** Only the original confirmed order contributes stock; price and active state remain current. */
export function orderChangeCatalog(workspaceId:string,value:OrderSnapshot,catalog:readonly CatalogItem[]):CatalogItem[] {
 const ws=orderUuid(workspaceId,'Empresa'),order=validateOrderSnapshot(value,ws);
 if(order.status!=='confirmed'||order.change)throw new Error('Somente um pedido confirmado e vigente pode ser editado.');
 const returned=new Map(order.items.map(item=>[item.productId,item.quantity])),seen=new Set<string>();
 return catalog.map(item=>{
  const productId=orderUuid(item.id,'Produto');
  if(item.workspaceId!==ws||seen.has(productId))throw new Error('Catálogo de outra empresa ou com produto duplicado.');
  seen.add(productId);
  if(!Number.isSafeInteger(item.stock)||item.stock<0||item.stock>2147483647)throw new Error('Estoque atual inválido.');
  const stock=item.stock+(returned.get(productId)??0);
  if(stock>2147483647)throw new Error('A restituição do pedido excede o limite de estoque.');
  return {...item,id:productId,stock};
 });
}
function canonical(value:unknown):string {
 return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
}
/** Check the approved arithmetic locally; current catalog and stock are checked again inside the SQL transaction. */
export function validateOrderChangeQuote(value:unknown,workspaceId:string):CheckoutQuote {
 const q=value as CheckoutQuote|null,ws=orderUuid(workspaceId,'Empresa');
 if(!q||q.workspaceId!==ws||q.customer?.kind!=='existing'||!Array.isArray(q.items)||q.items.length<1||q.items.length>100)throw new Error('Revise o cliente cadastrado e os itens da alteração.');
 if(q.fulfillment===undefined)throw new Error('Escolha entrega ou retirada antes de confirmar a revisão.');
 const catalog=q.items.map(item=>({id:item.productId,workspaceId:ws,name:item.name,description:item.description,sku:item.sku,priceCents:item.unitPriceCents,stock:item.quantity,active:true}));
 const checked=calculateCheckout(ws,{customer:q.customer,items:q.items.map(item=>({productId:item.productId,quantity:item.quantity})),discount:{kind:'amount',cents:q.discountCents},payment:q.payment,notes:q.notes,fulfillment:q.fulfillment,shippingCents:q.shippingCents},catalog);
 if(canonical(q)!==canonical(checked))throw new Error('Os valores ou a entrega não correspondem à revisão aprovada.');
 return checked;
}
type RecoveryJournal={read:()=>({workspaceId:string;actorId:string;orderId:string;requestId:string;operation:OrderChangeOperation}|null);clear:(attempt:{orderId:string;requestId:string;operation:OrderChangeOperation})=>void};
type ChangeDeadlineOptions={timeoutMs?:number;setTimer?:(run:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clearTimer?:(timer:ReturnType<typeof setTimeout>)=>void};
/** Wrap only the network request so a late reply cannot clear its journal or change the screen. */
export function orderChangeDeadline<T>(send:()=>Promise<T>,{timeoutMs=25000,setTimer=setTimeout,clearTimer=clearTimeout}:ChangeDeadlineOptions={}):Promise<T>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>25000)return Promise.reject(new Error('Prazo da alteração inválido.'));
 return new Promise<T>((resolve,reject)=>{
  let settled=false;
  const timer=setTimer(()=>{if(settled)return;settled=true;reject(new Error('O prazo da alteração terminou sem confirmação. A referência foi preservada; consulte a tentativa sem reenviar.'));},timeoutMs);
  Promise.resolve().then(()=>{if(settled)return;return send();}).then(value=>{
   if(settled)return;settled=true;clearTimer(timer);resolve(value as T);
  },error=>{if(settled)return;settled=true;clearTimer(timer);reject(error);});
 });
}
/** Explicit recovery may close a request in SQL. It never confirms or retries an order. */
export async function finishOrderChangeRecovery({approved,expected,send,journal}:{approved:boolean;expected:OrderChangeIdentity;send:()=>Promise<unknown>;journal:RecoveryJournal}):Promise<OrderChangeResult> {
 if(approved!==true)throw new Error('Confirme a consulta e o encerramento desta tentativa antes de continuar.');
 const wanted=orderChangeIdentity(expected),pending=journal.read();
 if(!pending||canonical(orderChangeIdentity(pending))!==canonical(wanted))throw new Error('A referência pendente mudou. Reabra a recuperação.');
 const result=validateOrderChangeResult(await orderChangeDeadline(send),wanted);
 const latest=journal.read();
 if(!latest||canonical(orderChangeIdentity(latest))!==canonical(wanted))throw new Error('Outra tentativa está pendente. A referência atual foi preservada.');
 journal.clear(wanted);
 if(journal.read()?.requestId===wanted.requestId)throw new Error('Resultado confirmado, mas não foi possível limpar a referência local. Consulte novamente antes de outra alteração.');
 return result;
}
