import { parseMoneyCents, MAX_MONEY_CENTS } from "./slim-money.core";
export function commissionCents(value: number, mode: string, rate: number, fixed: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_MONEY_CENTS ||
    !Number.isSafeInteger(rate) ||
    rate < 0 ||
    rate > 10000 ||
    !Number.isSafeInteger(fixed) ||
    fixed < 0 ||
    fixed > MAX_MONEY_CENTS
  )
    throw Error("Comissão inválida.");
  return mode === "percentual" ? Number((BigInt(value) * BigInt(rate) + 5000n) / 10000n) : fixed;
}
export function realEstateOutcome(stageName: string) {
  if (/perdid|lost|descart|cancel/i.test(stageName)) return "perdida";
  if (/ganh|won|venda\s*(realiz|fechad|conclu)|fechad.*ganh/i.test(stageName)) return "fechada";
  return "aberta";
}
export function summarizeVanessaDeals(
  leads: Array<{ id: string; value: number | string; stage_id: string | null }>,
  stages: Array<{ id: string; name: string }>,
  financials: Array<{
    lead_id: string;
    deal_kind: string;
    commission_cents: number;
    received_cents: number;
  }>,
) {
  let openVgv = 0,
    soldVgv = 0,
    expectedCommission = 0,
    receivedCommission = 0,
    closedCommission = 0;
  for (const l of leads) {
    const outcome = realEstateOutcome(stages.find((s) => s.id === l.stage_id)?.name ?? "");
    if (outcome === "perdida") continue;
    const f = financials.find((x) => x.lead_id === l.id);
    const value = parseMoneyCents(l.value ?? 0);
    if (f?.deal_kind !== "locacao") {
      if (outcome === "fechada") soldVgv += value;
      else openVgv += value;
    }
    if (f) {
      expectedCommission += Number(f.commission_cents);
      receivedCommission += Number(f.received_cents);
      if (outcome === "fechada") closedCommission += Number(f.commission_cents);
    }
  }
  return { openVgv, soldVgv, expectedCommission, receivedCommission, closedCommission };
}
