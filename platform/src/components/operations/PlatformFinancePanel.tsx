import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock, CreditCard, Loader2, RefreshCw, RotateCcw, TrendingUp, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/billing/types";
import { getPlatformFinance } from "@/lib/platform-finance.functions";

type PageSize = 10 | 20 | 50;
type PaymentStatus = "all" | "pending" | "paid" | "failed" | "canceled" | "expired" | "refunded" | "chargeback";

export function PlatformFinancePanel({ enabled }: { enabled: boolean }) {
  const load = useServerFn(getPlatformFinance);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [status, setStatus] = useState<PaymentStatus>("all");
  const query = useQuery({
    queryKey: ["admin", "platform-finance", page, pageSize, status],
    queryFn: () => load({ data: { page, pageSize, status } }) as Promise<any>,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  const safePage = query.data?.pagination?.page;

  useEffect(() => {
    if (typeof safePage === "number" && safePage !== page) setPage(safePage);
  }, [page, safePage]);

  if (query.isLoading) return <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (query.isError || !query.data) return <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Não foi possível carregar o Financeiro Vanessa Simoni. Confirme se as migrations da F06 foram aplicadas no banco canônico e tente novamente.</div>;

  const data = query.data as any;
  const summary = data.summary;
  const pagination = data.pagination;
  const reconciliationPending = Number(data.activationReconciliation?.pendingCount ?? 0);
  const externalBindingPending = Number(data.externalBindingReconciliation?.pendingCount ?? 0);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card/50 p-5">
      <div><h2 className="text-lg font-bold">Financeiro Vanessa Simoni</h2><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Receita e recorrência calculadas a partir de pagamentos persistidos. MRR considera somente assinaturas com status canônico ativo e normaliza o último pagamento de plano pelo período contratado.</p></div>
      <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>{query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar</Button>
    </div>

    {reconciliationPending > 0 ? <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>{reconciliationPending} pagamento{reconciliationPending === 1 ? "" : "s"} pago{reconciliationPending === 1 ? "" : "s"} aguardando reconciliação de ativação.</strong><p className="mt-1 text-xs">A cobrança foi confirmada, mas o entitlement da assinatura ainda não foi aplicado. As linhas afetadas aparecem sinalizadas abaixo e continuam elegíveis para retry idempotente.</p></div></div> : null}

    {externalBindingPending > 0 ? <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>{externalBindingPending} pagamento{externalBindingPending === 1 ? "" : "s"} externo{externalBindingPending === 1 ? "" : "s"} pendente{externalBindingPending === 1 ? "" : "s"} sem vínculo de provider há mais de 2 horas.</strong><p className="mt-1 text-xs">Não marque como falho nem remova sem reconciliar Stripe/Cora. A F06 sinaliza esses casos para impedir que uma cobrança externa existente seja descartada sem prova.</p></div></div> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Receita total paga" value={formatBRL(summary.revenue_total_cents)} icon={<WalletCards className="h-4 w-4" />} />
      <Metric label="Receita no mês" value={formatBRL(summary.revenue_month_cents)} icon={<TrendingUp className="h-4 w-4" />} />
      <Metric label="MRR contratual" value={formatBRL(summary.mrr_cents)} icon={<RotateCcw className="h-4 w-4" />} />
      <Metric label="Receita de renovações" value={formatBRL(summary.renewal_revenue_cents)} icon={<CalendarClock className="h-4 w-4" />} />
      <Metric label="Vendas pagas" value={String(summary.paid_sales)} icon={<CreditCard className="h-4 w-4" />} />
      <Metric label="Primeiras vendas" value={String(summary.new_sales)} icon={<TrendingUp className="h-4 w-4" />} />
      <Metric label="Renovações pagas" value={String(summary.renewals)} icon={<RotateCcw className="h-4 w-4" />} />
      <Metric label="Renovam em até 30 dias" value={String(summary.renewals_due_30d)} icon={<CalendarClock className="h-4 w-4" />} />
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SmallMetric label="Status: ativa" value={summary.active_subscriptions} />
      <SmallMetric label="Status: teste ativo" value={summary.trial_subscriptions} />
      <SmallMetric label="Status: cancelada" value={summary.canceled_subscriptions} />
      <SmallMetric label="Status: em atraso" value={summary.overdue_subscriptions} />
    </div>

    {!data.attribution.available ? <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground"><strong className="text-foreground">Atribuição de receita:</strong> {data.attribution.reason}</div> : null}

    <div className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Pagamentos</h3><p className="text-xs text-muted-foreground">Histórico paginado diretamente na fonte.</p></div><div className="flex gap-2"><select value={status} onChange={(event) => { setStatus(event.target.value as PaymentStatus); setPage(0); }} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Filtrar status"><option value="all">Todos</option><option value="paid">Pago</option><option value="pending">Pendente</option><option value="failed">Falhou</option><option value="canceled">Cancelado</option><option value="expired">Expirado</option><option value="refunded">Reembolsado</option><option value="chargeback">Chargeback</option></select><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as PageSize); setPage(0); }} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Pagamentos por página"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></div></div>
      <div className="mt-4 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Workspace</TableHead><TableHead>Plano</TableHead><TableHead>Status</TableHead><TableHead>Valor</TableHead><TableHead>Desconto</TableHead><TableHead>Provedor</TableHead><TableHead>Cupom</TableHead><TableHead>Data</TableHead></TableRow></TableHeader><TableBody>{data.payments.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhum pagamento encontrado.</TableCell></TableRow> : data.payments.map((payment: any) => <TableRow key={payment.id}><TableCell><div className="font-medium">{payment.workspace?.name ?? "Workspace removido"}</div></TableCell><TableCell>{payment.plan?.name ?? "—"}{payment.period ? <div className="text-[11px] text-muted-foreground">{payment.period}</div> : null}</TableCell><TableCell><div className="flex flex-col items-start gap-1"><StatusBadge status={payment.status} />{payment.activation?.required ? <><Badge variant="destructive">Ativação pendente</Badge>{payment.activation.error ? <span className="max-w-64 text-[11px] leading-snug text-destructive">{payment.activation.error}</span> : null}</> : null}{payment.status === "pending" && ["cora", "stripe"].includes(payment.provider) && !payment.provider_charge_id ? <Badge variant="outline">Sem vínculo do provider</Badge> : null}</div></TableCell><TableCell className="font-medium">{formatBRL(payment.amount_cents)}</TableCell><TableCell>{payment.discount_cents ? `−${formatBRL(payment.discount_cents)}` : "—"}</TableCell><TableCell>{providerLabel(payment.provider)}</TableCell><TableCell>{payment.coupon?.code ?? "—"}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(payment.paid_at ?? payment.created_at).toLocaleString("pt-BR")}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><span>{pagination.total === 0 ? 0 : pagination.page * pagination.pageSize + 1}–{Math.min(pagination.total, (pagination.page + 1) * pagination.pageSize)} de {pagination.total}</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!pagination.hasPrevious} onClick={() => setPage(Math.max(0, pagination.page - 1))}>Anterior</Button><span>Página {Math.min(pagination.page + 1, pagination.totalPages)} de {pagination.totalPages}</span><Button size="sm" variant="outline" disabled={!pagination.hasNext} onClick={() => setPage(pagination.page + 1)}>Próxima</Button></div></div>
    </div>
  </section>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="rounded-xl border border-border bg-card/50 p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span>{icon}</div><div className="mt-2 text-2xl font-black tabular-nums">{value}</div></div>; }
function SmallMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold tabular-nums">{value}</div></div>; }
function StatusBadge({ status }: { status: string }) { const map: Record<string, string> = { paid: "Pago", pending: "Pendente", failed: "Falhou", canceled: "Cancelado", expired: "Expirado", refunded: "Reembolsado", chargeback: "Chargeback" }; return <Badge variant={status === "failed" || status === "chargeback" ? "destructive" : status === "paid" ? "default" : "outline"}>{map[status] ?? status}</Badge>; }
function providerLabel(provider: string) { const map: Record<string, string> = { stripe: "Stripe", cora: "Cora", internal: "Interno" }; return map[provider] ?? provider; }
