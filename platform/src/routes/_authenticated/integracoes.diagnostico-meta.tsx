import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetaDiagnostics } from "@/lib/meta-diagnostics.functions";
import { MetaStatusBadge } from "@/components/integrations/meta-status-badge";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/integracoes/diagnostico-meta")({
  component: DiagnosticoMetaPage,
  head: () => ({
    meta: [
      { title: "Diagnóstico Meta · Vanessa Simoni" },
      { name: "description", content: "Diagnóstico completo da integração Meta: status, tokens, eventos e webhooks." },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-red-200">Erro: {error instanceof Error ? error.message : String(error)}</div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

function DiagnosticoMetaPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const fetchDiag = useServerFn(getMetaDiagnostics);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: p } = await supabase.from("profiles").select("current_workspace_id").eq("id", uid).maybeSingle();
      if (!cancel) setWorkspaceId(p?.current_workspace_id ?? null);
    })();
    return () => { cancel = true; };
  }, []);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["meta-diagnostics", workspaceId],
    queryFn: () => fetchDiag({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  if (!workspaceId || isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando diagnóstico…</div>;
  }
  if (!data) return <div className="p-6 text-sm">Sem dados.</div>;

  const { integration, resources, webhook, events } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Diagnóstico da integração Meta</h1>
          <p className="text-sm text-muted-foreground">Status em tempo real da conexão, tokens, recursos e webhooks.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </header>

      {/* Status geral */}
      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-medium">Status da conexão</h2>
        {integration ? (
          <div className="space-y-3">
            <MetaStatusBadge
              status={integration.status}
              daysToExpire={integration.daysToExpire}
              lastError={integration.lastError}
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4">
              <Field label="Usuário Meta" value={integration.facebookUserName ?? "-"} />
              <Field label="Status" value={integration.status ?? "-"} />
              <Field label="Conectada em" value={fmtDate(integration.connectedAt)} />
              <Field label="Expira em" value={integration.expiresAt ? `${fmtDate(integration.expiresAt)} (${integration.daysToExpire}d)` : "-"} />
              <Field label="Última verificação" value={fmtDate(integration.lastCheckAt)} />
              <Field label="Business Managers" value={String(integration.businesses.length)} />
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Meta ainda não conectada neste workspace.</p>
        )}
      </section>

      {/* Recursos */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Páginas" value={resources.pages.count} sub={`${resources.pages.items.filter((i) => i.messaging_subscribed_at).length} assinadas`} />
        <StatCard label="Instagram" value={resources.instagram.count} sub={`${resources.instagram.items.filter((i) => i.messaging_subscribed_at).length} assinadas`} />
        <StatCard label="Contas Ads" value={resources.adAccounts.count} />
        <StatCard label="Pixels" value={resources.pixels.count} />
      </section>

      {/* Webhook */}
      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-medium">Webhook</h2>
        <div className="space-y-2 text-xs">
          <CheckLine ok={webhook.verifyTokenConfigured} label="Verify Token configurado (META_WEBHOOK_VERIFY_TOKEN)" />
          <CheckLine ok={webhook.appSecretConfigured} label="App Secret configurado (META_APP_SECRET), necessário para HMAC" />
          <Line label="Callback URL" value={webhook.callbackUrl} />
          <Line label="Deauthorize URL" value={webhook.deauthorizeUrl} />
          <Line label="Data Deletion URL" value={webhook.dataDeletionUrl} />
        </div>
      </section>

      {/* Contadores de eventos */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Eventos 24h" value={events.counts.last24h} />
        <StatCard label="Eventos 7d" value={events.counts.last7d} />
        <StatCard label="Eventos 30d" value={events.counts.last30d} />
        <StatCard label="Erros 7d" value={events.counts.errorsLast7d} highlight={events.counts.errorsLast7d > 0} />
      </section>

      {/* Últimos eventos */}
      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-medium">Últimos 30 eventos</h2>
        {events.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum evento recebido ainda.</p>
        ) : (
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-black/40 text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Recebido</th>
                  <th className="py-1.5 pr-3">Tipo</th>
                  <th className="py-1.5 pr-3">HMAC</th>
                  <th className="py-1.5 pr-3">Erro</th>
                </tr>
              </thead>
              <tbody>
                {events.recent.map((e) => (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(e.received_at)}</td>
                    <td className="py-1.5 pr-3 font-mono">{e.event_type ?? "-"}</td>
                    <td className="py-1.5 pr-3">
                      {e.signature_ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                    </td>
                    <td className="py-1.5 pr-3 text-red-300">{e.processing_error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Sync automático rodando a cada 12h · Renovação de token 7 dias antes do vencimento · Route: <code>{router.state.location.pathname}</code>
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${highlight ? "text-red-200" : ""}`}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
      <span className={ok ? "" : "text-red-200"}>{label}</span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <code className="truncate">{value}</code>
    </div>
  );
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("pt-BR"); } catch { return v; }
}
