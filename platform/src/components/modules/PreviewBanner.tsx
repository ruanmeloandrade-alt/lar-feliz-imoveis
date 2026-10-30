import { Sparkles, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * Banner mostrado em módulos que ainda são prévia visual (sem backend).
 * Deixa explícito que os botões da tela são de demonstração.
 */
export function PreviewBanner({
  title = "Prévia visual",
  message,
  ctaLabel,
  ctaTo,
}: {
  title?: string;
  message?: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 text-warning-foreground p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-warning/20 text-warning grid place-items-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-warning">
            {title}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold uppercase tracking-wider">
            Em preparo
          </span>
        </div>
        <p className="text-sm mt-1 text-foreground/80">
          {message ??
            "Este módulo ainda está em construção. Os botões e listas abaixo são apenas uma amostra do que vem, nenhum clique cria, edita ou salva de verdade."}
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info className="w-3 h-3" /> Vamos avisar aqui assim que estiver liberado.
          </span>
          {ctaTo && ctaLabel && (
            <Link
              to={ctaTo}
              className="text-[11px] font-medium underline text-primary hover:text-primary/80"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
