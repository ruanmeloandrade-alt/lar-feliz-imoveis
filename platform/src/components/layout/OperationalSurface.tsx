import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type OperationalPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function OperationalPageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: OperationalPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border/80 px-5 py-4 md:flex-row md:items-start md:justify-between md:px-6",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-[22px]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type OperationalToolbarProps = {
  children: ReactNode;
  secondary?: ReactNode;
  className?: string;
};

export function OperationalToolbar({ children, secondary, className }: OperationalToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/70 bg-muted/15 px-5 py-3 md:flex-row md:items-center md:justify-between md:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {secondary && <div className="flex shrink-0 flex-wrap items-center gap-2">{secondary}</div>}
    </div>
  );
}

type OperationalSectionProps = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function OperationalSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: OperationalSectionProps) {
  return (
    <section className={cn("border-b border-border/70 last:border-b-0", className)}>
      {(title || description || Icon || actions) && (
        <div className="flex items-start justify-between gap-4 px-5 py-4 md:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-muted/30 text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
              {description && <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn("px-5 pb-5 md:px-6 md:pb-6", bodyClassName)}>{children}</div>
    </section>
  );
}

type OperationalStateProps = {
  kind: "loading" | "empty" | "error";
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function OperationalState({ kind, title, description, action, className }: OperationalStateProps) {
  const Icon = kind === "loading" ? Loader2 : kind === "error" ? AlertCircle : Inbox;
  const fallbackTitle = kind === "loading" ? "Carregando" : kind === "error" ? "Não foi possível carregar" : "Nada por aqui ainda";

  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center border border-dashed border-border bg-muted/10 px-6 py-8 text-center",
        className,
      )}
    >
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-muted-foreground">
        <Icon className={cn("h-4 w-4", kind === "loading" && "animate-spin")} />
      </div>
      <div className="text-sm font-medium text-foreground">{title ?? fallbackTitle}</div>
      {description && <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type OperationalPaneProps = {
  children: ReactNode;
  className?: string;
};

export function OperationalPane({ children, className }: OperationalPaneProps) {
  return <div className={cn("min-w-0 border border-border bg-card", className)}>{children}</div>;
}
