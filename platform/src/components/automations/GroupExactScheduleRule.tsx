import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listGroupSalesbots, listWorkspaceGroups } from "@/lib/whatsapp-groups.functions";
import { listGroupScheduleStatus, saveGroupRulesAndSchedules } from "@/lib/whatsapp-group-schedule.functions";

type GroupRow = {
  id: string;
  session_id: string;
  name: string | null;
  group_jid: string;
  rules: Record<string, unknown> | null;
};

type BotRow = { id: string; nome: string; ativo: boolean };
type SessionRow = { id: string; status: string | null; metadata: Record<string, unknown> | null };
type ScheduleStatus = {
  ruleId: string;
  botId: string;
  scheduledAt: string;
  enabled: boolean;
  runId: string | null;
  runStatus: string | null;
  waitingUntil: string | null;
  updatedAt: string | null;
};

type StoredTrigger = {
  id?: string;
  type?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

function findCentralHeaderTarget(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1"));
  const heading = headings.find((el) => (el.textContent ?? "").trim().includes("Central de Grupos"));
  if (!heading) return null;
  const header = heading.closest<HTMLElement>(".border-b");
  if (!header) return null;
  const children = Array.from(header.children) as HTMLElement[];
  return children[1] ?? header;
}

function toIsoFromLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isConnectedSession(session: SessionRow): boolean {
  const status = String(session.status ?? "").trim().toLowerCase();
  const deleted = session.metadata?.deleted === true;
  return !deleted && ["conectado", "connected", "open"].includes(status);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function scheduleLabel(item: ScheduleStatus): { label: string; ok: boolean } {
  if (!item.runId) {
    if (Date.parse(item.scheduledAt) <= Date.now()) return { label: "Não executado", ok: false };
    return { label: "Não materializado", ok: false };
  }
  if (item.runStatus === "waiting_timer") return { label: "Agendado", ok: true };
  if (["running", "processing"].includes(item.runStatus ?? "")) return { label: "Executando", ok: true };
  if (["completed", "done", "success"].includes(item.runStatus ?? "")) return { label: "Concluído", ok: true };
  if (["failed", "error", "cancelled", "canceled"].includes(item.runStatus ?? "")) return { label: `Falhou (${item.runStatus})`, ok: false };
  return { label: item.runStatus ?? "Sem execução", ok: !!item.runStatus };
}

export function GroupExactScheduleRule() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [botId, setBotId] = useState("");
  const [whenLocal, setWhenLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!cancelled) setWorkspaceId(profile?.current_workspace_id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const refresh = () => setTarget(findCentralHeaderTarget());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const listGroupsFn = useServerFn(listWorkspaceGroups);
  const listBotsFn = useServerFn(listGroupSalesbots);
  const saveFn = useServerFn(saveGroupRulesAndSchedules);
  const listSchedulesFn = useServerFn(listGroupScheduleStatus);

  const groupsQ = useQuery({
    queryKey: ["group-exact-schedule-groups", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await listGroupsFn({ data: { workspaceId: workspaceId! } })) as GroupRow[],
  });

  const sessionsQ = useQuery({
    queryKey: ["group-exact-schedule-sessions", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_web_sessions")
        .select("id, status, metadata")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const botsQ = useQuery({
    queryKey: ["group-exact-schedule-bots", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await listBotsFn({ data: { workspaceId: workspaceId! } })) as BotRow[],
  });

  const activeSessionIds = useMemo(
    () => new Set((sessionsQ.data ?? []).filter(isConnectedSession).map((session) => session.id)),
    [sessionsQ.data],
  );
  const allGroups = groupsQ.data ?? [];
  const groups = useMemo(() => allGroups.filter((group) => activeSessionIds.has(group.session_id)), [allGroups, activeSessionIds]);
  const bots = botsQ.data ?? [];
  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) ?? null, [groups, groupId]);

  useEffect(() => {
    if (!groups.length) {
      if (groupId) setGroupId("");
      return;
    }
    if (!groups.some((group) => group.id === groupId)) setGroupId(groups[0].id);
  }, [groupId, groups]);

  const schedulesQ = useQuery({
    queryKey: ["group-exact-schedule-status", workspaceId, groupId],
    enabled: !!workspaceId && !!groupId,
    queryFn: async () => (await listSchedulesFn({ data: { workspaceId: workspaceId!, groupId } })) as ScheduleStatus[],
    refetchInterval: open ? 10_000 : false,
  });

  if (!target) return null;

  const button = (
    <button
      type="button"
      onClick={() => {
        setSavedMessage(null);
        setOpen(true);
      }}
      className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
      title="Criar regra com data e hora exata"
    >
      <Plus className="h-3.5 w-3.5" /> Nova regra
    </button>
  );

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sticky top-0 bg-card z-10">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-primary" /> Regra agendada do grupo
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Disparo único, isolado no grupo escolhido.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {allGroups.length > 0 && groups.length === 0 && !sessionsQ.isLoading && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Os grupos salvos pertencem a sessões desconectadas ou removidas. Sincronize a sessão WhatsApp conectada antes de criar um agendamento.</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grupo em sessão conectada</label>
            <select
              value={groupId}
              onChange={(e) => {
                setSavedMessage(null);
                setGroupId(e.target.value);
              }}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-xs"
            >
              {groups.length === 0 && <option value="">Nenhum grupo disponível</option>}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name ?? group.group_jid}</option>
              ))}
            </select>
          </div>

          <div className="rounded border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-primary">QUANDO</span>
              <span className="text-xs font-medium">Data e hora exata</span>
            </div>
            <input
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
              className="mt-2 w-full rounded border border-border bg-background px-2 py-2 text-xs"
            />
          </div>

          <div className="rounded border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-emerald-600">ENTÃO</span>
              <span className="text-xs font-medium">Iniciar SalesBot</span>
            </div>
            <select
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              className="mt-2 w-full rounded border border-border bg-background px-2 py-2 text-xs"
            >
              <option value="">Selecionar SalesBot de grupo...</option>
              {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.nome}</option>)}
            </select>
          </div>

          {savedMessage && (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-[11px] text-emerald-700 dark:text-emerald-300 flex gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>{savedMessage}</span>
            </div>
          )}

          {selectedGroup && (
            <div className="rounded border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agendamentos deste grupo</div>
                  <div className="text-[10px] text-muted-foreground">Aqui aparece o estado real salvo no runtime.</div>
                </div>
                <button
                  type="button"
                  onClick={() => schedulesQ.refetch()}
                  disabled={schedulesQ.isFetching}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${schedulesQ.isFetching ? "animate-spin" : ""}`} /> Atualizar
                </button>
              </div>

              {schedulesQ.isLoading && <div className="text-[11px] text-muted-foreground">Carregando agendamentos...</div>}
              {schedulesQ.isError && <div className="text-[11px] text-destructive">Não foi possível consultar os agendamentos.</div>}
              {!schedulesQ.isLoading && (schedulesQ.data ?? []).length === 0 && (
                <div className="text-[11px] text-muted-foreground">Nenhum agendamento configurado neste grupo.</div>
              )}
              <div className="space-y-2">
                {(schedulesQ.data ?? []).map((item) => {
                  const state = scheduleLabel(item);
                  const botName = bots.find((bot) => bot.id === item.botId)?.nome ?? "SalesBot";
                  return (
                    <div key={item.ruleId} className="rounded bg-muted/30 px-3 py-2 text-[11px] flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{botName}</div>
                        <div className="text-muted-foreground">{formatDate(item.scheduledAt)}</div>
                      </div>
                      <span className={state.ok ? "text-emerald-600 font-semibold" : "text-destructive font-semibold"}>{state.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            O SalesBot roda usando o contexto técnico do próprio grupo. Nenhuma pessoa ou cliente do grupo é selecionado como lead do gatilho.
          </p>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded border border-border px-3 py-1.5 text-xs">Fechar</button>
            <button
              type="button"
              disabled={saving || !workspaceId || !selectedGroup || !botId || !whenLocal}
              onClick={async () => {
                if (!workspaceId || !selectedGroup) return;
                setSavedMessage(null);
                const scheduledAt = toIsoFromLocal(whenLocal);
                if (!scheduledAt) {
                  toast.error("Informe uma data e hora válidas.");
                  return;
                }
                if (Date.parse(scheduledAt) <= Date.now()) {
                  toast.error("Escolha uma data e hora futura.");
                  return;
                }
                const current = selectedGroup.rules && typeof selectedGroup.rules === "object" ? selectedGroup.rules : {};
                const triggers = Array.isArray((current as { triggers?: unknown }).triggers)
                  ? ([...(current as { triggers: StoredTrigger[] }).triggers] as StoredTrigger[])
                  : [];
                triggers.push({
                  id: crypto.randomUUID(),
                  type: "schedule",
                  enabled: true,
                  config: { scheduledAt, actionType: "start_bot", botId },
                });
                setSaving(true);
                try {
                  const result = await saveFn({
                    data: {
                      workspaceId,
                      groupId: selectedGroup.id,
                      rules: { ...current, triggers },
                    },
                  });
                  await groupsQ.refetch();
                  await schedulesQ.refetch();
                  const scheduled = Number((result as { scheduled?: number }).scheduled ?? 0);
                  const updated = Number((result as { updated?: number }).updated ?? 0);
                  setSavedMessage(`Salvo e confirmado no runtime. ${scheduled + updated} agendamento(s) ativo(s) sincronizado(s).`);
                  toast.success("Regra salva e agendada com sucesso.");
                  setBotId("");
                  setWhenLocal("");
                } catch (error) {
                  const message = (error as Error).message || "Não foi possível criar o gatilho.";
                  toast.error(message);
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar e agendar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{createPortal(button, target)}{modal}</>;
}
