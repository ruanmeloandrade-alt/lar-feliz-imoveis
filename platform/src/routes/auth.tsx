import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AtSign,
  CheckCircle2,
  Instagram,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {slimAuthFailureMessage} from "@/lib/slim-auth-network.core";
import { isSlimRecoveryLocation, safeSlimAuthReturn } from "@/lib/slim-auth-gate.core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

type AuthMode = "login" | "signup" | "forgot" | "recovery";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: z.object({
    mode: z.enum(["login", "signup", "forgot", "recovery"]).optional(),
    next: z.string().optional(),
    mkt_link: z.string().max(80).optional(),
    mkt_attr: z.string().uuid().optional(),
    mkt_lead: z.string().uuid().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Entrar · Vanessa Simoni" },
      { name: "description", content: "Acesso interno ao sistema operacional da Vanessa Simoni." },
    ],
  }),
  component: AuthPage,
});

const safeNext = safeSlimAuthReturn;

function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits.slice(0, 13);
  if (digits.length >= 10) return `55${digits}`.slice(0, 13);
  return digits;
}

function formatWhatsApp(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeInstagram(value: string) {
  const clean = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 30);
  return clean ? `@${clean}` : "";
}

type SignupProfile = {
  responsibleName: string;
  whatsapp: string;
  instagram: string;
};

async function syncSignupCrm(input: {
  accessToken: string;
  linkSlug?: string;
  attributionToken?: string;
  leadId?: string;
  profile?: SignupProfile;
}) {
  // Vanessa Simoni independente: não encaminhar cadastro para a plataforma MktOn.
  // Este endpoint legado não existe no GitHub Pages e causava erro no signup.
  if (typeof window !== "undefined" && (
    window.location.hostname === "slimesaude.com" ||
    window.location.hostname === "www.slimesaude.com" ||
    window.location.hostname === "ruanmeloandrade-alt.github.io"
  )) return;
  const response = await fetch("/api/mkton-signup-attribution", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      linkSlug: input.linkSlug,
      attributionToken: input.attributionToken,
      leadId: input.leadId,
      responsibleName: input.profile?.responsibleName,
      whatsapp: input.profile?.whatsapp,
      instagram: input.profile?.instagram,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[mkton-signup-crm]", response.status, detail);
  }
}

function FieldShell({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span>
        {children}
      </div>
    </label>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const {
    mode: searchMode,
    next,
    mkt_link: linkSlug,
    mkt_attr: attributionToken,
    mkt_lead: attributedLeadId,
  } = Route.useSearch();
  const back = safeNext(next);
  const recoveryRef = useRef(searchMode === "recovery" || (typeof window !== "undefined" && isSlimRecoveryLocation(window.location.pathname, window.location.search, window.location.hash)));
  const submittingRef = useRef(false);

  const [mode, setMode] = useState<AuthMode>(recoveryRef.current ? "recovery" : searchMode === "forgot" ? "forgot" : "login");
  const [responsibleName, setResponsibleName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowLogin, setSlowLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [secondStepEmail, setSecondStepEmail] = useState<string | null>(null);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  function returnToLogin() {
    recoveryRef.current = false;
    setMode("login");
    void navigate({ to: '/auth', search: previous => ({ ...previous, mode: 'login' }), replace: true });
  }

  useEffect(() => {
    if (!loading || mode !== 'login') { setSlowLogin(false); return; }
    const timeout = window.setTimeout(() => setSlowLogin(true), 4_000);
    return () => window.clearTimeout(timeout);
  }, [loading, mode]);

  const goOn = () => {
    if (recoveryRef.current) return;
    if (back) window.location.href = back;
    else navigate({ to: "/saude-slim" });
  };

  const syncCurrentSignup = (accessToken: string, profile?: SignupProfile) =>
    syncSignupCrm({
      accessToken,
      linkSlug,
      attributionToken,
      leadId: attributedLeadId,
      profile,
    });

  function authRedirect(targetMode: AuthMode) {
    const callback = new URL("/auth", window.location.origin);
    callback.searchParams.set("mode", targetMode);
    if (back) callback.searchParams.set("next", back);
    if (linkSlug) callback.searchParams.set("mkt_link", linkSlug);
    if (attributionToken) callback.searchParams.set("mkt_attr", attributionToken);
    if (attributedLeadId) callback.searchParams.set("mkt_lead", attributedLeadId);
    return callback.toString();
  }

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session || recoveryRef.current || mode === "recovery") return;
      await syncCurrentSignup(data.session.access_token);
      goOn();
    }).catch(() => {
      // Keep the login form usable when a stored session cannot be refreshed.
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        recoveryRef.current = true;
        submittingRef.current = false;
        setPassword("");
        setConfirmPassword("");
        setMode("recovery");
        return;
      }
      if (event === "SIGNED_IN" && session && !submittingRef.current && !recoveryRef.current && mode !== "recovery") {
        void syncCurrentSignup(session.access_token).finally(goOn);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, back, linkSlug, attributionToken, attributedLeadId, mode]);

  async function sendRecoveryEmail() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Informe o e-mail usado na sua conta.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: authRedirect("recovery"),
      });
      if (recoveryError) throw recoveryError;
      setRecoverySent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o e-mail de redefinição.");
    } finally {
      setLoading(false);
    }
  }

  async function updateRecoveredPassword() {
    if (password.length < 6) {
      setError("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPasswordUpdated(true);
      await supabase.auth.signOut({ scope: "local" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir sua senha.");
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailSecurityStep(cleanEmail: string) {
    await supabase.auth.signOut({ scope: "local" });
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: authRedirect("login"),
      },
    });
    if (otpError) throw otpError;
    setSecondStepEmail(cleanEmail);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmationPending(false);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = responsibleName.trim().replace(/\s+/g, " ").slice(0, 100);
    const cleanWhatsapp = normalizeWhatsApp(whatsapp);
    const cleanInstagram = normalizeInstagram(instagram);

    // Vanessa Simoni tem empresa única: cadastros são exclusivamente internos.
    if (mode === "signup") {
      setError("Cadastro público desativado. Solicite acesso ao administrador da Vanessa Simoni.");
      return;
    }

    if (mode === "signup") {
      if (cleanName.length < 3) return setError("Informe o nome do responsável pela conta.");
      if (cleanWhatsapp && cleanWhatsapp.length < 12) return setError("Informe um WhatsApp válido com DDD.");
      if (cleanInstagram && cleanInstagram.length < 3) return setError("Informe um Instagram válido.");
      if (password.length < 6) return setError("A senha deve ter ao menos 6 caracteres.");
    }

    setLoading(true);
    submittingRef.current = true;
    try {
      if (mode === "signup") {
        const profile: SignupProfile = {
          responsibleName: cleanName,
          whatsapp: cleanWhatsapp,
          instagram: cleanInstagram,
        };
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: authRedirect("login"),
            data: {
              full_name: cleanName,
              responsible_name: cleanName,
              whatsapp: cleanWhatsapp,
              instagram: cleanInstagram,
              signup_source: "saude_slim_internal_signup",
            },
          },
        });
        if (signUpError) throw signUpError;

        if (signUpData.session) {
          await syncCurrentSignup(signUpData.session.access_token, profile);
          goOn();
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInData.session) {
          await syncCurrentSignup(signInData.session.access_token, profile);
          goOn();
          return;
        }
        if (signInError && /confirm|verified|verification/i.test(signInError.message)) {
          setConfirmationPending(true);
          return;
        }
        if (signInError) throw signInError;
        setConfirmationPending(true);
      } else if (mode === "login") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
        if (!signInData.session) throw new Error("Não foi possível iniciar sua sessão.");
        goOn();
        return;
      }
    } catch (err: unknown) {
      const msg = slimAuthFailureMessage(err);
      if (/User already registered/i.test(msg)) setError("Este e-mail já está cadastrado. Entre na sua conta.");
      else if (/Invalid login credentials/i.test(msg)) setError("E-mail ou senha inválidos.");
      else setError(msg);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  if (confirmationPending) {
    return (
      <main className="slim-auth grid min-h-screen place-items-center bg-[#ecfdf5] px-4 py-10">
        <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-[0_30px_90px_rgba(15,23,42,.12)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Mail className="h-6 w-6" /></div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">Confirme seu e-mail</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">Enviamos a confirmação para <strong className="text-slate-900">{email.trim()}</strong>. Depois de confirmar, sua conta continua o cadastro automaticamente.</p>
          <button type="button" onClick={() => { setConfirmationPending(false); returnToLogin(); }} className="mt-7 text-sm font-bold text-emerald-700">Já confirmei, entrar</button>
        </section>
      </main>
    );
  }

  if (secondStepEmail) {
    return (
      <main className="slim-auth grid min-h-screen place-items-center bg-[#ecfdf5] px-4 py-10">
        <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-[0_30px_90px_rgba(15,23,42,.12)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-6 w-6" /></div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Verificação de segurança</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Confira seu e-mail para continuar</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">Sua senha foi validada. Enviamos um link de acesso para <strong className="text-slate-900">{secondStepEmail}</strong>. Abra o e-mail para concluir a entrada.</p>
          <button type="button" onClick={async () => { setLoading(true); setError(null); try { await sendEmailSecurityStep(secondStepEmail); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível reenviar o e-mail."); } finally { setLoading(false); } }} className="mt-6 text-sm font-bold text-emerald-700">{loading ? "Enviando..." : "Reenviar e-mail"}</button>
          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
          <button type="button" onClick={() => { setSecondStepEmail(null); returnToLogin(); setPassword(""); }} className="mt-4 block w-full text-xs font-semibold text-slate-500">Voltar para o login</button>
        </section>
      </main>
    );
  }

  if (mode === "recovery") {
    return (
      <main className="slim-auth grid min-h-screen place-items-center bg-[#ecfdf5] px-4 py-10 text-slate-950">
        <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_30px_90px_rgba(15,23,42,.12)] sm:p-9">
          <Link to="/auth" className="slim-auth-brand inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950 shadow-sm"><img className="slim-auth-logo" src="/brand/vanessa.jpg" alt="Vanessa Simoni" width="220" height="220" /></Link>
          {passwordUpdated ? (
            <div className="mt-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight">Senha redefinida</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">Sua nova senha já está ativa. Você pode entrar normalmente.</p>
              <button type="button" onClick={() => { returnToLogin(); setPassword(""); setConfirmPassword(""); }} className="mt-6 text-sm font-bold text-emerald-700">Ir para o login</button>
            </div>
          ) : (
            <>
              <p className="mt-8 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Nova senha</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Redefina sua senha</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">Escolha uma nova senha para sua conta Vanessa Simoni.</p>
              <div className="mt-7 space-y-4">
                <FieldShell icon={<LockKeyhole className="h-4 w-4" />} label="Nova senha">
                  <PasswordInput className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm" placeholder="Mínimo de 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" />
                </FieldShell>
                <FieldShell icon={<LockKeyhole className="h-4 w-4" />} label="Confirmar nova senha">
                  <PasswordInput className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm" placeholder="Repita a nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} autoComplete="new-password" />
                </FieldShell>
                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
                <Button type="button" disabled={loading} onClick={updateRecoveredPassword} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar nova senha</Button>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="slim-auth min-h-screen bg-[#ecfdf5] text-slate-950 lg:grid lg:grid-cols-[minmax(0,.88fr)_minmax(560px,1.12fr)]">
      <aside className="relative hidden overflow-hidden bg-[#052e2b] px-10 py-12 text-white lg:flex lg:min-h-screen lg:flex-col lg:justify-between xl:px-16 xl:py-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/15 via-transparent to-emerald-900/20" />
          <div className="absolute inset-0 opacity-[.08] [background-image:linear-gradient(rgba(255,255,255,.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.2)_1px,transparent_1px)] [background-size:48px_48px]" />
        </div>
        <div className="relative"><Link to="/auth" className="slim-auth-brand inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm"><img className="slim-auth-logo" src="/brand/vanessa.jpg" alt="Vanessa Simoni" width="220" height="220" /></Link></div>
        <div className="relative max-w-[560px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100"><Sparkles className="h-3.5 w-3.5" />Sistema interno Vanessa Simoni</div>
          <h2 className="mt-6 text-[clamp(2.8rem,4.3vw,5.3rem)] font-semibold leading-[.98] tracking-tight">Sua rotina comercial em forma de cuidado.</h2>
          <p className="mt-6 max-w-lg text-base leading-8 text-emerald-50/75">Acompanhe pedidos, estoque, clientes e recuperação de vendas em um ambiente interno feito para a operação da Vanessa Simoni.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {[["Histórico de vendas", "Pedidos e clientes sempre fáceis de consultar"], ["Estoque saudável", "Produtos e fornecedores com mais controle"], ["Gestão integrada", "Vendas, pedidos e produtos no mesmo painel"], ["Acesso seguro", "Entrada restrita ao time autorizado"]].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-emerald-200/15 bg-white/[.07] p-4 backdrop-blur-sm"><div className="flex items-center gap-2 text-xs font-bold"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{title}</div><p className="mt-2 text-[11px] leading-5 text-emerald-50/65">{text}</p></div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-[11px] text-emerald-50/60"><ShieldCheck className="h-4 w-4" />Acesso protegido para uso interno da empresa.</div>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-4 py-20 sm:px-6 lg:px-10 xl:px-16">
        <div className="w-full max-w-[650px]">
          <div className="mb-8 flex items-center justify-between lg:hidden"><Link to="/auth" className="slim-auth-brand inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950 shadow-sm"><img className="slim-auth-logo" src="/brand/vanessa.jpg" alt="Vanessa Simoni" width="220" height="220" /></Link><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700">Sistema interno</span></div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_32px_100px_rgba(15,23,42,.10)] sm:p-8 md:p-10">
            {mode === "forgot" ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Redefinir acesso</p>
                <h1 className="mt-3 text-[clamp(2rem,8vw,3rem)] font-semibold leading-[1.02] tracking-tight">Esqueceu sua senha?</h1>
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">Informe seu e-mail e enviaremos um link seguro para você criar uma nova senha.</p>
                {recoverySent ? (
                  <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-800"><strong>E-mail enviado.</strong> Confira sua caixa de entrada e também a pasta de spam.</div>
                ) : (
                  <div className="mt-7 space-y-4">
                    <FieldShell icon={<Mail className="h-4 w-4" />} label="E-mail">
                      <Input className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm" type="email" placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                    </FieldShell>
                    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
                    <Button type="button" disabled={loading} onClick={sendRecoveryEmail} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar link de redefinição</Button>
                  </div>
                )}
                <button type="button" onClick={() => { returnToLogin(); setRecoverySent(false); setError(null); }} className="mt-5 w-full text-center text-xs font-semibold text-slate-500 hover:text-emerald-700">Voltar para o login</button>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Acesso interno</p>
                    <h1 className="mt-3 text-[clamp(2rem,8vw,3rem)] font-semibold leading-[1.02] tracking-tight text-slate-950">Bem-vindo à Vanessa Simoni.</h1>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">Entre com o e-mail e a senha autorizados para cuidar das vendas, pedidos e clientes da operação.</p>
                  </div>
                  <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 sm:grid">{mode === "signup" ? <UserRound className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}</div>
                </div>

                <form className="mt-7 space-y-4" onSubmit={submit}>
                  {mode === "signup" && (
                    <>
                      <FieldShell icon={<UserRound className="h-4 w-4" />} label="Nome do responsável"><Input className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm focus-visible:ring-emerald-600" placeholder="Nome do responsável" value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} required autoComplete="name" /></FieldShell>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FieldShell icon={<Phone className="h-4 w-4" />} label="WhatsApp (opcional)"><Input className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm focus-visible:ring-emerald-600" type="tel" inputMode="tel" placeholder="(22) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(formatWhatsApp(e.target.value))} autoComplete="tel" /></FieldShell>
                        <FieldShell icon={<Instagram className="h-4 w-4" />} label="Instagram (opcional)"><Input className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm focus-visible:ring-emerald-600" placeholder="@seuperfil" value={instagram} onChange={(e) => setInstagram(e.target.value)} autoComplete="off" /></FieldShell>
                      </div>
                    </>
                  )}

                  <FieldShell icon={<Mail className="h-4 w-4" />} label="E-mail"><Input className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm focus-visible:ring-emerald-600" type="email" placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></FieldShell>
                  <FieldShell icon={<LockKeyhole className="h-4 w-4" />} label="Senha"><PasswordInput className="h-12 rounded-xl border-slate-200 bg-[#fbfcfe] pl-10 text-sm focus-visible:ring-emerald-600" placeholder={mode === "signup" ? "Mínimo de 6 caracteres" : "Sua senha"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></FieldShell>

                  {mode === "login" && <button type="button" onClick={() => { setError(null); setMode("forgot"); }} className="-mt-1 block w-full text-right text-xs font-semibold text-emerald-700 hover:underline">Esqueci minha senha</button>}

                  {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{error}</div>}
                  {mode === 'login' && slowLogin && !error && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                      O servidor de login está demorando mais que o normal. Não é necessário clicar novamente; aguardamos uma única resposta.
                    </p>
                  )}

                  <Button type="submit" disabled={loading} className="group h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-[0_14px_32px_rgba(5,150,105,.18)] hover:bg-emerald-700">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "signup" ? <AtSign className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
                    Continuar
                    {!loading && <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />}
                  </Button>
                </form>

                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[10px] font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />Apenas usuários autorizados pela Vanessa Simoni devem acessar.</div>

              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
