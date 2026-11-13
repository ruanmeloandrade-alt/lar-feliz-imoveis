import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { slimAuthFailureMessage } from "@/lib/slim-auth-network.core";
import { isSlimRecoveryLocation, safeSlimAuthReturn } from "@/lib/slim-auth-gate.core";
import { AccessField, accessInputClass, accessLinkClass, PasswordRecoveryContext, VanessaAccessCard } from "@/components/auth/VanessaAccessCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: z.object({
    mode: z.enum(["login", "signup", "forgot", "recovery"]).optional(),
    next: z.string().optional(),
    redefinida: z.literal("sim").optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: "Acesso · Vanessa Simoni" }] }),
  component: AuthPage,
});

const invalidLink = "O link de redefinição expirou ou já foi usado. Solicite outro.";

function AuthPage() {
  const navigate = useNavigate();
  const { mode, next, redefinida } = Route.useSearch();
  const destination = safeSlimAuthReturn(next) ?? "/painel";
  const recovering = useRef(mode === "recovery" || isSlimRecoveryLocation(window.location.pathname, window.location.search, window.location.hash));
  const busy = useRef(false);
  const [recoveryEvent, setRecoveryEvent] = useState(false);
  const verifiedRecovery = useContext(PasswordRecoveryContext) || recoveryEvent;
  const [recoveryReady, setRecoveryReady] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowLogin, setSlowLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);
  const isRecovery = mode === "recovery" || recoveryEvent;
  const isForgot = mode === "forgot" && !isRecovery;

  useEffect(() => {
    if (!loading || isRecovery || isForgot) {
      setSlowLogin(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLogin(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [loading, isRecovery, isForgot]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (recovering.current || isRecovery) setRecoveryReady(verifiedRecovery && !sessionError && Boolean(data.session));
      else if (data.session && !isForgot) window.location.replace(destination);
    }).catch(() => { if (active && (recovering.current || isRecovery)) setRecoveryReady(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        recovering.current = true;
        setRecoveryReady(Boolean(session));
        setRecoveryEvent(true);
        setPassword("");
        setConfirmPassword("");
      } else if (event === "SIGNED_IN" && session && !busy.current && !recovering.current && !isRecovery && !isForgot) {
        window.location.replace(destination);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [destination, isForgot, isRecovery, verifiedRecovery]);

  function clearForm() {
    setError(null);
    setRecoverySent(false);
    setPassword("");
    setConfirmPassword("");
  }

  function returnToLogin() {
    clearForm();
    setRecoveryEvent(false);
    recovering.current = false;
    void navigate({ to: "/auth", search: { mode: "login", next }, replace: true });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || (isRecovery && !recoveryReady)) return;
    setError(null);
    if (isRecovery && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      if (isRecovery) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword("");
        setConfirmPassword("");
        await supabase.auth.signOut({ scope: "local" });
        window.location.replace("/auth?redefinida=sim");
        return;
      }
      const cleanEmail = email.trim().toLowerCase();
      if (isForgot) {
        // Keep the callback on the allow-listed recovery path. Protected routes
        // are reached after the new password is set and the user signs in again.
        const callback = new URL("/auth?mode=recovery", window.location.origin);
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: callback.href });
        if (recoveryError) throw recoveryError;
        setRecoverySent(true);
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) throw signInError;
      if (!data.session) throw new Error("Não foi possível iniciar sua sessão.");
      window.location.replace(destination);
    } catch (err) {
      const message = slimAuthFailureMessage(err);
      setError(isRecovery && /session|jwt|expired/i.test(message) ? invalidLink : message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const title = isRecovery ? "Redefinir senha" : isForgot ? "Recuperar senha" : "Acesso ao sistema";

  return (
    <VanessaAccessCard title={title}>
      {isRecovery && recoveryReady !== true ? (
        <div className="mt-5 space-y-4 text-sm">
          {recoveryReady === null ? <p role="status">Validando o link…</p> : <>
            <p role="alert">{invalidLink}</p>
            <Link to="/auth" search={{ mode: "forgot", next }} className={accessLinkClass} onClick={() => { clearForm(); recovering.current = false; setRecoveryEvent(false); }}>Solicitar novo link</Link>
          </>}
        </div>
      ) : recoverySent && isForgot ? (
        <div className="mt-5 space-y-4 text-sm">
          <p role="status">Se o e-mail estiver cadastrado, você receberá o link. Confira também a pasta de spam.</p>
          <button type="button" className={accessLinkClass} onClick={returnToLogin}>Voltar ao login</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
          {redefinida === "sim" && !isRecovery && !isForgot && <p role="status" className="text-sm">Senha redefinida. Entre com a nova senha.</p>}
          {!isRecovery && <AccessField label="E-mail" id="access-email">
            <Input id="access-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={accessInputClass} />
          </AccessField>}
          {!isForgot && <AccessField label={isRecovery ? "Nova senha" : "Senha"} id="access-password">
            <PasswordInput id="access-password" autoComplete={isRecovery ? "new-password" : "current-password"} required minLength={isRecovery ? 6 : undefined} value={password} onChange={e => setPassword(e.target.value)} className={accessInputClass} />
          </AccessField>}
          {isRecovery && <AccessField label="Confirmar nova senha" id="access-password-confirmation">
            <PasswordInput id="access-password-confirmation" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={accessInputClass} />
          </AccessField>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {slowLogin && !error && <p role="status" className="text-sm text-muted-foreground">O acesso está demorando. Aguarde a resposta.</p>}
          <Button type="submit" disabled={loading} className="h-11 w-full">
            {loading ? "Aguarde…" : isRecovery ? "Salvar nova senha" : isForgot ? "Enviar link" : "Avançar"}
          </Button>
          {!isRecovery && <div className="text-center text-sm">
            {isForgot ? <button type="button" onClick={returnToLogin} className={accessLinkClass}>Voltar ao login</button> : (
              <Link to="/auth" search={{ mode: "forgot", next }} onClick={clearForm} className={accessLinkClass}>Esqueci minha senha</Link>
            )}
          </div>}
        </form>
      )}
    </VanessaAccessCard>
  );
}
