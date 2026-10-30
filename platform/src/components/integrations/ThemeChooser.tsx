import { THEME_OPTIONS, useDashboardTheme, type DashboardTheme } from "@/lib/theme";
import { Check, Sparkles, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type Palette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  bubbleIn: string;
  bubbleOut: string;
  ring: string;
};

const PALETTES: Record<DashboardTheme, Palette> = {
  light: {
    bg: "#ffffff",
    surface: "#F6F9FC",
    text: "#0A2540",
    muted: "#425466",
    accent: "#635BFF",
    bubbleIn: "#ffffff",
    bubbleOut: "#EEF0FF",
    ring: "#FF6B9D",
  },
  dark: {
    bg: "#0B1220",
    surface: "#111a2e",
    text: "#F5F7FB",
    muted: "#9AA6B8",
    accent: "#7C7BFF",
    bubbleIn: "#1a2440",
    bubbleOut: "#2b2660",
    ring: "#FF6B9D",
  },
};

function ThemePreview({ p }: { p: Palette }) {
  return (
    <div
      className="relative h-32 w-full rounded-md overflow-hidden border border-border/40"
      style={{ background: p.bg }}
      aria-hidden="true"
    >
      <div
        className="absolute top-0 left-0 right-0 h-5 flex items-center gap-1 px-2 border-b"
        style={{ background: p.surface, borderColor: `${p.text}18` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.accent }} />
        <span className="h-1 w-10 rounded-full" style={{ background: `${p.text}30` }} />
        <span className="h-1 w-6 rounded-full ml-auto" style={{ background: `${p.text}20` }} />
      </div>
      <div className="absolute inset-0 pt-6 pb-2 px-2 flex flex-col justify-end gap-1.5">
        <div
          className="max-w-[65%] rounded-md rounded-bl-sm px-2 py-1 text-[9px] leading-tight shadow-sm"
          style={{ background: p.bubbleIn, color: p.text }}
        >
          Bom dia! Tudo certo por aí?
        </div>
        <div
          className="max-w-[70%] self-end rounded-md rounded-br-sm px-2 py-1 text-[9px] leading-tight shadow-sm"
          style={{ background: p.bubbleOut, color: p.text }}
        >
          Fechei mais 2 leads agora 🎯
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span
            className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: `${p.accent}22`, color: p.accent }}
          >
            Quente
          </span>
          <span className="text-[8px]" style={{ color: p.muted }}>
            há 2 min
          </span>
        </div>
      </div>
    </div>
  );
}

export function ThemeChooser({ embedded = false }: { embedded?: boolean } = {}) {
  const { theme, setTheme } = useDashboardTheme();

  if (embedded) return <ThemeCards theme={theme} setTheme={setTheme} className="grid grid-cols-1 sm:grid-cols-2 gap-3" />;

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/60 flex items-start justify-between gap-4 flex-wrap bg-gradient-to-br from-muted/40 to-transparent">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Modo de visualização</div>
            <div className="text-xs text-muted-foreground mt-0.5 max-w-[520px]">
              Escolha entre o modo claro (Vanessa Simoni Home) e o modo noturno. Aplicado no dashboard,
              CRM, inbox e demais módulos, pode trocar sempre que quiser.
            </div>
          </div>
        </div>
      </div>

      <ThemeCards theme={theme} setTheme={setTheme} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4" />
    </section>
  );
}

function ThemeCards({
  theme,
  setTheme,
  className,
}: {
  theme: DashboardTheme;
  setTheme: (t: DashboardTheme) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {THEME_OPTIONS.map((opt) => {
        const active = opt.value === theme;
        const p = PALETTES[opt.value];
        const Icon = opt.value === "dark" ? Moon : Sun;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "group relative rounded-xl p-3 text-left transition-all border-2 bg-card",
              "hover:-translate-y-0.5 hover:shadow-md",
              active
                ? "border-primary shadow-md ring-2 ring-primary/20"
                : "border-border hover:border-primary/40",
            )}
          >
            <ThemePreview p={p} />
            <div className="mt-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-start gap-2">
                <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                    {opt.description}
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 h-5 w-5 rounded-full grid place-items-center border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-transparent group-hover:border-primary/40",
                )}
              >
                <Check className="w-3 h-3" />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

