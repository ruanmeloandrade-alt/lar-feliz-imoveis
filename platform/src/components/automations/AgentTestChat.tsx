// Simulador ao vivo dos agentes IA. Usa a configuração atual do editor e
// nunca persiste ações do teste no CRM.
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { Check, Flag, MessageCircle, RotateCcw, Send, Target, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProductCatalogs, type DbCatalog } from "@/lib/products.functions";
import type { ObjectiveNode, ObjectiveTree } from "./ObjectiveTree";
import type { AgentSource } from "./AgentSourcesEditor";
import type { PromptAgentActionRule } from "@/lib/agent-action-rules";

const OBJECTIVE_MARKER = /\[\[MKTON_OBJECTIVE:([^\]]+)\]\]/g;
const PARTIAL_OBJECTIVE_MARKER = /\[\[MKTON_OBJECTIVE:[^\]]*$/;

export type AgentTestConfig = {
  scope: "1a1" | "grupo";
  mode: "prompt" | "objetivos";
  model?: string;
  name?: string;
  persona?: string;
  systemPrompt?: string;
  language?: string;
  tree?: ObjectiveTree | null;
  sources?: AgentSource[];
  actions?: PromptAgentActionRule[];
};

type FlatObjective = { id: string; label: string; depth: number };

function flattenObjectives(node: ObjectiveNode, depth = 0): FlatObjective[] {
  const here = node.block && node.block !== "objetivo"
    ? []
    : [{ id: node.id, label: node.say?.trim() || (depth === 0 ? "Contexto geral" : "Objetivo sem título"), depth }];
  return [...here, ...node.children.flatMap((child) => flattenObjectives(child, depth + 1))];
}

function messageText(message: UIMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function visibleText(text: string) {
  return text.replace(OBJECTIVE_MARKER, "").replace(PARTIAL_OBJECTIVE_MARKER, "").trim();
}

function markerFrom(text: string): string | null {
  const matches = [...text.matchAll(OBJECTIVE_MARKER)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

export function AgentTestChat({ workspaceId, config, open: openProp, onOpenChange }: {
  workspaceId: string | null;
  config: AgentTestConfig;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (value: boolean) => onOpenChange ? onOpenChange(value) : setOpenInternal(value);
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const loadCatalogsFn = useServerFn(listProductCatalogs);
  const catalogsQ = useQuery({ queryKey: ["product-catalogs"], queryFn: () => loadCatalogsFn(), staleTime: 60_000 });
  const catalogsRef = useRef<DbCatalog[]>([]);
  catalogsRef.current = (catalogsQ.data ?? []) as DbCatalog[];

  const transport = new DefaultChatTransport({
    api: "/api/agent-test-chat",
    headers: (): Record<string, string> => token ? { Authorization: `Bearer ${token}` } : {},
    body: () => {
      const cfg = configRef.current;
      let enrichedConfig = cfg;
      const tree = cfg.tree;
      if (tree?.products?.length) {
        const products = tree.products.map((ref) => {
          const catalog = catalogsRef.current.find((item) => item.id === ref.catalogId);
          const product = ref.productId ? catalog?.products.find((item) => item.id === ref.productId) : undefined;
          return { catalogName: catalog?.name, productName: product?.name, price: product?.promoPrice ?? product?.price, description: product?.description };
        });
        enrichedConfig = { ...cfg, tree: { ...tree, products } as unknown as ObjectiveTree };
      }
      return { workspaceId, config: enrichedConfig };
    },
  });

  const { messages, sendMessage, status, error, setMessages } = useChat({ id: `agent-test-${config.scope}`, transport });
  const busy = status === "submitted" || status === "streaming";
  const disabled = !workspaceId || busy;
  const scrollRef = useRef<HTMLDivElement>(null);

  const objectives = useMemo(
    () => config.mode === "objetivos" && config.tree ? flattenObjectives(config.tree.root) : [],
    [config.mode, config.tree],
  );
  const currentMarker = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role !== "assistant") continue;
      const marker = markerFrom(messageText(messages[index]));
      if (marker) return marker;
    }
    return objectives[0]?.id ?? null;
  }, [messages, objectives]);
  const currentIndex = currentMarker === "END"
    ? objectives.length
    : Math.max(0, objectives.findIndex((item) => item.id === currentMarker));
  const finished = currentMarker === "END";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const reset = () => {
    setMessages([] as UIMessage[]);
    setInput("");
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || disabled) return;
    setInput("");
    await sendMessage({ text });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/65 p-2 sm:p-4"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mx-auto flex h-full max-w-6xl items-stretch justify-center gap-4 overflow-hidden">
        {config.mode === "objetivos" && (
          <aside className="hidden w-[340px] shrink-0 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:flex lg:flex-col">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-primary" /> Jornada do teste
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                O progresso acompanha a etapa informada pelo próprio agente durante a simulação.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1.5">
                {objectives.map((objective, index) => {
                  const done = finished || index < currentIndex;
                  const active = !finished && index === currentIndex;
                  return (
                    <div
                      key={objective.id}
                      className={`rounded-lg border px-3 py-2 ${active ? "border-primary bg-primary/5" : "border-border bg-background/40"}`}
                      style={{ marginLeft: Math.min(objective.depth, 3) * 12 }}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${done ? "border-emerald-500 bg-emerald-500 text-white" : active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                          {done ? <Check className="h-3 w-3" /> : index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium leading-snug">{objective.label}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {done ? "Concluído" : active ? "Objetivo atual" : "Próximo"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className={`rounded-lg border px-3 py-2 ${finished ? "border-emerald-500 bg-emerald-500/10" : "border-border bg-background/40"}`}>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Flag className="h-4 w-4" /> {finished ? "Fluxo finalizado" : "Finalização"}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        <div className="relative my-auto flex h-[min(780px,96vh)] w-full max-w-[390px] flex-col overflow-hidden rounded-[34px] border-[8px] border-slate-950 bg-slate-900 shadow-2xl">
          <div className="mx-auto mt-1 h-1.5 w-20 rounded-full bg-slate-700" />
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-100">{config.name || "Agente A"}</div>
              <div className="truncate text-[10px] text-slate-400">
                {finished
                  ? "Teste finalizado"
                  : busy
                    ? "digitando…"
                    : config.mode === "objetivos"
                      ? `Objetivo ${Math.min(currentIndex + 1, objectives.length || 1)}/${objectives.length || 1}`
                      : "Pronto para testar"}
              </div>
            </div>
            <button type="button" onClick={reset} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800" title="Reiniciar">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800" title="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>

          {config.mode === "objetivos" && (
            <div className="border-b border-slate-800 bg-slate-950/60 px-3 py-2 lg:hidden">
              <div className="truncate text-[10px] font-medium text-emerald-300">
                {finished ? "Fluxo concluído" : objectives[currentIndex]?.label || "Contexto geral"}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${finished ? 100 : objectives.length ? ((currentIndex + 1) / objectives.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-900/50 px-2 py-3">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center px-5 text-center text-xs leading-relaxed text-slate-400">
                Envie uma mensagem como se fosse o cliente. O teste usa a configuração atual do editor e acompanha o fluxo até o encerramento.
              </div>
            )}
            {messages.map((message) => {
              const text = visibleText(messageText(message));
              const isUser = message.role === "user";
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${isUser ? "rounded-br-sm bg-emerald-600 text-white" : "rounded-bl-sm bg-slate-800 text-slate-100"}`}>
                    {text || (busy && !isUser ? "…" : "")}
                  </div>
                </div>
              );
            })}
            {error && (
              <div className="rounded-md border border-rose-700/60 bg-rose-900/40 p-2 text-[11px] text-rose-200">
                {error.message}
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-900 p-2">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={workspaceId ? "Digite sua mensagem..." : "Selecione um workspace"}
                disabled={disabled || finished}
                className="flex-1 rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={disabled || finished || !input.trim()}
                className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-white disabled:opacity-40"
                title="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
