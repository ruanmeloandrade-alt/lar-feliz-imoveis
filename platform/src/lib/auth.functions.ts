import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";
import { assertSlimSessionSecurity, SlimSessionSecurityError } from "@/lib/slim-session-security.core";

export const getCurrentUserRoles = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const req = getRequest();
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.toLowerCase().startsWith("bearer ")
        ? auth.slice(7).trim()
        : "";
      if (!token) return { roles: [] as string[], isAdmin: false };

      const { url, publishableKey: key } = resolveServerSupabaseEnv();

      const sb = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userRes } = await sb.auth.getUser(token);
      const uid = userRes?.user?.id;
      if (!uid) return { roles: [] as string[], isAdmin: false };

      await assertSlimSessionSecurity(sb);

      const { data, error } = await sb
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", uid);
      if (error) return { roles: [] as string[], isAdmin: false };
      const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
      return {
        roles,
        isAdmin: roles.includes("super_admin") || roles.includes("admin"),
      };
    } catch (error) {
      if (error instanceof SlimSessionSecurityError) throw error;
      return { roles: [] as string[], isAdmin: false };
    }
  },
);
