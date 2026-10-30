import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dispatchCrmLeadCreated } = vi.hoisted(() => ({
  dispatchCrmLeadCreated: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/crm-event-dispatch.server', () => ({ dispatchCrmLeadCreated }));

import { resolveTrackingIdentity } from '../tracking-identity.server';

describe('Fluxo Real 01: Tracking -> Identidade -> Lead', () => {
  const mockAdmin = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchCrmLeadCreated.mockResolvedValue([]);
  });

  it('TESTE 1: Deve resolver identidade para um lead existente via e-mail', async () => {
    const wsId = 'ws-a';
    const email = 'test@example.com';
    const leadId = 'lead-a';

    mockAdmin.maybeSingle.mockResolvedValueOnce({ data: null });
    mockAdmin.limit.mockResolvedValueOnce({ data: [{ id: leadId }] });

    const result = await resolveTrackingIdentity(mockAdmin, {
      workspaceId: wsId,
      anonId: 'anon-123',
      email,
      phone: null,
      explicitLeadId: null,
      utm: {},
    });

    expect(result.leadId).toBe(leadId);
    expect(mockAdmin.from).toHaveBeenCalledWith('leads');
    expect(mockAdmin.ilike).toHaveBeenCalledWith('email', email);
  });

  it('TESTE 2: ISOLAMENTO - Não deve resolver identidade para lead de outro workspace', async () => {
    const wsA = 'ws-a';
    const email = 'common@example.com';

    mockAdmin.maybeSingle.mockResolvedValueOnce({ data: null });
    mockAdmin.limit.mockResolvedValueOnce({ data: [] });

    const result = await resolveTrackingIdentity(mockAdmin, {
      workspaceId: wsA,
      anonId: 'anon-123',
      email,
      phone: null,
      explicitLeadId: null,
      utm: {},
    });

    expect(result.leadId).toBeNull();
    expect(mockAdmin.eq).toHaveBeenCalledWith('workspace_id', wsA);
  });

  it('TESTE 3: ISOLAMENTO - lead_id explícito só é aceito quando pertence ao workspace', async () => {
    const wsA = '11111111-1111-4111-8111-111111111111';
    const foreignLeadId = '22222222-2222-4222-8222-222222222222';
    mockAdmin.maybeSingle.mockResolvedValueOnce({ data: null });

    const result = await resolveTrackingIdentity(mockAdmin, {
      workspaceId: wsA,
      anonId: null,
      email: null,
      phone: null,
      explicitLeadId: foreignLeadId,
      utm: {},
    });

    expect(result.leadId).toBeNull();
    expect(mockAdmin.from).toHaveBeenCalledWith('leads');
    expect(mockAdmin.eq).toHaveBeenCalledWith('workspace_id', wsA);
    expect(mockAdmin.eq).toHaveBeenCalledWith('id', foreignLeadId);
  });

  it('TESTE 4: lead criado pelo Tracking emite evento CRM created e confirma marcador', async () => {
    const wsId = 'ws-a';
    const leadId = 'lead-new';
    mockAdmin.limit.mockResolvedValueOnce({ data: [] });
    mockAdmin.single.mockResolvedValueOnce({
      data: { id: leadId, custom_data: { tracking_crm_created_dispatched: false } },
      error: null,
    });

    const result = await resolveTrackingIdentity(mockAdmin, {
      workspaceId: wsId,
      anonId: null,
      email: 'new@example.com',
      phone: null,
      explicitLeadId: null,
      utm: {},
      createLeadIfMissing: true,
    });

    expect(result).toMatchObject({ leadId, created: true });
    expect(dispatchCrmLeadCreated).toHaveBeenCalledWith(mockAdmin, { workspaceId: wsId, leadId });
    expect(mockAdmin.update).toHaveBeenCalledWith({
      custom_data: { tracking_crm_created_dispatched: true },
    });
  });

  it('TESTE 5: corrida de criação recupera o lead existente no mesmo workspace', async () => {
    const wsId = 'ws-a';
    const leadId = 'lead-raced';
    mockAdmin.limit
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: leadId, custom_data: { tracking_crm_created_dispatched: true } }] });
    mockAdmin.single.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } });

    const result = await resolveTrackingIdentity(mockAdmin, {
      workspaceId: wsId,
      anonId: null,
      email: 'race@example.com',
      phone: null,
      explicitLeadId: null,
      utm: {},
      createLeadIfMissing: true,
    });

    expect(result).toMatchObject({ leadId, created: false });
    expect(mockAdmin.eq).toHaveBeenCalledWith('workspace_id', wsId);
    expect(dispatchCrmLeadCreated).not.toHaveBeenCalled();
  });
});
