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
        // Canvas: usa melhor a largura e reduz o vazio central.
        "[&>div>main]:bg-muted/10",
        "[&>div>main>div]:!mx-0 [&>div>main>div]:!max-w-none",
        "[&>div>main>div]:!gap-5 [&>div>main>div]:!px-4 [&>div>main>div]:!py-4",
        "md:[&>div>main>div]:!px-5 md:[&>div>main>div]:!py-5",
        "xl:[&>div>main>div]:!grid-cols-[224px_minmax(0,1fr)]",
        // Navegação local: painel estável e compacto, não uma coluna solta.
        "[&>div>main>div>aside]:rounded-lg [&>div>main>div>aside]:border",
        "[&>div>main>div>aside]:border-border/80 [&>div>main>div>aside]:bg-card",
        "[&>div>main>div>aside]:p-2 [&>div>main>div>aside]:shadow-sm",
        "lg:[&>div>main>div>aside]:!top-5",
        // Conteúdo: cabeçalho separado da superfície editável.
        "[&>div>main>div>section]:!space-y-4",
        "[&>div>main>div>section>header]:rounded-lg",
        "[&>div>main>div>section>header]:border [&>div>main>div>section>header]:border-border/80",
        "[&>div>main>div>section>header]:bg-card [&>div>main>div>section>header]:px-5",
        "[&>div>main>div>section>header]:py-4 [&>div>main>div>section>header]:shadow-sm",
        // Remove o grande card externo. As seções internas viram a estrutura real.
        "[&>div>main>div>section>div]:!rounded-none",
        "[&>div>main>div>section>div]:!border-0 [&>div>main>div>section>div]:!bg-transparent",
        "[&>div>main>div>section>div]:!p-0 [&>div>main>div>section>div]:!shadow-none",
        // Reduz aparência de 'card dentro de card' sem apagar divisões úteis.
        "[&_.rounded-2xl]:!rounded-lg [&_.shadow-sm]:!shadow-none",
        // Controles de formulário ganham foco e altura previsíveis.
        "[&_input]:focus-visible:outline-none [&_textarea]:focus-visible:outline-none",
        "[&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2",
        "[&_button]:focus-visible:ring-primary/35 [&_button]:focus-visible:ring-offset-1",
        // Notebook/mobile: navegação local deixa de desperdiçar largura.
        "max-lg:[&>div>main>div>aside]:relative max-lg:[&>div>main>div>aside]:top-auto",
        "max-lg:[&>div>main>div>aside]:flex max-lg:[&>div>main>div>aside]:gap-2",
        "max-lg:[&>div>main>div>aside]:overflow-x-auto max-lg:[&>div>main>div>aside]:p-2",
        "max-lg:[&>div>main>div>aside>div]:min-w-48",
      )}
    >
      {children}
    </div>
  );
}
