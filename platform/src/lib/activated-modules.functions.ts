import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { canManageWorkspaceBilling, effectiveEntitledModules } from "@/lib/billing/entitlements";

export const listActivatedModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await requireActiveWorkspace(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("feature_flags")
      .eq("id", workspaceId)
      .single();
    if (error) throw new Error(error.message);
    const flags = data.feature_flags && typeof data.feature_flags === "object" && !Array.isArray(data.feature_flags)
      ? data.feature_flags as Record<string, unknown>
      : {};
    return Array.isArray(flags.activated_modules)
      ? flags.activated_modules.filter((id): id is string => typeof id === "string")
      : [];
  });

export const setActivatedModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ moduleId: z.string().min(1).max(80), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await requireActiveWorkspace(context.supabase, context.userId, { createIfMissing: false });

    const [{ data: membership, error: membershipError }, { data: isSuper, error: roleError }] = await Promise.all([
      context.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    if (membershipError) throw new Error(membershipError.message);
    if (roleError) throw new Error(roleError.message);
    if (isSuper !== true && !canManageWorkspaceBilling(membership?.role)) {
      throw new Error("Somente o dono do workspace pode alterar módulos da conta.");
    }

    const { data: workspace, error: readError } = await context.supabase
      .from("workspaces")
      .select("feature_flags")
      .eq("id", workspaceId)
      .single();
    if (readError) throw new Error(readError.message);

    if (data.active) {
      const { data: subscription, error: subscriptionError } = await context.supabase
        .from("subscriptions")
        .select("status, trial_ends_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subscriptionError) throw new Error(subscriptionError.message);

      const { data: storedModules, error: modulesError } = await context.supabase
        .from("workspace_modules")
        .select("modules")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (modulesError) throw new Error(modulesError.message);

      const entitledModules = effectiveEntitledModules({
        isSuperAdmin: isSuper === true,
        status: subscription?.status,
        trialEndsAt: subscription?.trial_ends_at,
        workspaceModules: storedModules?.modules,
      });
      if (!(entitledModules as readonly string[]).includes(data.moduleId)) {
        throw new Error("Este módulo não está incluído no plano atual.");
      }
    }

    const flags = workspace.feature_flags && typeof workspace.feature_flags === "object" && !Array.isArray(workspace.feature_flags)
      ? workspace.feature_flags as Record<string, unknown>
      : {};
    const current = new Set(
      Array.isArray(flags.activated_modules)
        ? flags.activated_modules.filter((id): id is string => typeof id === "string")
        : [],
    );
    if (data.active) current.add(data.moduleId);
    else current.delete(data.moduleId);
    const { error } = await context.supabase
      .from("workspaces")
      .update({ feature_flags: { ...flags, activated_modules: Array.from(current) } })
      .eq("id", workspaceId);
    if (error) throw new Error(error.message);
    return Array.from(current);
  });
