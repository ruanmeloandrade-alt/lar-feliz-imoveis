import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

type AnySb = { from: (t: string) => any };

async function activeWorkspace(sb: AnySb, userId: string): Promise<string | null> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  return (data as { current_workspace_id?: string } | null)?.current_workspace_id ?? null;
}

async function isWorkspaceAdmin(sb: AnySb, userId: string, wsId: string): Promise<boolean> {
  const { data: ws } = await sb.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle();
  if ((ws as any)?.owner_id === userId) return true;
  const { data: m } = await sb
    .from("workspace_members")
    .select("role, role_type")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (m as any)?.role;
  const roleType = (m as any)?.role_type;
  return role === "admin" || roleType === "admin" || roleType === "owner";
}

/* ---------- Heartbeat ---------- */

export const touchSession = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        device_key: z.string().min(6).max(80),
        login_at: z.string().datetime().optional(),
        browser: z.string().max(60).optional(),
        os: z.string().max(60).optional(),
        device_type: z.string().max(30).optional(),
        current_path: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) return { ok: false, revoked: false };

    let ip: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {
      ip = null;
    }
    const ua = (() => {
      try {
        return getRequestHeader("user-agent") ?? null;
      } catch {
        return null;
      }
    })();

    const { data: existing } = await sb
      .from("user_sessions")
      .select("id, revoked_at")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .eq("device_key", data.device_key)
      .maybeSingle();

    // Só derruba o navegador se a revogação aconteceu depois deste login.
    // `claims.iat` não serve para isso: ele muda a cada renovação do token e
    // reativaria indevidamente uma sessão revogada. `last_sign_in_at` permanece
    // estável durante refreshes e muda apenas num login real.
    if (existing?.revoked_at) {
      const loginAtSec = data.login_at ? Math.floor(new Date(data.login_at).getTime() / 1000) : 0;
      const revokedAtSec = Math.floor(new Date(existing.revoked_at as string).getTime() / 1000);
      if (loginAtSec && loginAtSec > revokedAtSec) {
        await sb
          .from("user_sessions")
          .update({ revoked_at: null, started_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        return { ok: true, revoked: true };
      }
    }


    const payload = {
      workspace_id: wsId,
      user_id: userId,
      device_key: data.device_key,
      browser: data.browser ?? null,
      os: data.os ?? null,
      device_type: data.device_type ?? null,
      current_path: data.current_path ?? null,
      user_agent: ua,
      ip_address: ip,
      last_seen_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await sb.from("user_sessions").update(payload).eq("id", existing.id);
    } else {
      await sb.from("user_sessions").insert({ ...payload, started_at: new Date().toISOString() });
    }
    return { ok: true, revoked: false };
  });

/* ---------- Listagem ---------- */

export const listSessions = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) return { sessions: [], isAdmin: false, userId };

    const admin = await isWorkspaceAdmin(sb, userId, wsId);

    let query = sb
      .from("user_sessions")
      .select("id, user_id, device_key, browser, os, device_type, ip_address, current_path, started_at, last_seen_at, revoked_at")
      .eq("workspace_id", wsId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (!admin) query = query.eq("user_id", userId);

    const { data: rows } = await query;
    const list = (rows ?? []) as any[];

    const ids = Array.from(new Set(list.map((s) => s.user_id)));
    let profiles: Record<string, { name: string; job: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await sb.from("profiles").select("id, display_name, full_name, job_title").in("id", ids);
      for (const p of (profs ?? []) as any[]) {
        profiles[p.id] = { name: p.display_name ?? p.full_name ?? "Usuário", job: p.job_title ?? null };
      }
    }

    return {
      isAdmin: admin,
      userId,
      sessions: list.map((s) => ({
        ...s,
        is_self: s.user_id === userId,
        person: profiles[s.user_id] ?? { name: "Usuário", job: null },
      })),
    };
  });

/* ---------- Encerrar ---------- */

export const revokeSession = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const wsId = await activeWorkspace(sb, userId);
    if (!wsId) throw new Error("Workspace ativo não encontrado.");

    const { data: row } = await sb
      .from("user_sessions")
      .select("id, user_id, workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Sessão não encontrada.");

    if (row.user_id !== userId) {
      const admin = await isWorkspaceAdmin(sb, userId, wsId);
      if (!admin) throw new Error("Apenas o dono ou administradores podem encerrar sessões de outras pessoas.");
    }

    const { error } = await sb
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAllMySessions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keep_device_key: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    let q = sb
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (data.keep_device_key) q = q.neq("device_key", data.keep_device_key);
    await q;
    return { ok: true };
  });
