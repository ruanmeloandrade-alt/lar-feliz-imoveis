import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { Route as LegacyConfigRoute } from "@/legacy/configuracoes.legacy";
import { RobustConfigSurface } from "@/components/settings/RobustConfigSurface";

const LegacyConfigComponent = LegacyConfigRoute.options.component as ComponentType | undefined;

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · Vanessa Simoni" },
      {
        name: "description",
        content: "Equipe, permissões, acessos e segurança da operação Vanessa Simoni.",
      },
    ],
  }),
  component: ConfigPage,
});

function ConfigPage() {
  if (!LegacyConfigComponent) {
    return (
      <div className="min-h-screen bg-background p-6 text-sm text-destructive">
        Não foi possível carregar a área de Configurações.
      </div>
    );
  }

  return (
    <RobustConfigSurface>
      <LegacyConfigComponent />
    </RobustConfigSurface>
  );
}
