import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODULES = ["gestor_trafego", "kommo_manager", "salesbot", "inbox", "dashboard", "social_media", "strategist", "support_robot"] as const;
const MODES = ["consultor", "gestor"] as const;

/** Carrega a conversa única do usuário para o módulo (ou vazia). */
export const loadAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    module: z.enum(MODULES),
    actorId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Se for support_robot, usamos a tabela específica
    if (data.module === "support_robot") {
      const {loadSlimCopilotHistory} = await import('./slim-copilot-history.server');
      return loadSlimCopilotHistory(context as any, {workspaceId: data.workspaceId, actorId: data.actorId ?? ''});
    }

    const { data: row, error } = await context.supabase
      .from("ai_agent_conversations")
      .select("id,messages,last_message_at")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .eq("module", data.module as any)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      id: (row as { id?: string } | null)?.id ?? null,
      messages: JSON.stringify(((row as { messages?: unknown } | null)?.messages) ?? []),
      lastMessageAt: (row as { last_message_at?: string } | null)?.last_message_at ?? null,
    };
  });

/** Apaga a conversa (zera). */
export const resetAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    module: z.enum(MODULES),
    actorId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.module === "support_robot") {
      const {authorizeSlimCopilot} = await import('./slim-copilot-approval.core');
      await authorizeSlimCopilot(context.supabase as any, context.userId, {workspaceId: data.workspaceId, actorId: data.actorId ?? ''});
      const { error } = await context.supabase
        .from("support_robot_messages")
        .delete()
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { error } = await context.supabase
      .from("ai_agent_conversations")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .eq("module", data.module as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lê a configuração (modo + prompt extra) do agente. */
export const getAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    module: z.enum(MODULES),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.module === "support_robot") {
      return { mode: "consultor", systemPromptExtra: null };
    }

    const { data: row, error } = await context.supabase
      .from("ai_agent_settings")
      .select("mode,system_prompt_extra,updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("module", data.module as any)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as { mode?: string; system_prompt_extra?: string | null; updated_at?: string } | null;
    const raw = r?.mode ?? (data.module === "gestor_trafego" ? "gestor" : "consultor");
    const mode = (raw === "consultor" ? "consultor" : "gestor") as (typeof MODES)[number];
    return {
      mode,
      systemPromptExtra: r?.system_prompt_extra ?? null,
    };
  });

/** Salva/atualiza a configuração do agente. */
export const updateAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    module: z.enum(MODULES),
    mode: z.enum(MODES),
    systemPromptExtra: z.string().max(2000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.module === "support_robot") return { ok: true };

    const { error } = await context.supabase
      .from("ai_agent_settings")
      .upsert(
        {
          workspace_id: data.workspaceId,
          module: data.module as any,
          mode: data.mode,
          system_prompt_extra: data.systemPromptExtra ?? null,
          updated_by: context.userId,
        },
        { onConflict: "workspace_id,module" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
