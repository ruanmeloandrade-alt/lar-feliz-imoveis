import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrackingStatus } from "./mock-data";

const MAP: Record<TrackingStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ok:      { label: "Ativo",       className: "bg-success/15 text-success border-success/30",   Icon: CheckCircle2 },
  warning: { label: "Sem dados",   className: "bg-warning/15 text-warning border-warning/30",   Icon: AlertTriangle },
  error:   { label: "Erro",        className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
  pending: { label: "Não instalado", className: "bg-muted text-muted-foreground border-border", Icon: Clock },
};

export function TrackingStatusBadge({ status, className }: { status: TrackingStatus; className?: string }) {
  const { label, className: cls, Icon } = MAP[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", cls, className)}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}
