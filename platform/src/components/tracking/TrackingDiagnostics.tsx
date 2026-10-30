import { useState } from "react";
import { AlertTriangle, CheckCircle2, PlayCircle, Globe, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { Input } from "@/components/ui/input";
import { listTrackingSites } from "@/lib/tracking.functions";
import { verifyPixelInstall } from "@/lib/tracking-rules.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";
import { toast } from "sonner";

type Site = { id: string; name: string; domain: string; verified: boolean; last_event_at: string | null; events_24h: number | null };
type LiveResult = { domain: string; snippetFound: boolean; eventsCount: number; issues: string[] };

function normalizeDomain(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function TrackingDiagnostics() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [result, setResult] = useState<LiveResult | null>(null);

  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";
  const { data: sites = [], refetch: refetchSites } = useQuery({
    queryKey: ["tracking-sites", workspaceId],
    queryFn: () => listTrackingSites({ data: { workspaceId } }),
    enabled: !!workspaceId,
    refetchInterval: 30000,
  });

  const checkSite = async (siteId: string) => {
    setChecking(siteId);
    try {
      const r = await verifyPixelInstall({ data: { workspaceId, siteId } });
      await refetchSites();
      if (!r.httpOk && !r.snippetFound) {
        toast.error(`Não conseguimos abrir ${r.domain}. ${r.httpError ?? "Site fora do ar ou bloqueando robôs."}`);
      } else if (!r.snippetFound) {
        toast.error("Pixel não encontrado no HTML da home. Confirme se o código está no <head> e se a página foi publicada.");
      } else if (r.eventsCount === 0) {
        toast.warning("Pixel encontrado no site, mas nenhum evento chegou ainda. Abra o site em uma aba anônima e recarregue.");
      } else {
        toast.success(`Tudo certo, pixel instalado e ${r.eventsCount} evento(s) recebido(s) nos últimos 30 dias.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao verificar");
    } finally {
      setChecking(null);
    }
  };

  const run = async () => {
    if (!url.trim() || !workspaceId) return;
    setRunning(true);
    setResult(null);
    try {
      const requestedDomain = normalizeDomain(url.trim());
      if (!requestedDomain) {
        setResult({ domain: url.trim(), snippetFound: false, eventsCount: 0, issues: ["URL inválida. Informe um domínio ou URL completa."] });
        return;
      }

      const registeredSite = (sites as Site[]).find((site) => normalizeDomain(site.domain) === requestedDomain);
      if (!registeredSite) {
        setResult({
          domain: requestedDomain,
          snippetFound: false,
          eventsCount: 0,
          issues: ["Este domínio não está cadastrado neste workspace. Adicione-o primeiro na aba Fontes para que o teste seja seguro e específico do site."],
        });
        return;
      }

      const verified = await verifyPixelInstall({ data: { workspaceId, siteId: registeredSite.id } });
      const issues: string[] = [];
      if (!verified.httpOk) issues.push(`Não conseguimos abrir ${verified.domain}. ${verified.httpError ?? "O site pode estar fora do ar ou bloqueando o verificador."}`);
      if (!verified.snippetFound) issues.push("Pixel Vanessa Simoni não encontrado no HTML da home deste domínio.");
      if (verified.snippetFound && verified.eventsCount === 0) issues.push("Pixel encontrado, mas nenhum evento deste site chegou nos últimos 30 dias.");

      setResult({
        domain: verified.domain,
        snippetFound: verified.snippetFound,
        eventsCount: verified.eventsCount,
        issues,
      });
      await refetchSites();
    } catch (e) {
      setResult({
        domain: normalizeDomain(url.trim()) || url.trim(),
        snippetFound: false,
        eventsCount: 0,
        issues: [e instanceof Error ? e.message : "Falha ao verificar este site."],
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <ModuleSection title="Health check por fonte" description="Um status por site cadastrado. Atualiza sozinho a cada 30 s.">
        {(sites as Site[]).length === 0 ? (
          <div className="text-xs text-muted-foreground py-4">Nenhum site cadastrado. Adicione um na aba <strong>Fontes</strong>.</div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {(sites as Site[]).map((s) => {
              const stale = s.last_event_at ? (Date.now() - new Date(s.last_event_at).getTime()) > 24 * 3600 * 1000 : true;
              const status = !s.verified ? "pending" : stale ? "warning" : "ok";
              return (
                <li key={s.id} className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-muted grid place-items-center"><Globe className="w-4 h-4 text-muted-foreground" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{s.domain}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.last_event_at ? `último evento: ${new Date(s.last_event_at).toLocaleString("pt-BR")}` : "nenhum evento ainda"}
                  </div>
                  <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${status === "ok" ? "bg-success/15 text-success" : status === "warning" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                    {status === "ok" ? "OK" : status === "warning" ? "sem eventos recentes" : "aguardando pixel"}
                  </span>
                  <button onClick={() => checkSite(s.id)} disabled={checking === s.id} className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-60">
                    {checking === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Verificar agora
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ModuleSection>

      <ModuleSection title="Testador ao vivo" description="Informe um site já cadastrado para verificar o HTML e os eventos daquele domínio, sem misturar dados de outras fontes.">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-xs" placeholder="https://seu-site.com" />
          <button onClick={run} disabled={running || !url.trim()} className="inline-flex items-center gap-1 text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            <PlayCircle className="w-3.5 h-3.5" /> {running ? "Testando…" : "Rodar teste"}
          </button>
        </div>
        {!result && !running && (
          <p className="mt-2 text-[11px] text-muted-foreground">O teste usa o cadastro da aba <strong>Fontes</strong>, verifica o pixel no servidor e cruza somente os eventos daquele site.</p>
        )}

        {result && (
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Resultado do domínio</div>
              <div className="space-y-2 text-xs">
                <div className="font-mono break-all">{result.domain}</div>
                <div className="flex items-center gap-2">
                  {result.snippetFound ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                  Pixel {result.snippetFound ? "encontrado" : "não confirmado"}
                </div>
                <div className="flex items-center gap-2">
                  {result.eventsCount > 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                  {result.eventsCount.toLocaleString("pt-BR")} evento(s) deste site nos últimos 30 dias
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Sugestões</div>
              {result.issues.length === 0 ? (
                <div className="text-xs text-success flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> Pixel e recebimento de eventos confirmados para este domínio.</div>
              ) : (
                <ul className="space-y-1 text-xs">
                  {result.issues.map((issue) => (
                    <li key={issue} className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5" /><span>{issue}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </ModuleSection>
    </div>
  );
}
