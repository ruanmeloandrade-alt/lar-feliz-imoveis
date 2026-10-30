import * as React from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Calculator,
  Clock,
  MessageCircle,
  Palette,
  Phone,
  Truck,
  Video,
  Wrench,
  BarChart3,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { Reveal, Section } from "./shell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type CostDetail = {
  market: { label: string; value: string; source: string }[];
  bullets: string[];
  mkton: string;
};

type Cost = {
  icon: typeof Truck;
  label: string;
  range: string;
  avg: number;
  period: string;
  note: string;
  details: CostDetail;
};

const COSTS: Cost[] = [
  {
    icon: Truck,
    label: "Gestor de tráfego",
    range: "R$ 1.200 a R$ 2.500",
    avg: 1850,
    period: "/mês",
    note: "Profissional terceirizado",
    details: {
      market: [
        { label: "Freelancer pleno", value: "R$ 1.200 a R$ 2.500/mês", source: "Workana e GetNinjas (médias de propostas para gestão mensal de campanhas)" },
        { label: "Agência boutique", value: "R$ 2.500 a R$ 5.000/mês", source: "RD Station, Panorama de Agências 2024" },
      ],
      bullets: [
        "Geralmente atende várias contas ao mesmo tempo, diluindo atenção.",
        "Cobra extra por criativo, copy e relatórios fora do escopo.",
        "Você ainda precisa contratar à parte CRM, tracking e automações.",
      ],
      mkton: "Na MKTOn, o gestor de tráfego com IA roda campanhas, gera criativos e ajusta lances 24/7, dentro do mesmo plano.",
    },
  },
  {
    icon: Palette,
    label: "Social media",
    range: "R$ 500 a R$ 2.500",
    avg: 1500,
    period: "/mês",
    note: "De freelancer iniciante a profissional pleno",
    details: {
      market: [
        { label: "Freelancer iniciante", value: "R$ 500 a R$ 900/mês", source: "GetNinjas (média de propostas para 12 posts mensais)" },
        { label: "Social media pleno", value: "R$ 1.200 a R$ 2.500/mês", source: "Catho, Pesquisa Salarial 2024" },
      ],
      bullets: [
        "Entrega de 8 a 16 posts por mês, sem reels diários.",
        "Criativos pagos costumam ser cobrados à parte.",
        "Aprovações lentas e dependência de uma única pessoa.",
      ],
      mkton: "Calendário editorial, criativos, copys e agendamento já vêm prontos para Instagram, TikTok e Facebook.",
    },
  },
  {
    icon: BarChart3,
    label: "CRM",
    range: "R$ 2.000 a R$ 3.000",
    avg: 417,
    period: "/mês",
    note: "Valor médio semestral diluído",
    details: {
      market: [
        { label: "HubSpot Sales Pro", value: "A partir de R$ 540/usuário/mês", source: "hubspot.com/pricing/sales" },
        { label: "Pipedrive Professional", value: "A partir de R$ 320/usuário/mês", source: "pipedrive.com/pt/pricing" },
      ],
      bullets: [
        "Cobrança por usuário: a conta cresce conforme o time cresce.",
        "Integrações importantes (WhatsApp, telefonia, IA) são add-ons pagos.",
        "Customização e onboarding muitas vezes envolvem consultoria à parte.",
      ],
      mkton: "CRM completo, multifunil, com automações e IA já incluídos, sem cobrar por usuário extra.",
    },
  },
  {
    icon: Phone,
    label: "Call center",
    range: "R$ 10.000+",
    avg: 10000,
    period: "/mês",
    note: "Equivale a 3 ou 4 atendentes no salário mínimo",
    details: {
      market: [
        { label: "Salário mínimo nacional", value: "R$ 1.518/mês", source: "Governo Federal, vigente em 2025" },
        { label: "Custo real por atendente CLT", value: "≈ R$ 2.500 a R$ 3.000/mês", source: "Sebrae, encargos, vale-transporte e vale-refeição somam ~70% sobre o salário" },
        { label: "Operação de 3 a 4 atendentes", value: "R$ 9.000 a R$ 12.000/mês", source: "Cálculo direto sobre o custo CLT acima" },
      ],
      bullets: [
        "Horário fixo, com pausa, almoço, férias e atestados.",
        "Limite humano: cada pessoa atende um lead por vez.",
        "Sem ligar fora do expediente, sem atender feriado, sem escalar sem contratar mais gente.",
      ],
      mkton: "Call center com IA ilimitado: liga a hora que quiser, quantas vezes quiser, com 'atendentes' ilimitados rodando em paralelo, por uma fração do custo de uma única pessoa.",
    },
  },
  {
    icon: Video,
    label: "Editor de vídeo",
    range: "R$ 120 a R$ 1.200",
    avg: 1200,
    period: "/mês",
    note: "De edição avulsa a pacote profissional mensal",
    details: {
      market: [
        { label: "Edição de Reels avulso", value: "R$ 120 a R$ 300 por vídeo", source: "Workana e 99Freelas (médias por entrega curta)" },
        { label: "Pacote mensal 4 vídeos", value: "R$ 600 a R$ 1.200/mês", source: "Médias de agências boutique de vídeo" },
      ],
      bullets: [
        "Prazo médio de 3 a 7 dias por entrega.",
        "Alterações extras quase sempre são cobradas à parte.",
        "Difícil escalar para postar todo dia.",
      ],
      mkton: "Edição automática com IA gera variações de Reels, cortes verticais e legendas em minutos, dentro do plano.",
    },
  },
  {
    icon: Truck,
    label: "Plataforma de tracking",
    range: "R$ 500 a R$ 1.400",
    avg: 950,
    period: "/mês",
    note: "Analytics e atribuição de campanhas",
    details: {
      market: [
        { label: "Utmify / Redtrack", value: "US$ 99 a US$ 249/mês", source: "redtrack.io/pricing e utmify.com.br/precos" },
        { label: "Hyros", value: "A partir de US$ 199/mês", source: "hyros.com/pricing" },
      ],
      bullets: [
        "Cobrado por eventos ou cliques mensais.",
        "Requer integração técnica com cada plataforma de anúncio.",
        "Geralmente não integra direto com o CRM.",
      ],
      mkton: "Tracking nativo, conectando anúncio, lead, conversa e venda no mesmo painel.",
    },
  },
  {
    icon: Clock,
    label: "Plataforma de clocker",
    range: "R$ 600 a R$ 1.200",
    avg: 900,
    period: "/mês",
    note: "Gestão de ponto e produtividade",
    details: {
      market: [
        { label: "Sólides Ponto (plano equipe)", value: "R$ 600 a R$ 900/mês", source: "solides.com.br/ponto (pacote para 50+ colaboradores)" },
        { label: "Tangerino / Senior (plano mensal)", value: "R$ 800 a R$ 1.200/mês", source: "tangerino.com.br/preco e senior.com.br" },
      ],
      bullets: [
        "Cobra por colaborador ativo: a conta cresce com o time.",
        "Relatórios de produtividade vendidos como upgrade.",
        "Integração com CRM ou metas comerciais é rara.",
      ],
      mkton: "Controle de jornada, metas e produtividade já conectado ao funil e ao CRM, sem cobrar por colaborador.",
    },
  },
  {
    icon: MessageCircle,
    label: "Automações (WhatsApp/IG)",
    range: "R$ 200 a R$ 500",
    avg: 350,
    period: "/mês",
    note: "Somente automação crua, sem CRM",
    details: {
      market: [
        { label: "ManyChat Pro", value: "A partir de US$ 15/mês (escala rápido)", source: "manychat.com/pricing" },
        { label: "Zapier Professional", value: "A partir de US$ 49/mês", source: "zapier.com/pricing" },
      ],
      bullets: [
        "Fluxos crus, sem CRM, sem funil, sem ligação com vendas.",
        "Quanto mais contatos, mais cara a fatura.",
        "Cada integração nova exige plano superior.",
      ],
      mkton: "Automações de WhatsApp e Instagram já conectadas ao CRM, IA, atendimento e tráfego.",
    },
  },
];

function formatCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function TotalCounter() {
  const ref = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const total = COSTS.reduce((acc, c) => acc + c.avg, 0);
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    if (!isInView) return;
    const start = performance.now();
    const duration = 1800;
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(total * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, total]);

  return (
    <div ref={ref} className="ml-card p-8 md:p-10 flex flex-col justify-center h-full relative overflow-hidden">
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#a855f7]/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-5 w-5 text-[#a855f7]" />
          <span className="font-tech text-[11px] uppercase text-[#a855f7]">Soma de custos separados</span>
        </div>
        <div className="font-display text-5xl md:text-6xl font-bold tracking-tight">
          {formatCurrency(value)}
        </div>
        <p className="mt-2 text-white/50 text-sm">por mês, em média, para ter tudo contratado fora.</p>
        <div className="my-6 h-px bg-white/10" />
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-[#a855f7]/15 p-2 mt-0.5">
            <Wrench className="h-4 w-4 text-[#a855f7]" />
          </div>
          <div>
            <p className="text-white/80 font-medium">Na Vanessa Simoni, tudo isso vive em um único plano.</p>
            <p className="text-white/50 text-sm mt-1">Uma fatura, um ambiente, um time de suporte. Sem somar dezenas de ferramentas.</p>
          </div>
        </div>
        <Link to="/auth" className="ml-btn-primary mt-8 justify-center !text-base !px-6 !py-4">
          Ver valores ao criar conta <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function CostDetailSheet({ cost, open, onOpenChange }: { cost: Cost | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto bg-[#0a0a0a] border-l border-white/10 text-white p-0"
      >
        {cost && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-[#a855f7]/15 p-2.5">
                  <cost.icon className="h-5 w-5 text-[#a855f7]" />
                </div>
                <span className="font-tech text-[10px] uppercase tracking-wider text-[#a855f7]">
                  Custo de mercado · pesquisa pública
                </span>
              </div>
              <SheetTitle className="font-display text-3xl font-bold text-white text-left">
                {cost.label}
              </SheetTitle>
              <SheetDescription className="text-white/55 text-left">
                {cost.note}
              </SheetDescription>
            </SheetHeader>

            <div className="px-6 py-6 space-y-8">
              <section>
                <h4 className="font-tech text-[11px] uppercase text-white/40 mb-3">Quanto custa hoje no mercado</h4>
                <div className="space-y-2">
                  {cost.details.market.map((m) => (
                    <div key={m.label} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-white/80 font-medium">{m.label}</span>
                        <span className="font-display text-lg font-semibold text-white">{m.value}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-white/40 leading-relaxed">
                        Fonte: {m.source}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="font-tech text-[11px] uppercase text-white/40 mb-3">O que você ganha contratando fora</h4>
                <ul className="space-y-2">
                  {cost.details.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-white/65 leading-relaxed">
                      <X className="h-4 w-4 text-white/30 mt-0.5 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/[0.06] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-[#a855f7]" />
                  <span className="font-tech text-[10px] uppercase tracking-wider text-[#a855f7]">
                    Na Vanessa Simoni
                  </span>
                </div>
                <p className="text-white/85 leading-relaxed">{cost.details.mkton}</p>
                <div className="mt-4 flex items-center gap-2 text-sm text-white/60">
                  <Check className="h-4 w-4 text-[#a855f7]" />
                  Já incluído no plano, sem cobrança extra.
                </div>
              </section>

              <Link
                to="/auth"
                className="ml-btn-primary w-full justify-center !text-base !px-6 !py-4"
              >
                Começar 20 dias grátis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Economy() {
  const [selected, setSelected] = React.useState<Cost | null>(null);
  const [open, setOpen] = React.useState(false);

  const openCost = (c: Cost) => {
    setSelected(c);
    setOpen(true);
  };

  return (
    <Section
      id="economia"
      align="split"
      eyebrow="Economia"
      title={<>Quanto custa montar essa operação sozinho?</>}
      description="A Vanessa Simoni substitui uma pilha inteira de contratos, ferramentas e profissionais. Clique em cada item para ver de onde vêm os números e o quanto você deixa de gastar."
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          {COSTS.map((c, i) => (
            <Reveal key={c.label} delay={i * 0.04}>
              <motion.button
                type="button"
                onClick={() => openCost(c)}
                whileHover={{ scale: 1.02, borderColor: "rgba(168,85,247,0.35)" }}
                className="ml-card p-5 h-full w-full flex flex-col text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#a855f7]/40"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="rounded-lg bg-[#a855f7]/10 p-2">
                    <c.icon className="h-4 w-4 text-[#a855f7]" />
                  </div>
                  <span className="font-tech text-[9px] uppercase tracking-wider text-white/30 group-hover:text-[#a855f7] transition-colors">
                    Ver detalhes →
                  </span>
                </div>
                <div className="font-display text-lg font-semibold">{c.label}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-bold">{c.range}</span>
                  <span className="font-tech text-[10px] uppercase text-white/40">{c.period}</span>
                </div>
                <p className="mt-2 text-xs text-white/40 leading-relaxed">{c.note}</p>
              </motion.button>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.15}>
          <TotalCounter />
        </Reveal>
      </div>

      <Reveal delay={0.25}>
        <div className="mt-6 ml-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h3 className="font-display text-2xl md:text-3xl font-bold">E o melhor de tudo: um pagamento só.</h3>
            <p className="mt-2 text-white/55 leading-relaxed">
              Você não paga gestor de tráfego, social media, CRM, call center, editor, tracking, clocker e automações separadamente.
              Na Vanessa Simoni, todos esses pontos estão ativos dentro do mesmo plano. Economia real, gestão simples.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7] ml-pulse" />
            <span className="font-tech text-[11px] uppercase text-white/50">Tudo incluso · 20 dias grátis</span>
          </div>
        </div>
      </Reveal>

      <CostDetailSheet cost={selected} open={open} onOpenChange={setOpen} />
    </Section>
  );
}
