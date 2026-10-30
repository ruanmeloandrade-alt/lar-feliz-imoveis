import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, MinusCircle, RefreshCw } from "lucide-react";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getActiveWorkspace } from "@/lib/workspace.functions";

type LogRow = {
  id: number;
  event_name: string | null;
  module: string;
  status: string;
  detail: string | null;
  created_at: string;
};

const MODULE_LABEL: Record<string, string> = {
  crm: "CRM",
  salesbot: "SalesBots",
  meta: "Meta CAPI",
  workflow: "Fluxo de trabalho",
  social: "Social Media",
  conversao: "Conversões",
};

function statusIcon(status: string) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "skip") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

export function TrackingDispatchLog() {
  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";

  const { data: rows = [], isFetching, refetch } = useQuery({
    queryKey: ["tracking-dispatch-log", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_dispatch_log")
        .select("id,event_name,module,status,detail,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const failures = rows.filter((r) => r.status !== "ok" && r.status !== "skip").length;

  return (
    <ModuleSection
      title="Distribuição do tracking (servidor)"
      description="Cada evento recebido é distribuído para os módulos do sistema. Aqui você vê o que foi entregue e o que falhou."
      right={
        <div className="flex items-center gap-2">
          {failures > 0 && <Badge variant="destructive">{failures} falha(s)</Badge>}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma distribuição registrada ainda. Assim que o pixel receber um evento identificado, o histórico aparece aqui.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-3 text-sm">
              {statusIcon(r.status)}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{MODULE_LABEL[r.module] ?? r.module}</span>
                  <Badge variant="secondary">{r.event_name ?? "evento"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                {r.detail && <p className="mt-1 break-words text-xs text-muted-foreground">{r.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  );
}
