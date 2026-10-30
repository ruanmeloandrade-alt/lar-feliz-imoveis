import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GroupBotActionsEnhancer } from "@/components/automations/GroupBotActionsEnhancer";
import { GroupExactScheduleRule } from "@/components/automations/GroupExactScheduleRule";

type AutomationView = "bots" | "agentes" | "grupos" | "relatorios";

const AUTOMATION_VIEW_STORAGE_KEY = "mkton:crm-automacoes:active-view";
const AUTOMATION_VIEWS = new Set<AutomationView>(["bots", "agentes", "grupos", "relatorios"]);

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function viewFromButton(button: HTMLButtonElement): AutomationView | null {
  const label = normalizeLabel(button.textContent ?? "");
  if (label.includes("salesbots")) return "bots";
  if (label.includes("agentes ia")) return "agentes";
  if (label === "grupos" || label.endsWith(" grupos")) return "grupos";
  if (label.includes("relatorios")) return "relatorios";
  return null;
}

function isAutomationView(value: string | null): value is AutomationView {
  return !!value && AUTOMATION_VIEWS.has(value as AutomationView);
}

function persistAutomationView(view: AutomationView) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTOMATION_VIEW_STORAGE_KEY, view);
  } catch {
    // A URL continua sendo a fonte de persistência quando storage estiver indisponível.
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get("view") !== view) {
    url.searchParams.set("view", view);
    window.history.replaceState(window.history.state, "", url.toString());
  }
  window.dispatchEvent(new CustomEvent("mkton:automation-view", { detail: view }));
}

function AutomationViewRefreshGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    let requestedView = params.get("view");
    if (!isAutomationView(requestedView)) {
      try {
        requestedView = window.sessionStorage.getItem(AUTOMATION_VIEW_STORAGE_KEY);
      } catch {
        requestedView = null;
      }
    }
    const viewToRestore: AutomationView = isAutomationView(requestedView) ? requestedView : "bots";

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      if (!button.closest("[data-automation-page] header")) return;
      const view = viewFromButton(button);
      if (view) persistAutomationView(view);
    };
    document.addEventListener("click", onClick, true);

    let restored = false;
    const restore = () => {
      if (restored) return true;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-automation-page] header button"),
      );
      const target = buttons.find((button) => viewFromButton(button) === viewToRestore);
      if (!target) return false;
      restored = true;
      persistAutomationView(viewToRestore);
      if (viewToRestore !== "bots") target.click();
      return true;
    };

    const observer = new MutationObserver(() => {
      if (restore()) observer.disconnect();
    });

    if (!restore()) observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}

export function RobustAutomationSurface({ children }: { children: ReactNode }) {
  return (
    <div
      data-operational-surface="crm-automacoes"
      className={cn(
        "h-screen overflow-hidden bg-background",
        // O reparo/materialização continua interno e não pertence à superfície do produto.
        "[&_header>div:first-child>div:nth-child(2)]:hidden",
        // Central: cabeçalho mais forte e navegação mais claramente segmentada.
        "[&_header]:!min-h-16 [&_header]:!px-4 md:[&_header]:!px-6",
        "[&_header]:border-b [&_header]:border-border/80 [&_header]:bg-card/95",
        "[&_header_button]:!rounded-md [&_header_label]:!rounded-md",
        "[&_header_[class*='tracking-']]:tracking-widest",
        "[&_[data-automation-page]>main]:bg-muted/20",
        "[&_[data-automation-page]>main>div]:!p-4 md:[&_[data-automation-page]>main>div]:!p-6",
        "[&_[data-automation-page]_table]:text-sm",
        "[&_[data-automation-page]_thead]:bg-muted/40",
        "[&_[data-automation-page]_tbody_tr]:h-12",
        "[&_[data-automation-page]_.rounded-lg]:rounded-md",
        "[&_[data-automation-page]_.shadow-sm]:shadow-none",
        // Painéis de Agentes/Grupos/Relatórios ganham presença visual perceptível.
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card]:border-border/80",
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card]:bg-background",
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card]:!rounded-lg",
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card]:shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card>div:first-child]:!px-5",
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card>div:first-child]:!py-4",
        "[&_[data-automation-page]>main_.rounded-lg.border.bg-card>div.p-5]:!p-5",
        // SalesBot Builder é uma superfície própria. Fundo precisa ser 100% opaco para não vazar a listagem por baixo.
        "[&_[data-automation-builder]]:!bg-background",
        "[&_[data-automation-builder]]:isolate",
        "[&_[data-automation-builder]]:shadow-2xl",
        "[&_[data-automation-builder]>header]:!h-14",
        "[&_[data-automation-builder]>header]:!px-5",
        "[&_[data-automation-builder]>header]:border-b",
        "[&_[data-automation-builder]>header]:border-border/90",
        "[&_[data-automation-builder]>header]:bg-card",
        "[&_[data-automation-builder]_.rounded-2xl]:!rounded-lg",
        "[&_[data-automation-builder]_.rounded-xl]:!rounded-lg",
        "[&_[data-automation-builder]_[class*='shadow']]:shadow-sm",
        "[&_[data-automation-builder]_button]:focus-visible:outline-none",
        "[&_[data-automation-builder]_button]:focus-visible:ring-2",
        "[&_[data-automation-builder]_button]:focus-visible:ring-primary/35",
        // Modais/editors: menos aparência de protótipo e melhor separação da área de trabalho.
        "[&_.fixed.inset-0]:backdrop-blur-sm",
        "[&_.fixed.inset-0_.rounded-2xl]:!rounded-lg",
        "[&_.fixed.inset-0_.rounded-xl]:!rounded-lg",
        "[&_.fixed.inset-0_[class*='shadow']]:shadow-xl",
        "[&_.rounded-full]:!rounded-md",
        // Foco previsível em toda a frente.
        "[&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2",
        "[&_button]:focus-visible:ring-primary/30 [&_button]:focus-visible:ring-offset-1",
        "[&_input]:focus-visible:outline-none [&_textarea]:focus-visible:outline-none",
      )}
    >
      {children}
      <AutomationViewRefreshGuard />
      <GroupBotActionsEnhancer />
      <GroupExactScheduleRule />
    </div>
  );
}
