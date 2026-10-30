import { Activity, ArrowUpRight, Users } from "lucide-react";
import { CentralComandos } from "@/components/dashboard/CentralComandos";
import { EvolutionChart } from "@/components/dashboard/EvolutionChart";
import { FunnelWidget } from "@/components/dashboard/FunnelWidget";
import { KpiCard } from "@/components/dashboard/KpiCard";
import type { DashboardMetricsResponse, FunnelStage, KpiCardData } from "@/lib/mock-dashboard";
import { formatKpiValue } from "@/lib/mock-dashboard";
import { useCriticalStage, resolveCriticalStage } from "@/lib/critical-stage";

const EXECUTIVE_KEYS = ["leads_recebidos", "valor_pipeline", "vendas_ganhas", "taxa_conversao"];
const OPERATION_KEYS = ["em_atendimento", "vendas_perdidas", "leads_urgentes", "sem_tarefa_futura"];

export function LayoutExecutivo({
  metrics,
  onKpiClick,
  onStageClick,
}: {
  metrics: DashboardMetricsResponse;
  onKpiClick: (kpi: Pick<KpiCardData, "kpi_key" | "label" | "source_label">) => void;
  onStageClick: (stage: FunnelStage) => void;
}) {
  const primaryKpi = metrics.kpis.find((kpi) => kpi.kpi_key === "vendas_ganhas") ?? metrics.kpis[0];
  const leadsKpi = metrics.kpis.find((kpi) => kpi.kpi_key === "leads_recebidos");
  const conversionKpi = metrics.kpis.find((kpi) => kpi.kpi_key === "taxa_conversao");
  const pipelineKpi = metrics.kpis.find((kpi) => kpi.kpi_key === "valor_pipeline");
  const executiveKpis = selectKpis(metrics.kpis, EXECUTIVE_KEYS);
  const operationKpis = selectKpis(metrics.kpis, OPERATION_KEYS);

  const { selection } = useCriticalStage();
  const critical = resolveCriticalStage(metrics.funnel, selection);

  if (!primaryKpi) return null;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr]">
          <button
            type="button"
            onClick={() => onKpiClick(primaryKpi)}
            className="group p-5 text-left transition-colors hover:bg-accent/20 xl:border-r xl:border-border"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Cockpit executivo</div>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Receita, pipeline e conversão em uma leitura</h1>
                <p className="mt-1 text-xs text-muted-foreground">{metrics.period_label} · {metrics.funnel_label}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                Abrir detalhe <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <HeroMetric label={primaryKpi.label} value={formatKpiValue(primaryKpi.value, primaryKpi.unit)} />
              <HeroMetric label="Leads" value={leadsKpi ? formatKpiValue(leadsKpi.value, leadsKpi.unit) : "—"} />
              <HeroMetric label="Conversão" value={conversionKpi ? formatKpiValue(conversionKpi.value, conversionKpi.unit) : "—"} />
              <HeroMetric label="Pipeline" value={pipelineKpi ? formatKpiValue(pipelineKpi.value, pipelineKpi.unit) : "—"} />
            </div>
          </button>

          <div className="border-t border-border p-5 xl:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Gargalo atual</div>
                <div className="mt-1 text-base font-semibold text-foreground">{critical.title}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{critical.subtitle}</p>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <div className="font-mono text-3xl font-semibold tabular-nums">{critical.count}</div>
                <div className="text-[10px] text-muted-foreground">leads nesta pressão</div>
              </div>
              <button
                type="button"
                onClick={() => critical.targetStage && onStageClick(critical.targetStage)}
                disabled={!critical.targetStage}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50"
              >
                Ver etapa
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {executiveKpis.map((kpi) => (
          <KpiCard key={kpi.kpi_key} kpi={kpi} onClick={() => onKpiClick(kpi)} />
        ))}
      </div>

      <section className="grid grid-cols-1 gap-3 2xl:grid-cols-12">
        <div className="2xl:col-span-8">
          <EvolutionChart
            data={metrics.evolution}
            leadsCount={metrics.leads_loaded}
            onPointClick={(point) =>
              onKpiClick({
                kpi_key: `evolution.day.${point.day}`,
                label: `Leads em ${point.day}`,
                source_label: "Evolução diária",
              })
            }
          />
        </div>
        <div className="2xl:col-span-4">
          <FunnelWidget stages={metrics.funnel} onStageClick={onStageClick} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">Operação comercial</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {operationKpis.map((kpi) => (
              <KpiCard key={kpi.kpi_key} kpi={kpi} onClick={() => onKpiClick(kpi)} />
            ))}
          </div>
        </div>
        <CentralComandos items={metrics.central} />
      </section>
    </div>
  );
}

function selectKpis(kpis: KpiCardData[], keys: string[]) {
  const byKey = new Map(kpis.map((kpi) => [kpi.kpi_key, kpi]));
  return keys.map((key) => byKey.get(key)).filter((kpi): kpi is KpiCardData => Boolean(kpi));
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
