import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, Loader2, MessageSquare, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceKey } from "@/hooks/use-session-heartbeat";
import {
  checkDeviceApproval,
  requestDeviceCode,
  verifyDeviceCode,
  checkIpAccess,
} from "@/lib/security-settings.functions";

/**
 * Bloqueia o uso do app quando o acesso vem de um IP fora da lista permitida
 * ou de um dispositivo/região novos com aprovação exigida.
 *
 * Afiliados e Partners (pending ou approved) têm acesso inicial imediato ao produto.
 * As verificações sensíveis continuam sendo exigidas no fluxo financeiro/saque.
 */
export function DeviceApprovalGate() {
  const check = useServerFn(checkDeviceApproval);
  const request = useServerFn(requestDeviceCode);
  const verify = useServerFn(verifyDeviceCode);
  const checkIp = useServerFn(checkIpAccess);

  const [state, setState] = useState<"idle" | "blocked" | "ip">("idle");
  const [blockedIp, setBlockedIp] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [masked, setMasked] = useState<string | null>(null);
  const [hasPhone, setHasPhone] = useState(true);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;

      try {
        const { data: programRole } = await (supabase as any)
          .from("partner_program_roles")
          .select("id")
          .eq("user_id", userId)
          .in("status", ["pending", "approved"])
          .limit(1)
          .maybeSingle();
        if (!alive) return;
        if (programRole) return;
      } catch {
        /* se não for papel comercial, segue a política normal do app */
      }

      try {
        const ipRes: any = await checkIp({});
        if (!alive) return;
        if (ipRes?.blocked) {
          setBlockedIp(ipRes.ip ?? null);
          setState("ip");
          return;
        }
      } catch {
        /* silencioso */
      }
      try {
        const r: any = await check({ data: { device_key: getDeviceKey() } });
        if (!alive || !r?.required) return;
        setRegion(r.region ?? null);
        setMasked(r.phoneMasked ?? null);
        setHasPhone(!!r.hasPhone);
        setState("blocked");
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      alive = false;
    };
  }, [check, checkIp]);

  if (state === "ip") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 p-4 backdrop-blur">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Acesso bloqueado por IP</h2>
              <p className="text-xs text-muted-foreground">Este computador está fora da lista de IPs permitidos.</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Seu endereço atual é <strong className="font-mono text-foreground">{blockedIp ?? "desconhecido"}</strong>.
            Peça ao administrador da conta para adicioná-lo em Configurações → Segurança → Lista de IPs permitidos.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
            className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  if (state !== "blocked") return null;

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r: any = await request({ data: { device_key: getDeviceKey() } });
      setMasked(r?.phoneMasked ?? masked);
      setSent(true);
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao enviar o código.");
    }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      await verify({ data: { device_key: getDeviceKey(), code } });
      window.location.reload();
    } catch (e: any) {
      setErr(e?.message ?? "Código inválido.");
      setBusy(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Aprovação de novo dispositivo</h2>
            <p className="text-xs text-muted-foreground">
              {region ? `Acesso detectado em ${region}.` : "Acesso de um dispositivo desconhecido."}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Para liberar esta sessão, confirme o código que a <strong className="text-foreground">RB Mídia</strong> envia
          no seu WhatsApp{masked ? ` ${masked}` : ""}. Sem o código, o acesso permanece bloqueado.
        </p>

        {!hasPhone && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Não há WhatsApp cadastrado no seu perfil. Fale com o administrador da conta para liberar o acesso.
          </p>
        )}

        {!sent ? (
          <button
            onClick={send}
            disabled={busy || !hasPhone}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            Enviar código no WhatsApp
          </button>
        ) : (
          <div className="mt-5 space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-center text-2xl font-semibold tracking-widest text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={confirm}
              disabled={busy || code.length !== 6}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Liberar acesso
            </button>
            <button onClick={send} disabled={busy} className="w-full text-xs text-muted-foreground hover:text-foreground">
              Reenviar código
            </button>
          </div>
        )}

        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

        <button onClick={logout} className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground">
          Sair da conta
        </button>
      </div>
    </div>
  );
}
