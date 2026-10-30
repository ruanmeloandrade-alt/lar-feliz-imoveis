import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/partners/admin/regras")({ component: PartnersAdminRulesPage });

type Participant = { user_id: string; role: "affiliate" | "partner"; status: string; display_name?: string | null };
type Workspace = { id: string; name: string };

function PartnersAdminRulesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [saving, setSaving] = useState(false);
  const [override, setOverride] = useState({ userId: "", role: "affiliate", kind: "initial", ratePercent: "50", reason: "" });
  const [link, setLink] = useState({ partnerUserId: "", workspaceId: "", reason: "" });

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setAllowed(false); return; }
    const { data: isAdmin } = await (supabase as any).rpc("partner_program_is_admin", { _user_id: auth.user.id });
    if (isAdmin !== true) { setAllowed(false); return; }
    setAllowed(true);

    const [rolesResult, profilesResult, workspaceResult] = await Promise.all([
      (supabase as any).from("partner_program_roles").select("user_id,role,status").eq("status", "approved"),
      (supabase as any).from("partner_program_profiles").select("user_id,display_name"),
      (supabase as any).from("workspaces").select("id,name").order("name"),
    ]);
    const profileMap = new Map((profilesResult.data ?? []).map((p: any) => [p.user_id, p.display_name]));
    setParticipants((rolesResult.data ?? []).map((r: any) => ({ ...r, display_name: profileMap.get(r.user_id) ?? null })));
    setWorkspaces(workspaceResult.data ?? []);
  }

  useEffect(() => { void load(); }, []);

  const overrideParticipants = useMemo(() => participants.filter((p) => p.role === override.role), [participants, override.role]);
  const partnerParticipants = useMemo(() => participants.filter((p) => p.role === "partner"), [participants]);

  async function saveOverride(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(override.ratePercent);
    if (!override.userId || !Number.isFinite(rate) || rate <= 0 || rate > 100 || !override.reason.trim()) {
      toast.error("Preencha participante, percentual e motivo."); return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("partner_program_set_commission_override", {
      p_user_id: override.userId,
      p_role: override.role,
      p_kind: override.kind,
      p_rate_bps: Math.round(rate * 100),
      p_effective_from: new Date().toISOString(),
      p_reason: override.reason.trim(),
    });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Override aplicado com histórico preservado."); setOverride((v) => ({ ...v, reason: "" })); }
  }

  async function saveLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.partnerUserId || !link.workspaceId || !link.reason.trim()) { toast.error("Selecione Partner, cliente e informe o motivo."); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc("partner_program_link_customer", {
      p_workspace_id: link.workspaceId,
      p_partner_user_id: link.partnerUserId,
      p_effective_from: new Date().toISOString(),
      p_reason: link.reason.trim(),
    });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Cliente vinculado ao Partner. O acesso técnico será sincronizado automaticamente."); setLink((v) => ({ ...v, reason: "" })); }
  }

  if (allowed === null) return <State text="Carregando regras..." />;
  if (!allowed) return <State text="Acesso restrito ao super admin." />;

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-white p-6"><div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Central Partners</p><h1 className="mt-2 text-3xl font-black">Regras e vínculos</h1><p className="mt-2 text-sm text-slate-500">Override individual de comissão e vínculo formal Partner ↔ cliente.</p></div><Link to="/partners/admin" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">Voltar à Central</Link></header>

    <section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-black">Override de comissão</h2><p className="mt-1 text-xs text-slate-500">A alteração vale a partir de agora e preserva o histórico anterior.</p>
      <form onSubmit={saveOverride} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Select label="Papel" value={override.role} onChange={(v)=>setOverride({ ...override, role: v, userId: "", kind: v === "affiliate" ? "initial" : "recurring" })} options={[["affiliate","Affiliate"],["partner","Partner"]]} />
        <Select label="Tipo de comissão" value={override.kind} onChange={(v)=>setOverride({ ...override, kind: v })} options={[["initial","Primeira venda"],["recurring","Recorrência"]]} />
        <label className="text-sm font-semibold">Participante<select value={override.userId} onChange={(e)=>setOverride({ ...override, userId:e.target.value })} className="mt-2 w-full rounded-xl border bg-white px-3 py-3"><option value="">Selecione</option>{overrideParticipants.map((p)=><option key={p.user_id} value={p.user_id}>{p.display_name || p.user_id}</option>)}</select></label>
        <label className="text-sm font-semibold">Percentual<input type="number" min="0.01" max="100" step="0.01" value={override.ratePercent} onChange={(e)=>setOverride({ ...override, ratePercent:e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
        <label className="sm:col-span-2 text-sm font-semibold">Motivo<textarea rows={3} value={override.reason} onChange={(e)=>setOverride({ ...override, reason:e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" placeholder="Ex.: condição comercial individual aprovada." /></label>
        <button disabled={saving} className="sm:col-span-2 rounded-xl bg-slate-950 px-4 py-3 font-black text-white disabled:opacity-50">Aplicar override</button>
      </form>
    </section>

    <section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-black">Vincular cliente a Partner</h2><p className="mt-1 text-xs text-slate-500">O vínculo formal altera futuras recorrências conforme a regra do programa e concede acesso técnico automático ao workspace.</p>
      <form onSubmit={saveLink} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Partner<select value={link.partnerUserId} onChange={(e)=>setLink({ ...link, partnerUserId:e.target.value })} className="mt-2 w-full rounded-xl border bg-white px-3 py-3"><option value="">Selecione</option>{partnerParticipants.map((p)=><option key={p.user_id} value={p.user_id}>{p.display_name || p.user_id}</option>)}</select></label>
        <label className="text-sm font-semibold">Cliente / workspace<select value={link.workspaceId} onChange={(e)=>setLink({ ...link, workspaceId:e.target.value })} className="mt-2 w-full rounded-xl border bg-white px-3 py-3"><option value="">Selecione</option>{workspaces.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="sm:col-span-2 text-sm font-semibold">Motivo<textarea rows={3} value={link.reason} onChange={(e)=>setLink({ ...link, reason:e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" placeholder="Ex.: cliente transferido formalmente para operação do Partner." /></label>
        <button disabled={saving} className="sm:col-span-2 rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">Criar vínculo formal</button>
      </form>
    </section>
  </div></main>;
}

function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][]}){return <label className="text-sm font-semibold">{label}<select value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3">{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
function State({text}:{text:string}){return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 text-sm text-slate-600">{text}<div><Link to="/contas" className="mt-5 inline-block font-bold text-violet-600">Voltar</Link></div></div></main>}
