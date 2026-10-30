import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleHelp, Link2, Loader2 } from "lucide-react";
import { listCreativeAttribution } from "@/lib/meta-creative-attribution.functions";

function money(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function MetaCreativeAttributionPanel({ workspaceId }: { workspaceId: string }) {
  const listFn = useServerFn(listCreativeAttribution);
  const q = useQuery({
    queryKey: ["meta-creative-attribution", workspaceId],
    queryFn: () => listFn({ data: { workspaceId, limit: 100 } }),
  });

  if (q.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Conferindo atribuição dos criativos…
      </div>
    );
  }

  if (q.error) {
    return <div className="rounded-xl border border-destructive/30 bg-card p-5 text-sm text-destructive">{(q.error as Error).message}</div>;
  }

  const rows = q.data?.rows ?? [];
  const linked = rows.filter((r) => !!r.metaAdId).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" /> Atribuição comprovada</div>
          <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
            A Vanessa Simoni só associa resultado comercial quando existe vínculo determinístico com o anúncio real. Nome de arquivo, nome parecido de campanha e aproximação não são usados.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">{linked}/{rows.length} criativos com anúncio Meta vinculado</div>
      </div>

      {!rows.length ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum criativo cadastrado.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Criativo</th>
                <th className="px-3 py-2 text-left font-medium">Vínculo Meta</th>
                <th className="px-3 py-2 text-left font-medium">Anúncio</th>
                <th className="px-3 py-2 text-left font-medium">Campanha</th>
                <th className="px-3 py-2 text-right font-medium">Eventos Tracking</th>
                <th className="px-3 py-2 text-right font-medium">Valor atribuído</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="bg-background/30">
                  <td className="px-3 py-2 font-medium">{r.displayName}</td>
                  <td className="px-3 py-2">
                    {r.metaAdId ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> comprovado</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><CircleHelp className="h-3.5 w-3.5" /> sem atribuição comprovada</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.metaAdId ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.metaCampaignId ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.metaAdId ? r.attributedEvents : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.metaAdId ? money(r.attributedValue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tracking comercial desta tela usa correspondência exata de <code>utm_content = ad_id</code>. Sem essa chave, o resultado não é atribuído ao criativo.
      </p>
    </div>
  );
}
