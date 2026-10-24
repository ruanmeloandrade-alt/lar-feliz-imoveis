import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

  useEffect(() => {
    if (!authLoading && user) nav("/admin", { replace: true });
  }, [user, authLoading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast.success("Bem-vinda!");
      nav("/admin");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao processar.");
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

        <div className="bg-card rounded-xl shadow-2xl p-8 border border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">
                Área da Corretora
              </h1>
              <p className="text-xs text-muted-foreground">
                Entre para gerenciar imóveis
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
                minLength={6}
                maxLength={100}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
