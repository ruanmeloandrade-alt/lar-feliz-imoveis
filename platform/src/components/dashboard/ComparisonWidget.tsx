import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, PieChart as PieIcon, ListOrdered, Loader2, MoreVertical, Pencil, Trash2, Maximize2 } from "lucide-react";
import { useState } from "react";
import { getCustomKpiCards } from "@/lib/dashboard.functions";
import { useKpiRules } from "@/lib/kpi-rules";
import { formatKpiValue } from "@/lib/mock-dashboard";
import type { KpiCardData } from "@/lib/mock-dashboard";

type KpiUnit = KpiCardData["unit"];
function normalizeUnit(u: unknown): KpiUnit {
  return u === "count" || u === "currency_brl" || u === "percent" || u === "duration_min" ? u : "count";
}
import { cn } from "@/lib/utils";
import type { ComparisonWidget as ComparisonWidgetType, ComparisonSize } from "@/lib/comparison-widgets";

// Distinct chart series colors driven by the design system primary hue.
const PALETTE = [
  "hsl(from var(--primary) h s l)",
  "hsl(from var(--primary) calc(h + 40) s l)",
  "hsl(from var(--primary) calc(h - 40) s l)",
  "hsl(from var(--primary) calc(h + 80) s l)",
  "hsl(from var(--primary) calc(h - 80) s l)",
  "hsl(from var(--primary) calc(h + 120) s l)",
  "hsl(from var(--primary) calc(h - 120) s l)",
  "hsl(from var(--primary) calc(h + 160) s l)",
];

interface Props {
  widget: ComparisonWidgetType;
  onEdit: () => void;
  onRemove: () => void;
  onSize: (s: ComparisonSize) => void;
}

const SIZE_LABEL: Record<ComparisonSize, string> = {
  "1x1": "Pequeno",
  "2x1": "Largo",
  "2x2": "Médio",
};

export function ComparisonWidget({ widget, onEdit, onRemove, onSize }: Props) {
  const { rules } = useKpiRules();
  const loadCards = useServerFn(getCustomKpiCards);
  const q = useQuery({
    queryKey: ["dashboard", "comparison-widget", widget.kpiKeys, rules.data_source, rules.venda_ganha_pipeline_id, rules.venda_ganha_stage_id],
    queryFn: () => loadCards({ data: {
      kpiKeys: widget.kpiKeys,
      data_source: rules.data_source,
      venda_ganha_pipeline_id: rules.venda_ganha_pipeline_id,
      venda_ganha_stage_id: rules.venda_ganha_stage_id,
    } }),
    enabled: widget.kpiKeys.length > 0,
    staleTime: 30_000,
  });

  const cards: KpiCardData[] = q.data?.cards ?? [];
  const data = useMemo(() => {
    return widget.kpiKeys
      .map((k, i) => {
        const c = cards.find((card) => card.kpi_key === k);
        return {
          key: k,
          name: c?.label ?? k,
          value: Number(c?.value ?? 0),
          unit: normalizeUnit(c?.unit),
          color: PALETTE[i % PALETTE.length],
          source: c?.source_label ?? "",
        };
      });
  }, [widget.kpiKeys, cards]);

  const sorted = useMemo(() => [...data].sort((a, b) => b.value - a.value), [data]);

  return (
    <div className="relative group h-full bg-card border border-border rounded-lg p-4 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ChartIcon type={widget.chartType} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground truncate">{widget.title}</div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              {widget.chartType === "bar" && "Gráfico de barras"}
              {widget.chartType === "pie" && "Gráfico de pizza"}
              {widget.chartType === "ranking" && "Ranking"}
              <span className="mx-1">·</span>
              {data.length} KPIs
            </div>
          </div>
        </div>
        <WidgetMenu currentSize={widget.size} onSize={onSize} onEdit={onEdit} onRemove={onRemove} />
      </div>

      <div className="flex-1 min-h-0">
        {q.isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
          </div>
        ) : data.every((d) => !d.value) ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
            Sem dados no período para estes KPIs.
          </div>
        ) : widget.chartType === "bar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(from var(--border) h s l)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={44} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip
                cursor={{ fill: "hsl(from var(--muted) h s l / 0.4)" }}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(from var(--border) h s l)", background: "hsl(from var(--popover) h s l)" }}
                formatter={(v: any, _n, ctx: any) => [formatKpiValue(Number(v), ctx?.payload?.unit ?? "number"), ctx?.payload?.name]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : widget.chartType === "pie" ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(from var(--border) h s l)", background: "hsl(from var(--popover) h s l)" }}
                formatter={(v: any, _n, ctx: any) => [formatKpiValue(Number(v), ctx?.payload?.unit ?? "number"), ctx?.payload?.name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <RankingList items={sorted} />
        )}
      </div>
    </div>
  );
}

function ChartIcon({ type }: { type: ComparisonWidgetType["chartType"] }) {
  const Icon = type === "bar" ? BarChart3 : type === "pie" ? PieIcon : ListOrdered;
  return <Icon className="w-4 h-4 text-primary shrink-0" />;
}

function RankingList({ items }: { items: Array<{ key: string; name: string; value: number; unit: KpiUnit; color: string; source: string }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {items.map((item, idx) => {
        const pct = Math.max(2, (item.value / max) * 100);
        return (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0",
                    idx === 0 && "bg-warning/20 text-warning",
                    idx === 1 && "bg-muted-foreground/20 text-foreground",
                    idx === 2 && "bg-primary/15 text-primary",
                    idx > 2 && "bg-muted text-muted-foreground",
                  )}
                >
                  {idx + 1}
                </span>
                <span className="truncate font-medium text-foreground">{item.name}</span>
              </div>
              <span className="tabular-nums font-mono font-bold text-foreground">
                {formatKpiValue(item.value, item.unit)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: item.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WidgetMenu({
  currentSize,
  onSize,
  onEdit,
  onRemove,
}: {
  currentSize: ComparisonSize;
  onSize: (s: ComparisonSize) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-background/90 border border-border text-muted-foreground hover:text-foreground"
        aria-label="Opções do gráfico"
      >
        <MoreVertical className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-40 w-48 rounded-md border border-border bg-popover shadow-lg overflow-hidden text-xs">
            <div className="px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground border-b border-border">
              <Maximize2 className="w-3 h-3 inline mr-1" /> Tamanho
            </div>
            {(Object.keys(SIZE_LABEL) as ComparisonSize[]).map((s) => (
              <button
                key={s}
                onClick={() => { onSize(s); setOpen(false); }}
                className={cn(
                  "w-full text-left px-2 py-1.5 hover:bg-accent flex items-center justify-between",
                  currentSize === s && "bg-accent font-semibold",
                )}
              >
                <span>{SIZE_LABEL[s]}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{s}</span>
              </button>
            ))}
            <button
              onClick={() => { onEdit(); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 border-t border-border hover:bg-accent flex items-center gap-1.5"
            >
              <Pencil className="w-3 h-3" /> Editar
            </button>
            <button
              onClick={() => { onRemove(); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 border-t border-border text-danger hover:bg-danger/5 flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" /> Remover
            </button>
          </div>
        </>
      )}
    </div>
  );
}
