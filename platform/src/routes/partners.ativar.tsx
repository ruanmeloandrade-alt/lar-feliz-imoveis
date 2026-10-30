import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/partners/ativar")({ component: PartnersActivatePage });

function PartnersActivatePage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invitationError = useMemo(() => {
    if (typeof window === "undefined") return null;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    return hash.get("error_description") ?? query.get("error_description");
  }, []);

  useEffect(() => {
    if (invitationError) {
      setError(decodeURIComponent(invitationError.replace(/\+/g, " ")));
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) setError("Este link de ativação é inválido ou expirou. Solicite um novo convite.");
      else setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (active && session) setReady(true); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [invitationError]);

  async function activate() {
    setError(null);
    setMessage(null);
    if (password.length < 8) return setError("Use uma senha com pelo menos 8 caracteres.");
    if (password !== confirmPassword) return setError("As senhas não conferem.");

    setSaving(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError || !data.user) return setError(updateError?.message ?? "Não foi possível ativar sua conta.");
      setMessage("Conta ativada. Escolha agora onde deseja entrar.");
      window.setTimeout(() => void navigate({ to: "/contas" }), 350);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-950">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-violet-600">Vanessa Simoni Partners</p>
        <h1 className="mt-2 text-3xl font-black">Ative sua conta</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Defina sua senha. Depois da ativação, você já entra na plataforma e escolhe sua área. A divulgação fica bloqueada até a aprovação do cadastro.</p>
        {error ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div> : null}
        {ready ? <div className="mt-7 space-y-4">
          <label className="block text-sm font-medium">Crie sua senha<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500" /></label>
          <label className="block text-sm font-medium">Confirme sua senha<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500" /></label>
          <button type="button" disabled={saving} onClick={() => void activate()} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Ativando..." : "Ativar minha conta"}</button>
        </div> : null}
        <div className="mt-7 text-sm text-slate-500">Já tem acesso? <Link to="/admin" className="font-semibold text-violet-600">Entrar na Vanessa Simoni</Link></div>
      </div>
    </main>
  );
}