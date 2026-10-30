import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import type { EvolutionPoint } from "@/lib/mock-dashboard";

export function EvolutionChart({
  data,
  leadsCount,
  onPointClick,
}: {
  data: EvolutionPoint[];
  leadsCount: number;
  onPointClick?: (point: EvolutionPoint) => void;
}) {
  return (
    <section className="bg-card border border-border rounded-xl p-6 shadow-premium hover:shadow-premium-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold tracking-widest text-primary/80 uppercase font-display">
            Evolução da Operação
          </div>
          <h2 className="text-base font-semibold text-foreground mt-0.5">
            {leadsCount} leads no período
          </h2>
        </div>
        <LineChartIcon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="h-56 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            onClick={(e: any) => {
              const p = e?.activePayload?.[0]?.payload as EvolutionPoint | undefined;
              if (p && onPointClick) onPointClick(p);
            }}
            style={{ cursor: onPointClick ? "pointer" : undefined }}
          >
            <defs>
              <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
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
              labelFormatter={(d) => `Dia ${d}`}
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#leadsGrad)"
              activeDot={{
                r: 5,
                style: { cursor: "pointer" },
                onClick: (_: any, payload: any) => {
                  const p = payload?.payload as EvolutionPoint | undefined;
                  if (p && onPointClick) onPointClick(p);
                },
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
