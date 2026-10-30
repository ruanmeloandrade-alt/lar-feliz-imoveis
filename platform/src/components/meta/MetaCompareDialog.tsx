import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeMetaComparison } from "@/lib/meta-campaigns.functions";
import { AiRichText } from "@/components/ui/ai-rich-text";

export type CompareItem = {
  id: string;
  name: string;
  status: string;
  objective?: string | null;
  currency?: string | null;
  spend: number;
  impressions: number;
  reach?: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number;
  roas: number;
};

function money(n: number, currency?: string | null) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 2 }).format(n);
  } catch { return `R$ ${n.toFixed(2)}`; }
}
const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "0");

const METRICS: Array<{
  key: keyof CompareItem;
  label: string;
  direction: "higher" | "lower"; // qual é melhor
  render: (i: CompareItem) => string;
}> = [
  { key: "spend", label: "Investido", direction: "lower", render: (i) => money(i.spend, i.currency) },
  { key: "impressions", label: "Impressões", direction: "higher", render: (i) => num(i.impressions) },
  { key: "reach", label: "Alcance", direction: "higher", render: (i) => num(i.reach ?? 0) },
  { key: "clicks", label: "Cliques", direction: "higher", render: (i) => num(i.clicks) },
  { key: "ctr", label: "CTR", direction: "higher", render: (i) => `${i.ctr.toFixed(2)}%` },
  { key: "leads", label: "Leads", direction: "higher", render: (i) => num(i.leads) },
  { key: "cpl", label: "CPL", direction: "lower", render: (i) => (i.leads > 0 ? money(i.cpl, i.currency) : "-") },
  { key: "roas", label: "ROAS", direction: "higher", render: (i) => (i.roas > 0 ? `${i.roas.toFixed(2)}x` : "-") },
];

export function MetaCompareDialog({
  open, onOpenChange, level, preset, items,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  level: "campaigns" | "adsets" | "ads";
  preset: string;
  items: CompareItem[];
}) {
  const analyzeFn = useServerFn(analyzeMetaComparison);
  const [verdict, setVerdict] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const res = await analyzeFn({
        data: {
          level, period: preset,
          items: items.map((i) => ({
            id: i.id, name: i.name, status: i.status, objective: i.objective ?? null,
            spend: i.spend, impressions: i.impressions, clicks: i.clicks,
            ctr: i.ctr / 100, leads: i.leads, cpl: i.cpl, roas: i.roas,
            currency: i.currency ?? null,
          })),
        },
      });
      return res;
    },
    onSuccess: (r) => setVerdict(r.verdict),
  });

  // Auto-analisar ao abrir
  useEffect(() => {
    if (open && items.length >= 2 && !verdict && !mut.isPending) {
      mut.mutate();
    }
    if (!open) setVerdict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const winners = useMemo(() => {
    const w: Record<string, number> = {}; // itemId -> "vitórias"
    items.forEach((i) => (w[i.id] = 0));
    for (const m of METRICS) {
      const values = items.map((i) => Number(i[m.key] ?? 0));
      const best = m.direction === "higher" ? Math.max(...values) : Math.min(...values.filter((v) => v > 0));
      if (!Number.isFinite(best)) continue;
      items.forEach((i, idx) => {
        if (values[idx] === best) w[i.id] += 1;
      });
    }
    return w;
  }, [items]);

  const topId = useMemo(() => {
    let best = "";
    let bestScore = -1;
    for (const [id, s] of Object.entries(winners)) {
      if (s > bestScore) { best = id; bestScore = s; }
    }
    return best;
  }, [winners]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comparativo de {level === "campaigns" ? "campanhas" : level === "adsets" ? "conjuntos" : "anúncios"}</DialogTitle>
        </DialogHeader>

        {items.length < 2 ? (
          <div className="text-sm text-muted-foreground py-6">Selecione pelo menos 2 itens para comparar.</div>
        ) : (
          <div className="space-y-4">
            {/* Header cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map((i) => (
                <div key={i.id} className={cn(
                  "rounded-lg border p-2.5 text-xs",
                  i.id === topId ? "border-primary bg-primary/5" : "border-border",
                )}>
                  <div className="flex items-start gap-1.5">
                    {i.id === topId && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    <div className="font-medium truncate">{i.name}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{i.status}{i.objective ? ` · ${i.objective}` : ""}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{winners[i.id] ?? 0} métrica(s) vencidas</div>
                </div>
              ))}
            </div>

            {/* Comparison table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 sticky left-0 bg-muted/40 z-10">Métrica</th>
                    {items.map((i) => (
                      <th key={i.id} className="text-right px-3 py-2 min-w-[140px]">
                        <div className="truncate max-w-[180px]" title={i.name}>{i.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((m) => {
                    const values = items.map((i) => Number(i[m.key] ?? 0));
                    const best = m.direction === "higher"
                      ? Math.max(...values)
                      : Math.min(...values.filter((v) => v > 0));
                    return (
                      <tr key={m.key as string} className="border-t border-border">
                        <td className="px-3 py-2 sticky left-0 bg-background z-10 text-muted-foreground">{m.label}</td>
                        {items.map((i, idx) => {
                          const isBest = Number.isFinite(best) && values[idx] === best && values[idx] > 0;
                          return (
                            <td key={i.id} className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              isBest && "font-semibold text-emerald-500",
                            )}>
                              {m.render(i)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* AI analysis */}
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <div className="text-sm font-medium">Análise IA</div>
                {mut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                <div className="flex-1" />
                <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate()}>
                  {verdict ? "Reanalisar" : "Analisar"}
                </Button>
              </div>
              {verdict ? (
                <AiRichText text={verdict} className="text-xs" />
              ) : mut.isPending ? (
                <div className="text-xs text-muted-foreground">Gerando análise com base nos KPIs…</div>
              ) : (
                <div className="text-xs text-muted-foreground">Clique em "Analisar" para gerar recomendações da IA.</div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
