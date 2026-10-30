import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
 Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, FileText, Copy, ExternalLink, Trash2, Pencil, GripVertical, Palette, Loader2, Globe, Search, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
 listForms,
 upsertForm,
 deleteForm,
 uploadFormLogo,
 buildFormPublicUrl,
 buildFormShareUrl,
 buildFormShareUrlWithWorkspace,
 buildFormIngestUrl,
 rotateFormIngestToken,
 normalizeSlug,
 isValidSlug,
 FORM_PUBLIC_PREFIX,
 CURRENCY_SYMBOL,
 type FormRecord,
 type FormField,
 type FormFieldKind,
 type FormFileMode,
 type FormCurrency,
 type FormBranding,
 type FormOrigem,
} from "@/lib/forms.functions";
import { listMetaLeadForms, type MetaLeadForm } from "@/lib/meta-forms.functions";
import {
 listConnectedSites,
 scanSiteForms,
 importSiteForm,
 removeConnectedSite,
 type ConnectedSite,
} from "@/lib/site-forms.functions";
import type { SiteScanResult, DetectedForm } from "@/lib/site-forms.server";

import { getActiveWorkspace } from "@/lib/workspace.functions";



export const Route = createFileRoute("/crm/formularios")({
 head: () => ({
  meta: [
   { title: "Formulários · CRM · Vanessa Simoni" },
   { name: "description", content: "Central de formulários do CRM: crie, edite, personalize a identidade visual e envie para seus leads." },
  ],
 }),
 component: FormulariosPage,
});

function FormulariosPage() {
 const list = useServerFn(listForms);
 const save = useServerFn(upsertForm);
 const remove = useServerFn(deleteForm);
 const qc = useQueryClient();

 const q = useQuery<FormRecord[]>({
  queryKey: ["forms-list"],
  queryFn: () => list({}) as Promise<FormRecord[]>,
 });
 const forms: FormRecord[] = q.data ?? [];
 const activeWs = useServerFn(getActiveWorkspace);
 const wsQ = useQuery({
  queryKey: ["active-workspace"],
  queryFn: () => activeWs(),
  staleTime: 5 * 60_000,
 });
 const wsSlug = wsQ.data?.slug ?? "";

 const [editing, setEditing] = useState<FormRecord | null>(null);
 const [createError, setCreateError] = useState<string | null>(null);
 const [query, setQuery] = useState("");

 const filtered = useMemo(
  () => forms.filter((f) => f.nome.toLowerCase().includes(query.toLowerCase())),
  [forms, query],
 );

 const createMut = useMutation({
  mutationFn: () => save({
   data: {
    nome: "Novo formulário",
    campos: [{ id: `c${Date.now()}`, label: "Nome", kind: "text", required: true }],
    branding: {},
   },
  }),
  onSuccess: async (created) => {
   // Abrir o editor do formulário efetivamente salvo, sem clique extra.
   const refreshed = await list({}) as FormRecord[];
   qc.setQueryData(["forms-list"], refreshed);
   const newForm = refreshed.find((form) => form.id === created.id);
   if (newForm) setEditing(newForm);
   else setCreateError("Formulário criado. Atualize a lista para editar.");
  },
  onError: (err) => {
   setCreateError(err instanceof Error ? err.message : "Não foi possível criar o formulário.");
  },
 });

 const deleteMut = useMutation({
  mutationFn: (id: string) => remove({ data: { id } }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["forms-list"] }),
 });

 

 return (
  <div className="flex h-screen bg-background">
   <AppSidebar />
   <main className="flex-1 flex flex-col overflow-hidden">
    <header className="px-6 py-4 border-b border-border flex items-center justify-between">
     <div>
      <h1 className="text-lg font-semibold">Formulários</h1>
      <p className="text-xs text-muted-foreground">
       Central de formulários do CRM, crie, personalize a identidade visual e envie para o lead.{" "}
       <a href="/blog/central-de-formularios-Vanessa Simoni" target="_blank" rel="noreferrer" className="text-primary hover:underline">
        Tutorial completo →
       </a>
      </p>
     </div>
     <div className="flex flex-col items-end gap-1.5">
      <Button
       type="button"
       size="sm"
       className="relative z-10 shrink-0 !bg-zinc-900 !text-white shadow-md hover:!bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500 dark:!bg-white dark:!text-zinc-950 dark:hover:!bg-zinc-200"
       onClick={() => { setCreateError(null); createMut.mutate(); }}
       disabled={createMut.isPending}
      >
       {createMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Novo formulário
      </Button>
      {createError && <p role="alert" className="max-w-xs text-right text-xs text-destructive">{createError}</p>}
     </div>
    </header>
    <div className="p-6 space-y-4 overflow-y-auto">
     <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome…" className="max-w-sm h-9" />

     {q.isLoading ? (
      <div className="text-center py-16 text-sm text-muted-foreground">Carregando…</div>
     ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
       {filtered.map((f) => {
        const publicUrl = wsSlug ? buildFormShareUrlWithWorkspace(wsSlug, f.slug) : buildFormShareUrl(f.slug);
        return (
         <div key={f.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between">
           <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
             <div className="text-sm font-semibold truncate">{f.nome}</div>
             {f.descricao && <div className="text-[11px] text-muted-foreground truncate">{f.descricao}</div>}
            </div>
           </div>
           <Badge variant="secondary" className="text-[10px]">{f.campos.length} campos</Badge>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
           <span className="truncate flex-1">{publicUrl}</span>
           <button onClick={() => navigator.clipboard.writeText(publicUrl)} title="Copiar link" className="hover:text-primary"><Copy className="w-3.5 h-3.5" /></button>
           <a href={publicUrl} target="_blank" rel="noreferrer" className="hover:text-primary"><ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
          <div className="flex items-center gap-1 pt-1">
           <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(f)}>
            <Pencil className="w-3 h-3 mr-1" /> Editar
           </Button>
           <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive"
            onClick={() => {
             if (confirm(`Apagar o formulário "${f.nome}"?`)) deleteMut.mutate(f.id);
            }}
           >
            <Trash2 className="w-3 h-3" />
           </Button>
          </div>
         </div>
        );
       })}
       {filtered.length === 0 && !q.isLoading && (
        <div className="col-span-full text-center py-16 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
         Nenhum formulário. Clique em <strong>Novo formulário</strong>.
        </div>
       )}
      </div>
     )}
    </div>
   </main>


   {editing && (
    <FormEditor
     form={editing}
     onClose={() => setEditing(null)}
     onSaved={() => {
      qc.invalidateQueries({ queryKey: ["forms-list"] });
      setEditing(null);
     }}
    />
   )}
  </div>
 );
}

function SiteImportDialog({
 open,
 onOpenChange,
 onImported,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 onImported: () => void;
}) {
 const listSites = useServerFn(listConnectedSites);
 const scan = useServerFn(scanSiteForms);
 const importFn = useServerFn(importSiteForm);
 const removeSite = useServerFn(removeConnectedSite);
 const qcSites = useQueryClient();


 const [url, setUrl] = useState("");
 const [result, setResult] = useState<SiteScanResult | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [picked, setPicked] = useState<number | null>(null);
 const [nome, setNome] = useState("");
 const [done, setDone] = useState<{ token: string | null } | null>(null);

 const sitesQ = useQuery<{ sites: ConnectedSite[] }>({
  queryKey: ["connected-sites"],
  queryFn: () => listSites() as Promise<{ sites: ConnectedSite[] }>,
  enabled: open,
  staleTime: 60_000,
 });
 const removeMut = useMutation({
  mutationFn: (siteId: string) => removeSite({ data: { siteId } }),
  onSuccess: () => qcSites.invalidateQueries({ queryKey: ["connected-sites"] }),
  onError: (e: any) => setError(e?.message ?? "Falha ao remover o site."),
 });


 const scanMut = useMutation({
  mutationFn: (u: string) => scan({ data: { url: u } }) as Promise<SiteScanResult>,
  onMutate: () => { setError(null); setResult(null); setPicked(null); setDone(null); },
  onSuccess: (r) => {
   setResult(r);
   if (r.forms.length > 0) {
    setPicked(0);
    setNome(r.forms[0].nome || `Formulário do site`);
   }
  },
  onError: (e: any) => setError(e?.message ?? "Não foi possível ler o site."),
 });

 const selected: DetectedForm | null =
  result && picked !== null ? result.forms.find((f) => f.index === picked) ?? null : null;

 const DEFAULT_FIELDS = [
  { name: "nome", label: "Nome", kind: "text" as const, required: true },
  { name: "email", label: "E-mail", kind: "email" as const, required: true },
  { name: "telefone", label: "WhatsApp", kind: "phone" as const, required: false },
  { name: "mensagem", label: "Mensagem", kind: "text" as const, required: false },
 ];

 const importMut = useMutation({
  mutationFn: async (manual?: boolean) => {
   if (!result) throw new Error("Leia uma página primeiro.");
   const campos = manual
    ? DEFAULT_FIELDS
    : (() => {
      if (!selected) throw new Error("Escolha um formulário.");
      return selected.fields.map((f) => ({
       name: f.name,
       label: f.label,
       kind: f.kind,
       required: f.required,
       options: f.options,
      }));
     })();
   return (await importFn({
    data: {
     nome: nome.trim() || (manual ? "Formulário do site (manual)" : "Formulário do site"),
     siteUrl: result.url,
     campos,
    },
   })) as { ingestToken: string | null };
  },
  onSuccess: (r) => setDone({ token: r.ingestToken }),
  onError: (e: any) => setError(e?.message ?? "Falha ao importar."),
 });


 function reset() {
  setUrl(""); setResult(null); setError(null); setPicked(null); setNome(""); setDone(null);
 }

 return (
  <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
   <DialogContent className="max-w-2xl">
    <DialogHeader>
     <DialogTitle className="flex items-center gap-2 text-base">
      <Globe className="w-4 h-4 text-primary" /> Puxar formulário do meu site
     </DialogTitle>
    </DialogHeader>

    {done ? (
     <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-success">
       <CheckCircle2 className="w-4 h-4" /> Formulário importado com sucesso.
      </div>
      {done.token && (
       <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">
         Cole este endereço no envio do formulário do site para as respostas caírem no CRM:
        </div>
        <div className="flex items-center gap-2">
         <Input readOnly value={buildFormIngestUrl(done.token)} className="h-8 text-[11px]" />
         <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => navigator.clipboard.writeText(buildFormIngestUrl(done.token!))}>
          <Copy className="w-3 h-3" /> Copiar
         </Button>
        </div>
        <div className="text-[10px] text-muted-foreground">
         O código completo de instalação fica em Editar → Origem &amp; integração.
        </div>
       </div>
      )}
      <div className="flex justify-end">
       <Button size="sm" onClick={onImported}>Concluir</Button>
      </div>
     </div>
    ) : (
     <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
       Informe o endereço da página onde o formulário aparece. A Vanessa Simoni lê a página e traz
       os campos automaticamente, sem precisar cadastrar nada à mão.
      </p>

      {(sitesQ.data?.sites?.length ?? 0) > 0 && (
       <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">
         Atalhos, domínios cadastrados em Tracking → Fontes (cadastrar não conecta nada;
         a conexão só existe depois de instalar o pixel ou criar o formulário)
        </div>
        <div className="flex flex-wrap gap-1.5">
         {sitesQ.data!.sites.map((s) => (
          <div
           key={s.id}
           className="flex items-center gap-1 text-[11px] pl-2 pr-1 py-1 rounded border border-border hover:border-primary/50 transition-colors"
          >
           <button type="button" onClick={() => setUrl(`https://${s.domain}`)}>
            {s.name} <span className="text-muted-foreground">· {s.domain}</span>
           </button>
           <span
            className={`text-[10px] px-1 rounded ${s.verified ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
           >
            {s.verified ? "verificado" : "não verificado"}
           </span>

           <button
            type="button"
            title="Remover site"
            disabled={removeMut.isPending}
            onClick={() => removeMut.mutate(s.id)}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive"
           >
            <Trash2 className="w-3 h-3" />
           </button>
          </div>
         ))}
        </div>
       </div>
      )}


      <div className="flex items-center gap-2">
       <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://meusite.com.br/contato"
        className="h-9 text-xs"
        maxLength={2000}
        onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) scanMut.mutate(url); }}
       />
       <Button size="sm" className="h-9 gap-1" disabled={!url.trim() || scanMut.isPending} onClick={() => scanMut.mutate(url)}>
        {scanMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        Ler página
       </Button>
      </div>

      {error && <div className="text-[11px] text-destructive">{error}</div>}

      {result && result.pages.length > 1 && (
       <div className="rounded-md border border-border/70 bg-muted/30 p-2 text-[10px] text-muted-foreground space-y-0.5">
        <div className="font-medium text-[10px] uppercase tracking-wider">Páginas verificadas</div>
        {result.pages.map((p) => (
         <div key={p.url} className="flex items-center justify-between gap-2">
          <span className="truncate">{p.url}</span>
          <span className="shrink-0">
           {p.ok ? `${p.forms} formulário(s)` : p.note ?? "falhou"}
          </span>
         </div>
        ))}
       </div>
      )}

      {result && result.forms.length === 0 && (
       <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground space-y-2">
        <div>
         Nenhum formulário em HTML foi encontrado, nem na página informada, nem nas
         páginas internas de contato/cadastro.
        </div>
        {result.spa && (
         <div>
          Este site é uma aplicação JavaScript (React/Next e afins): o formulário só existe
          depois que a página carrega no navegador, então ele não aparece no HTML puro.
         </div>
        )}
        {result.embeds.length > 0 && (
         <div>O formulário está embutido via {result.embeds.join(", ")} (iframe de outra plataforma).</div>
        )}
        {result.hints.length > 0 && <div>Plataforma detectada: {result.hints.join(", ")}.</div>}
        <div className="text-foreground">
         Solução: crie o formulário aqui com os campos padrão e use o <strong>endpoint de
         integração</strong> gerado, basta o seu site enviar as respostas para esse endereço
         (ou usar o script pronto em <strong>Origem &amp; integração</strong>). Funciona com
         qualquer plataforma: site próprio, WordPress, Typeform, Google Forms via Zapier/n8n.
        </div>
        <div className="flex items-center gap-2 pt-1">
         <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do formulário no CRM"
          className="h-8 text-xs"
          maxLength={120}
         />
         <Button size="sm" className="h-8 shrink-0" disabled={importMut.isPending} onClick={() => importMut.mutate(true)}>
          {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
          Criar e gerar endpoint
         </Button>
        </div>
       </div>
      )}

      {result && result.forms.length > 0 && (
       <div className="space-y-3">
        <div className="text-[11px] text-muted-foreground">
         {result.forms.length} formulário(s) encontrado(s) em {result.title ?? result.url}
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
         {result.forms.map((f) => (
          <button
           key={f.index}
           type="button"
           onClick={() => { setPicked(f.index); setNome(f.nome || "Formulário do site"); }}
           className={cn(
            "w-full text-left rounded-md border p-2.5 transition-colors",
            picked === f.index ? "border-primary bg-primary/[0.06]" : "border-border hover:border-primary/40",
           )}
          >
           <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold truncate">{f.nome}</div>
            <div className="flex items-center gap-1 shrink-0">
             {f.inferred && <Badge variant="outline" className="text-[10px]">detectado no site</Badge>}
             <Badge variant="secondary" className="text-[10px]">{f.fields.length} campos</Badge>
            </div>
           </div>
           <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{f.pageUrl}</div>
           {f.note && <div className="text-[10px] text-muted-foreground mt-0.5">{f.note}</div>}
           <div className="text-[10px] text-muted-foreground mt-1 truncate">
            {f.fields.map((c) => c.label).join(" · ")}
           </div>

          </button>
         ))}
        </div>

        {selected && (
         <div className="space-y-2 border-t border-border pt-3">
          <div>
           <label className="text-[11px] text-muted-foreground">Nome no CRM</label>
           <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-8 text-xs" maxLength={120} />
          </div>
          <div className="flex justify-end">
           <Button size="sm" disabled={importMut.isPending} onClick={() => importMut.mutate(false)}>

            {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Importar formulário
           </Button>
          </div>
         </div>
        )}
       </div>
      )}
     </div>
    )}
   </DialogContent>
  </Dialog>
 );
}

function FormEditor({ form, onClose, onSaved }: { form: FormRecord; onClose: () => void; onSaved: () => void }) {
 const [draft, setDraft] = useState<FormRecord>(form);
 const [tab, setTab] = useState<"campos" | "identidade" | "origem">("campos");
 const [slugError, setSlugError] = useState<string | null>(null);
 const [savedAt, setSavedAt] = useState<Date | null>(null);
 const save = useServerFn(upsertForm);
 const activeWs = useServerFn(getActiveWorkspace);
 const wsQ = useQuery({
  queryKey: ["active-workspace"],
  queryFn: () => activeWs(),
  staleTime: 5 * 60_000,
 });
 const wsSlug = wsQ.data?.slug ?? "";

 const payload = useMemo(() => ({
  id: draft.id,
  nome: draft.nome,
  descricao: draft.descricao,
  slug: draft.slug || undefined,
  campos: draft.campos,
  branding: draft.branding,
  origem: draft.origem,
  metaFormId: draft.metaFormId ?? null,
  metaPageId: draft.metaPageId ?? null,
  autoCriarLead: draft.autoCriarLead,
 }), [draft]);

 const saveMut = useMutation({
  mutationFn: () => save({ data: payload }),
  onSuccess: () => onSaved(),
  onError: (e) => setSlugError(e instanceof Error ? e.message : String(e)),
 });

 // ---- Auto save (debounce) ----
 const [autoSaving, setAutoSaving] = useState(false);
 const payloadRef = useRef(payload);
 payloadRef.current = payload;
 const lastSavedRef = useRef<string>(JSON.stringify(payload));
 const qcAuto = useQueryClient();

 const flush = useCallback(async () => {
  const snap = JSON.stringify(payloadRef.current);
  if (snap === lastSavedRef.current) return;
  if (payloadRef.current.slug && !isValidSlug(payloadRef.current.slug)) return;
  if (!payloadRef.current.nome?.trim()) return;
  setAutoSaving(true);
  try {
   await save({ data: payloadRef.current });
   lastSavedRef.current = snap;
   setSavedAt(new Date());
   setSlugError(null);
   qcAuto.invalidateQueries({ queryKey: ["forms-list"] });
  } catch (e) {
   setSlugError(e instanceof Error ? e.message : String(e));
  } finally {
   setAutoSaving(false);
  }
 }, [save, qcAuto]);

 useEffect(() => {
  const t = setTimeout(() => { void flush(); }, 900);
  return () => clearTimeout(t);
 }, [payload, flush]);

 // Salva ao fechar a aba/janela e ao desmontar (clicar fora)
 useEffect(() => {
  const onHide = () => { void flush(); };
  window.addEventListener("beforeunload", onHide);
  return () => {
   window.removeEventListener("beforeunload", onHide);
   void flush();
  };
 }, [flush]);


 function addField(kind: FormFieldKind) {
  const f: FormField = { id: `c${Date.now()}`, label: kind === "custom" ? "Campo personalizado" : label(kind), kind };
  if (kind === "file") f.fileMode = "link";
  setDraft((d) => ({ ...d, campos: [...d.campos, f] }));
 }

 function updateField(id: string, patch: Partial<FormField>) {
  setDraft((d) => ({ ...d, campos: d.campos.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
 }
 function removeField(id: string) {
  setDraft((d) => ({ ...d, campos: d.campos.filter((c) => c.id !== id) }));
 }
 function updateBranding(patch: Partial<FormBranding>) {
  setDraft((d) => ({ ...d, branding: { ...d.branding, ...patch } }));
 }

 const slugValid = !draft.slug || isValidSlug(draft.slug);
 const shareUrl = wsSlug && draft.slug
  ? buildFormShareUrlWithWorkspace(wsSlug, draft.slug)
  : buildFormShareUrl(draft.slug);

 return (
  <Dialog open onOpenChange={(o) => !o && onClose()}>
   <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
    <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
     <DialogTitle className="text-base">Editar formulário</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 px-6 pb-4 overflow-y-auto flex-1 min-h-0">
     <div className="grid grid-cols-2 gap-2">
      <div>
       <label className="text-[11px] text-muted-foreground">Nome</label>
       <Input value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} className="h-8 text-xs mt-1" />
      </div>
      <div>
       <label className="text-[11px] text-muted-foreground">Descrição</label>
       <Input maxLength={3000} value={draft.descricao ?? ""} onChange={(e) => setDraft({ ...draft, descricao: e.target.value })} className="h-8 text-xs mt-1" />
      </div>
     </div>

     <div>
      <label className="text-[11px] text-muted-foreground">Link personalizado</label>
      <div className="mt-1 flex items-center gap-1 rounded border border-border bg-background px-2">
       <span className="text-[11px] text-muted-foreground select-none whitespace-nowrap">
        Vanessa Simoni/{wsSlug || "workspace"}/
       </span>
       <input
        value={draft.slug ?? ""}
        onChange={(e) => {
         const next = normalizeSlug(e.target.value);
         setSlugError(null);
         setDraft((d) => ({ ...d, slug: next }));
        }}
        placeholder="contrato-rb-media"
        maxLength={60}
        className="flex-1 bg-transparent border-0 outline-none py-1.5 text-xs min-w-0"
       />
       <button
        type="button"
        onClick={() => {
         navigator.clipboard.writeText(shareUrl);
        }}
        title="Copiar link completo"
        className="text-muted-foreground hover:text-primary"
       >
        <Copy className="w-3.5 h-3.5" />
       </button>
      </div>
      <p className={cn("mt-1 text-[10px]", slugValid ? "text-muted-foreground" : "text-destructive")}>
       {slugValid
        ? "Use letras minúsculas, números e hifens (3-60 caracteres). Ex.: contrato-rb-media."
        : "Link inválido. Use apenas letras minúsculas, números e hifens (3-60 caracteres)."}
      </p>
      {slugError && <p className="mt-0.5 text-[10px] text-destructive">{slugError}</p>}
     </div>

     <div className="flex gap-1 border-b border-border">
      <button
       onClick={() => setTab("campos")}
       className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px", tab === "campos" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
      >
       Campos ({draft.campos.length})
      </button>
      <button
       onClick={() => setTab("identidade")}
       className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px flex items-center gap-1", tab === "identidade" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
      >
       <Palette className="w-3 h-3" /> Identidade visual
      </button>
      <button
       onClick={() => setTab("origem")}
       className={cn("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px flex items-center gap-1", tab === "origem" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
      >
       <ExternalLink className="w-3 h-3" /> Origem & integração
      </button>
     </div>

     {tab === "origem" ? (
      <OrigemTab draft={draft} setDraft={setDraft} />
     ) : tab === "campos" ? (
      <div className="border border-border rounded-md">
       <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto">
        {draft.campos.map((c) => (
         <div key={c.id} className="rounded border border-border bg-card px-2 py-1.5 space-y-1.5">
          <div className="flex items-center gap-2">
           <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
           <Input value={c.label} onChange={(e) => updateField(c.id, { label: e.target.value })} className="h-7 text-xs flex-1" />
           <select
            value={c.kind}
            onChange={(e) => {
             const kind = e.target.value as FormFieldKind;
             updateField(c.id, { kind, fileMode: kind === "file" ? (c.fileMode ?? "link") : undefined });
            }}
            className="h-7 text-xs bg-background border border-border rounded px-2"
           >
            <option value="text">Texto</option>
            <option value="email">E-mail</option>
            <option value="phone">Telefone</option>
            <option value="value">Valor (R$)</option>
            <option value="select">Seleção</option>
            <option value="file">Arquivo</option>
            <option value="custom">Personalizado</option>
           </select>
           <label className={cn("text-[10px] flex items-center gap-1", c.required && "text-primary")}>
            <input type="checkbox" checked={c.required ?? false} onChange={(e) => updateField(c.id, { required: e.target.checked })} />
            obrig.
           </label>
           <button onClick={() => removeField(c.id)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
           </button>
          </div>
          {c.kind === "file" && (
           <div className="flex items-center gap-2 pl-5">
            <span className="text-[10px] text-muted-foreground">Como o lead envia:</span>
            <div className="flex gap-1">
             {(["link", "upload"] as FormFileMode[]).map((mode) => (
              <button
               key={mode}
               type="button"
               onClick={() => updateField(c.id, { fileMode: mode })}
               className={cn(
                "text-[10px] px-2 py-0.5 rounded border transition-colors",
                (c.fileMode ?? "link") === mode
                 ? "border-primary bg-primary/10 text-primary"
                 : "border-border text-muted-foreground hover:border-primary/40",
               )}
              >
               {mode === "link" ? "Colar link" : "Anexar arquivo"}
              </button>
             ))}
            </div>
           </div>
          )}
          {c.kind === "select" && (
           <div className="pl-5 space-y-1">
            <span className="text-[10px] text-muted-foreground">Opções que o lead pode escolher:</span>
            {(c.options ?? []).map((opt, i) => (
             <div key={i} className="flex items-center gap-1">
              <Input
               value={opt}
               placeholder={`Opção ${i + 1}`}
               onChange={(e) => {
                const next = [...(c.options ?? [])];
                next[i] = e.target.value;
                updateField(c.id, { options: next });
               }}
               className="h-6 text-[11px] flex-1"
              />
              <button
               type="button"
               onClick={() => updateField(c.id, { options: (c.options ?? []).filter((_, j) => j !== i) })}
               className="text-muted-foreground hover:text-destructive"
               aria-label="Remover opção"
              >
               <Trash2 className="w-3 h-3" />
              </button>
             </div>
            ))}
            <button
             type="button"
             onClick={() => updateField(c.id, { options: [...(c.options ?? []), ""] })}
             className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-primary/40 text-primary hover:bg-primary/10"
            >
             <Plus className="w-3 h-3" /> Adicionar opção
            </button>
            {(c.options ?? []).filter((o) => o.trim()).length === 0 && (
             <p className="text-[10px] text-destructive">Adicione pelo menos uma opção para o lead poder selecionar.</p>
            )}
           </div>
          )}
          {c.kind === "value" && (
           <div className="flex items-center gap-2 pl-5">
            <span className="text-[10px] text-muted-foreground">Moeda:</span>
            <select
             value={c.currency ?? "BRL"}
             onChange={(e) => updateField(c.id, { currency: e.target.value as FormCurrency })}
             className="h-6 text-[11px] bg-background border border-border rounded px-1.5"
            >
             {(["BRL", "USD", "EUR", "GBP"] as FormCurrency[]).map((cur) => (
              <option key={cur} value={cur}>{CURRENCY_SYMBOL[cur]} · {cur}</option>
             ))}
            </select>
           </div>
          )}

         </div>
        ))}

       </div>
       <div className="flex flex-wrap gap-1 p-2 border-t border-border">
        {(["text", "email", "phone", "value", "select", "file", "custom"] as FormFieldKind[]).map((k) => (
         <Button key={k} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => addField(k)}>
          <Plus className="w-3 h-3 mr-1" /> {label(k)}
         </Button>
        ))}
       </div>
      </div>
     ) : (
      <div className="border border-border rounded-md p-3 space-y-3">
       <p className="text-[11px] text-muted-foreground leading-relaxed">
        A URL pública fica <b>{typeof window !== "undefined" ? window.location.host : "Vanessa Simoni"}/{FORM_PUBLIC_PREFIX}/&lt;seu-link&gt;</b>, a identidade abaixo aparece dentro do formulário pro cliente do seu cliente se sentir em casa.
       </p>
       <LogoUploader
         value={draft.branding.logoUrl ?? null}
         onChange={(v) => updateBranding({ logoUrl: v })}
        />
        <div className="grid grid-cols-2 gap-2">
         <BrandInput
          label="Texto do rodapé"
          placeholder="Ex.: © 2026 Sua Marca"
          value={draft.branding.footerText ?? ""}
          onChange={(v) => updateBranding({ footerText: v || null })}
         />

        <div>
         <label className="text-[11px] text-muted-foreground">Cor primária (botão)</label>
         <div className="flex items-center gap-2 mt-1">
          <input
           type="color"
           value={draft.branding.primaryColor ?? "#2563eb"}
           onChange={(e) => updateBranding({ primaryColor: e.target.value })}
           className="h-8 w-10 rounded border border-border cursor-pointer"
          />
          <Input
           value={draft.branding.primaryColor ?? ""}
           onChange={(e) => updateBranding({ primaryColor: e.target.value || null })}
           placeholder="#2563eb"
           className="h-8 text-xs"
          />
         </div>
        </div>
        <div>
         <label className="text-[11px] text-muted-foreground">Cor de destaque (fundo do topo)</label>
         <div className="flex items-center gap-2 mt-1">
          <input
           type="color"
           value={draft.branding.accentColor ?? "#111827"}
           onChange={(e) => updateBranding({ accentColor: e.target.value })}
           className="h-8 w-10 rounded border border-border cursor-pointer"
          />
          <Input
           value={draft.branding.accentColor ?? ""}
           onChange={(e) => updateBranding({ accentColor: e.target.value || null })}
           placeholder="#111827"
           className="h-8 text-xs"
          />
         </div>
        </div>
       </div>
       <BrandInput
        label="Título grande no topo"
        placeholder="Ex.: Vamos começar seu projeto"
        value={draft.branding.headline ?? ""}
        onChange={(v) => updateBranding({ headline: v || null })}
       />
       <div>
        <label className="text-[11px] text-muted-foreground">Subtítulo</label>
        <textarea
         value={draft.branding.subheadline ?? ""}
         onChange={(e) => updateBranding({ subheadline: e.target.value || null })}
         rows={2}
         placeholder="Ex.: Preencha os campos abaixo e a gente entra em contato em até 1 dia útil."
         className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-y"
        />
       </div>
       <div>
        <label className="text-[11px] text-muted-foreground">Mensagem de agradecimento (após envio)</label>
        <textarea
         value={draft.branding.thanksMessage ?? ""}
         onChange={(e) => updateBranding({ thanksMessage: e.target.value || null })}
         rows={2}
         placeholder="Ex.: Recebemos suas respostas! Em breve nosso time entra em contato."
         className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-y"
        />
       </div>
       <div className="space-y-2 rounded border border-dashed border-border p-2">
        <div className="text-[11px] text-muted-foreground">
         Botão opcional exibido na tela de agradecimento. Pode ser um link comum ou um
         agendamento de call direto no seu calendário Vanessa Simoni.
        </div>
        <div className="flex gap-1">
         {([
          { id: "link", label: "Link normal" },
          { id: "agendamento", label: "Agendar call" },
         ] as const).map((opt) => {
          const active = (draft.branding.thanksButtonMode ?? "link") === opt.id;
          return (
           <button
            key={opt.id}
            type="button"
            onClick={() => updateBranding({ thanksButtonMode: opt.id })}
            className={`h-7 px-3 rounded text-[11px] border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
           >
            {opt.label}
           </button>
          );
         })}
        </div>
        <BrandInput
         label="Texto do botão"
         placeholder={draft.branding.thanksButtonMode === "agendamento" ? "Ex.: Agendar minha call" : "Ex.: Falar no WhatsApp"}
         value={draft.branding.thanksButtonLabel ?? ""}
         onChange={(v) => updateBranding({ thanksButtonLabel: v || null })}
        />
        {draft.branding.thanksButtonMode === "agendamento" ? (
         <div className="grid grid-cols-2 gap-2">
          <div>
           <label className="text-[11px] text-muted-foreground">Duração da call</label>
           <select
            value={draft.branding.scheduling?.durationMin ?? 30}
            onChange={(e) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), durationMin: Number(e.target.value) } })
            }
            className="mt-1 w-full h-8 bg-background border border-border rounded px-2 text-xs"
           >
            {[15, 30, 45, 60, 90].map((m) => (
             <option key={m} value={m}>{m} minutos</option>
            ))}
           </select>
          </div>
          <div>
           <label className="text-[11px] text-muted-foreground">Disponível pelos próximos</label>
           <select
            value={draft.branding.scheduling?.daysAhead ?? 14}
            onChange={(e) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), daysAhead: Number(e.target.value) } })
            }
            className="mt-1 w-full h-8 bg-background border border-border rounded px-2 text-xs"
           >
            {[7, 14, 30, 60].map((d) => (
             <option key={d} value={d}>{d} dias</option>
            ))}
           </select>
          </div>
          <div>
           <label className="text-[11px] text-muted-foreground">Começa às</label>
           <input
            type="time"
            value={draft.branding.scheduling?.workStart ?? "09:00"}
            onChange={(e) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), workStart: e.target.value } })
            }
            className="mt-1 w-full h-8 bg-background border border-border rounded px-2 text-xs"
           />
          </div>
          <div>
           <label className="text-[11px] text-muted-foreground">Termina às</label>
           <input
            type="time"
            value={draft.branding.scheduling?.workEnd ?? "18:00"}
            onChange={(e) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), workEnd: e.target.value } })
            }
            className="mt-1 w-full h-8 bg-background border border-border rounded px-2 text-xs"
           />
          </div>
          <div className="col-span-2">
           <BrandInput
            label="Link da reunião (Meet/Zoom, opcional)"
            placeholder="https://meet.google.com/…"
            value={draft.branding.scheduling?.meetingUrl ?? ""}
            onChange={(v) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), meetingUrl: v || null } })
            }
           />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground">
           <input
            type="checkbox"
            checked={draft.branding.scheduling?.weekdaysOnly !== false}
            onChange={(e) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), weekdaysOnly: e.target.checked } })
            }
           />
           Somente dias úteis (seg a sex)
          </label>
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground">
           <input
            type="checkbox"
            checked={draft.branding.scheduling?.syncGoogle !== false}
            onChange={(e) =>
             updateBranding({ scheduling: { ...(draft.branding.scheduling ?? {}), syncGoogle: e.target.checked } })
            }
           />
           Enviar o evento para o Google Agenda (se a Conta Google estiver conectada)
          </label>
          <p className="col-span-2 text-[10px] text-muted-foreground">
           Os horários já ocupados no Calendário Vanessa Simoni não aparecem para o lead, e a call vira
           uma reunião no CRM ligada ao lead.
          </p>
         </div>
        ) : (
         <BrandInput
          label="Link do botão (URL)"
          placeholder="https://…"
          value={draft.branding.thanksButtonUrl ?? ""}
          onChange={(v) => updateBranding({ thanksButtonUrl: v || null })}
         />
        )}
       </div>
      </div>
      )}

     </div>
     <div className="flex justify-between items-center px-6 py-3 border-t border-border shrink-0 bg-background">
      <a
       href={shareUrl}
       target="_blank"
       rel="noreferrer"
       className="text-xs text-primary hover:underline flex items-center gap-1"
      >
       <ExternalLink className="w-3 h-3" /> Ver página pública
      </a>
      <div className="flex items-center gap-3">
       <span className="text-[11px] text-muted-foreground">
        {autoSaving
         ? "Salvando…"
         : savedAt
          ? `Salvo ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
          : "Salvamento automático ativo"}
       </span>
       <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
        {saveMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Concluir
       </Button>
      </div>
     </div>
    </DialogContent>
   </Dialog>
 );
}

function OrigemTab({
 draft,
 setDraft,
}: {
 draft: FormRecord;
 setDraft: React.Dispatch<React.SetStateAction<FormRecord>>;
}) {
 const origem: FormOrigem = draft.origem ?? "Vanessa Simoni";
 const rotate = useServerFn(rotateFormIngestToken);
 const listMeta = useServerFn(listMetaLeadForms);
 const [rotating, setRotating] = useState(false);
 const [copied, setCopied] = useState<string | null>(null);

 const metaQ = useQuery<{ forms: MetaLeadForm[]; diagnostics?: Array<{ pageId: string; pageName: string | null; ok: boolean; error?: string }>; pagesCount?: number }>({
  queryKey: ["meta-lead-forms"],
  queryFn: () => listMeta({ data: {} }) as Promise<{ forms: MetaLeadForm[] }>,
  enabled: origem === "meta",
  staleTime: 5 * 60_000,
  retry: false,
 });

 const endpoint = draft.ingestToken ? buildFormIngestUrl(draft.ingestToken) : "";
 const embedOrigin = endpoint ? new URL(endpoint).origin : "";
 const embedSnippet = `<div id="Vanessa Simoni-form"></div>
<script src="${embedOrigin}/api/public/form-embed.js" data-form="${draft.ingestToken ?? ""}" data-target="#Vanessa Simoni-form"><\/script>`;
 const snippet = `<script>
document.querySelector('#meu-formulario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target).entries());
  await fetch('${endpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
});
<\/script>`;

 function copy(text: string, key: string) {
  navigator.clipboard.writeText(text);
  setCopied(key);
  setTimeout(() => setCopied(null), 1500);
 }

 return (
  <div className="space-y-4">
   <div>
    <label className="text-[11px] text-muted-foreground">Onde este formulário é preenchido</label>
    <div className="grid grid-cols-3 gap-2 mt-1">
     {([
      { v: "Vanessa Simoni" as FormOrigem, t: "Página Vanessa Simoni", d: "Link público que você compartilha" },
      { v: "externo" as FormOrigem, t: "Site do cliente", d: "Formulário próprio via endpoint" },
      { v: "meta" as FormOrigem, t: "Meta (Lead Ads)", d: "Formulário instant-neo do anúncio" },
     ]).map((o) => (
      <button
       key={o.v}
       type="button"
       onClick={() => setDraft((d) => ({ ...d, origem: o.v }))}
       className={cn(
        "rounded-md border p-2 text-left transition-colors",
        origem === o.v ? "border-primary bg-primary/[0.06]" : "border-border hover:border-primary/40",
       )}
      >
       <div className="text-xs font-semibold">{o.t}</div>
       <div className="text-[10px] text-muted-foreground mt-0.5">{o.d}</div>
      </button>
     ))}
    </div>
   </div>

   <label className="flex items-center gap-2 text-xs">
    <input
     type="checkbox"
     checked={draft.autoCriarLead !== false}
     onChange={(e) => setDraft((d) => ({ ...d, autoCriarLead: e.target.checked }))}
    />
    Criar lead automaticamente quando a resposta não corresponder a um lead existente
   </label>

   {origem === "externo" && (
    <div className="space-y-2 rounded-md border border-border p-3">
     <div className="text-xs font-semibold">Endpoint de recebimento</div>
     <p className="text-[11px] text-muted-foreground">
      Envie um POST com os dados do formulário do site para a URL abaixo. As chaves podem ser o
      rótulo do campo (ex.: <code>nome</code>, <code>email</code>, <code>telefone</code>).
     </p>
     <div className="flex items-center gap-2">
      <Input readOnly value={endpoint} className="h-8 text-[11px]" />
      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => copy(endpoint, "url")}>
       <Copy className="w-3 h-3" /> {copied === "url" ? "Copiado" : "Copiar"}
      </Button>
     </div>
     <div className="flex items-center gap-2">
      <Button
       size="sm"
       variant="outline"
       className="h-7 text-[11px]"
       disabled={rotating}
       onClick={async () => {
        setRotating(true);
        try {
         const r = await rotate({ data: { id: draft.id } }) as { token: string };
         setDraft((d) => ({ ...d, ingestToken: r.token }));
        } finally {
         setRotating(false);
        }
       }}
      >
       {rotating ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Gerar nova chave
      </Button>
      <span className="text-[10px] text-muted-foreground">
       Ao gerar uma nova chave, a anterior deixa de funcionar.
      </span>
     </div>
     <div>
      <div className="text-[11px] font-medium mb-1">
       Instalação pronta (gera o formulário na página do cliente)
      </div>
      <p className="text-[10px] text-muted-foreground mb-1">
       Cole no lugar da página onde o formulário deve aparecer. O script monta os campos
       automaticamente e envia as respostas para o CRM.
      </p>
      <pre className="text-[10px] bg-muted/60 rounded p-2 overflow-x-auto whitespace-pre">{embedSnippet}</pre>
      <Button size="sm" variant="outline" className="h-7 mt-1 text-[11px] gap-1" onClick={() => copy(embedSnippet, "embed")}>
       <Copy className="w-3 h-3" /> {copied === "embed" ? "Copiado" : "Copiar código"}
      </Button>
     </div>
     <div>
      <div className="text-[11px] font-medium mb-1">Já tenho um formulário no site</div>
      <p className="text-[10px] text-muted-foreground mb-1">
       Use este código quando o formulário já existe na página (troque <code>#meu-formulario</code> pelo id do seu form).
      </p>
      <pre className="text-[10px] bg-muted/60 rounded p-2 overflow-x-auto whitespace-pre">{snippet}</pre>
      <Button size="sm" variant="outline" className="h-7 mt-1 text-[11px] gap-1" onClick={() => copy(snippet, "snip")}>
       <Copy className="w-3 h-3" /> {copied === "snip" ? "Copiado" : "Copiar código"}
      </Button>
     </div>
    </div>
   )}

   {origem === "meta" && (
    <div className="space-y-2 rounded-md border border-border p-3">
     <div className="text-xs font-semibold">Formulário do Meta (Lead Ads)</div>
     <p className="text-[11px] text-muted-foreground">
      Escolha o formulário instant-neo da página conectada. Cada lead recebido pelo anúncio
      entra no CRM e dispara o gatilho “Formulário enviado”.
     </p>
     {metaQ.isLoading ? (
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
       <Loader2 className="w-3 h-3 animate-spin" /> Carregando formulários da Meta…
      </div>
     ) : metaQ.isError ? (
      <div className="text-[11px] text-destructive">
       {(metaQ.error as Error)?.message || "Não foi possível carregar. Conecte a Meta em Integrações e tente de novo."}
      </div>
     ) : (
      <>
       <select
        value={draft.metaFormId ?? ""}
        onChange={(e) => {
         const f = (metaQ.data?.forms ?? []).find((x) => x.id === e.target.value);
         setDraft((d) => ({ ...d, metaFormId: f?.id ?? null, metaPageId: f?.pageId ?? null }));
        }}
        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
       >
        <option value="">Selecione um formulário…</option>
        {(metaQ.data?.forms ?? []).map((f) => (
         <option key={f.id} value={f.id}>
          {f.name}{f.pageName ? `, ${f.pageName}` : ""}
         </option>
        ))}
       </select>
       {(metaQ.data?.forms ?? []).length === 0 && (
        <div className="text-[10px] text-amber-500 space-y-0.5">
         {(metaQ.data?.pagesCount ?? 0) === 0 ? (
          <div>Nenhuma página do Facebook conectada. Conecte a Meta em Integrações.</div>
         ) : (
          <>
           <div>Nenhum formulário de Lead Ads encontrado nas páginas conectadas.</div>
           {(metaQ.data?.diagnostics ?? [])
            .filter((d) => !d.ok)
            .map((d) => (
             <div key={d.pageId}>• {d.pageName ?? d.pageId}: {d.error}</div>
            ))}
          </>
         )}
        </div>
       )}
       <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => metaQ.refetch()}>
        Recarregar formulários
       </Button>
      </>
     )}
    </div>
   )}

   {origem === "Vanessa Simoni" && (
    <p className="text-[11px] text-muted-foreground">
     Este formulário usa a página pública da Vanessa Simoni. Compartilhe o link personalizado acima.
    </p>
   )}
  </div>
 );
}

function BrandInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
 return (
  <div>
   <label className="text-[11px] text-muted-foreground">{label}</label>
   <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-xs mt-1" />
  </div>
 );
}

function LogoUploader({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
 const upload = useServerFn(uploadFormLogo);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 async function handleFile(file: File | undefined) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { setErr("Máx. 5 MB."); return; }
  setBusy(true); setErr(null);
  try {
   const base64: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
   });
   const out = await upload({ data: { contentType: file.type || "image/png", base64 } }) as { url: string };
   onChange(out.url);
  } catch (e) {
   setErr(e instanceof Error ? e.message : String(e));
  } finally {
   setBusy(false);
  }
 }

 return (
  <div>
   <label className="text-[11px] text-muted-foreground">Logo do formulário (PNG, JPG, WebP, SVG)</label>
   <div className="mt-1 flex items-center gap-2">
    {value ? (
     <img src={value} alt="Logo" className="h-10 w-10 rounded border border-border object-contain bg-white" />
    ) : (
     <div className="h-10 w-10 rounded border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">Logo</div>
    )}
    <label className="cursor-pointer">
     <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
      className="hidden"
      disabled={busy}
      onChange={(e) => handleFile(e.target.files?.[0])}
     />
     <span className="inline-flex items-center gap-1 h-8 px-2 rounded border border-border text-xs hover:border-primary/40">
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
      {value ? "Trocar logo" : "Enviar logo"}
     </span>
    </label>
    {value && !busy && (
     <button type="button" onClick={() => onChange(null)} className="text-[11px] text-muted-foreground hover:text-destructive">
      Remover
     </button>
    )}
   </div>
   {err && <p className="mt-1 text-[11px] text-destructive">{err}</p>}
  </div>
 );
}


function label(k: FormFieldKind) {
 switch (k) {
  case "text": return "Texto";
  case "email": return "E-mail";
  case "phone": return "Telefone";
  case "value": return "Valor";
  case "select": return "Seleção";
  case "file": return "Arquivo";
  case "custom": return "Personalizado";
 }
}
