import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Globe, Check } from "lucide-react";
import mktonLogo from "@/assets/mkton-logo.png.asset.json";
import { LANDING_LANGS, useLandingT, type LandingLang } from "@/lib/landing-i18n";

export function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!ref.current) return;
      ref.current.style.setProperty("--mx", `${e.clientX}px`);
      ref.current.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        background:
          "radial-gradient(600px circle at var(--mx,50%) var(--my,30%), rgba(168,85,247,0.07), transparent 60%)",
      }}
    />
  );
}

export function GridBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 ml-grid-bg opacity-50" />
  );
}

export function CornerLabel({ tl, tr, bl, br }: { tl?: string; tr?: string; bl?: string; br?: string }) {
  const cls = "absolute font-tech text-[10px] text-white/30";
  return (
    <>
      {tl && <span className={`${cls} left-4 top-4`}>{tl}</span>}
      {tr && <span className={`${cls} right-4 top-4`}>{tr}</span>}
      {bl && <span className={`${cls} left-4 bottom-4`}>{bl}</span>}
      {br && <span className={`${cls} right-4 bottom-4`}>{br}</span>}
    </>
  );
}

export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const { t } = useLandingT();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const items = [
    { href: "#plataforma", label: t("nav.platform") },
    { href: "#agentes", label: t("nav.agents") },
    { href: "#crm", label: t("nav.crm") },
    { href: "#automacoes", label: t("nav.automations") },
    { href: "#integracoes", label: t("nav.integrations") },
    { href: "#economia", label: t("nav.economy") },
    { href: "#planos", label: t("nav.plans") },
  ];
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled ? "backdrop-blur-xl bg-[#050505]/70 border-b border-white/5" : ""
      }`}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="rounded-lg border border-white/10 bg-white/95 p-1.5 shadow-[0_0_20px_rgba(168,85,247,0.25)]">
            <img src={mktonLogo.url} alt="Vanessa Simoni" className="h-7 w-auto select-none" draggable={false} />
          </div>
          <span className="ml-2 h-1.5 w-1.5 rounded-full bg-[#a855f7] ml-pulse" />
        </Link>
        <nav className="hidden gap-7 lg:flex">
          {items.map((i) => (
            <a key={i.href} href={i.href} className="font-tech text-[11px] uppercase text-white/60 hover:text-white transition-colors">
              {i.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <a href="/auth?mode=login" className="hidden sm:inline-flex font-tech text-[11px] uppercase text-white/70 hover:text-white">
            {t("nav.signIn")}
          </a>
          <Link to="/auth" className="ml-btn-primary !py-2.5 !px-4 !text-[12px]">
            {t("nav.cta")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function LanguageSwitcher() {
  const { lang, setLang, t } = useLandingT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const current = LANDING_LANGS.find((l) => l.code === lang) ?? LANDING_LANGS[0];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-white/45 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
        aria-label={t("lang.switcher.label")}
        title={current.label}
      >
        <Globe className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 min-w-[148px] rounded-lg border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {LANDING_LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code as LandingLang); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                l.code === lang ? "bg-white/5 text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-sm">{l.flag}</span>
                <span>{l.label}</span>
              </span>
              {l.code === lang && <Check className="h-3 w-3 text-[#a855f7]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type SectionAlign = "left" | "center" | "right" | "split";

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className = "",
  align = "left",
}: {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: SectionAlign;
}) {
  const hasHeader = eyebrow || title || description;

  const headerVariants: Record<Exclude<SectionAlign, "split">, string> = {
    left: "flex flex-col items-start text-left gap-4",
    center: "flex flex-col items-center text-center gap-4 mx-auto max-w-3xl",
    right: "flex flex-col items-end text-right gap-4 ml-auto max-w-3xl",
  };

  const Eyebrow = eyebrow ? (
    <div
      className={`flex items-center gap-3 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <span className="h-px w-12 bg-[#a855f7]" />
      <span className="font-tech text-[11px] uppercase text-[#a855f7] tracking-widest">
        {eyebrow}
      </span>
    </div>
  ) : null;

  return (
    <section id={id} className={`relative mx-auto max-w-[1400px] px-6 py-32 ${className}`}>
      {hasHeader && align !== "split" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className={`mb-16 ${headerVariants[align]}`}
        >
          {Eyebrow}
          {title && (
            <h2 className="font-display text-5xl md:text-7xl font-bold leading-[0.92] max-w-4xl">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-base md:text-lg text-white/55 leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </motion.div>
      )}

      {hasHeader && align === "split" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className="mb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-end"
        >
          <div className="lg:col-span-7">
            {Eyebrow}
            {title && (
              <h2 className="mt-4 font-display text-5xl md:text-7xl font-bold leading-[0.92]">
                {title}
              </h2>
            )}
          </div>
          {description && (
            <div className="lg:col-span-5 lg:pb-3">
              <div className="h-px w-16 bg-white/15 mb-4" />
              <p className="text-base md:text-lg text-white/55 leading-relaxed">
                {description}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {children}
    </section>
  );
}

export function ParallaxBlock({ children, distance = 60 }: { children: ReactNode; distance?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <motion.div ref={ref} style={{ y }}>
      {children}
    </motion.div>
  );
}

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({ to, suffix = "", duration = 1.6 }: { to: number; suffix?: string; duration?: number }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const start = performance.now();
          const tick = (t: number) => {
            const p = Math.min((t - start) / (duration * 1000), 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(to * eased);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          obs.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  const formatted = to >= 100 ? Math.round(value) : value.toFixed(1);
  return <span ref={ref}>{formatted}{suffix}</span>;
}
