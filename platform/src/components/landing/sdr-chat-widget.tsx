import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle, X, Send } from "lucide-react";
import juliaIcon from "@/assets/julia-face.png.asset.json";

const transport = new DefaultChatTransport({ api: "/api/sdr-chat" });

const SUGGESTIONS = [
  "O que é a MKTOn?",
  "Como funciona o teste grátis?",
  
  "Quero criar minha conta",
];

const INTRO: UIMessage = {
  id: "intro",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Oi! Aqui é a Júlia Braga, da Vanessa Simoni 👋 Tô aqui pra te ajudar a entender a plataforma e liberar seus 20 dias grátis. No que posso te ajudar?",
    },
  ],
};

function computeTypingDelay(userText: string) {
  const base = 5000;
  const perChar = 40;
  const jitter = Math.random() * 1500;
  return Math.min(10000, base + userText.length * perChar + jitter);
}

export const SDR_CHAT_EVENT = "mkton:open-sdr-chat";

export function openSdrChat(prompt?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SDR_CHAT_EVENT, { detail: { prompt } }));
}

function getText(message: UIMessage) {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

export function SdrChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pendingTyping, setPendingTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: [INTRO],
  });

  const isLoading = status === "submitted" || status === "streaming" || pendingTyping;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const submit = async (text: string) => {
    const value = text.trim();
    if (!value || isLoading) return;
    setInput("");
    setPendingTyping(true);
    const delay = computeTypingDelay(value);
    await new Promise((r) => setTimeout(r, delay));
    setPendingTyping(false);
    await sendMessage({ text: value });
  };

  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const handler = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      setOpen(true);
      window.setTimeout(() => {
        inputRef.current?.focus();
        if (prompt) void submitRef.current(prompt);
      }, 320);
    };
    window.addEventListener(SDR_CHAT_EVENT, handler);
    return () => window.removeEventListener(SDR_CHAT_EVENT, handler);
  }, []);

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-[60] flex flex-col items-end gap-2">
        <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-right shadow-[0_12px_40px_-18px_rgba(37,99,235,0.75)] backdrop-blur-md">
          <div className="font-tech text-[10px] font-semibold uppercase leading-none tracking-wide text-white/85">
            Tire sua dúvida agora
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5 font-tech text-[10px] uppercase leading-none tracking-wide text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Estamos online
          </div>
        </div>
        <motion.button
          aria-label="Abrir chat com Júlia Braga"
          onClick={() => setOpen((v) => !v)}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 18 }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] text-white shadow-[0_10px_40px_-10px_rgba(37,99,235,0.7)] hover:scale-105 transition-transform overflow-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.div 
                key="julia" 
                initial={{ opacity: 0, scale: 0.5 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.5 }}
                className="relative h-full w-full"
              >
                <img 
                  src={juliaIcon.url} 
                  alt="Julia" 
                  className="h-full w-full object-cover scale-[1.8] translate-y-[10%]"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <X className="h-5 w-5 text-white drop-shadow-md" />
                </div>
              </motion.div>
            ) : (
              <motion.span key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                <MessageCircle className="h-6 w-6" />
              </motion.span>
            )}
          </AnimatePresence>
          {!open && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#2563eb] animate-ping" />
          )}
        </motion.button>
      </div>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-24 right-6 z-[60] flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl shadow-[0_20px_80px_-20px_rgba(37,99,235,0.5)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#2563eb]/15 to-transparent px-4 py-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]">
                <span className="text-[11px] font-semibold tracking-wide text-white">JB</span>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0a0a]" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-display text-sm font-semibold text-white">Júlia Braga · Vanessa Simoni</span>
                <span className="font-tech text-[10px] uppercase tracking-wider text-emerald-400/80">Online agora</span>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-[#2563eb] text-white rounded-br-md"
                        : "bg-white/5 text-white/90 border border-white/10 rounded-bl-md"
                    }`}
                  >
                    {getText(m)}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-3.5 py-2.5">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
                    </div>
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  Não consegui responder agora. Tenta de novo em instantes.
                </div>
              )}

              {messages.length <= 1 && !isLoading && (
                <div className="pt-2">
                  <div className="font-tech text-[10px] uppercase tracking-wider text-white/40 mb-2">
                    Sugestões
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => submit(s)}
                        className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-white/75 hover:border-[#2563eb]/50 hover:text-white transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <Link
              to="/auth"
              className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_-10px_rgba(37,99,235,0.6)] hover:opacity-95 transition"
            >
              Criar conta grátis · 20 dias
            </Link>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="flex items-center gap-2 border-t border-white/10 bg-black/40 px-3 py-3"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte qualquer coisa..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                aria-label="Enviar"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563eb] text-white disabled:opacity-30 hover:opacity-90 transition"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
