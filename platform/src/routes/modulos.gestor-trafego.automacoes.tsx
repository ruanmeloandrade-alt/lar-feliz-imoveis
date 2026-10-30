import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Component, Suspense, type ReactNode } from "react";
import { safeLazy as lazy } from "@/lib/safe-lazy";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { getActiveWorkspace } from "@/lib/workspace.functions";

const MetaAutomationWorkspace = lazy(() =>
  import("@/components/meta/MetaAutomationWorkspace").then((m) => ({ default: m.MetaAutomationWorkspace })),
);

export const Route = createFileRoute("/modulos/gestor-trafego/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações executáveis, Gestor de Tráfego IA" },
      { name: "description", content: "Crie automações manuais ou planos com IA, sempre com revisão antes da ativação." },
    ],
  }),
  component: AutomacoesPage,
  errorComponent: AutomacoesRouteError,
  notFoundComponent: AutomacoesNotFound,
});

function AutomacoesRouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <ModuleShell
      icon={Sparkles}
      tag="MÍDIA"
      title="Automações executáveis"
      description="Crie automações manuais ou peça à IA um plano revisável sobre campanhas, conjuntos e anúncios reais."
      status="ativo"
    >
      <AutomationPageError
        message={error.message || "A rota encontrou um erro interno."}
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
      <Link
        to="/modulos/gestor-trafego"
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Gestor de Tráfego
      </Link>
    </ModuleShell>
  );
}

function AutomacoesNotFound() {
  return (
    <ModuleShell
      icon={Sparkles}
      tag="MÍDIA"
      title="Automações executáveis"
      description="Crie automações manuais ou peça à IA um plano revisável sobre campanhas, conjuntos e anúncios reais."
      status="ativo"
    >
      <AutomationPageError message="Aba de automações não encontrada." />
    </ModuleShell>
  );
}

function AutomacoesPage() {
  const getWorkspace = useServerFn(getActiveWorkspace);
  const workspaceQ = useQuery({
    queryKey: ["active-workspace", "meta-automations"],
    queryFn: async () => getWorkspace(),
    retry: 1,
  });

  return (
    <ModuleShell
      icon={Sparkles}
      tag="MÍDIA"
      title="Automações executáveis"
      description="Crie automações manuais ou peça à IA um plano revisável sobre campanhas, conjuntos e anúncios reais."
      status="ativo"
    >
      <div className="flex items-center gap-2">
        <Link
          to="/modulos/gestor-trafego"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Gestor de Tráfego
        </Link>
      </div>
      {workspaceQ.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>
      ) : workspaceQ.isError ? (
        <AutomationPageError
          message="Não consegui carregar o workspace agora."
          onRetry={() => workspaceQ.refetch()}
        />
      ) : workspaceQ.data?.id ? (
        <AutomationPanelBoundary>
          <Suspense fallback={<div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando automações…</div>}>
            <MetaAutomationWorkspace workspaceId={workspaceQ.data.id} />
          </Suspense>
        </AutomationPanelBoundary>
      ) : (
        <AutomationPageError message="Nenhum workspace ativo foi encontrado para esta conta." />
      )}
    </ModuleShell>
  );
}

function AutomationPageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-6 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground">Automações não carregaram</div>
          <div className="mt-1 text-muted-foreground">{message}</div>
          {onRetry && (
            <ButtonLike onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
            </ButtonLike>
          )}
        </div>
      </div>
    </div>
  );
}

function ButtonLike({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
    >
      {children}
    </button>
  );
}

class AutomationPanelBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <AutomationPageError
          message="A aba encontrou uma resposta inesperada, mas a página foi preservada."
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}