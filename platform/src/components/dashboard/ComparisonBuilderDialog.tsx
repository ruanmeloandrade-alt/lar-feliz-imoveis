import { useEffect, useMemo, useState } from "react";
import { X, Save, Search, BarChart3, PieChart as PieIcon, ListOrdered, Database, Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listKpiCatalog, type KpiCatalogGroup } from "@/lib/dashboard-config.functions";
import {
  newComparisonId,
  useComparisonWidgets,
  type ComparisonChartType,
  type ComparisonSize,
  type ComparisonWidget as ComparisonWidgetType,
} from "@/lib/comparison-widgets";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ComparisonWidgetType | null;
}

const CHART_OPTIONS: Array<{ type: ComparisonChartType; label: string; description: string; Icon: typeof BarChart3 }> = [
  { type: "bar", label: "Barras", description: "Compare valores absolutos lado a lado.", Icon: BarChart3 },
  { type: "pie", label: "Pizza", description: "Mostra a participação de cada KPI no total.", Icon: PieIcon },
  { type: "ranking", label: "Ranking", description: "Ordena os KPIs do maior para o menor.", Icon: ListOrdered },
];

export function ComparisonBuilderDialog({ open, onOpenChange, editing }: Props) {
  const { upsert } = useComparisonWidgets();
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<ComparisonChartType>("bar");
  const [size, setSize] = useState<ComparisonSize>("2x2");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [openSources, setOpenSources] = useState<string[]>(["crm"]);

  const loadCatalog = useServerFn(listKpiCatalog);
  const catalogQ = useQuery({
    queryKey: ["kpi-catalog"],
    queryFn: () => loadCatalog(),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setChartType(editing.chartType);
      setSize(editing.size);
      setSelected(editing.kpiKeys);
    } else {
      setTitle("");
      setChartType("bar");
      setSize("2x2");
      setSelected([]);
    }
    setSearch("");
  }, [open, editing]);

  const groups: KpiCatalogGroup[] = catalogQ.data?.groups ?? [];
  const query = search.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!query) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (k) =>
            k.label.toLowerCase().includes(query) ||
            k.description.toLowerCase().includes(query) ||
            (k.group ?? "").toLowerCase().includes(query),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  function toggle(id: string, connected: boolean) {
    if (!connected) return;
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function save() {
    if (selected.length < 2) return;
    const widget: ComparisonWidgetType = {
      id: editing?.id ?? newComparisonId(),
      title: title.trim() || "Comparativo",
      chartType,
      kpiKeys: selected,
      size,
    };
    upsert(widget);
    onOpenChange(false);
  }

  const canSave = selected.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl p-0 overflow-hidden gap-0">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {editing ? "Editar comparativo" : "Novo gráfico comparativo"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
                Selecione 2 ou mais KPIs e compare no mesmo gráfico. Os valores usam a mesma fonte real dos KPIs personalizados.
              </DialogDescription>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Título</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Distribuição de leads por origem"
                className="h-9 mt-1"
              />
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">Tipo de gráfico</div>
              <div className="grid grid-cols-3 gap-2">
                {CHART_OPTIONS.map(({ type, label, description, Icon }) => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    className={cn(
                      "text-left p-2.5 rounded-md border transition-all",
                      chartType === type
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn("w-3.5 h-3.5", chartType === type ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-bold text-foreground">{label}</span>
                      {chartType === type && <Check className="w-3 h-3 text-primary ml-auto" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar KPI para incluir no comparativo…"
                className="pl-8 h-9"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{selected.length}</span> KPIs selecionados
              {selected.length < 2 && <span className="ml-2 text-warning">(mínimo 2 para gerar o gráfico)</span>}
            </div>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-6 py-2">
          {catalogQ.isLoading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando catálogo…
            </div>
          )}
          <Accordion
            type="multiple"
            value={query ? filteredGroups.map((g) => g.source) : openSources}
            onValueChange={setOpenSources}
            className="w-full"
          >
            {filteredGroups.map((group) => (
              <AccordionItem key={group.source} value={group.source} className="border-border">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Database className="w-4 h-4 shrink-0 text-primary" />
                    <span className="text-sm font-bold text-foreground truncate">{group.label}</span>
                    <span
                      className={cn(
                        "text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0",
                        group.connected ? "bg-success/15 text-success" : group.comingSoon ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {group.connected ? "conectada" : group.comingSoon ? "em breve" : "não conectada"}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {group.items.length} KPIs
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {!group.connected && !group.comingSoon ? (
                    <div className="text-xs text-muted-foreground italic">Conecte esta integração para incluir seus KPIs.</div>
                  ) : group.comingSoon ? (
                    <div className="text-xs text-muted-foreground italic">Integração em breve.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {group.items.map((k) => {
                        const isOn = selected.includes(k.id);
                        return (
                          <button
                            key={k.id}
                            onClick={() => toggle(k.id, group.connected)}
                            className={cn(
                              "text-left p-2 rounded-md border text-xs transition-all",
                              isOn ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground truncate">{k.label}</span>
                              {isOn && <Check className="w-3 h-3 text-primary shrink-0" />}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{k.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-between gap-2">
          <button
            onClick={() => setSelected([])}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar seleção
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={!canSave}>
              <Save className="w-3.5 h-3.5" />
              {editing ? "Salvar alterações" : "Criar gráfico"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
