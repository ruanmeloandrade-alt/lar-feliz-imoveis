/** Delivery is an immutable order snapshot, independent of the customer profile. */
export type CheckoutFulfillment = { mode: 'pickup' } | {
  mode: 'delivery'; recipient: string; phone: string; postalCode: string;
  street: string; number: string; complement: string; neighborhood: string;
  city: string; state: string; notes: string;
};
export type CheckoutDelivery = { fulfillment?: CheckoutFulfillment; shippingCents?: number };
export const CHECKOUT_SHIPPING_LIMIT = 99999999999999;
const STATES = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
const DELIVERY_FIELDS = new Set(['mode','recipient','phone','postalCode','street','number','complement','neighborhood','city','state','notes']);
const controls = /[\x00-\x1f\x7f-\x9f]/;
function field(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string' || controls.test(value)) throw new Error(`${label} inválido.`);
  const result = value.trim();
  if (result.length > max || (required && !result)) throw new Error(`${label} inválido.`);
  return result;
}
/** Omitted fields remain omitted so historical orders never acquire an inferred delivery mode. */
export function normalizeCheckoutDelivery(fulfillment: unknown, shippingCents: unknown): CheckoutDelivery {
  if (fulfillment === undefined && shippingCents === undefined) return {};
  if (!fulfillment || typeof fulfillment !== 'object' || Array.isArray(fulfillment)) throw new Error('Informe a modalidade de entrega ou retirada.');
  if (typeof shippingCents !== 'number' || !Number.isSafeInteger(shippingCents) || shippingCents < 0 || shippingCents > CHECKOUT_SHIPPING_LIMIT) throw new Error('Frete inválido. Informe um valor em centavos.');
  const f = fulfillment as Record<string, unknown>;
  if (f.mode === 'pickup') {
    if (Object.keys(f).some(key => key !== 'mode') || shippingCents !== 0) throw new Error('Retirada não possui endereço de entrega nem cobrança de frete.');
    return { fulfillment: {mode: 'pickup'}, shippingCents: 0 };
  }
  if (f.mode !== 'delivery' || Object.keys(f).some(key => !DELIVERY_FIELDS.has(key))) throw new Error('Modalidade de entrega inválida.');
  const phoneInput = field(f.phone, 'Telefone de entrega', 40);
  if (!/^[+()\d .-]+$/.test(phoneInput)) throw new Error('Telefone de entrega inválido.');
  const phone = phoneInput.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(phone)) throw new Error('Telefone de entrega deve conter de 10 a 15 dígitos.');
  const postalInput = field(f.postalCode, 'CEP', 9);
  if (!/^\d{5}-?\d{3}$/.test(postalInput)) throw new Error('CEP deve conter 8 dígitos.');
  const state = field(f.state, 'UF', 2).toUpperCase();
  if (!STATES.has(state)) throw new Error('UF inválida.');
  return { shippingCents, fulfillment: {
    mode: 'delivery', recipient: field(f.recipient, 'Destinatário', 160), phone,
    postalCode: postalInput.replace('-', ''), street: field(f.street, 'Logradouro', 200),
    number: field(f.number, 'Número do endereço', 30), complement: field(f.complement, 'Complemento', 120, false),
    neighborhood: field(f.neighborhood, 'Bairro', 100), city: field(f.city, 'Cidade', 100), state,
    notes: field(f.notes, 'Observações de entrega', 500, false),
  }};
}
