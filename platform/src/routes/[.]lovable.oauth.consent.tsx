import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
};

type AuthzDetails = {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Pedido de autorização inválido.");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { mode: "login", next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-sm">
        Não foi possível carregar este pedido de autorização: {String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "o aplicativo";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não devolveu um endereço de retorno.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Conectar {clientName} à sua conta Vanessa Simoni</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ao aprovar, {clientName} vai acessar a Vanessa Simoni como você, dentro do workspace que estiver ativo. Ele poderá
          consultar CRM, tarefas, tracking e social media, além de criar leads, tarefas e ideias de conteúdo.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Você pode revogar esse acesso a qualquer momento em Configurações, Segurança.
        </p>

        {error && (
          <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aprovar
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">
            Recusar
          </Button>
        </div>
      </section>
    </main>
  );
}
