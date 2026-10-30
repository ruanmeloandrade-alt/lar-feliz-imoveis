import { shapeSlimTrackingOverview } from './slim-tracking-overview.core.ts';
type TrackingDb = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<any> };
async function sitesForWorkspace(db: TrackingDb, workspaceId: string) {
  const sites: unknown[] = [];
  for (;;) {
    const r = await db.from('tracking_sites').select('id,name,last_event_at,verified').eq('workspace_id', workspaceId).order('id', { ascending: true }).range(sites.length, sites.length + 499);
    if (r.error || !Array.isArray(r.data)) throw new Error('Não foi possível ler os sites de tracking. Nenhuma contagem parcial foi usada.');
    if (!r.data.length) return sites;
    sites.push(...r.data);
    if (sites.length > 100000) throw new Error('A consulta de sites excedeu o limite de segurança.');
  }
}
export async function loadSlimTrackingOverview(db: TrackingDb, workspaceId: string) {
  if (!workspaceId) throw new Error('Empresa ativa não identificada.');
  try {
    const [day, week, sites, feed] = await Promise.all([
      db.rpc('tracking_overview', { _workspace_id: workspaceId, _days: 1 }),
      db.rpc('tracking_overview', { _workspace_id: workspaceId, _days: 7 }),
      sitesForWorkspace(db, workspaceId),
      db.from('tracking_events').select('event_name,page_path,utm_source,utm_campaign,created_at')
        .eq('workspace_id', workspaceId).eq('source_class', 'cliente')
        .lte('created_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20),
    ]);
    if (day.error || week.error || feed.error) throw new Error('Fonte de tracking indisponível.');
    return shapeSlimTrackingOverview(day.data, week.data, sites, feed.data);
  } catch {
    throw new Error('Não foi possível confirmar os indicadores de tracking. Nenhum resultado parcial foi apresentado como completo.');
  }
}
