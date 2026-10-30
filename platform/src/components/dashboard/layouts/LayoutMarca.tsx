import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, ArrowUpRight, BookOpen, ChevronRight, Package, Target, Users, Wallet } from "lucide-react";
import type { DashboardMetricsResponse, FunnelStage, KpiCardData } from "@/lib/mock-dashboard";
import { formatDelta, formatKpiValue } from "@/lib/mock-dashboard";
import { useCriticalStage, resolveCriticalStage } from "@/lib/critical-stage";
import { cn } from "@/lib/utils";

const CENTRAL_ICONS = {
 controller: Activity,
 reading: BookOpen,
 alert: AlertTriangle,
 catalog: Package,
};

const KPI_ICONS: Record<string, typeof Users> = {
 leads_recebidos: Users,
 em_atendimento: Activity,
 sem_tarefa_futura: AlertTriangle,
 leads_urgentes: AlertTriangle,
 vendas_ganhas: Wallet,
 vendas_perdidas: Target,
 taxa_conversao: Target,
 valor_pipeline: Wallet,
};

export function LayoutMarca({
 metrics,
 onKpiClick,
 onStageClick,
}: {
 metrics: DashboardMetricsResponse;
 onKpiClick: (kpi: Pick<KpiCardData, "kpi_key" | "label" | "source_label">) => void;
 onStageClick: (s: FunnelStage) => void;
}) {
 const mainKpi = metrics.kpis[0];
 const secondaryKpis = metrics.kpis.slice(1, 5);
 const lowerKpis = metrics.kpis.slice(5);
 const maxFunnel = Math.max(...metrics.funnel.map((s) => s.count), 1);
 const { selection } = useCriticalStage();
 const critical = resolveCriticalStage(metrics.funnel, selection);
 const criticalStages = critical.aggregatedStages.length > 0 ? critical.aggregatedStages : metrics.funnel.slice(0, 5);

 return (
 <div className="space-y-4">
 <section className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-3">
 <button
 type="button"
 onClick={() => mainKpi && onKpiClick(mainKpi)}
 className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 text-left shadow-sm hover:border-primary/45 transition-colors"
 >
 <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
 <div className="flex flex-wrap items-start justify-between gap-5 pl-2">
 <div className="min-w-0">
 <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
 Painel comercial Vanessa Simoni
 </div>
 <h2 className="mt-2 text-sm font-medium text-muted-foreground">
 {mainKpi?.label?? "Indicador principal"}
 </h2>
 <div className="mt-1 font-mono text-6xl font-semibold leading-none tabular-nums text-foreground">
 {mainKpi? formatKpiValue(mainKpi.value, mainKpi.unit): " - "}
 </div>
 <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
 {mainKpi?.description} · {metrics.source_label} · {metrics.period_label}
 </p>
 </div>

          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            Detalhamento
 <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
 </div>
 </div>

 <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-2 pl-2">
 {metrics.central.slice(0, 3).map((item) => {
 const Icon = CENTRAL_ICONS[item.icon];
 return (
 <div key={item.id} className="rounded-md border border-border bg-background px-3 py-2.5">
 <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
 <Icon className="h-3.5 w-3.5 text-primary" />
 {item.title}
 </div>
 <div className="mt-1 text-xs text-foreground/80 line-clamp-1">{item.caption}</div>
 </div>
 );
 })}
 </div>
 </button>

 <section className="rounded-lg border border-border bg-card p-5">
 <div className="flex items-start justify-between gap-3">
 <div>
 <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
 Etapa crítica
 </div>
 <h2 className="mt-1 text-base font-semibold text-foreground">
 {critical.title}
 </h2>
 <p className="mt-1 text-xs text-muted-foreground">
 {critical.isConfigured ? critical.subtitle : "Defina em 'Editar dashboard' qual funil ou etapa monitorar"}
 </p>
 </div>
 <div className="font-mono text-4xl font-semibold tabular-nums text-foreground">
 {critical.count}
 </div>
 </div>

 <div className="mt-5 space-y-2.5">
 {criticalStages.slice(0, 5).map((stage) => {
 const width = (stage.count / maxFunnel) * 100;
 return (
 <button
 key={stage.stage_id}
 type="button"
 onClick={() => onStageClick(stage)}
 className="w-full text-left group"
 >
 <div className="mb-1 flex items-center justify-between gap-2 text-xs">
 <span className="truncate font-medium text-foreground">{stage.stage_name}</span>
 <span className="font-mono tabular-nums text-muted-foreground">{stage.count}</span>
 </div>
 <div className="h-2 rounded-full bg-muted overflow-hidden">
 <div className="h-full rounded-full bg-primary group-hover:bg-primary/85" style={{ width: `${Math.max(width, 4)}%` }} />
 </div>
 </button>
 );
 })}
 </div>
 </section>
 </section>

 <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
 {secondaryKpis.map((kpi) => (
 <MetricTile key={kpi.kpi_key} kpi={kpi} onClick={() => onKpiClick(kpi)} />
 ))}
 </section>

 <section className="grid grid-cols-1 xl:grid-cols-[1.55fr_0.85fr] gap-3">
 <div className="rounded-lg border border-border bg-card p-5">
 <div className="mb-4 flex items-start justify-between gap-3">
 <div>
 <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
 Evolução da operação
 </div>
 <h2 className="mt-1 text-base font-semibold text-foreground">
 Leads, ganhos e perdas no período
 </h2>
 </div>
 </div>
 <div className="h-72">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={metrics.evolution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
 <XAxis dataKey="day" tickFormatter={(d) => d.slice(5).replace("-", "/")} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
 <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} />
 <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
 <Bar dataKey="leads" fill="var(--primary)" radius={[4, 4, 0, 0]} />
 <Bar dataKey="perdidas" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 <div className="rounded-lg border border-border bg-card overflow-hidden">
 <div className="border-b border-border px-4 py-3">
 <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Fila executiva</div>
 <h2 className="mt-1 text-base font-semibold text-foreground">Ações da operação</h2>
 </div>
 <div className="divide-y divide-border">
 {metrics.central.map((item) => {
 const Icon = CENTRAL_ICONS[item.icon];
 return (
 <button key={item.id} className="w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center justify-between gap-2">
 <span className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">{item.title}</span>
 <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
 </div>
 <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.caption}</p>
 </div>
 </div>
 </button>
 );
 })}
 </div>
 </div>
 </section>

 {lowerKpis.length > 0 && (
 <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 {lowerKpis.map((kpi) => (
 <MetricTile key={kpi.kpi_key} kpi={kpi} onClick={() => onKpiClick(kpi)} compact />
 ))}
 </section>
 )}
 </div>
 );
}

function MetricTile({ kpi, onClick, compact = false }: { kpi: KpiCardData; onClick: () => void; compact?: boolean }) {
 const Icon = KPI_ICONS[kpi.kpi_key]?? Activity;
 const delta = formatDelta(kpi.delta_pct);
 const positive = (kpi.delta_pct?? 0) > 0;

 return (
 <button
 type="button"
 onClick={onClick}
 className={cn(
 "group rounded-lg border border-border bg-card text-left hover:border-primary/45 transition-colors",
 compact? "p-3": "p-4",
 )}
 >
 <div className="flex items-start justify-between gap-3">
 <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
 <Icon className="h-4.5 w-4.5" />
 </div>
 <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary" />
 </div>
 <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground line-clamp-1">
 {kpi.label}
 </div>
 <div className={cn("mt-1 font-mono font-semibold tabular-nums text-foreground", compact? "text-2xl": "text-3xl")}>
 {formatKpiValue(kpi.value, kpi.unit)}
 </div>
 <div className="mt-1 flex items-center justify-between gap-2 text-xs">
 <span className="truncate text-muted-foreground">{kpi.source_label}</span>
 {delta && <span className={cn("font-semibold", positive? "text-success": "text-danger")}>{delta}</span>}
 </div>
 </button>
 );
}