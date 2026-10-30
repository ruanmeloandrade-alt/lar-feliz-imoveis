/** Validates a persisted read response; this module does not persist or authenticate an order. */
import { normalizeCheckoutDelivery, type CheckoutFulfillment } from './slim-checkout-delivery.core.ts';
export const ORDER_MONEY_LIMIT = 99999999999999;
export type OrderItemSnapshot = {
  productId: string; sku: string; name: string; description: string;
  quantity: number; unitPriceCents: number; subtotalCents: number;
  discountCents: number; totalCents: number;
};
export type OrderChangeSummary = {requestId:string;operation:'edit'|'delete';reason:string;createdAt:string;replacementOrderId:string|null;actorId:string};
export type OrderSnapshot = {
  version: 1; workspaceId: string; orderId: string; requestId: string; number: string;
  status: 'confirmed' | 'cancelled'; confirmedAt: string;
  cancelledAt: string | null; cancellationReason: string | null;
  customer: { id: string; name: string; email: string; phone: string };
  issuer: { name: string; legalName: string; document: string };
  items: OrderItemSnapshot[]; subtotalCents: number; discountCents: number; totalCents: number;
  payment: { method: string; status: 'pending' | 'paid'; installments: number };
  notes: string;
  fulfillment?: CheckoutFulfillment; shippingCents?: number;
  change?: OrderChangeSummary;
};
export type OrderReadBatch = { workspaceId: string; complete: true; orders: OrderSnapshot[] };
const methods = new Set(['pix', 'cash', 'debit_card', 'credit_card', 'bank_transfer', 'boleto', 'other']);
export function orderUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) {
    throw new Error(`${label} inválido.`);
  }
  return value.toLowerCase();
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} inválido.`);
  return value as Record<string, unknown>;
}
function str(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
    throw new Error(`${label} inválido.`);
  }
  return value;
}
function integer(value: unknown, label: string, max = ORDER_MONEY_LIMIT): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label} inválido.`);
  return value;
}
function exact(value: bigint): number {
  if (value < 0n || value > BigInt(ORDER_MONEY_LIMIT)) throw new Error('Total acima do limite de leitura segura.');
  return Number(value);
}
export function orderInstant(value: unknown, label = 'Data'): string {
  if (typeof value !== 'string') throw new Error(`${label} inválida.`);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || +m[1] < 1900 || +m[1] > 9999 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate() || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) {
    throw new Error(`${label} inválida ou sem fuso horário.`);
  }
  if (m[8] !== 'Z') {
    const [hours, minutes] = m[8].slice(1).split(':').map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes > 0)) throw new Error(`${label} com fuso inválido.`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} inválida.`);
  return new Date(time).toISOString();
}
export function validateOrderSnapshot(value: unknown, expectedWorkspace: string): OrderSnapshot {
  const ws = orderUuid(expectedWorkspace, 'Empresa');
  const r = record(value, 'Pedido');
  const workspaceId = orderUuid(r.workspaceId, 'Empresa do pedido');
  if (workspaceId !== ws) throw new Error('Pedido de outra empresa não pode compor este histórico.');
  if (r.version !== 1 || !['confirmed', 'cancelled'].includes(String(r.status))) throw new Error('Pedido sem confirmação persistente reconhecida.');
  const confirmedAt = orderInstant(r.confirmedAt, 'Data de confirmação');
  const customer = record(r.customer, 'Cliente');
  const issuer = record(r.issuer, 'Emitente');
  const payment = record(r.payment, 'Pagamento');
  if (!methods.has(String(payment.method)) || !['paid', 'pending'].includes(String(payment.status))) throw new Error('Pagamento inválido.');
  const installments = integer(payment.installments, 'Parcelas', 24);
  if (!installments || (payment.method !== 'credit_card' && installments !== 1)) throw new Error('Parcelamento inválido.');
  if (!Array.isArray(r.items) || r.items.length < 1 || r.items.length > 100) throw new Error('Pedido sem itens válidos.');
  const productIds = new Set<string>();
  const items = r.items.map((value): OrderItemSnapshot => {
    const item = record(value, 'Item');
    const productId = orderUuid(item.productId, 'Produto');
    if (productIds.has(productId)) throw new Error('Produto repetido no mesmo pedido.');
    productIds.add(productId);
    const quantity = integer(item.quantity, 'Quantidade', 999999);
    const unitPriceCents = integer(item.unitPriceCents, 'Preço unitário');
    const subtotalCents = integer(item.subtotalCents, 'Subtotal do item');
    const discountCents = integer(item.discountCents, 'Desconto do item');
    const totalCents = integer(item.totalCents, 'Total do item');
    if (!quantity || BigInt(quantity) * BigInt(unitPriceCents) !== BigInt(subtotalCents) || discountCents > subtotalCents || subtotalCents - discountCents !== totalCents) {
      throw new Error('Valores inconsistentes em um item do pedido.');
    }
    return { productId, quantity, unitPriceCents, subtotalCents, discountCents, totalCents,
      sku: str(item.sku, 'SKU', 200), name: str(item.name, 'Nome do produto', 500, true),
      description: str(item.description, 'Descrição', 10000) };
  });
  const subtotalCents = integer(r.subtotalCents, 'Subtotal');
  const discountCents = integer(r.discountCents, 'Desconto');
  const totalCents = integer(r.totalCents, 'Total');
  const delivery = normalizeCheckoutDelivery(r.fulfillment, r.shippingCents);
  const shipping = BigInt(delivery.shippingCents ?? 0);
  for (const field of ['subtotalCents', 'discountCents'] as const) {
    if (items.reduce((sum, item) => sum + BigInt(item[field]), 0n) !== BigInt(r[field] as number)) throw new Error('Totais do pedido não correspondem aos itens.');
  }
  if (items.reduce((sum, item) => sum + BigInt(item.totalCents), 0n) + shipping !== BigInt(totalCents)) throw new Error('Totais do pedido não correspondem aos itens e frete.');
  if (BigInt(subtotalCents) - BigInt(discountCents) + shipping !== BigInt(totalCents)) throw new Error('Total, desconto e frete inconsistentes.');
  let cancelledAt: string | null = null;
  let cancellationReason: string | null = null;
  if (r.status === 'cancelled') {
    cancelledAt = orderInstant(r.cancelledAt, 'Data de cancelamento');
    cancellationReason = str(r.cancellationReason, 'Motivo de cancelamento', 2000, true);
    if (Date.parse(cancelledAt) < Date.parse(confirmedAt)) throw new Error('Cancelamento anterior ao pedido.');
  } else if (r.cancelledAt != null || r.cancellationReason != null) throw new Error('Estado de cancelamento inconsistente.');
  let change:OrderChangeSummary|undefined;
  if(r.change!==undefined){
    const c=record(r.change,'Alteração');
    if(r.status!=='cancelled'||!['edit','delete'].includes(String(c.operation)))throw new Error('Situação da alteração incompatível com o pedido.');
    const replacementOrderId=c.operation==='edit'?orderUuid(c.replacementOrderId,'Pedido substituto'):null;
    if((c.operation==='delete'&&c.replacementOrderId!==null)||replacementOrderId===r.orderId)throw new Error('Referência do pedido substituto inválida.');
    change={requestId:orderUuid(c.requestId,'Tentativa de alteração'),operation:c.operation as 'edit'|'delete',reason:str(c.reason,'Motivo da alteração',500,true),createdAt:orderInstant(c.createdAt,'Data da alteração'),replacementOrderId,actorId:orderUuid(c.actorId,'Autor da alteração')};
  }
  return {
    version: 1, workspaceId, orderId: orderUuid(r.orderId, 'Pedido'), requestId: orderUuid(r.requestId, 'Tentativa'),
    number: str(r.number, 'Número do pedido', 80, true), status: r.status as OrderSnapshot['status'], confirmedAt, cancelledAt, cancellationReason,
    customer: { id: orderUuid(customer.id, 'Cliente'), name: str(customer.name, 'Nome do cliente', 160, true), email: str(customer.email, 'E-mail', 254), phone: str(customer.phone, 'Telefone', 40) },
    issuer: { name: str(issuer.name, 'Emitente', 200, true), legalName: str(issuer.legalName, 'Razão social', 240), document: str(issuer.document, 'Documento do emitente', 40) },
    items, subtotalCents, discountCents, totalCents, ...delivery,
    payment: { method: payment.method as string, status: payment.status as 'pending' | 'paid', installments },
    notes: str(r.notes, 'Observações', 2000),
    ...(change?{change}:{}),
  };
}
export function validateOrderBatch(value: unknown, expectedWorkspace: string): OrderReadBatch {
  const batch = record(value, 'Histórico');
  const ws = orderUuid(expectedWorkspace, 'Empresa');
  if (batch.complete !== true || orderUuid(batch.workspaceId, 'Empresa do histórico') !== ws || !Array.isArray(batch.orders) || batch.orders.length > 100000) {
    throw new Error('Histórico incompleto ou de outra empresa. Nenhum total foi calculado.');
  }
  const seen = new Set<string>(), requests = new Set<string>(), numbers = new Set<string>();
  const orders = batch.orders.map(value => {
    const order = validateOrderSnapshot(value, ws);
    if (seen.has(order.orderId) || requests.has(order.requestId) || numbers.has(order.number)) throw new Error('Pedido, tentativa ou número duplicado no histórico. Verifique a origem antes de calcular totais.');
    seen.add(order.orderId); requests.add(order.requestId); numbers.add(order.number);
    return order;
  });
  const byId=new Map(orders.map(order=>[order.orderId,order]));
  for(const order of orders){
    if(order.change?.operation==='edit'){
      const replacement=byId.get(order.change.replacementOrderId!);
      if(!replacement||replacement.requestId!==order.change.requestId)throw new Error('Histórico da substituição incompleto. Nenhum total parcial foi calculado.');
    }
  }
  orders.sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt) || a.orderId.localeCompare(b.orderId));
  return { workspaceId: ws, complete: true, orders };
}
export type OrderFilters = { status?: 'all' | 'confirmed' | 'cancelled'; view?:'all'|'operational'|'changes'; query?: string; from?: string; to?: string; timeZone?: string };
export function orderLifecycle(order:OrderSnapshot):'confirmed'|'cancelled'|'replaced'|'deleted'{return order.change?(order.change.operation==='edit'?'replaced':'deleted'):order.status;}
function dateOnly(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data do filtro inválida.');
  orderInstant(`${value}T00:00:00Z`, 'Data do filtro'); return value;
}
function dayInZone(value: string, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function buildOrderReadModel(value: unknown, workspaceId: string, filters: OrderFilters = {}) {
  const batch = validateOrderBatch(value, workspaceId);
  if (filters.status && !['all','confirmed','cancelled'].includes(filters.status)) throw new Error('Filtro de situação inválido.');
  if(filters.view&&!['all','operational','changes'].includes(filters.view))throw new Error('Visão do histórico inválida.');
  const from = dateOnly(filters.from), to = dateOnly(filters.to);
  if (from && to && from > to) throw new Error('A data inicial precisa ser anterior à final.');
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: filters.timeZone ?? 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const needle = (filters.query ?? '').trim().toLocaleLowerCase('pt-BR');
  const rows = batch.orders.filter(order => {
    if(filters.view==='operational'&&order.change)return false;
    if(filters.view==='changes'&&!order.change)return false;
    if (filters.status && filters.status !== 'all' && filters.status !== order.status) return false;
    const day = dayInZone(order.confirmedAt, dateFormatter);
    if ((from && day < from) || (to && day > to)) return false;
    const searchable = [order.number, order.customer.name, order.customer.email, order.customer.phone, order.change?.reason??'',order.change?.replacementOrderId??'', ...order.items.flatMap(i => [i.name, i.sku, i.description])].join(' ').toLocaleLowerCase('pt-BR');
    return !needle || searchable.includes(needle);
  });
  const active = rows.filter(order => order.status === 'confirmed');
  const sum = (orders: OrderSnapshot[], field: 'subtotalCents' | 'discountCents' | 'totalCents') => exact(orders.reduce((n, o) => n + BigInt(o[field]), 0n));
  return {
    workspaceId: batch.workspaceId, rows, totalRecords: batch.orders.length, filteredRecords: rows.length,
    totals: {
      confirmedCount: active.length, cancelledCount: rows.filter(o=>o.status==='cancelled'&&!o.change).length,
      replacedCount:rows.filter(o=>o.change?.operation==='edit').length,deletedCount:rows.filter(o=>o.change?.operation==='delete').length,
      distinctCustomers: new Set(active.map(o => o.customer.id)).size,
      subtotalCents: sum(active, 'subtotalCents'), discountCents: sum(active, 'discountCents'), totalCents: sum(active, 'totalCents'),
      shippingCents: exact(active.reduce((n, order) => n + BigInt(order.shippingCents ?? 0), 0n)),
      receivedDeclaredCents: sum(active.filter(o => o.payment.status === 'paid'), 'totalCents'),
      pendingPaymentCents: sum(active.filter(o => o.payment.status === 'pending'), 'totalCents'),
      cancelledTotalCents: sum(rows.filter(o => o.status === 'cancelled'&&!o.change), 'totalCents'),
      units: exact(active.reduce((n, o) => n + o.items.reduce((sum, i) => sum + BigInt(i.quantity), 0n), 0n)),
    },
  };
}
export function formatOrderCents(value: number): string {
  integer(value, 'Valor'); const n = BigInt(value);
  return `R$ ${String(n / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(n % 100n).padStart(2, '0')}`;
}
