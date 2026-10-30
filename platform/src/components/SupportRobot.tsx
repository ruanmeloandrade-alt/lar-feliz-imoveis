import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bot, MessageSquare, Plug, X } from "lucide-react";
import { getSupportRobotContext } from "@/lib/support-robot.functions";
import { AiAgentChat } from "./ai-agent/AiAgentChat";
import { useSlimCopilotUser } from "./ai-agent/useSlimCopilotUser";
import { getSlimErpIdentity } from "@/lib/slim-erp-release.functions";

// SLIM_COPILOT_APPROVAL_UI_V1: canonical widget; the history transform preserves it.

function greetingKey(workspaceId: string) {
  return `Vanessa Simoni:support-greeting:${workspaceId}`;
}

function greetingWasShown(workspaceId: string) {
  try {
    return window.sessionStorage.getItem(greetingKey(workspaceId)) === "1";
  } catch {
    return false;
  }
}

function markGreetingShown(workspaceId: string) {
  try {
    window.sessionStorage.setItem(greetingKey(workspaceId), "1");
  } catch {
    // Sessão sem storage disponível: o estado React ainda evita repetição no mount atual.
  }
}

export function SupportRobot() {
  const authenticatedActorId = useSlimCopilotUser();
  const identify = useServerFn(getSlimErpIdentity);
  const location = useLocation();
  const identity = useQuery({
    queryKey: ["slim-copilot-identity", authenticatedActorId],
    enabled: Boolean(authenticatedActorId),
    queryFn: async () => {
      const current = await identify();
      if (!authenticatedActorId || current.actorId !== authenticatedActorId) {
        throw new Error("A sessão do operador mudou.");
      }
      return current;
    },
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (authenticatedActorId) void identity.refetch();
  }, [location.pathname, authenticatedActorId]);
  if (!authenticatedActorId || identity.error || !identity.isFetchedAfterMount
    || !identity.data || identity.data.actorId !== authenticatedActorId) return null;
  return <ScopedSupportRobot key={identity.data.workspaceId+':'+identity.data.actorId}
    workspaceId={identity.data.workspaceId} actorId={identity.data.actorId} />;
}

function ScopedSupportRobot({ workspaceId, actorId }: { workspaceId: string; actorId: string }) {
  const getContext = useServerFn(getSupportRobotContext);
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [chatWorkspaceId, setChatWorkspaceId] = useState<string | null>(null);
  const contextQuery = useQuery({
    queryKey: ["support-robot-context", workspaceId, actorId],
    queryFn: () => getContext(),
    refetchInterval: isOpen ? 5_000 : 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const ctx = !contextQuery.error && contextQuery.data?.active
    && contextQuery.data.workspaceId===workspaceId && contextQuery.data.actorId===actorId
    ? contextQuery.data : null;
  // Internal navigation preserves the chat; identity changes remount the scoped instance.

  useEffect(() => {
    if (!isOpen || !chatWorkspaceId || !ctx?.active) return;
    if (ctx.workspaceId !== chatWorkspaceId) {
      setIsOpen(false);
      setChatWorkspaceId(null);
      setShowGreeting(false);
    }
  }, [chatWorkspaceId, ctx?.active, ctx?.workspaceId, isOpen]);

  useEffect(() => {
    if (!ctx?.active || ctx.copilotMode !== "implementation" || isOpen || !ctx.workspaceId) return;
    if (greetingWasShown(ctx.workspaceId)) return;
    const timer = window.setTimeout(() => {
      markGreetingShown(ctx.workspaceId);
      setShowGreeting(true);
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [ctx?.active, ctx?.copilotMode, ctx?.workspaceId, isOpen]);

  if (!ctx?.active) return null;
  const implementationMode = ctx.copilotMode === "implementation";
  const pendingCount = ctx.implementationChecklist?.filter((item) => !item.done).length ?? 0;

  const toggleCopilot = async () => {
    if (isOpen) {
      setIsOpen(false);
      setChatWorkspaceId(null);
      setShowGreeting(false);
      return;
    }

    const fresh = await contextQuery.refetch();
    if (fresh.error || !fresh.data?.active || fresh.data.workspaceId !== workspaceId
      || fresh.data.actorId !== actorId) return;
    markGreetingShown(fresh.data.workspaceId);
    setChatWorkspaceId(fresh.data.workspaceId);
    setIsOpen(true);
    setShowGreeting(false);
  };

  return (
    <div className="fixed right-0 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-end gap-2">
      {showGreeting && !isOpen && implementationMode && (
        <div className="mr-2 max-w-[280px] animate-in rounded-2xl border border-border bg-card p-4 shadow-xl fade-in slide-in-from-right-2 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Olá, {ctx.userName}.</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {ctx.hasOpenAI ? `Ainda ${pendingCount === 1 ? "há 1 configuração" : `há ${pendingCount} configurações`} para concluir. Posso te ajudar a finalizar a implementação.` : "Primeiro passo: conecte sua própria chave de IA em Integrações. O Copiloto não usa uma chave compartilhada da Vanessa Simoni."}
              </p>
            </div>
            <button type="button" onClick={() => setShowGreeting(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar mensagem do Copiloto"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {isOpen && chatWorkspaceId && (
        <div className="mr-2 h-[min(640px,calc(100vh-32px))] w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 fade-in duration-200 origin-right">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
                <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-foreground">Copiloto Vanessa Simoni</h3><p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{!ctx.hasOpenAI ? "Conecte sua IA" : implementationMode ? "Finalizando sua implementação" : "Mordomo operacional"}</p></div>
              </div>
              <button type="button" onClick={() => { setIsOpen(false); setChatWorkspaceId(null); }} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Fechar Copiloto"><X className="h-4 w-4" /></button>
            </div>
            {implementationMode && ctx.hasOpenAI && <div className="border-b border-border bg-primary/5 px-4 py-2 text-[10px] leading-4 text-muted-foreground">O Copiloto ajuda a concluir as configurações necessárias para usar a IA nesta empresa.</div>}
            <div className="flex-1 overflow-hidden [&_header]:hidden">
              {ctx.hasOpenAI ? <AiAgentChat workspaceId={chatWorkspaceId} actorId={actorId} module="support_robot" fullscreen hideActions contextPayload={{page:location.pathname,approvalRequired:true}} /> : (
                <div className="flex h-full items-center justify-center p-6"><div className="max-w-[300px] text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Plug className="h-5 w-5" /></div><h4 className="mt-4 text-sm font-semibold text-foreground">Conecte uma IA para ativar o Copiloto</h4><p className="mt-2 text-xs leading-5 text-muted-foreground">O Copiloto usa exclusivamente uma chave deste workspace, como OpenAI ou Gemini. Sem uma chave própria conectada, o chat de IA permanece bloqueado.</p><Link to="/integracoes" onClick={() => { setIsOpen(false); setChatWorkspaceId(null); }} className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"><Plug className="h-3.5 w-3.5" /> Abrir Integrações</Link></div></div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void toggleCopilot()}
        disabled={contextQuery.isFetching && !isOpen}
        className="group relative grid h-12 w-8 place-items-center rounded-l-xl border border-r-0 border-border bg-card text-foreground shadow-lg transition hover:w-9 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
        aria-label={isOpen ? "Fechar Copiloto" : "Abrir Copiloto"}
        title={isOpen ? "Fechar Copiloto" : "Copiloto"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="h-4 w-4 text-muted-foreground" /> : <MessageSquare className="h-4 w-4 text-primary" />}
        {implementationMode && !isOpen && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
      </button>
    </div>
  );
}
