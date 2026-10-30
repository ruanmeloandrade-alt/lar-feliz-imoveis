import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Download, Loader2, Pencil, Power, RefreshCw, Settings2, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  exportGroupSalesbot,
  importGroupSalesbot,
  listGroupSalesbotSessions,
  listGroupSalesbotsForManagement,
  renameGroupSalesbot,
  setGroupSalesbotActive,
  stopGroupSalesbotRun,
  type GroupSalesbotManageRow,
  type GroupSalesbotSessionRow,
} from "@/lib/group-salesbot-management.functions";

type Target = { element: HTMLElement; botId: string };

function discoverGroupCreateLink(): HTMLAnchorElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLAnchorElement>('a[href*="escopo=grupo"][href*="novo=1"]');
}

function discoverTargets(): Target[] {
  const groupCreateLink = discoverGroupCreateLink();
  if (!groupCreateLink) return [];

  const central = groupCreateLink.closest<HTMLElement>(".rounded-lg.border") ?? groupCreateLink.parentElement?.parentElement;
  if (!central) return [];

  return Array.from(central.querySelectorAll<HTMLButtonElement>('button[title="Duplicar bot"]'))
    .map((button) => ({ element: button.parentElement as HTMLElement | null, botId: button.closest<HTMLElement>('[data-slim-group-bot-id]')?.dataset.slimGroupBotId ?? '' }))
    .filter((item): item is Target => !!item.element && !!item.botId);
}

function discoverToolbarHost(): HTMLElement | null {
  return discoverGroupCreateLink()?.parentElement ?? null;
}

function discoverBuilderActivationHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const label = Array.from(document.querySelectorAll<HTMLElement>("span"))
    .find((node) => node.textContent?.trim() === "Robô Ativo");
  return label?.parentElement ?? null;
}

function sameTargets(a: Target[], b: Target[]): boolean {
  return a.length === b.length && a.every((item, index) => item.element === b[index]?.element && item.botId === b[index]?.botId);
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || "salesbot-grupo";
}

function statusLabel(status: GroupSalesbotSessionRow["status"]): string {
  if (status === "running") return "Executando";
  if (status === "waiting_message") return "Aguardando mensagem";
  return "Aguardando horário";
}

export function GroupBotActionsEnhancer() {
  const listFn = useServerFn(listGroupSalesbotsForManagement);
  const renameFn = useServerFn(renameGroupSalesbot);
  const activeFn = useServerFn(setGroupSalesbotActive);
  const exportFn = useServerFn(exportGroupSalesbot);
  const importFn = useServerFn(importGroupSalesbot);
  const sessionsFn = useServerFn(listGroupSalesbotSessions);
  const stopFn = useServerFn(stopGroupSalesbotRun);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [builderHost, setBuilderHost] = useState<HTMLElement | null>(null);
  const [bots, setBots] = useState<GroupSalesbotManageRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [sessionBot, setSessionBot] = useState<GroupSalesbotManageRow | null>(null);
  const [sessions, setSessions] = useState<GroupSalesbotSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const [initialBuilderBotKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("bot");
  });

  const refreshBots = useCallback(async () => {
    try {
      const result = (await listFn()) as unknown as { bots: GroupSalesbotManageRow[] };
      setBots(Array.isArray(result?.bots) ? result.bots : []);
    } catch {
      setBots([]);
    }
  }, [listFn]);

  const refreshSessions = useCallback(async (bot: GroupSalesbotManageRow) => {
    setSessionsLoading(true);
    try {
      const result = (await sessionsFn({ data: { botId: bot.id } })) as unknown as { sessions: GroupSalesbotSessionRow[] };
      setSessions(Array.isArray(result?.sessions) ? result.sessions : []);
    } catch (error) {
      setSessions([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as sessões do bot.");
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionsFn]);

  useEffect(() => {
    void refreshBots();
  }, [refreshBots]);

  useEffect(() => {
    const refreshTargets = () => {
      const next = discoverTargets();
      setTargets((current) => (sameTargets(current, next) ? current : next));
      setToolbarHost((current) => {
        const nextHost = discoverToolbarHost();
        return current === nextHost ? current : nextHost;
      });
      setBuilderHost((current) => {
        const nextHost = discoverBuilderActivationHost();
        return current === nextHost ? current : nextHost;
      });
    };
    refreshTargets();
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    const observer = new MutationObserver(refreshTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sessionBot) void refreshSessions(sessionBot);
  }, [refreshSessions, sessionBot]);

  const mapped = useMemo(
    () => targets.map((target) => ({ target, bot: bots.find(bot => bot.id === target.botId) })).filter((item) => !!item.bot),
    [targets, bots],
  );

  const currentBuilderBot = useMemo(() => {
    if (!initialBuilderBotKey) return null;
    return bots.find((bot) => bot.localId === initialBuilderBotKey || bot.id === initialBuilderBotKey) ?? null;
  }, [bots, initialBuilderBotKey]);

  useEffect(() => {
    if (!builderHost || !currentBuilderBot) return;
    const originalSwitch = builderHost.querySelector<HTMLElement>('button[role="switch"]');
    if (!originalSwitch) return;
    const previousDisplay = originalSwitch.style.display;
    originalSwitch.style.display = "none";
    return () => {
      originalSwitch.style.display = previousDisplay;
    };
  }, [builderHost, currentBuilderBot]);

  const toggleActive = useCallback(async (bot: GroupSalesbotManageRow) => {
    setBusyId(bot.id);
    try {
      const result = (await activeFn({ data: { id: bot.id, active: !bot.ativo } })) as unknown as { active?: boolean };
      const active = result?.active === true;
      toast.success(active ? "Bot ativado." : "Bot pausado.");
      await refreshBots();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status do bot.");
    } finally {
      setBusyId(null);
    }
  }, [activeFn, refreshBots]);

  const importSelectedFile = useCallback(async (file: File) => {
    setImporting(true);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new Error("O arquivo não contém um JSON válido.");
      }
      const result = (await importFn({ data: { payload } })) as unknown as { name?: string };
      toast.success(`Bot importado${result?.name ? `: ${result.name}` : "."}`);
      await refreshBots();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o bot.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [importFn, refreshBots]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importSelectedFile(file);
        }}
      />

      {toolbarHost && createPortal(
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
          title="Importar SalesBot de grupo de um arquivo JSON"
        >
          {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Importar bot
        </button>,
        toolbarHost,
        "group-bot-import",
      )}

      {mapped.map(({ target, bot }) =>
        createPortal(
          <>
            <button
              type="button"
              className={bot.ativo ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground hover:text-foreground"}
              title={bot.ativo ? "Pausar bot" : "Ativar bot"}
              disabled={busyId === bot.id}
              onClick={() => void toggleActive(bot)}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Sessões abertas"
              onClick={() => setSessionBot(bot)}
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Editar bot"
              onClick={() => {
                window.location.href = `/crm/automacoes?bot=${encodeURIComponent(bot.localId)}`;
              }}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Renomear bot"
              onClick={async () => {
                const next = window.prompt("Novo nome do bot:", bot.nome)?.trim();
                if (!next || next === bot.nome) return;
                try {
                  await renameFn({ data: { id: bot.id, name: next } });
                  toast.success("Nome atualizado.");
                  await refreshBots();
                  window.location.reload();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível renomear o bot.");
                }
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Baixar bot"
              disabled={busyId === bot.id}
              onClick={async () => {
                setBusyId(bot.id);
                try {
                  const payload = await exportFn({ data: { id: bot.id } });
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `${safeFileName(bot.nome)}.json`;
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(url);
                  toast.success("Bot baixado.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível baixar o bot.");
                } finally {
                  setBusyId(null);
                }
              }}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </>,
          target.element,
          `group-bot-actions-${bot.id}`,
        ),
      )}

      {builderHost && currentBuilderBot && createPortal(
        <button
          type="button"
          role="switch"
          aria-checked={currentBuilderBot.ativo}
          title={currentBuilderBot.ativo ? "Pausar bot" : "Ativar bot"}
          disabled={busyId === currentBuilderBot.id}
          onClick={() => void toggleActive(currentBuilderBot)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${currentBuilderBot.ativo ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
        >
          <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform ${currentBuilderBot.ativo ? "translate-x-4" : "translate-x-0"}`} />
        </button>,
        builderHost,
        `group-builder-active-${currentBuilderBot.id}`,
      )}

      {sessionBot && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onMouseDown={() => setSessionBot(null)}>
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Sessões abertas · {sessionBot.nome}</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Veja em quais grupos este bot está ativo e encerre uma execução sem excluir o bot.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Atualizar sessões"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  disabled={sessionsLoading}
                  onClick={() => void refreshSessions(sessionBot)}
                >
                  <RefreshCw className={`w-4 h-4 ${sessionsLoading ? "animate-spin" : ""}`} />
                </button>
                <button type="button" title="Fechar" className="text-muted-foreground hover:text-foreground" onClick={() => setSessionBot(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {sessionsLoading ? (
                <div className="py-10 text-center text-xs text-muted-foreground"><Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />Carregando sessões...</div>
              ) : sessions.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">Nenhuma sessão ativa deste bot em grupos.</div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div key={session.runId} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-foreground">{session.groupName}</div>
                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{session.groupJid}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5">{statusLabel(session.status)}</span>
                          {session.waitingUntil && (
                            <span>Horário: {new Date(session.waitingUntil).toLocaleString("pt-BR")}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded border border-destructive/40 px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        disabled={stoppingRunId === session.runId}
                        onClick={async () => {
                          setStoppingRunId(session.runId);
                          try {
                            await stopFn({ data: { runId: session.runId } });
                            toast.success("Execução do bot encerrada neste grupo.");
                            await refreshSessions(sessionBot);
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Não foi possível parar esta execução.");
                          } finally {
                            setStoppingRunId(null);
                          }
                        }}
                      >
                        {stoppingRunId === session.runId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                        Parar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
