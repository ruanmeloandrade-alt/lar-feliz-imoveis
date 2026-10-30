/** Browser-safe contract. A proposal is a server receipt, never executable client arguments. */
export const SLIM_COPILOT_KINDS = ['move_lead_stage', 'send_text', 'start_salesbot', 'stop_salesbot'] as const;
export const SLIM_COPILOT_STATUSES = ['pending', 'executing', 'succeeded', 'rejected', 'stale', 'expired', 'uncertain', 'failed'] as const;
export type SlimCopilotKind = typeof SLIM_COPILOT_KINDS[number];
export type SlimCopilotStatus = typeof SLIM_COPILOT_STATUSES[number];
export type SlimCopilotProposal = {
  id: string; workspaceId: string; actorId: string; version: string;
  kind: SlimCopilotKind; status: SlimCopilotStatus; createdAt: string; expiresAt: string;
  preview: {
    title: string; targetLabel: string;
    changes: Array<{label: string; before?: string; after: string}>;
    effects: string[]; channel?: string; content?: string; cost?: string;
  };
  result?: {summary: string; receiptId?: string; historyPending?: boolean};
};
export type SlimCopilotIdentity = {workspaceId: string; actorId: string};
export type SlimCopilotDecision = SlimCopilotIdentity & {
  proposalId: string; expectedVersion: string; decision: 'approve' | 'reject';
};
export function copilotRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta do Copiloto inválida.');
  return value as Record<string, any>;
}
export function copilotUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Identidade do Copiloto inválida.');
  return value.toLowerCase();
}
function text(value: unknown, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error('Conteúdo da proposta inválido.');
  return value;
}
function instant(value: unknown): string {
  const s = text(value, 40);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error('Data da proposta inválida.');
  return s;
}
/** Projects only display fields; claim tokens, payloads and secrets cannot reach the browser/model. */
export function parseSlimCopilotProposal(value: unknown, expected: SlimCopilotIdentity): SlimCopilotProposal {
  const row = copilotRecord(value);
  const workspaceId = copilotUuid(row.workspaceId), actorId = copilotUuid(row.actorId);
  if (workspaceId !== copilotUuid(expected.workspaceId) || actorId !== copilotUuid(expected.actorId)) throw new Error('A proposta pertence a outra empresa ou operador.');
  if (!SLIM_COPILOT_KINDS.includes(row.kind) || !SLIM_COPILOT_STATUSES.includes(row.status)) throw new Error('Estado da proposta não reconhecido.');
  const p = copilotRecord(row.preview);
  if (!Array.isArray(p.changes) || p.changes.length > 12 || !Array.isArray(p.effects) || p.effects.length > 12) throw new Error('Prévia da proposta inválida.');
  const proposal: SlimCopilotProposal = {
    id: copilotUuid(row.id), workspaceId, actorId, version: copilotUuid(row.version),
    kind: row.kind, status: row.status, createdAt: instant(row.createdAt), expiresAt: instant(row.expiresAt),
    preview: {
      title: text(p.title, 500), targetLabel: text(p.targetLabel, 1000),
      changes: p.changes.map((item: unknown) => {
        const c = copilotRecord(item);
        return {label: text(c.label, 200), ...(c.before == null ? {} : {before: text(c.before, 4000, false)}), after: text(c.after, 4000, false)};
      }),
      effects: p.effects.map((item: unknown) => text(item, 2000)),
      ...(p.channel == null ? {} : {channel: text(p.channel, 300)}),
      ...(p.content == null ? {} : {content: text(p.content, 4000, false)}),
      ...(p.cost == null ? {} : {cost: text(p.cost, 1000)}),
    },
  };
  if (row.result != null) {
    const r = copilotRecord(row.result);
    if (r.historyPending != null && typeof r.historyPending !== 'boolean') throw new Error('Recibo da proposta inválido.');
    proposal.result = {summary: text(r.summary, 2000), ...(r.receiptId == null ? {} : {receiptId: text(r.receiptId, 300)}), ...(r.historyPending == null ? {} : {historyPending: r.historyPending})};
  }
  return proposal;
}
export function parseSlimCopilotProposals(value: unknown, expected: SlimCopilotIdentity): SlimCopilotProposal[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Lista de propostas inválida.');
  const rows = value.map(row => parseSlimCopilotProposal(row, expected)), ids = new Set<string>();
  for (const row of rows) { if (ids.has(row.id)) throw new Error('Proposta repetida na resposta.'); ids.add(row.id); }
  return rows;
}
