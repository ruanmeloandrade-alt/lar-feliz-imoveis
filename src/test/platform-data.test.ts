import { describe, expect, it } from 'vitest';
import { pages, summarize, whatsappUrl, type PlatformData } from '@/lib/platform-data';

describe('Leituras reais da plataforma', () => {
  it('nao transforma falha de leitura em lista vazia', async () => {
    await expect(pages(async () => ({ data: null, error: { message: 'Sem permissao' } }))).rejects.toThrow('Sem permissao');
  });
  it('busca todas as paginas em vez de truncar o painel', async () => {
    const result = await pages(async start => ({ data: start === 0 ? Array.from({ length: 500 }, (_, i) => i) : [500], error: null }));
    expect(result).toHaveLength(501);
  });
  it('totaliza valores de negociacao, nao renda do cliente', () => {
    const result = summarize({ stages: [{ id: 'open', outcome: 'open' }, { id: 'won', outcome: 'won' }, { id: 'lost', outcome: 'lost' }], deals: [{ stage_id: 'open', value: 100 }, { stage_id: 'won', value: 200 }, { stage_id: 'lost', value: 300 }], tasks: [{ done: false, due_at: '2020-01-01' }, { done: true, due_at: '2020-01-01' }] } as Pick<PlatformData, 'deals' | 'stages' | 'tasks'>);
    expect(result).toEqual({ open: 1, won: 1, openValue: 100, overdue: 1 });
  });
  it('nao inventa um numero quando nao ha telefone', () => {
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl('+55 (19) 99999-1234')).toBe('https://wa.me/5519999991234');
  });
});
