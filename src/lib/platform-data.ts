import { apiClient } from '@/lib/api-client';
import type { Property as PublicProperty } from '@/types/property';

export type Contact = { id: string; workspace_id: string; name: string; phone: string | null; email: string | null; city: string | null; notes: string | null; created_at: string };
export type Stage = { id: string; pipeline_id: string; name: string; position: number; outcome: 'open' | 'won' | 'lost' };
export type Deal = { id: string; workspace_id: string; contact_id: string; pipeline_id: string; stage_id: string; property_id: string | null; source_lead_id: string | null; name: string; value: number; notes: string | null; created_at: string; updated_at: string };
export type Task = { id: string; workspace_id: string; contact_id: string | null; deal_id: string | null; title: string; due_at: string; done: boolean; event_id: string | null; automation_id: string | null; created_at: string };
export type Automation = { id: string; workspace_id: string; name: string; event_kind: 'lead.created' | 'lead.stage_changed'; stage_id: string | null; task_title: string; delay_hours: number; enabled: boolean; created_at: string };
export type Event = { id: string; workspace_id: string; deal_id: string; kind: string; payload: Record<string, unknown>; created_at: string };
export type Proposal = { id: string; workspace_id: string; contact_id: string; property_id: string | null; title: string; amount: number; status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'contracted'; valid_until: string | null; terms: string; document_path: string | null; created_at: string };
type Workspace = { id: string; slug: string; name: string; created_at: string };
type Pipeline = { id: string; workspace_id: string; name: string };
export type Property = PublicProperty & { created_at: string; updated_at?: string; created_by?: string | null };
export type Lead = { id: string; created_at: string; nome: string; whatsapp: string; email: string | null; renda: number | null; entrada: number | null; tipo_trabalho: string | null; fgts: string | null; cpf_limpo: string | null; possui_imovel: string | null; cidade: string | null; faixa: string | null; subsidio_resultado: string | null; produto_interesse: string | null; observacoes: string | null };
export type PlatformTables = {
  vanessa_workspaces: Workspace; vanessa_pipelines: Pipeline; vanessa_stages: Stage;
  vanessa_contacts: Contact; vanessa_deals: Deal; vanessa_tasks: Task;
  vanessa_events: Event; vanessa_automations: Automation; vanessa_proposals: Proposal;
  properties: Property; leads: Lead; user_roles: { id: string; user_id: string; role: string };
};
export const platformDb = apiClient;

export async function pages<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await read(start, start + 499);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('O servidor nao confirmou a leitura.');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function loadPlatform() {
  const w = await platformDb.from('vanessa_workspaces').select('*').eq('slug', 'vanessa').single();
  if (w.error || !w.data) throw new Error(w.error?.message ?? 'Ambiente nao encontrado.');
  const workspace = w.data;
  const p = await platformDb.from('vanessa_pipelines').select('*').eq('workspace_id', workspace.id).single();
  if (p.error || !p.data) throw new Error(p.error?.message ?? 'Funil nao encontrado.');
  const [contacts, deals, tasks, automations, stages, properties] = await Promise.all([
    pages<Contact>((a, b) => platformDb.from('vanessa_contacts').select('*').eq('workspace_id', workspace.id).order('created_at').order('id').range(a, b)),
    pages<Deal>((a, b) => platformDb.from('vanessa_deals').select('*').eq('workspace_id', workspace.id).order('created_at').order('id').range(a, b)),
    pages<Task>((a, b) => platformDb.from('vanessa_tasks').select('*').eq('workspace_id', workspace.id).order('due_at').order('id').range(a, b)),
    pages<Automation>((a, b) => platformDb.from('vanessa_automations').select('*').eq('workspace_id', workspace.id).order('created_at').order('id').range(a, b)),
    pages<Stage>((a, b) => platformDb.from('vanessa_stages').select('*').eq('pipeline_id', p.data.id).order('position').range(a, b)),
    pages<Property>((a, b) => platformDb.from('properties').select('*').order('created_at').order('id').range(a, b)),
  ]);
  return { workspace, pipeline: p.data, contacts, deals, tasks, automations, stages, properties };
}
export type PlatformData = Awaited<ReturnType<typeof loadPlatform>>;
export function summarize(data: Pick<PlatformData, 'deals' | 'stages' | 'tasks'>, now = Date.now()) {
  const outcomes = new Map(data.stages.map(stage => [stage.id, stage.outcome]));
  return {
    open: data.deals.filter(d => outcomes.get(d.stage_id) === 'open').length,
    won: data.deals.filter(d => outcomes.get(d.stage_id) === 'won').length,
    openValue: data.deals.filter(d => outcomes.get(d.stage_id) === 'open').reduce((sum, d) => sum + Number(d.value), 0),
    overdue: data.tasks.filter(t => !t.done && new Date(t.due_at).getTime() < now).length,
  };
}
export const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
export const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export function whatsappUrl(phone: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
