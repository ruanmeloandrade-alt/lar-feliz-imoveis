/** Only this identified database guard proves a rejected contact creation. */
export const SLIM_CONTACT_PHONE_GUARD = 'slim_leads_contact_phone_guard';
export const SLIM_CONTACT_PHONE_CONFLICT = 'contact_phone_duplicate';
export const SLIM_CONTACT_PHONE_MESSAGE = 'Telefone já cadastrado. Selecione o cliente existente.';

export function isSlimContactPhoneConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as {code?: unknown; details?: unknown; constraint?: unknown};
  return value.code === '23505' &&
    (value.details === SLIM_CONTACT_PHONE_GUARD || value.constraint === SLIM_CONTACT_PHONE_GUARD);
}
