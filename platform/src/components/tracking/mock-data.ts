// Módulo Tracking em produção, sem dados simulados.
// As listas abaixo ficam vazias até que o pixel MKTOn comece a receber
// eventos reais e as fontes sejam conectadas pelo usuário.
export type TrackingStatus = "ok" | "warning" | "error" | "pending";

export type TrackingSource = {
  id: string;
  name: string;
  category: "site" | "ads" | "email" | "whatsapp" | "call" | "crm" | "checkout";
  status: TrackingStatus;
  events24h: number;
  lastSync: string;
  description: string;
};

export const MOCK_SOURCES: TrackingSource[] = [];

export type TrackingEvent = {
  name: string;
  category: "core" | "conversão" | "engajamento" | "custom";
  source: string;
  count24h: number;
  count7d: number;
  lastAt: string;
};

export const MOCK_EVENTS: TrackingEvent[] = [];

export type UtmRow = {
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  leads: number;
  conversions: number;
  cpl: number;
  roas: number;
};

export const MOCK_UTMS: UtmRow[] = [];

export type ConversionDef = {
  id: string;
  name: string;
  trigger: string;
  value: string;
  total30d: number;
  rate: number;
};

export const MOCK_CONVERSIONS: ConversionDef[] = [];

export type FeedItem = { at: string; event: string; source: string; page?: string; utm?: string };

export const MOCK_FEED: FeedItem[] = [];

export const KPI_OVERVIEW: Array<{ label: string; value: string; delta: string; hint: string }> = [
  { label: "Eventos 24h",    value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "Sessões únicas", value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "Leads gerados",  value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "Conversões",     value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "CPL médio",      value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "ROAS",           value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "Taxa de match",  value: "-", delta: "-", hint: "aguardando pixel" },
  { label: "Fontes ativas",  value: "0",  delta: "-", hint: "nenhuma fonte conectada" },
];

export const FUNNEL: Array<{ label: string; value: number }> = [
  { label: "Impressões", value: 0 },
  { label: "Cliques",    value: 0 },
  { label: "Sessões",    value: 0 },
  { label: "Leads",      value: 0 },
  { label: "Conversões", value: 0 },
];

export const ALERTS: Array<{ level: "warning" | "ok"; title: string; hint: string }> = [];
