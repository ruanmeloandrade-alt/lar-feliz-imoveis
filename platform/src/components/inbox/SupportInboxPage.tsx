import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bot, Headphones, Search, Send, UserRound } from "lucide-react";
import { AiAgentChat } from "@/components/ai-agent/AiAgentChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { getSupportRobotContext } from "@/lib/support-robot.functions";
import {
  getSupportAdminThread,
  listSupportAdminThreads,
  sendSupportAdminReply,
} from "@/lib/support-inbox.functions";
import { cn } from "@/lib/utils";

export function SupportInboxPage() {
  const { isSuperAdmin, loaded } = useIsSuperAdmin();
  if (!loaded) return null;
  return isSuperAdmin ? <SuperAdminSupportInbox /> : <CustomerSupportInbox />;
}

function CustomerSupportInbox() {
  const contextFn = useServerFn(getSupportRobotContext);
  const contextQ = useQuery({
    queryKey: ["support-robot-context"],
    queryFn: () => contextFn({}),
  });

  if (contextQ.isLoading) {
    return <div className="grid h-full min-h-[420px] place-items-center text-sm text-muted-foreground">Carregando suporte…</div>;
  }
  const ctx = contextQ.data;
  if (!ctx?.workspaceId) {
    return <div className="p-4 sm:p-6 text-sm text-muted-foreground">Selecione um workspace para abrir o suporte.</div>;
  }
  if (!ctx.active) {
    return (
      <div className="p-3 sm:p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Chat Suporte</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            A IA de suporte precisa da integração de IA ativa neste workspace para iniciar o atendimento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] min-h-[520px] p-0 sm:p-2 md:p-4">
      <AiAgentChat workspaceId={ctx.workspaceId} module="support_robot" fullscreen hideActions />
    </div>
  );
}

function SuperAdminSupportInbox() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSupportAdminThreads);
  const threadFn = useServerFn(getSupportAdminThread);
  const replyFn = useServerFn(sendSupportAdminReply);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [query, setQuery] = useState("");

  const threadsQ = useQuery({
    queryKey: ["support-admin-threads"],
    queryFn: () => listFn({}),
    refetchInterval: 15_000,
  });
  const threads = threadsQ.data ?? [];
  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((thread) =>
      thread.userName.toLowerCase().includes(needle) ||
      thread.workspaceName.toLowerCase().includes(needle) ||
      thread.lastMessage.toLowerCase().includes(needle),
    );
  }, [query, threads]);
  const selected = threads.find((thread) => thread.key === selectedKey) ?? threads[0] ?? null;

  useEffect(() => {
    if (!selectedKey && threads[0]) setSelectedKey(threads[0].key);
  }, [selectedKey, threads]);

  const threadQ = useQuery({
    queryKey: ["support-admin-thread", selected?.workspaceId, selected?.userId],
    enabled: !!selected,
    queryFn: () => threadFn({ data: { workspaceId: selected!.workspaceId, userId: selected!.userId } }),
    refetchInterval: 8_000,
  });

  const sendMutation = useMutation({
    mutationFn: () => replyFn({
      data: {
        workspaceId: selected!.workspaceId,
        userId: selected!.userId,
        content: reply,
      },
    }),
    onSuccess: async () => {
      setReply("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["support-admin-threads"] }),
        qc.invalidateQueries({ queryKey: ["support-admin-thread", selected?.workspaceId, selected?.userId] }),
      ]);
    },
  });

  const pendingCount = threads.filter((thread) => thread.pendingHandoff).length;
  const mobileThreadOpen = Boolean(selectedKey);

  return (
    <div className="flex h-[100dvh] min-h-[520px] overflow-hidden bg-background md:h-[calc(100vh-1rem)] md:min-h-[640px] md:rounded-xl md:border md:m-2 lg:m-4">
      <aside className={cn(
        "w-full md:flex md:w-[340px] xl:w-[360px] shrink-0 flex-col border-r bg-card/40",
        mobileThreadOpen ? "hidden" : "flex",
      )}>
        <div className="border-b p-3 sm:p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-primary" />
                <h1 className="font-semibold">Chat Suporte</h1>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Conversas acompanhadas desde o primeiro contato com a IA.
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="shrink-0 rounded-full bg-destructive px-2 py-1 text-[10px] font-semibold text-destructive-foreground">
                {pendingCount} pendente{pendingCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente ou workspace"
              className="h-9 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando conversas…</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {threads.length === 0 ? "Nenhuma conversa de suporte ainda." : "Nenhuma conversa encontrada."}
            </div>
          ) : filteredThreads.map((thread) => (
            <button
              key={thread.key}
              type="button"
              onClick={() => setSelectedKey(thread.key)}
              className={cn(
                "w-full border-b border-l-2 border-l-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 sm:px-4",
                selected?.key === thread.key && "border-l-primary bg-primary/5",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{thread.userName}</span>
                {thread.pendingHandoff && <span className="ml-auto h-2.5 w-2.5 rounded-full bg-destructive" title="Aguardando atendimento humano" />}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{thread.workspaceName}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{thread.lastMessage}</div>
              {thread.pendingHandoff && thread.handoffReason && (
                <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                  Handoff: {thread.handoffReason}
                </div>
              )}
            </button>
          ))}
        </div>
      </aside>

      <main className={cn("min-w-0 flex-1 flex-col", mobileThreadOpen ? "flex" : "hidden md:flex")}>
        {!selected ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">Selecione uma conversa.</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b px-3 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="md:hidden grid h-8 w-8 place-items-center rounded-md border text-muted-foreground"
                aria-label="Voltar para conversas"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{selected.userName}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {selected.workspaceName}{selected.workspaceSlug ? ` · ${selected.workspaceSlug}` : ""}
                </div>
              </div>
              {selected.pendingHandoff && (
                <span className="hidden sm:inline-flex rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive">
                  Aguardando humano
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
              <div className="mx-auto max-w-4xl space-y-3">
                {(threadQ.data?.messages ?? []).map((message: any) => {
                  const isUser = message.role === "user";
                  const isHuman = message.sender_type === "human";
                  return (
                    <div key={message.id} className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                      <div className={cn(
                        "max-w-[88%] rounded-xl px-3 py-2.5 text-sm sm:max-w-[76%]",
                        isUser ? "border bg-card" : "bg-primary text-primary-foreground",
                      )}>
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] opacity-70">
                          {isUser ? <UserRound className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                          {isUser ? "Cliente" : isHuman ? "Suporte humano" : "IA Vanessa Simoni"}
                        </div>
                        <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t bg-card/30 p-3 sm:p-4">
              <div className="mx-auto max-w-4xl">
                {threadQ.data?.handoff?.status === "pending" && (
                  <div className="mb-2 text-xs font-medium text-destructive">A IA solicitou atendimento humano. Sua resposta assume e resolve o handoff.</div>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Responder como suporte Vanessa Simoni..."
                    className="min-h-[52px] resize-none"
                  />
                  <Button
                    type="button"
                    className="shrink-0"
                    disabled={!reply.trim() || sendMutation.isPending}
                    onClick={() => sendMutation.mutate()}
                    aria-label="Enviar resposta"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {sendMutation.error && <div className="mt-2 text-xs text-destructive">{(sendMutation.error as Error).message}</div>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}