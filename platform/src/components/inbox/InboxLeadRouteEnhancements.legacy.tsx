import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send, Square, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { listSalesbots, startSalesbotForLead } from "@/lib/salesbots.functions";
import {
  activateConversationAgentForLead,
  listActiveWorkspaceConversationAgents,
} from "@/lib/conversation-agents.functions";
import {
  getLeadAutomationControlState,
  resolveLeadWhatsappIdentity,
  stopLeadConversationAgent,
  stopLeadSalesbots,
} from "@/lib/inbox-lead-actions.functions";
import {
  listGroupSalesbotsForManagement,
  stopGroupSalesbotRun,
} from "@/lib/group-salesbot-management.functions";
import {
  resolveInboxSalesbotTarget,
  startGroupSalesbotFromInbox,
} from "@/lib/inbox-group-salesbot.functions";

type Activity = { id?: string; type?: string };
type ActivityResult = { activities?: Activity[]; [key: string]: unknown };
type InboxBotOption = { id: string; name: string; is_active: boolean };

function withoutTechnicalEvents(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const result = value as ActivityResult;
  if (!Array.isArray(result.activities)) return value;
  const filtered = result.activities.filter((activity) => activity?.type !== "conversation_read");
  if (filtered.length === result.activities.length) return value;
  return { ...result, activities: filtered };
}

export function InboxLeadRouteEnhancements({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const resolveTarget = useServerFn(resolveInboxSalesbotTarget);
  const resolveWhatsapp = useServerFn(resolveLeadWhatsappIdentity);
  const getAutomationState = useServerFn(getLeadAutomationControlState);
  const stopSalesbots = useServerFn(stopLeadSalesbots);
  const stopAgent = useServerFn(stopLeadConversationAgent);
  const listBots = useServerFn(listSalesbots);
  const listGroupBots = useServerFn(listGroupSalesbotsForManagement);
  const startBot = useServerFn(startSalesbotForLead);
  const startGroupBot = useServerFn(startGroupSalesbotFromInbox);
  const stopGroupBot = useServerFn(stopGroupSalesbotRun);
  const listAgents = useServerFn(listActiveWorkspaceConversationAgents);
  const activateAgent = useServerFn(activateConversationAgentForLead);
  const [panel, setPanel] = useState<"salesbot" | "agent" | null>(null);
  const [composerNode, setComposerNode] = useState<HTMLElement | null>(null);

  const targetQ = useQuery({
    queryKey: ["inbox", "salesbot-target", leadId],
    queryFn: () => resolveTarget({ data: { conversationId: leadId } }),
    staleTime: 10_000,
  });
  const targetResolved = targetQ.isSuccess;
  const isGroup = targetQ.data?.kind === "group";
  const groupActiveRunId = isGroup ? targetQ.data.activeRunId : null;

  useEffect(() => {
    setPanel(null);
    const locateComposer = () => {
      const fileInput = document.querySelector(
        '[data-chat-surface] input[type="file"][accept*="application/pdf"]',
      );
      const parent = fileInput?.parentElement;
      setComposerNode(parent instanceof HTMLElement ? parent : null);
    };

    locateComposer();
    const observer = new MutationObserver(locateComposer);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [leadId]);

  useEffect(() => {
    if (isGroup) return;
    const sanitize = () => {
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ["inbox", "activities", leadId] })) {
        const current = query.state.data;
        const sanitized = withoutTechnicalEvents(current);
        if (sanitized !== current) queryClient.setQueryData(query.queryKey, sanitized);
      }
    };
    sanitize();
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const key = event?.query?.queryKey;
      if (Array.isArray(key) && key[0] === "inbox" && key[1] === "activities" && key[2] === leadId) sanitize();
    });
    return unsubscribe;
  }, [isGroup, leadId, queryClient]);

  useQuery({
    queryKey: ["inbox", "whatsapp-identity", leadId],
    queryFn: async () => {
      const identity = await resolveWhatsapp({ data: { leadId } });
      if (identity.phone) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["inbox", "detail", leadId] }),
          queryClient.invalidateQueries({ queryKey: ["inbox", "lead-conversations"] }),
        ]);
      }
      return identity;
    },
    enabled: targetResolved && !isGroup,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const automationQ = useQuery({
    queryKey: ["inbox", "automation-control", leadId],
    queryFn: () => getAutomationState({ data: { leadId } }),
    enabled: targetResolved && !isGroup,
    refetchInterval: isGroup ? false : 10_000,
    staleTime: 5_000,
  });
  const botsQ = useQuery<{ bots: InboxBotOption[] }>({
    queryKey: ["inbox", "salesbots", isGroup ? "group" : "lead"],
    queryFn: async () => {
      if (isGroup) {
        const result = await listGroupBots();
        return {
          bots: (result.bots ?? []).map((bot) => ({
            id: bot.id,
            name: bot.nome,
            is_active: bot.ativo,
          })),
        };
      }
      const result = await listBots();
      return {
        bots: (result.bots ?? []).map((bot) => ({
          id: bot.id,
          name: bot.name,
          is_active: bot.is_active,
        })),
      };
    },
    enabled: panel === "salesbot" && targetResolved,
    staleTime: 30_000,
  });
  const agentsQ = useQuery({
    queryKey: ["inbox", "conversation-agents"],
    queryFn: () => listAgents(),
    enabled: panel === "agent" && targetResolved && !isGroup,
    staleTime: 30_000,
  });

  const bots = useMemo(() => (botsQ.data?.bots ?? []).filter((bot) => bot.is_active), [botsQ.data]);
  const agents = useMemo(() => (agentsQ.data?.agents ?? []).filter((agent) => agent.enabled), [agentsQ.data]);
  const salesbotActive = isGroup ? !!groupActiveRunId : automationQ.data?.salesbotActive === true;
  const agentActive = !isGroup && automationQ.data?.agentActive === true;

  const refreshAutomation = async () => {
    if (isGroup) {
      await Promise.all([
        targetQ.refetch(),
        queryClient.invalidateQueries({ queryKey: ["inbox", "group-messages", leadId] }),
        queryClient.invalidateQueries({ queryKey: ["inbox", "group-conversations"] }),
      ]);
      return;
    }
    await Promise.all([
      automationQ.refetch(),
      queryClient.invalidateQueries({ queryKey: ["inbox", "detail", leadId] }),
      queryClient.invalidateQueries({ queryKey: ["inbox", "activities", leadId] }),
    ]);
  };

  const botMut = useMutation({
    mutationFn: (salesbotId: string) =>
      isGroup
        ? startGroupBot({ data: { conversationId: leadId, salesbotId } })
        : startBot({ data: { salesbotId, leadId } }),
    onSuccess: async () => {
      toast.success(isGroup ? "SalesBot iniciado neste grupo." : "SalesBot iniciado para este lead.");
      setPanel(null);
      await refreshAutomation();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao iniciar SalesBot."),
  });
  const agentMut = useMutation({
    mutationFn: (agentId: string) => activateAgent({ data: { agentId, leadId } }),
    onSuccess: async () => {
      toast.success("Agente IA assumiu as próximas mensagens deste lead.");
      setPanel(null);
      await refreshAutomation();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao ativar Agente IA."),
  });
  const stopBotMut = useMutation({
    mutationFn: async () => {
      if (isGroup) {
        if (!groupActiveRunId) return { stopped: 0 };
        await stopGroupBot({ data: { runId: groupActiveRunId } });
        return { stopped: 1 };
      }
      return stopSalesbots({ data: { leadId } });
    },
    onSuccess: async (result) => {
      toast.success(
        result.stopped > 0
          ? isGroup
            ? "SalesBot parado neste grupo."
            : `SalesBot parado (${result.stopped} execução${result.stopped === 1 ? "" : "ões"}).`
          : isGroup
            ? "Nenhum SalesBot ativo neste grupo."
            : "Nenhum SalesBot ativo neste lead.",
      );
      await refreshAutomation();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao parar SalesBot."),
  });
  const stopAgentMut = useMutation({
    mutationFn: () => stopAgent({ data: { leadId } }),
    onSuccess: async () => {
      toast.success("Agente IA parado para este lead.");
      await refreshAutomation();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao parar Agente IA."),
  });

  const busy = botMut.isPending || agentMut.isPending || stopBotMut.isPending || stopAgentMut.isPending;

  if (!composerNode) return null;

  return createPortal(
    <div data-inbox-lead-actions="composer" className="relative order-first flex shrink-0 items-center">
      {panel && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {panel === "salesbot" ? <Send className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
              {panel === "salesbot" ? "Enviar SalesBot" : "Enviar Agente IA"}
            </div>
            <button type="button" onClick={() => setPanel(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {panel === "salesbot" ? (
              botsQ.isLoading ? (
                <Loading />
              ) : bots.length ? (
                bots.map((bot) => (
                  <button key={bot.id} type="button" disabled={busy} onClick={() => botMut.mutate(bot.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50">
                    <span className="truncate font-medium">{bot.name}</span>
                    <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
                  </button>
                ))
              ) : (
                <Empty text={isGroup ? "Nenhum SalesBot de grupo ativo neste workspace." : "Nenhum SalesBot ativo neste workspace."} />
              )
            ) : agentsQ.isLoading ? (
              <Loading />
            ) : agents.length ? (
              agents.map((agent) => (
                <button key={agent.id} type="button" disabled={busy} onClick={() => agentMut.mutate(agent.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50">
                  <span className="truncate font-medium">{agent.name}</span>
                  <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
                </button>
              ))
            ) : (
              <Empty text="Nenhum Agente IA ativo neste workspace." />
            )}
          </div>
        </div>
      )}

      <div className="flex h-9 items-center gap-0.5">
        <button type="button" disabled={busy || !targetResolved} onClick={() => setPanel((current) => current === "salesbot" ? null : "salesbot")} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50" title={isGroup ? "Enviar SalesBot para este grupo" : "Enviar SalesBot para este lead"}>
          <Send className="h-3.5 w-3.5 text-primary" />
          <span className="hidden xl:inline">SalesBot</span>
        </button>
        {salesbotActive && (
          <button type="button" disabled={busy} onClick={() => stopBotMut.mutate()} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50" title={isGroup ? "Parar SalesBot deste grupo" : "Parar SalesBot deste lead"} aria-label="Parar SalesBot">
            <Square className="h-3.5 w-3.5" />
          </button>
        )}
        {!isGroup && (
          <button type="button" disabled={busy || !targetResolved} onClick={() => setPanel((current) => current === "agent" ? null : "agent")} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50" title="Enviar Agente IA para este lead">
            <Bot className="h-3.5 w-3.5 text-primary" />
            <span className="hidden xl:inline">Agente IA</span>
          </button>
        )}
        {agentActive && (
          <button type="button" disabled={busy} onClick={() => stopAgentMut.mutate()} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50" title="Parar Agente IA deste lead" aria-label="Parar Agente IA">
            <Square className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>,
    composerNode,
  );
}

function Loading() {
  return <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-5 text-center text-xs text-muted-foreground">{text}</div>;
}
