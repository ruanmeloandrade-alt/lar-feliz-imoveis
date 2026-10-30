import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type RolesResponse = { isAdmin: boolean; roles: string[] };

async function getSaudeSlimUserRoles(): Promise<RolesResponse> {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return { isAdmin: false, roles: [] };
  const uid = auth.user.id;
  const [profileResult, globalRoles] = await Promise.all([
    supabase.from("profiles").select("current_workspace_id").eq("id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
  ]);
  const roles = (globalRoles.data ?? []).map((r) => String(r.role));
  const ws = profileResult.data?.current_workspace_id;
  if (ws) {
    const { data: member } = await supabase.from("workspace_members")
      .select("role").eq("workspace_id", ws).eq("user_id", uid).maybeSingle();
    if (member?.role) roles.push(member.role);
  }
  return {
    roles,
    isAdmin: roles.some((r) => r === "super_admin" || r === "admin" || r === "owner"),
  };
}

function useRoles() {
  return useQuery({
    queryKey: ["saude-slim", "user-roles"],
    queryFn: getSaudeSlimUserRoles,
    staleTime: 60_000,
    retry: false,
  });
}

export function useIsAdmin() {
  const q = useRoles();
  return { isAdmin: !!q.data?.isAdmin, loaded: !q.isLoading };
}

export function useIsSuperAdmin() {
  const q = useRoles();
  return { isSuperAdmin: !!q.data?.roles.includes("super_admin"), loaded: !q.isLoading };
}
