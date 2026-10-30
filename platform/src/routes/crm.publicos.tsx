// SLIM_AUDIENCE_OPERATIONS_V1
// SLIM_AUDIENCE_TABS_V1
import {createAudienceRequestTracker} from "@/lib/slim-audience-request";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Users, Plus, RefreshCw, Trash2, Send, Sparkles, Search, Loader2,
  Target, Mail, Phone, Radio, Filter, X, ExternalLink, Building2, ListChecks, TrendingUp, MessageSquare, UserCog, Zap, Bot,

} from "lucide-react";
import {SlimAudienceQueue} from "@/components/crm/SlimAudienceQueue";
import {SlimAudienceReport,useSlimAudienceScope} from "@/components/crm/SlimAudienceReport";
import {SlimMassBroadcastPanel} from "@/components/crm/SlimMassBroadcastPanel";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { PermissionGate } from "@/components/permissions/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatBRL, timeAgo } from "@/lib/crm-mock";
import {
  listCrmAudiences, previewCrmAudience, createCrmAudience, deleteCrmAudience,
  refreshCrmAudience, exportCrmAudienceToMeta, createCrmAudienceLookalike,
  broadcastCrmAudience, listAudienceFilterOptions,
  reactivateCrmAudienceWithSalesbot, reactivateCrmAudienceWithAgent,
  type AudienceFilters, type CustomFieldRule,
} from "@/lib/crm-audiences.functions";
import { listMetaSyncedAdAccounts } from "@/lib/meta.functions";
import { listEvolutionSessions } from "@/lib/evolution.functions";
import { listSalesbots } from "@/lib/salesbots.functions";
import { listConversationAgents } from "@/lib/conversation-agents.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/crm/publicos")({
  validateSearch:(search:Record<string,unknown>):{aba?:'listas'|'disparos'|'relatorio';campanha?:string}=>({
    aba:['listas','disparos','relatorio'].includes(String(search.aba))?search.aba as 'listas'|'disparos'|'relatorio':undefined,
    campanha:typeof search.campanha==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.campanha)?search.campanha:undefined,
  }),
  head: () => ({
    meta: [
      { title: "Públicos · Vanessa Simoni" },
      { name: "description", content: "Crie e gerencie públicos da Vanessa Simoni para disparos e lookalikes." },
    ],
  }),
  component: () => (
    <PermissionGate moduleId="crm">
      <PublicosPage />
    </PermissionGate>
  ),
});

const EMPTY: AudienceFilters = {
  status: "active",
  lastMessageFrom: "any",
};

function PublicosPage() {
  const navigate=useNavigate(),queryClient=useQueryClient();
  const search=Route.useSearch(),tab=search.aba??'listas';
  const scopeQuery=useSlimAudienceScope(),scope=scopeQuery.data??null;
  const [broadcastPending,setBroadcastPending]=useState(false);
  const broadcastPendingRef=useRef(false);
  const updateBroadcastPending=useCallback((pending:boolean)=>{broadcastPendingRef.current=pending;setBroadcastPending(pending);},[]);
  function selectTab(aba:'listas'|'disparos'|'relatorio',campanha?:string){
    if(broadcastPendingRef.current){toast.info('Aguarde o registro do disparo antes de mudar de aba.');return;}
    void navigate({to:'/crm/publicos',search:{aba,campanha}});
  }

  const load = useServerFn(listCrmAudiences);
  const remove = useServerFn(deleteCrmAudience);
  const refresh = useServerFn(refreshCrmAudience);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<{ id: string; name: string; synced: boolean } | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [audienceQuery, setAudienceQuery] = useState("");

  const q = useQuery({
    queryKey: ["crm-audiences",scope?.workspaceId,scope?.actorId],
    enabled:!!scope,
    queryFn: () => load(),
    staleTime: 20_000,
  });
  const audiences = q.data?.audiences ?? [];

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o público "${name}"?`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Público removido");
      q.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao remover"); }
  }
  async function handleRefresh(id: string) {
    try {
      const r = await refresh({ data: { id } });
      toast.success(`${r.count} leads`);
      q.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao atualizar"); }
  }

  const totalLeads = useMemo(
    () => audiences.reduce((sum, a) => sum + (a.cached_count ?? 0), 0),
    [audiences],
  );
  const syncedAudiences = useMemo(
    () => audiences.filter((a) => !!a.meta_audience_id).length,
    [audiences],
  );
  const filteredAudiences = useMemo(() => {
    const needle = audienceQuery.trim().toLowerCase();
    if (!needle) return audiences;
    return audiences.filter((a) =>
      a.name.toLowerCase().includes(needle) ||
      (a.description ?? "").toLowerCase().includes(needle),
    );
  }, [audiences, audienceQuery]);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-3 py-4 sm:px-4 md:px-6 md:py-6 space-y-4">
            <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Target className="h-3.5 w-3.5" />
                  CRM · Públicos
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Públicos</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Crie e gerencie segmentos reais da base da Vanessa Simoni para usar em disparos, reativação e lookalikes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
                <Button size="sm" onClick={() => setCreatorOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Criar público
                </Button>
              </div>
            </header>
            <nav role="tablist" aria-label="Navegação de Públicos" className="flex flex-wrap gap-2 border-b border-border pb-3">
              {([['listas','Listas'],['disparos','Disparo em massa'],['relatorio','Relatório detalhado']] as const).map(([id,label])=><Button key={id} id={`publicos-tab-${id}`} type="button" role="tab" aria-selected={tab===id} aria-controls={`publicos-panel-${id}`} variant={tab===id?'secondary':'ghost'} size="sm" disabled={broadcastPending} onClick={()=>selectTab(id)}>{label}</Button>)}
            </nav>
            {scopeQuery.error?<p role="alert" className="text-sm text-destructive">{scopeQuery.error instanceof Error?scopeQuery.error.message:'Não foi possível conferir a empresa ativa.'}</p>:!scope?<p role="status" className="text-sm text-muted-foreground">Conferindo a empresa ativa...</p>:null}
            <div id="publicos-panel-listas" role="tabpanel" aria-labelledby="publicos-tab-listas" hidden={tab!=='listas'||!scope} style={{display:tab==='listas'&&scope?'block':'none'}} className="space-y-4">
            <SlimAudienceQueue scope={scope} onReport={id=>selectTab('relatorio',id)} />
            {q.error&&<p role="alert" className="text-sm text-destructive">Não foi possível carregar os públicos. Atualize a página.</p>}


            <section className="grid gap-2 sm:grid-cols-3" aria-label="Resumo de públicos">
              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Listas</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{audiences.length.toLocaleString("pt-BR")}</div>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contatos nas listas</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{totalLeads.toLocaleString("pt-BR")}</div>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sincronizados com Meta</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{syncedAudiences.toLocaleString("pt-BR")}</div>
              </div>
            </section>

            <p className="text-xs text-muted-foreground">As contagens são as últimas registradas de cada lista. Um mesmo contato pode aparecer em mais de um público.</p>
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Públicos criados</h2>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {filteredAudiences.length === audiences.length
                      ? `${audiences.length} público${audiences.length === 1 ? "" : "s"}`
                      : `${filteredAudiences.length} de ${audiences.length} públicos`}
                  </p>
                </div>
                <div className="relative w-full sm:w-[280px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={audienceQuery}
                    onChange={(event) => setAudienceQuery(event.target.value)}
                    placeholder="Buscar público..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              {q.isLoading ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : filteredAudiences.length === 0 ? (
                <div className="p-10 text-center">
                  <Target className="mx-auto mb-2 h-9 w-9 text-muted-foreground/35" />
                  <p className="text-sm font-medium">
                    {audiences.length === 0 ? "Nenhum público criado" : "Nenhum público encontrado"}
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    {audiences.length === 0
                      ? "Crie um segmento usando os dados e filtros que já existem no CRM."
                      : "Ajuste a busca para localizar outro público."}
                  </p>
                  {audiences.length === 0 ? (
                    <Button size="sm" className="mt-3" onClick={() => setCreatorOpen(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Criar primeiro público
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredAudiences.map((a) => (
                    <li key={a.id} className="group px-3 py-3 transition-colors hover:bg-muted/25 sm:px-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/35 text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="truncate text-sm font-semibold">{a.name}</h3>
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                                {(a.cached_count ?? 0).toLocaleString("pt-BR")} leads
                              </Badge>
                              {a.meta_audience_id ? (
                                <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] font-medium">
                                  <Sparkles className="h-3 w-3" /> Meta sincronizado
                                </Badge>
                              ) : null}
                            </div>
                            {a.description ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.description}</p>
                            ) : null}
                            <FilterChips filters={a.filters} />
                            <div className="mt-1.5 text-[10px] text-muted-foreground">
                              Atualizado {timeAgo(a.updated_at)}
                              {a.cached_at ? ` · contagem ${timeAgo(a.cached_at)}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 xl:max-w-[440px] xl:justify-end">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setExportTarget({ id: a.id, name: a.name, synced: !!a.meta_audience_id })}>
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Meta
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setReactivateTarget({ id: a.id, name: a.name })}>
                            <Zap className="mr-1.5 h-3.5 w-3.5" /> Reativar
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleRefresh(a.id)} title="Recalcular público">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(a.id, a.name)} title="Excluir público">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </div>
            <div id="publicos-panel-disparos" role="tabpanel" aria-labelledby="publicos-tab-disparos" hidden={tab!=='disparos'||!scope} style={{display:tab==='disparos'&&scope?'block':'none'}} className="space-y-4">
              <SlimMassBroadcastPanel active={tab==='disparos'} scope={scope} onPendingChange={updateBroadcastPending} onOpenLists={()=>selectTab('listas')} onRegistered={id=>{void queryClient.invalidateQueries({queryKey:['slim-audience-campaigns']});void queryClient.invalidateQueries({queryKey:['slim-audience-report']});selectTab('relatorio',id);}} />
              <SlimAudienceQueue scope={scope} onReport={id=>selectTab('relatorio',id)} />
            </div>
            <div id="publicos-panel-relatorio" role="tabpanel" aria-labelledby="publicos-tab-relatorio" hidden={tab!=='relatorio'||!scope} style={{display:tab==='relatorio'&&scope?'block':'none'}}>
              <SlimAudienceReport active={tab==='relatorio'} scope={scope} audiences={audiences} initialCampaignId={search.campanha} />
            </div>
          </div>
        </div>
      </main>

      <AudienceCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        onCreated={() => { setCreatorOpen(false); q.refetch(); }}
      />
      <ExportToMetaDialog
        target={exportTarget}
        onOpenChange={(v) => !v && setExportTarget(null)}
        onDone={() => { setExportTarget(null); q.refetch(); }}
      />
      <ReactivateDialog
        target={reactivateTarget}
        onOpenChange={(v) => !v && setReactivateTarget(null)}
        onDone={() => setReactivateTarget(null)}
      />
    </div>
  );
}

function FilterChips({ filters }: { filters: AudienceFilters }) {
  const chips: string[] = [];
  if (filters.pipelineIds?.length) chips.push(`${filters.pipelineIds.length} funil(is)`);
  if (filters.stageIds?.length) chips.push(`${filters.stageIds.length} etapa(s)`);
  if (filters.tagsAny?.length) chips.push(`tags: ${filters.tagsAny.slice(0, 3).join(", ")}${filters.tagsAny.length > 3 ? "…" : ""}`);
  if (filters.tagsNone?.length) chips.push(`exclui: ${filters.tagsNone.slice(0, 2).join(", ")}`);
  if (filters.sourceIds?.length) chips.push(`${filters.sourceIds.length} origem(s)`);
  if (filters.customFields?.length) chips.push(`${filters.customFields.length} campo(s) personalizado(s)`);
  if (filters.hasEmail) chips.push("com e-mail");
  if (filters.hasPhone) chips.push("com telefone");
  if (filters.lastMessageFrom && filters.lastMessageFrom !== "any") chips.push(`última msg: ${filters.lastMessageFrom}`);
  if (filters.updatedWithinDays) chips.push(`ativos ${filters.updatedWithinDays}d`);
  if (typeof filters.valueMin === "number") chips.push(`≥ ${formatBRL(filters.valueMin)}`);
  if (typeof filters.valueMax === "number") chips.push(`≤ ${formatBRL(filters.valueMax)}`);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {chips.map((c, i) => (
        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c}</span>
      ))}
    </div>
  );
}

// ---------- Creator ----------

function AudienceCreator({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const loadOptions = useServerFn(listAudienceFilterOptions);
  const preview = useServerFn(previewCrmAudience);
  const create = useServerFn(createCrmAudience);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<AudienceFilters>(EMPTY);
  const [previewData, setPreviewData] = useState<{ count: number; withEmail: number; withPhone: number; sample: Array<{ id: string; name: string; email: string | null; phone: string | null; value: number }> } | null>(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  useEffect(() => {
    if (!open) {
      setName(""); setDescription(""); setFilters(EMPTY); setPreviewData(null);
    }
  }, [open]);

  const optionsQ = useQuery({
    queryKey: ["crm-audience-options"],
    queryFn: () => loadOptions(),
    enabled: open,
    staleTime: 60_000,
  });
  const pipelines = optionsQ.data?.pipelines ?? [];
  const sources = optionsQ.data?.sources ?? [];
  const providers = optionsQ.data?.providers ?? [];
  const tags = optionsQ.data?.tags ?? [];
  const customFields = optionsQ.data?.customFields ?? [];
  const users = optionsQ.data?.users ?? [];
  const companies = optionsQ.data?.companies ?? [];

  const stages = useMemo(() => {
    const selected = new Set(filters.pipelineIds ?? []);
    return pipelines
      .filter((p) => selected.size === 0 || selected.has(p.id))
      .flatMap((p) => p.stages.map((s) => ({ ...s, pipelineName: p.name })));
  }, [pipelines, filters.pipelineIds]);

  async function runPreview() {
    setBusyPreview(true);
    try {
      const r = await preview({ data: { filters } });
      setPreviewData(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha no preview"); }
    finally { setBusyPreview(false); }
  }

  async function handleCreate() {
    if (name.trim().length < 2) { toast.error("Dê um nome ao público"); return; }
    setBusyCreate(true);
    try {
      await create({ data: { name: name.trim(), description: description.trim() || null, filters } });
      toast.success("Público criado");
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao criar"); }
    finally { setBusyCreate(false); }
  }

  function toggleArr<T extends string>(key: keyof AudienceFilters, v: T) {
    setFilters((f) => {
      const cur = new Set((f[key] as T[] | undefined) ?? []);
      if (cur.has(v)) cur.delete(v); else cur.add(v);
      const arr = Array.from(cur);
      return { ...f, [key]: arr.length ? arr : undefined } as AudienceFilters;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl max-h-[92vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Novo público
          </DialogTitle>
          <DialogDescription className="text-xs">
            Combine filtros dos seus leads. Todos são cumulativos (AND).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-[1fr_360px]">
          <div className="p-5 space-y-4 border-r border-border">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Não finalizados 30d" />
              </div>
              <div>
                <Label className="text-xs">Status do lead</Label>
                <Select value={filters.status ?? "active"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as AudienceFilters["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="won">Ganhos</SelectItem>
                    <SelectItem value="lost">Perdidos</SelectItem>
                    <SelectItem value="any">Qualquer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Opcional" />
            </div>


            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Se o lead corresponder a <strong>todas</strong> as condições selecionadas abaixo, entra no público.
            </div>

            <Accordion type="multiple" defaultValue={["lead"]} className="w-full">
              {/* ───── LEAD ───── */}
              <AccordionItem value="lead">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Lead</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div>
                    <Label className="text-xs">Nome contém</Label>
                    <Input value={filters.search ?? ""} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))} placeholder="Ex.: Mariana" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Criados de</Label>
                      <Input type="date" value={filters.createdFrom?.slice(0,10) ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, createdFrom: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Até</Label>
                      <Input type="date" value={filters.createdTo?.slice(0,10) ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, createdTo: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Valor mín (R$)</Label>
                      <Input type="number" min={0} value={filters.valueMin ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, valueMin: e.target.value ? Number(e.target.value) : null }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Valor máx (R$)</Label>
                      <Input type="number" min={0} value={filters.valueMax ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, valueMax: e.target.value ? Number(e.target.value) : null }))} />
                    </div>
                  </div>
                  {filters.status === "lost" && (
                    <div>
                      <Label className="text-xs">Motivo da perda contém</Label>
                      <Input value={filters.lostReasonContains ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, lostReasonContains: e.target.value || undefined }))}
                        placeholder="Ex.: preço" />
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* ───── CRM ───── */}
              <AccordionItem value="crm">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5" /> CRM · Funil, etapa, tags</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Funis</Label>
                    {pipelines.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum funil.</p> : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {pipelines.map((p) => (
                          <Chip key={p.id} active={filters.pipelineIds?.includes(p.id) ?? false} onClick={() => toggleArr("pipelineIds", p.id)}>{p.name}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Etapas</Label>
                    {stages.length === 0 ? <p className="text-[11px] text-muted-foreground">Selecione um funil.</p> : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {stages.map((s) => (
                          <Chip key={s.id} active={filters.stageIds?.includes(s.id) ?? false} onClick={() => toggleArr("stageIds", s.id)}>
                            {s.name}<span className="text-[9px] opacity-60 ml-1">· {s.pipelineName}</span>
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Tags, inclui</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {tags.length === 0 ? <p className="text-[11px] text-muted-foreground">Sem tags.</p> :
                        tags.map((t) => (<Chip key={t} active={filters.tagsAny?.includes(t) ?? false} onClick={() => toggleArr("tagsAny", t)}>{t}</Chip>))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Tags, exclui</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {tags.map((t) => (<Chip key={t} active={filters.tagsNone?.includes(t) ?? false} onClick={() => toggleArr("tagsNone", t)} variant="danger">{t}</Chip>))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Origem (nome)</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {sources.length === 0 ? <p className="text-[11px] text-muted-foreground">Sem origens.</p> :
                        sources.map((s) => (<Chip key={s.id} active={filters.sourceIds?.includes(s.id) ?? false} onClick={() => toggleArr("sourceIds", s.id)}>{s.name}</Chip>))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Canal / provedor</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {providers.length === 0 ? <p className="text-[11px] text-muted-foreground">Sem canais.</p> :
                        providers.map((p) => (<Chip key={p} active={filters.channelProviders?.includes(p) ?? false} onClick={() => toggleArr("channelProviders", p)}>{p}</Chip>))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Responsável</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {users.length === 0 ? <p className="text-[11px] text-muted-foreground">Sem usuários.</p> :
                        users.map((u) => (<Chip key={u.id} active={filters.responsibleIds?.includes(u.id) ?? false} onClick={() => toggleArr("responsibleIds", u.id)}>{u.name}</Chip>))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ───── CAMPOS PERSONALIZADOS ───── */}
              <AccordionItem value="campos">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><Filter className="w-3.5 h-3.5" /> Campos personalizados</span>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <CustomFieldsEditor
                    fields={customFields}
                    rules={filters.customFields ?? []}
                    onChange={(rules) => setFilters((f) => ({ ...f, customFields: rules.length ? rules : undefined }))}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* ───── EMPRESA / PRODUTO ───── */}
              <AccordionItem value="empresa">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Empresa & Produto</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Empresa vinculada</Label>
                    {companies.length === 0 ? <p className="text-[11px] text-muted-foreground">Sem empresas.</p> : (
                      <div className="flex flex-wrap gap-1.5 mt-1 max-h-32 overflow-y-auto">
                        {companies.map((c) => (
                          <Chip key={c.id} active={filters.companyIds?.includes(c.id) ?? false} onClick={() => toggleArr("companyIds", c.id)}>{c.name}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TriState label="Tem empresa" value={filters.hasCompany} onChange={(v) => setFilters((f) => ({ ...f, hasCompany: v }))} />
                    <TriState label="Tem produto associado" value={filters.hasProducts} onChange={(v) => setFilters((f) => ({ ...f, hasProducts: v }))} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ───── CONVERSA ───── */}
              <AccordionItem value="conversa">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Conversa</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Última mensagem</Label>
                      <Select value={filters.lastMessageFrom ?? "any"} onValueChange={(v) => setFilters((f) => ({ ...f, lastMessageFrom: v as AudienceFilters["lastMessageFrom"] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer</SelectItem>
                          <SelectItem value="lead">Do lead (aguardando)</SelectItem>
                          <SelectItem value="us">Nossa</SelectItem>
                          <SelectItem value="none">Nenhuma</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status da conversa</Label>
                      <Select value={filters.conversationStatus ?? "any"} onValueChange={(v) => setFilters((f) => ({ ...f, conversationStatus: v as AudienceFilters["conversationStatus"] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer</SelectItem>
                          <SelectItem value="aberta">Aberta</SelectItem>
                          <SelectItem value="lida">Lida</SelectItem>
                          <SelectItem value="fechada">Fechada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Atualizados nos últimos (dias)</Label>
                      <Input type="number" min={1} max={365}
                        value={filters.updatedWithinDays ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, updatedWithinDays: e.target.value ? Number(e.target.value) : null }))}
                        placeholder="ex.: 30" />
                    </div>
                    <div>
                      <Label className="text-xs">Sem mensagem há (dias)</Label>
                      <Input type="number" min={1} max={365}
                        value={filters.noMessageForDays ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, noMessageForDays: e.target.value ? Number(e.target.value) : null }))}
                        placeholder="ex.: 7" />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ───── TAREFAS ───── */}
              <AccordionItem value="tarefas">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><UserCog className="w-3.5 h-3.5" /> Tarefas</span>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <Label className="text-xs">Estado das tarefas</Label>
                  <Select value={filters.taskState ?? "any"} onValueChange={(v) => setFilters((f) => ({ ...f, taskState: v as AudienceFilters["taskState"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="has_open">Tem tarefa aberta</SelectItem>
                      <SelectItem value="has_overdue">Tem tarefa atrasada</SelectItem>
                      <SelectItem value="has_completed">Tem tarefa concluída</SelectItem>
                      <SelectItem value="none">Sem tarefas</SelectItem>
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              {/* ───── UTM / MARKETING ───── */}
              <AccordionItem value="utm">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Marketing / UTM</span>
                </AccordionTrigger>
                <AccordionContent className="grid md:grid-cols-3 gap-2 pt-2">
                  <div>
                    <Label className="text-xs">utm_source</Label>
                    <Input value={filters.utmSource ?? ""} onChange={(e) => setFilters((f) => ({ ...f, utmSource: e.target.value || undefined }))} placeholder="facebook" />
                  </div>
                  <div>
                    <Label className="text-xs">utm_medium</Label>
                    <Input value={filters.utmMedium ?? ""} onChange={(e) => setFilters((f) => ({ ...f, utmMedium: e.target.value || undefined }))} placeholder="cpc" />
                  </div>
                  <div>
                    <Label className="text-xs">utm_campaign</Label>
                    <Input value={filters.utmCampaign ?? ""} onChange={(e) => setFilters((f) => ({ ...f, utmCampaign: e.target.value || undefined }))} placeholder="black-friday" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ───── CONTATO ───── */}
              <AccordionItem value="contato">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-2"><Radio className="w-3.5 h-3.5" /> Contato disponível</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2">
                  <p className="text-[11px] text-muted-foreground">Filtra pelos leads que têm cada tipo de contato, útil pra escolher só quem dá pra atingir por e-mail (Meta / e-mail marketing) ou por WhatsApp / SMS.</p>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="accent-primary"
                      checked={filters.hasEmail ?? false}
                      onChange={(e) => setFilters((f) => ({ ...f, hasEmail: e.target.checked || undefined }))} />
                    Só com e-mail
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="accent-primary"
                      checked={filters.hasPhone ?? false}
                      onChange={(e) => setFilters((f) => ({ ...f, hasPhone: e.target.checked || undefined }))} />
                    Só com telefone
                  </label>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>



          {/* Preview */}
          <div className="p-5 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Prévia do público</h3>
              <Button size="sm" variant="outline" onClick={runPreview} disabled={busyPreview}>
                {busyPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span className="ml-1.5">Calcular</span>
              </Button>
            </div>
            {previewData ? (
              <>
                <div className="rounded-lg border border-border bg-card p-4 text-center">
                  <div className="text-3xl font-bold tabular-nums text-primary">{previewData.count.toLocaleString("pt-BR")}</div>
                  <div className="text-[11px] text-muted-foreground">leads no público</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatBox icon={Mail} label="com e-mail" value={previewData.withEmail} />
                  <StatBox icon={Phone} label="com telefone" value={previewData.withPhone} />
                </div>
                <div>
                  <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Amostra</h4>
                  <ul className="space-y-1 max-h-[200px] overflow-y-auto">
                    {previewData.sample.map((l) => (
                      <li key={l.id} className="text-xs px-2 py-1.5 rounded bg-card border border-border truncate">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {[l.email, l.phone].filter(Boolean).join(" · ") || "sem contato"}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Clique em "Calcular" para ver quantos leads batem com os filtros.</p>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={busyCreate || name.trim().length < 2}>
            {busyCreate ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
            Criar público
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterSection({ title, icon: Icon, children }: { title: string; icon: typeof Filter; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function TriState({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const cur = value === true ? "sim" : value === false ? "nao" : "any";
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={cur} onValueChange={(v) => onChange(v === "sim" ? true : v === "nao" ? false : undefined)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Qualquer</SelectItem>
          <SelectItem value="sim">Sim</SelectItem>
          <SelectItem value="nao">Não</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function Chip({ active, onClick, children, variant }: {
  active: boolean; onClick: () => void; children: React.ReactNode; variant?: "danger";
}) {
  const base = "text-[11px] px-2 py-1 rounded-md border transition";
  const cls = active
    ? variant === "danger"
      ? "bg-destructive/15 border-destructive/30 text-destructive"
      : "bg-primary/15 border-primary/40 text-primary"
    : "bg-card border-border text-foreground hover:bg-muted";
  return <button type="button" onClick={onClick} className={`${base} ${cls}`}>{children}</button>;
}

function StatBox({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] uppercase">{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

// ---------- Custom Fields editor ----------

function CustomFieldsEditor({ fields, rules, onChange }: {
  fields: Array<{ id: string; name: string; fieldType: string }>;
  rules: CustomFieldRule[];
  onChange: (rules: CustomFieldRule[]) => void;
}) {
  if (fields.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Nenhum campo personalizado cadastrado ainda. Crie em CRM · Leads.</p>;
  }
  const opLabels: Record<CustomFieldRule["op"], string> = {
    eq: "é igual a", neq: "é diferente de", contains: "contém",
    exists: "está preenchido", empty: "está vazio",
  };
  const needsValue = (op: CustomFieldRule["op"]) => op === "eq" || op === "neq" || op === "contains";

  function add() {
    onChange([...rules, { fieldId: fields[0].id, op: "exists" }]);
  }
  function update(i: number, patch: Partial<CustomFieldRule>) {
    const next = rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }
  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <Select value={r.fieldId} onValueChange={(v) => update(i, { fieldId: v })}>
            <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={r.op} onValueChange={(v) => update(i, { op: v as CustomFieldRule["op"], value: needsValue(v as CustomFieldRule["op"]) ? r.value ?? "" : undefined })}>
            <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(opLabels) as CustomFieldRule["op"][]).map((op) => (
                <SelectItem key={op} value={op}>{opLabels[op]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsValue(r.op) && (
            <Input
              className="h-8 text-xs flex-1 min-w-[140px]"
              value={r.value ?? ""}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="valor"
            />
          )}
          <Button size="sm" variant="ghost" onClick={() => remove(i)} className="h-8 w-8 p-0">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar regra
      </Button>
    </div>
  );
}

// ---------- Export to Meta ----------

function ExportToMetaDialog({ target, onOpenChange, onDone }: {
  target: { id: string; name: string; synced: boolean } | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const listAccts = useServerFn(listMetaSyncedAdAccounts);
  const doExport = useServerFn(exportCrmAudienceToMeta);
  const doLal = useServerFn(createCrmAudienceLookalike);
  const [wsId, setWsId] = useState<string | null>(null);
  const [adAccountId, setAdAccountId] = useState<string>("");
  const [retention, setRetention] = useState(30);
  const [alsoLal, setAlsoLal] = useState(true);
  const [country, setCountry] = useState("BR");
  const [ratioPct, setRatioPct] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);

  const acctQ = useQuery({
    queryKey: ["meta-ad-accounts", wsId],
    queryFn: () => listAccts({ data: { workspaceId: wsId! } }),
    enabled: !!wsId && !!target,
    staleTime: 60_000,
  });
  const accounts = acctQ.data?.accounts ?? [];
  const alreadySynced = !!target?.synced;

  async function handleRun() {
    if (!target || !adAccountId) return;
    setBusy(true);
    try {
      if (!alreadySynced) {
        const r = await doExport({ data: { id: target.id, adAccountId, retentionDays: retention } });
        toast.success(`Custom Audience criado: ${r.uploaded}/${r.total} contatos.`);
      }
      if (alsoLal) {
        const r = await doLal({ data: { id: target.id, adAccountId, country, ratio: ratioPct / 100 } });
        toast.success(`Lookalike ${ratioPct}% criado (${r.lookalikeId}).`);
      }
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao sincronizar"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Sincronizar com o Meta
          </DialogTitle>
          <DialogDescription className="text-xs">
            {alreadySynced
              ? "O Custom Audience já foi criado. Você pode gerar um novo Lookalike a partir dele."
              : "Cria um Custom Audience (SHA-256 de e-mail/telefone) e, opcionalmente, um Lookalike."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Público</Label>
            <div className="text-sm font-medium">{target?.name}</div>
          </div>
          <div>
            <Label className="text-xs">Conta de anúncios</Label>
            <Select value={adAccountId} onValueChange={setAdAccountId} disabled={acctQ.isLoading}>
              <SelectTrigger><SelectValue placeholder={acctQ.isLoading ? "Carregando…" : "Selecione…"} /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.account_id} value={a.account_id}>
                    {a.name ?? a.account_id} {a.currency ? `· ${a.currency}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && !acctQ.isLoading && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Nenhuma conta sincronizada. Conecte o Meta em <a href="/integracoes" className="underline">Integrações</a>.
              </p>
            )}
          </div>
          {!alreadySynced && (
            <div>
              <Label className="text-xs">Retenção (dias)</Label>
              <Input type="number" min={1} max={180} value={retention} onChange={(e) => setRetention(Number(e.target.value) || 30)} />
            </div>
          )}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={alsoLal} onChange={(e) => setAlsoLal(e.target.checked)} />
              Também criar Lookalike no Meta
            </label>
            {alsoLal && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-[11px]">País</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} placeholder="BR" />
                </div>
                <div>
                  <Label className="text-[11px]">Tamanho (%): {ratioPct}%</Label>
                  <Input type="number" min={1} max={20} value={ratioPct} onChange={(e) => setRatioPct(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleRun} disabled={!adAccountId || busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            Sincronizar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Broadcast (WhatsApp) ----------

function BroadcastDialog({ target, onOpenChange, onDone }: {
  target: { id: string; name: string } | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const listSessions = useServerFn(listEvolutionSessions);
  const doBroadcast = useServerFn(broadcastCrmAudience);
  const [requestTracker]=useState(()=>createAudienceRequestTracker());
  const [wsId, setWsId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [message, setMessage] = useState("Olá {{nome}}, tudo bem?");
  const [limit, setLimit] = useState(200);
  const [delayMs, setDelayMs] = useState(1500);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);

  const sessQ = useQuery({
    queryKey: ["evo-sessions", wsId],
    queryFn: () => listSessions({ data: { workspaceId: wsId! } }),
    enabled: !!wsId && !!target,
    staleTime: 30_000,
  });
  const sessions = sessQ.data?.sessions ?? [];

  async function handleSend() {
    if (!target || !sessionId || !message.trim()) return;
    setBusy(true);
    try {
      const r = await doBroadcast({ data: { id: target.id, sessionId, message, limit, delayMs, requestId:requestTracker({id:target.id,sessionId,message,limit,delayMs}) } });
      requestTracker.reset();toast.success(`Disparo registrado: ${r.queued} destinatários na fila.`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao transmitir"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-4 h-4" /> Iniciar transmissão
          </DialogTitle>
          <DialogDescription className="text-xs">
            Envia uma mensagem por WhatsApp (Evolution) para todos os contatos deste público. Use <code>{"{{nome}}"}</code> para personalizar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Público</Label>
            <div className="text-sm font-medium">{target?.name}</div>
          </div>
          <div>
            <Label className="text-xs">Número (Evolution)</Label>
            <p className="text-[11px] text-muted-foreground">O WhatsApp de origem de cada card é preservado. Esta seleção vale para contatos ainda sem origem.</p>
            <Select value={sessionId} onValueChange={setSessionId} disabled={sessQ.isLoading}>
              <SelectTrigger><SelectValue placeholder={sessQ.isLoading ? "Carregando…" : "Selecione…"} /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.phone_number ?? s.id.slice(0, 8)} · {s.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sessions.length === 0 && !sessQ.isLoading && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Nenhum WhatsApp conectado. Conecte em <a href="/integracoes" className="underline">Integrações</a>.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="text-[10px] text-muted-foreground mt-1">Variáveis: {"{{nome}}"}, {"{{email}}"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Limite de contatos</Label>
              <Input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 200)))} />
            </div>
            <div>
              <Label className="text-xs">Intervalo (ms)</Label>
              <Input type="number" min={500} max={15000} value={delayMs} onChange={(e) => setDelayMs(Math.max(500, Math.min(15000, Number(e.target.value) || 1500)))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!sessionId || !message.trim() || busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Radio className="w-3.5 h-3.5 mr-2" />}
            Enviar transmissão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Reactivate (Salesbot / Agente IA) ----------

function ReactivateDialog({ target, onOpenChange, onDone }: {
  target: { id: string; name: string } | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [wsId, setWsId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);

  const [tab, setTab] = useState<"salesbot" | "agent">("salesbot");
  const [busy, setBusy] = useState(false);
  const [requestTracker]=useState(()=>createAudienceRequestTracker());

  // Salesbot
  const loadBots = useServerFn(listSalesbots);
  const doSalesbot = useServerFn(reactivateCrmAudienceWithSalesbot);
  const botsQ = useQuery({
    queryKey: ["salesbots-list"],
    queryFn: () => loadBots(),
    enabled: !!target,
    staleTime: 30_000,
  });
  const bots = (botsQ.data?.bots ?? []).filter((b:any)=>b.is_active);
  const [salesbotId, setSalesbotId] = useState("");
  const [botDelay, setBotDelay] = useState(0);
  const [botLimit, setBotLimit] = useState(300);

  // Agente IA
  const loadAgents = useServerFn(listConversationAgents);
  const loadSessions = useServerFn(listEvolutionSessions);
  const doAgent = useServerFn(reactivateCrmAudienceWithAgent);
  const agentsQ = useQuery({
    queryKey: ["agents-list", wsId],
    queryFn: () => loadAgents({ data: { workspaceId: wsId! } }),
    enabled: !!wsId && !!target,
    staleTime: 30_000,
  });
  const sessQ = useQuery({
    queryKey: ["evo-sessions-react", wsId],
    queryFn: () => loadSessions({ data: { workspaceId: wsId! } }),
    enabled: !!wsId && !!target,
    staleTime: 30_000,
  });
  const agents = (agentsQ.data ?? []).filter((a:any)=>a.enabled);
  const sessions = (sessQ.data?.sessions ?? []).filter((s:any)=>s.status==="conectado");
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [agentMsg, setAgentMsg] = useState("Oi {{nome}}, tudo bem? Sou da equipe e queria te chamar rapidinho.");
  const [agentLimit, setAgentLimit] = useState(200);
  const [agentDelayMs, setAgentDelayMs] = useState(1500);

  async function handleRun() {
    if (!target) return;
    setBusy(true);
    try {
      if (tab === "salesbot") {
        if (!salesbotId) { toast.error("Escolha um Salesbot"); setBusy(false); return; }
        const r = await doSalesbot({ data: { id: target.id, salesbotId, delaySeconds: botDelay, limit: botLimit, requestId:requestTracker({id:target.id,salesbotId,botDelay,botLimit}) } });
        requestTracker.reset();toast.success(`SalesBot: ${r.queued} clientes enfileirados. Veja o progresso na página.`);
      } else {
        if (!agentId || !sessionId || !agentMsg.trim()) { toast.error("Complete os campos do Agente"); setBusy(false); return; }
        const r = await doAgent({ data: { id: target.id, agentId, sessionId, message: agentMsg, limit: agentLimit, delayMs: agentDelayMs, requestId:requestTracker({id:target.id,agentId,sessionId,agentMsg,agentLimit,agentDelayMs}) } });
        requestTracker.reset();toast.success(`Agente IA: ${r.queued} clientes na fila. Ativação e envio serão registrados no progresso.`);
      }
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao reativar"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Reativar público
          </DialogTitle>
          <DialogDescription className="text-xs">
            Envia um Salesbot ou coloca um Agente IA pra falar com todos os leads deste público.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Público</Label>
            <div className="text-sm font-medium">{target?.name}</div>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button type="button"
              onClick={() => setTab("salesbot")}
              className={`text-xs font-semibold py-1.5 rounded-md flex items-center justify-center gap-1.5 ${tab === "salesbot" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              <Send className="w-3 h-3" /> Salesbot
            </button>
            <button type="button"
              onClick={() => setTab("agent")}
              className={`text-xs font-semibold py-1.5 rounded-md flex items-center justify-center gap-1.5 ${tab === "agent" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              <Bot className="w-3 h-3" /> Agente IA
            </button>
          </div>

          {tab === "salesbot" ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Escolha o Salesbot</Label>
                <Select value={salesbotId} onValueChange={setSalesbotId}>
                  <SelectTrigger><SelectValue placeholder={botsQ.isLoading ? "Carregando…" : "Selecione…"} /></SelectTrigger>
                  <SelectContent>
                    {bots.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.is_active ? "" : "(inativo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bots.length === 0 && !botsQ.isLoading && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Nenhum Salesbot cadastrado. Crie em <a href="/crm/automacoes" className="underline">CRM · Automações</a>.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Atraso inicial (seg)</Label>
                  <Input type="number" min={0} max={86400} value={botDelay}
                    onChange={(e) => setBotDelay(Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div>
                  <Label className="text-xs">Limite de leads</Label>
                  <Input type="number" min={1} max={1000} value={botLimit}
                    onChange={(e) => setBotLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 300)))} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cria uma <em>run</em> do bot para cada lead do público, respeitando o seu fluxo (mensagens, pausas, condições).
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Agente IA</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger><SelectValue placeholder={agentsQ.isLoading ? "Carregando…" : "Selecione…"} /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">WhatsApp (Evolution)</Label>
            <p className="text-[11px] text-muted-foreground">O WhatsApp de origem de cada card é preservado. Esta seleção vale para contatos ainda sem origem.</p>
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger><SelectValue placeholder={sessQ.isLoading ? "Carregando…" : "Selecione…"} /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.phone_number ?? s.id.slice(0, 8)} · {s.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Primeira mensagem</Label>
                <Textarea rows={4} value={agentMsg} onChange={(e) => setAgentMsg(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">Variáveis: {"{{nome}}"}, {"{{email}}"}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Limite</Label>
                  <Input type="number" min={1} max={500} value={agentLimit}
                    onChange={(e) => setAgentLimit(Math.max(1, Math.min(500, Number(e.target.value) || 200)))} />
                </div>
                <div>
                  <Label className="text-xs">Intervalo (ms)</Label>
                  <Input type="number" min={500} max={15000} value={agentDelayMs}
                    onChange={(e) => setAgentDelayMs(Math.max(500, Math.min(15000, Number(e.target.value) || 1500)))} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Envia a primeira mensagem e vincula o agente ao lead, as próximas respostas caem no Agente IA escolhido.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleRun} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Zap className="w-3.5 h-3.5 mr-2" />}
            Reativar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
