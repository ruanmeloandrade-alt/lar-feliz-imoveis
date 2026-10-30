import { cn } from "@/lib/utils";

/**
 * Ponto/tag indicador de "visível somente para super_admin".
 * Aparece só quando renderizado por super_admin, o cliente final não vê o item.
 * Serve pra você identificar de relance o que está oculto do cliente.
 */
export function AdminOnlyDot({
  className,
  title = "Visível só para você (super admin). O cliente final não vê este item.",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full bg-fuchsia-500 shadow-[0_0_0_2px_rgba(217,70,239,0.15)] shrink-0",
        className,
      )}
    />
  );
}

/**
 * Versão em tag textual, usada onde o pontinho ficaria ambíguo (ex: cards).
 */
export function AdminOnlyTag({ className }: { className?: string }) {
  return (
    <span
      title="Visível só para você (super admin). O cliente final não vê este item."
      className={cn(
        "inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 shrink-0",
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
      Só admin
    </span>
  );
}
