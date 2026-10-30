import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Home, Search, Sparkles, Users } from "lucide-react";
import { DocumentationArticleView } from "@/components/documentation/DocumentationArticleView";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DocumentationCategory } from "@/lib/documentation-catalog";
import { PUBLIC_DOCUMENTATION_MODULES as PUBLIC_MODULES } from "@/lib/documentation-public-catalog";

export const Route = createFileRoute("/documentacao")({
  head: () => ({
    meta: [
      { title: "Documentação · Vanessa Simoni" },
      { name: "description", content: "Guias práticos para configurar e usar os principais módulos da Vanessa Simoni." },
      { property: "og:title", content: "Documentação Vanessa Simoni" },
      { property: "og:description", content: "Aprenda a configurar e usar os principais módulos da Vanessa Simoni." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: DocumentationPage,
});

const PUBLIC_CATEGORIES = Array.from(new Set(PUBLIC_MODULES.map((item) => item.category)));

function filterModules(term: string, category: DocumentationCategory | null) {
  const q = term.trim().toLocaleLowerCase("pt-BR");
  return PUBLIC_MODULES.filter((item) => {
    if (category && item.category !== category) return false;
    if (!q) return true;
    const haystack = [item.title, item.summary, item.category, ...item.keywords, ...item.article.capabilities, ...item.article.steps].join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(q);
  });
}

function DocumentationPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DocumentationCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => filterModules(query, category), [query, category]);
  const selected = PUBLIC_MODULES.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" /> Documentação Vanessa Simoni
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-xs">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted"><Home className="h-3.5 w-3.5" /> Home</Link>
            <Link to="/partners" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted"><Users className="h-3.5 w-3.5" /> Afiliados e Partners</Link>
            <Link to="/auth" className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground hover:bg-primary/90">Entrar na Vanessa Simoni</Link>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-[1320px] px-4 py-6 md:px-6">
        <header className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><BookOpen className="h-3.5 w-3.5" /> Guias de uso</div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Aprenda a configurar e usar a Vanessa Simoni.</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Aqui você encontra somente instruções práticas: onde clicar, o que configurar, como testar e como operar cada módulo. Arquitetura interna, regras administrativas, receitas de implementação e diagnóstico técnico não são publicados.</p>
          </div>

          <div className="relative mt-6 max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }} placeholder="Buscar SalesBot, Agente IA, Tracking, Social Media..." className="pl-9" />
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border border-border bg-card p-3 lg:sticky lg:top-4">
            <button type="button" onClick={() => { setCategory(null); setSelectedId(null); }} className={cn("w-full rounded-lg px-3 py-2 text-left text-sm font-medium", category === null ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Todos os guias</button>
            <div className="mt-2 space-y-1">
              {PUBLIC_CATEGORIES.map((item) => (
                <button key={item} type="button" onClick={() => { setCategory(item); setSelectedId(null); }} className={cn("w-full rounded-lg px-3 py-2 text-left text-sm", category === item ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item}</button>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Guias principais</p>
              {PUBLIC_MODULES.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground">{item.title}</button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selected ? (
              <div>
                <button type="button" onClick={() => setSelectedId(null)} className="mb-3 text-xs font-medium text-primary hover:underline">← Voltar para os guias</button>
                <DocumentationArticleView module={selected} />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manuais operacionais</p><h2 className="mt-1 text-xl font-bold">{category ?? "Principais módulos"}</h2></div>
                  <span className="text-xs text-muted-foreground">{filtered.length} guias</span>
                </div>
                {filtered.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="rounded-xl border border-border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{item.category}</span>
                        <h3 className="mt-3 font-semibold">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                        <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /> Ver como configurar e usar</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><p className="text-sm font-semibold">Nada encontrado</p><p className="mt-1 text-xs text-muted-foreground">Tente outro termo ou remova o filtro.</p></div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
