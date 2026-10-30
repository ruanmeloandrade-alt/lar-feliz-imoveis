import {
  copilotRecord,
  copilotUuid,
  parseSlimCopilotProposal,
  parseSlimCopilotProposals,
  type SlimCopilotDecision,
  type SlimCopilotIdentity,
  type SlimCopilotProposal,
  type SlimCopilotStatus,
} from "./slim-copilot-contract.core";

export const slimCopilotStatusLabels: Record<SlimCopilotStatus, string> = {
  pending: "🟡 Aguardando sua aprovação",
  executing: "🟡 Execução em andamento",
  succeeded: "🟢 Execução confirmada",
  rejected: "⚪ Proposta rejeitada",
  stale: "🟠 Dados alterados",
  expired: "⚪ Proposta expirada",
  uncertain: "🟡 Resultado não confirmado",
  failed: "🔴 Ação não concluída",
};

export type SlimCopilotUiState = {
  proposals: SlimCopilotProposal[];
  loaded: boolean;
  reading: boolean;
  readError: string | null;
  busy: Record<string, "approve" | "reject">;
  unconfirmed: Record<string, true>;
  lastResultId: string | null;
};

export function slimCopilotConversationKey(workspaceId: string, actorId: string) {
  return ["ai-agent-conv", workspaceId, "support_robot", actorId] as const;
}

export function slimCopilotCanDecide(
  proposal: SlimCopilotProposal,
  state: SlimCopilotUiState,
  now = Date.now(),
) {
  return state.loaded && !state.reading && !state.readError && proposal.status === "pending"
    && Date.parse(proposal.expiresAt) > now
    && !state.busy[proposal.id] && !state.unconfirmed[proposal.id];
}

export function slimCopilotNeedsAttention(proposal: SlimCopilotProposal, state: SlimCopilotUiState) {
  return Boolean(state.busy[proposal.id] || state.unconfirmed[proposal.id])
    || state.lastResultId === proposal.id
    || ["pending", "executing", "uncertain"].includes(proposal.status);
}

type Dependencies = {
  list: (identity: SlimCopilotIdentity) => Promise<unknown>;
  decide: (decision: SlimCopilotDecision) => Promise<unknown>;
  now?: () => number;
};

/**
 * The UI keeps no executable arguments. A lost decision response locks that
 * proposal until an authoritative read returns the same proposal and version.
 */
export function createSlimCopilotUi(
  identity: SlimCopilotIdentity,
  dependencies: Dependencies,
) {
  const scope = Object.freeze({
    workspaceId: copilotUuid(identity.workspaceId),
    actorId: copilotUuid(identity.actorId),
  });
  let state: SlimCopilotUiState = {
    proposals: [], loaded: false, reading: false, readError: null, busy: {}, unconfirmed: {}, lastResultId: null,
  };
  const listeners = new Set<() => void>();
  let active = false;
  let epoch = 0;
  let revision = 0;
  let readingPromise: Promise<void> | null = null;
  const now = dependencies.now ?? Date.now;
  const emit = (patch: Partial<SlimCopilotUiState>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const current = (started: number) => active && epoch === started;

  function activate() {
    active = true;
    epoch++;
    readingPromise = null;
    const unconfirmed = { ...state.unconfirmed };
    Object.keys(state.busy).forEach(id => { unconfirmed[id] = true; });
    emit({ reading: false, loaded: false, busy: {}, unconfirmed });
  }

  function deactivate() {
    active = false;
    epoch++;
    readingPromise = null;
  }

  async function refresh(): Promise<void> {
    if (!active) return;
    if (readingPromise) return readingPromise;
    // A concurrent old read must never unlock an approval whose reply was lost.
    if (Object.keys(state.busy).length > 0) return;
    const started = epoch, startedRevision = revision;
    emit({ reading: true });
    const task = (async () => {
      try {
        const response = copilotRecord(await Promise.resolve().then(() => dependencies.list(scope)));
        if (!current(started) || revision !== startedRevision) return;
        if (copilotUuid(response.workspaceId) !== scope.workspaceId
          || copilotUuid(response.actorId) !== scope.actorId) {
          throw new Error("A resposta pertence a outra empresa ou operador.");
        }
        const proposals = parseSlimCopilotProposals(response.proposals, scope);
        const byId = new Map(proposals.map(proposal => [proposal.id, proposal]));
        const unconfirmed = { ...state.unconfirmed };
        for (const previous of state.proposals) {
          const fresh = byId.get(previous.id);
          if (fresh && fresh.version !== previous.version) {
            throw new Error("A identidade da proposta foi alterada.");
          }
          if (unconfirmed[previous.id]) {
            if (fresh) delete unconfirmed[previous.id];
            else proposals.push(previous);
          }
        }
        emit({ proposals, unconfirmed, loaded: true, readError: null });
      } catch {
        if (current(started) && revision === startedRevision) {
          emit({ readError: "Não foi possível conferir as propostas. Os resultados já confirmados foram preservados. Tente Conferir resultados." });
        }
      } finally {
        if (current(started)) {
          readingPromise = null;
          emit({ reading: false });
        }
      }
    })();
    readingPromise = task;
    return task;
  }

  async function decide(proposalId: string, expectedVersion: string, decision: "approve" | "reject") {
    const proposal = state.proposals.find(item => item.id === proposalId);
    if (!active || !proposal || proposal.version !== expectedVersion
      || (decision !== "approve" && decision !== "reject")
      || !slimCopilotCanDecide(proposal, state, now())) return false;
    const started = epoch;
    revision++;
    emit({ busy: { ...state.busy, [proposal.id]: decision } });
    try {
      const response = copilotRecord(await dependencies.decide(Object.freeze({
        ...scope, proposalId: proposal.id, expectedVersion: proposal.version, decision,
      })));
      if (!current(started)) return false;
      const confirmed = parseSlimCopilotProposal(response.proposal, scope);
      if (confirmed.id !== proposal.id || confirmed.version !== proposal.version
        || confirmed.status === "pending") {
        throw new Error("O resultado da decisão não pôde ser confirmado.");
      }
      revision++;
      const busy = { ...state.busy }, unconfirmed = { ...state.unconfirmed };
      delete busy[proposal.id];
      delete unconfirmed[proposal.id];
      emit({
        busy, unconfirmed, lastResultId: proposal.id,
        proposals: state.proposals.map(item => item.id === proposal.id ? confirmed : item),
      });
      return true;
    } catch {
      if (current(started)) {
        revision++;
        const busy = { ...state.busy };
        delete busy[proposal.id];
        emit({ busy, unconfirmed: { ...state.unconfirmed, [proposal.id]: true } });
      }
      return false;
    }
  }

  return {
    activate, deactivate, refresh, decide,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
