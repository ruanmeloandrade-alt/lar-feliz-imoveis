import { Palette, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { THEME_OPTIONS, useDashboardTheme } from "@/lib/theme";

export function ThemeSwitcher() {
  const { theme, setTheme } = useDashboardTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = THEME_OPTIONS.find((o) => o.value === theme)!;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-muted transition-colors"
        title="Estilo do dashboard"
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-64 rounded-md border border-border bg-popover shadow-lg p-1">
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Estilo do dashboard
          </div>
          {THEME_OPTIONS.map((opt) => {
            const active = opt.value === theme;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-2 py-2 rounded-sm flex items-start gap-2 hover:bg-muted transition-colors ${
                  active ? "bg-muted" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </div>
                {active && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
