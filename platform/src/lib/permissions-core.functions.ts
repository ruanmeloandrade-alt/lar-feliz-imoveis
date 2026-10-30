// Server function que devolve as permissões efetivas do usuário logado
// para o workspace ativo, pronta para consumo tanto no front (hook) quanto
// dentro de outras server functions (helper `loadEffectivePermissions`).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UserPermissions } from "@/lib/permissions-catalog";
import type { EffectivePermissions, EffectiveRole } from "@/lib/permissions-core";

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function activeWorkspace(sb: AnySb, userId: string): Promise<string | null> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  return (data as { current_workspace_id?: string } | null)?.current_workspace_id ?? null;
}

/** Chamável de dentro de qualquer server function autenticada. */
export async function loadEffectivePermissions(
  sb: AnySb,
  userId: string,
  wsId?: string | null,
): Promise<EffectivePermissions> {
  const workspaceId = wsId ?? (await activeWorkspace(sb, userId));
  if (!workspaceId) {
    return { role: "member", full: false, permissions: null };
  }

  const [{ data: ws }, { data: mem }, { data: superAdmin }, { data: perm }] = await Promise.all([
    sb.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle(),
    sb.from("workspace_members").select("role, role_type").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    sb.from("user_permissions").select("permissions").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
  ]);

  const isOwner = (ws as { owner_id?: string } | null)?.owner_id === userId;
  const isSuper = superAdmin === true;
  const memberRole = (mem as { role?: string; role_type?: string } | null) ?? null;
  const role: EffectiveRole = isOwner
    ? "owner"
    : isSuper
      ? "super_admin"
      : memberRole?.role === "admin" || memberRole?.role_type === "admin"
        ? "admin"
        : "member";

  const permissions = ((perm as { permissions?: UserPermissions } | null)?.permissions) ?? null;
  const full = isOwner || isSuper || role === "admin";

  return { role, full, permissions };
}

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const eff = await loadEffectivePermissions(sb, context.userId, wsId);
    return { workspace_id: wsId, effective: eff };
  });
