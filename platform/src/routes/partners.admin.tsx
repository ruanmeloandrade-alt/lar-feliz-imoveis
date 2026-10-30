import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/partners/admin")({ component: PartnersAdminPage });

type RoleRow = { user_id: string; role: "affiliate" | "partner"; status: string; requested_at?: string | null; display_name?: string | null; whatsapp?: string | null; instagram_handle?: string | null; experience_level?: string | null; person_type?: string | null };
type PaymentProfile = { id: string; user_id: string; document_type: string; document_last4: string; pix_key_type: string; pix_key_last4: string; holder_name: string; verification_status: string; verification_reason?: string | null; version: number; updated_at?: string | null };
type Payout = { id: string; beneficiary_user_id: string; amount_cents: number; status: string; requested_at: string };
type Dashboard = { role_counts?: Record<string, number>; finance?: Record<string, number>; unresolved_attributions?: number; active_partner_customer_links?: number; recent_audit?: any[] };

function PartnersAdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<PaymentProfile[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setAllowed(false); return; }
    const { data: isAdmin } = await (supabase as any).rpc("partner_program_is_admin", { _user_id: auth.user.id });
    if (isAdmin !== true) { setAllowed(false); return; }
    setAllowed(true);

    const token = await accessToken();
    const paymentPromise = token
      ? fetch("/api/partners/admin/payment-profiles", { headers: { Authorization: `Bearer ${token}` } })
      : Promise.resolve(null);
    const [dashboardResult, rolesResult, profilesResult, payoutsResult, paymentResponse] = await Promise.all([
      (supabase as any).rpc("partner_program_admin_dashboard"),
      (supabase as any).from("partner_program_roles").select("user_id,role,status,requested_at").order("requested_at", { ascending: false }),
      (supabase as any).from("partner_program_profiles").select("user_id,display_name,whatsapp,instagram_handle,experience_level,person_type"),
      (supabase as any).from("partner_program_payout_requests").select("id,beneficiary_user_id,amount_cents,status,requested_at").order("requested_at", { ascending: false }).limit(100),
      paymentPromise,
    ]);

    if (dashboardResult.error) toast.error(dashboardResult.error.message); else setDashboard(dashboardResult.data ?? null);
    const profileMap = new Map((profilesResult.data ?? []).map((p: any) => [p.user_id, p]));
    setRoles((rolesResult.data ?? []).map((r: any) => ({ ...r, ...(profileMap.get(r.user_id) ?? {}) })));
    if (payoutsResult.error) toast.error(payoutsResult.error.message); else setPayouts(payoutsResult.data ?? []);

    if (paymentResponse) {
      const paymentPayload = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok) toast.error(paymentPayload.error ?? "Não foi possível carregar verificações de pagamento.");
      else setPaymentProfiles(paymentPayload.profiles ?? []);
    }
  }

  useEffect(() => { void load(); }, []);
  const visibleRoles = useMemo(() => roles.filter((r) => filter === "all" || r.status === filter), [roles, filter]);
  const pendingPayments = useMemo(() => paymentProfiles.filter((p) => p.verification_status === "pending"), [paymentProfiles]);
  const roleByUser = useMemo(() => new Map(roles.map((r) => [r.user_id, r])), [roles]);
  const paymentByUser = useMemo(() => new Map(paymentProfiles.map((p) => [p.user_id, p])), [paymentProfiles]);

  async function setRoleStatus(row: RoleRow, status: "approved" | "rejected" | "blocked") {
    const reason = status === "approved" ? "Aprovado pela Central Partners." : window.prompt("Motivo da alteração:")?.trim();
    if (status !== "approved" && !reason) return;
    setBusy(`${row.user_id}:${row.role}`);
    const { error } = await (supabase as any).rpc("partner_program_set_role_status", { _user_id: row.user_id, _role: row.role, _status: status, _reason: reason ?? null });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success(`Cadastro ${status === "approved" ? "aprovado" : "atualizado"}.`); await load(); }
  }

  async function verifyPayment(profile: PaymentProfile, status: "verified" | "rejected") {
    const reason = status === "rejected"
      ? window.prompt("Motivo da rejeição dos dados de pagamento:")?.trim()
      : "Dados de pagamento conferidos manualmente pela Central Partners.";
    if (status === "rejected" && !reason) return;
    const token = await accessToken();
    if (!token) { toast.error("Sessão expirada."); return; }

    setBusy(`payment:${profile.user_id}`);
    const response = await fetch("/api/partners/admin/payment-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: profile.user_id, status, reason }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) toast.error(payload.error ?? "Não foi possível atualizar a verificação.");
    else { toast.success(status === "verified" ? "Dados de pagamento verificados." : "Dados de pagamento rejeitados."); await load(); }
  }

  async function setPayoutStatus(payout: Payout, status: "under_review" | "approved" | "rejected" | "paid") {
    let reason: string | null = null;
    let paymentReference: string | null = null;
    if (status === "rejected") { reason = window.prompt("Motivo da rejeição:")?.trim() ?? null; if (!reason) return; }
    if (status === "paid") { paymentReference = window.prompt("Referência/comprovante do pagamento:")?.trim() ?? null; if (!paymentReference) return; }
    setBusy(`payout:${payout.id}`);
    const { error } = await (supabase as any).rpc("partner_program_set_payout_status", { p_payout_id: payout.id, p_status: status, p_reason: reason, p_payment_reference: paymentReference, p_proof_reference: paymentReference });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success("Pagamento atualizado."); await load(); }
  }

  if (allowed === null) return <State text="Carregando Central Partners..." />;
  if (!allowed) return <State text="Acesso restrito ao super admin." />;
  const finance = dashboard?.finance ?? {};

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-white p-6"><div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Administração</p><h1 className="mt-2 text-3xl font-black">Central Partners</h1><p className="mt-2 text-sm text-slate-500">Affiliate, Partners, aprovações, financeiro e auditoria em dados reais.</p></div><div className="flex flex-wrap gap-2"><Link to="/partners/admin/regras" className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700">Regras e vínculos</Link><Link to="/partners/comunidade" className="rounded-xl border px-4 py-2 text-sm font-bold">Comunidade</Link><Link to="/contas" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">Voltar</Link></div></header>

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Affiliate aprovados" value={dashboard?.role_counts?.["affiliate:approved"] ?? 0}/><Metric label="Partners aprovados" value={dashboard?.role_counts?.["partner:approved"] ?? 0}/><Metric label="Saldo elegível" value={money(finance.eligible_cents ?? 0)}/><Metric label="Vínculos ativos" value={dashboard?.active_partner_customer_links ?? 0}/></section>

    <section className="rounded-3xl border bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Participantes</h2><p className="mt-1 text-xs text-slate-500">Aprove, rejeite ou bloqueie Affiliate e Partner.</p></div><select value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm"><option value="pending">Pendentes</option><option value="approved">Aprovados</option><option value="rejected">Rejeitados</option><option value="blocked">Bloqueados</option><option value="all">Todos</option></select></div><div className="mt-5 space-y-2">{visibleRoles.length === 0 ? <Empty text="Nenhum participante neste filtro."/> : visibleRoles.map((row)=><div key={`${row.user_id}:${row.role}`} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4"><div><p className="font-black">{row.display_name || row.user_id}</p><p className="mt-1 text-xs text-slate-500">{row.role === "affiliate" ? "Affiliate" : "Partner"} · {row.status}{row.instagram_handle ? ` · @${row.instagram_handle.replace(/^@/,"")}` : ""}{row.person_type ? ` · ${row.person_type.toUpperCase()}` : ""}</p></div><div className="flex flex-wrap gap-2">{row.status !== "approved" ? <button disabled={busy===`${row.user_id}:${row.role}`} onClick={()=>void setRoleStatus(row,"approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Aprovar</button> : null}<button disabled={busy===`${row.user_id}:${row.role}`} onClick={()=>void setRoleStatus(row,"rejected")} className="rounded-xl border px-3 py-2 text-xs font-bold">Rejeitar</button><button disabled={busy===`${row.user_id}:${row.role}`} onClick={()=>void setRoleStatus(row,"blocked")} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Bloquear</button></div></div>)}</div></section>

    <section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-black">Verificação de CPF/CNPJ e PIX</h2><p className="mt-1 text-xs text-slate-500">Somente dados mascarados são exibidos aqui. A aprovação manual libera o primeiro pedido de pagamento e fica registrada na auditoria.</p><div className="mt-5 space-y-2">{pendingPayments.length===0 ? <Empty text="Nenhum dado de pagamento aguardando verificação."/> : pendingPayments.map((p)=>{const person=roleByUser.get(p.user_id); return <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4"><div><p className="font-black">{person?.display_name || p.holder_name}</p><p className="mt-1 text-xs text-slate-500">Titular: {p.holder_name} · {p.document_type.toUpperCase()} •••• {p.document_last4} · PIX {p.pix_key_type} •••• {p.pix_key_last4} · versão {p.version}</p></div><div className="flex gap-2"><button disabled={busy===`payment:${p.user_id}`} onClick={()=>void verifyPayment(p,"verified")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Verificar</button><button disabled={busy===`payment:${p.user_id}`} onClick={()=>void verifyPayment(p,"rejected")} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Rejeitar</button></div></div>})}</div></section>

    <section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-black">Pagamentos manuais</h2><p className="mt-1 text-xs text-slate-500">Fluxo real: solicitado → em revisão → aprovado → pago ou rejeitado.</p><div className="mt-5 space-y-2">{payouts.length===0 ? <Empty text="Nenhuma solicitação de pagamento."/> : payouts.map((p)=>{const person=roleByUser.get(p.beneficiary_user_id); const payment=paymentByUser.get(p.beneficiary_user_id); const payoutBusy=busy===`payout:${p.id}`; return <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4"><div><p className="font-black">{money(p.amount_cents)}</p><p className="mt-1 text-xs text-slate-500">{person?.display_name || payment?.holder_name || p.beneficiary_user_id} · PIX {payment?.verification_status ?? "sem verificação"} · {p.status}</p></div><div className="flex flex-wrap gap-2">{p.status==="requested" ? <button disabled={payoutBusy} onClick={()=>void setPayoutStatus(p,"under_review")} className="rounded-xl border px-3 py-2 text-xs font-bold">Iniciar revisão</button> : null}{["requested","under_review"].includes(p.status) ? <><button disabled={payoutBusy} onClick={()=>void setPayoutStatus(p,"approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Aprovar</button><button disabled={payoutBusy} onClick={()=>void setPayoutStatus(p,"rejected")} className="rounded-xl border px-3 py-2 text-xs font-bold">Rejeitar</button></> : null}{p.status==="approved" ? <button disabled={payoutBusy} onClick={()=>void setPayoutStatus(p,"paid")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">Marcar pago</button> : null}</div></div>})}</div></section>

    <section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-black">Auditoria recente</h2><div className="mt-4 space-y-2">{(dashboard?.recent_audit ?? []).slice(0,20).map((a:any)=><div key={a.id} className="rounded-xl bg-slate-50 p-3 text-xs"><span className="font-bold">{a.action}</span><span className="text-slate-500"> · {a.entity_type} · {new Date(a.created_at).toLocaleString("pt-BR")}</span>{a.reason ? <p className="mt-1 text-slate-500">{a.reason}</p> : null}</div>)}</div></section>
  </div></main>;
}

const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((cents??0)/100);
function Metric({label,value}:{label:string;value:string|number}){return <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">{text}</div>}
function State({text}:{text:string}){return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 text-sm text-slate-600">{text}<div><Link to="/contas" className="mt-5 inline-block font-bold text-violet-600">Voltar</Link></div></div></main>}
