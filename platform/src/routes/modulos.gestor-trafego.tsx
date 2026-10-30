import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/ModuleGate";

export const Route = createFileRoute("/modulos/gestor-trafego")({
  component: GestorTrafegoAccessRoute,
});

function GestorTrafegoAccessRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isExecutableAutomations = pathname === "/modulos/gestor-trafego/automacoes";

  return (
    <ModuleGate module={isExecutableAutomations ? "trafego_automacoes" : "trafego_ia"}>
      <Outlet />
    </ModuleGate>
  );
}
