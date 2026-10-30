import { motion } from "framer-motion";
import { Calendar, Clapperboard, Film, Hash, Headphones, Heart, Instagram, Layers, MessageCircle, Mic, Phone, Play, Square, Type } from "lucide-react";
import { Reveal, Section } from "./shell";

const DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const SLOTS: Array<{ day: number; type: string; tag: string; icon: typeof Play; color: string; media: "video" | "carousel" | "story" | "short" | "image" }> = [
  { day: 0, type: "Reel", tag: "Hook", icon: Play, color: "#a855f7", media: "video" },
  { day: 1, type: "Carrossel", tag: "Educa", icon: Layers, color: "#a855f7", media: "carousel" },
  { day: 2, type: "Story", tag: "Bastidor", icon: Film, color: "#22d3ee", media: "story" },
  { day: 3, type: "Reel", tag: "Prova", icon: Clapperboard, color: "#a855f7", media: "video" },
  { day: 4, type: "Short", tag: "Oferta", icon: Play, color: "#f472b6", media: "short" },
  { day: 5, type: "TikTok", tag: "Trend", icon: Play, color: "#22d3ee", media: "short" },
  { day: 6, type: "Post", tag: "Reflexão", icon: Type, color: "#a855f7", media: "image" },
];

function MediaThumb({ slot }: { slot: (typeof SLOTS)[number] }) {
  const I = slot.icon;
  return (
    <div className="aspect-square rounded-md mb-2 overflow-hidden relative group">
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: `radial-gradient(circle at 80% 20%, ${slot.color}, transparent 60%)` }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/[0.02]" />
      {slot.media === "carousel" && (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          <div className="w-[22%] h-[55%] rounded bg-white/10 border border-white/10" />
          <div className="w-[28%] h-[70%] rounded bg-white/15 border border-white/20 shadow-lg flex items-center justify-center">
            <I className="h-5 w-5 text-white/80" />
          </div>
          <div className="w-[22%] h-[55%] rounded bg-white/10 border border-white/10" />
        </div>
      )}
      {slot.media === "story" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[52%] h-[82%] rounded-xl border-2 border-white/25 bg-gradient-to-b from-white/15 to-white/5 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <I className="h-4 w-4 text-white/90" />
            </div>
            <div className="w-10 h-1.5 rounded-full bg-white/20" />
          </div>
        </div>
      )}
      {slot.media === "short" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[46%] h-[78%] rounded-lg bg-gradient-to-b from-white/15 to-white/5 border border-white/15 flex items-center justify-center relative">
            <I className="h-6 w-6 text-white/90 fill-current" />
            <div className="absolute bottom-2 left-2 right-2 h-1 rounded-full bg-white/20" />
          </div>
        </div>
      )}
      {slot.media === "video" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[78%] h-[54%] rounded-md bg-gradient-to-br from-white/15 to-white/5 border border-white/15 flex items-center justify-center relative">
            <I className="h-7 w-7 text-white/90 fill-current" />
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/40 text-[8px] font-tech text-white/80">0:15</div>
          </div>
        </div>
      )}
      {slot.media === "image" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[78%] h-[78%] rounded-md bg-gradient-to-br from-white/15 to-white/5 border border-white/15 flex items-center justify-center">
            <div className="text-center">
              <I className="h-6 w-6 text-white/80 mx-auto" />
              <div className="mt-2 w-16 h-1 rounded-full bg-white/20" />
              <div className="mt-1.5 w-10 h-1 rounded-full bg-white/20 mx-auto" />
            </div>
          </div>
        </div>
      )}
      <div className="absolute inset-0 ring-1 ring-inset ring-white/5 rounded-md" />
    </div>
  );
}

export function SocialMedia() {
  return (
    <Section
      align="left"
      eyebrow="Social Media · IA"
      title={<>Sua marca postando<br />sem você abrir o app.</>}
      description="A IA planeja sua semana de conteúdo, gera Reels, Stories, Shorts, TikToks, carrosséis, legendas e hashtags. Você aprova com um toque."
    >
      <Reveal>
        <div className="ml-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-[#a855f7]" />
              <div className="font-display text-xl font-bold">Calendário da semana</div>
            </div>
            <span className="ml-chip">Gerado · 32s atrás</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map((d, i) => (
              <div key={d}>
                <div className="font-tech text-[10px] uppercase text-white/40 mb-2 text-center">{d}</div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-lg border border-white/8 bg-[#08080a] p-3 min-h-[170px] hover:border-[#a855f7]/40 transition-colors"
                >
                  <MediaThumb slot={SLOTS[i]} />
                  <div className="font-tech text-[9px] uppercase text-[#a855f7]">{SLOTS[i].type}</div>
                  <div className="text-[11px] text-white/70 mt-1">{SLOTS[i].tag}</div>
                </motion.div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {["#marketingdigital", "#crmautomatico", "#vendasb2b", "#iagenerativa", "#operacaoon", "#mkton"].map((h) => (
              <span key={h} className="ml-chip"><Hash className="h-3 w-3" /> {h.replace("#", "")}</span>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function CallCenter() {
  const channels = [
    { i: MessageCircle, n: "WhatsApp", c: 248 },
    { i: Instagram, n: "Instagram", c: 142 },
    { i: MessageCircle, n: "Messenger", c: 84 },
    { i: Phone, n: "Telefone", c: 36 },
    { i: Headphones, n: "Chat", c: 192 },
  ];
  return (
    <Section
      align="center"
      eyebrow="Call Center IA"
      title={<>Toda conversa,<br />no mesmo lugar.</>}
      description="WhatsApp, Instagram, Messenger, telefone e chat unificados. URA inteligente, transferência humanizada, gravação, análise de sentimento e relatórios prontos para a diretoria."
    >
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Reveal>
          <div className="ml-card p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <div className="font-display text-lg font-bold">Central omnichannel</div>
              <span className="flex items-center gap-2 font-tech text-[10px] uppercase text-[#a855f7]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7] ml-pulse" /> 702 ativas
              </span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {channels.map((ch, i) => (
                <motion.div
                  key={ch.n}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-lg border border-white/8 bg-[#08080a] p-4 text-center hover:border-[#a855f7]/40 transition-colors"
                >
                  <ch.i className="mx-auto h-5 w-5 text-white/70" />
                  <div className="mt-2 font-tech text-[10px] uppercase text-white/45">{ch.n}</div>
                  <div className="mt-2 font-display text-xl font-bold">{ch.c}</div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 space-y-2">
              {[
                { who: "Marina S.", msg: "Quero ver o painel completo", tag: "POSITIVO", pct: 92 },
                { who: "João V.", msg: "Posso testar antes de pagar?", tag: "INTENÇÃO", pct: 78 },
                { who: "Renata P.", msg: "Achei caro", tag: "OBJEÇÃO", pct: 41 },
              ].map((m, i) => (
                <motion.div
                  key={m.who}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-4 rounded-lg border border-white/8 bg-[#08080a] p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 font-tech text-xs">
                    {m.who.split(" ")[0][0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{m.msg}</div>
                    <div className="font-tech text-[10px] uppercase text-white/40 mt-0.5">{m.who} · WhatsApp</div>
                  </div>
                  <div className="text-right">
                    <div className="font-tech text-[10px] uppercase text-[#a855f7]">{m.tag}</div>
                    <div className="font-tech text-[10px] text-white/50">{m.pct}%</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="ml-card p-6 h-full flex flex-col gap-5">
            <div className="font-display text-lg font-bold">Análise de sentimento</div>
            <div className="space-y-3">
              {[
                { l: "Positivo", v: 68, c: "#a855f7" },
                { l: "Neutro", v: 24, c: "rgba(255,255,255,0.5)" },
                { l: "Negativo", v: 8, c: "rgba(255,80,80,0.7)" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="flex items-center justify-between font-tech text-[10px] uppercase">
                    <span className="text-white/60">{s.l}</span><span>{s.v}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} whileInView={{ width: `${s.v}%` }} viewport={{ once: true }}
                      transition={{ duration: 1.2 }}
                      className="h-full rounded-full"
                      style={{ background: s.c }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/8 bg-[#08080a] p-4">
              <div className="flex items-center gap-2 font-tech text-[10px] uppercase text-white/50">
                <Mic className="h-3.5 w-3.5" /> Gravação · cliente Marina S.
              </div>
              <div className="mt-3 flex items-end gap-1 h-10">
                {Array.from({ length: 40 }).map((_, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-sm bg-[#a855f7]/60"
                    style={{ height: `${20 + Math.abs(Math.sin(i / 2)) * 80}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 font-tech text-[10px] uppercase text-white/45 mt-auto">
              <Heart className="h-3 w-3 text-[#a855f7]" />
              NPS médio · 72 · subindo
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
