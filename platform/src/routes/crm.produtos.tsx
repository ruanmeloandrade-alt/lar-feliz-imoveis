import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { Route as LegacyProductRoute } from "@/legacy/crm.produtos.legacy";
import { RobustCrmAuxSurface } from "@/components/crm/RobustCrmAuxSurface";

const LegacyProductComponent = LegacyProductRoute.options.component as ComponentType | undefined;

export const Route = createFileRoute("/crm/produtos")({
  head: () => ({ meta: [
    { title: "Imóveis · Vanessa Simoni" },
    { name: "description", content: "Catálogos, categorias e valores dos imóveis da Vanessa Simoni." },
  ] }),
  component: ProdutosPage,
});

function ProdutosPage() {
  if (!LegacyProductComponent) return <div className="min-h-screen bg-background p-6 text-sm text-destructive">Não foi possível carregar os imóveis.</div>;
  return <RobustCrmAuxSurface variant="produtos"><LegacyProductComponent /></RobustCrmAuxSurface>;
}
