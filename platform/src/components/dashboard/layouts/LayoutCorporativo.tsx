import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BookOpen, AlertTriangle, Package, ChevronRight } from "lucide-react";
import type { DashboardMetricsResponse, FunnelStage, KpiCardData } from "@/lib/mock-dashboard";
import { formatKpiValue, formatDelta } from "@/lib/mock-dashboard";
import { cn } from "@/lib/utils";

const CENTRAL_ICONS = {
 controller: Activity,
 reading: BookOpen,
 alert: AlertTriangle,
 catalog: Package,
};

const TONE_BG: Record<string, string> = {
 success: "bg-success",
 info: "bg-info",
 warn: "bg-warning",
 danger: "bg-danger",
 neutral: "bg-muted-foreground/60",
};

/**
 * Layout Corporativo - densidade Power BI.
 * Rail esquerdo com central de comandos vertical, centro com KPI tiles 2x4 e
 * gráficos combinados, rail direito com funil em barras horizontais e tabela.
 */
export function LayoutCorporativo({
 metrics,
 onKpiClick,
 onStageClick,
}: {
 metrics: DashboardMetricsResponse;
 onKpiClick: (kpi: Pick<KpiCardData, "kpi_key" | "label" | "source_label">) => void;
 onStageClick: (s: FunnelStage) => void;
}) {
 const funnelChart = metrics.funnel.map((s) => ({
 name: s.stage_name,
 count: s.count,
 stage: s,
 }));

 return (
 <div className="grid grid-cols-12 gap-3">
 {/* RAIL ESQUERDO - Central de Comandos vertical */}
 <aside className="col-span-12 lg:col-span-3 space-y-3">
 <div className="bg-card border border-border rounded-lg p-3">
 <div className="text-[10px] font-bold tracking-widest text-primary uppercase mb-2">
 Central de Comandos
 </div>
 <div className="space-y-2">
 {metrics.central.map((item) => {
 const Icon = CENTRAL_ICONS[item.icon];
 return (
 <button
 key={item.id}
 className="w-full text-left p-2.5 rounded border border-border hover:border-primary/40 hover:bg-muted/40 transition-all"
 >
 <div className="flex items-center gap-2 mb-1">
 <div className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <Icon className="w-3 h-3" />
 </div>
 <div className="text-[10px] font-bold tracking-wider uppercase text-foreground flex-1 min-w-0 truncate">
 {item.title}
 </div>
 <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", TONE_BG[item.badge_tone])} />
 </div>
 <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
 {item.caption}
 </p>
 </button>
 );
 })}
 </div>
 </div>

 {/* Bloco status sincronização */}
 <div className="bg-card border border-border rounded-lg p-3 space-y-1.5">
 <div className="text-[10px] font-bold tracking-widest text-primary uppercase">
 Status da leitura
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">Fonte</span>
 <span className="font-semibold text-foreground">{metrics.source_label}</span>
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">Período</span>
 <span className="font-semibold text-foreground">{metrics.period_label}</span>
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">Funil</span>
 <span className="font-semibold text-foreground truncate ml-2">{metrics.funnel_label}</span>
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">Leads</span>
 <span className="font-mono font-bold text-foreground tabular-nums">{metrics.leads_loaded}</span>
 </div>
 </div>
 </aside>

 {/* CENTRO - KPI tiles 2x4 + Evolution */}
 <section className="col-span-12 lg:col-span-6 space-y-3">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {metrics.kpis.map((kpi) => {
 const isNoData = kpi.status === "no_data";
 const delta = formatDelta(kpi.delta_pct);
 const positive = (kpi.delta_pct?? 0) > 0;
 return (
 <button
 key={kpi.kpi_key}
 onClick={() => onKpiClick(kpi)}
 className="text-left bg-card border border-border rounded-md p-2.5 hover:border-primary/40 transition-all"
 >
 <div className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground truncate">
 {kpi.label}
 </div>
 <div className="flex items-baseline justify-between gap-1 mt-1">
 <span
 className={cn(
 "text-xl font-bold tabular-nums",
 isNoData? "text-muted-foreground/50": "text-foreground"
 )}
 >
 {formatKpiValue(kpi.value, kpi.unit)}
 </span>
 {delta && (
 <span
 className={cn(
 "text-[10px] font-semibold",
 positive? "text-success": "text-danger"
 )}
 >
 {delta}
 </span>
 )}
 </div>
 </button>
 );
 })}
 </div>

 <div className="bg-card border border-border rounded-lg p-4">
 <div className="flex items-center justify-between mb-3">
 <div>
 <div className="text-[10px] font-bold tracking-widest text-primary uppercase">
 Evolução combinada
 </div>
 <h2 className="text-sm font-semibold text-foreground mt-0.5">
 Leads × perdas no período
 </h2>
 </div>
 </div>
 <div className="h-60">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={metrics.evolution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="corpLeads" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
 <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
 <XAxis
 dataKey="day"
 tickFormatter={(d) => d.slice(5).replace("-", "/")}
 tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
 tickLine={false}
 axisLine={{ stroke: "var(--border)" }}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
 tickLine={false}
 axisLine={false}
 width={28}
 />
 <Tooltip
 contentStyle={{
 background: "var(--card)",
 border: "1px solid var(--border)",
 borderRadius: 8,
 fontSize: 12,
 }}
 />
 <Area type="monotone" dataKey="leads" stroke="var(--primary)" strokeWidth={2} fill="url(#corpLeads)" />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </div>
 </section>

 {/* RAIL DIREITO - Funil em barras + tabela compacta */}
 <aside className="col-span-12 lg:col-span-3 space-y-3">
 <div className="bg-card border border-border rounded-lg p-3">
 <div className="text-[10px] font-bold tracking-widest text-primary uppercase mb-2">
 Funil por volume
 </div>
 <div className="h-48 -mx-2">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={funnelChart} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
 <XAxis type="number" hide />
 <YAxis
 type="category"
 dataKey="name"
 tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
 tickLine={false}
 axisLine={false}
 width={110}
 />
 <Tooltip
 contentStyle={{
 background: "var(--card)",
 border: "1px solid var(--border)",
 borderRadius: 8,
 fontSize: 11,
 }}
 />
 <Bar dataKey="count" fill="var(--primary)" radius={[0, 3, 3, 0]} barSize={10} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 <div className="bg-card border border-border rounded-lg overflow-hidden">
 <div className="px-3 py-2 border-b border-border">
 <div className="text-[10px] font-bold tracking-widest text-primary uppercase">
 Etapas detalhadas
 </div>
 </div>
 <div className="divide-y divide-border">
 {metrics.funnel.map((s) => (
 <button
 key={s.stage_id}
 onClick={() => onStageClick(s)}
 className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
 >
 <div className="flex-1 min-w-0">
 <div className="text-[11px] font-semibold text-foreground truncate">
 {s.stage_name}
 </div>
 <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
 {s.funnel_name}
 </div>
 </div>
 <div className="text-sm font-bold font-mono tabular-nums text-foreground shrink-0">
 {s.count}
 </div>
 <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
 </button>
 ))}
 </div>
 </div>
 </aside>
 </div>
 );
}
