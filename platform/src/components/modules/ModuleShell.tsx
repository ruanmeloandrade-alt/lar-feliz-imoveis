import { type ReactNode } from "react";
import { Clock, type LucideIcon } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { cn } from "@/lib/utils";

interface ModuleShellProps {
  icon: LucideIcon;
  tag: string;
  title?: string;
  description?: string;
  status?: "ativo" | "preparo";
  actions?: ReactNode;
  children: ReactNode;
}

export function ModuleShell({
  icon: Icon,
  tag,
  title,
  description,
  status = "preparo",
  actions,
  children,
}: ModuleShellProps) {
  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6 space-y-5 md:space-y-6">

          <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-4 md:p-5 grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto] items-start md:items-center gap-3 md:gap-4">
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
              <Icon className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground truncate">
                  {tag}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                    status === "ativo"
                      ? "text-success border-success/30 bg-success/10"
                      : "text-warning border-warning/30 bg-warning/10",
                  )}
                >
                  {status === "ativo" ? "Ativo" : (
                    <>
                      <Clock className="w-2.5 h-2.5" /> Prévia · Em preparo
                    </>
                  )}
                </span>
              </div>
              {title && <h1 className="mt-1 text-lg md:text-xl font-semibold tracking-tight truncate">{title}</h1>}
              {description && <p className="text-xs text-muted-foreground mt-1 max-w-2xl line-clamp-2 md:line-clamp-none">{description}</p>}
            </div>
            {actions && (
              <div className="col-span-2 md:col-span-1 shrink-0 flex items-center gap-2 flex-wrap">
                {actions}
              </div>
            )}
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}

export function ModuleSection({
  title,
  description,
  children,
  right,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
