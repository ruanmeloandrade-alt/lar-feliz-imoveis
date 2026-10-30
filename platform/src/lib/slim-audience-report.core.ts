export const AUDIENCE_KINDS = ['text', 'salesbot', 'agent'] as const;
export const CAMPAIGN_STATES = ['queued', 'running', 'completed', 'cancelled'] as const;
export const DELIVERY_STATES = ['pending', 'running', 'sent', 'failed', 'uncertain', 'skipped', 'cancelled'] as const;
export type AudienceKind = typeof AUDIENCE_KINDS[number];
export type CampaignState = typeof CAMPAIGN_STATES[number];
export type DeliveryState = typeof DELIVERY_STATES[number];
export type AudienceReportScope = { workspaceId: string; actorId: string };
export type AudienceReportFilters = { audienceId?: string; deletedAudience?: boolean; kind?: AudienceKind; status?: CampaignState; from?: string; to?: string };
export type AudienceReportCursor = { createdAt: string; id: string };
export type DeliveryTotals = Record<DeliveryState, number> & { total: number; historyPending: number; missingReceipt: number };
export type AudienceCampaignRow = { id: string; workspace_id: string; audience_id: string | null; audience_name: string; kind: AudienceKind; status: CampaignState; created_at: string; finished_at: string | null; created_by: string; session_id: string | null; agent_id: string | null; salesbot_id: string | null; delay_ms: number; delay_seconds: number };
export type AudienceDeliveryRow = { id: string; workspace_id: string; campaign_id: string; lead_id: string | null; name: string | null; phone: string | null; status: DeliveryState; message_id: string | null; last_error: string | null; created_at: string; started_at: string | null; finished_at: string | null };
export type AudienceCampaignReport = { id: string; audienceId: string | null; audienceName: string; kind: AudienceKind; status: CampaignState; createdAt: string; finishedAt: string | null; createdBy: string; sessionId: string | null; agentId: string | null; salesbotId: string | null; delayMs: number; delaySeconds: number; totals: DeliveryTotals };
export type AudienceRecipientReport = { id: string; leadId: string | null; name: string; phone: string | null; status: DeliveryState; result: string; issue: string | null; receipt: { kind: 'whatsapp' | 'salesbot'; id: string } | null; createdAt: string; startedAt: string | null; finishedAt: string | null };
export type AudienceReportPage = AudienceReportScope & { campaigns: AudienceCampaignReport[]; totalCampaigns: number; nextCursor: AudienceReportCursor | null; pageTotals: DeliveryTotals; observedAt: string };
export type AudienceReportDetail = AudienceReportScope & { campaign: AudienceCampaignReport; recipients: AudienceRecipientReport[]; filteredRecipients: number; page: number; pageSize: number; observedAt: string };
export const audienceKindLabel = (kind: AudienceKind) => ({ text: 'Disparo de mensagem', salesbot: 'Reativação com SalesBot', agent: 'Reativação com IA' })[kind];
export const campaignStateLabel = (state: CampaignState) => ({ queued: 'Na fila', running: 'Em execução', completed: 'Processamento encerrado', cancelled: 'Cancelado' })[state];
export const deliveryStateLabel = (state: DeliveryState) => ({ pending: 'Pendente', running: 'Em execução', sent: 'Concluído na fila', failed: 'Falha', uncertain: 'Resultado incerto', skipped: 'Ignorado', cancelled: 'Cancelado' })[state];
export const emptyDeliveryTotals = (): DeliveryTotals => ({ total: 0, pending: 0, running: 0, sent: 0, failed: 0, uncertain: 0, skipped: 0, cancelled: 0, historyPending: 0, missingReceipt: 0 });
export function audienceReportDate(value: string, exclusiveEnd = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data inválida para o relatório.');
  const timestamp = Date.parse(`${value}T00:00:00-03:00`);
  if (!Number.isFinite(timestamp) || new Date(timestamp - 3 * 3600000).toISOString().slice(0, 10) !== value) throw new Error('Data inválida para o relatório.');
  return new Date(timestamp + (exclusiveEnd ? 86400000 : 0)).toISOString();
}
export function audienceReceipt(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}
export function audienceReportTimestamp(value: string): bigint {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const timestamp = Date.parse(value);
  if (!match || !Number.isFinite(timestamp)) throw new Error('Data de campanha inválida.');
  return BigInt(Math.floor(timestamp / 1000)) * 1000000n + BigInt((match[2] || '').padEnd(6, '0'));
}
export function audienceReportTotals(rows: Array<Pick<AudienceDeliveryRow, 'status' | 'message_id' | 'last_error'>>): DeliveryTotals {
  const totals = emptyDeliveryTotals();
  for (const row of rows) {
    if (!(DELIVERY_STATES as readonly string[]).includes(row.status)) throw new Error('O histórico contém um resultado desconhecido. Atualize o relatório.');
    totals.total++; totals[row.status]++;
    if (row.status === 'sent' && row.last_error === 'LOCAL_PERSISTENCE_FAILED') totals.historyPending++;
    if (row.status === 'sent' && !audienceReceipt(row.message_id)) totals.missingReceipt++;
  }
  return totals;
}
export function sumAudienceReportTotals(rows: DeliveryTotals[]): DeliveryTotals {
  const result = emptyDeliveryTotals();
  for (const row of rows) for (const key of Object.keys(result) as Array<keyof DeliveryTotals>) result[key] += row[key];
  return result;
}
export function audienceCampaignReport(row: AudienceCampaignRow, totals: DeliveryTotals): AudienceCampaignReport {
  if (!(AUDIENCE_KINDS as readonly string[]).includes(row.kind) || !(CAMPAIGN_STATES as readonly string[]).includes(row.status) || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Registro de campanha inválido. Atualize o relatório.');
  return { id: row.id, audienceId: row.audience_id, audienceName: row.audience_name, kind: row.kind, status: row.status, createdAt: row.created_at, finishedAt: row.finished_at, createdBy: row.created_by, sessionId: row.session_id, agentId: row.agent_id, salesbotId: row.salesbot_id, delayMs: row.delay_ms, delaySeconds: row.delay_seconds, totals };
}
export function audienceReportIssue(code: string | null): string | null {
  if (!code) return null;
  const reasons: Record<string, string> = {
    LOCAL_PERSISTENCE_FAILED: 'WhatsApp confirmou, mas o histórico local está pendente. Não há repetição automática.',
    NO_PROVIDER_RECEIPT: 'O WhatsApp não devolveu um comprovante válido. Confira a conversa antes de outra tentativa.',
    CAMPAIGN_STOPPED: 'A campanha foi encerrada ou a autorização mudou antes da execução.',
    CONTACT_UNAVAILABLE: 'O contato foi removido, mesclado ou bloqueado para atendimento.',
    BOT_NOT_STARTED: 'O SalesBot não confirmou uma execução para este contato.',
    INVALID_PHONE: 'O telefone não pôde ser validado.', PHONE_CHANGED: 'O telefone mudou depois do enfileiramento.',
    SESSION_UNAVAILABLE: 'O WhatsApp selecionado estava indisponível.', INVALID_MESSAGE: 'A mensagem não passou na validação.',
    OTHER_AGENT_ACTIVE: 'Outro agente já estava ativo; ele foi preservado.', PRECONDITION_FAILED: 'Uma condição necessária não pôde ser confirmada antes da execução.',
    PROVIDER_RESULT_UNKNOWN: 'A tentativa começou, mas o resultado não pôde ser confirmado. Não há repetição automática.',
    INVALID_KIND: 'O tipo registrado não é suportado.',
  };
  if (reasons[code]) return reasons[code];
  if (/^PROVIDER_[1-5]\d{2}$/.test(code)) return `O WhatsApp respondeu com HTTP ${code.slice(9)}. Confira a conversa antes de outra tentativa.`;
  if (code.startsWith('Execução interrompida.')) return 'A execução foi interrompida e ficou incerta. Confira a conversa antes de outra tentativa.';
  return 'Há uma ocorrência registrada para esta execução. Confira a conversa antes de outra tentativa.';
}
export function audienceRecipientReport(row: AudienceDeliveryRow, kind: AudienceKind, visibleLeadIds: Set<string>): AudienceRecipientReport {
  const receiptId = audienceReceipt(row.message_id);
  const receipt = receiptId ? { kind: kind === 'salesbot' ? 'salesbot' as const : 'whatsapp' as const, id: receiptId } : null;
  const result = row.status === 'sent' ? receipt ? kind === 'salesbot' ? 'SalesBot acionado' : 'Aceito pelo WhatsApp' : 'Concluído sem comprovante registrado' : deliveryStateLabel(row.status);
  return { id: row.id, leadId: row.lead_id && visibleLeadIds.has(row.lead_id) ? row.lead_id : null, name: row.name || 'Nome não registrado', phone: row.phone, status: row.status, result, issue: audienceReportIssue(row.last_error), receipt, createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at };
}
