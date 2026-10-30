// Textarea (ou input) com autocomplete de variáveis ao digitar `{{`.
// Uso: substitui `<textarea>` mantendo `value` / `onChange(next)`.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Maximize2, X } from "lucide-react";
import { listLeadCustomFields } from "@/lib/leads.functions";
import {
  buildVariableCatalog,
  detectMentionQuery,
  detectVarQuery,
  filterMentionCatalog,
  filterVariableCatalog,
  type VariableItem,
} from "@/lib/text-vars";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CommonProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  disabled?: boolean;

  /** Extras específicas exibidas antes dos campos padrão (ex.: `url`). */
  extraVariables?: VariableItem[];

  /**
   * Habilita menções (`{` abre o seletor e insere `{@token}`).
   * Só deve ser ligado em bots/agentes de escopo "grupo".
   */
  mentions?: boolean;
  /** Menções extras (ex.: participantes conhecidos do grupo). */
  extraMentions?: VariableItem[];
};


type TextareaProps = CommonProps & {
  as?: "textarea";
  rows?: number;
};

type InputProps = CommonProps & {
  as: "input";
  type?: "text";
};

export type VariableTextareaProps = TextareaProps | InputProps;

export function VariableTextarea(props: VariableTextareaProps) {
  const { value, onChange, placeholder, className, disabled } = props;
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [caret, setCaret] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const listFields = useServerFn(listLeadCustomFields);
  const { data } = useQuery({
    queryKey: ["lead-custom-fields"],
    queryFn: async () => await listFields(),
    staleTime: 0,
  });

  const catalog = useMemo(() => {
    const base = buildVariableCatalog((data?.fields ?? []).map((f) => ({ id: f.id, name: f.name })));
    const extras = props.extraVariables ?? [];
    return [...extras, ...base];
  }, [data, props.extraVariables]);

  const mentionQuery = useMemo(
    () => (props.mentions ? detectMentionQuery(value, caret) : null),
    [props.mentions, value, caret],
  );
  const varQuery = useMemo(
    () => (mentionQuery ? null : detectVarQuery(value, caret)),
    [mentionQuery, value, caret],
  );
  const activeQuery = mentionQuery ?? varQuery;
  const isMention = Boolean(mentionQuery);

  const suggestions = useMemo(() => {
    if (mentionQuery) {
      return filterMentionCatalog(props.extraMentions ?? [], mentionQuery.query).slice(0, 8);
    }
    return varQuery ? filterVariableCatalog(catalog, varQuery.query).slice(0, 8) : [];
  }, [mentionQuery, varQuery, catalog, props.extraMentions]);

  // Sincroniza abertura / índice do popover com o query atual.
  useEffect(() => {
    if (activeQuery && suggestions.length > 0) {
      setOpen(true);
      setHighlight((h) => Math.min(h, suggestions.length - 1));
    } else {
      setOpen(false);
      setHighlight(0);
    }
  }, [activeQuery, suggestions.length]);

  const insertToken = useCallback(
    (item: VariableItem) => {
      if (!activeQuery) return;
      const before = value.slice(0, activeQuery.open);
      const after = value.slice(caret);
      const inserted = isMention ? `{@${item.token}} ` : `{{${item.token}}}`;
      const next = `${before}${inserted}${after}`;
      const newCaret = before.length + inserted.length;
      onChange(next);
      // Reposiciona o cursor após a inserção.
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(newCaret, newCaret);
          } catch {
            /* input types que não suportam setSelectionRange */
          }
          setCaret(newCaret);
        }
      });
      setOpen(false);
    },
    [activeQuery, caret, isMention, onChange, value],
  );


  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (!open || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertToken(suggestions[highlight]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [open, suggestions, highlight, insertToken],
  );

  const syncCaret = () => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    setCaret(pos);
  };

  const wrapperStyle: CSSProperties = { position: "relative" };

  const commonInputProps = {
    value,
    onChange: (
      e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>,
    ) => {
      onChange(e.target.value);
      // O caret já mudou nesse ponto, sincroniza em seguida.
      requestAnimationFrame(syncCaret);
    },
    onKeyDown: handleKeyDown,
    onKeyUp: syncCaret,
    onClick: syncCaret,
    onFocus: syncCaret,
    onBlur: () => {
      // Delay para permitir clique no popover.
      setTimeout(() => setOpen(false), 120);
    },
    placeholder,
    className,
    disabled,
  } as const;

  return (
    <div style={wrapperStyle} className={`group relative ${props.wrapperClassName ?? ""}`}>
      {props.as === "input" ? (
        <input
          ref={(el) => { ref.current = el; }}
          type="text"
          {...commonInputProps}
        />
      ) : (
        <div className="relative">
          <textarea
            ref={(el) => { ref.current = el; }}
            rows={(props as TextareaProps).rows ?? 3}
            {...commonInputProps}
          />
          {!disabled && (props as any).as !== "input" && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="absolute right-2 top-2 p-1.5 rounded-md bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-slate-700/50"
              title="Expandir visualização"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-4xl w-[90vw] h-[80vh] flex flex-col bg-slate-900 border-slate-800 p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between space-y-0 shrink-0">
            <DialogTitle className="text-lg font-medium text-slate-100">
              {placeholder ?? "Editar conteúdo"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 p-6 flex flex-col bg-slate-950/50 overflow-hidden relative">
             <VariableTextarea
               {...props}
               className={`${className} flex-1 !h-full !min-h-full resize-none bg-transparent border-none focus:ring-0 focus-visible:ring-0 text-base leading-relaxed`}
               wrapperClassName="flex-1 flex flex-col"
               as="textarea"
               rows={20}
             />
          </div>
          
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-fuchsia-500/10"
            >
              Concluído
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            {isMention
              ? `Marcar alguém no grupo, @${activeQuery?.query ?? ""}`
              : `Inserir variável, {{${activeQuery?.query ?? ""}`}
          </div>


          {suggestions.map((it, idx) => (
            <button
              key={`${it.group}:${it.token}`}
              type="button"
              onClick={() => insertToken(it)}
              onMouseEnter={() => setHighlight(idx)}
              className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between gap-2 ${
                idx === highlight ? "bg-fuchsia-500/20 text-fuchsia-100" : "hover:bg-slate-800 text-slate-200"
              }`}
            >
              <span className="flex flex-col">
                <span className="text-xs">{it.label}</span>
                <span className="text-[10px] text-slate-500">
                  {isMention ? `@${it.token}` : `{{${it.token}}}`} · {it.group}
                </span>


              </span>
            </button>
          ))}
          <div className="px-2 py-1 text-[10px] text-slate-500 border-t border-slate-800">
            ↑↓ navegar · Enter para inserir · Esc para fechar
          </div>
        </div>
      )}
    </div>
  );
}
