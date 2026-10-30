/** Narrow ERP release rules. No database writes, credentials or messaging transport. */
import {isSlimContactPhoneConflict, SLIM_CONTACT_PHONE_MESSAGE} from './slim-contact-errors.core.ts';
export const ERP_LIMIT = 99999999999999;
export function erpReadableError(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  return text || 'Não foi possível concluir a operação do ERP.';
}
export function erpRejection(error: unknown): string | null {
  if (isSlimContactPhoneConflict(error)) return SLIM_CONTACT_PHONE_MESSAGE;
  if (!error || typeof error !== 'object') return null;
  const e = error as {code?: unknown; message?: unknown};
  if (!['22023','22P02','22003','23514','23503','42501'].includes(String(e.code))) return null;
  const raw = typeof e.message === 'string' ? e.message : '';
  return /^(Sem permissão|Pedido |Produto |O preço |Subtotal |Total |Totais |Quantidade |Pagamento |Parcelamento |Cliente |Dados do cliente|E-mail |Telefone |Selecione |Inclua |Referência )/.test(raw)
    ? raw : 'Pedido rejeitado sem gravação. Confira cliente, estoque, valores e permissões.';
}
export function assertErpContext(expected: string, actual: string, actor: string, owner: string | null, member: {user_id: string; access_expires_at: string | null} | null, now = Date.now()) {
  if (!expected || expected !== actual || !actor) throw new Error('A empresa ativa mudou. Reabra esta tela antes de continuar.');
  if (owner === actor) return;
  if (!member || member.user_id !== actor) throw new Error('Sem acesso vigente a esta empresa.');
  if (member.access_expires_at && (!Number.isFinite(Date.parse(member.access_expires_at)) || Date.parse(member.access_expires_at) <= now)) throw new Error('O acesso a esta empresa expirou.');
}
export function confirmReceiptShape(value: unknown, ws: string, request: string, cents: number) {
  const r = value as Record<string, unknown> | null;
  if (!r || r.workspaceId !== ws || r.requestId !== request || r.status !== 'confirmed' || r.totalCents !== cents ||
    typeof r.orderId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(r.orderId) ||
    typeof r.number !== 'string' || !r.number.trim() || r.number.length > 80) {
    throw new Error('A gravação não retornou uma confirmação íntegra. Consulte a tentativa antes de repetir.');
  }
  return {workspaceId:ws,requestId:request,orderId:r.orderId,number:r.number,status:'confirmed' as const,totalCents:cents};
}
