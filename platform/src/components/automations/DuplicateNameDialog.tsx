import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";

/**
 * Janela simples para escolher o nome da cópia antes de duplicar
 * um Salesbot, bot de grupo ou Agente IA.
 */
export function DuplicateNameDialog({
 open,
 originalName,
 title = "Duplicar",
 maxLength = 80,
 onCancel,
 onConfirm,
}: {
 open: boolean;
 originalName: string;
 title?: string;
 maxLength?: number;
 onCancel: () => void;
 onConfirm: (name: string) => void | Promise<void>;
}) {
 const [name, setName] = useState("");
 const [saving, setSaving] = useState(false);

 useEffect(() => {
  if (open) {
   setName(`${originalName} (cópia)`.slice(0, maxLength));
   setSaving(false);
  }
 }, [open, originalName, maxLength]);

 if (!open) return null;

 const confirm = async () => {
  const value = name.trim();
  if (!value || saving) return;
  setSaving(true);
  try {
   await onConfirm(value);
  } finally {
   setSaving(false);
  }
 };

 return (
  <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-center justify-center p-4" onClick={onCancel}>
   <div
    className="bg-popover text-popover-foreground border border-border rounded-lg w-[420px] shadow-2xl"
    onClick={(e) => e.stopPropagation()}
   >
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
     <div className="text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2">
      <Copy className="w-3.5 h-3.5 text-primary" /> {title}
     </div>
     <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
      <X className="w-4 h-4" />
     </button>
    </div>
    <div className="p-4 space-y-2">
     <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome da cópia</label>
     <input
      autoFocus
      value={name}
      maxLength={maxLength}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
       if (e.key === "Enter") { e.preventDefault(); void confirm(); }
       if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground"
     />
     <p className="text-[11px] text-muted-foreground">
      A cópia nasce desligada para você revisar antes de ativar.
     </p>
    </div>
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
     <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">
      Cancelar
     </button>
     <button
      onClick={() => void confirm()}
      disabled={!name.trim() || saving}
      className="text-xs font-semibold uppercase tracking-wider text-primary-foreground px-4 py-1.5 bg-primary hover:opacity-90 rounded disabled:opacity-40"
     >
      {saving ? "Duplicando…" : "OK"}
     </button>
    </div>
   </div>
  </div>
 );
}
