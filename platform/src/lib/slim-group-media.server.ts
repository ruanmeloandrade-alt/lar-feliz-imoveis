import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { assertSlimChatMembership } from './slim-chat-membership.core.ts';
import { assertSlimOperator } from './slim-workspace-operator.server.ts';
import { decodeSlimMedia, SLIM_MEDIA_BYTES } from './slim-media-transport.server.ts';
import { downloadRecoveredEvolutionMedia } from './slim-evolution-media-recovery.server.ts';
import {
  SLIM_GROUP_MEDIA_BUCKET, SLIM_GROUP_MEDIA_ORIGIN,
  assertSlimGroupMediaScope, assertSlimGroupMediaMessage, parseSlimGroupMediaInput,
  slimGroupRecord, slimGroupMediaParts, slimGroupEvolutionMediaKey,
  safeSlimGroupMediaType, slimGroupStoredMediaPath, slimGroupStoragePointer,
  type SlimGroupMediaRow, type SlimGroupMediaScope,
} from './slim-group-media.core.ts';

type Client = { from: (table: string) => any; rpc: (name: string, params: Record<string, unknown>) => any; storage: { from: (bucket: string) => any } };
type Dependencies = {
  recover?: typeof downloadRecoveredEvolutionMedia;
  persistPointer?: (row: SlimGroupMediaRow, scope: SlimGroupMediaScope, pointer: string) => Promise<void>;
  evolutionBaseUrl?: string;
  encryptionKey?: string;
};

function checked<T>(result: { data: T; error: unknown }, message: string): T {
  if (!result || result.error) throw new Error(message);
  return result.data;
}

async function bounded<T>(task: PromiseLike<T>, label: string, ms = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(task), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} demorou demais. Tente abrir o anexo novamente mais tarde.`)), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function activeWorkspace(sb: Client, userId: string): Promise<string> {
  const profile = checked(await sb.from('profiles').select('current_workspace_id').eq('id', userId).maybeSingle(),
    'Não foi possível identificar a empresa ativa.') as { current_workspace_id?: string } | null;
  const workspaceId = profile?.current_workspace_id;
  if (!workspaceId) throw new Error('Empresa ativa não encontrada.');
  await assertSlimChatMembership(sb, workspaceId, userId);
  return workspaceId;
}

async function resolveScope(sb: Client, userId: string, input: { groupId: string; messageId: string }): Promise<SlimGroupMediaScope> {
  const parsed = parseSlimGroupMediaInput(input);
  const workspaceId = await activeWorkspace(sb, userId);
  let query = sb.from('whatsapp_groups').select('id,workspace_id,session_id,group_jid').eq('workspace_id', workspaceId);
  query = parsed.metadataId ? query.eq('id', parsed.metadataId)
    : query.eq('session_id', parsed.sessionId).eq('group_jid', parsed.groupJid);
  const group = checked(await query.maybeSingle(), 'Não foi possível verificar o grupo.') as
    { id: string; workspace_id: string; session_id: string; group_jid: string } | null;
  if ((parsed.metadataId && (!group || group.id !== parsed.metadataId)) ||
      (group && (group.workspace_id !== workspaceId ||
        (!parsed.metadataId && (group.session_id !== parsed.sessionId || group.group_jid !== parsed.groupJid))))) {
    throw new Error('Grupo não encontrado nesta empresa.');
  }
  const scope: SlimGroupMediaScope = {
    workspaceId, metadataId: group?.id ?? null, messageId: parsed.messageId,
    sessionId: group?.session_id ?? parsed.sessionId ?? '', groupJid: group?.group_jid ?? parsed.groupJid ?? '',
  };
  assertSlimGroupMediaScope(scope);
  const session = checked(await sb.from('whatsapp_web_sessions').select('id,workspace_id,provider,metadata')
    .eq('id', scope.sessionId).eq('workspace_id', workspaceId).maybeSingle(),
  'Não foi possível verificar a sessão do grupo.') as { id: string; workspace_id: string; provider: string; metadata: unknown } | null;
  if (!session || session.id !== scope.sessionId || session.workspace_id !== workspaceId || session.provider !== 'evolution' ||
      [true, 'true'].includes(slimGroupRecord(session.metadata).deleted as boolean | string)) {
    throw new Error('A sessão deste grupo não está disponível.');
  }
  return scope;
}

function messageQuery(sb: Pick<Client, 'from'>, scope: SlimGroupMediaScope, columns: string) {
  return sb.from('whatsapp_web_messages').select(columns)
    .eq('id', scope.messageId).eq('workspace_id', scope.workspaceId)
    .eq('session_id', scope.sessionId).eq('remote_jid', scope.groupJid);
}

export function decodeSlimGroupInlineMedia(row: SlimGroupMediaRow): { bytes: Buffer; mimeType: string; extension: string } | null {
  const parts = slimGroupMediaParts(row);
  const candidates = [row.media_url, parts.data.base64, parts.data.mediaBase64,
    parts.message.base64, parts.message.mediaBase64, parts.media.base64, parts.media.mediaBase64];
  for (let index = 0; index < candidates.length; index++) {
    const value = candidates[index];
    if (typeof value !== 'string' || !value.length) continue;
    if (index === 0 && !/^data:/i.test(value)) continue;
    if (value.length > 4 * Math.ceil(SLIM_MEDIA_BYTES / 3) + 2048) throw new Error('Arquivo acima do limite de 16 MB.');
    let encoded = value, mimeType = parts.mimeType;
    if (/^data:/i.test(value)) {
      const match = /^data:([^,\r\n]{1,160});base64,/i.exec(value);
      if (!match) throw new Error('O arquivo salvo está inválido.');
      mimeType = safeSlimGroupMediaType(match[1], parts.kind).mimeType;
      encoded = value.slice(match[0].length);
    }
    encoded = encoded.replace(/\s/g, '');
    if (encoded.length % 4 === 2 || encoded.length % 4 === 3) encoded += '='.repeat(4 - encoded.length % 4);
    return { bytes: decodeSlimMedia(encoded), ...safeSlimGroupMediaType(mimeType, parts.kind) };
  }
  return null;
}

async function signStoredMedia(storage: any, path: string): Promise<string | null> {
  const result: any = await bounded(storage.createSignedUrl(path, 3600), 'A abertura do arquivo');
  if (result?.error) {
    const status = Number(result.error.statusCode ?? result.error.status);
    if (status === 404 || /object not found|not_found|not found/i.test(result.error.message ?? '')) return null;
    throw new Error('Não foi possível autorizar a abertura do arquivo.');
  }
  const signedUrl = result?.data?.signedUrl;
  if (typeof signedUrl !== 'string') throw new Error('O link privado do arquivo não foi criado.');
  try {
    const url = new URL(signedUrl);
    const prefix = `/storage/v1/object/sign/${SLIM_GROUP_MEDIA_BUCKET}/`;
    if (url.origin !== SLIM_GROUP_MEDIA_ORIGIN || url.username || url.password || url.hash ||
        !url.pathname.startsWith(prefix) || decodeURIComponent(url.pathname.slice(prefix.length)) !== path ||
        !url.searchParams.get('token')) throw new Error();
  } catch { throw new Error('O link privado do arquivo está inválido.'); }
  return signedUrl;
}

/**
 * This table grants authenticated SELECT/INSERT, not UPDATE. The only admin
 * operation writes one scalar on the already authorized message. Storage
 * upload/signing and every read continue to use the caller's bearer and RLS.
 */
export async function persistSlimGroupMediaPointer(
  admin: Pick<Client, 'from'>, row: SlimGroupMediaRow, scope: SlimGroupMediaScope, pointer: string,
): Promise<void> {
  assertSlimGroupMediaScope(scope);
  assertSlimGroupMediaMessage(row, scope);
  if (!slimGroupStoredMediaPath({ media_url: pointer, raw: {} }, scope) ||
      !pointer.startsWith(`${SLIM_GROUP_MEDIA_ORIGIN}/storage/v1/object/authenticated/${SLIM_GROUP_MEDIA_BUCKET}/`)) {
    throw new Error('A referência privada do arquivo está inválida.');
  }
  let query = admin.from('whatsapp_web_messages').update({ media_url: pointer })
    .eq('id', scope.messageId).eq('workspace_id', scope.workspaceId)
    .eq('session_id', scope.sessionId).eq('remote_jid', scope.groupJid)
    .eq('message_id', row.message_id).eq('from_me', row.from_me).eq('received_at', row.received_at)
    .eq('message_type', row.message_type);
  if (row.media_url === null) query = query.is('media_url', null);
  else if (/^data:/i.test(row.media_url)) {
    // Never put megabytes of inline base64 into the PostgREST request URL.
    // A concurrent recovery's private pointer no longer matches this condition.
    query = query.ilike('media_url', 'data:%');
  } else {
    if (row.media_url.length > 1800) throw new Error('A referência salva do arquivo está inválida.');
    query = query.eq('media_url', row.media_url);
  }
  const result = checked(await bounded(query.select('id').maybeSingle(), 'O registro do anexo'),
    'Não foi possível registrar o arquivo recuperado.') as { id?: string } | null;
  if (result?.id !== scope.messageId) throw new Error('A mensagem mudou durante a recuperação. Abra o anexo novamente.');
}

export async function loadSlimGroupMediaServer(
  sb: Client, userId: string, input: { groupId: string; messageId: string }, deps: Dependencies = {},
): Promise<{ mediaUrl: string; mimeType: string | null }> {
  const scope = await resolveScope(sb, userId, input);
  const row = checked(await messageQuery(sb, scope,
    'id,workspace_id,session_id,remote_jid,message_id,from_me,message_type,media_url,delivery_status,received_at,raw')
    .maybeSingle(), 'Não foi possível carregar o anexo desta mensagem.') as SlimGroupMediaRow | null;
  assertSlimGroupMediaMessage(row, scope);
  const message = row!;
  const parts = slimGroupMediaParts(message);
  const storage = sb.storage.from(SLIM_GROUP_MEDIA_BUCKET);
  const existingPath = slimGroupStoredMediaPath(message, scope);
  if (existingPath) {
    const mediaUrl = await signStoredMedia(storage, existingPath);
    if (mediaUrl) return { mediaUrl, mimeType: parts.mimeType };
  }

  await assertSlimOperator(sb, scope.workspaceId, userId);
  let recovered = decodeSlimGroupInlineMedia(message);
  if (!recovered) {
    const key = slimGroupEvolutionMediaKey(message);
    const encryptionKey = deps.encryptionKey ?? process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error('A configuração segura do WhatsApp está indisponível.');
    const credentials = checked(await bounded(sb.rpc('get_evolution_credentials', {
      _session_id: scope.sessionId, _key: encryptionKey,
    }), 'A consulta da sessão'), 'Não foi possível autorizar a recuperação pelo WhatsApp.') as
      { workspace_id?: string; instance_name?: string; api_key?: string } | null;
    if (!credentials || credentials.workspace_id !== scope.workspaceId ||
        !credentials.instance_name || !credentials.api_key) throw new Error('A sessão do WhatsApp não está disponível.');
    const base = (deps.evolutionBaseUrl ?? process.env.EVOLUTION_BASE_URL ?? '').replace(/\/+$/, '');
    try {
      const url = new URL(base);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch { throw new Error('A conexão do WhatsApp não está configurada.'); }
    const result = await (deps.recover ?? downloadRecoveredEvolutionMedia)({
      url: `${base}/chat/getBase64FromMediaMessage/${encodeURIComponent(credentials.instance_name)}`,
      apiKey: credentials.api_key, key, declaredMimeType: parts.mimeType, messageType: parts.kind,
    });
    recovered = { bytes: result.bytes, ...safeSlimGroupMediaType(result.mimeType, parts.kind) };
  }
  if (!recovered.bytes.length || recovered.bytes.length > SLIM_MEDIA_BYTES) throw new Error('Arquivo inválido ou acima do limite de 16 MB.');

  // Revalidate access after the potentially slow external read, before writes.
  if (await activeWorkspace(sb, userId) !== scope.workspaceId) throw new Error('A empresa ativa mudou. Abra o anexo novamente.');
  await assertSlimOperator(sb, scope.workspaceId, userId);
  const latest = checked(await messageQuery(sb, scope,
    'id,workspace_id,session_id,remote_jid,message_id,from_me,message_type,received_at,delivery_status,' +
    'deleted:raw->>deleted,deleted_for_me:raw->>deleted_for_me,deleted_for_all:raw->>deleted_for_all,revoked:raw->>revoked,' +
    'data_deleted:raw->data->>deleted,data_deleted_for_me:raw->data->>deleted_for_me,data_deleted_for_all:raw->data->>deleted_for_all,data_revoked:raw->data->>revoked,' +
    'media_deleted:raw->slim_media->>deleted,media_deleted_for_me:raw->slim_media->>deleted_for_me,media_deleted_for_all:raw->slim_media->>deleted_for_all,media_revoked:raw->slim_media->>revoked')
    .maybeSingle(), 'Não foi possível reverificar a mensagem.') as any;
  if (!latest || ['deleted', 'deleted_for_me', 'deleted_for_all', 'revoked', 'data_deleted', 'data_deleted_for_me', 'data_deleted_for_all',
    'data_revoked', 'media_deleted', 'media_deleted_for_me', 'media_deleted_for_all', 'media_revoked']
    .some(key => latest[key] === true || latest[key] === 'true')) throw new Error('Esta mensagem foi apagada ou não está mais disponível.');
  assertSlimGroupMediaMessage({ ...latest, media_url: null, raw: {} }, scope);
  if (latest.message_id !== message.message_id || latest.from_me !== message.from_me ||
      latest.received_at !== message.received_at || latest.message_type !== message.message_type) {
    throw new Error('A mensagem mudou durante a recuperação. Abra o anexo novamente.');
  }
  const digest = createHash('sha256').update(recovered.bytes).digest('hex');
  const path = `${scope.workspaceId}/groups/${scope.sessionId}/${scope.groupJid}/${scope.messageId}/${digest}.${recovered.extension}`;
  const upload: any = await bounded(storage.upload(path, recovered.bytes, {
    contentType: recovered.mimeType, upsert: false,
  }), 'O armazenamento do arquivo');
  if (upload?.error && Number(upload.error.statusCode ?? upload.error.status) !== 409 &&
      !/already exists|duplicate/i.test(upload.error.message ?? '')) throw new Error('Não foi possível guardar o anexo recuperado.');
  const pointer = slimGroupStoragePointer(path, scope);
  if (deps.persistPointer) await deps.persistPointer(message, scope, pointer);
  else {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await persistSlimGroupMediaPointer(supabaseAdmin, message, scope, pointer);
  }
  const mediaUrl = await signStoredMedia(storage, path);
  if (!mediaUrl) throw new Error('O arquivo recuperado ainda não está disponível. Abra o anexo novamente.');
  return { mediaUrl, mimeType: recovered.mimeType };
}
