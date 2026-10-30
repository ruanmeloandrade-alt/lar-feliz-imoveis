import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueLeadAutomationEvent } from '../stage-automation-engine.server';

describe('IDEMPOTÊNCIA DO CRM', () => {
  const createQueryMock = (resolvedValue: any) => {
    const mock: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(resolvedValue)),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (onfulfilled: any) => {
         const promise = Promise.resolve(resolvedValue);
         return onfulfilled ? promise.then(onfulfilled) : promise;
      },
    };
    return mock;
  };

  const mockAdmin: any = {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TESTE 9 — MESMA OCORRÊNCIA', async () => {
    const wsId = 'ws-a';
    const leadId = 'lead-a';
    const stageId = 's1';
    const eventId = 'evt-idempotent-123';

    const leadsMock = createQueryMock({ 
      data: { 
        id: leadId, 
        workspace_id: wsId, 
        pipeline_id: 'p1', 
        stage_id: stageId, 
        crm_source_id: 'src-1',
        name: 'Lead Test',
        email: 'test@example.com',
        phone: '123',
        value: 100,
        tags: [] 
      }, 
      error: null 
    });
    
    const fieldsMock = createQueryMock({ data: [], error: null });
    
    const autosMock = createQueryMock({ 
      data: [{
        stage_id: stageId, 
        enabled: true, 
        action: { 
          id: 'act-1', 
          title: 'Test', 
          enabled: true, 
          trigger: 'moved',
          config: { kind: 'pausar-ia' },
          execution: { 
            trigger: 'moved',
            delayMinutes: 5 
          }
        }
      }], 
      error: null 
    });
    
    const insertMockSuccess = createQueryMock({ data: { id: 'job-1' }, error: null });

    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'leads') return leadsMock;
      if (table === 'lead_custom_field_values') return fieldsMock;
      if (table === 'crm_stage_automations') return autosMock;
      if (table === 'crm_automation_jobs') return insertMockSuccess;
      return createQueryMock({ data: null, error: null });
    });

    const results1 = await enqueueLeadAutomationEvent(mockAdmin, { 
      leadId, event: 'moved', workspaceId: wsId, eventId, stageId
    } as any);
    
    expect(results1).toHaveLength(1);
    expect(results1[0].ok).toBe(true);
    expect(results1[0].skipped).toBe(true);
    expect(results1[0].queuedFor).toBeDefined();

    const insertMockDup = createQueryMock({ data: null, error: { code: '23505', message: 'duplicate' } });
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'leads') return leadsMock;
      if (table === 'lead_custom_field_values') return fieldsMock;
      if (table === 'crm_stage_automations') return autosMock;
      if (table === 'crm_automation_jobs') return insertMockDup;
      return createQueryMock({ data: null, error: null });
    });

    const results2 = await enqueueLeadAutomationEvent(mockAdmin, { 
      leadId, event: 'moved', workspaceId: wsId, eventId, stageId
    } as any);

    expect(results2).toHaveLength(1);
    expect(results2[0].ok).toBe(true);
    expect(results2[0].skipped).toBe(true);
    expect(results2[0].queuedFor).toBeUndefined();
  });

  it('TESTE 10 — NOVA OCORRÊNCIA', async () => {
    const wsId = 'ws-a';
    const leadId = 'lead-a';
    const stageId = 's1';

    const leadsMock = createQueryMock({ 
      data: { 
        id: leadId, 
        workspace_id: wsId, 
        pipeline_id: 'p1', 
        stage_id: stageId, 
        crm_source_id: 'src-1',
        tags: [] 
      }, 
      error: null 
    });
    
    const fieldsMock = createQueryMock({ data: [], error: null });
    const autosMock = createQueryMock({ 
      data: [{
        stage_id: stageId, 
        enabled: true, 
        action: { 
          id: 'act-1', 
          title: 'Test', 
          enabled: true, 
          trigger: 'moved', 
          config: { kind: 'pausar-ia' }, 
          execution: { 
            trigger: 'moved',
            delayMinutes: 5 
          }
        }
      }], 
      error: null 
    });
    const insertMockNew = createQueryMock({ data: { id: 'job-new' }, error: null });

    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'leads') return leadsMock;
      if (table === 'lead_custom_field_values') return fieldsMock;
      if (table === 'crm_stage_automations') return autosMock;
      if (table === 'crm_automation_jobs') return insertMockNew;
      return createQueryMock({ data: null, error: null });
    });

    const results = await enqueueLeadAutomationEvent(mockAdmin, { 
      leadId, event: 'moved', workspaceId: wsId, eventId: 'new-evt-456', stageId
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].skipped).toBe(true);
    expect(results[0].queuedFor).toBeDefined();
  });
});
