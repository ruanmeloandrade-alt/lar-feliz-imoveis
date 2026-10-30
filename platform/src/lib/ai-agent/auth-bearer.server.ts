// Verify the bearer token, then check membership using this same authenticated RLS client.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";
import type { Database } from "@/integrations/supabase/types";
import { assertSlimChatMembership } from "@/lib/slim-chat-membership.core";
import { assertSlimSessionSecurity } from "@/lib/slim-session-security.core";

export type BearerContext = {
  userId: string;
  supabase: SupabaseClient<Database>;
};
export async function verifyBearer(request: Request): Promise<BearerContext> {
  const auth = request.headers.get("Authorization") ?? request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new Error("Sem token de autenticação.");
  const { url, publishableKey: anon } = resolveServerSupabaseEnv();
  const supabase = createClient<Database>(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida.");
  await assertSlimSessionSecurity(supabase);
  return { userId: data.user.id, supabase };
}
export async function assertWorkspaceMember(supabase: SupabaseClient<Database>, workspaceId: string, userId: string): Promise<void> {
  await assertSlimChatMembership(supabase, workspaceId, userId);
}
