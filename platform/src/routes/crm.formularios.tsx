import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/crm/formularios")({
  beforeLoad: () => {
    throw redirect({ to: "/crm/funis-de-venda" });
  },
});
