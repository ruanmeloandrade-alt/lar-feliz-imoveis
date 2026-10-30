import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/partners/financeiro")({ component: PartnersFinancePage });

type PaymentProfile = { id: string; document_type: string; document_last4: string; pix_key_type: string; pix_key_last4: string; holder_name: string; verification_status: string; verification_reason?: string | null; version: number };
type Payout = { id: string; amount_cents: number; currency: string; status: string; requested_at: string; status_reason?: string | null; paid_at?: string | null };

function PartnersFinancePage() {
  const [profile, setProfile] = useState<PaymentProfile | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [form, setForm] = useState({ documentType: "cpf", document: "", pixKeyType: "cpf", pixKey: "", holderName: "" });

  async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token ?? null; }
  async function load() {
    setLoading(true);
    const accessToken = await token();
    if (!accessToken) { setLoading(false); return; }
    const [profileResponse, payoutResult] = await Promise.all([
      fetch("/api/partners/payment-profile", { headers: { Authorization: `Bearer ${accessToken}` } }),
      (supabase as any).from("partner_program_payout_requests").select("id,amount_cents,currency,status,requested_at,status_reason,paid_at").order("requested_at", { ascending: false }),
    ]);
    const payload = await profileResponse.json().catch(() => ({}));
    if (profileResponse.ok) setProfile(payload.profile ?? null);
    if (!payoutResult.error) setPayouts(payoutResult.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const accessToken = await token();
    if (!accessToken) { setSaving(false); return; }
    const response = await fetch("/api/partners/payment-profile", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(form) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { toast.error(payload.error ?? "Não foi possível salvar."); return; }
    toast.success("Dados enviados para verificação."); setForm({ documentType: "cpf", document: "", pixKeyType: "cpf", pixKey: "", holderName: "" }); await load();
  }

  async function requestPayout() {
    setRequesting(true);
    const accessToken = await token();
    if (!accessToken) { setRequesting(false); toast.error("Sua sessão expirou. Entre novamente."); return; }
    const response = await fetch("/api/partners/request-payout", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json().catch(() => ({}));
    setRequesting(false);
    if (!response.ok) { toast.error(payload.error ?? "Não foi possível solicitar o pagamento."); return; }
    toast.success("Solicitação de pagamento criada."); await load();
  }

  const verified = profile?.verification_status === "verified";

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-white p-6"><div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Vanessa Simoni Partners</p><h1 className="mt-2 text-3xl font-black">Financeiro</h1><p className="mt-2 text-sm text-slate-500">O uso da plataforma é liberado antes desta etapa. Validação de documento e PIX só é obrigatória para receber valores.</p></div><Link to="/contas" className="rounded-xl border px-4 py-2 text-sm font-bold">Voltar</Link></header>

    {loading ? <div className="rounded-3xl border bg-white p-8 text-sm text-slate-500">Carregando financeiro...</div> : <>
      <section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-black">Dados de pagamento</h2>{profile ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Titular" value={profile.holder_name}/><Metric label="Documento" value={`${profile.document_type.toUpperCase()} •••• ${profile.document_last4}`}/><Metric label="PIX" value={`${profile.pix_key_type} •••• ${profile.pix_key_last4}`}/><Metric label="Verificação" value={profile.verification_status}/></div> : <p className="mt-2 text-sm text-slate-500">Cadastre CPF/CNPJ, titular e PIX quando quiser preparar o primeiro pagamento.</p>}
        <form onSubmit={saveProfile} className="mt-6 grid gap-4 sm:grid-cols-2"><Select label="Documento" value={form.documentType} onChange={(v) => setForm({ ...form, documentType: v })} options={[["cpf","CPF"],["cnpj","CNPJ"]]}/><Field label="Número do documento" value={form.document} onChange={(v) => setForm({ ...form, document: v })}/><Select label="Tipo de chave PIX" value={form.pixKeyType} onChange={(v) => setForm({ ...form, pixKeyType: v })} options={[["cpf","CPF"],["cnpj","CNPJ"],["email","E-mail"],["phone","Telefone"],["random","Aleatória"]]}/><Field label="Chave PIX" value={form.pixKey} onChange={(v) => setForm({ ...form, pixKey: v })}/><div className="sm:col-span-2"><Field label="Nome do titular" value={form.holderName} onChange={(v) => setForm({ ...form, holderName: v })}/></div><button disabled={saving} className="sm:col-span-2 rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">{saving ? "Salvando..." : profile ? "Atualizar dados e reenviar para verificação" : "Enviar para verificação"}</button></form>
      </section>

      <section className="rounded-3xl border bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Pagamentos</h2><p className="mt-1 text-xs text-slate-500">Para solicitar saque, sua sessão precisa estar autenticada e os dados de recebimento precisam estar verificados. Pagamentos seguem processamento manual nesta fase.</p></div><button disabled={requesting || !verified} onClick={() => void requestPayout()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{requesting ? "Solicitando..." : verified ? "Solicitar pagamento" : "Validação necessária para sacar"}</button></div>
        {!verified ? <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Você pode usar normalmente as áreas de Afiliado/Partner. O bloqueio aqui vale apenas para saque: primeiro envie CPF/CNPJ, titular e PIX e aguarde a verificação.</div> : null}
        <div className="mt-5 space-y-2">{payouts.length === 0 ? <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhuma solicitação ainda.</p> : payouts.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div><p className="font-black">{money(p.amount_cents)}</p><p className="mt-1 text-xs text-slate-500">Solicitado em {new Date(p.requested_at).toLocaleDateString("pt-BR")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{p.status}</span></div>)}</div>
      </section>
    </>}
  </div></main>;
}

const money = (cents: number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((cents ?? 0)/100);
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-sm font-black">{value}</p></div>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="text-sm font-semibold">{label}<input value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3"/></label>}
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][]}){return <label className="text-sm font-semibold">{label}<select value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3">{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
