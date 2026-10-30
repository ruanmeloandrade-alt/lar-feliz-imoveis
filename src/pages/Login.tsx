import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Home, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Login = () => {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<boolean | null>(null);
  const [setupToken, setSetupToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');

  useEffect(() => { apiClient.auth.status().then(data => setSetup(data.setupRequired)).catch(() => setSetup(false)); }, []);

  useEffect(() => {
    if (!authLoading && user) nav("/admin", { replace: true });
  }, [user, authLoading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (setup) {
        await apiClient.auth.setup({ email: email.trim(), password, token: setupToken });
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        const { error } = await apiClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      }
      toast.success("Bem-vinda!");
      nav("/admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero flex items-center justify-center p-4 relative overflow-hidden">
      <div className="divider-sp absolute top-0 inset-x-0" />
      <div className="absolute inset-0 bg-sp-stripe opacity-[0.04]" />

      <div className="relative z-10 w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-primary-foreground/70 hover:text-primary-foreground text-sm mb-6 transition"
        >
          <Home className="w-4 h-4" /> Voltar ao site
        </Link>

        <div className="bg-card rounded-lg shadow-2xl p-8 border border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">
                Área da Corretora
              </h1>
              <p className="text-xs text-muted-foreground">
                {setup ? 'Primeiro acesso' : 'Vanessa Simoni'}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                required
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="pass">Senha</Label>
              <Input
                id="pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={setup ? 12 : 6}
                maxLength={100}
              />
            </div>
            {setup && !new URLSearchParams(window.location.hash.slice(1)).has('token') && <div><Label htmlFor="setup-token">Chave de configuracao</Label><Input id="setup-token" type="password" value={setupToken} onChange={event => setSetupToken(event.target.value)} required /></div>}
            <Button type="submit" className="w-full" size="lg" disabled={loading || setup === null}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {setup ? 'Criar acesso' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
