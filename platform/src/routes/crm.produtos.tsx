import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { Route as LegacyProductRoute } from "@/legacy/crm.produtos.legacy";
import { RobustCrmAuxSurface } from "@/components/crm/RobustCrmAuxSurface";

const LegacyProductComponent = LegacyProductRoute.options.component as ComponentType | undefined;

export const Route = createFileRoute("/crm/produtos")({
  head: () => ({ meta: [
    { title: "Produtos · Vanessa Simoni" },
    { name: "description", content: "Gestão de catálogos, produtos, categorias, estoque e preços da Vanessa Simoni." },
  ] }),
  component: ProdutosPage,
});

function ProdutosPage() {
  if (!LegacyProductComponent) return <div className="min-h-screen bg-background p-6 text-sm text-destructive">Não foi possível carregar Produtos.</div>;
  return <RobustCrmAuxSurface variant="produtos"><LegacyProductComponent /></RobustCrmAuxSurface>;
}
