import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  BarChart3,
  Check,
  Crown,
  KanbanSquare,
  LineChart,
  Megaphone,
  Minus,
  Sparkles,
  Star,
  Target,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

type PeriodKey = "1m" | "3m" | "6m" | "1y";

const PERIODS: { key: PeriodKey; label: string; save?: string }[] = [
  { key: "1m", label: "Mensal" },
  { key: "3m", label: "Trimestral", save: "Economize 16%" },
  { key: "6m", label: "Semestral", save: "Economize 22%" },
  { key: "1y", label: "Anual", save: "Economize 25%" },
];

const PERIOD_SUFFIX: Record<PeriodKey, string> = {
  "1m": "/mês",
  "3m": "/trimestre",
  "6m": "/semestre",
  "1y": "/ano",
};

type Plan = {
  code: string;
  name: string;
  tagline: string;
  icon: typeof Bot;
  badge?: { label: string; icon: string };
  inherits?: string;
  features: { t: string; i: typeof Bot }[];
  prices: Record<PeriodKey, number>;
  cta: string;
  featured?: boolean;
  note?: string;
};

const PLANS: Plan[] = [
  {
    code: "start",
    name: "Start",
    tagline: "Ideal para profissionais e pequenas empresas que desejam organizar o processo comercial.",
    icon: Sparkles,
    features: [
      { t: "CRM Completo", i: Users },
      { t: "Automações", i: Zap },
      { t: "IA de Atendimento", i: Bot },
      { t: "Dashboard", i: BarChart3 },
      { t: "1 usuário", i: Users },
      { t: "1 número de WhatsApp", i: Users },
    ],
    prices: { "1m": 397, "3m": 990, "6m": 1866, "1y": 3573 },
    cta: "Começar Agora",
  },
  {
    code: "growth",
    name: "Growth",
    tagline: "Ideal para empresas em crescimento que precisam integrar vendas, operação e equipe em um único lugar.",
    icon: Workflow,
    inherits: "Start",
    features: [
      { t: "Fluxo de Trabalho", i: KanbanSquare },
      { t: "3 usuários", i: Users },
      { t: "3 números de WhatsApp", i: Users },
    ],
    prices: { "1m": 697, "3m": 1740, "6m": 3276, "1y": 6273 },
    cta: "Quero Evoluir",
  },
  {
    code: "performance",
    name: "Performance",
    tagline: "Ideal para empresas que desejam escalar utilizando dados, automação e atendimento prioritário.",
    icon: Target,
    badge: { label: "MAIS VENDIDO", icon: "⭐" },
    inherits: "Growth",
    features: [
      { t: "Tracking", i: LineChart },
      { t: "5 usuários", i: Users },
      { t: "5 números de WhatsApp", i: Users },
      { t: "Suporte Prioritário", i: Bot },
    ],
    prices: { "1m": 997, "3m": 2490, "6m": 4686, "1y": 8973 },
    cta: "Quero Performance",
    featured: true,
  },
  {
    code: "scale",
    name: "Scale",
    tagline: "Ideal para empresas que desejam uma solução completa, com implementação realizada pela equipe da MKTOn e suporte prioritário.",
    icon: Crown,
    badge: { label: "SOLUÇÃO COMPLETA", icon: "👑" },
    inherits: "Performance",
    features: [
      { t: "Gestão de Tráfego com IA", i: Megaphone },
      { t: "Social Media com IA", i: Sparkles },
      { t: "10 usuários", i: Users },
      { t: "10 números de WhatsApp", i: Users },
      { t: "Suporte Prioritário", i: Bot },
      { t: "Implementação Gratuita", i: Crown },
    ],
    prices: { "1m": 1497, "3m": 3740, "6m": 7036, "1y": 13473 },
    cta: "Quero Escalar",
    note: "Economize mais de R$ 3.000 por mês em comparação à contratação individual dos serviços.",
  },
];

const COMPARISON: { feature: string; plans: Record<string, boolean | string> }[] = [
  { feature: "CRM Completo", plans: { start: true, growth: true, performance: true, scale: true } },
  { feature: "Automações", plans: { start: true, growth: true, performance: true, scale: true } },
  { feature: "IA de Atendimento", plans: { start: true, growth: true, performance: true, scale: true } },
  { feature: "Dashboard", plans: { start: true, growth: true, performance: true, scale: true } },
  { feature: "Fluxo de Trabalho", plans: { start: false, growth: true, performance: true, scale: true } },
  { feature: "Tracking", plans: { start: false, growth: false, performance: true, scale: true } },
  { feature: "Gestão de Tráfego com IA", plans: { start: false, growth: false, performance: false, scale: true } },
  { feature: "Social Media com IA", plans: { start: false, growth: false, performance: false, scale: true } },
  { feature: "Quantidade de Usuários", plans: { start: "1 Usuário", growth: "3 Usuários", performance: "5 Usuários", scale: "10 Usuários" } },
  { feature: "Números de WhatsApp", plans: { start: "1 WhatsApp", growth: "3 WhatsApps", performance: "5 WhatsApps", scale: "10 WhatsApps" } },
  { feature: "Suporte Prioritário", plans: { start: false, growth: false, performance: true, scale: true } },
  { feature: "Implementação Gratuita", plans: { start: false, growth: false, performance: false, scale: true } },
];

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function PricingSection() {
  const [period, setPeriod] = useState<PeriodKey>("6m");

  return (
    <section id="planos" className="relative overflow-hidden px-6 py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(70% 100% at 50% 0%, color-mix(in oklab, var(--lp-accent) 12%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-3xl text-center">
          <span className="lp-chip">Planos Vanessa Simoni</span>
          <h2 className="mt-5 text-[clamp(1.9rem,3.6vw,3rem)] leading-[1.08]">
            Escolha o plano ideal para acelerar o crescimento da sua empresa.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed" style={{ color: "var(--lp-ink-2)" }}>
            Tudo o que sua empresa precisa para vender mais, automatizar processos e acompanhar resultados em uma única
            plataforma.
          </p>
        </div>

        {/* Seletor de período */}
        <div className="mt-9 flex justify-center">
          <div
            className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-1.5 rounded-2xl border p-1.5 backdrop-blur-xl"
            style={{ borderColor: "var(--lp-line)", background: "rgba(255,255,255,.7)" }}
          >
            {PERIODS.map((p) => {
              const active = p.key === period;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className="relative flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-colors"
                  style={{ color: active ? "#fff" : "var(--lp-ink-2)" }}
                >
                  {active && (
                    <motion.span
                      layoutId="mkton-period-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: "linear-gradient(135deg, var(--lp-accent), var(--lp-accent-dark))",
                        boxShadow: "0 12px 26px -14px rgba(29,78,216,.85)",
                      }}
                    />
                  )}
                  <span className="relative flex items-center justify-center gap-2">
                    {p.label}
                    {p.save && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                        style={{
                          background: active ? "rgba(255,255,255,.22)" : "var(--lp-accent-soft)",
                          color: active ? "#fff" : "var(--lp-accent-dark)",
                        }}
                      >
                        {p.save}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cards */}
        <div className="mt-10 grid items-start gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.code} plan={plan} period={period} />
          ))}
        </div>

        <ComparisonTable />
      </div>
    </section>
  );
}

function PlanCard({ plan, period }: { plan: Plan; period: PeriodKey }) {
  const Icon = plan.icon;
  const featured = !!plan.featured;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`group relative flex h-full flex-col rounded-3xl border p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 ${
        featured ? "xl:-mt-6 xl:pb-9 xl:pt-9" : ""
      }`}
      style={
        featured
          ? {
              borderColor: "color-mix(in oklab, var(--lp-accent) 55%, transparent)",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--lp-accent) 7%, #fff), rgba(255,255,255,.86))",
              boxShadow: "0 34px 70px -34px rgba(29,78,216,.55)",
            }
          : {
              borderColor: "var(--lp-line)",
              background: "rgba(255,255,255,.78)",
              boxShadow: "0 18px 40px -32px rgba(11,21,36,.45)",
            }
      }
    >
      {plan.badge && (
        <div
          className="absolute -top-3 left-6 flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest"
          style={
            featured
              ? {
                  background: "linear-gradient(135deg, var(--lp-accent), var(--lp-accent-dark))",
                  color: "#fff",
                  boxShadow: "0 12px 24px -12px rgba(29,78,216,.9)",
                }
              : { background: "var(--lp-ink)", color: "#fff" }
          }
        >
          <span>{plan.badge.icon}</span>
          {plan.badge.label}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--lp-accent-soft)", color: "var(--lp-accent-dark)" }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h3 className="text-[20px] font-semibold">{plan.name}</h3>
      </div>

      <p className="mt-3 min-h-[42px] text-[13.5px] leading-relaxed" style={{ color: "var(--lp-ink-2)" }}>
        {plan.tagline}
      </p>

      <div className="mt-5 min-h-[64px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={period}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex items-end gap-1">
              <span className="text-[clamp(1.9rem,2.6vw,2.4rem)] font-semibold leading-none tracking-tight">
                {brl(Math.round(plan.prices[period] / (period === "3m" ? 3 : period === "6m" ? 6 : 12)))}
              </span>
              <span className="pb-1 text-[13px]" style={{ color: "var(--lp-muted)" }}>
                /mês
              </span>
            </div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--lp-muted)" }}>
              {period === "1m" ? brl(plan.prices[period]) : `${brl(plan.prices[period])} no ${PERIODS.find((p) => p.key === period)?.label.toLowerCase()}`}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="my-5 h-px" style={{ background: "var(--lp-line-soft)" }} />

      <ul className="space-y-2.5">
        {plan.inherits && (
          <li className="flex items-center gap-2 text-[13.5px] font-semibold">
            <Check className="h-4 w-4 shrink-0" style={{ color: "var(--lp-accent)" }} />
            Tudo do {plan.inherits} +
          </li>
        )}
        {plan.features.map((f) => (
          <li key={f.t} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: "var(--lp-ink-2)" }}>
            <f.i className="mt-[2px] h-4 w-4 shrink-0" style={{ color: "var(--lp-accent)" }} />
            <span>{f.t}</span>
          </li>
        ))}
      </ul>

      {plan.note && (
        <div
          className="mt-5 rounded-2xl border p-3.5 text-[12.5px] font-medium leading-relaxed"
          style={{
            borderColor: "color-mix(in oklab, var(--lp-accent) 25%, transparent)",
            background: "var(--lp-accent-soft)",
            color: "var(--lp-accent-dark)",
          }}
        >
          {plan.note}
        </div>
      )}

      <div className="mt-auto pt-6">
        <Link
          to="/auth"
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[14.5px] font-semibold transition-all duration-300 ${
            featured ? "" : "hover:-translate-y-0.5"
          }`}
          style={
            featured
              ? {
                  background: "linear-gradient(135deg, var(--lp-accent), var(--lp-accent-dark))",
                  color: "#fff",
                  boxShadow: "0 20px 38px -18px rgba(29,78,216,.85)",
                }
              : { border: "1px solid var(--lp-line)", background: "#fff", color: "var(--lp-ink)" }
          }
        >
          {plan.cta}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>
    </motion.div>
  );
}

function ComparisonTable() {
  return (
    <div className="mt-14">
      <h3 className="text-center text-[clamp(1.4rem,2.4vw,1.9rem)] leading-tight">Compare os recursos de cada plano</h3>
      <div
        className="mt-7 overflow-x-auto rounded-3xl border backdrop-blur-xl"
        style={{ borderColor: "var(--lp-line)", background: "rgba(255,255,255,.78)" }}
      >
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr style={{ background: "var(--lp-accent-soft)" }}>
              <th className="px-5 py-4 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--lp-ink-2)" }}>
                Recurso
              </th>
              {PLANS.map((p) => (
                <th key={p.code} className="px-4 py-4 text-center text-[13.5px] font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {p.featured && <Star className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} />}
                    {p.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row, i) => (
              <tr key={row.feature} style={{ background: i % 2 ? "rgba(239,246,255,.35)" : "transparent" }}>
                <td className="px-5 py-3.5 text-[14px]" style={{ color: "var(--lp-ink)" }}>
                  {row.feature}
                </td>
                {PLANS.map((p) => {
                  const v = row.plans[p.code];
                  return (
                    <td key={p.code} className="px-4 py-3.5 text-center text-[13.5px]" style={{ color: "var(--lp-ink)" }}>
                      {typeof v === "string" ? (
                        v
                      ) : v ? (
                        <Check className="mx-auto h-[18px] w-[18px]" style={{ color: "var(--lp-accent)" }} />
                      ) : (
                        <Minus className="mx-auto h-[18px] w-[18px]" style={{ color: "var(--lp-muted)" }} />
                      )}
                    </td>
                  );
                })}

              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-5 text-center text-[13px]" style={{ color: "var(--lp-muted)" }}>
        20 dias grátis para testar todos os planos. Sem cartão de crédito e cancelamento em 1 clique.
      </p>
    </div>
  );
}
