/**
 * Permissões da Vanessa Simoni pelo Supabase Auth e vínculo com workspace.
 * Sem backend SSR: não conceder acesso baseado apenas em flags do navegador.
 * Usuários sem papel owner/admin ficam restritos até a matriz de permissões
 * do projeto ser migrada e homologada.
 */
import { supabase } from "@/integrations/supabase/client";
import type { EffectivePermissions, EffectiveRole } from "@/lib/permissions-core";

export async function getSaudeSlimPermissions(): Promise<{effective: EffectivePermissions}> {
  const {data: auth, error: authError} = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Acesso não autenticado.");
  const {data: profile, error: profileError} = await (supabase as any)
    .from("profiles").select("current_workspace_id")
    .eq("id", auth.user.id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile?.current_workspace_id) throw new Error("Workspace não encontrado.");
  const {data: member, error: membershipError} = await (supabase as any)
    .from("workspace_members").select("role").eq("workspace_id", profile.current_workspace_id)
    .eq("user_id", auth.user.id).maybeSingle();
  if (membershipError || !member) throw new Error("Usuário sem acesso ao workspace.");
  const role: EffectiveRole = ["owner", "admin"].includes(member.role) ? member.role : "member";
  return {effective: {role, full: role === "owner" || role === "admin", permissions: null}};
}
