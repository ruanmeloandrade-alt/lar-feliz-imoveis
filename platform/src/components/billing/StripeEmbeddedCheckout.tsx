import { useMemo } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";

export function StripeEmbeddedCheckout({ clientSecret }: { clientSecret: string }) {
  const stripePromise = useMemo(() => {
    try {
      return getStripe();
    } catch {
      return null;
    }
  }, []);

  const options = useMemo(
    () => ({
      fetchClientSecret: async () => clientSecret,
    }),
    [clientSecret],
  );

  if (!stripePromise) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Checkout Stripe não configurado nesta versão.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card p-2">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}