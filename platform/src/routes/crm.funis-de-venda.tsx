import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, type ComponentType } from "react";
import { Route as LegacyFunnelRoute } from "@/legacy/crm.funis-de-venda.legacy";
import { RobustCrmFunnelSurface } from "@/components/crm/RobustCrmSurface";

const LegacyFunnelComponent = LegacyFunnelRoute.options.component as ComponentType | undefined;

export const Route = createFileRoute("/crm/funis-de-venda")({
  validateSearch: (search: Record<string, unknown>): { funnelId?: string; novo?: string } => ({
    funnelId: typeof search.funnelId === "string" ? search.funnelId : undefined,
    novo: search.novo === "1" ? "1" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Funil de vendas · Vanessa Simoni" },
      { name: "description", content: "Pipeline real da Vanessa Simoni por funil, detalhamento de clientes e automações por etapa." },
    ],
  }),
  component: FunnelPage,
});

function FunnelPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    if (!search.funnelId) return;

    const timeoutId = window.setTimeout(() => {
      void navigate({
        to: "/crm/funis-de-venda",
        search: (previous) => ({ ...previous, funnelId: undefined }),
        replace: true,
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [navigate, search.funnelId]);

  if (!LegacyFunnelComponent) {
    return <div className="min-h-screen bg-background p-6 text-sm text-destructive">Não foi possível carregar o funil de vendas.</div>;
  }

  return (
    <RobustCrmFunnelSurface>
      <LegacyFunnelComponent />
    </RobustCrmFunnelSurface>
  );
}
