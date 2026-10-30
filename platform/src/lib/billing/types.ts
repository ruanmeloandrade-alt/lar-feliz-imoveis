export type PlanCode = "starter" | "professional" | "business" | "enterprise";
export type Period = "1m" | "3m" | "6m" | "1y";
export type PaymentMethod = "pix" | "boleto" | "credit_card" | "debit_card";
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "expired"
  | "refunded"
  | "chargeback";
export type SubscriptionStatus =
  | "trial_active"
  | "trial_expired"
  | "starter"
  | "payment_pending"
  | "active"
  | "expired"
  | "canceled"
  | "overdue"
  | "paused";

export const PERIOD_LABEL: Record<Period, string> = {
  "1m": "1 mês",
  "3m": "3 meses",
  "6m": "6 meses",
  "1y": "1 ano",
};

export const PERIOD_MONTHS: Record<Period, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
};

/** Meses de bônus concedidos na contratação de cada período. */
export const PERIOD_BONUS_MONTHS: Record<Period, number> = {
  "1m": 0,
  "3m": 1,
  "6m": 1.5,
  "1y": 2,
};

export function periodTotalMonths(period: Period): number {
  return (PERIOD_MONTHS[period] ?? 1) + (PERIOD_BONUS_MONTHS[period] ?? 0);
}

export function formatMonths(months: number): string {
  const label = Number.isInteger(months) ? String(months) : String(months).replace(".", ",");
  return `${label} ${months === 1 ? "mês" : "meses"}`;
}

/** Data final de vigência considerando o bônus do período. */
export function periodEndDate(start: Date, period: Period): Date {
  const total = periodTotalMonths(period);
  const whole = Math.floor(total);
  const fraction = total - whole;
  const end = new Date(start);
  end.setMonth(end.getMonth() + whole);
  if (fraction > 0) end.setDate(end.getDate() + Math.round(fraction * 30));
  return end;
}

/**
 * Economia contra permanecer no mensal durante todo o tempo de uso.
 * Inclui eventual desconto do ciclo e o valor dos meses de cortesia.
 */
export function periodSavingsCents(monthlyPriceCents: number, selectedPeriodPriceCents: number, period: Period): number {
  if (monthlyPriceCents <= 0 || selectedPeriodPriceCents < 0) return 0;
  const monthlyReference = monthlyPriceCents * periodTotalMonths(period);
  return Math.max(0, Math.round(monthlyReference - selectedPeriodPriceCents));
}

export function periodBonusValueCents(monthlyPriceCents: number, period: Period): number {
  if (monthlyPriceCents <= 0) return 0;
  return Math.max(0, Math.round(monthlyPriceCents * PERIOD_BONUS_MONTHS[period]));
}

/** Preço do WhatsApp Extra. Nome da constante mantido por compatibilidade interna. */
export const EXTRA_EMPLOYEE_PRICE_CENTS = 3300; // R$ 33,00 por WhatsApp Extra

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  extra_employee: "WhatsApp Extra",
  suporte_chat: "Suporte via chat",
  crm_mkton: "CRM MKTOn",
  calendario: "Calendário",
  notas: "Notas",
  tracking: "Tracking & Analytics",
  agentes_ia: "Agent AI",
  automacoes_grupo: "Automações e agentes de grupo",
  suporte_prioritario: "Suporte prioritário via WhatsApp",
  trafego_automacoes: "Automações executáveis do Gestor de Tráfego",
  trafego_ia: "Gestor de Tráfego IA",
  social_calendar: "Calendário manual do Social Media",
  social_media_ia: "Social Media IA",
  fluxo_trabalho: "Fluxo de Trabalho",
};

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
