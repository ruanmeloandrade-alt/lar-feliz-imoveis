import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, CircleDashed, Plug } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { ConnectorDialog } from "@/components/integrations/ConnectorDialog";
import { IntegrationConnectPanel } from "@/components/integrations/IntegrationConnectPanel";
import { ZapiConnectPanel } from "@/components/integrations/ZapiConnectPanel";
import { EvolutionConnectPanel } from "@/components/integrations/EvolutionConnectPanel";
import { MetaConnectPanel } from "@/components/integrations/MetaConnectPanel";
import { WhatsAppCloudPanel } from "@/components/integrations/WhatsAppCloudPanel";
import { TikTokConnectPanel } from "@/components/integrations/TikTokConnectPanel";
import { ShopifyConnectPanel } from "@/components/integrations/ShopifyConnectPanel";
import { GoogleConnectPanel } from "@/components/integrations/GoogleConnectPanel";
import { EmailConnectPanel } from "@/components/integrations/EmailConnectPanel";
import { SignatureConnectPanel, type SignatureProvider } from "@/components/integrations/SignatureConnectPanel";
import { ExternalAutomationPanel } from "@/components/integrations/ExternalAutomationPanel";
import { AgentMcpPanel, type AgentProvider } from "@/components/integrations/AgentMcpPanel";
import type { ExternalProvider } from "@/lib/external-automations-events";
import { getIntegrationCatalogStatus } from "@/lib/integrations.functions";
import { getSignatureCatalogStatus } from "@/lib/signature-integrations.functions";
import { INTEGRATIONS, summarizeStatus, type Integration } from "@/lib/integrations-catalog";

export const Route = createFileRoute("/integracoes")({
  head: () => ({ meta: [
    { title: "Integrações · Vanessa Simoni" },
    { name: "description", content: "Central de integrações da Vanessa Simoni: conecte WhatsApp, canais, mídia, IA, automação, arquivos e assinatura digital." },
  ] }),
  component: IntegracoesPage,
});

const RETIRED_IDS = new Set(["microsoft-office"]);
const SAUDE_SLIM_INTEGRATIONS = new Set(["meta", "whatsapp-web", "openai", "claude-code", "gemini", "webhooks", "conta-google"]);
type CatalogStatus = Record<string, { status: Integration["status"]; technicalStatus?: Integration["technicalStatus"] }>;

function IntegracoesPage() {
  const [selected, setSelected] = useState<Integration | null>(null);
  const [livePanel, setLivePanel] = useState<"openai" | "gemini" | "ideogram" | "recraft" | "freepik" | null>(null);
  const [zapiOpen, setZapiOpen] = useState(false);
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [waCloudOpen, setWaCloudOpen] = useState(false);
  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [signatureProvider, setSignatureProvider] = useState<SignatureProvider | null>(null);
  const [externalAutomation, setExternalAutomation] = useState<ExternalProvider | null>(null);
  const [agentPanel, setAgentPanel] = useState<AgentProvider | null>(null);
  const [waStatus, setWaStatus] = useState<Integration["status"] | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>({});
  const loadCatalogStatus = useServerFn(getIntegrationCatalogStatus);
  const loadSignatureStatus = useServerFn(getSignatureCatalogStatus);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: profile } = await supabase.from("profiles").select("current_workspace_id").eq("id", userData.user.id).maybeSingle();
        const workspaceId = profile?.current_workspace_id;
        if (!workspaceId) return;
        const { listEvolutionSessions } = await import("@/lib/evolution.functions");
        const result = await listEvolutionSessions({ data: { workspaceId } });
        if (cancelled) return;
        const rows = result.sessions as { status: string }[];
        // Uma sessão ainda não pareada continua sendo uma integração disponível.
        // Nunca bloquear o card como "em preparação" só porque já existe uma
        // instância aguardando/renovando QR.
        setWaStatus(rows.some((session) => session.status === "conectado") ? "conectado" : "desconectado");
      } catch { /* status auxiliar */ }
    })();
    return () => { cancelled = true; };
  }, [evolutionOpen]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCatalogStatus(), loadSignatureStatus()])
      .then(([general, signatures]) => { if (!cancelled) setCatalogStatus({ ...general, ...signatures }); })
      .catch(() => { if (!cancelled) setCatalogStatus({}); });
    return () => { cancelled = true; };
  }, [loadCatalogStatus, loadSignatureStatus, livePanel, metaOpen, waCloudOpen, tiktokOpen, shopifyOpen, googleOpen, emailOpen, signatureProvider, externalAutomation]);

  function openIntegration(integration: Integration) {
    if (integration.id === "openai") setLivePanel("openai");
    else if (integration.id === "gemini") setLivePanel("gemini");
    else if (integration.id === "ideogram") setLivePanel("ideogram");
    else if (integration.id === "recraft") setLivePanel("recraft");
    else if (integration.id === "freepik") setLivePanel("freepik");
    else if (integration.id === "whatsapp-web") setEvolutionOpen(true);
    else if (["meta", "instagram-dm", "messenger"].includes(integration.id)) setMetaOpen(true);
    else if (integration.id === "whatsapp-cloud") setWaCloudOpen(true);
    else if (integration.id === "tiktok") setTiktokOpen(true);
    else if (integration.id === "shopify") setShopifyOpen(true);
    else if (integration.id === "conta-google") setGoogleOpen(true);
    else if (integration.id === "email") setEmailOpen(true);
    else if (["clicksign", "zapsign", "docusign"].includes(integration.id)) setSignatureProvider(integration.id as SignatureProvider);
    else if (integration.id === "n8n") setExternalAutomation("n8n");
    else if (integration.id === "make") setExternalAutomation("make");
    else if (integration.id === "zapier") setExternalAutomation("zapier");
    else if (integration.id === "webhooks") setExternalAutomation("custom");
    else if (["codex", "claude-code", "openclaw"].includes(integration.id)) setAgentPanel(integration.id as AgentProvider);
    else setSelected(integration);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("meta") === "ok") setMetaOpen(true);
    if (url.searchParams.get("google")) setGoogleOpen(true);
    if (url.searchParams.get("docusign")) setSignatureProvider("docusign");
  }, []);

  const catalog = useMemo(() => {
    const base = INTEGRATIONS.filter((integration) => !RETIRED_IDS.has(integration.id) && SAUDE_SLIM_INTEGRATIONS.has(integration.id));
    return base.map((integration) => {
      const backendStatus = catalogStatus[integration.id];
      const withBackend = backendStatus ? { ...integration, ...backendStatus } : integration;
      if (withBackend.id !== "whatsapp-web" || !waStatus) return withBackend;
      return {
        ...withBackend,
        status: waStatus,
        technicalStatus: [{ label: "Status", value: waStatus === "conectado" ? "Conectado" : "Pronto para conectar" }],
      };
    });
  }, [waStatus, catalogStatus]);

  const summary = summarizeStatus(catalog);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0"><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Plug className="h-4 w-4" />Central de Integrações</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Conexões da operação</h1><p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">Meta, WhatsApp Web, IA, webhooks e Central Google reunidos para a Vanessa Simoni.</p></div><div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[360px]"><Metric label="Conectadas" value={summary.conectado} icon={<CheckCircle2 className="h-4 w-4" />} /><Metric label="Disponíveis" value={summary.desconectado} icon={<CircleDashed className="h-4 w-4" />} /></div></header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">{catalog.map((integration) => <IntegrationCard key={integration.id} integration={integration} onOpen={() => openIntegration(integration)} />)}</div>
      </div></main>
      <ConnectorDialog integration={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />
      <IntegrationConnectPanel provider={livePanel} open={!!livePanel} onOpenChange={(open) => !open && setLivePanel(null)} />
      <ZapiConnectPanel open={zapiOpen} onOpenChange={setZapiOpen} />
      <EvolutionConnectPanel open={evolutionOpen} onOpenChange={setEvolutionOpen} />
      <MetaConnectPanel open={metaOpen} onOpenChange={setMetaOpen} />
      <WhatsAppCloudPanel open={waCloudOpen} onOpenChange={setWaCloudOpen} />
      <TikTokConnectPanel open={tiktokOpen} onOpenChange={setTiktokOpen} />
      <ShopifyConnectPanel open={shopifyOpen} onOpenChange={setShopifyOpen} />
      <GoogleConnectPanel open={googleOpen} onOpenChange={setGoogleOpen} />
      <SignatureConnectPanel provider={signatureProvider} open={!!signatureProvider} onOpenChange={(open) => !open && setSignatureProvider(null)} />
      <EmailConnectPanel open={emailOpen} onOpenChange={setEmailOpen} onOpenGoogle={() => setGoogleOpen(true)} />
      <AgentMcpPanel provider={agentPanel} open={!!agentPanel} onOpenChange={(open) => !open && setAgentPanel(null)} />
      <ExternalAutomationPanel provider={externalAutomation} open={!!externalAutomation} onOpenChange={(open) => !open && setExternalAutomation(null)} />
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) { return <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5"><div><div className="text-[11px] text-muted-foreground">{label}</div><div className="text-xl font-semibold tabular-nums">{value}</div></div><div className="text-muted-foreground">{icon}</div></div>; }
