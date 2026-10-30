import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getWorkflowBoard, type WorkflowBoard } from "@/lib/workflow.functions";
import {
  createManualWorkflowTask,
  duplicateManualWorkflowTask,
  moveManualWorkflowTask,
} from "@/lib/workflow-manual.functions";
import { improveSalesbotMessage } from "@/lib/salesbot-message-ai.functions";
import { getWorkspaceStorageUsage } from "@/lib/storage.functions";
import { STORAGE_ADDONS, type StorageAddonCode } from "@/lib/billing/storage-catalog";
import {
  createStorageAddonCheckout,
  confirmStorageAddonCheckout,
} from "@/lib/billing/storage-addon-checkout.functions";

const TASK_DRAG_MIME = "application/x-mkton-workflow-task";

function currentPath() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

function textOf(element: Element | null) {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function nativeSetValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function findControlByLabel(
  root: ParentNode,
  labelText: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const labels = Array.from(root.querySelectorAll("label"));
  const label = labels.find((item) => textOf(item).toLowerCase().includes(labelText.toLowerCase()));
  if (!label) return null;
  return label.parentElement?.querySelector("select,input,textarea") ?? null;
}

function useLocationTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setTick((value) => value + 1);
    window.addEventListener("popstate", onChange);
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = function (...args) {
      originalPush.apply(this, args);
      onChange();
    };
    history.replaceState = function (...args) {
      originalReplace.apply(this, args);
      onChange();
    };
    return () => {
      window.removeEventListener("popstate", onChange);
      history.pushState = originalPush;
      history.replaceState = originalReplace;
    };
  }, []);
  return tick;
}

function parseLinks(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[placeholder="https://..."]'))
    .map((urlInput) => {
      const row = urlInput.parentElement;
      const labelInput = row?.querySelector<HTMLInputElement>('input[placeholder="Rótulo"]');
      return { label: labelInput?.value.trim() ?? "", url: urlInput.value.trim() };
    })
    .filter((item) => item.url);
}

function parseCredentials(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[placeholder^="Sistema (ex:"]'))
    .map((labelInput) => {
      const card = labelInput.closest(".rounded.border") ?? labelInput.parentElement?.parentElement;
      const inputs = Array.from(card?.querySelectorAll<HTMLInputElement>("input") ?? []);
      return {
        label: labelInput.value.trim(),
        username: inputs.find((input) => input.placeholder === "Usuário / e-mail")?.value ?? "",
        password: inputs.find((input) => input.placeholder === "Senha")?.value ?? "",
        notes: inputs.find((input) => input.placeholder.startsWith("Notas (2FA"))?.value ?? "",
      };
    })
    .filter((item) => item.label);
}

function WorkflowEnhancer() {
  const locationTick = useLocationTick();
  const enabled = currentPath() === "/fluxo-trabalho";
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const loadBoard = useServerFn(getWorkflowBoard);
  const createTask = useServerFn(createManualWorkflowTask);
  const moveTask = useServerFn(moveManualWorkflowTask);
  const duplicateTask = useServerFn(duplicateManualWorkflowTask);
  const queryClient = useQueryClient();
  const preferredPipelineRef = useRef<string | null>(null);
  const pendingStageRef = useRef<string | null>(null);

  const boardQ = useQuery<WorkflowBoard>({
    queryKey: ["workflow-enhancer-board", pipelineId],
    queryFn: () => loadBoard({ data: pipelineId ? { pipelineId } : {} }),
    enabled,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];

    const invalidateBoard = async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-board"] });
      await queryClient.invalidateQueries({ queryKey: ["workflow-enhancer-board"] });
    };

    const scan = () => {
      if (cancelled) return;
      const board = boardQ.data;
      if (!board) return;

      const topPipelineSelect = Array.from(document.querySelectorAll("select")).find((select) => {
        const parent = select.parentElement;
        return Boolean(
          parent
          && textOf(parent).startsWith("Fluxo")
          && Array.from(select.options).some((option) => board.pipelines.some((pipeline) => pipeline.id === option.value)),
        );
      }) as HTMLSelectElement | undefined;
      if (topPipelineSelect?.value && topPipelineSelect.value !== pipelineId) {
        setPipelineId(topPipelineSelect.value);
      }

      const stageColumns = Array.from(document.querySelectorAll<HTMLElement>('[class*="group/stage"]'));
      const editMode = Array.from(document.querySelectorAll("button")).some((button) => textOf(button) === "Concluir edição");

      for (const stage of board.stages) {
        const column = stageColumns.find((candidate) => textOf(candidate).includes(stage.name));
        if (!column) continue;
        column.dataset.mktonWorkflowStageId = stage.id;

        const addTaskButton = column.querySelector<HTMLButtonElement>('button[aria-label="Adicionar tarefa"]');
        if (addTaskButton && addTaskButton.dataset.mktonStageCapture !== "1") {
          addTaskButton.dataset.mktonStageCapture = "1";
          const rememberStage = () => { pendingStageRef.current = stage.id; };
          addTaskButton.addEventListener("click", rememberStage, true);
          cleanupFns.push(() => addTaskButton.removeEventListener("click", rememberStage, true));
        }

        if (board.canManage && !editMode && column.dataset.mktonTaskDrop !== "1") {
          column.dataset.mktonTaskDrop = "1";
          const onDragOver = (event: DragEvent) => {
            if (event.dataTransfer?.types.includes(TASK_DRAG_MIME)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              column.classList.add("ring-2", "ring-primary/60");
            }
          };
          const onDragLeave = () => column.classList.remove("ring-2", "ring-primary/60");
          const onDrop = async (event: DragEvent) => {
            const taskId = event.dataTransfer?.getData(TASK_DRAG_MIME);
            if (!taskId) return;
            event.preventDefault();
            event.stopPropagation();
            column.classList.remove("ring-2", "ring-primary/60");
            const tasksInStage = board.tasks.filter((task) => task.stageId === stage.id);
            try {
              await moveTask({ data: { taskId, stageId: stage.id, position: tasksInStage.length } });
              await invalidateBoard();
              toast.success("Tarefa movida.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível mover a tarefa.");
            }
          };
          column.addEventListener("dragover", onDragOver);
          column.addEventListener("dragleave", onDragLeave);
          column.addEventListener("drop", onDrop, true);
          cleanupFns.push(() => {
            column.removeEventListener("dragover", onDragOver);
            column.removeEventListener("dragleave", onDragLeave);
            column.removeEventListener("drop", onDrop, true);
          });
        }

        const cards = Array.from(column.querySelectorAll<HTMLElement>(".group.rounded-lg.border.bg-card"));
        const stageTasks = board.tasks.filter((task) => task.stageId === stage.id);
        const used = new Set<string>();
        for (const card of cards) {
          const task = stageTasks.find((candidate) => !used.has(candidate.id) && textOf(card).includes(candidate.title));
          if (!task) continue;
          used.add(task.id);
          card.draggable = board.canManage && !editMode;
          card.dataset.mktonWorkflowTaskId = task.id;
          if (board.canManage && card.dataset.mktonTaskDrag !== "1") {
            card.dataset.mktonTaskDrag = "1";
            const onDragStart = (event: DragEvent) => {
              if (editMode) {
                event.preventDefault();
                return;
              }
              event.stopPropagation();
              event.dataTransfer?.setData(TASK_DRAG_MIME, task.id);
              if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            };
            card.addEventListener("dragstart", onDragStart);
            cleanupFns.push(() => card.removeEventListener("dragstart", onDragStart));
          }

          const controls = card.querySelector<HTMLElement>(".flex.items-center.gap-1.px-2.pt-2");
          if (board.canManage && controls && !controls.querySelector('[data-mkton-duplicate-task="1"]')) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.mktonDuplicateTask = "1";
            button.title = "Duplicar tarefa";
            button.setAttribute("aria-label", "Duplicar tarefa");
            button.className = "w-6 h-6 grid place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground ml-auto";
            button.innerHTML = '<span aria-hidden="true" style="font-size:14px;line-height:1">⧉</span>';
            button.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              button.disabled = true;
              try {
                await duplicateTask({ data: { taskId: task.id } });
                await invalidateBoard();
                toast.success("Tarefa duplicada.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Não foi possível duplicar a tarefa.");
              } finally {
                button.disabled = false;
              }
            });
            controls.appendChild(button);
          }
        }
      }

      const form = Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((candidate) => {
        return Array.from(candidate.querySelectorAll("h2")).some((heading) => textOf(heading) === "Nova tarefa");
      });
      if (!form) {
        preferredPipelineRef.current = null;
        return;
      }

      const pipelineSelect = findControlByLabel(form, "Fluxo de destino") as HTMLSelectElement | null;
      const assigneeSelect = findControlByLabel(form, "Responsável") as HTMLSelectElement | null;
      if (pipelineSelect) {
        if (!preferredPipelineRef.current) preferredPipelineRef.current = pipelineSelect.value;
        const label = Array.from(form.querySelectorAll("label")).find((item) => textOf(item).includes("Fluxo de destino"));
        const hint = label?.querySelector("span");
        if (hint) hint.textContent = " (escolha manual; o responsável não altera o fluxo)";
        if (pipelineSelect.dataset.mktonPipelineGuard !== "1") {
          pipelineSelect.dataset.mktonPipelineGuard = "1";
          const remember = (event: Event) => {
            if (event.isTrusted) preferredPipelineRef.current = pipelineSelect.value;
          };
          pipelineSelect.addEventListener("change", remember);
          cleanupFns.push(() => pipelineSelect.removeEventListener("change", remember));
        }
        if (assigneeSelect && assigneeSelect.dataset.mktonPipelineGuard !== "1") {
          assigneeSelect.dataset.mktonPipelineGuard = "1";
          const preserve = () => {
            const intended = preferredPipelineRef.current;
            window.setTimeout(() => {
              if (intended && pipelineSelect.isConnected && pipelineSelect.value !== intended) {
                nativeSetValue(pipelineSelect, intended);
              }
            }, 0);
          };
          assigneeSelect.addEventListener("change", preserve);
          cleanupFns.push(() => assigneeSelect.removeEventListener("change", preserve));
        }
      }

      if (form.dataset.mktonManualSubmit !== "1") {
        form.dataset.mktonManualSubmit = "1";
        const manualSubmit = async (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          const title = (findControlByLabel(form, "Título") as HTMLInputElement | null)?.value.trim() ?? "";
          if (!title) return;
          const description = (findControlByLabel(form, "Descrição detalhada") as HTMLTextAreaElement | null)?.value.trim() ?? "";
          const priority = ((findControlByLabel(form, "Prioridade") as HTMLSelectElement | null)?.value ?? "media") as "baixa" | "media" | "alta" | "urgente";
          const dueRaw = (findControlByLabel(form, "Prazo") as HTMLInputElement | null)?.value ?? "";
          const estimatedRaw = (findControlByLabel(form, "Tempo estimado") as HTMLInputElement | null)?.value ?? "";
          const tagsRaw = (findControlByLabel(form, "Tags") as HTMLInputElement | null)?.value ?? "";
          const targetPipelineId = pipelineSelect?.value || board.pipelineId;
          const stageId = targetPipelineId === board.pipelineId ? pendingStageRef.current ?? undefined : undefined;
          const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (submitButton) submitButton.disabled = true;

          try {
            await createTask({
              data: {
                pipelineId: targetPipelineId,
                stageId,
                title,
                description: description || undefined,
                priority,
                dueAt: dueRaw ? new Date(dueRaw).toISOString() : undefined,
                assigneeId: assigneeSelect?.value || null,
                estimatedSeconds: estimatedRaw ? Math.round(Number.parseFloat(estimatedRaw) * 3600) : null,
                tags: tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean),
                links: parseLinks(form),
                credentials: parseCredentials(form),
              },
            });
            pendingStageRef.current = null;
            preferredPipelineRef.current = null;
            await invalidateBoard();
            toast.success("Tarefa criada no fluxo selecionado.");
            const closeButton = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="button"]')).find((button) => textOf(button) === "Cancelar")
              ?? form.querySelector<HTMLButtonElement>('button[type="button"]');
            closeButton?.click();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível criar a tarefa.");
          } finally {
            if (submitButton?.isConnected) submitButton.disabled = false;
          }
        };
        form.addEventListener("submit", manualSubmit, true);
        cleanupFns.push(() => form.removeEventListener("submit", manualSubmit, true));
      }
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }, [enabled, locationTick, boardQ.data, pipelineId, createTask, moveTask, duplicateTask, queryClient]);

  return null;
}

function SalesbotEnhancer() {
  useLocationTick();
  const improve = useServerFn(improveSalesbotMessage);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const scan = () => {
      const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-wrapper]"));
      for (const block of blocks) {
        const header = block.querySelector<HTMLElement>(".cursor-move");
        if (!header || !/\bmensagem\b/i.test(textOf(header))) continue;
        const textarea = block.querySelector<HTMLTextAreaElement>("textarea");
        if (!textarea || textarea.parentElement?.querySelector('[data-mkton-salesbot-ai="1"]')) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.mktonSalesbotAi = "1";
        button.title = "Aprimorar mensagem com IA";
        button.setAttribute("aria-label", "Aprimorar mensagem com IA");
        button.className = "mt-1 inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-50";
        button.innerHTML = '<span aria-hidden="true">✦</span><span>Aprimorar com IA</span>';
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const original = textarea.value.trim();
          if (!original) {
            toast.error("Escreva a mensagem antes de aprimorar.");
            return;
          }
          button.disabled = true;
          const originalHtml = button.innerHTML;
          button.textContent = "Aprimorando...";
          try {
            const result = await improve({ data: { text: original } });
            nativeSetValue(textarea, result.text);
            toast.success("Mensagem aprimorada.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível aprimorar a mensagem.");
          } finally {
            button.disabled = false;
            button.innerHTML = originalHtml;
          }
        });
        textarea.parentElement.appendChild(button);
      }
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [improve]);
  return null;
}

function formatGb(bytes: number) {
  return `${(bytes / (1024 ** 3)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
}

function StorageUsageCard({ workspaceId }: { workspaceId: string }) {
  const getUsage = useServerFn(getWorkspaceStorageUsage);
  const createCheckout = useServerFn(createStorageAddonCheckout);
  const confirmCheckout = useServerFn(confirmStorageAddonCheckout);
  const queryClient = useQueryClient();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buying, setBuying] = useState<StorageAddonCode | null>(null);
  const environment = typeof window !== "undefined"
    && (window.location.hostname === "localhost" || window.location.hostname.includes("preview"))
    ? "sandbox" as const
    : "live" as const;
  const usageQ = useQuery({
    queryKey: ["workspace-storage-usage", workspaceId],
    queryFn: () => getUsage({ data: { workspaceId } }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("storage_checkout");
    if (!sessionId) return;
    void (async () => {
      try {
        const result = await confirmCheckout({ data: { sessionId, environment } });
        if (result.active) toast.success("Armazenamento adicional ativado.");
        else toast.info("Pagamento ainda está sendo confirmado.");
        await queryClient.invalidateQueries({ queryKey: ["workspace-storage-usage", workspaceId] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a compra de armazenamento.");
      } finally {
        params.delete("storage_checkout");
        const query = params.toString();
        history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      }
    })();
  }, [confirmCheckout, environment, queryClient, workspaceId]);

  const usage = usageQ.data;
  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm" data-mkton-storage-usage="1">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <HardDrive className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Armazenamento interno</div>
          {usageQ.isLoading ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Calculando uso real...
            </div>
          ) : usageQ.isError ? (
            <div className="mt-1 text-xs text-red-600">Não foi possível carregar o armazenamento.</div>
          ) : usage ? (
            <>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatGb(usage.usedBytes)} usados de {formatGb(usage.limitBytes)} · {formatGb(usage.availableBytes)} restantes
              </div>
              <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, usage.percentUsed))}%` }}
                />
              </div>
              {usage.addonGb > 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">Inclui +{usage.addonGb} GB adicionais ativos.</div>
              )}
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setBuyOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
      >
        Comprar mais armazenamento
      </button>
      {buyOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" onClick={() => setBuyOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Mais armazenamento</h3>
                <p className="mt-1 text-xs text-muted-foreground">O adicional é aplicado ao workspace atual após a confirmação do pagamento.</p>
              </div>
              <button onClick={() => setBuyOpen(false)} className="rounded p-1 hover:bg-muted" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {STORAGE_ADDONS.map((addon) => (
                <button
                  key={addon.code}
                  disabled={buying !== null}
                  onClick={async () => {
                    setBuying(addon.code);
                    try {
                      const returnUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
                      const result = await createCheckout({ data: { addonCode: addon.code, environment, returnUrl } });
                      window.location.assign(result.url);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o checkout.");
                      setBuying(null);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-3 text-left hover:bg-muted disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-medium">{addon.label}</span>
                    <span className="text-[11px] text-muted-foreground">Armazenamento adicional</span>
                  </span>
                  <span className="text-sm font-semibold">
                    R$ {(addon.monthlyPriceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BillingEnhancer() {
  const locationTick = useLocationTick();
  const enabled = currentPath() === "/configuracoes";
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setWorkspaceId(null);
      return;
    }
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      setWorkspaceId(profile?.current_workspace_id ?? null);
    })();
  }, [enabled, locationTick]);

  useEffect(() => {
    if (!enabled) {
      setHost(null);
      return;
    }
    const scan = () => {
      const existing = document.querySelector<HTMLElement>('[data-mkton-storage-host="1"]');
      if (existing) {
        setHost(existing);
        return;
      }
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,div,p,span"));
      const usageTitle = candidates.find((element) => textOf(element) === "Uso do plano");
      if (!usageTitle) {
        setHost(null);
        return;
      }
      const container = usageTitle.parentElement?.parentElement ?? usageTitle.parentElement;
      if (!container) return;
      const mount = document.createElement("div");
      mount.dataset.mktonStorageHost = "1";
      container.appendChild(mount);
      setHost(mount);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      setHost(null);
    };
  }, [enabled, locationTick]);

  if (!enabled || !workspaceId || !host) return null;
  return createPortal(<StorageUsageCard workspaceId={workspaceId} />, host);
}

export function WorkflowSalesbotBillingEnhancer() {
  return (
    <>
      <WorkflowEnhancer />
      <SalesbotEnhancer />
      <BillingEnhancer />
    </>
  );
}
