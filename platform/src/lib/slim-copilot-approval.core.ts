import {assertSlimOperator} from './slim-workspace-operator.server.ts';
import {copilotRecord, copilotUuid, parseSlimCopilotProposal, parseSlimCopilotProposals, type SlimCopilotDecision, type SlimCopilotIdentity, type SlimCopilotKind, type SlimCopilotProposal} from './slim-copilot-contract.core.ts';

export type CopilotDb = {from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{data: any; error?: unknown}>};
export type SlimCopilotTextClaim = SlimCopilotIdentity & {
  fresh: true; proposalId: string; version: string; claimToken: string;
  leadId: string; text: string; sessionId: string; remoteJid: string; number: string;
  conversationKey: string; leadPhone: string;
};
export type SlimCopilotTextOutcome = {
  status: 'succeeded' | 'failed' | 'uncertain' | 'stale';
  result: {summary: string; receiptId?: string; historyPending?: boolean; code?: string};
};
export async function copilotDeadline<T>(request: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(request), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error(message)), timeoutMs);})]);
  } finally {if (timer) clearTimeout(timer);}
}

/** Strict, read-only identity check. Never creates profiles or chooses a fallback workspace. */
export async function authorizeSlimCopilot(db: CopilotDb, authenticatedActor: string, expected: SlimCopilotIdentity): Promise<void> {
  const actor = copilotUuid(authenticatedActor), ws = copilotUuid(expected.workspaceId);
  if (actor !== copilotUuid(expected.actorId)) throw new Error('O operador mudou. Reabra o Copiloto na sessão atual.');
  const profile: any = await copilotDeadline(db.from('profiles').select('current_workspace_id').eq('id', actor).maybeSingle(), 8000, 'Não foi possível verificar a empresa ativa.');
  if (profile.error || profile.data?.current_workspace_id !== ws) throw new Error('A empresa ativa mudou ou não pôde ser confirmada. Reabra o Copiloto.');
  await copilotDeadline(assertSlimOperator(db, ws, actor), 8000, 'Não foi possível verificar a permissão do operador.');
}
async function rpc(db: CopilotDb, name: string, args: Record<string, unknown>, message: string): Promise<any> {
  let response;
  try {
    const timeoutMs = /_(list|get)_proposals?$/.test(name) ? 8000 : 15000;
    let request: any = db.rpc(name, args);
    if (typeof request?.abortSignal === 'function') request = request.abortSignal(AbortSignal.timeout(timeoutMs));
    response = await copilotDeadline<{data: any; error?: unknown}>(request, timeoutMs, message);
  } catch { throw new Error(message); }
  if (!response || response.error) throw new Error(message);
  return response.data;
}
export async function listSlimCopilotProposalsCore(db: CopilotDb, authenticatedActor: string, expected: SlimCopilotIdentity) {
  await authorizeSlimCopilot(db, authenticatedActor, expected);
  const rows = await rpc(db, 'slim_copilot_list_proposals', {p_workspace_id: expected.workspaceId}, 'Não foi possível conferir as propostas. Nenhuma ação foi repetida.');
  return {workspaceId: expected.workspaceId, actorId: expected.actorId, proposals: parseSlimCopilotProposals(rows, expected)};
}
export async function createSlimCopilotProposalCore(db: CopilotDb, authenticatedActor: string, expected: SlimCopilotIdentity, input: {requestId: string; kind: SlimCopilotKind; payload: Record<string, unknown>}): Promise<SlimCopilotProposal> {
  await authorizeSlimCopilot(db, authenticatedActor, expected);
  const row = await rpc(db, 'slim_copilot_create_proposal', {
    p_workspace_id: expected.workspaceId, p_request_id: copilotUuid(input.requestId), p_kind: input.kind, p_payload: input.payload,
  }, 'Não foi possível preparar esta proposta. Confira o alvo e seus dados atuais; nenhuma ação foi executada.');
  const proposal = parseSlimCopilotProposal(row, expected);
  if (proposal.kind !== input.kind) throw new Error('A proposta registrada não corresponde à ação solicitada.');
  return proposal;
}
function parseTextClaim(value: unknown, proposal: SlimCopilotProposal): SlimCopilotTextClaim {
  const c = copilotRecord(value);
  if (c.fresh !== true || proposal.kind !== 'send_text' || proposal.status !== 'executing' || copilotUuid(c.proposalId) !== proposal.id || copilotUuid(c.version) !== proposal.version || copilotUuid(c.workspaceId) !== proposal.workspaceId || copilotUuid(c.actorId) !== proposal.actorId) throw new Error('Reserva de envio não corresponde à proposta aprovada.');
  if (typeof c.text !== 'string' || !c.text.trim() || c.text.length > 4000 || c.text !== proposal.preview.content || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(c.text)) throw new Error('O conteúdo reservado diverge da mensagem aprovada.');
  if (typeof c.remoteJid !== 'string' || !/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(c.remoteJid) || typeof c.number !== 'string' || !c.number || c.number.length > 150 || typeof c.conversationKey !== 'string' || !c.conversationKey || c.conversationKey.length > 300 || typeof c.leadPhone !== 'string' || c.leadPhone.length > 100) throw new Error('Destino reservado inválido.');
  return {fresh: true, proposalId: proposal.id, workspaceId: proposal.workspaceId, actorId: proposal.actorId, version: proposal.version,
    claimToken: copilotUuid(c.claimToken), leadId: copilotUuid(c.leadId), sessionId: copilotUuid(c.sessionId),
    text: c.text, remoteJid: c.remoteJid, number: c.number, conversationKey: c.conversationKey, leadPhone: c.leadPhone};
}
function checkedOutcome(value: unknown): SlimCopilotTextOutcome {
  const o = copilotRecord(value), r = copilotRecord(o.result);
  if (!['succeeded', 'failed', 'uncertain', 'stale'].includes(o.status) || typeof r.summary !== 'string' || !r.summary.trim() || r.summary.length > 2000 || (r.receiptId != null && (typeof r.receiptId !== 'string' || !r.receiptId.trim() || r.receiptId.length > 300)) || (r.historyPending != null && typeof r.historyPending !== 'boolean')) throw new Error('Resultado de envio inválido.');
  if (o.status === 'succeeded' && !r.receiptId) throw new Error('Confirmação do WhatsApp ausente.');
  return {status: o.status, result: {summary: r.summary, ...(r.receiptId == null ? {} : {receiptId: r.receiptId}), ...(r.historyPending == null ? {} : {historyPending: r.historyPending}), ...(typeof r.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(r.code) ? {code: r.code} : {})}};
}
export async function decideSlimCopilotProposalCore(db: CopilotDb, authenticatedActor: string, input: SlimCopilotDecision, dependencies: {
  executeText: (claim: SlimCopilotTextClaim) => Promise<SlimCopilotTextOutcome>;
  finishText: (claim: SlimCopilotTextClaim, outcome: SlimCopilotTextOutcome) => Promise<unknown>;
}): Promise<{proposal: SlimCopilotProposal}> {
  await authorizeSlimCopilot(db, authenticatedActor, input);
  const proposalId = copilotUuid(input.proposalId), version = copilotUuid(input.expectedVersion);
  if (!['approve', 'reject'].includes(input.decision)) throw new Error('Decisão inválida.');
  const response = copilotRecord(await rpc(db, 'slim_copilot_decide_proposal', {
    p_workspace_id: input.workspaceId, p_proposal_id: proposalId, p_expected_version: version, p_decision: input.decision,
  }, 'A decisão não foi confirmada. Use Conferir resultado antes de tentar novamente.'));
  const proposal = parseSlimCopilotProposal(response.proposal, input);
  if (proposal.id !== proposalId || proposal.version !== version) throw new Error('O servidor retornou outra proposta. Nenhum envio foi iniciado por esta resposta.');
  if (response.claim == null) return {proposal};
  if (input.decision !== 'approve') throw new Error('Uma rejeição não pode reservar envio.');
  const claim = parseTextClaim(response.claim, proposal);
  let outcome: SlimCopilotTextOutcome;
  try { outcome = checkedOutcome(await dependencies.executeText(claim)); }
  catch { outcome = {status: 'uncertain', result: {summary: 'O resultado do envio não pôde ser confirmado. Confira a conversa; esta proposta não será reenviada.', code: 'EXECUTION_RESULT_UNKNOWN'}}; }
  // A lost final receipt is never permission to execute the provider a second time.
  try { await dependencies.finishText(claim, outcome); } catch { /* Read the same durable reservation below. */ }
  const latest = parseSlimCopilotProposal(await rpc(db, 'slim_copilot_get_proposal', {
    p_workspace_id: input.workspaceId, p_proposal_id: proposalId,
  }, 'Não foi possível conferir o recibo. O envio não será repetido; use Conferir resultado.'), input);
  if (latest.id !== proposalId || latest.version !== version) throw new Error('Recibo de outra proposta recusado.');
  return {proposal: latest};
}
