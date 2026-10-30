import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { META_KPI_CATALOG, META_KPI_GROUPS, DEFAULT_META_KPIS } from "@/lib/meta-dashboard-kpis";
import { cn } from "@/lib/utils";
import { X, GripVertical } from "lucide-react";

export function KpiConfigDialog({
  open,
  onOpenChange,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string[];
  onSave: (keys: string[]) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setSelected(current); }, [open, current]);

  const toggle = (key: string) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const move = (key: string, dir: -1 | 1) => {
    setSelected((prev) => {
      const i = prev.indexOf(key);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const cp = [...prev];
      [cp[i], cp[j]] = [cp[j], cp[i]];
      return cp;
    });
  };

  const resetDefaults = () => setSelected(DEFAULT_META_KPIS);

  const doSave = async () => {
    setSaving(true);
    try { await onSave(selected); onOpenChange(false); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configurar KPIs do dashboard</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 max-h-[65vh]">
          {/* Catálogo por grupo */}
          <div className="overflow-auto pr-2 space-y-4">
            {META_KPI_GROUPS.map((group) => {
              const items = META_KPI_CATALOG.filter((k) => k.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{group}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {items.map((k) => {
                      const on = selected.includes(k.key);
                      return (
                        <label
                          key={k.key}
                          className={cn(
                            "flex items-start gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors",
                            on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                          )}
                        >
                          <Checkbox checked={on} onCheckedChange={() => toggle(k.key)} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{k.label}</div>
                            {k.description && <div className="text-[10px] text-muted-foreground truncate">{k.description}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ordem selecionada */}
          <div className="rounded-lg border border-border bg-background/50 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="text-xs font-medium">Ordem no dashboard</div>
              <button className="text-[10px] text-primary hover:underline" onClick={resetDefaults}>Padrão</button>
            </div>
            <div className="flex-1 overflow-auto p-1.5">
              {selected.length === 0 ? (
                <div className="p-3 text-[11px] text-muted-foreground">Selecione ao menos 1 KPI ao lado.</div>
              ) : selected.map((key, i) => {
                const def = META_KPI_CATALOG.find((k) => k.key === key);
                return (
                  <div key={key} className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-muted/50">
                    <div className="flex flex-col gap-0.5">
                      <button className="p-0.5 hover:text-primary disabled:opacity-30" disabled={i === 0} onClick={() => move(key, -1)}>▲</button>
                      <button className="p-0.5 hover:text-primary disabled:opacity-30" disabled={i === selected.length - 1} onClick={() => move(key, 1)}>▼</button>
                    </div>
                    <GripVertical className="w-3 h-3 text-muted-foreground" />
                    <div className="text-xs flex-1 truncate">{def?.label ?? key}</div>
                    <button className="p-0.5 text-muted-foreground hover:text-destructive" onClick={() => toggle(key)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="text-[11px] text-muted-foreground mr-auto self-center">
            {selected.length} KPI{selected.length === 1 ? "" : "s"} selecionado{selected.length === 1 ? "" : "s"} · aparecem também no relatório gerado
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={doSave} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
