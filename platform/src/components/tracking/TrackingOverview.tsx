import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { TrackingEmptyState } from "./EmptyState";
import { getTrackingOverview } from "@/lib/tracking-live.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";

export function TrackingOverview() {
  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";
  const { data, isLoading } = useQuery({
    queryKey: ["tracking-overview", workspaceId],
    queryFn: () => getTrackingOverview({ data: { workspaceId } }),
    enabled: !!workspaceId,
    refetchInterval: 15000,
  });

  const funnelRows = [
    { label: "Sessões", value: data?.funnel.sessions ?? 0 },
    { label: "Page views", value: data?.funnel.pageViews ?? 0 },
    { label: "Cliques", value: data?.funnel.clicks ?? 0 },
    { label: "Leads", value: data?.funnel.leads ?? 0 },
    { label: "Conversões", value: data?.funnel.conversions ?? 0 },
  ];
  const max = Math.max(...funnelRows.map((f) => f.value), 1);

  const KPIS = [
    { label: "Eventos 24h", value: data?.events24h ?? 0, hint: "todos os eventos recebidos" },
    { label: "Sessões únicas 24h", value: data?.sessions24h ?? 0, hint: "visitantes distintos" },
    { label: "Leads (7d)", value: data?.funnel.leads ?? 0, hint: "form_submit + lead" },
    { label: "Conversões (7d)", value: data?.funnel.conversions ?? 0, hint: "ocorrências das regras configuradas" },
    { label: "Cliques WhatsApp/Tel (7d)", value: data?.funnel.clicks ?? 0, hint: "wa.me + tel:" },
    { label: "Page views (7d)", value: data?.funnel.pageViews ?? 0, hint: "todas as páginas" },
    { label: "Sites verificados", value: `${data?.sitesActive ?? 0}/${data?.sitesTotal ?? 0}`, hint: "pixel validado no cadastro" },
    { label: "Campanhas ativas", value: data?.topCampaigns.length ?? 0, hint: "UTMs distintos" },
  ];

  const feed = data?.feed ?? [];
  const hasData = (data?.events24h ?? 0) > 0 || feed.length > 0;

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {isLoading ? "-" : typeof k.value === "number" ? k.value.toLocaleString("pt-BR") : k.value}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ModuleSection title="Funil de tracking" description="Últimos 7 dias.">
          <div className="space-y-2.5">
            {funnelRows.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{f.label}</span>
                  <span className="tabular-nums text-muted-foreground">{f.value.toLocaleString("pt-BR")}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary/60" style={{ width: `${(f.value / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Top campanhas (UTM)" description="Sessões e conversões nos últimos 7 dias.">
          {(data?.topCampaigns.length ?? 0) === 0 ? (
            <TrackingEmptyState
              title="Sem dados de campanha ainda"
              hint="Gere links com UTM na aba UTMs & Campanhas e comece a distribuir para ver o ranking aqui."
            />
          ) : (
            <div className="space-y-1.5">
              {data!.topCampaigns.map((c) => (
                <div key={c.key} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-mono text-[11px] truncate max-w-[60%]">{c.key}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.sessions} sess · {c.conversions} conv
                  </span>
                </div>
              ))}
            </div>
          )}
        </ModuleSection>
      </div>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
        <ModuleSection
          title="Últimos eventos"
          description="Feed em tempo real. Atualiza sozinho a cada 15 s."
          right={
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${hasData ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
              {hasData ? "ao vivo" : "aguardando"}
            </span>
          }
        >
          {feed.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-center text-xs text-muted-foreground gap-2">
              <Activity className="w-5 h-5" />
              Nenhum evento recebido ainda.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(feed as Array<{ event_name: string; page_path: string | null; utm_source: string | null; utm_campaign: string | null; created_at: string }>).map((e, i) => (
                <li key={i} className="py-2 flex items-center gap-2 text-xs">
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">{e.event_name}</span>
                  <span className="truncate flex-1 text-muted-foreground">{e.page_path ?? "-"}</span>
                  {e.utm_campaign && <span className="text-[10px] text-primary">{e.utm_source}·{e.utm_campaign}</span>}
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ModuleSection>

        <ModuleSection title="Alertas" description="O que precisa de atenção agora.">
          {(data?.sitesTotal ?? 0) === 0 ? (
            <div className="text-xs text-warning py-2">Nenhum site cadastrado ainda. Adicione um site na aba Fontes.</div>
          ) : (data?.sitesActive ?? 0) === 0 ? (
            <div className="text-xs text-warning py-2">Nenhum site foi verificado ainda. Abra Diagnóstico para validar a instalação e confirmar o recebimento de eventos.</div>
          ) : (data?.events24h ?? 0) === 0 ? (
            <div className="text-xs text-warning py-2">Há site verificado, mas nenhum evento chegou nas últimas 24 horas. Confira a aba Diagnóstico.</div>
          ) : (
            <div className="text-xs text-success py-2">Tracking recebendo eventos nas últimas 24 horas.</div>
          )}
        </ModuleSection>
      </div>
    </div>
  );
}
