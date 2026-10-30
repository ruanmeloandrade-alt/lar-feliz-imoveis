// Cache client-side leve da regionalização da conta ativa.
// Fonte da verdade continua sendo o servidor:
// get_workspace_regional_settings / workspaces.default_currency / business_hours.timezone.
// O idioma continua sendo preferência individual; o fuso armazenado em localStorage é
// apenas um espelho do fuso persistido da conta ativa para os formatadores client-side.

import { supabase } from "@/integrations/supabase/client";

const CURRENCY_STORAGE_KEY = "mkton:workspace_currency";
const PREFERENCES_STORAGE_KEY = "mkton:preferences";

type WorkspaceRegionalCache = {
  currency: string;
  timezone: string;
};

let inFlightRegional: Promise<WorkspaceRegionalCache> | null = null;

export function getCachedWorkspaceCurrency(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRegionalCache(currency: string, timezone: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // Cache é otimização; a fonte de verdade continua no servidor.
  }

  try {
    let preferences: Record<string, unknown> = {};
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        preferences = parsed as Record<string, unknown>;
      }
    }
    preferences.fusoHorario = timezone;
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Não bloqueia a sessão por falha de storage local.
  }

  window.dispatchEvent(new CustomEvent("mkton:workspace-currency-changed", { detail: currency }));
  window.dispatchEvent(new Event("mkton:preferences-changed"));
}

export async function syncWorkspaceRegionalCache(): Promise<WorkspaceRegionalCache> {
  if (inFlightRegional) return inFlightRegional;

  inFlightRegional = (async () => {
    // Regionalização da Vanessa Simoni: leitura direta do perfil protegido por RLS.
    // Moeda inicial BRL; não acessar endpoints legados de outro projeto.
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("Usuário não autenticado.");
    const { data: profile, error } = await supabase
      .from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle();
    if (error) throw new Error(error.message);
    const currency = "BRL";
    const timezone = profile?.timezone || "America/Sao_Paulo";
    writeRegionalCache(currency, timezone);
    return { currency, timezone };
  })();

  try {
    return await inFlightRegional;
  } finally {
    inFlightRegional = null;
  }
}

export async function syncWorkspaceCurrencyCache(): Promise<string> {
  return (await syncWorkspaceRegionalCache()).currency;
}

/** Retorna a moeda em cache; se não houver, sincroniza a regionalização da conta ativa. */
export async function ensureWorkspaceCurrency(): Promise<string> {
  const cached = getCachedWorkspaceCurrency();
  if (cached) return cached;
  try {
    return (await syncWorkspaceRegionalCache()).currency;
  } catch {
    return "BRL";
  }
}
