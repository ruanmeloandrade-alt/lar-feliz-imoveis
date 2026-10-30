import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMetaObjectTimeSeries } from "@/lib/meta.functions";
import { cn } from "@/lib/utils";

type Level = "campaigns" | "adsets" | "ads";

type SeriesItem = {
  objectId: string;
  points: Array<{
    date: string; spend: number; impressions: number; clicks: number; ctr: number;
    reach: number; cpc: number; cpm: number; leads: number; purchases: number; revenue: number; roas: number;
  }>;
  error?: string;
};

const METRICS = [
  { v: "spend", l: "Investimento", fmt: "currency" as const },
  { v: "impressions", l: "Impressões", fmt: "int" as const },
  { v: "reach", l: "Alcance", fmt: "int" as const },
  { v: "clicks", l: "Cliques", fmt: "int" as const },
  { v: "ctr", l: "CTR (%)", fmt: "percent" as const },
  { v: "cpc", l: "CPC", fmt: "currency" as const },
  { v: "cpm", l: "CPM", fmt: "currency" as const },
  { v: "leads", l: "Leads", fmt: "int" as const },
  { v: "purchases", l: "Compras", fmt: "int" as const },
  { v: "revenue", l: "Receita", fmt: "currency" as const },
  { v: "roas", l: "ROAS", fmt: "roas" as const },
] as const;
type MetricKey = (typeof METRICS)[number]["v"];

const COLORS = [
  "hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4",
  "#ec4899", "#84cc16", "#0ea5e9", "#f97316", "#a855f7", "#14b8a6",
  "#eab308", "#22c55e", "#3b82f6", "#f43f5e", "#6366f1", "#d946ef",
  "#64748b", "#0891b2", "#dc2626", "#65a30d", "#7c3aed", "#059669",
  "#ca8a04", "#10b981", "#db2777", "#0d9488", "#16a34a", "#e11d48",
];

function fmt(v: number, kind: "currency" | "int" | "percent" | "roas", currency: string): string {
  if (!Number.isFinite(v)) return "0";
  if (kind === "currency") {
    try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(v); }
    catch { return `R$ ${v.toFixed(2)}`; }
  }
  if (kind === "percent") return `${v.toFixed(2)}%`;
  if (kind === "roas") return `${v.toFixed(2)}x`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function MetaChartsDialog({
  open, onOpenChange, workspaceId, level, items, preset, currency = "BRL",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  level: Level;
  items: Array<{ id: string; name: string }>;
  preset: string;
  currency?: string;
}) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const fetchFn = useServerFn(getMetaObjectTimeSeries);

  const ids = items.map((i) => i.id);
  const namesById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.name])), [items]);

  const q = useQuery({
    queryKey: ["meta-timeseries", workspaceId, level, preset, ...ids],
    enabled: open && ids.length > 0,
    queryFn: () => fetchFn({ data: { workspaceId, objectIds: ids, level, preset } }),
  });

  const metricDef = METRICS.find((m) => m.v === metric)!;

  // Merge séries por data para o LineChart
  const chartData = useMemo(() => {
    if (!q.data?.series) return [];
    const byDate: Record<string, Record<string, number | string>> = {};
    (q.data.series as SeriesItem[]).forEach((s) => {
      s.points.forEach((p) => {
        const row = byDate[p.date] ?? (byDate[p.date] = { date: p.date });
        row[s.objectId] = (p as unknown as Record<string, number>)[metric];
      });
    });
    return Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [q.data, metric]);

  const levelLabel = level === "campaigns" ? "campanhas" : level === "adsets" ? "conjuntos" : "anúncios";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw]">
        <DialogHeader>
          <DialogTitle>Gráficos · {ids.length} {levelLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {METRICS.map((m) => (
            <button
              key={m.v}
              onClick={() => setMetric(m.v)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                metric === m.v
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {m.l}
            </button>
          ))}
        </div>

        <div className="h-[420px] mt-3 rounded-lg border border-border bg-background/50 p-2">
          {q.isLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando série diária…
            </div>
          ) : q.error ? (
            <div className="h-full flex items-center justify-center text-sm text-destructive gap-2">
              <AlertCircle className="w-4 h-4" /> {(q.error as Error).message}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
              <AlertCircle className="w-4 h-4" /> Sem dados diários no período selecionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => {
                    const [, m, day] = String(d).split("-");
                    return `${day}/${m}`;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => fmt(Number(v), metricDef.fmt, currency).replace(/\s?R\$\s?/, "R$")}
                  width={72}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number, name: string) => [fmt(value, metricDef.fmt, currency), namesById[name] ?? name]}
                  labelFormatter={(l) => String(l)}
                />
                {ids.length <= 8 && (
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(v) => namesById[v] ?? v}
                  />
                )}
                {ids.map((id, i) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {q.data?.series && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-muted-foreground max-h-40 overflow-y-auto">
            {(q.data.series as SeriesItem[]).map((s, i) => (
              <div key={s.objectId} className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="truncate">{namesById[s.objectId] ?? s.objectId}</span>
                {s.error && <span className="text-destructive">· {s.error}</span>}
                {!s.error && <span className="opacity-60">· {s.points.length} pontos</span>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
