import { AlertTriangle, ArrowRight, CheckCircle2, Link2, ListChecks, Wrench } from "lucide-react";
import {
  DOCUMENTATION_CONNECTIONS,
  DOCUMENTATION_DIAGNOSTICS,
  DOCUMENTATION_RECIPES,
} from "@/lib/documentation-guides";

export type DocumentationGuideMode = "connections" | "recipes" | "diagnostics";

export function DocumentationGuidesView({ mode }: { mode: DocumentationGuideMode }) {
  if (mode === "connections") return <Connections />;
  if (mode === "recipes") return <Recipes />;
  return <Diagnostics />;
}

function Connections() {
  return (
    <div className="space-y-4">
      <PageIntro title="Mapa de conexões" text="Veja como os blocos da MktOn se encadeiam. Cada fluxo abaixo representa uma relação operacional documentada, não uma promessa de automação automática entre todos os módulos." />
      {DOCUMENTATION_CONNECTIONS.map((item) => (
        <section key={item.id} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" /> {item.title}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.purpose}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {item.flow.map((step, index) => (
              <div key={`${item.id}-${step}`} className="flex items-center gap-2">
                <span className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium">{step}</span>
                {index < item.flow.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-xs leading-5 text-muted-foreground">
            {item.notes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Recipes() {
  return (
    <div className="space-y-4">
      <PageIntro title="Receitas de implementação" text="Tutoriais ponta a ponta para montar operações reais. Use como roteiro e valide cada etapa antes de ativar automações em volume." />
      {DOCUMENTATION_RECIPES.map((recipe) => (
        <section key={recipe.id} className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{recipe.title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{recipe.objective}</p></div>
            <div className="flex flex-wrap gap-1.5">{recipe.modules.map((module) => <span key={module} className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">{module}</span>)}</div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <MiniList title="Pré-requisitos" icon={Wrench} items={recipe.prerequisites} />
            <MiniList title="Passo a passo" icon={ListChecks} items={recipe.steps} numbered />
            <MiniList title="Como validar" icon={CheckCircle2} items={recipe.validation} />
          </div>
        </section>
      ))}
    </div>
  );
}

function Diagnostics() {
  return (
    <div className="space-y-4">
      <PageIntro title="Diagnóstico rápido" text="Antes de abrir suporte, siga a sequência de checagem. Quando a condição de escalada ocorrer, leve ao suporte o que você já validou." />
      <div className="grid gap-4 lg:grid-cols-2">
        {DOCUMENTATION_DIAGNOSTICS.map((item) => (
          <section key={item.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-amber-500/10 p-2 text-amber-600"><AlertTriangle className="h-4 w-4" /></div><div><h3 className="text-sm font-semibold">{item.symptom}</h3><p className="mt-1 text-[11px] text-muted-foreground">Siga na ordem:</p></div></div>
            <ol className="mt-4 space-y-2">
              {item.checks.map((check, index) => <li key={check} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-foreground">{index + 1}</span><span>{check}</span></li>)}
            </ol>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5"><span className="font-semibold">Procure suporte quando: </span><span className="text-muted-foreground">{item.escalateWhen}</span></div>
          </section>
        ))}
      </div>
    </div>
  );
}

function PageIntro({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{text}</p></div>;
}

function MiniList({ title, icon: Icon, items, numbered = false }: { title: string; icon: typeof Wrench; items: string[]; numbered?: boolean }) {
  return <div><div className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5 text-primary" /> {title}</div><ol className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">{items.map((item, index) => <li key={item} className="flex gap-2">{numbered ? <span className="font-semibold text-foreground">{index + 1}.</span> : <span>•</span>}<span>{item}</span></li>)}</ol></div>;
}
