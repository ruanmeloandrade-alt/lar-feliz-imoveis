import { useState } from "react";
import { Plus, BarChart3 } from "lucide-react";
import { useComparisonWidgets, type ComparisonSize, type ComparisonWidget as ComparisonWidgetType } from "@/lib/comparison-widgets";
import { ComparisonWidget } from "./ComparisonWidget";
import { ComparisonBuilderDialog } from "./ComparisonBuilderDialog";
import { cn } from "@/lib/utils";

const SIZE_CLASS: Record<ComparisonSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-1 md:col-span-2 row-span-1",
  "2x2": "col-span-1 md:col-span-2 row-span-2",
};

export function ComparisonWidgetsSection() {
  const { widgets, remove, setSize } = useComparisonWidgets();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComparisonWidgetType | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(w: ComparisonWidgetType) {
    setEditing(w);
    setDialogOpen(true);
  }

  return (
    <section className="space-y-3 pt-2 print:hidden">
      <div className="border-t border-border pt-5 flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Gráficos comparativos</h2>
        <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
          {widgets.length} {widgets.length === 1 ? "gráfico" : "gráficos"}
        </span>
        <button
          onClick={openNew}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Novo comparativo
        </button>
      </div>

      {widgets.length === 0 ? (
        <button
          onClick={openNew}
          className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4 mx-auto mb-1 text-primary" />
          Crie um gráfico de barras, pizza ou ranking comparando 2 ou mais KPIs.
        </button>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-[220px] gap-3 [grid-auto-flow:dense]">
          {widgets.map((w) => (
            <div key={w.id} className={cn("h-full", SIZE_CLASS[w.size])}>
              <ComparisonWidget
                widget={w}
                onEdit={() => openEdit(w)}
                onRemove={() => remove(w.id)}
                onSize={(s) => setSize(w.id, s)}
              />
            </div>
          ))}
        </div>
      )}

      <ComparisonBuilderDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </section>
  );
}
