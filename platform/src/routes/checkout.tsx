import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeft, Check, Copy, CreditCard, ExternalLink, Loader2, Lock, QrCode, RefreshCw, ShieldCheck, Sparkles, Tag, Users } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { PaymentTestModeBanner } from "@/components/billing/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/billing/StripeEmbeddedCheckout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listPlans } from "@/lib/billing/plans.functions";
import { quoteCheckout } from "@/lib/billing/coupons.functions";
import { createCheckout, getPaymentStatus } from "@/lib/billing/checkout.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { EXTRA_EMPLOYEE_PRICE_CENTS, PERIOD_LABEL, PERIOD_BONUS_MONTHS, formatBRL, formatMonths, periodTotalMonths, type PaymentMethod, type Period, type PlanCode } from "@/lib/billing/types";

const searchSchema = z.object({
  plan: z.enum(["starter", "professional", "business", "enterprise"]).default("professional"),
  period: z.enum(["1m", "3m", "6m", "1y"]).default("6m"),
  extras: z.coerce.number().int().min(0).max(99).default(0),
  extrasOnly: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "true"),
  coupon: z.string().optional(),
});

export const Route = createFileRoute("/checkout")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Checkout · Vanessa Simoni" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const loadPlans = useServerFn(listPlans);
  const quote = useServerFn(quoteCheckout);
  const create = useServerFn(createCheckout);
  const loadPaymentStatus = useServerFn(getPaymentStatus);

  const extrasOnly = search.extrasOnly;
  const [extras, setExtras] = useState(Math.max(extrasOnly ? 1 : 0, search.extras));
  const [coupon, setCoupon] = useState(search.coupon?.toUpperCase() ?? "");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(search.coupon?.toUpperCase() ?? null);
  // Pix (Cora) temporariamente desativado — apenas cartão via Stripe.
  const PIX_ENABLED = false;
  const [method, setMethod] = useState<PaymentMethod>("credit_card");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pixPayment, setPixPayment] = useState<{ paymentId: string; copyPaste?: string; qrUrl?: string; chargeId?: string; expiresAt?: string; totalCents?: number } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerTaxId, setPayerTaxId] = useState("");
  const [payerPhone, setPayerPhone] = useState("");

  const plansQuery = useQuery({ queryKey: ["billing", "plans"], queryFn: () => loadPlans(), staleTime: 300_000 });
  const plan = (plansQuery.data?.plans ?? []).find((p: { code: string }) => p.code === search.plan) as { id: string; name: string } | undefined;

  const quoteQuery = useQuery({
    queryKey: ["billing", "quote", search.plan, search.period, extras, appliedCoupon, extrasOnly],
    queryFn: () =>
      quote({
        data: {
          planCode: search.plan as PlanCode,
          period: search.period as Period,
          extraEmployees: extras,
          extrasOnly,
          couponCode: appliedCoupon || undefined,
        },
      }),
    enabled: !!plan,
  });

  const statusMut = useMutation({
    mutationFn: async (paymentId: string) => loadPaymentStatus({ data: { id: paymentId } }),
    onSuccess: (result) => {
      setPaymentStatus(result.status);
      if (result.status === "paid" && result.activation_pending) {
        setCheckoutError(null);
        setCheckoutNotice("Pagamento confirmado. Estamos reconciliando a ativação sem refazer a cobrança.");
        return;
      }
      if (result.status === "paid") navigate({ to: "/painel" });
    },
    onError: (error) => setCheckoutError((error as Error)?.message ?? "Não foi possível consultar o pagamento."),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const environment = method === "pix" ? "sandbox" : getStripeEnvironment();
      return create({
        data: {
          planCode: search.plan as PlanCode,
          period: search.period as Period,
          extraEmployees: extras,
          extrasOnly,
          method,
          couponCode: appliedCoupon || undefined,
          environment,
          payerName: payerName || undefined,
          payerEmail: payerEmail || undefined,
          payerTaxId: payerTaxId || undefined,
          payerPhone: payerPhone || undefined,
          returnUrl: `${window.location.origin}/checkout-retorno?session_id={CHECKOUT_SESSION_ID}`,
        },
      });
    },
    onSuccess: (result) => {
      if (result.paymentId && result.totalCents === 0) {
        setCheckoutError(result.error ?? null);
        setCheckoutNotice(result.notice ?? "Pagamento aprovado. Finalizando a ativação do plano…");
        setClientSecret(null);
        setPixPayment(null);
        setPaymentStatus("paid");
        statusMut.mutate(result.paymentId);
        return;
      }
      if (result.error) {
        setCheckoutError(result.error);
        return;
      }
      if (result.pix && result.paymentId) {
        setCheckoutError(null);
        setCheckoutNotice(result.notice ?? null);
        setClientSecret(null);
        setPaymentStatus("pending");
        setPixPayment({
          paymentId: result.paymentId,
          copyPaste: result.pix.copyPaste,
          qrUrl: result.pix.qrUrl,
          chargeId: result.pix.chargeId,
          expiresAt: result.pix.expiresAt,
          totalCents: result.totalCents,
        });
        return;
      }
      if (!result.clientSecret) {
        setCheckoutError(method === "pix" ? "A Cora não retornou os dados do Pix." : "A Stripe não retornou a sessão de checkout.");
        return;
      }
      setCheckoutError(null);
      setCheckoutNotice(result.notice ?? null);
      setPixPayment(null);
      setClientSecret(result.clientSecret);
    },
    onError: (error) => {
      setCheckoutNotice(null);
      setCheckoutError((error as Error)?.message ?? (method === "pix" ? "Erro ao gerar Pix na Cora." : "Erro ao abrir checkout Stripe."));
    },
  });

  const q = quoteQuery.data;
  const checkoutLocked = !!clientSecret || !!pixPayment;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="relative flex-1 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-10 sm:px-10">
          <button
            type="button"
            onClick={() => navigate({ to: "/configuracoes" })}
            className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para planos
          </button>

          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="mr-1 h-3 w-3" /> Checkout seguro
              </Badge>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                {extrasOnly ? "Comprar adicionais" : "Finalize sua assinatura"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {extrasOnly ? (
                  <>Cada adicional libera <span className="font-semibold text-foreground">+1 usuário</span> e <span className="font-semibold text-foreground">+1 número de WhatsApp</span> no seu plano atual.</>
                ) : (
                  <>Plano <span className="font-semibold text-foreground">{plan?.name ?? "—"}</span> · {PERIOD_LABEL[search.period as Period]}</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5"><Lock className="h-3 w-3" /> Criptografia SSL</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5"><ShieldCheck className="h-3 w-3" /> Stripe</span>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <section className="space-y-5">
              <PaymentTestModeBanner />

              <StepCard step={1} icon={<Users className="h-4 w-4" />} title="Funcionários e WhatsApp Extras" desc={extrasOnly && (q?.prorationMonths ?? 1) > 1
                ? `${formatBRL(EXTRA_EMPLOYEE_PRICE_CENTS)} por adicional/mês · cobrança proporcional aos ${String(q?.prorationMonths).replace(".", ",")} mês(es) restantes do seu plano.`
                : `+${formatBRL(EXTRA_EMPLOYEE_PRICE_CENTS)} por adicional/mês · cada um libera +1 usuário e +1 número de WhatsApp.`}>
                <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 p-2 pl-4">
                  <span className="text-sm text-muted-foreground">Adicionais</span>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-9 w-9 rounded-lg text-base" onClick={() => setExtras(Math.max(extrasOnly ? 1 : 0, extras - 1))} disabled={checkoutLocked || extras <= (extrasOnly ? 1 : 0)}>−</Button>
                    <span className="w-12 text-center text-xl font-bold tabular-nums">{extras}</span>
                    <Button size="icon" variant="outline" className="h-9 w-9 rounded-lg text-base" onClick={() => setExtras(Math.min(99, extras + 1))} disabled={checkoutLocked}>+</Button>
                  </div>
                </div>
              </StepCard>

              <StepCard step={2} icon={<Tag className="h-4 w-4" />} title="Cupom de desconto" desc="Tem um código promocional? Aplique antes de finalizar.">
                <div className="flex gap-2">
                  <Input
                    className="h-11 rounded-xl uppercase tracking-wide"
                    placeholder="DIGITE SEU CUPOM"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    disabled={!!appliedCoupon || checkoutLocked}
                  />
                  {appliedCoupon ? (
                    <Button variant="outline" className="h-11 rounded-xl" disabled={checkoutLocked} onClick={() => { setAppliedCoupon(null); setCoupon(""); }}>Remover</Button>
                  ) : (
                    <Button className="h-11 rounded-xl" disabled={checkoutLocked} onClick={() => setAppliedCoupon(coupon.trim() || null)}>Aplicar</Button>
                  )}
                </div>
                {q?.couponMessage && <p className="mt-2 text-xs text-destructive">{q.couponMessage}</p>}
                {appliedCoupon && !q?.couponMessage && q?.discountCents ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Check className="h-3 w-3" /> Cupom {appliedCoupon} aplicado: −{formatBRL(q.discountCents)}
                  </p>
                ) : null}
              </StepCard>

              <StepCard step={3} icon={<CreditCard className="h-4 w-4" />} title="Forma de pagamento" desc={PIX_ENABLED ? "Cartão pela Stripe ou Pix com QR Code nesta tela." : "Pagamento por cartão no ambiente seguro da Stripe."}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PIX_ENABLED ? (
                    <MethodBtn active={method === "pix"} onClick={() => setMethod("pix")} icon={<QrCode className="h-4 w-4" />} label="Pix" desc="Via Cora" disabled={checkoutLocked} />
                  ) : null}
                  <MethodBtn active={method === "credit_card" || method === "debit_card"} onClick={() => setMethod("credit_card")} icon={<CreditCard className="h-4 w-4" />} label="Cartão de crédito" desc="Via Stripe" disabled={checkoutLocked} />
                </div>
              </StepCard>

              {PIX_ENABLED && method === "pix" && !pixPayment ? (
                <StepCard step={4} icon={<QrCode className="h-4 w-4" />} title="Dados para gerar o Pix" desc="CPF/CNPJ é obrigatório para a Cora emitir a cobrança.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input className="h-11 rounded-xl" placeholder="Nome ou razão social" value={payerName} onChange={(e) => setPayerName(e.target.value)} disabled={checkoutLocked} />
                    <Input className="h-11 rounded-xl" placeholder="CPF ou CNPJ" value={payerTaxId} onChange={(e) => setPayerTaxId(e.target.value)} disabled={checkoutLocked} />
                    <Input className="h-11 rounded-xl" placeholder="E-mail" type="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} disabled={checkoutLocked} />
                    <Input className="h-11 rounded-xl" placeholder="Telefone" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} disabled={checkoutLocked} />
                  </div>
                </StepCard>
              ) : null}

              {pixPayment ? (
                <PixPaymentBox
                  payment={pixPayment}
                  status={paymentStatus}
                  isChecking={statusMut.isPending}
                  onCheck={() => statusMut.mutate(pixPayment.paymentId)}
                  onReset={() => {
                    setPixPayment(null);
                    setPaymentStatus(null);
                    setCheckoutNotice(null);
                  }}
                />
              ) : null}

              {clientSecret ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-sm">
                  <StripeEmbeddedCheckout clientSecret={clientSecret} />
                </div>
              ) : null}

              {checkoutNotice && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-primary">{checkoutNotice}</div>
              )}

              {checkoutError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">{checkoutError}</div>
              )}

              {!checkoutLocked ? (
                <Button
                  size="lg"
                  className="h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5"
                  disabled={!q || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  {`Finalizar compra${q ? ` · ${formatBRL(q.totalCents)}` : ""}`}
                </Button>
              ) : null}
            </section>

            <aside className="lg:sticky lg:top-6 h-fit space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <div className="border-b border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Resumo do pedido</p>
                  <h3 className="mt-1 text-lg font-bold">{extrasOnly ? "Adicionais" : (plan?.name ?? "Plano")}</h3>
                  <p className="text-xs text-muted-foreground">{extrasOnly ? "Usuário + WhatsApp extras" : PERIOD_LABEL[search.period as Period]}</p>
                  {!extrasOnly && PERIOD_BONUS_MONTHS[search.period as Period] > 0 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                      +{formatMonths(PERIOD_BONUS_MONTHS[search.period as Period])} de bônus · acesso por {formatMonths(periodTotalMonths(search.period as Period))}
                    </p>
                  )}
                </div>

                <dl className="space-y-3 px-6 py-5 text-sm">
                  {!extrasOnly && <Row label={`${plan?.name ?? "Plano"} (${PERIOD_LABEL[search.period as Period]})`} value={q ? formatBRL(q.baseCents) : "—"} />}
                  {extras > 0 && <Row label={`Extras × ${extras}${extrasOnly && (q?.prorationMonths ?? 1) > 1 ? ` (proporcional · ${String(q?.prorationMonths).replace(".", ",")} mês(es))` : ""}`} value={q ? formatBRL(q.extrasCents) : "—"} />}
                  {q?.discountCents ? <Row label={`Cupom ${q.couponCode}`} value={`−${formatBRL(q.discountCents)}`} highlight /> : null}
                  <div className="mt-2 rounded-xl bg-muted/50 p-4">
                    <div className="flex items-end justify-between gap-4">
                      <span className="text-sm font-semibold">Total</span>
                      <span className="text-3xl font-bold tracking-tight text-primary">{q ? formatBRL(q.totalCents) : "—"}</span>
                    </div>
                  </div>
                </dl>
              </div>

              <ul className="space-y-2 rounded-2xl border border-border bg-card/50 p-5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> {method === "pix" ? "Pix processado pela Cora" : "Cartão processado pela Stripe"}, com confirmação automática.</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Ativação automática após a confirmação.</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Cancele quando quiser, em 1 clique.</li>
              </ul>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  desc,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur transition-colors hover:border-primary/30 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Passo {step}</span>
          </div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PixPaymentBox({
  payment,
  status,
  isChecking,
  onCheck,
  onReset,
}: {
  payment: { paymentId: string; copyPaste?: string; qrUrl?: string; chargeId?: string; expiresAt?: string; totalCents?: number };
  status: string | null;
  isChecking: boolean;
  onCheck: () => void;
  onReset: () => void;
}) {
  const copyPix = async () => {
    if (!payment.copyPaste) return;
    await navigator.clipboard.writeText(payment.copyPaste);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Pix gerado pela Cora</h3>
          <p className="text-xs text-muted-foreground">Pague pelo QR Code ou copie o código Pix.</p>
        </div>
        <Badge variant="outline" className="border-primary/30 text-primary">{status === "paid" ? "Pago" : "Aguardando pagamento"}</Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-background p-3">
          {payment.copyPaste ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(payment.copyPaste)}`}
              alt="QR Code Pix"
              className="h-56 w-56 object-contain"
            />
          ) : (
            <QrCode className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-3">
          {payment.copyPaste ? (
            <Textarea readOnly value={payment.copyPaste} className="min-h-28 resize-none text-xs" />
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              A Cora não retornou o copia-e-cola nesta resposta. Use o link/identificador abaixo ou consulte o status.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyPix} disabled={!payment.copyPaste}>
              <Copy className="mr-2 h-4 w-4" /> Copiar Pix
            </Button>
            {payment.qrUrl ? (
              <Button variant="outline" asChild>
                <a href={payment.qrUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir QR Code
                </a>
              </Button>
            ) : null}
            <Button variant="outline" onClick={onCheck} disabled={isChecking}>
              {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar status
            </Button>
            <Button variant="ghost" onClick={onReset}>Gerar outro Pix</Button>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            {payment.chargeId ? <p>Cobrança Cora: {payment.chargeId}</p> : null}
            {payment.expiresAt ? <p>Vencimento: {new Date(payment.expiresAt).toLocaleString("pt-BR")}</p> : null}
            {payment.totalCents ? <p>Valor: {formatBRL(payment.totalCents)}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}

function MethodBtn({ active, onClick, icon, label, desc, disabled }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; desc: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
        active ? "border-primary bg-primary/10 shadow-sm shadow-primary/20" : "border-border hover:-translate-y-0.5 hover:border-primary/40"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span className={`mt-0.5 rounded-lg p-2 ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{icon}</span>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
