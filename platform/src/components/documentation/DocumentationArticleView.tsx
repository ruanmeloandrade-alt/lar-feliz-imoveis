import { AlertTriangle, ArrowRight, CheckCircle2, ListChecks, MapPin, Puzzle, Target, Wrench } from "lucide-react";
import type { DocumentationModule } from "@/lib/documentation-catalog";

export function DocumentationArticleView({ module }: { module: DocumentationModule }) {
  const sections = [
    { title: "O que é", icon: Target, body: module.article.whatIs },
    { title: "Para que serve", icon: Puzzle, body: module.article.purpose },
  ];

  return (
    <article className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2.5 py-1">{module.category}</span>
          <span className="rounded-full border border-border px-2.5 py-1">Guia de uso</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">{module.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{module.summary}</p>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {module.article.location}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map(({ title, icon: Icon, body }) => (
          <section key={title} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>

      <BulletSection title="O que você consegue fazer" icon={CheckCircle2} items={module.article.capabilities} />
      <BulletSection title="Antes de começar" icon={Wrench} items={module.article.prerequisites} />

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" /> Como configurar e usar</div>
        <ol className="mt-4 space-y-3">
          {module.article.steps.map((step, index) => (
            <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-6 text-muted-foreground">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <BulletSection title="Exemplos de uso" icon={ArrowRight} items={module.article.examples} />
      <BulletSection title="Atenção antes de ativar" icon={AlertTriangle} items={module.article.limitations} tone="warning" />
    </article>
  );
}

function BulletSection({ title, icon: Icon, items, tone = "default" }: { title: string; icon: typeof Target; items: string[]; tone?: "default" | "warning" }) {
  if (!items.length) return null;
  return (
    <section className={`rounded-xl border p-5 ${tone === "warning" ? "border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" /><span>{item}</span></li>)}
      </ul>
    </section>
  );
}
