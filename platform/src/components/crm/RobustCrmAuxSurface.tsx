import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "formularios" | "empresas" | "produtos" | "arquivos";

export function RobustCrmAuxSurface({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <div
      data-operational-surface={`crm-${variant}`}
      className={cn(
        "h-screen overflow-hidden bg-muted/20",
        // Base visual: superfícies claras, bordas precisas e foco consistente.
        "[&_main]:bg-muted/20",
        "[&_header]:bg-background/95 [&_header]:shadow-none [&_header]:backdrop-blur-sm",
        "[&_header]:border-b [&_header]:border-border/80",
        "[&_header]:!px-4 md:[&_header]:!px-6",
        "[&_header]:!py-4 [&_header_h1]:tracking-tight [&_header_h1]:text-xl",
        "[&_header_p]:mt-1 [&_header_p]:max-w-3xl [&_header_p]:leading-5",
        "[&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2",
        "[&_button]:focus-visible:ring-primary/30 [&_button]:focus-visible:ring-offset-1",
        "[&_input]:focus-visible:outline-none [&_textarea]:focus-visible:outline-none",
        "[&_.rounded-2xl]:!rounded-lg [&_.rounded-xl]:!rounded-lg [&_.rounded-full]:!rounded-md",
        "[&_.shadow-lg]:!shadow-md [&_.shadow-xl]:!shadow-md",
        "[&_[role='dialog']]:!rounded-xl [&_[role='dialog']]:border-border/90 [&_[role='dialog']]:shadow-2xl",
        variant === "formularios" && cn(
          // Formulários: header forte, CTA principal evidente, cards com leitura de produto B2B.
          "[&>div>main>div.p-6]:!p-4 md:[&>div>main>div.p-6]:!p-6",
          "[&>div>main>div.p-6]:bg-muted/20",
          "[&>div>main>div_.grid]:gap-4",
          "[&>div>main>div_.bg-card.p-4]:!p-4",
          "[&>div>main>div_.bg-card.p-4]:border-border/80",
          "[&>div>main>div_.bg-card.p-4]:shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "[&>div>main>div_.bg-card.p-4]:transition-colors",
          "[&>div>main>div_.bg-card.p-4:hover]:border-primary/35",
          "[&>div>main>header_button]:h-9",
          "[&>div>main>header_button:first-of-type]:shadow-sm",
          "[&>div>main>header_button:last-of-type]:shadow-sm",
          "[&>div>main>div_input.max-w-sm]:max-w-md",
          "[&>div>main>div_input.max-w-sm]:bg-background",
          "[&>div>main>div_.bg-card.p-4_.text-destructive]:opacity-70",
          "[&>div>main>div_.bg-card.p-4_.text-destructive:hover]:opacity-100",
        ),
        variant === "empresas" && cn(
          // Empresas: tira sensação de barra comprimida e dá presença de diretório corporativo.
          "[&_[data-automation-page]>div.flex-1]:bg-muted/20",
          "[&_[data-automation-page]>div.flex-1>div.border-b]:bg-background",
          "[&_[data-automation-page]>div.flex-1>div.border-b]:!px-4 md:[&_[data-automation-page]>div.flex-1>div.border-b]:!px-6",
          "[&_[data-automation-page]>div.flex-1>div.border-b]:!py-4",
          "[&_[data-automation-page]>div.flex-1>div.flex-1.overflow-auto]:!p-4 md:[&_[data-automation-page]>div.flex-1>div.flex-1.overflow-auto]:!p-6",
          "[&_[data-automation-page]_.grid]:gap-4",
          "[&_[data-automation-page]_.bg-card.border.p-4]:!p-4",
          "[&_[data-automation-page]_.bg-card.border.p-4]:border-border/80",
          "[&_[data-automation-page]_.bg-card.border.p-4]:shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "[&_[data-automation-page]_.bg-card.border.p-4:hover]:border-primary/35",
          "[&_[data-automation-page]_input]:bg-background",
        ),
        variant === "produtos" && cn(
          // Produtos já era a tela mais madura: aumenta área útil e reforça navegação/gestão.
          "[&>div>main>div.mx-auto]:!max-w-screen-2xl",
          "[&>div>main>div.mx-auto]:!px-4 md:[&>div>main>div.mx-auto]:!px-6",
          "[&>div>main>div.mx-auto]:!py-6 [&>div>main>div.mx-auto]:!space-y-5",
          "[&>div>main_header]:rounded-lg [&>div>main_header]:border [&>div>main_header]:border-border/80",
          "[&>div>main_header]:bg-background [&>div>main_header]:p-5",
          "[&>div>main_header]:shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "[&>div>main_.inline-flex.rounded-full]:!rounded-md",
          "[&>div>main_.inline-flex.rounded-full]:border-border/80",
          "[&>div>main_.inline-flex.rounded-full]:bg-background",
          "[&>div>main_.inline-flex.rounded-full_button]:!rounded-sm",
          "[&>div>main_.rounded-2xl]:!rounded-lg",
          "[&>div>main_.rounded-2xl]:bg-background",
          "[&>div>main_.rounded-2xl]:border-border/80",
          "[&>div>main_.divide-y]:border-border/80 [&>div>main_.divide-y]:shadow-sm",
        ),
        variant === "arquivos" && cn(
          // Arquivos: transforma em central documental com faixa de filtros e tabela destacada.
          "[&>div>main>header]:!px-4 md:[&>div>main>header]:!px-6",
          "[&>div>main>header]:!py-4",
          "[&>div>main>header]:bg-background",
          "[&>div>main>div.flex-1]:!p-4 md:[&>div>main>div.flex-1]:!p-6",
          "[&>div>main>div.flex-1]:bg-muted/20",
          "[&>div>main>div.flex-1>div]:overflow-x-auto",
          "[&>div>main>div.flex-1>div.rounded-lg]:bg-background",
          "[&>div>main>div.flex-1>div.rounded-lg]:border-border/80",
          "[&>div>main>div.flex-1>div.rounded-lg]:shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "[&>div>main_table]:min-w-full",
          "[&>div>main_table_thead]:bg-muted/35 [&>div>main_table_tr]:h-11",
          "[&>div>main_table_th]:font-semibold",
        ),
      )}
    >
      {children}
    </div>
  );
}
