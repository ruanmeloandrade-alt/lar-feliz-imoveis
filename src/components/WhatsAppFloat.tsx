import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { trackPublicEvent, type PublicChatContext } from "@/lib/public-site";
type Message = { role: "user" | "assistant"; content: string };
type Pick = {
  id: string;
  title: string;
  city: string;
  price: number | null;
  image: string | null;
};
const tokenKey = "vanessa-site-attendance";
const WhatsAppFloat = () => {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [message, setMessage] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false),
    [registered, setRegistered] = useState(false),
    [error, setError] = useState(""),
    [properties, setProperties] = useState<Pick[]>([]);
  const end = useRef<HTMLDivElement>(null),
    started = useRef(false);
  useEffect(() => {
    const handler = (event: Event) => {
      const context = (event as CustomEvent<PublicChatContext>).detail ?? {};
      if (context.name) setName(context.name);
      if (context.phone) setPhone(context.phone);
      setOpen(true);
    };
    window.addEventListener("vanessa:open-chat", handler);
    return () => window.removeEventListener("vanessa:open-chat", handler);
  }, []);
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    void start();
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/public/vanessa-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r
      .json()
      .catch(() => ({ error: "Atendimento indisponível. Tente novamente." }));
    if (!r.ok) throw Error(data.error ?? "Não foi possível continuar agora.");
    return data;
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const previous = sessionStorage.getItem(tokenKey);
      let data;
      try {
        data = await post({
          action: "start",
          ...(previous ? { token: previous } : {}),
        });
      } catch {
        sessionStorage.removeItem(tokenKey);
        data = await post({ action: "start" });
      }
      setToken(data.token);
      sessionStorage.setItem(tokenKey, data.token);
      setMessages(data.messages ?? []);
      setRegistered(!!data.registered);
      trackPublicEvent("site_chat_open");
    } catch {
      setError(
        "O atendimento está indisponível neste momento. Tente novamente em instantes.",
      );
      started.current = false;
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    const text = message.trim();
    if (!text || busy || !token) return;
    setMessage("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    setError("");
    try {
      const data = await post({ action: "message", token, message: text });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      setProperties(data.properties ?? []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível responder agora.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    if (
      busy ||
      !token ||
      !consent ||
      name.trim().length < 2 ||
      phone.replace(/\D/g, "").length < 10
    )
      return;
    setBusy(true);
    setError("");
    try {
      const data = await post({
        action: "contact",
        token,
        name: name.trim(),
        phone,
        consent: true,
      });
      setRegistered(true);
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      trackPublicEvent(data.leadCreated ? "lead" : "site_contact_updated", {
        source: "site-assistente",
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível cadastrar agora.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="vs-chat-root">
      {open && (
        <section
          role="dialog"
          aria-label="Atendimento Vanessa"
          className="vs-chat-panel"
        >
          <header>
            <div>
              <Sparkles size={17} />
              <span>
                <strong>Atendimento Vanessa</strong>
                <small>Pré-atendimento virtual</small>
              </span>
            </div>
            <button
              aria-label="Fechar atendimento"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="vs-chat-history" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={"vs-chat-message vs-chat-" + m.role}>
                {m.content}
              </div>
            ))}
            {properties.map((p) => (
              <a
                key={p.id}
                className="vs-chat-property"
                href="#imoveis"
                onClick={() => {
                  trackPublicEvent("chat_property_interest", {
                    product_id: p.id,
                    product_name: p.title,
                  });
                  window.dispatchEvent(
                    new CustomEvent("vanessa:view-property", {
                      detail: { id: p.id },
                    }),
                  );
                  setOpen(false);
                }}
              >
                {p.image && !/\.mp4$/i.test(p.image) && (
                  <img src={p.image} alt={p.title} />
                )}
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.city}</small>
                  <b>
                    {p.price == null
                      ? "Consulte as condições"
                      : new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(p.price)}
                  </b>
                </span>
                <ArrowUpRight size={15} />
              </a>
            ))}
            {busy && (
              <p role="status" className="vs-chat-status">
                Só um instante...
              </p>
            )}
            {error && (
              <p role="status" className="vs-chat-error">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>
          {!registered ? (
            <div className="vs-chat-contact">
              <strong>Vamos continuar pelo WhatsApp?</strong>
              <p>
                Deixe só seu nome e número para a Vanessa seguir com seu
                atendimento.
              </p>
              <div className="vs-chat-contact-fields">
                <input
                  aria-label="Nome para atendimento"
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  aria-label="WhatsApp para atendimento"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={30}
                  placeholder="WhatsApp com DDD"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Quero receber atendimento sobre os imóveis pelo WhatsApp.
              </label>
              <button
                className="vs-button"
                disabled={
                  busy ||
                  !token ||
                  !consent ||
                  name.trim().length < 2 ||
                  phone.replace(/\D/g, "").length < 10
                }
                onClick={register}
              >
                Quero continuar no WhatsApp
                <ArrowUpRight size={14} />
              </button>
            </div>
          ) : (
            <div className="vs-chat-registered">
              <CheckCircle2 size={16} />
              Seu contato ficou registrado com a Vanessa.
            </div>
          )}
          <div className="vs-chat-compose">
            <input
              aria-label="Mensagem para o assistente"
              placeholder="Qual imóvel você procura?"
              maxLength={800}
              value={message}
              disabled={busy || !token}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              aria-label="Enviar mensagem"
              disabled={busy || !message.trim() || !token}
              onClick={send}
            >
              <Send size={17} />
            </button>
          </div>
          {!token && !busy && (
            <button className="vs-chat-retry" onClick={start}>
              Tentar atendimento novamente
            </button>
          )}
        </section>
      )}
      <button
        className="vs-chat-launcher"
        aria-label={
          open ? "Minimizar atendimento" : "Abrir atendimento Vanessa"
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={23} /> : <MessageCircle size={23} />}
        <span>{open ? "Fechar" : "Vamos encontrar seu imóvel?"}</span>
      </button>
    </div>
  );
};
export default WhatsAppFloat;
