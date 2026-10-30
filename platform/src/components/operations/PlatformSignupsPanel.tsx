import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Clock3, ExternalLink, Loader2, Mail, PauseCircle, Phone, PlayCircle, RefreshCw, RotateCcw, Search, ShieldAlert, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPlatformSignupsPage, managePlatformSubscriptionContingency, reconcilePlatformSignupToCrm } from "@/lib/platform-signups.functions";

type PageSize = 10 | 20 | 50;
type ContingencyAction = "pause" | "resume" | "cancel_at_period_end" | "end_now" | "reverse_promotion";
type ManageSubscriptionInput = { workspaceId: string; action: ContingencyAction; reason?: string | null; expectedUpdatedAt: string; expectedPaymentId?: string | null };
type Signup = {
  id: string;
  full_name: string;
  email: string;
  email_confirmed: boolean;
  last_sign_in_at: string | null;
  cpf: string | null;
  whatsapp_primary: string | null;
  whatsapp_secondary: string | null;
  country: string | null;
  niche: string | null;
  acquisition_source: string | null;
  created_at: string;
  workspace: { id: string; name: string; slug: string } | null;
  subscription: {
    id: string;
    status: string;
    period: string | null;
    trial_ends_at: string | null;
    started_at: string | null;
    current_period_end: string | null;
    extra_employees: number;
    last_payment_id: string | null;
    updated_at: string;
    paused_previous_status: string | null;
    paused_at: string | null;
    pause_reason: string | null;
    plan: { code: string; name: string } | null;
  } | null;
  promotions: Array<{ id: string; period: string | null; created_at: string; paid_at: string | null; coupon_code: string | null; coupon_name: string | null; reversed_at: string | null; is_reversible: boolean; reversible_reason: string | null }>;
  lead_id: string | null;
  crm_synced_at: string | null;
  crm_source: { provider: string; name: string } | null;
};

type Pagination = {
  page: number;
  pageSize: PageSize;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type SignupsResponse = { signups: Signup[]; pagination: Pagination };

export function PlatformSignupsPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlatformSignupsPage);
  const reconcileFn = useServerFn(reconcilePlatformSignupToCrm);
  const manageSubscriptionFn = useServerFn(managePlatformSubscriptionContingency);
  const [selected, setSelected] = useState<Signup | null>(null);
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setQuerySearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const signupsQuery = useQuery({
    queryKey: ["admin", "platform-signups", page, pageSize, querySearch],
    queryFn: () => listFn({ data: { page, pageSize, search: querySearch } }) as Promise<SignupsResponse>,
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  const reconcile = useMutation({
    mutationFn: (profileId: string) => reconcileFn({ data: { profile_id: profileId } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "platform-signups"] }); },
  });
  const manageSubscription = useMutation({
    mutationFn: (input: ManageSubscriptionInput) => manageSubscriptionFn({ data: input }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "platform-signups"] }); },
  });

  const data = signupsQuery.data;
  const signups = data?.signups ?? [];
  const pagination = data?.pagination ?? {
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  };

  useEffect(() => {
    if (data && pagination.page !== page) setPage(pagination.page);
  }, [data, page, pagination.page]);

  useEffect(() => {
    if (!selected) return;
    const fresh = signups.find((signup) => signup.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [signups, selected]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "platform-signups"] });

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-lg font-bold">Cadastros da plataforma</h2>
          <p className="text-xs text-muted-foreground">
            Ficha administrativa paginada com origem informada no cadastro, workspace, assinatura e vínculo comprovado com o fluxo canônico de Cadastros da Vanessa Simoni. Nenhum dado é gravado no CRM de clientes finais.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
          <div className="relative min-w-[220px] flex-1 lg:w-72 lg:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nome, país, nicho ou WhatsApp"
              className="border-border bg-muted/30 pl-9"
            />
          </div>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as PageSize);
              setPage(0);
            }}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            aria-label="Cadastros por página"
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
          </select>
          <Button variant="outline" onClick={refresh} disabled={signupsQuery.isFetching}>
            {signupsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
          </Button>
        </div>
      </div>

      {signupsQuery.isError ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os cadastros. Tente atualizar a listagem.
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Cliente</TableHead>
              <TableHead className="text-muted-foreground">Origem</TableHead>
              <TableHead className="text-muted-foreground">Workspace</TableHead>
              <TableHead className="text-muted-foreground">Plano</TableHead>
              <TableHead className="text-muted-foreground">Cadastro</TableHead>
              <TableHead className="text-muted-foreground">CRM ADM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signupsQuery.isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" /></TableCell></TableRow>
            ) : signups.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum cadastro encontrado para os filtros atuais.</TableCell></TableRow>
            ) : signups.map((signup) => (
              <TableRow key={signup.id} className="cursor-pointer border-border hover:bg-muted/40" onClick={() => setSelected(signup)}>
                <TableCell>
                  <div className="font-semibold text-foreground">{signup.full_name}</div>
                  <div className="text-xs text-muted-foreground">{signup.email || signup.whatsapp_primary || "Sem contato disponível"}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-foreground/80">{sourceLabel(signup.acquisition_source)}</div>
                  {signup.crm_source ? <div className="text-[11px] text-muted-foreground">CRM: {signup.crm_source.name}</div> : null}
                </TableCell>
                <TableCell className="text-foreground/80">{signup.workspace?.name ?? "Não criado"}</TableCell>
                <TableCell>
                  <div className="text-sm text-foreground/80">{signup.subscription?.plan?.name ?? "Sem plano"}</div>
                  <div className="text-[11px] text-muted-foreground">{subscriptionLabel(signup.subscription?.status)}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(signup.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{signup.lead_id ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Sincronizado</Badge> : <Badge variant="outline">Sem vínculo</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination pagination={pagination} onPageChange={setPage} />

      {selected ? (
        <SignupDrawer
          signup={selected}
          onClose={() => setSelected(null)}
          onReconcile={() => reconcile.mutate(selected.id)}
          reconciling={reconcile.isPending}
          failed={reconcile.isError}
          onManage={(input) => manageSubscription.mutate(input)}
          managing={manageSubscription.isPending}
          manageError={manageSubscription.error instanceof Error ? manageSubscription.error.message : null}
        />
      ) : null}
    </section>
  );
}

function Pagination({ pagination, onPageChange }: { pagination: Pagination; onPageChange: (page: number) => void }) {
  const first = pagination.total === 0 ? 0 : pagination.page * pagination.pageSize + 1;
  const last = Math.min(pagination.total, (pagination.page + 1) * pagination.pageSize);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>{first}–{last} de {pagination.total} cadastros</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={!pagination.hasPrevious} onClick={() => onPageChange(Math.max(0, pagination.page - 1))}>Anterior</Button>
        <span>Página {Math.min(pagination.page + 1, pagination.totalPages)} de {pagination.totalPages}</span>
        <Button size="sm" variant="outline" disabled={!pagination.hasNext} onClick={() => onPageChange(pagination.page + 1)}>Próxima</Button>
      </div>
    </div>
  );
}

function SignupDrawer({ signup, onClose, onReconcile, reconciling, failed, onManage, managing, manageError }: { signup: Signup; onClose: () => void; onReconcile: () => void; reconciling: boolean; failed: boolean; onManage: (input: ManageSubscriptionInput) => void; managing: boolean; manageError: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Ficha do cadastro</div>
            <h3 className="mt-1 text-xl font-bold">{signup.full_name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {signup.email || "E-mail não disponível"}</span>
              {signup.email ? <Badge variant={signup.email_confirmed ? "default" : "outline"}>{signup.email_confirmed ? "E-mail confirmado" : "E-mail pendente"}</Badge> : null}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar ficha"><X className="h-4 w-4" /></Button>
        </div>

        <section className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cadastro</h4>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <Info label="País" value={signup.country ?? "Não informado"} />
            <Info label="Nicho" value={signup.niche ?? "Não informado"} />
            <Info label="CPF" value={signup.cpf ?? "Não informado"} />
            <Info label="Origem de aquisição" value={sourceLabel(signup.acquisition_source)} />
            <Info label="WhatsApp principal" value={signup.whatsapp_primary ?? "Não informado"} icon={<Phone className="h-3 w-3" />} />
            <Info label="WhatsApp secundário" value={signup.whatsapp_secondary ?? "Não informado"} icon={<Phone className="h-3 w-3" />} />
          </dl>
        </section>

        <section className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jornada comprovada</h4>
          <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <Journey label="Cadastro criado" value={new Date(signup.created_at).toLocaleString("pt-BR")} ok />
            <Journey label="E-mail confirmado" value={signup.email ? (signup.email_confirmed ? "Sim" : "Ainda não") : "E-mail indisponível"} ok={signup.email_confirmed} />
            <Journey label="Workspace" value={signup.workspace?.name ?? "Ainda não criado"} ok={Boolean(signup.workspace)} />
            <Journey label="Plano" value={signup.subscription?.plan?.name ?? "Sem plano associado"} ok={Boolean(signup.subscription?.plan)} />
            <Journey label="Status da assinatura" value={subscriptionLabel(signup.subscription?.status)} ok={isPositiveSubscription(signup.subscription?.status)} />
            <Journey label="CRM administrativo" value={signup.lead_id ? `Sincronizado · ${signup.crm_source?.name ?? "MKTOn"}` : "Sem vínculo canônico encontrado"} ok={Boolean(signup.lead_id)} />
            <Journey label="Sincronização CRM" value={signup.crm_synced_at ? new Date(signup.crm_synced_at).toLocaleString("pt-BR") : "Não registrada"} ok={Boolean(signup.crm_synced_at)} />
            <Journey label="Último acesso" value={signup.last_sign_in_at ? new Date(signup.last_sign_in_at).toLocaleString("pt-BR") : "Nenhum acesso registrado"} ok={Boolean(signup.last_sign_in_at)} />
          </div>
        </section>

        <SubscriptionAdminControls signup={signup} onManage={onManage} managing={managing} manageError={manageError} />

        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4 text-primary" /> CRM administrativo Vanessa Simoni</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {signup.lead_id
              ? "O cadastro já possui vínculo comprovado pelo evento de signup do CRM. A ação abaixo apenas reconcilia de forma idempotente; não cria outro lead."
              : "O cadastro normal entra automaticamente em Cadastros | Vanessa Simoni / New Cad. Use a reconciliação apenas para recuperar um vínculo ausente sem criar funil ou identidade paralela."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={onReconcile} disabled={reconciling}>
              {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reconciliar CRM
            </Button>
            {signup.lead_id ? <Button variant="outline" asChild><a href="/crm/leads"><ExternalLink className="h-4 w-4" /> Abrir Leads no CRM</a></Button> : null}
          </div>
          {failed ? <p className="mt-2 text-xs text-destructive">Não foi possível reconciliar este cadastro com o CRM administrativo.</p> : null}
        </div>
      </aside>
    </div>
  );
}

function SubscriptionAdminControls({ signup, onManage, managing, manageError }: { signup: Signup; onManage: (input: ManageSubscriptionInput) => void; managing: boolean; manageError: string | null }) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const subscription = signup.subscription;
  const workspace = signup.workspace;
  if (!subscription || !workspace) return null;
  const latestPromotion = signup.promotions.find((promotion) => !promotion.reversed_at) ?? signup.promotions[0] ?? null;
  const futurePeriod = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() > Date.now() : false;
  const accessAlreadyEnded = subscription.status === "canceled" && !futurePeriod;
  const canPause = ["active", "trial_active", "starter", "canceled"].includes(subscription.status) && !accessAlreadyEnded;
  function execute(action: ContingencyAction, paymentId?: string | null) {
    const cleanReason = reason.trim();
    if ((action === "end_now" || action === "reverse_promotion") && !cleanReason) { setLocalError("Informe o motivo antes de executar esta ação."); return; }
    const confirmations: Record<ContingencyAction, string> = {
      pause: "Pausar o acesso desta assinatura agora? A vigência será preservada.",
      resume: "Retomar o acesso desta assinatura usando o estado anterior salvo?",
      cancel_at_period_end: "Cancelar a assinatura ao fim da vigência atual? O acesso permanece até a data final.",
      end_now: "Encerrar o acesso imediatamente? Esta ação elimina a cobertura futura desta assinatura.",
      reverse_promotion: "Reverter a última promoção 100% interna? O pagamento e o uso do cupom continuarão no histórico.",
    };
    if (!window.confirm(confirmations[action])) return;
    setLocalError(null);
    onManage({ workspaceId: workspace.id, action, reason: cleanReason || null, expectedUpdatedAt: subscription.updated_at, expectedPaymentId: paymentId ?? null });
  }
  return <section className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
    <div className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" /> Controles administrativos da assinatura</div>
    <p className="mt-1 text-xs text-muted-foreground">Contingência de superadmin. Toda ação é auditada; pagamentos e usos de cupom não são apagados.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Info label="Status atual" value={subscriptionLabel(subscription.status)} /><Info label="Fim da vigência" value={subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleString("pt-BR") : "Sem data final"} /></div>
    {subscription.paused_at ? <p className="mt-2 text-xs text-muted-foreground">Pausada em {new Date(subscription.paused_at).toLocaleString("pt-BR")}{subscription.pause_reason ? " · " + subscription.pause_reason : ""}</p> : null}
    <label className="mt-4 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Motivo administrativo</label>
    <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} placeholder="Obrigatório para encerrar agora e reverter promoção; opcional nas demais ações." className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
    <div className="mt-3 flex flex-wrap gap-2">
      {subscription.status === "paused" ? <Button size="sm" onClick={() => execute("resume")} disabled={managing}><PlayCircle className="h-4 w-4" /> Retomar acesso</Button> : <Button size="sm" variant="outline" onClick={() => execute("pause")} disabled={managing || !canPause}><PauseCircle className="h-4 w-4" /> Pausar acesso</Button>}
      <Button size="sm" variant="outline" onClick={() => execute("cancel_at_period_end")} disabled={managing || !futurePeriod || subscription.status === "canceled"}><Clock3 className="h-4 w-4" /> Cancelar ao fim da vigência</Button>
      <Button size="sm" variant="destructive" onClick={() => execute("end_now")} disabled={managing || accessAlreadyEnded}><Ban className="h-4 w-4" /> Encerrar agora</Button>
      {latestPromotion ? <Button size="sm" variant="outline" onClick={() => execute("reverse_promotion", latestPromotion.id)} disabled={managing || !latestPromotion.is_reversible} title={latestPromotion.reversible_reason ?? undefined}><RotateCcw className="h-4 w-4" /> Reverter última promoção</Button> : null}
    </div>
    {(localError || manageError) ? <p className="mt-2 text-xs text-destructive">{localError ?? manageError}</p> : null}
    <div className="mt-4 border-t border-border pt-3"><div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Promoções internas recentes</div>
      {signup.promotions.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Nenhuma promoção interna 100% encontrada.</p> : <div className="mt-2 space-y-2">{signup.promotions.map((promotion) => <div key={promotion.id} className="rounded-lg border border-border bg-background/70 p-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{promotion.coupon_name || promotion.coupon_code || "Cupom sem nome"}</span><Badge variant={promotion.reversed_at ? "outline" : promotion.is_reversible ? "default" : "secondary"}>{promotion.reversed_at ? "Revertida" : promotion.is_reversible ? "Reversível" : "Protegida"}</Badge></div><div className="mt-1 text-muted-foreground">{promotion.coupon_code ? "Código " + promotion.coupon_code + " · " : ""}{promotion.period ?? "período não informado"} · {new Date(promotion.paid_at ?? promotion.created_at).toLocaleString("pt-BR")}</div>{!promotion.is_reversible && !promotion.reversed_at && promotion.reversible_reason ? <div className="mt-1 text-[11px] text-muted-foreground">{promotion.reversible_reason}</div> : null}</div>)}</div>}
    </div>
  </section>;
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-muted/20 p-3"><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt><dd className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-foreground">{icon}{value}</dd></div>;
}

function Journey({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={ok ? "text-right font-medium text-foreground" : "text-right text-muted-foreground"}>{value}</span></div>;
}

function sourceLabel(value: string | null) {
  if (!value) return "Não informada";
  const normalized = value.replace(/[_-]+/g, " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Não informada";
}

function subscriptionLabel(status?: string | null) {
  const labels: Record<string, string> = {
    active: "Ativa",
    trial_active: "Teste ativo",
    trial_expired: "Teste encerrado",
    payment_pending: "Pagamento pendente",
    expired: "Expirada",
    canceled: "Cancelada",
    overdue: "Em atraso",
    paused: "Pausada",
  };
  return status ? labels[status] ?? status.replace(/_/g, " ") : "Sem assinatura";
}

function isPositiveSubscription(status?: string | null) {
  return status === "active" || status === "trial_active";
}
