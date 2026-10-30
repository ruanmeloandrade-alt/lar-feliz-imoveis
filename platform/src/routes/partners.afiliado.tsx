import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/partners/afiliado")({
  validateSearch: z.object({ preview: z.enum(["admin"]).optional() }),
  component: AffiliateDashboard,
});

type AccessState = "loading" | "pending" | "approved" | "admin_preview" | "denied";

function AffiliateDashboard() {
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
        (supabase as any).from("partner_program_roles").select("status").eq("user_id", userId).eq("role", "affiliate").maybeSingle(),
        (supabase as any).rpc("partner_program_is_admin", { _user_id: userId }),
      ]);
      if (!active) return;

      if (preview === "admin" && isAdmin === true) return setAccess("admin_preview");
      if (role?.status === "pending") return setAccess("pending");
      if (role?.status === "approved") {
        setAccess("approved");
        const { data: dashboard, error: dashboardError } = await (supabase as any).rpc("partner_program_my_affiliate_dashboard");
        if (!active) return;
        if (dashboardError) setError(dashboardError.message); else setData(dashboard);
        return;
      }
      if (isAdmin === true) return setAccess("admin_preview");
      setAccess("denied");
    })();
    return () => { active = false; };
  }, [preview]);

  if (access === "loading") return <State title="Área de Afiliado" text="Carregando seu acesso..." />;
  if (access === "denied") return <State title="Área de Afiliado" text="Esta conta não possui acesso de Afiliado ativo." />;
  if (access === "admin_preview") return <AffiliateLayout data={null} adminPreview />;
  if (access === "pending") return <AffiliateLayout data={null} pending />;
  if (error) return <State title="Área de Afiliado" text={error} />;
  if (!data) return <State title="Área de Afiliado" text="Carregando dados reais..." />;
  return <AffiliateLayout data={data} />;
}

function AffiliateLayout({ data, adminPreview = false, pending = false }: { data: any; adminPreview?: boolean; pending?: boolean }) {
  const commission = data?.commission ?? {};
  const referralPath = typeof data?.referral_path === "string" ? data.referral_path : "";
  const referralUrl = useMemo(() => {
    if (!referralPath) return "";
    if (typeof window === "undefined") return referralPath;
    try { return new URL(referralPath, window.location.origin).toString(); } catch { return referralPath; }
  }, [referralPath]);
  const value = (input: unknown) => adminPreview || pending ? "—" : (input as any ?? 0);

  async function copyReferralLink() {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success("Link de indicação copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-violet-600">Vanessa Simoni Partners</p>
            <h1 className="mt-2 text-3xl font-black">Área de Afiliado</h1>
            {adminPreview ? <p className="mt-2 text-sm text-amber-700">Pré-visualização administrativa. Dados financeiros não são simulados.</p> : null}
            {pending ? <p className="mt-2 text-sm text-amber-700">Cadastro em análise. Você já pode usar a área; o link e os benefícios comerciais serão liberados após aprovação.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!adminPreview ? <Link to="/partners/financeiro" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Financeiro</Link> : null}
            <Link to="/partners/faculdade" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Faculdade Partners</Link>
            <Link to="/partners/comunidade" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Comunidade Partners</Link>
            <Link to="/contas" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Escolher outra área</Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Visitas" value={value(data?.visits)} />
          <Card label="Cadastros" value={value(data?.signups)} />
          <Card label="Clientes" value={value(data?.customers)} />
          <Card label="Saldo disponível" value={adminPreview || pending ? "—" : money(commission.available_balance_cents ?? 0)} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Seu link de indicação</p>
          {adminPreview ? (
            <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">A pré-visualização administrativa não fabrica um link. Para homologar um link real, acesse esta área com um cadastro de Afiliado aprovado.</div>
          ) : pending ? (
            <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Seu acesso já está liberado. O link de indicação e as comissões serão ativados quando o administrador aprovar sua filiação.</div>
          ) : referralUrl ? (
            <>
              <div className="mt-3 break-all rounded-2xl bg-slate-100 p-4 font-mono text-sm">{referralUrl}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyReferralLink()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white"><Copy className="h-4 w-4" /> Copiar link</button>
                <a href={referralUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"><ExternalLink className="h-4 w-4" /> Testar link</a>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">Seu cadastro está aprovado, mas o código de indicação ainda não foi retornado. Atualize a página; se persistir, a Central Partners deve revisar o cadastro.</div>
          )}
          <p className="mt-4 text-sm text-slate-500">Comissão base: 50% na primeira venda elegível + 15% nas renovações.</p>
        </section>
      </div>
    </main>
  );
}

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
function Card({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function State({ title, text }: { title: string; text: string }) { return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-3xl border bg-white p-8"><h1 className="text-2xl font-black">{title}</h1><p className="mt-3 text-sm text-slate-600">{text}</p><Link to="/contas" className="mt-5 inline-block font-bold text-violet-600">Voltar ao seletor</Link></div></main>; }
