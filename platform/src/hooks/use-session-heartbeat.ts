import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "mkton_device_key";

export function getDeviceKey(): string {
  if (typeof window === "undefined") return "";
  let k = localStorage.getItem(KEY);
  if (!k) {
    k = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 32);
    localStorage.setItem(KEY, k);
  }
  return k;
}

export function parseUA(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Navegador";
  const os = /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "Sistema";
  const device_type = /iPad|Tablet/.test(ua) ? "tablet"
    : /Mobi|Android|iPhone/.test(ua) ? "mobile"
    : "desktop";
  return { browser, os, device_type };
}

/** Mantém a sessão Supabase válida no navegador sem chamar endpoints SSR ausentes. */
export function useSessionHeartbeat() {
  useEffect(() => {
    let alive = true;
    let checking = false;
    async function ping() {
      if (!alive || checking || typeof document === "undefined" || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;
        const { error } = await supabase.auth.getUser();
        if (!alive || !error) return;
        if (error.status === 401 || error.status === 403) {
          await supabase.auth.signOut({ scope: "local" });
          if (alive) window.location.assign("/auth");
        }
      } catch {
        // Uma falha momentânea de rede não deve desconectar uma sessão válida.
      } finally {
        checking = false;
      }
    }
    void ping();
    const timer = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
}
