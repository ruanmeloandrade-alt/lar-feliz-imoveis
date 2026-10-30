import {createHash} from 'node:crypto';
import {authorizeSlimCopilot, copilotDeadline, type CopilotDb} from './slim-copilot-approval.core.ts';
import type {SlimCopilotIdentity} from './slim-copilot-contract.core.ts';

type Message = {id: string; role: string; parts: Array<{type: string; text?: string}>};
function historyId(identity: SlimCopilotIdentity, role: string, messageId: string): string {
  const hash = createHash('sha256').update(JSON.stringify(['slim-copilot-history-v1', identity.workspaceId, identity.actorId, role, messageId])).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function persistSlimCopilotTurn(context: {supabase: CopilotDb; userId: string}, identity: SlimCopilotIdentity, original: Message[], completed: Message[]): Promise<void> {
  await authorizeSlimCopilot(context.supabase, context.userId, identity);
  const user = [...original].reverse().find(message => message.role === 'user');
  const assistant = [...completed].reverse().find(message => message.role === 'assistant');
  const now = Date.now();
  const records = [user, assistant].flatMap((message, index) => {
    if (!message) return [];
    let content = message.parts.filter(part => part.type === 'text').map(part => part.text ?? '').join('\n').slice(0, 20000);
    if (!content.trim() && message.role === 'user' && message.parts.some(part => part.type === 'file')) content = '[Imagem anexada pelo operador]';
    if (!content.trim()) return [];
    return [{id: historyId(identity, message.role, message.id), workspace_id: identity.workspaceId, user_id: identity.actorId,
      role: message.role, content, created_at: new Date(now - 1 + index).toISOString()}];
  });
  if (!records.length) return;
  const db = context.supabase;
  const result: any = await copilotDeadline(db.from('support_robot_messages').upsert(records, {onConflict: 'id', ignoreDuplicates: true}), 8000, 'Histórico do Copiloto não confirmado.');
  if (result.error) throw new Error('Histórico do Copiloto não confirmado.');
  const confirmation: any = await copilotDeadline(db.from('support_robot_messages').select('id,role,content')
    .eq('workspace_id', identity.workspaceId).eq('user_id', identity.actorId).in('id', records.map(row => row.id)), 8000, 'Histórico do Copiloto não confirmado.');
  if (confirmation.error || !Array.isArray(confirmation.data) || records.some(expected => !confirmation.data.some((row: any) => row.id === expected.id && row.role === expected.role && row.content === expected.content))) throw new Error('Histórico do Copiloto não confirmado.');
}

export async function loadSlimCopilotHistory(context: {supabase: CopilotDb; userId: string}, identity: SlimCopilotIdentity) {
  await authorizeSlimCopilot(context.supabase, context.userId, identity);
  const result: any = await copilotDeadline(context.supabase.from('support_robot_messages').select('id,role,content,created_at')
    .eq('workspace_id', identity.workspaceId).eq('user_id', identity.actorId).order('created_at', {ascending: false}).order('id', {ascending: false}).limit(100), 8000, 'Não foi possível carregar o histórico do Copiloto.');
  if (result.error || !Array.isArray(result.data)) throw new Error('Não foi possível carregar o histórico do Copiloto.');
  const rows = [...result.data].reverse();
  const messages = rows.filter(row => ['user', 'assistant'].includes(row.role) && typeof row.content === 'string').map(row => ({
    id: `support-${row.id}`, role: row.role, parts: [{type: 'text', text: row.content.slice(0, 20000)}],
  }));
  return {id: `support-robot:${identity.workspaceId}:${identity.actorId}`, workspaceId: identity.workspaceId, actorId: identity.actorId,
    messages: JSON.stringify(messages), lastMessageAt: rows[rows.length - 1]?.created_at ?? null};
}
