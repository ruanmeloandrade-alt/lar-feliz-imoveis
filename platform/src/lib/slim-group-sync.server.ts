import { authorizeSlimGroupCatalog, readSlimGroupCatalog, recoverSlimGroupCatalog, slimGroupCatalogQuery, withSlimGroupCatalogRequest, type SlimGroupCatalogDb } from './slim-group-catalog.server.ts';

type Obj = Record<string, unknown>;
type ProviderGroup = { id: string; name?: string; description?: string; pictureUrl?: string; count?: number; participants?: { id: string; admin: boolean }[]; announce?: boolean };
const GROUP_JID = /^[0-9-]{1,100}@g\.us$/;
const record = (v: unknown): Obj | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null;
function stringField(row: Obj, keys: string[], max = 200): string | undefined {
  for (const key of keys) if (typeof row[key] === 'string' && row[key].trim()) return row[key].trim().slice(0, max);
  return undefined;
}
function normalizeGroup(value: unknown): ProviderGroup | null {
  const row = record(value); if (!row) return null;
  const id = stringField(row, ['id', 'groupJid', 'jid', 'remoteJid', 'remote_jid']);
  if (!id || !GROUP_JID.test(id)) return null;
  const members = row.participants ?? row.members;
  const participants = Array.isArray(members) ? members.flatMap(value => {
    const member = record(value); if (!member) return [];
    const jid = stringField(member, ['id', 'jid', 'participant', 'phone', 'number']);
    if (!jid) return [];
    const role = String(member.admin ?? member.role ?? member.type ?? '').toLowerCase();
    return [{ id: jid, admin: ['admin', 'superadmin', 'owner', 'true'].includes(role) || member.isAdmin === true || member.isSuperAdmin === true || member.owner === true }];
  }) : undefined;
  const size = row.size ?? row.participantsCount ?? row.participantCount ?? row.participants_count;
  const count = (typeof size === 'number' || (typeof size === 'string' && /^\d+$/.test(size))) && Number.isSafeInteger(Number(size)) && Number(size) >= 0 && Number(size) <= 10_000_000 ? Number(size) : undefined;
  const picture = stringField(row, ['pictureUrl', 'profilePictureUrl', 'picture_url'], 3000);
  return { id, name: stringField(row, ['subject', 'name', 'title'], 200), description: stringField(row, ['desc', 'description'], 4000),
    pictureUrl: picture && /^https:\/\//i.test(picture) ? picture : undefined, count, participants, announce: typeof row.announce === 'boolean' ? row.announce : undefined };
}

/** Known collection envelopes only: an unrelated empty members array is not an empty group list. */
export function extractSlimEvolutionGroups(input: unknown, depth = 0): ProviderGroup[] {
  if (depth > 6) throw new Error('Formato da lista de grupos não reconhecido.');
  if (Array.isArray(input)) {
    if (input.length > 2000) throw new Error('A lista de grupos excedeu o limite de atualização.');
    const groups = input.map(normalizeGroup);
    if (groups.some(group => !group)) throw new Error('A resposta não contém uma lista completa de grupos válidos.');
    return [...new Map((groups as ProviderGroup[]).map(group => [group.id, group])).values()];
  }
  const row = record(input);
  if (row) {
    const single = normalizeGroup(row); if (single) return [single];
    for (const key of ['groups', 'data', 'response', 'result', 'items']) {
      if (row[key] != null) return extractSlimEvolutionGroups(row[key], depth + 1);
    }
  }
  throw new Error('Formato da lista de grupos não reconhecido.');
}

/** Single read-only request, bounded headers and stream, no retries or redirects. */
export async function fetchSlimEvolutionGroups(url: string, apiKey: string, signal: AbortSignal, options: { fetcher?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {}): Promise<ProviderGroup[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const limit = options.maxBytes ?? 2 * 1024 * 1024;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('O WhatsApp demorou a responder à atualização dos grupos.')); }, options.timeoutMs ?? 18_000);
  });
  const read = async () => {
    if (controller.signal.aborted) throw new Error('Consulta de grupos cancelada.');
    const response = await (options.fetcher ?? fetch)(url, { method: 'GET', headers: { apikey: apiKey, Accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > limit) {
      void response.body?.cancel().catch(() => {}); throw new Error('A atualização dos grupos pelo WhatsApp não foi confirmada.');
    }
    const chunks: Uint8Array[] = []; let size = 0;
    if (response.body) {
      reader = response.body.getReader();
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit || controller.signal.aborted) { controller.abort(); throw new Error('A resposta de grupos excedeu o limite da consulta.'); }
        chunks.push(chunk.value);
      }
    }
    if (controller.signal.aborted) throw new Error('Consulta de grupos cancelada.');
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return extractSlimEvolutionGroups(JSON.parse(new TextDecoder().decode(bytes)));
  };
  try { return await Promise.race([read(), deadline]); }
  finally { if (timer) clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}

export function slimGroupMetadataRows(groups: ProviderGroup[], previous: any[], workspaceId: string, sessionId: string, ownPhone: string, now: string): Record<string, unknown>[] {
  const saved = new Map(previous.map(row => [row.group_jid, row]));
  const digits = (value: string) => value.split('@')[0].split(':')[0].replace(/\D/g, '');
  const own = digits(ownPhone);
  return groups.map(group => {
    const old = saved.get(group.id);
    return { workspace_id: workspaceId, session_id: sessionId, group_jid: group.id,
      name: group.name ?? old?.name ?? `Grupo WhatsApp ${group.id.split('@')[0].slice(-6)}`,
      subject: group.name ?? old?.subject ?? null,
      description: group.description ?? old?.description ?? null,
      picture_url: group.pictureUrl ?? old?.picture_url ?? null,
      participants_count: group.count ?? group.participants?.length ?? old?.participants_count ?? 0,
      is_admin: own.length >= 8 && !!group.participants?.some(member => member.admin && digits(member.id) === own),
      is_announce: group.announce ?? old?.is_announce ?? false,
      last_synced_at: now, updated_at: now };
  });
}

type SyncOptions = { env?: Record<string, string | undefined>; fetcher?: typeof fetch; providerTimeoutMs?: number; timeoutMs?: number };
export async function syncSlimSessionGroups(db: SlimGroupCatalogDb, data: { workspaceId: string; sessionId: string }, userId: string, options: SyncOptions = {}) {
  return withSlimGroupCatalogRequest(async signal => {
    await authorizeSlimGroupCatalog(db, data.workspaceId, userId, signal, true);
    const session = await slimGroupCatalogQuery(db.from('whatsapp_web_sessions').select('id,workspace_id,phone_number,status,provider').eq('id', data.sessionId).eq('workspace_id', data.workspaceId).maybeSingle(), signal);
    if (session.error || session.data?.id !== data.sessionId || session.data.workspace_id !== data.workspaceId || session.data.provider !== 'evolution') throw new Error('A sessão de WhatsApp não pertence à empresa selecionada.');
    const discovery = await recoverSlimGroupCatalog(db, data.workspaceId, data.sessionId, signal);
    const previous = await readSlimGroupCatalog(db, data.workspaceId, data.sessionId, signal);
    const fallback = (message: string) => {
      if (signal.aborted || !previous.length) throw new Error(message);
      return { synced: 0, recovered: discovery.recovered, total: previous.length, adminGroups: 0, identityResolved: false, provider: 'history' as const, warning: message };
    };
    if (!['conectado', 'connected', 'open'].includes(String(session.data.status).toLowerCase())) return fallback('O histórico está disponível para configurar regras. Conecte esta sessão para atualizar os detalhes pelo WhatsApp.');
    const env = options.env ?? process.env;
    let groups: ProviderGroup[];
    try {
      if (!env.INTEGRATION_ENCRYPTION_KEY || !env.EVOLUTION_BASE_URL) throw new Error('Integração indisponível.');
      const credentials = await slimGroupCatalogQuery(db.rpc('get_evolution_credentials', { _session_id: data.sessionId, _key: env.INTEGRATION_ENCRYPTION_KEY }), signal);
      const creds = credentials.data;
      if (credentials.error || creds?.workspace_id !== data.workspaceId || !creds.instance_name || !creds.api_key) throw new Error('Sessão não confirmada.');
      const base = new URL(env.EVOLUTION_BASE_URL);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Integração inválida.');
      const url = `${base.href.replace(/\/+$/, '')}/group/fetchAllGroups/${encodeURIComponent(creds.instance_name)}?getParticipants=true`;
      groups = await fetchSlimEvolutionGroups(url, creds.api_key, signal, { fetcher: options.fetcher, timeoutMs: options.providerTimeoutMs });
    } catch {
      return fallback('Os grupos do histórico estão disponíveis. A atualização dos nomes e participantes pelo WhatsApp não foi concluída; tente Sincronizar novamente.');
    }
    const rows = slimGroupMetadataRows(groups, previous, data.workspaceId, data.sessionId, String(session.data.phone_number ?? ''), new Date().toISOString());
    if (rows.length) {
      // Every row has the same metadata keys. Rules, bot assignments and identity are preserved.
      const saved = await slimGroupCatalogQuery(db.from('whatsapp_groups').upsert(rows, { onConflict: 'session_id,group_jid' }), signal);
      if (saved.error) return fallback('O WhatsApp respondeu, mas a atualização do cadastro não foi confirmada. Os grupos anteriores continuam disponíveis; consulte a lista antes de repetir.');
    }
    const total = new Set([...previous.map(row => row.group_jid), ...groups.map(group => group.id)]).size;
    return { synced: rows.length, recovered: discovery.recovered, total, adminGroups: rows.filter(row => row.is_admin).length,
      identityResolved: String(session.data.phone_number ?? '').replace(/\D/g, '').length >= 8, provider: 'evolution' as const,
      ...(rows.length === 0 && previous.length ? { warning: 'O WhatsApp retornou uma lista vazia. Os grupos já conhecidos continuam disponíveis pelo histórico.' } : {}) };
  }, options.timeoutMs ?? 30_000);
}
