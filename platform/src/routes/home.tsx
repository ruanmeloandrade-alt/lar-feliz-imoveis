import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Gauge,
  MessageCircle,
  Users,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMyAccounts } from "@/lib/accounts.functions";
import { listActivatedModules } from "@/lib/activated-modules.functions";
import { getMySubscription } from "@/lib/billing/plans.functions";
import { getHomeOverview } from "@/lib/home.functions";
import { buildHomeOnboardingAccess, buildHomeOnboardingPresentation } from "@/lib/home-onboarding";
import { getMyPermissions } from "@/lib/permissions-core.functions";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Início · MKTOn.io" },
      { name: "description", content: "Central do dia Vanessa Simoni: prioridades, saúde da operação e próximos passos da conta." },
    ],
  }),
  component: HomePage,
});

const ONBOARDING_CONFIG = {
  whatsapp: { label: "Conectar WhatsApp", to: "/integracoes" as const },
  meta: { label: "Conectar Meta", to: "/integracoes" as const },
  social: { label: "Conectar página ou perfil social", to: "/modulos/social-media" as const },
  funil: { label: "Montar funil de vendas", to: "/crm/funis-de-venda" as const },
};

function HomePage() {
  const fetchAccounts = useServerFn(listMyAccounts);
  const fetchSubscription = useServerFn(getMySubscription);
  const fetchOverview = useServerFn(getHomeOverview);
  const fetchActivatedModules = useServerFn(listActivatedModules);
  const fetchPermissions = useServerFn(getMyPermissions);

  const accountQ = useQuery({ queryKey: ["home", "account"], queryFn: () => fetchAccounts(), staleTime: 5 * 60_000 });
  const subscriptionQ = useQuery({ queryKey: ["home", "subscription"], queryFn: () => fetchSubscription(), staleTime: 5 * 60_000, retry: 1 });
  const overviewQ = useQuery({ queryKey: ["home", "operational-overview"], queryFn: () => fetchOverview(), staleTime: 60_000, retry: 1 });
  const activatedModulesQ = useQuery({ queryKey: ["activated-modules"], queryFn: () => fetchActivatedModules(), staleTime: 5 * 60_000, retry: 1 });
  const permissionsQ = useQuery({ queryKey: ["my-permissions"], queryFn: () => fetchPermissions(), staleTime: 60_000, retry: 1 });

  const firstName = useMemo(() => {
    const me = accountQ.data;
    const name = (me?.profile as any)?.display_name || (me?.profile as any)?.full_name || "";
    if (name) return String(name).split(" ")[0];
    const email = (me as any)?.email ?? "";
    return email ? String(email).split("@")[0] : "";
  }, [accountQ.data]);

  const subscription = subscriptionQ.data as any;
  const planName = subscription?.plan?.name ?? null;
  const trialDays = subscription?.trialDaysLeft ?? null;
  const isTrial = ["trial_active", "trialing"].includes(String(subscription?.status ?? ""));

  const health = overviewQ.data?.health ?? [];
  const healthyCount = health.filter((item) => item.state === "ok").length;
  const unavailableCount = health.filter((item) => item.state === "unavailable").length;
  const attention = overviewQ.data?.attention ?? [];

  const onboardingAccess = useMemo(
    () => buildHomeOnboardingAccess({
      entitledModules: (subscription?.modules ?? []) as string[],
      activatedModuleIds: (activatedModulesQ.data ?? []) as string[],
      effectivePermissions: permissionsQ.data?.effective,
      loading: subscriptionQ.isLoading || activatedModulesQ.isLoading || permissionsQ.isLoading,
      error: subscriptionQ.isError || activatedModulesQ.isError || permissionsQ.isError,
    }),
    [subscription, subscriptionQ.isLoading, subscriptionQ.isError, activatedModulesQ.data, activatedModulesQ.isLoading, activatedModulesQ.isError, permissionsQ.data, permissionsQ.isLoading, permissionsQ.isError],
  );

  const onboarding = useMemo(
    () => buildHomeOnboardingPresentation(overviewQ.data?.onboarding.steps ?? [], onboardingAccess),
    [overviewQ.data?.onboarding.steps, onboardingAccess],
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] space-y-5 px-4 pb-6 pt-16 sm:px-5 md:px-7 md:py-8">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Central do dia</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{firstName ? `Olá, ${firstName}` : "Olá"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Veja o que precisa da sua atenção e siga direto para a próxima ação.</p>
            </div>

            {subscriptionQ.isLoading && <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" aria-label="Carregando assinatura" />}
            {!subscriptionQ.isLoading && !subscriptionQ.isError && subscription && (
              <Link to="/configuracoes" hash="faturamento" className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/40">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span>{planName ?? (isTrial ? "Período de teste" : "Assinatura")}</span>
                {isTrial && trialDays != null && <Badge variant="outline" className="text-[10px]">{trialDays} dias</Badge>}
              </Link>
            )}
            {!subscriptionQ.isLoading && subscriptionQ.isError && (
              <Link to="/configuracoes" hash="faturamento" className="text-xs text-muted-foreground underline-offset-4 hover:underline">Assinatura indisponível</Link>
            )}
          </header>

          {overviewQ.isLoading && (
            <section className="grid gap-3 md:grid-cols-3" aria-label="Carregando visão operacional">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />)}
            </section>
          )}

          {!overviewQ.isLoading && overviewQ.isError && (
            <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">Visão operacional temporariamente indisponível</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Não foi possível ler os dados centrais do CRM. A Home não vai substituir essa falha por métricas zeradas ou estados inventados.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => overviewQ.refetch()}>Tentar novamente</Button>
                </div>
              </div>
            </section>
          )}

          {!overviewQ.isLoading && !overviewQ.isError && overviewQ.data && (
            <>
              <section className="rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><h2 className="text-sm font-semibold">Requer sua atenção</h2></div>
                  <p className="mt-1 text-xs text-muted-foreground">Só aparecem aqui situações que a plataforma conseguiu comprovar ou falhas explícitas de leitura.</p>
                </div>
                <div className="p-4">
                  {attention.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-4">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                      <div><div className="text-sm font-medium">Nenhuma ação crítica detectada</div><div className="text-xs text-muted-foreground">Os sinais verificáveis da Central do Dia não apontam pendências neste momento.</div></div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {attention.map((item) => (
                        <Link key={item.id} to={item.to} className="group flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/30">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.severity === "high" ? "bg-destructive/10 text-destructive" : item.severity === "medium" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}><AlertTriangle className="h-4 w-4" /></div>
                            <div className="min-w-0"><div className="text-sm font-medium">{item.title}</div><div className="text-xs leading-relaxed text-muted-foreground">{item.detail}</div></div>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3"><div className="text-xs font-medium text-muted-foreground">Leads nas últimas 24h</div><MessageCircle className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">{overviewQ.data.summary.leadsLast24h}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Novos registros reais no CRM</div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3"><div className="text-xs font-medium text-muted-foreground">Leads em aberto</div><Users className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">{overviewQ.data.summary.openLeads}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Fora de etapas ganhas ou perdidas</div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3"><div className="text-xs font-medium text-muted-foreground">Sem atualização há 48h</div><Clock3 className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">{overviewQ.data.summary.staleOpenLeads48h}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Leads abertos que podem exigir revisão</div>
                </div>
              </section>

              <section className={`grid gap-4 ${onboarding.show ? "lg:grid-cols-[1.5fr_1fr]" : ""}`}>
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="text-sm font-semibold">Saúde da operação</h2><p className="mt-1 text-xs text-muted-foreground">CRM, canais e integrações com estado verificável.</p></div>
                    <Badge variant="outline" className="w-fit text-[10px]">{healthyCount}/{health.length} operando{unavailableCount > 0 ? ` · ${unavailableCount} sem telemetria` : ""}</Badge>
                  </div>
                  <div className="grid gap-2 p-4 sm:grid-cols-2">
                    {health.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.state === "ok" ? "bg-success" : item.state === "attention" ? "bg-warning" : item.state === "off" ? "bg-muted-foreground/40" : "border border-muted-foreground/50 bg-transparent"}`} />
                        <div className="min-w-0"><div className="text-sm font-medium">{item.label}</div><div className="text-[11px] leading-relaxed text-muted-foreground">{item.detail}</div></div>
                      </div>
                    ))}
                  </div>
                </div>

                {onboarding.show && (
                  <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Próximo passo</h2><p className="mt-1 text-xs text-muted-foreground">Só considera recursos contratados, ativos, permitidos e verificáveis.</p></div>
                    <div className="space-y-4 p-5">
                      {onboardingAccess.error ? (
                        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><div className="text-sm font-medium">Ativação indisponível</div><div className="mt-1 text-xs text-muted-foreground">Não foi possível conferir plano, módulos ou permissões. Nenhum passo será recomendado até essa leitura voltar.</div></div></div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Configuração verificável</span><span className="font-medium tabular-nums">{onboarding.completed}/{onboarding.steps.length}</span></div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${onboarding.percentage}%` }} /></div>
                          </div>

                          {onboarding.next && (
                            <div className="rounded-xl border border-border bg-muted/20 p-4">
                              <div className="flex items-start gap-3"><Gauge className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><div className="text-xs font-medium text-muted-foreground">Recomendado agora</div><div className="mt-0.5 text-sm font-semibold">{ONBOARDING_CONFIG[onboarding.next.id].label}</div><div className="mt-1 text-xs text-muted-foreground">{onboarding.next.detail}</div></div></div>
                              <Button asChild size="sm" className="mt-4 w-full gap-2"><Link to={ONBOARDING_CONFIG[onboarding.next.id].to}>Continuar configuração <ArrowRight className="h-4 w-4" /></Link></Button>
                            </div>
                          )}

                          {!onboarding.next && onboarding.unavailable.length > 0 && (
                            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                              <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><div className="text-sm font-medium">Falta confirmar a configuração</div><div className="mt-1 text-xs text-muted-foreground">{onboarding.unavailable.map((step) => ONBOARDING_CONFIG[step.id].label).join(", ")} não pôde ser verificado agora.</div></div></div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
