import { motion } from "framer-motion";
import { Activity, Database, Globe, Webhook, Workflow, Zap } from "lucide-react";
import { Reveal, Section } from "./shell";

export function Analytics() {
  const sources = [
    { n: "Meta Ads", v: 38 },
    { n: "Google Ads", v: 28 },
    { n: "TikTok Ads", v: 14 },
    { n: "Instagram orgÃ¢nico", v: 12 },
    { n: "Indicação", v: 8 },
  ];
  return (
    <Section
      eyebrow="Analytics"
      align="right"
      title={<>Cada centavo, rastreado.<br />Cada decisão, justificada.</>}
      description="KPIs, ROI, CPA, CAC, heatmaps e origens de leads, todos cruzados com seu CRM. A IA destaca o que importa hoje."
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <div className="ml-card p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <div className="font-display text-lg font-bold">Heatmap · jornada do lead</div>
              <Activity className="h-4 w-4 text-[#a855f7]" />
            </div>
            <div className="grid grid-cols-14 gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
              {Array.from({ length: 14 * 6 }).map((_, i) => {
                const v = Math.random();
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.005 }}
                    className="aspect-square rounded-sm"
                    style={{ background: `rgba(168,85,247,${v.toFixed(2)})` }}
                  />
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between font-tech text-[10px] uppercase text-white/40">
              <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="ml-card p-6 h-full">
            <div className="font-display text-lg font-bold mb-5">Origem dos leads</div>
            <div className="space-y-4">
              {sources.map((s, i) => (
                <div key={s.n}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{s.n}</span>
                    <span className="font-tech text-[11px] text-white/50">{s.v}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} whileInView={{ width: `${s.v * 2.5}%` }} viewport={{ once: true }}
                      transition={{ duration: 1.2, delay: i * 0.08 }}
                      className="h-full rounded-full bg-[#a855f7]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

const NODES = [
  // Core
  { x: 50, y: 50, label: "IA", tier: "core" },
  { x: 50, y: 26, label: "Vanessa Simoni Core", tier: "core" },
  { x: 50, y: 74, label: "Workflows", tier: "core" },
  // Entrada
  { x: 14, y: 14, label: "Meta Ads", tier: "in" },
  { x: 24, y: 8, label: "Instagram", tier: "in" },
  { x: 42, y: 12, label: "Google Ads", tier: "in" },
  { x: 76, y: 10, label: "TikTok", tier: "in" },
  { x: 88, y: 16, label: "LinkedIn", tier: "in" },
  { x: 6, y: 30, label: "Landing", tier: "in" },
  // Conversação
  { x: 12, y: 40, label: "WhatsApp", tier: "talk" },
  { x: 8, y: 54, label: "Email", tier: "talk" },
  { x: 16, y: 66, label: "SMS", tier: "talk" },
  { x: 24, y: 76, label: "DM", tier: "talk" },
  // CRM / Dados
  { x: 30, y: 50, label: "CRM", tier: "data" },
  { x: 36, y: 62, label: "HubSpot", tier: "data" },
  // IA / LLM
  { x: 62, y: 36, label: "OpenAI", tier: "ai" },
  { x: 70, y: 44, label: "Gemini", tier: "ai" },
  { x: 64, y: 64, label: "Agentes", tier: "ai" },
  // Processamento
  { x: 44, y: 38, label: "Qualificação", tier: "proc" },
  { x: 56, y: 60, label: "Scoring", tier: "proc" },
  { x: 42, y: 62, label: "Distribuição", tier: "proc" },
  // Pagamento / Analytics
  { x: 78, y: 50, label: "Analytics", tier: "out" },
  { x: 88, y: 40, label: "Google Sheets", tier: "out" },
  { x: 86, y: 62, label: "Mercado Pago", tier: "out" },
  { x: 78, y: 74, label: "Calendário", tier: "out" },
  // Webhooks / automação
  { x: 34, y: 86, label: "Webhook", tier: "auto" },
  { x: 50, y: 90, label: "Zapier/Make", tier: "auto" },
  { x: 66, y: 86, label: "Slack", tier: "auto" },
  { x: 82, y: 82, label: "Notion", tier: "auto" },
];

const EDGES: Array<[number, number]> = [
  // Entrada -> MKTOn Core
  [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
  // Entrada -> IA
  [3, 0], [5, 0], [6, 0], [7, 0],
  // MKTOn Core -> IA
  [1, 0], [0, 2],
  // Conversação -> IA / Core / CRM
  [9, 0], [9, 1], [10, 0], [10, 12], [11, 12], [12, 0], [12, 12], [13, 0],
  // CRM <-> IA
  [12, 0], [0, 12], [12, 14], [12, 15], [13, 14], [14, 0], [15, 0],
  // IA -> LLMs
  [0, 16], [0, 17], [16, 17], [0, 18],
  // IA -> Processamento
  [0, 19], [0, 20], [0, 21], [19, 20], [20, 21], [19, 21],
  // Processamento -> Core/Workflows
  [19, 1], [20, 2], [21, 2], [19, 2], [21, 1],
  // Saídas / Analytics / Pagamento
  [0, 22], [2, 22], [1, 22], [0, 23], [2, 23], [0, 24], [2, 24], [1, 25], [2, 25],
  // Automação / Webhooks
  [2, 26], [2, 27], [2, 28], [26, 27], [27, 28], [26, 0], [28, 0],
  // CRM -> Webhook
  [12, 26], [14, 26],
  // IA -> tudo
  [0, 1], [0, 2], [0, 9], [0, 10], [0, 11], [0, 13], [0, 22], [0, 25],
  // Notion
  [2, 29], [27, 29], [29, 22], [29, 0],
];

const NODE_TIER: Record<string, { color: string; glow: string; border: string }> = {
  core: { color: "#a855f7", glow: "rgba(168,85,247,0.55)", border: "rgba(168,85,247,0.65)" },
  in: { color: "#06b6d4", glow: "rgba(6,182,212,0.45)", border: "rgba(6,182,212,0.55)" },
  talk: { color: "#22c55e", glow: "rgba(34,197,94,0.4)", border: "rgba(34,197,94,0.55)" },
  data: { color: "#a855f7", glow: "rgba(168,85,247,0.4)", border: "rgba(168,85,247,0.55)" },
  ai: { color: "#ec4899", glow: "rgba(236,72,153,0.45)", border: "rgba(236,72,153,0.55)" },
  proc: { color: "#f59e0b", glow: "rgba(245,158,11,0.4)", border: "rgba(245,158,11,0.55)" },
  out: { color: "#8b5cf6", glow: "rgba(139,92,246,0.4)", border: "rgba(139,92,246,0.55)" },
  auto: { color: "#3b82f6", glow: "rgba(59,130,246,0.4)", border: "rgba(59,130,246,0.55)" },
};

export function Automations() {
  return (
    <Section
      id="automacoes"
      eyebrow="Automações"
      align="split"
      title={<>Seu marketing em um só lugar.<br />Tudo em apenas uma plataforma.</>}
      description="Milhares de conexões, regras, gatilhos e decisões acontecendo em segundos. Você não precisa montar isso: a Vanessa Simoni já entrega o ecossistema completo conectado."
    >
      <Reveal>
        <div className="ml-card relative overflow-hidden p-4 md:p-8">
          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            {/* Grid background */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.25" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
            </svg>

            {/* Connection lines */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {EDGES.map(([a, b], i) => (
                <motion.line
                  key={i}
                  x1={NODES[a].x} y1={NODES[a].y}
                  x2={NODES[b].x} y2={NODES[b].y}
                  stroke="#a855f7"
                  strokeWidth="0.12"
                  opacity={0.25 + (i % 4) * 0.12}
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: i * 0.04 }}
                />
              ))}
              {/* Animated data packets */}
              {EDGES.slice(0, 28).map(([a, b], i) => (
                <motion.circle
                  key={`p-${i}`} r="0.7" fill="#ffffff"
                  animate={{
                    cx: [NODES[a].x, NODES[b].x],
                    cy: [NODES[a].y, NODES[b].y],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{ duration: 2.5 + (i % 4), repeat: Infinity, delay: i * 0.18, ease: "linear" }}
                />
              ))}
              {/* Pulse rings on core nodes */}
              {[0, 1, 2].map((idx) => (
                <motion.circle
                  key={`ring-${idx}`}
                  cx={NODES[idx].x} cy={NODES[idx].y} r="2"
                  fill="none" stroke="#a855f7" strokeWidth="0.2"
                  initial={{ opacity: 0, r: 2 }}
                  animate={{ opacity: [0, 0.6, 0], r: [2, 8, 12] }}
                  transition={{ duration: 3, repeat: Infinity, delay: idx * 1.2 }}
                />
              ))}
            </svg>

            {/* Nodes */}
            {NODES.map((n, i) => {
              const style = NODE_TIER[n.tier];
              return (
                <motion.div
                  key={n.label}
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03, type: "spring", stiffness: 180 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                >
                  <div
                    className="rounded-md border px-2.5 py-1.5 font-tech text-[9px] uppercase shadow-lg backdrop-blur-sm"
                    style={{
                      borderColor: style.border,
                      backgroundColor: "rgba(5,5,5,0.85)",
                      color: style.color,
                      boxShadow: `0 0 14px ${style.glow}`,
                    }}
                  >
                    {n.label}
                  </div>
                </motion.div>
              );
            })}

            {/* Floating throughput labels */}
            {[
              { x: 20, y: 26, label: "1.2k leads/dia" },
              { x: 80, y: 28, label: "CPA R$ 19" },
              { x: 32, y: 68, label: "score automático" },
              { x: 72, y: 68, label: "agendamento instant-neo" },
              { x: 50, y: 10, label: "orquestração em tempo real" },
            ].map((l, i) => (
              <motion.div
                key={l.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 1.2 + i * 0.15 }}
                className="absolute -translate-x-1/2 -translate-y-1/2 font-tech text-[7px] uppercase text-white/30"
                style={{ left: `${l.x}%`, top: `${l.y}%` }}
              >
                {l.label}
              </motion.div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              { i: Workflow, t: "Blocos visuais", d: "Mensagem · condição · espera · webhook · A/B" },
              { i: Zap, t: "Gatilhos reais", d: "Lead novo · resposta · pagamento · ausência · etapa" },
              { i: Database, t: "Memória persistente", d: "Cada lead carrega histórico, tags e contexto" },
            ].map((x) => (
              <div key={x.t} className="rounded-lg border border-white/8 bg-[#08080a] p-4">
                <x.i className="h-4 w-4 text-[#a855f7]" />
                <div className="font-display text-base font-bold mt-2">{x.t}</div>
                <div className="font-tech text-[10px] uppercase text-white/45 mt-1">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}


import mktonIcon from "@/assets/mkton-icon.png.asset.json";
import openaiLogo from "@/assets/logos/openai.svg";
import slackLogo from "@/assets/logos/slack.svg";

// Cada nó orbital: posição em % (top/left) + slug do simple-icons + label
type IntegNode = { name: string; slug: string; top: string; left: string; customUrl?: string };

const ORBIT_NODES: IntegNode[] = [
  { name: "WhatsApp", slug: "whatsapp", top: "6%", left: "18%" },
  { name: "Meta Ads", slug: "meta", top: "6%", left: "78%" },
  { name: "Instagram", slug: "instagram", top: "22%", left: "4%" },
  { name: "Google Ads", slug: "google", top: "22%", left: "92%" },
  { name: "TikTok", slug: "tiktok", top: "46%", left: "0%", customUrl: "https://cdn.simpleicons.org/tiktok/ffffff" },
  { name: "OpenAI", slug: "openai", top: "46%", left: "96%", customUrl: openaiLogo },
  { name: "Google Sheets", slug: "googlesheets", top: "70%", left: "4%" },
  { name: "HubSpot", slug: "hubspot", top: "70%", left: "92%" },
  { name: "Slack", slug: "slack", top: "88%", left: "20%", customUrl: slackLogo },
  { name: "Notion", slug: "notion", top: "88%", left: "78%", customUrl: "https://cdn.simpleicons.org/notion/ffffff" },
];

const STRIP_NODES: { name: string; slug: string | null; customUrl?: string }[] = [
  { name: "Discord", slug: "discord" },
  { name: "Calendly", slug: "calendly" },
  { name: "Zapier", slug: "zapier" },
  { name: "Make", slug: "make" },
  { name: "RD Station", slug: null },
  { name: "HubSpot", slug: "hubspot" },
];


function LogoMark({ slug, name, customUrl }: { slug: string | null; name: string; customUrl?: string }) {
  if (!slug && !customUrl) {
    const initials = name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("");
    return (
      <span className="font-display text-[13px] font-bold tracking-tight text-white">
        {initials}
      </span>
    );
  }
  const src = customUrl ?? `https://cdn.simpleicons.org/${slug}`;
  return (
    <img
      src={src}
      alt={`${name} logo`}
      loading="lazy"
      className="h-7 w-7 object-contain opacity-90 transition-all duration-500 group-hover:scale-110 group-hover:opacity-100"
    />
  );
}



export function Integrations() {
  return (
    <Section
      id="integracoes"
      eyebrow="Integrações"
      align="center"
      title={<>Conecta com<br />o que você já usa.</>}
      description="Sua central nervosa: API aberta, webhooks bidirecionais e conectores nativos com as ferramentas que rodam sua operação hoje."
    >
      <Reveal>
        {/* Selo "Central nervosa ativa" */}
        <div className="mb-12 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/30 bg-[#a855f7]/5 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a855f7]" />
            <span className="font-tech text-[10px] uppercase tracking-widest text-[#a855f7]">
              Central nervosa ativa
            </span>
          </div>
        </div>

        {/* Hub visual */}
        <div className="relative mx-auto aspect-[5/4] w-full max-w-4xl sm:aspect-[16/10]">
          {/* Glow de fundo */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]/15 blur-[100px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]/25 blur-[60px]" />

          {/* Anéis orbitais */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40">
            <div
              className="h-[78%] w-[78%] rounded-full border border-dashed border-white/10"
              style={{ animation: "spin 80s linear infinite" }}
            />
            <div
              className="absolute h-[58%] w-[58%] rounded-full border border-dashed border-white/10"
              style={{ animation: "spin 50s linear infinite reverse" }}
            />
          </div>

          {/* Linhas conectando ao centro */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 800 500"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="nexus-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#a855f7" stopOpacity="0.6" />
                <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[
              [144, 30], [624, 30],
              [32, 110], [736, 110],
              [0, 230], [768, 230],
              [32, 350], [736, 350],
              [160, 440], [624, 440],
            ].map(([x, y], i) => (
              <line
                key={i}
                x1="400"
                y1="250"
                x2={x + 32}
                y2={y + 32}
                stroke="url(#nexus-line)"
                strokeWidth="1"
                strokeDasharray="3 6"
                style={{
                  animation: `nexus-flow 2s linear infinite`,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </svg>

          {/* Núcleo central, logo MKTOn */}
          <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              className="relative"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="absolute inset-0 rounded-3xl bg-[#a855f7] opacity-30 blur-2xl" />
              <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-white/15 bg-[#0a0a0a] shadow-[0_0_60px_-10px_rgba(168,85,247,0.6)] sm:h-32 sm:w-32">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#a855f7]/15 to-transparent" />
                <img
                  src={mktonIcon.url}
                  alt="Vanessa Simoni"
                  className="h-14 w-14 object-contain sm:h-16 sm:w-16"
                />
              </div>
              <div className="pointer-events-none absolute -inset-3 rounded-[28px] border border-[#a855f7]/30" />
            </motion.div>
          </div>

          {/* Nós orbitais com logos */}
          {ORBIT_NODES.map((node, i) => (
            <motion.div
              key={node.name}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ top: node.top, left: node.left }}
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 140, damping: 14 }}
              whileHover={{ scale: 1.08 }}
            >
              <div className="group flex flex-col items-center gap-1.5">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md transition-all duration-500 group-hover:border-[#a855f7]/60 group-hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.55)] sm:h-16 sm:w-16">
                  <LogoMark slug={node.slug} name={node.name} customUrl={node.customUrl} />
                </div>
                <span className="font-tech text-[10px] uppercase tracking-wider text-white/55 group-hover:text-white/90 transition">
                  {node.name}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Faixa secundária de logos */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
          {STRIP_NODES.map((node, i) => (
            <motion.div
              key={node.name + i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 transition-all hover:border-[#a855f7]/40 hover:bg-[#a855f7]/[0.06]"
            >
              <div className="flex h-4 w-4 items-center justify-center">
                {node.slug ? (
                  <img
                    src={`https://cdn.simpleicons.org/${node.slug}`}
                    alt=""
                    className="h-4 w-4 opacity-70 group-hover:opacity-100"
                  />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7]" />
                )}
              </div>
              <span className="font-tech text-[10px] uppercase tracking-wider text-white/65 group-hover:text-white">
                {node.name}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Rodapé técnico */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-tech text-[10px] uppercase tracking-widest text-white/45">
          <span className="inline-flex items-center gap-2">
            <Webhook className="h-3.5 w-3.5 text-[#a855f7]" />
            Webhooks
          </span>
          <span>REST API</span>
          <span>GraphQL</span>
          <span className="text-white/70">+200 integrações nativas</span>
        </div>
      </Reveal>

      <style>{`
        @keyframes nexus-flow {
          to { stroke-dashoffset: -18; }
        }
      `}</style>
    </Section>
  );
}
