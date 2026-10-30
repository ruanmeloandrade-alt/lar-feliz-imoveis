import { useState } from "react";
import {
  Copy,
  Globe,
  Instagram,
  Facebook,
  MessageCircle,
  Megaphone,
  Plug,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ModuleSection } from "@/components/modules/ModuleShell";
import {
  listTrackingSites,
  deleteTrackingSite,
  listTrackingSources,
} from "@/lib/tracking.functions";
import { TrackingEmptyState } from "./EmptyState";
import { TrackingStatusBadge } from "./TrackingStatusBadge";

type ExtraSource = {
  id: string;
  kind: "site" | "meta_ads" | "meta_page" | "instagram" | "google" | "whatsapp" | "integracao";
  name: string;
  detail: string;
  status: "ok" | "pending" | "error";
  metrics: Array<{ label: string; value: string }>;
};

const KIND_ICON: Record<ExtraSource["kind"], typeof Globe> = {
  site: Globe,
  meta_ads: Megaphone,
  meta_page: Facebook,
  instagram: Instagram,
  google: Search,
  whatsapp: MessageCircle,
  integracao: Plug,
};

type SiteRow = {
  id: string;
  name: string;
  domain: string;
  pixel_token: string;
  verified: boolean;
  events_24h: number;
  last_event_at: string | null;
};

export function TrackingSourcesGrid({
  workspaceId,
  onAdd,
  managed = false,
}: {
  workspaceId: string;
  onAdd?: () => void;
  managed?: boolean;
}) {
  const listFn = useServerFn(listTrackingSites);
  const sourcesFn = useServerFn(listTrackingSources);
  const delFn = useServerFn(deleteTrackingSite);
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["tracking-sites", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await listFn({ data: { workspaceId } })) as SiteRow[],
  });

  const qSources = useQuery({
    queryKey: ["tracking-sources", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await sourcesFn({ data: { workspaceId } })) as ExtraSource[],
  });

  const del = useMutation({
    mutationFn: async (siteId: string) => {
      setBusyId(siteId);
      return delFn({ data: { workspaceId, siteId } });
    },
    onSuccess: () => {
      toast.success("Site removido");
      qc.invalidateQueries({ queryKey: ["tracking-sites", workspaceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover"),
    onSettled: () => setBusyId(null),
  });

  const sites = (q.data ?? []).filter((s) => !managed || s.domain === "corretoravanessasimoni.com");
  const extras = (qSources.data ?? []).filter((s) => !managed || s.status === "ok");

  return (
    <>
      <ModuleSection
        title="Site oficial da Vanessa"
        description="O site oficial já faz parte da plataforma. Os números abaixo mostram os eventos realmente recebidos."

        right={
          !managed && (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> Adicionar site
            </button>
          )
        }
      >
        {q.isLoading ? (
          <div className="text-xs text-muted-foreground">Carregando…</div>
        ) : sites.length === 0 ? (
          <TrackingEmptyState
            title="Nenhum site conectado ainda"
            hint="Registre seu primeiro site ou domínio para gerar o pixel Vanessa Simoni e começar a coletar eventos reais."
            action={
              !managed && (
                <button
                  onClick={onAdd}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="w-3 h-3" /> Adicionar site
                </button>
              )
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sites.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-background/50 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{s.domain}</div>
                    </div>
                  </div>
                  <TrackingStatusBadge status={s.verified ? "ok" : "pending"} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] mt-3">
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Eventos 24h
                    </div>
                    <div className="tabular-nums font-semibold">
                      {(s.events_24h ?? 0).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Último evento
                    </div>
                    <div className="tabular-nums truncate">
                      {s.last_event_at ? new Date(s.last_event_at).toLocaleString("pt-BR") : "-"}
                    </div>
                  </div>
                </div>
                {!managed && (
                  <>
                    <div className="mt-2 rounded-md bg-muted/30 p-2 font-mono text-[10px] break-all">
                      {s.pixel_token}
                    </div>
                    <div className="flex items-center gap-1 mt-3">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(s.pixel_token);
                          toast.success("Token copiado");
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-border hover:bg-muted"
                      >
                        <Copy className="w-3 h-3" /> Copiar token
                      </button>
                      <button
                        onClick={() => del.mutate(s.id)}
                        disabled={busyId === s.id}
                        className="text-[11px] px-2 py-1.5 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ModuleSection>

      <ModuleSection
        title="Outras fontes conectadas"
        description="Meta Ads, páginas, Instagram, Google, WhatsApp e integrações — com os números reais medidos pelo tracking."
      >
        {qSources.isLoading ? (
          <div className="text-xs text-muted-foreground">Carregando…</div>
        ) : extras.length === 0 ? (
          <TrackingEmptyState
            title="Nenhuma outra fonte conectada"
            hint="Conecte Meta, Google, WhatsApp ou outra integração em Integrações para que ela apareça aqui com os KPIs reais."
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {extras.map((s) => {
              const Icon = KIND_ICON[s.kind] ?? Plug;
              return (
                <div key={s.id} className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{s.detail}</div>
                      </div>
                    </div>
                    <TrackingStatusBadge status={s.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] mt-3">
                    {s.metrics.map((m) => (
                      <div key={m.label} className="rounded-md bg-muted/40 p-2">
                        <div className="text-[9px] uppercase tracking-widest text-muted-foreground truncate">
                          {m.label}
                        </div>
                        <div className="tabular-nums font-semibold truncate">{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ModuleSection>
    </>
  );
}
