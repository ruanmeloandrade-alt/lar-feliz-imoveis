import { createFileRoute } from "@tanstack/react-router";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { ModuleGate } from "@/components/billing/ModuleGate";
import { TrackingOverview } from "@/components/tracking/TrackingOverview";
import { TrackingSourcesGrid } from "@/components/tracking/TrackingSourcesGrid";
import { TrackingEventsTable } from "@/components/tracking/TrackingEventsTable";
import { TrackingUtmBuilder } from "@/components/tracking/TrackingUtmBuilder";
import { VanessaIcons } from "@/components/dashboard/VanessaIcons";
export const Route = createFileRoute("/modulos/tracking")({
  validateSearch: (search: Record<string, unknown>): { secao?: "fontes" | "eventos" | "utms" } => ({
    secao: search.secao === "fontes" || search.secao === "eventos" || search.secao === "utms" ? search.secao : undefined,
  }),
  head: () => ({ meta: [{ title: "Tracking & Analytics · Vanessa Simoni" }] }),
  component: () => (
    <ModuleGate module="tracking">
      <TrackingPage />
    </ModuleGate>
  ),
});
function TrackingPage() {
  const { secao } = Route.useSearch();
  const sections = {
    visao: { title: "Visão geral", content: <TrackingOverview /> },
    fontes: { title: "Fontes", content: <TrackingSourcesGrid workspaceId="2a0e0d29-4e23-47e6-bd9f-30aa8e15e698" managed /> },
    eventos: { title: "Eventos", content: <TrackingEventsTable /> },
    utms: { title: "UTMs e campanhas", content: <TrackingUtmBuilder /> },
  };
  const current = sections[secao ?? "visao"];
  return (
    <ModuleShell
      icon={VanessaIcons.tracking as any}
      tag="TRACKING"
      title={current.title}
      description="Acompanhe as visitas do site Vanessa Simoni, as fontes conectadas e as campanhas."
      status="ativo"
    >
      {current.content}
    </ModuleShell>
  );
}
