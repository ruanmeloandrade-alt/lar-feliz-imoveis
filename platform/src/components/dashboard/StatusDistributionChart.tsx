import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CircleDot } from "lucide-react";
import type { DashboardMetricsResponse, KpiCardData } from "@/lib/mock-dashboard";

function valueOf(kpis: KpiCardData[], key: string) {
  return Number(kpis.find((kpi) => kpi.kpi_key === key)?.value ?? 0);
}

export function StatusDistributionChart({ metrics }: { metrics: DashboardMetricsResponse }) {
  const total = valueOf(metrics.kpis, "leads_recebidos");
  const open = valueOf(metrics.kpis, "em_atendimento");
  const lost = valueOf(metrics.kpis, "vendas_perdidas");
  const won = Math.max(0, total - open - lost);

  const data = [
    { name: "Em atendimento", value: open, color: "var(--primary)" },
    { name: "Ganhos", value: won, color: "var(--success)" },
    { name: "Perdidos", value: lost, color: "var(--destructive)" },
  ].filter((item) => item.value > 0);

  const hasData = data.length > 0;

  return (
    <section className="h-full rounded-2xl border border-border/70 bg-card p-5 shadow-premium">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 font-display">
            Saúde comercial
          </div>
          <h2 className="mt-1 text-base font-semibold text-foreground">Distribuição dos leads</h2>
          <p className="mt-1 text-xs text-muted-foreground">Visão rápida do status da base no período.</p>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <CircleDot className="h-4 w-4" />
        </div>
      </div>

      {hasData ? (
        <div className="mt-3 grid grid-cols-[150px_1fr] items-center gap-3">
          <div className="relative h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={67}
                  paddingAngle={3}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{total}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">leads</div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {data.map((item) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.name} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{item.value}</div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">{pct.toFixed(0)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid h-[150px] place-items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-xs text-muted-foreground">
          A distribuição aparece quando houver leads classificados no período.
        </div>
      )}
    </section>
  );
}
