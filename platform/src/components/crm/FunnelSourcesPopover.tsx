import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { listFunnelSourceIds, setFunnelSources } from "@/lib/crm.functions";

type SourceOpt = { id: string; provider: string; display_name: string };

const providerLabel: Record<string, string> = {
 mkton: "MKTOn",
 rd: "RD Station",
 hubspot: "HubSpot",
};

export function FunnelSourcesPopover({
 pipelineId,
 sources,
 onSaved,
}: {
 pipelineId: string;
 sources: SourceOpt[];
 onSaved?: () => void;
}) {
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [saving, setSaving] = useState(false);
 const [selected, setSelected] = useState<string[]>([]);
 const listFn = useServerFn(listFunnelSourceIds);
 const saveFn = useServerFn(setFunnelSources);

 useEffect(() => {
  if (!open || !pipelineId) return;
  setLoading(true);
  listFn({ data: { pipelineId } })
   .then((r) => setSelected(r.sourceIds ?? []))
   .catch((e) => toast.error(e instanceof Error ? e.message : "Falha ao carregar fontes"))
   .finally(() => setLoading(false));
 }, [open, pipelineId, listFn]);

 function toggle(id: string) {
  setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
 }

 async function save() {
  if (selected.length === 0) {
   toast.error("Selecione pelo menos uma fonte");
   return;
  }
  setSaving(true);
  try {
   await saveFn({ data: { pipelineId, crmSourceIds: selected } });
   toast.success("Fontes vinculadas ao funil");
   setOpen(false);
   onSaved?.();
  } catch (e) {
   toast.error(e instanceof Error ? e.message : "Falha ao salvar");
  } finally {
   setSaving(false);
  }
 }

 return (
  <Popover open={open} onOpenChange={setOpen}>
   <PopoverTrigger asChild>
    <button
     type="button"
     title="Fontes vinculadas a este funil"
     className={cn(
      "h-8 inline-flex items-center gap-1.5 px-2 rounded-md border border-border bg-background text-xs font-medium",
      "text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors",
     )}
    >
     <Link2 className="w-3.5 h-3.5" />
     <span className="hidden md:inline">Fontes</span>
    </button>
   </PopoverTrigger>
   <PopoverContent align="start" className="w-72 p-0">
    <div className="px-3 py-2.5 border-b border-border">
     <div className="text-xs font-semibold">Fontes vinculadas ao funil</div>
     <div className="text-[10px] text-muted-foreground mt-0.5">
      Marque quais CRMs alimentam este funil. Leads de fontes desmarcadas não entram aqui.
     </div>
    </div>

    <div className="max-h-64 overflow-y-auto py-1">
     {loading ? (
      <div className="px-3 py-4 text-[11px] text-muted-foreground flex items-center gap-2">
       <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
      </div>
     ) : sources.length === 0 ? (
      <div className="px-3 py-4 text-[11px] text-muted-foreground">
       Nenhuma fonte de CRM conectada neste workspace.
      </div>
     ) : (
      sources.map((s) => {
       const checked = selected.includes(s.id);
       return (
        <label
         key={s.id}
         className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 text-xs"
        >
         <Checkbox checked={checked} onCheckedChange={() => toggle(s.id)} />
         <span className="flex-1 truncate">
          <span className="font-medium">{providerLabel[s.provider] ?? s.provider}</span>
          <span className="text-muted-foreground"> · {s.display_name}</span>
         </span>
        </label>
       );
      })
     )}
    </div>

    <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2">
     <div className="text-[10px] text-muted-foreground tabular-nums">
      {selected.length} selecionada{selected.length === 1 ? "" : "s"}
     </div>
     <div className="flex items-center gap-1.5">
      <button
       type="button"
       onClick={() => setOpen(false)}
       className="h-7 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground"
      >
       Cancelar
      </button>
      <button
       type="button"
       onClick={save}
       disabled={saving || loading}
       className="h-7 px-3 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
       {saving ? "Salvando…" : "Salvar"}
      </button>
     </div>
    </div>
   </PopoverContent>
  </Popover>
 );
}
