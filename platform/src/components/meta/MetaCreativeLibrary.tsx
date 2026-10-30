import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Trash2, Pencil, Upload, Folder as FolderIcon, FolderOpen, ChevronRight, ChevronDown, Image as ImageIcon, Video, X, Check, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listCreativeFolders, upsertCreativeFolder, deleteCreativeFolder,
  listCreativesLibrary, updateCreative, deleteCreative, registerCreative, getCreativeSignedUrl,
} from "@/lib/meta-creatives.functions";

type Folder = { id: string; name: string; description: string; parent_id: string | null };
type Creative = {
  id: string; folder_id: string | null; display_name: string | null; original_filename: string | null;
  storage_path: string; mime: string; kind: "image" | "video"; size_bytes: number | null;
  width: number | null; height: number | null; tags: string[]; created_at: string;
};

export function MetaCreativeLibrary({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const foldersFn = useServerFn(listCreativeFolders);
  const upsertFolderFn = useServerFn(upsertCreativeFolder);
  const delFolderFn = useServerFn(deleteCreativeFolder);
  const listFn = useServerFn(listCreativesLibrary);
  const updateFn = useServerFn(updateCreative);
  const deleteFn = useServerFn(deleteCreative);
  const registerFn = useServerFn(registerCreative);
  const signFn = useServerFn(getCreativeSignedUrl);

  // null = "Todos os criativos" (nenhuma pasta selecionada)
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderDraft, setFolderDraft] = useState<{ name: string; description: string; parentId: string | null }>({ name: "", description: "", parentId: null });
  const [editingCreative, setEditingCreative] = useState<Creative | null>(null);
  const [creativeDraft, setCreativeDraft] = useState<{ display_name: string; tags: string; folder_id: string | null }>({ display_name: "", tags: "", folder_id: null });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "video">("image");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const foldersQ = useQuery({
    queryKey: ["creative-folders", workspaceId],
    queryFn: () => foldersFn({ data: { workspaceId } }) as Promise<Folder[]>,
  });
  const folders = foldersQ.data ?? [];

  // Se activeFolder for uma pasta, mostra os criativos dela + subpastas (recursivo).
  // Se activeFolder for null, mostra TODOS os criativos do workspace.
  const descendantIds = useMemo(() => {
    if (!activeFolder) return null; // sinaliza "todos"
    const ids = new Set<string>([activeFolder]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id); changed = true;
        }
      }
    }
    return Array.from(ids);
  }, [activeFolder, folders]);

  const creativesQ = useQuery({
    queryKey: ["creatives", workspaceId, activeFolder, search],
    queryFn: () => listFn({
      data: {
        workspaceId,
        // undefined = todos; folderId específico = filtra
        folderId: activeFolder ?? undefined,
        search,
      },
    }) as Promise<Creative[]>,
  });

  const creatives = useMemo(() => {
    const rows = creativesQ.data ?? [];
    if (!descendantIds) return rows;
    const set = new Set(descendantIds);
    // se o servidor filtrou por folderId único, isso já é o que queremos;
    // mas para incluir subpastas, precisamos filtrar client-side quando há descendentes extras.
    if (descendantIds.length === 1) return rows;
    // pega tudo do workspace e filtra
    return rows.filter((c) => c.folder_id && set.has(c.folder_id));
  }, [creativesQ.data, descendantIds]);

  // Quando a pasta ativa tem subpastas, refazemos a query buscando tudo (folderId=undefined) e filtramos.
  // Simplificação: se há subpastas, buscamos tudo e filtramos client-side.
  const hasChildren = useMemo(() => {
    if (!activeFolder) return false;
    return folders.some((f) => f.parent_id === activeFolder);
  }, [activeFolder, folders]);

  const creativesAllQ = useQuery({
    queryKey: ["creatives-all", workspaceId, search],
    queryFn: () => listFn({ data: { workspaceId, folderId: undefined, search } }) as Promise<Creative[]>,
    enabled: hasChildren,
  });

  const visibleCreatives = useMemo(() => {
    if (!activeFolder) return creativesQ.data ?? [];
    if (hasChildren && creativesAllQ.data) {
      const set = new Set(descendantIds ?? []);
      return creativesAllQ.data.filter((c) => c.folder_id && set.has(c.folder_id));
    }
    return creatives;
  }, [activeFolder, hasChildren, creativesAllQ.data, descendantIds, creativesQ.data, creatives]);

  const saveFolder = useMutation({
    mutationFn: async () => {
      if (!folderDraft.name.trim()) throw new Error("Dê um nome à pasta.");
      return upsertFolderFn({
        data: {
          id: editingFolder?.id,
          workspaceId,
          parentId: folderDraft.parentId,
          name: folderDraft.name.trim(),
          description: folderDraft.description,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pasta salva.");
      qc.invalidateQueries({ queryKey: ["creative-folders", workspaceId] });
      setShowFolderForm(false); setEditingFolder(null);
      setFolderDraft({ name: "", description: "", parentId: null });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeFolder = useMutation({
    mutationFn: (id: string) => delFolderFn({ data: { id, workspaceId } }),
    onSuccess: () => {
      toast.success("Pasta removida.");
      qc.invalidateQueries({ queryKey: ["creative-folders", workspaceId] });
      qc.invalidateQueries({ queryKey: ["creatives", workspaceId] });
      qc.invalidateQueries({ queryKey: ["creatives-all", workspaceId] });
      if (activeFolder && !folders.find((f) => f.id === activeFolder)) setActiveFolder(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const moveFolder = useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const f = folders.find((x) => x.id === id);
      if (!f) throw new Error("Pasta não encontrada.");
      if (id === parentId) throw new Error("Não é possível mover para si mesma.");
      // impedir loop: parentId não pode ser descendente de id
      const descendants = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const g of folders) {
          if (g.parent_id && descendants.has(g.parent_id) && !descendants.has(g.id)) {
            descendants.add(g.id); changed = true;
          }
        }
      }
      if (parentId && descendants.has(parentId)) throw new Error("Não é possível mover uma pasta para dentro de uma subpasta dela mesma.");
      return upsertFolderFn({
        data: { id, workspaceId, parentId, name: f.name, description: f.description ?? "" },
      });
    },
    onSuccess: () => {
      toast.success("Pasta movida.");
      qc.invalidateQueries({ queryKey: ["creative-folders", workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const moveCreative = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      updateFn({ data: { id, workspaceId, folderId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creatives", workspaceId] });
      qc.invalidateQueries({ queryKey: ["creatives-all", workspaceId] });
      toast.success("Criativo movido.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveCreative = useMutation({
    mutationFn: async () => {
      if (!editingCreative) return;
      return updateFn({
        data: {
          id: editingCreative.id,
          workspaceId,
          displayName: creativeDraft.display_name.trim() || null,
          folderId: creativeDraft.folder_id,
          tags: creativeDraft.tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      });
    },
    onSuccess: () => {
      toast.success("Criativo atualizado.");
      qc.invalidateQueries({ queryKey: ["creatives", workspaceId] });
      qc.invalidateQueries({ queryKey: ["creatives-all", workspaceId] });
      setEditingCreative(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeCreative = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id, workspaceId } }),
    onSuccess: () => {
      toast.success("Criativo excluído.");
      qc.invalidateQueries({ queryKey: ["creatives", workspaceId] });
      qc.invalidateQueries({ queryKey: ["creatives-all", workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) { toast.error(`${file.name}: apenas imagens ou vídeos.`); continue; }
        const ext = file.name.split(".").pop() ?? (isImage ? "jpg" : "mp4");
        const path = `${workspaceId}/library/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("meta-creatives").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type,
        });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        let width: number | null = null; let height: number | null = null;
        if (isImage) {
          await new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => { width = img.naturalWidth; height = img.naturalHeight; res(); };
            img.onerror = () => res();
            img.src = URL.createObjectURL(file);
          });
        }
        await registerFn({
          data: {
            workspaceId, storagePath: path, mime: file.type,
            kind: isImage ? "image" : "video",
            sizeBytes: file.size, width, height,
            originalFilename: file.name, displayName: file.name.replace(/\.[^.]+$/, ""),
            folderId: activeFolder, adAccountId: "",
          },
        });
      }
      toast.success("Upload concluído.");
      qc.invalidateQueries({ queryKey: ["creatives", workspaceId] });
      qc.invalidateQueries({ queryKey: ["creatives-all", workspaceId] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const preview = async (c: Creative) => {
    try {
      const { url } = await signFn({ data: { workspaceId, storagePath: c.storage_path } });
      setPreviewUrl(url); setPreviewKind(c.kind);
    } catch (e) { toast.error((e as Error).message); }
  };

  const activeFolderName = useMemo(() => {
    if (!activeFolder) return "Todos os criativos";
    return folders.find((f) => f.id === activeFolder)?.name ?? "Pasta";
  }, [activeFolder, folders]);

  // Árvore de pastas
  const roots = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Folder[]>();
    for (const f of folders) {
      if (!f.parent_id) continue;
      if (!m.has(f.parent_id)) m.set(f.parent_id, []);
      m.get(f.parent_id)!.push(f);
    }
    return m;
  }, [folders]);

  const openFolderForm = (opts: { parentId?: string | null; folder?: Folder }) => {
    if (opts.folder) {
      setEditingFolder(opts.folder);
      setFolderDraft({ name: opts.folder.name, description: opts.folder.description ?? "", parentId: opts.folder.parent_id });
    } else {
      setEditingFolder(null);
      setFolderDraft({ name: "", description: "", parentId: opts.parentId ?? null });
    }
    setShowFolderForm(true);
  };

  const onDropOnFolder = (targetFolderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolder(null);
    const creativeId = e.dataTransfer.getData("application/x-creative");
    const folderId = e.dataTransfer.getData("application/x-folder");
    if (creativeId) {
      moveCreative.mutate({ id: creativeId, folderId: targetFolderId });
    } else if (folderId && folderId !== targetFolderId) {
      moveFolder.mutate({ id: folderId, parentId: targetFolderId });
    }
  };

  const FolderNode = ({ f, depth }: { f: Folder; depth: number }) => {
    const kids = childrenOf.get(f.id) ?? [];
    const isOpen = expanded[f.id] ?? true;
    const isActive = activeFolder === f.id;
    const isOver = dragOverFolder === f.id;
    return (
      <div>
        <div
          className={`group rounded-md ${isActive ? "bg-primary/10" : isOver ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted"}`}
          draggable
          onDragStart={(e) => { e.dataTransfer.setData("application/x-folder", f.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.id); }}
          onDragLeave={() => setDragOverFolder((v) => (v === f.id ? null : v))}
          onDrop={(e) => onDropOnFolder(f.id, e)}
        >
          <div className="flex items-center gap-1 pr-1" style={{ paddingLeft: 4 + depth * 12 }}>
            <button
              onClick={() => setExpanded((x) => ({ ...x, [f.id]: !isOpen }))}
              className="p-0.5 rounded hover:bg-muted"
              title={isOpen ? "Recolher" : "Expandir"}
            >
              {kids.length > 0 ? (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="inline-block w-3" />}
            </button>
            <button
              onClick={() => setActiveFolder(f.id)}
              className={`flex-1 text-left py-1.5 text-xs flex items-center gap-1.5 ${isActive ? "text-primary font-semibold" : ""}`}
            >
              {isOpen && kids.length > 0 ? <FolderOpen className="w-3.5 h-3.5" /> : <FolderIcon className="w-3.5 h-3.5" />}
              <span className="truncate">{f.name}</span>
            </button>
            <button
              onClick={() => openFolderForm({ parentId: f.id })}
              className="opacity-0 group-hover:opacity-100 hover:text-primary p-1 rounded" title="Nova subpasta">
              <FolderPlus className="w-3 h-3" />
            </button>
            <button
              onClick={() => openFolderForm({ folder: f })}
              className="opacity-0 group-hover:opacity-100 hover:text-primary p-1 rounded" title="Renomear">
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={() => { if (confirm(`Excluir a pasta "${f.name}"? Os criativos dentro voltam para "sem pasta".`)) removeFolder.mutate(f.id); }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 rounded" title="Excluir">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        {isOpen && kids.length > 0 && (
          <div>
            {kids.map((k) => <FolderNode key={k.id} f={k} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
      {/* Sidebar pastas */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Pastas</span>
          <button
            onClick={() => openFolderForm({ parentId: null })}
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-1 text-[11px] font-semibold hover:opacity-90"
          >
            <FolderPlus className="w-3 h-3" /> Nova
          </button>
        </div>

        {showFolderForm && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-1.5">
            <input value={folderDraft.name} onChange={(e) => setFolderDraft({ ...folderDraft, name: e.target.value })}
              placeholder="Nome da pasta" className="input !py-1 !text-xs" autoFocus />
            <select
              value={folderDraft.parentId ?? ""}
              onChange={(e) => setFolderDraft({ ...folderDraft, parentId: e.target.value || null })}
              className="input !py-1 !text-xs"
            >
              <option value="">Sem pasta pai (raiz)</option>
              {folders
                .filter((f) => !editingFolder || f.id !== editingFolder.id)
                .map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <textarea value={folderDraft.description} onChange={(e) => setFolderDraft({ ...folderDraft, description: e.target.value })}
              placeholder="Descrição (opcional)" rows={2} className="input !py-1 !text-xs" />
            <div className="flex gap-1">
              <button onClick={() => saveFolder.mutate()} disabled={saveFolder.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-1 text-[11px] font-semibold hover:opacity-90 disabled:opacity-50">
                <Check className="w-3 h-3" /> Salvar
              </button>
              <button onClick={() => { setShowFolderForm(false); setEditingFolder(null); }}
                className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setActiveFolder(null)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder("__all__"); }}
          onDragLeave={() => setDragOverFolder((v) => (v === "__all__" ? null : v))}
          onDrop={(e) => onDropOnFolder(null, e)}
          className={`w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-2 ${
            activeFolder === null ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"
          } ${dragOverFolder === "__all__" ? "ring-1 ring-primary bg-primary/20" : ""}`}
        >
          <Layers className="w-3.5 h-3.5" /> Todos os criativos
        </button>

        {roots.length === 0 && (
          <div className="text-[11px] text-muted-foreground px-2 py-3">
            Nenhuma pasta ainda. Crie sua primeira pasta em <b>Nova</b>. Você pode arrastar criativos e pastas para organizar.
          </div>
        )}
        {roots.map((f) => <FolderNode key={f.id} f={f} depth={0} />)}
      </div>

      {/* Conteúdo */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-h-[80vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-sm font-semibold">{activeFolderName}</div>
            <div className="text-[11px] text-muted-foreground">
              {visibleCreatives.length} criativo(s). Arraste criativos ou pastas para organizar.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome…" className="input !py-1.5 !text-xs w-48" />
            <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer transition ${uploading ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Enviando…" : "Subir criativos"}
              <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden"
                onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
            </label>
          </div>
        </div>

        {visibleCreatives.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            Nenhum criativo aqui ainda. Clique em <b>Subir criativos</b> para adicionar imagens ou vídeos.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleCreatives.map((c) => (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData("application/x-creative", c.id); e.dataTransfer.effectAllowed = "move"; }}
              className="group rounded-lg border border-border bg-muted/20 overflow-hidden cursor-grab active:cursor-grabbing"
            >
              <button onClick={() => preview(c)} className="block w-full aspect-square bg-black/5 relative">
                <CreativeThumb creative={c} workspaceId={workspaceId} />
                <span className="absolute top-1 left-1 rounded bg-black/60 text-white text-[9px] px-1.5 py-0.5 flex items-center gap-1">
                  {c.kind === "video" ? <><Video className="w-2.5 h-2.5" /> Vídeo</> : <><ImageIcon className="w-2.5 h-2.5" /> Imagem</>}
                </span>
              </button>
              <div className="p-2 space-y-1">
                <div className="text-[11px] font-semibold truncate" title={c.display_name ?? c.original_filename ?? ""}>
                  {c.display_name ?? c.original_filename ?? "sem nome"}
                </div>
                {c.tags && c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingCreative(c);
                      setCreativeDraft({
                        display_name: c.display_name ?? "",
                        tags: (c.tags ?? []).join(", "),
                        folder_id: c.folder_id,
                      });
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-card border border-border py-1 text-[10px] font-semibold hover:bg-muted">
                    <Pencil className="w-2.5 h-2.5" /> Editar
                  </button>
                  <button
                    onClick={() => { if (confirm("Excluir este criativo?")) removeCreative.mutate(c.id); }}
                    className="rounded border border-destructive/30 text-destructive px-1.5 py-1 hover:bg-destructive/10" title="Excluir">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor de criativo */}
      {editingCreative && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditingCreative(null)}>
          <div className="bg-card rounded-xl border border-border p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">Editar criativo</div>
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">Nome do criativo*</span>
              <input value={creativeDraft.display_name} onChange={(e) => setCreativeDraft({ ...creativeDraft, display_name: e.target.value })}
                className="input" placeholder="Ex: Video-oferta-blackfriday-v3" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">Pasta</span>
              <select value={creativeDraft.folder_id ?? ""} onChange={(e) => setCreativeDraft({ ...creativeDraft, folder_id: e.target.value || null })}
                className="input">
                <option value="">Sem pasta</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">Tags (separadas por vírgula)</span>
              <input value={creativeDraft.tags} onChange={(e) => setCreativeDraft({ ...creativeDraft, tags: e.target.value })}
                className="input" placeholder="Ex: promo, video, verticais" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingCreative(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
              <button onClick={() => saveCreative.mutate()} disabled={saveCreative.isPending || !creativeDraft.display_name.trim()}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                {saveCreative.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {previewKind === "image"
              ? <img src={previewUrl} alt="preview" className="max-h-[90vh] rounded-lg" />
              : <video src={previewUrl} controls autoPlay className="max-h-[90vh] rounded-lg" />}
          </div>
        </div>
      )}
    </div>
  );
}

function CreativeThumb({ creative, workspaceId }: { creative: Creative; workspaceId: string }) {
  const signFn = useServerFn(getCreativeSignedUrl);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signFn({ data: { workspaceId, storagePath: creative.storage_path } })
      .then((r) => { if (alive) setUrl((r as { url: string }).url); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [creative.storage_path, workspaceId, signFn]);
  if (!url) return <div className="w-full h-full bg-muted animate-pulse" />;
  if (creative.kind === "video") return <video src={url} className="w-full h-full object-cover" muted />;
  return <img src={url} alt="" className="w-full h-full object-cover" />;
}
