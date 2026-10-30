import { Activity, BookOpen, AlertTriangle, Package, ChevronRight } from "lucide-react";
import type { CentralCommandItem } from "@/lib/mock-dashboard";
import { cn } from "@/lib/utils";

const ICONS = {
  controller: Activity,
  reading: BookOpen,
  alert: AlertTriangle,
  catalog: Package,
};

const TONE_STYLES: Record<string, string> = {
  success: "bg-success/10 text-success border-success/20",
  info: "bg-info/10 text-info border-info/20",
  warn: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function CentralComandos({ items }: { items: CentralCommandItem[] }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6 shadow-premium hover:shadow-premium-lg transition-all duration-300">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold tracking-widest text-primary/80 uppercase font-display">
            Central de Comandos
          </div>
          <h2 className="text-base font-semibold text-foreground mt-0.5">
            Operação Vanessa Simoni
          </h2>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <button
              key={item.id}
              className="group text-left flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 shadow-sm hover:shadow-premium-lg transition-all duration-300"
            >
              <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    {item.title}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                      TONE_STYLES[item.badge_tone]
                    )}
                  >
                    {item.badge_text}
                  </span>
                </div>
                <p className="text-xs text-foreground/80 mt-1 leading-snug line-clamp-2">
                  {item.caption}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
