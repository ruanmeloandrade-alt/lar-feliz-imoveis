import { createFileRoute, Link } from "@tanstack/react-router";
import { BLOG_ARTICLES, articlesByCategory } from "@/lib/blog-articles";

export const Route = createFileRoute("/blog/")({
 head: () => ({
  meta: [
   { title: "Blog & Central de Ajuda · Vanessa Simoni, CRM, automações e integrações" },
   {
    name: "description",
    content:
     "Guias práticos e passo-a-passos pra usar o CRM Vanessa Simoni: webhooks, automações, integrações com Zapier, Make, Slack, Discord e mais. Aprenda a vender no automático.",
   },
   { property: "og:title", content: "Blog Vanessa Simoni, CRM, automações e integrações" },
   {
    property: "og:description",
    content: "Aprenda a extrair o máximo do CRM Vanessa Simoni com tutoriais reais de webhooks, automações e integrações.",
   },
   { property: "og:type", content: "website" },
   { name: "twitter:card", content: "summary_large_image" },
  ],
 }),
 component: BlogIndex,
});

function BlogIndex() {
 const byCat = articlesByCategory();
 const cats: Array<keyof typeof byCat> = ["Webhooks", "Integrações", "Automações", "CRM"];

 return (
  <div className="min-h-screen bg-background">
   {/* Nav simples */}
   <header className="border-b border-border">
    <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
     <Link to="/" className="text-lg font-bold tracking-tight">Vanessa Simoni</Link>
     <nav className="flex items-center gap-4 text-sm">
      <Link to="/blog" className="text-foreground font-medium">Blog</Link>
      <Link to="/" className="text-muted-foreground hover:text-foreground">Início</Link>
      <Link
       to="/painel"
       className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90"
      >
       Entrar no painel
      </Link>
     </nav>
    </div>
   </header>

   {/* Hero */}
   <section className="max-w-4xl mx-auto px-6 py-16 text-center">
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
     📚 Central de conhecimento Vanessa Simoni
    </div>
    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
     Guias práticos pra vender no automático
    </h1>
    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
     Tutoriais reais de webhooks, automações e integrações do CRM Vanessa Simoni. Feito pra time comercial que quer parar de trabalhar duas vezes.
    </p>
   </section>

   {/* Artigos por categoria */}
   <section className="max-w-5xl mx-auto px-6 pb-24 space-y-16">
    {cats.map((cat) => {
     const items = byCat[cat];
     if (!items?.length) return null;
     return (
      <div key={cat}>
       <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">{cat}</h2>
        <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "artigo" : "artigos"}</span>
       </div>
       <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((a) => (
         <Link
          key={a.slug}
          to="/blog/$slug"
          params={{ slug: a.slug }}
          className="group border border-border rounded-lg p-5 bg-card hover:border-primary/50 hover:shadow-md transition-all"
         >
          <div className="text-3xl mb-3">{a.hero ?? "📄"}</div>
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-2 leading-snug">
           {a.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-3">{a.description}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
           <span className="px-2 py-0.5 rounded bg-muted">{a.category}</span>
           <span>·</span>
           <span>{a.readingMinutes} min de leitura</span>
          </div>
         </Link>
        ))}
       </div>
      </div>
     );
    })}
   </section>

   {/* CTA final */}
   <section className="border-t border-border bg-muted/30">
    <div className="max-w-3xl mx-auto px-6 py-16 text-center">
     <h2 className="text-2xl sm:text-3xl font-bold mb-3">Pronto pra automatizar seu comercial?</h2>
     <p className="text-muted-foreground mb-6">
      CRM + WhatsApp + IA + automações no mesmo lugar. Teste grátis, sem cartão.
     </p>
     <Link
      to="/"
      className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:bg-primary/90"
     >
      Começar grátis
     </Link>
    </div>
   </section>

   <footer className="border-t border-border">
    <div className="max-w-5xl mx-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
     <span>© {new Date().getFullYear()} Vanessa Simoni</span>
     <span>{BLOG_ARTICLES.length} artigos publicados</span>
    </div>
   </footer>
  </div>
 );
}
