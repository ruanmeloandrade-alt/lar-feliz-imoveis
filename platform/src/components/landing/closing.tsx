import * as React from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Key, Lock, Minus, Plus, ScrollText, ShieldCheck, UserCheck } from "lucide-react";
import { Reveal, Section } from "./shell";
import mktonLogo from "@/assets/mkton-logo.png.asset.json";

export function Security() {
  const items = [
    { i: ShieldCheck, t: "LGPD", d: "Mapeamento completo, DPO sob demanda, requisições automáticas." },
    { i: Lock, t: "Criptografia", d: "AES-256 em repouso · TLS 1.3 em trânsito · chaves rotacionadas." },
    { i: FileText, t: "Logs auditáveis", d: "Cada ação registrada, exportável a qualquer momento." },
    { i: UserCheck, t: "Permissões granulares", d: "Papéis, escopos, IPs e horários por usuário." },
    { i: Key, t: "Autenticação forte", d: "SSO · 2FA · biometria · OAuth · SAML." },
    { i: ScrollText, t: "Backups contínuos", d: "Snapshots a cada 6h · retenção 30 dias · restauração 1-clique." },
  ];
  return (
    <Section
      align="split"
      eyebrow="Segurança"
      title={<>Sua operação inteira,<br />blindada por padrão.</>}
      description="Infraestrutura de classe enterprise para empresas que não toleram surpresas."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((x, i) => (
          <Reveal key={x.t} delay={i * 0.05}>
            <div className="ml-card p-6 h-full">
              <x.i className="h-5 w-5 text-[#a855f7]" />
              <div className="font-display text-xl font-bold mt-4">{x.t}</div>
              <div className="text-sm text-white/55 mt-2 leading-relaxed">{x.d}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

const PLANS = [
  {
    n: "Start",
    d: "Para organizar o processo comercial de ponta a ponta.",
    inc: ["CRM", "Automações", "Agentes IA", "Dashboard"],
  },
  {
    n: "Growth",
    d: "Para times que precisam de processo e execução.",
    inc: ["Tudo do Start", "Fluxo de Trabalho"],
  },
  {
    n: "Performance",
    d: "Para saber exatamente de onde vem cada venda.",
    inc: ["Tudo do Growth", "Tracking"],
  },
  {
    n: "Scale",
    d: "A operação de marketing inteira dentro da MKTOn.",
    inc: ["Tudo do Performance", "Gestor de Tráfego", "Social Media"],
  },
];

export function Plans() {
  return (
    <Section
      id="planos"
      align="center"
      eyebrow="Planos"
      title={<>Quatro caminhos.<br />Uma mesma ambição.</>}
      description="Sem preço aqui. O valor exato aparece dentro da plataforma, calibrado pelo tamanho da sua operação."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p, i) => (
          <Reveal key={p.n} delay={i * 0.06}>
            <div className="ml-card p-6 h-full flex flex-col">
              <div className="font-tech text-[10px] uppercase text-white/40">Plano {String(i + 1).padStart(2, "0")}</div>
              <div className="font-display text-3xl font-bold mt-2">{p.n}</div>
              <div className="text-sm text-white/55 mt-2 leading-relaxed">{p.d}</div>
              <div className="my-6 h-px bg-white/8" />
              <ul className="space-y-2 mb-6">
                {p.inc.map((x) => (
                  <li key={x} className="flex items-center gap-2 text-sm text-white/75">
                    <span className="h-1 w-1 rounded-full bg-[#a855f7]" />
                    {x}
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="ml-btn-ghost justify-center mt-auto !py-3 !text-[12px]">
                Ver valores ao criar conta
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-8 text-center font-tech text-[11px] uppercase text-white/40">
        Os valores são revelados após o cadastro · 20 dias gratuitos antes de qualquer cobrança
      </p>
    </Section>
  );
}


export function FreeTrial() {
  return (
    <Section eyebrow="20 dias gratuitos" title={<><span className="ml-neon-text">20</span> dias para colocar tudo ON.</>}>
      <Reveal>
        <div className="ml-card relative overflow-hidden p-10 md:p-14">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#a855f7]/10 blur-3xl" />
          <div className="grid gap-10 md:grid-cols-[1fr_auto] items-center">
            <div>
              <p className="text-xl md:text-2xl text-white/80 leading-relaxed max-w-2xl">
                Qualquer empresa pode rodar a Vanessa Simoni inteira por 20 dias.
                Sem cartão. Sem compromisso. Sem versão limitada.
                <br />
                <span className="text-white">Você só decide se quer continuar quando os resultados aparecerem.</span>
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="ml-chip ml-chip-neon">Acesso completo</span>
                <span className="ml-chip">Sem cartão</span>
                <span className="ml-chip">Cancelamento em 1 clique</span>
                <span className="ml-chip">Onboarding incluído</span>
              </div>
            </div>
            <Link to="/auth" className="ml-btn-primary !text-base !px-7 !py-5">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function FAQ() {
  const [open, setOpen] = React.useState<number | null>(0);

  const items = [
    {
      q: "O que é a MKTOn?",
      a: "A MKTOn é o sistema operacional do marketing brasileiro: CRM, IA, tráfego pago, social media, atendimento, analytics e automações em uma única plataforma integrada.",
    },
    {
      q: "Quanto custa a MKTOn?",
      a: "Os valores são calibrados pelo tamanho da sua operação e aparecem dentro da plataforma após o cadastro. Você pode experimentar tudo por 20 dias antes de qualquer cobrança.",
    },
    {
      q: "Como funciona o trial de 20 dias?",
      a: "Você cria uma conta e usa a MKTOn completa por 20 dias. Sem cartão, sem versão limitada e sem compromisso. Só decide se quer continuar quando os resultados aparecerem.",
    },
    {
      q: "Preciso de cartão de crédito para testar?",
      a: "Não. O teste é totalmente gratuito e não exige cartão. Só insira dados de pagamento se decidir continuar após os 20 dias.",
    },
    {
      q: "A MKTOn substitui meu CRM atual?",
      a: "A MKTOn possui CRM próprio, integrado com WhatsApp, Meta e Google. Todos os leads chegam direto ao seu funil.",
    },
    {
      q: "Quais integrações estão disponíveis?",
      a: "Meta Ads, Google Ads, TikTok, WhatsApp Cloud API, Instagram, OpenAI, Gemini e muito mais. Novas integrações são lançadas continuamente.",
    },
    {
      q: "A MKTOn é só para agências?",
      a: "Não. A MKTOn serve agências, freelancers, consultores e empresas de qualquer porte que precisam centralizar marketing, vendas e atendimento.",
    },
    {
      q: "A IA é inclusa em todos os planos?",
      a: "Sim. A IA assistida está disponível em todos os planos, com limites de uso escalando conforme o tamanho da operação. Agentes IA avançados variam por plano.",
    },
    {
      q: "Como funciona o suporte e o onboarding?",
      a: "Todo novo cliente tem onboarding incluído. O suporte vai de chat nos planos iniciais até customer success e equipe MKTOn alocada nos planos Enterprise.",
    },
    {
      q: "Consigo migrar meus dados de outras ferramentas?",
      a: "Sim. Oferecemos importação de leads, contatos, negócios e histórico de conversas das principais plataformas do mercado, com auxílio da nossa equipe.",
    },
    {
      q: "A MKTOn é segura e está em conformidade com a LGPD?",
      a: "Sim. Utilizamos criptografia AES-256 em repouso, TLS 1.3 em trânsito, autenticação forte, permissões granulares, backups a cada 6h e requisições automáticas de titular LGPD.",
    },
    {
      q: "Como funciona o cancelamento?",
      a: "Simples e em um clique. Você pode cancelar a qualquer momento dentro da plataforma, sem multa, sem burocracia e sem pegadinhas.",
    },
  ];

  return (
    <section className="relative overflow-hidden border-t border-white/8 py-24 md:py-32">
      <div className="absolute inset-0 ml-grid-bg opacity-30" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(ellipse_at_bottom,rgba(168,85,247,0.12),transparent_70%)]" />
      <div className="relative mx-auto max-w-[900px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="text-center mb-14"
        >
          <span className="ml-chip ml-chip-neon">FAQ</span>
          <h2 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl tracking-tight mt-6">
            Perguntas frequentes
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
            Tudo que você precisa saber antes de colocar sua operação na Vanessa Simoni.
          </p>
        </motion.div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={i} delay={i * 0.03}>
                <div className="ml-card overflow-hidden">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="font-display text-lg md:text-xl font-semibold">{item.q}</span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70">
                      {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-white/60 leading-relaxed">{item.a}</p>
                  </motion.div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-14 text-center"
        >
          <p className="text-white/60 mb-5">Não encontrou sua dúvida? Teste grátis por 20 dias e descubra na prática.</p>
          <Link to="/auth" className="ml-btn-primary !text-base !px-7 !py-5">
            Criar conta gratuitamente <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export function Footer() {
  const groups = [
    { t: "Produto", l: ["Recursos", "Integrações", "Segurança", "Status"] },
    { t: "Empresa", l: ["Sobre", "Carreiras", "Imprensa", "Contato"] },
    { t: "Recursos", l: ["Documentação", "Ajuda", "Faculdade MKTOn", "API"] },
    { t: "Legal", l: ["Privacidade", "Termos", "LGPD", "Exclusão de dados", "Cookies"] },
  ];
  return (
    <footer className="border-t border-white/8 bg-[#050505] py-16">
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-white/95 p-2 shadow-[0_0_24px_rgba(168,85,247,0.25)]">
                <img src={mktonLogo.url} alt="Vanessa Simoni" className="h-8 w-auto select-none" draggable={false} />
              </div>
            </div>
            <p className="mt-3 text-sm text-white/45 max-w-xs leading-relaxed">
              O sistema operacional do marketing brasileiro. Tudo ON. Sempre.
            </p>
            <p className="mt-6 font-tech text-[10px] uppercase text-white/30">MKTON.IO · RIO DE JANEIRO · BR</p>
          </div>
          {groups.map((g) => (
            <div key={g.t}>
              <div className="font-tech text-[10px] uppercase text-white/40 mb-4">{g.t}</div>
              <ul className="space-y-2">
                {g.l.map((x) => {
                  const href =
                    x === "Privacidade" || x === "LGPD"
                      ? "/privacidade"
                      : x === "Termos"
                      ? "/termos"
                      : x === "Exclusão de dados"
                      ? "/data-deletion"
                      : "#";
                  const isInternal = href.startsWith("/");
                  return (
                    <li key={x}>
                      {isInternal ? (
                        <Link to={href as "/termos"} className="text-sm text-white/65 hover:text-white transition-colors">
                          {x}
                        </Link>
                      ) : (
                        <a href={href} className="text-sm text-white/65 hover:text-white transition-colors">
                          {x}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-6 font-tech text-[10px] uppercase text-white/35">
          <span>© 2026 Vanessa Simoni · Todos os direitos reservados</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7] ml-pulse" />
            STATUS · ALL SYSTEMS ON
          </span>
        </div>
      </div>
    </footer>
  );
}
