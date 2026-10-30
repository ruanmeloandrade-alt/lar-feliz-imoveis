import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InboxAutomationState = {
  workspaceId: string; leadId: string; lastRunError?: string | null;
  bots: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  runs: Array<{ id: string; botId: string; name: string; status: string; startedAt: string }>;
  activeAgent: { id: string; name: string; version: number; paused: boolean; startedAt: string | null } | null;
};
const Target = z.object({ workspaceId: z.string().uuid(), leadId: z.string().uuid() });
const Action = z.discriminatedUnion("action", [
  Target.extend({ action: z.literal("start-bot"), botId: z.string().uuid(), requestId: z.string().uuid() }),
  Target.extend({ action: z.literal("stop-bot"), runId: z.string().uuid() }),
  Target.extend({ action: z.literal("start-agent"), agentId: z.string().uuid() }),
  Target.extend({ action: z.literal("stop-agent"), agentId: z.string().uuid(), version: z.number().int().nonnegative() }),
]);
export type InboxAutomationAction = z.infer<typeof Action>;

export const getInboxAutomationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((input: unknown) => Target.parse(input))
  .handler(async ({ data, context }): Promise<InboxAutomationState> => {
    const { data: result, error } = await (context.supabase as any).rpc("slim_inbox_automation_state", {
      p_workspace_id: data.workspaceId, p_lead_id: data.leadId,
    });
    if (error) throw new Error(error.message);
    if (!result || result.workspaceId !== data.workspaceId || result.leadId !== data.leadId) throw new Error("Estado da conversa não confirmado.");
    const last = await (context.supabase as any).from("salesbot_runs")
      .select("status,last_error").eq("workspace_id", data.workspaceId).eq("lead_id", data.leadId)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (last.error) throw new Error(last.error.message);
    return { ...result, lastRunError: last.data?.status === "error" ? last.data.last_error : null } as InboxAutomationState;
  });

export const controlInboxAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((input: unknown) => Action.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const target = { p_workspace_id: data.workspaceId, p_lead_id: data.leadId };
    let result: { data: any; error: any };
    if (data.action === "start-bot") {
      result = await db.rpc("slim_inbox_start_salesbot", { ...target, p_salesbot_id: data.botId, p_request_id: data.requestId });
    } else if (data.action === "stop-bot") {
      result = await db.rpc("slim_inbox_stop_salesbot", { ...target, p_run_id: data.runId });
    } else {
      if (data.action === "start-agent") {
        // Authorize BEFORE reading tenant credentials. Never borrow another tenant's key.
        const state = await db.rpc("slim_inbox_automation_state", target);
        if (state.error) throw new Error(state.error.message);
        if (!(state.data?.agents ?? []).some((agent: { id: string }) => agent.id === data.agentId)) throw new Error("Agente IA não disponível nesta empresa.");
        const [{ supabaseAdmin }, { resolveWorkspaceAiKey }] = await Promise.all([
          import("@/integrations/supabase/client.server"), import("@/lib/workspace-ai-key.server"),
        ]);
        await resolveWorkspaceAiKey(supabaseAdmin as never, data.workspaceId);
      }
      result = await db.rpc("slim_inbox_set_agent", { ...target, p_agent_id: data.agentId,
        p_action: data.action === "start-agent" ? "start" : "stop",
        p_expected_version: data.action === "stop-agent" ? data.version : null });
    }
    if (result.error) throw new Error(result.error.message);
    if (result.data?.ok !== true) throw new Error("O servidor não confirmou a alteração.");
    if (data.action === "start-bot") {
      const { kickInboxAutomationWorker } = await import("@/lib/inbox-automation-worker.server");
      kickInboxAutomationWorker();
    }
    return result.data as { ok: boolean; runId?: string; status?: string; reused?: boolean; stopped?: boolean; version?: number };
  });
