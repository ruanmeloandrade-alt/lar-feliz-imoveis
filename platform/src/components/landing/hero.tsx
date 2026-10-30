import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useRef } from "react";
import { useLandingT } from "@/lib/landing-i18n";

export function Hero() {
  const { t } = useLandingT();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const titleOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.2]);
  const gridY = useTransform(scrollYProgress, [0, 1], [0, 200]);

  return (
    <section ref={ref} className="relative min-h-screen overflow-hidden pt-32 pb-20">
      <motion.div style={{ y: gridY }} className="absolute inset-0 ml-grid-bg opacity-40" />
      <div className="absolute inset-x-0 top-0 h-[40rem] bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.10),transparent_60%)]" />

      {/* corner labels */}
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute left-6 top-24 font-tech text-[10px] text-white/30">SYS://MKTON.OS · v4.20.26</span>
        <span className="absolute right-6 top-24 font-tech text-[10px] text-white/30">LAT -23.5505 / LNG -46.6333</span>
        <span className="absolute left-6 bottom-6 font-tech text-[10px] text-white/30">STATUS · ALL SYSTEMS ON</span>
        <span className="absolute right-6 bottom-6 font-tech text-[10px] text-white/30">UPTIME · 99.998%</span>
      </div>

      <motion.div style={{ y: titleY, opacity: titleOpacity }} className="relative mx-auto max-w-[1400px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 flex flex-wrap items-center gap-3"
        >
          <span className="ml-chip ml-chip-neon">
            <Sparkles className="h-3 w-3" /> {t("hero.chip.trial")}
          </span>
          <span className="ml-chip">{t("hero.chip.access")}</span>
          <span className="ml-chip">{t("hero.chip.noCard")}</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="font-display font-bold leading-[0.82] tracking-tight text-[clamp(5rem,17vw,17rem)]"
        >
          {t("hero.title.line1")}
          <br />
          <span className="ml-neon-text">{t("hero.title.on")}</span>
        </motion.h1>

        <div className="mt-12 grid gap-16 md:grid-cols-[1.4fr_1fr]">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="max-w-2xl text-lg md:text-xl text-white/65 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: t("hero.description") }}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex flex-col gap-3"
          >
            <Link to="/auth" className="ml-btn-primary justify-center">
              {t("hero.cta.primary")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/auth" className="ml-btn-ghost justify-center">
              {t("hero.cta.signin")}
            </Link>
            <p className="font-tech text-[10px] uppercase tracking-widest text-white/35 mt-2 text-center">
              {t("hero.cta.footnote")}
            </p>
          </motion.div>
        </div>
      </motion.div>

      <StatusTicker />
    </section>
  );
}

function StatusTicker() {
  const items = [
    "MARKETING · ON",
    "VENDAS · ON",
    "ATENDIMENTO · ON",
    "IA · ON",
    "TRÁFEGO · ON",
    "RESULTADOS · ON",
    "CRM · ON",
    "AUTOMAÇÕES · ON",
    "SOCIAL · ON",
    "ANALYTICS · ON",
  ];
  const row = [...items, ...items];
  return (
    <div className="relative mt-24 overflow-hidden border-y border-white/8 bg-[#050505]/80 py-5">
      <div className="ml-marquee flex w-max gap-12 whitespace-nowrap">
        {row.map((t, i) => (
          <span key={i} className="font-display text-2xl font-bold uppercase">
            {t}
            <span className="mx-12 text-[#a855f7]">●</span>
          </span>
        ))}
      </div>
    </div>
  );
}
