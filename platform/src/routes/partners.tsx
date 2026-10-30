import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ArrowRight, BadgePercent, Calculator, Handshake, Loader2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadPartnerProgramAccess } from "@/lib/partner-program-access";
import { resolvePartnerProgramEntry } from "@/lib/partner-program-entry";

export const Route = createFileRoute("/partners")({
  validateSearch: z.object({ role: z.enum(["affiliate", "partner"]).optional() }),
  head: () => ({ meta: [
    { title: "Afiliados e Partners · Vanessa Simoni" },
    { name: "description", content: "Cadastre-se como Afiliado ou Partner da Vanessa Simoni." },
  ] }),
  component: PartnersRoute,
});

type ProgramRole = "affiliate" | "partner";
type BillingPeriod = "1m" | "3m" | "6m" | "1y";

type PlanPrice = { code: string; name: string; prices: Record<BillingPeriod, number> };
const PLANS: PlanPrice[] = [
  { code: "starter", name: "Start", prices: { "1m": 39700, "3m": 99000, "6m": 186590, "1y": 357300 } },
  { code: "professional", name: "Growth", prices: { "1m": 69700, "3m": 174000, "6m": 327590, "1y": 627300 } },
  { code: "business", name: "Performance", prices: { "1m": 99700, "3m": 249000, "6m": 468590, "1y": 897300 } },
  { code: "enterprise", name: "Scale", prices: { "1m": 149700, "3m": 374000, "6m": 703590, "1y": 1347300 } },
];

const PERIODS: Array<{ code: BillingPeriod; label: string; renewal: string }> = [
  { code: "1m", label: "Mensal", renewal: "por renovação mensal" },
  { code: "3m", label: "Trimestral", renewal: "por renovação trimestral" },
  { code: "6m", label: "Semestral", renewal: "por renovação semestral" },
  { code: "1y", label: "Anual", renewal: "por renovação anual" },
];

function PartnersRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath !== "/partners") return <Outlet />;
  return <PartnersPublicPage />;
}

function PartnersPublicPage() {
  const search = Route.useSearch();
  const [role, setRole] = useState<ProgramRole>(search.role ?? "affiliate");
  const [saving, setSaving] = useState(false);
  const [checkingExistingAccess, setCheckingExistingAccess] = useState(true);
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "", whatsapp: "", instagram: "", experience: "", personType: "",
    channel: "", audience: "",
  });

  useEffect(() => {
    let active = true;
    setCheckingExistingAccess(true);

    void (async () => {
      try {
        const access = await loadPartnerProgramAccess();
        if (!active) return;
        if (!access.authenticated) {
          setCheckingExistingAccess(false);
          return;
        }

        const destination = resolvePartnerProgramEntry({
          authenticated: true,
          role,
          statuses: access.statuses,
          isAdmin: access.isAdmin,
        });

        if (destination.kind === "dashboard") {
          window.location.replace(
            destination.adminPreview ? `${destination.href}?preview=admin` : destination.href,
          );
          return;
        }
      } catch (error) {
        console.error("[partners] existing access resolution failed", error);
      }
      if (active) setCheckingExistingAccess(false);
    })();

    return () => {
      active = false;
    };
  }, [role]);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.whatsapp.trim() || !form.experience || !form.personType) {
      toast.error("Preencha nome, e-mail, WhatsApp, experiência e tipo de pessoa.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Crie uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("As senhas não conferem.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/public/partners/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Não foi possível concluir o cadastro.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (signInError) {
        toast.success("Conta criada. Entre com o e-mail e a senha que você acabou de cadastrar.");
        window.location.href = "/auth?mode=login&next=%2Fcontas";
        return;
      }

      toast.success("Conta criada. Acesso liberado.");
      window.location.href = "/contas";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingExistingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-950">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
          Verificando seu acesso ao programa...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="font-black tracking-tight">Vanessa Simoni</Link>
          <Link to="/contas" className="text-sm font-semibold text-violet-700">Já tenho acesso</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1fr_0.9fr] lg:py-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700"><Handshake className="h-4 w-4" /> Programa Vanessa Simoni</span>
          <h1 className="mt-5 max-w-2xl text-4xl font-black leading-tight md:text-5xl">Indique, acompanhe e cresça com a Vanessa Simoni.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">Escolha Afiliado para indicar clientes e acompanhar comissões ou Partner para construir uma carreira de implementação e operação dentro do ecossistema Vanessa Simoni.</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Feature icon={BadgePercent} title="Afiliado" text="50% na primeira venda elegível + 15% nas renovações." />
            <Feature icon={Users} title="Partner" text="Começa em 35%. A recorrência acompanha a mesma faixa de comissão do Partner." />
            <Feature icon={ShieldCheck} title="Acesso imediato" text="Crie a conta e entre na hora. A aprovação comercial libera divulgação e comissões." />
          </div>

          <GainSimulator />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setRole("affiliate")} className={`rounded-xl px-4 py-3 text-sm font-black ${role === "affiliate" ? "bg-white shadow-sm" : "text-slate-500"}`}>Afiliado</button>
            <button type="button" onClick={() => setRole("partner")} className={`rounded-xl px-4 py-3 text-sm font-black ${role === "partner" ? "bg-white shadow-sm" : "text-slate-500"}`}>Partner</button>
          </div>

          <h2 className="mt-6 text-2xl font-black">{role === "affiliate" ? "Criar conta de Afiliado" : "Criar conta de Partner"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">O acesso é imediato. Você entra na plataforma assim que concluir o cadastro; divulgação, links e comissões dependem apenas da aprovação comercial.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Nome completo" value={form.name} onChange={(value) => set("name", value)} />
            <Field label="E-mail" type="email" value={form.email} onChange={(value) => set("email", value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Senha" type="password" value={form.password} onChange={(value) => set("password", value)} />
              <Field label="Confirmar senha" type="password" value={form.confirmPassword} onChange={(value) => set("confirmPassword", value)} />
            </div>
            <Field label="WhatsApp" value={form.whatsapp} onChange={(value) => set("whatsapp", value)} />
            <Field label="Instagram" placeholder="@seuinstagram" value={form.instagram} onChange={(value) => set("instagram", value)} />
            <SelectField label="Tipo de pessoa" value={form.personType} onChange={(value) => set("personType", value)} options={[
              ["", "Selecione"], ["pf", "Pessoa física"], ["pj", "Pessoa jurídica"],
            ]} />
            <SelectField label="Nível de experiência" value={form.experience} onChange={(value) => set("experience", value)} options={[
              ["", "Selecione"], ["iniciante", "Iniciante"], ["intermediario", "Intermediário"], ["avancado", "Avançado"], ["especialista", "Especialista"],
            ]} />
            <Field label="Principal canal de aquisição" value={form.channel} onChange={(value) => set("channel", value)} />
            <label className="block text-sm font-semibold">Público / operação<textarea rows={3} value={form.audience} onChange={(event) => set("audience", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500" /></label>
            <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-60">{saving ? "Criando e entrando..." : role === "affiliate" ? "Criar conta de Afiliado" : "Criar conta de Partner"}{!saving ? <ArrowRight className="h-4 w-4" /> : null}</button>
          </form>
        </div>
      </section>
    </main>
  );
}

function GainSimulator() {
  const [simRole, setSimRole] = useState<ProgramRole>("affiliate");
  const [planCode, setPlanCode] = useState("professional");
  const [period, setPeriod] = useState<BillingPeriod>("1m");
  const [customers, setCustomers] = useState(1);
  const plan = useMemo(() => PLANS.find((item) => item.code === planCode) ?? PLANS[0], [planCode]);
  const periodMeta = PERIODS.find((item) => item.code === period) ?? PERIODS[0];
  const saleValue = plan.prices[period];
  const initialRate = simRole === "affiliate" ? 0.50 : 0.35;
  const recurringRate = simRole === "affiliate" ? 0.15 : 0.35;
  const initial = Math.round(saleValue * initialRate * customers);
  const recurring = Math.round(saleValue * recurringRate * customers);

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-violet-600" /><h2 className="font-black">Simule seus ganhos</h2></div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-black">
          <button type="button" onClick={() => setSimRole("affiliate")} className={`rounded-lg px-3 py-2 ${simRole === "affiliate" ? "bg-white shadow-sm" : "text-slate-500"}`}>Afiliado</button>
          <button type="button" onClick={() => setSimRole("partner")} className={`rounded-lg px-3 py-2 ${simRole === "partner" ? "bg-white shadow-sm" : "text-slate-500"}`}>Partner</button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">A simulação usa os preços vigentes por plano e período. Para Partner, usamos a faixa inicial de 35%; quando houver progressão, primeira venda e recorrência acompanham a mesma faixa vigente.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <SelectField label="Plano" value={planCode} onChange={setPlanCode} options={PLANS.map((item) => [item.code, item.name])} />
        <SelectField label="Período" value={period} onChange={(value) => setPeriod(value as BillingPeriod)} options={PERIODS.map((item) => [item.code, item.label])} />
        <label className="text-sm font-semibold">Clientes indicados<input type="number" min={1} max={1000} value={customers} onChange={(e) => setCustomers(Math.max(1, Number(e.target.value) || 1))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" /></label>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm"><span className="font-semibold">Valor da venda:</span> {money(saleValue)} · {periodMeta.label}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label={`Primeira venda · ${Math.round(initialRate * 100)}%`} value={money(initial)} />
        <Metric label={`Recorrência · ${Math.round(recurringRate * 100)}% ${periodMeta.renewal}`} value={money(recurring)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-100 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>; }
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function Feature({ icon: Icon, title, text }: { icon: typeof BadgePercent; title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-violet-600" /><p className="mt-3 text-sm font-black">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>; }
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <label className="block text-sm font-semibold">{label}<input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500" /></label>; }
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]> | string[][] }) { return <label className="block text-sm font-semibold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">{options.map(([code, name]) => <option key={code || "empty"} value={code}>{name}</option>)}</select></label>; }