import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import { ChevronRight, Activity, BookOpen, AlertTriangle, Package } from "lucide-react";
import type { DashboardMetricsResponse, FunnelStage, KpiCardData } from "@/lib/mock-dashboard";
import { formatKpiValue, formatDelta } from "@/lib/mock-dashboard";
import { cn } from "@/lib/utils";

const CENTRAL_ICONS = {
 controller: Activity,
 reading: BookOpen,
 alert: AlertTriangle,
 catalog: Package,
};

/**
 * Layout Tático - terminal financeiro estilo Bloomberg.
 * Ticker tape horizontal de KPIs no topo, gráfico principal grande à esquerda,
 * funil vertical denso à direita, central de comandos como linhas compactas.
 */
export function LayoutTatico({
 metrics,
 onKpiClick,
 onStageClick,
}: {
 metrics: DashboardMetricsResponse;
 onKpiClick: (kpi: Pick<KpiCardData, "kpi_key" | "label" | "source_label">) => void;
 onStageClick: (s: FunnelStage) => void;
}) {
 const maxFunnel = Math.max(...metrics.funnel.map((s) => s.count), 1);

 return (
 <div className="space-y-4">
 {/* TICKER TAPE - 8 KPIs em linha horizontal compacta */}
 <div className="border border-border rounded-md bg-card overflow-hidden">
 <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/40">
 <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
 <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-muted-foreground">
 LIVE · {metrics.source_label} · {metrics.period_label}
 </span>
 </div>
 <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 divide-x divide-border">
 {metrics.kpis.map((kpi) => {
 const isNoData = kpi.status === "no_data";
 const delta = formatDelta(kpi.delta_pct);
 const positive = (kpi.delta_pct?? 0) > 0;
 return (
 <button
 key={kpi.kpi_key}
 onClick={() => onKpiClick(kpi)}
 className="text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
 >
 <div className="text-[9px] font-mono font-bold tracking-widest uppercase text-muted-foreground truncate">
 {kpi.label}
 </div>
 <div className="flex items-baseline gap-1.5 mt-0.5">
 <span
 className={cn(
 "text-lg font-mono font-bold tabular-nums",
 isNoData? "text-muted-foreground/50": "text-foreground"
 )}
 >
 {formatKpiValue(kpi.value, kpi.unit)}
 </span>
 {delta && (
 <span
 className={cn(
 "text-[10px] font-mono font-bold",
 positive? "text-success": "text-danger"
 )}
 >
 {positive? "▲": "▼"}
 {delta.replace("+", "").replace("-", "")}
 </span>
 )}
 </div>
 {kpi.sparkline && (
 <div className="h-6 -mx-1 mt-1">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={kpi.sparkline.map((v) => ({ v }))}>
 <Line
 type="monotone"
 dataKey="v"
 stroke="var(--primary)"
 strokeWidth={1}
 dot={false}
 isAnimationActive={false}
 />
 </LineChart>
 </ResponsiveContainer>
 </div>
 )}
 </button>
 );
 })}
 </div>
 </div>

 {/* GRID PRINCIPAL - esquerda: chart + central; direita: funil vertical */}
 <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
 <div className="space-y-4 min-w-0">
 {/* CHART GRANDE */}
 <section className="bg-card border border-border rounded-md overflow-hidden">
 <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
 <div className="flex items-center gap-3">
 <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-primary">
 EVOLUÇÃO · {metrics.leads_loaded} LEADS
 </span>
 <span className="text-[10px] font-mono text-muted-foreground">
 {metrics.period_label.toUpperCase()}
 </span>
 </div>
 <span className="text-[10px] font-mono text-muted-foreground">
 READ {metrics.read_at.slice(11, 16)}
 </span>
 </div>
 <div className="h-72 p-3">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={metrics.evolution} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="taticoLeads" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
 <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
 </linearGradient>
 </defs>
 <XAxis
 dataKey="day"
 tickFormatter={(d) => d.slice(5).replace("-", "/")}
 tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "monospace" }}
 tickLine={false}
 axisLine={{ stroke: "var(--border)" }}
 />
 <YAxis
 tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "monospace" }}
 tickLine={false}
 axisLine={false}
 width={28}
 />
 <Tooltip
 contentStyle={{
 background: "var(--card)",
 border: "1px solid var(--border)",
 borderRadius: 4,
 fontSize: 11,
 fontFamily: "monospace",
 }}
 />
 <Area
 type="step"
 dataKey="leads"
 stroke="var(--primary)"
 strokeWidth={1.5}
 fill="url(#taticoLeads)"
 />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </section>

 {/* CENTRAL DE COMANDOS - linhas compactas */}
 <section className="bg-card border border-border rounded-md overflow-hidden">
 <div className="px-4 py-2 border-b border-border bg-muted/30">
 <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-primary">
 CENTRAL DE COMANDOS
 </span>
 </div>
 <div className="divide-y divide-border">
 {metrics.central.map((item) => {
 const Icon = CENTRAL_ICONS[item.icon];
 return (
 <button
 key={item.id}
 className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
 >
 <Icon className="w-4 h-4 text-primary shrink-0" />
 <div className="flex-1 min-w-0 grid grid-cols-[200px_1fr] gap-3 items-center">
 <span className="text-xs font-mono font-bold uppercase tracking-wide text-foreground truncate">
 {item.title}
 </span>
 <span className="text-xs text-muted-foreground truncate">
 {item.caption}
 </span>
 </div>
 <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">
 {item.badge_text}
 </span>
 <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
 </button>
 );
 })}
 </div>
 </section>
 </div>

 {/* FUNIL VERTICAL DENSO */}
 <section className="bg-card border border-border rounded-md overflow-hidden">
 <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
 <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-primary">
 FUNIL · {metrics.funnel.reduce((a, s) => a + s.count, 0)} LEADS
 </span>
 <span className="text-[10px] font-mono text-muted-foreground">
 {metrics.funnel.length} ETAPAS
 </span>
 </div>
 <div className="divide-y divide-border">
 {metrics.funnel.map((s) => {
 const pct = (s.count / maxFunnel) * 100;
 return (
 <button
 key={s.stage_id}
 onClick={() => onStageClick(s)}
 className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors relative overflow-hidden"
 >
 <div
 className="absolute inset-y-0 left-0 bg-primary/8"
 style={{ width: `${pct}%` }}
 />
 <div className="relative flex items-baseline justify-between gap-3">
 <div className="min-w-0">
 <div className="text-xs font-mono font-bold uppercase text-foreground truncate">
 {s.stage_name}
 </div>
 <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
 {s.funnel_name}
 </div>
 </div>
 <div className="text-right shrink-0">
 <div className="text-base font-mono font-bold tabular-nums text-foreground">
 {s.count}
 </div>
 <div className="text-[10px] font-mono text-muted-foreground">
 {(s.pct_of_top * 100).toFixed(1)}%
 </div>
 </div>
 </div>
 </button>
 );
 })}
 </div>
 </section>
 </div>
 </div>
 );
}
