import { useEffect, useMemo, useState } from "react";
import { X, Plug, Search, Save, Database, Loader2, Settings2, BarChart3 } from "lucide-react";
import { ComparisonBuilderDialog } from "./ComparisonBuilderDialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCustomKpis } from "@/lib/custom-kpis";
import { useKpiRules, type KpiRules } from "@/lib/kpi-rules";
import { useCriticalStage, type CriticalStageSelection } from "@/lib/critical-stage";
import { listKpiCatalog, listMetaDashboardAccounts, setMetaDashboardAccounts, type KpiCatalogGroup } from "@/lib/dashboard-config.functions";

import { cn } from "@/lib/utils";

interface RuleOption { id: string; name: string }
interface StageOption { id: string; name: string; pipeline_id: string; pipeline_name: string }
interface Props {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 ruleOptions?: { pipelines: RuleOption[]; originTags: RuleOption[]; stages?: StageOption[] };
}

export function AddKpiDialog({ open, onOpenChange, ruleOptions }: Props) {
 const { selectedIds, setSelected } = useCustomKpis();
 const { rules, setRules } = useKpiRules();
 const { selection: criticalSelection, setSelection: setCriticalSelection } = useCriticalStage();
 const queryClient = useQueryClient();
 const [draft, setDraft] = useState<string[]>(selectedIds);
 const [draftRules, setDraftRules] = useState<KpiRules>(rules);
 const [draftCritical, setDraftCritical] = useState<CriticalStageSelection>(criticalSelection);
 const [search, setSearch] = useState("");
 const [openSources, setOpenSources] = useState<string[]>(["crm"]);
 const [compareOpen, setCompareOpen] = useState(false);

 const loadCatalog = useServerFn(listKpiCatalog);
 const catalogQ = useQuery({
 queryKey: ["kpi-catalog"],
 queryFn: () => loadCatalog(),
 enabled: open,
 staleTime: 0,
 refetchOnMount: "always",
 });
 const syncMutation = { isPending: false, error: null as unknown, mutate: () => {} };

 useEffect(() => {
 if (open) {
 setDraft(selectedIds);
 setDraftRules(rules);
 setDraftCritical(criticalSelection);
 setSearch("");
 }
 }, [open, selectedIds, rules, criticalSelection]);

 const groups: KpiCatalogGroup[] = catalogQ.data?.groups?? [];
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
 (k.group?? "").toLowerCase().includes(query),
 ),
 }))
.filter((g) => g.items.length > 0);
 }, [groups, query]);

 function toggleDraft(id: string, connected: boolean) {
 if (!connected) return;
 setDraft((cur) => (cur.includes(id)? cur.filter((x) => x!== id): [...cur, id]));
 }

 function save() {
 setSelected(draft);
 setRules(draftRules);
 setCriticalSelection(draftCritical);
 queryClient.invalidateQueries({ queryKey: ["dashboard"] });
 onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="!max-w-3xl p-0 overflow-hidden gap-0">
 <div className="px-6 pt-5 pb-4 border-b border-border">
 <div className="flex items-start justify-between gap-3">
 <div>
 <DialogTitle className="text-lg font-bold text-foreground">
 Adicionar KPIs à Dashboard
 </DialogTitle>
 <DialogDescription className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
 As fontes abaixo se expandem em sanfona. Cada KPI vem da integração real
 - sem dado simulado. Conecte mais plataformas para liberar novos KPIs.
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

 <div className="mt-4 flex items-center gap-3">
 <div className="relative flex-1">
 <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Buscar KPI por nome ou descrição…"
 className="pl-8 h-9"
 />
 </div>
 <div className="text-[11px] text-muted-foreground whitespace-nowrap">
 <span className="font-semibold text-foreground tabular-nums">{draft.length}</span> selecionados
 </div>
 </div>
 </div>

 <div className="max-h-[60vh] overflow-y-auto px-6 py-2">
 <DataSourceSection value={draftRules} onChange={setDraftRules} />
 <WonStageSection
 options={ruleOptions?? { pipelines: [], originTags: [], stages: [] }}
 value={draftRules}
 onChange={setDraftRules}
 />
 <CriticalStageSection
 options={ruleOptions?? { pipelines: [], originTags: [], stages: [] }}
 value={draftCritical}
 onChange={setDraftCritical}
 />
 <RulesSection
 options={ruleOptions?? { pipelines: [], originTags: [], stages: [] }}
 value={draftRules}
 onChange={setDraftRules}
 />


 {catalogQ.isLoading && (
 <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
 <Loader2 className="w-4 h-4 animate-spin" /> Carregando catálogo real…
 </div>
 )}

 {catalogQ.error && (
 <div className="text-center py-10 text-sm text-danger">
 {catalogQ.error instanceof Error? catalogQ.error.message: "Erro ao carregar catálogo."}
 </div>
 )}

 {!catalogQ.isLoading && filteredGroups.length === 0 && (
 <div className="text-center py-10 text-sm text-muted-foreground">
 Nenhum KPI encontrado.
 </div>
 )}

 <Accordion
 type="multiple"
 value={query? filteredGroups.map((g) => g.source): openSources}
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
  group.connected? "bg-success/15 text-success": group.comingSoon? "bg-warning/15 text-warning": "bg-muted text-muted-foreground",
 )}
 >
  {group.connected? "conectada": group.comingSoon? "em breve": "não conectada"}
 </span>
 <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
 {group.items.length} KPIs
 </span>
 </div>
 </AccordionTrigger>
 <AccordionContent>
 <p className="text-xs text-muted-foreground mb-3">{group.caption}</p>

  {group.comingSoon ? (
  <div className="text-xs text-muted-foreground italic">
  Integração em breve.
  </div>
  ) : !group.connected? (
 <a
 href={group.connectHref?? "/integracoes"}
 className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
 >
 <Plug className="w-3 h-3" /> Conectar agora
 </a>
                ): group.items.length === 0? (
 <div className="text-xs text-muted-foreground italic">
 Nenhum KPI disponível ainda.
 </div>
                ): (
 <>
  {group.source === "meta_ads" && (
    <MetaAccountsPicker />
  )}

 <CatalogItems
 group={group}
 draft={draft}
 onToggle={(id) => toggleDraft(id, group.connected)}
 />
 </>
 )}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </div>

 <div className="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-between gap-2">
 <div className="flex items-center gap-3">
 <button
 onClick={() => setDraft([])}
 className="text-xs text-muted-foreground hover:text-foreground transition-colors"
 >
 Limpar seleção
 </button>
 <button
 onClick={() => setCompareOpen(true)}
 className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
 >
 <BarChart3 className="w-3.5 h-3.5" /> Novo gráfico comparativo
 </button>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
 Cancelar
 </Button>
 <Button size="sm" onClick={save}>
 <Save className="w-3.5 h-3.5" />
 Salvar ({draft.length})
 </Button>
 </div>
 </div>
 </DialogContent>
 <ComparisonBuilderDialog open={compareOpen} onOpenChange={setCompareOpen} />
 </Dialog>
 );
}

function MetaAccountsPicker() {
  const queryClient = useQueryClient();
  const loadAccounts = useServerFn(listMetaDashboardAccounts);
  const saveAccounts = useServerFn(setMetaDashboardAccounts);
  const q = useQuery({
    queryKey: ["meta-dashboard-accounts"],
    queryFn: () => loadAccounts(),
    staleTime: 30_000,
  });
  const accounts = q.data?.accounts ?? [];
  const selectedIds = useMemo(
    () => accounts.filter((a) => a.dashboard_enabled).map((a) => a.account_id),
    [accounts],
  );
  const mutation = useMutation({
    mutationFn: (ids: string[]) => saveAccounts({ data: { account_ids: ids } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-dashboard-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function toggle(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    mutation.mutate(next);
  }

  return (
    <div className="mb-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Contas de anúncio</span>
          {mutation.isPending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {selectedIds.length}/{accounts.length} selecionadas
        </span>
      </div>
      {q.isLoading ? (
        <p className="text-[11px] text-muted-foreground">Carregando contas…</p>
      ) : accounts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          Nenhuma conta de anúncio sincronizada. Conecte e sincronize sua conta Meta primeiro.
        </p>
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
            As KPIs de Meta Ads no dashboard virão da soma das contas marcadas abaixo.
          </p>
          <div className="max-h-40 overflow-auto space-y-1">
            {accounts.map((acc) => {
              const on = selectedIds.includes(acc.account_id);
              return (
                <label
                  key={acc.account_id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-background"
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={() => toggle(acc.account_id)}
                    disabled={mutation.isPending}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">
                      {acc.name || acc.account_id}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums truncate">
                      {acc.account_id}{acc.currency ? ` · ${acc.currency}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CatalogItems({
 group,
 draft,
 onToggle,
}: {
 group: KpiCatalogGroup;
 draft: string[];
 onToggle: (id: string) => void;
}) {
 // Group items by their "group" label with a stable, meaningful order
 const SUBGROUP_ORDER = ["Volume", "Financeiro", "Resultado", "Performance", "Funis", "Etapas do funil", "Tags", "Campos personalizados", "Responsáveis", "Geral"];
 const subgroups = useMemo(() => {
 const m = new Map<string, typeof group.items>();
 for (const it of group.items) {
 const g = it.group?? "Geral";
 if (!m.has(g)) m.set(g, []);
 m.get(g)!.push(it);
 }
 return Array.from(m.entries()).sort(([a], [b]) => {
 const ia = SUBGROUP_ORDER.indexOf(a); const ib = SUBGROUP_ORDER.indexOf(b);
 return (ia === -1? 999: ia) - (ib === -1? 999: ib);
 });
 }, [group.items]);

 return (
 <div className="space-y-4">
 {subgroups.map(([sub, items]) => (
 <div key={sub}>
 <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-2 flex items-center gap-2">
 <span>{sub}</span>
 <span className="tabular-nums text-muted-foreground/70">· {items.length}</span>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {items.map((k) => {
 const checked = draft.includes(k.id);
 return (
 <button
 key={k.id}
 onClick={() => onToggle(k.id)}
 className={cn(
 "text-left rounded-lg border p-2.5 transition-all flex items-start gap-3",
 checked? "border-primary bg-primary/5": "border-border bg-card hover:border-primary/40",
 )}
 >
 <div className="pt-0.5">
 <Checkbox checked={checked} className="pointer-events-none" />
 </div>
 <div className="min-w-0 flex-1">
 <div className="text-sm font-semibold text-foreground truncate">{k.label}</div>
 <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{k.description}</div>
 </div>
 </button>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 );
}

function RulesSection({
 options,
 value,
 onChange,
}: {
 options: { pipelines: RuleOption[]; originTags: RuleOption[]; stages?: StageOption[] };
 value: KpiRules;
 onChange: (next: KpiRules) => void;
}) {
 const hasPipelines = options.pipelines.length > 0;
 const stages = options.stages?? [];
 const hasStages = stages.length > 0;
 // Quando o usuário escolhe uma etapa de pós-venda, limpamos o funil de pós-venda (e vice-versa).
 function setPosvendaStage(stageId: string) {
 onChange({
...value,
 conversao_posvenda_stage_id: stageId || undefined,
 conversao_posvenda_pipeline_id: stageId? undefined: value.conversao_posvenda_pipeline_id,
 });
 }
 function setPosvendaPipeline(pipelineId: string) {
 onChange({
...value,
 conversao_posvenda_pipeline_id: pipelineId || undefined,
 conversao_posvenda_stage_id: pipelineId? undefined: value.conversao_posvenda_stage_id,
 });
 }
 return (
 <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
 <div className="flex items-center gap-2 mb-2">
 <Settings2 className="w-3.5 h-3.5 text-primary" />
 <div className="text-sm font-bold text-foreground">Regras das métricas</div>
 </div>
 <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
 A <strong>Taxa de Conversão</strong> é calculada como{" "}
 <em>leads no pós-venda ÷ leads recebidos</em>. Escolha qual funil <em>ou</em> qual etapa
 representa o seu pós-venda. Se quiser limitar o denominador, selecione um funil base.
 <br />
 Para acompanhar <strong>valor por funil ou por etapa</strong>, adicione os cards específicos
 em <em>CRM → Funis</em> ou <em>CRM → Etapas do funil</em> abaixo - você pode incluir
 quantos quiser.
 </p>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <RuleSelect
 label="Conversão · funil base (denominador)"
 help="Total de leads considerados. Vazio = todos os leads recebidos."
 value={value.conversao_pipeline_id?? ""}
 onChange={(v) => onChange({...value, conversao_pipeline_id: v || undefined })}
 options={[{ id: "", name: "Todos os leads" },...options.pipelines]}
 disabled={!hasPipelines}
 />
 <RuleSelect
 label="Pós-venda · funil inteiro"
 help={hasPipelines? "Conta como convertidos todos os leads neste funil.": "Crie um funil no CRM para listar aqui."}
 value={value.conversao_posvenda_pipeline_id?? ""}
 onChange={setPosvendaPipeline}
 options={[{ id: "", name: "Nenhum (usar etapa)" },...options.pipelines]}
 disabled={!hasPipelines || Boolean(value.conversao_posvenda_stage_id)}
 />
 <RuleSelect
 label="Pós-venda · etapa específica"
 help={hasStages? "Conta como convertidos só os leads nesta etapa.": "Crie etapas no CRM para listar aqui."}
 value={value.conversao_posvenda_stage_id?? ""}
 onChange={setPosvendaStage}
 options={[
 { id: "", name: "Nenhuma (usar funil)" },
...stages.map((s) => ({ id: s.id, name: `${s.pipeline_name} · ${s.name}` })),
 ]}
 disabled={!hasStages || Boolean(value.conversao_posvenda_pipeline_id)}
 />
 </div>
 </div>
 );
}

function RuleSelect({
 label,
 help,
 value,
 onChange,
 options,
 disabled,
}: {
 label: string;
 help: string;
 value: string;
 onChange: (v: string) => void;
 options: RuleOption[];
 disabled?: boolean;
}) {
 return (
 <label className="block">
 <span className="block text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">{label}</span>
 <select
 value={value}
 disabled={disabled}
 onChange={(e) => onChange(e.target.value)}
 className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
 >
 {options.map((o) => (
 <option key={o.id || "__all__"} value={o.id}>{o.name}</option>
 ))}
 </select>
 <span className="block mt-1 text-[10px] text-muted-foreground leading-snug">{help}</span>
 </label>
 );
}

function CriticalStageSection({
 options,
 value,
 onChange,
}: {
 options: { pipelines: RuleOption[]; originTags: RuleOption[]; stages?: StageOption[] };
 value: CriticalStageSelection;
 onChange: (next: CriticalStageSelection) => void;
}) {
 const pipelines = options.pipelines ?? [];
 const stages = options.stages ?? [];

 // Codifica a seleção como string: "" (nenhuma), "pipeline:<id>", "stage:<id>"
 const encoded = value?.kind === "pipeline" ? `pipeline:${value.pipelineId}` : value?.kind === "stage" ? `stage:${value.stageId}` : "";

 function handleChange(next: string) {
 if (!next) { onChange(null); return; }
 if (next.startsWith("pipeline:")) {
 const id = next.slice("pipeline:".length);
 const p = pipelines.find((x) => x.id === id);
 if (p) onChange({ kind: "pipeline", pipelineId: p.id, pipelineName: p.name });
 return;
 }
 if (next.startsWith("stage:")) {
 const id = next.slice("stage:".length);
 const s = stages.find((x) => x.id === id);
 if (s) onChange({ kind: "stage", stageId: s.id, label: s.name, pipelineName: s.pipeline_name });
 }
 }

 const hasData = pipelines.length > 0 || stages.length > 0;

 return (
 <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
 <div className="flex items-center gap-2 mb-2">
 <Settings2 className="w-3.5 h-3.5 text-primary" />
 <div className="text-sm font-bold text-foreground">Etapa crítica</div>
 </div>
 <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
 Escolha manualmente o que você quer monitorar como <strong>etapa crítica</strong> no topo do painel:
 um <em>funil inteiro</em> (soma de todas as etapas dele) ou uma <em>etapa específica</em>.
 Deixe em branco para o sistema usar a primeira etapa do funil.
 </p>
 <label className="block">
 <span className="block text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
 Monitorar como etapa crítica
 </span>
 <select
 value={encoded}
 onChange={(e) => handleChange(e.target.value)}
 disabled={!hasData}
 className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
 >
 <option value="">Automático (primeira etapa)</option>
 {pipelines.length > 0 && (
 <optgroup label="Funil inteiro">
 {pipelines.map((p) => (
 <option key={`pipeline:${p.id}`} value={`pipeline:${p.id}`}>{p.name}</option>
 ))}
 </optgroup>
 )}
 {stages.length > 0 && (
 <optgroup label="Etapa específica">
 {stages.map((s) => (
 <option key={`stage:${s.id}`} value={`stage:${s.id}`}>{s.pipeline_name} · {s.name}</option>
 ))}
 </optgroup>
 )}
 </select>
 <span className="block mt-1 text-[10px] text-muted-foreground leading-snug">
 {hasData ? "A escolha aparece no card 'Etapa crítica' do painel." : "Crie funis e etapas no CRM."}
 </span>
 </label>
 </div>
 );
}

function DataSourceSection({
  value,
  onChange,
}: {
  value: KpiRules;
  onChange: (next: KpiRules) => void;
}) {
  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-3.5 h-3.5 text-primary" />
        <div className="text-sm font-bold text-foreground">Fonte de dados do painel</div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Todas as KPIs padrão leem do <strong>CRM Vanessa Simoni nativo</strong>.
      </p>
      <button
        type="button"
        onClick={() => onChange({ ...value, data_source: "Vanessa Simoni" })}
        className={cn(
          "mt-3 h-9 w-full rounded-md border text-xs font-semibold border-primary bg-primary/10 text-primary",
        )}
      >
        CRM Vanessa Simoni
      </button>
    </div>
  );
}

function WonStageSection({
  options,
  value,
  onChange,
}: {
  options: { pipelines: RuleOption[]; originTags: RuleOption[]; stages?: StageOption[] };
  value: KpiRules;
  onChange: (next: KpiRules) => void;
}) {
  const pipelines = options.pipelines ?? [];
  const stages = options.stages ?? [];
  const encoded = value.venda_ganha_pipeline_id
    ? `pipeline:${value.venda_ganha_pipeline_id}`
    : value.venda_ganha_stage_id
      ? `stage:${value.venda_ganha_stage_id}`
      : "";

  function handleChange(next: string) {
    if (!next) {
      onChange({ ...value, venda_ganha_pipeline_id: undefined, venda_ganha_stage_id: undefined });
      return;
    }
    if (next.startsWith("pipeline:")) {
      onChange({ ...value, venda_ganha_pipeline_id: next.slice("pipeline:".length), venda_ganha_stage_id: undefined });
      return;
    }
    if (next.startsWith("stage:")) {
      onChange({ ...value, venda_ganha_stage_id: next.slice("stage:".length), venda_ganha_pipeline_id: undefined });
    }
  }

  const hasData = pipelines.length > 0 || stages.length > 0;

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-3.5 h-3.5 text-primary" />
        <div className="text-sm font-bold text-foreground">Venda ganha</div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
        Por padrão o sistema detecta "ganho" pelo nome da etapa (ex.: <em>Venda realizada</em>).
        Se a sua venda ganha fica em outro funil ou etapa, escolha manualmente abaixo, o card
        <strong> Vendas Ganhas</strong>, o <strong>Valor Ganho</strong>, o <strong>Ticket Médio</strong>
        {" "}e a <strong>Taxa de Conversão</strong> passam a usar essa regra.
      </p>
      <label className="block">
        <span className="block text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
          O que conta como venda ganha
        </span>
        <select
          value={encoded}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!hasData}
          className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
        >
          <option value="">Automático (pelo nome da etapa)</option>
          {pipelines.length > 0 && (
            <optgroup label="Funil inteiro">
              {pipelines.map((p) => (
                <option key={`pipeline:${p.id}`} value={`pipeline:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
          )}
          {stages.length > 0 && (
            <optgroup label="Etapa específica">
              {stages.map((s) => (
                <option key={`stage:${s.id}`} value={`stage:${s.id}`}>{s.pipeline_name} · {s.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="block mt-1 text-[10px] text-muted-foreground leading-snug">
          {hasData ? "Válido para todas as métricas de fechamento." : "Crie funis e etapas no CRM."}
        </span>
      </label>
    </div>
  );
}



