import { supabase } from "@/integrations/supabase/client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState, useMemo } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DashboardMetricsResponse } from "@/lib/mock-dashboard";

interface Props {
  metrics: DashboardMetricsResponse;
}

function formatKpiValue(v: number | null, unit: string) {
  if (v == null) return "sem dados";
  if (unit === "currency_brl")
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  if (unit === "percent") return `${v.toFixed(1)}%`;
  if (unit === "duration_min") return `${v.toFixed(1)} min`;
  return v.toLocaleString("pt-BR");
}

function buildKpiContext(metrics: DashboardMetricsResponse): string {
  const lines: string[] = [];
  lines.push(`Período: ${metrics.period_label}`);
  lines.push(`Funil: ${metrics.funnel_label}`);
  lines.push(`Leads carregados: ${metrics.leads_loaded}`);
  lines.push("");
  lines.push("KPIs:");
  for (const k of metrics.kpis ?? []) {
    const delta = k.delta_pct == null ? "" : ` (Δ ${k.delta_pct.toFixed(1)}%)`;
    lines.push(
      `- ${k.label} [${k.source_label}]: ${formatKpiValue(k.value, k.unit)}${delta}, ${k.description ?? ""}`.trim(),
    );
  }
  if (metrics.funnel?.length) {
    lines.push("");
    lines.push("Funil:");
    for (const s of metrics.funnel) {
      lines.push(`- ${s.stage_name}: ${s.count} leads · R$ ${s.value_brl.toLocaleString("pt-BR")}`);
    }
  }
  return lines.join("\n");
}

export function DashboardChat({ metrics }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const kpiContext = useMemo(() => buildKpiContext(metrics), [metrics]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/dashboard-chat",
        headers: async () => { const {data}=await supabase.auth.getSession(); return {Authorization:`Bearer ${data.session?.access_token??""}`}; },
        body: () => ({ kpiContext }),
      }),
    [kpiContext],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg print:hidden"
          aria-label="Abrir chat com IA"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      )}

      <div
        className={cn(
          "fixed bottom-6 right-6 z-40 w-[340px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-3rem)] rounded-xl border bg-card shadow-2xl flex flex-col print:hidden transition-all",
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Assistente do painel</p>
              <p className="text-[11px] text-muted-foreground truncate">Pergunte sobre suas KPIs</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={() => setMessages([])}
              >
                Limpar
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Oi! Posso ajudar a entender os números do seu painel.</p>
              <p className="opacity-80">Exemplos:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "O que é ticket médio?",
                  "Como estão minhas vendas?",
                  "Qual KPI está pior?",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => void sendMessage({ text: s })}
                    className="text-[11px] rounded-full border px-2 py-1 hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m: UIMessage) => {
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            return (
              <div
                key={m.id}
                className={cn(
                  "text-sm leading-relaxed whitespace-pre-wrap break-words",
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2"
                    : "mr-auto max-w-[95%] text-foreground",
                )}
              >
                {text}
              </div>
            );
          })}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="text-xs text-muted-foreground animate-pulse">Pensando…</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t p-2 flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={1}
            placeholder="Pergunte sobre suas KPIs…"
            className="min-h-[36px] max-h-24 resize-none text-sm"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
