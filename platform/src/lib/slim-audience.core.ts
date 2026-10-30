import { audienceIsGroup, audienceRecentMessageIds, audienceSilenceCutoff } from './slim-audience-message-window.core.ts';
import type { IdentityContact } from './slim-contact-identity.core.ts';
export type SlimAudienceDb = { from: (table: string) => any };
export type SlimLead = Record<string, any> & { id: string; name: string; phone: string | null; email: string | null };
const text = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('pt-BR');
export function audienceTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : v && typeof v === 'object' ? v.name ?? v.label ?? '' : '').map(text).filter(Boolean) : [];
}
export function fieldDisplay(value: any): string {
  if (value == null) return '';
  if (typeof value === 'object' && !Array.isArray(value)) return String(value.display ?? (Array.isArray(value.raw) ? value.raw.join(', ') : value.raw ?? ''));
  return Array.isArray(value) ? value.join(', ') : String(value);
}
export async function readAudienceRows(db: SlimAudienceDb, workspaceId: string, table: string, columns: string): Promise<any[]> {
  if (!workspaceId) throw new Error('Empresa ativa não identificada.');
  const rows: any[] = [];
  while (rows.length <= 100000) {
    const { data, error } = await db.from(table).select(columns).eq('workspace_id', workspaceId).order('id', { ascending: true }).range(rows.length, rows.length + 499);
    if (error) throw new Error(`Não foi possível consultar ${table}. O público não foi calculado com dados parciais.`);
    if (!Array.isArray(data)) throw new Error('Resposta inválida ao consultar público.');
    if (!data.length) return rows;
    rows.push(...data);
  }
  throw new Error('A consulta excedeu 100 mil registros. Refine o público antes de continuar.');
}
function dateBound(value: unknown, end = false): number | null {
  if (!value) return null;
  const raw = String(value); const n = Date.parse(raw);
  if (!Number.isFinite(n)) throw new Error('Data inválida no filtro do público.');
  return n + (end && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? 86399999 : 0);
}
export function audienceMatches(lead: SlimLead, f: Record<string, any>, refs: { sourceProviders?: Map<string,string>; products?: Set<string>; tasks?: Map<string,any[]>; fields?: Map<string,Map<string,string>>; recentMessageIds?: Set<string> } = {}, now = Date.now()): boolean {
  if (lead.merged_into_id || ['archived','deleted','merged'].includes(lead.status)) return false;
  if ((f.status ?? 'active') !== 'any' && lead.status !== (f.status ?? 'active')) return false;
  for (const [key,column] of [['pipelineIds','pipeline_id'],['stageIds','stage_id'],['sourceIds','crm_source_id'],['responsibleIds','responsible_id'],['companyIds','company_id']]) if (f[key]?.length && !f[key].includes(lead[column])) return false;
  if (f.hasCompany !== undefined && Boolean(lead.company_id) !== f.hasCompany) return false;
  for (const [key,column] of [['hasEmail','email'],['hasPhone','phone']]) if (f[key] !== undefined && Boolean(text(lead[column])) !== f[key]) return false;
  const value = Number(lead.value ?? 0);
  if (typeof f.valueMin === 'number' && value < f.valueMin) return false;
  if (typeof f.valueMax === 'number' && value > f.valueMax) return false;
  const from = dateBound(f.createdFrom), to = dateBound(f.createdTo,true), created = Date.parse(lead.created_at);
  if (from !== null && (!Number.isFinite(created) || created < from)) return false;
  if (to !== null && (!Number.isFinite(created) || created > to)) return false;
  const updated = Date.parse(lead.updated_at);
  if (f.updatedWithinDays && (!Number.isFinite(updated) || updated < now - f.updatedWithinDays*86400000)) return false;
  const silenceCutoff = audienceSilenceCutoff(f.noMessageForDays, now);
  if (silenceCutoff !== null) {
    if (!refs.recentMessageIds) throw new Error('Histórico de mensagens não conferido para este público.');
    if (audienceIsGroup(lead) || !Number.isFinite(created) || created > silenceCutoff || refs.recentMessageIds.has(lead.id)) return false;
  }
  if (f.lastMessageFrom && f.lastMessageFrom !== 'any') {
    if (f.lastMessageFrom === 'none' ? Boolean(lead.last_message_from) : lead.last_message_from !== f.lastMessageFrom) return false;
  }
  if (f.conversationStatus && f.conversationStatus !== 'any' && lead.conversation_status !== f.conversationStatus) return false;
  if (text(f.search) && ![lead.name,lead.email,lead.phone].some(v=>text(v).includes(text(f.search)))) return false;
  const tags = new Set(audienceTags(lead.tags));
  if (f.tagsAny?.length && !f.tagsAny.some((t: string)=>tags.has(text(t)))) return false;
  if (f.tagsAll?.length && !f.tagsAll.every((t: string)=>tags.has(text(t)))) return false;
  if (f.tagsNone?.some((t: string)=>tags.has(text(t)))) return false;
  const cd = lead.custom_data ?? {};
  for (const [key,column] of [['utmSource','utm_source'],['utmMedium','utm_medium'],['utmCampaign','utm_campaign'],['lostReasonContains','lost_reason']]) if (text(f[key]) && !text(cd[column]).includes(text(f[key]))) return false;
  if (f.channelProviders?.length && !f.channelProviders.includes(refs.sourceProviders?.get(lead.crm_source_id))) return false;
  if (f.hasProducts !== undefined && Boolean(refs.products?.has(lead.id)) !== f.hasProducts) return false;
  if (f.taskState && f.taskState !== 'any') {
    const tasks = refs.tasks?.get(lead.id) ?? [];
    if (f.taskState === 'none' && tasks.length) return false;
    if (f.taskState === 'has_open' && !tasks.some(t=>t.status === 'pendente')) return false;
    if (f.taskState === 'has_completed' && !tasks.some(t=>t.status === 'concluida')) return false;
    if (f.taskState === 'has_overdue' && !tasks.some(t=>t.status === 'pendente' && Date.parse(t.end_at)<now)) return false;
  }
  return (f.customFields ?? []).every((rule: any)=>{
    const val = text(refs.fields?.get(lead.id)?.get(rule.fieldId));const target=text(rule.value);
    switch(rule.op) { case 'exists':return Boolean(val);case 'empty':return !val;case 'eq':return Boolean(val)&&val===target;case 'neq':return val!==target;case 'contains':return Boolean(val)&&val.includes(target);default:throw new Error('Operador de campo inválido.'); }
  });
}
export async function querySlimAudience(db: SlimAudienceDb, ws: string, f: Record<string,any>, limit?: number): Promise<SlimLead[]> {
  const now = Date.now(), silenceCutoff = audienceSilenceCutoff(f.noMessageForDays, now);
  dateBound(f.createdFrom); dateBound(f.createdTo);
  if (f.valueMin != null && f.valueMax != null && f.valueMin>f.valueMax) throw new Error('Valor mínimo maior que o máximo.');
  const [leads,sources,products,tasks,fields] = await Promise.all([
    readAudienceRows(db,ws,'leads','id,workspace_id,name,email,phone,source,value,stage_id,last_message_from,tags,created_at,updated_at,status,pipeline_id,crm_source_id,responsible_id,company_id,conversation_status,custom_data,merged_into_id'),
    f.channelProviders?.length ? readAudienceRows(db,ws,'crm_sources','id,provider') : [],
    f.hasProducts !== undefined ? readAudienceRows(db,ws,'lead_products','id,lead_id') : [],
    f.taskState && f.taskState !== 'any' ? readAudienceRows(db,ws,'tasks','id,lead_id,status,end_at') : [],
    f.customFields?.length ? readAudienceRows(db,ws,'lead_custom_field_values','id,lead_id,field_id,value') : [],
  ]);
  const byTask = new Map<string,any[]>();for(const t of tasks) byTask.set(t.lead_id,[...(byTask.get(t.lead_id)??[]),t]);
  const byField = new Map<string,Map<string,string>>();for(const v of fields) {const m=byField.get(v.lead_id)??new Map();m.set(v.field_id,fieldDisplay(v.value));byField.set(v.lead_id,m);}
  const recentMessageIds = silenceCutoff === null ? undefined : await audienceRecentMessageIds(db, ws, leads as IdentityContact[], silenceCutoff);
  const refs={sourceProviders:new Map(sources.map(s=>[s.id,s.provider])),products:new Set<string>(products.map(p=>p.lead_id)),tasks:byTask,fields:byField,recentMessageIds};
  const result = (leads as SlimLead[]).filter(l=>audienceMatches(l,f,refs,now)).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))||a.id.localeCompare(b.id));
  return limit == null ? result : result.slice(0,limit);
}
export function audienceMessage(template: string, lead: {name?: string;email?: string|null}): string {
  return template.replace(/\{\{\s*(nome|name)\s*\}\}/gi,()=>lead.name??'').replace(/\{\{\s*email\s*\}\}/gi,()=>lead.email??'');
}
export function contactBlocked(lead: Record<string,any>): boolean {
  return Boolean(lead.merged_into_id) || ['archived','deleted','merged'].includes(lead.status) || ['opt_out','do_not_contact','whatsapp_opt_out'].some(k=>[true,'true'].includes(lead.custom_data?.[k]));
}
