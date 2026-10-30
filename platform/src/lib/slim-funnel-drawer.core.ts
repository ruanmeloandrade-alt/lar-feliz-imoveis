import type { ChatConversation } from './inbox-mock';
import type { CrmLead } from './crm-mock';
import { normalizeInternationalPhone } from './whatsapp-identity';

export type SlimDrawerInteraction = { dirty: boolean; pending: boolean };
export type SlimDrawerContext = { workspaceId: string; actorId: string; leadId: string };
export type SlimDrawerLead = {
  id: string; name: string; email: string | null; phone: string | null; value: number;
  stageId: string | null; stageName: string | null; pipelineId: string | null; pipelineName: string | null;
  sourceProvider: string; sourceDisplayName: string | null; tags: string[];
  createdAt: string; updatedAt: string; responsibleId?: string | null; responsibleName?: string | null;
  status?: string; source?: string | null; address?: string | null; notes?: string | null;
  conversationStatus?: string | null; lastMessageFrom?: string | null;
  customFields: Array<{ id: string; name: string; type: string; displayValue: string }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const slimDrawerValidLeadId = (id: unknown): id is string => typeof id === 'string' && uuid.test(id);
export function slimDrawerContextKey(context: SlimDrawerContext | null | undefined): string | null {
  if (!context || ![context.workspaceId, context.actorId, context.leadId].every(slimDrawerValidLeadId)) return null;
  return `${context.workspaceId}:${context.actorId}:${context.leadId}`;
}
export function slimDrawerMatchesDetail(context: SlimDrawerContext, detail: { workspaceId?: string; actorId?: string; lead?: { id?: string } } | null | undefined): boolean {
  return !!slimDrawerContextKey(context) && detail?.workspaceId === context.workspaceId && detail?.actorId === context.actorId && detail?.lead?.id === context.leadId;
}
export function slimDrawerLeaveDecision(state: SlimDrawerInteraction): 'allow' | 'confirm' | 'blocked' {
  return state.pending ? 'blocked' : state.dirty ? 'confirm' : 'allow';
}
export function slimFunnelCardAction(selectionCount: number, dragSuppressed: boolean): 'open' | 'select' | 'ignore' {
  return dragSuppressed ? 'ignore' : selectionCount > 0 ? 'select' : 'open';
}
export const slimFunnelActivationKey = (key: string) => key === 'Enter' || key === ' ';
export function slimDrawerIsDirectLead(lead: { source?: string | null; phone?: string | null }): boolean {
  return !/group|grupo/i.test(lead.source ?? '') && !/@g\.us\s*$/i.test(lead.phone ?? '');
}
export function slimDrawerWhatsappUrl(phone: string | null | undefined, source?: string | null): string | null {
  if (!phone || /@|https?:|[a-z]/i.test(phone) || /group|grupo/i.test(source ?? '')) return null;
  const result = normalizeInternationalPhone(phone, { allowTrustedBare: source === 'whatsapp' || source === 'whatsapp_web' });
  return result.ok ? `https://web.whatsapp.com/send?phone=${result.digits}` : null;
}
export function slimDrawerConversation(lead: SlimDrawerLead): ChatConversation {
  return {
    id: lead.id, leadId: lead.id, channel: 'leads', name: lead.name,
    subtitle: [lead.phone, lead.stageName].filter(Boolean).join(' · ') || lead.email || 'Contato',
    lastMessageFrom: lead.lastMessageFrom === 'lead' ? 'them' : 'me', lastMessagePreview: '', lastMessageAt: lead.updatedAt,
    unreadCount: 0, messages: [], labels: lead.tags, sourceProvider: lead.sourceProvider,
    status: lead.conversationStatus === 'fechada' ? 'resolvido' : lead.conversationStatus === 'aberta' ? 'aberto' : undefined, productIds: [],
  };
}
export function slimDrawerEditLead(selected: CrmLead, lead: SlimDrawerLead): CrmLead & Pick<SlimDrawerLead, 'email' | 'phone' | 'responsibleId' | 'pipelineId' | 'stageId'> {
  return { ...selected, id: lead.id, name: lead.name, value: lead.value, tags: lead.tags, createdAt: lead.createdAt,
    email: lead.email, phone: lead.phone, responsibleId: lead.responsibleId ?? null, pipelineId: lead.pipelineId, stageId: lead.stageId };
}
