import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Play,
  Pause,
  Check,
  X as XIcon,
  Plus,
  Trash2,
  Settings2,
  MessageSquare,
  CheckSquare,
  Clock,
  Workflow as WorkflowIcon,
  BarChart3,
  UserCircle,
  AlertTriangle,
  RotateCcw,
  Send,
  Zap,
  Link2,
  KeyRound,
  Eye,
  EyeOff,
  ExternalLink,
  Flame,
  TimerOff,
  Hourglass,
  Bell,
  Users,
  Layers,
  MoveRight,
  UserPlus,
  UserMinus,
  Shield,
  ArrowUp,
  ArrowLeft,
  Tag,
  MessageCircle,
  CalendarClock,
  Search,
  ChevronRight,
  Trophy,
  Crown,
  Medal,
  Award,
  Gift,
  History as HistoryIcon,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { EmployeeOfMonthView } from "@/components/workflow/EmployeeOfMonthView";
import {
  getWorkflowBoard,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  createTask,
  updateTask,
  deleteTask,
  startTaskTimer,
  stopTaskTimer,
  completeTask,
  markTaskIncomplete,
  submitTaskForReview,
  getReviewSettings,
  setReviewSettings,
  reopenTask,
  getTaskDetail,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  addComment,
  getWorkflowMetrics,
  listAutomations,
  listAutomationRuns,

  saveAutomation,
  deleteAutomation,
  listSectors,
  saveSector,
  deleteSector,
  createPipeline,
  updatePipeline,
  deletePipeline,
  listPendingReviews,
  approveTaskReview,
  returnTaskReview,
  searchTaskHistory,
  type WorkflowBoard,
  type WorkflowTaskLite,
  type WorkflowAutomation,
  type WorkflowSector,
  type PendingReviewTask,
  type HistoryTask,
  listNotifications,
  markNotificationRead,
} from "@/lib/workflow.functions";
import { listInternalMessages, markInternalMessageRead } from "@/lib/internal-messages.functions";

import { cn } from "@/lib/utils";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { toast } from "sonner";


export const Route = createFileRoute("/fluxo-trabalho")({
  head: () => ({
    meta: [
      { title: "Fluxo de Trabalho · Vanessa Simoni" },
      { name: "description", content: "CRM interno de tarefas: pipeline configurável, cronômetro por tarefa e métricas por funcionário." },
    ],
  }),
  component: FluxoTrabalhoPage,
});

const PRIORITY_META: Record<WorkflowTaskLite["priority"], { label: string; color: string; bg: string }> = {
  baixa: { label: "Baixa", color: "#64748b", bg: "bg-slate-100 text-slate-700" },
  media: { label: "Média", color: "#10b981", bg: "bg-emerald-100 text-emerald-700" },
  alta: { label: "Alta", color: "#f59e0b", bg: "bg-amber-100 text-amber-700" },
  urgente: { label: "Urgente", color: "#ef4444", bg: "bg-red-100 text-red-700" },
};

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(rem).padStart(2, "0")}s`;
  return `${rem}s`;
}

function FluxoTrabalhoPage() {
  const [tab, setTab] = useState<"board" | "metrics" | "reviews" | "history" | "ranking">("board");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newTaskStage, setNewTaskStage] = useState<string | null>(null);

  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const [pipelinesOpen, setPipelinesOpen] = useState(false);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  // NEW: inline "Automatize" edit mode over the actual kanban
  const [editMode, setEditMode] = useState(false);
  // NEW: draft trigger pre-filled with a specific stage (opens AutomationsDialog focused on that stage)
  const [triggerStageDraft, setTriggerStageDraft] = useState<string | null>(null);

  const qc = useQueryClient();
  const loadBoard = useServerFn(getWorkflowBoard);
  const boardQ = useQuery<WorkflowBoard>({
    queryKey: ["workflow-board", pipelineId],
    queryFn: () => loadBoard({ data: pipelineId ? { pipelineId } : {} }),
    refetchInterval: 15_000,
  });
  const board = boardQ.data;
  const canManage = Boolean(board?.canManage);
  const { isSuperAdmin } = useIsSuperAdmin();

  // sync selected pipeline when server returns list
  useEffect(() => {
    if (!board) return;
    if (!pipelineId && board.pipelineId) setPipelineId(board.pipelineId);
    if (pipelineId && !board.pipelines.some((p) => p.id === pipelineId) && board.pipelineId) {
      setPipelineId(board.pipelineId);
    }
  }, [board, pipelineId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["workflow-board"] });

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 pl-16 pr-4 pt-5 pb-3 md:px-6 border-b border-border/60">
          {tab !== "board" ? (
            <header className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTab("board")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar para o fluxo
                </button>
                <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  {tab === "metrics" && <><BarChart3 className="w-4 h-4 text-primary" /> Métricas</>}
                  {tab === "history" && <><HistoryIcon className="w-4 h-4 text-primary" /> Histórico</>}
                  {tab === "ranking" && <><Trophy className="w-4 h-4 text-primary" /> Funcionário do Mês</>}
                  {tab === "reviews" && <>Revisões</>}
                </h1>
              </div>
              <NotificationBell />
            </header>
          ) : (
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <WorkflowIcon className="w-5 h-5 text-primary" />
                Fluxo de Trabalho
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                CRM interno: distribua tarefas, cronometre o tempo de execução e acompanhe a performance do time.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Pipeline selector */}
              {board && board.pipelines.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Fluxo</label>
                  <select
                    value={pipelineId ?? board.pipelineId}
                    onChange={(e) => setPipelineId(e.target.value)}
                    className="text-sm rounded-md border border-border bg-background px-2 py-1.5 min-w-[180px]"
                  >
                    {board.pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sectorName ? `${p.sectorName} · ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                {canManage && (
                  <button
                    onClick={() => setTab("metrics")}
                    className="px-3 py-1.5 font-medium uppercase tracking-wider transition-colors text-muted-foreground hover:bg-muted"
                  >
                    <BarChart3 className="inline w-3.5 h-3.5 mr-1" /> Métricas
                  </button>
                )}
                <button
                  onClick={() => setTab("reviews")}
                  className="px-3 py-1.5 font-medium uppercase tracking-wider transition-colors inline-flex items-center gap-1 text-muted-foreground hover:bg-muted"
                >
                  <Check className="w-3.5 h-3.5" /> Revisões
                </button>
                {isSuperAdmin && (
                  <button
                    onClick={() => setTab("ranking")}
                    className="px-3 py-1.5 font-medium uppercase tracking-wider transition-colors inline-flex items-center gap-1 text-muted-foreground hover:bg-muted"
                  >
                    <Trophy className="w-3.5 h-3.5" /> 
                    <span className="flex items-center gap-1">
                      Funcionário do Mês
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
                    </span>
                  </button>
                )}
              </div>
              {canManage && (
                <>
                  <button
                    onClick={() => setPipelinesOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
                    title="Criar, editar e organizar fluxos de trabalho"
                  >
                    <Layers className="w-4 h-4" /> Gerenciar fluxos
                  </button>
                  <button
                    onClick={() => setSectorsOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
                  >
                    <UserCircle className="w-4 h-4" /> Setores
                  </button>
                  <button
                    onClick={() => setEditMode((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm",
                      editMode
                        ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                    title={editMode ? "Concluir edição da pipeline" : "Editar etapas e adicionar gatilhos"}
                  >
                    <Zap className="w-4 h-4" />
                    {editMode ? "Concluir edição" : "Automatize"}
                  </button>
                  {editMode && (
                    <button
                      onClick={() => setAutomationsOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
                      title="Ver todas as automações do fluxo"
                    >
                      <Settings2 className="w-4 h-4" /> Automações
                    </button>
                  )}
                </>
              )}
              <MessagesBell />
              <NotificationBell />

            </div>
          </header>
          )}
        </div>


        <div className="flex-1 overflow-hidden px-6 py-4">
          {tab === "board" && (
            <BoardView
              board={board}
              loading={boardQ.isLoading}
              onOpenTask={setOpenTaskId}
              onNewTaskAtStage={setNewTaskStage}
              onRefresh={invalidate}
              onOpenHistory={canManage ? () => setTab("history") : undefined}
              editMode={editMode && canManage}
              onAddTrigger={(stageId) => {
                setTriggerStageDraft(stageId);
                setAutomationsOpen(true);
              }}
            />
          )}
          {tab === "metrics" && canManage && <MetricsView />}
          {tab === "reviews" && (
            <ReviewsView onOpenTask={setOpenTaskId} onRefresh={invalidate} canManage={canManage} />
          )}
          {tab === "history" && canManage && <HistoryView onOpenTask={setOpenTaskId} />}
          {tab === "ranking" && <EmployeeOfMonthView canManage={canManage} />}
        </div>
      </main>

      {openTaskId && (
        <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={invalidate} board={board} />
      )}
      {newTaskStage && board && (
        <NewTaskDialog
          board={board}
          stageId={newTaskStage}
          onClose={() => setNewTaskStage(null)}
          onCreated={() => {
            setNewTaskStage(null);
            invalidate();
          }}
        />
      )}
      {automationsOpen && board && (
        <AutomationsDialog
          board={board}
          initialStageId={triggerStageDraft ?? undefined}
          onClose={() => { setAutomationsOpen(false); setTriggerStageDraft(null); }}
        />
      )}
      {sectorsOpen && (
        <SectorsDialog onClose={() => setSectorsOpen(false)} members={board?.members ?? []} onChanged={invalidate} />
      )}
      {pipelinesOpen && board && (
        <PipelinesDialog board={board} onClose={() => setPipelinesOpen(false)} onChanged={invalidate} />
      )}
    </div>

  );
}

// ==================== BOARD ====================
function BoardView({
  board,
  loading,
  onOpenTask,
  onNewTaskAtStage,
  onRefresh,
  onOpenHistory,
  editMode,
  onAddTrigger,
}: {
  board: WorkflowBoard | undefined;
  loading: boolean;
  onOpenTask: (id: string) => void;
  onNewTaskAtStage: (stageId: string) => void;
  onRefresh: () => void;
  onOpenHistory?: () => void;
  editMode?: boolean;
  onAddTrigger?: (stageId: string) => void;
}) {
  const [tagFilter, setTagFilter] = useState<string>("");
  const [dragStageId, setDragStageId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const createStageFn = useServerFn(createStage);
  const updateStageFn = useServerFn(updateStage);
  const deleteStageFn = useServerFn(deleteStage);
  const reorderStagesFn = useServerFn(reorderStages);
  const listAutoFn = useServerFn(listAutomations);
  const delAutoFn = useServerFn(deleteAutomation);
  const qcBoard = useQueryClient();
  const autoQ = useQuery<WorkflowAutomation[]>({
    queryKey: ["workflow-automations", board?.pipelineId],
    queryFn: () => listAutoFn({ data: { pipelineId: board!.pipelineId } }),
    enabled: Boolean(editMode && board?.pipelineId),
  });
  const automationsByStage = new Map<string, WorkflowAutomation[]>();
  for (const a of autoQ.data ?? []) {
    const sid = (a.trigger?.params?.stageId as string | undefined) ?? "";
    if (!sid) continue;
    const arr = automationsByStage.get(sid) ?? [];
    arr.push(a);
    automationsByStage.set(sid, arr);
  }

  if (loading || !board) {
    return <div className="text-sm text-muted-foreground">Carregando quadro…</div>;
  }
  if (board.stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>
        {board.canManage && (
          <p className="text-xs text-muted-foreground mt-2">
            Clique em <strong>Automatize</strong> e depois no <strong>+</strong> entre as colunas para criar a primeira etapa.
          </p>
        )}
      </div>
    );
  }
  const allTags = Array.from(
    new Set(board.tasks.flatMap((t) => Array.isArray((t as any).tags) ? ((t as any).tags as string[]) : [])),
  ).sort();
  const filteredTasks = tagFilter
    ? board.tasks.filter((t) => {
        const tags = Array.isArray((t as any).tags) ? ((t as any).tags as string[]) : [];
        return tags.includes(tagFilter);
      })
    : board.tasks;
  const tasksByStage = new Map<string, WorkflowTaskLite[]>();
  for (const t of filteredTasks) {
    const list = tasksByStage.get(t.stageId) ?? [];
    list.push(t);
    tasksByStage.set(t.stageId, list);
  }

  const safeRun = async (fn: () => Promise<unknown>) => {
    try { await fn(); onRefresh(); } catch (e: any) { alert(e?.message ?? "Erro"); }
  };

  const handleInsertStageAt = async (index: number) => {
    const name = prompt("Nome da nova etapa:");
    if (!name || !name.trim()) return;
    // Build new order: insert placeholder id "__new__" at index; but createStage doesn't return id here.
    // Simplest: create at end, then reorder.
    try {
      const orderIds = board.stages.map((s) => s.id);
      // Create new stage; server returns its id in some functions, but we call generically then refetch and reorder client-side after refresh.
      // Since createStage return shape isn't guaranteed, we create, then rely on next refresh + a follow-up reorder call the user can do via drag if needed.
      await createStageFn({ data: { pipelineId: board.pipelineId, name: name.trim() } });
      onRefresh();
      // Attempt to reorder: fetch will happen; we can't reliably know new id here without the return value. Users can drag to reposition.
      void orderIds;
      void index;
    } catch (e: any) { alert(e?.message ?? "Erro"); }
  };

  const handleDropStage = async (targetId: string) => {
    if (!dragStageId || dragStageId === targetId) {
      setDragStageId(null); setOverStageId(null); return;
    }
    const orderIds = board.stages.map((s) => s.id);
    const from = orderIds.indexOf(dragStageId);
    const to = orderIds.indexOf(targetId);
    if (from < 0 || to < 0) return;
    orderIds.splice(from, 1);
    orderIds.splice(to, 0, dragStageId);
    setDragStageId(null); setOverStageId(null);
    await safeRun(() => reorderStagesFn({ data: { order: orderIds } }));
  };

  return (
    <div className="flex flex-col h-full gap-2">
      {editMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 text-muted-foreground text-xs">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span>
            <strong>Modo edição:</strong> arraste as colunas para reordenar, use o <strong>+</strong> entre elas para criar nova etapa, e clique em <strong>Adicionar gatilho</strong> no topo de cada etapa.
          </span>
        </div>
      )}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-1">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          <button
            onClick={() => setTagFilter("")}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${tagFilter === "" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
          >
            Todas
          </button>
          {allTags.map((tg) => (
            <button
              key={tg}
              onClick={() => setTagFilter(tg === tagFilter ? "" : tg)}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${tagFilter === tg ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
            >
              #{tg}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto flex-1 pb-2 -mx-1 px-1 items-stretch">
        {editMode && (
          <button
            onClick={() => handleInsertStageAt(0)}
            className="self-stretch flex-shrink-0 w-7 grid place-items-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Inserir etapa aqui"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {board.stages.map((stage, idx) => {
          const list = tasksByStage.get(stage.id) ?? [];
          return (
            <div key={stage.id} className="contents">
              <div
                draggable={!!editMode}
                onDragStart={() => editMode && setDragStageId(stage.id)}
                onDragOver={(e) => { if (!editMode) return; e.preventDefault(); if (overStageId !== stage.id) setOverStageId(stage.id); }}
                onDragLeave={() => setOverStageId((cur) => (cur === stage.id ? null : cur))}
                onDrop={(e) => { if (!editMode) return; e.preventDefault(); handleDropStage(stage.id); }}
                onDragEnd={() => { setDragStageId(null); setOverStageId(null); }}
                className={cn(
                  "group/stage flex-shrink-0 w-[320px] rounded-xl border bg-card/60 flex flex-col h-full transition",
                  editMode ? "border-border ring-1 ring-border" : "border-border",
                  dragStageId === stage.id && "opacity-50",
                  overStageId === stage.id && dragStageId && dragStageId !== stage.id && "ring-2 ring-primary",
                )}
              >
                {editMode && onAddTrigger && (
                  <div className="mx-2 mt-2 space-y-1">
                    {(automationsByStage.get(stage.id) ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background text-[11px]"
                      >
                        <Zap className="w-3 h-3 text-primary shrink-0" />
                        <button
                          onClick={() => onAddTrigger(stage.id)}
                          className="flex-1 min-w-0 truncate text-left hover:underline"
                          title={a.name}
                        >
                          {a.name}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Excluir automação "${a.name}"?`)) return;
                            await delAutoFn({ data: { id: a.id } });
                            qcBoard.invalidateQueries({ queryKey: ["workflow-automations"] });
                          }}
                          className="w-5 h-5 grid place-items-center rounded text-muted-foreground hover:text-red-600"
                          title="Excluir automação"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => onAddTrigger(stage.id)}
                      className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-dashed border-border text-muted-foreground text-[11px] hover:bg-muted hover:text-foreground transition-colors"
                      title="Adicionar gatilho para esta etapa"
                    >
                      <Plus className="w-3 h-3" /> Gatilho
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {editMode ? (
                      <>
                        <input
                          type="color"
                          defaultValue={stage.color}
                          onBlur={(e) => e.target.value !== stage.color && safeRun(() => updateStageFn({ data: { id: stage.id, color: e.target.value } }))}
                          className="w-6 h-6 rounded flex-shrink-0 cursor-pointer"
                          title="Cor da etapa"
                        />
                        <input
                          defaultValue={stage.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== stage.name) safeRun(() => updateStageFn({ data: { id: stage.id, name: v } }));
                          }}
                          className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold rounded border border-border bg-background"
                        />
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                        <span className="text-sm font-semibold truncate">{stage.name}</span>
                      </>
                    )}
                    <span className="text-[11px] text-muted-foreground">{list.length}</span>
                    {stage.isDoneStage && <Check className="w-3 h-3 text-green-600" />}
                    {stage.isIncompleteStage && <AlertTriangle className="w-3 h-3 text-red-600" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {onOpenHistory && (stage.isDoneStage || stage.isIncompleteStage) && !editMode && (
                      <button
                        onClick={onOpenHistory}
                        className="opacity-0 group-hover/stage:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-border bg-background hover:bg-muted"
                        title="Ver histórico de tarefas"
                      >
                        <HistoryIcon className="w-3 h-3" /> Histórico
                      </button>
                    )}
                    {editMode ? (
                      <button
                        onClick={() => { if (confirm(`Excluir etapa "${stage.name}"?`)) safeRun(() => deleteStageFn({ data: { id: stage.id } })); }}
                        className="w-6 h-6 grid place-items-center rounded text-muted-foreground hover:bg-red-100 hover:text-red-700"
                        title="Excluir etapa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      board.canManage && (
                        <button
                          onClick={() => onNewTaskAtStage(stage.id)}
                          className="w-6 h-6 grid place-items-center rounded hover:bg-muted"
                          aria-label="Adicionar tarefa"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {list.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-4">Sem tarefas</p>
                  )}
                  {list.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      board={board}
                      onOpen={() => onOpenTask(t.id)}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              </div>
              {editMode && (
                <button
                  onClick={() => handleInsertStageAt(idx + 1)}
                  className="self-stretch flex-shrink-0 w-7 grid place-items-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                  title="Inserir etapa aqui"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ==================== NOTIFICATION BELL ====================
function NotificationBell() {
  const listFn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationRead);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["workflow-notifications"],
    queryFn: () => listFn({ data: {} }),
    refetchInterval: 30000,
  });
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-border hover:bg-muted"
        title="Notificações"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-semibold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Notificações</span>
            {unread > 0 && (
              <button
                onClick={async () => { await markFn({ data: { all: true } }); q.refetch(); }}
                className="text-[11px] text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Sem notificações</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn("px-3 py-2 hover:bg-muted cursor-pointer", !n.readAt && "bg-primary/5")}
                  onClick={async () => { if (!n.readAt) { await markFn({ data: { id: n.id } }); q.refetch(); } }}
                >
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(n.createdAt).toLocaleString("pt-BR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== INTERNAL MESSAGES BELL ====================
function MessagesBell() {
  const listFn = useServerFn(listInternalMessages);
  const markFn = useServerFn(markInternalMessageRead);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["internal-messages-inbox"],
    queryFn: () => listFn({ data: {} }),
    refetchInterval: 30000,
  });
  const items = q.data ?? [];
  const unread = items.filter((m) => !m.read_at).length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-border hover:bg-muted"
        title="Mensagens internas"
      >
        <MessageCircle className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-emerald-500 text-white text-[10px] font-semibold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Mensagens internas</span>
            {unread > 0 && (
              <button
                onClick={async () => { await markFn({ data: { all: true } }); q.refetch(); }}
                className="text-[11px] text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Sem mensagens</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((m) => (
                <li
                  key={m.id}
                  className={cn("px-3 py-2 hover:bg-muted cursor-pointer", !m.read_at && "bg-emerald-50")}
                  onClick={async () => { if (!m.read_at) { await markFn({ data: { id: m.id } }); q.refetch(); } }}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    {m.origin === "automation" ? "Automação" : "Administrador"}
                  </div>
                  <div className="text-sm">{m.body}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(m.created_at).toLocaleString("pt-BR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}



// ==================== TASK CARD ====================

function TaskCard({
  task,
  board,
  onOpen,
  onRefresh,
}: {
  task: WorkflowTaskLite;
  board: WorkflowBoard;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  const startFn = useServerFn(startTaskTimer);
  const stopFn = useServerFn(stopTaskTimer);
  const completeFn = useServerFn(completeTask);
  const incompleteFn = useServerFn(markTaskIncomplete);
  const submitFn = useServerFn(submitTaskForReview);
  const approveFn = useServerFn(approveTaskReview);
  const returnRevFn = useServerFn(returnTaskReview);
  const reopenFn = useServerFn(reopenTask);
  const deleteFn = useServerFn(deleteTask);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!task.activeSessionSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [task.activeSessionSince]);

  const liveExtra = task.activeSessionSince
    ? Math.max(0, Math.floor((now - new Date(task.activeSessionSince).getTime()) / 1000))
    : 0;
  const totalSec = task.timeSpentSeconds + liveExtra;

  const isAssignee = board.members.some((m) => m.id === task.assigneeId);
  const canOperate = board.canManage || isAssignee;
  const isDone = task.status === "concluida";
  const isIncomplete = task.status === "incompleta";
  const inReview = task.status === "em_revisao" || task.reviewStatus === "pending";

  const p = PRIORITY_META[task.priority];
  const dueLabel = task.dueAt
    ? new Date(task.dueAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const overdue = task.dueAt ? new Date(task.dueAt).getTime() < Date.now() && !isDone && !isIncomplete : false;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onRefresh();
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    }
  };

  return (
    <div
      className={cn(
        "group rounded-lg border border-border bg-card shadow-sm hover:shadow transition-all cursor-pointer",
        isDone && "opacity-70",
        isIncomplete && "border-red-200",
        overdue && "border-red-500 ring-2 ring-red-500/60 animate-pulse bg-red-50",
      )}
    >

      {canOperate && (
        <div className="flex items-center gap-1 px-2 pt-2">
          {!isDone && !isIncomplete && !task.activeSessionSince && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                run(() => startFn({ data: { taskId: task.id } }));
              }}
              className="w-6 h-6 grid place-items-center rounded bg-green-100 text-green-700 hover:bg-green-200"
              title="Iniciar"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          )}
          {task.activeSessionSince && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                run(() => stopFn({ data: { taskId: task.id } }));
              }}
              className="w-6 h-6 grid place-items-center rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
              title="Pausar"
            >
              <Pause className="w-3 h-3 fill-current" />
            </button>
          )}
          {task.isReviewCopy ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const notes = prompt("Observação da aprovação (opcional):") ?? undefined;
                  run(() => approveFn({ data: { taskId: task.id, notes: notes || undefined } }));
                }}
                className="w-6 h-6 grid place-items-center rounded bg-green-100 text-green-700 hover:bg-green-200"
                title="Aprovar e concluir"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const notes = prompt("O que faltou? (obrigatório)");
                  if (!notes?.trim()) return;
                  run(() => returnRevFn({ data: { taskId: task.id, notes: notes.trim() } }));
                }}
                className="w-6 h-6 grid place-items-center rounded bg-red-100 text-red-700 hover:bg-red-200"
                title="Devolver como incompleta"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </>
          ) : inReview ? (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
              Em revisão
            </span>
          ) : (
            <>
              {!isDone && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (board.canManage) {
                      run(() => completeFn({ data: { taskId: task.id } }));
                      return;
                    }
                    const note = prompt("Enviar como CONCLUÍDA para revisão. Observação (opcional):") ?? undefined;
                    run(() => submitFn({ data: { taskId: task.id, outcome: "concluida", note: note || undefined } }));
                  }}
                  className="w-6 h-6 grid place-items-center rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  title={board.canManage ? "Concluir" : "Enviar para revisão como concluída"}
                >
                  {board.canManage ? <Check className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                </button>
              )}
              {!isIncomplete && !isDone && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const reason = prompt(
                      board.canManage ? "Motivo (opcional):" : "Enviar como INCOMPLETA para revisão. O que faltou?",
                    ) ?? undefined;
                    if (board.canManage) {
                      run(() => incompleteFn({ data: { taskId: task.id, reason } }));
                      return;
                    }
                    if (!reason?.trim()) return;
                    run(() =>
                      submitFn({ data: { taskId: task.id, outcome: "incompleta", note: reason.trim() } }),
                    );
                  }}
                  className="w-6 h-6 grid place-items-center rounded bg-red-100 text-red-700 hover:bg-red-200"
                  title={board.canManage ? "Marcar incompleto" : "Enviar para revisão como incompleta"}
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </>
          )}
          {(isDone || isIncomplete) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const backStage = board.stages.find((s) => !s.isDoneStage && !s.isIncompleteStage);
                if (!backStage) return;
                run(() => reopenFn({ data: { taskId: task.id, stageId: backStage.id } }));
              }}
              className="w-6 h-6 grid place-items-center rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
              title="Reabrir"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          {board.canManage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Excluir esta tarefa?")) run(() => deleteFn({ data: { id: task.id } }));
              }}
              className="ml-auto w-6 h-6 grid place-items-center rounded text-muted-foreground hover:bg-red-100 hover:text-red-700 opacity-0 group-hover:opacity-100"
              title="Excluir"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      <div onClick={onOpen} className="p-2.5 space-y-2">
        <div className="flex items-start gap-1.5">
          <span
            className="mt-0.5 w-1 h-4 rounded-full flex-shrink-0"
            style={{ background: p.color }}
            title={`Prioridade ${p.label}`}
          />
          <p className="text-sm font-medium leading-snug flex-1 line-clamp-2">{task.title}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          {task.assigneeName && (
            <span className="inline-flex items-center gap-1">
              <UserCircle className="w-3 h-3" />
              {task.assigneeName}
            </span>
          )}
          {dueLabel && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-red-600 font-medium")}>
              <Clock className="w-3 h-3" />
              {dueLabel}
            </span>
          )}
          {task.checklistTotal > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.commentsCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {task.commentsCount}
            </span>
          )}
        </div>
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-[11px]">
          <span className={cn("px-1.5 py-0.5 rounded", p.bg)}>{p.label}</span>
          <span className={cn("font-mono", task.activeSessionSince && "text-green-600 font-semibold")}>
            {formatDuration(totalSec)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ==================== NEW TASK DIALOG ====================
type CredEntry = { label: string; username: string; password: string; notes: string };
type LinkEntry = { label: string; url: string };

function NewTaskDialog({
  board,
  stageId,
  onClose,
  onCreated,
}: {
  board: WorkflowBoard;
  stageId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createTask);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkflowTaskLite["priority"]>("media");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDateTime, setDueDateTime] = useState<string>("");
  const [estimatedHours, setEstimatedHours] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const [credentials, setCredentials] = useState<CredEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetPipelineId, setTargetPipelineId] = useState<string>(board.pipelineId);

  const selectedPipe = board.pipelines.find((p) => p.id === targetPipelineId);
  // O responsável define o fluxo: qualquer membro pode ser escolhido.
  const eligibleMembers = board.members;
  const isCurrentPipeline = targetPipelineId === board.pipelineId;
  const pipelineForAssignee = (userId: string) =>
    board.pipelines.find((p) => p.sectorId && p.memberIds.includes(userId)) ?? null;
  const autoPipe = assigneeId ? pipelineForAssignee(assigneeId) : null;

  // Ao escolher o responsável, a tarefa vai para o fluxo do setor dele.
  useEffect(() => {
    if (!assigneeId) return;
    const target = pipelineForAssignee(assigneeId);
    if (target && target.id !== targetPipelineId) setTargetPipelineId(target.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeId]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const est = estimatedHours ? Math.round(parseFloat(estimatedHours) * 3600) : null;
      await createFn({
        data: {
          pipelineId: targetPipelineId,
          // Only send stageId when creating in the currently open pipeline;
          // otherwise let the server pick the first backlog stage of the target pipeline.
          stageId: isCurrentPipeline ? stageId : undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueAt: dueDateTime ? new Date(dueDateTime).toISOString() : undefined,
          assigneeId: assigneeId || null,
          credentials: credentials.filter((c) => c.label.trim()),
          links: links.filter((l) => l.url.trim()),
          tags,
          estimatedSeconds: est,
        },
      });
      onCreated();
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-card pb-2 border-b border-border">
          <h2 className="text-base font-semibold">Nova tarefa</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 grid place-items-center rounded hover:bg-muted">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Título</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background" />
        </div>

        {board.canManage && board.pipelines.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Fluxo de destino
              <span className="ml-1 text-[10px] text-muted-foreground">
                (definido automaticamente pelo setor do responsável — você pode ajustar)
              </span>
            </label>
            <select
              value={targetPipelineId}
              onChange={(e) => setTargetPipelineId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            >
              {board.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sectorName ? `${p.sectorName} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
            {autoPipe && autoPipe.id === targetPipelineId && (
              <p className="text-[11px] text-muted-foreground">
                O responsável é do setor <strong>{autoPipe.sectorName}</strong>, então a tarefa vai para o fluxo desse setor.
              </p>
            )}
            {selectedPipe?.sectorId && autoPipe && autoPipe.id !== targetPipelineId && (
              <p className="text-[11px] text-amber-600">
                Atenção: o responsável é do setor <strong>{autoPipe.sectorName}</strong>. A tarefa será enviada para o fluxo dele.
              </p>
            )}
          </div>
        )}


        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Descrição detalhada <span className="text-[10px] text-muted-foreground">(o que fazer, contexto, passo a passo, links úteis)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Explique claramente o que precisa ser feito. Quem entrar aqui deve conseguir executar sem precisar perguntar nada."
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background">
              {(["baixa", "media", "alta", "urgente"] as const).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Prazo (data e horário)</label>
            <input
              type="datetime-local"
              value={dueDateTime}
              onChange={(e) => setDueDateTime(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Responsável</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background">
              <option value="">- sem responsável -</option>
              {eligibleMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {eligibleMembers.length === 0 && (
              <p className="text-[11px] text-red-600">
                Nenhum membro na equipe. Adicione pessoas em <strong>Setores</strong>.
              </p>
            )}
            {autoPipe && (
              <p className="text-[11px] text-muted-foreground">
                Vai para o fluxo <strong>{autoPipe.sectorName ?? autoPipe.name}</strong>.
              </p>
            )}

          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tempo estimado (horas)</label>
            <input
              type="number"
              step="0.25"
              min="0"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="ex: 2.5"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tags (separadas por vírgula)</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="ex: cliente-x, urgente, campanha-meta"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>

        <LinksEditor value={links} onChange={setLinks} />
        <CredentialsEditor value={credentials} onChange={setCredentials} />

        <div className="flex justify-end gap-2 pt-2 border-t border-border sticky bottom-0 bg-card">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Criando…" : "Criar tarefa"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ==================== LINK & CREDENTIAL EDITORS ====================
function LinksEditor({ value, onChange }: { value: LinkEntry[]; onChange: (v: LinkEntry[]) => void }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Link2 className="w-3 h-3" /> Links úteis
        </h4>
        <button
          type="button"
          onClick={() => onChange([...value, { label: "", url: "" }])}
          className="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-muted/70"
        >
          <Plus className="w-3 h-3 inline" /> Adicionar
        </button>
      </div>
      {value.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-1">
          <input
            value={l.label}
            onChange={(e) => onChange(value.map((v, k) => (k === i ? { ...v, label: e.target.value } : v)))}
            placeholder="Rótulo"
            className="px-2 py-1 text-xs rounded border border-border bg-background"
          />
          <input
            value={l.url}
            onChange={(e) => onChange(value.map((v, k) => (k === i ? { ...v, url: e.target.value } : v)))}
            placeholder="https://..."
            className="px-2 py-1 text-xs rounded border border-border bg-background"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, k) => k !== i))}
            className="w-7 h-7 grid place-items-center rounded text-muted-foreground hover:bg-red-100 hover:text-red-700"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      {value.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum link. Adicione URLs relevantes.</p>}
    </div>
  );
}

function CredentialsEditor({ value, onChange }: { value: CredEntry[]; onChange: (v: CredEntry[]) => void }) {
  const [visible, setVisible] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-900 flex items-center gap-1">
          <KeyRound className="w-3 h-3" /> Credenciais / acessos
        </h4>
        <button
          type="button"
          onClick={() => onChange([...value, { label: "", username: "", password: "", notes: "" }])}
          className="text-[11px] px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900"
        >
          <Plus className="w-3 h-3 inline" /> Adicionar
        </button>
      </div>
      <p className="text-[10px] text-amber-900/70">Compartilhado apenas com quem tem acesso à tarefa.</p>
      {value.map((c, i) => (
        <div key={i} className="rounded border border-amber-300 bg-white p-2 space-y-1">
          <div className="flex items-center gap-1">
            <input
              value={c.label}
              onChange={(e) => onChange(value.map((v, k) => (k === i ? { ...v, label: e.target.value } : v)))}
              placeholder="Sistema (ex: Instagram do cliente)"
              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background font-medium"
            />
            <button
              type="button"
              onClick={() => setVisible((s) => ({ ...s, [i]: !s[i] }))}
              className="w-7 h-7 grid place-items-center rounded text-muted-foreground hover:bg-muted"
              title={visible[i] ? "Ocultar" : "Mostrar"}
            >
              {visible[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              className="w-7 h-7 grid place-items-center rounded text-muted-foreground hover:bg-red-100 hover:text-red-700"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <input
              value={c.username}
              onChange={(e) => onChange(value.map((v, k) => (k === i ? { ...v, username: e.target.value } : v)))}
              placeholder="Usuário / e-mail"
              className="px-2 py-1 text-xs rounded border border-border bg-background"
            />
            <input
              type={visible[i] ? "text" : "password"}
              value={c.password}
              onChange={(e) => onChange(value.map((v, k) => (k === i ? { ...v, password: e.target.value } : v)))}
              placeholder="Senha"
              className="px-2 py-1 text-xs rounded border border-border bg-background font-mono"
            />
          </div>
          <input
            value={c.notes}
            onChange={(e) => onChange(value.map((v, k) => (k === i ? { ...v, notes: e.target.value } : v)))}
            placeholder="Notas (2FA, URL de login, etc.)"
            className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
          />
        </div>
      ))}
      {value.length === 0 && <p className="text-[11px] text-amber-900/70">Nenhuma credencial adicionada.</p>}
    </div>
  );
}



// ==================== STAGE CONFIG DIALOG ====================
function StagesPanel({
  board,
  onChanged,
  onAddTrigger,
}: {
  board: WorkflowBoard;
  onChanged: () => void;
  onAddTrigger: (stageId: string) => void;
}) {
  const createFn = useServerFn(createStage);
  const updateFn = useServerFn(updateStage);
  const deleteFn = useServerFn(deleteStage);
  const reorderFn = useServerFn(reorderStages);
  const [newName, setNewName] = useState("");
  const [order, setOrder] = useState<string[]>(board.stages.map((s) => s.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // keep local order in sync with server data
  useEffect(() => {
    setOrder(board.stages.map((s) => s.id));
  }, [board.stages.map((s) => s.id).join("|")]);

  const stagesById = new Map(board.stages.map((s) => [s.id, s]));
  const ordered = order.map((id) => stagesById.get(id)).filter(Boolean) as typeof board.stages;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrder(next);
    setDragId(null);
    setOverId(null);
    await run(() => reorderFn({ data: { order: next } }));
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Etapas da pipeline</p>
          <p className="text-[11px] text-muted-foreground">
            Arraste para reordenar. Clique em <strong>Adicionar gatilho</strong> para automatizar a chegada em uma etapa.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {ordered.map((s) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== s.id) setOverId(s.id);
            }}
            onDragLeave={() => setOverId((cur) => (cur === s.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(s.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-card p-2 transition",
              dragId === s.id && "opacity-50",
              overId === s.id && dragId && dragId !== s.id && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="cursor-grab text-muted-foreground select-none px-1" title="Arraste para reordenar">⋮⋮</span>
            <input
              type="color"
              defaultValue={s.color}
              onBlur={(e) => run(() => updateFn({ data: { id: s.id, color: e.target.value } }))}
              className="w-8 h-8 rounded"
            />
            <input
              defaultValue={s.name}
              onBlur={(e) => {
                if (e.target.value !== s.name && e.target.value.trim()) {
                  run(() => updateFn({ data: { id: s.id, name: e.target.value.trim() } }));
                }
              }}
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-background"
            />
            <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
              <input
                type="checkbox"
                defaultChecked={s.isDoneStage}
                onChange={(e) => run(() => updateFn({ data: { id: s.id, isDoneStage: e.target.checked } }))}
              />
              Concluído
            </label>
            <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
              <input
                type="checkbox"
                defaultChecked={s.isIncompleteStage}
                onChange={(e) => run(() => updateFn({ data: { id: s.id, isIncompleteStage: e.target.checked } }))}
              />
              Incompleto
            </label>
            <button
              onClick={() => onAddTrigger(s.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[11px] hover:bg-amber-100 whitespace-nowrap"
              title="Adicionar gatilho para esta etapa"
            >
              <Zap className="w-3 h-3" /> Adicionar gatilho
            </button>
            <button
              onClick={() => {
                if (confirm(`Excluir etapa "${s.name}"?`)) run(() => deleteFn({ data: { id: s.id } }));
              }}
              className="w-7 h-7 grid place-items-center rounded text-muted-foreground hover:bg-red-100 hover:text-red-700"
              title="Excluir etapa"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              run(() => createFn({ data: { pipelineId: board.pipelineId, name: newName.trim() } }));
              setNewName("");
            }
          }}
          placeholder="Nova etapa"
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background"
        />
        <button
          onClick={() => {
            if (!newName.trim()) return;
            run(() => createFn({ data: { pipelineId: board.pipelineId, name: newName.trim() } }));
            setNewName("");
          }}
          className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Adicionar etapa
        </button>
      </div>
    </div>
  );
}

// ==================== TASK DRAWER ====================
function TaskDrawer({
  taskId,
  onClose,
  onChanged,
  board,
}: {
  taskId: string;
  onClose: () => void;
  onChanged: () => void;
  board: WorkflowBoard | undefined;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getTaskDetail);
  const updateFn = useServerFn(updateTask);
  const addCheck = useServerFn(addChecklistItem);
  const toggleCheck = useServerFn(toggleChecklistItem);
  const delCheck = useServerFn(deleteChecklistItem);
  const addCmt = useServerFn(addComment);

  const detailQ = useQuery({
    queryKey: ["workflow-task", taskId],
    queryFn: () => load({ data: { taskId } }),
    refetchInterval: 10_000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workflow-task", taskId] });
    onChanged();
  };

  const [newCheck, setNewCheck] = useState("");
  const [comment, setComment] = useState("");

  const data = detailQ.data;
  const task = data?.task as any;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refresh();
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Detalhes da tarefa</h3>
          <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded hover:bg-muted">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {detailQ.isLoading || !task ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="p-4 space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase">Título</label>
              <input
                defaultValue={task.title}
                onBlur={(e) => {
                  if (e.target.value !== task.title && e.target.value.trim()) {
                    run(() => updateFn({ data: { id: task.id, title: e.target.value.trim() } }));
                  }
                }}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase">Descrição</label>
              <textarea
                defaultValue={task.description ?? ""}
                rows={3}
                onBlur={(e) => {
                  if (e.target.value !== (task.description ?? "")) {
                    run(() => updateFn({ data: { id: task.id, description: e.target.value } }));
                  }
                }}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Prioridade</label>
                <select
                  defaultValue={task.priority}
                  onChange={(e) => run(() => updateFn({ data: { id: task.id, priority: e.target.value as any } }))}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                >
                  {(["baixa", "media", "alta", "urgente"] as const).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Prazo (data + hora)</label>
                <input
                  type="datetime-local"
                  defaultValue={
                    task.due_at
                      ? (() => {
                          const d = new Date(task.due_at);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        })()
                      : ""
                  }
                  onChange={(e) => {
                    const iso = e.target.value ? new Date(e.target.value).toISOString() : null;
                    run(() => updateFn({ data: { id: task.id, dueAt: iso } }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                />
              </div>

            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase">Responsável</label>
              <select
                defaultValue={task.assignee_id ?? ""}
                onChange={(e) => run(() => updateFn({ data: { id: task.id, assigneeId: e.target.value || null } }))}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              >
                <option value="">- sem responsável -</option>
                {(board?.members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{task.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tempo total</span>
                <span className="font-mono">{formatDuration(Number(task.time_spent_seconds ?? 0))}</span>
              </div>
              {task.incomplete_reason && (
                <div>
                  <span className="text-muted-foreground">Motivo (incompleto):</span>
                  <p className="text-red-600 mt-0.5">{task.incomplete_reason}</p>
                </div>
              )}
            </div>

            {/* Links */}
            <LinksEditor
              value={(task.links ?? []) as LinkEntry[]}
              onChange={(v) => run(() => updateFn({ data: { id: task.id, links: v.filter((l) => l.url.trim()) } }))}
            />
            {/* Credentials */}
            <CredentialsEditor
              value={(task.credentials ?? []) as CredEntry[]}
              onChange={(v) => run(() => updateFn({ data: { id: task.id, credentials: v.filter((c) => c.label.trim()) } }))}
            />


            {/* Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <CheckSquare className="w-3 h-3" /> Checklist
              </h4>
              <div className="space-y-1">
                {(data?.checklist ?? []).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-2 group">
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={(e) => run(() => toggleCheck({ data: { id: c.id, done: e.target.checked } }))}
                    />
                    <span className={cn("flex-1 text-sm", c.done && "line-through text-muted-foreground")}>{c.text}</span>
                    <button
                      onClick={() => run(() => delCheck({ data: { id: c.id } }))}
                      className="w-5 h-5 grid place-items-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  value={newCheck}
                  onChange={(e) => setNewCheck(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCheck.trim()) {
                      e.preventDefault();
                      run(() => addCheck({ data: { taskId, text: newCheck.trim() } }));
                      setNewCheck("");
                    }
                  }}
                  placeholder="Adicionar item…"
                  className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background"
                />
                <button
                  onClick={() => {
                    if (!newCheck.trim()) return;
                    run(() => addCheck({ data: { taskId, text: newCheck.trim() } }));
                    setNewCheck("");
                  }}
                  className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground"
                >
                  +
                </button>
              </div>
            </div>

            {/* Sessions */}
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Sessões
              </h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {(data?.sessions ?? []).map((s: any) => (
                  <div key={s.id} className="text-[11px] text-muted-foreground flex justify-between">
                    <span>
                      {s.userName} · {new Date(s.startedAt).toLocaleString("pt-BR")}
                    </span>
                    <span className="font-mono">{s.endedAt ? formatDuration(s.durationSeconds) : "em andamento"}</span>
                  </div>
                ))}
                {(data?.sessions ?? []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Nenhuma sessão registrada.</p>
                )}
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Comentários
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(data?.comments ?? []).map((c: any) => (
                  <div key={c.id} className="rounded-md bg-muted/40 p-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium">{c.authorName}</span>
                      <span>{new Date(c.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
                {(data?.comments ?? []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Nenhum comentário.</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Escrever comentário…"
                  className="w-full px-2 py-1 text-sm rounded border border-border bg-background resize-y"
                />
                <button
                  onClick={() => {
                    if (!comment.trim()) return;
                    run(() => addCmt({ data: { taskId, body: comment.trim() } }));
                    setComment("");
                  }}
                  className="self-end px-3 py-1 text-xs rounded bg-primary text-primary-foreground"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== METRICS ====================
function MetricsView() {
  const load = useServerFn(getWorkflowMetrics);
  const [days, setDays] = useState(30);
  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 3600 * 1000);
    return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
  }, [days]);
  const q = useQuery({
    queryKey: ["workflow-metrics", days],
    queryFn: () => load({ data: range }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Período:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "px-3 py-1 text-xs rounded-md border",
              days === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {d} dias
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Calculando…</p>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Funcionário</th>
                <th className="text-right px-4 py-2">Tempo total</th>
                <th className="text-right px-4 py-2">Concluídas</th>
                <th className="text-right px-4 py-2">No prazo</th>
                <th className="text-right px-4 py-2">Incompletas</th>
                <th className="text-right px-4 py-2">Total atribuídas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(q.data?.byUser ?? []).map((u) => (
                <tr key={u.userId}>
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatDuration(u.totalSeconds)}</td>
                  <td className="px-4 py-2 text-right">{u.done}</td>
                  <td className="px-4 py-2 text-right text-green-600">{u.doneOnTime}</td>
                  <td className="px-4 py-2 text-right text-red-600">{u.incomplete}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{u.total}</td>
                </tr>
              ))}
              {(q.data?.byUser ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Sem dados para o período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==================== AUTOMATIONS DIALOG ====================
type TriggerNeed = "stage" | "hours" | "hoursBefore" | "seconds" | "percent" | "stageWip";
type TriggerMeta = {
  value: string;
  label: string;
  hint: string;
  category: "prazo" | "produtividade" | "qualidade" | "fluxo";
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  needs?: TriggerNeed;
};

const TRIGGER_EVENTS: TriggerMeta[] = [
  // ⏰ Prazo
  { value: "task_overdue", label: "Tarefa atrasou o prazo", hint: "Dispara assim que o prazo é ultrapassado. Ideal para escalar automaticamente.", category: "prazo", icon: AlertTriangle, color: "rose" },
  { value: "task_near_due", label: "Prazo se aproximando", hint: "Avisa antes de estourar. Você define quantas horas antes.", category: "prazo", icon: CalendarClock, color: "amber", needs: "hoursBefore" },

  // 🚀 Produtividade
  { value: "high_priority_untouched", label: "Prioridade alta sem começar", hint: "Tarefa alta/urgente que ninguém tocou (nenhum minuto trabalhado) após N horas.", category: "produtividade", icon: Flame, color: "rose", needs: "hours" },
  { value: "task_no_progress", label: "Sem progresso há muito tempo", hint: "Sem qualquer atualização (comentário, timer, mudança) por N horas.", category: "produtividade", icon: TimerOff, color: "orange", needs: "hours" },
  { value: "task_stalled_in_stage", label: "Parada na etapa há muito tempo", hint: "Tarefa não muda de etapa há N horas, sinal de gargalo.", category: "produtividade", icon: Hourglass, color: "orange", needs: "hours" },
  { value: "task_timer_exceeded", label: "Cronômetro estourou", hint: "Tempo trabalhado passou do limite (ou do tempo estimado da tarefa).", category: "produtividade", icon: Clock, color: "amber", needs: "seconds" },
  { value: "task_over_estimate_percent", label: "Passou X% do estimado", hint: "Tempo trabalhado passou de X% da estimativa. Ex.: 100% = estourou; 80% = alerta.", category: "produtividade", icon: BarChart3, color: "amber", needs: "percent" },

  // 🔥 Fluxo / gargalos
  { value: "stage_wip_exceeded", label: "Etapa com fila (WIP alto)", hint: "Etapa acumulou mais tarefas do que o limite saudável. Reduz gargalo forçado.", category: "fluxo", icon: Layers, color: "purple", needs: "stageWip" },
  { value: "task_moved_to_stage", label: "Tarefa movida para etapa", hint: "Automatize a chegada em uma etapa específica (ex.: entrou em ‘Revisão’ → avisar gestor).", category: "fluxo", icon: MoveRight, color: "blue", needs: "stage" },
  { value: "task_created", label: "Nova tarefa criada", hint: "Ideal para pré-configurar prioridade, tags ou responsável automaticamente.", category: "fluxo", icon: Plus, color: "emerald" },

  // ✅ Qualidade
  { value: "task_completed", label: "Tarefa concluída", hint: "Encadeie a próxima etapa ou notifique quem depende do resultado.", category: "qualidade", icon: Check, color: "emerald" },
  { value: "task_marked_incomplete", label: "Tarefa marcada como incompleta", hint: "Dispara quando o executor devolve como incompleta.", category: "qualidade", icon: XIcon, color: "rose" },
  { value: "task_returned_from_review", label: "Devolvida pela revisão", hint: "Retrabalho detectado, bom para tag ‘retrabalho’, aviso ao gestor ou reatribuir.", category: "qualidade", icon: RotateCcw, color: "rose" },
  { value: "task_review_approved", label: "Revisão aprovada", hint: "Aprovada pelo gestor, encadeie próxima etapa ou notifique quem depende.", category: "qualidade", icon: Check, color: "emerald" },
  { value: "task_review_returned", label: "Revisão devolvida (alias)", hint: "Mesmo evento que ‘Devolvida pela revisão’, mantido para automações antigas.", category: "qualidade", icon: RotateCcw, color: "rose" },

];

const CATEGORY_META: Record<string, { label: string; hint: string }> = {
  prazo: { label: "⏰ Prazo", hint: "Reage a datas e prazos." },
  produtividade: { label: "🚀 Produtividade", hint: "Acelera quem está travando o time." },
  fluxo: { label: "🔀 Fluxo & gargalos", hint: "Mantém o quadro fluindo sem acúmulo." },
  qualidade: { label: "✅ Qualidade", hint: "Reage a resultados e retrabalho." },
};

type ActionMeta = { value: string; label: string; icon: React.ComponentType<{ className?: string }>; hint: string };
const ACTION_TYPES: ActionMeta[] = [
  { value: "escalate_priority", label: "Aumentar prioridade em 1 nível", icon: ArrowUp, hint: "Sobe de baixa→média→alta→urgente." },
  { value: "set_priority", label: "Definir prioridade", icon: Flame, hint: "Força uma prioridade específica." },
  { value: "reassign_round_robin", label: "Redistribuir no setor (rodízio)", icon: Users, hint: "Passa para outro membro do setor." },
  { value: "reassign_to_manager", label: "Passar para o gestor do setor", icon: Shield, hint: "Escalonamento imediato." },
  { value: "assign_to_user", label: "Atribuir a alguém específico", icon: UserPlus, hint: "" },
  { value: "remove_assignee", label: "Remover responsável", icon: UserMinus, hint: "Deixa em pool aberto." },
  { value: "move_to_stage", label: "Mover para etapa", icon: MoveRight, hint: "" },
  { value: "add_tag", label: "Adicionar tag", icon: Tag, hint: "Ex.: ‘atrasada’, ‘retrabalho’, ‘gargalo’." },
  { value: "extend_due", label: "Adiar prazo em X horas", icon: CalendarClock, hint: "" },
  { value: "notify_assignee", label: "Notificar o responsável", icon: Bell, hint: "Cria comentário chamando atenção." },
  { value: "add_comment", label: "Comentário automático", icon: MessageCircle, hint: "Registra no histórico." },
  { value: "create_child_task", label: "Criar subtarefa", icon: Plus, hint: "Gera uma tarefa filha (mesmo pipeline). Útil para replicar automações de projeto." },

];

const COLOR_CLASSES: Record<string, { bg: string; text: string; ring: string }> = {
  rose:    { bg: "bg-rose-50",    text: "text-rose-600",    ring: "ring-rose-200" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   ring: "ring-amber-200" },
  orange:  { bg: "bg-orange-50",  text: "text-orange-600",  ring: "ring-orange-200" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  blue:    { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  purple:  { bg: "bg-purple-50",  text: "text-purple-600",  ring: "ring-purple-200" },
};

function AutomationRunsPanel({ pipelineId }: { pipelineId: string }) {
  const runsFn = useServerFn(listAutomationRuns);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["workflow-automation-runs", pipelineId],
    queryFn: () => runsFn({ data: { pipelineId, limit: 30 } }),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });
  const runs = q.data ?? [];
  const failures = runs.filter((r) => r.status !== "ok").length;

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          Histórico de execuções (servidor)
          {open && failures > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600">{failures} com erro</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "ocultar" : "ver"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {q.isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma execução registrada ainda. O motor roda no servidor a cada 5 minutos, mesmo com o navegador fechado.
            </p>
          ) : (
            runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{r.automationName ?? "Automação"}</span>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                      r.status === "ok"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-600"
                    }`}
                  >
                    {r.status === "ok" ? "ok" : r.status}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate">
                  {r.taskTitle ?? "—"} · {new Date(r.createdAt).toLocaleString("pt-BR")}
                </p>
                {r.error && <p className="text-red-600 mt-1 break-words">{r.error}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AutomationsDialog({ board, onClose, initialStageId }: { board: WorkflowBoard; onClose: () => void; initialStageId?: string }) {

  const listFn = useServerFn(listAutomations);
  const saveFn = useServerFn(saveAutomation);
  const delFn = useServerFn(deleteAutomation);
  const q = useQuery<WorkflowAutomation[]>({
    queryKey: ["workflow-automations", board.pipelineId],
    queryFn: () => listFn({ data: { pipelineId: board.pipelineId } }),
  });
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["workflow-automations", board.pipelineId] });
  const refreshBoard = () => qc.invalidateQueries({ queryKey: ["workflow-board"] });

  const emptyDraft = (): WorkflowAutomation => ({
    id: "",
    name: "",
    enabled: true,
    trigger: { event: "task_overdue", params: { hours: 2 } },
    actions: [{ type: "escalate_priority" }],
  });

  const STORAGE_KEY = `workflow_automation_draft_${board.pipelineId}`;

  const [draft, setDraft] = useState<WorkflowAutomation | null>(() => {
    if (initialStageId) {
      return {
        id: "",
        name: "",
        enabled: true,
        trigger: { event: "task_moved_to_stage", params: { stageId: initialStageId } },
        actions: [{ type: "notify_assignee" }],
      };
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  // Auto-save draft to localStorage
  useEffect(() => {
    if (draft && !draft.id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } else if (!draft) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [draft, STORAGE_KEY]);

  const [editing, setEditing] = useState<WorkflowAutomation | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const startEdit = (a: WorkflowAutomation | null) => {
    setDraft(a ? { ...a, actions: [...a.actions] } : emptyDraft());
    setEditing(a);
  };


  const save = async () => {
    if (!draft) return;
    const meta = TRIGGER_EVENTS.find((t) => t.value === draft.trigger.event);
    if (meta?.needs === "stageWip" && !draft.trigger.params?.stageId) {
      alert("Escolha a etapa que terá o limite de fila.");
      return;
    }
    if (!draft.actions.length) {
      alert("Adicione pelo menos uma ação.");
      return;
    }
    const stageName = board.stages.find((st) => st.id === draft.trigger.params?.stageId)?.name;
    const autoName = [meta?.label ?? "Automação", stageName ? `· ${stageName}` : ""].join(" ").trim();
    const finalName = draft.name.trim() || autoName;
    try {
      await saveFn({
        data: {
          id: draft.id || undefined,
          pipelineId: board.pipelineId,
          name: finalName,
          enabled: draft.enabled,
          trigger: draft.trigger,
          actions: draft.actions,
        },
      });
      setDraft(null);
      setEditing(null);
      localStorage.removeItem(STORAGE_KEY); // Limpa o rascunho após salvar com sucesso
      refresh();
      refreshBoard();
    } catch (e: any) {
      alert(e?.message ?? "Não foi possível salvar a automação.");
    }
  };

  const triggerMeta = (evt: string) => TRIGGER_EVENTS.find((t) => t.value === evt);

  const filteredTriggers = TRIGGER_EVENTS.filter((t) => {
    if (!pickerQuery.trim()) return true;
    const q = pickerQuery.toLowerCase();
    return t.label.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q);
  });
  const groupedTriggers = (["prazo", "produtividade", "fluxo", "qualidade"] as const).map((cat) => ({
    cat,
    items: filteredTriggers.filter((t) => t.category === cat),
  }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[85vh] rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Automações do fluxo</h2>
              <p className="text-xs text-muted-foreground">Gatilhos operacionais que aceleram a equipe.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-muted transition">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {!draft ? (
            <div className="h-full overflow-y-auto px-6 py-5 space-y-5">
              <StagesPanel
                board={board}
                onChanged={refreshBoard}
                onAddTrigger={(stageId) => {
                  setDraft({
                    id: "",
                    name: "",
                    enabled: true,
                    trigger: { event: "task_moved_to_stage", params: { stageId } },
                    actions: [{ type: "escalate_priority" }],
                  });
                  setEditing(null);
                }}
              />
              <button
                onClick={() => { setPickerQuery(""); setPickerOpen(true); }}
                className="w-full px-4 py-3 rounded-xl border border-dashed border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Nova automação
              </button>

              {(q.data ?? []).length === 0 ? (
                <div className="text-center py-16 space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-muted grid place-items-center">
                    <Zap className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Nenhuma automação configurada</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Comece com um gatilho como <strong>“Prioridade alta sem começar”</strong> ou <strong>“Parada há muito tempo”</strong> para o time nunca deixar tarefa parada.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {(q.data ?? []).map((a) => {
                    const meta = triggerMeta(a.trigger.event);
                    const c = meta ? COLOR_CLASSES[meta.color] : COLOR_CLASSES.blue;
                    const Icon = meta?.icon ?? Zap;
                    return (
                      <div
                        key={a.id}
                        className={`group rounded-xl border border-border bg-card hover:shadow-md transition p-4 flex items-start gap-3 ${!a.enabled ? "opacity-60" : ""}`}
                      >
                        <div className={`w-10 h-10 shrink-0 rounded-lg ${c.bg} ${c.text} grid place-items-center`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{a.name}</p>
                            {!a.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">pausada</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-medium">Quando:</span> {meta?.label ?? a.trigger.event}
                            {" · "}
                            <span className="font-medium">{a.actions.length}</span> ação{a.actions.length !== 1 ? "ões" : ""}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {a.actions.slice(0, 4).map((ac, idx) => {
                              const am = ACTION_TYPES.find((t) => t.value === ac.type);
                              const AI = am?.icon ?? Zap;
                              return (
                                <span key={idx} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  <AI className="w-2.5 h-2.5" /> {am?.label ?? ac.type}
                                </span>
                              );
                            })}
                            {a.actions.length > 4 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{a.actions.length - 4}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={a.enabled}
                              onChange={async (e) => {
                                try {
                                  await saveFn({
                                    data: {
                                      id: a.id,
                                      pipelineId: board.pipelineId,
                                      name: a.name,
                                      enabled: e.target.checked,
                                      trigger: a.trigger,
                                      actions: a.actions,
                                    },
                                  });
                                  refresh();
                                } catch (err) {
                                  const msg = err instanceof Error ? err.message : String(err);
                                  toast.error(`Não foi possível alterar a automação: ${msg}`);
                                  refresh();
                                }
                              }}
                            />
                            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-emerald-500 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                          </label>
                          <button onClick={() => startEdit(a)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-muted transition" title="Editar">
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Excluir "${a.name}"?`)) return;
                              await delFn({ data: { id: a.id } });
                              refresh();
                            }}
                            className="w-8 h-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <AutomationRunsPanel pipelineId={board.pipelineId} />
            </div>

          ) : (
            <AutomationEditor
              board={board}
              draft={draft}
              setDraft={setDraft}
              editing={editing}
              onCancel={() => { setDraft(null); setEditing(null); }}
              onSave={save}
              openPicker={() => { setPickerQuery(""); setPickerOpen(true); }}
            />
          )}
        </div>
      </div>

      {/* Trigger picker overlay */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { e.stopPropagation(); setPickerOpen(false); }}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold mb-2">Escolha o gatilho</h3>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Buscar gatilho…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {groupedTriggers.map(({ cat, items }) =>
                items.length === 0 ? null : (
                  <div key={cat}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {CATEGORY_META[cat].label}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {items.map((t) => {
                        const c = COLOR_CLASSES[t.color];
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.value}
                            onClick={() => {
                              const base = draft ?? emptyDraft();
                              setDraft({ ...base, trigger: { event: t.value }, name: base.name || t.label });
                              if (!draft) setEditing(null);
                              setPickerOpen(false);
                            }}
                            className="text-left rounded-xl border border-border hover:border-primary hover:shadow-sm bg-card p-3 flex gap-3 items-start transition group"
                          >
                            <div className={`w-9 h-9 shrink-0 rounded-lg ${c.bg} ${c.text} grid place-items-center`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold">{t.label}</p>
                              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t.hint}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AutomationEditor({
  board,
  draft,
  setDraft,
  editing,
  onCancel,
  onSave,
  openPicker,
}: {
  board: WorkflowBoard;
  draft: WorkflowAutomation;
  setDraft: (a: WorkflowAutomation) => void;
  editing: WorkflowAutomation | null;
  onCancel: () => void;
  onSave: () => void;
  openPicker: () => void;
}) {
  const meta = TRIGGER_EVENTS.find((t) => t.value === draft.trigger.event);
  const c = meta ? COLOR_CLASSES[meta.color] : COLOR_CLASSES.blue;
  const Icon = meta?.icon ?? Zap;
  const setParam = (k: string, v: string | number) =>
    setDraft({ ...draft, trigger: { event: draft.trigger.event, params: { ...(draft.trigger.params ?? {}), [k]: v } } });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Nome */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome da automação</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="ex.: Escalar prioridade alta parada há 2h"
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        {/* Trigger card */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quando acontecer</label>
          <button
            onClick={openPicker}
            className="w-full text-left rounded-xl border border-border hover:border-primary bg-card p-4 flex items-start gap-3 transition"
          >
            <div className={`w-11 h-11 shrink-0 rounded-lg ${c.bg} ${c.text} grid place-items-center`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{meta?.label ?? "Escolher gatilho"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{meta?.hint}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-2" />
          </button>

          {/* Trigger params */}
          {meta?.needs && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              {meta.needs === "stage" && (
                <>
                  <label className="text-[11px] font-medium text-muted-foreground">Etapa alvo (opcional)</label>
                  <select
                    value={(draft.trigger.params?.stageId as string) ?? ""}
                    onChange={(e) => setParam("stageId", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  >
                    <option value="">- qualquer etapa -</option>
                    {board.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </>
              )}
              {meta.needs === "hours" && (
                <>
                  <label className="text-[11px] font-medium text-muted-foreground">Horas</label>
                  <input
                    type="number" min={1}
                    value={(draft.trigger.params?.hours as number) ?? 24}
                    onChange={(e) => setParam("hours", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  />
                </>
              )}
              {meta.needs === "hoursBefore" && (
                <>
                  <label className="text-[11px] font-medium text-muted-foreground">Horas antes do prazo</label>
                  <input
                    type="number" min={1}
                    value={(draft.trigger.params?.hoursBefore as number) ?? 2}
                    onChange={(e) => setParam("hoursBefore", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  />
                </>
              )}
              {meta.needs === "seconds" && (() => {
                const cur = draft.trigger.params?.seconds as number | undefined;
                const hours = cur ? Math.round((cur / 3600) * 100) / 100 : "";
                return (
                  <>
                    <label className="text-[11px] font-medium text-muted-foreground">Limite em horas (vazio = usa tempo estimado da tarefa)</label>
                    <input
                      type="number" min={0} step="0.25"
                      value={hours as any}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) {
                          const p = { ...(draft.trigger.params ?? {}) };
                          delete (p as any).seconds;
                          setDraft({ ...draft, trigger: { event: draft.trigger.event, params: p } });
                        } else {
                          setParam("seconds", Math.round(Number(v) * 3600));
                        }
                      }}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                    />
                  </>
                );
              })()}
              {meta.needs === "percent" && (
                <>
                  <label className="text-[11px] font-medium text-muted-foreground">% do tempo estimado</label>
                  <input
                    type="number" min={1} max={500}
                    value={(draft.trigger.params?.percent as number) ?? 100}
                    onChange={(e) => setParam("percent", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground">Ex.: 80 = quando estourar 80% do estimado. Requer estimativa na tarefa.</p>
                </>
              )}
              {meta.needs === "stageWip" && (
                <>
                  <label className="text-[11px] font-medium text-muted-foreground">Etapa</label>
                  <select
                    value={(draft.trigger.params?.stageId as string) ?? ""}
                    onChange={(e) => setParam("stageId", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  >
                    <option value="">- escolha uma etapa -</option>
                    {board.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <label className="text-[11px] font-medium text-muted-foreground pt-1 block">Limite (tarefas simult-neas)</label>
                  <input
                    type="number" min={1}
                    value={(draft.trigger.params?.limit as number) ?? 5}
                    onChange={(e) => setParam("limit", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Então executar</label>
            <button
              onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "notify_assignee" }] })}
              className="text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Adicionar ação
            </button>
          </div>
          <div className="space-y-2">
            {draft.actions.map((ac, i) => {
              const am = ACTION_TYPES.find((t) => t.value === ac.type);
              const AI = am?.icon ?? Zap;
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center">
                      <AI className="w-4 h-4" />
                    </div>
                    <select
                      value={ac.type}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          actions: draft.actions.map((x, k) => (k === i ? { type: e.target.value, params: {} } : x)),
                        })
                      }
                      className="flex-1 px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    >
                      {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button
                      onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, k) => k !== i) })}
                      className="w-8 h-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Params por tipo */}
                  {ac.type === "move_to_stage" && (
                    <select
                      value={(ac.params?.stageId as string) ?? ""}
                      onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), stageId: e.target.value } } : x) })}
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    >
                      <option value="">- etapa alvo -</option>
                      {board.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {ac.type === "assign_to_user" && (
                    <select
                      value={(ac.params?.userId as string) ?? ""}
                      onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), userId: e.target.value } } : x) })}
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    >
                      <option value="">- membro -</option>
                      {board.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                  {ac.type === "set_priority" && (
                    <select
                      value={(ac.params?.priority as string) ?? "alta"}
                      onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), priority: e.target.value } } : x) })}
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    >
                      {(["baixa", "media", "alta", "urgente"] as const).map((p) => (
                        <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                      ))}
                    </select>
                  )}
                  {ac.type === "extend_due" && (
                    <input
                      type="number" min={1}
                      value={(ac.params?.hours as number) ?? 24}
                      onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), hours: Number(e.target.value) } } : x) })}
                      placeholder="Horas para adiar"
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    />
                  )}
                  {ac.type === "add_tag" && (
                    <input
                      value={(ac.params?.tag as string) ?? ""}
                      onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), tag: e.target.value } } : x) })}
                      placeholder="Ex.: retrabalho, gargalo, atrasada"
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    />
                  )}
                  {(ac.type === "notify_assignee" || ac.type === "add_comment") && (
                    <input
                      value={(ac.params?.text as string) ?? ""}
                      onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), text: e.target.value } } : x) })}
                      placeholder={ac.type === "notify_assignee" ? "Mensagem para o responsável (opcional)" : "Texto do comentário"}
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                    />
                  )}
                  {ac.type === "create_child_task" && (
                    <div className="space-y-1.5">
                      <input
                        value={(ac.params?.title as string) ?? ""}
                        onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), title: e.target.value } } : x) })}
                        placeholder="Título da subtarefa (obrigatório)"
                        className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                      />
                      <input
                        value={(ac.params?.description as string) ?? ""}
                        onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), description: e.target.value } } : x) })}
                        placeholder="Descrição (opcional)"
                        className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={(ac.params?.priority as string) ?? "media"}
                          onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), priority: e.target.value } } : x) })}
                          className="px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                        >
                          <option value="baixa">Baixa</option>
                          <option value="media">Média</option>
                          <option value="alta">Alta</option>
                          <option value="urgente">Urgente</option>
                        </select>
                        <select
                          value={(ac.params?.assignTo as string) ?? "same"}
                          onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((x, k) => k === i ? { ...x, params: { ...(x.params ?? {}), assignTo: e.target.value } } : x) })}
                          className="px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                        >
                          <option value="same">Mesmo responsável</option>
                          <option value="manager">Gestor do setor</option>
                          <option value="unassigned">Sem responsável</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {am?.hint && <p className="text-[11px] text-muted-foreground">{am.hint}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ativar */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            className="w-4 h-4"
          />
          Automação ativa
        </label>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {editing ? "Editando automação existente" : "Nova automação"}
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={!draft.name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {editing ? "Salvar alterações" : "Criar automação"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== REVIEWS ====================
function ReviewsView({
  onOpenTask,
  onRefresh,
  canManage,
}: {
  onOpenTask: (id: string) => void;
  onRefresh: () => void;
  canManage: boolean;
}) {
  const load = useServerFn(listPendingReviews);
  const approve = useServerFn(approveTaskReview);
  const returnFn = useServerFn(returnTaskReview);
  const q = useQuery<PendingReviewTask[]>({
    queryKey: ["workflow-pending-reviews"],
    queryFn: () => load(),
    refetchInterval: 20_000,
  });
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workflow-pending-reviews"] });
    onRefresh();
  };
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const loadSettings = useServerFn(getReviewSettings);
  const saveSettings = useServerFn(setReviewSettings);
  const settingsQ = useQuery({
    queryKey: ["workflow-review-settings"],
    queryFn: () => loadSettings(),
    enabled: canManage,
  });

  const header = canManage ? (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Quem revisa</span>
      <select
        value={settingsQ.data?.mode ?? "leader"}
        onChange={async (e) => {
          await saveSettings({ data: { mode: e.target.value as "leader" | "admin" } });
          qc.invalidateQueries({ queryKey: ["workflow-review-settings"] });
        }}
        className="text-sm rounded-md border border-border bg-background px-2 py-1.5"
      >
        <option value="leader">Líder do setor (com fallback para o admin)</option>
        <option value="admin">Sempre o administrador principal</option>
      </select>
    </div>
  ) : null;

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Carregando revisões…</div>;
  const rows = q.data ?? [];
  if (!rows.length) {
    return (
      <div className="h-full overflow-y-auto space-y-3">
        {header}
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Check className="w-8 h-8 mx-auto text-green-600 mb-2" />
          <p className="text-sm font-medium">Nenhuma tarefa aguardando revisão.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto space-y-3">
      {header}
      {rows.map((t) => (
        <div key={t.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button onClick={() => onOpenTask(t.id)} className="text-sm font-semibold hover:underline text-left">
                {t.title}
              </button>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {t.sectorName && <span>Setor: {t.sectorName}</span>}
                <span>Fluxo: {t.pipelineName}</span>
                {t.assigneeName && <span>Por: {t.assigneeName}</span>}
                {t.submittedAt && <span>Enviado em: {new Date(t.submittedAt).toLocaleString("pt-BR")}</span>}
                {typeof t.reviewRound === "number" && t.reviewRound > 1 && (
                  <span className="text-amber-700">Rodada {t.reviewRound} (retrabalho)</span>
                )}
              </div>
              {t.status === "incompleta" && (
                <div className="mt-2 text-xs rounded-md bg-red-50 border border-red-200 text-red-800 px-2 py-1">
                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                  Marcada como incompleta{t.incompleteReason ? `: ${t.incompleteReason}` : "."}
                </div>
              )}
            </div>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded",
                t.status === "concluida" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
              )}
            >
              {t.status === "concluida" ? "Concluída" : "Incompleta"}
            </span>
          </div>
          <textarea
            value={notesById[t.id] ?? ""}
            onChange={(e) => setNotesById((s) => ({ ...s, [t.id]: e.target.value }))}
            placeholder="Nota da revisão (obrigatória ao devolver)…"
            rows={2}
            className="text-sm rounded-md border border-border bg-background px-2 py-1.5 resize-none"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={async () => {
                const notes = notesById[t.id]?.trim() ?? "";
                if (!notes) {
                  alert("Escreva uma nota explicando o que falta.");
                  return;
                }
                await returnFn({ data: { taskId: t.id, notes } });
                setNotesById((s) => { const c = { ...s }; delete c[t.id]; return c; });
                refresh();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-sm hover:bg-red-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Devolver
            </button>
            <button
              onClick={async () => {
                await approve({ data: { taskId: t.id, notes: notesById[t.id]?.trim() || undefined } });
                setNotesById((s) => { const c = { ...s }; delete c[t.id]; return c; });
                refresh();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700"
            >
              <Check className="w-3.5 h-3.5" /> Aprovar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== HISTORY ====================
function HistoryView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"todos" | "concluida" | "incompleta">("todos");
  const load = useServerFn(searchTaskHistory);
  const q = useQuery<HistoryTask[]>({
    queryKey: ["workflow-history", query],
    queryFn: () => load({ data: { query: query || undefined, limit: 200 } }),
  });
  const rows = (q.data ?? []).filter((r) => status === "todos" || r.status === status);
  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título…"
          className="text-sm rounded-md border border-border bg-background px-3 py-1.5 flex-1"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="text-sm rounded-md border border-border bg-background px-2 py-1.5"
        >
          <option value="todos">Todos</option>
          <option value="concluida">Concluída</option>
          <option value="incompleta">Incompleta</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Tarefa</th>
              <th className="text-left px-3 py-2">Setor</th>
              <th className="text-left px-3 py-2">Fluxo</th>
              <th className="text-left px-3 py-2">Responsável</th>
              <th className="text-left px-3 py-2">Tempo</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Revisão</th>
              <th className="text-left px-3 py-2">Concluída em</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Sem resultados.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                <td className="px-3 py-2">
                  <button onClick={() => onOpenTask(r.id)} className="hover:underline text-left">{r.title}</button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.sectorName ?? "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.pipelineName}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.assigneeName ?? "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDuration(r.timeSpentSeconds)}</td>
                <td className="px-3 py-2">
                  <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded",
                    r.status === "concluida" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{r.reviewStatus ?? "-"}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {r.completedAt ? new Date(r.completedAt).toLocaleString("pt-BR") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== SECTORS DIALOG ====================
function SectorsDialog({
  onClose,
  members,
  onChanged,
}: {
  onClose: () => void;
  members: { id: string; name: string; email: string | null; avatarUrl: string | null }[];
  onChanged: () => void;
}) {
  const loadSectors = useServerFn(listSectors);
  const save = useServerFn(saveSector);
  const del = useServerFn(deleteSector);
  const q = useQuery<WorkflowSector[]>({ queryKey: ["workflow-sectors"], queryFn: () => loadSectors() });
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workflow-sectors"] });
    onChanged();
  };
  const [editing, setEditing] = useState<Partial<WorkflowSector> | null>(null);
  const rows = q.data ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><UserCircle className="w-4 h-4" /> Setores</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {rows.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">· {s.memberIds.length} membro(s)</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(s)} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Editar</button>
                <button
                  onClick={async () => {
                    if (!confirm(`Excluir setor "${s.name}"? Fluxos vinculados ficarão sem setor.`)) return;
                    await del({ data: { id: s.id } });
                    refresh();
                  }}
                  className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && !q.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum setor criado ainda.</p>
          )}
        </div>
        <div className="p-4 border-t border-border">
          <button
            onClick={() => setEditing({ name: "", color: "#6366f1", memberIds: [] })}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Novo setor
          </button>
        </div>
      </div>

      {editing && (
        <SectorEditorInline
          initial={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await save({ data: payload });
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SectorEditorInline({
  initial,
  members,
  onClose,
  onSave,
}: {
  initial: Partial<WorkflowSector>;
  members: { id: string; name: string }[];
  onClose: () => void;
  onSave: (p: { id?: string; name: string; color: string; memberIds: string[]; managerId: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [color, setColor] = useState(initial.color ?? "#6366f1");
  const [memberIds, setMemberIds] = useState<string[]>(initial.memberIds ?? []);
  const [managerId, setManagerId] = useState<string | null>(initial.managerId ?? null);
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">{initial.id ? "Editar setor" : "Novo setor"}</h3>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Cor</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-8 rounded" />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Gestor do setor</label>
          <select value={managerId ?? ""} onChange={(e) => setManagerId(e.target.value || null)} className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5">
            <option value="">- sem gestor -</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Membros</label>
          <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-md p-2">
            {members.map((m) => {
              const checked = memberIds.includes(m.id);
              return (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setMemberIds((cur) => e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id));
                    }}
                  />
                  {m.name}
                </label>
              );
            })}
            {members.length === 0 && <p className="text-xs text-muted-foreground">Sem membros no workspace.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-sm">Cancelar</button>
          <button
            onClick={async () => {
              if (!name.trim()) return;
              await onSave({ id: initial.id, name: name.trim(), color, memberIds, managerId });
            }}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== PIPELINES DIALOG ====================
function PipelinesDialog({
  board,
  onClose,
  onChanged,
}: {
  board: WorkflowBoard;
  onClose: () => void;
  onChanged: () => void;
}) {
  const loadSectors = useServerFn(listSectors);
  const create = useServerFn(createPipeline);
  const update = useServerFn(updatePipeline);
  const del = useServerFn(deletePipeline);
  const secQ = useQuery<WorkflowSector[]>({ queryKey: ["workflow-sectors"], queryFn: () => loadSectors() });
  const sectors = secQ.data ?? [];
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [sectorId, setSectorId] = useState<string>("");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><WorkflowIcon className="w-4 h-4" /> Fluxos de trabalho</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {board.pipelines.map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color ?? "#6366f1" }} />
                  {p.name}
                  {p.isDefault && <span className="text-[10px] uppercase text-muted-foreground">(padrão)</span>}
                </div>
                <div className="text-xs text-muted-foreground">Setor: {p.sectorName ?? "- (visível apenas para gestores)"}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={p.sectorId ?? ""}
                  onChange={async (e) => {
                    await update({ data: { id: p.id, sectorId: e.target.value || null } });
                    onChanged();
                  }}
                  className="text-xs rounded border border-border bg-background px-2 py-1"
                >
                  <option value="">- sem setor -</option>
                  {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {!p.isDefault && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Excluir fluxo "${p.name}"? Todas as tarefas serão removidas.`)) return;
                      await del({ data: { id: p.id } });
                      onChanged();
                    }}
                    className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Novo fluxo</div>
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fluxo" className="flex-1 text-sm rounded-md border border-border bg-background px-2 py-1.5" />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-9 rounded" />
            <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="text-sm rounded-md border border-border bg-background px-2 py-1.5">
              <option value="">Sem setor</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              onClick={async () => {
                if (!name.trim()) return;
                await create({ data: { name: name.trim(), color, sectorId: sectorId || null } });
                setName("");
                onChanged();
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
            >
              <Plus className="w-4 h-4" /> Criar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FUNCIONÁRIO DO MÊS — componente externo em src/components/workflow/EmployeeOfMonthView.tsx
// ============================================================================
