// SLIM_AUDIENCE_OPERATIONS_V1
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export type SecuritySettings = {
  require_team_2fa: boolean;
  confirm_bulk_export: boolean;
  device_approval: boolean;
  block_leaked_passwords: boolean;
  ip_allowlist_enabled: boolean;
  allowed_ips: string[];
  ip_allowlist_desktop_only: boolean;
  turnstile_enabled: boolean;
  login_alerts: boolean;
};

const DEFAULTS: SecuritySettings = {
  require_team_2fa: false,
  confirm_bulk_export: false,
  device_approval: false,
  block_leaked_passwords: false,
  ip_allowlist_enabled: false,
  allowed_ips: [],
  ip_allowlist_desktop_only: true,
  turnstile_enabled: false,
  login_alerts: true,
};

const COLS =
  "require_team_2fa, confirm_bulk_export, device_approval, block_leaked_passwords, ip_allowlist_enabled, allowed_ips, ip_allowlist_desktop_only, turnstile_enabled, login_alerts";

async function activeWorkspace(sb: AnySb, userId: string): Promise<string | null> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  return (data as { current_workspace_id?: string } | null)?.current_workspace_id ?? null;
}

async function isAdmin(sb: AnySb, userId: string, wsId: string): Promise<boolean> {
  const { data, error } = await sb.rpc("can_admin_workspace", { _user_id: userId, _workspace_id: wsId });
  if(error)throw new Error("Configuração de permissões de segurança indisponível. A alteração não foi salva.");
  return data === true;
}

function reqHeader(n: string): string | null {
  try {
    return getRequestHeader(n) ?? null;
  } catch {
    return null;
  }
}

function requestRegion(): { ip: string | null; region: string | null } {
  let ip: string | null = null;
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    ip = null;
  }
  const city = reqHeader("cf-ipcity");
  const country = reqHeader("cf-ipcountry");
  const region = [city, country].filter(Boolean).join(", ") || null;
  return { ip, region };
}

/* ---------- Configurações ---------- */

export const getSecuritySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { ip } = requestRegion();
    if (!wsId) return { settings: DEFAULTS, isAdmin: false, currentIp: ip };
    const { data, error } = await sb.from("workspace_security_settings").select(COLS).eq("workspace_id", wsId).maybeSingle();
    if(error)throw new Error("Configurações de segurança indisponíveis neste ambiente. Não foi possível confirmar as proteções.");
    return {
      settings: { ...DEFAULTS, ...((data as Partial<SecuritySettings> | null) ?? {}) },
      isAdmin: await isAdmin(sb, context.userId, wsId),
      currentIp: ip,
    };
  });

export const updateSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        require_team_2fa: z.boolean().optional(),
        confirm_bulk_export: z.boolean().optional(),
        device_approval: z.boolean().optional(),
        block_leaked_passwords: z.boolean().optional(),
        ip_allowlist_enabled: z.boolean().optional(),
        allowed_ips: z.array(z.string().min(3).max(60)).max(200).optional(),
        ip_allowlist_desktop_only: z.boolean().optional(),
        turnstile_enabled: z.boolean().optional(),
        login_alerts: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!wsId) throw new Error("Workspace não encontrado.");
    if (!(await isAdmin(sb, context.userId, wsId)))
      throw new Error("Apenas o dono ou administradores podem alterar a segurança da conta.");

    const payload: Record<string, unknown> = { ...data };

    if (data.allowed_ips) {
      const { isValidEntry } = await import("@/lib/ip-allowlist");
      const clean = Array.from(new Set(data.allowed_ips.map((s) => s.trim()).filter(Boolean)));
      const invalid = clean.filter((e) => !isValidEntry(e));
      if (invalid.length) throw new Error(`Endereço inválido: ${invalid.slice(0, 3).join(", ")}`);
      payload["allowed_ips"] = clean;
    }

    // Trava de segurança: não deixa ativar a lista sem o IP atual dentro dela (evita se trancar pra fora).
    if (data.ip_allowlist_enabled === true) {
      const { ipAllowed } = await import("@/lib/ip-allowlist");
      const { data: cur } = await sb
        .from("workspace_security_settings")
        .select("allowed_ips")
        .eq("workspace_id", wsId)
        .maybeSingle();
      const list = (payload["allowed_ips"] as string[] | undefined) ??
        ((cur as { allowed_ips?: string[] } | null)?.allowed_ips ?? []);
      const { ip } = requestRegion();
      if (!ipAllowed(ip, list))
        throw new Error(
          `Adicione o seu IP atual (${ip ?? "desconhecido"}) à lista antes de ativar — senão você perde o acesso.`,
        );
    }

    const { data: row, error: saveError } = await sb
      .from("workspace_security_settings")
      .upsert({ workspace_id: wsId, ...payload }, { onConflict: "workspace_id" })
      .select(COLS)
      .maybeSingle();
    if(saveError||!row)throw new Error("Não foi possível salvar as configurações de segurança.");
    await logEvent(sb, wsId, context.userId, {
      type: "settings",
      title: "Configuração de segurança alterada",
      description: Object.keys(data).join(", "),
      severity: "info",
    });
    return { settings: { ...DEFAULTS, ...((row as Partial<SecuritySettings> | null) ?? {}) } };
  });

/* ---------- Lista de IPs permitidos ---------- */

export const checkIpAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!wsId) return { blocked: false as const };

    const { data: cfg } = await sb
      .from("workspace_security_settings")
      .select("ip_allowlist_enabled, allowed_ips, ip_allowlist_desktop_only")
      .eq("workspace_id", wsId)
      .maybeSingle();
    const c = cfg as
      | { ip_allowlist_enabled?: boolean; allowed_ips?: string[]; ip_allowlist_desktop_only?: boolean }
      | null;
    if (!c?.ip_allowlist_enabled) return { blocked: false as const };

    const { ipAllowed, isMobileAgent } = await import("@/lib/ip-allowlist");
    // Celular/tablet usa IP volátil (4G/5G) — a regra vale só para computadores.
    if (c.ip_allowlist_desktop_only !== false && isMobileAgent(reqHeader("user-agent"))) {
      return { blocked: false as const };
    }

    const { ip } = requestRegion();
    if (ipAllowed(ip, c.allowed_ips ?? [])) return { blocked: false as const };
    await logEvent(sb, wsId, context.userId, {
      type: "ip_blocked",
      title: "Acesso bloqueado por IP",
      description: `Endereço ${ip ?? "desconhecido"} fora da lista permitida`,
      severity: "danger",
    });
    return { blocked: true as const, ip };
  });


/* ---------- Aprovação de dispositivo ---------- */

export const checkDeviceApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ device_key: z.string().min(6).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) return { required: false as const };

    const { data: cfg } = await sb
      .from("workspace_security_settings")
      .select("device_approval")
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (!(cfg as { device_approval?: boolean } | null)?.device_approval) return { required: false as const };

    const { region, ip } = requestRegion();

    const { data: trusted } = await sb
      .from("trusted_devices")
      .select("id, region")
      .eq("user_id", userId)
      .eq("workspace_id", wsId);
    const list = (trusted ?? []) as { id: string; region: string | null }[];

    const match = list.find((t) => t.region === region) ?? null;
    const { data: current } = await sb
      .from("trusted_devices")
      .select("id, region")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .eq("device_key", data.device_key)
      .maybeSingle();
    const cur = current as { id: string; region: string | null } | null;

    // Dispositivo já aprovado e na mesma região habitual → libera.
    if (cur && (cur.region === region || !region)) {
      await sb.from("trusted_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", cur.id);
      return { required: false as const };
    }

    // Primeiro dispositivo do usuário: registra como confiável (evita travar a conta).
    if (list.length === 0) {
      await sb.from("trusted_devices").insert({
        user_id: userId,
        workspace_id: wsId,
        device_key: data.device_key,
        ip_address: ip,
        region,
      });
      return { required: false as const };
    }

    // Mesmo dispositivo em região conhecida (troca de rede) → libera.
    if (cur && match) return { required: false as const };

    const { data: prof } = await sb
      .from("profiles")
      .select("whatsapp_primary")
      .eq("id", userId)
      .maybeSingle();
    const phone = ((prof as { whatsapp_primary?: string } | null)?.whatsapp_primary ?? "").replace(/\D/g, "");

    const { maskPhone } = await import("@/lib/device-approval.server");
    return {
      required: true as const,
      region,
      hasPhone: phone.length >= 10,
      phoneMasked: phone ? maskPhone(phone) : null,
    };
  });

export const requestDeviceCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ device_key: z.string().min(6).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) throw new Error("Workspace não encontrado.");

    const { data: prof } = await sb.from("profiles").select("whatsapp_primary").eq("id", userId).maybeSingle();
    const phone = ((prof as { whatsapp_primary?: string } | null)?.whatsapp_primary ?? "").replace(/\D/g, "");
    if (phone.length < 10) throw new Error("Nenhum WhatsApp cadastrado no perfil para receber o código.");

    const { ip, region } = requestRegion();
    const { generateCode, hashCode, maskPhone, sendApprovalCode } = await import("@/lib/device-approval.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnySb;

    const code = generateCode();
    const hash = await hashCode(code, `${userId}:${data.device_key}`);

    await admin.from("device_approval_challenges").insert({
      user_id: userId,
      workspace_id: wsId,
      device_key: data.device_key,
      code_hash: hash,
      phone_masked: maskPhone(phone),
      ip_address: ip,
      region,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });

    const sent = await sendApprovalCode(admin, phone, code, region, wsId);
    if (!sent) throw new Error("Não foi possível enviar o código pelo WhatsApp agora. Tente novamente em instantes.");
    await logEvent(sb, wsId, userId, {
      type: "device_code_sent",
      title: "Código de aprovação enviado no WhatsApp",
      description: `Dispositivo novo${region ? ` em ${region}` : ""} · ${maskPhone(phone)}`,
      severity: "warn",
    });
    return { ok: true, phoneMasked: maskPhone(phone) };
  });

export const verifyDeviceCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ device_key: z.string().min(6).max(80), code: z.string().regex(/^\d{6}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) throw new Error("Workspace não encontrado.");

    const { hashCode } = await import("@/lib/device-approval.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnySb;

    const { data: rows } = await admin
      .from("device_approval_challenges")
      .select("id, code_hash, attempts, expires_at, consumed_at, region, ip_address")
      .eq("user_id", userId)
      .eq("device_key", data.device_key)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const ch = ((rows ?? []) as any[])[0];
    if (!ch) throw new Error("Nenhum código pendente. Solicite um novo.");
    if (new Date(ch.expires_at).getTime() < Date.now()) throw new Error("Código expirado. Solicite um novo.");
    if (ch.attempts >= 5) throw new Error("Muitas tentativas. Solicite um novo código.");

    const hash = await hashCode(data.code, `${userId}:${data.device_key}`);
    if (hash !== ch.code_hash) {
      await admin.from("device_approval_challenges").update({ attempts: ch.attempts + 1 }).eq("id", ch.id);
      await logEvent(sb, wsId, userId, {
        type: "device_code_failed",
        title: "Código de aprovação incorreto",
        description: `Tentativa ${ch.attempts + 1} de 5`,
        severity: "danger",
      });
      throw new Error("Código incorreto.");
    }

    await admin.from("device_approval_challenges").delete().eq("id", ch.id);
    await admin.from("trusted_devices").upsert(
      {
        user_id: userId,
        workspace_id: wsId,
        device_key: data.device_key,
        ip_address: ch.ip_address,
        region: ch.region,
        approved_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,workspace_id,device_key" },
    );
    await logEvent(sb, wsId, userId, {
      type: "device_approved",
      title: "Novo dispositivo aprovado",
      description: ch.region ? `Liberado em ${ch.region}` : "Liberado com código do WhatsApp",
      severity: "warn",
    });
    return { ok: true };
  });

/* ---------- Histórico de segurança ---------- */

export type SecurityEvent = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  severity: "info" | "warn" | "danger";
  ip: string | null;
  region: string | null;
  user_agent: string | null;
  actor_name: string | null;
  created_at: string;
};

/** Grava um evento no histórico de segurança do workspace (nunca quebra o fluxo chamador). */
async function logEvent(
  sb: AnySb,
  wsId: string | null,
  userId: string | null,
  ev: { type: string; title: string; description?: string | null; severity?: "info" | "warn" | "danger"; metadata?: Record<string, unknown> },
): Promise<void> {
  if (!wsId) return;
  try {
    const { ip, region } = requestRegion();
    let actorName: string | null = null;
    if (userId) {
      const { data } = await sb.from("profiles").select("display_name, full_name").eq("id", userId).maybeSingle();
      const p = data as { display_name?: string; full_name?: string } | null;
      actorName = p?.display_name || p?.full_name || null;
    }
    await sb.from("security_events").insert({
      workspace_id: wsId,
      user_id: userId,
      actor_name: actorName,
      type: ev.type,
      title: ev.title,
      description: ev.description ?? null,
      severity: ev.severity ?? "info",
      ip,
      region,
      user_agent: reqHeader("user-agent"),
      metadata: ev.metadata ?? {},
    });
  } catch {
    /* histórico nunca bloqueia a ação */
  }
}

/** Registra um evento vindo do navegador (login, logout, troca de senha, novo dispositivo). */
export const recordSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum([
          "login",
          "logout",
          "password_changed",
          "recovery_codes",
          "export",
          "session_expired",
        ]),
        description: z.string().max(300).optional(),
        device_key: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) return { ok: false as const };

    const { ip, region } = requestRegion();
    const ua = reqHeader("user-agent") ?? "";
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua)
      ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Navegador";
    const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua)
      ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
    const where = [browser, os, region].filter(Boolean).join(" · ");

    const titles: Record<string, string> = {
      login: "Login realizado",
      logout: "Sessão encerrada",
      password_changed: "Senha alterada",
      recovery_codes: "Códigos de recuperação gerados",
      export: "Exportação de dados",
      session_expired: "Sessão encerrada por inatividade",
    };

    let novoDispositivo = false;
    if (data.type === "login" && data.device_key) {
      const { data: known } = await sb
        .from("trusted_devices")
        .select("id")
        .eq("user_id", userId)
        .eq("workspace_id", wsId)
        .eq("device_key", data.device_key)
        .maybeSingle();
      if (!known) {
        novoDispositivo = true;
        await sb
          .from("trusted_devices")
          .insert({ user_id: userId, workspace_id: wsId, device_key: data.device_key, ip_address: ip, region })
          .then(() => undefined, () => undefined);
      }
    }

    await logEvent(sb, wsId, userId, {
      type: novoDispositivo ? "new_device" : data.type,
      title: novoDispositivo ? "Login de um novo dispositivo" : (titles[data.type] ?? "Evento de segurança"),
      description: data.description ?? (where || null),
      severity: novoDispositivo ? "warn" : "info",
    });

    // Alerta de novo acesso: avisa o titular dentro do app.
    if (novoDispositivo) {
      const { data: cfg } = await sb
        .from("workspace_security_settings")
        .select("login_alerts")
        .eq("workspace_id", wsId)
        .maybeSingle();
      if ((cfg as { login_alerts?: boolean } | null)?.login_alerts !== false) {
        await sb
          .from("notifications")
          .insert({
            workspace_id: wsId,
            user_id: userId,
            type: "security",
            title: "Novo acesso à sua conta",
            body: `Entrada detectada em ${where || "um dispositivo novo"}${ip ? ` (IP ${ip})` : ""}. Se não foi você, troque a senha agora.`,
            link: "/configuracoes?tab=seguranca",
          })
          .then(() => undefined, () => undefined);
      }
    }

    return { ok: true as const, novoDispositivo };
  });

/** Lista o histórico de segurança do workspace (RLS decide o alcance). */
export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!wsId) return { events: [] as SecurityEvent[] };
    const { data: rows } = await sb
      .from("security_events")
      .select("id, type, title, description, severity, ip, region, user_agent, actor_name, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);
    return { events: ((rows ?? []) as SecurityEvent[]) };
  });
