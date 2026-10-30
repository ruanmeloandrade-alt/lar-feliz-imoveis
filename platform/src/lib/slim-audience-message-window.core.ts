import { buildContactIdentityIndex, type IdentityContact } from './slim-contact-identity.core.ts';
import { normalizeInternationalPhone, whatsappIdentityFromEvolutionJids } from './whatsapp-identity.ts';

type Db = { from: (table: string) => any };
type Row = Record<string, any>;
const ACTIVITY_FIELDS = 'id,workspace_id,lead_id,type,occurred_at,message_id:payload->>whatsapp_message_id,session_id:payload->>whatsapp_session_id,legacy_session_id:payload->>session_id,remote_jid:payload->>whatsapp_remote_jid';
const WHATSAPP_FIELDS = 'id,workspace_id,message_id,session_id,remote_jid,to_jid,received_at,from_me,delivery_status,message_type';
const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function audienceIsGroup(lead: Row): boolean {
  return lead.source === 'whatsapp_group' || [lead.phone, lead.custom_data?.whatsapp_remote_jid, lead.custom_data?.group_jid]
    .some(value => clean(value).toLowerCase().endsWith('@g.us'));
}

export function audienceSilenceCutoff(days: unknown, now: number): number | null {
  if (days == null) return null;
  if (!Number.isInteger(days) || Number(days) < 1 || Number(days) > 365 || !Number.isFinite(now)) {
    throw new Error('Informe entre 1 e 365 dias sem mensagem.');
  }
  return now - Number(days) * 86400000;
}

async function windowRows(db: Db, ws: string, table: string, cutoff: number): Promise<Row[]> {
  const activity = table === 'lead_activities', date = activity ? 'occurred_at' : 'received_at';
  const rows: Row[] = [], ids = new Set<string>(), started = Date.now();
  while (rows.length <= 100000) {
    const remaining = 10000 - (Date.now() - started);
    if (remaining <= 0) throw new Error('A consulta das mensagens demorou demais. O público não foi calculado.');
    let query = db.from(table).select(activity ? ACTIVITY_FIELDS : WHATSAPP_FIELDS)
      .eq('workspace_id', ws).gte(date, new Date(cutoff).toISOString());
    if (activity) query = query.in('type', ['message_in', 'message_out']);
    const { data, error } = await query.order('id', { ascending: true }).range(rows.length, rows.length + 499)
      .abortSignal(AbortSignal.timeout(Math.min(8000, remaining)));
    if (Date.now() - started >= 10000) throw new Error('A consulta das mensagens demorou demais. O público não foi calculado.');
    if (error || !Array.isArray(data)) throw new Error('Não foi possível conferir as mensagens. O público não foi calculado com histórico parcial.');
    if (!data.length) return rows;
    for (const row of data) {
      const at = Date.parse(row[date]);
      if (!clean(row.id) || ids.has(row.id) || row.workspace_id !== ws || !Number.isFinite(at) || at < cutoff ||
          (activity && !['message_in', 'message_out'].includes(row.type))) {
        throw new Error('O histórico de mensagens está inconsistente. O público não foi calculado.');
      }
      ids.add(row.id); rows.push(row);
    }
  }
  throw new Error('A janela excedeu 100 mil mensagens. Refine o período antes de continuar.');
}

/** Read only the requested time window, without message bodies or complete JSON payloads. */
export async function audienceRecentMessageIds(db: Db, ws: string, leads: IdentityContact[], cutoff: number): Promise<Set<string>> {
  const index = buildContactIdentityIndex(leads, ws), byId = new Map(leads.map(lead => [lead.id, lead]));
  const family = new Map<string, Set<string>>(), canonical = new Map<string, string>();
  for (const lead of leads) {
    if (!lead.merged_into_id && ['deleted', 'merged', 'archived'].includes(lead.status)) continue;
    const id = index.resolve(lead.id), members = family.get(id) ?? new Set<string>();
    members.add(lead.id); family.set(id, members); canonical.set(lead.id, id);
  }
  const contacted = new Set<string>();
  const mark = (id: string) => {
    const root = canonical.get(id);
    if (!root || audienceIsGroup(byId.get(root) ?? {})) return;
    for (const member of family.get(root) ?? []) contacted.add(member);
  };
  const [activities, messages] = await Promise.all([
    windowRows(db, ws, 'lead_activities', cutoff), windowRows(db, ws, 'whatsapp_web_messages', cutoff),
  ]);
  const linkedMessages = new Set<string>();
  for (const activity of activities) {
    const lead = byId.get(activity.lead_id);
    if (!lead || audienceIsGroup(lead) || clean(activity.remote_jid).toLowerCase().endsWith('@g.us')) continue;
    mark(lead.id);
    const session = clean(activity.session_id) || clean(activity.legacy_session_id) || clean(lead.custom_data?.whatsapp_session_id);
    if (session && clean(activity.message_id)) linkedMessages.add(session + '|' + clean(activity.message_id));
  }
  const byPhone = new Map<string, IdentityContact[]>();
  for (const lead of index.rows) {
    if (audienceIsGroup(lead)) continue;
    const phone = normalizeInternationalPhone(lead.phone, { allowTrustedBare: true });
    if (phone.ok) byPhone.set(phone.digits, [...(byPhone.get(phone.digits) ?? []), lead]);
  }
  for (const message of messages) {
    const session = clean(message.session_id), remote = clean(message.remote_jid);
    if (!session || !remote || typeof message.from_me !== 'boolean') throw new Error('Identidade de mensagem incompleta. O público não foi calculado.');
    // Even pending/uncertain outgoing records suppress contact: uncertainty must never encourage a resend.
    const identity = whatsappIdentityFromEvolutionJids(remote, message.to_jid);
    if (identity?.kind === 'group' || remote.endsWith('@broadcast') || remote.startsWith('status@')) continue;
    if (!identity) {
      if (linkedMessages.has(session + '|' + clean(message.message_id))) continue;
      throw new Error('Há uma mensagem recente sem vínculo individual confirmado. Sincronize o Inbox antes de calcular este público.');
    }
    for (const lead of byPhone.get(identity.digits) ?? []) {
      const expectedSession = clean(lead.custom_data?.whatsapp_session_id);
      // Without a stored session, matching recent traffic conservatively prevents an unproven silence classification.
      if (!expectedSession || expectedSession === session) mark(lead.id);
    }
  }
  return contacted;
}
