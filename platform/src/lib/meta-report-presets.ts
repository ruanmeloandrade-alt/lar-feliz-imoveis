// Presets de período compartilhados entre o painel do Gestor de Tráfego e Relatórios.
// Todos os valores (exceto `custom:...`) são aceitos nativamente pelo Meta via `date_preset`.

export const REPORT_PRESETS = [
  { v: "today", l: "Hoje" },
  { v: "yesterday", l: "Ontem" },
  { v: "last_3d", l: "Últimos 3 dias" },
  { v: "last_7d", l: "Últimos 7 dias" },
  { v: "last_14d", l: "Últimos 14 dias" },
  { v: "last_28d", l: "Últimos 28 dias" },
  { v: "last_30d", l: "Últimos 30 dias" },
  { v: "last_90d", l: "Últimos 90 dias" },
  { v: "this_week_mon_today", l: "Esta semana (seg → hoje)" },
  { v: "last_week_mon_sun", l: "Semana passada (seg → dom)" },
  { v: "this_month", l: "Este mês" },
  { v: "last_month", l: "Mês passado" },
  { v: "this_quarter", l: "Este trimestre" },
  { v: "last_quarter", l: "Trimestre passado" },
  { v: "this_year", l: "Este ano" },
  { v: "last_year", l: "Ano passado" },
  { v: "maximum", l: "Tempo inteiro (máximo)" },
  { v: "custom", l: "Personalizado…" },
] as const;

export const CUSTOM_PRESET_RE = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;

// Regex aceito pelo Zod: qualquer preset conhecido OU `custom:YYYY-MM-DD:YYYY-MM-DD`.
export const REPORT_PRESET_REGEX =
  /^(today|yesterday|last_3d|last_7d|last_14d|last_28d|last_30d|last_90d|this_week_mon_today|last_week_mon_sun|this_month|last_month|this_quarter|last_quarter|this_year|last_year|maximum|custom:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2})$/;

export function reportPresetLabel(preset: string): string {
  const m = preset.match(CUSTOM_PRESET_RE);
  if (m) {
    const fmt = (s: string) => {
      const [y, mo, d] = s.split("-");
      return `${d}/${mo}/${y}`;
    };
    return `${fmt(m[1])} → ${fmt(m[2])}`;
  }
  return REPORT_PRESETS.find((p) => p.v === preset)?.l ?? preset;
}

/** Converte um preset em params aceitos pelo endpoint /insights do Meta. */
export function presetToMetaParams(preset: string): Record<string, string> {
  const m = preset.match(CUSTOM_PRESET_RE);
  if (m) {
    return { time_range: JSON.stringify({ since: m[1], until: m[2] }) };
  }
  return { date_preset: preset };
}
