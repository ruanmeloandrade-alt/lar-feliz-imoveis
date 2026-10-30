import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Check, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVerifiedCheckoutReturnStatus } from "@/lib/billing/checkout-return.functions";

const searchSchema = z.object({
  session_id: z.string().trim().min(1).max(255),
});

export const Route = createFileRoute("/checkout-retorno")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Confirmação do pagamento · Vanessa Simoni" }] }),
  component: CheckoutReturnPage,
});

function CheckoutReturnPage() {
  const { session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const loadStatus = useServerFn(getVerifiedCheckoutReturnStatus);
  const statusQuery = useQuery({
    queryKey: ["billing", "checkout-return", sessionId],
    queryFn: () => loadStatus({ data: { sessionId } }),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "pending" || data?.activation_pending === true ? 2_000 : false;
    },
    retry: 2,
  });

  const status = statusQuery.data?.status;
  const paid = status === "paid";
  const activationPending = paid && statusQuery.data?.activation_pending === true;
  const failed = status === "failed" || status === "canceled" || status === "expired";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
        {statusQuery.isPending ? (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-5 text-2xl font-bold">Verificando pagamento</h1>
            <p className="mt-2 text-sm text-muted-foreground">Estamos consultando a confirmação da cobrança antes de liberar o plano.</p>
          </>
        ) : statusQuery.isError ? (
          <>
            <TriangleAlert className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-5 text-2xl font-bold">Não foi possível confirmar agora</h1>
            <p className="mt-2 text-sm text-muted-foreground">O pagamento não será marcado como confirmado sem validação. Tente consultar novamente.</p>
            <Button className="mt-6 w-full" onClick={() => statusQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Consultar novamente
            </Button>
          </>
        ) : paid ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
              {activationPending ? <Loader2 className="h-7 w-7 animate-spin" /> : <Check className="h-7 w-7" />}
            </div>
            <h1 className="mt-5 text-2xl font-bold">Pagamento confirmado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {activationPending
                ? "A cobrança já foi confirmada. Estamos reconciliando a ativação do seu acesso sem refazer o pagamento."
                : "A cobrança foi validada e seu acesso foi reconciliado de acordo com o pagamento confirmado."}
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate({ to: "/painel" })}>Ir para o painel</Button>
          </>
        ) : failed ? (
          <>
            <TriangleAlert className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-5 text-2xl font-bold">Pagamento não concluído</h1>
            <p className="mt-2 text-sm text-muted-foreground">A cobrança não foi confirmada. Nenhuma confirmação de pagamento será exibida até existir um pagamento válido.</p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => navigate({ to: "/configuracoes" })}>Voltar para planos</Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-5 text-2xl font-bold">Pagamento em processamento</h1>
            <p className="mt-2 text-sm text-muted-foreground">A Stripe ainda não confirmou a cobrança. Esta tela atualiza automaticamente e não libera confirmação antecipada.</p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => statusQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar agora
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
