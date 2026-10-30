import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Folder as FolderIcon, FolderOpen, Trash2, Pencil, Plus, Copy, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listCopyFolders, upsertCopyFolder, deleteCopyFolder,
  listSavedCopies, upsertSavedCopy, deleteSavedCopy, moveSavedCopy,
} from "@/lib/meta-copies.functions";

type Folder = { id: string; name: string; description: string; parent_id: string | null };
type SavedCopy = {
  id: string; folder_id: string | null; name: string; content: string;
  notes: string; tags: string[]; created_at: string; updated_at: string;
};

const emptyCopy = { id: undefined as string | undefined, name: "", content: "", notes: "", tags: "", folderId: null as string | null };

export function MetaCopyLibrary({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const foldersFn = useServerFn(listCopyFolders);
  const upsertFolderFn = useServerFn(upsertCopyFolder);
  const delFolderFn = useServerFn(deleteCopyFolder);
  const listFn = useServerFn(listSavedCopies);
  const upsertFn = useServerFn(upsertSavedCopy);
  const delFn = useServerFn(deleteSavedCopy);
  const moveFn = useServerFn(moveSavedCopy);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | "root" | null>(null);

  const [folderOpen, setFolderOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState<{ id?: string; name: string; description: string; parentId: string | null }>({ name: "", description: "", parentId: null });

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDraft, setCopyDraft] = useState(emptyCopy);

  const foldersQ = useQuery({
    queryKey: ["copy-folders", workspaceId],
    queryFn: () => foldersFn({ data: { workspaceId } }) as Promise<Folder[]>,
  });
  const folders = foldersQ.data ?? [];

  const copiesQ = useQuery({
    queryKey: ["saved-copies", workspaceId, search],
    queryFn: () => listFn({ data: { workspaceId, search } }) as Promise<SavedCopy[]>,
  });
  const allCopies = copiesQ.data ?? [];

  // Pasta ativa inclui as subpastas.
  const scopeIds = useMemo(() => {
    if (!activeFolder) return null;
    const ids = new Set<string>([activeFolder]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); changed = true; }
      }
    }
    return ids;
  }, [activeFolder, folders]);

  const visible = useMemo(() => {
    if (!scopeIds) return allCopies;
    return allCopies.filter((c) => c.folder_id && scopeIds.has(c.folder_id));
  }, [allCopies, scopeIds]);

  const countFor = (id: string | null) =>
    id === null ? allCopies.filter((c) => !c.folder_id).length : allCopies.filter((c) => c.folder_id === id).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["saved-copies", workspaceId] });
    qc.invalidateQueries({ queryKey: ["copy-folders", workspaceId] });
  };

  const saveFolder = useMutation({
    mutationFn: async () => {
      if (!folderDraft.name.trim()) throw new Error("Dê um nome à pasta.");
      return upsertFolderFn({ data: { id: folderDraft.id, workspaceId, parentId: folderDraft.parentId, name: folderDraft.name.trim(), description: folderDraft.description.trim() } });
    },
    onSuccess: () => { toast.success("Pasta salva."); setFolderOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFolder = useMutation({
    mutationFn: (id: string) => delFolderFn({ data: { id, workspaceId } }),
    onSuccess: () => { toast.success("Pasta removida."); setActiveFolder(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCopy = useMutation({
    mutationFn: async () => {
      if (!copyDraft.name.trim()) throw new Error("Dê um nome à copy.");
      if (!copyDraft.content.trim()) throw new Error("Escreva o texto da copy.");
      return upsertFn({
        data: {
          id: copyDraft.id,
          workspaceId,
          folderId: copyDraft.folderId,
          name: copyDraft.name.trim(),
          content: copyDraft.content.trim(),
          notes: copyDraft.notes.trim(),
          tags: copyDraft.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
        },
      });
    },
    onSuccess: () => { toast.success("Copy salva."); setCopyOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCopy = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, workspaceId } }),
    onSuccess: () => { toast.success("Copy removida."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveCopy = useMutation({
    mutationFn: (v: { id: string; folderId: string | null }) => moveFn({ data: { workspaceId, ...v } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const openNewCopy = () => { setCopyDraft({ ...emptyCopy, folderId: activeFolder }); setCopyOpen(true); };
  const openEditCopy = (c: SavedCopy) => {
    setCopyDraft({ id: c.id, name: c.name, content: c.content, notes: c.notes ?? "", tags: (c.tags ?? []).join(", "), folderId: c.folder_id });
    setCopyOpen(true);
  };

  const doCopy = async (c: SavedCopy) => {
    try {
      await navigator.clipboard.writeText(c.content);
      setCopied(c.id);
      setTimeout(() => setCopied((v) => (v === c.id ? null : v)), 1500);
      toast.success("Copy copiada para a área de transferência.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  };

  const renderFolders = (parentId: string | null, depth = 0) =>
    folders.filter((f) => f.parent_id === parentId).map((f) => (
      <div key={f.id}>
        <div
          className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition ${activeFolder === f.id ? "bg-primary/10 text-foreground font-semibold" : "hover:bg-muted"} ${dragOver === f.id ? "ring-2 ring-primary" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setActiveFolder(f.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOver(f.id); }}
          onDragLeave={() => setDragOver((v) => (v === f.id ? null : v))}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(null);
            const id = e.dataTransfer.getData("text/copy-id");
            if (id) moveCopy.mutate({ id, folderId: f.id });
          }}
        >
          {activeFolder === f.id ? <FolderOpen className="w-4 h-4 shrink-0" /> : <FolderIcon className="w-4 h-4 shrink-0" />}
          <span className="truncate flex-1 min-w-0">{f.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{countFor(f.id)}</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-primary shrink-0"
            title="Editar pasta"
            onClick={(e) => { e.stopPropagation(); setFolderDraft({ id: f.id, name: f.name, description: f.description ?? "", parentId: f.parent_id }); setFolderOpen(true); }}
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive shrink-0"
            title="Excluir pasta"
            onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir a pasta "${f.name}"? As copies dentro dela voltam para "Sem pasta".`)) removeFolder.mutate(f.id); }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        {renderFolders(f.id, depth + 1)}
      </div>
    ));

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4">
      {/* Pastas */}
      <aside className="rounded-xl border border-border bg-card p-3 h-fit">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pastas</div>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { setFolderDraft({ name: "", description: "", parentId: activeFolder }); setFolderOpen(true); }}>
            <FolderPlus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          <div
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition ${activeFolder === null ? "bg-primary/10 font-semibold" : "hover:bg-muted"} ${dragOver === "root" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setActiveFolder(null)}
            onDragOver={(e) => { e.preventDefault(); setDragOver("root"); }}
            onDragLeave={() => setDragOver((v) => (v === "root" ? null : v))}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(null);
              const id = e.dataTransfer.getData("text/copy-id");
              if (id) moveCopy.mutate({ id, folderId: null });
            }}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="flex-1">Todas as copies</span>
            <span className="text-[10px] text-muted-foreground">{allCopies.length}</span>
          </div>
          {renderFolders(null)}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">Arraste uma copy para mover de pasta.</p>
      </aside>

      {/* Copies */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-10" placeholder="Buscar por nome ou texto da copy…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={openNewCopy} className="h-10">
            <Plus className="w-4 h-4 mr-1" /> Nova copy
          </Button>
        </div>

        {copiesQ.isLoading ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando copies…</div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <div className="text-sm font-semibold">Nenhuma copy salva por aqui</div>
            <p className="text-xs text-muted-foreground mt-1">Guarde aqui os textos que já convertem. Depois é só copiar e usar no anúncio.</p>
            <Button size="sm" className="mt-3" onClick={openNewCopy}><Plus className="w-3.5 h-3.5 mr-1" /> Criar primeira copy</Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((c) => {
              const folder = folders.find((f) => f.id === c.folder_id);
              return (
                <article
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/copy-id", c.id)}
                  className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2 hover:border-primary/40 transition cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{c.name}</h3>
                      <div className="text-[10px] text-muted-foreground truncate">{folder ? folder.name : "Sem pasta"}</div>
                    </div>
                    <button className="p-1 rounded hover:bg-muted shrink-0" title="Copiar texto" onClick={() => doCopy(c)}>
                      {copied === c.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{c.content}</p>
                  {c.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="text-[10px] rounded-full bg-muted px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-1 border-t border-border/60">
                    <button className="text-[11px] font-medium px-2 py-1 rounded hover:bg-muted" onClick={() => openEditCopy(c)}>
                      <Pencil className="w-3 h-3 inline mr-1" /> Editar
                    </button>
                    <button
                      className="text-[11px] font-medium px-2 py-1 rounded hover:bg-muted text-destructive ml-auto"
                      onClick={() => { if (confirm(`Excluir a copy "${c.name}"?`)) removeCopy.mutate(c.id); }}
                    >
                      <Trash2 className="w-3 h-3 inline mr-1" /> Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Dialog pasta */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{folderDraft.id ? "Editar pasta" : "Nova pasta de copies"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={folderDraft.name} onChange={(e) => setFolderDraft({ ...folderDraft, name: e.target.value })} placeholder="Ex.: Ofertas de inverno" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={folderDraft.description} onChange={(e) => setFolderDraft({ ...folderDraft, description: e.target.value })} placeholder="Para que serve essa pasta" />
            </div>
            <div>
              <Label>Dentro de</Label>
              <select
                className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                value={folderDraft.parentId ?? ""}
                onChange={(e) => setFolderDraft({ ...folderDraft, parentId: e.target.value || null })}
              >
                <option value="">Nenhuma (pasta principal)</option>
                {folders.filter((f) => f.id !== folderDraft.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveFolder.mutate()} disabled={saveFolder.isPending}>Salvar pasta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog copy */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-2xl w-[94vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{copyDraft.id ? "Editar copy" : "Nova copy"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Nome da copy</Label>
                <Input className="h-10" value={copyDraft.name} onChange={(e) => setCopyDraft({ ...copyDraft, name: e.target.value })} placeholder="Ex.: Oferta 50% — dor + prova" />
              </div>
              <div>
                <Label>Pasta</Label>
                <select
                  className="w-full h-10 px-2 rounded-md border border-border bg-background text-sm"
                  value={copyDraft.folderId ?? ""}
                  onChange={(e) => setCopyDraft({ ...copyDraft, folderId: e.target.value || null })}
                >
                  <option value="">Sem pasta</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Texto da copy</Label>
              <Textarea rows={10} value={copyDraft.content} onChange={(e) => setCopyDraft({ ...copyDraft, content: e.target.value })} placeholder="Cole aqui o texto do anúncio que converte." />
              <p className="text-[10px] text-muted-foreground mt-1">{copyDraft.content.length}/6000 caracteres</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Etiquetas (separadas por vírgula)</Label>
                <Input className="h-10" value={copyDraft.tags} onChange={(e) => setCopyDraft({ ...copyDraft, tags: e.target.value })} placeholder="topo de funil, remarketing" />
              </div>
              <div>
                <Label>Observações</Label>
                <Input className="h-10" value={copyDraft.notes} onChange={(e) => setCopyDraft({ ...copyDraft, notes: e.target.value })} placeholder="Onde essa copy funcionou melhor" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveCopy.mutate()} disabled={saveCopy.isPending}>Salvar copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
