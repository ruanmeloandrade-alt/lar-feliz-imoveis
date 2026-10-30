import type { AgentKnowledgeSource } from './agent-knowledge.server';

export type BrainLinkedSource = AgentKnowledgeSource & { brainSourceId?: string };
type BrainDb = { from: (table: string) => any };

/** Resolve only explicitly linked sources; inline agent sources remain compatible. */
export async function resolveAgentBrainSources(db: BrainDb, workspaceId: string, sources: BrainLinkedSource[]): Promise<{ inline: AgentKnowledgeSource[]; brain: AgentKnowledgeSource[] }> {
  if (!workspaceId) throw new Error('Empresa do agente não identificada.');
  const inline = sources.filter(s => s && !s.brainSourceId);
  const ids = [...new Set(sources.map(s => s?.brainSourceId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return { inline, brain: [] };
  const { data, error } = await db.from('ai_brain_sources')
    .select('id,title,source_type,content,url,storage_path,file_name,enabled')
    .eq('workspace_id', workspaceId).eq('enabled', true).in('id', ids);
  if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar as fontes atuais do Cérebro.');
  const byId = new Map(data.map(row => [row.id, row]));
  const brain: AgentKnowledgeSource[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    // Missing, paused or foreign sources never fall back to a stale embedded copy.
    if (!row || !row.enabled) continue;
    if (row.storage_path && (!row.storage_path.startsWith(workspaceId + '/') || row.storage_path.split('/').includes('..'))) {
      throw new Error('Documento do Cérebro não pertence à empresa do agente.');
    }
    brain.push({ id: row.id, title: row.title, type: row.source_type, content: row.content,
      url: row.url, storagePath: row.storage_path, fileName: row.file_name });
  }
  return { inline, brain };
}

export async function buildWorkspaceAgentKnowledgeBlock(db: BrainDb, workspaceId: string, sources: BrainLinkedSource[]): Promise<string> {
  const { buildAgentKnowledgeBlock } = await import('./agent-knowledge.server.ts');
  const { inline, brain } = await resolveAgentBrainSources(db, workspaceId, sources);
  const live = await buildAgentKnowledgeBlock(brain, db as never, 'saude-slim-brain');
  const embedded = await buildAgentKnowledgeBlock(inline, db as never);
  return [live, embedded].filter(Boolean).join('\n\n');
}
