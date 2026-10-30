import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activateLeadAiAgentInternal, pauseLeadAiAgentInternal } from "./ai-agent-control.server";

/**
 * ATIVAR AGENTE IA X1
 * Recebe: workspaceId, leadId, agentId
 * Valida se lead e agente pertencem ao workspace e se o agente está habilitado.
 */
export const activateLeadAiAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => 
    z.object({
      workspaceId: z.string().uuid(),
      leadId: z.string().uuid(),
      agentId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    return activateLeadAiAgentInternal(data);
  });

/**
 * PAUSAR AGENTE IA X1
 * Recebe: workspaceId, leadId
 * Apenas seta ai_paused = true, mantendo o agente vinculado.
 */
export const pauseLeadAiAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => 
    z.object({
      workspaceId: z.string().uuid(),
      leadId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    return pauseLeadAiAgentInternal(data);
  });
