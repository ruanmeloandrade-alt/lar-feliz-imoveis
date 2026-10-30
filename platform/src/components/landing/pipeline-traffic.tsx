import { motion } from "framer-motion";
import { Clapperboard, Image as ImageIcon, Layers, Palmtree, Play, ShoppingBag, Sparkles, Target, TrendingUp, Type, Users, Zap } from "lucide-react";
import { Reveal, Section } from "./shell";

const STAGES = ["Lead", "Qualificação", "Contato", "Proposta", "Negociação", "Venda", "Pós-venda", "Remarketing"];

const CREATIVE_TYPES = [
  { icon: Play, label: "Reel", hue: "#a855f7" },
  { icon: Layers, label: "Carrossel", hue: "#06b6d4" },
  { icon: ImageIcon, label: "Post", hue: "#22c55e" },
  { icon: ShoppingBag, label: "Catálogo", hue: "#f59e0b" },
  { icon: Type, label: "Texto", hue: "#ec4899" },
  { icon: Clapperboard, label: "TikTok", hue: "#a855f7" },
  { icon: Palmtree, label: "Story", hue: "#06b6d4" },
  { icon: Zap, label: "Promo", hue: "#f59e0b" },
  { icon: ImageIcon, label: "Banner", hue: "#22c55e" },
];

function CreativeThumb({ type, index }: { type: typeof CREATIVE_TYPES[number]; index: number }) {
  const Icon = type.icon;
  return (
    <motion.div
      key={index}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ scale: 1.05, borderColor: "rgba(168,85,247,0.45)" }}
      className="group relative aspect-square overflow-hidden rounded-md border border-white/8 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-2 transition-colors"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 transition-all group-hover:scale-110 group-hover:bg-white/10"
          style={{ color: type.hue }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-center">
          <div className="font-tech text-[8px] uppercase tracking-wide text-white/60">{type.label}</div>
          <div className="font-tech text-[7px] uppercase text-white/30">v{index + 1}</div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
      <div className="absolute left-1.5 top-1.5 h-1 w-1 rounded-full" style={{ backgroundColor: type.hue }} />
    </motion.div>
  );
}

export function CrmPipeline() {
  return (
    <Section
      id="crm"
      align="split"
      eyebrow="CRM"
      title={<>Seu funil inteiro,<br />em movimento contínuo.</>}
      description="Lead entra. Automações qualificam. IA conversa. Humano fecha. Pós-venda dispara. Remarketing recicla. Tudo conectado, com regras visuais que você desenha em minutos."
    >
      <Reveal>
        <div className="ml-card relative overflow-hidden p-6 md:p-10">
          <div className="relative flex flex-col gap-6 md:flex-row md:items-stretch md:gap-3 overflow-x-auto">
            {STAGES.map((s, i) => (
              <div key={s} className="relative flex min-w-[140px] flex-1 flex-col">
                <div className="font-tech text-[10px] uppercase text-white/40 mb-2">Etapa {String(i + 1).padStart(2, "0")}</div>
                <div className="rounded-xl border border-white/8 bg-[#0e0e10] p-4 hover:border-[#a855f7]/40 transition-colors">
                  <div className="font-display text-lg font-bold">{s}</div>
                  <div className="font-tech text-[10px] uppercase text-white/40 mt-1">{Math.round(280 / (i + 1))} leads</div>
                  <div className="mt-3 space-y-1.5">
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-1.5 rounded-full bg-white/8" style={{ width: `${100 - j * 18}%` }} />
                    ))}
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <svg className="hidden md:block absolute -right-3 top-1/2 h-px w-6 z-10" viewBox="0 0 24 1">
                    <motion.line
                      x1="0" y1="0.5" x2="24" y2="0.5"
                      stroke="#a855f7" strokeWidth="1" className="ml-dash"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>

          {/* Lead moving animation */}
          <div className="mt-8 relative h-12 rounded-lg border border-white/8 bg-[#08080a] overflow-hidden">
            <motion.div
              animate={{ x: ["0%", "92%", "0%"] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/2 -translate-y-1/2 left-2 flex items-center gap-2 rounded-md border border-[#a855f7] bg-[#a855f7]/10 px-3 py-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7]" />
              <span className="font-tech text-[10px] uppercase text-[#a855f7]">Lead · Marina S.</span>
            </motion.div>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-tech text-[10px] uppercase text-white/40">
              automação em execução
            </span>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function PaidTraffic() {
  return (
    <Section
      align="right"
      eyebrow="Tráfego pago + IA"
      title={<>Campanhas criadas,<br />testadas e otimizadas sozinhas.</>}
      description="A IA gera criativos, escreve copies, monta públicos, distribui verba entre Meta, Google e TikTok e devolve gráficos em tempo real."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal>
          <div className="ml-card p-6 h-full">
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-[#a855f7]" />
              <div className="font-display text-lg font-bold">Criativos gerados</div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {CREATIVE_TYPES.map((type, i) => (
                <CreativeThumb key={type.label + i} type={type} index={i} />
              ))}
            </div>
            <div className="mt-4 font-tech text-[10px] uppercase text-white/40">+128 variações esta semana</div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="ml-card p-6 h-full">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[#a855f7]" />
              <div className="font-display text-lg font-bold">Copies & headlines</div>
            </div>
            <div className="mt-5 space-y-2">
              {[
                "Atendimento que responde instantaneamente.",
                "Pare de perder lead no fim de semana.",
                "Sua operação inteira em uma tela.",
                "20 dias para comprovar. Sem cartão.",
              ].map((c, i) => (
                <motion.div
                  key={c}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="rounded-md border border-white/8 bg-[#08080a] p-3 text-sm hover:border-[#a855f7]/40 transition-colors"
                >
                  {c}
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="ml-card p-6 h-full">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-[#a855f7]" />
              <div className="font-display text-lg font-bold">ROI em tempo real</div>
            </div>
            <svg viewBox="0 0 200 110" className="mt-5 w-full">
              <defs>
                <linearGradient id="rg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 40, 60, 80].map((y) => (
                <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="rgba(255,255,255,0.05)" />
              ))}
              <motion.path
                d="M0 90 L20 80 L40 82 L60 60 L80 65 L100 40 L120 50 L140 25 L160 30 L180 15 L200 10"
                fill="none" stroke="#a855f7" strokeWidth="1.6"
                initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
                transition={{ duration: 2 }}
              />
              <motion.path
                d="M0 90 L20 80 L40 82 L60 60 L80 65 L100 40 L120 50 L140 25 L160 30 L180 15 L200 10 L200 110 L0 110 Z"
                fill="url(#rg)"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                transition={{ duration: 2, delay: 0.5 }}
              />
            </svg>
            <div className="mt-4 grid grid-cols-3 gap-3 font-tech text-[10px] uppercase">
              <div><span className="text-white/40">CPA</span> <span className="block text-base text-white">R$ 19</span></div>
              <div><span className="text-white/40">CTR</span> <span className="block text-base text-white">6,8%</span></div>
              <div><span className="text-white/40">ROAS</span> <span className="block text-base text-[#a855f7]">5,2x</span></div>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { i: Users, t: "Públicos", v: "42 segmentos ativos" },
          { i: Layers, t: "Camadas", v: "Lookalike · interesse · custom" },
          { i: Target, t: "Otimização", v: "Realocada a cada 2h" },
        ].map((x) => (
          <div key={x.t} className="ml-card p-5 flex items-center gap-4">
            <x.i className="h-5 w-5 text-[#a855f7]" />
            <div>
              <div className="font-display text-base font-bold">{x.t}</div>
              <div className="font-tech text-[10px] uppercase text-white/45 mt-0.5">{x.v}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
