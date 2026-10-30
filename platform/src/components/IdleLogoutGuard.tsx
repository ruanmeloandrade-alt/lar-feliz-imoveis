import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const IDLE_PREF_KEY = "mkton.idle-logout";

export type IdlePref = { enabled: boolean; minutes: number };

export function readIdlePref(): IdlePref {
  if (typeof window === "undefined") return { enabled: true, minutes: 60 };
  try {
    const raw = window.localStorage.getItem(IDLE_PREF_KEY);
    if (!raw) return { enabled: true, minutes: 60 };
    const p = JSON.parse(raw) as Partial<IdlePref>;
    const minutes = Number(p.minutes);
    return {
      enabled: p.enabled !== false,
      minutes: Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 1440) : 60,
    };
  } catch {
    return { enabled: true, minutes: 60 };
  }
}

export function writeIdlePref(pref: IdlePref) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDLE_PREF_KEY, JSON.stringify(pref));
  window.dispatchEvent(new CustomEvent("mkton:idle-pref"));
}

const LAST_ACTIVITY_KEY = "mkton.idle-last-activity";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel", "focus"] as const;

/**
 * Encerra APENAS a sessão do navegador (front-end) após X minutos sem interação.
 * Não interfere em nada do back-end: bots, agentes, automações, webhooks e cron
 * continuam rodando 24/7 no servidor, independentemente de abas abertas.
 */
export function IdleLogoutGuard() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let pref = readIdlePref();

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const logout = async () => {
      clear();
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        const { recordSecurityEvent } = await import("@/lib/security-settings.functions");
        await recordSecurityEvent({ data: { type: "session_expired" } });
      } catch { /* silencioso */ }
      await supabase.auth.signOut({ scope: 'local' });
      try {
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      } catch { /* ignore */ }
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/auth?motivo=inatividade&next=${next}`;
    };

    const schedule = () => {
      clear();
      if (!pref.enabled) return;
      const ms = pref.minutes * 60_000;
      const last = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
      const remaining = Math.max(1_000, last + ms - Date.now());
      timer.current = setTimeout(() => {
        const lastNow = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
        if (Date.now() - lastNow >= ms) void logout();
        else schedule();
      }, remaining);
    };

    let throttle = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - throttle < 5_000) return;
      throttle = now;
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch { /* ignore */ }
      schedule();
    };

    const onPrefChange = () => {
      pref = readIdlePref();
      schedule();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") onActivity();
    };

    try {
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch { /* ignore */ }
    schedule();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("mkton:idle-pref", onPrefChange);
    window.addEventListener("storage", onPrefChange);

    return () => {
      clear();
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mkton:idle-pref", onPrefChange);
      window.removeEventListener("storage", onPrefChange);
    };
  }, []);

  return null;
}
