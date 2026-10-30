import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Trash2, Check } from "lucide-react";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { TrackingEmptyState } from "./EmptyState";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listConversions, upsertConversion, deleteConversion, listDistinctEventNames } from "@/lib/tracking-live.functions";
import { getTrackingConversionStats } from "@/lib/tracking-ui-audit.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";

type Conv = {
  id: string; name: string; event_name: string; default_value: number | null; currency: string | null; active: boolean;
};

type ConvStat = {
  id: string; eventName: string; active: boolean; count: number; valueBRL: number;
};

export function TrackingConversions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Conv | null>(null);
  const [name, setName] = useState("");
  const [eventName, setEventName] = useState("");
  const [defaultValue, setDefaultValue] = useState<string>("");

  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";
  const { data: convs = [] } = useQuery({
    queryKey: ["tracking-conversions", workspaceId],
    queryFn: () => listConversions({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });
  const { data: stats = [], isLoading: statsLoading } = useQuery({
    queryKey: ["tracking-conversion-stats", workspaceId],
    queryFn: () => getTrackingConversionStats({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });
  const { data: eventNames = [] } = useQuery({
    queryKey: ["tracking-event-names", workspaceId],
    queryFn: () => listDistinctEventNames({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const save = useMutation({
    mutationFn: () =>
      upsertConversion({
        data: {
          workspaceId,
          id: editing?.id,
          name: name.trim(),
          eventName: eventName.trim(),
          defaultValue: defaultValue ? Number(defaultValue) : null,
          currency: "BRL",
          active: true,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Conversão atualizada" : "Conversão criada");
      qc.invalidateQueries({ queryKey: ["tracking-conversions", workspaceId] });
      qc.invalidateQueries({ queryKey: ["tracking-conversion-stats", workspaceId] });
      setOpen(false);
      setEditing(null); setName(""); setEventName(""); setDefaultValue("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteConversion({ data: { workspaceId, id } }),
    onSuccess: () => {
      toast.success("Conversão removida");
      qc.invalidateQueries({ queryKey: ["tracking-conversions", workspaceId] });
      qc.invalidateQueries({ queryKey: ["tracking-conversion-stats", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setName(""); setEventName(""); setDefaultValue(""); setOpen(true); };
  const openEdit = (c: Conv) => { setEditing(c); setName(c.name); setEventName(c.event_name); setDefaultValue(c.default_value != null ? String(c.default_value) : ""); setOpen(true); };
  const statsById = new Map((stats as ConvStat[]).map((stat) => [stat.id, stat]));

  return (
    <div className="space-y-4">
      <ModuleSection
        title="Conversões configuradas"
        description="O que o Vanessa Simoni conta como resultado de verdade. Vale para KPIs, funil e ranking de UTMs."
        right={
          <button onClick={openNew}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Nova conversão
          </button>
        }
      >
        {(convs as Conv[]).length === 0 ? (
          <TrackingEmptyState
            title="Nenhuma conversão configurada"
            hint="Clique em Nova conversão para marcar quais eventos (lead, purchase, whatsapp_click…) contam como resultado."
          />
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {(convs as Conv[]).map((c) => (
              <li key={c.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Evento: <span className="font-mono">{c.event_name}</span>
                    {c.default_value != null && <> · Valor padrão: {c.default_value.toLocaleString("pt-BR", { style: "currency", currency: c.currency ?? "BRL" })}</>}
                  </div>
                </div>
                {c.active && <Check className="w-4 h-4 text-success" />}
                <button onClick={() => openEdit(c)} className="text-[11px] px-2 py-1 rounded hover:bg-muted">Editar</button>
                <button onClick={() => del.mutate(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </ModuleSection>

      <ModuleSection title="Conversões nos últimos 30 dias" description="Ocorrências reais gravadas pelo Tracking, por definição configurada.">
        {(convs as Conv[]).length === 0 ? (
          <div className="py-8 flex flex-col items-center text-center text-xs text-muted-foreground gap-2">
            <Target className="w-5 h-5" />
            Configure ao menos uma conversão para ver os totais aqui.
          </div>
        ) : statsLoading ? (
          <div className="text-xs text-muted-foreground py-4">Carregando ocorrências reais…</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(convs as Conv[]).map((c) => {
              const stat = statsById.get(c.id);
              return (
                <div key={c.id} className="rounded-lg border border-border bg-background/50 p-3">
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{c.event_name}</div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Ocorrências</div>
                      <div className="text-lg font-semibold tabular-nums">{(stat?.count ?? 0).toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Valor BRL</div>
                      <div className="text-sm font-semibold tabular-nums">{(stat?.valueBRL ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ModuleSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar conversão" : "Nova conversão"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Nome</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lead qualificado, Compra checkout…" className="h-9 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Evento (nome exato que o pixel envia)</label>
              <Select value={eventName} onValueChange={setEventName}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Escolha um evento" /></SelectTrigger>
                <SelectContent>
                  {(eventNames as string[]).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">A lista inclui os eventos padrão + tudo que já chegou nos últimos 30 dias.</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor padrão (opcional, R$)</label>
              <Input type="number" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} placeholder="Ex.: 297" className="h-9 text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="text-xs px-3 py-2 rounded-md border border-border hover:bg-muted">Cancelar</button>
            <button
              onClick={() => save.mutate()}
              disabled={!name.trim() || !eventName.trim() || save.isPending}
              className="text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
