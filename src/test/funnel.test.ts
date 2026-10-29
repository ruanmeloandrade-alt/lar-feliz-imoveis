import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkMoveSlimFunnelLeads, createSlimFunnelLead, SLIM_EXISTING_CONTACT_MESSAGE } from '@/lib/funnel-mutations.core';

const workspace = 'b61f4905-f8df-45eb-9ec8-d8efca86a8ce';
const deal = 'b61f4905-f8df-45eb-9ec8-d8efca86a8cf';
const event = 'b61f4905-f8df-45eb-9ec8-d8efca86a8d0';
const input = { crmSourceId: workspace, pipelineId: workspace, stageId: workspace, name: 'Cliente de teste', requestId: workspace };
beforeEach(() => vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal }));
afterEach(() => vi.unstubAllGlobals());
const transport = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn(() => ({ abortSignal: vi.fn(async () => ({ data, error })) }));
  return { rpc };
};
describe('Motor de funil adaptado da Saude Slim', () => {
  it('exige recibo real e usa somente o RPC da Vanessa', async () => {
    const db = transport({ ok: true, id: deal, leadId: deal, eventId: event });
    await expect(createSlimFunnelLead(db, workspace, input)).resolves.toEqual({ id: deal, leadId: deal, eventId: event, automationEvaluated: true });
    expect(db.rpc).toHaveBeenCalledWith('vanessa_create_lead_and_emit', expect.objectContaining({ _request_id: workspace, _workspace_id: workspace }));
  });
  it('nao anuncia cadastro confirmado sem recibo valido', async () => {
    await expect(createSlimFunnelLead(transport({ ok: true }), workspace, input)).rejects.toThrow(/cadastro.*confirmado/);
  });
  it('preserva o contato existente quando o banco aponta duplicidade', async () => {
    await expect(createSlimFunnelLead(transport(null, { code: '23505', message: SLIM_EXISTING_CONTACT_MESSAGE }), workspace, input)).rejects.toThrow(SLIM_EXISTING_CONTACT_MESSAGE);
  });
  it('recusa selecao duplicada antes da escrita', async () => {
    const db = transport(null);
    await expect(bulkMoveSlimFunnelLeads(db, workspace, { leadIds: [deal, deal], toStageId: workspace, requestId: workspace })).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('recusa quantidade de eventos inconsistente', async () => {
    const db = transport({ ok: true, count: 1, movedCount: 1, unchangedCount: 0, eventIds: [] });
    await expect(bulkMoveSlimFunnelLeads(db, workspace, { leadIds: [deal], toStageId: workspace, requestId: workspace })).rejects.toThrow(/confirmada/);
  });
});
