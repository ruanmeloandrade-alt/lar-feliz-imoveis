// Feriados nacionais por país (ISO alpha-2). Ajuste conforme necessário.
// Retorna Map<YYYY-MM-DD, nome>.

function fmt(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Meeus/Jones/Butcher, domingo de Páscoa (calendário gregoriano)
function easterSunday(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

function addDaysISO(y: number, m: number, d: number, delta: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// N-ésimo dia da semana do mês (weekday: 0=dom..6=sab)
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return fmt(year, month, day);
}

// Último dia da semana do mês
function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  const day = last.getUTCDate() - offset;
  return fmt(year, month, day);
}

function holidaysBR(year: number): Record<string, string> {
  const easter = easterSunday(year);
  const map: Record<string, string> = {
    [fmt(year, 1, 1)]: "Confraternização Universal",
    [fmt(year, 4, 21)]: "Tiradentes",
    [fmt(year, 5, 1)]: "Dia do Trabalho",
    [fmt(year, 9, 7)]: "Independência do Brasil",
    [fmt(year, 10, 12)]: "Nossa Senhora Aparecida",
    [fmt(year, 11, 2)]: "Finados",
    [fmt(year, 11, 15)]: "Proclamação da República",
    [fmt(year, 11, 20)]: "Consciência Negra",
    [fmt(year, 12, 25)]: "Natal",
    [addDaysISO(year, easter.m, easter.d, -48)]: "Carnaval",
    [addDaysISO(year, easter.m, easter.d, -47)]: "Carnaval",
    [addDaysISO(year, easter.m, easter.d, -2)]: "Sexta-feira Santa",
    [addDaysISO(year, easter.m, easter.d, 0)]: "Páscoa",
    [addDaysISO(year, easter.m, easter.d, 60)]: "Corpus Christi",
  };
  return map;
}

function holidaysUS(year: number): Record<string, string> {
  return {
    [fmt(year, 1, 1)]: "New Year's Day",
    [nthWeekday(year, 1, 1, 3)]: "Martin Luther King Jr. Day",
    [nthWeekday(year, 2, 1, 3)]: "Presidents' Day",
    [lastWeekday(year, 5, 1)]: "Memorial Day",
    [fmt(year, 6, 19)]: "Juneteenth",
    [fmt(year, 7, 4)]: "Independence Day",
    [nthWeekday(year, 9, 1, 1)]: "Labor Day",
    [nthWeekday(year, 10, 1, 2)]: "Columbus Day",
    [fmt(year, 11, 11)]: "Veterans Day",
    [nthWeekday(year, 11, 4, 4)]: "Thanksgiving",
    [fmt(year, 12, 25)]: "Christmas Day",
  };
}

function holidaysPT(year: number): Record<string, string> {
  const easter = easterSunday(year);
  return {
    [fmt(year, 1, 1)]: "Ano Novo",
    [addDaysISO(year, easter.m, easter.d, -2)]: "Sexta-feira Santa",
    [addDaysISO(year, easter.m, easter.d, 0)]: "Páscoa",
    [fmt(year, 4, 25)]: "Dia da Liberdade",
    [fmt(year, 5, 1)]: "Dia do Trabalhador",
    [fmt(year, 6, 10)]: "Dia de Portugal",
    [addDaysISO(year, easter.m, easter.d, 60)]: "Corpo de Deus",
    [fmt(year, 8, 15)]: "Assunção de Nossa Senhora",
    [fmt(year, 10, 5)]: "Implantação da República",
    [fmt(year, 11, 1)]: "Todos os Santos",
    [fmt(year, 12, 1)]: "Restauração da Independência",
    [fmt(year, 12, 8)]: "Imaculada Conceição",
    [fmt(year, 12, 25)]: "Natal",
  };
}

const PROVIDERS: Record<string, (year: number) => Record<string, string>> = {
  BR: holidaysBR,
  US: holidaysUS,
  PT: holidaysPT,
};

export function getHolidays(country: string | null | undefined, years: number[]): Map<string, string> {
  const code = (country ?? "BR").toUpperCase();
  const provider = PROVIDERS[code] ?? PROVIDERS.BR;
  const map = new Map<string, string>();
  for (const y of years) {
    const rec = provider(y);
    for (const [k, v] of Object.entries(rec)) map.set(k, v);
  }
  return map;
}

export function isoDate(d: Date): string {
  return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
