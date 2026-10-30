import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Lógica interna para ativar um agente IA.
 * Pode ser chamada por server functions ou diretamente em testes.
 */
export async function activateLeadAiAgentInternal(data: {
  workspaceId: string;
  leadId: string;
  agentId: string;
}) {
  const { workspaceId, leadId, agentId } = data;

  // 1. Validar Lead e Agente no mesmo Workspace e Agente habilitado
  const [leadQuery, agentQuery] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id, workspace_id")
      .eq("id", leadId)
      .maybeSingle(),
    supabaseAdmin
      .from("conversation_ai_agents")
      .select("id, name, enabled, workspace_id")
      .eq("id", agentId)
      .maybeSingle(),
  ]);

  const lead = leadQuery.data;
  const agent = agentQuery.data;

  if (!lead || lead.workspace_id !== workspaceId) {
    throw new Error("Lead não encontrado ou não pertence a este workspace.");
  }

  if (!agent || agent.workspace_id !== workspaceId) {
    throw new Error("Agente IA não encontrado ou não pertence a este workspace.");
  }

  if (!agent.enabled) {
    throw new Error("Este Agente IA está desabilitado.");
  }

  // 2. Atualizar Lead
  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("leads")
    .update({
      active_conversation_agent_id: agentId,
      ai_paused: false,
      updated_at: nowIso,
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (updateError) throw new Error(updateError.message);

  // 3. Registrar Atividade
  await supabaseAdmin.from("lead_activities").insert({
    workspace_id: workspaceId,
    lead_id: leadId,
    type: "ai_agent_activated",
    payload: { 
      agent_id: agentId, 
      agent_name: agent.name,
      source: "canonical_activation"
    },
    occurred_at: nowIso,
  });

  return { ok: true, agentName: agent.name };
}

/**
 * Lógica interna para pausar um agente IA.
 */
export async function pauseLeadAiAgentInternal(data: {
  workspaceId: string;
  leadId: string;
}) {
  const { workspaceId, leadId } = data;

  const { error: updateError } = await supabaseAdmin
    .from("leads")
    .update({
      ai_paused: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (updateError) throw new Error(updateError.message);

  return { ok: true };
}
