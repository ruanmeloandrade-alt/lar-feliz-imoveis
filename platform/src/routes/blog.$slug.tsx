import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { findArticle, BLOG_ARTICLES, type BlogSection, type BlogArticle } from "@/lib/blog-articles";

export const Route = createFileRoute("/blog/$slug")({
 loader: ({ params }) => {
  const article = findArticle(params.slug);
  if (!article) throw notFound();
  return { article };
 },
 head: ({ loaderData }) => {
  const a = loaderData?.article;
  if (!a) {
   return {
    meta: [
     { title: "Artigo não encontrado · Blog Vanessa Simoni" },
     { name: "description", content: "O artigo que você tentou acessar não existe ou foi movido." },
    ],
   };
  }
  const canonical = `https://saudeslim.com.br/blog/${a.slug}`;
  return {
   meta: [
    { title: `${a.title} · Blog Vanessa Simoni` },
    { name: "description", content: a.description },
    { name: "keywords", content: a.keywords.join(", ") },
    { property: "og:title", content: a.title },
    { property: "og:description", content: a.description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: canonical },
    { property: "article:published_time", content: a.updatedAt },
    { property: "article:section", content: a.category },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: a.title },
    { name: "twitter:description", content: a.description },
   ],
   links: [{ rel: "canonical", href: canonical }],
  };
 },
 notFoundComponent: () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
   <div>
    <div className="text-6xl mb-4">🔍</div>
    <h1 className="text-2xl font-bold mb-2">Artigo não encontrado</h1>
    <p className="text-muted-foreground mb-6">Esse guia pode ter sido movido ou o link está errado.</p>
    <Link to="/blog" className="text-primary hover:underline">← Voltar pro blog</Link>
   </div>
  </div>
 ),
 errorComponent: ({ error, reset }) => (
  <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
   <div>
    <h1 className="text-2xl font-bold mb-2">Ops, algo quebrou</h1>
    <p className="text-muted-foreground mb-6">{error.message}</p>
    <button onClick={reset} className="text-primary hover:underline">Tentar de novo</button>
   </div>
  </div>
 ),
 component: ArticlePage,
});

function ArticlePage() {
 const { article: a } = Route.useLoaderData() as { article: BlogArticle };
 const related = a.related
  .map((slug: string) => BLOG_ARTICLES.find((x) => x.slug === slug))
  .filter((x): x is BlogArticle => Boolean(x));

 // JSON-LD Article
 const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: a.title,
  description: a.description,
  datePublished: a.updatedAt,
  dateModified: a.updatedAt,
  author: { "@type": "Organization", name: "MKTOn" },
  publisher: {
   "@type": "Organization",
   name: "MKTOn",
   logo: { "@type": "ImageObject", url: "https://saudeslim.com.br/logo.png" },
  },
  mainEntityOfPage: `https://saudeslim.com.br/blog/${a.slug}`,
  keywords: a.keywords.join(", "),
 };

 return (
  <div className="min-h-screen bg-background">
   <script
    type="application/ld+json"
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
   />

   <header className="border-b border-border">
    <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
     <Link to="/" className="text-lg font-bold tracking-tight">Vanessa Simoni</Link>
     <nav className="flex items-center gap-4 text-sm">
      <Link to="/blog" className="text-muted-foreground hover:text-foreground">← Blog</Link>
      <Link
       to="/painel"
       className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90"
      >
       Entrar no painel
      </Link>
     </nav>
    </div>
   </header>

   <article className="max-w-3xl mx-auto px-6 py-12">
    {/* Breadcrumb */}
    <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-2">
     <Link to="/blog" className="hover:text-foreground">Blog</Link>
     <span>›</span>
     <span>{a.category}</span>
    </nav>

    {/* Header */}
    <div className="mb-8">
     <div className="flex items-center gap-3 mb-3">
      <span className="text-4xl">{a.hero ?? "📄"}</span>
      <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
       {a.category}
      </span>
     </div>
     <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-4">{a.title}</h1>
     <p className="text-lg text-muted-foreground leading-relaxed">{a.description}</p>
     <div className="mt-4 text-xs text-muted-foreground flex items-center gap-3">
      <span>Atualizado em {formatDate(a.updatedAt)}</span>
      <span>·</span>
      <span>{a.readingMinutes} min de leitura</span>
     </div>
    </div>

    {/* Índice */}
    <TableOfContents body={a.body} />

    {/* Corpo */}
    <div className="prose-mkton space-y-4">
     {a.body.map((section: BlogSection, i: number) => (
      <RenderSection key={i} section={section} />
     ))}
    </div>

    {/* CTA */}
    {a.cta && (
     <div className="mt-12 rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
      <h3 className="text-xl font-bold mb-2">{a.cta.title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{a.cta.text}</p>
      <a
       href={a.cta.href}
       className="inline-block bg-primary text-primary-foreground px-5 py-2.5 rounded-md font-medium hover:bg-primary/90"
      >
       {a.cta.label}
      </a>
     </div>
    )}

    {/* Relacionados */}
    {related.length > 0 && (
     <div className="mt-12 pt-8 border-t border-border">
      <h3 className="text-lg font-semibold mb-4">Continue lendo</h3>
      <div className="grid sm:grid-cols-2 gap-3">
       {related.map((r: BlogArticle) => (
        <Link
         key={r.slug}
         to="/blog/$slug"
         params={{ slug: r.slug }}
         className="group border border-border rounded p-4 hover:border-primary/50 transition-colors"
        >
         <div className="text-xl mb-1">{r.hero}</div>
         <div className="font-medium text-sm group-hover:text-primary transition-colors">{r.title}</div>
         <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</div>
        </Link>
       ))}
      </div>
     </div>
    )}
   </article>

   <footer className="border-t border-border">
    <div className="max-w-4xl mx-auto px-6 py-8 text-xs text-muted-foreground text-center">
     © {new Date().getFullYear()} Vanessa Simoni · <Link to="/blog" className="hover:text-foreground">Todos os artigos</Link>
    </div>
   </footer>
  </div>
 );
}

/* -------------------- Helpers -------------------- */

function slugify(s: string) {
 return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function TableOfContents({ body }: { body: BlogSection[] }) {
 const headings = body
  .filter((s): s is Extract<BlogSection, { kind: "h2" }> => s.kind === "h2")
  .map((h) => ({ text: h.text, anchor: h.anchor ?? slugify(h.text) }));
 if (headings.length < 2) return null;
 return (
  <div className="mb-10 p-4 rounded-lg border border-border bg-muted/30">
   <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Neste artigo</div>
   <ol className="text-sm space-y-1 list-decimal list-inside">
    {headings.map((h) => (
     <li key={h.anchor}>
      <a href={`#${h.anchor}`} className="text-primary hover:underline">{h.text}</a>
     </li>
    ))}
   </ol>
  </div>
 );
}

function RenderSection({ section }: { section: BlogSection }) {
 switch (section.kind) {
  case "p":
   return <p className="text-base leading-relaxed text-foreground/90">{section.text}</p>;
  case "h2": {
   const anchor = section.anchor ?? slugify(section.text);
   return (
    <h2 id={anchor} className="text-2xl font-bold text-foreground mt-10 mb-3 scroll-mt-20">
     {section.text}
    </h2>
   );
  }
  case "h3":
   return <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">{section.text}</h3>;
  case "ul":
   return (
    <ul className="list-disc list-outside pl-5 space-y-1.5 text-foreground/90">
     {section.items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
   );
  case "ol":
   return (
    <ol className="list-decimal list-outside pl-5 space-y-1.5 text-foreground/90">
     {section.items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
   );
  case "code":
   return (
    <pre className="bg-muted border border-border rounded p-4 overflow-x-auto text-sm font-mono leading-relaxed">
     <code>{section.code}</code>
    </pre>
   );
  case "callout": {
   const cls =
    section.tone === "info" ? "border-primary/40 bg-primary/5 text-foreground"
    : section.tone === "success" ? "border-green-500/40 bg-green-500/5 text-foreground"
    : "border-warning/40 bg-warning/5 text-foreground";
   const icon = section.tone === "info" ? "💡" : section.tone === "success" ? "✅" : "⚠️";
   return (
    <div className={`rounded-md border p-4 text-sm ${cls}`}>
     <span className="mr-2">{icon}</span>
     {section.text}
    </div>
   );
  }
 }
}

function formatDate(iso: string) {
 try {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
 } catch {
  return iso;
 }
}
