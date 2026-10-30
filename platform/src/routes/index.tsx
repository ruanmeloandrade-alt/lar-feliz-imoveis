import { createFileRoute, redirect } from "@tanstack/react-router";

// Vanessa Simoni é um sistema interno. A entrada pública é a autenticação.
// Usuários autenticados são encaminhados para /saude-slim após o login.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});
