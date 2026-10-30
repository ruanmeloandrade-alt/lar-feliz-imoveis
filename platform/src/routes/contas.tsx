import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  LogOut,
  Plus,
  Handshake,
  MessageCircle,
  Building2,
  Search,
  X,
  Send,
  BriefcaseBusiness,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMyAccounts, switchAccount, type AccountItem } from "@/lib/accounts.functions";
import { getPlatformSupportContact } from "@/lib/platform-support.functions";
import { loadPartnerProgramAccess } from "@/lib/partner-program-access";
import type { PartnerProgramDestination } from "@/lib/partner-program-entry";
import logoAsset from "@/assets/mkton-logo.png.asset.json";

export const Route = createFileRoute("/contas")({
  ssr: false,
  head: () => ({ meta: [{ title: "Selecione uma conta · Vanessa Simoni" }, { name: "description", content: "Escolha qual conta ou área Vanessa Simoni você quer acessar agora." }] }),
  component: ContasPage,
});

const STATUS_LABEL: Record<AccountItem["status"], string> = { ativo: "Ativo", teste: "Teste", expirado: "Expirado", sem_plano: "Sem plano" };
const STATUS_CLASS: Record<AccountItem["status"], string> = { ativo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", teste: "bg-amber-500/15 text-amber-600 dark:text-amber-400", expirado: "bg-destructive/10 text-destructive", sem_plano: "bg-muted text-muted-foreground" };

function mergeProgramDestinations(primary: PartnerProgramDestination[], fallback: PartnerProgramDestination[]) {
  const merged = new Map<PartnerProgramDestination["role"], PartnerProgramDestination>();
  for (const destination of fallback) merged.set(destination.role, destination);
  for (const destination of primary) merged.set(destination.role, destination);
  return Array.from(merged.values()).sort((a, b) => a.role.localeCompare(b.role));
}

function ContasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listMyAccounts);
  const doSwitch = useServerFn(switchAccount);
  const fetchSupportContact = useServerFn(getPlatformSupportContact);
  const [query, setQuery] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const { data, isLoading, error } = useQuery({ queryKey: ["my-accounts"], queryFn: () => fetchAccounts() });
  const { data: supportContact } = useQuery({
    queryKey: ["platform-support-contact"],
    queryFn: () => fetchSupportContact(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const { data: clientProgramAccess } = useQuery({
    queryKey: ["partner-program-contas-access"],
    queryFn: loadPartnerProgramAccess,
    staleTime: 60_000,
    retry: false,
  });
  const switching = useMutation({
    mutationFn: (workspaceId: string) => doSwitch({ data: { workspaceId } }),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      // Troca de workspace é uma mudança de contexto global. Um reload completo
      // impede que caches/estados do workspace anterior vazem para a nova conta.
      window.location.assign("/home");
    },
  });
  const accounts = data?.accounts ?? [];
  const currentWorkspaceId = data?.current_workspace_id ?? null;
  const destinations = useMemo(
    () => mergeProgramDestinations(
      (data?.program_destinations ?? []) as PartnerProgramDestination[],
      clientProgramAccess?.destinations ?? [],
    ),
    [data?.program_destinations, clientProgramAccess?.destinations],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? accounts.filter((account) => account.name.toLowerCase().includes(q)) : accounts;
  }, [accounts, query]);
  const firstName = useMemo(() => {
    const name = (data?.profile as any)?.display_name || (data?.profile as any)?.full_name || "";
    if (name) return String(name).split(" ")[0];
    const email = data?.email ?? "";
    return email ? email.split("@")[0] : "";
  }, [data]);
  const isProgramAdmin = data?.is_program_admin === true || clientProgramAccess?.isAdmin === true;
  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth" }); }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="flex items-center justify-between border-b border-border px-6 py-4"><img src={logoAsset.url} alt="Vanessa Simoni" className="h-7 w-auto" /><button type="button" onClick={() => void signOut()} className="text-sm font-medium text-muted-foreground hover:text-destructive">Sair</button></header>
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-12 md:grid-cols-[260px_1fr]">
      <aside className="h-fit rounded-2xl bg-muted/50 p-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">{(firstName || "M").slice(0,1).toUpperCase()}</div>
        <p className="mt-4 break-all text-xs text-muted-foreground">{data?.email ?? ""}</p>
        {isProgramAdmin ? <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary"><ShieldCheck className="h-3 w-3" /> Super admin</div> : null}
        <div className="mt-6 space-y-3 text-sm">
          {isProgramAdmin ? <Link to="/partners/admin" className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground"><ShieldCheck className="h-4 w-4" /> Central Partners</Link> : null}
          <Link to="/configuracoes" hash="faturamento" className="flex items-center justify-center gap-2 text-foreground transition-colors hover:text-primary"><Plus className="h-4 w-4" /> Criar outra conta</Link>
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center justify-center gap-2 text-foreground transition-colors hover:text-destructive"><LogOut className="h-4 w-4" /> Sair</button>
        </div>
      </aside>

      <section>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Bem-vindo de volta{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Escolha onde você quer entrar. A Vanessa Simoni não vai mais avançar automaticamente.</p>
        {destinations.length > 0 ? <div className="mt-7"><h2 className="text-lg font-semibold">Áreas do programa</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{destinations.map((destination) => { const affiliate = destination.role === "affiliate"; return <Link key={destination.role} to={destination.href as any} search={destination.status === "admin_preview" ? ({ preview: "admin" } as any) : undefined} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{affiliate ? <Handshake className="h-5 w-5" /> : <BriefcaseBusiness className="h-5 w-5" />}</div><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><p className="mt-4 font-semibold">{affiliate ? "Área de Afiliado" : "Área de Partner"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{destination.status === "approved" ? "Cadastro aprovado. Divulgação e recursos comerciais liberados." : destination.status === "pending" ? "Você já pode acessar. Divulgação ficará disponível após aprovação." : "Pré-visualização administrativa da experiência deste perfil."}</p></Link>; })}</div></div> : null}

        <div className="mt-8 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Suas contas</h2><span className="text-xs text-muted-foreground">{accounts.length} {accounts.length === 1 ? "conta" : "contas"}</span></div>
        {accounts.length > 6 ? <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conta" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div> : null}
        <div className="mt-4 max-h-[52vh] space-y-1 overflow-y-auto pr-1">
          {isLoading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">Carregando suas contas...</div> : null}
          {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">Não foi possível carregar suas contas. As áreas de Afiliado/Partner continuam disponíveis acima quando seu vínculo puder ser confirmado.</div> : null}
          {!isLoading && accounts.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center"><Building2 className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Você ainda não faz parte de nenhuma conta.</p><Link to="/configuracoes" hash="faturamento" className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Criar minha conta</Link></div> : null}
          {filtered.map((account) => { const active = account.id === currentWorkspaceId; return <button key={account.id} type="button" disabled={switching.isPending} onClick={() => switching.mutate(account.id)} className={`group flex w-full items-center gap-4 rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-60 ${active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted"}`}><span className={`w-20 shrink-0 rounded-full px-2 py-1 text-center text-[11px] font-medium ${STATUS_CLASS[account.status]}`}>{STATUS_LABEL[account.status]}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 truncate text-sm font-medium">{account.name}{active ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Atual</span> : null}</span><span className="block truncate text-[11px] text-muted-foreground">{account.is_owner ? "Dono" : account.is_partner || account.role_type === "partner" ? "Acesso técnico Partner" : account.role === "admin" ? "Administrador" : "Acesso de equipe"}{account.plan_name ? ` · ${account.plan_name}` : ""}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>; })}
        </div>
        {switching.isError ? <p className="mt-3 text-xs text-destructive">Não foi possível abrir esta conta. Tente novamente.</p> : null}
      </section>
    </div>
    <SupportChat open={chatOpen} onOpenChange={setChatOpen} whatsapp={supportContact?.whatsapp ?? null} />
  </main>;
}

function SupportChat({ open, onOpenChange, whatsapp }: { open: boolean; onOpenChange: (value: boolean) => void; whatsapp: string | null }) {
  const [message, setMessage] = useState("");
  if (!whatsapp) return null;
  function sendToSupport() {
    const text = message.trim();
    if (!text) return;
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setMessage("");
    onOpenChange(false);
  }
  return <>{open ? <div className="fixed bottom-24 left-6 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-sm font-semibold">Falar com o suporte</p><p className="text-[11px] text-muted-foreground">Atendimento humano da Vanessa Simoni</p></div><button type="button" onClick={() => onOpenChange(false)} aria-label="Fechar suporte"><X className="h-4 w-4" /></button></div><div className="space-y-3 p-4"><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} placeholder="Conte o que está acontecendo e um atendente responde." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /><button type="button" onClick={sendToSupport} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Send className="h-4 w-4" /> Enviar para o suporte</button></div></div> : null}<button type="button" onClick={() => onOpenChange(!open)} aria-label="Falar com o suporte" className="fixed bottom-6 left-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"><MessageCircle className="h-5 w-5" /></button></>;
}
