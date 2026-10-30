/**
 * Dashboard data shapes. Sem dados simulados - todos os valores zerados
 * ou em status `no_data`. Quando o usuário utilizar a Vanessa Simoni,
 * os layouts vão consumir dados reais do banco via server functions.
 */

export type KpiStatus = "ok" | "warn" | "danger" | "no_data";
export type KpiSource = "mkton" | "meta" | "google_ads" | "ga4" | "tiktok" | "google_business";

export interface KpiCardData {
 kpi_key: string;
 label: string;
 value: number | null;
 unit: "count" | "currency_brl" | "percent" | "duration_min";
 delta_pct: number | null;
 status: KpiStatus;
 source: KpiSource;
 source_label: string;
 description: string;
 sparkline: number[] | null;
 drilldown_available: boolean;
 size_key: "xs" | "sm" | "md" | "lg";
}

export interface FunnelStage {
 stage_id: string;
 stage_name: string;
 funnel_name: string;
 count: number;
 pct_of_top: number;
 value_brl: number;
}

export interface CentralCommandItem {
 id: string;
 title: string;
 caption: string;
 badge_text: string;
 badge_tone: "info" | "warn" | "danger" | "neutral" | "success";
 icon: "controller" | "reading" | "alert" | "catalog";
}

export interface EvolutionPoint {
 day: string;
 leads: number;
 ganhas: number;
 perdidas: number;
}

export interface DashboardMetricsResponse {
 read_at: string;
 read_status: "success" | "stale" | "error";
 period_label: string;
 source_label: string;
 funnel_label: string;
 leads_loaded: number;
 central: CentralCommandItem[];
 kpis: KpiCardData[];
 funnel: FunnelStage[];
 evolution: EvolutionPoint[];
}

function emptyKpi(kpi_key: string, label: string, unit: KpiCardData["unit"], description: string): KpiCardData {
 return {
 kpi_key,
 label,
 value: null,
 unit,
 delta_pct: null,
 status: "no_data",
 source: "mkton",
 source_label: "Vanessa Simoni",
 description,
 sparkline: null,
 drilldown_available: false,
 size_key: "sm",
 };
}

export const MOCK_METRICS: DashboardMetricsResponse = {
 read_at: new Date(0).toISOString(),
 read_status: "stale",
 period_label: "Últimos 30 dias",
 source_label: "Vanessa Simoni",
 funnel_label: " - ",
 leads_loaded: 0,
 central: [],
 kpis: [
 emptyKpi("leads_recebidos", "Leads Recebidos", "count", "Sem dados ainda"),
 emptyKpi("em_atendimento", "Em Atendimento", "count", "Sem dados ainda"),
 emptyKpi("sem_tarefa_futura", "Sem Tarefa Futura", "count", "Sem dados ainda"),
 emptyKpi("leads_urgentes", "Leads Urgentes", "count", "Sem dados ainda"),
 emptyKpi("vendas_ganhas", "Vendas Ganhas", "currency_brl", "Sem dados ainda"),
 emptyKpi("vendas_perdidas", "Vendas Perdidas", "count", "Sem dados ainda"),
 emptyKpi("taxa_conversao", "Taxa de Conversão", "percent", "Sem dados ainda"),
 emptyKpi("valor_pipeline", "Valor no Pipeline", "currency_brl", "Sem dados ainda"),
 ],
 funnel: [],
 evolution: [],
};

/* -------- Drilldown -------- */
export interface DrilldownLead {
 lead_id: string;
 stage_id?: string | null;
 status_key?: "open" | "won" | "lost";
 name: string;
 phone: string;
 email: string | null;
 stage_name: string;
 funnel_name: string;
 responsible: string;
 status_tags: { label: string; tone: "info" | "warn" | "danger" | "success" | "neutral" }[];
 value_brl: number;
 origin: string;
 created_at: string;
 updated_at: string;
 custom_fields: { key: string; value: string }[];
 crm_tags: string[];
}

export const MOCK_DRILLDOWN: { kpi_key: string; total: number; leads: DrilldownLead[] } = {
 kpi_key: "",
 total: 0,
 leads: [],
};

export interface CrmFieldOption {
 field_id: string;
 field_name: string;
 field_type: "select" | "text" | "number" | "date" | "url";
 related_leads: number;
 source: "mkton";
}
export interface CrmTagOption {
 tag_id: string;
 tag_name: string;
 related_leads: number;
}

export const MOCK_CRM_CATALOG: { custom_fields: CrmFieldOption[]; tags: CrmTagOption[] } = {
 custom_fields: [],
 tags: [],
};

export function formatKpiValue(value: number | null, unit: KpiCardData["unit"]): string {
 if (value === null) return " - ";
 switch (unit) {
 case "count":
 return new Intl.NumberFormat("pt-BR").format(value);
 case "currency_brl":
 return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
 case "percent":
 return `${(value * 100).toFixed(1).replace(".", ",")}%`;
 case "duration_min":
 return `${value} min`;
 default:
 return String(value);
 }
}

export function formatDelta(delta: number | null): string | null {
 if (delta === null) return null;
 const sign = delta > 0? "+": "";
 return `${sign}${(delta * 100).toFixed(0)}%`;
}
