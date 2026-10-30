import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Target } from "lucide-react";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TrackingEmptyState } from "./EmptyState";
import { listTrackingEvents, upsertConversion } from "@/lib/tracking-live.functions";
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
};

export function TrackingEventsTable() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [markOpen, setMarkOpen] = useState(false);
  const [markEvent, setMarkEvent] = useState<string>("");
  const [markName, setMarkName] = useState("");
  const [markValue, setMarkValue] = useState("");

  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["tracking-events", workspaceId, query],
    queryFn: () => listTrackingEvents({ data: { workspaceId, q: query, limit: 200 } }),
    enabled: !!workspaceId,
    refetchInterval: 15000,
  });

  const save = useMutation({
    mutationFn: () =>
      upsertConversion({
        data: {
          workspaceId,
          name: markName.trim() || markEvent,
          eventName: markEvent,
          defaultValue: markValue ? Number(markValue) : null,
          currency: "BRL",
          active: true,
        },
      }),
    onSuccess: () => {
      toast.success(`"${markEvent}" agora conta como conversão`);
      qc.invalidateQueries({ queryKey: ["tracking-conversions", workspaceId] });
      qc.invalidateQueries({ queryKey: ["tracking-overview", workspaceId] });
      setMarkOpen(false);
      setMarkEvent(""); setMarkName(""); setMarkValue("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openMark = (eventName: string) => {
    setMarkEvent(eventName);
    setMarkName(eventName.replace(/_/g, " "));
    setMarkValue("");
    setMarkOpen(true);
  };

  return (
    <ModuleSection
      title="Eventos rastreados"
      description="Cada linha é um evento que o pixel Vanessa Simoni recebeu. Atualiza sozinho a cada 15 s. Clique em Marcar como conversão para transformar qualquer evento em KPI."
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
          hint="Instale o pixel Vanessa Simoni no seu site (aba Instalação) e navegue até uma página para gerar o primeiro page_view."
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
                <th className="p-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(rows as Row[]).map((r) => (
                <tr key={r.id}>
                  <td className="p-2 text-muted-foreground tabular-nums whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-2"><span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">{r.event_name}</span></td>
                  <td className="p-2 truncate max-w-[240px]">{r.page_path ?? "-"}</td>
                  <td className="p-2 text-muted-foreground">
                    {r.utm_source || r.utm_campaign ? (
                      <span className="font-mono text-[10px]">{r.utm_source ?? "-"}·{r.utm_campaign ?? "-"}</span>
                    ) : "-"}
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.value != null ? r.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => openMark(r.event_name)}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                      title="Marcar este tipo de evento como conversão"
                    >
                      <Target className="w-3 h-3" /> Marcar como conversão
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar "{markEvent}" como conversão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Todo evento com nome <span className="font-mono">{markEvent}</span> vai entrar no funil de conversões, KPIs da dashboard e ranking de UTMs.
            </p>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Nome amigável</label>
              <Input value={markName} onChange={(e) => setMarkName(e.target.value)} placeholder="Ex.: Lead qualificado" className="h-9 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor padrão (opcional, R$)</label>
              <Input type="number" value={markValue} onChange={(e) => setMarkValue(e.target.value)} placeholder="Ex.: 297" className="h-9 text-sm mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Usado quando o evento não trouxer um valor próprio.</p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setMarkOpen(false)} className="text-xs px-3 py-2 rounded-md border border-border hover:bg-muted">Cancelar</button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? "Salvando…" : "Marcar como conversão"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleSection>
  );
}
