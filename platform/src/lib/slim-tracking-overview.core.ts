/** Shapes only confirmed database aggregates; a partial response must never become zero KPIs. */
type Dict = Record<string, unknown>;
function object(value: unknown, label: string): Dict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Resposta incompleta de tracking: ${label}.`);
  return value as Dict;
}
function finite(value: unknown, label: string, count = false): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error(`Indicador de tracking inválido: ${label}.`);
  const n = Number(value);
  if (!Number.isFinite(n) || (count && (!Number.isSafeInteger(n) || n < 0))) throw new Error(`Indicador de tracking inválido: ${label}.`);
  return n;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Resposta incompleta de tracking: ${label}.`);
  return value;
}
function label(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }
export function shapeSlimTrackingOverview(day: unknown, week: unknown, sitesInput: unknown, feedInput: unknown) {
  const a24 = object(day, '24h'); const a7 = object(week, '7d');
  const counts = ['events', 'sessions', 'visitors', 'identified_visitors', 'leads', 'page_views', 'form_submits', 'conversions'];
  for (const key of counts) { finite(a24[key], `24h.${key}`, true); finite(a7[key], `7d.${key}`, true); }
  const byEvent = object(a7.by_event, 'eventos');
  for (const [key, value] of Object.entries(byEvent)) finite(value, `evento.${key}`, true);
  const revenueByCurrency = Object.fromEntries(Object.entries(object(a7.revenue_by_currency, 'receita por moeda')).map(([currency, value]) => {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Moeda inválida no retorno do tracking.');
    return [currency, finite(value, `moeda.${currency}`)];
  }));
  const revenue = finite(a7.revenue, 'receita');
  if (Math.abs(revenue - (revenueByCurrency.BRL ?? 0)) > 0.005) throw new Error('Receita BRL divergente da agregação por moeda.');
  const conversionByCampaign = new Map<string, { count: number; value: number }>();
  let conversionCount = 0; let campaignRevenue = 0;
  for (const raw of array(a7.conversion_by_campaign, 'conversões por campanha')) {
    const row = object(raw, 'campanha'); const key = label(row.campaign, '(sem campanha)');
    if (conversionByCampaign.has(key)) throw new Error('Campanha duplicada no agregado de conversões.');
    const count = finite(row.conversions, 'conversões da campanha', true); const value = finite(row.value_brl, 'receita da campanha');
    conversionByCampaign.set(key, { count, value }); conversionCount += count; campaignRevenue += value;
  }
  if (conversionCount !== Number(a7.conversions) || Math.abs(campaignRevenue - revenue) > 0.005) throw new Error('Totais de conversões divergentes do agregado por campanha.');
  const campaignRows = new Map<string, { key: string; sessions: number; conversions: number; value: number }>();
  for (const raw of array(a7.by_campaign, 'sessões por campanha')) {
    const row = object(raw, 'campanha'); const key = label(row.campaign, '(sem campanha)');
    if (campaignRows.has(key)) throw new Error('Campanha duplicada no agregado de sessões.');
    const conv = conversionByCampaign.get(key);
    campaignRows.set(key, { key, sessions: finite(row.sessions, 'sessões da campanha', true), conversions: conv?.count ?? 0, value: conv?.value ?? 0 });
  }
  for (const [key, conv] of conversionByCampaign) if (!campaignRows.has(key)) campaignRows.set(key, { key, sessions: 0, conversions: conv.count, value: conv.value });
  const sources = array(a7.by_source, 'origens').map(raw => {
    const row = object(raw, 'origem');
    return { source: label(row.source, '(sem origem)'), sessions: finite(row.sessions, 'sessões da origem', true), leads: finite(row.leads, 'leads da origem', true) };
  });
  const quality = object(a7.quality, 'qualidade');
  const sites = array(sitesInput, 'sites').map(raw => object(raw, 'site'));
  if (sites.some(site => typeof site.verified !== 'boolean')) throw new Error('Estado de verificação do site indisponível.');
  const feed = array(feedInput, 'eventos recentes');
  const event = (key: string) => byEvent[key] === undefined ? 0 : finite(byEvent[key], key, true);
  return {
    events24h: Number(a24.events), sessions24h: Number(a24.sessions),
    sitesActive: sites.filter(site => site.verified === true).length, sitesTotal: sites.length,
    funnel: { pageViews: Number(a7.page_views), clicks: event('click') + event('whatsapp_click') + event('phone_click'), sessions: Number(a7.sessions), leads: Number(a7.leads), conversions: Number(a7.conversions) },
    revenue7d: revenue, revenueByCurrency,
    identified: { visitors: Number(a7.visitors), identified: Number(a7.identified_visitors) },
    quality: { internal_events: finite(quality.internal_events, 'eventos internos', true), orphan_events: finite(quality.orphan_events, 'eventos sem site', true) },
    topCampaigns: [...campaignRows.values()].sort((a, b) => b.sessions - a.sessions || b.conversions - a.conversions || a.key.localeCompare(b.key)).slice(0, 8),
    topSources: sources, feed,
  };
}
