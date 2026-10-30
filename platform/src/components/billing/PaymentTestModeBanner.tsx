import { getPaymentsClientToken } from "@/lib/stripe";

export function PaymentTestModeBanner() {
  const token = getPaymentsClientToken();

  if (!token) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Checkout de cartão não configurado nesta versão publicada. Pix continua pela Cora quando as credenciais estiverem ativas.
      </div>
    );
  }

  if (token.startsWith("pk_test_")) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        Ambiente de teste ativo. Cartão usa Stripe; Pix é gerado separadamente pela Cora.
      </div>
    );
  }

  return null;
}