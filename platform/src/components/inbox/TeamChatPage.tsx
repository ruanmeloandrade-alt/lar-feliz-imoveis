import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Users as UsersIcon, Send, Search, Shield, Bot, Settings2, MessageSquareText } from "lucide-react";
import {
  listTeamConversations,
  listTeamMessages,
  sendTeamMessage,
  markTeamConversationRead,
} from "@/lib/team-chat.functions";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TeamChatPage({ selectedKey }: { selectedKey?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listConvs = useServerFn(listTeamConversations);
  const listMsgs = useServerFn(listTeamMessages);
  const sendMsg = useServerFn(sendTeamMessage);
  const markRead = useServerFn(markTeamConversationRead);

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const convsQ = useQuery({
    queryKey: ["team-chat", "conversations"],
    queryFn: () => listConvs({ data: {} }),
    refetchInterval: 15_000,
  });

  const all = useMemo(
    () => [...(convsQ.data?.sectors ?? []), ...(convsQ.data?.directs ?? [])],
    [convsQ.data],
  );
  const activeKey = selectedKey ?? all[0]?.key;
  const active = all.find((c) => c.key === activeKey);
  const totalUnread = useMemo(() => all.reduce((sum, c) => sum + (c.unread ?? 0), 0), [all]);

  const msgsQ = useQuery({
    queryKey: ["team-chat", "messages", activeKey],
    enabled: Boolean(active),
    queryFn: () =>
      listMsgs({ data: { kind: active!.kind, targetId: active!.id, limit: 100 } }),
    refetchInterval: 8_000,
  });

  useEffect(() => {
    if (!activeKey) return;
    void markRead({ data: { key: activeKey } }).then(() =>
      qc.invalidateQueries({ queryKey: ["team-chat", "conversations"] }),
    );
  }, [activeKey, markRead, qc]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgsQ.data]);

  const sendM = useMutation({
    mutationFn: async (body: string) => {
      if (!active || active.system) return;
      await sendMsg({ data: { kind: active.kind, targetId: active.id, body } });
    },
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["team-chat", "messages", activeKey] });
      void qc.invalidateQueries({ queryKey: ["team-chat", "conversations"] });
    },
  });

  const filter = (list: typeof all) =>
    list.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

  const sectors = filter(convsQ.data?.sectors ?? []);
  const directs = filter(convsQ.data?.directs ?? []);

  function open(key: string) {
    void navigate({ to: "/inbox/equipe/$threadId", params: { threadId: key } });
  }

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <aside className={`${selectedKey ? "hidden md:flex" : "flex"} w-full md:w-[340px] xl:w-[360px] shrink-0 border-r border-border flex-col min-h-0 bg-card/40`}>
        <div className="px-4 py-4 border-b border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-primary" />
                <h1 className="text-base font-semibold tracking-tight">Chat Equipe</h1>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                Setores e conversas individuais do workspace.
              </p>
            </div>
            {totalUnread > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
                {totalUnread > 99 ? "99+" : totalUnread} não lidas
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
            <div className="rounded-md border border-border bg-background px-2.5 py-2">
              <span className="block uppercase tracking-wide">Setores</span>
              <strong className="mt-0.5 block text-sm font-semibold text-foreground tabular-nums">
                {(convsQ.data?.sectors ?? []).length}
              </strong>
            </div>
            <div className="rounded-md border border-border bg-background px-2.5 py-2">
              <span className="block uppercase tracking-wide">Diretas</span>
              <strong className="mt-0.5 block text-sm font-semibold text-foreground tabular-nums">
                {(convsQ.data?.directs ?? []).length}
              </strong>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar setor ou pessoa"
              className="w-full h-9 pl-8 pr-3 rounded-md bg-background border border-border text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Setores">
            {sectors.length === 0 && (
              <p className="px-4 py-3 text-[11px] text-muted-foreground">
                Você ainda não participa de nenhum setor.
              </p>
            )}
            {sectors.map((c) => (
              <Row
                key={c.key}
                active={c.key === activeKey}
                onClick={() => open(c.key)}
                avatar={<span className="text-[11px] font-semibold">#</span>}
                color={c.color ?? undefined}
                name={c.name}
                subtitle={c.lastMessage ?? c.subtitle ?? ""}
                time={c.lastAt ? timeLabel(c.lastAt) : ""}
                unread={c.unread}
              />
            ))}
          </Section>

          <Section title="Conversas individuais">
            {directs.length === 0 && (
              <p className="px-4 py-3 text-[11px] text-muted-foreground">
                Nenhum outro usuário no workspace ainda.
              </p>
            )}
            {directs.map((c) => (
              <Row
                key={c.key}
                active={c.key === activeKey}
                onClick={() => open(c.key)}
                avatar={<span className="text-[11px] font-semibold">{initials(c.name)}</span>}
                name={c.name}
                subtitle={c.lastMessage ?? c.subtitle ?? ""}
                time={c.lastAt ? timeLabel(c.lastAt) : ""}
                unread={c.unread}
              />
            ))}
          </Section>
        </div>

        {convsQ.data?.isAdmin && (
          <div className="p-3 border-t border-border bg-muted/20">
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Shield className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
              <span>
                Você é administrador e visualiza todos os setores e colaboradores. Gerencie participantes em{" "}
                <Link to="/fluxo-trabalho" className="text-primary underline underline-offset-2">
                  Fluxo de trabalho → Setores
                </Link>
                .
              </span>
            </div>
          </div>
        )}
      </aside>

      <section className={`${selectedKey ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col min-h-0 bg-background`}>
        {!active ? (
          <div className="flex-1 grid place-items-center p-8 text-center">
            <div className="max-w-sm">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-border bg-muted/30">
                <MessageSquareText className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Escolha uma conversa</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecione um setor ou uma pessoa na lista para abrir o histórico.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="h-16 px-3 sm:px-5 border-b border-border flex items-center gap-3 bg-card/30 shrink-0">
              <button
                type="button"
                onClick={() => void navigate({ to: "/inbox/equipe" })}
                className="md:hidden grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground"
                aria-label="Voltar para conversas"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div
                className="w-9 h-9 rounded-full grid place-items-center text-xs font-semibold border border-border shrink-0"
                style={{ backgroundColor: active.color ?? "var(--muted)" }}
              >
                {active.kind === "sector" ? "#" : initials(active.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{active.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {active.kind === "sector" ? active.subtitle : "Conversa individual"}
                </p>
              </div>
              {active.kind === "sector" && (
                <Link
                  to="/fluxo-trabalho"
                  className="hidden sm:flex ml-auto h-8 px-2.5 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 items-center gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Membros do setor
                </Link>
              )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
              <div className="mx-auto max-w-4xl space-y-3">
                {msgsQ.isLoading && (
                  <p className="text-center text-xs text-muted-foreground py-8">Carregando mensagens…</p>
                )}
                {!msgsQ.isLoading && (msgsQ.data ?? []).length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-8">
                    Nenhuma mensagem ainda. Comece a conversa.
                  </p>
                )}
                {(msgsQ.data ?? []).map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] sm:max-w-[76%] rounded-xl px-3 py-2.5 text-sm shadow-sm ${
                        m.isSystem
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : m.mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border"
                      }`}
                    >
                      {!m.mine && (
                        <p className="text-[10px] font-medium opacity-70 mb-0.5 flex items-center gap-1">
                          {m.isSystem && <Bot className="w-3 h-3" />}
                          {m.isSystem ? "Alerta do sistema" : m.authorName}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                      <p className="text-[10px] opacity-60 text-right mt-1 tabular-nums">
                        {timeLabel(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {active.system ? <p className="p-3 border-t border-border text-center text-xs text-muted-foreground">Alertas internos dos SalesBots. O cliente não recebe estas mensagens.</p> : <form
              className="p-3 border-t border-border bg-card/30"
              onSubmit={(e) => {
                e.preventDefault();
                const body = draft.trim();
                if (body) sendM.mutate(body);
              }}
            >
              <div className="mx-auto max-w-4xl flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const body = draft.trim();
                      if (body) sendM.mutate(body);
                    }
                  }}
                  rows={1}
                  placeholder={`Mensagem para ${active.name}...`}
                  className="flex-1 resize-none rounded-lg bg-background border border-border px-3 py-2.5 text-sm max-h-32 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sendM.isPending}
                  className="h-10 px-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> <span className="hidden sm:inline">{sendM.isPending ? "Enviando" : "Enviar"}</span>
                </button>
              </div>
            </form>}
          </>
        )}
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  active,
  onClick,
  avatar,
  color,
  name,
  subtitle,
  time,
  unread,
}: {
  active: boolean;
  onClick: () => void;
  avatar: React.ReactNode;
  color?: string;
  name: string;
  subtitle: string;
  time: string;
  unread: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 border-l-2 hover:bg-muted/40 transition-colors ${
        active ? "bg-primary/5 border-primary" : "border-transparent"
      }`}
    >
      <div
        className="w-9 h-9 rounded-full grid place-items-center shrink-0 border border-border"
        style={{ backgroundColor: color ?? "var(--muted)" }}
      >
        {avatar}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate">{name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{subtitle || "Sem mensagens ainda"}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-muted-foreground tabular-nums">{time}</span>
        {unread > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
    </button>
  );
}
