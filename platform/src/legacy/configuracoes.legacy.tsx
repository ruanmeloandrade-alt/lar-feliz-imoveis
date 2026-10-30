import { createFileRoute, Link } from "@tanstack/react-router";
import { assertSecuritySaveAllowed, parseSlimSecuritySnapshot } from "@/lib/slim-settings-validation.core";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { readIdlePref, writeIdlePref } from "@/components/IdleLogoutGuard";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon, Building2, User, CreditCard, Shield, Bell,
  SlidersHorizontal, Users, KeyRound, Monitor, UserPlus, Check,
  Trash2, Send, AlertCircle, Copy, RefreshCw, Sparkles, Clock, ArrowLeftRight,
  Search, Crown, Wrench, Mail, MailPlus, Globe, Sun, CalendarDays, Zap, Smartphone, Tablet,
  MessageSquare, Moon, BellRing, ListChecks, Megaphone, BarChart3, Bot, ShoppingCart, Instagram,
  ChevronDown, Volume2, Filter, QrCode, Fingerprint, ShieldCheck, Lock, History, Eye, EyeOff,
  ShieldAlert, LogOut, Download, Key,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { ThemeChooser } from "@/components/integrations/ThemeChooser";
import { cn } from "@/lib/utils";
import {
  TIMEZONE_GROUPS, LANGUAGE_OPTIONS, CURRENCY_GROUPS, getTimeZoneOffsetLabel,
  readPreferences, writePreferences,
} from "@/lib/preferences";
import {
  getWorkspaceDefaultCurrency, setWorkspaceRegionalSettings,
} from "@/lib/workspace-currency.functions";
import { syncWorkspaceCurrencyCache } from "@/lib/workspace-currency-cache";
import { supabase } from "@/integrations/supabase/client";
import {
  getSettingsBundle, updateProfile, updateWorkspace, updateNotificationPrefs, uploadWorkspaceLogo,
  removeMember, updateMemberRole, createEmployee,
  updateBusinessHours,
} from "@/lib/settings.functions";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { UserPermissionsDialog } from "@/components/settings/UserPermissionsDialog";
import { SlimInvitationsPanel } from "@/components/settings/SlimInvitationsPanel";
import { SlimMfaSettings } from "@/components/settings/SlimMfaSettings";
import { SlimSecuritySettings } from "@/components/settings/SlimSecuritySettings";
import { SlimCurrentSessionSettings } from "@/components/settings/SlimCurrentSessionSettings";
import { AccountEmailChangeControl } from "@/components/settings/AccountEmailChangeControl";
import { listWorkSectors } from "@/lib/permissions.functions";
import { getNotificationSettings, saveNotificationSettings } from "@/lib/notification-settings.functions";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listSessions, revokeSession, revokeAllMySessions } from "@/lib/sessions.functions";
import { getDeviceKey } from "@/hooks/use-session-heartbeat";
import { getRecoveryCodesStatus, generateRecoveryCodes } from "@/lib/recovery-codes.functions";
import { getSecuritySettings, updateSecuritySettings, listSecurityEvents } from "@/lib/security-settings.functions";
import { getMfaStatus, sendEmailMfaCode, verifyEmailMfaCode, setMfaMethod } from "@/lib/mfa.functions";
import { listPasskeys, startPasskeyRegistration, finishPasskeyRegistration, startPasskeyAuthentication, finishPasskeyAuthentication, deletePasskey } from "@/lib/passkeys.functions";
import { parseIpList, isValidEntry, ipAllowed } from "@/lib/ip-allowlist";
import { PlansGrid } from "@/components/settings/PlansGrid";
import { PERIOD_LABEL, MODULE_LABELS, formatBRL, EXTRA_EMPLOYEE_PRICE_CENTS, type Period } from "@/lib/billing/types";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · Vanessa Simoni" },
      { name: "description", content: "Equipe, acessos, expediente e segurança da operação Vanessa Simoni." },
    ],
  }),
  component: ConfigPage,
});

type SubId = "perfil" | "empresa" | "equipe" | "expediente" | "faturamento" | "seguranca" | "sessoes" | "notificacoes" | "preferencias";
type GroupId = "conta" | "sistema";

const PAPEIS = [
  { id: "admin", label: "Administrador", desc: "Gerencia empresa, equipe, integrações e permissões da operação." },
  { id: "gestor", label: "Gestor", desc: "Acompanha resultados, aprova ações e opera as áreas liberadas." },
  { id: "funcionario", label: "Usuário", desc: "Usa no dia a dia apenas as áreas liberadas nas permissões individuais." },
  { id: "vendedor", label: "Vendedor CRM", desc: "Cuida de leads, tarefas, conversas e oportunidades comerciais." },
  { id: "visualizador", label: "Visualizador", desc: "Acompanha relatórios e dados compartilhados em modo leitura." },
] as const;

type GroupDef = {
  id: GroupId;
  icon: typeof User;
  title: string;
  sub: string;
  subs: { id: SubId; icon: typeof User; title: string; sub: string }[];
};

const GRUPOS: GroupDef[] = [
  {
    id: "conta",
    icon: SettingsIcon,
    title: "Geral",
    sub: "Equipe, acessos e rotina interna",
    subs: [
      { id: "equipe", icon: Users, title: "Equipe", sub: "Convites e acessos" },
      { id: "expediente", icon: Clock, title: "Expediente", sub: "Horário comercial da conta" },
      { id: "seguranca", icon: Shield, title: "Segurança", sub: "Senha e proteção" },
      { id: "sessoes", icon: Monitor, title: "Sessões", sub: "Sessão atual" },
    ],
  },
];

function ConfigPage() {
  const [group, setGroup] = useState<GroupId>("conta");
  const [sub, setSub] = useState<SubId>("equipe");
  const { isSuperAdmin } = useIsSuperAdmin();
  const [toast, setToast] = useState<{ msg: string; tone?: "ok" | "err" } | null>(null);
  const showToast = (msg: string, tone: "ok" | "err" = "ok") => {
    setToast({ msg, tone }); setTimeout(() => setToast(null), 3000);
  };

  // Suporte a deep link por hash: /configuracoes#equipe
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyHash = () => {
      const h = window.location.hash.replace("#", "");
      if (!h) return;
      const g = GRUPOS.find((x) => x.id === h || x.subs.some((s) => s.id === h));
      if (!g) return;
      setGroup(g.id);
      setSub((g.subs.find((s) => s.id === h) ?? g.subs[0]).id);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const fetchBundle = useServerFn(getSettingsBundle);
  const bundleQ = useQuery({
    queryKey: ["settings-bundle"],
    queryFn: () => fetchBundle(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const currentGroup = GRUPOS.find((g) => g.id === group) ?? GRUPOS[0];
  const currentSub = currentGroup.subs.find((s) => s.id === sub) ?? currentGroup.subs[0];
  const profile = bundleQ.data?.profile as any;
  const workspace = bundleQ.data?.workspace as any;
  const isOwner = !!bundleQ.data?.isOwner;

  

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">

        <div className="max-w-[1240px] mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-8">
          <aside className="lg:sticky lg:top-8 lg:self-start space-y-5">
            {GRUPOS.map((g) => {
              const visibleSubs = g.subs.filter(s => s.id !== "seguranca" || isSuperAdmin);
              if (visibleSubs.length === 0) return null;

              return (
                <div key={g.id}>
                  <div className="text-[10px] font-semibold tracking-widest text-muted-foreground/80 mb-2 px-2 uppercase">
                    {g.title}
                  </div>
                  <ul className="space-y-0.5">
                    {visibleSubs.map((s) => {
                      const active = sub === s.id;
                      return (
                        <li key={s.id}>
                          <button
                            onClick={() => { setGroup(g.id); setSub(s.id); }}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm transition-colors",
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                            )}
                          >
                            <s.icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{s.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </aside>

          <section className="min-w-0 space-y-6">
            <header className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{currentSub.title}</h1>
              <p className="text-sm text-muted-foreground">{currentSub.sub}</p>
            </header>

            <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
              {bundleQ.isLoading && <div className="text-sm text-muted-foreground py-10 text-center">Carregando…</div>}
              {bundleQ.isError && <div role="alert" className="text-sm text-destructive">Falha ao carregar configurações. Nenhuma alteração pode ser feita com dados desatualizados.<button type="button" onClick={()=>bundleQ.refetch()} className="block mt-3 underline">Tentar novamente</button></div>}
              {bundleQ.data && !bundleQ.isError && (
                <>
                  {sub === "perfil" && <PerfilTab profile={profile} onToast={showToast} />}
                  {sub === "empresa" && <EmpresaTab workspace={workspace} isOwner={isOwner} onToast={showToast} />}
                  {sub === "equipe" && (
                    <div className="space-y-6">
                      <EquipeTab bundle={bundleQ.data} isOwner={isOwner} onToast={showToast} />
                      <AccountEmailChangeControl />
                    </div>
                  )}
                  {sub === "expediente" && <ExpedienteTab workspace={workspace} canManage={!!bundleQ.data?.canManageRegionalSettings} onToast={showToast} />}
                  {sub === "faturamento" && <PreferenciasTab bundle={bundleQ.data} onToast={showToast} />}
                  {sub === "seguranca" && isSuperAdmin && <SlimSecuritySettings />}
                  {sub === "sessoes" && <SlimCurrentSessionSettings />}
                  {sub === "notificacoes" && <NotificacoesTab prefs={profile?.notification_prefs} onToast={showToast} />}
                  {sub === "preferencias" && <PreferenciasTab bundle={bundleQ.data} onToast={showToast} />}
                </>
              )}
            </div>
          </section>
        </div>
      </main>


      {toast && (
        <div className={cn("fixed bottom-6 right-6 z-50 rounded-md px-4 py-2.5 text-sm shadow-lg flex items-center gap-2",
          toast.tone === "err" ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background")}>
          <Check className="w-4 h-4" /> {toast.msg}
        </div>
      )}
    </div>
  );
}


/* ---------- helpers ---------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30", props.className)} />;
}
function Txt(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn("w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y", props.className)} />;
}
function Btn({ children, loading, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cn("inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition", p.className)}>
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}{children}
    </button>
  );
}
function GhostBtn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cn("inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition disabled:opacity-50", p.className)} />;
}
function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return <div className="mb-4"><h2 className="text-base font-semibold">{title}</h2>{desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}</div>;
}

/* ---------- Perfil ---------- */

const CONTACT_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
];

function ProfileGroup({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border/60 bg-gradient-to-br from-muted/40 to-transparent">
        <div className="text-sm font-semibold">{title}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function PerfilTab({ profile, onToast }: { profile: any; onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const save = useServerFn(updateProfile);
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? profile?.full_name ?? "",
    full_name: profile?.full_name ?? "",
    birth_date: profile?.birth_date ?? "",
    job_title: profile?.job_title ?? "",
    whatsapp_primary: profile?.whatsapp_primary ?? "",
    phone_alt: profile?.phone_alt ?? "",
    preferred_contact: profile?.preferred_contact ?? "whatsapp",
    linkedin_url: profile?.linkedin_url ?? "",
    bio: profile?.bio ?? "",
    internal_notes: profile?.internal_notes ?? "",
  });
  const mut = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings-bundle"] }); onToast("Perfil salvo."); },
    onError: (e: any) => onToast(e.message ?? "Falha ao salvar.", "err"),
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fields = Object.entries(form).filter(([k]) => k !== "internal_notes");
  const filled = fields.filter(([, v]) => String(v ?? "").trim() !== "").length;
  const completion = Math.round((filled / fields.length) * 100);

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-6">
      <SectionHeader title="Perfil" desc="Seus dados pessoais e de contato. Os dados do negócio ficam na aba Empresa." />

      {/* Progresso do preenchimento */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-medium">Perfil completo</div>
          <div className="text-sm font-semibold tabular-nums">{completion}%</div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Quanto mais completo, melhores ficam os relatórios, as automações e o atendimento.
        </p>
      </div>

      <ProfileGroup title="Identificação" desc="Como você aparece dentro da plataforma.">
        <Field label="Nome de exibição"><Inp value={form.display_name} onChange={(e) => set("display_name", e.target.value)} /></Field>
        <Field label="Nome completo"><Inp value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
        <Field label="Data de nascimento"><Inp type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} /></Field>
        <Field label="Cargo / função"><Inp value={form.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Ex.: Diretor comercial" /></Field>
        <div className="md:col-span-2">
          <Field label="Sobre você" hint="Um resumo curto de quem é você e o que faz.">
            <Txt value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Ex.: Gestor de tráfego há 6 anos, foco em infoprodutos e clínicas." />
          </Field>
        </div>
      </ProfileGroup>

      <ProfileGroup title="Contato" desc="Usado nas notificações e no contato do suporte.">
        <Field label="WhatsApp principal"><Inp value={form.whatsapp_primary} onChange={(e) => set("whatsapp_primary", e.target.value)} placeholder="+55 11 99999-9999" /></Field>
        <Field label="Telefone alternativo"><Inp value={form.phone_alt} onChange={(e) => set("phone_alt", e.target.value)} placeholder="Fixo ou recado" /></Field>
        <Field label="Canal preferido de contato">
          <select
            value={form.preferred_contact}
            onChange={(e) => set("preferred_contact", e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {CONTACT_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="LinkedIn"><Inp value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
      </ProfileGroup>

      <div className="sticky bottom-0 z-10">
        <div className="rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="text-[11px] text-muted-foreground">Alterações valem só para o seu usuário.</div>
          <Btn type="submit" loading={mut.isPending}>Salvar perfil</Btn>
        </div>
      </div>
    </form>
  );
}


/* ---------- Empresa ---------- */

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

const WS_FIELDS = [
  "legal_name", "cnpj", "phone", "contact_email", "site_url", "instagram_handle",
  "industry", "description", "legal_representative", "address_zip", "address_street",
  "address_number", "address_complement", "address_district", "address_city",
  "address_state", "address_country",
] as const;

function EmpresaTab({ workspace, isOwner, onToast }: { workspace: any; isOwner: boolean; onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const save = useServerFn(updateWorkspace);
  const upload = useServerFn(uploadWorkspaceLogo);
  const [name, setName] = useState(workspace?.name ?? "");
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(WS_FIELDS.map((k) => [k, workspace?.[k] ?? ""])),
  );
  const [logoPath, setLogoPath] = useState<string | null>(workspace?.logo_path ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(workspace?.logo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const filled = useMemo(() => {
    const vals = [name, logoPath ?? "", ...WS_FIELDS.map((k) => form[k] ?? "")];
    return Math.round((vals.filter((v) => String(v).trim() !== "").length / vals.length) * 100);
  }, [name, form, logoPath]);

  const mut = useMutation({
    mutationFn: () => save({ data: { name, logo_path: logoPath, ...form } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings-bundle"] }); qc.invalidateQueries({ queryKey: ["active-workspace"] }); onToast("Empresa atualizada."); },
    onError: (e: any) => onToast(e.message ?? "Falha", "err"),
  });

  const onPickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3_000_000) { onToast("Imagem muito grande (máx. 3MB).", "err"); return; }
    setUploading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(new Error("Falha ao ler arquivo"));
        r.readAsDataURL(file);
      });
      const r: any = await upload({ data: { filename: file.name, contentType: file.type || "image/png", base64: b64 } });
      setLogoPath(r.path); setLogoUrl(r.url);
      onToast("Logo enviada. Clique em salvar para aplicar.");
    } catch (e: any) {
      onToast(e?.message ?? "Falha no upload", "err");
    } finally { setUploading(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Empresa" desc="Cadastro completo da empresa que usa este workspace." />
        <div className="mb-4 min-w-[180px]">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Cadastro completo</span><span>{filled}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${filled}%` }} />
          </div>
        </div>
      </div>

      <ProfileGroup title="Identidade" desc="É este nome e logo que aparecem no menu lateral da plataforma.">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="h-20 w-20 rounded-xl border border-border bg-muted/40 grid place-items-center overflow-hidden shrink-0">
            {logoUrl ? <img src={logoUrl} alt="Logo da empresa" className="h-full w-full object-contain" /> : <span className="text-xl font-bold text-muted-foreground">{(name || "?").slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="space-y-2">
            <label className={cn("inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition cursor-pointer", (!isOwner || uploading) && "opacity-50 pointer-events-none")}>
              {uploading ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
              <input type="file" accept="image/*" className="hidden" disabled={!isOwner || uploading} onChange={(e) => onPickLogo(e.target.files?.[0])} />
            </label>
            {logoUrl && isOwner && (
              <button type="button" className="ml-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => { setLogoPath(null); setLogoUrl(null); }}>Remover</button>
            )}
            <p className="text-[11px] text-muted-foreground">PNG, JPG, WEBP ou SVG. Máx. 3MB.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Field label="Nome da empresa"><Inp value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} placeholder="Ex.: Vanessa Simoni Marketing" /></Field>
          <Field label="Identificador (slug)" hint="Gerado automaticamente."><Inp value={workspace?.slug ?? ""} disabled /></Field>
          <Field label="Razão social"><Inp value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="CNPJ"><Inp value={form.cnpj} onChange={(e) => set("cnpj", maskCnpj(e.target.value))} disabled={!isOwner} placeholder="00.000.000/0000-00" /></Field>
          <Field label="Segmento / nicho"><Inp value={form.industry} onChange={(e) => set("industry", e.target.value)} disabled={!isOwner} placeholder="Ex.: Estética, Imobiliária" /></Field>
          <Field label="Responsável legal"><Inp value={form.legal_representative} onChange={(e) => set("legal_representative", e.target.value)} disabled={!isOwner} /></Field>
        </div>
      </ProfileGroup>

      <ProfileGroup title="Contato" desc="Usado em documentos, propostas e comunicações.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Telefone / WhatsApp"><Inp value={form.phone} onChange={(e) => set("phone", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="E-mail de contato"><Inp type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="Site"><Inp value={form.site_url} onChange={(e) => set("site_url", e.target.value)} disabled={!isOwner} placeholder="https://" /></Field>
          <Field label="Instagram"><Inp value={form.instagram_handle} onChange={(e) => set("instagram_handle", e.target.value.replace(/^@/, ""))} disabled={!isOwner} placeholder="suaempresa" /></Field>
        </div>
      </ProfileGroup>

      <ProfileGroup title="Endereço">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="CEP"><Inp value={form.address_zip} onChange={(e) => set("address_zip", e.target.value)} disabled={!isOwner} /></Field>
          <div className="md:col-span-2"><Field label="Rua / logradouro"><Inp value={form.address_street} onChange={(e) => set("address_street", e.target.value)} disabled={!isOwner} /></Field></div>
          <Field label="Número"><Inp value={form.address_number} onChange={(e) => set("address_number", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="Complemento"><Inp value={form.address_complement} onChange={(e) => set("address_complement", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="Bairro"><Inp value={form.address_district} onChange={(e) => set("address_district", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="Cidade"><Inp value={form.address_city} onChange={(e) => set("address_city", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="Estado"><Inp value={form.address_state} onChange={(e) => set("address_state", e.target.value)} disabled={!isOwner} /></Field>
          <Field label="País"><Inp value={form.address_country} onChange={(e) => set("address_country", e.target.value)} disabled={!isOwner} placeholder="Brasil" /></Field>
        </div>
      </ProfileGroup>

      <ProfileGroup title="Sobre a empresa" desc="Esse resumo ajuda a IA a gerar conteúdos e respostas no seu tom.">
        <Txt rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} disabled={!isOwner} placeholder="O que a empresa faz, para quem vende e seus diferenciais." />
      </ProfileGroup>

      {!isOwner && <p className="text-[11px] text-muted-foreground">Apenas o dono da conta pode editar.</p>}
      <div className="sticky bottom-0 z-10">
        <div className="rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="text-[11px] text-muted-foreground">O nome e a logo aparecem no menu lateral.</div>
          <Btn type="submit" loading={mut.isPending} disabled={!isOwner}>Salvar empresa</Btn>
        </div>
      </div>
    </form>
  );
}


/* ---------- Equipe ---------- */

function EquipeTab({ bundle, isOwner, onToast }: { bundle: any; isOwner: boolean; onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const fnRemove = useServerFn(removeMember);
  const fnRole = useServerFn(updateMemberRole);
  const fnCreate = useServerFn(createEmployee);

  const reload = () => qc.invalidateQueries({ queryKey: ["settings-bundle"] });

  const mCreate = useMutation({
    mutationFn: (input: any) => fnCreate({ data: input }),
    onSuccess: (r: any) => { onToast(r?.reusedExistingUser ? "Usuário existente vinculado a esta conta. Ele verá os dois workspaces no mesmo login." : "Usuário criado. Ele já pode fazer login."); setInviteOpen(false); reload(); },
    onError: (e: any) => onToast(e.message ?? "Falha ao criar usuário", "err"),
  });
  const mRemove = useMutation({ mutationFn: (userId: string) => fnRemove({ data: { userId } }), onSuccess: () => { onToast("Membro removido."); reload(); }, onError: (e: any) => onToast(e.message, "err") });
  const mRole = useMutation({ mutationFn: (v: { userId: string; role_type: any }) => fnRole({ data: v }), onSuccess: () => { onToast("Papel atualizado."); reload(); } });

  const members = bundle.members ?? [];
  const invitations = (bundle.invitations ?? []).filter((i: any) => i.status === "pending");
  const partners = members.filter((m: any) => m.is_partner).length;

  const [permTarget, setPermTarget] = useState<{ id: string; label: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "parceiros" | "admins">("todos");

  const nomeDe = (m: any) => m.profile?.display_name ?? m.profile?.full_name ?? m.user_id.slice(0, 8);
  const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase() ?? "").join("") || "?";

  const membrosFiltrados = members.filter((m: any) => {
    if (filtro === "parceiros" && !m.is_partner) return false;
    if (filtro === "admins" && !["owner", "admin"].includes(m.role) && !["owner", "admin"].includes(m.role_type)) return false;
    const alvo = `${nomeDe(m)} ${m.profile?.email ?? ""}`.toLowerCase();
    return alvo.includes(busca.trim().toLowerCase());
  });

  const stats = [
    { icon: Users, label: "Membros ativos", value: members.length, tone: "text-primary bg-primary/10" },
    { icon: Wrench, label: "Parceiros técnicos", value: partners, tone: "text-amber-600 bg-amber-500/10" },
    { icon: MailPlus, label: "Convites pendentes", value: invitations.length, tone: "text-sky-600 bg-sky-500/10" },
  ];

  return (
    <div>
      <SectionHeader title="Usuários e equipe" desc="Adicione usuários da Vanessa Simoni, defina senha inicial, papéis e permissões sem depender de plano ou assinatura." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${s.tone}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold leading-none">{s.value}</div>
              <div className="text-[11px] text-muted-foreground truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background"
            />
          </div>
          <div className="hidden sm:flex items-center gap-1 rounded-lg border border-border p-1 bg-muted/30">
            {([["todos", "Todos"], ["admins", "Admins"], ["parceiros", "Parceiros"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filtro === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Btn onClick={() => setInviteOpen(true)} disabled={!isOwner}><UserPlus className="w-3.5 h-3.5" />Adicionar usuário</Btn>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-8">
        {membrosFiltrados.map((m: any) => {
          const nome = nomeDe(m);
          const isOwnerRow = m.role_type === "owner";
          return (
            <div key={m.user_id} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 text-xs font-semibold ${m.is_partner ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"}`}>
                  {iniciais(nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate">{nome}</span>
                    {isOwnerRow && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {m.profile?.email ?? "-"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${m.is_partner ? "border-amber-500/30 bg-amber-500/10 text-amber-600" : "border-border bg-muted/50 text-muted-foreground"}`}>
                      {m.is_partner ? `Parceiro técnico${m.role === "admin" ? " · Administrador" : ""} · ${m.access_expires_at ? `até ${new Date(m.access_expires_at).toLocaleDateString("pt-BR")}` : "sem prazo"}` : PAPEIS.find((p) => p.id === m.role_type)?.label ?? "Membro"}
                    </span>
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />desde {new Date(m.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border/70 flex flex-wrap items-center gap-2">
                <select
                  value={m.role_type ?? "funcionario"}
                  onChange={(e) => mRole.mutate({ userId: m.user_id, role_type: e.target.value as any })}
                  disabled={!isOwner || isOwnerRow}
                  className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background disabled:opacity-60"
                >
                  {PAPEIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  {m.is_partner && <option value="parceiro">Parceiro técnico</option>}
                  {isOwnerRow && <option value="owner">Proprietário</option>}
                </select>
                {isOwner && !isOwnerRow && (
                  <button onClick={() => setPermTarget({ id: m.user_id, label: nome })}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3" />Permissões
                  </button>
                )}
                {isOwner && !isOwnerRow && (
                  <button
                    title="Remover membro"
                    onClick={() => { if (confirm(`Remover ${nome}?`)) mRemove.mutate(m.user_id); }}
                    className="ml-auto text-xs px-2.5 py-1.5 rounded-lg border border-transparent text-destructive hover:bg-destructive/10 hover:border-destructive/30 inline-flex items-center gap-1.5">
                    <Trash2 className="w-3 h-3" />Remover
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {membrosFiltrados.length === 0 && (
          <div className="xl:col-span-2 text-sm text-muted-foreground py-10 text-center border border-dashed border-border rounded-xl">
            Nenhuma pessoa encontrada com esses filtros.
          </div>
        )}
      </div>

      <SlimInvitationsPanel
        key={`${bundle.workspaceId ?? bundle.workspace?.id ?? ''}:${bundle.actorId ?? bundle.profile?.id ?? ''}`}
        workspaceId={bundle.workspaceId ?? bundle.workspace?.id ?? ''}
        actorId={bundle.actorId ?? bundle.profile?.id ?? ''}
        isOwner={bundle.canManageInvitations === true}
        onChanged={reload}
      />

      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onCreate={(payload) => mCreate.mutate(payload)}
          loading={mCreate.isPending}
        />
      )}

      {permTarget && (
        <UserPermissionsDialog
          userId={permTarget.id}
          userLabel={permTarget.label}
          onClose={() => setPermTarget(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function InviteDialog({
  onClose, onCreate, loading,
}: {
  onClose: () => void;
  onCreate: (p: any) => void;
  loading?: boolean;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<typeof PAPEIS[number]["id"]>("funcionario");
  const [sectorId, setSectorId] = useState("");
  const [sectorName, setSectorName] = useState("");
  const fnSectors = useServerFn(listWorkSectors);
  const sectorsQ = useQuery({ queryKey: ["work-sectors"], queryFn: () => fnSectors({ data: {} } as any) });
  const sectors: any[] = (sectorsQ.data as any)?.sectors ?? [];
  const needsNewSector = sectors.length === 0 || sectorId === "__new";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!fullName.trim() || !email.trim() || password.length < 8) return;
          if (needsNewSector ? sectorName.trim().length < 2 : !sectorId) return;
          onCreate({
            email: email.trim(), password, full_name: fullName.trim(), role_type: role, modules: [],
            sector_id: needsNewSector ? null : sectorId,
            sector_name: needsNewSector ? sectorName.trim() : null,
          });
        }}
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><UserPlus className="w-5 h-5" /></div>
          <div className="min-w-0"><h2 className="text-base font-semibold leading-tight">Adicionar usuário</h2><p className="text-xs text-muted-foreground">Preencha os dados da conta.</p></div>
        </div>
          <>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 rounded-lg bg-muted/40 p-3">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              A conta é criada na hora e o login funciona direto com e-mail e senha. As permissões granulares ficam disponíveis depois de criar.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome completo"><Inp value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Nome do usuário" /></Field>
              <Field label="E-mail de acesso"><Inp type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="usuario@empresa.com" /></Field>
            </div>
            <Field label="Senha (mínimo 8 caracteres)"><Inp type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Defina uma senha inicial" /></Field>
            <div>
              <div className="text-xs font-medium mb-2">Papel</div>
              <div className="grid grid-cols-1 gap-2">
                {PAPEIS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setRole(p.id)}
                    className={`text-left rounded-lg border px-3 py-2 transition-colors ${role === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full border grid place-items-center shrink-0 ${role === p.id ? "border-primary bg-primary" : "border-border"}`}>
                        {role === p.id && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </span>
                      <span className="text-xs font-semibold">{p.label}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 pl-5.5 leading-snug">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium">Setor de trabalho <span className="text-destructive">*</span></div>
              {sectors.length > 0 && (
                <select
                  value={sectorId}
                  onChange={(e) => setSectorId(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background"
                  required
                >
                  <option value="">Selecione o setor…</option>
                  {sectors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__new">+ Criar novo setor…</option>
                </select>
              )}
              {needsNewSector && (
                <Inp value={sectorName} onChange={(e) => setSectorName(e.target.value)} required minLength={2}
                  placeholder="Nome do primeiro setor (ex.: Comercial)" />
              )}
              <p className="text-[10px] text-muted-foreground">
                O usuário só verá os fluxos de trabalho do setor dele. É obrigatório ter ao menos um setor criado.
              </p>
            </div>

          </>
        <div className="flex justify-end gap-2 pt-2">
          <GhostBtn type="button" onClick={onClose}>Cancelar</GhostBtn>
          <Btn type="submit" loading={loading}><Send className="w-3.5 h-3.5" />Criar conta</Btn>
        </div>
      </form>
    </div>
  );
}


/* ---------- Faturamento ---------- */

const SUB_STATUS_META: Record<string, { label: string; tone: string; dot: string }> = {
  active: { label: "Ativo", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", dot: "bg-emerald-500" },
  trialing: { label: "Em teste", tone: "bg-sky-500/10 text-sky-600 border-sky-500/30", dot: "bg-sky-500" },
  past_due: { label: "Pagamento pendente", tone: "bg-amber-500/10 text-amber-600 border-amber-500/30", dot: "bg-amber-500" },
  canceled: { label: "Cancelado", tone: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
  inactive: { label: "Inativo", tone: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  expired: { label: "Expirado", tone: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
};

const PAY_STATUS_LABEL: Record<string, string> = {
  paid: "Pago", pending: "Aguardando", failed: "Falhou", refunded: "Estornado", canceled: "Cancelado", expired: "Expirado",
};

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "-");
const daysUntil = (v?: string | null) => (v ? Math.ceil((new Date(v).getTime() - Date.now()) / 86400000) : null);

function BillingStat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <div className="mt-1 text-sm font-bold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max >= 9999;
  const pct = unlimited ? 8 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{used} de {unlimited ? "∞" : max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

function FaturamentoTab({ workspaceId }: { workspaceId?: string }) {
  const q = useQuery({
    queryKey: ["billing-info", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const [subRes, payRes, waRes, memRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("status, trial_ends_at, current_period_end, started_at, period, extra_employees, plans(code, name, description, modules, max_employees_per_company)")
          .eq("workspace_id", workspaceId!)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("payments")
          .select("id, amount_cents, discount_cents, status, method, period, created_at, paid_at, boleto_url, pix_copy_paste")
          .eq("workspace_id", workspaceId!)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("whatsapp_web_sessions")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .in("status", ["conectado", "connected", "open"]),
        supabase.from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId!),
      ]);
      return {
        sub: subRes.data as any,
        payments: (payRes.data ?? []) as any[],
        whatsapp_numbers: waRes.count ?? 0,
        members: memRes.count ?? 0,
      };

    },
  });

  const sub: any = q.data?.sub;
  const plan: any = sub?.plans;
  const status: string = sub?.status ?? (q.isLoading ? "" : "inactive");
  const meta = SUB_STATUS_META[status] ?? SUB_STATUS_META.inactive;
  const isTrial = status === "trialing" || (!!sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date());
  const trialLeft = daysUntil(sub?.trial_ends_at);
  const renewLeft = daysUntil(sub?.current_period_end);

  const cycleProgress = (() => {
    if (!sub?.started_at || !sub?.current_period_end) return null;
    const a = new Date(sub.started_at).getTime();
    const b = new Date(sub.current_period_end).getTime();
    if (b <= a) return null;
    return Math.min(100, Math.max(0, Math.round(((Date.now() - a) / (b - a)) * 100)));
  })();

  const modules: string[] = plan?.modules ?? [];

  return (
    <div className="space-y-8">
      <SectionHeader title="Faturamento" desc="Seu plano, o que está incluso, renovação e todos os planos Vanessa Simoni." />

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando faturamento…</div>}

      {!q.isLoading && (
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.07] via-card to-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-primary/15 p-2 text-primary"><Crown className="w-4 h-4" /></span>
                <h3 className="text-xl font-bold tracking-tight">{plan?.name ?? "Sem plano ativo"}</h3>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", meta.tone)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />{meta.label}
                </span>
                {isTrial && trialLeft !== null && trialLeft >= 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-600">
                    <Clock className="w-3 h-3" />{trialLeft} {trialLeft === 1 ? "dia" : "dias"} de teste
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-xl text-xs text-muted-foreground">
                {plan?.description ?? "Escolha um plano abaixo para liberar todos os módulos da plataforma."}
              </p>
            </div>
            <div className="flex gap-2">
              <GhostBtn type="button" onClick={() => q.refetch()}><RefreshCw className="w-3.5 h-3.5" />Atualizar</GhostBtn>
              <Btn type="button" onClick={() => document.getElementById("planos-Vanessa Simoni")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <Sparkles className="w-3.5 h-3.5" />{plan ? "Trocar de plano" : "Escolher plano"}
              </Btn>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BillingStat icon={CalendarDays} label="Início do ciclo" value={fmtDate(sub?.started_at)} />
            <BillingStat
              icon={RefreshCw}
              label={status === "canceled" ? "Acesso até" : "Próxima renovação"}
              value={fmtDate(sub?.current_period_end)}
              hint={renewLeft !== null && renewLeft >= 0 ? `em ${renewLeft} ${renewLeft === 1 ? "dia" : "dias"}` : undefined}
            />
            <BillingStat icon={Clock} label="Período" value={sub?.period ? (PERIOD_LABEL[sub.period as Period] ?? sub.period) : "-"} />
            <BillingStat icon={Users} label="Adicionais" value={String(sub?.extra_employees ?? 0)} hint="funcionários e WhatsApp extras" />
          </div>

          {cycleProgress !== null && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>Ciclo atual</span><span>{cycleProgress}% concluído</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${cycleProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {plan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-bold">O que está incluso no {plan.name}</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {modules.length === 0 && <div className="text-xs text-muted-foreground">Nenhum módulo listado neste plano.</div>}
              {modules.map((m) => (
                <div key={m} className="flex items-center gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{MODULE_LABELS[m] ?? m}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-bold">Uso do plano</h4>
            </div>
            <UsageBar
              label="Usuários"
              used={q.data?.members ?? 0}
              max={(plan.max_employees_per_company ?? 1) + (sub?.extra_employees ?? 0)}
            />
            <UsageBar
              label="Números de WhatsApp"
              used={q.data?.whatsapp_numbers ?? 0}
              max={(plan.max_employees_per_company ?? 1) + (sub?.extra_employees ?? 0)}
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              Precisa de mais? Contrate Funcionários e WhatsApp Extras (cada adicional libera +1 usuário e +1 número) ou suba de plano.
            </p>

            {status === "active" && plan?.code && (
              <a
                href={`/checkout?plan=${plan.code}&period=${sub?.period ?? "1m"}&extras=1&extrasOnly=true`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90"
              >
                <Users className="w-3.5 h-3.5" />
                Comprar mais usuário e WhatsApp
              </a>
            )}

          </div>

        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-bold">Histórico de cobranças</h4>
        </div>
        {(q.data?.payments?.length ?? 0) === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhuma cobrança registrada até agora.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {q.data!.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">
                    {formatBRL(Math.max(0, (p.amount_cents ?? 0) - (p.discount_cents ?? 0)))}
                    <span className="ml-2 font-normal text-muted-foreground">{p.period ? (PERIOD_LABEL[p.period as Period] ?? p.period) : ""}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {fmtDate(p.paid_at ?? p.created_at)} · {String(p.method ?? "").toUpperCase()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    p.status === "paid" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : p.status === "pending" ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      : "bg-muted text-muted-foreground border-border",
                  )}>
                    {PAY_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  {p.boleto_url && (
                    <a href={p.boleto_url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-primary hover:underline">Boleto</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="capacidade-saude-slim" className="pt-2 border-t border-border/60">
        <SectionHeader title="Capacidade da operação" desc="Área preservada para controle administrativo interno, sem venda de assinatura para o cliente." />
        <PlansGrid />
      </div>
    </div>
  );
}


/* ---------- Segurança ---------- */

const FAKE_BACKUP_CODES = [
  "4F2K-9QX1", "8HD3-LM7P", "1ZR6-VT4B", "7YQ2-NC8D",
  "3XW5-JP0K", "9LK8-RB2M", "5TN4-QD6H", "2VC7-ZX3F",
];

function SecurityRow({
  icon: Icon, title, desc, badge, tone = "text-primary bg-primary/10", on, onToggle, children, soon, disabled=false,
}: {
  icon: any; title: string; desc: string; badge?: string; tone?: string;
  on: boolean; onToggle: () => void; children?: React.ReactNode; soon?: boolean; disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className={cn("min-w-0 rounded-xl border bg-card p-4 disabled:opacity-60", on ? "border-primary/40" : "border-border")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-lg grid place-items-center shrink-0", on ? tone : "bg-muted text-muted-foreground")}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{title}</span>
            {badge && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/40">{badge}</span>}
            {soon && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full border border-amber-500/30 text-amber-600 bg-amber-500/10">Em breve</span>}
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</div>
        </div>
        <Toggle on={on} onClick={onToggle} />
      </div>
      {on && children && <div className="mt-3 pt-3 border-t border-border/70">{children}</div>}
    </fieldset>
  );
}

function SegurancaTab({ onToast }: { onToast: (m: string, t?: "ok" | "err") => void }) {
  const fnMfaStatus = useServerFn(getMfaStatus);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState<"protecoes" | "maliciosos">("protecoes");

  // Front-end apenas (a lógica real vem depois)
  const [novosCodigos, setNovosCodigos] = useState<string[] | null>(null);
  const [adv, setAdv] = useState({
    turnstile: false, ipAllowlist: false, loginAlerts: false, deviceApproval: false,
    forceTeam2fa: false, autoLogout: true, hibp: false, exportAlert: false,
  });
  const [ips, setIps] = useState("");
  const [idleMin, setIdleMin] = useState("60");

  // Carrega a preferência real de encerramento por inatividade (só afeta esta sessão do navegador)
  useEffect(() => {
    const p = readIdlePref();
    setAdv((s) => ({ ...s, autoLogout: p.enabled }));
    setIdleMin(String(p.minutes));
  }, []);
  const applyIdle = (enabled: boolean, minutes: string) => {
    const m = Math.min(Math.max(parseInt(minutes || "60", 10) || 60, 1), 1440);
    writeIdlePref({ enabled, minutes: m });
  };

  // Configurações de segurança do workspace (servidor)
  const fnGetSec = useServerFn(getSecuritySettings);
  const fnSetSec = useServerFn(updateSecuritySettings);
  const [myIp, setMyIp] = useState<string | null>(null);
  const [ipDesktopOnly, setIpDesktopOnly] = useState(true);
  const [ipSaving, setIpSaving] = useState(false);
  const [securityState,setSecurityState]=useState<"loading"|"ready"|"error">("loading");
  const [securityError,setSecurityError]=useState<string|null>(null);
  const [securityAdmin,setSecurityAdmin]=useState(false);
  const [securityReload,setSecurityReload]=useState(0);
  const [securitySaving,setSecuritySaving]=useState(false);
  const securitySaveLock=useRef(false);
  useEffect(() => {
    let current=true;setSecurityState("loading");setSecurityError(null);setSecurityAdmin(false);
    void (async()=>{try{
      const r=parseSlimSecuritySnapshot(await fnGetSec({}));if(!current)return;const s=r.settings;
      setMyIp(r.currentIp);setIps(s.allowed_ips.join("\n"));setIpDesktopOnly(s.ip_allowlist_desktop_only);
      setAdv(prev=>({...prev,deviceApproval:s.device_approval,forceTeam2fa:s.require_team_2fa,hibp:s.block_leaked_passwords,exportAlert:s.confirm_bulk_export,ipAllowlist:s.ip_allowlist_enabled,turnstile:s.turnstile_enabled,loginAlerts:s.login_alerts}));
      setSecurityAdmin(r.isAdmin);setSecurityState("ready");
    }catch(e){if(current){setSecurityState("error");setSecurityError(e instanceof Error?e.message:"Não foi possível verificar a segurança.");}}})();
    return ()=>{current=false;};
  },[fnGetSec,securityReload]);

  const secKeyMap: Record<string, keyof typeof adv> = {
    device_approval: "deviceApproval",
    require_team_2fa: "forceTeam2fa",
    block_leaked_passwords: "hibp",
    confirm_bulk_export: "exportAlert",
    ip_allowlist_enabled: "ipAllowlist",
    turnstile_enabled: "turnstile",
    login_alerts: "loginAlerts",
  };
  const saveSec=async(key:string,value:boolean)=>{
    try{assertSecuritySaveAllowed(securityState,securityAdmin,securitySaveLock.current);}catch(e){onToast(e instanceof Error?e.message:"Sem permissão para salvar.","err");return;}
    const local=secKeyMap[key];if(!local)return;
    securitySaveLock.current=true;setSecuritySaving(true);
    try{
      const result=await fnSetSec({data:{[key]:value} as any});
      const confirmed=parseSlimSecuritySnapshot({...result,isAdmin:securityAdmin});
      if(confirmed.settings[key]!==value)throw new Error("O servidor não confirmou o valor solicitado.");
      setAdv(s=>({...s,[local]:confirmed.settings[key]}));
      onToast("Preferência salva. A aplicação da proteção depende da configuração do servidor.");
    }catch(e){onToast(e instanceof Error?e.message:"Falha ao salvar.","err");}
    finally{securitySaveLock.current=false;setSecuritySaving(false);}
  };

  const ipList = useMemo(() => parseIpList(ips), [ips]);
  const ipInvalid = useMemo(() => ipList.filter((e) => !isValidEntry(e)), [ipList]);
  const myIpInList = useMemo(() => ipAllowed(myIp, ipList), [myIp, ipList]);

  const saveIpList=async()=>{
    try{assertSecuritySaveAllowed(securityState,securityAdmin,securitySaveLock.current);}catch(e){onToast(e instanceof Error?e.message:"Configurações indisponíveis.","err");return;}
    if(ipInvalid.length){onToast("Endereço inválido: "+ipInvalid[0],"err");return;}
    securitySaveLock.current=true;setIpSaving(true);setSecuritySaving(true);
    try{
      const response=await fnSetSec({data:{allowed_ips:ipList,ip_allowlist_desktop_only:ipDesktopOnly} as any});
      const confirmed=parseSlimSecuritySnapshot({...response,isAdmin:securityAdmin});
      setIps(confirmed.settings.allowed_ips.join("\n"));setIpDesktopOnly(confirmed.settings.ip_allowlist_desktop_only);
      onToast("Lista de IPs salva no servidor.");
    }catch(e){onToast(e instanceof Error?e.message:"Falha ao salvar a lista.","err");}
    finally{securitySaveLock.current=false;setIpSaving(false);setSecuritySaving(false);}
  };

  const strength = useMemo(() => {
    const p = pw1;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 5);
  }, [pw1]);
  const strengthLabel = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte", "Excelente"][strength];

  const mfaCache = useQuery({ queryKey: ["mfa-status"], queryFn: () => fnMfaStatus({}) as any });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < 8) return onToast("Senha precisa ter no mínimo 8 caracteres.", "err");
    if (pw1 !== pw2) return onToast("As senhas não coincidem.", "err");
    setLoading(true);
    try {
      const {error}=await supabase.auth.updateUser({password:pw1});
      if(error){onToast(error.message,"err");return;}
    }catch{onToast("Não foi possível confirmar a alteração da senha. Verifique a conexão antes de tentar novamente.","err");return;}
    finally{setLoading(false);}
    try {
      const { recordSecurityEvent } = await import("@/lib/security-settings.functions");
      await recordSecurityEvent({ data: { type: "password_changed", description: "Alteração feita pelo painel de configurações" } });
    } catch { /* silencioso */ }
    onToast("Senha atualizada."); setPw1(""); setPw2("");
  };

  const copiar = (txt: string, msg: string) => {
    navigator.clipboard?.writeText(txt).then(() => onToast(msg)).catch(() => onToast("Não foi possível copiar.", "err"));
  };

  /* Códigos de recuperação — o texto puro só existe nesta tela, nunca é armazenado */
  // SLIM_NATIVE_MFA_V1: legacy recovery has no complete backend; do not mount or call it.
  const recoveryAvailable = false;
  const statusQ = useQuery({
    queryKey: ["recovery-codes-status"],
    queryFn: () => getRecoveryCodesStatus(),
    enabled: recoveryAvailable,
  });
  const gerar = useMutation({
    mutationFn: () => generateRecoveryCodes(),
    onSuccess: (r: { codes: string[] }) => {
      setNovosCodigos(r.codes);
      statusQ.refetch();
      onToast("Novos códigos gerados. Os anteriores foram invalidados.");
    },
    onError: (e: any) => onToast(e?.message ?? "Falha ao gerar códigos.", "err"),
  });

  const apagarDaTela = () => setNovosCodigos(null);

  const copiarEApagar = async () => {
    if (!novosCodigos) return;
    try {
      await navigator.clipboard.writeText(novosCodigos.join("\n"));
      apagarDaTela();
      onToast("Códigos copiados e removidos da tela.");
    } catch {
      onToast("Não foi possível copiar.", "err");
    }
  };

  const baixarEApagar = () => {
    if (!novosCodigos) return;
    const conteudo = `Vanessa Simoni — códigos de recuperação\nGerados em ${new Date().toLocaleString("pt-BR")}\nCada código funciona uma única vez.\n\n${novosCodigos.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Vanessa Simoni-codigos-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
    apagarDaTela();
    onToast("Arquivo baixado. Códigos removidos da tela.");
  };



  return (
    <div className="space-y-6">
      <div className="flex border-b border-border/60 -mx-6 px-6 mb-6">
        <button
          onClick={() => setActiveSubTab("protecoes")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeSubTab === "protecoes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Proteções
        </button>
        <button
          onClick={() => setActiveSubTab("maliciosos")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeSubTab === "maliciosos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Acessos Maliciosos
        </button>
      </div>

      {activeSubTab === "protecoes" ? (
        <>
      <div className="rounded-xl border border-border bg-card p-4" role={securityState==="error"?"alert":"status"}>
        <h3 className="text-sm font-semibold">Estado das configurações de segurança</h3>
        <p className="mt-2 text-xs text-muted-foreground">{securityState==="loading"?"Consultando as configurações do servidor...":securityState==="error"?securityError:"Configurações carregadas. Preferência salva não comprova que o controle está aplicado a todos os acessos."}</p>
        {securityState==="error"&&<button type="button" onClick={()=>setSecurityReload(v=>v+1)} className="mt-3 text-xs underline">Tentar carregar novamente</button>}
        {mfaCache.isError&&<p className="mt-2 text-xs text-destructive">Não foi possível confirmar os métodos de autenticação em dois fatores.</p>}
      </div>

      {/* Senha */}
      <form onSubmit={submit}>
        <SectionHeader title="Senha de acesso" desc="Use uma senha longa e exclusiva. Recomendamos no mínimo 12 caracteres com números e símbolos." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nova senha">
            <div className="relative">
              <Inp type={showPw ? "text" : "password"} value={pw1} onChange={(e) => setPw1(e.target.value)} minLength={8} required />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirmar nova senha">
            <Inp type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required />
          </Field>
        </div>
        {pw1 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">Força da senha</span>
              <span className="font-medium">{strengthLabel}</span>
            </div>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < strength ? (strength >= 4 ? "bg-success" : strength >= 3 ? "bg-amber-500" : "bg-destructive") : "bg-muted")} />
              ))}
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <Btn type="submit" loading={loading}><Shield className="w-3.5 h-3.5" />Atualizar senha</Btn>
        </div>
      </form>

      {/* 2FA */}
      <TwoFactorSection onToast={onToast} />


        {/* Códigos de recuperação */}
        {recoveryAvailable && <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg grid place-items-center bg-amber-500/10 text-amber-600 shrink-0"><KeyRound className="w-[18px] h-[18px]" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Códigos de recuperação</div>
              <div className="text-[11px] text-muted-foreground">
                Oito códigos de uso único para redefinir sua senha se você perder o acesso. Eles aparecem <b>uma única vez</b>: ao copiar ou baixar, somem da tela e nunca ficam guardados em texto no sistema.
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {statusQ.isError ? "Serviço de códigos de recuperação indisponível. Nenhum código foi confirmado." : statusQ.data
                  ? statusQ.data.remaining > 0
                    ? <>Você tem <b>{statusQ.data.remaining}</b> código(s) válido(s) gerado(s) em {new Date(statusQ.data.createdAt!).toLocaleDateString("pt-BR")}.</>
                    : "Nenhum código ativo. Gere agora para não ficar sem plano B."
                  : "Carregando…"}
              </div>
            </div>
            <GhostBtn onClick={() => gerar.mutate()} disabled={gerar.isPending||statusQ.isLoading||statusQ.isError}>
              <RefreshCw className={cn("w-3.5 h-3.5", gerar.isPending && "animate-spin")} />
              {statusQ.data && statusQ.data.total > 0 ? "Gerar novos" : "Gerar códigos"}
            </GhostBtn>
          </div>

          {novosCodigos && (
            <>
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
                Guarde agora: assim que você copiar ou baixar, esta lista some e não pode ser exibida de novo.
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {novosCodigos.map((c) => (
                  <code key={c} className="text-xs font-mono text-center rounded-lg border border-border bg-muted/40 px-2 py-2">{c}</code>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <GhostBtn onClick={copiarEApagar}><Copy className="w-3.5 h-3.5" />Copiar e ocultar</GhostBtn>
                <GhostBtn onClick={baixarEApagar}><Download className="w-3.5 h-3.5" />Baixar .txt e ocultar</GhostBtn>
                <GhostBtn onClick={() => { setNovosCodigos(null); onToast("Códigos ocultados."); }}><EyeOff className="w-3.5 h-3.5" />Já anotei</GhostBtn>
              </div>
            </>
          )}
        </div>}



      {/* Proteções avançadas */}
      <div>
        <SectionHeader title="Proteções avançadas" desc="Camadas extras para blindar o acesso à conta e à sua equipe." />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SecurityRow
            icon={Globe} title="Proteção anti-bot (Cloudflare Turnstile)" tone="text-orange-600 bg-orange-500/10" badge="Admin"
            desc="O desafio depende das chaves e da validação no servidor. Salvar esta preferência não confirma a proteção dos formulários ou do login."
            disabled={securityState!=="ready"||!securityAdmin||securitySaving} on={adv.turnstile} onToggle={() => saveSec("turnstile_enabled", !adv.turnstile)}
          />
          <SecurityRow
            icon={ShieldAlert} title="Lista de IPs permitidos" tone="text-rose-600 bg-rose-500/10" badge="Admin"
            desc="Só permite acesso à conta a partir dos endereços de IP que você autorizar. Vale para computadores; celulares ficam de fora porque o IP muda o tempo todo."
            disabled={securityState!=="ready"||!securityAdmin||securitySaving} on={adv.ipAllowlist} onToggle={() => saveSec("ip_allowlist_enabled", !adv.ipAllowlist)}
          >
            <div className="space-y-3">
              {/* Central de IPs — terminal */}
              <div className="rounded-xl border border-border bg-[#0b1020] overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 font-mono text-[11px] text-white/60">ips-permitidos.conf</span>
                  </div>
                  <span className="font-mono text-[11px] text-white/50">
                    {ipList.length} {ipList.length === 1 ? "entrada" : "entradas"}
                  </span>
                </div>
                <textarea
                  value={ips}
                  onChange={(e) => setIps(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  placeholder={"# um por linha — IP ou faixa (CIDR)\n189.10.20.30\n200.150.10.0/24"}
                  className="w-full resize-y bg-transparent px-3 py-3 font-mono text-[13px] leading-6 text-emerald-300 placeholder:text-white/25 outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                  <span className="font-mono text-[11px] text-white/60">
                    seu IP agora: <span className="text-white">{myIp ?? "—"}</span>
                    {myIp && (myIpInList
                      ? <span className="ml-2 text-emerald-400">✓ na lista</span>
                      : <span className="ml-2 text-amber-400">⚠ fora da lista</span>)}
                  </span>
                  <div className="flex items-center gap-2">
                    {myIp && !myIpInList && (
                      <button
                        type="button"
                        onClick={() => setIps((v) => (v.trim() ? `${v.replace(/\s+$/, "")}\n${myIp}` : myIp))}
                        className="rounded-md border border-white/15 px-2.5 py-1 font-mono text-[11px] text-white/80 hover:bg-white/10"
                      >
                        + adicionar meu IP
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={saveIpList}
                      disabled={ipSaving||securityState!=="ready"||!securityAdmin||securitySaving}
                      className="rounded-md bg-emerald-500/90 px-3 py-1 font-mono text-[11px] font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {ipSaving ? "salvando…" : "salvar lista"}
                    </button>
                  </div>
                </div>
              </div>

              {ipInvalid.length > 0 && (
                <p className="text-xs text-destructive">
                  Endereço inválido: <span className="font-mono">{ipInvalid.slice(0, 3).join(", ")}</span>
                </p>
              )}

              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ipDesktopOnly}
                  onChange={(e) => setIpDesktopOnly(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Aplicar apenas em computadores (celular e tablet ficam liberados — o IP do 4G/5G muda o tempo todo).</span>
              </label>
              <p className="text-[11px] text-muted-foreground">
                Aceita IP único (189.10.20.30) e faixa em CIDR (200.150.10.0/24). Salve a lista antes de ativar a chave —
                o sistema não deixa ativar sem o seu IP dentro dela.
              </p>
            </div>
          </SecurityRow>

          <SecurityRow
            icon={BellRing} title="Alerta de novo acesso" tone="text-amber-600 bg-amber-500/10" badge="Admin"
            desc="Aviso imediato dentro do app quando alguém entra de um dispositivo ou local diferente. O acesso também fica registrado no histórico abaixo."
            disabled={securityState!=="ready"||!securityAdmin||securitySaving} on={adv.loginAlerts} onToggle={() => saveSec("login_alerts", !adv.loginAlerts)}
          />
          <SecurityRow
            icon={Monitor} title="Aprovação de novos dispositivos" tone="text-sky-600 bg-sky-500/10" badge="Admin"
            desc="Acesso de um aparelho novo ou de uma localização diferente da habitual só é liberado com o código que a RB Mídia envia no WhatsApp do titular."
            disabled={securityState!=="ready"||!securityAdmin||securitySaving} on={adv.deviceApproval} onToggle={() => saveSec("device_approval", !adv.deviceApproval)}
          />
          <SecurityRow
            icon={Users} title="Exigir 2FA de toda a equipe" tone="text-primary bg-primary/10" badge="Admin"
            desc="Cada membro do workspace precisa configurar dois fatores para continuar acessando."
            on={adv.forceTeam2fa} onToggle={() => saveSec("require_team_2fa", !adv.forceTeam2fa)}
          />
          <SecurityRow
            icon={LogOut} title="Encerrar sessão por inatividade" tone="text-amber-600 bg-amber-500/10"
            desc="Desconecta este navegador após o tempo parado. Bots, agentes e automações continuam rodando 24/7 no servidor."
            on={adv.autoLogout}
            onToggle={() => {
              const next = !adv.autoLogout;
              setAdv((s) => ({ ...s, autoLogout: next }));
              applyIdle(next, idleMin);
              onToast(next ? `Sessão encerra após ${idleMin} min parado.` : "Encerramento por inatividade desativado.");
            }}
          >
            <div className="w-44">
              <Field label="Tempo de inatividade (minutos)">
                <Inp
                  value={idleMin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setIdleMin(v);
                    applyIdle(adv.autoLogout, v);
                  }}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </SecurityRow>
          <SecurityRow
            icon={Lock} title="Bloquear senhas vazadas" tone="text-emerald-600 bg-emerald-500/10"
            desc="Depende da configuração do serviço de autenticação. Esta preferência não comprova o bloqueio de senhas vazadas."
            disabled={securityState!=="ready"||!securityAdmin||securitySaving} on={adv.hibp} onToggle={() => saveSec("block_leaked_passwords", !adv.hibp)}
          />
          <SecurityRow
            icon={Download} title="Confirmar exportação de dados" tone="text-violet-600 bg-violet-500/10" badge="Admin"
            desc="Exportar leads ou relatórios em massa exige confirmação antes de gerar o arquivo."
            disabled={securityState!=="ready"||!securityAdmin||securitySaving} on={adv.exportAlert} onToggle={() => saveSec("confirm_bulk_export", !adv.exportAlert)}
          />
        </div>
      </div>

      {/* Histórico de segurança */}
      <SecurityHistory onToast={onToast} />

      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          O autenticador usa o estado nativo da conta. As proteções gerais de acesso dependem de implementação e configuração próprias; salvar uma preferência não as ativa em toda a aplicação.
        </p>
      </div>
        </>
      ) : (
        <MaliciousAccessTab onToast={onToast} />
      )}
    </div>
  );
}

function MaliciousAccessTab({ onToast }: { onToast: (m: string, t?: "ok" | "err") => void }) {
  const eventsQ = useQuery({ 
    queryKey: ["security-events"], 
    queryFn: () => listSecurityEvents({}) 
  });
  
  const events = (eventsQ.data?.events ?? []) as any[];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Acessos Maliciosos" 
        desc="Detecção automática de comportamentos suspeitos e tentativas de invasão." 
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ameaças Bloqueadas</div>
          <div className="text-2xl font-bold tabular-nums">0</div>
          <div className="text-[10px] text-success mt-1">Ambiente seguro no momento</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Alertas de Login</div>
          <div className="text-2xl font-bold tabular-nums">{events.filter(e => e.severity === "warning").length}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Últimos 30 dias</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Sessões Ativas</div>
          <div className="text-2xl font-bold tabular-nums">1</div>
          <div className="text-[10px] text-muted-foreground mt-1">Seu dispositivo atual</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/40 flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de Eventos
          </div>
          <GhostBtn className="py-1 h-7 text-[11px]" onClick={() => eventsQ.refetch()}>
            <RefreshCw className={cn("w-3 h-3", eventsQ.isFetching && "animate-spin")} /> Atualizar
          </GhostBtn>
        </div>
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Data</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Origem / IP</TableHead>
                <TableHead className="text-right">Risco</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs">
                    Nenhum evento de segurança registrado.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{e.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{e.description}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.details?.ip ?? "Sistema"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] uppercase font-bold",
                          e.severity === "danger" ? "bg-destructive/10 text-destructive border-destructive/20" :
                          e.severity === "warning" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                          "bg-primary/10 text-primary border-primary/20"
                        )}
                      >
                        {e.severity === "danger" ? "Alto" : e.severity === "warning" ? "Médio" : "Baixo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Monitoramento em Tempo Real</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nosso sistema utiliza heurística e inteligência artificial para detectar padrões de "brute force", 
              sessões simultâneas em localizações distantes e vazamento de credenciais. 
              Qualquer anomalia será notificada imediatamente via E-mail e WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Sessões ---------- */

function relTime(iso?: string | null) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function SessoesTab({ onToast }: { onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const [showReset, setShowReset] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "minhas" | "online">("todas");

  const fnList = useServerFn(listSessions);
  const fnRevoke = useServerFn(revokeSession);
  const fnRevokeMine = useServerFn(revokeAllMySessions);

  const q = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => fnList({}) as any,
    refetchInterval: 60_000,
  });

  const mRevoke = useMutation({
    mutationFn: (id: string) => fnRevoke({ data: { id } }),
    onSuccess: () => { onToast("Sessão encerrada."); qc.invalidateQueries({ queryKey: ["user-sessions"] }); },
    onError: (e: any) => onToast(e.message ?? "Falha ao encerrar sessão.", "err"),
  });

  const isAdmin = !!q.data?.isAdmin;
  const all: any[] = q.data?.sessions ?? [];
  const meuDevice = typeof window !== "undefined" ? getDeviceKey() : "";
  const isOnline = (s: any) => Date.now() - new Date(s.last_seen_at).getTime() < 5 * 60 * 1000;

  const sessoes = all.filter((s) => {
    if (filtro === "minhas") return s.is_self;
    if (filtro === "online") return isOnline(s);
    return true;
  });
  const minhas = all.filter((s) => s.is_self);
  const online = all.filter(isOnline);
  const pessoasOnline = new Set(online.map((s) => s.user_id)).size;

  const logoutOutras = async () => {
    await fnRevokeMine({ data: { keep_device_key: meuDevice } });
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});
    onToast("Suas outras sessões foram encerradas.");
    qc.invalidateQueries({ queryKey: ["user-sessions"] });
  };
  const logoutAll = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) return onToast(error.message, "err");
    onToast("Sessões encerradas. Faça login novamente.");
    setTimeout(() => { window.location.href = "/auth"; }, 800);
  };
  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < 8) return onToast("Senha precisa ter no mínimo 8 caracteres.", "err");
    if (pw1 !== pw2) return onToast("As senhas não coincidem.", "err");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);
    if (error) return onToast(error.message, "err");
    onToast("Senha atualizada.");
    setPw1(""); setPw2(""); setShowReset(false);
  };

  const deviceIcon = (t?: string) => (t === "mobile" ? Smartphone : t === "tablet" ? Tablet : Monitor);

  return (
    <div>
      <SectionHeader
        title="Sessões ativas"
        desc={isAdmin
          ? "Você é administrador: acompanhe quem está online, em qual dispositivo e desde quando. Cada membro vê apenas as próprias sessões."
          : "Estes são os dispositivos conectados na sua conta. Encerre qualquer sessão que você não reconheça."}
      />

      {/* Resumo em linha única, formato relatório */}
      <div className="rounded-xl border border-border bg-card px-4 py-2.5 mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5 text-primary shrink-0" />
            <strong className="font-semibold">{isAdmin ? all.length : minhas.length}</strong>
            <span className="text-muted-foreground">{isAdmin ? "sessões da equipe" : "sessões suas"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
            <strong className="font-semibold">{online.length}</strong>
            <span className="text-muted-foreground">online agora</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <strong className="font-semibold">{isAdmin ? pessoasOnline : minhas.length}</strong>
            <span className="text-muted-foreground">{isAdmin ? "pessoas online" : "dispositivos"}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isAdmin && (
            <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/30">
              {([["todas", "Todas"], ["online", "Online"], ["minhas", "Minhas"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFiltro(id)}
                  className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${filtro === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" title="Atualizar" onClick={() => qc.invalidateQueries({ queryKey: ["user-sessions"] })}
            className="w-7 h-7 grid place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <Link to="/contas" search={{ trocar: true }} title="Trocar de conta"
            className="w-7 h-7 grid place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {isAdmin && (
        <div className="flex sm:hidden items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/30 mb-2 w-fit">
          {([["todas", "Todas"], ["online", "Online"], ["minhas", "Minhas"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFiltro(id)}
              className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${filtro === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">Carregando sessões…</div>
      ) : sessoes.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">Nenhuma sessão ativa encontrada.</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Cabeçalho do relatório (desktop) */}
          <div className="hidden lg:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Pessoa</span><span>Dispositivo</span><span>Entrou</span><span>Atividade</span><span className="w-6" />
          </div>
          <ul className="divide-y divide-border">
            {sessoes.map((s) => {
              const Icone = deviceIcon(s.device_type);
              const atual = s.is_self && s.device_key === meuDevice;
              const on = isOnline(s);
              return (
                <li key={s.id}
                  className={cn("grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-x-3 gap-y-1 items-center px-3 py-2 text-xs hover:bg-muted/30 transition-colors",
                    atual && "bg-primary/[0.04]")}>
                  {/* Pessoa */}
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", on ? "bg-success animate-pulse" : "bg-muted-foreground/40")}
                      title={on ? "Online" : "Inativa"} />
                    <Icone className={cn("w-3.5 h-3.5 shrink-0", on ? "text-success" : "text-muted-foreground")} />
                    <span className="truncate font-medium">{s.is_self ? "Você" : s.person?.name}</span>
                    {atual && <span className="shrink-0 text-[9px] font-semibold uppercase px-1.5 py-px rounded-full border border-primary/30 text-primary bg-primary/10">Atual</span>}
                  </div>
                  {/* Encerrar (mobile fica na 1ª linha, desktop na última coluna) */}
                  <div className="lg:order-5 flex justify-end shrink-0">
                    {(s.is_self || isAdmin) && !atual ? (
                      <button title="Encerrar sessão"
                        onClick={() => { if (confirm("Encerrar esta sessão?")) mRevoke.mutate(s.id); }}
                        className="w-6 h-6 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : <span className="w-6 h-6 block" />}
                  </div>
                  {/* Dispositivo */}
                  <div className="col-span-2 lg:col-span-1 min-w-0 truncate text-muted-foreground">
                    {[s.browser, s.os].filter(Boolean).join(" · ") || "Dispositivo desconhecido"}
                    {s.ip_address ? ` · ${s.ip_address}` : ""}
                  </div>
                  {/* Entrou */}
                  <div className="col-span-2 lg:col-span-1 min-w-0 truncate text-muted-foreground">
                    <span className="lg:hidden">Entrou </span>
                    {new Date(s.started_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {/* Atividade */}
                  <div className="col-span-2 lg:col-span-1 min-w-0 truncate text-muted-foreground">
                    {relTime(s.last_seen_at)}
                    {s.current_path ? <span className="hidden xl:inline"> · {s.current_path}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3">
        {!showReset ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Segurança da conta</span>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <GhostBtn onClick={() => setShowReset(true)}><Shield className="w-3.5 h-3.5" />Redefinir senha</GhostBtn>
              <GhostBtn onClick={logoutOutras}><Monitor className="w-3.5 h-3.5" />Sair dos outros</GhostBtn>
              <GhostBtn onClick={logoutAll} className="text-destructive border-destructive/40"><Trash2 className="w-3.5 h-3.5" />Encerrar todas</GhostBtn>
            </div>
          </div>
        ) : (
          <form onSubmit={submitPassword} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nova senha (mín. 8 caracteres)">
                <Inp type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} minLength={8} required autoFocus />
              </Field>
              <Field label="Confirmar nova senha">
                <Inp type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required />
              </Field>
            </div>
            <div className="flex gap-2">
              <Btn type="submit" loading={savingPw}><Shield className="w-3.5 h-3.5" />Salvar nova senha</Btn>
              <GhostBtn type="button" onClick={() => { setShowReset(false); setPw1(""); setPw2(""); }}>Cancelar</GhostBtn>
            </div>
          </form>
        )}
      </div>

      {!isAdmin && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Você vê apenas as sessões da sua própria conta. O dono da conta acompanha as sessões de toda a equipe.
        </p>
      )}
    </div>
  );
}

/* ---------- Notificações ---------- */

type NotifChannel = "platform" | "app" | "push" | "email" | "whatsapp";

/** Canais que aparecem na interface hoje. App e WhatsApp seguem ocultos até entrarem no ar. */
const VISIBLE_CHANNELS: NotifChannel[] = ["platform", "push", "email"];
/** Canais agrupáveis aceitam frequência de entrega própria. */
const DIGEST_CHANNELS: NotifChannel[] = ["email"];

const NOTIF_CHANNELS: { k: NotifChannel; label: string; short: string; icon: any; desc: string }[] = [
  { k: "platform", label: "Plataforma", short: "Web", icon: BellRing, desc: "Sino e central de avisos dentro do Vanessa Simoni." },
  { k: "app", label: "Aplicativo Vanessa Simoni", short: "App", icon: Smartphone, desc: "Central de avisos no app do celular." },
  { k: "push", label: "Push", short: "Push", icon: Zap, desc: "Alerta na tela do computador, mesmo com a aba em segundo plano." },
  { k: "email", label: "E-mail", short: "E-mail", icon: Mail, desc: "Enviado para o e-mail do seu perfil. Aceita agrupamento." },
  { k: "whatsapp", label: "WhatsApp", short: "Zap", icon: MessageSquare, desc: "Disparo no WhatsApp cadastrado." },
];

type NotifEvent = { k: string; label: string; desc: string; def: NotifChannel[] };
type NotifGroup = { k: string; label: string; icon: any; tone: string; events: NotifEvent[] };

const NOTIF_GROUPS: NotifGroup[] = [
  {
    k: "inbox", label: "Inbox e mensagens", icon: MessageSquare, tone: "text-emerald-600 bg-emerald-500/10",
    events: [
      { k: "inbox_new_message", label: "Nova mensagem de lead", desc: "Qualquer mensagem recebida no Inbox.", def: ["platform", "push"] },
      { k: "inbox_unanswered", label: "Conversa sem resposta", desc: "Lead aguardando resposta há mais de X minutos.", def: ["platform", "email", "push"] },
      { k: "inbox_assigned", label: "Conversa atribuída a você", desc: "Alguém transferiu um atendimento para você.", def: ["platform", "push"] },
      { k: "inbox_mention", label: "Menção em conversa", desc: "Quando alguém te marca em uma nota interna.", def: ["platform", "email"] },
      { k: "inbox_group", label: "Atividade em grupos de WhatsApp", desc: "Mensagens e eventos dos grupos monitorados.", def: ["platform"] },
      { k: "inbox_audio_call", label: "Ligações e áudios recebidos", desc: "Chamada perdida, áudio novo ou ligação registrada.", def: ["platform", "push"] },
      { k: "inbox_session_down", label: "Conexão de WhatsApp caiu", desc: "Sessão desconectada ou QR expirado.", def: ["platform", "email"] },
    ],
  },
  {
    k: "email", label: "E-mails", icon: Mail, tone: "text-sky-600 bg-sky-500/10",
    events: [
      { k: "email_received", label: "Novo e-mail recebido", desc: "E-mail entrando nas caixas conectadas.", def: ["platform", "push"] },
      { k: "email_reply", label: "Resposta de campanha", desc: "Lead respondeu um e-mail de campanha.", def: ["platform", "email"] },
      { k: "email_bounce", label: "Falha de entrega / bounce", desc: "E-mail rejeitado ou endereço suprimido.", def: ["platform", "email"] },
      { k: "email_unsub", label: "Descadastro (unsubscribe)", desc: "Alguém saiu da sua lista.", def: ["platform"] },
    ],
  },
  {
    k: "crm", label: "CRM e leads", icon: Users, tone: "text-primary bg-primary/10",
    events: [
      { k: "crm_new_lead", label: "Novo lead criado", desc: "Lead entrando por formulário, anúncio ou manual.", def: ["platform", "email", "push"] },
      { k: "crm_stage", label: "Lead mudou de etapa", desc: "Movimentação dentro do funil.", def: ["platform"] },
      { k: "crm_assigned", label: "Lead atribuído a você", desc: "Você virou responsável por um lead.", def: ["platform", "push"] },
      { k: "crm_stale", label: "Lead parado / esfriando", desc: "Sem interação há mais de X dias.", def: ["platform", "email"] },
      { k: "crm_won_lost", label: "Venda ganha ou perdida", desc: "Lead marcado como ganho ou perdido.", def: ["platform", "email"] },
      { k: "crm_form", label: "Formulário respondido", desc: "Submissão em formulários do CRM.", def: ["platform", "push"] },
    ],
  },
  {
    k: "workflow", label: "Fluxo de trabalho", icon: ListChecks, tone: "text-amber-600 bg-amber-500/10",
    events: [
      { k: "task_assigned", label: "Tarefa atribuída a você", desc: "Nova tarefa no seu nome.", def: ["platform", "email", "push"] },
      { k: "task_due", label: "Tarefa perto do prazo", desc: "Lembrete antes do vencimento.", def: ["platform", "push"] },
      { k: "task_overdue", label: "Tarefa atrasada", desc: "Prazo estourado, alerta vermelho.", def: ["platform", "email", "push"] },
      { k: "task_comment", label: "Comentário ou menção na tarefa", desc: "Alguém comentou ou te marcou.", def: ["platform", "push"] },
      { k: "task_moved", label: "Tarefa mudou de etapa", desc: "Movimentação no kanban de trabalho.", def: ["platform"] },
      { k: "task_gamification", label: "Funcionário do mês / pontuação", desc: "Ganho de XP, moedas e mudança de pódio.", def: ["platform"] },
    ],
  },
  {
    k: "social", label: "Social Media", icon: Instagram, tone: "text-pink-600 bg-pink-500/10",
    events: [
      { k: "social_approval", label: "Post aguardando aprovação", desc: "Conteúdo pronto esperando seu OK.", def: ["platform", "email"] },
      { k: "social_published", label: "Post publicado", desc: "Confirmação de publicação agendada.", def: ["platform"] },
      { k: "social_failed", label: "Falha ao publicar", desc: "Erro no agendamento ou token expirado.", def: ["platform", "email", "push"] },
      { k: "social_comment", label: "Comentário ou DM nas redes", desc: "Interações capturadas pelos bots sociais.", def: ["platform", "push"] },
      { k: "social_report", label: "Resumo de desempenho", desc: "Fechamento semanal dos posts.", def: ["email"] },
    ],
  },
  {
    k: "ads", label: "Tráfego pago e Meta", icon: BarChart3, tone: "text-violet-600 bg-violet-500/10",
    events: [
      { k: "ads_budget", label: "Orçamento consumido", desc: "Campanha atingiu limite de gasto.", def: ["platform", "email"] },
      { k: "ads_rule", label: "Regra de automação executada", desc: "Pausa, ativação ou ajuste automático.", def: ["platform", "email"] },
      { k: "ads_performance", label: "Queda de performance", desc: "CPL, CTR ou ROAS fora da meta.", def: ["platform", "email", "push"] },
      { k: "ads_rejected", label: "Anúncio reprovado", desc: "Reprovação de criativo pelo Meta.", def: ["platform", "email", "push"] },
      { k: "ads_account", label: "Problema na conta de anúncio", desc: "Pagamento, limite ou conta desativada.", def: ["platform", "email"] },
    ],
  },
  {
    k: "automation", label: "Automações e agentes IA", icon: Bot, tone: "text-cyan-600 bg-cyan-500/10",
    events: [
      { k: "auto_bot_error", label: "Erro em salesbot / fluxo", desc: "Bloco falhou ou fluxo travou.", def: ["platform", "email"] },
      { k: "auto_agent_action", label: "Ação sugerida pelo agente IA", desc: "Agente pediu aprovação para agir.", def: ["platform", "push"] },
      { k: "auto_agent_report", label: "Relatório do agente de CRM", desc: "Resumo periódico das ações da IA.", def: ["platform", "email"] },
      { k: "auto_webhook", label: "Webhook n8n / Make falhou", desc: "Integração externa retornou erro.", def: ["platform", "email"] },
      { k: "auto_integration", label: "Integração desconectada", desc: "Token expirado em Meta, Google ou Evolution.", def: ["platform", "email"] },
    ],
  },
  {
    k: "billing", label: "Faturamento e conta", icon: ShoppingCart, tone: "text-orange-600 bg-orange-500/10",
    events: [
      { k: "billing_invoice", label: "Fatura gerada ou paga", desc: "Cobranças da assinatura Vanessa Simoni.", def: ["platform", "email"] },
      { k: "billing_failed", label: "Pagamento recusado", desc: "Falha no cartão ou assinatura vencida.", def: ["platform", "email"] },
      { k: "billing_limit", label: "Limite operacional atingido", desc: "Usuários, números ou disparos exigem revisão da configuração.", def: ["platform", "email"] },
      { k: "billing_trial", label: "Fim do período de teste", desc: "Aviso de encerramento do teste gratuito.", def: ["platform", "email"] },
    ],
  },
  {
    k: "platform", label: "Plataforma e segurança", icon: Shield, tone: "text-rose-600 bg-rose-500/10",
    events: [
      { k: "sec_new_login", label: "Novo acesso à conta", desc: "Login em dispositivo desconhecido.", def: ["platform", "email", "push"] },
      { k: "sec_member", label: "Movimentação de equipe", desc: "Convite aceito, membro removido ou cargo alterado.", def: ["platform", "email"] },
      { k: "sec_permission", label: "Permissões alteradas", desc: "Mudanças de acesso a módulos.", def: ["platform"] },
      { k: "plat_news", label: "Novidades e atualizações", desc: "Novos recursos e melhorias do Vanessa Simoni.", def: ["platform", "email"] },
      { k: "plat_maintenance", label: "Manutenção e instabilidade", desc: "Avisos de status do sistema.", def: ["platform", "email"] },
    ],
  },
];

type DigestFreq = "instant" | "hourly" | "daily" | "weekly";

const DIGEST_OPTIONS: { id: DigestFreq; label: string; hint: string }[] = [
  { id: "instant", label: "Na hora", hint: "Um aviso por evento, assim que acontece." },
  { id: "hourly", label: "A cada hora", hint: "Junta tudo da última hora em um aviso só." },
  { id: "daily", label: "1x por dia", hint: "Um resumo diário com o que aconteceu." },
  { id: "weekly", label: "1x por semana", hint: "Um fechamento por semana." },
];

type NotifMatrix = Record<string, Record<NotifChannel, boolean>>;

function defaultMatrix(): NotifMatrix {
  const m: NotifMatrix = {};
  for (const g of NOTIF_GROUPS) {
    for (const e of g.events) {
      m[e.k] = {
        platform: e.def.includes("platform"),
        app: false,
        push: e.def.includes("push"),
        email: e.def.includes("email"),
        whatsapp: false,
      };
    }
  }
  return m;
}

function Toggle({ on, onClick, size = "md" }: { on: boolean; onClick: () => void; size?: "sm" | "md" }) {
  const w = size === "sm" ? "w-8 h-[18px]" : "w-9 h-5";
  const dot = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const pos = size === "sm" ? (on ? "left-[16px]" : "left-0.5") : on ? "left-[18px]" : "left-0.5";
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      className={cn("relative rounded-full transition-colors shrink-0", w, on ? "bg-primary" : "bg-muted")}>
      <span className={cn("absolute top-0.5 rounded-full bg-background border border-border transition-all", dot, pos)} />
    </button>
  );
}

function NotificacoesTab({ prefs, onToast }: { prefs?: any; onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const saveLegacy = useServerFn(updateNotificationPrefs);
  const loadSettings = useServerFn(getNotificationSettings);
  const saveSettings = useServerFn(saveNotificationSettings);

  const remote = useQuery({ queryKey: ["notification-settings"], queryFn: () => loadSettings({}) });
  const engines = (remote.data as any)?.engines ?? { platform: true, push: true, email: true };

  const [channels, setChannels] = useState<Record<NotifChannel, boolean>>({
    platform: prefs?.platform ?? true,
    app: false,
    push: true,
    email: prefs?.email ?? true,
    whatsapp: false,
  });
  const [matrix, setMatrix] = useState<NotifMatrix>(() => defaultMatrix());
  const [open, setOpen] = useState<Record<string, boolean>>({ inbox: true });
  const [busca, setBusca] = useState("");
  const [digest, setDigest] = useState<Record<string, DigestFreq>>({ email: "daily" });
  const [quiet, setQuiet] = useState({ enabled: false, start: "22:00", end: "07:00", weekends: false, urgent: true });
  const [sound, setSound] = useState(true);
  const [pushPerm, setPushPerm] = useState<string>("default");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPushPerm(Notification.permission);
  }, []);

  // Carrega o que está salvo no servidor.
  useEffect(() => {
    const s = (remote.data as any)?.settings;
    if (remote.isLoading) return;
    if (s) {
      if (s.matrix && Object.keys(s.matrix).length) setMatrix({ ...defaultMatrix(), ...s.matrix });
      if (s.channels) setChannels((c) => ({ ...c, ...s.channels, app: false, whatsapp: false }));
      if (s.digest) setDigest((d) => ({ ...d, ...s.digest }));
      if (s.quiet && typeof s.quiet.enabled === "boolean") setQuiet((q) => ({ ...q, ...s.quiet }));
      if (typeof s.sound === "boolean") setSound(s.sound);
      if (s.updated_at) setSavedAt(s.updated_at);
    }
    setHydrated(true);
  }, [remote.data, remote.isLoading]);

  const mut = useMutation({
    mutationFn: async () => {
      await saveSettings({ data: { channels, matrix, digest, quiet, sound } });
      await saveLegacy({ data: { email: channels.email, whatsapp: false, platform: channels.platform, commercial: true } });
      return true;
    },
    onSuccess: () => {
      setSavedAt(new Date().toISOString());
      qc.invalidateQueries({ queryKey: ["settings-bundle"] });
    },
    onError: (e: any) => onToast(e.message, "err"),
  });

  // Salvamento automático e discreto.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => mut.mutate(), 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, matrix, digest, quiet, sound, hydrated]);

  const pedirPush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      onToast("Este navegador não suporta alertas push.", "err");
      return;
    }
    const p = await Notification.requestPermission();
    setPushPerm(p);
    if (p === "granted") {
      new Notification("Vanessa Simoni", { body: "Pronto! Os alertas push estão liberados neste dispositivo." });
      setChannels((c) => ({ ...c, push: true }));
    } else {
      onToast("Você bloqueou os alertas no navegador.", "err");
    }
  };

  const testar = (ch: NotifChannel) => {
    if (ch === "push") {
      if (pushPerm !== "granted") { pedirPush(); return; }
      new Notification("Vanessa Simoni · teste", { body: "É assim que um alerta push vai aparecer pra você." });
      return;
    }
    if (ch === "platform") { onToast("Teste enviado para o sino da plataforma."); return; }
    onToast("Teste de e-mail enviado para o endereço do seu perfil.");
  };

  const toggleCell = (ev: string, ch: NotifChannel) =>
    setMatrix((m) => ({ ...m, [ev]: { ...m[ev], [ch]: !m[ev]?.[ch] } }));

  const setGroup = (g: NotifGroup, value: boolean) =>
    setMatrix((m) => {
      const next = { ...m };
      for (const e of g.events) {
        const row = { ...(next[e.k] ?? { platform: false, app: false, push: false, email: false, whatsapp: false }) };
        for (const c of VISIBLE_CHANNELS) row[c] = value;
        next[e.k] = row;
      }
      return next;
    });

  const channelCount = (ch: NotifChannel) => Object.values(matrix).filter((r) => r?.[ch]).length;

  const totalOn = useMemo(
    () => Object.values(matrix).filter((r) => r && VISIBLE_CHANNELS.some((c) => r[c])).length,
    [matrix],
  );
  const totalEvents = useMemo(() => NOTIF_GROUPS.reduce((a, g) => a + g.events.length, 0), []);

  const term = busca.trim().toLowerCase();
  const groups = NOTIF_GROUPS.map((g) => ({
    ...g,
    events: term ? g.events.filter((e) => (e.label + " " + e.desc).toLowerCase().includes(term)) : g.events,
  })).filter((g) => g.events.length > 0);

  const savedLabel = savedAt
    ? `Salvo ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "";

  const visiveis = NOTIF_CHANNELS.filter((c) => VISIBLE_CHANNELS.includes(c.k));

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Notificações"
          desc="Passo 1: ligue por onde quer ser avisado. Passo 2: escolha de quanto em quanto tempo cada canal entrega. Passo 3: marque quais eventos disparam o aviso."
        />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-1">
          {mut.isPending ? "salvando…" : savedLabel}
        </span>
      </div>

      {/* Passo 1 — canais */}
      <StepTitle n={1} title="Por onde você recebe" hint="Desligar um canal aqui silencia esse canal em todos os eventos." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {visiveis.map((c) => {
          const on = channels[c.k];
          const motorOk = (engines as any)[c.k] !== false;
          const pushBloqueado = c.k === "push" && pushPerm !== "granted";
          return (
            <div key={c.k}
              className={cn("rounded-xl border p-4 flex flex-col", on && motorOk ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card")}>
              <div className="flex items-start justify-between gap-2">
                <div className={cn("w-9 h-9 rounded-lg grid place-items-center", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <c.icon className="w-[18px] h-[18px]" />
                </div>
                <Toggle on={on} onClick={() => setChannels((s) => ({ ...s, [c.k]: !s[c.k] }))} />
              </div>
              <div className="text-sm font-semibold mt-2.5">{c.label}</div>
              <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 flex-1">{c.desc}</div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5",
                  !on ? "bg-muted text-muted-foreground"
                    : pushBloqueado ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600")}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {!on ? "Desligado" : pushBloqueado ? "Falta liberar no navegador" : "Entregando"}
                </span>
                {pushBloqueado && on ? (
                  <button type="button" onClick={pedirPush} className="text-[11px] font-medium text-primary hover:underline">Liberar</button>
                ) : (
                  <button type="button" disabled={!on} onClick={() => testar(c.k)}
                    className="text-[11px] font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline">Testar</button>
                )}
              </div>

              <div className="mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground">
                {channelCount(c.k)} evento(s) marcados neste canal
              </div>
            </div>
          );
        })}
      </div>

      {/* Passo 2 — frequência */}
      <StepTitle n={2} title="Frequência de entrega" hint="Plataforma e push são sempre na hora. Só o e-mail pode ser agrupado." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
            <BellRing className="w-3.5 h-3.5" /> Plataforma
            <Zap className="w-3.5 h-3.5" /> Push
            <span className="ml-auto font-medium text-foreground">Sempre na hora</span>
          </div>

          {DIGEST_CHANNELS.map((ch) => {
            const meta = NOTIF_CHANNELS.find((c) => c.k === ch)!;
            const ligado = channels[ch];
            return (
              <div key={ch} className={cn("transition-opacity", ligado ? "" : "opacity-50 pointer-events-none")}>
                <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                  <meta.icon className="w-3.5 h-3.5 text-muted-foreground" />{meta.label}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIGEST_OPTIONS.map((o) => (
                    <button key={o.id} type="button" title={o.hint}
                      onClick={() => setDigest((d) => ({ ...d, [ch]: o.id }))}
                      className={cn("text-xs rounded-lg border px-2 py-2 font-medium transition-colors",
                        digest[ch] === o.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {DIGEST_OPTIONS.find((o) => o.id === (digest[ch] ?? "daily"))?.hint}
                </p>
              </div>
            );
          })}

          <div className="mt-3 pt-3 border-t border-border/70 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Som e alerta visual</div>
                <div className="text-[11px] text-muted-foreground truncate">Toca um som e pisca o sino na plataforma.</div>
              </div>
            </div>
            <Toggle on={sound} onClick={() => setSound((v) => !v)} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg grid place-items-center bg-indigo-500/10 text-indigo-500"><Moon className="w-4 h-4" /></div>
              <div>
                <div className="text-sm font-semibold">Não perturbe</div>
                <div className="text-[11px] text-muted-foreground">Segura os avisos fora do horário definido.</div>
              </div>
            </div>
            <Toggle on={quiet.enabled} onClick={() => setQuiet((q) => ({ ...q, enabled: !q.enabled }))} />
          </div>
          <div className={cn("space-y-3 transition-opacity", quiet.enabled ? "opacity-100" : "opacity-50 pointer-events-none")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Silenciar a partir de">
                <Inp type="time" value={quiet.start} onChange={(e) => setQuiet((q) => ({ ...q, start: e.target.value }))} />
              </Field>
              <Field label="Voltar a avisar às">
                <Inp type="time" value={quiet.end} onChange={(e) => setQuiet((q) => ({ ...q, end: e.target.value }))} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">Silenciar também nos fins de semana</div>
              <Toggle on={quiet.weekends} onClick={() => setQuiet((q) => ({ ...q, weekends: !q.weekends }))} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">Deixar passar avisos urgentes (pagamento, conexão caiu)</div>
              <Toggle on={quiet.urgent} onClick={() => setQuiet((q) => ({ ...q, urgent: !q.urgent }))} size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Passo 3 — eventos */}
      <StepTitle n={3} title="O que te avisa" hint={`${totalOn} de ${totalEvents} eventos com pelo menos um canal ativo.`} />
      <div className="flex flex-wrap items-center justify-end gap-2 -mt-1 mb-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar evento..."
            className="h-8 w-52 rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary" />
        </div>
        <GhostBtn onClick={() => setOpen(Object.fromEntries(NOTIF_GROUPS.map((g) => [g.k, true])))}>
          <Filter className="w-3.5 h-3.5" />Abrir tudo
        </GhostBtn>
        <GhostBtn onClick={() => setMatrix(defaultMatrix())}>
          <RefreshCw className="w-3.5 h-3.5" />Padrão
        </GhostBtn>
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const aberto = !!open[g.k] || !!term;
          const ativos = g.events.filter((e) => matrix[e.k] && VISIBLE_CHANNELS.some((c) => matrix[e.k][c])).length;
          return (
            <div key={g.k} className="rounded-xl border border-border bg-card overflow-hidden">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.k]: !aberto }))}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                <div className={cn("w-9 h-9 rounded-lg grid place-items-center shrink-0", g.tone)}><g.icon className="w-[18px] h-[18px]" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{g.label}</div>
                  <div className="text-[11px] text-muted-foreground">{ativos} de {g.events.length} eventos ativos</div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", aberto && "rotate-180")} />
              </button>

              {aberto && (
                <div className="border-t border-border">
                  <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <div className="flex-1">Evento</div>
                    {visiveis.map((c) => <div key={c.k} className="w-[74px] text-center">{c.label}</div>)}
                  </div>
                  <ul className="divide-y divide-border">
                    {g.events.map((e) => (
                      <li key={e.k} className="px-4 py-2.5 flex flex-col md:flex-row md:items-center gap-2 hover:bg-muted/20">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{e.label}</div>
                          <div className="text-[11px] text-muted-foreground">{e.desc}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {visiveis.map((c) => {
                            const on = !!matrix[e.k]?.[c.k];
                            const disabled = !channels[c.k];
                            return (
                              <button key={c.k} type="button" disabled={disabled} onClick={() => toggleCell(e.k, c.k)}
                                title={disabled ? `${c.label} está desligado no passo 1` : `${c.label}: ${on ? "ativo" : "desativado"}`}
                                className={cn("w-[74px] h-8 rounded-lg border grid place-items-center transition-colors",
                                  disabled ? "border-dashed border-border text-muted-foreground/40 cursor-not-allowed"
                                    : on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                                <span className="md:hidden text-[10px] font-semibold mr-1">{c.label}</span>
                                {on && !disabled ? <Check className="w-4 h-4" /> : <span className="w-2 h-2 rounded-full bg-current opacity-40" />}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="px-4 py-2.5 bg-muted/20 border-t border-border flex flex-wrap gap-2 justify-end">
                    <GhostBtn onClick={() => setGroup(g, true)}><BellRing className="w-3.5 h-3.5" />Ativar todos</GhostBtn>
                    <GhostBtn onClick={() => setGroup(g, false)}><Moon className="w-3.5 h-3.5" />Silenciar grupo</GhostBtn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-3 flex items-start gap-2">
        <Megaphone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          Tudo aqui salva sozinho na sua conta, então você vê a mesma configuração em qualquer computador.
          Aplicativo do celular e WhatsApp entram como canais assim que forem liberados.
        </p>
      </div>
    </div>
  );
}

function StepTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-3">
      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold grid place-items-center shrink-0">{n}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight">{title}</div>
        <div className="text-[11px] text-muted-foreground leading-tight">{hint}</div>
      </div>
    </div>
  );
}

/* ---------- Preferências ---------- */

function PreferenciasTab({ bundle, onToast }: { bundle: any; onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const [state, setState] = useState(() => readPreferences());
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => { setState(readPreferences()); }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const workspaceId: string | undefined = bundle?.workspace?.id;
  const canManageRegionalSettings = !!bundle?.canManageRegionalSettings;
  const workspaceTimezone =
    typeof bundle?.workspace?.business_hours?.timezone === "string" && bundle.workspace.business_hours.timezone
      ? bundle.workspace.business_hours.timezone
      : "America/Sao_Paulo";

  useEffect(() => {
    setState((prev) => ({ ...prev, fusoHorario: workspaceTimezone }));
  }, [workspaceTimezone]);

  const fnGetCur = useServerFn(getWorkspaceDefaultCurrency);
  const fnSetRegional = useServerFn(setWorkspaceRegionalSettings);
  const curQ = useQuery({
    queryKey: ["workspace-default-currency", workspaceId],
    queryFn: () => fnGetCur({ data: {} }),
    staleTime: 60_000,
  });
  const workspaceCurrency = curQ.data?.currency ?? bundle?.workspace?.default_currency ?? "BRL";
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const selectedCurrency = pendingCurrency ?? workspaceCurrency;

  const currencyDirty = !!pendingCurrency && pendingCurrency !== workspaceCurrency;
  const timezoneDirty = state.fusoHorario !== workspaceTimezone;
  const regionalDirty = currencyDirty || timezoneDirty;

  const saveMut = useMutation({
    mutationFn: async () => {
      if (regionalDirty && !canManageRegionalSettings) {
        throw new Error("Sua conta não tem permissão administrativa para alterar moeda ou fuso.");
      }

      if (regionalDirty) {
        await fnSetRegional({
          data: {
            currency: selectedCurrency,
            timezone: state.fusoHorario,
          },
        });
      }

      writePreferences(state);
      return { regionalDirty };
    },
    onSuccess: async ({ regionalDirty: changed }) => {
      setPendingCurrency(null);
      if (changed) {
        await syncWorkspaceCurrencyCache().catch(() => {});
        await qc.invalidateQueries({ queryKey: ["settings-bundle"] });
        await curQ.refetch();
      }
      onToast("Preferências salvas.");
    },
    onError: (e: any) => {
      onToast(e?.message ?? "Falha ao salvar as preferências da conta.", "err");
    },
  });

  let dataPreview = "-";
  let horaPreview = "-";
  let numeroPreview = "-";
  let moedaPreview = "-";
  try {
    dataPreview = new Intl.DateTimeFormat(state.idioma, {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      timeZone: state.fusoHorario,
    }).format(now);
    horaPreview = new Intl.DateTimeFormat(state.idioma, {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: state.fusoHorario, hour12: false,
    }).format(now);
    numeroPreview = new Intl.NumberFormat(state.idioma).format(1234567.89);
    moedaPreview = new Intl.NumberFormat(state.idioma, {
      style: "currency",
      currency: selectedCurrency || "BRL",
    }).format(12345.67);
  } catch { /* ignore */ }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Preferências"
        desc="Idioma, fuso horário, moeda e aparência da conta — tudo em um lugar só, com prévia ao vivo."
      />

      <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border/60 bg-gradient-to-br from-primary/[0.06] via-muted/30 to-transparent flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Idioma, fuso e moeda</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Idioma vale só para você. Fuso e moeda valem para toda a conta{bundle?.workspace?.name ? ` ${bundle.workspace.name}` : ""}.
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] px-2 py-1 rounded-md border border-border bg-background font-medium">{state.idioma}</span>
            <span className="text-[11px] px-2 py-1 rounded-md border border-border bg-background font-medium">{selectedCurrency}</span>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
          <div className="space-y-4">
            <Field label="Idioma" hint="Define o formato de datas e números (25/12/2025 ou 12/25/2025).">
              <select
                value={state.idioma}
                onChange={(e) => setState({ ...state, idioma: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {LANGUAGE_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Field>

            <Field label="Fuso horário da conta" hint="Aplicado às automações, horários operacionais e datas exibidas.">
              <select
                value={state.fusoHorario}
                onChange={(e) => setState({ ...state, fusoHorario: e.target.value })}
                disabled={!canManageRegionalSettings}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {TIMEZONE_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.zones.map((z) => {
                      const off = getTimeZoneOffsetLabel(z.value);
                      return <option key={z.value} value={z.value}>{z.label}{off ? ` (${off})` : ""}</option>;
                    })}
                  </optgroup>
                ))}
              </select>
            </Field>

            <Field label="Moeda da conta">
              <div className="relative">
                <select
                  value={selectedCurrency}
                  onChange={(e) => setPendingCurrency(e.target.value)}
                  disabled={!canManageRegionalSettings || curQ.isLoading}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {CURRENCY_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.currencies.map((currency) => (
                        <option key={currency.value} value={currency.value}>{currency.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {currencyDirty && (
                <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-amber-600">
                  <AlertCircle className="w-3 h-3" /> Mudança de moeda pendente. Salve para aplicar em toda a conta.
                </span>
              )}
              {timezoneDirty && (
                <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-amber-600">
                  <AlertCircle className="w-3 h-3" /> Mudança de fuso pendente. Salve para aplicar em toda a conta.
                </span>
              )}
            </Field>
          </div>

          <div className="rounded-xl border border-border bg-gradient-to-br from-muted/40 via-background to-background p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500/60 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
              </span>
              <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">PRÉVIA AO VIVO</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agora, no fuso da conta</div>
              <div className="text-2xl font-semibold font-mono tabular-nums leading-tight mt-1">{horaPreview}</div>
              <div className="text-xs text-muted-foreground capitalize truncate">{dataPreview}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PrefPreview label="Número" value={numeroPreview} mono />
              <PrefPreview label="Moeda" value={moedaPreview} mono />
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              É assim que o fuso e a moeda da conta serão usados pela operação e pelos relatórios.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border/60 bg-gradient-to-br from-muted/40 to-transparent flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Aparência</div>
            <div className="text-xs text-muted-foreground mt-0.5">Aplicado na hora, sem precisar salvar. Vale só para você.</div>
          </div>
        </div>
        <div className="p-5">
          <ThemeChooser embedded />
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 px-1">
        <div className="rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="text-[11px] text-muted-foreground">
            {regionalDirty ? (
              <>Alterações regionais pendentes para a conta.</>
            ) : (
              <span className="text-transparent">.</span>
            )}
          </div>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Btn onClick={() => saveMut.mutate()} loading={saveMut.isPending}>Salvar preferências</Btn>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-center">
                Idioma, fuso e moeda são salvos juntos.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

function PrefPreview({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium mt-0.5 truncate", mono && "font-mono tabular-nums")}>{value}</div>
    </div>
  );
}

/* ---------- Expediente ---------- */

const DIAS_SEMANA = [
  { idx: 0, label: "Domingo", short: "Dom" },
  { idx: 1, label: "Segunda-feira", short: "Seg" },
  { idx: 2, label: "Terça-feira", short: "Ter" },
  { idx: 3, label: "Quarta-feira", short: "Qua" },
  { idx: 4, label: "Quinta-feira", short: "Qui" },
  { idx: 5, label: "Sexta-feira", short: "Sex" },
  { idx: 6, label: "Sábado", short: "Sáb" },
];

type BHDay = { enabled: boolean; start: string; end: string };
type BusinessHours = { timezone: string; days: BHDay[] };

const DEFAULT_BH: BusinessHours = {
  timezone: "America/Sao_Paulo",
  days: [
    { enabled: false, start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: false, start: "09:00", end: "13:00" },
  ],
};

function normalizeBH(input: any): BusinessHours {
  const src = input && typeof input === "object" ? input : {};
  const days = Array.isArray(src.days) && src.days.length === 7 ? src.days : DEFAULT_BH.days;
  return {
    timezone: typeof src.timezone === "string" && src.timezone ? src.timezone : DEFAULT_BH.timezone,
    days: days.map((d: any, i: number) => ({
      enabled: !!(d?.enabled ?? DEFAULT_BH.days[i].enabled),
      start: typeof d?.start === "string" ? d.start : DEFAULT_BH.days[i].start,
      end: typeof d?.end === "string" ? d.end : DEFAULT_BH.days[i].end,
    })),
  };
}

function ExpedienteTab({ workspace, canManage, onToast }: { workspace: any; canManage: boolean; onToast: (m: string, t?: "ok" | "err") => void }) {
  const qc = useQueryClient();
  const save = useServerFn(updateBusinessHours);
  const [bh, setBh] = useState<BusinessHours>(() => normalizeBH(workspace?.business_hours));

  useEffect(() => {
    setBh(normalizeBH(workspace?.business_hours));
  }, [workspace?.business_hours]);

  const mut = useMutation({
    mutationFn: () => save({ data: bh }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-bundle"] });
      onToast("Expediente salvo.");
    },
    onError: (e: any) => onToast(e.message ?? "Falha ao salvar expediente.", "err"),
  });

  const setDay = (i: number, patch: Partial<BHDay>) => {
    setBh((prev) => ({ ...prev, days: prev.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  };
  const copyToAll = () => {
    const base = bh.days.find((d) => d.enabled) ?? bh.days[1];
    setBh((prev) => ({
      ...prev,
      days: prev.days.map((d) => ({ ...d, start: base.start, end: base.end })),
    }));
  };
  const applyPreset = (kind: "comercial" | "24-7" | "seg-sex") => {
    if (kind === "comercial") {
      setBh((prev) => ({
        ...prev,
        days: prev.days.map((d, i) => ({
          enabled: i >= 1 && i <= 5,
          start: "09:00",
          end: "18:00",
        })),
      }));
    } else if (kind === "24-7") {
      setBh((prev) => ({
        ...prev,
        days: prev.days.map(() => ({ enabled: true, start: "00:00", end: "23:59" })),
      }));
    } else if (kind === "seg-sex") {
      setBh((prev) => ({
        ...prev,
        days: prev.days.map((d, i) => ({
          enabled: i >= 1 && i <= 5,
          start: d.start,
          end: d.end,
        })),
      }));
    }
  };

  const toMin = (t: string) => {
    const [h, m] = (t ?? "00:00").split(":").map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  const diasAbertos = bh.days.filter((d) => d.enabled).length;
  const horasSemana = bh.days.reduce((acc, d) => acc + (d.enabled ? Math.max(0, toMin(d.end) - toMin(d.start)) : 0), 0) / 60;
  const agoraTz = (() => {
    try {
      return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: bh.timezone }).format(new Date());
    } catch { return "--:--"; }
  })();

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <SectionHeader
        title="Horário de expediente"
        desc="Usado por automações e bots para saber quando é 'dentro' ou 'fora do expediente'. Cada dia da semana é configurável."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">Fuso horário</span>
            <span className="ml-auto text-[11px] text-muted-foreground font-mono tabular-nums">agora {agoraTz}</span>
          </div>
          <select
            value={bh.timezone}
            onChange={(e) => setBh({ ...bh, timezone: e.target.value })}
            disabled={!canManage}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {TIMEZONE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.zones.map((z) => {
                  const off = getTimeZoneOffsetLabel(z.value);
                  return <option key={z.value} value={z.value}>{z.label}{off ? ` (${off})` : ""}</option>;
                })}
              </optgroup>
            ))}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1.5">Base para calcular o “horário atual” nas automações.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xl font-semibold leading-none">{diasAbertos}<span className="text-xs text-muted-foreground font-normal">/7</span></div>
            <div className="text-[11px] text-muted-foreground mt-1">Dias abertos</div>
          </div>
          <div className="w-px self-stretch bg-border" />
          <div className="flex-1">
            <div className="text-xl font-semibold leading-none">{horasSemana.toFixed(0)}<span className="text-xs text-muted-foreground font-normal">h</span></div>
            <div className="text-[11px] text-muted-foreground mt-1">Por semana</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Modelos rápidos</span>
        {([
          { id: "comercial", icon: Sun, label: "Comercial 9-18" },
          { id: "seg-sex", icon: CalendarDays, label: "Só dias úteis" },
          { id: "24-7", icon: Zap, label: "24/7" },
        ] as const).map((p) => (
          <button key={p.id} type="button" onClick={() => applyPreset(p.id)} disabled={!canManage}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50">
            <p.icon className="w-3.5 h-3.5 text-primary" />{p.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 bg-muted/30">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Dias da semana</div>
          <button type="button" onClick={copyToAll} disabled={!canManage}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
            <Copy className="w-3 h-3" />Aplicar mesmo horário em todos
          </button>
        </div>
        <ul className="divide-y divide-border">
          {DIAS_SEMANA.map((dia) => {
            const d = bh.days[dia.idx];
            const left = (toMin(d.start) / 1440) * 100;
            const width = Math.max(0, (toMin(d.end) - toMin(d.start)) / 1440) * 100;
            return (
              <li key={dia.idx} className={cn("px-4 sm:px-5 py-3 transition-colors", d.enabled ? "bg-transparent" : "bg-muted/20")}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => canManage && setDay(dia.idx, { enabled: !d.enabled })}
                    disabled={!canManage}
                    className="flex min-w-0 items-center gap-3 text-left disabled:cursor-not-allowed sm:min-w-[220px]"
                  >
                    <span className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                      d.enabled ? "bg-primary" : "bg-muted-foreground/30",
                    )}>
                      <span className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all",
                        d.enabled ? "left-[1.125rem]" : "left-0.5",
                      )} />
                    </span>
                    <span className={cn(
                      "grid h-7 w-9 shrink-0 place-items-center rounded-md text-[10px] font-bold uppercase",
                      d.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}>{dia.short}</span>
                    <span className={cn("truncate text-sm font-medium", !d.enabled && "text-muted-foreground")}>
                      {dia.label}
                    </span>
                  </button>

                  {d.enabled ? (
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        value={d.start}
                        onChange={(e) => setDay(dia.idx, { start: e.target.value })}
                        disabled={!canManage}
                        className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="text-[11px] text-muted-foreground">até</span>
                      <input
                        type="time"
                        value={d.end}
                        onChange={(e) => setDay(dia.idx, { end: e.target.value })}
                        disabled={!canManage}
                        className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">Fechado</span>
                  )}

                  <div className="col-span-2 sm:ml-auto sm:max-w-[220px] w-full">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      {d.enabled && (
                        <div className="h-full rounded-full bg-primary/70" style={{ marginLeft: `${left}%`, width: `${width}%` }} />
                      )}
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                      <span>00h</span><span>12h</span><span>24h</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 rounded-lg bg-muted/40 p-3">
        Este horário é usado pelos blocos de automação como <strong>“Até começar o expediente”</strong>, <strong>“Até acabar o expediente”</strong>, <strong>“Exceto durante o expediente”</strong> e <strong>“Exceto fora do expediente”</strong>.
      </p>
      {!canManage && <p className="text-[11px] text-muted-foreground mt-2">Sua conta não tem permissão administrativa para editar o expediente.</p>}

      <div className="mt-5 flex justify-end border-t border-border pt-4">
        <Btn type="submit" loading={mut.isPending} disabled={!canManage}>Salvar expediente</Btn>
      </div>
    </form>
  );
}

/* ---------- Histórico de segurança ---------- */

const EVENT_STYLE: Record<string, { icon: any; ok: boolean }> = {
  login: { icon: Check, ok: true },
  new_device: { icon: Monitor, ok: false },
  logout: { icon: LogOut, ok: true },
  session_expired: { icon: LogOut, ok: true },
  password_changed: { icon: Shield, ok: true },
  recovery_codes: { icon: Key, ok: true },
  settings: { icon: ShieldAlert, ok: true },
  ip_blocked: { icon: AlertCircle, ok: false },
  device_code_sent: { icon: MessageSquare, ok: true },
  device_code_failed: { icon: AlertCircle, ok: false },
  device_approved: { icon: Monitor, ok: true },
  export: { icon: Download, ok: true },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora mesmo";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const mo = Math.round(d / 30);
  return `há ${mo} ${mo === 1 ? "mês" : "meses"}`;
}

function SecurityHistory({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  const fnList = useServerFn(listSecurityEvents);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(false);

  const load = useCallback(async (limit: number) => {
    setLoading(true);
    try {
      const r: any = await fnList({ data: { limit } });
      setEvents(r?.events ?? []);
    } catch {
      setEvents([]);
    }
    setLoading(false);
  }, [fnList]);

  useEffect(() => { void load(full ? 200 : 8); }, [load, full]);

  const exportCsv = () => {
    const rows = [["Data", "Evento", "Detalhe", "Usuário", "IP", "Local"]].concat(
      events.map((e) => [
        new Date(e.created_at).toLocaleString("pt-BR"),
        e.title ?? "",
        (e.description ?? "").replace(/[\n;]/g, " "),
        e.actor_name ?? "",
        e.ip ?? "",
        e.region ?? "",
      ]),
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-seguranca-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast("Histórico exportado.");
  };

  return (
    <div>
      <SectionHeader title="Histórico de segurança" desc="Registro real dos eventos sensíveis da conta: acessos, novos aparelhos, bloqueios e mudanças de configuração." />
      <ul className="rounded-xl border border-border bg-card divide-y divide-border max-h-[420px] overflow-auto">
        {loading && <li className="px-4 py-6 text-sm text-muted-foreground text-center">Carregando histórico…</li>}
        {!loading && events.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground text-center">
            Nenhum evento registrado ainda. Os próximos acessos e alterações aparecem aqui.
          </li>
        )}
        {events.map((e) => {
          const st = EVENT_STYLE[e.type] ?? { icon: Shield, ok: e.severity !== "danger" };
          const ok = e.severity === "danger" ? false : e.severity === "warn" ? false : st.ok;
          const Icon = st.icon;
          return (
            <li key={e.id} className="px-4 py-3 flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-lg grid place-items-center shrink-0",
                e.severity === "danger" ? "bg-destructive/10 text-destructive"
                  : e.severity === "warn" ? "bg-amber-500/10 text-amber-600"
                  : ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{e.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[e.description, e.actor_name, e.ip ? `IP ${e.ip}` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap" title={new Date(e.created_at).toLocaleString("pt-BR")}>
                {timeAgo(e.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <GhostBtn onClick={() => void load(full ? 200 : 8)}><History className="w-3.5 h-3.5" />Atualizar</GhostBtn>
        <GhostBtn onClick={() => setFull((v) => !v)}>
          <History className="w-3.5 h-3.5" />{full ? "Mostrar recentes" : "Ver histórico completo"}
        </GhostBtn>
        <GhostBtn onClick={exportCsv}><Download className="w-3.5 h-3.5" />Exportar CSV</GhostBtn>
      </div>
    </div>
  );
}


/* ---------- Verificação em duas etapas (2FA) ---------- */

function TwoFactorSection({ onToast: _onToast }: { onToast: (m: string, t?: "ok" | "err") => void }) {
  return <SlimMfaSettings />;
}

/* ---------- Chave de segurança / Passkey (WebAuthn real) ---------- */

function PasskeyRow({
  onToast, onChanged, enabled,
}: { onToast: (m: string, t?: "ok" | "err") => void; onChanged: () => void; enabled: boolean }) {
  const fnList = useServerFn(listPasskeys);
  const fnStart = useServerFn(startPasskeyRegistration);
  const fnFinish = useServerFn(finishPasskeyRegistration);
  const fnAuthStart = useServerFn(startPasskeyAuthentication);
  const fnAuthFinish = useServerFn(finishPasskeyAuthentication);
  const fnDel = useServerFn(deletePasskey);

  const q = useQuery({ queryKey: ["passkeys"], queryFn: () => fnList({}) as any });
  const keys = (q.data ?? []) as any[];
  const [busy, setBusy] = useState(false);
  const [suportado, setSuportado] = useState(true);

  useEffect(() => {
    setSuportado(typeof window !== "undefined" && !!(window as any).PublicKeyCredential);
  }, []);

  const recarregar = () => { q.refetch(); onChanged(); };

  const cadastrar = async () => {
    if (!suportado) return onToast("Este navegador não trabalha com chave de segurança.", "err");
    setBusy(true);
    try {
      const s: any = await fnStart({});
      if (!s?.ok) throw new Error(s?.error ?? "Não consegui iniciar o cadastro.");
      const { startRegistration } = await import("@simplewebauthn/browser");
      const resp = await startRegistration({ optionsJSON: s.options });
      const apelido = `${navigator.platform || "Dispositivo"} • ${new Date().toLocaleDateString("pt-BR")}`;
      const f: any = await fnFinish({ data: { response: resp, nickname: apelido } });
      if (!f?.ok) throw new Error(f?.error ?? "Não consegui salvar a chave.");
      recarregar();
      onToast("Chave de segurança cadastrada. Agora dá para entrar com digital, Face ID ou Windows Hello.");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      onToast(/NotAllowed|abort/i.test(msg) ? "Cadastro cancelado no aparelho." : msg, "err");
    } finally { setBusy(false); }
  };

  const testar = async () => {
    setBusy(true);
    try {
      const s: any = await fnAuthStart({});
      if (!s?.ok) throw new Error(s?.error ?? "Não consegui iniciar o teste.");
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const resp = await startAuthentication({ optionsJSON: s.options });
      const f: any = await fnAuthFinish({ data: { response: resp } });
      if (!f?.ok) throw new Error(f?.error ?? "Chave não reconhecida.");
      recarregar();
      onToast("Tudo certo — a chave respondeu e foi reconhecida.");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      onToast(/NotAllowed|abort/i.test(msg) ? "Teste cancelado no aparelho." : msg, "err");
    } finally { setBusy(false); }
  };

  const remover = async (id: string) => {
    const r: any = await fnDel({ data: { id } });
    if (!r?.ok) return onToast(r?.error ?? "Não consegui remover.", "err");
    recarregar();
    onToast("Chave removida.");
  };

  return (
    <SecurityRow
      icon={Fingerprint} title="Chave de segurança / Passkey" tone="text-cyan-600 bg-cyan-500/10"
      badge={keys.length > 0 ? `${keys.length} cadastrada(s)` : undefined}
      desc="Entrar com digital, Face ID, Windows Hello ou chave física (YubiKey), sem digitar código nenhum. A chave nunca sai do aparelho e só funciona no endereço verdadeiro do Vanessa Simoni — por isso não cai em golpe de link falso."
      on={enabled && keys.length > 0}
      onToggle={() => (keys.length > 0 ? onToast("Para desligar, remova as chaves cadastradas abaixo.") : void cadastrar())}
    >
      <div className="space-y-3">
        {!suportado && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
            Este navegador não trabalha com chave de segurança. Use Chrome, Edge, Safari ou Firefox atualizados.
          </div>
        )}
        {keys.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2">
                <Fingerprint className="w-4 h-4 text-cyan-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{k.nickname || "Chave de segurança"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Criada em {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                    {k.lastUsedAt ? ` • usada em ${new Date(k.lastUsedAt).toLocaleDateString("pt-BR")}` : " • nunca usada"}
                    {k.backedUp ? " • sincronizada entre seus aparelhos" : " • presa a este aparelho"}
                  </div>
                </div>
                <button
                  onClick={() => void remover(k.id)}
                  className="text-[11px] text-destructive hover:underline shrink-0"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Btn type="button" loading={busy} onClick={() => void cadastrar()}>
            <KeyRound className="w-3.5 h-3.5" />{keys.length > 0 ? "Cadastrar outro aparelho" : "Cadastrar este aparelho"}
          </Btn>
          {keys.length > 0 && (
            <GhostBtn onClick={() => void testar()} disabled={busy}><Check className="w-3.5 h-3.5" />Testar chave</GhostBtn>
          )}
        </div>
      </div>
    </SecurityRow>
  );
}

// SLIM_SETTINGS_CONTINUATION_V1
