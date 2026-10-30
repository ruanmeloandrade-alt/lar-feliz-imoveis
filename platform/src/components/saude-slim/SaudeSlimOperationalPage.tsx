import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CircleDashed, Plus } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { cn } from "@/lib/utils";

export type SaudeSlimCard = {
  label: string;
  value?: string;
  hint?: string;
  icon: LucideIcon;
};

export type SaudeSlimAction = {
  label: string;
  to: string;
  icon?: LucideIcon;
  variant?: "primary" | "secondary";
};

export type SaudeSlimSection = {
  title: string;
  description: string;
  items?: string[];
  action?: SaudeSlimAction;
};

export function SaudeSlimOperationalPage({
  eyebrow,
  title,
  description,
  cards,
  primaryAction,
  secondaryAction,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cards: SaudeSlimCard[];
  primaryAction?: SaudeSlimAction;
  secondaryAction?: SaudeSlimAction;
  sections: SaudeSlimSection[];
}) {
  return (
    <div className="flex min-h-[100dvh] w-full bg-[#f6f8fb] text-slate-950 md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <header className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-5 border-b border-slate-200 bg-gradient-to-r from-white via-white to-emerald-50 px-5 py-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-widest text-emerald-700">{eyebrow}</div>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {secondaryAction && <ActionLink action={secondaryAction} />}
                {primaryAction && <ActionLink action={primaryAction} variant="primary" />}
              </div>
            </div>

            <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="bg-white px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</div>
                        <div className="mt-2 text-xl font-black tabular-nums text-slate-950">{card.value ?? "Sem dados ainda"}</div>
                        {card.hint && <div className="mt-1 text-xs leading-5 text-slate-500">{card.hint}</div>}
                      </div>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                        <Icon className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-3">
            {sections.map((section) => (
              <section key={section.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-black tracking-tight text-slate-950">{section.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{section.description}</p>
                  </div>
                  <CircleDashed className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                </div>

                <div className="mt-5 space-y-2">
                  {(section.items?.length ? section.items : ["Aguardando dados reais da operação."]).map((item) => (
                    <div key={item} className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span>{item}</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                  ))}
                </div>

                {section.action && (
                  <div className="mt-5">
                    <ActionLink action={section.action} />
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ActionLink({ action, variant }: { action: SaudeSlimAction; variant?: "primary" | "secondary" }) {
  const Icon = action.icon ?? (variant === "primary" || action.variant === "primary" ? Plus : ArrowRight);
  const primary = variant === "primary" || action.variant === "primary";

  return (
    <Link
      to={action.to as never}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors",
        primary
          ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      <Icon className="h-4 w-4" />
      {action.label}
    </Link>
  );
}
