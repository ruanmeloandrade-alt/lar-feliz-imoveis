import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/recuperar-acesso")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recuperar acesso · Vanessa Simoni" },
      { name: "description", content: "Use um código de recuperação de uso único para definir uma nova senha na Vanessa Simoni." },
      { property: "og:title", content: "Recuperar acesso · Vanessa Simoni" },
      { property: "og:description", content: "Redefina sua senha Vanessa Simoni com um código de recuperação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecuperarAcesso,
});

function RecuperarAcesso() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) return setError("A nova senha precisa ter ao menos 8 caracteres.");
    if (pw1 !== pw2) return setError("As senhas não coincidem.");
    setLoading(true);
    try {
      const res = await fetch("/api/public/recovery-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code, password: pw1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível redefinir a senha.");
      setDone(true);
      setTimeout(() => navigate({ to: "/auth", search: { mode: "login" } }), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar acesso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe um dos códigos de recuperação que você salvou. Cada código só funciona uma vez.
        </p>

        {done ? (
          <div className="mt-5 rounded-md border border-success/30 bg-success/10 px-3 py-3 text-sm text-success flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            Senha redefinida. Redirecionando para o login…
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={submit}>
            <Input
              type="email" placeholder="E-mail da conta" value={email} required autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Código de recuperação (ex: 4F2K-9QX1)" value={code} required
              onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono tracking-wider"
            />
            <PasswordInput placeholder="Nova senha" value={pw1} required minLength={8} autoComplete="new-password"
              onChange={(e) => setPw1(e.target.value)} />
            <PasswordInput placeholder="Repita a nova senha" value={pw2} required minLength={8} autoComplete="new-password"
              onChange={(e) => setPw2(e.target.value)} />

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Redefinir senha
            </Button>
          </form>
        )}

        <Link to="/auth" search={{ mode: "login" }} className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}
