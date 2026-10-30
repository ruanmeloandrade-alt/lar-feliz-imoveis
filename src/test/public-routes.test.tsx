import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';

vi.mock('@/pages/Index.tsx', () => ({ default: () => <h1>Site publico Vanessa</h1> }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('Retirada do painel antigo', () => {
  it('mantem a pagina publica', () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Site publico Vanessa' })).toBeInTheDocument();
  });

  it.each(['/login'])('nao renderiza a area antiga em %s', route => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState({}, '', route);
    render(<App />);
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.queryByText('Painel Admin')).not.toBeInTheDocument();
  });
});
