import { Activity, BarChart3, Maximize2, MoreVertical, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KpiCard } from "./KpiCard";
import { useCustomKpis, type KpiSize, type KpiViz } from "@/lib/custom-kpis";
import { useKpiRules } from "@/lib/kpi-rules";
import { getCustomKpiCards } from "@/lib/dashboard.functions";
import type { KpiCardData } from "@/lib/mock-dashboard";
import { cn } from "@/lib/utils";

interface Props {
  onEdit?: () => void;
  onKpiClick?: (kpi: Pick<KpiCardData, "kpi_key" | "label" | "source_label">) => void;
}

const SIZE_CLASS: Record<KpiSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-1 md:col-span-2 row-span-1",
  "2x2": "col-span-1 md:col-span-2 row-span-2",
};

const SIZE_LABEL: Record<KpiSize, string> = {
  "1x1": "Pequeno",
  "2x1": "Largo",
  "2x2": "Médio",
};

const VIZ_LABEL: Record<KpiViz, string> = {
  number: "Só número",
  sparkline: "Linha",
  area: "Área",
  progress: "Barra",
  bars: "Barras",
};

const SOURCE_ORDER: KpiCardData["source"][] = ["mkton", "meta", "google_ads", "ga4", "tiktok", "google_business"];
const SOURCE_LABEL: Record<KpiCardData["source"], string> = {
  mkton: "CRM e operação",
  meta: "Meta Ads",
  google_ads: "Google Ads",
  ga4: "Google Analytics",
  tiktok: "TikTok",
  google_business: "Google Business",
};

export function CustomKpisSection({ onKpiClick }: Props) {
  const { selectedIds, sizes, viz, remove, setSize, setViz } = useCustomKpis();
  const { rules } = useKpiRules();
  const loadCards = useServerFn(getCustomKpiCards);
  const cardsQ = useQuery({
    queryKey: [
      "dashboard",
      "custom-kpis",
      "crm-meta-v2",
      selectedIds,
      rules.data_source,
      rules.venda_ganha_pipeline_id,
      rules.venda_ganha_stage_id,
    ],
    queryFn: () =>
      loadCards({
        data: {
          kpiKeys: selectedIds,
          data_source: rules.data_source,
          venda_ganha_pipeline_id: rules.venda_ganha_pipeline_id,
          venda_ganha_stage_id: rules.venda_ganha_stage_id,
        },
      }),
    enabled: selectedIds.length > 0,
    staleTime: 30_000,
  });
  const kpiData = cardsQ.data as { cards: KpiCardData[] } | undefined;

  const cards = selectedIds
    .map((id) => ({ id, card: kpiData?.cards.find((card) => card.kpi_key === id) ?? null }))
    .filter((item): item is { id: string; card: KpiCardData } => Boolean(item.card));

  const grouped = SOURCE_ORDER.map((source) => ({
    source,
    label: SOURCE_LABEL[source],
    cards: cards.filter((item) => item.card.source === source),
  })).filter((group) => group.cards.length > 0);

  if (selectedIds.length === 0) return null;

  return (
    <section className="space-y-4 pt-2 print:hidden">
      <div className="border-t border-border pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-bold text-foreground">KPIs personalizados</h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          Indicadores escolhidos manualmente ficam organizados pela origem dos dados para evitar mistura entre CRM, mídia e analytics.
          {cardsQ.isFetching ? " Atualizando valores…" : ""}
        </p>
      </div>

      {grouped.map((group) => (
        <div key={group.source} className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 font-display">{group.label}</div>
            <div className="h-px flex-1 bg-border/70" />
            <span className="text-[10px] text-muted-foreground">{group.cards.length}</span>
          </div>

          <div className="grid auto-rows-[148px] grid-cols-1 gap-3 [grid-auto-flow:dense] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.cards.map(({ id, card }) => {
              const raw = sizes[id] ?? "1x1";
              const size: KpiSize = raw === "1x1" || raw === "2x1" || raw === "2x2" ? raw : "2x2";
              const cardViz = viz[id] ?? "number";
              return (
                <div key={id} className={cn("group relative h-full", SIZE_CLASS[size])}>
                  <div className="h-full">
                    <KpiCard kpi={card} onClick={() => onKpiClick?.(card)} viz={cardViz} />
                  </div>
                  <CardMenu
                    currentSize={size}
                    currentViz={cardViz}
                    onSize={(nextSize) => setSize(id, nextSize)}
                    onViz={(nextViz) => setViz(id, nextViz)}
                    onRemove={() => remove(id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function CardMenu({
  currentSize,
  currentViz,
  onSize,
  onViz,
  onRemove,
}: {
  currentSize: KpiSize;
  currentViz: KpiViz;
  onSize: (size: KpiSize) => void;
  onViz: (viz: KpiViz) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground hover:text-foreground"
        aria-label="Opções do card"
      >
        <MoreVertical className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-40 w-48 overflow-hidden rounded-md border border-border bg-popover text-xs shadow-lg">
            <div className="border-b border-border px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Maximize2 className="mr-1 inline h-3 w-3" /> Tamanho
            </div>
            {(Object.keys(SIZE_LABEL) as KpiSize[]).map((size) => (
              <button
                key={size}
                onClick={() => {
                  onSize(size);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-accent",
                  currentSize === size && "bg-accent font-semibold",
                )}
              >
                <span>{SIZE_LABEL[size]}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{size}</span>
              </button>
            ))}
            <div className="border-y border-border px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <BarChart3 className="mr-1 inline h-3 w-3" /> Visualização
            </div>
            {(Object.keys(VIZ_LABEL) as KpiViz[]).map((itemViz) => (
              <button
                key={itemViz}
                onClick={() => {
                  onViz(itemViz);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-accent",
                  currentViz === itemViz && "bg-accent font-semibold",
                )}
              >
                <span>{VIZ_LABEL[itemViz]}</span>
                {currentViz === itemViz && <Activity className="h-3 w-3 text-primary" />}
              </button>
            ))}
            <button
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 border-t border-border px-2 py-1.5 text-left text-danger hover:bg-danger/5"
            >
              <Trash2 className="h-3 w-3" /> Remover desta dashboard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
