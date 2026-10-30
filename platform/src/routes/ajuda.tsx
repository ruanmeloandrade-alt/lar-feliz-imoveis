import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  LifeBuoy,
  MessageCircle,
  Plug,
  Search,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HELP_FAQ_CATEGORIES,
  filterHelpFaqs,
  type HelpFaqCategory,
} from "@/lib/help-faq";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ajuda")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda · Vanessa Simoni" },
      {
        name: "description",
        content:
          "FAQ Vanessa Simoni sobre CRM, Inbox, automações, IA, Tracking, marketing, integrações, planos, segurança e suporte.",
      },
      { property: "og:title", content: "Central de Ajuda · Vanessa Simoni" },
      {
        property: "og:description",
        content: "Respostas rápidas e acesso à documentação completa da plataforma Vanessa Simoni.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AjudaPage,
});

const ATALHOS = [
  {
    icon: BookOpen,
    title: "Documentação",
    desc: "Tutoriais e módulos da MktOn",
    href: "/documentacao",
  },
  {
    icon: Plug,
    title: "Integrações",
    desc: "Conectores e status da conta",
    href: "/integracoes",
  },
  {
    icon: GraduationCap,
    title: "Faculdade Vanessa Simoni",
    desc: "Treinamentos para clientes",
    href: "/faculdade",
  },
  {
    icon: MessageCircle,
    title: "Suporte",
    desc: "Falar com o time quando precisar",
    href: "/inbox/suporte",
  },
] as const;

function AjudaPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpFaqCategory | null>(null);

  const filtered = useMemo(() => filterHelpFaqs(query, category), [query, category]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1080px] space-y-6 px-4 py-6 sm:px-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <LifeBuoy className="h-3 w-3" />
                  Central de ajuda
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Perguntas frequentes</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Respostas rápidas para operar a Vanessa Simoni. Para aprender um recurso do início ao fim,
                abra a Documentação.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/home">Voltar para a Home</Link>
            </Button>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ATALHOS.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.title}
                  href={item.href}
                  className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{item.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{item.desc}</div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </a>
              );
            })}
          </section>

          <section className="rounded-xl border border-border bg-card">
            <div className="space-y-4 border-b border-border px-4 py-4 sm:px-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por WhatsApp, funil, SalesBot, Tracking, plano..."
                  className="pl-9"
                  maxLength={160}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Categorias do FAQ">
                <button
                  type="button"
                  onClick={() => setCategory(null)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    category === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  Todas
                </button>
                {HELP_FAQ_CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      category === item
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-2 sm:px-5">
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-sm font-semibold">Nenhuma resposta encontrada</div>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                    Tente outro termo, remova o filtro de categoria ou consulte a Documentação para um tutorial completo.
                  </p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {filtered.map((faq, index) => (
                    <AccordionItem key={faq.question} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left text-sm">
                        <span className="flex items-center gap-2 pr-2">
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {faq.category}
                          </Badge>
                          {faq.question}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.06] via-card to-card p-6">
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Precisa aprender o processo inteiro?</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  O FAQ resolve dúvidas rápidas. A Documentação mostra o que cada módulo faz,
                  passo a passo, conexões com outras áreas e exemplos de implementação.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="gap-2">
                  <a href="/documentacao">
                    <BookOpen className="h-4 w-4" /> Abrir documentação
                  </a>
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <a href="/inbox/suporte">
                    <MessageCircle className="h-4 w-4" /> Falar com suporte
                  </a>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
