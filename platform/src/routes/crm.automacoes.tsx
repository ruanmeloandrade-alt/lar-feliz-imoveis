import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { AlertTriangle } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Route as LegacyAutomacoesRoute } from "@/legacy/crm.automacoes.legacy";
import { RobustAutomationSurface } from "@/components/automations/RobustAutomationSurface";

const LegacyAutomacoesComponent = LegacyAutomacoesRoute.options.component as ComponentType | undefined;

export const Route = createFileRoute("/crm/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações e SalesBots · Vanessa Simoni" },
      { name: "description", content: "SalesBots, agentes, grupos e relatórios operacionais da Vanessa Simoni." },
    ],
  }),
  component: AutomacoesPage,
  errorComponent: AutomacoesError,
  notFoundComponent: AutomacoesNotFound,
});

function AutomacoesPage() {
  if (!LegacyAutomacoesComponent) {
    return <AutomacoesFallback message="Não foi possível carregar a Central de Automações." />;
  }

  return (
    <RobustAutomationSurface>
      <LegacyAutomacoesComponent />
    </RobustAutomationSurface>
  );
}

function AutomacoesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <AutomacoesFallback
      message="A Central de Automações encontrou um erro. Seus fluxos não foram apagados."
      detail={error.message}
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}

function AutomacoesNotFound() {
  return <AutomacoesFallback message="A área de automações solicitada não foi encontrada." />;
}

function AutomacoesFallback({
  message,
  detail,
  actionLabel,
  onAction,
}: {
  message: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl rounded-lg border border-destructive/25 bg-card p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold">Automações indisponíveis</h1>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{message}</p>
              {detail && <p className="mt-2 break-words text-[11px] text-muted-foreground">{detail}</p>}
              {actionLabel && onAction && (
                <button type="button" onClick={onAction} className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                  {actionLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
