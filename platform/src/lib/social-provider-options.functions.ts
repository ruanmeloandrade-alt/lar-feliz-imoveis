import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });

async function currentUserIsSuperAdmin(context: any): Promise<boolean> {
  const userId = context.user.id as string;
  const [{ data: profile }, { data: dbRoles }] = await Promise.all([
    context.supabase.from("platform_profiles").select("roles").eq("id", userId).maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const profileRoles = Array.isArray(profile?.roles) ? profile.roles.map(String) : [];
  const roles = new Set([...profileRoles, ...((dbRoles ?? []).map((row: { role?: string }) => String(row.role ?? "")))]);
  return roles.has("super_admin");
}

export const listSocialProviderOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const imageOrder = ["ideogram", "recraft", "freepik", "gemini"] as const;
    const textOrder = ["openai", "gemini"] as const;
    const providers = Array.from(new Set([...imageOrder, ...textOrder]));

    const { data: rows, error } = await context.supabase
      .from("integrations")
      .select("provider,status")
      .eq("workspace_id", data.workspaceId)
      .in("provider", providers);
    if (error) throw new Error(error.message);

    const connected = new Set(
      ((rows ?? []) as Array<{ provider: string; status: string }>)
        .filter((row) => row.status === "connected")
        .map((row) => row.provider),
    );

    const isSuperAdmin = await currentUserIsSuperAdmin(context);
    const imageProviders = isSuperAdmin ? imageOrder.filter((provider) => connected.has(provider)) : [];
    const textProviders = textOrder.filter((provider) => connected.has(provider));

    return {
      imageProviders,
      textProviders,
      primaryImage: imageProviders[0] ?? null,
      primaryText: textProviders[0] ?? null,
    };
  });
