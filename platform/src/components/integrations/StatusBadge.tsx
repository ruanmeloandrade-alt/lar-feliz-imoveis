import { STATUS_META, type IntegrationStatus } from "@/lib/integrations-catalog";
import { cn } from "@/lib/utils";
import { Circle, CheckCircle2, Clock } from "lucide-react";

export function StatusBadge({
  status,
  className,
}: {
  status: IntegrationStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon =
    status === "conectado" ? CheckCircle2 : status === "em_preparacao" ? Clock : Circle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
        meta.chip,
        className,
      )}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}
