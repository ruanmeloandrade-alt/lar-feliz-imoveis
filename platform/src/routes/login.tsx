import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import {slimAuthFailureMessage} from "@/lib/slim-auth-network.core";
import { AccessField, accessInputClass, accessLinkClass, VanessaAccessCard } from "@/components/auth/VanessaAccessCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beginLoginVerification } from "@/components/auth/SlimSessionGate";

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
      if (active && data.session) navigate({ to: "/painel", replace: true });
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

      beginLoginVerification();
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      const message = slimAuthFailureMessage(err);
      setError(/invalid login credentials|e-mail ou senha inválidos/i.test(message) ? "E-mail ou senha inválidos." : message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <VanessaAccessCard title="Acesso ao sistema">
      <form className="mt-3 space-y-2.5" onSubmit={submit}>
        <AccessField label="E-mail" id="admin-email">
          <Input id="admin-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className={accessInputClass} />
        </AccessField>
        <AccessField label="Senha" id="admin-password">
          <PasswordInput id="admin-password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className={accessInputClass} />
        </AccessField>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="h-10 w-full">{loading ? "Aguarde…" : "Avançar"}</Button>
        <div className="text-center text-sm">
          <Link to="/auth" search={{ mode: "forgot" }} className={accessLinkClass}>Esqueci minha senha</Link>
        </div>
      </form>
    </VanessaAccessCard>
  );
}
