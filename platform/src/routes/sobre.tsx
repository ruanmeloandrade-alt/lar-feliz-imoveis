import { createFileRoute, Link } from "@tanstack/react-router";
import { MouseGlow, NavBar } from "@/components/landing/shell";
import { Footer } from "@/components/landing/closing";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre a Vanessa Simoni, central operacional de marketing" },
      {
        name: "description",
        content:
          "Conheça a Vanessa Simoni: central operacional de marketing criada pela RBMIDIA para reunir atendimento, tráfego, social media, tracking, CRM e fluxo de trabalho em um lugar só.",
      },
      { property: "og:title", content: "Sobre a Vanessa Simoni" },
      {
        property: "og:description",
        content:
          "A história, a missão e o time por trás da Vanessa Simoni, a central operacional de marketing da RBMIDIA.",
      },
      { property: "og:url", content: "https://saudeslim.com.br/sobre" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://saudeslim.com.br/sobre" }],
  }),
  component: SobrePage,
});

const NUMBERS = [
  { k: "26 mil+", v: "alunos formados nos treinamentos da RBMIDIA" },
  { k: "2 mil+", v: "avaliações cinco estrelas" },
  { k: "150+", v: "empresas atendidas" },
  { k: "R$ 3 mi+", v: "em mídia gerenciada" },
];

const PILLARS = [
  {
    t: "Operação inteira em um lugar",
    d: "Atendimento, tráfego pago, social media, tracking, CRM e fluxo de trabalho no mesmo painel, sem pular entre cinco ferramentas e três planilhas.",
  },
  {
    t: "Dado que vira decisão",
    d: "Cada lead, conversa e conversão fica rastreada da origem até o contrato, para você saber o que pagou a conta e o que só gastou verba.",
  },
  {
    t: "IA como apoio, não como enfeite",
    d: "A inteligência artificial trabalha dentro da rotina: qualifica lead, sugere criativo, organiza tarefa e alerta o gestor antes do problema estourar.",
  },
  {
    t: "Acessível para qualquer porte",
    d: "Da empresa que está começando à agência com time inteiro, a central cresce junto com a operação e você ativa só o que precisa.",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/8 py-10">
      <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-white/70">{children}</div>
    </section>
  );
}

function SobrePage() {
  return (
    <div className="mkton-landing relative min-h-screen bg-[#050505] text-white">
      <MouseGlow />
      <NavBar />
      <main className="relative z-10 pt-32 pb-20">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="ml-card p-8 md:p-12">
            <span className="ml-chip ml-chip-neon">Sobre nós</span>
            <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mt-5">
              A Vanessa Simoni é a central operacional do seu marketing
            </h1>
            <p className="mt-4 max-w-3xl text-white/60">
              A Vanessa Simoni nasceu dentro da rotina de quem opera marketing todo dia. Em vez de mais uma
              ferramenta solta, ela reúne atendimento, tráfego pago, social media, tracking, CRM e
              fluxo de trabalho em uma operação única, com dados conectados de ponta a ponta.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {NUMBERS.map((n) => (
                <div
                  key={n.k}
                  className="rounded-2xl border border-white/8 bg-white/[0.02] p-5"
                >
                  <div className="font-display text-2xl font-bold text-white">{n.k}</div>
                  <div className="mt-1 text-[13px] leading-snug text-white/55">{n.v}</div>
                </div>
              ))}
            </div>

            <Section title="Por que existimos">
              <p>
                A maior parte das empresas não perde venda por falta de esforço, perde por falta de
                organização. O lead chega por um canal, a conversa acontece em outro, o anúncio
                roda em um terceiro e o time descobre o resultado tarde demais, quando o dinheiro
                já foi gasto.
              </p>
              <p>
                A Vanessa Simoni foi criada para acabar com esse buraco. Tudo o que a operação precisa fica
                no mesmo lugar, conectado, com histórico e com responsabilidade clara sobre cada
                etapa. O objetivo é simples: deixar o marketing profissional acessível para
                qualquer empresa, não só para quem tem uma estrutura enorme.
              </p>
            </Section>

            <Section title="No que acreditamos">
              <div className="grid gap-4 md:grid-cols-2">
                {PILLARS.map((p) => (
                  <div
                    key={p.t}
                    className="rounded-2xl border border-white/8 bg-white/[0.02] p-5"
                  >
                    <div className="font-display text-lg font-semibold text-white">{p.t}</div>
                    <p className="mt-2 text-[14px] leading-relaxed text-white/60">{p.d}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Quem está por trás">
              <p>
                A Vanessa Simoni é um produto da <strong className="text-white">RBMIDIA</strong>, agência
                fundada por <strong className="text-white">Ruan Barone</strong>, especialista em
                tráfego pago que atua no digital desde 2018. A agência atende empresas de portes
                e segmentos diferentes e leva para dentro do produto o que aprendeu gerenciando
                mídia e operações comerciais reais.
              </p>
              <p>
                Além do trabalho com clientes, a RBMIDIA já formou mais de 26 mil alunos em seus
                treinamentos, com mais de 2 mil avaliações cinco estrelas. Essa base de ensino é o
                que garante que a plataforma não seja só software: quem entra recebe também o
                caminho para operar como agência grande.
              </p>
            </Section>

            <Section title="Como falar com a gente">
              <p>
                Time e operação em Rio das Ostras, RJ, atendendo empresas em todo o Brasil. Para
                dúvidas sobre a plataforma, parcerias ou suporte, use os canais abaixo.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/auth"
                  className="rounded-xl bg-white px-5 py-3 text-[14px] font-semibold text-[#050505] transition-opacity hover:opacity-90"
                >
                  Criar minha conta grátis
                </Link>
                <Link
                  to="/ajuda"
                  className="rounded-xl border border-white/15 px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-white/5"
                >
                  Central de ajuda
                </Link>
                <Link
                  to="/blog"
                  className="rounded-xl border border-white/15 px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-white/5"
                >
                  Ler o blog
                </Link>
              </div>
              <p className="pt-2 text-[13px] text-white/45">
                Documentos legais:{" "}
                <Link to="/privacidade" className="text-[#a855f7] hover:underline">
                  Política de Privacidade
                </Link>{" "}
                e{" "}
                <Link to="/termos" className="text-[#a855f7] hover:underline">
                  Termos de Uso
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
