import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
 GraduationCap,
 PlayCircle,
 Lock,
 CheckCircle2,
 Sparkles,
 Megaphone,
 BarChart3,
 Share2,
 Calendar,
 Network,
 Mail,
 
 Video,
 Plus,
 ChevronRight,
 ChevronLeft,
 Repeat,
 Palette,
 Search,
 Activity,
 Crown,
 Clock,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-roles";

export const Route = createFileRoute("/faculdade")({
 head: () => ({
 meta: [
      { title: "Faculdade Vanessa Simoni" },
      {
        name: "description",
        content:
          "Central de aprendizado da Vanessa Simoni: KPIs, tráfego pago, social media, calendário editorial, CRM e tudo sobre marketing.",
      },
 ],
 }),
 component: FaculdadePage,
});

type Lesson = {
 id: string;
 title: string;
 duration: string;
 type: "video" | "texto" | "checklist";
};

type ModuleArt =
 | "grid"
 | "waves"
 | "rays"
 | "dots"
 | "blueprint"
 | "stripes"
 | "bars"
 | "orbits"
 | "mesh"
 | "type"
 | "scope"
 | "pulse"
 | "loop"
 | "spotlight";

type Module = {
 id: string;
 code: string;
 name: string;
 tagline: string; // chip text, short
 description: string;
 icon: typeof GraduationCap;
 art: ModuleArt;
 /** tailwind gradient classes from-... via-... to-... */
 gradient: string;
 /** ink color for the cover overlays */
 ink: string;
 free?: boolean;
 comingSoon?: boolean;
 lessons: Lesson[];
};

const MODULES: Module[] = [
 {
 id: "mkt-on",
 code: "MKT1.0",
 name: "Configurando a plataforma",
 tagline: "ONBOARDING",
    description:
      "Tour completo para configurar sua Vanessa Simoni do zero: criar funis, organizar o dashboard e ativar a equipe.",
 icon: Sparkles,
 art: "spotlight",
 gradient: "from-violet-600 via-fuchsia-600 to-indigo-700",
 ink: "rgba(255,255,255,0.18)",
 free: true,
 lessons: [
 { id: "l1", title: "Bem-vindo à Vanessa Simoni", duration: "3 min", type: "video" },
 { id: "l2", title: "Conectando canais de mensagem", duration: "8 min", type: "video" },
 { id: "l3", title: "Conectando Meta Ads e Google Ads", duration: "6 min", type: "video" },
 { id: "l4", title: "Configurando seu dashboard e KPIs", duration: "10 min", type: "video" },
 { id: "l5", title: "Criando funis e etapas", duration: "7 min", type: "video" },
 { id: "l6", title: "Convidando sua equipe e permissões", duration: "5 min", type: "video" },
 { id: "l7", title: "Checklist de ativação", duration: "Em breve", type: "checklist" },
 ],
 },
 {
 id: "kpis",
 code: "MKT2.0",
 name: "KPIs e métricas que importam",
 tagline: "DATA",
 description:
 "CAC, LTV, ROAS, taxa de conversão, ticket médio: leitura honesta dos números do comercial e do marketing.",
 icon: BarChart3,
 art: "bars",
 gradient: "from-emerald-600 via-teal-600 to-cyan-700",
 ink: "rgba(255,255,255,0.16)",
 comingSoon: true,
 lessons: [
 { id: "l1", title: "Visão geral de KPIs", duration: "Em breve", type: "video" },
 { id: "l2", title: "Funil de receita", duration: "Em breve", type: "video" },
 { id: "l3", title: "Análise por origem", duration: "Em breve", type: "video" },
 ],
 },
 {
 id: "trafego",
 code: "MKT3.0",
 name: "Tráfego pago do zero ao avançado",
 tagline: "MÍDIA PAGA",
 description:
 "Meta Ads, Google Ads e TikTok Ads: estrutura de campanha, criativos, públicos e rotina de otimização.",
 icon: Megaphone,
 art: "rays",
 gradient: "from-orange-500 via-red-500 to-rose-700",
 ink: "rgba(255,255,255,0.16)",
 comingSoon: true,
 lessons: [
 { id: "l1", title: "Estrutura de conta", duration: "Em breve", type: "video" },
 { id: "l2", title: "Criativos que vendem", duration: "Em breve", type: "video" },
 { id: "l3", title: "Otimização semanal", duration: "Em breve", type: "video" },
 ],
 },
 {
 id: "social",
 code: "MKT4.0",
 name: "Social Media estratégico",
 tagline: "CONTEÚDO",
 description:
 "Posicionamento, narrativa, formatos por rede e como medir o que realmente gera resultado.",
 icon: Share2,
 art: "waves",
 gradient: "from-pink-500 via-rose-500 to-fuchsia-700",
 ink: "rgba(255,255,255,0.18)",
 comingSoon: true,
 lessons: [
 { id: "l1", title: "Posicionamento de marca", duration: "Em breve", type: "video" },
 { id: "l2", title: "Formatos por rede", duration: "Em breve", type: "video" },
 ],
 },
 {
 id: "calendario",
 code: "MKT5.0",
 name: "Calendário editorial",
 tagline: "PLANEJAMENTO",
 description:
 "Como montar e manter um calendário editorial que sustenta consistência e gera leads.",
 icon: Calendar,
 art: "grid",
 gradient: "from-blue-600 via-sky-600 to-indigo-700",
 ink: "rgba(255,255,255,0.16)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Montando o calendário", duration: "Em breve", type: "video" }],
 },
 {
 id: "crm",
 code: "MKT6.0",
 name: "CRM e processo comercial",
 tagline: "VENDAS",
 description:
 "Como estruturar funis, qualificar leads, abordar e fechar mais com previsibilidade.",
 icon: Network,
 art: "orbits",
 gradient: "from-violet-700 via-purple-700 to-indigo-800",
 ink: "rgba(255,255,255,0.16)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Estrutura de funis", duration: "Em breve", type: "video" }],
 },
 {
 id: "email",
 code: "MKT7.0",
 name: "E-mail marketing e automação",
 tagline: "AUTOMAÇÃO",
 description: "Réguas, segmentação, copy e automações que aquecem e convertem.",
 icon: Mail,
 art: "stripes",
 gradient: "from-cyan-600 via-sky-600 to-blue-800",
 ink: "rgba(255,255,255,0.16)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Régua de boas-vindas", duration: "Em breve", type: "video" }],
 },
 {
 id: "producao",
 code: "MKT9.0",
 name: "Produção de conteúdo em vídeo",
 tagline: "PRODUÇÃO",
 description: "Roteiro, captação, edição e distribuição: pensado para quem não é produtor.",
 icon: Video,
 art: "blueprint",
 gradient: "from-amber-500 via-orange-600 to-yellow-700",
 ink: "rgba(0,0,0,0.15)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Roteiro expresso", duration: "Em breve", type: "video" }],
 },
 {
 id: "followup",
 code: "MKT10.0",
 name: "Follow-up que fecha venda",
 tagline: "FOLLOW-UP",
 description:
 "Cadências de retomada, gatilhos, scripts e ferramentas para não perder lead por esquecimento.",
 icon: Repeat,
 art: "loop",
 gradient: "from-teal-500 via-emerald-600 to-green-800",
 ink: "rgba(255,255,255,0.18)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "A régua de follow-up perfeita", duration: "Em breve", type: "video" }],
 },
 {
 id: "branding",
 code: "MKT11.0",
 name: "Branding e identidade de marca",
 tagline: "BRANDING",
 description:
 "Propósito, posicionamento, voz, identidade visual e como manter consistência em toda a operação.",
 icon: Palette,
 art: "mesh",
 gradient: "from-zinc-800 via-neutral-700 to-stone-900",
 ink: "rgba(255,255,255,0.18)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Posicionamento estratégico", duration: "Em breve", type: "video" }],
 },
 {
 id: "benchmarking",
 code: "MKT12.0",
 name: "Benchmarking competitivo",
 tagline: "BENCHMARK",
 description:
 "Como mapear concorrentes, decifrar a oferta deles e extrair insights sem copiar ninguém.",
 icon: Activity,
 art: "pulse",
 gradient: "from-indigo-700 via-blue-800 to-slate-900",
 ink: "rgba(255,255,255,0.16)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Mapa competitivo", duration: "Em breve", type: "video" }],
 },
 {
 id: "seo",
 code: "MKT13.0",
 name: "SEO: tráfego orgânico de verdade",
 tagline: "SEO",
 description:
 "Pesquisa de palavras-chave, SEO técnico, conteúdo otimizado e link building moderno.",
 icon: Search,
 art: "dots",
 gradient: "from-lime-500 via-green-600 to-emerald-800",
 ink: "rgba(0,0,0,0.18)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Pesquisa de palavras-chave", duration: "Em breve", type: "video" }],
 },
 {
 id: "tracking",
 code: "MKT14.0",
 name: "Tracking e mensuração",
 tagline: "TRACKING",
 description:
 "GA4, GTM, Pixels, server-side, UTMs e como confiar nos dados que sustentam a decisão.",
 icon: Activity,
 art: "type",
 gradient: "from-fuchsia-700 via-purple-800 to-violet-900",
 ink: "rgba(255,255,255,0.18)",
 comingSoon: true,
 lessons: [{ id: "l1", title: "Configuração do GA4 + GTM", duration: "Em breve", type: "video" }],
 },
];

type Banner = {
 id: string;
 eyebrow: string;
 title: string;
 description: string;
 cta: string;
 to?: string;
 art: ModuleArt;
 gradient: string;
};

const BANNERS: Banner[] = [
 {
 id: "b1",
 eyebrow: "MÓDULO EM DESTAQUE",
 title: "Configure sua Vanessa Simoni em menos de 30 minutos",
    description:
      "Comece pelo módulo de configuração, o passo a passo oficial para deixar sua plataforma pronta para operar.",
 cta: "Começar agora",
 to: "mkt-on",
 art: "spotlight",
 gradient: "from-violet-700 via-fuchsia-600 to-indigo-800",
 },
 {
 id: "b2",
 eyebrow: "TRILHA COMPLETA",
 title: "Tráfego, CRM, KPIs, SEO e Branding em um só lugar",
    description:
      "Tudo o que sua operação precisa para crescer, produzido por quem opera, não por quem só fala sobre.",
 cta: "Ver módulos",
 art: "rays",
 gradient: "from-orange-500 via-rose-600 to-fuchsia-800",
 },
];

function FaculdadePage() {
 const { isAdmin } = useIsAdmin();
 const [selected, setSelected] = useState<Module | null>(null);
 const [bannerIndex, setBannerIndex] = useState(0);

 // auto-rotate
 useEffect(() => {
 const t = setInterval(() => setBannerIndex((i) => (i + 1) % BANNERS.length), 7000);
 return () => clearInterval(t);
 }, []);

 return (
 <div className="flex min-h-screen bg-background text-foreground">
 <AppSidebar />
 <main className="flex-1 min-w-0">
 {/* Header */}
 <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
 <div className="px-6 py-4 flex items-center justify-between gap-4">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
 <GraduationCap className="w-5 h-5" />
 </div>
 <div className="min-w-0">
 <h1 className="text-lg font-semibold tracking-tight truncate">
 Faculdade Vanessa Simoni
 </h1>
 <p className="text-xs text-muted-foreground truncate">
 Central de aprendizado · marketing, vendas e operação Vanessa Simoni
 </p>
 </div>
 </div>
 {isAdmin && (
 <div className="flex items-center gap-2">
 <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-amber-500/90 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
 <Crown className="w-3 h-3" /> ADMIN
 </span>
 <Button variant="outline" size="sm" className="gap-1.5">
 <Plus className="w-3.5 h-3.5" /> Banner
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5">
 <Plus className="w-3.5 h-3.5" /> Módulo
 </Button>
 </div>
 )}
 </div>
 </header>

 <div className="p-6 space-y-10 max-w-[1400px] mx-auto">
 {/* Banner carrossel */}
 <section>
 <div className="relative overflow-hidden rounded-3xl border border-border shadow-2xl">
 <div
 className={cn(
 "relative p-10 md:p-14 bg-gradient-to-br text-white min-h-[300px] flex flex-col justify-between overflow-hidden",
 BANNERS[bannerIndex].gradient,
 )}
 >
 {/* art layer */}
 <div className="absolute inset-0 pointer-events-none opacity-90">
 <ArtLayer kind={BANNERS[bannerIndex].art} ink="rgba(255,255,255,0.16)" />
 </div>
 {/* vignette */}
 <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(0,0,0,0.0),rgba(0,0,0,0.45))]" />

 <div className="relative">
 <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-widest opacity-90 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/20">
 {BANNERS[bannerIndex].eyebrow}
 </div>
 <h2 className="mt-4 text-3xl md:text-5xl font-black tracking-tight max-w-3xl leading-[1.05]">
 {BANNERS[bannerIndex].title}
 </h2>
 <p className="mt-3 text-sm md:text-base opacity-90 max-w-2xl leading-relaxed">
 {BANNERS[bannerIndex].description}
 </p>
 </div>

 <div className="relative mt-8 flex items-center justify-between">
 <Button
 variant="secondary"
 size="lg"
 onClick={() => {
 const target = MODULES.find((m) => m.id === BANNERS[bannerIndex].to);
 if (target) setSelected(target);
 }}
 className="gap-1.5 bg-white text-slate-900 hover:bg-white/90"
 >
 {BANNERS[bannerIndex].cta}
 <ChevronRight className="w-4 h-4" />
 </Button>
 <div className="flex items-center gap-3">
 <button
 onClick={() =>
 setBannerIndex((i) => (i - 1 + BANNERS.length) % BANNERS.length)
 }
 aria-label="Banner anterior"
 className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 grid place-items-center border border-white/20"
 >
 <ChevronLeft className="w-4 h-4" />
 </button>
 <div className="flex items-center gap-1.5">
 {BANNERS.map((b, i) => (
 <button
 key={b.id}
 onClick={() => setBannerIndex(i)}
 aria-label={`Banner ${i + 1}`}
 className={cn(
 "h-1.5 rounded-full transition-all",
 i === bannerIndex? "w-7 bg-white": "w-1.5 bg-white/50",
 )}
 />
 ))}
 </div>
 <button
 onClick={() => setBannerIndex((i) => (i + 1) % BANNERS.length)}
 aria-label="Próximo banner"
 className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 grid place-items-center border border-white/20"
 >
 <ChevronRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>
 </div>
 </section>

 {/* Trilha */}
 <section>
 <div className="flex items-end justify-between mb-5">
 <div>
 <h3 className="text-xl font-bold tracking-tight">Sua trilha de aprendizado</h3>
          <p className="text-sm text-muted-foreground">
            Comece pelo módulo de configuração, único disponível no plano gratuito.
          </p>
 </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            {(() => {
              const n = MODULES.filter((m) => !m.comingSoon).length;
              return `${n} ${n === 1 ? "disponível" : "disponíveis"}`;
            })()} ·{" "}
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-2" />
            {MODULES.filter((m) => m.comingSoon).length} em breve
          </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
 {MODULES.map((m) => (
 <ModuleCard key={m.id} module={m} onOpen={() => setSelected(m)} />
 ))}
 </div>
 </section>
 </div>

 {selected && (
 <ModuleDrawer module={selected} onClose={() => setSelected(null)} />
 )}
 </main>
 </div>
 );
}

/* -------------------------------------------------------------------------- */
/* Module Card */
/* -------------------------------------------------------------------------- */

function ModuleCard({ module: m, onOpen }: { module: Module; onOpen: () => void }) {
 const locked = m.comingSoon === true;
 return (
 <Card
 className={cn(
 "group relative overflow-hidden p-0 border-border/70 hover:border-primary/50 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl",
 )}
 onClick={onOpen}
 >
 {/* COVER */}
 <div className={cn("relative h-44 overflow-hidden bg-gradient-to-br", m.gradient)}>
 <div className="absolute inset-0">
 <ModuleCover id={m.id} />
 </div>
 <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_100%,rgba(0,0,0,0),rgba(0,0,0,0.55))]" />

 {/* top row: code chip + status */}
 <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
 <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-white bg-black/30 backdrop-blur px-2 py-1 rounded-md border border-white/15">
 {m.code} · {m.tagline}
 </div>
 {m.free && (
 <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-400 text-emerald-950 tracking-wider shadow">
 GRATUITO
 </span>
 )}
 {locked && (
 <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-black/45 backdrop-blur text-white tracking-wider flex items-center gap-1 border border-white/15">
 <Clock className="w-3 h-3" /> EM BREVE
 </span>
 )}
 </div>

 {/* bottom row: title overlay on cover */}
 <div className="absolute bottom-0 left-0 right-0 p-4">
 <h4 className="text-white text-[17px] font-bold leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
 {m.name}
 </h4>
 </div>
 </div>

 {/* META */}
 <div className="p-4">
 <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
 {m.description}
 </p>
 <div className="mt-3 flex items-center justify-between text-[11px]">
 <span className="text-muted-foreground">{m.lessons.length} aulas</span>
 <span className="flex items-center gap-1 text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
 Abrir módulo <ChevronRight className="w-3 h-3" />
 </span>
 </div>
 </div>
 </Card>
 );
}

/* -------------------------------------------------------------------------- */
/* Module Drawer */
/* -------------------------------------------------------------------------- */

function ModuleDrawer({ module: m, onClose }: { module: Module; onClose: () => void }) {
 const locked = m.comingSoon === true;
 return (
 <div className="fixed inset-0 z-50 flex">
 <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
 <aside className="w-full max-w-xl bg-background border-l border-border overflow-y-auto scrollbar-branded">
 {/* HERO */}
 <div className={cn("relative overflow-hidden bg-gradient-to-br text-white", m.gradient)}>
 <div className="absolute inset-0">
 <ModuleCover id={m.id} />
 </div>
 <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_100%,rgba(0,0,0,0),rgba(0,0,0,0.5))]" />

 <button
 onClick={onClose}
 className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 grid place-items-center text-white border border-white/20"
 aria-label="Fechar"
 >
 ✕
 </button>

 <div className="relative p-7">
 <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest bg-black/30 backdrop-blur px-2.5 py-1 rounded-full border border-white/15">
 {m.code} · {m.tagline}
 </div>
 <h2 className="mt-4 text-3xl font-black tracking-tight max-w-md leading-[1.1] drop-shadow">
 {m.name}
 </h2>
 <p className="mt-2 text-sm opacity-90 max-w-md leading-relaxed">{m.description}</p>

 <div className="mt-5 flex items-center gap-2 text-xs">
 <span className="bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/20">
 {m.lessons.length} aulas
 </span>
 {m.free && (
 <span className="bg-emerald-400 text-emerald-950 font-bold px-2.5 py-1 rounded-full">
 GRATUITO
 </span>
 )}
 {locked && (
 <span className="bg-black/30 backdrop-blur px-2.5 py-1 rounded-full border border-white/20 flex items-center gap-1">
 <Clock className="w-3 h-3" /> Em breve
 </span>
 )}
 </div>
 </div>
 </div>

 {/* LESSONS */}
 <div className="p-6">
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-sm font-semibold tracking-tight">Aulas do módulo</h3>
 <span className="text-xs text-muted-foreground">{m.lessons.length} itens</span>
 </div>
 <ul className="space-y-2">
 {m.lessons.map((l, i) => (
 <li
 key={l.id}
 className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/30 transition-colors"
 >
 <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">
 {String(i + 1).padStart(2, "0")}
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-sm font-medium truncate">{l.title}</div>
 <div className="text-[11px] text-muted-foreground capitalize">
 {l.type} · {l.duration}
 </div>
 </div>
 {locked? (
 <Lock className="w-4 h-4 text-muted-foreground" />
 ): l.type === "checklist"? (
 <CheckCircle2 className="w-4 h-4 text-primary" />
 ): (
 <PlayCircle className="w-5 h-5 text-primary" />
 )}
 </li>
 ))}
 </ul>

 {locked && (
 <div className="mt-6 p-4 rounded-xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground leading-relaxed">
 Este módulo faz parte dos planos pagos. Faça upgrade para liberar o conteúdo completo.
 </div>
 )}

 <div className="mt-6">
 <Button className="w-full gap-1.5" disabled={locked} size="lg">
 <PlayCircle className="w-4 h-4" />
 {locked? "Em breve": "Começar módulo"}
 </Button>
 </div>
 </div>
 </aside>
 </div>
 );
}

/* -------------------------------------------------------------------------- */
/* Decorative SVG art for covers / banners */
/* -------------------------------------------------------------------------- */

function ArtLayer({ kind, ink }: { kind: ModuleArt; ink: string }) {
 switch (kind) {
 case "grid":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <defs>
 <pattern id="p-grid" width="20" height="20" patternUnits="userSpaceOnUse">
 <path d="M20 0H0V20" fill="none" stroke={ink} strokeWidth="1" />
 </pattern>
 </defs>
 <rect width="400" height="200" fill="url(#p-grid)" />
 <rect x="40" y="40" width="80" height="40" fill={ink} rx="4" />
 <rect x="140" y="80" width="60" height="40" fill={ink} opacity="0.6" rx="4" />
 <rect x="220" y="50" width="100" height="60" fill={ink} opacity="0.4" rx="4" />
 </svg>
 );
 case "dots":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <defs>
 <pattern id="p-dots" width="14" height="14" patternUnits="userSpaceOnUse">
 <circle cx="2" cy="2" r="1.4" fill={ink} />
 </pattern>
 </defs>
 <rect width="400" height="200" fill="url(#p-dots)" />
 </svg>
 );
 case "stripes":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <defs>
 <pattern id="p-stripes" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
 <rect width="6" height="14" fill={ink} />
 </pattern>
 </defs>
 <rect width="400" height="200" fill="url(#p-stripes)" />
 </svg>
 );
 case "bars":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 {[30, 70, 110, 150, 190, 230, 270, 310, 350].map((x, i) => (
 <rect
 key={x}
 x={x}
 y={160 - (i * 13) % 110}
 width="22"
 height={(i * 13) % 110 + 30}
 fill={ink}
 rx="3"
 />
 ))}
 <line x1="0" y1="180" x2="400" y2="180" stroke={ink} strokeWidth="1" opacity="0.6" />
 </svg>
 );
 case "waves":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <path
 d="M0 120 Q 100 60 200 120 T 400 120 V200 H0Z"
 fill={ink}
 opacity="0.5"
 />
 <path d="M0 150 Q 100 90 200 150 T 400 150 V200 H0Z" fill={ink} />
 </svg>
 );
 case "rays":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <g transform="translate(360 30)" opacity="0.9">
 {Array.from({ length: 14 }).map((_, i) => (
 <rect
 key={i}
 x="0"
 y="0"
 width="260"
 height="6"
 fill={ink}
 transform={`rotate(${i * 13})`}
 />
 ))}
 </g>
 </svg>
 );
 case "orbits":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <g transform="translate(200 100)" fill="none" stroke={ink} strokeWidth="1.5">
 <ellipse cx="0" cy="0" rx="180" ry="60" />
 <ellipse cx="0" cy="0" rx="140" ry="46" transform="rotate(30)" />
 <ellipse cx="0" cy="0" rx="100" ry="32" transform="rotate(60)" />
 <circle cx="0" cy="0" r="8" fill={ink} stroke="none" />
 </g>
 </svg>
 );
 case "mesh":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <defs>
 <radialGradient id="m-1" cx="20%" cy="30%">
 <stop offset="0%" stopColor="white" stopOpacity="0.25" />
 <stop offset="100%" stopColor="white" stopOpacity="0" />
 </radialGradient>
 <radialGradient id="m-2" cx="80%" cy="80%">
 <stop offset="0%" stopColor="white" stopOpacity="0.18" />
 <stop offset="100%" stopColor="white" stopOpacity="0" />
 </radialGradient>
 </defs>
 <rect width="400" height="200" fill="url(#m-1)" />
 <rect width="400" height="200" fill="url(#m-2)" />
 </svg>
 );
 case "blueprint":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <defs>
 <pattern id="p-bp" width="24" height="24" patternUnits="userSpaceOnUse">
 <path d="M24 0H0V24" fill="none" stroke={ink} strokeWidth="0.6" />
 </pattern>
 </defs>
 <rect width="400" height="200" fill="url(#p-bp)" />
 <rect x="60" y="50" width="120" height="80" fill="none" stroke={ink} strokeWidth="2" rx="2" />
 <rect x="200" y="70" width="140" height="60" fill="none" stroke={ink} strokeWidth="2" rx="2" />
 <circle cx="120" cy="90" r="6" fill={ink} />
 <circle cx="270" cy="100" r="6" fill={ink} />
 </svg>
 );
 case "type":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <text
 x="-10"
 y="170"
 fontFamily="system-ui, sans-serif"
 fontWeight="900"
 fontSize="200"
 fill={ink}
 opacity="0.9"
 >
 01
 </text>
 </svg>
 );
 case "scope":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <g transform="translate(320 100)" fill="none" stroke={ink} strokeWidth="1.5">
 <circle r="80" />
 <circle r="55" />
 <circle r="30" />
 <line x1="-95" y1="0" x2="95" y2="0" />
 <line x1="0" y1="-95" x2="0" y2="95" />
 <circle r="5" fill={ink} stroke="none" />
 </g>
 </svg>
 );
 case "pulse":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <polyline
 points="0,120 40,120 60,80 80,160 100,120 140,120 160,60 180,170 200,120 240,120 260,90 280,150 300,120 400,120"
 fill="none"
 stroke={ink}
 strokeWidth="2.5"
 strokeLinejoin="round"
 strokeLinecap="round"
 />
 <polyline
 points="0,140 40,140 60,120 80,160 100,140 140,140 160,110 180,170 200,140 240,140 260,125 280,155 300,140 400,140"
 fill="none"
 stroke={ink}
 strokeWidth="1"
 opacity="0.5"
 />
 </svg>
 );
 case "loop":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round">
 <path d="M80 100 a60 60 0 1 1 120 0" />
 <path d="M200 100 a60 60 0 1 0 120 0" />
 <polyline points="200,40 215,40 215,55" />
 <polyline points="200,160 185,160 185,145" />
 </g>
 </svg>
 );
 case "spotlight":
 return (
 <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
 <defs>
 <radialGradient id="sp" cx="30%" cy="20%">
 <stop offset="0%" stopColor="white" stopOpacity="0.35" />
 <stop offset="60%" stopColor="white" stopOpacity="0.05" />
 <stop offset="100%" stopColor="white" stopOpacity="0" />
 </radialGradient>
 <pattern id="sp-dots" width="22" height="22" patternUnits="userSpaceOnUse">
 <circle cx="2" cy="2" r="1.2" fill={ink} />
 </pattern>
 </defs>
 <rect width="400" height="200" fill="url(#sp-dots)" />
 <rect width="400" height="200" fill="url(#sp)" />
 </svg>
 );
 }
}

/* -------------------------------------------------------------------------- */
/* ModuleCover - bespoke themed illustration per module */
/* -------------------------------------------------------------------------- */

function ModuleCover({ id }: { id: string }) {
 const W = "rgba(255,255,255,0.92)";
 const S = "rgba(255,255,255,0.55)";
 const F = "rgba(255,255,255,0.18)";
 const D = "rgba(0,0,0,0.25)";
 const common = {
 className: "w-full h-full",
 preserveAspectRatio: "xMidYMid slice" as const,
 viewBox: "0 0 400 200",
 };

 switch (id) {
 /* ONBOARDING - foguete decolando + checklist de ativação */
 case "mkt-on":
 return (
 <svg {...common}>
 <defs>
 <pattern id="cov-mkton-stars" width="40" height="40" patternUnits="userSpaceOnUse">
 <circle cx="6" cy="10" r="1" fill={S} />
 <circle cx="28" cy="26" r="0.8" fill={S} />
 <circle cx="18" cy="34" r="1.2" fill={S} />
 </pattern>
 </defs>
 <rect width="400" height="200" fill="url(#cov-mkton-stars)" />
 {/* rocket */}
 <g transform="translate(95 36) rotate(-12)">
 <path d="M30 0 C46 18 46 60 30 92 C14 60 14 18 30 0 Z" fill={W} />
 <circle cx="30" cy="32" r="9" fill={D} />
 <path d="M14 60 L0 86 L18 78 Z" fill={S} />
 <path d="M46 60 L60 86 L42 78 Z" fill={S} />
 <path d="M22 92 L30 118 L38 92 Z" fill="rgba(255,200,80,0.95)" />
 <path d="M25 100 L30 130 L35 100 Z" fill="rgba(255,140,40,0.95)" />
 </g>
 {/* checklist card */}
 <g transform="translate(220 44)">
 <rect width="150" height="112" rx="10" fill="rgba(0,0,0,0.32)" stroke={F} />
 {[0, 1, 2, 3].map((i) => (
 <g key={i} transform={`translate(14 ${16 + i * 22})`}>
 <rect width="14" height="14" rx="3" fill={i < 3? W: F} />
 {i < 3 && (
 <path d="M3 7 L6 10 L11 4" stroke="rgba(20,20,30,1)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 )}
 <rect x="22" y="3" width={i === 3? 70: 100} height="8" rx="2" fill={i < 3? W: S} opacity={i < 3? 0.9: 0.6} />
 </g>
 ))}
 </g>
 </svg>
 );

 /* DATA - barras + linha de tendência + ponto de destaque */
 case "kpis":
 return (
 <svg {...common}>
 <g opacity="0.95">
 {[40, 80, 120, 160, 200, 240, 280, 320].map((x, i) => {
 const h = [50, 72, 44, 96, 64, 110, 84, 130][i];
 return <rect key={x} x={x} y={170 - h} width="26" height={h} rx="3" fill={i === 5 || i === 7? W: F} />;
 })}
 <line x1="20" y1="170" x2="380" y2="170" stroke={S} strokeWidth="1" />
 <polyline
 points="53,140 93,118 133,148 173,96 213,124 253,76 293,108 333,52"
 fill="none"
 stroke={W}
 strokeWidth="2.5"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <circle cx="333" cy="52" r="6" fill={W} />
 <circle cx="333" cy="52" r="10" fill="none" stroke={W} strokeWidth="1.5" opacity="0.6" />
 </g>
 </svg>
 );

 /* MÍDIA PAGA - megafone com ondas + impacto */
 case "trafego":
 return (
 <svg {...common}>
 <g transform="translate(70 50)">
 <path d="M0 50 L60 30 L60 70 Z" fill={W} />
 <rect x="60" y="20" width="70" height="60" rx="6" fill={W} />
 <rect x="130" y="40" width="14" height="20" rx="3" fill={S} />
 <g fill="none" stroke={W} strokeWidth="3" strokeLinecap="round">
 <path d="M160 30 q24 20 0 40" opacity="0.9" />
 <path d="M180 18 q36 32 0 64" opacity="0.7" />
 <path d="M200 6 q48 44 0 88" opacity="0.45" />
 </g>
 </g>
 {/* coin spark */}
 <g transform="translate(310 130)">
 <circle r="22" fill={W} />
 <text x="0" y="6" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="22" fill="rgba(180,40,40,1)">
 $
 </text>
 </g>
 </svg>
 );

 /* SOCIAL MEDIA - feed com posts, coração e play */
 case "social":
 return (
 <svg {...common}>
 {/* phone frame */}
 <g transform="translate(50 26)">
 <rect width="110" height="160" rx="14" fill="rgba(0,0,0,0.35)" stroke={F} />
 <rect x="10" y="14" width="90" height="60" rx="6" fill={W} opacity="0.92" />
 <circle cx="55" cy="44" r="14" fill="rgba(0,0,0,0.18)" />
 <path d="M48 50 L62 42 L62 58 Z" fill={W} />
 <rect x="10" y="84" width="90" height="8" rx="2" fill={S} />
 <rect x="10" y="98" width="60" height="8" rx="2" fill={S} opacity="0.7" />
 {/* heart */}
 <g transform="translate(14 122)" fill={W}>
 <path d="M10 14 C2 8 2 0 8 0 C11 0 12 2 12 4 C12 2 13 0 16 0 C22 0 22 8 14 14 Z" />
 </g>
 <rect x="34" y="124" width="20" height="8" rx="2" fill={S} />
 </g>
 {/* floating tiles */}
 <g transform="translate(200 30)">
 <rect width="64" height="64" rx="10" fill={W} opacity="0.85" />
 <circle cx="32" cy="28" r="10" fill="rgba(0,0,0,0.18)" />
 <rect x="10" y="46" width="44" height="6" rx="2" fill="rgba(0,0,0,0.18)" />
 </g>
 <g transform="translate(286 76)">
 <rect width="74" height="74" rx="12" fill={F} stroke={S} />
 <path d="M28 24 L52 38 L28 52 Z" fill={W} />
 </g>
 <g transform="translate(214 116)">
 <rect width="60" height="60" rx="10" fill={W} opacity="0.7" />
 <path d="M30 44 C18 36 18 22 26 22 C30 22 31 26 31 28 C31 26 32 22 36 22 C44 22 44 36 32 44 Z" fill="rgba(220,50,90,1)" />
 </g>
 </svg>
 );

 /* CALENDÁRIO EDITORIAL - grid de calendário com datas marcadas */
 case "calendario":
 return (
 <svg {...common}>
 <g transform="translate(60 28)">
 <rect width="280" height="148" rx="12" fill="rgba(0,0,0,0.32)" stroke={F} />
 <rect width="280" height="28" rx="12" fill={W} opacity="0.9" />
 <rect y="20" width="280" height="10" fill={W} opacity="0.9" />
 <circle cx="44" cy="14" r="6" fill="rgba(0,0,0,0.35)" />
 <circle cx="64" cy="14" r="6" fill="rgba(0,0,0,0.35)" />
 <text x="140" y="19" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="12" fill="rgba(20,20,30,1)">
 CALENDÁRIO
 </text>
 {Array.from({ length: 28 }).map((_, i) => {
 const c = i % 7;
 const r = Math.floor(i / 7);
 const x = 14 + c * 38;
 const y = 44 + r * 26;
 const marked = [3, 7, 12, 18, 22, 25].includes(i);
 return (
 <g key={i} transform={`translate(${x} ${y})`}>
 <rect width="30" height="20" rx="4" fill={marked? W: F} opacity={marked? 0.95: 0.6} />
 {marked && <circle cx="15" cy="10" r="3" fill="rgba(220,50,90,1)" />}
 </g>
 );
 })}
 </g>
 </svg>
 );

 /* CRM - funil de vendas com estágios */
 case "crm":
 return (
 <svg {...common}>
 <g transform="translate(110 24)">
 <path d="M0 0 L180 0 L150 38 L150 60 L30 60 L30 38 Z" fill={W} opacity="0.92" />
 <path d="M30 70 L150 70 L130 102 L130 124 L50 124 L50 102 Z" fill={W} opacity="0.7" />
 <path d="M50 134 L130 134 L114 162 L66 162 Z" fill={W} opacity="0.5" />
 {/* dollar at the bottom */}
 <circle cx="90" cy="170" r="12" fill={W} />
 <text x="90" y="175" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="14" fill="rgba(60,20,90,1)">
 $
 </text>
 </g>
 {/* leads falling in */}
 <g fill={W}>
 <circle cx="60" cy="30" r="4" />
 <circle cx="80" cy="14" r="3" />
 <circle cx="100" cy="38" r="3.5" />
 <circle cx="320" cy="22" r="4" />
 <circle cx="340" cy="40" r="3" />
 <circle cx="350" cy="12" r="3.5" />
 </g>
 </svg>
 );

 /* E-MAIL MARKETING - envelope com @ e fluxo de automação */
 case "email":
 return (
 <svg {...common}>
 <g transform="translate(110 36)">
 <rect width="180" height="120" rx="10" fill={W} />
 <path d="M0 8 L90 78 L180 8" fill="none" stroke="rgba(20,40,80,1)" strokeWidth="3" />
 <circle cx="90" cy="60" r="22" fill="none" stroke="rgba(20,40,80,1)" strokeWidth="3" />
 <text x="90" y="68" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="26" fill="rgba(20,40,80,1)">
 @
 </text>
 </g>
 {/* automation flow dots */}
 <g fill="none" stroke={W} strokeWidth="2" strokeDasharray="4 5">
 <path d="M30 100 Q 70 60 110 96" />
 <path d="M290 96 Q 340 60 370 100" />
 </g>
 <circle cx="30" cy="100" r="5" fill={W} />
 <circle cx="370" cy="100" r="5" fill={W} />
 </svg>
 );


 /* PRODUÇÃO DE VÍDEO - claquete + play */
 case "producao":
 return (
 <svg {...common}>
 <g transform="translate(60 40)">
 {/* clapper top */}
 <path d="M0 20 L160 0 L168 20 L8 40 Z" fill="rgba(20,20,30,0.9)" />
 <g fill={W}>
 <polygon points="6,24 22,8 34,8 18,24" />
 <polygon points="40,22 56,6 68,6 52,22" />
 <polygon points="74,20 90,4 102,4 86,20" />
 <polygon points="108,18 124,2 136,2 120,18" />
 <polygon points="142,16 158,0 168,2 152,18" />
 </g>
 {/* board */}
 <rect x="0" y="40" width="168" height="100" rx="6" fill={W} />
 {/* play */}
 <circle cx="84" cy="90" r="28" fill="rgba(20,20,30,0.92)" />
 <path d="M76 78 L104 90 L76 102 Z" fill={W} />
 </g>
 {/* film perforations */}
 <g fill={W} opacity="0.85">
 {[20, 50, 80, 110, 140, 170].map((y) => (
 <rect key={y} x="6" y={y} width="10" height="14" rx="2" />
 ))}
 {[20, 50, 80, 110, 140, 170].map((y) => (
 <rect key={y} x="384" y={y} width="10" height="14" rx="2" />
 ))}
 </g>
 </svg>
 );

 /* FOLLOW-UP - relógio com seta circular + sino */
 case "followup":
 return (
 <svg {...common}>
 <g transform="translate(130 100)">
 <circle r="64" fill={W} />
 <circle r="64" fill="none" stroke={D} strokeWidth="3" />
 {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
 <line
 key={a}
 x1="0"
 y1="-58"
 x2="0"
 y2="-50"
 stroke="rgba(20,40,40,0.6)"
 strokeWidth="2"
 transform={`rotate(${a})`}
 />
 ))}
 <line x1="0" y1="0" x2="0" y2="-36" stroke="rgba(20,40,40,1)" strokeWidth="4" strokeLinecap="round" />
 <line x1="0" y1="0" x2="26" y2="10" stroke="rgba(20,40,40,1)" strokeWidth="4" strokeLinecap="round" />
 <circle r="4" fill="rgba(20,40,40,1)" />
 {/* circular arrow around clock */}
 <g fill="none" stroke={W} strokeWidth="3" strokeLinecap="round">
 <path d="M -76 -10 A 78 78 0 1 1 76 -10" />
 <polygon points="76,-10 64,-18 64,-2" fill={W} />
 </g>
 </g>
 {/* bell */}
 <g transform="translate(290 110)" fill={W}>
 <path d="M0 30 C0 12 8 0 22 0 C36 0 44 12 44 30 L48 38 L-4 38 Z" />
 <circle cx="22" cy="46" r="4" />
 <circle cx="36" cy="6" r="6" fill="rgba(220,50,90,1)" />
 </g>
 </svg>
 );

 /* BRANDING - monograma + paleta de cores */
 case "branding":
 return (
 <svg {...common}>
 <g transform="translate(70 30)">
 <rect width="120" height="120" rx="18" fill={W} />
 <text
 x="60"
 y="86"
 textAnchor="middle"
 fontFamily="Georgia, serif"
 fontWeight="900"
 fontSize="72"
 fill="rgba(20,20,30,1)"
 >
 M
 </text>
 </g>
 {/* color palette swatches */}
 <g transform="translate(220 40)">
 <rect width="120" height="120" rx="12" fill="rgba(0,0,0,0.3)" stroke={F} />
 {[
 { c: "rgba(230,80,80,1)", x: 10, y: 10 },
 { c: "rgba(245,180,80,1)", x: 64, y: 10 },
 { c: "rgba(80,180,150,1)", x: 10, y: 64 },
 { c: "rgba(80,120,220,1)", x: 64, y: 64 },
 ].map((s, i) => (
 <rect key={i} x={s.x} y={s.y} width="46" height="46" rx="6" fill={s.c} />
 ))}
 </g>
 {/* dashed connector */}
 <line x1="190" y1="100" x2="220" y2="100" stroke={W} strokeWidth="2" strokeDasharray="4 4" />
 </svg>
 );

 /* BENCHMARKING - comparativo de duas marcas + lupa */
 case "benchmarking":
 return (
 <svg {...common}>
 <g transform="translate(40 40)" opacity="0.95">
 {/* brand A */}
 <rect width="120" height="120" rx="10" fill="rgba(0,0,0,0.32)" stroke={F} />
 <text x="60" y="40" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="14" fill={W}>
 VOCÊ
 </text>
 <rect x="14" y="56" width="20" height="50" rx="3" fill={W} />
 <rect x="40" y="72" width="20" height="34" rx="3" fill={W} opacity="0.7" />
 <rect x="66" y="48" width="20" height="58" rx="3" fill={W} />
 <rect x="92" y="80" width="20" height="26" rx="3" fill={W} opacity="0.7" />
 </g>
 <g transform="translate(180 40)" opacity="0.95">
 <rect width="120" height="120" rx="10" fill="rgba(0,0,0,0.32)" stroke={F} />
 <text x="60" y="40" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="14" fill={W}>
 CONCORRENTE
 </text>
 <rect x="14" y="68" width="20" height="38" rx="3" fill={W} opacity="0.7" />
 <rect x="40" y="56" width="20" height="50" rx="3" fill={W} />
 <rect x="66" y="76" width="20" height="30" rx="3" fill={W} opacity="0.7" />
 <rect x="92" y="50" width="20" height="56" rx="3" fill={W} />
 </g>
 {/* magnifier */}
 <g transform="translate(320 110)" fill="none" stroke={W} strokeWidth="4" strokeLinecap="round">
 <circle r="22" />
 <line x1="16" y1="16" x2="36" y2="36" />
 </g>
 </svg>
 );

 /* SEO - lupa com cursor + termos + seta crescimento */
 case "seo":
 return (
 <svg {...common}>
 {/* search bar */}
 <g transform="translate(40 36)">
 <rect width="240" height="40" rx="20" fill={W} />
 <circle cx="22" cy="20" r="8" fill="none" stroke="rgba(20,40,30,1)" strokeWidth="2.5" />
 <line x1="28" y1="26" x2="36" y2="34" stroke="rgba(20,40,30,1)" strokeWidth="2.5" strokeLinecap="round" />
 <text x="50" y="26" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="14" fill="rgba(20,40,30,1)">
 palavra-chave
 </text>
 <rect x="220" y="10" width="2" height="20" fill="rgba(20,40,30,1)" />
 </g>
 {/* growth bars climbing */}
 <g transform="translate(60 100)">
 {[20, 36, 54, 72, 90, 108].map((x, i) => {
 const h = 14 + i * 10;
 return <rect key={x} x={x} y={70 - h} width="14" height={h} rx="2" fill={W} opacity={0.5 + i * 0.08} />;
 })}
 <polyline
 points="20,56 50,46 80,32 110,22 140,10 170,-4"
 transform="translate(7 14)"
 fill="none"
 stroke={W}
 strokeWidth="2.5"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <polygon points="180,4 170,8 178,16" fill={W} transform="translate(7 14)" />
 </g>
 {/* keyword chips */}
 <g transform="translate(290 110)" fill={W}>
 <rect width="80" height="20" rx="10" opacity="0.85" />
 <rect y="28" width="60" height="20" rx="10" opacity="0.6" />
 <rect y="56" width="70" height="20" rx="10" opacity="0.5" />
 </g>
 </svg>
 );

 /* TRACKING - pixels caindo em funil + dashboard */
 case "tracking":
 return (
 <svg {...common}>
 {/* falling pixels */}
 <g fill={W}>
 {[
 [40, 18, 6],
 [70, 32, 4],
 [100, 14, 5],
 [130, 36, 4],
 [60, 56, 3],
 [110, 60, 4],
 [90, 80, 5],
 ].map(([x, y, r], i) => (
 <rect key={i} x={x} y={y} width={r * 2} height={r * 2} rx="1.5" opacity={0.5 + (i % 4) * 0.12} />
 ))}
 </g>
 {/* connector funnel */}
 <path d="M30 100 L170 100 L130 130 L70 130 Z" fill={W} opacity="0.85" />
 <line x1="100" y1="130" x2="100" y2="180" stroke={W} strokeWidth="3" />
 {/* dashboard card */}
 <g transform="translate(210 36)">
 <rect width="160" height="128" rx="10" fill="rgba(0,0,0,0.32)" stroke={F} />
 <rect x="12" y="14" width="60" height="10" rx="2" fill={W} opacity="0.8" />
 <rect x="12" y="30" width="40" height="6" rx="2" fill={S} />
 <polyline
 points="12,90 36,72 60,82 84,58 108,68 132,46 148,52"
 fill="none"
 stroke={W}
 strokeWidth="2.5"
 strokeLinejoin="round"
 strokeLinecap="round"
 />
 <line x1="12" y1="106" x2="148" y2="106" stroke={S} />
 {[18, 42, 66, 90, 114].map((x) => (
 <rect key={x} x={x} y={112} width="14" height="8" rx="2" fill={W} opacity="0.7" />
 ))}
 </g>
 </svg>
 );

 default:
 return null;
 }
}
