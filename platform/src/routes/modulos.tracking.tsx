import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { ModuleGate } from "@/components/billing/ModuleGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrackingOverview } from "@/components/tracking/TrackingOverview";
import { TrackingSourcesGrid } from "@/components/tracking/TrackingSourcesGrid";
import { TrackingEventsTable } from "@/components/tracking/TrackingEventsTable";
import { TrackingUtmBuilder } from "@/components/tracking/TrackingUtmBuilder";
import { VanessaIcons } from "@/components/dashboard/VanessaIcons";
export const Route = createFileRoute("/modulos/tracking")({
  head: () => ({ meta: [{ title: "Tracking & Analytics · Vanessa Simoni" }] }),
  component: () => (
    <ModuleGate module="tracking">
      <TrackingPage />
    </ModuleGate>
  ),
});
function TrackingPage() {
  const [tab, setTab] = useState("visao");
  return (
    <ModuleShell
      icon={VanessaIcons.tracking as any}
      tag="TRACKING"
      title="Tracking & Analytics"
      description="Acompanhe as visitas do site Vanessa Simoni, as fontes conectadas e as campanhas."
      status="ativo"
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex w-full h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="fontes">Fontes</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="utms">UTMs & Campanhas</TabsTrigger>
        </TabsList>
        <TabsContent value="visao">
          <TrackingOverview />
        </TabsContent>
        <TabsContent value="fontes">
          <TrackingSourcesGrid workspaceId="2a0e0d29-4e23-47e6-bd9f-30aa8e15e698" managed />
        </TabsContent>
        <TabsContent value="eventos">
          <TrackingEventsTable />
        </TabsContent>
        <TabsContent value="utms">
          <TrackingUtmBuilder />
        </TabsContent>
      </Tabs>
    </ModuleShell>
  );
}
