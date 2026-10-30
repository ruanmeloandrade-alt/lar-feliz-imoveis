import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Copy, PlayCircle, Plus } from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { ModuleGate } from "@/components/billing/ModuleGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveWorkspace } from "@/lib/workspace.functions";
import { TrackingOverview } from "@/components/tracking/TrackingOverview";
import { TrackingInstallWizard } from "@/components/tracking/TrackingInstallWizard";
import { TrackingSourcesGrid } from "@/components/tracking/TrackingSourcesGrid";
import { TrackingEventsTable } from "@/components/tracking/TrackingEventsTable";
import { TrackingUtmBuilder } from "@/components/tracking/TrackingUtmBuilder";
import { TrackingConversions } from "@/components/tracking/TrackingConversions";
import { TrackingDiagnostics } from "@/components/tracking/TrackingDiagnostics";
import { TrackingDispatchLog } from "@/components/tracking/TrackingDispatchLog";
import { TrackingEventMapper } from "@/components/tracking/TrackingEventMapper";
import { AddSiteDialog } from "@/components/tracking/AddSiteDialog";

export const Route = createFileRoute("/modulos/tracking")({
  head: () => ({
    meta: [
      { title: "Tracking & Analytics · Vanessa Simoni" },
      { name: "description", content: "Instale o pixel da Vanessa Simoni, gere links com UTM, veja eventos em tempo real e conecte Meta, Google, CRM e WhatsApp." },
    ],
  }),
  component: TrackingAccessPage,
});

function TrackingAccessPage() {
  return (
    <ModuleGate module="tracking">
      <TrackingPage />
    </ModuleGate>
  );
}

function TrackingPage() {
  const [tab, setTab] = useState("visao");
  const [addOpen, setAddOpen] = useState(false);
  const { data: ws } = useQuery({
    queryKey: ["active-workspace"],
    queryFn: () => getActiveWorkspace(),
  });

  const workspaceId = ws?.id ?? "";
  const pixelToken = useMemo(() => (workspaceId ? `pk_${workspaceId.replace(/-/g, "").slice(0, 20)}` : ""), [workspaceId]);

  const copyPixel = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://saudeslim.local";
    const snippet = `<!-- Vanessa Simoni Pixel -->\n<script async src="${origin}/api/public/track/px.js?w=${workspaceId}"></script>`;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      /* noop */
    }
  };

  return (
    <ModuleShell
      icon={BarChart3}
      tag="TRACKING"
      title="Tracking & Analytics"
      description="Instale, gere UTMs e acompanhe cada evento, do primeiro clique até a venda."
      status="ativo"
      actions={
        <>
          <button
            onClick={copyPixel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted"
          >
            <Copy className="w-3.5 h-3.5" /> Copiar código do pixel (cola no seu site)
          </button>
          <button
            onClick={() => setAddOpen(true)}
            disabled={!workspaceId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar site
          </button>
          <button
            onClick={() => setTab("instalacao")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
          >
            <PlayCircle className="w-3.5 h-3.5" /> Instalar em 3 passos
          </button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex w-full h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="instalacao">Instalação</TabsTrigger>
          <TabsTrigger value="fontes">Fontes</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="utms">UTMs & Campanhas</TabsTrigger>
          <TabsTrigger value="eventos-custom">Eventos do site</TabsTrigger>
          <TabsTrigger value="conversoes">Conversões</TabsTrigger>
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao"><TrackingOverview /></TabsContent>
        <TabsContent value="instalacao">
          <TrackingInstallWizard workspaceId={workspaceId} pixelToken={pixelToken} />
        </TabsContent>
        <TabsContent value="fontes">
          <TrackingSourcesGrid workspaceId={workspaceId} onAdd={() => setAddOpen(true)} />
        </TabsContent>
        <TabsContent value="eventos"><TrackingEventsTable /></TabsContent>
        <TabsContent value="utms"><TrackingUtmBuilder /></TabsContent>
        <TabsContent value="eventos-custom"><TrackingEventMapper /></TabsContent>
        <TabsContent value="conversoes"><TrackingConversions /></TabsContent>
        <TabsContent value="diagnostico" className="space-y-6">
          <TrackingDiagnostics />
          <TrackingDispatchLog />
        </TabsContent>
      </Tabs>
      {workspaceId && (
        <AddSiteDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} />
      )}
    </ModuleShell>
  );
}
