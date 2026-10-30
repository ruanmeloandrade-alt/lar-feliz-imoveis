import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authorizeSlimCopilot, copilotDeadline } from "@/lib/slim-copilot-approval.core";

/** Current, read-only configuration of the global Vanessa Simoni Copilot. */
export const getSupportRobotContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const userId = context.userId;
    const profileResult: any = await copilotDeadline(sb.from("profiles")
      .select("id,full_name,current_workspace_id").eq("id", userId).maybeSingle(), 8000,
    "Não foi possível identificar a empresa ativa do Copiloto.");
    if (profileResult.error) throw new Error("Não foi possível identificar a empresa ativa do Copiloto.");
    const profile = profileResult.data;
    if (!profile?.current_workspace_id) return { active: false as const, reason: "no_workspace" as const };
    const workspaceId = profile.current_workspace_id;
    await authorizeSlimCopilot(sb as any, userId, {workspaceId, actorId: userId});
    const result: any[] = await copilotDeadline(Promise.all([
      sb.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle(),
      sb.from("integrations").select("provider,status").eq("workspace_id", workspaceId).in("provider", ["openai", "gemini"]).eq("status", "connected"),
      sb.from("whatsapp_web_sessions").select("id").eq("workspace_id", workspaceId).eq("provider", "evolution").eq("status", "conectado").limit(1),
      sb.from("pipelines").select("id").eq("workspace_id", workspaceId).limit(1),
      sb.from("salesbots").select("id").eq("workspace_id", workspaceId).eq("is_active", true).limit(1),
    ]), 8000, "A configuração atual do Copiloto não pôde ser consultada.");
    if (result.some(row => row.error)) throw new Error("A configuração atual do Copiloto não pôde ser consultada.");
    const [workspace, integrations, sessions, pipelines, bots] = result.map(row => row.data);
    const hasOpenAI = integrations.length > 0;
    const checklist = [
      {key: "copilot_ai", label: "IA da empresa conectada", required: true, done: hasOpenAI},
      {key: "crm", label: "Funil configurado", required: false, done: pipelines.length > 0},
      {key: "whatsapp", label: "WhatsApp Evolution conectado", required: false, done: sessions.length > 0},
      {key: "salesbot", label: "SalesBot ativo", required: false, done: bots.length > 0},
    ];
    const implementationComplete = checklist.filter(item => item.required).every(item => item.done);
    return {
      active: true as const,
      actorId: userId,
      isAdmin: workspace?.owner_id === userId,
      copilotMode: implementationComplete ? ("assistant" as const) : ("implementation" as const),
      implementationComplete,
      implementationChecklist: checklist,
      hasOpenAI,
      userName: profile.full_name?.split(" ")[0] || "usuário",
      workspaceId,
      planCode: null,
    };
  });

// SLIM_GLOBAL_HISTORY_V1
