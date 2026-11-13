import { createContext, type ReactNode } from "react";

export const PasswordRecoveryContext = createContext(false);

export const accessInputClass = "h-10 bg-background";
export const accessLinkClass = "font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline";

export function VanessaAccessCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 text-foreground">
      <section aria-labelledby="vanessa-access-title" className="w-full max-w-[19rem] rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="text-xs text-muted-foreground">Vanessa Simoni</p>
        <h1 id="vanessa-access-title" className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function AccessField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}
