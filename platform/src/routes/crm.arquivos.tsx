import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { Route as LegacyFilesRoute } from "@/legacy/crm.arquivos.legacy";
import { RobustCrmAuxSurface } from "@/components/crm/RobustCrmAuxSurface";

const LegacyFilesComponent = LegacyFilesRoute.options.component as ComponentType | undefined;

export const Route = createFileRoute("/crm/arquivos")({
  head: () => ({ meta: [
    { title: "Arquivos · CRM · Vanessa Simoni" },
    { name: "description", content: "Central operacional de arquivos por cliente e empresa no CRM Vanessa Simoni." },
  ] }),
  component: ArquivosPage,
});

function ArquivosPage() {
  if (!LegacyFilesComponent) return <div className="min-h-screen bg-background p-6 text-sm text-destructive">Não foi possível carregar Arquivos.</div>;
  return <RobustCrmAuxSurface variant="arquivos"><LegacyFilesComponent /></RobustCrmAuxSurface>;
}
