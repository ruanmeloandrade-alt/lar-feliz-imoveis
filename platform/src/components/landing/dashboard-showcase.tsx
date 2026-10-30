import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Bell, MessageCircle, TrendingUp } from "lucide-react";
import { CountUp, Reveal, Section } from "./shell";

const KPIS = [
  { label: "Leads ativos", value: 1284, delta: "+18,4%", up: true },
  { label: "ROI campanhas", value: 4.7, suffix: "x", delta: "+0,9x", up: true },
  { label: "CAC médio", value: 47, prefix: "R$ ", delta: "-12%", up: true },
  { label: "Conversão", value: 27.4, suffix: "%", delta: "+3,1pp", up: true },
];

const KANBAN = [
  { label: "Lead", count: 312, color: "rgba(255,255,255,0.4)" },
  { label: "Qualificado", count: 184, color: "rgba(255,255,255,0.6)" },
  { label: "Proposta", count: 92, color: "rgba(168,85,247,0.6)" },
  { label: "Negociação", count: 41, color: "rgba(168,85,247,0.85)" },
  { label: "Fechamento", count: 18, color: "#a855f7" },
];

export function DashboardShowcase() {
  return (
    <Section
      id="plataforma"
      eyebrow="O Painel"
      title={<>Uma sala de comando<br />para sua operação inteira.</>}
      description="KPIs, funil, calendário, mensagens, campanhas e pipeline em uma única tela. Atualização em tempo real, com a IA da Vanessa Simoni lendo cada movimento."
    >
      <Reveal>
        <div className="relative ml-card overflow-hidden p-1">
          <div className="rounded-[14px] bg-[#08080a] p-6 md:p-8">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-white/5 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#a855f7]" />
                </div>
                <span className="font-tech text-[11px] uppercase text-white/50">mkton.io / painel / visão geral</span>
              </div>
              <div className="flex items-center gap-3 font-tech text-[11px] text-white/40">
                <span className="ml-pulse text-[#a855f7]">●</span>
                AO VIVO · sincronizado há 2s
              </div>
            </div>

            {/* KPIs */}
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {KPIS.map((k, i) => (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-xl border border-white/8 bg-[#0e0e10] p-5 hover:border-[#a855f7]/40 hover:bg-[#15151a] transition-colors"
                >
                  <div className="font-tech text-[10px] uppercase text-white/40 mb-3">{k.label}</div>
                  <div className="font-display text-3xl font-bold leading-none">
                    {("prefix" in k && (k as any).prefix) || ""}
                    <CountUp to={k.value} suffix={k.suffix || ""} />
                  </div>
                  <div className={`mt-3 flex items-center gap-1 font-tech text-[11px] ${k.up ? "text-[#a855f7]" : "text-red-400"}`}>
                    {k.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.delta}
                  </div>
                  <Sparkline />
                </motion.div>
              ))}
            </div>

            {/* Chart + side */}
            <div className="mt-6 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-xl border border-white/8 bg-[#0e0e10] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-display text-lg font-bold">Receita por canal</div>
                    <div className="font-tech text-[10px] uppercase text-white/40">últimos 30 dias</div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-[#a855f7]" />
                </div>
                <BigChart />
              </div>
              <div className="rounded-xl border border-white/8 bg-[#0e0e10] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-display text-lg font-bold">Notificações</div>
                  <Bell className="h-4 w-4 text-white/50" />
                </div>
                <div className="space-y-3">
                  {[
                    { t: "Nova proposta aceita", s: "Vetor Studio · R$ 12.400", i: <ArrowUpRight className="h-3.5 w-3.5 text-[#a855f7]" /> },
                    { t: "Lead respondeu no WhatsApp", s: "Marina Schneider", i: <MessageCircle className="h-3.5 w-3.5 text-white/70" /> },
                    { t: "Campanha Meta Ads otimizada pela IA", s: "+18% CTR estimado", i: <TrendingUp className="h-3.5 w-3.5 text-[#a855f7]" /> },
                    { t: "Pós-venda agendado", s: "Hoje · 16:30", i: <Bell className="h-3.5 w-3.5 text-white/70" /> },
                  ].map((n, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.12 }}
                      className="flex items-start gap-3 rounded-lg border border-white/5 p-3 hover:border-[#a855f7]/30 transition-colors"
                    >
                      <span className="mt-0.5">{n.i}</span>
                      <div className="min-w-0">
                        <div className="text-sm">{n.t}</div>
                        <div className="font-tech text-[10px] uppercase text-white/40 mt-0.5">{n.s}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Kanban */}
            <div className="mt-6 rounded-xl border border-white/8 bg-[#0e0e10] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-display text-lg font-bold">Pipeline · funil ativo</div>
                  <div className="font-tech text-[10px] uppercase text-white/40">647 leads · R$ 1,4M em negociação</div>
                </div>
                <span className="ml-chip">Drag · drop · auto-rotinas</span>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {KANBAN.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="rounded-lg border border-white/8 bg-[#08080a] p-3"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-tech text-[10px] uppercase text-white/50">{s.label}</span>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                    </div>
                    <div className="font-display text-2xl font-bold">{s.count}</div>
                    <div className="mt-3 space-y-1.5">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="h-7 rounded-md border border-white/5 bg-[#0e0e10]" />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 100 28" className="mt-3 h-7 w-full">
      <motion.path
        d="M0 22 L12 18 L24 20 L36 12 L48 16 L60 8 L72 10 L84 4 L100 6"
        fill="none"
        stroke="#a855f7"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4 }}
      />
      <motion.path
        d="M0 22 L12 18 L24 20 L36 12 L48 16 L60 8 L72 10 L84 4 L100 6 L100 28 L0 28 Z"
        fill="rgba(168,85,247,0.12)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, delay: 0.4 }}
      />
    </svg>
  );
}

function BigChart() {
  const bars = [40, 65, 50, 72, 58, 84, 70, 90, 76, 95, 80, 100, 88, 110];
  const max = Math.max(...bars);
  return (
    <div className="flex h-44 items-end gap-2">
      {bars.map((b, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          whileInView={{ height: `${(b / max) * 100}%` }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.04, duration: 0.6 }}
          className="flex-1 rounded-t bg-gradient-to-t from-[#a855f7]/20 to-[#a855f7] hover:opacity-90 transition-opacity"
        />
      ))}
    </div>
  );
}
