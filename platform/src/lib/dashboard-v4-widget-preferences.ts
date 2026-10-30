export type DashboardV4WidgetPreferences = {
  hiddenWidgetIds: string[];
  funnelName: string | null;
  formIds: string[] | null;
  kpiMetricByWidget: Record<string, DashboardV4KpiMetricId>;
};

export type DashboardV4KpiContext = "executive" | "tracking" | "media" | "social" | "workflow";

export type DashboardV4KpiMetricId =
  | "executive.revenue"
  | "executive.leads"
  | "executive.sales"
  | "executive.conversion"
  | "executive.open_leads"
  | "executive.pipeline_value"
  | "tracking.events"
  | "tracking.sessions"
  | "tracking.conversions"
  | "tracking.revenue"
  | "media.spend"
  | "media.leads"
  | "media.roas"
  | "media.cac"
  | "media.reach"
  | "media.clicks"
  | "media.net_return"
  | "social.published"
  | "social.scheduled"
  | "social.reach"
  | "social.interactions"
  | "social.engagement"
  | "social.failed"
  | "workflow.tasks_total"
  | "workflow.tasks_completed"
  | "workflow.meetings"
  | "workflow.meetings_pending"
  | "workflow.overdue"
  | "workflow.tracked_time";

export type DashboardV4KpiOption = {
  id: DashboardV4KpiMetricId;
  label: string;
};

export const DASHBOARD_V4_KPI_OPTIONS: Record<DashboardV4KpiContext, DashboardV4KpiOption[]> = {
  executive: [
    { id: "executive.revenue", label: "Receita" },
    { id: "executive.leads", label: "Leads" },
    { id: "executive.sales", label: "Vendas" },
    { id: "executive.conversion", label: "Conversão" },
    { id: "executive.open_leads", label: "Leads em aberto" },
    { id: "executive.pipeline_value", label: "Valor em pipeline" },
  ],
  tracking: [
    { id: "tracking.events", label: "Eventos 24h" },
    { id: "tracking.sessions", label: "Sessões 24h" },
    { id: "tracking.conversions", label: "Conversões" },
    { id: "tracking.revenue", label: "Receita atribuída" },
  ],
  media: [
    { id: "media.spend", label: "Investimento" },
    { id: "media.leads", label: "Leads de mídia" },
    { id: "media.roas", label: "ROAS" },
    { id: "media.cac", label: "CAC" },
    { id: "media.reach", label: "Alcance" },
    { id: "media.clicks", label: "Cliques" },
    { id: "media.net_return", label: "Retorno líquido" },
  ],
  social: [
    { id: "social.published", label: "Publicados" },
    { id: "social.scheduled", label: "Agendados" },
    { id: "social.reach", label: "Alcance" },
    { id: "social.interactions", label: "Interações" },
    { id: "social.engagement", label: "Engajamento" },
    { id: "social.failed", label: "Falhas" },
  ],
  workflow: [
    { id: "workflow.tasks_total", label: "Tarefas" },
    { id: "workflow.tasks_completed", label: "Tarefas concluídas" },
    { id: "workflow.meetings", label: "Reuniões" },
    { id: "workflow.meetings_pending", label: "Reuniões pendentes" },
    { id: "workflow.overdue", label: "Atrasadas" },
    { id: "workflow.tracked_time", label: "Tempo rastreado" },
  ],
};

const KPI_WIDGET_CONTEXT: Partial<Record<string, DashboardV4KpiContext>> = {
  "kpi-revenue": "executive",
  "kpi-leads": "executive",
  "kpi-sales": "executive",
  "kpi-conversion": "executive",
  "kpi-media-spend": "media",
  "kpi-roas": "media",
  "tracking-events": "tracking",
  "tracking-sessions": "tracking",
  "tracking-conversions": "tracking",
  "tracking-revenue": "tracking",
  "media-spend": "media",
  "media-leads": "media",
  "media-roas": "media",
  "media-cac": "media",
  "social-published": "social",
  "social-reach": "social",
  "social-interactions": "social",
  "social-engagement": "social",
  "workflow-tasks": "workflow",
  "workflow-meetings": "workflow",
  "workflow-overdue": "workflow",
  "workflow-time": "workflow",
};

export const DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES: DashboardV4WidgetPreferences = {
  hiddenWidgetIds: [],
  funnelName: null,
  formIds: null,
  kpiMetricByWidget: {},
};

export const DASHBOARD_V4_WIDGETS = [
  ["kpi-revenue", "Receita"],
  ["kpi-media-spend", "Investimento em mídia"],
  ["kpi-roas", "ROAS conectado"],
  ["kpi-leads", "Leads"],
  ["kpi-sales", "Vendas"],
  ["kpi-conversion", "Conversão"],
  ["executive-trend", "Receita e fechamento"],
  ["commercial-health", "Saúde comercial"],
  ["sales-funnel", "Funil de vendas"],
  ["seller-ranking", "Ranking de vendedores"],
  ["product-catalog", "Catálogo ativo"],
  ["product-sales", "Vendas por produto"],
  ["companies", "Empresas"],
  ["tags", "Tags"],
  ["custom-fields", "Campos personalizados"],
  ["tracking-events", "Eventos Tracking"],
  ["tracking-sessions", "Sessões Tracking"],
  ["tracking-conversions", "Conversões Tracking"],
  ["tracking-revenue", "Receita atribuída"],
  ["media-spend", "Investimento Meta"],
  ["media-leads", "Leads Meta"],
  ["media-roas", "ROAS de mídia"],
  ["media-cac", "CAC de mídia"],
  ["acquisition-funnel", "Funil de aquisição"],
  ["media-net-return", "Retorno líquido"],
  ["social-published", "Publicados"],
  ["social-reach", "Alcance Social"],
  ["social-interactions", "Interações Social"],
  ["social-engagement", "Engajamento Social"],
  ["social-top-posts", "Top posts"],
  ["workflow-tasks", "Tarefas workflow"],
  ["workflow-meetings", "Reuniões"],
  ["workflow-overdue", "Atrasadas"],
  ["workflow-time", "Tempo rastreado"],
  ["calendar-next", "Próximos compromissos"],
  ["workflow-productivity", "Produtividade por membro"],
] as const;

export type DashboardV4WidgetId = (typeof DASHBOARD_V4_WIDGETS)[number][0];

export function dashboardV4PreferencesStorageKey(workspaceId?: string | null) {
  return `mkton:dashboard-v4:widgets:${workspaceId || "default"}`;
}

export function getDashboardV4WidgetKpiContext(widgetId: string): DashboardV4KpiContext | null {
  return KPI_WIDGET_CONTEXT[widgetId] ?? null;
}

export function getDashboardV4KpiOptions(widgetId: string): DashboardV4KpiOption[] {
  const context = getDashboardV4WidgetKpiContext(widgetId);
  return context ? DASHBOARD_V4_KPI_OPTIONS[context] : [];
}

export function getDashboardV4WidgetMetric(
  preferences: DashboardV4WidgetPreferences,
  widgetId: string,
  fallback: DashboardV4KpiMetricId,
): DashboardV4KpiMetricId {
  const selected = preferences.kpiMetricByWidget[widgetId];
  if (!selected) return fallback;
  return getDashboardV4KpiOptions(widgetId).some((option) => option.id === selected) ? selected : fallback;
}

export function setDashboardV4WidgetMetric(
  preferences: DashboardV4WidgetPreferences,
  widgetId: string,
  metricId: DashboardV4KpiMetricId,
): DashboardV4WidgetPreferences {
  if (!getDashboardV4KpiOptions(widgetId).some((option) => option.id === metricId)) return preferences;
  return { ...preferences, kpiMetricByWidget: { ...preferences.kpiMetricByWidget, [widgetId]: metricId } };
}

export function clearDashboardV4WidgetMetric(
  preferences: DashboardV4WidgetPreferences,
  widgetId: string,
): DashboardV4WidgetPreferences {
  if (!(widgetId in preferences.kpiMetricByWidget)) return preferences;
  const kpiMetricByWidget = { ...preferences.kpiMetricByWidget };
  delete kpiMetricByWidget[widgetId];
  return { ...preferences, kpiMetricByWidget };
}

export function normalizeDashboardV4Preferences(value: unknown): DashboardV4WidgetPreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES };
  const raw = value as Record<string, unknown>;
  const validIds = new Set<string>(DASHBOARD_V4_WIDGETS.map(([id]) => id));
  const hiddenWidgetIds = Array.isArray(raw.hiddenWidgetIds)
    ? raw.hiddenWidgetIds.filter((id): id is string => typeof id === "string" && validIds.has(id))
    : [];
  const funnelName = typeof raw.funnelName === "string" && raw.funnelName.trim() ? raw.funnelName.trim() : null;
  const formIds = raw.formIds === null
    ? null
    : Array.isArray(raw.formIds)
      ? raw.formIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : null;
  const kpiMetricByWidget: Record<string, DashboardV4KpiMetricId> = {};
  if (raw.kpiMetricByWidget && typeof raw.kpiMetricByWidget === "object" && !Array.isArray(raw.kpiMetricByWidget)) {
    for (const [widgetId, metricId] of Object.entries(raw.kpiMetricByWidget as Record<string, unknown>)) {
      if (typeof metricId !== "string") continue;
      if (getDashboardV4KpiOptions(widgetId).some((option) => option.id === metricId)) {
        kpiMetricByWidget[widgetId] = metricId as DashboardV4KpiMetricId;
      }
    }
  }
  return {
    hiddenWidgetIds: [...new Set(hiddenWidgetIds)],
    funnelName,
    formIds: formIds == null ? null : [...new Set(formIds)],
    kpiMetricByWidget,
  };
}

export function parseDashboardV4Preferences(serialized: string | null): DashboardV4WidgetPreferences {
  if (!serialized) return { ...DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES };
  try {
    return normalizeDashboardV4Preferences(JSON.parse(serialized));
  } catch {
    return { ...DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES };
  }
}

export function setWidgetHidden(preferences: DashboardV4WidgetPreferences, widgetId: string, hidden: boolean): DashboardV4WidgetPreferences {
  const ids = new Set(preferences.hiddenWidgetIds);
  if (hidden) ids.add(widgetId); else ids.delete(widgetId);
  return { ...preferences, hiddenWidgetIds: [...ids] };
}

export function isWidgetHidden(preferences: DashboardV4WidgetPreferences, widgetId: string) {
  return widgetId === "forms" || preferences.hiddenWidgetIds.includes(widgetId);
}

export function filterDashboardFunnel<T extends { funnelName: string }>(rows: T[], funnelName: string | null): T[] {
  if (!funnelName) return rows;
  return rows.filter((row) => row.funnelName === funnelName);
}

export function filterDashboardForms<T extends { id: string }>(forms: T[], formIds: string[] | null): T[] {
  if (formIds === null) return forms;
  const allowed = new Set(formIds);
  return forms.filter((form) => allowed.has(form.id));
}
