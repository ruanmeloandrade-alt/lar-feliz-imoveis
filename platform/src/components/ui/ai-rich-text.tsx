import { Fragment } from "react";
import { cn } from "@/lib/utils";

/** Converte **negrito**, *itálico* e `código` em elementos reais. */
function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={k} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return <code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{p.slice(1, -1)}</code>;
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <em key={k}>{p.slice(1, -1)}</em>;
    }
    return <Fragment key={k}>{p}</Fragment>;
  });
}

/**
 * Renderiza a saída da IA (markdown simples) como texto formatado,
 * sem asteriscos, hashtags ou traços soltos na tela.
 */
export function AiRichText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: Array<{ type: "h" | "li" | "ol" | "p"; content: string; marker?: string }> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { blocks.push({ type: "h", content: heading[1] }); continue; }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) { blocks.push({ type: "li", content: bullet[1] }); continue; }
    const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) { blocks.push({ type: "ol", content: ordered[2], marker: ordered[1] }); continue; }
    // Linha do tipo "**Título:** conteúdo" vira destaque
    blocks.push({ type: "p", content: line });
  }

  return (
    <div className={cn("space-y-1.5 leading-relaxed", className)}>
      {blocks.map((b, i) => {
        if (b.type === "h") {
          return <div key={i} className="text-[0.95em] font-semibold text-foreground pt-1">{inline(b.content, `h${i}`)}</div>;
        }
        if (b.type === "li") {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0">{inline(b.content, `li${i}`)}</span>
            </div>
          );
        }
        if (b.type === "ol") {
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 font-semibold text-primary tabular-nums">{b.marker}.</span>
              <span className="min-w-0">{inline(b.content, `ol${i}`)}</span>
            </div>
          );
        }
        return <p key={i}>{inline(b.content, `p${i}`)}</p>;
      })}
    </div>
  );
}
