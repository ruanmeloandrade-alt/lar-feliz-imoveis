import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Platform from '@/pages/Platform';

const state = vi.hoisted(() => ({ loading: false, admin: false, signedIn: false, read: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.signedIn ? { id: 'test-user', email: 'qa@example.invalid' } : null, isAdmin: state.admin, loading: state.loading, signOut: vi.fn() }) }));
vi.mock('@/lib/platform-data', async importOriginal => ({ ...await importOriginal<object>(), loadPlatform: () => state.read() }));
function renderPage(path = '/plataforma') {
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Platform /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => { state.loading = false; state.admin = false; state.signedIn = false; state.read.mockReset(); });
afterEach(cleanup);
describe('Acesso a plataforma imobiliaria', () => {
  it('mostra login sem ler os cadastros privados', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(state.read).not.toHaveBeenCalled();
  });
  it('nao busca dados enquanto a permissao esta carregando', () => {
    state.loading = true; state.signedIn = true;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando acesso');
    expect(state.read).not.toHaveBeenCalled();
  });
  it('recusa usuario autenticado sem papel de administrador', () => {
    state.signedIn = true;
    renderPage();
    expect(screen.getByText(/nao possui acesso/)).toBeInTheDocument();
    expect(state.read).not.toHaveBeenCalled();
  });
  it('mostra falha real e nunca metricas zeradas no lugar de erro', async () => {
    state.signedIn = true; state.admin = true;
    state.read.mockRejectedValue(new Error('Falha de permissao de teste'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Falha de permissao de teste'), { timeout: 4000 });
    expect(screen.queryByText('Valor em negociacao')).not.toBeInTheDocument();
  });
});
