import type { PlatformTables } from './platform-data';
export type User = { id: string; email: string };
export type Session = { user: User };
type ApiError = { code?: string; message: string };
type Result<T> = { data: T | null; error: ApiError | null };
type AuthData = { user: User | null; session: Session | null; setupRequired: boolean };
const listeners = new Set<(event: string, session: Session | null) => void>();
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', headers: { ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) listeners.forEach(fn => fn('SIGNED_OUT', null));
    throw Object.assign(new Error(value.error?.message ?? 'Nao foi possivel concluir a operacao.'), value.error);
  }
  return value as T;
}
class Query<T extends object, Single extends boolean = false> implements PromiseLike<Result<Single extends true ? T : T[]>> {
  private filters: Array<[string, unknown]> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private fields = '*'; private start = 0; private count = 500; private method = 'GET';
  private payload?: Partial<T>; private one = false; private optional = false; private signal?: AbortSignal;
  constructor(private collection: string) {}
  select(fields = '*') { this.fields = fields; return this; }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this; }
  order(field: string, options: { ascending?: boolean } = {}) { this.orders.push({ field, ascending: options.ascending !== false }); return this; }
  range(start: number, end: number) { this.start = start; this.count = end - start + 1; return this; }
  limit(count: number) { this.count = count; return this; }
  insert(payload: Partial<T>) { this.method = 'POST'; this.payload = payload; return this; }
  update(payload: Partial<T>) { this.method = 'PATCH'; this.payload = payload; return this; }
  single() { this.one = true; return this as unknown as Query<T, true>; }
  maybeSingle() { this.one = true; this.optional = true; return this as unknown as Query<T, true>; }
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }
  private async execute(): Promise<Result<Single extends true ? T : T[]>> {
    try {
      const params = new URLSearchParams({ filters: JSON.stringify(this.filters), orders: JSON.stringify(this.orders), select: this.fields, start: String(this.start), limit: String(this.count) });
      const result = await request<Result<T[]>>(`/api/records/${this.collection}?${params}`, { method: this.method, body: this.payload ? JSON.stringify(this.payload) : undefined, signal: this.signal });
      if (this.one) {
        if (result.data?.length !== 1 && !(this.optional && result.data?.length === 0)) return { data: null, error: { message: 'Registro nao confirmado. Atualize a lista antes de repetir.' } };
        return { data: result.data?.[0] ?? null, error: null } as Result<Single extends true ? T : T[]>;
      }
      return result as Result<Single extends true ? T : T[]>;
    } catch (error) { return { data: null, error: { message: (error as Error).message, code: (error as ApiError).code } }; }
  }
  then<A = Result<Single extends true ? T : T[]>, B = never>(fulfilled?: ((value: Result<Single extends true ? T : T[]>) => A | PromiseLike<A>) | null, rejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> { return this.execute().then(fulfilled, rejected); }
}
const announce = (event: string, session: Session | null) => listeners.forEach(fn => fn(event, session));
export const apiClient = {
  from<K extends keyof PlatformTables>(collection: K) { return new Query<PlatformTables[K]>(collection); },
  rpc(name: string, args: Record<string, unknown>) {
    return { abortSignal: async (signal: AbortSignal): Promise<Result<unknown>> => {
      try { return await request(`/api/rpc/${name}`, { method: 'POST', body: JSON.stringify(args), signal }); }
      catch (error) { return { data: null, error: { message: (error as Error).message, code: (error as ApiError).code } }; }
    } };
  },
  auth: {
    async status() { return request<AuthData>('/api/auth/session'); },
    async getSession() { const data = await request<AuthData>('/api/auth/session'); return { data: { session: data.session }, error: null }; },
    onAuthStateChange(fn: (event: string, session: Session | null) => void) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
    async signInWithPassword(credentials: { email: string; password: string }) {
      try { const data = await request<AuthData>('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }); announce('SIGNED_IN', data.session); return { data, error: null }; }
      catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    },
    async setup(credentials: { email: string; password: string; token: string }) { const data = await request<AuthData>('/api/auth/setup', { method: 'POST', body: JSON.stringify(credentials) }); announce('SIGNED_IN', data.session); return data; },
    async signOut() { await request('/api/auth/logout', { method: 'POST' }); announce('SIGNED_OUT', null); },
  },
  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: Blob, options?: { upsert?: boolean; contentType?: string }) {
          try { return await request<Result<{ path: string }>>(`/api/upload/${bucket}?${new URLSearchParams({ path })}`, { method: 'POST', headers: { 'Content-Type': options?.contentType || file.type }, body: file }); }
          catch (error) { return { data: null, error: { message: (error as Error).message } }; }
        },
        async createSignedUrl(path: string, expires: number) {
          try { return await request<Result<{ signedUrl: string }>>('/api/sign', { method: 'POST', body: JSON.stringify({ bucket, path, expires }) }); }
          catch (error) { return { data: null, error: { message: (error as Error).message } }; }
        },
      };
    },
  },
};
