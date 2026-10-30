import { assertSlimOperator } from './slim-workspace-operator.server.ts';
import { boundedMediaRequest, mediaPreparation } from './slim-media-transport.server.ts';
import {
  conversationKey, directWhatsappJidFromCanonicalDigits,
  normalizeInternationalPhone, whatsappIdentityFromJid,
} from './whatsapp-identity.ts';

type Context = { supabase: any; userId: string };
export type SlimCopilotTextTarget = {
  leadId: string; text: string; sessionId: string; remoteJid: string;
  number: string; conversationKey: string; leadPhone: string;
};
export type SlimCopilotTextClaim = SlimCopilotTextTarget & {
  fresh: true; proposalId: string; workspaceId: string; actorId: string;
  version: string; claimToken: string;
};
export type SlimCopilotTextOutcome = {
  status: 'succeeded' | 'failed' | 'uncertain' | 'stale';
  result: { summary: string; receiptId?: string; historyPending?: boolean; code?: string };
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTING_FIELDS = 'id,occurred_at,remote_jid:payload->>whatsapp_remote_jid,session_id:payload->>whatsapp_session_id,legacy_session_id:payload->>session_id,message_id:payload->>whatsapp_message_id';
const forbidden = (row: any) => !row || row.merged_into_id ||
  ['archived', 'deleted', 'merged'].includes(row.status) ||
  ['opt_out', 'do_not_contact', 'whatsapp_opt_out', 'is_group'].some(key =>
    row.custom_data?.[key] === true || row.custom_data?.[key] === 'true');

async function read<T = any>(query: PromiseLike<any>, label: string): Promise<T> {
  const result = await mediaPreparation(query, label, 8_000);
  if (result?.error) throw new Error(label);
  return result?.data as T;
}

async function scope(context: Context, workspaceId: string) {
  if (!UUID.test(workspaceId) || !UUID.test(context.userId)) throw new Error('Empresa ou operador inválido.');
  // Deliberately no workspace resolver: its fallback can write profiles/memberships.
  const profile = await read(context.supabase.from('profiles').select('current_workspace_id')
    .eq('id', context.userId).maybeSingle(), 'Não foi possível conferir a empresa ativa.');
  if (profile?.current_workspace_id !== workspaceId) throw new Error('A empresa ativa mudou. Reabra o Copiloto.');
  await mediaPreparation(assertSlimOperator(context.supabase, workspaceId, context.userId), 'Permissão do operador', 8_000);
}

/** Prepare a single exact recipient. Reads scalar routing leaves, never media payloads. */
export async function prepareSlimCopilotTextTarget(
  context: Context,
  input: { workspaceId: string; leadId: string; text: string; sessionId?: string },
): Promise<SlimCopilotTextTarget> {
  if (!UUID.test(input.leadId) || (input.sessionId && !UUID.test(input.sessionId))) throw new Error('Conversa ou sessão inválida.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.text)) {
    throw new Error('Informe uma mensagem de texto com até 4.000 caracteres.');
  }
  await scope(context, input.workspaceId);
  const db = context.supabase;
  const lead = await read(db.from('leads').select('id,phone,phone_normalized,status,merged_into_id,custom_data')
    .eq('workspace_id', input.workspaceId).eq('id', input.leadId).maybeSingle(), 'Não foi possível conferir o destinatário.');
  if (forbidden(lead)) throw new Error('Contato indisponível ou com bloqueio de contato.');
  const knownPhone = normalizeInternationalPhone(lead.phone, { allowTrustedBare: true });
  if (!knownPhone.ok) throw new Error('O cliente precisa de um telefone internacional válido.');
  const rows: any[] = await read(db.from('lead_activities').select(ROUTING_FIELDS)
    .eq('workspace_id', input.workspaceId).eq('lead_id', input.leadId)
    .in('type', ['message_in', 'message_out']).order('occurred_at', { ascending: false }).limit(80),
  'Não foi possível conferir a identidade da conversa.');
  let route: { remoteJid: string; sessionId: string | null } | null = null;
  for (const row of rows ?? []) {
    if (!row.remote_jid) continue;
    const identity = whatsappIdentityFromJid(row.remote_jid);
    if (!identity || identity.kind !== 'direct' || identity.digits !== knownPhone.digits) {
      throw new Error('A identidade da conversa não corresponde ao telefone do cliente. Confira o Inbox.');
    }
    route = { remoteJid: identity.remoteJid, sessionId: row.session_id || row.legacy_session_id || null };
    break;
  }
  if (!route) {
    const messageIds = [...new Set((rows ?? []).map(row => row.message_id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256))];
    if (messageIds.length) {
      const messages: any[] = await read(db.from('whatsapp_web_messages')
        .select('message_id,remote_jid,to_jid,session_id,received_at').eq('workspace_id', input.workspaceId)
        .in('message_id', messageIds).order('received_at', { ascending: false }).limit(80), 'Não foi possível conferir a sessão original.');
      for (const message of messages ?? []) {
        const identity = whatsappIdentityFromJid(message.remote_jid) ?? whatsappIdentityFromJid(message.to_jid);
        if (identity?.kind === 'direct' && identity.digits === knownPhone.digits) {
          route = { remoteJid: identity.remoteJid, sessionId: message.session_id || null };
          break;
        }
      }
    }
  }
  if (!route) {
    const explicit = normalizeInternationalPhone(lead.phone);
    const normalized = normalizeInternationalPhone(lead.phone_normalized, { allowTrustedBare: true });
    if (!explicit.ok && (!normalized.ok || normalized.digits !== knownPhone.digits)) {
      throw new Error('Confirme o telefone com DDI no cliente antes do primeiro envio.');
    }
  }
  const preferred = typeof lead.custom_data?.whatsapp_session_id === 'string'
    ? lead.custom_data.whatsapp_session_id.trim() : null;
  const boundSession = route?.sessionId || preferred || null;
  if (input.sessionId && boundSession && input.sessionId !== boundSession) {
    throw new Error('Esta proposta precisa usar a sessão original da conversa.');
  }
  const sessions: any[] = await read(db.from('whatsapp_web_sessions').select('id,status,metadata')
    .eq('workspace_id', input.workspaceId).eq('provider', 'evolution').eq('status', 'conectado')
    .order('last_connected_at', { ascending: false }).limit(100), 'Não foi possível conferir os canais conectados.');
  const eligible = (sessions ?? []).filter(session => session.metadata?.deleted !== true && session.metadata?.deleted !== 'true');
  const requested = boundSession || input.sessionId || (eligible.length === 1 ? eligible[0].id : null);
  if (!requested || !UUID.test(requested) || !eligible.some(session => session.id === requested)) {
    throw new Error('Vincule uma sessão WhatsApp conectada à conversa antes de preparar o envio.');
  }
  const jid = directWhatsappJidFromCanonicalDigits(knownPhone.digits);
  if (!jid) throw new Error('Destinatário inválido.');
  return { leadId: lead.id, text: input.text, sessionId: requested, remoteJid: jid,
    number: knownPhone.digits, conversationKey: conversationKey(requested, jid), leadPhone: String(lead.phone) };
}

function outcome(status: SlimCopilotTextOutcome['status'], summary: string, code: string): SlimCopilotTextOutcome {
  return { status, result: { summary, code } };
}

async function recordConfirmedText(context: Context, claim: SlimCopilotTextClaim, messageId: string) {
  const db = context.supabase, at = new Date().toISOString();
  let historyPending = false;
  const message = { id: claim.proposalId, workspace_id: claim.workspaceId, session_id: claim.sessionId,
    remote_jid: claim.remoteJid, to_jid: claim.remoteJid, message_id: messageId, from_me: true,
    message_type: 'text', body: claim.text, delivery_status: 'sent', received_at: at,
    raw: { source: 'slim_copilot_approved', proposal_id: claim.proposalId, actor_user_id: claim.actorId } };
  try {
    const saved = await mediaPreparation(db.from('whatsapp_web_messages').insert(message).select('id').maybeSingle(), 'Histórico WhatsApp', 8_000);
    if (saved.error || !saved.data?.id) {
      // A provider webhook may have recorded the same receipt first; verify its exact scope.
      const existing = await read(db.from('whatsapp_web_messages').select('id,remote_jid,from_me,body')
        .eq('workspace_id', claim.workspaceId).eq('session_id', claim.sessionId).eq('message_id', messageId)
        .limit(1).maybeSingle(), 'Recibo WhatsApp indisponível.');
      if (!existing || existing.remote_jid !== claim.remoteJid || existing.from_me !== true || existing.body !== claim.text) historyPending = true;
    }
  } catch { historyPending = true; }
  try {
    const payload = { text: claim.text, source: 'slim_copilot_approved', actor_user_id: claim.actorId,
      proposal_id: claim.proposalId, whatsapp_message_id: messageId, whatsapp_session_id: claim.sessionId,
      whatsapp_remote_jid: claim.remoteJid, conversation_key: claim.conversationKey };
    const saved = await mediaPreparation(db.from('lead_activities').insert({ id: claim.proposalId,
      workspace_id: claim.workspaceId, lead_id: claim.leadId, type: 'message_out', payload, occurred_at: at })
      .select('id').maybeSingle(), 'Histórico do cliente', 8_000);
    if (saved.error || !saved.data?.id) {
      const existing = await read(db.from('lead_activities')
        .select('id,message_id:payload->>whatsapp_message_id,proposal_id:payload->>proposal_id')
        .eq('id', claim.proposalId).eq('workspace_id', claim.workspaceId).eq('lead_id', claim.leadId).maybeSingle(),
      'Recibo do cliente indisponível.');
      if (existing?.message_id !== messageId || existing?.proposal_id !== claim.proposalId) historyPending = true;
    }
  } catch { historyPending = true; }
  return historyPending;
}

/** Only called for the fresh durable claim returned to the server by the approval RPC. */
export async function executeSlimCopilotTextClaim(
  context: Context, claim: SlimCopilotTextClaim,
  options: { fetcher?: typeof fetch; timeoutMs?: number; maxBodyBytes?: number; signal?: AbortSignal } = {},
): Promise<SlimCopilotTextOutcome> {
  if (claim?.fresh !== true || !UUID.test(claim.proposalId) || !UUID.test(claim.claimToken) ||
    !UUID.test(claim.version) || claim.actorId !== context.userId) {
    return outcome('failed', 'A aprovação não possui uma reserva válida de envio.', 'INVALID_CLAIM');
  }
  let target: SlimCopilotTextTarget;
  try {
    target = await prepareSlimCopilotTextTarget(context, { workspaceId: claim.workspaceId,
      leadId: claim.leadId, text: claim.text, sessionId: claim.sessionId });
  } catch {
    return outcome('stale', 'Não foi possível reconfirmar o destinatário, a sessão ou a permissão. Nenhum envio foi iniciado; prepare uma nova proposta.', 'TARGET_CHANGED');
  }
  if (['leadId', 'text', 'sessionId', 'remoteJid', 'number', 'conversationKey', 'leadPhone']
    .some(key => target[key as keyof SlimCopilotTextTarget] !== claim[key as keyof SlimCopilotTextTarget])) {
    return outcome('stale', 'O destino mudou após a proposta. Nenhum envio foi iniciado.', 'TARGET_CHANGED');
  }
  let credentials: any, endpoint: string;
  try {
    const key = process.env.INTEGRATION_ENCRYPTION_KEY;
    const base = process.env.EVOLUTION_BASE_URL;
    if (!key || !base) throw new Error('Canal não configurado.');
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Canal inválido.');
    credentials = await read(context.supabase.rpc('get_evolution_credentials', { _session_id: claim.sessionId, _key: key }), 'Credencial do canal indisponível.');
    if (credentials?.workspace_id !== claim.workspaceId || credentials?.status !== 'conectado' ||
      typeof credentials?.instance_name !== 'string' || !credentials.instance_name.trim() ||
      typeof credentials?.api_key !== 'string' || !credentials.api_key) throw new Error('Canal indisponível.');
    endpoint = `${base.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(credentials.instance_name)}`;
  } catch {
    return outcome('failed', 'Não foi possível acessar o canal aprovado. Nenhum envio foi iniciado.', 'CHANNEL_UNAVAILABLE');
  }
  if (options.signal?.aborted) return outcome('failed', 'A solicitação foi encerrada antes do envio.', 'CANCELLED_BEFORE_SEND');
  let response: Response, body: any;
  try {
    ({ response, body } = await boundedMediaRequest({ url: endpoint, apiKey: credentials.api_key,
      payload: { number: claim.number, text: claim.text } },
    { fetcher: (url, request) => (options.fetcher ?? fetch)(url, { ...request, redirect: 'error' }),
      timeoutMs: options.timeoutMs ?? 25_000, maxBodyBytes: options.maxBodyBytes ?? 64 * 1024 }));
  } catch {
    return outcome('uncertain', 'A resposta do WhatsApp não foi confirmada. Confira a conversa; esta proposta não será reenviada.', 'PROVIDER_UNCERTAIN');
  }
  if (!response.ok) {
    if ([400, 401, 403, 404, 405, 413, 415, 422].includes(response.status)) {
      return outcome('failed', 'O WhatsApp recusou a solicitação. Esta proposta não será reenviada.', 'PROVIDER_REJECTED');
    }
    return outcome('uncertain', 'O canal não confirmou o resultado. Confira a conversa antes de preparar outro envio.', 'PROVIDER_UNCERTAIN');
  }
  const id = body?.key?.id;
  const returnedJid = body?.key?.remoteJid;
  if (typeof id !== 'string' || !id.trim() || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id) ||
    body?.key?.fromMe === false || (returnedJid && whatsappIdentityFromJid(returnedJid)?.number !== claim.number)) {
    return outcome('uncertain', 'O canal respondeu sem um identificador válido para o destinatário aprovado. Confira a conversa.', 'RECEIPT_UNCONFIRMED');
  }
  const historyPending = await recordConfirmedText(context, claim, id);
  return { status: 'succeeded', result: { receiptId: id, historyPending,
    summary: historyPending
      ? 'WhatsApp confirmou o envio; a gravação completa no histórico está pendente. Não reenvie.'
      : 'WhatsApp confirmou o envio e a mensagem foi registrada no histórico.' } };
}
