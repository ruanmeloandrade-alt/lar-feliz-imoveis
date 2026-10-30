import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

const onboardingStepSchema = z.enum([
  "whatsapp",
  "meta",
  "ads",
  "social",
  "tracking",
  "empresa",
  "funil",
  "automacoes",
]);

export const listOnboardingSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await requireActiveWorkspace(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("workspace_onboarding_steps")
      .select("step_id")
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.step_id);
  });

export const setOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stepId: onboardingStepSchema, completed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await requireActiveWorkspace(context.supabase, context.userId);

    if (!data.completed) {
      const { error } = await context.supabase
        .from("workspace_onboarding_steps")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("step_id", data.stepId);
      if (error) throw new Error(error.message);
      return { stepId: data.stepId, completed: false };
    }

    const { error } = await context.supabase.from("workspace_onboarding_steps").upsert(
      {
        workspace_id: workspaceId,
        step_id: data.stepId,
        completed_by: context.userId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,step_id" },
    );
    if (error) throw new Error(error.message);
    return { stepId: data.stepId, completed: true };
  });