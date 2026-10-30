import type { ReactNode } from "react";
import { FileDown, SlidersHorizontal, CheckCircle2, Activity, AlertCircle, Zap, RefreshCw } from "lucide-react";
import type { DashboardMetricsResponse } from "@/lib/mock-dashboard";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/preferences";

function formatReadAt(iso: string) {
 return formatDateTime(iso);
}

interface Props {
 metrics: DashboardMetricsResponse;
 onEdit: () => void;
 onPrint: () => void;
 /** true enquanto a sincronização silenciosa está rolando em background */
 syncBusy?: boolean;
 syncMessage?: string | null;
 onSync?: () => void;
 periodSlot?: ReactNode;
}

export function DashboardHeader({ metrics, onEdit, onPrint, syncBusy = false, syncMessage, onSync, periodSlot }: Props) {
 const okSync = metrics.read_status === "success";
 const syncErrored = metrics.read_status === "error";
 return (
 <div className="rounded-xl border border-border bg-card shadow-premium p-1">
 {/* Linha 1 - título + status + ações */}
 <div className="px-5 py-4 flex flex-wrap items-center gap-4 border-b border-border/50">
 <div className="flex items-center gap-2 min-w-0">
  <h1 className="text-lg font-bold tracking-tight truncate font-display">
  Painel comercial
  </h1>
 <span
 className={cn(
 "ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border",
 okSync
? "bg-success/10 text-success border-success/20"
: syncErrored
? "bg-destructive/10 text-destructive border-destructive/20"
: "bg-warning/10 text-warning border-warning/20",
 )}
 title={okSync? "Sincronização automática em dia": syncErrored? "Sincronização automática com erro": "Sincronização pendente"}
 >
 <Zap className={cn("w-2.5 h-2.5", syncBusy && "animate-pulse")} />
 {syncBusy ? "Sincronizando" : okSync ? "Em tempo real" : syncErrored ? "Erro" : "Pendente"}
 </span>
 </div>

 <div className="flex-1" />

 {periodSlot}

 <div className="h-5 w-px bg-border" />

 {onSync && (
   <button
     onClick={onSync}
     disabled={syncBusy}
     className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
     title="Forçar sincronização agora"
   >
     <RefreshCw className={cn("w-3.5 h-3.5", syncBusy && "animate-spin")} />
     {syncBusy ? "Sincronizando" : "Sincronizar"}
   </button>
 )}

 <button
 onClick={onPrint}
 className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
 >
 <FileDown className="w-3.5 h-3.5" /> Exportar
 </button>
 <button
 onClick={onEdit}
 className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
 >
 <SlidersHorizontal className="w-3.5 h-3.5" /> Editar dashboard
 </button>
 </div>

 {/* Linha 2 - sumário enxuto */}
 <div className="px-5 py-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
 <span className="inline-flex items-center gap-1.5">
 {syncErrored? <AlertCircle className="w-3.5 h-3.5 text-destructive" />: <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
 Última leitura{" "}
 <span className="text-foreground font-medium">
 {formatReadAt(metrics.read_at)}
 </span>
 </span>
 <span className="text-muted-foreground/40">·</span>
 <span className="inline-flex items-center gap-1.5">
 <Activity className="w-3.5 h-3.5 text-primary" />
 <span className="text-foreground font-semibold tabular-nums">
 {metrics.leads_loaded}
 </span>{" "}
 leads no período
 </span>
 <span className="text-muted-foreground/40">·</span>
 <span className="truncate">{syncMessage?? `Período: ${metrics.period_label}`}</span>
 </div>
 </div>
 );
}


