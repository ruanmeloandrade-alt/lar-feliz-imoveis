import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  BarChart3, Download, RefreshCw, TrendingUp, Users, Wallet, Target, 
  Award, AlertTriangle, ArrowUpRight, MessageSquare, Bot, 
  ChevronDown, Search, Filter, Calendar
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { getCrmReports, type CrmReportKpi } from "@/lib/crm-reports.functions";
import { getGroupReports } from "@/lib/group-reports.functions";
import { formatBRL } from "@/lib/crm-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios Consolidados · Vanessa Simoni" },
      { name: "description", content: "Relatórios reais e consolidados de Grupos, Bots, Agentes IA e CRM." },
    ],
  }),
  component: RelatoriosConsolidadosPage,
});

const RANGE_OPTIONS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function formatKpi(k: CrmReportKpi) {
  if (k.format === "currency") return formatBRL(k.value);
  if (k.format === "percent") return `${k.value}%`;
  if (k.format === "days") return `${k.value} d`;
  return k.value.toLocaleString("pt-BR");
}

function RelatoriosConsolidadosPage() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"geral" | "grupos" | "bots" | "agentes">("geral");
  const fetchReports = useServerFn(getCrmReports);
  const fetchGroupReports = useServerFn(getGroupReports);
  
  const reportsQuery = useQuery({
    queryKey: ["consolidated-reports", days],
    queryFn: () => fetchReports({ data: { days } }),
  });

  const groupReportsQuery = useQuery({
    queryKey: ["group-reports", days],
    queryFn: () => fetchGroupReports({ data: { days } }),
  });

  const data = reportsQuery.data;
  const groupData = groupReportsQuery.data;

  const groupKpis = [
    { label: "Total de Grupos", value: groupData?.totalGroups ?? 0, icon: Users },
    { label: "Mensagens Enviadas", value: groupData?.totalMessages ?? 0, icon: MessageSquare },
    { label: "Engajamento Médio", value: groupData?.avgEngagement ?? "0%", icon: TrendingUp },
  ];

  const botKpis = [
    { label: "Execuções de Bots", value: groupData?.botExecutions ?? 0, icon: Bot },
    { label: "Conversões IA", value: groupData?.aiConversions ?? 0, icon: Target },
    { label: "Taxa de Sucesso", value: groupData?.successRate ?? "0%", icon: Award },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Relatórios Consolidados
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Visão real de grupos, bots, agentes de IA e performance comercial.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => setDays(r.days)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-medium transition-all",
                      days === r.days ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => reportsQuery.refetch()}
                className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <RefreshCw className={cn("w-4 h-4", reportsQuery.isFetching && "animate-spin")} />
              </button>
            </div>
          </header>

          <nav className="flex items-center gap-1 border-b border-border">
            {(["geral", "grupos", "bots", "agentes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px capitalize",
                  activeTab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="space-y-6">
            {activeTab === "geral" && (
              <>
                <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {(data?.kpis ?? []).map((kpi) => (
                    <div key={kpi.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {kpi.label}
                      </div>
                      <div className="text-xl font-bold tracking-tight tabular-nums">
                        {formatKpi(kpi)}
                      </div>
                    </div>
                  ))}
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="text-sm font-semibold mb-4">Performance de Conversão</h2>
                    <div className="space-y-4">
                      {groupKpis.map((k, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                              <k.icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">{k.label}</span>
                          </div>
                          <span className="text-sm font-bold">{k.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="text-sm font-semibold mb-4">Atividade de Bots/IA</h2>
                    <div className="space-y-4">
                      {botKpis.map((k, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary grid place-items-center">
                              <k.icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">{k.label}</span>
                          </div>
                          <span className="text-sm font-bold">{k.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab !== "geral" && (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="text-sm font-medium">Filtros Avançados de {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Use os filtros acima para detalhar as KPIs de {activeTab} e visualizar o histórico real de execuções.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
