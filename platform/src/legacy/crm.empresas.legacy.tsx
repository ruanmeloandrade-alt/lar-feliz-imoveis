import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Search, X, Star, Trash2, UserPlus, Upload, Check } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
 listCompanies, createCompany, updateCompany, uploadCompanyLogo,
 listCompanyLeads, setCompanyPrimaryLead,
 addCompanyMembers, updateCompanyMemberRole, removeCompanyMember, listUnassignedLeads,
} from "@/lib/companies.functions";

export const Route = createFileRoute("/crm/empresas")({
 head: () => ({
  meta: [
   { title: "Empresas · CRM Vanessa Simoni" },
   { name: "description", content: "Cadastre a ficha completa da empresa: CNPJ, logo, site, funcionários e responsável pelo atendimento." },
  ],
 }),
 component: EmpresasPage,
});

type Company = {
 id: string; name: string; site: string | null; notes: string | null;
 primary_lead_id: string | null; crm_source_id: string;
 cnpj: string | null; phone: string | null;
 logo_url: string | null; logo_signed_url: string | null;
 leadCount: number;
};
type Member = { id: string; name: string; email: string | null; phone: string | null; value: number; stage_id: string | null; role: string | null; provider: string };
type Unassigned = { id: string; name: string; email: string | null; phone: string | null; provider: string; sourceName: string };

const ROLE_PRESETS = ["Contato principal", "Diretor(a)", "Gerente", "Estagiário(a)", "Financeiro", "Compras", "Marketing", "TI"];

function formatCNPJ(v: string): string {
 const d = v.replace(/\D/g, "").slice(0, 14);
 if (d.length <= 2) return d;
 if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
 if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
 if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
 return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function EmpresasPage() {
 const listFn = useServerFn(listCompanies);
 const createFn = useServerFn(createCompany);
 const updateFn = useServerFn(updateCompany);
 const uploadFn = useServerFn(uploadCompanyLogo);
 const leadsFn = useServerFn(listCompanyLeads);
 const setPrimaryFn = useServerFn(setCompanyPrimaryLead);
 const addMembersFn = useServerFn(addCompanyMembers);
 const updateRoleFn = useServerFn(updateCompanyMemberRole);
 const removeMemberFn = useServerFn(removeCompanyMember);
 const unassignedFn = useServerFn(listUnassignedLeads);

 const [companies, setCompanies] = useState<Company[]>([]);
 const [query, setQuery] = useState("");
 const [openNew, setOpenNew] = useState(false);
 const [selected, setSelected] = useState<Company | null>(null);
 const [selectedLeads, setSelectedLeads] = useState<Member[]>([]);
 const [loading, setLoading] = useState(true);
 const [addOpen, setAddOpen] = useState(false);
 const [unassigned, setUnassigned] = useState<Unassigned[]>([]);

 async function refresh() {
  setLoading(true);
  try {
   const c = await listFn();
   setCompanies(c.companies);
  } catch (e) { console.error(e); } finally { setLoading(false); }
 }

 useEffect(() => { refresh(); }, []);

 async function openCompany(c: Company) {
  setSelected(c);
  const r = await leadsFn({ data: { companyId: c.id } });
  setSelectedLeads(r.leads);
 }

 async function reloadMembers(companyId: string) {
  const r = await leadsFn({ data: { companyId } });
  setSelectedLeads(r.leads);
 }

 async function handleSetPrimary(leadId: string) {
  if (!selected) return;
  await setPrimaryFn({ data: { companyId: selected.id, leadId } });
  setSelected({ ...selected, primary_lead_id: leadId });
 }

 async function handleRoleChange(leadId: string, role: string) {
  await updateRoleFn({ data: { leadId, role: role || null } });
  setSelectedLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, role: role || null } : l)));
 }

 async function handleRemove(leadId: string) {
  if (!selected) return;
  await removeMemberFn({ data: { leadId } });
  await reloadMembers(selected.id);
  refresh();
 }

 async function openAddMembers() {
  if (!selected) return;
  const r = await unassignedFn();
  setUnassigned(r.leads);
  setAddOpen(true);
 }

 async function handleAddMembers(picks: Array<{ leadId: string; role: string }>) {
  if (!selected || picks.length === 0) return;
  await addMembersFn({ data: { companyId: selected.id, members: picks.map((p) => ({ leadId: p.leadId, role: p.role || undefined })) } });
  setAddOpen(false);
  await reloadMembers(selected.id);
  refresh();
 }

 async function handleCompanyPatch(patch: { name?: string; site?: string | null; notes?: string | null; cnpj?: string | null; phone?: string | null; logoUrl?: string | null }) {
  if (!selected) return;
  await updateFn({ data: { companyId: selected.id, ...patch } });
  await refresh();
  // atualiza o selecionado com dados frescos (inclui signed url)
  const fresh = (await listFn()).companies.find((c) => c.id === selected.id) ?? null;
  if (fresh) setSelected(fresh);
 }

 const filtered = companies.filter((c) =>
  c.name.toLowerCase().includes(query.toLowerCase())
  || (c.cnpj ?? "").includes(query.replace(/\D/g, "")),
 );

 return (
  <div className="min-h-screen flex bg-background text-foreground" data-automation-page>
   <AppSidebar />
   <div className="flex-1 flex flex-col min-w-0">
    <div className="border-b border-border bg-card pl-14 pr-4 md:px-5 py-2.5 flex flex-wrap items-center gap-2">
     <Building2 className="w-4 h-4 text-primary shrink-0" />
     <h1 className="text-sm font-semibold">Empresas</h1>
     <span className="hidden md:inline text-xs text-muted-foreground">Ficha da empresa + funcionários. Só o responsável recebe as automações.</span>
     <div className="hidden md:block flex-1" />
     <div className="relative flex-1 min-w-0 md:flex-none order-3 md:order-none w-full md:w-auto">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou CNPJ" className="h-8 w-full md:w-64 pl-8 text-xs" />
     </div>
     <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0 ml-auto md:ml-0" onClick={() => setOpenNew(true)}>
      <Plus className="w-3.5 h-3.5" /> Nova empresa
     </Button>
    </div>

    <div className="flex-1 overflow-auto p-6">
     {loading ? (
      <p className="text-sm text-muted-foreground">Carregando…</p>
     ) : filtered.length === 0 ? (
      <div className="border border-dashed border-border rounded-lg p-12 text-center max-w-2xl mx-auto">
       <Building2 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
       <h2 className="text-base font-semibold mb-1">Nenhuma empresa criada ainda</h2>
       <p className="text-sm text-muted-foreground mb-4">
        Cadastre a ficha completa (CNPJ, site, telefone, logo, notas) e adicione os funcionários. A empresa e todos os funcionários passam a andar juntos no CRM.
       </p>
       <Button onClick={() => setOpenNew(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Criar minha primeira empresa</Button>
      </div>
     ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
       {filtered.map((c) => (
        <button key={c.id} onClick={() => openCompany(c)} className="text-left bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors">
         <div className="flex items-center gap-3 mb-1">
          {c.logo_signed_url ? (
           <img src={c.logo_signed_url} alt="" className="w-10 h-10 rounded object-cover border border-border" />
          ) : (
           <div className="w-10 h-10 rounded bg-muted grid place-items-center">
            <Building2 className="w-5 h-5 text-primary" />
           </div>
          )}
          <div className="min-w-0 flex-1">
           <div className="font-semibold text-sm truncate">{c.name}</div>
           {c.cnpj && <div className="text-[10px] text-muted-foreground truncate">CNPJ {formatCNPJ(c.cnpj)}</div>}
          </div>
         </div>
         {c.site && <p className="text-xs text-muted-foreground truncate">{c.site}</p>}
         <p className="text-xs text-muted-foreground mt-2">{c.leadCount} {c.leadCount === 1 ? "funcionário" : "funcionários"}</p>
        </button>
       ))}
      </div>
     )}
    </div>
   </div>

   <NewCompanyDialog
    open={openNew}
    onClose={() => setOpenNew(false)}
    onCreated={() => { setOpenNew(false); refresh(); }}
    createFn={createFn}
    uploadFn={uploadFn}
    unassignedFn={unassignedFn}
   />

   <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
     {selected && (
      <>
       <DialogHeader><DialogTitle className="text-base">Ficha da empresa</DialogTitle></DialogHeader>
       <CompanyProfileEditor
        company={selected}
        onPatch={handleCompanyPatch}
        uploadFn={uploadFn}
       />
       <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
         <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Funcionários ({selectedLeads.length})
         </h3>
         <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={openAddMembers}>
          <UserPlus className="w-3 h-3" /> Adicionar funcionário
         </Button>
        </div>
        {selectedLeads.length === 0 ? (
         <p className="text-xs text-muted-foreground">
          Nenhum funcionário vinculado. Adicione as pessoas da empresa e escolha qual delas é o responsável.
         </p>
        ) : (
         <ul className="space-y-1.5">
          {selectedLeads.map((l) => {
           const isPrimary = selected.primary_lead_id === l.id;
           return (
            <li key={l.id} className="flex items-center gap-2 p-2 border border-border rounded">
             <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{l.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{l.email || l.phone || " - "}</div>
             </div>
             <RoleInput value={l.role ?? ""} onChange={(v) => handleRoleChange(l.id, v)} />
             <Button
              size="sm"
              variant={isPrimary ? "default" : "outline"}
              className="h-7 text-[11px] gap-1"
              onClick={() => handleSetPrimary(l.id)}
              title="Responsável recebe as mensagens das automações"
             >
              <Star className="w-3 h-3" /> {isPrimary ? "Responsável" : "Marcar responsável"}
             </Button>
             <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleRemove(l.id)} title="Remover da empresa">
              <Trash2 className="w-3.5 h-3.5" />
             </Button>
            </li>
           );
          })}
         </ul>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">
         A empresa e todos os funcionários andam juntos no funil. Apenas o funcionário marcado como <b>responsável</b> recebe as mensagens das automações.
        </p>
       </div>
      </>
     )}
    </DialogContent>
   </Dialog>

   <AddMembersDialog open={addOpen} onClose={() => setAddOpen(false)} leads={unassigned} onConfirm={handleAddMembers} />
  </div>
 );
}

function RoleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const [v, setV] = useState(value);
 useEffect(() => { setV(value); }, [value]);
 return (
  <Input
   list="role-presets"
   value={v}
   onChange={(e) => setV(e.target.value)}
   onBlur={() => { if (v !== value) onChange(v); }}
   onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
   placeholder="Função"
   className="h-7 w-40 text-[11px]"
  />
 );
}

/* ---------- Editor da ficha (inline) ---------- */

function CompanyProfileEditor({
 company,
 onPatch,
 uploadFn,
}: {
 company: Company;
 onPatch: (patch: { name?: string; site?: string | null; notes?: string | null; cnpj?: string | null; phone?: string | null; logoUrl?: string | null }) => Promise<void>;
 uploadFn: ReturnType<typeof useServerFn<typeof uploadCompanyLogo>>;
}) {
 const [name, setName] = useState(company.name);
 const [site, setSite] = useState(company.site ?? "");
 const [phone, setPhone] = useState(company.phone ?? "");
 const [cnpj, setCnpj] = useState(company.cnpj ? formatCNPJ(company.cnpj) : "");
 const [notes, setNotes] = useState(company.notes ?? "");
 const [busy, setBusy] = useState<string | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
  setName(company.name);
  setSite(company.site ?? "");
  setPhone(company.phone ?? "");
  setCnpj(company.cnpj ? formatCNPJ(company.cnpj) : "");
  setNotes(company.notes ?? "");
 }, [company.id]);

 async function commit(field: string, patch: Parameters<typeof onPatch>[0]) {
  setBusy(field);
  try { await onPatch(patch); } finally { setBusy(null); }
 }

 async function pickLogo(file: File) {
  const reader = new FileReader();
  reader.onload = async () => {
   const b64 = String(reader.result || "").split(",")[1] || "";
   setBusy("logo");
   try {
    const r = await uploadFn({ data: { companyId: company.id, filename: file.name, contentType: file.type || "image/png", base64: b64 } });
    await onPatch({ logoUrl: r.path });
   } finally { setBusy(null); }
  };
  reader.readAsDataURL(file);
 }

 return (
  <div className="grid grid-cols-[auto_1fr] gap-4 items-start">
   <div className="flex flex-col items-center gap-2">
    {company.logo_signed_url ? (
     <img src={company.logo_signed_url} alt="Logo" className="w-24 h-24 rounded object-cover border border-border" />
    ) : (
     <div className="w-24 h-24 rounded bg-muted grid place-items-center">
      <Building2 className="w-8 h-8 text-primary" />
     </div>
    )}
    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
     const f = e.target.files?.[0]; if (f) pickLogo(f); e.target.value = "";
    }} />
    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => fileRef.current?.click()} disabled={busy === "logo"}>
     <Upload className="w-3 h-3" /> {busy === "logo" ? "Enviando…" : company.logo_url ? "Trocar logo" : "Enviar logo"}
    </Button>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <FieldInline label="Nome da empresa" value={name} onValue={setName} onCommit={() => name !== company.name && commit("name", { name })} busy={busy === "name"} span={2} />
    <FieldInline
     label="CNPJ"
     value={cnpj}
     onValue={(v) => setCnpj(formatCNPJ(v))}
     onCommit={() => {
      const digits = cnpj.replace(/\D/g, "");
      if (digits !== (company.cnpj ?? "")) commit("cnpj", { cnpj: digits || null });
     }}
     busy={busy === "cnpj"}
     placeholder="00.000.000/0000-00"
    />
    <FieldInline label="Telefone" value={phone} onValue={setPhone} onCommit={() => phone !== (company.phone ?? "") && commit("phone", { phone: phone || null })} busy={busy === "phone"} placeholder="(11) 99999-9999" />
    <FieldInline label="Site" value={site} onValue={setSite} onCommit={() => site !== (company.site ?? "") && commit("site", { site: site || null })} busy={busy === "site"} placeholder="https://…" span={2} />
    <div className="col-span-2">
     <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notas</label>
     <Textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={() => notes !== (company.notes ?? "") && commit("notes", { notes: notes || null })}
      rows={3}
      className="text-xs"
      placeholder="Observações internas sobre a empresa"
     />
    </div>
   </div>
  </div>
 );
}

function FieldInline({
 label, value, onValue, onCommit, busy, placeholder, span,
}: {
 label: string; value: string; onValue: (v: string) => void; onCommit: () => void;
 busy?: boolean; placeholder?: string; span?: 1 | 2;
}) {
 return (
  <div className={span === 2 ? "col-span-2" : ""}>
   <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
    {label} {busy && <span className="text-primary">salvando…</span>}
   </label>
   <Input
    value={value}
    onChange={(e) => onValue(e.target.value)}
    onBlur={onCommit}
    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    placeholder={placeholder}
    className="h-8 text-xs mt-1"
   />
  </div>
 );
}

/* ---------- Nova empresa ---------- */

function NewCompanyDialog({
 open, onClose, onCreated, createFn, uploadFn, unassignedFn,
}: {
 open: boolean; onClose: () => void;
 onCreated: () => void;
 createFn: ReturnType<typeof useServerFn<typeof createCompany>>;
 uploadFn: ReturnType<typeof useServerFn<typeof uploadCompanyLogo>>;
 unassignedFn: ReturnType<typeof useServerFn<typeof listUnassignedLeads>>;
}) {
 const [name, setName] = useState("");
 const [cnpj, setCnpj] = useState("");
 const [phone, setPhone] = useState("");
 const [site, setSite] = useState("");
 const [notes, setNotes] = useState("");
 const [logoPath, setLogoPath] = useState<string | null>(null);
 const [logoPreview, setLogoPreview] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [uploading, setUploading] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [step, setStep] = useState<1 | 2>(1);
 const [available, setAvailable] = useState<Unassigned[]>([]);
 const [picks, setPicks] = useState<Record<string, { picked: boolean; role: string }>>({});
 const [primary, setPrimary] = useState<string | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
  if (open) {
   setName(""); setSite(""); setPhone(""); setCnpj(""); setNotes("");
   setLogoPath(null); setLogoPreview(null);
   setErr(null); setStep(1); setPicks({}); setPrimary(null);
  }
 }, [open]);

 async function goToStep2() {
  if (!name.trim()) return;
  const r = await unassignedFn();
  setAvailable(r.leads);
  setStep(2);
 }

 async function pickLogo(file: File) {
  const reader = new FileReader();
  reader.onload = async () => {
   const b64 = String(reader.result || "").split(",")[1] || "";
   setUploading(true);
   try {
    const r = await uploadFn({ data: { filename: file.name, contentType: file.type || "image/png", base64: b64 } });
    setLogoPath(r.path);
    setLogoPreview(r.url);
   } catch (e) {
    setErr(e instanceof Error ? e.message : "Falha ao enviar logo");
   } finally { setUploading(false); }
  };
  reader.readAsDataURL(file);
 }

 async function submit() {
  if (!name.trim()) return;
  setBusy(true); setErr(null);
  try {
   const members = Object.entries(picks)
    .filter(([, v]) => v.picked)
    .map(([leadId, v]) => ({ leadId, role: v.role || undefined }));
   await createFn({ data: {
    name: name.trim(),
    site: site || undefined,
    notes: notes || undefined,
    cnpj: cnpj ? cnpj.replace(/\D/g, "") : undefined,
    phone: phone || undefined,
    logoUrl: logoPath || undefined,
    members,
    primaryLeadId: primary,
   } });
   onCreated();
  } catch (e) {
   setErr(e instanceof Error ? e.message : "Falha ao criar.");
  } finally { setBusy(false); }
 }

 return (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
   <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
    <DialogHeader><DialogTitle className="text-base">{step === 1 ? "Nova empresa" : `Funcionários de "${name}"`}</DialogTitle></DialogHeader>
    {step === 1 ? (
     <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-4 items-start">
       <div className="flex flex-col items-center gap-2">
        {logoPreview ? (
         <img src={logoPreview} alt="" className="w-24 h-24 rounded object-cover border border-border" />
        ) : (
         <div className="w-24 h-24 rounded bg-muted grid place-items-center">
          <Building2 className="w-8 h-8 text-primary" />
         </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
         const f = e.target.files?.[0]; if (f) pickLogo(f); e.target.value = "";
        }} />
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
         <Upload className="w-3 h-3" /> {uploading ? "Enviando…" : "Logo"}
        </Button>
       </div>
       <div className="space-y-2">
        <div>
         <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome da empresa *</label>
         <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs mt-1" placeholder="Ex.: Vanessa Simoni Tecnologia LTDA" />
        </div>
        <div className="grid grid-cols-2 gap-2">
         <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">CNPJ</label>
          <Input value={cnpj} onChange={(e) => setCnpj(formatCNPJ(e.target.value))} className="h-8 text-xs mt-1" placeholder="00.000.000/0000-00" />
         </div>
         <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Telefone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-xs mt-1" placeholder="(11) 99999-9999" />
         </div>
        </div>
        <div>
         <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Site</label>
         <Input value={site} onChange={(e) => setSite(e.target.value)} className="h-8 text-xs mt-1" placeholder="https://…" />
        </div>
       </div>
      </div>
      <div>
       <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notas</label>
       <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="text-xs mt-1" placeholder="Observações internas sobre a empresa" />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2 justify-end">
       <Button variant="outline" onClick={onClose}><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
       <Button onClick={goToStep2} disabled={!name.trim()}>Próximo</Button>
      </div>
     </div>
    ) : (
     <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
       Selecione os funcionários da empresa e defina a função de cada um. Marque uma pessoa como <b>responsável</b>: só ela vai receber as mensagens das automações, os demais funcionários apenas andam junto no funil.
      </p>
      <div className="max-h-72 overflow-auto border border-border rounded">
       {available.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">Nenhum lead disponível sem empresa.</p>
       ) : (
        <ul className="divide-y divide-border">
         {available.map((l) => {
          const st = picks[l.id] ?? { picked: false, role: "" };
          const isPrimary = primary === l.id;
          return (
           <li key={l.id} className="flex items-center gap-2 p-2 text-xs">
            <input type="checkbox" checked={st.picked} onChange={(e) => {
             setPicks((p) => ({ ...p, [l.id]: { ...st, picked: e.target.checked } }));
             if (!e.target.checked && primary === l.id) setPrimary(null);
            }} />
            <div className="flex-1 min-w-0">
             <div className="truncate font-medium">{l.name}</div>
             <div className="text-[10px] text-muted-foreground truncate">{l.email || l.phone || " - "}</div>
            </div>
            <Input list="role-presets" placeholder="Função" disabled={!st.picked} value={st.role} onChange={(e) => setPicks((p) => ({ ...p, [l.id]: { ...st, role: e.target.value } }))} className="h-7 w-36 text-[11px]" />
            <Button
             size="sm"
             variant={isPrimary ? "default" : "outline"}
             className="h-7 text-[10px] gap-1"
             disabled={!st.picked}
             onClick={() => setPrimary(isPrimary ? null : l.id)}
             title="Responsável recebe as mensagens das automações"
            >
             {isPrimary ? <><Check className="w-3 h-3" /> Responsável</> : <><Star className="w-3 h-3" /> Responsável</>}
            </Button>
           </li>
          );
         })}
        </ul>
       )}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2 justify-between">
       <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
       <Button onClick={submit} disabled={busy}>{busy ? "Criando…" : "Criar empresa"}</Button>
      </div>
     </div>
    )}
    <datalist id="role-presets">
     {ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
    </datalist>
   </DialogContent>
  </Dialog>
 );
}

/* ---------- Adicionar funcionários existentes ---------- */

function AddMembersDialog({
 open, onClose, leads, onConfirm,
}: {
 open: boolean; onClose: () => void; leads: Unassigned[];
 onConfirm: (picks: Array<{ leadId: string; role: string }>) => void;
}) {
 const [picks, setPicks] = useState<Record<string, { picked: boolean; role: string }>>({});
 const [q, setQ] = useState("");
 useEffect(() => { if (open) { setPicks({}); setQ(""); } }, [open]);
 const filtered = useMemo(
  () => leads.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()) || (l.email || "").toLowerCase().includes(q.toLowerCase())),
  [leads, q],
 );
 const selectedPicks = Object.entries(picks).filter(([, v]) => v.picked).map(([leadId, v]) => ({ leadId, role: v.role }));
 return (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
   <DialogContent className="max-w-lg">
    <DialogHeader><DialogTitle>Adicionar funcionários</DialogTitle></DialogHeader>
    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lead…" className="h-8 text-xs" />
    <div className="max-h-80 overflow-auto border border-border rounded">
     {filtered.length === 0 ? (
      <p className="text-xs text-muted-foreground p-4 text-center">Nenhum lead disponível sem empresa.</p>
     ) : (
      <ul className="divide-y divide-border">
       {filtered.map((l) => {
        const st = picks[l.id] ?? { picked: false, role: "" };
        return (
         <li key={l.id} className="flex items-center gap-2 p-2 text-xs">
          <input type="checkbox" checked={st.picked} onChange={(e) => setPicks((p) => ({ ...p, [l.id]: { ...st, picked: e.target.checked } }))} />
          <div className="flex-1 min-w-0">
           <div className="truncate font-medium">{l.name}</div>
           <div className="text-[10px] text-muted-foreground truncate">{l.email || l.phone || " - "}</div>
          </div>
          <Input list="role-presets" placeholder="Função" disabled={!st.picked} value={st.role} onChange={(e) => setPicks((p) => ({ ...p, [l.id]: { ...st, role: e.target.value } }))} className="h-7 w-36 text-[11px]" />
         </li>
        );
       })}
      </ul>
     )}
    </div>
    <div className="flex gap-2 justify-end">
     <Button variant="outline" onClick={onClose}>Cancelar</Button>
     <Button onClick={() => onConfirm(selectedPicks)} disabled={selectedPicks.length === 0}>Adicionar {selectedPicks.length || ""}</Button>
    </div>
    <datalist id="role-presets">
     {ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
    </datalist>
   </DialogContent>
  </Dialog>
 );
}
