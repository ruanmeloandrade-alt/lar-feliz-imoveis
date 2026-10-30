// SLIM_APPROVED_UI_COMMERCE_V1
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { BrainSourceActions, BrainBlockedTermEditor } from "@/components/crm/BrainSourceEditors";
import { BrainCircuit, FileText, Link2, Megaphone, Plus, Trash2, Upload } from "lucide-react";

type Source = {
  id: string;
  title: string;
  source_type: "text" | "url" | "document" | "promotion";
  content: string;
  url: string | null;
  file_name: string | null;
  storage_path: string | null;
  enabled: boolean;
  updated_at: string;
};
type SourceType = Source["source_type"];

export const Route = createFileRoute("/crm/agente-ia")({
  head: () => ({ meta: [{ title: "Cérebro IA · Vanessa Simoni" }] }),
  component: BrainPage,
});

function BrainPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [blockedTerms, setBlockedTerms] = useState<Array<{id:string;term:string}>>([]);
  const [newBlockedTerm, setNewBlockedTerm] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<SourceType | "blocked">("text");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload(wid: string) {
    const { data, error: err } = await supabase.from("ai_brain_sources")
      .select("id,title,source_type,content,url,file_name,storage_path,enabled,updated_at")
      .eq("workspace_id", wid).order("created_at", { ascending: false });
    if (err) throw err;
    setSources((data ?? []) as Source[]);
    const { data: terms, error: termsError } = await supabase.from("ai_brain_blocked_terms").select("id,term").eq("workspace_id",wid).order("term");
    if (termsError) throw termsError;
    setBlockedTerms(terms ?? []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Entre na sua conta para acessar o Cérebro IA.");
      const { data: profile, error: profileErr } = await supabase.from("profiles")
        .select("current_workspace_id").eq("id", auth.user.id).single();
      if (profileErr) throw profileErr;
      const wid = profile?.current_workspace_id;
      if (!wid) throw new Error("Nenhuma operação vinculada à sua conta.");
      if (!active) return;
      setWorkspaceId(wid);
      await reload(wid);
    })().catch(e => { if (active) setError(e.message ?? "Não foi possível carregar a base."); });
    return () => { active = false; };
  }, []);

  async function addBlockedTerm() {
    if (!workspaceId || !newBlockedTerm.trim()) return;
    setError("");
    const term = newBlockedTerm.trim().toLocaleLowerCase("pt-BR");
    const { error: err } = await supabase.from("ai_brain_blocked_terms").insert({workspace_id:workspaceId,term});
    if (err) return setError(err.message);
    setNewBlockedTerm("");
    await reload(workspaceId);
  }
  async function removeBlockedTerm(id: string) {
    if (!workspaceId) return;
    const { error: err } = await supabase.from("ai_brain_blocked_terms").delete().eq("id",id).eq("workspace_id",workspaceId);
    if (err) return setError(err.message);
    await reload(workspaceId);
  }

  async function addSource() {
    if (!workspaceId || !title.trim()) return setError("Informe o título da fonte.");
    if (kind === "document" && !file) return setError("Selecione um documento.");
    if (kind === "url" && !/^https?:\/\//i.test(url.trim())) return setError("Informe uma URL válida.");
    setError(""); setNotice(""); setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada.");
      if (file && kind === "document") {
        if (file.size > 20 * 1024 * 1024) throw new Error("Limite de 20 MB por documento.");
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!["pdf", "txt", "md", "docx"].includes(ext)) throw new Error("Tipo de arquivo não permitido.");
        uploadedPath = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("saude-slim-brain")
          .upload(uploadedPath, file, { upsert: false });
        if (upErr) throw upErr;
      }
      const { error: insertErr } = await supabase.from("ai_brain_sources").insert({
        workspace_id: workspaceId, created_by: auth.user.id, title: title.trim(),
        source_type: kind, content: kind === "text" || kind === "promotion" ? content : "",
        url: kind === "url" ? url.trim() : null,
        file_name: kind === "document" ? file?.name : null,
        storage_path: uploadedPath, enabled: true,
      });
      if (insertErr) throw insertErr;
      setTitle(""); setContent(""); setUrl(""); setFile(null);
      setNotice("Fonte adicionada. A indexação semântica ainda precisa ser ativada para consultas dos agentes.");
      await reload(workspaceId);
    } catch (e) {
      if (uploadedPath) await supabase.storage.from("saude-slim-brain").remove([uploadedPath]);
      setError(e instanceof Error ? e.message : "Erro ao adicionar fonte.");
    } finally { setBusy(false); }
  }

  async function toggle(source: Source) {
    if (!workspaceId) return;
    const { error: err } = await supabase.from("ai_brain_sources")
      .update({ enabled: !source.enabled, updated_at: new Date().toISOString() }).eq("id", source.id);
    if (err) setError(err.message); else await reload(workspaceId);
  }

  async function remove(source: Source) {
    if (!workspaceId || !window.confirm(`Excluir a fonte "${source.title}"?`)) return;
    const { error: err } = await supabase.from("ai_brain_sources").delete().eq("id", source.id);
    if (err) return setError(err.message);
    if (source.storage_path) await supabase.storage.from("saude-slim-brain").remove([source.storage_path]);
    await reload(workspaceId);
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">
        <header><h1 className="flex items-center gap-2 text-2xl font-bold"><BrainCircuit /> Cérebro IA</h1>
          <p className="mt-2 text-sm text-muted-foreground">Base de conhecimento da Vanessa Simoni. Os agentes de atendimento são criados separadamente em Automações.</p>
        </header>
        <section className="w-full rounded-lg border bg-card p-5">
          <h2 className="mb-4 font-semibold">Adicionar conhecimento</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {([{ id: "text", label: "Informação", icon: FileText }, { id: "document", label: "Documento", icon: Upload }, { id: "url", label: "Link", icon: Link2 }, { id: "promotion", label: "Promoção", icon: Megaphone }, { id: "blocked", label: "Palavras proibidas", icon: FileText }] as const).map(option => (
              <button key={option.id} type="button" onClick={() => setKind(option.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${kind === option.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <option.icon size={15} />{option.label}
              </button>
            ))}
          </div>
          {kind === "blocked" ? (<div className="mt-4 rounded-lg border bg-muted/20 p-4">
          <h2 className="mb-2 font-semibold">Palavras proibidas</h2>{error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
          <p className="mb-3 text-xs text-muted-foreground">Termos que os agentes não devem usar. O bloqueio automático antes do envio ainda precisa ser integrado ao backend.</p>
          <div className="flex gap-2">
            <input aria-label="Nova palavra proibida" className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm" placeholder="Digite uma palavra ou expressão" value={newBlockedTerm} onChange={e=>setNewBlockedTerm(e.target.value)}/>
            <button type="button" onClick={addBlockedTerm} className="rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Adicionar</button>
          </div>
          <ul className="mt-3 space-y-2">{blockedTerms.map(item=><li key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span className="min-w-0 flex-1 break-words">{item.term}</span><BrainBlockedTermEditor item={item} workspaceId={workspaceId} onSaved={() => reload(workspaceId!)} /><button type="button" aria-label={`Remover ${item.term}`} onClick={()=>removeBlockedTerm(item.id)}><Trash2 size={15}/></button></li>)}</ul>
        </div>
          ) : (<>
          <label className="block text-sm">Título<input className="mt-1 mb-3 w-full rounded-md border bg-background p-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Política comercial" /></label>
          {(kind === "text" || kind === "promotion") && <label className="block text-sm">Conteúdo<textarea className="mt-1 mb-3 min-h-36 w-full rounded-md border bg-background p-2" value={content} onChange={e => setContent(e.target.value)} /></label>}
          {kind === "url" && <label className="block text-sm">Endereço da página<input className="mt-1 mb-3 w-full rounded-md border bg-background p-2" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></label>}
          {kind === "document" && <label className="block text-sm">PDF, DOCX, TXT ou Markdown (até 20 MB)<input type="file" accept=".pdf,.docx,.txt,.md" className="mt-2 mb-3 block" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
          <button type="button" disabled={busy || !workspaceId} onClick={addSource} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={16} /> {busy ? "Salvando..." : "Adicionar fonte"}</button>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
          </>)}
        </section>
        <section className="w-full rounded-lg border bg-card p-5">
          <h2 className="mb-2 font-semibold">Links autorizados</h2>
          <p className="text-sm text-muted-foreground">Somente links ativos cadastrados abaixo poderão ser enviados pelos agentes. Links não cadastrados deverão ser bloqueados na etapa de envio. Cadastre-os em Adicionar conhecimento → Link.</p>
          <ul className="mt-3 space-y-2">{sources.filter(source=>source.source_type==="url").map(source=><li key={source.id} className="rounded-md border p-3 text-sm"><strong>{source.title}</strong><div className="break-all text-xs text-muted-foreground">{source.url}</div><span className="text-xs">{source.enabled ? "Autorizado" : "Desativado"}</span></li>)}</ul>
        </section>
        <section className="w-full rounded-lg border bg-card p-5">
          <h2 className="mb-2 font-semibold">Fontes cadastradas ({sources.length})</h2>
          <p className="mb-4 text-xs text-muted-foreground">Armazenamento disponível. Indexação e busca RAG pelos agentes ainda estão em implementação.</p>
          {sources.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma fonte adicionada.</p>}
          <ul className="divide-y">{sources.map(source => <li key={source.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><strong className="block break-words text-sm">{source.title}</strong><p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{source.content || source.url || source.file_name || "Sem conteúdo complementar"}</p><span className="text-xs text-muted-foreground">{source.source_type === "promotion" ? "Promoção" : source.source_type === "document" ? "Documento" : source.source_type === "url" ? "Link" : "Texto"}{source.file_name ? ` · ${source.file_name}` : ""}</span></div>
            <BrainSourceActions source={source} workspaceId={workspaceId} onSaved={() => reload(workspaceId!)} />
            <button type="button" onClick={() => toggle(source)} className="rounded border px-3 py-1.5 text-xs">{source.enabled ? "Ativo" : "Pausado"}</button>
            <button type="button" aria-label={`Excluir ${source.title}`} onClick={() => remove(source)} className="rounded border p-2 text-destructive"><Trash2 size={14} /></button>
          </li>)}</ul>
        </section>
      </main>
    </div>
  );
}
