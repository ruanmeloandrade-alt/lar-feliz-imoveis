import { PERIOD_MONTHS, type Period } from "./types";

const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000;

/**
 * Fator (em "meses") usado para cobrar adicionais proporcionalmente ao tempo
 * restante da assinatura atual.
 * - Plano mensal: sempre 1 mês (valor cheio do adicional).
 * - Planos maiores: proporcional ao que falta até o fim do ciclo vigente,
 *   com mínimo de 1 mês e teto na duração total do plano.
 */
export function extrasProrationMonths(
  period: Period,
  currentPeriodEnd?: string | null,
  now: Date = new Date(),
): number {
  const totalMonths = PERIOD_MONTHS[period] ?? 1;
  if (totalMonths <= 1) return 1;
  if (!currentPeriodEnd) return totalMonths;
  const end = new Date(currentPeriodEnd).getTime();
  if (!Number.isFinite(end)) return totalMonths;
  const remainingMs = end - now.getTime();
  if (remainingMs <= 0) return 1;
  const remainingMonths = remainingMs / MS_PER_MONTH;
  const clamped = Math.min(totalMonths, Math.max(1, remainingMonths));
  return Math.round(clamped * 100) / 100;
}
