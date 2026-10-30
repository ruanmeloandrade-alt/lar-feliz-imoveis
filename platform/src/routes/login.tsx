import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import {slimAuthFailureMessage} from "@/lib/slim-auth-network.core";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar · Vanessa Simoni" },
      { name: "description", content: "Entre na sua conta Vanessa Simoni existente." },
    ],
  }),
  component: LoginPage,
});

function isEmailNotConfirmed(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "email_not_confirmed" || /email.*not.*confirm|confirm.*email/i.test(error?.message ?? "");
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/saude-slim", replace: true });
    }).catch(() => { /* Keep the login form available if a stored refresh fails. */ });
    return () => { active = false; };
  }, [navigate]);

  async function signInExistingAccount(cleanEmail: string, currentPassword: string) {
    let result = await supabase.auth.signInWithPassword({ email: cleanEmail, password: currentPassword });

    if (isEmailNotConfirmed(result.error)) {
      const response = await fetch("/api/public/auth/confirm-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password: currentPassword }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Não foi possível liberar esta conta.");
      }
      result = await supabase.auth.signInWithPassword({ email: cleanEmail, password: currentPassword });
    }

    if (result.error) throw result.error;
    if (!result.data.session) throw new Error("Não foi possível iniciar sua sessão.");
    return result.data.session;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (!password) {
      setError("Informe sua senha.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await signInExistingAccount(cleanEmail, password);

      // Login de conta existente termina aqui. Cadastro/onboarding pertence a /auth?mode=signup.
      navigate({ to: "/saude-slim", replace: true });
    } catch (err) {
      const message = slimAuthFailureMessage(err);
      setError(/invalid login credentials|e-mail ou senha inválidos/i.test(message) ? "E-mail ou senha inválidos." : message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="slim-auth flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LogIn className="h-5 w-5" />
        </div>
        <img src="/brand/vanessa.jpg" alt="Vanessa Simoni" width="140" height="140" className="slim-login-logo" />
        <h1 className="text-2xl font-semibold tracking-tight">Entrar na Vanessa Simoni</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use os dados da sua conta existente para acessar a plataforma.</p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="E-mail"
          />
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha"
            className="w-full"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          <Link to="/auth" search={{ mode: "forgot" }} className="font-medium text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </div>
      </section>
    </main>
  );
}
