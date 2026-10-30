import { Inbox } from "lucide-react";

export function TrackingEmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 flex flex-col items-center text-center gap-2">
      <div className="h-10 w-10 rounded-full bg-muted grid place-items-center text-muted-foreground">
        <Inbox className="w-5 h-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-muted-foreground max-w-md">{hint}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
