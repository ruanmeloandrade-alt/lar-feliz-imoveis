import {VanessaFinancePanel} from "@/components/erp/VanessaFinancePanel";
// SLIM_DASHBOARD_DATA_CONTRACT_V1
import { SlimErpWorkspace } from "@/components/erp/SlimErpWorkspace";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DrilldownDrawer } from "@/components/dashboard/DrilldownDrawer";
import { DashboardV4ConnectedBoard } from "@/components/dashboard/DashboardV4ConnectedBoard";
import { CustomKpisSection } from "@/components/dashboard/CustomKpisSection";
import { AddKpiDialog } from "@/components/dashboard/AddKpiDialog";
import { DashboardPeriodPicker, DEFAULT_PERIOD, type DashboardPeriod } from "@/components/dashboard/DashboardPeriodPicker";
import { useKpiRules } from "@/lib/kpi-rules";
import type { DrilldownLead, KpiCardData } from "@/lib/mock-dashboard";
import { refreshEnabledDashboardQueries } from "@/lib/slim-dashboard-data.core";
import { getDashboardData, getCustomKpiCards } from "@/lib/dashboard.functions";
import { getDashboardV4LiveData, type DashboardV4LiveResponse } from "@/lib/dashboard-v4-live.functions";
import { getDashboardV4Operations } from "@/lib/dashboard-v4-operations.functions";
import { getDashboardV4ProductSales } from "@/lib/dashboard-v4-product-sales.functions";
import { getTrackingOverview } from "@/lib/tracking-live.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";
import { isLeadDrilldown, leadDrilldown, type DashboardDrilldownRequest } from "@/lib/dashboard-drilldown";
import { useHasModule } from "@/hooks/use-subscription";

const MEDIA_KPIS = [
  "meta.spend_7d",
  "meta.reach_7d",
  "meta.impressions_7d",
  "meta.clicks_7d",
  "meta.leads_7d",
  "meta.cost_per_result_7d",
  "meta.messaging_conversations_7d",
  "meta.cost_per_conversation_7d",
] as const;

export const Route = createFileRoute("/painel")({
  head: () => ({ meta: [{ title: "Painel comercial · Vanessa Simoni" }, { name: "description", content: "Painel executivo da operação comercial Vanessa Simoni: CRM, mídia, tracking, social e execução." }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const loadDashboard = useServerFn(getDashboardData);
  const loadV4Live = useServerFn(getDashboardV4LiveData);
  const loadWorkspace = useServerFn(getActiveWorkspace);
  const loadTracking = useServerFn(getTrackingOverview);
  const loadMedia = useServerFn(getCustomKpiCards);
  const loadOperations = useServerFn(getDashboardV4Operations);
  const loadProductSales = useServerFn(getDashboardV4ProductSales);
  const trackingModule = useHasModule("tracking");
  const trafficModule = useHasModule("trafego_ia");
  const socialFullModule = useHasModule("social_media_ia");
  const socialCalendarModule = useHasModule("social_calendar");
  const workflowModule = useHasModule("fluxo_trabalho");
  const [drilldown, setDrilldown] = useState<{ open: boolean; title: string; subtitle: string; leads: DrilldownLead[] }>({ open: false, title: "", subtitle: "", leads: [] });
  const [editOpen, setEditOpen] = useState(false);
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD);
  const { rules } = useKpiRules();

  const loaderInput = { ...rules, date_from: period.from ?? undefined, date_to: period.to ?? undefined, period_label: period.label };
  const dashboardQuery = useQuery({ queryKey: ["dashboard", "Vanessa Simoni", rules, period.from, period.to], queryFn: () => loadDashboard({ data: loaderInput }), retry: 1, staleTime: 30_000 });
  const v4LiveQuery = useQuery({
    queryKey: ["dashboard", "v4-live", rules.venda_ganha_pipeline_id, rules.venda_ganha_stage_id, period.from, period.to],
    queryFn: () => loadV4Live({ data: { venda_ganha_pipeline_id: rules.venda_ganha_pipeline_id || undefined, venda_ganha_stage_id: rules.venda_ganha_stage_id || undefined, date_from: period.from ?? undefined, date_to: period.to ?? undefined } }),
    retry: 1,
    staleTime: 30_000,
  });
  const productSalesQuery = useQuery({
    queryKey: ["dashboard", "v4-product-sales", rules.venda_ganha_pipeline_id, rules.venda_ganha_stage_id, period.from, period.to],
    queryFn: () => loadProductSales({ data: { venda_ganha_pipeline_id: rules.venda_ganha_pipeline_id || undefined, venda_ganha_stage_id: rules.venda_ganha_stage_id || undefined, date_from: period.from ?? undefined, date_to: period.to ?? undefined } }),
    retry: 1,
    staleTime: 30_000,
  });
  const workspaceQuery = useQuery({ queryKey: ["active-workspace", "dashboard-v4"], queryFn: () => loadWorkspace(), staleTime: 5 * 60_000 });
  const trackingQuery = useQuery({
    queryKey: ["dashboard", "tracking-overview", workspaceQuery.data?.id],
    queryFn: () => loadTracking({ data: { workspaceId: workspaceQuery.data!.id } }),
    enabled: !trackingModule.loading && trackingModule.hasAccess && Boolean(workspaceQuery.data?.id), retry: 1, staleTime: 30_000,
  });
  const mediaQuery = useQuery({
    queryKey: ["dashboard", "media-v4", rules.venda_ganha_pipeline_id, rules.venda_ganha_stage_id],
    queryFn: () => loadMedia({ data: { kpiKeys: [...MEDIA_KPIS], venda_ganha_pipeline_id: rules.venda_ganha_pipeline_id || undefined, venda_ganha_stage_id: rules.venda_ganha_stage_id || undefined } }),
    enabled: !trafficModule.loading && trafficModule.hasAccess,
    retry: 1,
    staleTime: 30_000,
  });
  const operationsQuery = useQuery({
    queryKey: ["dashboard", "operations-v4", period.from, period.to],
    queryFn: () => loadOperations({ data: { date_from: period.from ?? undefined, date_to: period.to ?? undefined } }),
    enabled: (!socialFullModule.loading && !socialCalendarModule.loading && (socialFullModule.hasAccess || socialCalendarModule.hasAccess)) || (!workflowModule.loading && workflowModule.hasAccess),
    retry: 1,
    staleTime: 30_000,
  });

  const dashboard = dashboardQuery.data;
  const metrics = dashboard?.metrics;
  const drilldownLeads = dashboard?.drilldownLeads ?? [];
  const liveData = mergeTrackingOverview(v4LiveQuery.error ? undefined : v4LiveQuery.data, trackingQuery.error ? undefined : trackingQuery.data);
  const showSocial = !socialFullModule.loading && !socialCalendarModule.loading && (socialFullModule.hasAccess || socialCalendarModule.hasAccess);
  const showWorkflow = !workflowModule.loading && workflowModule.hasAccess;
  const showTraffic = !trafficModule.loading && trafficModule.hasAccess;

  function openDrilldown(request: DashboardDrilldownRequest) {
    if (!isLeadDrilldown(request)) return;
    setDrilldown({ open: true, title: request.title, subtitle: request.subtitle, leads: request.leads });
  }
  function openKpi(kpi: Pick<KpiCardData, "kpi_key" | "label" | "source_label">) {
    openDrilldown(leadDrilldown("Detalhamento", `${kpi.label} · ${kpi.source_label}`, filterKpiLeads(kpi, drilldownLeads), kpi.source_label));
  }
  function handleCockpitClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!metrics || dashboardQuery.error) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const text = closestCompactText(target);
    if (!text) return;
    const stage = metrics.funnel.filter((item) => item.stage_name.trim()).sort((a, b) => b.stage_name.length - a.stage_name.length).find((item) => includesLabel(text, item.stage_name));
    if (stage) {
      openDrilldown(leadDrilldown(`Etapa · ${stage.stage_name}`, stage.funnel_name, drilldownLeads.filter((lead) => lead.stage_id === stage.stage_id), "Vanessa Simoni"));
      return;
    }
    const tag = uniqueLabels(drilldownLeads.flatMap((lead) => lead.crm_tags)).find((name) => includesLabel(text, name));
    if (tag) openDrilldown(leadDrilldown(`Tag · ${tag}`, "Leads que possuem esta tag", drilldownLeads.filter((lead) => lead.crm_tags.some((item) => normalize(item) === normalize(tag))), "Vanessa Simoni"));
  }

  const refreshDashboard = () => refreshEnabledDashboardQueries([
    { enabled: true, refetch: () => dashboardQuery.refetch() },
    { enabled: true, refetch: () => v4LiveQuery.refetch() },
    { enabled: true, refetch: () => productSalesQuery.refetch() },
    { enabled: !trackingModule.loading && trackingModule.hasAccess && Boolean(workspaceQuery.data?.id), refetch: () => trackingQuery.refetch() },
    { enabled: showTraffic, refetch: () => mediaQuery.refetch() },
    { enabled: showSocial || showWorkflow, refetch: () => operationsQuery.refetch() },
  ]);
  const syncBusy = dashboardQuery.isFetching || v4LiveQuery.isFetching || productSalesQuery.isFetching || trackingQuery.isFetching || mediaQuery.isFetching || operationsQuery.isFetching;
  const syncError = [dashboardQuery.error, v4LiveQuery.error, productSalesQuery.error, trackingQuery.error, mediaQuery.error, operationsQuery.error].find((error) => error instanceof Error) as Error | undefined;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <div className="print:hidden"><AppSidebar /></div>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            <VanessaFinancePanel compact/>
            <SlimErpWorkspace mode="summary" />
            <p className="text-xs text-muted-foreground">Abaixo: indicadores de oportunidades e atendimento do CRM. Os valores de VGV e comissões vêm do funil; os registros comerciais e documentos ficam no histórico de negociações.</p>
            {metrics && !dashboardQuery.error && metrics.read_status !== "error" ? <>
            <DashboardHeader metrics={metrics} onEdit={() => setEditOpen(true)} onPrint={() => window.print()} syncBusy={syncBusy} syncMessage={syncError?.message ?? dashboard?.syncError} onSync={refreshDashboard} periodSlot={<DashboardPeriodPicker value={period} onChange={setPeriod} />} />
            {!!liveData?.issues?.length && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">O painel comercial foi carregado. Estas fontes ainda precisam de atenção:</p>
              {liveData.issues.map((issue) => <p key={issue.source} className="mt-1">{issue.message}</p>)}
            </div>}
            <div id="printable-area" className="space-y-5">
              <div onClickCapture={handleCockpitClick}>
                <DashboardV4ConnectedBoard metrics={metrics} leads={drilldownLeads} liveData={liveData} productSales={productSalesQuery.error ? undefined : productSalesQuery.data} mediaCards={mediaQuery.data?.cards ?? []} operations={operationsQuery.data} showTracking={!trackingModule.loading && trackingModule.hasAccess} showTraffic={showTraffic} showSocial={showSocial} showWorkflow={showWorkflow} onDrilldown={openDrilldown} />
              </div>
              <div className="print:hidden space-y-5"><CustomKpisSection onEdit={() => setEditOpen(true)} onKpiClick={openKpi} /></div>
            </div>
            </> : <div className="rounded-xl border border-border p-6" role={dashboardQuery.error || dashboard?.syncError ? "alert" : "status"}>
              <h1 className="text-xl font-semibold">Dashboard detalhada</h1>
              <p className="mt-3 text-sm">{dashboardQuery.error || dashboard?.syncError ? "Não foi possível carregar os dados comerciais. Nenhum indicador foi calculado a partir dessa falha." : "Carregando os dados reais da operação..."}</p>
              {(dashboardQuery.error || dashboard?.syncError) && <button type="button" className="mt-4 rounded-md border border-border px-4 py-2 text-sm" onClick={refreshDashboard}>Tentar novamente</button>}
            </div>}
          </div>
        </div>
      </main>
      <DrilldownDrawer open={drilldown.open} onOpenChange={(open) => setDrilldown((current) => ({ ...current, open }))} title={drilldown.title || "Vanessa Simoni"} subtitle={drilldown.subtitle || "Negociação"} leads={drilldown.leads} />
      <AddKpiDialog open={editOpen} onOpenChange={setEditOpen} ruleOptions={dashboard?.options ?? { pipelines: [], originTags: [], stages: [] }} />
    </div>
  );
}

function mergeTrackingOverview(liveData: DashboardV4LiveResponse | undefined, overview: Awaited<ReturnType<typeof getTrackingOverview>> | undefined): DashboardV4LiveResponse | undefined {
  if (!liveData || !overview) return liveData;
  const previous = liveData.tracking;
  return { ...liveData, tracking: { events24h: overview.events24h, sessions24h: overview.sessions24h, pageViews: overview.funnel.pageViews, clicks: overview.funnel.clicks, leads: overview.funnel.leads, conversions: overview.funnel.conversions, revenue: overview.revenue7d, visitors: overview.identified.visitors, identifiedVisitors: overview.identified.identified, sitesActive: overview.sitesActive, sitesTotal: overview.sitesTotal, topCampaigns: overview.topCampaigns.map((item) => ({ campaign: item.key, sessions: item.sessions, leads: item.conversions })), topSources: overview.topSources.map((item) => ({ source: item.source, sessions: Number(item.sessions ?? 0), leads: Number(item.leads ?? 0) })), eventBreakdown: previous?.eventBreakdown ?? [] } };
}
function closestCompactText(target: HTMLElement): string { let current: HTMLElement | null = target; for (let depth = 0; depth < 6 && current; depth += 1) { const text = current.textContent?.replace(/\s+/g, " ").trim() ?? ""; if (text.length >= 2 && text.length <= 180) return text; current = current.parentElement; } return ""; }
function normalize(value: string | null | undefined): string { return (value ?? "").trim().toLocaleLowerCase("pt-BR"); }
function includesLabel(text: string, label: string): boolean { const normalizedLabel = normalize(label); return normalizedLabel.length >= 2 && normalize(text).includes(normalizedLabel); }
function uniqueLabels(values: Array<string | null | undefined>): string[] { const seen = new Set<string>(); const out: string[] = []; for (const value of values) { const label = value?.trim(); const key = normalize(label); if (!label || !key || seen.has(key)) continue; seen.add(key); out.push(label); } return out.sort((a, b) => b.length - a.length); }
function filterKpiLeads(kpi: Pick<KpiCardData, "kpi_key" | "label"> | undefined, leads: DrilldownLead[]) {
  const kpiKey = kpi?.kpi_key; const label = kpi?.label ?? "";
  const createdWithinDays = (days: number) => { const now = Date.now(); const from = now - days * 86400000; return leads.filter((lead) => { const created = new Date(lead.created_at).getTime(); return Number.isFinite(created) && created <= now && created >= from; }); };
  if (kpiKey?.startsWith("crm.")) {
    const suffix = kpiKey.slice(4);
    if (suffix === "leads_24h") return createdWithinDays(1); if (suffix === "leads_7d") return createdWithinDays(7); if (suffix === "leads_30d") return createdWithinDays(30); if (suffix === "leads_total") return leads;
    if (suffix === "leads_abertos" || suffix === "valor_pipeline") return leads.filter((lead) => lead.status_key === "open");
    if (suffix === "leads_ganhos" || suffix === "valor_ganho" || suffix === "ticket_medio") return leads.filter((lead) => lead.status_key === "won");
    if (suffix === "leads_perdidos") return leads.filter((lead) => lead.status_key === "lost");
    if (suffix === "taxa_conversao") return leads;
    if (suffix.startsWith("stage.")) { const stageId = suffix.match(/^stage\.([^.]+)\./)?.[1]; if (stageId) return leads.filter((lead) => lead.stage_id === stageId); }
    if (suffix.startsWith("tag.")) { const tagName = label.replace(/^Tag\s*·\s*/i, "").trim().toLowerCase(); if (tagName) return leads.filter((lead) => lead.crm_tags.some((tag) => tag.trim().toLowerCase() === tagName)); }
    return [];
  }
  switch (kpiKey) { case "vendas_ganhas": return leads.filter((lead) => lead.status_key === "won"); case "vendas_perdidas": return leads.filter((lead) => lead.status_key === "lost"); case "em_atendimento": case "valor_pipeline": return leads.filter((lead) => lead.status_key === "open"); case "sem_tarefa_futura": case "leads_urgentes": return []; default: return leads; }
}

// SLIM_ERP_RELEASE_V1
