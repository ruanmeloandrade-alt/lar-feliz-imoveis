import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DashboardTheme = "light" | "dark";

export const THEME_OPTIONS: { value: DashboardTheme; label: string; description: string }[] = [
  { value: "dark", label: "Modo escuro", description: "Tema escuro fixo da Vanessa Simoni." },
];

const STORAGE_KEY = "mkton:dashboard-theme";

export const THEME_BOOTSTRAP_SCRIPT = `(()=>{try{localStorage.setItem("${STORAGE_KEY}","dark")}catch{}document.documentElement.dataset.theme="dark";document.documentElement.classList.add("dark")})();`;

interface ThemeContextValue {
  theme: DashboardTheme;
  setTheme: (t: DashboardTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalize(value: string | null | undefined): DashboardTheme | null {
  if (!value) return null;
  return "dark";
}

function applyTheme(theme: DashboardTheme) {
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.classList.add("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DashboardTheme>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved: DashboardTheme = "dark";
    try {
      saved = normalize(localStorage.getItem(STORAGE_KEY)) ?? "dark";
    } catch {
      // Sem storage, preserva dark como fallback previsivel.
    }
    setThemeState(saved);
    applyTheme(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(theme);
  }, [theme, hydrated]);

  const setTheme = (next: DashboardTheme) => {
    setThemeState("dark");
    applyTheme("dark");
    try {
      localStorage.setItem(STORAGE_KEY, "dark");
    } catch {
      // O tema continua aplicado na sessão atual mesmo sem persistência.
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useDashboardTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useDashboardTheme must be used within ThemeProvider");
  return ctx;
}
