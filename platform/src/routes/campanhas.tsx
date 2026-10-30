import { useDeferredValue, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { CouponUsageButton } from "@/components/operations/CouponUsageButton";
import { OperationsExecutionReport } from "@/components/operations/OperationsExecutionReport";
import { PlatformFinancePanel } from "@/components/operations/PlatformFinancePanel";
import { PlatformSignupsPanel } from "@/components/operations/PlatformSignupsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import {
  deleteAdminCoupon,
  getAdminCouponsPage,
  getAdminHistoryPage,
  getAdminRulesPage,
  saveAdminCoupon,
  saveInternalCampaign,
} from "@/lib/campaigns.functions";
import {
  formatBRL,
  MODULE_LABELS,
  PERIOD_LABEL,
  type Period,
  type PlanCode,
} from "@/lib/billing/types";

export const Route = createFileRoute("/campanhas")({
  head: () => ({ meta: [{ title: "Central de Operações · Vanessa Simoni" }] }),
  component: CampaignsPage,
});

const PLANS: Array<{ code: PlanCode; label: string }> = [
  { code: "starter", label: "Starter" },
  { code: "professional", label: "Profissional" },
  { code: "business", label: "Business" },
  { code: "enterprise", label: "Enterprise" },
];
const PERIODS: Period[] = ["1m", "3m", "6m", "1y"];

type PageSize = 10 | 20 | 50;
type CouponForm = {
  id?: string;
  name: string;
  code: string;
  description: string;
  kind: "percent" | "fixed" | "override";
  value: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string;
  max_uses: string;
  max_uses_per_customer: string;
  valid_plans: PlanCode[];
  valid_periods: Period[];
  valid_modules: string[];
  is_subscription: boolean;
};

type Coupon = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  kind: "percent" | "fixed" | "override";
  value: number;
  is_active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  max_uses_per_customer?: number | null;
  valid_plans: PlanCode[];
  valid_periods: Period[];
  valid_modules: string[];
  is_subscription: boolean;
  created_at: string;
  updated_at: string;
};

type CouponStat = { coupon_id: string; uses: number; revenue_cents: number; customers: number };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type Campaign = {
  id: string;
  type: "billing" | "sms" | "renewal" | "promotional" | "recovery";
  name: string;
  audience: string;
  trigger_key?: string | null;
  message: string;
  action?: string | null;
  status: "draft" | "scheduled" | "active" | "paused" | "sent" | "archived";
  scheduled_at?: string | null;
  created_at: string;
};
type CampaignPayload = Omit<Campaign, "id" | "created_at">;
type HistoryRow = { id: string; action_type: string; title: string; result: string; created_at: string };
type OperationsTab = "cadastros" | "cupons" | "financeiro" | "reguas" | "historico" | "execucoes";

const emptyCoupon: CouponForm = {
  name: "",
  code: "",
  description: "",
  kind: "percent",
  value: 10,
  is_active: true,
  starts_at: "",
  expires_at: "",
  max_uses: "",
  max_uses_per_customer: "",
  valid_plans: [],
  valid_periods: [],
  valid_modules: [],
  is_subscription: true,
};

function CampaignsPage() {
  const queryClient = useQueryClient();
  const { isSuperAdmin, loaded } = useIsSuperAdmin();
  const loadCoupons = useServerFn(getAdminCouponsPage);
  const loadRules = useServerFn(getAdminRulesPage);
  const loadHistory = useServerFn(getAdminHistoryPage);
  const saveCoupon = useServerFn(saveAdminCoupon);
  const removeCoupon = useServerFn(deleteAdminCoupon);
  const saveCampaign = useServerFn(saveInternalCampaign);
  const [activeTab, setActiveTab] = useState<OperationsTab>("cadastros");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [couponPage, setCouponPage] = useState(1);
  const [couponPageSize, setCouponPageSize] = useState<PageSize>(20);
  const [billingPage, setBillingPage] = useState(1);
  const [renewalPage, setRenewalPage] = useState(1);
  const [rulesPageSize, setRulesPageSize] = useState<PageSize>(20);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<PageSize>(20);
  const [couponDialog, setCouponDialog] = useState(false);
  const [campaignDialog, setCampaignDialog] = useState<null | "billing" | "renewal">(null);
  const [editingCoupon, setEditingCoupon] = useState<CouponForm>(emptyCoupon);
  const [couponToDelete, setCouponToDelete] = useState<Coupon | null>(null);

  const couponsQuery = useQuery({
    queryKey: ["admin", "coupons", couponPage, couponPageSize, deferredSearch],
    queryFn: () => loadCoupons({ data: { page: couponPage, pageSize: couponPageSize, search: deferredSearch } }),
    enabled: isSuperAdmin && activeTab === "cupons",
    staleTime: 30_000,
    retry: false,
  });
  const billingRulesQuery = useQuery({
    queryKey: ["admin", "rules", "billing", billingPage, rulesPageSize],
    queryFn: () => loadRules({ data: { type: "billing", page: billingPage, pageSize: rulesPageSize } }),
    enabled: isSuperAdmin && activeTab === "reguas",
    staleTime: 30_000,
    retry: false,
  });
  const renewalRulesQuery = useQuery({
    queryKey: ["admin", "rules", "renewal", renewalPage, rulesPageSize],
    queryFn: () => loadRules({ data: { type: "renewal", page: renewalPage, pageSize: rulesPageSize } }),
    enabled: isSuperAdmin && activeTab === "reguas",
    staleTime: 30_000,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["admin", "history", historyPage, historyPageSize],
    queryFn: () => loadHistory({ data: { page: historyPage, pageSize: historyPageSize } }),
    enabled: isSuperAdmin && activeTab === "historico",
    staleTime: 30_000,
    retry: false,
  });

  const coupons = (couponsQuery.data?.coupons ?? []) as Coupon[];
  const stats = new Map(((couponsQuery.data?.couponStats ?? []) as CouponStat[]).map((item) => [item.coupon_id, item]));
  const couponPagination = couponsQuery.data?.pagination as Pagination | undefined;
  const billingRules = (billingRulesQuery.data?.campaigns ?? []) as Campaign[];
  const billingPagination = billingRulesQuery.data?.pagination as Pagination | undefined;
  const renewalRules = (renewalRulesQuery.data?.campaigns ?? []) as Campaign[];
  const renewalPagination = renewalRulesQuery.data?.pagination as Pagination | undefined;
  const history = (historyQuery.data?.history ?? []) as HistoryRow[];
  const historyPagination = historyQuery.data?.pagination as Pagination | undefined;

  useEffect(() => {
    if (couponPagination && couponPagination.page !== couponPage) setCouponPage(couponPagination.page);
  }, [couponPage, couponPagination]);
  useEffect(() => {
    if (billingPagination && billingPagination.page !== billingPage) setBillingPage(billingPagination.page);
  }, [billingPage, billingPagination]);
  useEffect(() => {
    if (renewalPagination && renewalPagination.page !== renewalPage) setRenewalPage(renewalPagination.page);
  }, [renewalPage, renewalPagination]);
  useEffect(() => {
    if (historyPagination && historyPagination.page !== historyPage) setHistoryPage(historyPagination.page);
  }, [historyPage, historyPagination]);

  const couponMut = useMutation({
    mutationFn: () => saveCoupon({ data: normalizeCouponForm(editingCoupon) }),
    onSuccess: () => {
      setCouponDialog(false);
      setEditingCoupon(emptyCoupon);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "history"] });
      toast.success("Cupom salvo.");
    },
    onError: () => toast.error("Não foi possível salvar o cupom."),
  });
  const deleteMut = useMutation({
    mutationFn: (coupon: Coupon) => removeCoupon({ data: { id: coupon.id, code: coupon.code } }),
    onSuccess: () => {
      setCouponToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "history"] });
      toast.success("Cupom removido.");
    },
    onError: () => toast.error("Não foi possível remover o cupom."),
  });
  const campaignMut = useMutation({
    mutationFn: (payload: CampaignPayload) => saveCampaign({ data: payload }),
    onSuccess: () => {
      setCampaignDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "rules"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "history"] });
      toast.success("Régua salva.");
    },
    onError: () => toast.error("Não foi possível salvar a régua."),
  });

  if (loaded && !isSuperAdmin) return <Restricted />;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto pl-16 pr-4 py-7 md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Badge className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">SUPER ADMIN</Badge>
            <div className="mt-4">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Central de Operações</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Cadastros, cupons, financeiro, réguas, histórico e telemetria administrativa da Vanessa Simoni.</p>
            </div>
          </header>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as OperationsTab)} className="space-y-5">
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl border border-border bg-card/50 p-1 text-muted-foreground">
              <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
              <TabsTrigger value="cupons">Cupons</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              <TabsTrigger value="reguas">Réguas</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="execucoes">Execuções e Bugs</TabsTrigger>
            </TabsList>

            <TabsContent value="cadastros"><PlatformSignupsPanel enabled={isSuperAdmin && activeTab === "cadastros"} /></TabsContent>
            <TabsContent value="cupons" className="space-y-3">
              {couponsQuery.isError ? <InlineError text="Não foi possível carregar os cupons." /> : null}
              <CouponsPanel
                coupons={coupons}
                stats={stats}
                search={search}
                setSearch={(value) => { setSearch(value); setCouponPage(1); }}
                loading={couponsQuery.isLoading || couponsQuery.isFetching}
                pagination={couponPagination}
                pageSize={couponPageSize}
                onPage={setCouponPage}
                onPageSize={(value) => { setCouponPageSize(value); setCouponPage(1); }}
                onNew={() => { setEditingCoupon(emptyCoupon); setCouponDialog(true); }}
                onEdit={(coupon) => { setEditingCoupon(toCouponForm(coupon)); setCouponDialog(true); }}
                onDelete={setCouponToDelete}
              />
            </TabsContent>
            <TabsContent value="financeiro"><PlatformFinancePanel enabled={isSuperAdmin && activeTab === "financeiro"} /></TabsContent>
            <TabsContent value="reguas" className="space-y-3">
              {billingRulesQuery.isError || renewalRulesQuery.isError ? <InlineError text="Não foi possível carregar uma ou mais réguas." /> : null}
              <FinancialRulesPanel
                billing={billingRules}
                renewal={renewalRules}
                billingPagination={billingPagination}
                renewalPagination={renewalPagination}
                pageSize={rulesPageSize}
                billingLoading={billingRulesQuery.isFetching}
                renewalLoading={renewalRulesQuery.isFetching}
                onBillingPage={setBillingPage}
                onRenewalPage={setRenewalPage}
                onPageSize={(value) => { setRulesPageSize(value); setBillingPage(1); setRenewalPage(1); }}
                onCreateBilling={() => setCampaignDialog("billing")}
                onCreateRenewal={() => setCampaignDialog("renewal")}
              />
            </TabsContent>
            <TabsContent value="historico" className="space-y-3">
              {historyQuery.isError ? <InlineError text="Não foi possível carregar o histórico administrativo." /> : null}
              <HistoryPanel history={history} pagination={historyPagination} pageSize={historyPageSize} loading={historyQuery.isFetching} onPage={setHistoryPage} onPageSize={(value) => { setHistoryPageSize(value); setHistoryPage(1); }} />
            </TabsContent>
            <TabsContent value="execucoes"><OperationsExecutionReport enabled={isSuperAdmin && activeTab === "execucoes"} /></TabsContent>
          </Tabs>
        </div>
      </main>

      <CouponDialog open={couponDialog} setOpen={setCouponDialog} form={editingCoupon} setForm={setEditingCoupon} saving={couponMut.isPending} onSave={() => couponMut.mutate()} />
      <CampaignDialog key={campaignDialog ?? "closed"} open={campaignDialog !== null} type={campaignDialog ?? "billing"} onOpenChange={(open) => !open && setCampaignDialog(null)} saving={campaignMut.isPending} onSave={(payload) => campaignMut.mutate(payload)} />
      <AlertDialog open={Boolean(couponToDelete)} onOpenChange={(open) => { if (!open && !deleteMut.isPending) setCouponToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>
              {couponToDelete ? `O cupom ${couponToDelete.name || couponToDelete.code} (${couponToDelete.code}) será removido da plataforma. Esta ação não pode ser desfeita.` : "Confirme a exclusão do cupom."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending || !couponToDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (couponToDelete) deleteMut.mutate(couponToDelete);
              }}
            >
              {deleteMut.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir cupom
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Restricted() {
  return <div className="flex min-h-screen bg-background"><AppSidebar /><main className="flex flex-1 items-center justify-center p-8"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center"><ShieldAlert className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-4 text-xl font-bold">Área interna da Vanessa Simoni</h1><p className="mt-2 text-sm text-muted-foreground">A Central de Operações é restrita ao administrador geral da plataforma.</p></div></main></div>;
}

function CouponsPanel({ coupons, stats, search, setSearch, loading, pagination, pageSize, onPage, onPageSize, onNew, onEdit, onDelete }: {
  coupons: Coupon[];
  stats: Map<string, CouponStat>;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  pagination?: Pagination;
  pageSize: PageSize;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  onNew: () => void;
  onEdit: (coupon: Coupon) => void;
  onDelete: (coupon: Coupon) => void;
}) {
  return <section className="rounded-2xl border border-border bg-card/50 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-lg font-bold">Gestão de cupons</h2><p className="text-xs text-muted-foreground">Crie, edite e acompanhe os cupons comerciais da plataforma.</p></div>
      <div className="flex gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cupom" className="w-56 pl-9" /></div><Button onClick={onNew}><Plus className="h-4 w-4" /> Novo cupom</Button></div>
    </div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-border"><Table><TableHeader><TableRow><TableHead>Cupom</TableHead><TableHead>Desconto</TableHead><TableHead>Planos</TableHead><TableHead>Módulos</TableHead><TableHead>Períodos</TableHead><TableHead>Uso</TableHead><TableHead>Receita</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
      {loading && coupons.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Carregando cupons…</TableCell></TableRow> : coupons.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhum cupom encontrado.</TableCell></TableRow> : coupons.map((coupon) => {
        const stat = stats.get(coupon.id);
        return <TableRow key={coupon.id}><TableCell><div className="font-semibold">{coupon.name || coupon.code}</div><div className="flex items-center gap-2 text-xs text-muted-foreground"><code>{coupon.code}</code><Badge variant={coupon.is_active ? "default" : "outline"}>{coupon.is_active ? "Ativo" : "Inativo"}</Badge></div></TableCell><TableCell>{coupon.kind === "percent" ? `${coupon.value}%` : coupon.kind === "override" ? `Vender por ${formatBRL(Math.round(Number(coupon.value) * 100))}` : formatBRL(Math.round(Number(coupon.value) * 100))}</TableCell><TableCell>{coupon.valid_plans?.length ? coupon.valid_plans.join(", ") : "Todos"}</TableCell><TableCell>{coupon.valid_modules?.length ? coupon.valid_modules.map((module) => MODULE_LABELS[module] || module).join(", ") : "Todos"}</TableCell><TableCell>{coupon.valid_periods?.length ? coupon.valid_periods.map((period) => PERIOD_LABEL[period]).join(", ") : "Todos"}</TableCell><TableCell><CouponUsageButton couponId={coupon.id} uses={stat?.uses ?? 0} maxUses={coupon.max_uses ?? null} /></TableCell><TableCell>{formatBRL(stat?.revenue_cents ?? 0)}</TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => onEdit(coupon)} aria-label="Editar cupom"><Edit3 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => copyCouponUrl(coupon)} aria-label="Copiar checkout"><CreditCard className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => void navigator.clipboard.writeText(coupon.code)} aria-label="Copiar código"><Copy className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(coupon)} aria-label="Excluir cupom"><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>;
      })}
    </TableBody></Table></div>
    {pagination && pagination.total > 0 && <PaginationControls pagination={pagination} pageSize={pageSize} loading={loading} onPage={onPage} onPageSize={onPageSize} label="cupom(ns)" />}
  </section>;
}

function FinancialRulesPanel({ billing, renewal, billingPagination, renewalPagination, pageSize, billingLoading, renewalLoading, onBillingPage, onRenewalPage, onPageSize, onCreateBilling, onCreateRenewal }: {
  billing: Campaign[];
  renewal: Campaign[];
  billingPagination?: Pagination;
  renewalPagination?: Pagination;
  pageSize: PageSize;
  billingLoading: boolean;
  renewalLoading: boolean;
  onBillingPage: (page: number) => void;
  onRenewalPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  onCreateBilling: () => void;
  onCreateRenewal: () => void;
}) {
  return <section className="space-y-5 rounded-2xl border border-border bg-card/50 p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-bold">Réguas de cobrança e renovação</h2><p className="text-xs text-muted-foreground">Cada conjunto é carregado e paginado separadamente, sem baixar todas as configurações da plataforma.</p></div><div className="flex gap-2"><Button variant="outline" onClick={onCreateBilling}><CreditCard className="h-4 w-4" /> Nova cobrança</Button><Button onClick={onCreateRenewal}><CalendarClock className="h-4 w-4" /> Nova renovação</Button></div></div>
    <RuleSection title="Cobrança" rows={billing} empty="Nenhuma régua de cobrança configurada." pagination={billingPagination} pageSize={pageSize} loading={billingLoading} onPage={onBillingPage} onPageSize={onPageSize} />
    <RuleSection title="Renovação" rows={renewal} empty="Nenhuma régua de renovação configurada." pagination={renewalPagination} pageSize={pageSize} loading={renewalLoading} onPage={onRenewalPage} onPageSize={onPageSize} />
  </section>;
}

function RuleSection({ title, rows, empty, pagination, pageSize, loading, onPage, onPageSize }: { title: string; rows: Campaign[]; empty: string; pagination?: Pagination; pageSize: PageSize; loading: boolean; onPage: (page: number) => void; onPageSize: (size: PageSize) => void }) {
  return <div><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{title}</h3>{loading ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</div><CampaignGrid rows={rows} empty={loading && rows.length === 0 ? "Carregando réguas…" : empty} />{pagination && pagination.total > 0 ? <PaginationControls pagination={pagination} pageSize={pageSize} loading={loading} onPage={onPage} onPageSize={onPageSize} label="régua(s)" /> : null}</div>;
}

function CampaignGrid({ rows, empty }: { rows: Campaign[]; empty: string }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.length ? rows.map((campaign) => <article key={campaign.id} className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-center justify-between"><Badge variant="outline">{campaign.status}</Badge><Megaphone className="h-4 w-4 text-primary" /></div><h3 className="mt-3 font-bold">{campaign.name}</h3><p className="mt-1 text-xs text-muted-foreground">{campaign.audience}</p><p className="mt-3 line-clamp-3 text-sm">{campaign.message}</p></article>) : <EmptyState text={empty} />}</div>;
}

function HistoryPanel({ history, pagination, pageSize, loading, onPage, onPageSize }: { history: HistoryRow[]; pagination?: Pagination; pageSize: PageSize; loading: boolean; onPage: (page: number) => void; onPageSize: (size: PageSize) => void }) {
  return <section className="rounded-2xl border border-border bg-card/50 p-5"><h2 className="text-lg font-bold">Histórico de ações</h2><div className="mt-4 space-y-2">{loading && history.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Carregando histórico…</div> : history.length ? history.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3"><CheckCircle2 className="h-4 w-4 text-primary" /><div className="flex-1"><div className="text-sm font-semibold">{item.title}</div><div className="text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.action_type} · {item.result}</div></div></div>) : <EmptyState text="As ações administrativas aparecerão aqui." />}</div>{pagination && pagination.total > 0 && <PaginationControls pagination={pagination} pageSize={pageSize} loading={loading} onPage={onPage} onPageSize={onPageSize} label="ação(ões)" />}</section>;
}

function PaginationControls({ pagination, pageSize, loading, onPage, onPageSize, label }: { pagination: Pagination; pageSize: PageSize; loading: boolean; onPage: (page: number) => void; onPageSize: (size: PageSize) => void; label: string }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-muted-foreground">Página {pagination.page} de {pagination.totalPages} · {pagination.total} {label}</div><div className="flex items-center gap-2"><Select value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value) as PageSize)}><SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent></Select><Button type="button" size="sm" variant="outline" disabled={pagination.page <= 1 || loading} onClick={() => onPage(Math.max(1, pagination.page - 1))}>Anterior</Button><Button type="button" size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => onPage(pagination.page + 1)}>Próxima</Button></div></div>;
}

function CouponDialog({ open, setOpen, form, setForm, saving, onSave }: { open: boolean; setOpen: (value: boolean) => void; form: CouponForm; setForm: (value: CouponForm) => void; saving: boolean; onSave: () => void }) {
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{form.id ? "Editar cupom" : "Novo cupom"}</DialogTitle><DialogDescription>Controle desconto, validade, limites, planos, módulos e períodos aceitos.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome interno"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Código"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field><Field label="Tipo"><Select value={form.kind} onValueChange={(value: CouponForm["kind"]) => setForm({ ...form, kind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Porcentagem</SelectItem><SelectItem value="fixed">Desconto fixo</SelectItem><SelectItem value="override">Preço final</SelectItem></SelectContent></Select></Field><Field label="Valor"><Input type="number" value={form.value} onChange={(event) => setForm({ ...form, value: Number(event.target.value) })} /></Field><Field label="Início"><Input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></Field><Field label="Expiração"><Input type="datetime-local" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} /></Field><Field label="Limite total"><Input type="number" value={form.max_uses} onChange={(event) => setForm({ ...form, max_uses: event.target.value })} /></Field><Field label="Limite por cliente (opcional)"><Input type="number" value={form.max_uses_per_customer} onChange={(event) => setForm({ ...form, max_uses_per_customer: event.target.value })} placeholder="Sem limite" /></Field><div className="sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div><Checklist title="Planos" items={PLANS} selected={form.valid_plans} onChange={(valid_plans) => setForm({ ...form, valid_plans })} /><Checklist title="Módulos" items={Object.entries(MODULE_LABELS).map(([code, label]) => ({ code, label }))} selected={form.valid_modules} onChange={(valid_modules) => setForm({ ...form, valid_modules })} /><Checklist title="Períodos" items={PERIODS.map((period) => ({ code: period, label: PERIOD_LABEL[period] }))} selected={form.valid_periods} onChange={(valid_periods) => setForm({ ...form, valid_periods })} /><div className="sm:col-span-2 flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_subscription} onChange={(event) => setForm({ ...form, is_subscription: event.target.checked })} /> Assinatura</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Ativo</label></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={onSave}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null} Salvar</Button></DialogFooter></DialogContent></Dialog>;
}

function CampaignDialog({ open, type, onOpenChange, onSave, saving }: { open: boolean; type: "billing" | "renewal"; onOpenChange: (value: boolean) => void; onSave: (payload: CampaignPayload) => void; saving: boolean }) {
  const [name, setName] = useState("");
  const [audience, setAudience] = useState("");
  const [trigger, setTrigger] = useState("");
  const [message, setMessage] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{type === "renewal" ? "Nova régua de renovação" : "Nova régua de cobrança"}</DialogTitle><DialogDescription>Configure público, gatilho e mensagem desta régua administrativa.</DialogDescription></DialogHeader><div className="space-y-3"><Field label="Nome"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Público"><Input value={audience} onChange={(event) => setAudience(event.target.value)} /></Field><Field label="Gatilho"><Input value={trigger} onChange={(event) => setTrigger(event.target.value)} /></Field><Field label="Mensagem"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} /></Field></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={() => onSave({ type, name, audience, trigger_key: trigger, message, action: "", status: "draft", scheduled_at: null })}>Salvar régua</Button></DialogFooter></DialogContent></Dialog>;
}

function copyCouponUrl(coupon: Coupon) {
  const url = new URL(window.location.origin + "/checkout");
  url.searchParams.set("coupon", coupon.code);
  if (coupon.valid_plans?.[0]) url.searchParams.set("plan", coupon.valid_plans[0]);
  if (coupon.valid_periods?.[0]) url.searchParams.set("period", coupon.valid_periods[0]);
  url.searchParams.set("utm_source", "Vanessa Simoni");
  url.searchParams.set("utm_medium", "central_operacoes");
  url.searchParams.set("utm_campaign", `cupom_${coupon.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
  void navigator.clipboard.writeText(url.toString());
  toast.success("Checkout com cupom e UTM copiado.");
}

function normalizeCouponForm(form: CouponForm) {
  return { ...form, id: form.id, value: Number(form.value), starts_at: form.starts_at || null, expires_at: form.expires_at || null, max_uses: form.max_uses ? Number(form.max_uses) : null, max_uses_per_customer: form.max_uses_per_customer ? Number(form.max_uses_per_customer) : null, valid_modules: form.valid_modules ?? [], is_subscription: form.is_subscription };
}

function toCouponForm(coupon: Coupon): CouponForm {
  return { id: coupon.id, name: coupon.name ?? "", code: coupon.code, description: coupon.description ?? "", kind: coupon.kind, value: Number(coupon.value), is_active: coupon.is_active, starts_at: coupon.starts_at ? coupon.starts_at.slice(0, 16) : "", expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 16) : "", max_uses: coupon.max_uses ? String(coupon.max_uses) : "", max_uses_per_customer: coupon.max_uses_per_customer ? String(coupon.max_uses_per_customer) : "", valid_plans: coupon.valid_plans ?? [], valid_periods: coupon.valid_periods ?? [], valid_modules: coupon.valid_modules ?? [], is_subscription: coupon.is_subscription ?? true };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;
}

function Checklist<T extends string>({ title, items, selected, onChange }: { title: string; items: Array<{ code: T; label: string }>; selected: T[]; onChange: (value: T[]) => void }) {
  return <div><Label className="text-xs text-muted-foreground">{title}</Label><div className="mt-2 flex flex-wrap gap-2">{items.map((item) => { const active = selected.includes(item.code); return <button key={item.code} type="button" onClick={() => onChange(active ? selected.filter((value) => value !== item.code) : [...selected, item.code])} className={`rounded-md border px-3 py-1 text-xs ${active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{item.label}</button>; })}</div><p className="mt-1 text-[11px] text-muted-foreground">Nenhum selecionado permite todos.</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "—";
}

function EmptyState({ text }: { text: string }) {
  return <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function InlineError({ text }: { text: string }) {
  return <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{text}</div>;
}
