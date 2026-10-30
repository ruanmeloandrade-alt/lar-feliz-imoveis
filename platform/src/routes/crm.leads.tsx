import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ArrowUpDown,
  RefreshCw,
  ChevronRight,
  Users,
  Plus,
  Target,
  MessageSquare,
  Phone,
  Tag,
  Activity,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { PermissionGate } from "@/components/permissions/PermissionGate";
import { DuplicatesPanel } from "@/components/leads/DuplicatesPanel";
import { formatBRL, timeAgo } from "@/lib/crm-mock";
import type { LeadDetailResponse, LeadListRow } from "@/lib/leads.functions";
import { loadSlimLeads, loadSlimLeadDetail } from "@/lib/saude-slim-leads-client";
import { createSaudeSlimLead, createSaudeSlimSource, listSaudeSlimSources, listSaudeSlimPipelineStages } from "@/lib/saude-slim-orders-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/leads")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clientes · Vanessa Simoni" },
      { name: "description", content: "Lista e ficha de todos os clientes e leads da Vanessa Simoni." },
    ],
  }),
  component: () => (
    <PermissionGate moduleId="crm">
      <LeadsPage />
    </PermissionGate>
  ),
});

type SortKey = "name" | "value" | "stage" | "createdAt";

function LeadsPage() {
  const navigate = useNavigate();
  const loadLeads = loadSlimLeads;
  const loadLeadDetail = loadSlimLeadDetail;
  const createLeadFn = createSaudeSlimLead;
  const createSourceFn = createSaudeSlimSource;
  const loadSources = listSaudeSlimSources;
  const loadPipelines = listSaudeSlimPipelineStages;

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dupOpen, setDupOpen] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceId: "",
    sourceMode: "existing" as "existing" | "new",
    newSource: "",
    pipelineId: "",
    stageId: "",
    name: "",
    phone: "",
    email: "",
    address: "",
    instagram: "",
    facebook: "",
    value: "",
  });

  const leadsQuery = useQuery({
    queryKey: ["leads", "list"],
    queryFn: loadLeads,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["leads", "detail", detailLeadId],
    enabled: !!detailLeadId,
    queryFn: () => loadLeadDetail({ data: { leadId: detailLeadId! } }),
    staleTime: 15_000,
  });

  const sourcesQuery = useQuery({
    queryKey: ["crm", "sources"],
    queryFn: () => loadSources(),
    enabled: newOpen,
    staleTime: 60_000,
  });
  const pipelinesQuery = useQuery({
    queryKey: ["crm", "all-pipeline-stages"],
    queryFn: () => loadPipelines(),
    enabled: newOpen,
    staleTime: 60_000,
  });

  const allLeads: LeadListRow[] = leadsQuery.data?.leads ?? [];
  const sources = sourcesQuery.data?.sources ?? [];
  const pipelines = pipelinesQuery.data?.pipelines ?? [];
  const currentStages = pipelines.find((p) => p.id === form.pipelineId)?.stages ?? [];

  useEffect(() => {
    if (!newOpen) return;
    if (!form.sourceId && sources.length > 0) {
      const source = sources.find((item) => item.is_default) ?? sources[0];
      setForm((current) => ({ ...current, sourceId: source.id }));
    }
    if (!form.pipelineId && pipelines.length > 0) {
      const pipeline = pipelines[0];
      setForm((current) => ({ ...current, pipelineId: pipeline.id, stageId: pipeline.stages[0]?.id ?? "" }));
    }
  }, [newOpen, sources, pipelines, form.sourceId, form.pipelineId]);

  const stageOptions = useMemo(
    () => Array.from(new Set(allLeads.map((lead) => lead.stageName).filter((value): value is string => Boolean(value)))).sort(),
    [allLeads],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = allLeads.filter((lead) => {
      const matchText = !needle || [
        lead.name,
        lead.email,
        lead.phone,
        lead.stageName,
        lead.pipelineName,
        lead.sourceDisplayName,
      ].some((value) => (value ?? "").toLowerCase().includes(needle));
      return matchText && (stageFilter === "all" || lead.stageName === stageFilter);
    });
    const direction = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * direction;
      if (sortKey === "value") return (a.value - b.value) * direction;
      if (sortKey === "stage") return (a.stageName ?? "").localeCompare(b.stageName ?? "") * direction;
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction;
    });
  }, [allLeads, query, stageFilter, sortKey, sortDir]);

  const visibleValue = useMemo(
    () => filtered.reduce((total, lead) => total + (Number.isFinite(lead.value) ? lead.value : 0), 0),
    [filtered],
  );
  const hasActiveFilters = Boolean(query.trim()) || stageFilter !== "all";

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openNew() {
    setForm({ sourceId: "", sourceMode: "existing", newSource: "", pipelineId: "", stageId: "", name: "", phone: "", email: "", address: "", instagram: "", facebook: "", value: "" });
    setFormError(null);
    setNewOpen(true);
  }

  async function submitNew() {
    const name = form.name.trim();
    if (!name) return setFormError("Informe o nome do lead.");
    if (form.sourceMode === "existing" && !form.sourceId) return setFormError("Selecione uma fonte.");
    if (form.sourceMode === "new" && !form.newSource.trim()) return setFormError("Informe o nome da nova fonte.");
    if (!form.pipelineId || !form.stageId) return setFormError("Selecione funil e etapa.");
    const raw = form.value.replace(/[^\d.,-]/g, "").replace(",", ".");
    const numValue = raw ? Number(raw) : 0;
    setSaving(true);
    setFormError(null);
    try {
      const sourceId = form.sourceMode === "new"
        ? (await createSourceFn({ data: { name: form.newSource.trim() } })).sourceId
        : form.sourceId;
      await createLeadFn({
        data: {
          crmSourceId: sourceId,
          pipelineId: form.pipelineId,
          stageId: form.stageId,
          name,
          email: form.email.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          instagramHandle: form.instagram.trim(),
          facebookUrl: form.facebook.trim(),
          value: Number.isFinite(numValue) ? numValue : 0,
        },
      });
      toast.success("Lead criado");
      setNewOpen(false);
      await leadsQuery.refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Falha ao criar lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] w-full bg-[hsl(var(--muted)/0.16)] text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-5">
            <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-5 border-b border-border bg-gradient-to-r from-card via-card to-muted/35 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                    <UserRound className="h-3.5 w-3.5" /> Base comercial
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Clientes</h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Abra a ficha, revise contexto, acompanhe histórico e organize a base da Vanessa Simoni sem sair da operação.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" /> Novo cliente</Button>
                  <Button size="sm" variant="outline" onClick={() => setDupOpen(true)}><Users className="h-4 w-4" /> Duplicatas</Button>
                  <Button size="sm" variant="outline" onClick={() => navigate({ to: "/crm/publicos", search:{aba:"disparos"} })}>
                    <Target className="h-4 w-4" /> Disparo em massa
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => leadsQuery.refetch()} disabled={leadsQuery.isFetching}>
                    <RefreshCw className={cn("h-4 w-4", leadsQuery.isFetching && "animate-spin")} /> Atualizar
                  </Button>
                </div>
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-3">
                <Metric label="Clientes ativos" value={allLeads.length.toLocaleString("pt-BR")} />
                <Metric label="Exibidos agora" value={filtered.length.toLocaleString("pt-BR")} />
                <Metric label="Valor da seleção" value={formatBRL(visibleValue)} />
              </div>
            </header>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-3 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1 sm:max-w-xl">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, contato, etapa, funil ou origem" className="h-10 bg-background pl-9" />
                  </div>
                  <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="h-10 min-w-[190px] rounded-md border border-input bg-background px-3 text-sm">
                    <option value="all">Todas as etapas</option>
                    {stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                  {hasActiveFilters && <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setStageFilter("all"); }}>Limpar filtros</Button>}
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Clique em um cliente para abrir a ficha. Conversa é uma ação separada.
                </div>
              </div>

              {leadsQuery.error instanceof Error && (
                <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{leadsQuery.error.message}</div>
              )}

              <div className="md:hidden">
                {filtered.map((lead) => (
                  <button key={lead.id} type="button" onClick={() => setDetailLeadId(lead.id)} className="flex w-full items-start gap-3 border-b border-border px-3 py-4 text-left last:border-b-0 hover:bg-muted/35">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3"><span className="truncate text-sm font-semibold">{lead.name}</span><span className="text-sm font-semibold">{formatBRL(lead.value)}</span></div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{lead.phone ?? lead.email ?? "Sem contato"}</div>
                      <div className="mt-2 flex items-center justify-between gap-2"><span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">{lead.stageName ?? "Sem etapa"}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden md:block">
                <div className="grid grid-cols-[minmax(230px,1.45fr)_minmax(150px,.85fr)_minmax(200px,1fr)_130px_120px] gap-3 border-b border-border bg-muted/35 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <SortHeader label="Lead" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Etapa" k="stage" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <div>Contato</div>
                  <SortHeader label="Valor" k="value" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="justify-end" />
                  <SortHeader label="Atualizado" k="createdAt" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="justify-end" />
                </div>
                {filtered.length === 0 ? <EmptyState loading={leadsQuery.isLoading} onCreate={openNew} /> : (
                  <ul className="divide-y divide-border">
                    {filtered.map((lead) => (
                      <li key={lead.id}>
                        <button type="button" onClick={() => setDetailLeadId(lead.id)} className="grid w-full grid-cols-[minmax(230px,1.45fr)_minmax(150px,.85fr)_minmax(200px,1fr)_130px_120px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
                          <div className="min-w-0"><div className="truncate text-sm font-semibold">{lead.name}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{lead.pipelineName ?? lead.sourceDisplayName ?? "Origem não informada"}</div></div>
                          <div><span className="inline-flex max-w-full rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] font-medium"><span className="truncate">{lead.stageName ?? "Sem etapa"}</span></span></div>
                          <div className="min-w-0 text-xs text-muted-foreground"><div className="truncate">{lead.phone ?? lead.email ?? "Sem contato informado"}</div>{lead.phone && lead.email && <div className="mt-0.5 truncate text-[11px]">{lead.email}</div>}</div>
                          <div className="text-right text-sm font-semibold tabular-nums">{formatBRL(lead.value)}</div>
                          <div className="text-right text-xs text-muted-foreground">{timeAgo(lead.updatedAt)}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <DuplicatesPanel open={dupOpen} onOpenChange={setDupOpen} onMerged={() => leadsQuery.refetch()} />

      <LeadDetailDialog
        open={!!detailLeadId}
        detail={detailQuery.data as LeadDetailResponse | undefined}
        loading={detailQuery.isLoading}
        error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
        onClose={() => setDetailLeadId(null)}
        onOpenConversation={() => detailQuery.data?.lead.id && navigate({ to: "/inbox/leads/$leadId", params: { leadId: detailQuery.data.lead.id } })}
      />

      <Dialog open={newOpen} onOpenChange={(open) => { if (!saving) setNewOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Nome *"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Telefone"><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field><Field label="E-mail"><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field></div>
            <Field label="Endereço"><Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Opcional" /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Instagram"><Input value={form.instagram} onChange={(event) => setForm((current) => ({ ...current, instagram: event.target.value }))} /></Field><Field label="Facebook"><Input value={form.facebook} onChange={(event) => setForm((current) => ({ ...current, facebook: event.target.value }))} /></Field></div>
            <Field label="Fonte">
              <div className="grid grid-cols-[130px_1fr] gap-2">
                <select value={form.sourceMode} onChange={(event) => setForm((current) => ({ ...current, sourceMode: event.target.value as "existing" | "new" }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="existing">Existente</option>
                  <option value="new">Nova fonte</option>
                </select>
                {form.sourceMode === "existing" ? (
                  <select value={form.sourceId} onChange={(event) => setForm((current) => ({ ...current, sourceId: event.target.value }))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione…</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.display_name}</option>)}</select>
                ) : (
                  <Input value={form.newSource} onChange={(event) => setForm((current) => ({ ...current, newSource: event.target.value }))} placeholder="Ex: Indicação, Meta Ads, Evento" />
                )}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Funil"><select value={form.pipelineId} onChange={(event) => { const pipelineId = event.target.value; const pipeline = pipelines.find((item) => item.id === pipelineId); setForm((current) => ({ ...current, pipelineId, stageId: pipeline?.stages[0]?.id ?? "" })); }} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione…</option>{pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></Field>
              <Field label="Etapa"><select value={form.stageId} onChange={(event) => setForm((current) => ({ ...current, stageId: event.target.value }))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={!currentStages.length}>{currentStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
            </div>
            <Field label="Valor (R$)"><Input inputMode="decimal" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></Field>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" size="sm" onClick={() => setNewOpen(false)} disabled={saving}>Cancelar</Button><Button size="sm" onClick={submitNew} disabled={saving}>{saving ? "Criando…" : "Criar cliente"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadDetailDialog({ open, detail, loading, error, onClose, onOpenConversation }: {
  open: boolean;
  detail?: LeadDetailResponse;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenConversation: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 px-5 py-4">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Ficha do cliente</div><DialogTitle className="mt-1 text-xl">{detail?.lead.name ?? "Carregando…"}</DialogTitle></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[calc(90vh-76px)] overflow-y-auto p-5">
          {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Carregando ficha…</div> : error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : detail ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoCard label="Etapa" value={detail.lead.stageName ?? "Sem etapa"} />
                <InfoCard label="Funil" value={detail.lead.pipelineName ?? "Sem funil"} />
                <InfoCard label="Valor" value={formatBRL(detail.lead.value)} />
                <InfoCard label="Origem" value={detail.lead.sourceDisplayName} />
              </div>

              <section className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
                <div><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4 text-primary" /> Contato</div><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Telefone:</span> {detail.lead.phone ?? "Não informado"}</p><p><span className="text-muted-foreground">E-mail:</span> {detail.lead.email ?? "Não informado"}</p></div></div>
                <div><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4 text-primary" /> Tags</div><div className="flex flex-wrap gap-1.5">{detail.lead.tags.length ? detail.lead.tags.map((tag) => <span key={tag} className="rounded-full border border-border bg-muted px-2 py-1 text-[11px]">{tag}</span>) : <span className="text-sm text-muted-foreground">Nenhuma tag</span>}</div></div>
              </section>

              {detail.lead.customFields.length > 0 && (
                <section className="rounded-xl border border-border p-4"><div className="mb-3 text-sm font-semibold">Campos personalizados</div><div className="grid gap-3 sm:grid-cols-2">{detail.lead.customFields.map((field) => <div key={field.id} className="rounded-lg bg-muted/35 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.name}</div><div className="mt-1 text-sm font-medium">{field.displayValue || "—"}</div></div>)}</div></section>
              )}

              <section className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" /> Atividades recentes</div>
                <div className="space-y-2">{detail.activities.length ? detail.activities.slice(0, 12).map((activity) => <div key={activity.id} className="flex gap-3 rounded-lg bg-muted/30 px-3 py-2"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0"><div className="text-xs font-medium">{activity.type}</div><div className="truncate text-xs text-muted-foreground">{activity.text ?? "Atividade registrada"}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(activity.occurredAt)}</div></div></div>) : <div className="py-5 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</div>}</div>
              </section>

              <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                <div className="text-xs text-muted-foreground">Criado {timeAgo(detail.lead.createdAt)} · atualizado {timeAgo(detail.lead.updatedAt)}</div>
                <Button onClick={onOpenConversation}><MessageSquare className="h-4 w-4" /> Abrir conversa</Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-card px-5 py-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>;
}
function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;
}
function EmptyState({ loading, onCreate }: { loading: boolean; onCreate: () => void }) {
  return <div className="flex flex-col items-center justify-center px-4 py-12 text-center"><p className="text-sm font-medium">{loading ? "Carregando clientes…" : "Nenhum cliente encontrado"}</p>{!loading && <Button size="sm" className="mt-3" onClick={onCreate}><Plus className="h-4 w-4" /> Novo cliente</Button>}</div>;
}
function SortHeader({ label, k, sortKey, sortDir, onClick, className }: { label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onClick: (key: SortKey) => void; className?: string }) {
  const active = sortKey === k;
  return <button type="button" onClick={() => onClick(k)} className={cn("flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground", className)}>{label}<ArrowUpDown className={cn("h-3 w-3 opacity-50", active && "opacity-100")} />{active && <span className="text-[9px]">{sortDir === "asc" ? "↑" : "↓"}</span>}</button>;
}

// SLIM_CONTACT_IDENTITY_V1
