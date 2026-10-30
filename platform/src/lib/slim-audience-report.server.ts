import { audienceCampaignReport, audienceRecipientReport, audienceReportDate, audienceReportTimestamp, audienceReportTotals, sumAudienceReportTotals, type AudienceCampaignRow, type AudienceDeliveryRow, type AudienceReportCursor, type AudienceReportDetail, type AudienceReportFilters, type AudienceReportPage, type AudienceReportScope, type DeliveryState } from './slim-audience-report.core.ts';
export const AUDIENCE_CAMPAIGN_COLUMNS = 'id,workspace_id,audience_id,audience_name,kind,status,created_at,finished_at,created_by,session_id,agent_id,salesbot_id,delay_ms,delay_seconds';
export const AUDIENCE_DELIVERY_COLUMNS = 'id,workspace_id,campaign_id,lead_id,name,phone,status,message_id,last_error,created_at,started_at,finished_at';
const SUMMARY_COLUMNS = 'id,workspace_id,campaign_id,status,message_id,last_error';
type Db = { from: (table: string) => any };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function withAudienceReportRead<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([run(controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('A consulta demorou além do limite. Atualize o relatório.')); }, timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
async function read(query: any, signal: AbortSignal, label: string): Promise<any> {
  if (signal.aborted) throw new Error('A consulta do relatório foi interrompida.');
  let result; try { result = await query.abortSignal(signal); } catch { throw new Error(`Não foi possível consultar ${label}. Nenhum total parcial foi apresentado.`); }
  if (signal.aborted || result?.error) throw new Error(`Não foi possível consultar ${label}. Nenhum total parcial foi apresentado.`);
  return result;
}
export async function readAudienceReportScope(db: Db, actorId: string, signal: AbortSignal, expected?: AudienceReportScope): Promise<AudienceReportScope> {
  if (!uuid.test(actorId) || (expected && expected.actorId !== actorId)) throw new Error('A sessão mudou. Reabra Públicos.');
  const profile = await read(db.from('profiles').select('current_workspace_id').eq('id', actorId).maybeSingle(), signal, 'a empresa ativa');
  const workspaceId = profile.data?.current_workspace_id;
  if (typeof workspaceId !== 'string' || !uuid.test(workspaceId) || (expected && expected.workspaceId !== workspaceId)) throw new Error('A empresa ativa mudou. Reabra Públicos.');
  const [owner, member] = await Promise.all([
    read(db.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle(), signal, 'a permissão'),
    read(db.from('workspace_members').select('user_id,access_expires_at').eq('workspace_id', workspaceId).eq('user_id', actorId).maybeSingle(), signal, 'a permissão'),
  ]);
  const expires = member.data?.access_expires_at;
  if (owner.data?.owner_id !== actorId && !(member.data?.user_id === actorId && (!expires || Date.parse(expires) > Date.now()))) throw new Error('Sem acesso ao relatório desta empresa.');
  return { workspaceId, actorId };
}
function campaignFilters(query: any, filters: AudienceReportFilters) {
  if (filters.audienceId) query = query.eq('audience_id', filters.audienceId);
  else if (filters.deletedAudience) query = query.is('audience_id', null);
  if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('created_at', audienceReportDate(filters.from));
  if (filters.to) query = query.lt('created_at', audienceReportDate(filters.to, true));
  return query;
}
async function deliveries(db: Db, workspaceId: string, ids: string[], columns: string, maxRows: number, signal: AbortSignal): Promise<AudienceDeliveryRow[]> {
  if (!ids.length) return [];
  const allowed = new Set(ids), rows: AudienceDeliveryRow[] = []; let last: string | null = null;
  for (;;) {
    let query = db.from('slim_audience_deliveries').select(columns).eq('workspace_id', workspaceId).in('campaign_id', ids).order('id', { ascending: true }).limit(500);
    if (last) query = query.gt('id', last);
    const result = await read(query, signal, 'os resultados dos destinatários');
    if (!Array.isArray(result.data)) throw new Error('Resposta inválida no histórico de destinatários.');
    if (!result.data.length) return rows;
    for (const row of result.data) {
      if (!uuid.test(row.id) || (last && row.id <= last) || row.workspace_id !== workspaceId || !allowed.has(row.campaign_id)) throw new Error('O histórico retornou um contexto ou uma página inconsistente.');
      rows.push(row); last = row.id;
    }
    if (rows.length > maxRows) throw new Error('A campanha excedeu o limite de leitura. Nenhum total parcial foi apresentado.');
  }
}
export async function loadAudienceReportPage(db: Db, scope: AudienceReportScope, filters: AudienceReportFilters, cursor: AudienceReportCursor | undefined, signal: AbortSignal): Promise<AudienceReportPage> {
  const countResult = await read(campaignFilters(db.from('slim_audience_campaigns').select('id', { count: 'exact', head: true }).eq('workspace_id', scope.workspaceId), filters), signal, 'a quantidade de campanhas');
  if (!Number.isSafeInteger(countResult.count) || countResult.count < 0) throw new Error('Não foi possível confirmar a quantidade de campanhas.');
  const rows: AudienceCampaignRow[] = [];
  for (;;) {
    let query = campaignFilters(db.from('slim_audience_campaigns').select(AUDIENCE_CAMPAIGN_COLUMNS).eq('workspace_id', scope.workspaceId), filters).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const result = await read(query.range(rows.length, 20), signal, 'as campanhas');
    if (!Array.isArray(result.data)) throw new Error('Resposta inválida na listagem de campanhas.');
    if (!result.data.length) break;
    for (const row of result.data) {
      const previous = rows.at(-1);
      if (!uuid.test(row.id) || row.workspace_id !== scope.workspaceId || (previous && (audienceReportTimestamp(row.created_at) > audienceReportTimestamp(previous.created_at) || (audienceReportTimestamp(row.created_at) === audienceReportTimestamp(previous.created_at) && row.id >= previous.id)))) throw new Error('Paginação inconsistente das campanhas.');
      rows.push(row);
    }
    if (rows.length > 21) throw new Error('Página de campanhas inválida.');
    if (rows.length === 21) break;
  }
  const visible = rows.slice(0, 20);
  const all = await deliveries(db, scope.workspaceId, visible.map(row => row.id), SUMMARY_COLUMNS, 20000, signal);
  const campaigns = visible.map(row => audienceCampaignReport(row, audienceReportTotals(all.filter(d => d.campaign_id === row.id))));
  const last = visible.at(-1);
  return { ...scope, campaigns, totalCampaigns: countResult.count, nextCursor: rows.length > 20 && last ? { createdAt: last.created_at, id: last.id } : null, pageTotals: sumAudienceReportTotals(campaigns.map(c => c.totals)), observedAt: new Date().toISOString() };
}
export async function loadAudienceReportDetail(db: Db, scope: AudienceReportScope, input: { campaignId: string; page: number; status?: DeliveryState; query?: string }, signal: AbortSignal): Promise<AudienceReportDetail> {
  const result = await read(db.from('slim_audience_campaigns').select(AUDIENCE_CAMPAIGN_COLUMNS).eq('workspace_id', scope.workspaceId).eq('id', input.campaignId).maybeSingle(), signal, 'a campanha');
  const campaign = result.data as AudienceCampaignRow | null;
  if (!campaign || campaign.id !== input.campaignId || campaign.workspace_id !== scope.workspaceId) throw new Error('Campanha não encontrada nesta empresa.');
  const rows = await deliveries(db, scope.workspaceId, [campaign.id], AUDIENCE_DELIVERY_COLUMNS, 1000, signal);
  const totals = audienceReportTotals(rows), needle = input.query?.trim().toLocaleLowerCase('pt-BR') || '';
  const filtered = rows.filter(row => (!input.status || row.status === input.status) && (!needle || `${row.name || ''} ${row.phone || ''}`.toLocaleLowerCase('pt-BR').includes(needle)));
  const pageSize = 50, page = Math.min(input.page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1)), visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const leadIds = [...new Set(visible.map(row => row.lead_id).filter((id): id is string => !!id && uuid.test(id)))];
  const visibleLeadIds = new Set<string>();
  if (leadIds.length) {
    const leads = await read(db.from('leads').select('id,workspace_id').eq('workspace_id', scope.workspaceId).in('id', leadIds), signal, 'os contatos disponíveis');
    if (!Array.isArray(leads.data)) throw new Error('Não foi possível conferir os contatos do relatório.');
    for (const lead of leads.data) if (lead.workspace_id === scope.workspaceId && leadIds.includes(lead.id)) visibleLeadIds.add(lead.id); else throw new Error('Contato fora do contexto do relatório.');
  }
  return { ...scope, campaign: audienceCampaignReport(campaign, totals), recipients: visible.map(row => audienceRecipientReport(row, campaign.kind, visibleLeadIds)), filteredRecipients: filtered.length, page, pageSize, observedAt: new Date().toISOString() };
}
