/** Pure checkout domain. No database, tokens, network calls or stock mutations. */
import { normalizeCheckoutDelivery, type CheckoutFulfillment } from './slim-checkout-delivery.core.ts';
export type { CheckoutFulfillment } from './slim-checkout-delivery.core.ts';
export type CatalogItem = { id: string; workspaceId: string; name: string; description: string; sku: string; priceCents: number; stock: number; active: boolean };
export type CheckoutCustomer = { kind: 'existing'; id: string } | { kind: 'new'; name: string; email: string; phone: string };
export type CheckoutDraft = {
  customer: CheckoutCustomer;
  items: Array<{ productId: string; quantity: number }>;
  discount: { kind: 'amount'; cents: number } | { kind: 'percent'; basisPoints: number };
  payment: { method: 'pix'|'cash'|'debit_card'|'credit_card'|'bank_transfer'|'boleto'|'other'; status: 'pending'|'paid'; installments: number };
  notes: string;
  fulfillment?: CheckoutFulfillment;
  shippingCents?: number;
};
export type CheckoutQuote = {
  workspaceId: string; customer: CheckoutCustomer;
  items: Array<{ productId: string; name: string; description: string; sku: string; quantity: number; unitPriceCents: number; subtotalCents: number; discountCents: number; totalCents: number }>;
  subtotalCents: number; discountCents: number; totalCents: number;
  payment: CheckoutDraft['payment']; notes: string;
  fulfillment?: CheckoutFulfillment; shippingCents?: number;
};
const MAX = 99999999999999;
const METHODS = new Set(['pix','cash','debit_card','credit_card','bank_transfer','boleto','other']);
const uuid = (v: unknown): v is string => typeof v==='string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
function integer(n: number, label: string, max = MAX) { if(!Number.isSafeInteger(n)||n<0||n>max) throw new Error(`${label} inválido.`); return n; }
function fromBigInt(n: bigint, label: string) { if(n<0n||n>BigInt(MAX)) throw new Error(`${label} excede o limite.`); return Number(n); }
function customerCopy(c: CheckoutCustomer): CheckoutCustomer {
  if(c?.kind==='existing') { if(!uuid(c.id))throw new Error('Selecione um cliente cadastrado válido.'); return {kind:'existing',id:c.id}; }
  if(c?.kind!=='new')throw new Error('Informe o cliente.');
  const name=c.name.trim(),email=c.email.trim(),phone=c.phone.trim();
  if(!name||name.length>160||email.length>254||phone.length>40)throw new Error('Dados do cliente inválidos.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-mail inválido.');
  return {kind:'new',name,email,phone};
}
/** Half-up discount in integer cents, distributed by largest remainder. */
export function calculateCheckout(ws: string, draft: CheckoutDraft, catalog: readonly CatalogItem[]): CheckoutQuote {
  if(!uuid(ws))throw new Error('Empresa inválida.');
  const customer=customerCopy(draft.customer);
  if(!Array.isArray(draft.items)||!draft.items.length||draft.items.length>100)throw new Error('Inclua entre 1 e 100 produtos.');
  const seen=new Set<string>();
  const items=draft.items.map(item=>{
    if(!uuid(item.productId)||seen.has(item.productId))throw new Error('Produto duplicado ou inválido. Altere a quantidade na mesma linha.');
    seen.add(item.productId);
    const p=catalog.find(p=>p.id===item.productId&&p.workspaceId===ws);
    if(!p||!p.active)throw new Error('Produto não disponível nesta empresa.');
    integer(item.quantity,'Quantidade',999999);if(item.quantity<1)throw new Error('Quantidade mínima: 1.');
    integer(p.stock,'Estoque',2147483647);integer(p.priceCents,'Preço');
    if(item.quantity>p.stock)throw new Error(`Estoque insuficiente para ${p.name}.`);
    const subtotalCents=fromBigInt(BigInt(item.quantity)*BigInt(p.priceCents),'Subtotal');
    return {productId:p.id,name:p.name,description:p.description,sku:p.sku,quantity:item.quantity,unitPriceCents:p.priceCents,subtotalCents,discountCents:0,totalCents:subtotalCents};
  });
  const subtotal=items.reduce((s,i)=>s+BigInt(i.subtotalCents),0n);
  const subtotalCents=fromBigInt(subtotal,'Total');
  let discount: bigint;
  if(draft.discount.kind==='amount')discount=BigInt(integer(draft.discount.cents,'Desconto'));
  else if(draft.discount.kind==='percent')discount=(subtotal*BigInt(integer(draft.discount.basisPoints,'Percentual',10000))+5000n)/10000n;
  else throw new Error('Tipo de desconto inválido.');
  if(discount>subtotal)throw new Error('Desconto maior que o subtotal.');
  if(discount&&subtotal){
    const parts=items.map((item,index)=>{const v=BigInt(item.subtotalCents)*discount;return {index,base:v/subtotal,remainder:v%subtotal};});
    let remaining=Number(discount-parts.reduce((sum,p)=>sum+p.base,0n));
    parts.sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
    for(const p of parts){const amount=p.base+(remaining-->0?1n:0n);items[p.index].discountCents=Number(amount);items[p.index].totalCents-=Number(amount);}
  }
  const payment=draft.payment;
  if(!payment||!METHODS.has(payment.method)||!['pending','paid'].includes(payment.status))throw new Error('Informe forma e situação do pagamento.');
  integer(payment.installments,'Parcelas',24);if(payment.installments<1||(payment.method!=='credit_card'&&payment.installments!==1))throw new Error('Parcelamento inválido para a forma de pagamento.');
  if(typeof draft.notes!=='string'||draft.notes.length>2000)throw new Error('Observações: limite de 2.000 caracteres.');
  const delivery=normalizeCheckoutDelivery(draft.fulfillment,draft.shippingCents);
  const totalCents=fromBigInt(subtotal-discount+BigInt(delivery.shippingCents??0),'Total com frete');
  return {workspaceId:ws,customer,items,subtotalCents,discountCents:Number(discount),totalCents,payment:{...payment},notes:draft.notes.trim(),...delivery};
}
export function formatCheckoutCents(cents: number): string {
  integer(cents,'Valor');const n=BigInt(cents);const whole=String(n/100n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return `R$ ${whole},${String(n%100n).padStart(2,'0')}`;
}
export type ConfirmedCheckout = { requestId: string; workspaceId: string; orderId: string; number: string; status: 'confirmed'; totalCents: number };
export function verifyCheckoutReceipt(quote: CheckoutQuote, requestId: string, value: unknown): ConfirmedCheckout {
  if(!value||typeof value!=='object')throw new Error('Confirmação do pedido não recebida.');
  const r=value as ConfirmedCheckout;
  if(r.requestId!==requestId||r.workspaceId!==quote.workspaceId||!uuid(r.orderId)||r.status!=='confirmed'||r.totalCents!==quote.totalCents||typeof r.number!=='string'||!r.number.trim()||r.number.length>80)throw new Error('Não foi possível confirmar a gravação deste pedido.');
  return {requestId:r.requestId,workspaceId:r.workspaceId,orderId:r.orderId,number:r.number,status:r.status,totalCents:r.totalCents};
}
