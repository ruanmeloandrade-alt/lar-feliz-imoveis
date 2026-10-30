import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Play, Square, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveInboxSalesbotTarget } from "@/lib/inbox-group-salesbot.functions";
import { resolveLeadWhatsappIdentity } from "@/lib/inbox-lead-actions.functions";
import { controlInboxAutomation, getInboxAutomationState, type InboxAutomationAction, type InboxAutomationState } from "@/lib/inbox-automation-controls.functions";
import { InboxLeadRouteEnhancements as LegacyGroupControls } from "./InboxLeadRouteEnhancements.legacy";

type Panel = "bots" | "agents" | "runs" | "active-agent" | null;
const labels: Record<string, string> = { queued: "Na fila", pending: "Pendente", running: "Em execução", waiting: "Em espera", waiting_timer: "Aguardando temporizador", waiting_message: "Aguardando resposta", paused: "Pausado" };
const errorText = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" && error.trim() ? error : "Não foi possível consultar as automações.";
// Opaque references survive drawer remounts in this application session, separated by actor and conversation.
const automationRequestIds = new Map<string, string>();
const uncertainAutomationActions = new Map<string, InboxAutomationAction>();
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function automationDeadline<T>(send: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([Promise.resolve().then(send), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("O prazo de resposta terminou. O resultado da operação ainda não foi confirmado.")), 25_000);
    })]);
  } finally { clearTimeout(timer!); }
}
function checkedAutomationResult(value: unknown, action: InboxAutomationAction) {
  const result = value as Record<string, unknown> | null;
  if (!result || result.ok !== true) throw new Error("O servidor não confirmou a alteração.");
  if (action.action === "start-bot" && (!uuid(result.runId) || typeof result.status !== "string" || !result.status.trim())) throw new Error("Comprovante do SalesBot incompleto.");
  if (action.action === "stop-bot" && (result.runId !== action.runId || typeof result.stopped !== "boolean")) throw new Error("Comprovante de encerramento do SalesBot inválido.");
  if ((action.action === "start-agent" || action.action === "stop-agent") && (result.agentId !== action.agentId || !Number.isSafeInteger(result.version) || Number(result.version) < 0)) throw new Error("Comprovante do Agente IA inválido.");
}

export function InboxLeadRouteEnhancements({ leadId }: { leadId: string }) {
  const resolve = useServerFn(resolveInboxSalesbotTarget);
  const client = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        client.removeQueries({ queryKey: ["inbox", "automation-v2"] });
        setEpoch((value) => value + 1);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  const target = useQuery({
    queryKey: ["inbox", "automation-v2", "target", leadId, epoch],
    queryFn: () => resolve({ data: { conversationId: leadId } }),
    staleTime: 0, retry: 1, refetchInterval: 15_000,
  });
  const resolved = target.data as { kind: "lead" | "group"; workspaceId?: string; userId?: string } | undefined;
  if (!resolved) return <AutomationTargetFeedback leadId={leadId} error={target.error}
    reload={() => { void target.refetch(); }} />;
  if (resolved?.kind === "group") return <LegacyGroupControls key={`group:${leadId}`} leadId={leadId} />;
  return <ClientAutomationControls key={`${leadId}:${resolved?.workspaceId ?? "loading"}:${resolved?.userId ?? "loading"}:${epoch}`}
    leadId={leadId} workspaceId={resolved?.workspaceId ?? null} actorId={resolved?.userId ?? null} targetError={target.error}
    reloadTarget={() => { void target.refetch(); }} />;
}

function AutomationTargetFeedback({ leadId, error, reload }: {
  leadId: string; error: unknown; reload: () => void;
}) {
  const [composer, setComposer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const locate = () => {
      const parent = document.querySelector('[data-chat-surface] input[type="file"][accept*="application/pdf"]')?.parentElement;
      setComposer((old) => old === parent ? old : parent instanceof HTMLElement ? parent : null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [leadId]);
  if (!composer) return null;
  return createPortal(<div data-inbox-lead-actions="composer" className="order-first flex items-center gap-2 text-[11px]">
    {error ? <><span role="alert" className="text-destructive">{errorText(error)}</span>
      <button type="button" className="shrink-0 underline" onClick={reload}>Tentar novamente</button></>
      : <span role="status" className="text-muted-foreground">Carregando automações da conversa...</span>}
  </div>, composer);
}

export function ClientAutomationControls({ leadId, workspaceId, actorId, targetError, reloadTarget = () => {}, inline = false, disabled = false, onPendingChange }: {
  leadId: string; workspaceId: string | null; actorId: string | null; targetError?: unknown; reloadTarget?: () => void;
  inline?: boolean; disabled?: boolean; onPendingChange?: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const readState = useServerFn(getInboxAutomationState);
  const control = useServerFn(controlInboxAutomation);
  const identity = useServerFn(resolveLeadWhatsappIdentity);
  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState<HTMLElement | null>(null);
  const busyRef = useRef(false), live = useRef(false);
  const scope = `${workspaceId}:${actorId}:${leadId}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const pendingCallback = useRef(onPendingChange); pendingCallback.current = onPendingChange;
  const [ready, setReady] = useState(false), [contextError, setContextError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<InboxAutomationAction | null>(() => uncertainAutomationActions.get(scope) ?? null);
  const [checked, setChecked] = useState(false), [checking, setChecking] = useState(false), [inspection, setInspection] = useState("");
  const current = () => live.current && scopeRef.current === scope;
  const pending = (value: boolean) => { busyRef.current = value; if (current()) pendingCallback.current?.(value); };
  const key = useMemo(() => ["inbox", "automation-v2", workspaceId, leadId, "state", actorId], [workspaceId, leadId, actorId]);
  useEffect(() => {
    live.current = true; busyRef.current = false; setReady(false); setContextError(null); setPanel(null);
    setUncertain(uncertainAutomationActions.get(scope) ?? null); setChecked(false); setChecking(false); setInspection("");
    let events = 0;
    const observe = (id: string | null) => {
      if (!current()) return;
      if (!uuid(workspaceId) || !uuid(actorId) || !uuid(leadId) || id !== actorId) {
        setReady(false); setContextError("A sessão ou a conversa mudou. Reabra os controles no contexto atual."); setPanel(null); live.current = false; return;
      }
      setReady(true);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { events++; observe(session?.user.id ?? null); });
    const before = events;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!current() || before !== events) return;
      if (error) throw error; observe(data.session?.user.id ?? null);
    }).catch(() => { if (current()) { setContextError("Não foi possível conferir a sessão. Reabra os controles."); live.current = false; } });
    return () => { live.current = false; data.subscription.unsubscribe(); };
  }, [scope]);
  async function loadState(): Promise<InboxAutomationState> {
    const result = await automationDeadline(() => readState({ data: { workspaceId: workspaceId!, leadId } }));
    if (!current() || result.workspaceId !== workspaceId || result.leadId !== leadId) throw new Error("Estado de outra conversa ou sessão. Reabra os controles.");
    return result;
  }
  const stateQ = useQuery({ queryKey: key, queryFn: loadState,
    enabled: ready, retry: false, staleTime: 0, refetchInterval: ready ? 5_000 : false,
  });
  const state = stateQ.data;
  const failure = contextError || targetError || stateQ.error;

  useEffect(() => {
    if (inline) return;
    const locate = () => {
      const input = document.querySelector('[data-chat-surface] input[type="file"][accept*="application/pdf"]');
      const parent = input?.parentElement;
      setComposer((old) => old === parent ? old : parent instanceof HTMLElement ? parent : null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [leadId, inline]);

  // The shared message mapper also filters snapshots and older pages; keep the legacy cache cleanup.
  useEffect(() => {
    if (inline) return;
    const sanitize = () => {
      for (const q of queryClient.getQueryCache().findAll({ queryKey: ["inbox", "activities", leadId] })) {
        const current = q.state.data as any;
        if (!Array.isArray(current?.activities)) continue;
        const activities = current.activities.filter((a: any) => a.type !== "conversation_read");
        if (activities.length !== current.activities.length) queryClient.setQueryData(q.queryKey, { ...current, activities });
      }
    };
    sanitize();
    return queryClient.getQueryCache().subscribe((event) => {
      const k = event?.query?.queryKey;
      if (k?.[0] === "inbox" && k[1] === "activities" && k[2] === leadId) sanitize();
    });
  }, [queryClient, leadId, inline]);

  useQuery({ queryKey: ["inbox", "whatsapp-identity", leadId, workspaceId],
    queryFn: async () => {
      const result = await identity({ data: { leadId } });
      if (result.phone) void queryClient.invalidateQueries({ queryKey: ["inbox", "detail", leadId] });
      return result;
    }, enabled: ready && !inline, staleTime: 300_000, retry: 1,
  });

  useEffect(() => {
    if (!workspaceId || !ready) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: key }); };
    const realtime = supabase.channel(`slim-inbox-controls:${workspaceId}:${leadId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "salesbot_runs", filter: `lead_id=eq.${leadId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads", filter: `id=eq.${leadId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "salesbots", filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_ai_agents", filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    return () => { void supabase.removeChannel(realtime); };
  }, [workspaceId, leadId, queryClient, key, ready]);

  useEffect(() => {
    if (!panel || inline) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panel, inline]);

  const mutation = useMutation({
    retry: false,
    mutationFn: async ({ action, scope: dispatchedScope }: { action: InboxAutomationAction; scope: string }) => {
      const result = await automationDeadline(() => {
        if (!current() || dispatchedScope !== scope) throw new Error("A sessão mudou antes da operação. Reabra os controles.");
        return control({ data: action });
      });
      checkedAutomationResult(result, action);
      return result;
    },
    onSuccess: (result, { action, scope: dispatchedScope }) => {
      if (!current() || dispatchedScope !== scope) return;
      if (uncertainAutomationActions.get(scope) === action) uncertainAutomationActions.delete(scope);
      if (action.action === "start-bot" && automationRequestIds.get(`${scope}:${action.botId}`) === action.requestId) automationRequestIds.delete(`${scope}:${action.botId}`);
      setUncertain(null); setChecked(false); setInspection("");
      toast.success(action.action === "start-bot" ? (result.reused ? "Este SalesBot já foi iniciado nesta conversa." : "SalesBot registrado na fila desta conversa.")
        : action.action === "stop-bot" ? "Execução encerrada nesta conversa."
        : action.action === "start-agent" ? "Agente IA selecionado para as próximas mensagens desta conversa."
        : "Agente IA encerrado nesta conversa.");
      setPanel(null);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["inbox", "activities", leadId] }),
        queryClient.invalidateQueries({ queryKey: ["inbox", "detail", leadId] }),
      ]);
    },
    onError: (error, { action, scope: dispatchedScope }) => {
      if (!current() || dispatchedScope !== scope) return;
      setUncertain(action); setChecked(false); setInspection("");
      toast.error(`${errorText(error)} Consulte o estado antes de agir novamente.`);
    },
    onSettled: (_result, _error, command) => { if (current() && command.scope === scope) pending(false); },
  });
  function act(action: InboxAutomationAction) {
    if (!current() || !ready || busyRef.current || disabled || failure || !state || (uncertain && !checked)) return;
    pending(true); setChecked(false); setInspection("");
    uncertainAutomationActions.set(scope, action);
    mutation.mutate({ action, scope });
  }
  function open(next: Panel) { setSearch(""); setPanel((old) => old === next ? null : next); if (ready) void stateQ.refetch(); else reloadTarget(); }
  function startBot(botId: string) {
    if (!workspaceId || !actorId) return;
    const requestKey = `${scope}:${botId}`;
    let requestId = automationRequestIds.get(requestKey);
    if (!requestId) { requestId = crypto.randomUUID(); automationRequestIds.set(requestKey, requestId); }
    act({ action: "start-bot", workspaceId, leadId, botId, requestId });
  }
  async function inspectState() {
    if (!ready || !current() || busyRef.current || disabled) return;
    pending(true); setChecking(true); setInspection(""); setChecked(false);
    try {
      const result = await loadState();
      if (!current()) return;
      queryClient.setQueryData(key, result); setChecked(true);
      setInspection("Estado atualizado. A consulta não reenviou a ação. Uma execução pode já ter terminado; não aparecer como ativa não prova que a tentativa deixou de acontecer.");
    } catch (error) { if (current()) setInspection(errorText(error)); }
    finally { if (current()) { pending(false); setChecking(false); } }
  }
  const busy = mutation.isPending || checking;
  const actionBlocked = busy || disabled || !ready || Boolean(failure) || Boolean(uncertain && !checked);
  const runs = state?.runs ?? [];
  const agent = state?.activeAgent;
  const title = panel === "bots" ? "Escolher SalesBot" : panel === "agents" ? "Escolher Agente IA" : panel === "runs" ? "Encerrar um SalesBot" : "Encerrar Agente IA";
  const filter = (row: { name: string }) => row.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
  const choices = panel === "bots" ? state?.bots ?? [] : state?.agents ?? [];
  const buttonStyle = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold hover:bg-white/10 disabled:opacity-50";

  if (!inline && !composer) return null;
  const content = <div data-inbox-lead-actions={inline ? "inline" : "composer"} className="relative order-first flex min-w-0 shrink-0 flex-wrap items-center gap-2 text-foreground"
    onKeyDownCapture={inline ? (event) => { if (panel && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPanel(null); } } : undefined}>
    <div className="flex items-center gap-0.5">
      <button type="button" className={buttonStyle} disabled={busy || disabled || !ready} onClick={() => open("bots")} aria-label="Escolher SalesBot"><Play className="h-3.5 w-3.5 text-primary" /><span className={inline ? undefined : "hidden sm:inline"}>SalesBot</span></button>
      {runs.length > 0 && <button type="button" className={`${buttonStyle} text-destructive`} disabled={busy || disabled || !ready} onClick={() => open("runs")} aria-label="Encerrar bot" title="Escolher execução para encerrar"><Square className="h-3.5 w-3.5" />{runs.length}</button>}
      <button type="button" className={buttonStyle} disabled={busy || disabled || !ready} onClick={() => open("agents")} aria-label="Escolher Agente IA"><Bot className="h-3.5 w-3.5 text-primary" /><span className={inline ? undefined : "hidden sm:inline"}>Agente IA</span></button>
      {agent && <button type="button" className={`${buttonStyle} text-destructive`} disabled={busy || disabled || !ready} onClick={() => open("active-agent")} aria-label="Encerrar Agente IA" title={`Encerrar ${agent.name} nesta conversa`}><Square className="h-3.5 w-3.5" /></button>}
      {busy && <Loader2 aria-label="Processando" className="h-3.5 w-3.5 animate-spin" />}
      {!!failure && <span role="status" className="text-[10px] text-destructive" title={errorText(failure)}>Falha ao consultar</span>}
    </div>
    {uncertain && <div role="status" className="basis-full space-y-1 text-xs text-amber-600 dark:text-amber-300">
      <p>Resultado da última ação não confirmado. Consulte o estado antes de agir novamente.</p>
      <button type="button" className="font-semibold underline disabled:opacity-50" disabled={busy || disabled || !ready} onClick={() => void inspectState()}>{checking ? "Consultando..." : "Consultar estado sem reenviar"}</button>
      {inspection && <p>{inspection}</p>}
    </div>}
    {panel && <>
      <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Fechar seletor" onClick={() => setPanel(null)} />
      <section role="dialog" aria-label={title} className={`absolute left-0 z-50 w-[min(340px,calc(100vw-24px))] rounded-xl border border-border bg-card text-card-foreground shadow-2xl ${inline ? "top-full mt-2" : "bottom-full mb-2"}`}>
        <header className="flex items-center justify-between border-b border-border p-3"><strong className="text-xs">{title}</strong><button type="button" aria-label="Fechar" onClick={() => setPanel(null)}><X className="h-4 w-4" /></button></header>
        <div className="px-3 pt-2 text-xs text-muted-foreground">{panel === "bots" ? "Ao iniciar, o SalesBot pode enviar mensagens e executar o fluxo salvo para este cliente." : panel === "agents" ? "Ao iniciar, o agente passa a atender as próximas mensagens deste cliente." : "Encerra somente nesta conversa. Não desativa a automação na empresa."}</div>
        {state?.lastRunError && <p role="alert" className="px-3 pt-2 text-xs text-destructive">Última execução: {state.lastRunError}</p>}
        {!!failure ? <div role="alert" className="p-3 text-xs"><p>{errorText(failure)}</p><button type="button" className="mt-2 text-primary underline" onClick={() => { reloadTarget(); if (workspaceId) void stateQ.refetch(); }}>Tentar novamente</button></div>
          : !state ? <div className="flex items-center gap-2 p-4 text-xs"><Loader2 className="h-4 w-4 animate-spin" />Carregando automações...</div>
          : <>
            {(panel === "bots" || panel === "agents") && <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pelo nome" aria-label="Buscar automação" className="m-2 h-9 w-[calc(100%-16px)] rounded-md border border-border bg-background px-3 text-xs" />}
            <div className="max-h-64 overflow-y-auto p-2">
              {(panel === "bots" || panel === "agents") && <>
                {panel === "agents" && agent && !agent.paused && <p className="px-2 py-2 text-xs text-muted-foreground">{agent.name} está atendendo. Encerre esse agente antes de escolher outro.</p>}
                {choices.filter(filter).map((row) => {
                  const already = panel === "bots" ? runs.some((run) => run.botId === row.id) : agent?.id === row.id && !agent.paused;
                  const unavailable = panel === "agents" && !!agent && !agent.paused;
                  return <button type="button" key={row.id} disabled={actionBlocked || already || unavailable} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-xs hover:bg-muted disabled:opacity-50" onClick={() => panel === "bots" ? startBot(row.id) : act({ action: "start-agent", workspaceId: workspaceId!, leadId, agentId: row.id })}>
                    <span className="min-w-0 break-words font-medium">{row.name}</span><span className="shrink-0 text-primary">{already ? "Em execução" : "Iniciar"}</span>
                  </button>;
                })}
                {!choices.filter(filter).length && <p className="p-3 text-xs text-muted-foreground">{search ? "Nenhum resultado para a busca." : panel === "bots" ? "Nenhum SalesBot individual ativo. Salve e ative um bot na Central de Automações." : "Nenhum Agente IA ativo cadastrado. Cadastre e habilite um agente na Central de Automações."}</p>}
              </>}
              {panel === "runs" && (runs.length ? runs.map((run) => <div key={run.id} className="flex items-center justify-between gap-3 rounded-lg p-3 text-xs">
                <div className="min-w-0"><strong className="break-words">{run.name}</strong><p className="mt-1 text-[10px] text-muted-foreground">{labels[run.status] ?? run.status}</p></div>
                <button type="button" disabled={actionBlocked} className="shrink-0 rounded border border-destructive/40 px-2 py-1.5 text-destructive disabled:opacity-50" onClick={() => act({ action: "stop-bot", workspaceId: workspaceId!, leadId, runId: run.id })}>Encerrar</button>
              </div>) : <p className="p-3 text-xs text-muted-foreground">Nenhum SalesBot em execução nesta conversa.</p>)}
              {panel === "active-agent" && (agent ? <div className="flex items-center justify-between gap-3 p-3 text-xs"><div className="min-w-0"><strong className="break-words">{agent.name}</strong><p className="mt-1 text-[10px] text-muted-foreground">{agent.paused ? "Pausado" : "Atendendo nesta conversa"}</p></div><button type="button" disabled={actionBlocked} className="shrink-0 rounded border border-destructive/40 px-2 py-1.5 text-destructive disabled:opacity-50" onClick={() => act({ action: "stop-agent", workspaceId: workspaceId!, leadId, agentId: agent.id, version: agent.version })}>Encerrar</button></div> : <p className="p-3 text-xs text-muted-foreground">Nenhum Agente IA vinculado a esta conversa.</p>)}
            </div>
          </>}
      </section>
    </>}
  </div>;
  return inline ? content : createPortal(content, composer!);
}
