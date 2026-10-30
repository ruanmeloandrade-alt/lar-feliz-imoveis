import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Target, Loader2 } from "lucide-react";
import { getRealRoasByCampaign } from "@/lib/meta-attribution.functions";

function money(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function RealRoasPanel({ workspaceId, preset }: { workspaceId: string; preset: string }) {
  const fn = useServerFn(getRealRoasByCampaign);
  const q = useQuery({
    queryKey: ["meta-real-roas", workspaceId, preset],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fn({ data: { workspaceId, preset: preset as any } }),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <div>
          <div className="text-sm font-semibold">ROAS real (CRM ↔ Ads)</div>
          <div className="text-[11px] text-muted-foreground">Cruza leads que vieram de campanhas Meta com vendas ganhas no seu CRM.</div>
        </div>
      </div>

      {q.isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cruzando dados…</div>
      ) : q.error ? (
        <div className="text-sm text-destructive">{(q.error as Error).message}</div>
      ) : !q.data || q.data.campaigns.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sem leads vindos de Meta Ads no período. Configure o webhook de Lead Ads em Integrações para começar a atribuir.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { l: "Investido", v: money(q.data.totals.spend) },
              { l: "Leads (ads)", v: q.data.totals.leads.toLocaleString("pt-BR") },
              { l: "Vendas ganhas", v: (q.data.totals.wonDeals ?? 0).toLocaleString("pt-BR") },
              { l: "Receita real", v: money(q.data.totals.wonValue) },
              { l: "CPL real", v: q.data.totals.cplReal > 0 ? money(q.data.totals.cplReal) : "-" },
              { l: "CAC", v: q.data.totals.cac > 0 ? money(q.data.totals.cac) : "-" },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border border-border bg-background/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{k.v}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            ROAS real: <span className="font-semibold">{q.data.totals.realRoas > 0 ? `${q.data.totals.realRoas.toFixed(2)}x` : "-"}</span>
            <span className="text-muted-foreground"> · (receita real ÷ investimento)</span>
          </div>
          <div className="divide-y divide-border">
            {q.data.campaigns.map((c) => (
              <div key={c.campaignId} className="py-3 grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {c.campaignName}
                    {("isUtmFallback" in c && (c as { isUtmFallback?: boolean }).isUtmFallback) && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground">UTM</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.leads} leads · {c.wonDeals} vendas ganhas</div>
                </div>
                <div className="text-right"><div className="text-xs tabular-nums">{money(c.spend)}</div><div className="text-[10px] text-muted-foreground">investido</div></div>
                <div className="text-right"><div className="text-xs tabular-nums">{money(c.wonValue)}</div><div className="text-[10px] text-muted-foreground">receita</div></div>
                <div className="text-right"><div className="text-xs tabular-nums">{c.cpl > 0 ? money(c.cpl) : "-"}</div><div className="text-[10px] text-muted-foreground">CPL real</div></div>
                <div className="text-right"><div className="text-xs tabular-nums">{("cac" in c && (c as { cac: number }).cac > 0) ? money((c as { cac: number }).cac) : "-"}</div><div className="text-[10px] text-muted-foreground">CAC</div></div>
                <div className="text-right">
                  <div className={`text-xs tabular-nums font-semibold ${c.realRoas >= 1 ? "text-success" : "text-muted-foreground"}`}>{c.realRoas > 0 ? `${c.realRoas.toFixed(2)}x` : "-"}</div>
                  <div className="text-[10px] text-muted-foreground">ROAS real</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
