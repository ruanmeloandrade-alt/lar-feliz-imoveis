// SLIM_DASHBOARD_DATA_CONTRACT_V1
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  Gauge,
  Hash,
  Megaphone,
  Package,
  Radio,
  Route,
  Settings2,
  Share2,
  ShoppingBag,
  Tags,
  Target,
  Trophy,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardMetricsResponse, DrilldownLead, KpiCardData } from "@/lib/mock-dashboard";
import type { DashboardV4LiveResponse } from "@/lib/dashboard-v4-live.functions";
import type { DashboardV4OperationsResponse } from "@/lib/dashboard-v4-operations.functions";
import type { DashboardV4ProductSalesResponse } from "@/lib/dashboard-v4-product-sales.functions";
import { leadDrilldown, type DashboardDrilldownRequest } from "@/lib/dashboard-drilldown";
import { listMetaDashboardAccounts, setMetaDashboardAccounts } from "@/lib/dashboard-config.functions";
import {
  DASHBOARD_V4_WIDGETS,
  DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES,
  clearDashboardV4WidgetMetric,
  dashboardV4PreferencesStorageKey,
  filterDashboardForms,
  filterDashboardFunnel,
  getDashboardV4KpiOptions,
  getDashboardV4WidgetMetric,
  isWidgetHidden,
  parseDashboardV4Preferences,
  setDashboardV4WidgetMetric,
  setWidgetHidden,
  type DashboardV4KpiMetricId,
  type DashboardV4WidgetPreferences,
} from "@/lib/dashboard-v4-widget-preferences";
import { cn } from "@/lib/utils";

type Props = {
  metrics: DashboardMetricsResponse;
  leads: DrilldownLead[];
  liveData?: DashboardV4LiveResponse;
  productSales?: DashboardV4ProductSalesResponse;
  mediaCards: KpiCardData[];
  operations?: DashboardV4OperationsResponse;
  workspaceId?: string | null;
  showTracking: boolean;
  showTraffic: boolean;
  showSocial: boolean;
  showWorkflow: boolean;
  onDrilldown?: (request: DashboardDrilldownRequest) => void;
};

type WidgetEditorProps = {
  widgetId: string;
  preferences: DashboardV4WidgetPreferences;
  setPreferences: (next: DashboardV4WidgetPreferences) => void;
  funnelNames: string[];
  forms: Array<{ id: string; name: string }>;
  showTraffic: boolean;
  metaAccounts: Array<{ account_id: string; name: string | null; currency: string | null; dashboard_enabled: boolean }>;
  metaSaving: boolean;
  onToggleMeta: (accountId: string, checked: boolean) => void;
  onClose: () => void;
};

type KpiView = {
  label: string;
  value: string;
  note: string;
  icon: typeof Activity;
  onClick?: () => void;
};

function cardValue(cards: KpiCardData[], key: string): number | null {
  const value = cards.find((card) => card.kpi_key === key)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function DashboardV4ConfigurableBoard(props: Props) {
  const { metrics, leads, liveData, productSales, mediaCards, operations, workspaceId, showTracking, showTraffic, showSocial, showWorkflow, onDrilldown } = props;
  const [preferences, setPreferences] = useState<DashboardV4WidgetPreferences>(DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const queryClient = useQueryClient();
  const loadMetaAccounts = useServerFn(listMetaDashboardAccounts);
  const saveMetaAccounts = useServerFn(setMetaDashboardAccounts);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPreferences(parseDashboardV4Preferences(window.localStorage.getItem(dashboardV4PreferencesStorageKey(workspaceId))));
    setPreferencesLoaded(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!preferencesLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(dashboardV4PreferencesStorageKey(workspaceId), JSON.stringify(preferences));
  }, [preferences, preferencesLoaded, workspaceId]);

  const metaAccountsQuery = useQuery({
    queryKey: ["dashboard", "meta-dashboard-accounts", workspaceId],
    queryFn: () => loadMetaAccounts(),
    enabled: showTraffic && Boolean(workspaceId),
    staleTime: 30_000,
  });
  const metaAccounts = metaAccountsQuery.data?.accounts ?? [];
  const metaMutation = useMutation({
    mutationFn: (accountIds: string[]) => saveMetaAccounts({ data: { account_ids: accountIds } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "meta-dashboard-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "media-v4"] }),
      ]);
    },
  });

  const wonLeads = useMemo(() => leads.filter((lead) => lead.status_key === "won"), [leads]);
  const lostLeads = useMemo(() => leads.filter((lead) => lead.status_key === "lost"), [leads]);
  const openLeads = useMemo(() => leads.filter((lead) => lead.status_key === "open"), [leads]);
  const revenue = useMemo(() => wonLeads.reduce((sum, lead) => sum + lead.value_brl, 0), [wonLeads]);
  const pipelineValue = useMemo(() => openLeads.reduce((sum, lead) => sum + lead.value_brl, 0), [openLeads]);
  const conversion = leads.length ? wonLeads.length / leads.length : 0;
  const spend = cardValue(mediaCards, "meta.spend_7d");
  const mediaLeads = cardValue(mediaCards, "meta.leads_7d");
  const clicks = cardValue(mediaCards, "meta.clicks_7d");
  const reach = cardValue(mediaCards, "meta.reach_7d");
  const trackedRevenue = showTracking ? (liveData?.tracking?.revenue ?? 0) : 0;
  const roiRevenue = trackedRevenue > 0 ? trackedRevenue : revenue;
  const roas = spend && spend > 0 ? roiRevenue / spend : null;
  const cacBase = trackedRevenue > 0 ? (liveData?.tracking?.conversions ?? 0) : wonLeads.length;
  const cac = spend && spend > 0 && cacBase > 0 ? spend / cacBase : null;
  const netReturn = spend != null ? roiRevenue - spend : null;
  const roiSource = trackedRevenue > 0 ? "receita atribuída pelo Tracking" : "receita ganha do CRM (operacional)";

  const trend = useMemo(() => {
    const map = new Map<string, { day: string; revenue: number; sales: number; leads: number }>();
    for (const lead of leads) {
      const date = new Date(lead.created_at);
      if (!Number.isFinite(date.getTime())) continue;
      const day = date.toISOString().slice(0, 10);
      const row = map.get(day) ?? { day, revenue: 0, sales: 0, leads: 0 };
      row.leads += 1;
      if (lead.status_key === "won") { row.sales += 1; row.revenue += lead.value_brl; }
      map.set(day, row);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
  }, [leads]);

  const funnelAll = useMemo(() => metrics.funnel.map((stage) => ({ id: stage.stage_id, name: stage.stage_name, funnelName: stage.funnel_name, value: stage.count })), [metrics.funnel]);
  const funnelNames = useMemo(() => [...new Set(funnelAll.map((row) => row.funnelName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [funnelAll]);
  const funnel = useMemo(() => filterDashboardFunnel(funnelAll, preferences.funnelName), [funnelAll, preferences.funnelName]);
  const allForms = liveData?.forms ?? [];
  const forms = useMemo(() => filterDashboardForms(allForms, preferences.formIds), [allForms, preferences.formIds]);
  const tags = liveData?.tags ?? [];
  const customFields = liveData?.customFields ?? [];
  const companies = liveData?.companies ?? [];
  const products = liveData?.products ?? [];
  const productSaleRows = productSales?.rows ?? [];
  const tracking = liveData?.tracking ?? null;
  const social = operations?.social;
  const work = operations?.work;
  const hidden = (id: string) => isWidgetHidden(preferences, id);
  const edit = (id: string) => setEditingWidgetId(id);
  const drilldownByIds = (title: string, subtitle: string, leadIds: string[]) => onDrilldown?.(leadDrilldown(title, subtitle, leads.filter((lead) => leadIds.includes(lead.lead_id)), "CRM Vanessa Simoni"));

  const resolveKpi = (metricId: DashboardV4KpiMetricId): KpiView => {
    switch (metricId) {
      case "executive.revenue": return { label: "Receita", value: formatCurrency(revenue), note: "leads ganhos", icon: CircleDollarSign, onClick: () => drilldownByIds("Receita ganha", "Leads que compõem a receita", wonLeads.map((lead) => lead.lead_id)) };
      case "executive.leads": return { label: "Leads", value: leads.length.toLocaleString("pt-BR"), note: metrics.period_label, icon: Users, onClick: () => drilldownByIds("Leads", "Base do período", leads.map((lead) => lead.lead_id)) };
      case "executive.sales": return { label: "Vendas", value: wonLeads.length.toLocaleString("pt-BR"), note: "ganhas no CRM", icon: Trophy, onClick: () => drilldownByIds("Vendas ganhas", "Leads ganhos no período", wonLeads.map((lead) => lead.lead_id)) };
      case "executive.conversion": return { label: "Conversão", value: formatPercent(conversion), note: "lead → venda", icon: Target, onClick: () => drilldownByIds("Conversão comercial", "Base usada no cálculo", leads.map((lead) => lead.lead_id)) };
      case "executive.open_leads": return { label: "Leads em aberto", value: openLeads.length.toLocaleString("pt-BR"), note: "negócios ativos", icon: BriefcaseBusiness, onClick: () => drilldownByIds("Leads em aberto", "Negócios ativos no período", openLeads.map((lead) => lead.lead_id)) };
      case "executive.pipeline_value": return { label: "Valor em pipeline", value: formatCurrency(pipelineValue), note: "negócios em aberto", icon: CircleDollarSign, onClick: () => drilldownByIds("Valor em pipeline", "Negócios que compõem o pipeline", openLeads.map((lead) => lead.lead_id)) };
      case "tracking.events": return { label: "Eventos 24h", value: tracking?.events24h?.toLocaleString("pt-BR") ?? "—", note: "Tracking", icon: Radio };
      case "tracking.sessions": return { label: "Sessões 24h", value: tracking?.sessions24h?.toLocaleString("pt-BR") ?? "—", note: "Tracking", icon: Users };
      case "tracking.conversions": return { label: "Conversões", value: tracking?.conversions?.toLocaleString("pt-BR") ?? "—", note: "funil rastreado", icon: Target };
      case "tracking.revenue": return { label: "Receita atribuída", value: tracking ? formatCurrency(tracking.revenue) : "—", note: "Tracking", icon: CircleDollarSign };
      case "media.spend": return { label: "Investimento", value: showTraffic ? formatMaybeCurrency(spend) : "—", note: showTraffic ? "contas de mídia selecionadas" : "módulo não contratado", icon: BadgeDollarSign };
      case "media.leads": return { label: "Leads de mídia", value: showTraffic ? formatMaybeNumber(mediaLeads) : "—", note: showTraffic ? "Meta Ads" : "módulo não contratado", icon: Users };
      case "media.roas": return { label: "ROAS", value: showTraffic ? formatMaybeRatio(roas) : "—", note: showTraffic ? roiSource : "módulo não contratado", icon: Gauge };
      case "media.cac": return { label: "CAC", value: showTraffic ? formatMaybeCurrency(cac) : "—", note: trackedRevenue > 0 ? "gasto ÷ conversões atribuídas" : "gasto ÷ vendas CRM", icon: Target };
      case "media.reach": return { label: "Alcance", value: showTraffic ? formatMaybeNumber(reach) : "—", note: "Meta Ads", icon: Users };
      case "media.clicks": return { label: "Cliques", value: showTraffic ? formatMaybeNumber(clicks) : "—", note: "Meta Ads", icon: Activity };
      case "media.net_return": return { label: "Retorno líquido", value: showTraffic ? formatMaybeCurrency(netReturn) : "—", note: roiSource, icon: CircleDollarSign };
      case "social.published": return { label: "Publicados", value: social?.published.toLocaleString("pt-BR") ?? "—", note: "Social Media", icon: Share2 };
      case "social.scheduled": return { label: "Agendados", value: social?.scheduled.toLocaleString("pt-BR") ?? "—", note: "Social Media", icon: CalendarDays };
      case "social.reach": return { label: "Alcance", value: social?.reach.toLocaleString("pt-BR") ?? "—", note: "social_post_metrics", icon: Users };
      case "social.interactions": return { label: "Interações", value: social?.interactions.toLocaleString("pt-BR") ?? "—", note: "likes + comentários + shares + saves", icon: Activity };
      case "social.engagement": return { label: "Engajamento", value: social?.engagementRate == null ? "—" : `${social.engagementRate.toFixed(2)}%`, note: "taxa média", icon: Gauge };
      case "social.failed": return { label: "Falhas", value: social?.failed.toLocaleString("pt-BR") ?? "—", note: "publicações com erro", icon: Target };
      case "workflow.tasks_total": return { label: "Tarefas workflow", value: work?.workflow.total.toLocaleString("pt-BR") ?? "—", note: "execução", icon: CheckCircle2 };
      case "workflow.tasks_completed": return { label: "Concluídas", value: work?.workflow.completed.toLocaleString("pt-BR") ?? "—", note: "tarefas workflow", icon: CheckCircle2 };
      case "workflow.meetings": return { label: "Reuniões", value: work?.calendar.meetings.toLocaleString("pt-BR") ?? "—", note: "agenda", icon: CalendarDays };
      case "workflow.meetings_pending": return { label: "Reuniões pendentes", value: work?.calendar.pending.toLocaleString("pt-BR") ?? "—", note: "agenda", icon: CalendarDays };
      case "workflow.overdue": return { label: "Atrasadas", value: String((work?.workflow.overdue ?? 0) + (work?.calendar.overdue ?? 0)), note: "workflow + agenda", icon: Target };
      case "workflow.tracked_time": return { label: "Tempo rastreado", value: formatDuration(work?.workflow.trackedSeconds ?? 0), note: "sessões concluídas", icon: Clock3 };
    }
  };

  const configuredKpi = (widgetId: string, fallback: DashboardV4KpiMetricId) => resolveKpi(getDashboardV4WidgetMetric(preferences, widgetId, fallback));

  const toggleMeta = (accountId: string, checked: boolean) => {
    const enabled = new Set(metaAccounts.filter((account) => account.dashboard_enabled).map((account) => account.account_id));
    if (checked) enabled.add(accountId); else enabled.delete(accountId);
    metaMutation.mutate([...enabled]);
  };

  return (
    <section className="space-y-5 pb-6">
      <Hero onManage={() => setManagerOpen(true)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi widgetId="kpi-revenue" hidden={hidden("kpi-revenue")} onSettings={edit} {...configuredKpi("kpi-revenue", "executive.revenue")} featured />
        <Kpi widgetId="kpi-media-spend" hidden={hidden("kpi-media-spend")} onSettings={edit} {...configuredKpi("kpi-media-spend", "media.spend")} />
        <Kpi widgetId="kpi-roas" hidden={hidden("kpi-roas")} onSettings={edit} {...configuredKpi("kpi-roas", "media.roas")} />
        <Kpi widgetId="kpi-leads" hidden={hidden("kpi-leads")} onSettings={edit} {...configuredKpi("kpi-leads", "executive.leads")} />
        <Kpi widgetId="kpi-sales" hidden={hidden("kpi-sales")} onSettings={edit} {...configuredKpi("kpi-sales", "executive.sales")} />
        <Kpi widgetId="kpi-conversion" hidden={hidden("kpi-conversion")} onSettings={edit} {...configuredKpi("kpi-conversion", "executive.conversion")} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel widgetId="executive-trend" hidden={hidden("executive-trend")} onSettings={edit} className="xl:col-span-8" eyebrow="Visão executiva" title="Receita e fechamento" subtitle="Evolução real dos leads e da receita dos negócios ganhos.">
          {trend.length ? <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(value) => String(value).slice(5)} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.12)" strokeWidth={2.5} /><Line type="monotone" dataKey="sales" stroke="hsl(var(--chart-3, 160 60% 45%))" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div> : <EmptyState title="Sem histórico comercial no período" text="Quando houver leads no filtro escolhido, a curva é preenchida automaticamente." />}
        </Panel>
        <Panel widgetId="commercial-health" hidden={hidden("commercial-health")} onSettings={edit} className="xl:col-span-4" eyebrow="Saúde comercial" title="Base que compõe o resultado" subtitle="Somente dados operacionais do CRM."><div className="space-y-2"><OperationalRow label="Em aberto" value={openLeads.length.toLocaleString("pt-BR")} note={formatCurrency(pipelineValue)} /><OperationalRow label="Ganhos" value={wonLeads.length.toLocaleString("pt-BR")} note={formatCurrency(revenue)} /><OperationalRow label="Perdidos" value={lostLeads.length.toLocaleString("pt-BR")} note="leads" /><OperationalRow label="Conversão" value={formatPercent(conversion)} note="ganhos ÷ base" /></div></Panel>
      </div>

      <SectionHeading icon={BriefcaseBusiness} eyebrow="Comercial" title="Da entrada ao fechamento" description="Etapas reais do funil, com drilldown por barra." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel widgetId="sales-funnel" hidden={hidden("sales-funnel")} onSettings={edit} className="xl:col-span-7" eyebrow="Funil de vendas" title="Volume por etapa" subtitle={preferences.funnelName ? `Funil selecionado: ${preferences.funnelName}` : "Todos os funis · clique em uma barra para ver os leads."}>{funnel.length ? <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnel} layout="vertical"><CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} /><Tooltip /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 10, 10, 0]} cursor="pointer" onClick={(row) => { const id = String((row as { id?: string }).id ?? ""); const stage = funnel.find((item) => item.id === id); if (stage) drilldownByIds(`Etapa · ${stage.name}`, stage.funnelName, leads.filter((lead) => lead.stage_id === id).map((lead) => lead.lead_id)); }} /></BarChart></ResponsiveContainer></div> : <EmptyState title="Sem etapas" text="Escolha outro funil ou crie etapas no CRM." />}</Panel>
        <Panel widgetId="seller-ranking" hidden={hidden("seller-ranking")} onSettings={edit} className="xl:col-span-5" eyebrow="Equipe" title="Ranking de vendedores" subtitle="Ocultável para operações individuais; só recebe dados quando existir responsável canônico."><EmptyState title="Responsável ainda não ligado" text="Não usamos owner de tabelas legadas nem nomes demonstrativos." /></Panel>
      </div>

      <SectionHeading icon={ShoppingBag} eyebrow="Oferta" title="Catálogo e vendas por produto" description="O catálogo e o ranking comercial usam relações reais do CRM." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel widgetId="product-catalog" hidden={hidden("product-catalog")} onSettings={edit} className="xl:col-span-8" eyebrow="Produtos & serviços" title="Catálogo ativo" subtitle="Preço, estoque, categoria e catálogo reais.">{!liveData ? <EmptyState title="Dados do catálogo indisponíveis" text="Aguarde o carregamento ou sincronize novamente." /> : products.length ? <div className="space-y-2">{products.map((product, index) => <div key={product.id} className="grid grid-cols-[32px_1fr_96px_70px] gap-3 rounded-xl border border-border/60 p-3"><Rank index={index} /><div className="min-w-0"><div className="truncate text-xs font-semibold">{product.name}</div><div className="text-[10px] text-muted-foreground">{product.catalogName} · {product.category}</div></div><StatCell label="Preço" value={formatCurrency(product.promoPrice ?? product.price)} /><StatCell label="Estoque" value={String(product.stock)} /></div>)}</div> : <EmptyState title="Nenhum produto" text="Cadastre produtos no CRM." />}</Panel>
        <Panel widgetId="product-sales" hidden={hidden("product-sales")} onSettings={edit} className="xl:col-span-4" eyebrow="Mix de receita" title="Vendas por produto" subtitle="Somente vínculos kind=comprou em negócios classificados como ganhos.">{!productSales ? <EmptyState title="Dados de vendas por produto indisponíveis" text="A leitura precisa ser concluída antes de calcular este ranking." /> : productSaleRows.length ? <div className="space-y-2">{productSaleRows.slice(0, 6).map((product, index) => <button key={product.productId} type="button" className="w-full rounded-xl border border-border/60 p-3 text-left hover:border-primary/30" onClick={() => drilldownByIds(`Produto · ${product.name}`, `${product.deals} negócios ganhos`, product.leadIds)}><div className="flex items-start gap-2"><Rank index={index} /><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{product.name}</div><div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-muted-foreground"><span>{formatQuantity(product.units)} unid.</span><span>{product.deals} vendas</span><span>{formatCurrency(product.revenue)}</span><span>ticket {product.ticket == null ? "—" : formatCurrency(product.ticket)}</span></div><div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, product.share * 100)}%` }} /></div></div></div></button>)}<div className="rounded-xl bg-muted/30 px-3 py-2 text-[9px] text-muted-foreground">Receita por produto: {formatCurrency(productSales?.totalRevenue ?? 0)} · cobertura de preço: {formatPercent(productSales?.revenueCoverage ?? 1)}.</div></div> : <EmptyState title={productSales?.schemaReady === false ? "Migration de snapshot ainda não aplicada" : "Sem vendas por produto no período"} text={productSales?.schemaReady === false ? "Os vínculos existentes continuam funcionando; aplique a migration de snapshot para receita histórica confiável." : "Registre o produto como comprado em um negócio ganho."} />}</Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel widgetId="companies" hidden={hidden("companies")} onSettings={edit} eyebrow="Empresas" title="Clientes com maior peso" subtitle="Receita e ganhos derivados dos leads vinculados."><TableHeader cols="grid-cols-[1.4fr_70px_100px_65px]" labels={["Empresa","Ganhos","Receita","Leads"]} />{!liveData ? <EmptyState title="Dados de empresas indisponíveis" text="Aguarde o carregamento ou sincronize novamente." /> : companies.length ? <div className="divide-y divide-border/60">{companies.map((company) => <button key={company.id} className="grid w-full grid-cols-[1.4fr_70px_100px_65px] gap-3 py-3 text-left text-xs" onClick={() => drilldownByIds(`Empresa · ${company.name}`, `${company.leadCount} leads`, company.leadIds)}><span className="truncate font-semibold">{company.name}</span><span>{company.wonDeals}</span><span className="font-mono font-semibold">{formatCurrency(company.revenue)}</span><span>{company.leadCount}</span></button>)}</div> : <EmptyState title="Sem empresas vinculadas" text="Associe leads a empresas." />}</Panel>
        <Panel widgetId="forms" hidden={hidden("forms")} onSettings={edit} eyebrow="Formulários" title="Quais formulários trazem vendas" subtitle={preferences.formIds === null ? "Todos os formulários" : `${forms.length} formulário(s) selecionado(s)`}><TableHeader cols="grid-cols-[1.3fr_64px_64px_64px_72px]" labels={["Formulário","Envios","Leads","Ganhos","Conv."]} />{!liveData || liveData.availability?.forms === false ? <EmptyState title="Dados de formulários indisponíveis" text="Os envios ainda não puderam ser consultados. Isso não significa zero envios." /> : forms.length ? <div className="divide-y divide-border/60">{forms.map((form) => <button key={form.id} className="grid w-full grid-cols-[1.3fr_64px_64px_64px_72px] gap-3 py-3 text-left text-xs" onClick={() => drilldownByIds(`Formulário · ${form.name}`, `${form.submissions} envios`, form.leadIds)}><span className="truncate font-semibold">{form.name}</span><span>{form.submissions}</span><span>{form.linkedLeads}</span><span>{form.wonLeads}</span><span>{formatMaybePercent(form.conversion)}</span></button>)}</div> : <EmptyState title="Sem formulários selecionados/com envios" text="Abra a engrenagem para selecionar os formulários exibidos." />}</Panel>
      </div>

      <SectionHeading icon={Tags} eyebrow="Inteligência CRM" title="Tags e campos personalizados" description="Distribuição e conversão calculadas sobre os leads reais." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel widgetId="tags" hidden={hidden("tags")} onSettings={edit} className="xl:col-span-7" eyebrow="Tags" title="Performance por marcador" subtitle="Volume, ganhos e conversão.">{!liveData ? <EmptyState title="Dados de tags indisponíveis" text="Aguarde o carregamento ou sincronize novamente." /> : tags.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tags.map((tag) => <button key={tag.name} className="rounded-xl border border-border/60 p-3 text-left" onClick={() => drilldownByIds(`Tag · ${tag.name}`, `${tag.leads} leads`, tag.leadIds)}><div className="flex justify-between text-xs font-semibold"><span><Hash className="mr-1 inline h-3 w-3 text-primary" />{tag.name}</span><span>{formatMaybePercent(tag.conversion)}</span></div><div className="mt-2 text-[10px] text-muted-foreground">{tag.leads} leads · {tag.won} ganhos</div></button>)}</div> : <EmptyState title="Sem tags" text="Adicione tags aos leads." />}</Panel>
        <Panel widgetId="custom-fields" hidden={hidden("custom-fields")} onSettings={edit} className="xl:col-span-5" eyebrow="Campos" title="Padrões da base" subtitle="Valor mais frequente e conversão do grupo.">{!liveData || liveData.availability?.customFields === false ? <EmptyState title="Campos personalizados indisponíveis" text="A fonte de campos precisa ser corrigida. Não foram calculados valores zerados." /> : customFields.length ? <div className="space-y-2">{customFields.map((field) => <button key={field.fieldId} className="w-full rounded-xl border border-border/60 p-3 text-left" onClick={() => drilldownByIds(`Campo · ${field.field}`, `${field.topValue}`, field.leadIds)}><div className="flex justify-between text-[10px] text-muted-foreground"><span>{field.field}</span><span>{formatMaybePercent(field.conversion)}</span></div><div className="mt-1 text-sm font-semibold">{field.topValue}</div><div className="text-[10px] text-muted-foreground">{field.occurrences} leads · {formatPercent(field.share)}</div></button>)}</div> : <EmptyState title="Sem campos preenchidos" text="Preencha campos personalizados nos leads." />}</Panel>
      </div>

      {showTracking && <><SectionHeading icon={Route} eyebrow="Tracking" title="Origem, comportamento e atribuição" description="Dados do pixel e RPC de Tracking do workspace." /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MiniKpi widgetId="tracking-events" hidden={hidden("tracking-events")} onSettings={edit} {...configuredKpi("tracking-events", "tracking.events")} /><MiniKpi widgetId="tracking-sessions" hidden={hidden("tracking-sessions")} onSettings={edit} {...configuredKpi("tracking-sessions", "tracking.sessions")} /><MiniKpi widgetId="tracking-conversions" hidden={hidden("tracking-conversions")} onSettings={edit} {...configuredKpi("tracking-conversions", "tracking.conversions")} /><MiniKpi widgetId="tracking-revenue" hidden={hidden("tracking-revenue")} onSettings={edit} {...configuredKpi("tracking-revenue", "tracking.revenue")} /></div></>}

      {showTraffic && <><SectionHeading icon={Megaphone} eyebrow="Aquisição" title="Tráfego pago e retorno conectado" description="Meta Ads usa somente contas habilitadas para a Dashboard. Cada card de mídia só aceita KPIs de mídia." /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MiniKpi widgetId="media-spend" hidden={hidden("media-spend")} onSettings={edit} {...configuredKpi("media-spend", "media.spend")} /><MiniKpi widgetId="media-leads" hidden={hidden("media-leads")} onSettings={edit} {...configuredKpi("media-leads", "media.leads")} /><MiniKpi widgetId="media-roas" hidden={hidden("media-roas")} onSettings={edit} {...configuredKpi("media-roas", "media.roas")} /><MiniKpi widgetId="media-cac" hidden={hidden("media-cac")} onSettings={edit} {...configuredKpi("media-cac", "media.cac")} /></div><div className="grid grid-cols-1 gap-3 xl:grid-cols-12"><Panel widgetId="acquisition-funnel" hidden={hidden("acquisition-funnel")} onSettings={edit} className="xl:col-span-8" eyebrow="Aquisição" title="Alcance → clique → lead → venda" subtitle="Fluxo real das KPIs disponíveis."><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:"Alcance",value:reach ?? 0},{name:"Cliques",value:clicks ?? 0},{name:"Leads Meta",value:mediaLeads ?? 0},{name:"Vendas CRM",value:wonLeads.length}]}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="value" fill="hsl(var(--primary))" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Panel><Panel widgetId="media-net-return" hidden={hidden("media-net-return")} onSettings={edit} className="xl:col-span-4" eyebrow="Retorno" title="Receita líquida após mídia" subtitle="Receita usada no ROAS menos investimento."><div className="mt-6 font-mono text-3xl font-semibold">{formatMaybeCurrency(netReturn)}</div><p className="mt-2 text-[11px] text-muted-foreground">Fonte: {roiSource}.</p></Panel></div></>}

      {showSocial && <><SectionHeading icon={Share2} eyebrow="Social Media" title="Conteúdo e performance real" description="Publicações e métricas vêm das fontes operacionais do Social Media." /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MiniKpi widgetId="social-published" hidden={hidden("social-published")} onSettings={edit} {...configuredKpi("social-published", "social.published")} /><MiniKpi widgetId="social-reach" hidden={hidden("social-reach")} onSettings={edit} {...configuredKpi("social-reach", "social.reach")} /><MiniKpi widgetId="social-interactions" hidden={hidden("social-interactions")} onSettings={edit} {...configuredKpi("social-interactions", "social.interactions")} /><MiniKpi widgetId="social-engagement" hidden={hidden("social-engagement")} onSettings={edit} {...configuredKpi("social-engagement", "social.engagement")} /></div><Panel widgetId="social-top-posts" hidden={hidden("social-top-posts")} onSettings={edit} eyebrow="Conteúdos" title="Top posts por alcance" subtitle="Ranking somente com métricas persistidas.">{social?.topPosts.length ? <><TableHeader cols="grid-cols-[1.5fr_100px_100px_90px]" labels={["Post","Alcance","Interações","Canal"]} /><div className="divide-y divide-border/60">{social.topPosts.map((post) => <div key={post.id} className="grid grid-cols-[1.5fr_100px_100px_90px] gap-3 py-3 text-xs"><span className="truncate font-semibold">{post.title}</span><span>{post.reach.toLocaleString("pt-BR")}</span><span>{post.interactions.toLocaleString("pt-BR")}</span><span className="truncate text-muted-foreground">{post.channel}</span></div>)}</div></> : <EmptyState title="Sem métricas de conteúdo" text="Quando houver métricas, o ranking aparece automaticamente." />}</Panel></>}

      {showWorkflow && <><SectionHeading icon={Workflow} eyebrow="Execução" title="Workflow e agenda" description="Tarefas, reuniões, produtividade e tempo rastreado a partir das fontes operacionais." /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MiniKpi widgetId="workflow-tasks" hidden={hidden("workflow-tasks")} onSettings={edit} {...configuredKpi("workflow-tasks", "workflow.tasks_total")} /><MiniKpi widgetId="workflow-meetings" hidden={hidden("workflow-meetings")} onSettings={edit} {...configuredKpi("workflow-meetings", "workflow.meetings")} /><MiniKpi widgetId="workflow-overdue" hidden={hidden("workflow-overdue")} onSettings={edit} {...configuredKpi("workflow-overdue", "workflow.overdue")} /><MiniKpi widgetId="workflow-time" hidden={hidden("workflow-time")} onSettings={edit} {...configuredKpi("workflow-time", "workflow.tracked_time")} /></div><div className="grid grid-cols-1 gap-3 xl:grid-cols-2"><Panel widgetId="calendar-next" hidden={hidden("calendar-next")} onSettings={edit} eyebrow="Agenda" title="Próximos compromissos" subtitle="Eventos pendentes futuros do calendário.">{work?.calendar.next.length ? <div className="space-y-2">{work.calendar.next.map((item) => <div key={item.id} className="grid grid-cols-[90px_1fr_auto] gap-3 rounded-xl border border-border/60 p-3 text-xs"><span className="font-mono">{formatDateTime(item.start)}</span><span className="truncate font-semibold">{item.title}</span><span className="text-[10px] text-muted-foreground">{item.kind}</span></div>)}</div> : <EmptyState title="Sem compromissos futuros" text="A agenda está vazia para o período." />}</Panel><Panel widgetId="workflow-productivity" hidden={hidden("workflow-productivity")} onSettings={edit} eyebrow="Produtividade" title="Execução por membro" subtitle="Tarefas concluídas, incompletas e tempo registrado.">{work?.workflow.byUser.length ? <div className="space-y-2">{work.workflow.byUser.map((user, index) => <div key={user.userId} className="grid grid-cols-[30px_1fr_auto] gap-3 rounded-xl border border-border/60 p-3"><Rank index={index}/><div><div className="text-xs font-semibold">{user.name}</div><div className="text-[10px] text-muted-foreground">{user.done}/{user.total} concluídas · {user.incomplete} incompletas</div></div><span className="font-mono text-xs">{formatDuration(user.trackedSeconds)}</span></div>)}</div> : <EmptyState title="Sem execução por membro" text="A produtividade aparece quando houver tarefas atribuídas ou sessões de tempo." />}</Panel></div></>}

      {editingWidgetId && <WidgetEditor widgetId={editingWidgetId} preferences={preferences} setPreferences={setPreferences} funnelNames={funnelNames} forms={allForms.map((form) => ({ id: form.id, name: form.name }))} showTraffic={showTraffic} metaAccounts={metaAccounts} metaSaving={metaMutation.isPending} onToggleMeta={toggleMeta} onClose={() => setEditingWidgetId(null)} />}
      {managerOpen && <WidgetManager preferences={preferences} setPreferences={setPreferences} onEdit={(id) => { setManagerOpen(false); setEditingWidgetId(id); }} onClose={() => setManagerOpen(false)} />}
    </section>
  );
}

function SettingsButton({ widgetId, onSettings }: { widgetId: string; onSettings: (id: string) => void }) {
  return <button type="button" aria-label="Configurar gadget" title="Configurar gadget" className="print:hidden absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-background/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition hover:text-primary focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSettings(widgetId); }}><Settings2 className="h-3.5 w-3.5" /></button>;
}

function WidgetEditor({ widgetId, preferences, setPreferences, funnelNames, forms, showTraffic, metaAccounts, metaSaving, onToggleMeta, onClose }: WidgetEditorProps) {
  const label = DASHBOARD_V4_WIDGETS.find(([id]) => id === widgetId)?.[1] ?? widgetId;
  const isFunnel = widgetId === "sales-funnel";
  const isForms = widgetId === "forms";
  const isMedia = widgetId.includes("media") || widgetId === "acquisition-funnel" || widgetId === "kpi-roas";
  const selectedForms = preferences.formIds;
  const kpiOptions = getDashboardV4KpiOptions(widgetId);
  const selectedMetric = preferences.kpiMetricByWidget[widgetId] ?? "";
  return <Modal title={`Configurar · ${label}`} onClose={onClose}>
    <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3 text-sm"><span><strong>Exibir gadget</strong><span className="mt-0.5 block text-[11px] text-muted-foreground">Você pode restaurá-lo em “Ajustar widgets”.</span></span><input type="checkbox" checked={!isWidgetHidden(preferences, widgetId)} onChange={(event) => setPreferences(setWidgetHidden(preferences, widgetId, !event.target.checked))} /></label>
    {kpiOptions.length > 0 && <div className="mt-4"><label className="text-xs font-semibold">KPI exibido neste card</label><p className="mt-1 text-[11px] text-muted-foreground">Só aparecem indicadores coerentes com este bloco. KPIs de outros módulos não podem ser selecionados aqui.</p><select className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={selectedMetric} onChange={(event) => { const next = event.target.value as DashboardV4KpiMetricId | ""; setPreferences(next ? setDashboardV4WidgetMetric(preferences, widgetId, next) : clearDashboardV4WidgetMetric(preferences, widgetId)); }}><option value="">Padrão do bloco</option>{kpiOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>}
    {isFunnel && <div className="mt-4"><label className="text-xs font-semibold">Funil exibido</label><select className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={preferences.funnelName ?? ""} onChange={(event) => setPreferences({ ...preferences, funnelName: event.target.value || null })}><option value="">Todos os funis</option>{funnelNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>}
    {isForms && <div className="mt-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Formulários exibidos</span><button type="button" className="text-[11px] text-primary" onClick={() => setPreferences({ ...preferences, formIds: selectedForms === null ? [] : null })}>{selectedForms === null ? "Selecionar manualmente" : "Mostrar todos"}</button></div><div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-xl border border-border/70 p-2">{forms.length ? forms.map((form) => { const checked = selectedForms === null || selectedForms.includes(form.id); return <label key={form.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-muted/40"><input type="checkbox" checked={checked} onChange={(event) => { const base = new Set(selectedForms === null ? forms.map((item) => item.id) : selectedForms); if (event.target.checked) base.add(form.id); else base.delete(form.id); setPreferences({ ...preferences, formIds: [...base] }); }} /><span>{form.name}</span></label>; }) : <p className="p-2 text-xs text-muted-foreground">Nenhum formulário disponível.</p>}</div></div>}
    {isMedia && <div className="mt-4"><div className="text-xs font-semibold">Contas de mídia</div><p className="mt-1 text-[11px] text-muted-foreground">Meta permite múltipla seleção e grava na configuração canônica da Dashboard.</p><div className="mt-2 space-y-1 rounded-xl border border-border/70 p-2">{showTraffic && metaAccounts.length ? metaAccounts.map((account) => <label key={account.account_id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs hover:bg-muted/40"><span className="min-w-0"><span className="block truncate font-medium">{account.name || account.account_id}</span><span className="text-[10px] text-muted-foreground">Meta · {account.currency || "moeda não informada"}</span></span><input type="checkbox" disabled={metaSaving} checked={account.dashboard_enabled} onChange={(event) => onToggleMeta(account.account_id, event.target.checked)} /></label>) : <p className="p-2 text-xs text-muted-foreground">Nenhuma conta Meta disponível para seleção.</p>}<div className="mt-2 rounded-lg bg-muted/30 p-2 text-[11px] text-muted-foreground">Outros providers só entram quando a fonte canônica da Dashboard estiver disponível; nenhuma métrica é simulada.</div></div></div>}
  </Modal>;
}

function WidgetManager({ preferences, setPreferences, onEdit, onClose }: { preferences: DashboardV4WidgetPreferences; setPreferences: (next: DashboardV4WidgetPreferences) => void; onEdit: (id: string) => void; onClose: () => void }) {
  return <Modal title="Ajustar widgets" onClose={onClose}><p className="mb-3 text-xs text-muted-foreground">Exiba, oculte ou abra a configuração específica de qualquer gadget.</p><div className="max-h-[60vh] space-y-1 overflow-auto">{DASHBOARD_V4_WIDGETS.map(([id, label]) => { const visible = !isWidgetHidden(preferences, id); return <div key={id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2"><button type="button" className="flex flex-1 items-center gap-2 text-left text-xs" onClick={() => setPreferences(setWidgetHidden(preferences, id, visible))}>{visible ? <Eye className="h-3.5 w-3.5 text-primary"/> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground"/>}<span className={visible ? "font-medium" : "text-muted-foreground"}>{label}</span></button><button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-primary" onClick={() => onEdit(id)}><Settings2 className="h-3.5 w-3.5"/></button></div>; })}</div></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-[24px] border border-border bg-background p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{title}</h3><button type="button" aria-label="Fechar" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={onClose}><X className="h-4 w-4" /></button></div>{children}</div></div>;
}

function Hero({ onManage }: { onManage: () => void }) { return <div className="relative overflow-hidden rounded-[30px] border border-border/70 bg-card px-5 py-5 shadow-sm sm:px-7 sm:py-6"><div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"/><div className="relative flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">A operação inteira, da origem do lead até a execução.</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">Passe o mouse sobre qualquer gadget para configurá-lo. Cada KPI fica limitado ao contexto do bloco.</p></div><button type="button" className="print:hidden flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold hover:border-primary/30" onClick={onManage}><Settings2 className="h-4 w-4"/>Ajustar widgets</button></div></div>; }

function Kpi({ widgetId, hidden, onSettings, label, value, note, icon:Icon, featured, onClick }: { widgetId:string; hidden:boolean; onSettings:(id:string)=>void; label:string; value:string; note:string; icon:typeof Activity; featured?:boolean; onClick?:()=>void }) { if (hidden) return null; return <div className="group relative"><SettingsButton widgetId={widgetId} onSettings={onSettings}/>{onClick ? <button type="button" onClick={onClick} className={cn("h-full w-full rounded-2xl border p-4 text-left shadow-sm hover:border-primary/30",featured?"border-primary/25 bg-primary/[0.055]":"border-border/70 bg-card")}><KpiInner label={label} value={value} note={note} Icon={Icon}/></button> : <div className={cn("h-full rounded-2xl border p-4 text-left shadow-sm",featured?"border-primary/25 bg-primary/[0.055]":"border-border/70 bg-card")}><KpiInner label={label} value={value} note={note} Icon={Icon}/></div>}</div>; }
function KpiInner({label,value,note,Icon}:{label:string;value:string;note:string;Icon:typeof Activity}) { return <><div className="flex justify-between pr-7"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-3 font-mono text-xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></>; }
function SectionHeading({icon:Icon,eyebrow,title,description}:{icon:typeof Activity;eyebrow:string;title:string;description:string}) { return <div className="flex gap-3 border-t border-border/60 pt-5"><div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4"/></div><div><div className="text-[10px] font-bold uppercase tracking-widest text-primary">{eyebrow}</div><h3 className="text-xl font-semibold">{title}</h3><p className="mt-1 text-[11px] text-muted-foreground">{description}</p></div></div>; }
function Panel({children,className="",eyebrow,title,subtitle,widgetId,hidden,onSettings}:{children:ReactNode;className?:string;eyebrow:string;title:string;subtitle:string;widgetId:string;hidden:boolean;onSettings:(id:string)=>void}) { if (hidden) return null; return <div className={cn("group relative rounded-[24px] border border-border/70 bg-card p-4 shadow-sm sm:p-5",className)}><SettingsButton widgetId={widgetId} onSettings={onSettings}/><div className="mb-4 pr-8"><div className="text-[10px] font-bold uppercase tracking-widest text-primary">{eyebrow}</div><h4 className="mt-1 text-base font-semibold">{title}</h4><p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p></div>{children}</div>; }
function MiniKpi({widgetId,hidden,onSettings,icon:Icon,label,value,note}:{widgetId:string;hidden:boolean;onSettings:(id:string)=>void;icon:typeof Activity;label:string;value:string;note:string}) { if (hidden) return null; return <div className="group relative rounded-2xl border border-border/70 bg-card p-4 shadow-sm"><SettingsButton widgetId={widgetId} onSettings={onSettings}/><div className="flex justify-between pr-7"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-3 font-mono text-xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></div>; }
function OperationalRow({label,value,note}:{label:string;value:string;note:string}) { return <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5"><span className="text-xs font-semibold">{label}</span><div className="text-right"><div className="font-mono text-xs font-bold">{value}</div><div className="text-[9px] text-muted-foreground">{note}</div></div></div>; }
function Rank({index}:{index:number}) { return <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index+1}</div>; }
function StatCell({label,value}:{label:string;value:string}) { return <div><div className="text-[9px] uppercase text-muted-foreground">{label}</div><div className="font-mono text-[11px] font-semibold">{value}</div></div>; }
function TableHeader({cols,labels}:{cols:string;labels:string[]}) { return <div className={cn("grid gap-3 border-b border-border/60 pb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground",cols)}>{labels.map((label)=><span key={label}>{label}</span>)}</div>; }
function EmptyState({title,text}:{title:string;text:string}) { return <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-5 text-center"><Package className="mx-auto h-5 w-5 text-muted-foreground"/><div className="mt-2 text-xs font-semibold">{title}</div><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{text}</p></div>; }
function formatCurrency(value:number) { return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(value); }
function formatMaybeCurrency(value:number|null) { return value==null?"—":formatCurrency(value); }
function formatMaybeNumber(value:number|null) { return value==null?"—":Math.round(value).toLocaleString("pt-BR"); }
function formatPercent(value:number) { return `${(value*100).toFixed(1).replace(".",",")}%`; }
function formatMaybePercent(value:number|null) { return value==null?"—":formatPercent(value); }
function formatMaybeRatio(value:number|null) { return value==null?"—":`${value.toFixed(2)}x`; }
function formatQuantity(value:number) { return Number.isInteger(value) ? value.toLocaleString("pt-BR") : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function formatDuration(seconds:number) { if (!seconds) return "0h"; const hours=Math.floor(seconds/3600); const minutes=Math.floor((seconds%3600)/60); return hours?`${hours}h ${minutes}m`:`${minutes}m`; }
function formatDateTime(value:string) { const date=new Date(value); return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date):"—"; }
