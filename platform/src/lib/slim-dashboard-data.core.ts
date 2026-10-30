/** Independent dashboard reads. No environment secrets and no cross-workspace fallback. */
export type DashboardIssue = { source: string; state: 'unavailable' | 'error'; code: string; message: string };
export type DashboardReadResult = { data: any[] | null; error: { code: string; message: string } | null; issue?: DashboardIssue };
type Db = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => PromiseLike<any> };
export type DashboardRules = { venda_ganha_stage_id?: string | null; venda_ganha_pipeline_id?: string | null };
export type DashboardLead = { status?: string | null; pipeline_id?: string | null; stage_id?: string | null };
const LABELS: Record<string, string> = {
  leads: 'Clientes', pipelines: 'Funis', pipeline_stages: 'Etapas', products: 'Produtos',
  product_catalogs: 'Catálogos', companies: 'Empresas', lead_products: 'Vendas por produto',
  crm_forms: 'Formulários', crm_form_submissions: 'Envios de formulários',
  lead_custom_fields: 'Campos personalizados', lead_custom_field_values: 'Valores dos campos',
  tracking_sites: 'Sites de tracking', tracking_overview: 'Indicadores de tracking', tasks: 'Tarefas',
};
export function dashboardIssue(source: string, error: unknown): DashboardIssue {
  const rawCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'TRANSPORT';
  const code = /^(?:PGRST\d{3}|[A-Z0-9_]{3,32})$/.test(rawCode) ? rawCode : 'QUERY_ERROR';
  const unavailable = ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code);
  const label = LABELS[source] ?? 'Fonte de dados';
  return { source, state: unavailable ? 'unavailable' : 'error', code,
    message: unavailable ? `${label}: estrutura ainda indisponível neste ambiente.` : `${label}: falha na leitura. Os valores não foram calculados.` };
}
function failed(source: string, error: unknown, optional: boolean): DashboardReadResult {
  const issue = dashboardIssue(source, error);
  return { data: optional ? [] : null, error: optional ? null : { code: issue.code, message: issue.message }, issue };
}
export async function readDashboardRows(
  db: Db, workspaceId: string, table: string, columns: string,
  options: { optional?: boolean; purchased?: boolean; pageSize?: number; maxRows?: number } = {},
): Promise<DashboardReadResult> {
  const optional = options.optional === true;
  const pageSize = options.pageSize ?? 500;
  const maxRows = options.maxRows ?? 100000;
  if (!workspaceId || !Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < 1) {
    return failed(table, { code: 'INVALID_READ' }, optional);
  }
  const rows: any[] = [];
  try {
    for (;;) {
      let query = db.from(table).select(columns).eq('workspace_id', workspaceId).order('id', { ascending: true });
      if (table === 'leads') query = query.in('status', ['active', 'open', 'won', 'lost']).is('merged_into_id', null);
      if (options.purchased) query = query.eq('kind', 'comprou');
      const result = await query.range(rows.length, rows.length + Math.min(pageSize, maxRows - rows.length + 1) - 1);
      if (result.error) return failed(table, result.error, optional);
      if (!Array.isArray(result.data)) return failed(table, { code: 'INVALID_RESPONSE' }, optional);
      if (!result.data.length) return { data: rows, error: null };
      rows.push(...result.data);
      if (rows.length > maxRows) return failed(table, { code: 'READ_LIMIT' }, optional);
      // A shorter page can be a server limit, not EOF. Continue at the actual offset.
    }
  } catch (error) { return failed(table, error, optional); }
}
export async function readDashboardRpc(db: Db, workspaceId: string, name: string, args: Record<string, unknown> = {}) {
  try {
    if (!db.rpc) throw new Error('RPC unavailable');
    const result = await db.rpc(name, { ...args, _workspace_id: workspaceId });
    if (result.error) return { data: null, error: null, issue: dashboardIssue(name, result.error) };
    if (result.data === null || result.data === undefined) return { data: null, error: null, issue: dashboardIssue(name, { code: 'EMPTY_RPC' }) };
    return { data: result.data, error: null, issue: undefined };
  } catch (error) { return { data: null, error: null, issue: dashboardIssue(name, error) }; }
}
export function dashboardIssues(...results: Array<{ issue?: DashboardIssue }>): DashboardIssue[] {
  return [...new Map(results.filter((r) => r.issue).map((r) => [r.issue!.source, r.issue!])).values()];
}
export function classifyDashboardLead(lead: DashboardLead, stageName?: string, rules: DashboardRules = {}): 'won' | 'lost' | 'open' {
  if (lead.status === 'lost') return 'lost';
  if (lead.status === 'won') return 'won';
  const stage = rules.venda_ganha_stage_id;
  const pipeline = rules.venda_ganha_pipeline_id;
  const name = (stageName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const automatic = /perdid|cancel|lost|loss|descart/.test(name) ? 'lost'
    : /ganh|vendid|conclu|venda\s*realiz|won|success/.test(name) ? 'won' : 'open';
  if (stage || pipeline) {
    if ((!stage || lead.stage_id === stage) && (!pipeline || lead.pipeline_id === pipeline)) return 'won';
    return automatic === 'lost' ? 'lost' : 'open';
  }
  return automatic;
}
export async function refreshEnabledDashboardQueries(entries: Array<{ enabled: boolean; refetch: () => unknown }>) {
  return Promise.all(entries.filter((entry) => entry.enabled).map((entry) => entry.refetch()));
}
