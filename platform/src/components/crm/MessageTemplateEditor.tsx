import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Braces } from "lucide-react";
import { SYSTEM_MESSAGE_VARIABLES, normalizeVarKey } from "@/lib/forms.functions";
import { listLeadCustomFields } from "@/lib/leads.functions";

interface Variable {
  key: string;   // identificador entre {{ }}
  label: string; // rótulo humano
  group: "Sistema" | "Personalizados";
  hint?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Descrição curta abaixo do editor (ex.: "Envio via WhatsApp Web…"). */
  helper?: React.ReactNode;
}

/**
 * Textarea + seletor de variáveis:
 *  - Clique no botão `{ }` OU digite `{` no meio do texto pra abrir o menu.
 *  - Seleciona → insere `{{chave}}` na posição do cursor.
 *  - Lista campos de sistema (nome, sobrenome, e-mail, telefone, …) + campos
 *    personalizados do workspace (lead_custom_fields).
 */
export function MessageTemplateEditor({
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
  helper,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [triggerAt, setTriggerAt] = useState<number | null>(null); // pos do `{` que abriu o menu (pra remover se selecionar)

  const loadCustom = useServerFn(listLeadCustomFields);
  const customQ = useQuery<{ fields: Array<{ id: string; name: string; fieldType: string }> }>({
    queryKey: ["lead-custom-fields"],
    queryFn: () => loadCustom({}) as Promise<{ fields: Array<{ id: string; name: string; fieldType: string }> }>,
    staleTime: 60_000,
  });

  const variables: Variable[] = useMemo(() => {
    const sys: Variable[] = SYSTEM_MESSAGE_VARIABLES.map((v) => ({
      key: v.key,
      label: v.label,
      group: "Sistema",
      hint: v.hint,
    }));
    const custom: Variable[] = (customQ.data?.fields ?? []).map((f) => ({
      key: normalizeVarKey(f.name),
      label: f.name,
      group: "Personalizados",
      hint: `Campo personalizado (${f.fieldType})`,
    }));
    return [...sys, ...custom];
  }, [customQ.data]);

  const filtered = useMemo(() => {
    const q = normalizeVarKey(filter);
    if (!q) return variables;
    return variables.filter((v) =>
      v.key.includes(q) || normalizeVarKey(v.label).includes(q),
    );
  }, [variables, filter]);

  function insertVariable(key: string) {
    const el = ref.current;
    if (!el) return;
    const token = `{{${key}}}`;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    // Se o menu foi aberto por um `{` digitado, remove-o antes de inserir.
    let before = value.slice(0, start);
    let cursor = start;
    if (triggerAt !== null && triggerAt < start && value[triggerAt] === "{") {
      before = value.slice(0, triggerAt) + value.slice(triggerAt + 1, start);
      cursor = start - 1;
    }
    const after = value.slice(end);
    const next = before + token + after;
    onChange(next);
    setPickerOpen(false);
    setFilter("");
    setTriggerAt(null);
    // Restaurar foco/cursor
    requestAnimationFrame(() => {
      const pos = cursor + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  // Fecha ao clicar fora
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (el && el.contains(e.target as Node)) return;
      const menu = document.getElementById("mte-menu");
      if (menu && menu.contains(e.target as Node)) return;
      setPickerOpen(false);
      setTriggerAt(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-1">
        <span />
        <button
          type="button"
          onClick={() => {
            setTriggerAt(null);
            setFilter("");
            setPickerOpen((v) => !v);
            requestAnimationFrame(() => ref.current?.focus());
          }}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted hover:bg-muted/70 text-muted-foreground"
          title="Inserir variável (ou digite { no texto)"
        >
          <Braces className="h-3 w-3" />
          Inserir variável
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "{") {
            // Abre o menu imediatamente após o `{` ser inserido no textarea.
            const pos = (e.currentTarget.selectionStart ?? 0);
            requestAnimationFrame(() => {
              setTriggerAt(pos); // posição do `{` recém-digitado
              setFilter("");
              setPickerOpen(true);
            });
          } else if (e.key === "Escape" && pickerOpen) {
            setPickerOpen(false);
            setTriggerAt(null);
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-y"
      />
      {pickerOpen && (
        <div
          id="mte-menu"
          className="absolute z-30 mt-1 right-0 w-72 max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg"
        >
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar variável…"
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
            />
          </div>
          {(["Sistema", "Personalizados"] as const).map((group) => {
            const items = filtered.filter((v) => v.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="py-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group}</div>
                {items.map((v) => (
                  <button
                    key={`${group}-${v.key}`}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="w-full flex flex-col items-start gap-0.5 px-2 py-1.5 text-left hover:bg-muted/60"
                  >
                    <span className="text-xs font-medium">{v.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{`{{${v.key}}}`}</span>
                    {v.hint && <span className="text-[10px] text-muted-foreground">{v.hint}</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">Nenhuma variável encontrada.</div>
          )}
        </div>
      )}
      {helper && <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>}
    </div>
  );
}
