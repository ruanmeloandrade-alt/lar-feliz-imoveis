import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { Input } from "@/components/ui/input";
import { TrackingEmptyState } from "./EmptyState";
import { listTrackingEvents } from "@/lib/tracking-live.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";

type Row = {
  id: number;
  event_name: string;
  page_path: string | null;
  page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  value: number | null;
  created_at: string;
  properties: Record<string, unknown> | null;
};

function eventDetail(props: Row["properties"]): string {
  if (!props) return "-";
  const detail = [props.product_name, props.label, props.text, props.button_text].find(
    (v) => typeof v === "string" && v.trim(),
  );
  const seconds = Number(props.duration_seconds);
  return (
    [
      typeof detail === "string" ? detail.slice(0, 160) : "",
      Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds)} s de visualização` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "-"
  );
}

export function TrackingEventsTable() {
  const [query, setQuery] = useState("");
  const { data: ws } = useQuery({
    queryKey: ["active-workspace"],
    queryFn: () => getActiveWorkspace(),
  });
  const workspaceId = ws?.id ?? "";
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["tracking-events", workspaceId, query],
    queryFn: () => listTrackingEvents({ data: { workspaceId, q: query, limit: 200 } }),
    enabled: !!workspaceId,
    refetchInterval: 15000,
  });

  return (
    <ModuleSection
      title="Eventos rastreados"
      description="Visitas, cliques e interesse em imóveis no site público da Vanessa. Atualização automática a cada 15 segundos. A navegação interna não entra nesta lista."
    >
      <div className="mb-3 relative max-w-sm">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar evento, página ou campanha…"
          className="pl-8 h-8 text-xs"
        />
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground py-6">Carregando…</div>
      ) : (rows as Row[]).length === 0 ? (
        <TrackingEmptyState
          title="Nenhum evento recebido ainda"
          hint="O site da Vanessa já está conectado. Os eventos aparecem automaticamente conforme os visitantes navegam na página pública."
        />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="p-2">Quando</th>
                <th className="p-2">Evento</th>
                <th className="p-2">Página</th>
                <th className="p-2">UTM</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2">Imóvel / interação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(rows as Row[]).map((r) => (
                <tr key={r.id}>
                  <td className="p-2 text-muted-foreground tabular-nums whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="p-2">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">
                      {r.event_name}
                    </span>
                  </td>
                  <td className="p-2 truncate max-w-[240px]">{r.page_path ?? "-"}</td>
                  <td className="p-2 text-muted-foreground">
                    {r.utm_source || r.utm_campaign ? (
                      <span className="font-mono text-[10px]">
                        {r.utm_source ?? "-"}·{r.utm_campaign ?? "-"}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.value != null
                      ? r.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "-"}
                  </td>
                  <td className="p-2 max-w-[280px]">{eventDetail(r.properties)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleSection>
  );
}
