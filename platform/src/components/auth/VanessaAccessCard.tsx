import { createContext, type ReactNode } from "react";

export const PasswordRecoveryContext = createContext(false);

export const accessInputClass = "h-11 bg-background";
export const accessLinkClass = "font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline";

export function VanessaAccessCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 text-foreground">
      <section aria-labelledby="vanessa-access-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm text-muted-foreground">Vanessa Simoni</p>
        <h1 id="vanessa-access-title" className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function AccessField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
