import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Sistema leve de i18n para a landing pública.
 * - 3 idiomas totalmente traduzidos: pt-BR, en-US, es-ES
 * - Português é o padrão da primeira visita
 * - Persiste a escolha em localStorage (`mkton:landing-lang`)
 * - Sincroniza com as preferências do usuário quando ele está logado
 *
 * Uso:  const { t, lang, setLang } = useLandingT();
 *       t("hero.title")
 */

export type LandingLang = "pt" | "en" | "es";

export const LANDING_LANGS: { code: LandingLang; label: string; flag: string }[] = [
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

type Dict = Record<string, string>;

const dict: Record<LandingLang, Dict> = {
  pt: {
    "nav.platform": "Plataforma",
    "nav.agents": "Agentes IA",
    "nav.crm": "CRM",
    "nav.automations": "Automações",
    "nav.integrations": "Integrações",
    "nav.economy": "Economia",
    "nav.plans": "Planos",
    "nav.signIn": "Entrar",
    "nav.cta": "Colocar empresa ON →",

    "hero.chip.trial": "20 dias gratuitos",
    "hero.chip.access": "Acesso completo",
    "hero.chip.noCard": "Sem cartão de crédito",
    "hero.title.line1": "SUA EMPRESA",
    "hero.title.on": "ON.",
    "hero.description":
      "A plataforma que conecta <strong>CRM, IA, Tráfego Pago, Social Media, Atendimento, Analytics e Automação</strong> em um único ecossistema inteligente.",
    "hero.cta.primary": "Colocar minha empresa ON",
    "hero.cta.signin": "Entrar",
    "hero.cta.footnote": "Cadastro · 60 segundos · Liberação imediata",

    "lang.switcher.label": "Idioma",
  },
  en: {
    "nav.platform": "Platform",
    "nav.agents": "AI Agents",
    "nav.crm": "CRM",
    "nav.automations": "Automations",
    "nav.integrations": "Integrations",
    "nav.economy": "Economics",
    "nav.plans": "Plans",
    "nav.signIn": "Sign in",
    "nav.cta": "Turn my company ON →",

    "hero.chip.trial": "20-day free trial",
    "hero.chip.access": "Full access",
    "hero.chip.noCard": "No credit card",
    "hero.title.line1": "YOUR COMPANY",
    "hero.title.on": "ON.",
    "hero.description":
      "The platform that connects <strong>CRM, AI, Paid Ads, Social Media, Customer Support, Analytics and Automation</strong> in a single intelligent ecosystem.",
    "hero.cta.primary": "Turn my company ON",
    "hero.cta.signin": "Sign in",
    "hero.cta.footnote": "Sign up · 60 seconds · Instant access",

    "lang.switcher.label": "Language",
  },
  es: {
    "nav.platform": "Plataforma",
    "nav.agents": "Agentes IA",
    "nav.crm": "CRM",
    "nav.automations": "Automatizaciones",
    "nav.integrations": "Integraciones",
    "nav.economy": "Economía",
    "nav.plans": "Planes",
    "nav.signIn": "Iniciar sesión",
    "nav.cta": "Encender mi empresa →",

    "hero.chip.trial": "20 días gratis",
    "hero.chip.access": "Acceso completo",
    "hero.chip.noCard": "Sin tarjeta de crédito",
    "hero.title.line1": "TU EMPRESA",
    "hero.title.on": "ON.",
    "hero.description":
      "La plataforma que conecta <strong>CRM, IA, Publicidad Paga, Redes Sociales, Atención, Analytics y Automatización</strong> en un único ecosistema inteligente.",
    "hero.cta.primary": "Encender mi empresa",
    "hero.cta.signin": "Iniciar sesión",
    "hero.cta.footnote": "Registro · 60 segundos · Acceso inmediato",

    "lang.switcher.label": "Idioma",
  },
};

const STORAGE_KEY = "mkton:landing-lang";

function detectLang(): LandingLang {
  if (typeof window === "undefined") return "pt";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as LandingLang | null;
    if (saved && dict[saved]) return saved;
  } catch { /* noop */ }
  return "pt";
}

interface Ctx {
  lang: LandingLang;
  setLang: (l: LandingLang) => void;
  t: (key: string) => string;
}

const LandingI18nContext = createContext<Ctx | null>(null);

export function LandingI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LandingLang>("pt");

  useEffect(() => {
    const detected = detectLang();
    setLangState(detected);
    if (typeof document !== "undefined") {
      document.documentElement.lang = detected === "pt" ? "pt-BR" : detected === "en" ? "en-US" : "es-ES";
    }
  }, []);

  const setLang = (l: LandingLang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
    if (typeof document !== "undefined") {
      document.documentElement.lang = l === "pt" ? "pt-BR" : l === "en" ? "en-US" : "es-ES";
    }
  };

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (key) => dict[lang]?.[key] ?? dict.pt[key] ?? key,
    }),
    [lang],
  );

  return <LandingI18nContext.Provider value={value}>{children}</LandingI18nContext.Provider>;
}

export function useLandingT() {
  const ctx = useContext(LandingI18nContext);
  if (!ctx) {
    // Fallback silencioso quando usado fora do provider (SSR estático etc)
    return {
      lang: "pt" as LandingLang,
      setLang: () => {},
      t: (key: string) => dict.pt[key] ?? key,
    };
  }
  return ctx;
}
