import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrackingCodeBlock({
  code,
  filename,
  className,
}: {
  code: string;
  filename?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? "mkton-snippet.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("relative rounded-lg border border-border bg-muted/40 group", className)}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/70">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {filename ?? "snippet"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3 h-3" /> Baixar
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto text-[11.5px] leading-relaxed p-3 font-mono text-foreground/90 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
