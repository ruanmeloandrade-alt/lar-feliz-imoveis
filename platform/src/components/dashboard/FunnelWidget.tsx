import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FunnelStage } from "@/lib/mock-dashboard";

export function FunnelWidget({
  stages,
  onStageClick,
}: {
  stages: FunnelStage[];
  onStageClick: (stage: FunnelStage) => void;
}) {
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1);
  const chartData = stages.slice(0, 8).map((stage) => ({
    ...stage,
    shortName: stage.stage_name.length > 14 ? `${stage.stage_name.slice(0, 12)}…` : stage.stage_name,
  }));

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-premium transition-all duration-300 hover:shadow-premium-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 font-display">
            Movimento no funil
          </div>
          <h2 className="mt-1 text-base font-semibold text-foreground">Volume por etapa</h2>
          <p className="mt-1 text-xs text-muted-foreground">As colunas mostram onde os leads estão concentrados.</p>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-4 w-4" />
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="mt-4 h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={48}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.stage_name ?? "Etapa"}
                formatter={(value) => [value, "Leads"]}
              />
              <Bar
                dataKey="count"
                fill="var(--primary)"
                radius={[6, 6, 2, 2]}
                maxBarSize={46}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 grid h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-xs text-muted-foreground">
          Configure um funil com leads para visualizar o volume por etapa.
        </div>
      )}

      {stages.length > 0 && (
        <div className="mt-4 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-2">
          {stages.slice(0, 6).map((stage) => {
            const width = (stage.count / maxCount) * 100;
            return (
              <button
                key={stage.stage_id}
                type="button"
                onClick={() => onStageClick(stage)}
                className="group rounded-xl border border-border/70 bg-background/70 p-3 text-left transition-colors hover:border-primary/30 hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-foreground">{stage.stage_name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{stage.funnel_name}</div>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{stage.count}</div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all group-hover:bg-primary/80"
                    style={{ width: `${Math.max(width, 3)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
