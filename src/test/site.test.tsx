import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';

afterEach(cleanup);

describe('Site público da Vanessa', () => {
  it('preserva a navegacao e o destino do atendimento', async () => {
    render(<Header />);
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Area da corretora' })).not.toBeInTheDocument();
    const onChat = vi.fn();
    window.addEventListener('vanessa:open-chat', onChat);
    fireEvent.click(screen.getByRole('button', { name: 'Começar atendimento' }));
    window.removeEventListener('vanessa:open-chat', onChat);
    expect(onChat).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await waitFor(() => expect(screen.getAllByRole('navigation')).toHaveLength(2));
    expect(document.querySelector('a[href="/login"], a[href="/admin"], a[href="/plataforma"]')).toBeNull();
  });

  it('preserva a imagem da corretora e o acesso a pre-analise', () => {
    const { container } = render(<HeroSection />);
    expect(container.querySelector('img[src*="vanessa"]')).toBeTruthy();
    expect(container.querySelector('a[href="#analise"]')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
