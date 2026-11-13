import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Camada exclusivamente visual para a área de Configurações.
 *
 * O arquivo legado concentra regras de perfil, equipe, billing, segurança,
 * sessões e preferências. Nesta fase o backend está congelado, então a camada
 * abaixo reorganiza somente apresentação/densidade sem duplicar handlers.
 * Quando cada subtela for extraída para componentes menores, estas regras
 * viram classes semânticas locais e este adaptador pode ser removido.
 */
export function RobustConfigSurface({ children }: { children: ReactNode }) {
  return (
    <div
      data-operational-surface="configuracoes"
      className={cn(
        "min-h-screen bg-background",
        "[&>div>main]:[--background:#fff] [&>div>main]:[--card:#fff]",
        "[&>div>main]:[--foreground:#252126] [&>div>main]:[--card-foreground:#252126]",
        "[&>div>main]:[--muted:#f7f3f4] [&>div>main]:[--muted-foreground:#665a61]",
        "[&>div>main]:[--border:#e7dde1] [&>div>main]:[--input:#e7dde1]",
        "[&>div>main]:[--primary:#a01b36] [&>div>main]:[--primary-foreground:#fff] [&>div>main]:[--ring:#a01b36]",
        "[&>div>main]:bg-background [&>div>main]:text-foreground",
        "[&_input]:focus-visible:outline-none [&_textarea]:focus-visible:outline-none",
        "[&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2",
        "[&_button]:focus-visible:ring-primary/35 [&_button]:focus-visible:ring-offset-1",
      )}
    >
      {children}
    </div>
  );
}
