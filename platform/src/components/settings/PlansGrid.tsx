import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Gift, HardDrive, Layers3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelMySubscription, listPlans } from "@/lib/billing/plans.functions";
import {
  PERIOD_LABEL,
  PERIOD_MONTHS,
  PERIOD_BONUS_MONTHS,
  formatBRL,
  formatMonths,
  periodBonusValueCents,
  periodSavingsCents,
  periodTotalMonths,
  type Period,
  type PlanCode,
} from "@/lib/billing/types";
import { PLAN_PRESENTATION } from "@/lib/billing/plan-catalog";
import { useMySubscription } from "@/hooks/use-subscription";

const PERIODS: Period[] = ["1m", "3m", "6m", "1y"];
const PLAN_ORDER: PlanCode[] = ["starter", "professional", "business", "enterprise"];
const PLAN_ICON: Record<PlanCode, React.ReactNode> = {
  starter: <Sparkles className="h-4 w-4" />,
  professional: <Layers3 className="h-4 w-4" />,
  business: <Crown className="h-4 w-4" />,
  enterprise: <Crown className="h-4 w-4" />,
};

export function PlansGrid() {
  const navigate = useNavigate();
  const loadPlans = useServerFn(listPlans);
  const { data: subscription } = useMySubscription();
  const [period, setPeriod] = useState<Period>("6m");
  const [cancelOpen, setCancelOpen] = useState(false);

  const plansQuery = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => loadPlans(),
    staleTime: 300_000,
  });

  const grid = useMemo(() => {
    const plans = (plansQuery.data?.plans ?? []) as Array<{
      id: string;
      code: PlanCode;
      name: string;
      modules: string[];
      max_employees_per_company: number;
      max_whatsapp_instances: number;
      description: string | null;
    }>;
    const prices = (plansQuery.data?.prices ?? []) as Array<{ plan_id: string; period: Period; amount_cents: number }>;
    return PLAN_ORDER.map((code) => {
      const plan = plans.find((p) => p.code === code);
      if (!plan) return null;
      const priceMap = new Map(prices.filter((p) => p.plan_id === plan.id).map((p) => [p.period, p.amount_cents]));
      return { ...plan, prices: priceMap };
    }).filter(Boolean) as Array<{
      id: string;
      code: PlanCode;
      name: string;
      modules: string[];
      max_employees_per_company: number;
      max_whatsapp_instances: number;
      description: string | null;
      prices: Map<Period, number>;
    }>;
  }, [plansQuery.data]);

  // Campo legado mantido no banco por compatibilidade. A partir de agora ele
  // representa apenas conexões adicionais de WhatsApp, nunca assentos de usuário.
  const currentExtras = Math.max(0, Number((subscription as { extra_employees?: number | null } | null)?.extra_employees ?? 0));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Planos e assinaturas</h2>
        <p className="text-xs text-muted-foreground">
          Os recursos de cada plano são os mesmos em todos os ciclos. O período escolhido altera somente cobrança, vigência e bônus.
        </p>
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {PERIODS.map((p) => {
          const bonus = PERIOD_BONUS_MONTHS[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABEL[p]}
              {bonus > 0 && (
                <span className={`ml-1.5 ${period === p ? "text-primary-foreground/85" : "text-primary"}`}>
                  +{formatMonths(bonus)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {PERIOD_BONUS_MONTHS[period] > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-foreground">
            <span className="font-semibold">Bônus {PERIOD_LABEL[period]}:</span>{" "}
            você paga {PERIOD_LABEL[period]} e usa {formatMonths(periodTotalMonths(period))}. {formatMonths(PERIOD_BONUS_MONTHS[period])} de cortesia inclusos. A economia exata aparece em cada plano comparada ao valor mensal.
          </p>
        </div>
      )}

      {plansQuery.isLoading && <div className="text-sm text-muted-foreground">Carregando planos…</div>}

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        {grid.map((plan) => {
          const presentation = PLAN_PRESENTATION[plan.code];
          const cents = plan.prices.get(period) ?? 0;
          const paidMonthlyAverage = cents / Math.max(1, PERIOD_MONTHS[period] ?? 1);
          const monthlyPrice = plan.prices.get("1m") ?? 0;
          const savings = periodSavingsCents(monthlyPrice, cents, period);
          const bonusValue = periodBonusValueCents(monthlyPrice, period);
          const isCurrent = (subscription?.plan as { code?: string } | undefined)?.code === plan.code && subscription?.status === "active";
          const inheritedCode = presentation.inheritsFrom;
          const inheritedName = inheritedCode ? PLAN_PRESENTATION[inheritedCode].name : null;
          const inheritedPlan = inheritedCode ? grid.find((candidate) => candidate.code === inheritedCode) : undefined;
          const highlight = plan.code === "business";

          return (
            <div
              key={plan.code}
              className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md ${
                highlight ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
              }`}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">{PLAN_ICON[plan.code]}</span>
                  <h3 className="truncate text-base font-bold leading-tight">{presentation.name}</h3>
                </div>
                {highlight && (
                  <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Popular
                  </span>
                )}
              </div>

              <p className="mt-2 min-h-[48px] break-words text-xs leading-relaxed text-muted-foreground">
                {presentation.tagline}
              </p>

              <div className="mt-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-baseline gap-1">
                  <span className="text-2xl font-bold leading-none tracking-tight tabular-nums">
                    {formatBRL(Math.round(paidMonthlyAverage))}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">/mês</span>
                </div>
                <div className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">
                  {PERIOD_LABEL[period]} · total {formatBRL(cents)}
                </div>

                {savings > 0 && (
                  <div className="mt-2 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] font-semibold leading-snug text-primary">
                    Economia de {formatBRL(savings)} comparado ao mensal
                    {bonusValue > 0 && (
                      <span className="block font-medium text-primary/80">
                        Inclui {formatBRL(bonusValue)} em {formatMonths(PERIOD_BONUS_MONTHS[period])} de cortesia
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3 text-xs">
                {inheritedName && (
                  <div className="flex items-start gap-2 font-semibold text-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">Tudo do plano {inheritedName}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="font-medium">Faculdade Vanessa Simoni</span>
                  </div>
                  <div className="flex items-start gap-2 text-foreground">
                    <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{presentation.storageGb} GB de armazenamento incluído</span>
                  </div>
                  <div className="flex items-start gap-2 text-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>Usuários ilimitados</span>
                  </div>
                  {(!inheritedPlan || inheritedPlan.max_whatsapp_instances !== plan.max_whatsapp_instances) && (
                    <div className="flex items-start gap-2 text-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{`${inheritedPlan ? "Sobe para " : "Até "}${plan.max_whatsapp_instances} número(s) de WhatsApp`}</span>
                    </div>
                  )}
                </div>

                {presentation.groups.map((group) => (
                  <div key={group.title} className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </div>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-muted-foreground">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                          <span className="min-w-0 break-words">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-5">
                {isCurrent ? (
                  <Button className="w-full rounded-lg" variant="secondary" onClick={() => setCancelOpen(true)}>
                    Plano atual
                  </Button>
                ) : (
                  <Button
                    className="w-full rounded-lg"
                    variant={highlight ? "default" : "outline"}
                    onClick={() => navigate({ to: "/checkout", search: { plan: plan.code, period, extras: currentExtras } })}
                  >
                    Assinar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CancelSubscriptionDialog open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

function CancelSubscriptionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const cancelFn = useServerFn(cancelMySubscription);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => cancelFn({ data: { reason: reason.trim() || undefined } }),
    onSuccess: (res: { ok?: boolean; error?: string }) => {
      if (res?.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setDone(true);
      queryClient.invalidateQueries();
    },
    onError: (e) => setError((e as Error)?.message ?? "Não foi possível cancelar agora."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setReason("");
          setError(null);
          setDone(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Assinatura cancelada</DialogTitle>
              <DialogDescription>
                Seu cancelamento foi registrado. Você pode assinar novamente quando quiser.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="w-full" onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Solicitar cancelamento</DialogTitle>
              <DialogDescription>
                Ao confirmar, sua assinatura será cancelada e o acesso aos módulos do plano será encerrado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Motivo (opcional)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Conte rapidamente o que motivou o cancelamento."
                className="min-h-24 resize-none"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Manter meu plano</Button>
              <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Cancelando…" : "Confirmar cancelamento"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
