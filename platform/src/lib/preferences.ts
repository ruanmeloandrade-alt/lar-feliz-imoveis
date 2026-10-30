// Preferências client-side.
// O idioma é individual. Moeda e fuso são propriedades da conta ativa e são
// persistidos no workspace; o localStorage mantém apenas um espelho para formatadores
// e é ressincronizado no login e na troca de workspace.

import { getCachedWorkspaceCurrency } from "@/lib/workspace-currency-cache";

const STORAGE_KEY = "mkton:preferences";

export interface UserPreferences {
  idioma: string; // BCP-47, e.g. "pt-BR"
  fusoHorario: string; // Espelho client-side do fuso IANA da conta ativa.
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  idioma: "pt-BR",
  fusoHorario: "America/Sao_Paulo",
};

export function readPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      idioma: parsed.idioma || DEFAULT_PREFERENCES.idioma,
      fusoHorario: parsed.fusoHorario || DEFAULT_PREFERENCES.fusoHorario,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(prefs: UserPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event("mkton:preferences-changed"));
  } catch {
    /* ignore */
  }
}

export function getUserTimeZone(): string {
  return readPreferences().fusoHorario;
}

export function getUserLocale(): string {
  return readPreferences().idioma;
}

/** Moeda padrão da conta ativa (fallback BRL enquanto o cache não sincroniza). */
export function getWorkspaceCurrency(): string {
  return getCachedWorkspaceCurrency() || "BRL";
}

/** Formata um valor monetário. Usa o idioma do usuário + moeda da conta. */
export function formatCurrency(value: number, currency?: string): string {
  const { idioma } = readPreferences();
  const cur = currency || getWorkspaceCurrency();
  try {
    return new Intl.NumberFormat(idioma, { style: "currency", currency: cur }).format(value);
  } catch {
    return `${cur} ${value.toFixed(2)}`;
  }
}

export function formatDateTime(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  const { idioma, fusoHorario } = readPreferences();
  return new Intl.DateTimeFormat(idioma, { ...opts, timeZone: fusoHorario }).format(
    typeof value === "string" || typeof value === "number" ? new Date(value) : value,
  );
}

/* ---------- Catálogos para os selects ---------- */

export interface TimeZoneOption {
  value: string;
  label: string;
}

export interface TimeZoneGroup {
  label: string;
  zones: TimeZoneOption[];
}

export const TIMEZONE_GROUPS: TimeZoneGroup[] = [
  {
    label: "Brasil",
    zones: [
      { value: "America/Rio_Branco", label: "Rio Branco (AC)" },
      { value: "America/Manaus", label: "Manaus (AM / RO / RR)" },
      { value: "America/Cuiaba", label: "Cuiabá (MT)" },
      { value: "America/Campo_Grande", label: "Campo Grande (MS)" },
      { value: "America/Sao_Paulo", label: "São Paulo / Brasília" },
      { value: "America/Bahia", label: "Salvador (BA)" },
      { value: "America/Fortaleza", label: "Fortaleza (CE)" },
      { value: "America/Recife", label: "Recife (PE)" },
      { value: "America/Belem", label: "Belém (PA)" },
      { value: "America/Noronha", label: "Fernando de Noronha" },
    ],
  },
  {
    label: "Américas",
    zones: [
      { value: "America/New_York", label: "Nova York" },
      { value: "America/Chicago", label: "Chicago" },
      { value: "America/Denver", label: "Denver" },
      { value: "America/Los_Angeles", label: "Los Angeles" },
      { value: "America/Toronto", label: "Toronto" },
      { value: "America/Mexico_City", label: "Cidade do México" },
      { value: "America/Bogota", label: "Bogotá" },
      { value: "America/Lima", label: "Lima" },
      { value: "America/Santiago", label: "Santiago" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
      { value: "America/Caracas", label: "Caracas" },
    ],
  },
  {
    label: "Europa",
    zones: [
      { value: "Europe/Lisbon", label: "Lisboa" },
      { value: "Europe/London", label: "Londres" },
      { value: "Europe/Madrid", label: "Madri" },
      { value: "Europe/Paris", label: "Paris" },
      { value: "Europe/Berlin", label: "Berlim" },
      { value: "Europe/Rome", label: "Roma" },
      { value: "Europe/Amsterdam", label: "Amsterdã" },
      { value: "Europe/Athens", label: "Atenas" },
      { value: "Europe/Moscow", label: "Moscou" },
    ],
  },
  {
    label: "África / Oriente Médio",
    zones: [
      { value: "Africa/Cairo", label: "Cairo" },
      { value: "Africa/Johannesburg", label: "Joanesburgo" },
      { value: "Africa/Lagos", label: "Lagos" },
      { value: "Asia/Dubai", label: "Dubai" },
      { value: "Asia/Jerusalem", label: "Jerusalém" },
    ],
  },
  {
    label: "Ásia / Oceania",
    zones: [
      { value: "Asia/Karachi", label: "Karachi" },
      { value: "Asia/Kolkata", label: "Mumbai / Nova Délhi" },
      { value: "Asia/Bangkok", label: "Bangkok" },
      { value: "Asia/Singapore", label: "Singapura" },
      { value: "Asia/Hong_Kong", label: "Hong Kong" },
      { value: "Asia/Shanghai", label: "Xangai" },
      { value: "Asia/Tokyo", label: "Tóquio" },
      { value: "Asia/Seoul", label: "Seul" },
      { value: "Australia/Sydney", label: "Sydney" },
      { value: "Pacific/Auckland", label: "Auckland" },
    ],
  },
  {
    label: "UTC",
    zones: [{ value: "UTC", label: "UTC" }],
  },
];

/** Calcula o offset GMT atual de um fuso (com DST). Ex: "GMT-3", "GMT+5:30". */
export function getTimeZoneOffsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const tz = parts.find((p) => p.type === "timeZoneName")?.value || "";
    // "GMT" → "GMT+0"; "GMT-3" stays
    if (tz === "GMT") return "GMT+0";
    return tz;
  } catch {
    return "";
  }
}

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "ja-JP", label: "日本語" },
  { value: "zh-CN", label: "中文 (简体)" },
];

export interface CurrencyGroup {
  label: string;
  currencies: { value: string; label: string }[];
}

export const CURRENCY_GROUPS: CurrencyGroup[] = [
  {
    label: "Mais usadas",
    currencies: [
      { value: "BRL", label: "Real brasileiro (R$)" },
      { value: "USD", label: "Dólar americano (US$)" },
      { value: "EUR", label: "Euro (€)" },
      { value: "GBP", label: "Libra esterlina (£)" },
    ],
  },
  {
    label: "Américas",
    currencies: [
      { value: "CAD", label: "Dólar canadense (CA$)" },
      { value: "MXN", label: "Peso mexicano (MX$)" },
      { value: "ARS", label: "Peso argentino (AR$)" },
      { value: "CLP", label: "Peso chileno (CL$)" },
      { value: "COP", label: "Peso colombiano (CO$)" },
      { value: "PEN", label: "Sol peruano (S/)" },
    ],
  },
  {
    label: "Europa",
    currencies: [
      { value: "CHF", label: "Franco suíço (CHF)" },
      { value: "SEK", label: "Coroa sueca (kr)" },
      { value: "NOK", label: "Coroa norueguesa (kr)" },
      { value: "DKK", label: "Coroa dinamarquesa (kr)" },
      { value: "PLN", label: "Zloty polonês (zł)" },
    ],
  },
  {
    label: "Ásia / Oceania",
    currencies: [
      { value: "JPY", label: "Iene japonês (¥)" },
      { value: "CNY", label: "Yuan chinês (¥)" },
      { value: "HKD", label: "Dólar de Hong Kong (HK$)" },
      { value: "SGD", label: "Dólar de Singapura (S$)" },
      { value: "INR", label: "Rúpia indiana (₹)" },
      { value: "AUD", label: "Dólar australiano (A$)" },
      { value: "NZD", label: "Dólar neozelandês (NZ$)" },
    ],
  },
  {
    label: "África / Oriente Médio",
    currencies: [
      { value: "AED", label: "Dirham dos Emirados (د.إ)" },
      { value: "SAR", label: "Riyal saudita (﷼)" },
      { value: "ZAR", label: "Rand sul-africano (R)" },
    ],
  },
];

