import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./crm-regression-fixes.css";

export function RobustCrmFunnelSurface({ children }: { children: ReactNode }) {
  return (
    <div
      data-operational-surface="crm-funis"
      className={cn(
        "h-screen overflow-hidden bg-background",
        "[&>div]:bg-muted/10",
        // Header: mais leitura, menos barra de botões comprimida.
        "[&>div>div.flex-1>div.border-b]:bg-card [&>div>div.flex-1>div.border-b]:shadow-none",
        "[&>div>div.flex-1>div.border-b>div]:!px-4 [&>div>div.flex-1>div.border-b>div]:!py-3",
        "md:[&>div>div.flex-1>div.border-b>div]:!px-5",
        "[&>div>div.flex-1>div.border-b_button]:focus-visible:outline-none",
        "[&>div>div.flex-1>div.border-b_button]:focus-visible:ring-2",
        "[&>div>div.flex-1>div.border-b_button]:focus-visible:ring-primary/35",
        // Busca e controles deixam de disputar largura em notebook.
        "max-xl:[&>div>div.flex-1>div.border-b_.w-64]:!w-52",
        "max-lg:[&>div>div.flex-1>div.border-b_.w-64]:!w-44",
        // Board usa mais área útil e menos padding ornamental.
        "[&>div>div.flex-1_.min-w-max.h-full]:!px-4 [&>div>div.flex-1_.min-w-max.h-full]:!py-3",
        // Ações e objetos operacionais ficam menos arredondados / decorativos.
        "[&_.rounded-2xl]:!rounded-lg [&_.rounded-xl]:!rounded-lg",
        "[&_.shadow-lg]:!shadow-sm [&_.shadow-xl]:!shadow-md",
        // Cards do Kanban ganham foco consistente sem efeitos extras.
        "[&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2",
        "[&_button]:focus-visible:ring-primary/30 [&_button]:focus-visible:ring-offset-1",
        // Rodapé promocional não pertence ao cockpit operacional.
        "[&>div>div.flex-1>div.border-t:last-child]:hidden",
      )}
    >
      {children}
    </div>
  );
}

export function RobustCrmAgentSurface({ children }: { children: ReactNode }) {
  return (
    <div
      data-operational-surface="crm-agent"
      className={cn(
        "h-screen overflow-hidden bg-background",
        "[&>div]:bg-muted/10",
        // Lista lateral é navegação contextual, compacta e estável.
        "[&>div>aside]:!w-64 [&>div>aside]:bg-card",
        "[&>div>aside_.rounded-lg]:!rounded-md",
        // Editor usa largura operacional maior; evita coluna excessivamente centralizada.
        "[&>div>main>div>div.mx-auto]:!max-w-none",
        "[&>div>main>div.mx-auto]:!max-w-none",
        "[&>div>main_.mx-auto]:!max-w-6xl",
        "[&>div>main_.mx-auto]:!px-5",
        "xl:[&>div>main_.mx-auto]:!px-6",
        // Builder: menos card decorativo e mais seções operacionais.
        "[&>div>main_.rounded-2xl]:!rounded-lg",
        "[&>div>main_.rounded-xl]:!rounded-lg",
        "[&>div>main_.shadow-sm]:!shadow-none",
        // Header sticky mais sóbrio, ações globais previsíveis.
        "[&>div>main_.sticky]:bg-background/95 [&>div>main_.sticky]:shadow-sm",
        "[&>div>main_.sticky_button]:!rounded-md",
        // Status continuam semânticos, mas pills menores.
        "[&>div>main_.rounded-full]:!rounded-md",
        // Foco consistente para teclado.
        "[&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2",
        "[&_button]:focus-visible:ring-primary/35 [&_button]:focus-visible:ring-offset-1",
        "[&_input]:focus-visible:outline-none [&_textarea]:focus-visible:outline-none",
        // Notebook: lista contextual reduz largura sem sumir.
        "max-xl:[&>div>aside]:!w-56",
      )}
    >
      {children}
    </div>
  );
}
