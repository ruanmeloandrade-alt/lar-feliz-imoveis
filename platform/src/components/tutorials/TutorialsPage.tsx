import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Loader2, Pencil, PlayCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { canEditTutorials, tutorialPosition, youtubeVideoId } from "@/lib/tutorials";
import { cn } from "@/lib/utils";

type Module = Database["public"]["Tables"]["tutorial_modules"]["Row"];
type Lesson = Database["public"]["Tables"]["tutorial_lessons"]["Row"];
type Editor = {
  kind: "module" | "lesson";
  id?: string;
  moduleId: string;
  title: string;
  url: string;
  position: string;
};
type Removal = { kind: "module" | "lesson"; id: string; title: string };

export function TutorialsPage() {
  const client = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const canEdit = canEditTutorials(userId);

  useEffect(() => {
    let alive = true;
    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data.user) {
          setAuthError(
            "Não foi possível confirmar sua sessão. Entre novamente para acessar os tutoriais.",
          );
          return;
        }
        setUserId(data.user.id);
      })
      .catch(() => {
        if (alive)
          setAuthError(
            "Não foi possível confirmar sua sessão. Recarregue a página para tentar novamente.",
          );
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUserId(session?.user.id ?? null);
      if (!session) {
        setEditing(null);
        setRemoving(null);
        setAuthError("Sua sessão terminou. Entre novamente.");
      } else setAuthError("");
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const catalog = useQuery({
    queryKey: ["tutorials", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [modules, lessons] = await Promise.all([
        supabase.from("tutorial_modules").select("*").order("position").order("id"),
        supabase.from("tutorial_lessons").select("*").order("position").order("id"),
      ]);
      if (modules.error || lessons.error)
        throw new Error("Não foi possível carregar os tutoriais. Tente novamente.");
      return { modules: modules.data ?? [], lessons: lessons.data ?? [] };
    },
  });
  const modules = catalog.data?.modules ?? [];
  const lessons = catalog.data?.lessons ?? [];
  const orderedLessons = modules.flatMap((module) =>
    lessons.filter((lesson) => lesson.module_id === module.id),
  );
  const selected = orderedLessons.find((lesson) => lesson.id === selectedId) ?? orderedLessons[0];
  const selectedIndex = orderedLessons.findIndex((lesson) => lesson.id === selected?.id);
  const selectedModule = modules.find((module) => module.id === selected?.module_id);

  function openEditor(kind: Editor["kind"], module?: Module, lesson?: Lesson) {
    if (!canEdit) return;
    setFormError("");
    setEditing({
      kind,
      id: kind === "module" ? module?.id : lesson?.id,
      moduleId: lesson?.module_id ?? module?.id ?? "",
      title: lesson?.title ?? (kind === "module" ? (module?.title ?? "") : ""),
      url: lesson ? `https://www.youtube.com/watch?v=${lesson.video_id}` : "",
      position: String(
        lesson?.position ??
          (kind === "module"
            ? (module?.position ??
              Math.min(1000000, Math.max(-1, ...modules.map((m) => m.position)) + 1))
            : Math.min(
                1000000,
                Math.max(
                  -1,
                  ...lessons.filter((l) => l.module_id === module?.id).map((l) => l.position),
                ) + 1,
              )),
      ),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !editing || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const title = editing.title.trim();
      if (!title || title.length > 160) throw new Error("Informe um nome com até 160 caracteres.");
      const position = tutorialPosition(editing.position);
      if (editing.kind === "module") {
        const payload = { title, position };
        const result = editing.id
          ? await supabase
              .from("tutorial_modules")
              .update(payload)
              .eq("id", editing.id)
              .select("id")
              .single()
          : await supabase.from("tutorial_modules").insert(payload).select("id").single();
        if (result.error) throw result.error;
      } else {
        const video_id = youtubeVideoId(editing.url);
        if (!video_id) throw new Error("Cole um link HTTPS válido de um vídeo do YouTube.");
        if (!modules.some((module) => module.id === editing.moduleId))
          throw new Error("Selecione o módulo da aula.");
        const payload = { title, position, module_id: editing.moduleId, video_id };
        const result = editing.id
          ? await supabase
              .from("tutorial_lessons")
              .update(payload)
              .eq("id", editing.id)
              .select("id")
              .single()
          : await supabase.from("tutorial_lessons").insert(payload).select("id").single();
        if (result.error) throw result.error;
        setSelectedId(result.data.id);
      }
      setEditing(null);
      toast.success("Tutorial salvo.");
      await client.invalidateQueries({ queryKey: ["tutorials"] });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Verifique sua conexão e permissão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!canEdit || !removing || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const result =
        removing.kind === "module"
          ? await supabase
              .from("tutorial_modules")
              .delete()
              .eq("id", removing.id)
              .select("id")
              .single()
          : await supabase
              .from("tutorial_lessons")
              .delete()
              .eq("id", removing.id)
              .select("id")
              .single();
      if (result.error) throw result.error;
      setRemoving(null);
      toast.success("Conteúdo excluído.");
      await client.invalidateQueries({ queryKey: ["tutorials"] });
    } catch {
      setFormError(
        "Não foi possível excluir. Verifique sua conexão e permissão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1 p-5 pt-16 md:p-8">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              Configurações
            </p>
            <h1 className="text-3xl font-bold">Tutoriais</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Aprenda a usar a Vanessa Simoni, uma aula de cada vez.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Modo de edição</span>
              <Button onClick={() => openEditor("module")}>
                <Plus />
                Adicionar módulo
              </Button>
            </div>
          )}
        </header>
        {authError ? (
          <div role="alert" className="rounded-xl border p-6">
            <p>{authError}</p>
            <a href="/auth" className="mt-3 inline-block underline">
              Entrar novamente
            </a>
          </div>
        ) : !userId || catalog.isPending ? (
          <div role="status" className="flex items-center gap-2 p-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando tutoriais...
          </div>
        ) : catalog.isError ? (
          <div role="alert" className="rounded-xl border p-6">
            <p>{catalog.error.message}</p>
            <Button className="mt-3" variant="outline" onClick={() => void catalog.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : modules.length === 0 ? (
          <div className="grid justify-items-center rounded-2xl border bg-card px-6 py-16 text-center">
            <BookOpen className="mb-4 h-10 w-10 text-primary" />
            <h2 className="text-lg font-semibold">Os tutoriais começam aqui</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {canEdit
                ? "Adicione o primeiro módulo e cadastre suas aulas com os links do YouTube."
                : "Os módulos e as aulas aparecerão aqui assim que forem cadastrados."}
            </p>
            {canEdit && (
              <Button className="mt-5" onClick={() => openEditor("module")}>
                <Plus />
                Adicionar primeiro módulo
              </Button>
            )}
          </div>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <section aria-label="Módulos e aulas" className="grid gap-3">
              {modules.map((module, index) => (
                <div key={module.id} className="overflow-hidden rounded-xl border bg-card">
                  <div className="p-4">
                    <p className="text-xs text-muted-foreground">Módulo {index + 1}</p>
                    <h2 className="mt-1 break-words font-semibold">{module.title}</h2>
                    {canEdit && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditor("lesson", module)}
                        >
                          <Plus />
                          Aula
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Editar módulo ${module.title}`}
                          onClick={() => openEditor("module", module)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Excluir módulo ${module.title}`}
                          onClick={() => {
                            setFormError("");
                            setRemoving({ kind: "module", id: module.id, title: module.title });
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                  <ol className="border-t">
                    {lessons
                      .filter((lesson) => lesson.module_id === module.id)
                      .map((lesson) => (
                        <li key={lesson.id} className="flex items-center border-b last:border-0">
                          <button
                            type="button"
                            aria-current={selected?.id === lesson.id ? "true" : undefined}
                            onClick={() => setSelectedId(lesson.id)}
                            className={cn(
                              "flex min-h-12 min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left text-sm hover:bg-accent",
                              selected?.id === lesson.id &&
                                "bg-primary/10 font-semibold text-primary",
                            )}
                          >
                            <PlayCircle className="h-4 w-4 shrink-0" />
                            <span className="break-words">{lesson.title}</span>
                          </button>
                          {canEdit && (
                            <div className="flex pr-2">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Editar aula ${lesson.title}`}
                                onClick={() => openEditor("lesson", module, lesson)}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Excluir aula ${lesson.title}`}
                                onClick={() => {
                                  setFormError("");
                                  setRemoving({
                                    kind: "lesson",
                                    id: lesson.id,
                                    title: lesson.title,
                                  });
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    {!lessons.some((lesson) => lesson.module_id === module.id) && (
                      <li className="px-4 py-3 text-xs text-muted-foreground">
                        Nenhuma aula cadastrada neste módulo.
                      </li>
                    )}
                  </ol>
                </div>
              ))}
            </section>
            <section
              className="min-w-0 overflow-hidden rounded-2xl border bg-card"
              aria-label="Assistir aula"
            >
              {selected ? (
                <>
                  <iframe
                    key={selected.video_id}
                    className="aspect-video w-full border-0 bg-black"
                    src={`https://www.youtube-nocookie.com/embed/${selected.video_id}`}
                    title={selected.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                  <div className="p-5">
                    <p className="text-xs text-muted-foreground">
                      {selectedModule?.title} · Aula {selectedIndex + 1} de {orderedLessons.length}
                    </p>
                    <h2 className="mt-2 break-words text-xl font-semibold">{selected.title}</h2>
                    <a
                      className="mt-3 inline-flex items-center gap-2 text-sm text-primary underline"
                      href={`https://www.youtube.com/watch?v=${selected.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir no YouTube
                    </a>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Se o vídeo não carregar, abra no YouTube. O vídeo precisa permitir reprodução
                      incorporada.
                    </p>
                    <div className="mt-6 flex flex-wrap justify-between gap-2">
                      <Button
                        variant="outline"
                        disabled={selectedIndex <= 0}
                        onClick={() => setSelectedId(orderedLessons[selectedIndex - 1].id)}
                      >
                        Aula anterior
                      </Button>
                      <Button
                        disabled={selectedIndex >= orderedLessons.length - 1}
                        onClick={() => setSelectedId(orderedLessons[selectedIndex + 1].id)}
                      >
                        Próxima aula
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-10 text-center text-muted-foreground">
                  As aulas aparecerão aqui quando forem cadastradas.
                </div>
              )}
            </section>
          </div>
        )}

        <Dialog
          open={Boolean(editing) && canEdit}
          onOpenChange={(open) => {
            if (!open && !busy) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? "Editar" : "Adicionar"}{" "}
                {editing?.kind === "module" ? "módulo" : "aula"}
              </DialogTitle>
              <DialogDescription>
                Organize os tutoriais da Vanessa Simoni. As alterações salvas ficam disponíveis para
                todos os usuários.
              </DialogDescription>
            </DialogHeader>
            {editing && (
              <form className="grid gap-4" onSubmit={save}>
                <div className="grid gap-2">
                  <Label htmlFor="tutorial-title">
                    Nome {editing.kind === "module" ? "do módulo" : "da aula"}
                  </Label>
                  <Input
                    id="tutorial-title"
                    autoFocus
                    required
                    maxLength={160}
                    value={editing.title}
                    onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                  />
                </div>
                {editing.kind === "lesson" && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="tutorial-module">Módulo</Label>
                      <select
                        id="tutorial-module"
                        required
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                        value={editing.moduleId}
                        onChange={(event) =>
                          setEditing({ ...editing, moduleId: event.target.value })
                        }
                      >
                        {modules.map((module) => (
                          <option key={module.id} value={module.id}>
                            {module.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="tutorial-url">Link do YouTube</Label>
                      <Input
                        id="tutorial-url"
                        type="url"
                        required
                        maxLength={2048}
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={editing.url}
                        onChange={(event) => setEditing({ ...editing, url: event.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use vídeo público ou não listado com incorporação permitida.
                      </p>
                    </div>
                  </>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="tutorial-position">Ordem de exibição</Label>
                  <Input
                    id="tutorial-position"
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    required
                    value={editing.position}
                    onChange={(event) => setEditing({ ...editing, position: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Números menores aparecem primeiro. Para mover, altere a ordem.
                  </p>
                </div>
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(removing) && canEdit}
          onOpenChange={(open) => {
            if (!open && !busy) setRemoving(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir {removing?.kind === "module" ? "módulo" : "aula"}?</DialogTitle>
              <DialogDescription>
                Excluir “{removing?.title}”
                {removing?.kind === "module" ? " e todas as aulas deste módulo" : ""}? Esta ação não
                pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
                {busy ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
