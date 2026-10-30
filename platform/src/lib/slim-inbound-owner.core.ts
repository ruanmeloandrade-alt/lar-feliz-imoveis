type Db = { from: (table: string) => any };
type LeadOwner = {
  phone?: string | null;
  ai_paused?: boolean;
  active_conversation_agent_id?: string | null;
  active_conversation_agent_version?: number | string;
};
type RunOwner = { id: string; status: string; stopped_at?: string | null; variables?: Record<string, unknown> | null };
export type InboundResumeOptions = { onlyRunId?: string; onAgentClaimed?: (runId: string) => void };
export type DirectAgentOwner = { id: string; phone: string; version: number };
export type InboundOwnerDependencies = {
  resume: (options?: InboundResumeOptions) => Promise<void>;
  turn: (owner: DirectAgentOwner) => Promise<{ reply: string; handoff: boolean; error?: string }>;
};

/** A busy/ambiguous owner must not be acknowledged as an unowned message. */
export class InboundOwnerBusyError extends Error {
  constructor() {
    super('A conversa já tem um turno de IA em processamento. A mensagem não foi encaminhada a outro agente.');
    this.name = 'InboundOwnerBusyError';
  }
}

/** Keep the button-response branch reachable without waking unrelated waits. */
export function waitingEventsAcceptInbound(events: unknown): boolean {
  if (!Array.isArray(events)) return true;
  return events.some(event => event && typeof event === 'object'
    && ['msg-recebida', 'lote-msgs', 'botao-clicado'].includes(String(event.type ?? '')));
}

function versionOf(row: LeadOwner): number {
  const value = Number(row.active_conversation_agent_version);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Versão do atendimento inválida.');
  return value;
}

/**
 * Resolve ownership BEFORE resuming a SalesBot. This is routing, not a distributed
 * event deduplication journal. Existing claimSalesbotAiTurn remains authoritative.
 */
export async function routeInboundAgentOwnership(
  db: Db,
  params: { workspaceId: string; leadId: string },
  dependencies: InboundOwnerDependencies,
): Promise<boolean> {
  const loadLead = async (): Promise<LeadOwner> => {
    const result = await db.from('leads')
      .select('phone,ai_paused,active_conversation_agent_id,active_conversation_agent_version')
      .eq('workspace_id', params.workspaceId).eq('id', params.leadId).maybeSingle();
    if (result.error) throw new Error('Não foi possível confirmar quem atende esta conversa.');
    if (!result.data) throw new Error('Conversa não encontrada nesta empresa.');
    return result.data;
  };
  const before = await loadLead();
  const runsResult = await db.from('salesbot_runs').select('id,status,stopped_at,variables')
    .eq('workspace_id', params.workspaceId).eq('lead_id', params.leadId)
    .in('status', ['running', 'waiting_message', 'waiting_timer']);
  if (runsResult.error) throw new Error('Não foi possível confirmar a execução responsável pela conversa.');
  if (!Array.isArray(runsResult.data)) throw new Error('A consulta de execuções não retornou uma lista válida.');
  const owners = (runsResult.data as RunOwner[]).filter(run => !run.stopped_at
    && typeof run.variables?.ia_agent_id === 'string' && run.variables.ia_agent_id.trim());

  if (owners.length) {
    // Pausing an agent must not release this same inbound to a global SalesBot.
    if (before.ai_paused) return true;
    if (owners.length !== 1) throw new InboundOwnerBusyError();
    const owner = owners[0];
    if (owner.status !== 'waiting_message') throw new InboundOwnerBusyError();
    if (before.active_conversation_agent_id
      && before.active_conversation_agent_id !== owner.variables?.ia_agent_id) throw new InboundOwnerBusyError();
    let claimed = false;
    await dependencies.resume({ onlyRunId: owner.id, onAgentClaimed: id => { if (id === owner.id) claimed = true; } });
    if (!claimed) throw new InboundOwnerBusyError();
    // Even if the run ended, handed off or changed agent, it owned THIS message.
    return true;
  }

  if (before.active_conversation_agent_id && !before.ai_paused) {
    const owner = { id: before.active_conversation_agent_id, phone: before.phone ?? '', version: versionOf(before) };
    const turn = await dependencies.turn(owner);
    // An error is not permission to detach the agent or transfer to global bots.
    if (turn.handoff && !turn.error) {
      const saved = await db.from('leads').update({
        active_conversation_agent_id: null, ai_paused: true, updated_at: new Date().toISOString(),
      }).eq('workspace_id', params.workspaceId).eq('id', params.leadId)
        .eq('active_conversation_agent_id', owner.id).eq('active_conversation_agent_version', owner.version)
        .eq('ai_paused', false).select('id').maybeSingle();
      if (saved.error) throw new Error('Não foi possível confirmar o encerramento do atendimento.');
      if (saved.data) {
        const audit = await db.from('lead_activities').insert({
          workspace_id: params.workspaceId, lead_id: params.leadId, type: 'ai_agent_handoff',
          payload: { agent_id: owner.id }, occurred_at: new Date().toISOString(),
        });
        // Never repeat a completed turn because a secondary audit insert failed.
        if (audit.error) console.warn('[inbound-owner] handoff persisted; audit insert failed');
      }
    }
    return true;
  }

  await dependencies.resume();
  const after = await loadLead();
  // A conventional run may have assigned/replied through an agent during resume.
  // Its handoff must not also start global bots for the same inbound.
  return Boolean(after.active_conversation_agent_id && !after.ai_paused);
}
