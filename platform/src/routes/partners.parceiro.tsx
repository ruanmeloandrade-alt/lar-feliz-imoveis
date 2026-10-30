import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/partners/parceiro")({
  validateSearch: z.object({ preview: z.enum(["admin"]).optional() }),
  component: PartnerDashboard,
});

type AccessState = "loading" | "pending" | "approved" | "admin_preview" | "denied";

function PartnerDashboard() {
  const { preview } = Route.useSearch();
  const [access, setAccess] = useState<AccessState>("loading");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId || !active) return setAccess("denied");
      const [{ data: role }, { data: isAdmin }] = await Promise.all([
        (supabase as any).from("partner_program_roles").select("status").eq("user_id", userId).eq("role", "partner").maybeSingle(),
        (supabase as any).rpc("partner_program_is_admin", { _user_id: userId }),
      ]);
      if (!active) return;

      if (preview === "admin" && isAdmin === true) return setAccess("admin_preview");
      if (role?.status === "pending") return setAccess("pending");
      if (role?.status === "approved") {
        setAccess("approved");
        const { data: dashboard, error: dashboardError } = await (supabase as any).rpc("partner_program_my_partner_dashboard");
        if (!active) return;
        if (dashboardError) setError(dashboardError.message); else setData(dashboard);
        return;
      }
      if (isAdmin === true) return setAccess("admin_preview");
      setAccess("denied");
    })();
    return () => { active = false; };
  }, [preview]);

  if (access === "loading") return <State title="Área de Partner" text="Carregando seu acesso..." />;
  if (access === "denied") return <State title="Área de Partner" text="Esta conta não possui acesso de Partner ativo." />;
  if (access === "admin_preview") return <PartnerLayout data={null} adminPreview />;
  if (access === "pending") return <PartnerLayout data={null} pending />;
  if (error) return <State title="Área de Partner" text={error} />;
  if (!data) return <State title="Área de Partner" text="Carregando dados reais..." />;
  return <PartnerLayout data={data} />;
}

function PartnerLayout({ data, adminPreview = false, pending = false }: { data: any; adminPreview?: boolean; pending?: boolean }) {
  const commission = data?.commission ?? {};
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-violet-600">Vanessa Simoni Partners</p>
            <h1 className="mt-2 text-3xl font-black">Área de Partner</h1>
            <p className="mt-2 text-sm text-slate-500">Sua conta principal e os clientes vinculados aparecem no seletor de contas da Vanessa Simoni.</p>
            {adminPreview ? <p className="mt-2 text-sm text-amber-700">Pré-visualização administrativa. Dados financeiros não são simulados.</p> : null}
            {pending ? <p className="mt-2 text-sm text-amber-700">Cadastro em análise. Você já pode estudar, usar a comunidade e acessar a plataforma; link e benefícios comerciais serão liberados após aprovação.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/partners/faculdade" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Faculdade Partners</Link>
            {!adminPreview ? <Link to="/partners/financeiro" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Financeiro</Link> : null}
            <Link to="/partners/comunidade" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Comunidade Partners</Link>
            <Link to="/contas" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">Escolher outra área</Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Clientes vinculados" value={adminPreview || pending ? "—" : data?.linked_customers ?? 0} />
          <Card label="Faturamento atribuído" value={adminPreview || pending ? "—" : money(data?.attributed_revenue_cents ?? 0)} />
          <Card label="Comissão atual" value={adminPreview || pending ? "35% base" : bps(data?.current_rate_bps)} />
          <Card label="Saldo disponível" value={adminPreview || pending ? "—" : money(commission.available_balance_cents ?? 0)} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Link Partner</p>
            <div className="mt-3 rounded-2xl bg-slate-100 p-4 font-mono text-sm">{adminPreview ? "Disponível somente para Partner aprovado" : pending ? "Aguardando aprovação comercial" : data?.referral_path ?? "Código aguardando aprovação"}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Progressão</p>
            {adminPreview || pending ? <p className="mt-3 text-sm text-slate-500">O Partner começa em 35%. A recorrência acompanha a mesma faixa de comissão vigente do Partner.</p> : data?.next_tier ? <><p className="mt-3 text-xl font-black">{data.next_tier.name}</p><p className="mt-2 text-sm text-slate-500">Faltam {money(data.next_tier.remaining_revenue_cents ?? 0)} no período configurado. A mesma faixa vale para a primeira venda e para a recorrência.</p></> : <p className="mt-3 text-sm text-slate-500">Você começa em 35%. A recorrência acompanha a mesma faixa de comissão vigente. Nenhum tier superior está configurado ainda.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const bps = (value?: number) => `${((value ?? 0) / 100).toFixed(0)}%`;
function Card({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function State({ title, text }: { title: string; text: string }) { return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-3xl border bg-white p-8"><h1 className="text-2xl font-black">{title}</h1><p className="mt-3 text-sm text-slate-600">{text}</p><Link to="/contas" className="mt-5 inline-block font-bold text-violet-600">Voltar ao seletor</Link></div></main>; }
