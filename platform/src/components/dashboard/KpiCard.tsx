import { ChevronRight, Users, MessageSquare, Clock, AlertOctagon, DollarSign, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer } from "recharts";
import type { KpiCardData } from "@/lib/mock-dashboard";
import { formatKpiValue, formatDelta } from "@/lib/mock-dashboard";
import type { KpiViz } from "@/lib/custom-kpis";
import { cn } from "@/lib/utils";

const KPI_ICONS: Record<string, typeof Users> = {
  leads_recebidos: Users,
  em_atendimento: MessageSquare,
  sem_tarefa_futura: Clock,
  leads_urgentes: AlertOctagon,
  vendas_ganhas: DollarSign,
  vendas_perdidas: TrendingDown,
  taxa_conversao: TrendingUp,
  valor_pipeline: Wallet,
};

const STATUS_RING: Record<string, string> = {
  ok: "border-border",
  warn: "border-warning/40",
  danger: "border-danger/40",
  no_data: "border-dashed border-border",
};

const STATUS_DOT: Record<string, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  danger: "bg-danger",
  no_data: "bg-muted-foreground/40",
};

export function KpiCard({ kpi, onClick, viz = "sparkline" }: { kpi: KpiCardData; onClick?: () => void; viz?: KpiViz }) {
  const Icon = KPI_ICONS[kpi.kpi_key] ?? Users;
  const delta = formatDelta(kpi.delta_pct);
  const deltaPositive = (kpi.delta_pct ?? 0) > 0;
  const isNoData = kpi.status === "no_data";
  const series = kpi.sparkline && kpi.sparkline.length > 0 ? kpi.sparkline : [0, Number(kpi.value ?? 0)];
  const maxSeries = Math.max(...series, Number(kpi.value ?? 0), 1);
  const progress = kpi.unit === "percent" ? Math.max(0, Math.min(100, Number(kpi.value ?? 0) * 100)) : Math.max(0, Math.min(100, (Number(kpi.value ?? 0) / maxSeries) * 100));

  return (
    <button
      onClick={onClick}
      disabled={!kpi.drilldown_available}
      className={cn(
        "group relative block h-full w-full text-left bg-card border rounded-xl p-5 transition-all overflow-hidden",
        "shadow-premium hover:shadow-premium-lg hover:border-primary/40 hover:-translate-y-0.5 disabled:cursor-default",
        STATUS_RING[kpi.status]
      )}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[kpi.status])} />
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/70 font-display truncate">
            {kpi.label}
          </div>
        </div>
        {kpi.drilldown_available && (
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <div
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums font-display",
            isNoData ? "text-muted-foreground/60" : "text-foreground"
          )}
        >
          {formatKpiValue(kpi.value, kpi.unit)}
        </div>
        {delta && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              deltaPositive ? "text-success" : "text-danger"
            )}
          >
            {delta}
          </span>
        )}
      </div>

      <div className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
        {isNoData ? (
          <span className="italic">Sem dado real no período</span>
        ) : (
          kpi.description
        )}
      </div>

      {viz === "sparkline" && series.length > 0 && (
        <div className="mt-2 h-8 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.map((v) => ({ v }))}>
              <Line
                type="monotone"
                dataKey="v"
                stroke="hsl(from var(--primary) h s l)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {viz === "area" && series.length > 0 && (
        <div className="mt-2 h-8 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series.map((v) => ({ v }))}>
              <Area
                type="monotone"
                dataKey="v"
                stroke="hsl(from var(--primary) h s l)"
                fill="hsl(from var(--primary) h s l / 0.18)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {viz === "progress" && (
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {viz === "bars" && series.length > 0 && (
        <div className="mt-2 h-8 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.map((v) => ({ v }))}>
              <Bar dataKey="v" fill="hsl(from var(--primary) h s l)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground/60">
        <span>{kpi.source_label}</span>
      </div>
    </button>
  );
}
