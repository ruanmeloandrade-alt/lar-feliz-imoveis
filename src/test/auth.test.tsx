import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/api-client';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

type RoleResult = { data: { role: string } | null; error: unknown };
const state = vi.hoisted(() => ({
  callback: null as ((event: string, session: Session | null) => void) | null,
  reads: [] as Array<(result: RoleResult) => void>,
}));

// Deferred transport replies exercise session races without touching production.
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    auth: {
      onAuthStateChange: (callback: typeof state.callback) => {
        state.callback = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => {},
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => new Promise<RoleResult>(resolve => state.reads.push(resolve)),
      };
      return query;
    },
  },
}));

beforeEach(() => { state.callback = null; state.reads = []; });
afterEach(cleanup);
const session = { user: { id: 'test-administrator' } } as Session;

describe('Permissoes da corretora', () => {
  it('aguarda a permissao antes de liberar o painel', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => state.callback?.('SIGNED_IN', session));
    await waitFor(() => expect(state.reads).toHaveLength(1));
    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    act(() => state.reads[0]({ data: { role: 'admin' }, error: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it('ignora uma permissao antiga que chega depois de sair', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => state.callback?.('SIGNED_IN', session));
    await waitFor(() => expect(state.reads).toHaveLength(1));
    act(() => state.callback?.('SIGNED_OUT', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { state.reads[0]({ data: { role: 'admin' }, error: null }); });
    expect(result.current.user).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });
});
