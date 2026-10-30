import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Plug, CheckCircle2, Circle, Clock, X, Search, Sparkles, Zap } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { MODULES_CATALOG, STATUS_LABEL } from "@/lib/modules-catalog";
import { useActivatedModules } from "@/lib/activated-modules";
import { useIsAdmin, useIsSuperAdmin } from "@/hooks/use-roles";
import { END_CLIENT_MODULE_IDS } from "@/lib/end-client-visibility";
import { AdminOnlyTag } from "@/components/AdminOnlyDot";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/modulos/")({
  head: () => ({
    meta: [
      { title: "Lista de módulos · Vanessa Simoni" },
      {
        name: "description",
        content:
          "Recursos da Vanessa Simoni: o que já está ativo na sua conta e o que precisa de configuração.",
      },
    ],
  }),
  component: ModulosPage,
});

type Filter = "disponiveis" | "instalados";

const FILTERS: { id: Filter; label: string; dot: string }[] = [
  { id: "disponiveis", label: "Disponíveis para instalar", dot: "bg-primary" },
  { id: "instalados", label: "Já instalados", dot: "bg-success" },
];

function ModulosPage() {
  const [filter, setFilter] = useState<Filter>("disponiveis");
  const [query, setQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<(typeof MODULES_CATALOG)[number] | null>(null);
  const { isSuperAdmin } = useIsSuperAdmin();
  const { ids: activatedIds } = useActivatedModules();

  // Cliente final só vê módulos permitidos; super admin vê tudo.
  const visibleCatalog = useMemo(
    () =>
      isSuperAdmin
        ? MODULES_CATALOG
        : MODULES_CATALOG.filter(
            (m) => END_CLIENT_MODULE_IDS.has(m.id) && m.status !== "preparo",
          ),
    [isSuperAdmin],
  );

  const isInstalled = (m: (typeof MODULES_CATALOG)[number]) =>
    m.acquired || activatedIds.has(m.id);

  const counts = useMemo(() => {
    const all = visibleCatalog;
    return {
      disponiveis: all.filter((m) => !isInstalled(m)).length,
      instalados: all.filter((m) => isInstalled(m)).length,
    };
  }, [visibleCatalog, activatedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleCatalog.filter((m) => {
      if (filter === "instalados" ? !isInstalled(m) : isInstalled(m)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tag.toLowerCase().includes(q)
      );
    });
  }, [filter, query, visibleCatalog, activatedIds]);


  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Coluna esquerda: filtros como lista */}
          <aside className="space-y-5">
            <div>
              <div className="text-[10px] font-semibold tracking-widest text-muted-foreground mb-2">
                MÓDULOS · {counts.disponiveis + counts.instalados}
              </div>
              <h1 className="text-xl font-semibold tracking-tight leading-tight">
                Vitrine de recursos
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Instale o que faltar. O que já está instalado vira rotina no menu lateral.
              </p>

            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar módulo"
                className="w-full pl-8 pr-2 py-2 text-xs rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <nav className="space-y-1">
              {FILTERS.map((f) => {
                const active = filter === f.id;
                const count = counts[f.id];
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-transparent text-foreground hover:bg-muted/40"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", f.dot)} />
                      <span className="font-medium">{f.label}</span>
                    </span>
                    <span className={cn("tabular-nums text-[11px]", active ? "text-primary" : "text-muted-foreground")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>

            <Link
              to="/integracoes"
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border border-border bg-card text-xs hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Plug className="w-3.5 h-3.5" /> Integrações
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
            </Link>
          </aside>

          {/* Coluna direita: lista vertical em linhas */}
          <section className="space-y-5 min-w-0">
            {/* Cabeçalho da lista */}
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {FILTERS.find((f) => f.id === filter)?.label}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {filtered.length} resultado(s){query ? ` para "${query}"` : ""}.
                </p>
              </div>
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Limpar
                </button>
              )}
            </div>


            {/* Lista vertical (linhas, não grid) */}
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {filtered.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {filter === "disponiveis"
                    ? "Tudo instalado por aqui. Nenhum módulo pendente."
                    : "Você ainda não instalou nenhum módulo."}
                </div>
              )}

              {filtered.map((m) => (
                <ModuleRow
                  key={m.id}
                  module={m}
                  onSelect={() => setSelectedModule(m)}
                  adminOnly={isSuperAdmin && !END_CLIENT_MODULE_IDS.has(m.id)}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      {selectedModule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4"
          onClick={() => setSelectedModule(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">MÓDULO</div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">{selectedModule.name}</h2>
              </div>
              <button
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
                onClick={() => setSelectedModule(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{selectedModule.description}</p>
            <div className="mt-4 rounded-md border border-success/30 bg-success/10 p-3 text-xs text-success">
              Módulo ativado. Você tem 20 dias de uso gratuito e ele já aparece no menu lateral.
            </div>
            {selectedModule.to ? (
              <Link
                to={selectedModule.to}
                onClick={() => setSelectedModule(null)}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Abrir módulo agora <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <button
                className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={() => setSelectedModule(null)}
              >
                Entendi
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----- Linha (horizontal) ----- */

function ModuleRow({
  module: m,
  onSelect,
  adminOnly,
}: {
  module: (typeof MODULES_CATALOG)[number];
  onSelect: () => void;
  adminOnly?: boolean;
}) {
  const Icon = m.icon;
  const { isActivated, activate, deactivate } = useActivatedModules();
  const { isAdmin } = useIsAdmin();
  const activated = m.acquired || isActivated(m.id);
  const ready = m.status !== "preparo";
  const canToggle = ready && !m.acquired; // CRM acquired sempre fica


  const StatusIcon = activated ? CheckCircle2 : m.status === "configurar" ? Clock : Circle;

  const statusTone = activated
    ? "text-success border-success/30 bg-success/10"
    : m.status === "configurar"
    ? "text-warning border-warning/30 bg-warning/10"
    : "text-muted-foreground border-border bg-muted";

  const statusLabel = activated ? "Ativo" : STATUS_LABEL[m.status];

  return (
    <div className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
      <div
        className={cn(
          "h-11 w-11 rounded-lg grid place-items-center shrink-0",
          activated ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="w-5 h-5" />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{m.name}</span>
          {adminOnly && <AdminOnlyTag />}
          <span className="text-[10px] tracking-widest text-muted-foreground font-medium">
            {m.tag}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              statusTone
            )}
          >
            <StatusIcon className="w-2.5 h-2.5" />
            {statusLabel}
          </span>
          {ready && !activated && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="w-2.5 h-2.5" /> 20 dias grátis
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {m.features.slice(0, 4).map((f) => (
            <span
              key={f}
              className="text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {!ready ? (
          m.to && isAdmin ? (
            <Link
              to={m.to}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              title="Visível apenas para ADM"
            >
              <Sparkles className="w-3 h-3" /> Ver prévia (ADM)
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium text-muted-foreground cursor-not-allowed"
              title="Este módulo ainda está em preparação"
            >
              <Clock className="w-3 h-3" /> Em preparação
            </button>
          )

        ) : activated ? (

          <>
            {m.to && (
              <Link
                to={m.to}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Abrir <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            {canToggle && (
              <button
                onClick={() => deactivate(m.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                title="Remover do menu lateral"
              >
                Desativar
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => {
              activate(m.id);
              onSelect();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" /> Ativar módulo
          </button>
        )}
      </div>
    </div>
  );
}
