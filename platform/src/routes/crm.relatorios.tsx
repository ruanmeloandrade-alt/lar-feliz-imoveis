import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
 BarChart3, Download, RefreshCw, TrendingUp, Users, Wallet, Target,
 Award, AlertTriangle, ArrowUpRight,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { getCrmReports, type CrmReportKpi } from "@/lib/crm-reports.functions";
import { formatBRL } from "@/lib/crm-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/relatorios")({
 head: () => ({
 meta: [
 { title: "Relatórios · CRM Vanessa Simoni" },
 { name: "description", content: "Relatórios reais do CRM Vanessa Simoni a partir dos leads sincronizados." },
 ],
 }),
 component: CrmRelatoriosPage,
});

const RANGE_OPTIONS: Array<{ label: string; days: number }> = [
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

function CrmRelatoriosPage() {
 const [days, setDays] = useState(30);
 const fetchReports = useServerFn(getCrmReports);
 const reportsQuery = useQuery({
 queryKey: ["crm-reports", days],
 queryFn: () => fetchReports({ data: { days } }),
 });

 const data = reportsQuery.data;

 const maxStage = useMemo(() => data?.stages.reduce((m, s) => Math.max(m, s.count), 0)?? 0, [data]);
 const maxSeries = useMemo(() => data?.series.reduce((m, p) => Math.max(m, p.count), 0)?? 0, [data]);

 function exportCsv() {
  if (!data) return;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows: string[] = [];
  rows.push(esc(`Relatório CRM · ${data.funnelName} · últimos ${days} dias`));
  rows.push("");
  rows.push(["Indicador", "Valor"].map(esc).join(";"));
  for (const k of data.kpis) rows.push([k.label, formatKpi(k)].map(esc).join(";"));
  rows.push("");
  rows.push(["Etapa", "Leads"].map(esc).join(";"));
  for (const s of data.stages) rows.push([s.name, s.count].map(esc).join(";"));
  rows.push("");
  rows.push(["Data", "Leads"].map(esc).join(";"));
  for (const p of data.series) rows.push([p.date, p.count].map(esc).join(";"));

  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-crm-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
 }

 return (
 <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
 <AppSidebar />
 <main className="flex-1 overflow-y-auto">
 <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
 <header className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
 <BarChart3 className="w-5 h-5 text-primary" />
 Relatórios do CRM
 </h1>
 <p className="text-sm text-muted-foreground mt-1">
 {data? `Funil "${data.funnelName}" · últimos ${days} dias`: "Calculando métricas…"}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
 {RANGE_OPTIONS.map((r) => (
 <button
 key={r.days}
 onClick={() => setDays(r.days)}
 className={cn(
 "px-3 py-1.5 font-medium transition-colors",
 days === r.days? "bg-primary text-primary-foreground": "text-muted-foreground hover:bg-muted",
 )}
 >
 {r.label}
 </button>
 ))}
 </div>
 <button
 onClick={() => reportsQuery.refetch()}
 className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border hover:bg-muted"
 >
 <RefreshCw className={cn("w-3.5 h-3.5", reportsQuery.isFetching && "animate-spin")} /> Atualizar
 </button>
 <button
 onClick={exportCsv}
 disabled={!data}
 className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border hover:bg-muted disabled:opacity-50"
 title="Exportar relatório em CSV"
 >
 <Download className="w-3.5 h-3.5" /> Exportar
 </button>
 </div>
 </header>

 {reportsQuery.error instanceof Error && (
 <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
 <AlertTriangle className="w-3.5 h-3.5" />
 {reportsQuery.error.message}
 </div>
 )}

 <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
 {(data?.kpis?? []).map((kpi) => (
 <div key={kpi.id} className="rounded-xl border border-border bg-card px-3 py-3">
 <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
 {kpi.id === "leads" && <Users className="w-3 h-3" />}
 {kpi.id === "abertas" && <Target className="w-3 h-3" />}
 {kpi.id === "winrate" && <Award className="w-3 h-3" />}
 {kpi.id === "ticket" && <TrendingUp className="w-3 h-3" />}
 {kpi.id === "receita" && <Wallet className="w-3 h-3" />}
 {kpi.id === "pipeline" && <ArrowUpRight className="w-3 h-3" />}
 {kpi.label}
 </div>
 <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
 {formatKpi(kpi)}
 </div>
 </div>
 ))}
 {!data &&!reportsQuery.isLoading && (
 <div className="col-span-full rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
 Nenhum funil ativo ainda.
 </div>
 )}
 </section>

 <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <div className="rounded-xl border border-border bg-card p-4">
 <h2 className="text-sm font-semibold mb-3">Etapas do funil</h2>
 <div className="space-y-2">
 {(data?.stages?? []).map((s) => {
 const pct = maxStage > 0? (s.count / maxStage) * 100: 0;
 const color = s.status === "ganha"? "bg-success/70": s.status === "perdida"? "bg-destructive/70": "bg-primary/70";
 return (
 <div key={s.id}>
 <div className="flex items-center justify-between text-xs mb-1">
 <span className="truncate">{s.name}</span>
 <span className="tabular-nums text-muted-foreground">{s.count} · {formatBRL(s.value)}</span>
 </div>
 <div className="h-2 rounded bg-muted overflow-hidden">
 <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
 </div>
 </div>
 );
 })}
 {(!data || data.stages.length === 0) && (
 <p className="text-xs text-muted-foreground">Sem etapas configuradas.</p>
 )}
 </div>
 </div>

 <div className="rounded-xl border border-border bg-card p-4">
 <h2 className="text-sm font-semibold mb-3">Leads criados por dia</h2>
 <div className="flex items-end gap-1 h-[180px]">
 {(data?.series?? []).map((p, idx) => {
 const h = maxSeries > 0? Math.max(2, (p.count / maxSeries) * 160): 2;
 return (
 <div key={idx} className="flex-1 group relative">
 <div className="bg-primary/70 rounded-t" style={{ height: `${h}px` }} title={`${p.date}: ${p.count}`} />
 </div>
 );
 })}
 </div>
 <div className="text-[10px] text-muted-foreground mt-2 flex justify-between">
 <span>{data?.series[0]?.date?? " - "}</span>
 <span>{data?.series.at(-1)?.date?? " - "}</span>
 </div>
 </div>
 </section>
 </div>
 </main>
 </div>
 );
}
