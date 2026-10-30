import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/afiliado/painel")({
  beforeLoad: () => {
    throw redirect({ to: "/partners/afiliado" });
  },
  component: () => null,
});