import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive, ArchiveRestore, CalendarPlus, Check, Folder, FolderOpen, FolderPlus,
  LayoutGrid, ListChecks, Menu, MoreHorizontal, Pencil, Pin, PinOff, Plus,
  Search, StickyNote, Trash2, Type, X,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import {
  listNotes, createNote, updateNote, deleteNote,
  listNoteGroups, createNoteGroup, updateNoteGroup, deleteNoteGroup,
  type NoteRow, type NoteKind, type NoteItem, type NoteGroupRow,
} from "@/lib/notes.functions";
import { createTask } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notas")({
  head: () => ({ meta: [{ title: "Notas · Vanessa Simoni" }, { name: "description", content: "Notas, checklists e organização pessoal da operação." }] }),
  component: NotasPage,
});

const COLORS = [
  { id: "default", label: "Bege", paper: "bg-[#fdf6e3] dark:bg-[#f4ead1]", ink: "text-[#3d2f14]", dot: "bg-[#f5e9c8]" },
  { id: "yellow", label: "Amarelo", paper: "bg-[#fff5b0] dark:bg-[#f8ea8b]", ink: "text-[#4a3a00]", dot: "bg-[#f5e07a]" },
  { id: "green", label: "Menta", paper: "bg-[#cfeecf] dark:bg-[#b9e6b9]", ink: "text-[#1c3d1c]", dot: "bg-[#a9dea9]" },
  { id: "blue", label: "Céu", paper: "bg-[#cfe6ff] dark:bg-[#b9d8fb]", ink: "text-[#0e2b52]", dot: "bg-[#a8ccf3]" },
  { id: "purple", label: "Lilás", paper: "bg-[#e2d8ff] dark:bg-[#d2c6ff]", ink: "text-[#2c1a5b]", dot: "bg-[#c7b8ff]" },
  { id: "pink", label: "Rosé", paper: "bg-[#ffd6e2] dark:bg-[#ffc4d5]", ink: "text-[#5b1030]", dot: "bg-[#ffb2c8]" },
  { id: "orange", label: "Melão", paper: "bg-[#ffd9b3] dark:bg-[#ffc891]", ink: "text-[#5a2a05]", dot: "bg-[#ffb877]" },
] as const;

function noteColor(id: string) { return COLORS.find((color) => color.id === id) ?? COLORS[0]; }
function newItem(): NoteItem { return { id: Math.random().toString(36).slice(2, 10), text: "", done: false }; }

type ViewMode = "board" | "grid";
type NoteDraft = { title: string; content: string; color: string; kind: NoteKind; items: NoteItem[]; groupId: string | null };

function NotasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotes);
  const createFn = useServerFn(createNote);
  const updateFn = useServerFn(updateNote);
  const deleteFn = useServerFn(deleteNote);
  const listGroupsFn = useServerFn(listNoteGroups);
  const createGroupFn = useServerFn(createNoteGroup);
  const updateGroupFn = useServerFn(updateNoteGroup);
  const deleteGroupFn = useServerFn(deleteNoteGroup);
  const createTaskFn = useServerFn(createTask);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<ViewMode>("board");
  const [activeGroup, setActiveGroup] = useState("all");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<NoteKind | null>(null);
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<NoteRow | null>(null);
  const [groupToRename, setGroupToRename] = useState<NoteGroupRow | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<NoteGroupRow | null>(null);

  const groupsQuery = useQuery({ queryKey: ["user-note-groups"], queryFn: () => listGroupsFn() });
  const groups = (groupsQuery.data?.groups ?? []) as NoteGroupRow[];
  const notesQuery = useInfiniteQuery({
    queryKey: ["user-notes", showArchived, activeGroup],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listFn({
      data: {
        archived: showArchived,
        groupId: activeGroup === "all" ? undefined : activeGroup === "none" ? null : activeGroup,
        page: Number(pageParam),
        pageSize: 40,
      },
    }),
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });
  const notes = useMemo(() => (notesQuery.data?.pages ?? []).flatMap((page) => page.notes as NoteRow[]), [notesQuery.data?.pages]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) => [note.title, note.content, ...note.items.map((item) => item.text)].join(" ").toLowerCase().includes(query));
  }, [notes, search]);

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["user-notes"] }); void qc.invalidateQueries({ queryKey: ["user-note-groups"] }); };
  const createMut = useMutation({ mutationFn: (draft: NoteDraft) => createFn({ data: draft }), onSuccess: invalidate });
  const updateMut = useMutation({ mutationFn: (patch: Parameters<typeof updateFn>[0]["data"]) => updateFn({ data: patch }), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: invalidate });
  const createGroupMut = useMutation({ mutationFn: (name: string) => createGroupFn({ data: { name } }), onSuccess: invalidate });
  const renameGroupMut = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => updateGroupFn({ data: { id, name } }), onSuccess: invalidate });
  const deleteGroupMut = useMutation({ mutationFn: ({ id, deleteNotes }: { id: string; deleteNotes: boolean }) => deleteGroupFn({ data: { id, deleteNotes } }), onSuccess: invalidate });
  const taskMut = useMutation({
    mutationFn: (note: NoteRow) => {
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const checklist = note.items.filter((item) => item.text.trim()).map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text.trim()}`).join("\n");
      const description = [note.content.trim(), checklist].filter(Boolean).join("\n\n");
      return createTaskFn({ data: { title: note.title.trim() || "Tarefa da nota", description: description || undefined, kind: "tarefa", startAt: start.toISOString(), endAt: end.toISOString() } });
    },
  });

  const activeLabel = activeGroup === "all" ? "Todas as notas" : activeGroup === "none" ? "Sem grupo" : groups.find((group) => group.id === activeGroup)?.name ?? "Grupo";
  const pinned = filtered.filter((note) => note.isPinned);
  const others = filtered.filter((note) => !note.isPinned);
  const mutationFailed = createMut.isError || updateMut.isError || deleteMut.isError || createGroupMut.isError || renameGroupMut.isError || deleteGroupMut.isError || taskMut.isError;

  const toggleItem = (note: NoteRow, id: string) => updateMut.mutate({ id: note.id, items: note.items.map((item) => item.id === id ? { ...item, done: !item.done } : item) });
  const actions = {
    onEdit: setEditing,
    onPin: (note: NoteRow) => updateMut.mutate({ id: note.id, isPinned: !note.isPinned }),
    onArchive: (note: NoteRow) => updateMut.mutate({ id: note.id, isArchived: !note.isArchived }),
    onDelete: setNoteToDelete,
    onTask: (note: NoteRow) => taskMut.mutate(note),
    onMove: (note: NoteRow, groupId: string | null) => updateMut.mutate({ id: note.id, groupId }),
    onToggleItem: toggleItem,
  };

  const confirmDeleteNote = () => {
    if (!noteToDelete) return;
    const id = noteToDelete.id;
    deleteMut.mutate(id, {
      onSuccess: () => {
        if (editing?.id === id) setEditing(null);
        setNoteToDelete(null);
      },
    });
  };

  return <div className="flex h-[100dvh] min-h-0 bg-background text-foreground"><AppSidebar />
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 md:flex"><GroupsPanel groups={groups} active={activeGroup} totalCount={groupsQuery.data?.totalCount ?? 0} unassignedCount={groupsQuery.data?.unassignedCount ?? 0} onSelect={setActiveGroup} onCreate={(name) => createGroupMut.mutate(name)} onRename={setGroupToRename} onDelete={setGroupToDelete} /></aside>
    <main className="min-w-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur"><div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-4 md:px-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2"><StickyNote className="h-5 w-5 text-primary" /><div className="min-w-0"><h1 className="text-lg font-semibold">Notas</h1><p className="truncate text-[11px] text-muted-foreground">{activeLabel}</p></div><button type="button" onClick={() => setGroupsOpen(true)} className="ml-auto grid min-h-10 min-w-10 place-items-center rounded-lg border border-border md:hidden" aria-label="Abrir grupos"><Menu className="h-4 w-4" /></button></div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end"><div className="relative min-w-[180px] flex-1 lg:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nas notas carregadas" className="min-h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border"><ToolbarButton active={view === "board"} onClick={() => setView("board")}><ListChecks className="h-3.5 w-3.5" />Mural</ToolbarButton><ToolbarButton active={view === "grid"} onClick={() => setView("grid")}><LayoutGrid className="h-3.5 w-3.5" />Grade</ToolbarButton></div><button type="button" onClick={() => setShowArchived((value) => !value)} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold", showArchived ? "border-primary bg-primary/10 text-primary" : "border-border bg-card")}>{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{showArchived ? "Ativas" : "Arquivadas"}</button><NewNoteButton onPick={setComposerKind} /></div>
      </div></header>

      <div className={cn("mx-auto max-w-[1500px] space-y-5 px-3 py-4 sm:px-4 md:px-6", view === "board" && "bg-muted/20")}>
        {composerKind && <NoteEditor kind={composerKind} groups={groups} defaultGroupId={activeGroup !== "all" && activeGroup !== "none" ? activeGroup : null} saving={createMut.isPending} onClose={() => setComposerKind(null)} onSave={(draft) => createMut.mutate(draft, { onSuccess: () => setComposerKind(null) })} />}
        {(notesQuery.isError || groupsQuery.isError) && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">Não foi possível carregar suas notas. Tente novamente.</div>}
        {mutationFailed && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">Não foi possível concluir a alteração. Tente novamente.</div>}
        {notesQuery.isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Carregando notas…</p> : filtered.length === 0 ? <EmptyState archived={showArchived} grouped={activeGroup !== "all"} /> : <>
          {pinned.length > 0 && <NoteSection title="Fixadas" notes={pinned} groups={groups} view={view} {...actions} />}
          {others.length > 0 && <NoteSection title={pinned.length ? (showArchived ? "Arquivadas" : "Outras") : undefined} notes={others} groups={groups} view={view} {...actions} />}
          {notesQuery.hasNextPage && <div className="flex justify-center pt-2"><button type="button" disabled={notesQuery.isFetchingNextPage} onClick={() => void notesQuery.fetchNextPage()} className="min-h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50">{notesQuery.isFetchingNextPage ? "Carregando…" : "Carregar mais"}</button></div>}
        </>}
      </div>
    </main>

    {groupsOpen && <div className="fixed inset-0 z-[70] bg-black/55 md:hidden" onClick={() => setGroupsOpen(false)}><div className="h-full w-[min(86vw,340px)] bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">Grupos de notas</h2><p className="text-[10px] text-muted-foreground">Organize sem perder espaço de leitura.</p></div><button type="button" onClick={() => setGroupsOpen(false)} className="grid min-h-10 min-w-10 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button></div><GroupsPanel groups={groups} active={activeGroup} totalCount={groupsQuery.data?.totalCount ?? 0} unassignedCount={groupsQuery.data?.unassignedCount ?? 0} onSelect={(id) => { setActiveGroup(id); setGroupsOpen(false); }} onCreate={(name) => createGroupMut.mutate(name)} onRename={setGroupToRename} onDelete={setGroupToDelete} /></div></div>}
    {editing && <NoteEditor note={editing} kind={editing.kind} groups={groups} defaultGroupId={editing.groupId} saving={updateMut.isPending} onClose={() => setEditing(null)} onSave={(draft) => updateMut.mutate({ id: editing.id, ...draft }, { onSuccess: () => setEditing(null) })} onDelete={() => setNoteToDelete(editing)} />}
    {noteToDelete && <ConfirmDialog title="Excluir nota?" description="Esta ação remove a nota permanentemente." confirmLabel="Excluir nota" busy={deleteMut.isPending} onCancel={() => setNoteToDelete(null)} onConfirm={confirmDeleteNote} />}
    {groupToRename && <RenameGroupDialog group={groupToRename} busy={renameGroupMut.isPending} onCancel={() => setGroupToRename(null)} onConfirm={(name) => renameGroupMut.mutate({ id: groupToRename.id, name }, { onSuccess: () => setGroupToRename(null) })} />}
    {groupToDelete && <DeleteGroupDialog group={groupToDelete} busy={deleteGroupMut.isPending} onCancel={() => setGroupToDelete(null)} onConfirm={(deleteNotes) => deleteGroupMut.mutate({ id: groupToDelete.id, deleteNotes }, { onSuccess: () => { if (activeGroup === groupToDelete.id) setActiveGroup("all"); setGroupToDelete(null); } })} />}
  </div>;
}

function ToolbarButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={cn("inline-flex min-h-10 items-center justify-center gap-1.5 px-3 text-xs font-semibold", active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>{children}</button>; }

function NewNoteButton({ onPick }: { onPick: (kind: NoteKind) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative"><button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Nova nota</button>{open && <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"><button type="button" onClick={() => { onPick("text"); setOpen(false); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-sm hover:bg-accent"><Type className="h-4 w-4" />Nota de texto</button><button type="button" onClick={() => { onPick("checklist"); setOpen(false); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-sm hover:bg-accent"><ListChecks className="h-4 w-4" />Checklist</button></div>}</div>;
}

function NoteSection({ title, notes, view, groups, ...actions }: { title?: string; notes: NoteRow[]; view: ViewMode; groups: NoteGroupRow[]; onEdit: (note: NoteRow) => void; onPin: (note: NoteRow) => void; onArchive: (note: NoteRow) => void; onDelete: (note: NoteRow) => void; onTask: (note: NoteRow) => void; onMove: (note: NoteRow, groupId: string | null) => void; onToggleItem: (note: NoteRow, id: string) => void }) {
  return <section className="space-y-2">{title && <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>}<div className={cn("grid gap-3", view === "board" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>{notes.map((note) => <NoteCard key={note.id} note={note} groups={groups} {...actions} />)}</div></section>;
}

function NoteCard({ note, groups, onEdit, onPin, onArchive, onDelete, onTask, onMove, onToggleItem }: { note: NoteRow; groups: NoteGroupRow[]; onEdit: (note: NoteRow) => void; onPin: (note: NoteRow) => void; onArchive: (note: NoteRow) => void; onDelete: (note: NoteRow) => void; onTask: (note: NoteRow) => void; onMove: (note: NoteRow, groupId: string | null) => void; onToggleItem: (note: NoteRow, id: string) => void }) {
  const color = noteColor(note.color); const [menuOpen, setMenuOpen] = useState(false);
  return <article className={cn("relative flex min-h-[160px] flex-col rounded-xl border border-black/10 p-4 shadow-sm", color.paper, color.ink)}><button type="button" onClick={() => onEdit(note)} className="min-w-0 flex-1 text-left"><div className="mb-2 flex items-start gap-2"><h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug">{note.title || "Sem título"}</h3>{note.isPinned && <Pin className="h-3.5 w-3.5 shrink-0" />}</div>{note.kind === "text" ? <p className="line-clamp-8 whitespace-pre-wrap text-sm leading-5 opacity-85">{note.content || "Sem conteúdo"}</p> : <ul className="space-y-1.5">{note.items.slice(0, 8).map((item) => <li key={item.id} className="flex items-start gap-2 text-sm"><span onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => onToggleItem(note, item.id)} className={cn("mt-0.5 grid h-5 w-5 place-items-center rounded border", item.done ? "border-emerald-700 bg-emerald-600 text-white" : "border-current/50 bg-white/50")} aria-label={item.done ? "Desmarcar item" : "Marcar item"}>{item.done && <Check className="h-3 w-3" />}</button></span><span className={cn("min-w-0 flex-1", item.done && "line-through opacity-60")}>{item.text || "Item vazio"}</span></li>)}</ul>}</button><div className="mt-3 flex flex-wrap items-center gap-1 border-t border-black/10 pt-2"><Action icon={note.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />} label={note.isPinned ? "Desafixar" : "Fixar"} onClick={() => onPin(note)} /><Action icon={note.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} label={note.isArchived ? "Desarquivar" : "Arquivar"} onClick={() => onArchive(note)} /><Action icon={<CalendarPlus className="h-3.5 w-3.5" />} label="Criar tarefa" onClick={() => onTask(note)} /><div className="relative ml-auto"><button type="button" onClick={() => setMenuOpen((value) => !value)} className="grid min-h-9 min-w-9 place-items-center rounded-lg hover:bg-black/10" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></button>{menuOpen && <div className="absolute bottom-10 right-0 z-30 w-52 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"><div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">Mover para grupo</div><MenuItem onClick={() => { onMove(note, null); setMenuOpen(false); }}><Folder className="h-4 w-4" />Sem grupo</MenuItem>{groups.map((group) => <MenuItem key={group.id} onClick={() => { onMove(note, group.id); setMenuOpen(false); }}><Folder className="h-4 w-4" />{group.name}</MenuItem>)}<MenuItem danger onClick={() => { onDelete(note); setMenuOpen(false); }}><Trash2 className="h-4 w-4" />Excluir</MenuItem></div>}</div></div></article>;
}

function Action({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} title={label} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold hover:bg-black/10"><span>{icon}</span><span className="hidden sm:inline">{label}</span></button>; }
function MenuItem({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) { return <button type="button" onClick={onClick} className={cn("flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs hover:bg-accent", danger && "text-destructive")}>{children}</button>; }

function GroupsPanel({ groups, active, totalCount, unassignedCount, onSelect, onCreate, onRename, onDelete }: { groups: NoteGroupRow[]; active: string; totalCount: number; unassignedCount: number; onSelect: (id: string) => void; onCreate: (name: string) => void; onRename: (group: NoteGroupRow) => void; onDelete: (group: NoteGroupRow) => void }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState("");
  const submit = () => { const value = name.trim(); if (value) onCreate(value); setName(""); setCreating(false); };
  return <div className="flex h-full w-full flex-col overflow-y-auto p-3"><div className="mb-2 flex items-center gap-2 px-1"><span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Grupos</span><button type="button" onClick={() => setCreating(true)} className="ml-auto grid min-h-9 min-w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Novo grupo"><FolderPlus className="h-4 w-4" /></button></div><GroupButton active={active === "all"} label="Todas as notas" count={totalCount} icon={<FolderOpen className="h-4 w-4" />} onClick={() => onSelect("all")} /><GroupButton active={active === "none"} label="Sem grupo" count={unassignedCount} icon={<Folder className="h-4 w-4" />} onClick={() => onSelect("none")} />{groups.map((group) => <div key={group.id} className="group flex items-center gap-1"><GroupButton active={active === group.id} label={group.name} count={group.noteCount ?? 0} icon={<Folder className="h-4 w-4" />} onClick={() => onSelect(group.id)} /><button type="button" onClick={() => onRename(group)} className="grid min-h-9 min-w-9 place-items-center rounded-lg opacity-70 hover:bg-muted md:opacity-0 md:group-hover:opacity-100" aria-label={`Renomear ${group.name}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => onDelete(group)} className="grid min-h-9 min-w-9 place-items-center rounded-lg text-destructive opacity-70 hover:bg-destructive/10 md:opacity-0 md:group-hover:opacity-100" aria-label={`Excluir ${group.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}{creating && <div className="mt-2 flex gap-2"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); if (event.key === "Escape") setCreating(false); }} className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none" placeholder="Nome do grupo" /><button type="button" onClick={submit} className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Criar</button></div>}</div>;
}
function GroupButton({ active, label, count, icon, onClick }: { active: boolean; label: string; count: number; icon: ReactNode; onClick: () => void }) { return <button type="button" onClick={onClick} className={cn("flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left text-sm", active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted")}><span className="shrink-0">{icon}</span><span className="min-w-0 flex-1 truncate">{label}</span>{count > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>}</button>; }

function NoteEditor({ note, kind, groups, defaultGroupId, saving, onClose, onSave, onDelete }: { note?: NoteRow; kind: NoteKind; groups: NoteGroupRow[]; defaultGroupId: string | null; saving: boolean; onClose: () => void; onSave: (draft: NoteDraft) => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(note?.title ?? ""); const [content, setContent] = useState(note?.content ?? ""); const [color, setColor] = useState(note?.color ?? "default"); const [groupId, setGroupId] = useState<string | null>(defaultGroupId); const [items, setItems] = useState<NoteItem[]>(note?.items?.length ? note.items : kind === "checklist" ? [newItem()] : []);
  const palette = noteColor(color); const canSave = kind === "text" ? Boolean(title.trim() || content.trim()) : Boolean(title.trim() || items.some((item) => item.text.trim()));
  const editor = <div className={cn("w-full rounded-2xl border border-black/10 p-4 shadow-2xl", palette.paper, palette.ink)}><div className="mb-3 flex items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">{kind === "text" ? <Type className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}{kind === "text" ? "Nota" : "Checklist"}</span><select value={groupId ?? ""} onChange={(event) => setGroupId(event.target.value || null)} className="ml-auto min-h-9 rounded-lg bg-black/5 px-2 text-xs outline-none"><option value="">Sem grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" onClick={onClose} className="grid min-h-9 min-w-9 place-items-center rounded-lg hover:bg-black/10"><X className="h-4 w-4" /></button></div><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título" className="mb-3 w-full bg-transparent text-base font-semibold outline-none" />{kind === "text" ? <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={8} placeholder="Escreva sua nota…" className="w-full resize-y bg-transparent text-sm leading-6 outline-none" /> : <ChecklistEditor items={items} onChange={setItems} />}<div className="mt-4 flex flex-wrap items-center gap-2"><div className="flex flex-wrap gap-1">{COLORS.map((option) => <button key={option.id} type="button" title={option.label} onClick={() => setColor(option.id)} className={cn("h-7 w-7 rounded-full border-2", option.dot, color === option.id ? "scale-110 border-primary" : "border-black/20")} />)}</div><div className="ml-auto flex flex-wrap gap-2">{onDelete && <button type="button" onClick={onDelete} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"><Trash2 className="mr-1 inline h-4 w-4" />Excluir</button>}<button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-black/15 px-3 text-xs font-semibold">Cancelar</button><button type="button" disabled={!canSave || saving} onClick={() => onSave({ title, content, color, kind, items, groupId })} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button></div></div></div>;
  if (!note) return <div className="max-w-2xl">{editor}</div>;
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}><div className="max-h-[92dvh] w-full overflow-y-auto sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>{editor}</div></div>;
}

function ChecklistEditor({ items, onChange }: { items: NoteItem[]; onChange: (items: NoteItem[]) => void }) {
  const patch = (id: string, changes: Partial<NoteItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...changes } : item)); const add = () => onChange([...items, newItem()]);
  return <div className="space-y-2">{items.map((item) => <div key={item.id} className="flex items-center gap-2"><button type="button" onClick={() => patch(item.id, { done: !item.done })} className={cn("grid h-6 w-6 shrink-0 place-items-center rounded border", item.done ? "border-emerald-700 bg-emerald-600 text-white" : "border-current/50 bg-white/50")}>{item.done && <Check className="h-3.5 w-3.5" />}</button><input value={item.text} onChange={(event) => patch(item.id, { text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} className={cn("min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none", item.done && "line-through opacity-60")} placeholder="Item da lista" /><button type="button" onClick={() => onChange(items.filter((current) => current.id !== item.id))} className="grid min-h-9 min-w-9 place-items-center rounded-lg hover:bg-black/10" aria-label="Remover item"><X className="h-3.5 w-3.5" /></button></div>)}<button type="button" onClick={add} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold opacity-75 hover:bg-black/10 hover:opacity-100"><Plus className="h-3.5 w-3.5" />Adicionar item</button></div>;
}

function ConfirmDialog({ title, description, confirmLabel, busy, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><h2 className="text-base font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancelar</button><button type="button" disabled={busy} onClick={onConfirm} className="min-h-10 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground disabled:opacity-50">{busy ? "Excluindo…" : confirmLabel}</button></div></div></div>;
}

function RenameGroupDialog({ group, busy, onCancel, onConfirm }: { group: NoteGroupRow; busy: boolean; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(group.name);
  const value = name.trim();
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><h2 className="text-base font-semibold">Renomear grupo</h2><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); if (event.key === "Enter" && value && !busy) onConfirm(value); }} className="mt-4 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancelar</button><button type="button" disabled={!value || busy} onClick={() => onConfirm(value)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : "Salvar"}</button></div></div></div>;
}

function DeleteGroupDialog({ group, busy, onCancel, onConfirm }: { group: NoteGroupRow; busy: boolean; onCancel: () => void; onConfirm: (deleteNotes: boolean) => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><h2 className="text-base font-semibold">Excluir grupo “{group.name}”?</h2><p className="mt-2 text-sm text-muted-foreground">Escolha o que deve acontecer com as notas que estão dentro deste grupo.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancelar</button><button type="button" disabled={busy} onClick={() => onConfirm(false)} className="min-h-10 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted">Manter notas sem grupo</button><button type="button" disabled={busy} onClick={() => onConfirm(true)} className="min-h-10 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground disabled:opacity-50">{busy ? "Excluindo…" : "Excluir grupo e notas"}</button></div></div></div>;
}

function EmptyState({ archived, grouped }: { archived: boolean; grouped: boolean }) { return <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-14 text-center"><StickyNote className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{archived ? "Nenhuma nota arquivada." : grouped ? "Este grupo ainda não possui notas." : "Seu mural está vazio."}</p><p className="mt-1 text-xs text-muted-foreground">{archived ? "As notas arquivadas aparecerão aqui." : "Crie uma nota de texto ou checklist para começar."}</p></div>; }
