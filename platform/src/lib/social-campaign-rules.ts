export type SocialCampaignCadence = {
  kind: "daily" | "weekly" | "custom";
  perWeek: number;
  days: number[];
  hour: number;
  minute: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDayUtc(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Data de campanha inválida.");
  return parsed;
}

export function campaignDateIsInsidePeriod(
  date: string | Date,
  startsAt: string,
  endsAt: string,
): boolean {
  const start = parseDayUtc(startsAt);
  const end = parseDayUtc(endsAt);
  end.setUTCHours(23, 59, 59, 999);
  const candidate = typeof date === "string" ? new Date(date) : new Date(date);
  return !Number.isNaN(candidate.getTime()) && candidate >= start && candidate <= end;
}

export function buildCampaignSchedule(
  total: number,
  startsAt: string,
  endsAt: string,
  cadence: SocialCampaignCadence,
): Date[] {
  if (total <= 0) return [];

  const start = parseDayUtc(startsAt);
  const end = parseDayUtc(endsAt);
  end.setUTCHours(23, 59, 59, 999);
  if (end < start) throw new Error("A data final da campanha deve ser igual ou posterior à inicial.");

  const slots: Date[] = [];
  const push = (day: Date) => {
    const d = new Date(day);
    d.setUTCHours(cadence.hour, cadence.minute, 0, 0);
    if (d >= start && d <= end) slots.push(d);
  };

  if (cadence.kind === "daily") {
    const cursor = new Date(start);
    while (cursor <= end && slots.length < total) {
      push(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const allowed = new Set(cadence.days?.length ? cadence.days : [1, 3, 5]);
    const cursor = new Date(start);
    while (cursor <= end && slots.length < total) {
      if (allowed.has(cursor.getUTCDay())) push(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  if (slots.length < total) {
    const availableDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
    throw new Error(
      `O período/cadência da campanha comporta ${slots.length} de ${total} posts. ` +
        `Aumente o período, escolha mais dias de postagem ou reduza a quantidade de posts (${availableDays} dias no período).`,
    );
  }

  return slots;
}
