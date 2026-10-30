import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldOff, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/sem-acesso")({
  head: () => ({
    meta: [
      { title: "Sem acesso · Vanessa Simoni" },
      { name: "description", content: "Você não tem permissão para acessar este módulo." },
    ],
  }),
  component: SemAcessoPage,
});

function SemAcessoPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 text-destructive grid place-items-center">
          <ShieldOff className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-semibold">Sem acesso a este módulo</h1>
        <p className="text-sm text-muted-foreground">
          O administrador do workspace não liberou este módulo para o seu usuário. Fale com o
          responsável pela conta se você precisa de acesso.
        </p>
        <Link
          to="/painel"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para o painel
        </Link>
      </div>
    </div>
  );
}
