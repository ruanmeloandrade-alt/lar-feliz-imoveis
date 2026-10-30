import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Award, BookOpenCheck, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/partners/faculdade")({ component: PartnersAcademyPage });

type Course = { id: string; title: string; description: string | null; sort_order: number };
type Module = { id: string; course_id: string; title: string; description: string | null; sort_order: number };
type Lesson = { id: string; module_id: string; title: string; summary: string | null; sort_order: number };
type Progress = { completed_lessons: number; total_lessons: number; progress_percent: number; certified: boolean; certificate_code?: string | null; issued_at?: string | null };

function PartnersAcademyPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [savingLesson, setSavingLesson] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    const [{ data: auth }, progressResult] = await Promise.all([
      supabase.auth.getUser(),
      (supabase as any).rpc("partner_program_my_academy_progress"),
    ]);
    if (!auth.user) { setError("Faça login para acessar a Faculdade Partners."); setLoading(false); return; }
    if (progressResult.error) { setError(progressResult.error.message); setLoading(false); return; }

    const [courseResult, moduleResult, lessonResult, completedResult] = await Promise.all([
      (supabase as any).from("partner_program_academy_courses").select("id,title,description,sort_order").eq("published", true).order("sort_order"),
      (supabase as any).from("partner_program_academy_modules").select("id,course_id,title,description,sort_order").eq("published", true).order("sort_order"),
      (supabase as any).from("partner_program_academy_lessons").select("id,module_id,title,summary,sort_order").eq("published", true).order("sort_order"),
      (supabase as any).from("partner_program_academy_progress").select("lesson_id").eq("user_id", auth.user.id),
    ]);
    const firstError = [courseResult, moduleResult, lessonResult, completedResult].find((r: any) => r.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setCourses(courseResult.data ?? []); setModules(moduleResult.data ?? []); setLessons(lessonResult.data ?? []);
      setCompleted(new Set((completedResult.data ?? []).map((r: any) => r.lesson_id)));
      setProgress(progressResult.data ?? null);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const courseTree = useMemo(() => courses.map((course) => ({
    ...course,
    modules: modules.filter((m) => m.course_id === course.id).map((module) => ({ ...module, lessons: lessons.filter((l) => l.module_id === module.id) })),
  })), [courses, modules, lessons]);

  async function completeLesson(lessonId: string) {
    setSavingLesson(lessonId);
    const { error: rpcError } = await (supabase as any).rpc("partner_program_complete_academy_lesson", { p_lesson_id: lessonId });
    setSavingLesson(null);
    if (rpcError) setError(rpcError.message); else await load();
  }

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6">
      <div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Vanessa Simoni Partners</p><h1 className="mt-2 text-3xl font-black">Faculdade Partners</h1><p className="mt-2 text-sm text-slate-500">Formação e certificação oficial para Partners.</p></div>
      <div className="flex gap-2"><Link to="/partners/comunidade" className="rounded-xl border px-4 py-2 text-sm font-bold">Comunidade</Link><Link to="/contas" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">Voltar</Link></div>
    </header>

    {loading ? <State icon={<Loader2 className="h-5 w-5 animate-spin" />} text="Carregando formação..." /> : error ? <State text={error} /> : <>
      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Progresso" value={`${progress?.progress_percent ?? 0}%`} />
        <Metric label="Aulas concluídas" value={`${progress?.completed_lessons ?? 0}/${progress?.total_lessons ?? 0}`} />
        <Metric label="Certificação" value={progress?.certified ? "Emitida" : "Pendente"} />
      </section>

      {courseTree.length === 0 ? <State icon={<BookOpenCheck className="h-6 w-6" />} text="A formação ainda não possui cursos publicados. Assim que o conteúdo oficial for liberado, ele aparece aqui automaticamente." /> : courseTree.map((course) => <section key={course.id} className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">{course.title}</h2>{course.description ? <p className="mt-2 text-sm text-slate-500">{course.description}</p> : null}
        <div className="mt-5 space-y-4">{course.modules.map((module) => <div key={module.id} className="rounded-2xl bg-slate-50 p-5"><h3 className="font-black">{module.title}</h3>{module.description ? <p className="mt-1 text-xs text-slate-500">{module.description}</p> : null}
          <div className="mt-4 space-y-2">{module.lessons.map((lesson) => { const done = completed.has(lesson.id); return <div key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><p className="font-bold">{lesson.title}</p>{lesson.summary ? <p className="mt-1 text-xs text-slate-500">{lesson.summary}</p> : null}</div><button disabled={done || savingLesson === lesson.id} onClick={() => void completeLesson(lesson.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{done ? "Concluída" : savingLesson === lesson.id ? "Salvando..." : "Marcar concluída"}</button></div>; })}</div>
        </div>)}</div>
      </section>)}

      {progress?.certified ? <section className="rounded-3xl bg-slate-950 p-6 text-white"><div className="flex items-center gap-2"><Award className="h-5 w-5"/><h2 className="font-black">Certificado Partners</h2></div><p className="mt-4 text-2xl font-black">Certificação concluída</p><p className="mt-2 text-sm text-slate-300">Código: {progress.certificate_code ?? "—"}</p></section> : null}
    </>}
  </div></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function State({ text, icon }: { text: string; icon?: React.ReactNode }) { return <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">{icon ? <div className="mb-3 flex justify-center">{icon}</div> : null}{text}</div>; }
