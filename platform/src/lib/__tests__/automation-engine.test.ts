import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueLeadAutomationEvent, leadMatchesSourceFilter, parseAutomationDateTime, runJobById, scheduleDelayMinutes, shouldRunForEvent } from '../stage-automation-engine.server';

describe('Fluxo Real 02: Lead Muda de Etapa -> Automação', () => {
  const mockAdmin = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    mockAdmin.from.mockReturnValue(mockAdmin);
    mockAdmin.select.mockReturnValue(mockAdmin);
    mockAdmin.eq.mockReturnValue(mockAdmin);
    mockAdmin.order.mockReturnValue(mockAdmin);
    mockAdmin.maybeSingle.mockResolvedValue({ data: null });
  });

  it('TESTE 3: Deve localizar e enfileirar somente a automação correspondente', async () => {
    const wsId = 'ws-a';
    const leadId = 'lead-a';
    const stageId = 'stage-a';
    const pipelineId = 'pipe-a';
    mockAdmin.maybeSingle.mockResolvedValueOnce({
      data: { id: leadId, workspace_id: wsId, pipeline_id: pipelineId, stage_id: stageId, tags: [] }
    });
    mockAdmin.order.mockResolvedValueOnce({
      data: [{
        stage_id: stageId, enabled: true, action: { 
          id: 'act-1', title: 'Test', enabled: true, trigger: 'moved', config: { kind: 'mudar-etapa', stageId: 'stage-b' } 
        }
      }]
    });
    mockAdmin.single.mockResolvedValueOnce({ data: { id: 'job-1' } });
    const results = await enqueueLeadAutomationEvent(mockAdmin, { leadId, event: 'moved', workspaceId: wsId, stageId });
    expect(results.length).toBeGreaterThan(0);
    expect(mockAdmin.from).toHaveBeenCalledWith('crm_automation_jobs');
  });

  it('TESTE 4: Automação desativada NÃO pode gerar execução', async () => {
    mockAdmin.maybeSingle.mockResolvedValueOnce({
      data: { id: 'l1', workspace_id: 'w1', pipeline_id: 'p1', stage_id: 's1' }
    });
    mockAdmin.order.mockResolvedValueOnce({
      data: [{ stage_id: 's1', enabled: false, action: { id: 'a1', enabled: true, trigger: 'moved' } }]
    });
    const results = await enqueueLeadAutomationEvent(mockAdmin, { leadId: 'l1', event: 'moved', stageId: 's1' });
    expect(results).toHaveLength(0);
  });

  it('TESTE 5: WORKSPACE DA AUTOMAÇÃO - Não deve criar job para automação de outro workspace', async () => {
    const wsA = 'ws-a';
    const leadId = 'lead-a';
    mockAdmin.maybeSingle.mockResolvedValueOnce({
      data: { id: leadId, workspace_id: wsA, pipeline_id: 'p1', stage_id: 's1' }
    });
    mockAdmin.order.mockResolvedValueOnce({ data: [] }); 
    const results = await enqueueLeadAutomationEvent(mockAdmin, { leadId, event: 'moved', workspaceId: wsA });
    expect(results).toHaveLength(0);
    expect(mockAdmin.eq).toHaveBeenCalledWith('workspace_id', wsA);
  });

  it('TESTE 6: TRIGGER INCORRETO - Comprovar que o motor rejeita triggers incompatíveis', () => {
    const action = { 
      id: 'a1', title: 'Test', trigger: 'created', channel: 'ia', group: 'Dados', description: '',
      execution: { trigger: 'created-only' } 
    } as any;
    const shouldRun = shouldRunForEvent(action, 'moved');
    expect(shouldRun).toBe(false);
    const shouldRunOk = shouldRunForEvent(action, 'created');
    expect(shouldRunOk).toBe(true);
  });


  it('casa sourceFilter de sessão WhatsApp com o whatsapp_session_id real do lead', () => {
    const lead = {
      sourceId: 'ea66d38c-0b8e-47df-8ef4-3507976949c1',
      whatsappSessionId: 'f309ab7f-8a67-4a88-91ea-4534ca34b254',
    };

    expect(
      leadMatchesSourceFilter(
        ['whatsapp:f309ab7f-8a67-4a88-91ea-4534ca34b254'],
        lead,
      ),
    ).toBe(true);
    expect(leadMatchesSourceFilter([lead.sourceId], lead)).toBe(true);
    expect(leadMatchesSourceFilter(['whatsapp:outra-sessao'], lead)).toBe(false);
  });

  it('TESTE 8: ERRO OBSERVÁVEL - Deve persistir status failed e mensagem de erro ao falhar', async () => {
    const jobId = 'job-error';
    const errorMsg = 'Falha crítica simulada';

    // 1. Mock para load do Job
    mockAdmin.maybeSingle.mockResolvedValueOnce({
      data: { 
        id: jobId, lead_id: 'l1', workspace_id: 'w1', 
        action: { id: 'a1', title: 'Fail', config: { kind: 'mudar-etapa', stageId: 's2' } },
        attempts: 0 
      }
    });

    // 2. Mock para load do Lead
    mockAdmin.maybeSingle.mockResolvedValueOnce({
      data: { id: 'l1', workspace_id: 'w1', pipeline_id: 'p1', stage_id: 's1' }
    });

    // 3. Mock para pipeline_stages (usado no mudar-etapa) - retorna erro aqui
    mockAdmin.maybeSingle.mockResolvedValueOnce({
      data: null, // Faz falhar no "etapa de destino inválida" ou similar
      error: { message: errorMsg }
    });

    // 4. Mock para o update do status do job (finishJob)
    mockAdmin.update.mockReturnValue(mockAdmin);

    const result = await runJobById(mockAdmin, jobId);

    expect(result.ok).toBe(false);
    // Como falhou no stage check, o erro real capturado pelo catch no runJob é o que verificamos
    expect(result.error).toBeDefined();
    
    // Verifica persistência do erro
    expect(mockAdmin.from).toHaveBeenCalledWith('crm_automation_jobs');
    expect(mockAdmin.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      last_error: expect.any(String)
    }));
  });
  it('não inicia SalesBot inativo por automação de etapa', async () => {
    const jobId = 'job-inactive-bot';

    mockAdmin.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: jobId,
          lead_id: 'lead-1',
          workspace_id: 'ws-1',
          action: {
            id: 'run-bot',
            title: 'SalesBot',
            config: { kind: 'salesbot', botId: 'bot-1' },
          },
          attempts: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'lead-1',
          workspace_id: 'ws-1',
          pipeline_id: 'pipe-1',
          stage_id: 'stage-1',
          tags: [],
        },
      })
      .mockResolvedValueOnce({
        data: { id: 'bot-1', is_active: false },
        error: null,
      });

    const result = await runJobById(mockAdmin, jobId);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('SalesBot inativo');
  });

  it('interpreta datetime-local no fuso persistido da conta', () => {
    expect(new Date(parseAutomationDateTime('2026-09-30T20:42', 'Europe/Lisbon')).toISOString())
      .toBe('2026-09-30T19:42:00.000Z');
    expect(new Date(parseAutomationDateTime('2026-09-30T20:42', 'America/Sao_Paulo')).toISOString())
      .toBe('2026-09-30T23:42:00.000Z');
    expect(new Date(parseAutomationDateTime('2026-09-30T20:42:00Z', 'Europe/Lisbon')).toISOString())
      .toBe('2026-09-30T20:42:00.000Z');
  });

  it('agenda SalesBot 24h antes do campo de data/hora da call', () => {
    const callAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const lead = {
      customFields: [{ id: 'call-field', name: 'Data e hora da call', displayValue: callAt }],
    } as any;
    const delay = scheduleDelayMinutes({
      trigger: { kind: 'hours-before-field', hours: 24, fieldId: 'call-field', fieldName: 'Data e hora da call' },
    } as any, lead);
    expect(delay).toBeGreaterThanOrEqual(1438);
    expect(delay).toBeLessThanOrEqual(1442);

    const action = {
      id: 'precall',
      title: 'Pré-call',
      config: { kind: 'salesbot', botId: 'bot-precall' },
      execution: { trigger: { kind: 'hours-before-field', hours: 24, fieldId: 'call-field' } },
    } as any;
    expect(shouldRunForEvent(action, 'field-updated', { fieldId: 'call-field' })).toBe(true);
    expect(shouldRunForEvent(action, 'field-updated', { fieldId: 'other-field' })).toBe(false);
  });

  it('filters tag-added and field-updated triggers by the configured target', () => {
    const base = { id: 'a-filter', title: 'Filtro', channel: 'tags', config: { kind: 'editar-tags', mode: 'add', add: ['ok'] } } as any;
    const tagAction = { ...base, execution: { trigger: { kind: 'tag-added', tags: ['VIP'] } } };
    expect(shouldRunForEvent(tagAction, 'tag-added', { tags: ['vip'] })).toBe(true);
    expect(shouldRunForEvent(tagAction, 'tag-added', { tags: ['frio'] })).toBe(false);

    const fieldAction = { ...base, execution: { trigger: { kind: 'field-updated', fieldId: 'field-a', fieldName: 'Cidade' } } };
    expect(shouldRunForEvent(fieldAction, 'field-updated', { fieldId: 'field-a', fieldName: 'cidade' })).toBe(true);
    expect(shouldRunForEvent(fieldAction, 'field-updated', { fieldId: 'field-b', fieldName: 'Cidade' })).toBe(false);
  });

});
