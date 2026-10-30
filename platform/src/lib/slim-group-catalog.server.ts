/** Shared group catalogue. Uses the verified caller and its RLS, never an admin client. */
export type SlimGroupCatalogDb = { from(table: string): any; rpc(name: string, args: Record<string, unknown>): any };
export const SLIM_GROUP_CATALOG_COLUMNS = 'id,workspace_id,session_id,group_jid,name,subject,description,picture_url,participants_count,is_admin,is_announce,invite_code,active_bot_id,active_ai_agent_id,rules,last_synced_at,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = 'Não foi possível consultar os grupos. Atualize a lista para tentar novamente.';

export async function withSlimGroupCatalogRequest<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('A operação dos grupos excedeu o prazo. Confira o estado atual antes de repetir.')); }, timeoutMs);
  });
  try { return await Promise.race([work(controller.signal), timeout]); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}

export async function slimGroupCatalogQuery(query: any, signal: AbortSignal): Promise<any> {
  if (signal.aborted) throw new Error(unavailable);
  const result = await query.retry(false).abortSignal(signal);
  if (signal.aborted) throw new Error(unavailable);
  return result;
}

export async function authorizeSlimGroupCatalog(db: SlimGroupCatalogDb, workspaceId: string, userId: string, signal: AbortSignal, write = false): Promise<{ canWrite: boolean }> {
  if (!UUID.test(workspaceId) || !UUID.test(userId)) throw new Error('Sessão ou empresa inválida. Entre novamente.');
  const [profile, workspace, membership] = await Promise.all([
    slimGroupCatalogQuery(db.from('profiles').select('current_workspace_id').eq('id', userId).maybeSingle(), signal),
    slimGroupCatalogQuery(db.from('workspaces').select('id,owner_id').eq('id', workspaceId).maybeSingle(), signal),
    slimGroupCatalogQuery(db.from('workspace_members').select('workspace_id,user_id,role_type,access_expires_at').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(), signal),
  ]);
  if (profile.error || workspace.error || membership.error) throw new Error('Não foi possível verificar o acesso aos grupos.');
  if (profile.data?.current_workspace_id !== workspaceId || workspace.data?.id !== workspaceId) throw new Error('A empresa ativa mudou. Reabra a Central de Grupos.');
  if (workspace.data.owner_id === userId) return { canWrite: true };
  const member = membership.data;
  const active = member?.access_expires_at == null || Date.parse(member.access_expires_at) > Date.now();
  if (!member || member.workspace_id !== workspaceId || member.user_id !== userId || !active) throw new Error('Sem acesso aos grupos desta empresa.');
  const canWrite = member.role_type !== 'visualizador';
  if (write && !canWrite) throw new Error('Seu acesso permite consultar os grupos, mas não alterar suas configurações.');
  return { canWrite };
}

export async function recoverSlimGroupCatalog(db: SlimGroupCatalogDb, workspaceId: string, sessionId: string | undefined, signal: AbortSignal): Promise<{ recovered: number; total: number }> {
  const result = await slimGroupCatalogQuery(db.rpc('slim_sync_group_catalog', { _workspace_id: workspaceId, _session_id: sessionId ?? null }), signal);
  const data = result.data;
  if (result.error || !data || !Number.isSafeInteger(data.recovered) || data.recovered < 0 || !Number.isSafeInteger(data.total) || data.total < data.recovered) {
    throw new Error('Não foi possível sincronizar o histórico dos grupos. Consulte novamente antes de configurar as regras.');
  }
  return { recovered: data.recovered, total: data.total };
}

export async function readSlimGroupCatalog(db: SlimGroupCatalogDb, workspaceId: string, sessionId: string | undefined, signal: AbortSignal): Promise<any[]> {
  const items: any[] = [], seen = new Set<string>();
  for (let offset = 0; offset <= 2000;) {
    let query = db.from('whatsapp_groups').select(SLIM_GROUP_CATALOG_COLUMNS).eq('workspace_id', workspaceId);
    if (sessionId) query = query.eq('session_id', sessionId);
    const result = await slimGroupCatalogQuery(query.order('name', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 249), signal);
    if (result.error || !Array.isArray(result.data)) throw new Error(unavailable);
    if (!result.data.length) return items;
    for (const row of result.data) {
      if (!UUID.test(String(row.id)) || row.workspace_id !== workspaceId || (sessionId && row.session_id !== sessionId) || seen.has(row.id)) throw new Error(unavailable);
      seen.add(row.id); items.push(row);
    }
    if (items.length > 2000) break;
    offset += result.data.length;
  }
  throw new Error('A lista de grupos excedeu o limite de consulta. Selecione uma sessão para continuar.');
}

export async function listSlimWorkspaceGroups(db: SlimGroupCatalogDb, workspaceId: string, sessionId: string | undefined, userId: string): Promise<any[]> {
  return withSlimGroupCatalogRequest(async signal => {
    const access = await authorizeSlimGroupCatalog(db, workspaceId, userId, signal);
    // Only metadata derived from this caller's visible history is inserted. No provider request,
    // rule execution, technical lead, message, or SalesBot run is created when opening the list.
    if (access.canWrite) await recoverSlimGroupCatalog(db, workspaceId, sessionId, signal);
    return readSlimGroupCatalog(db, workspaceId, sessionId, signal);
  });
}

export async function saveSlimGroupConfiguration(db: SlimGroupCatalogDb, data: { workspaceId: string; groupId: string; rules?: Record<string, unknown>; botId?: string | null; agentId?: string | null }, userId: string): Promise<{ ok: true }> {
  return withSlimGroupCatalogRequest(async signal => {
    await authorizeSlimGroupCatalog(db, data.workspaceId, userId, signal, true);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.rules !== undefined) {
      if (JSON.stringify(data.rules).length > 100_000) throw new Error('As regras excedem o limite de configuração do grupo.');
      patch.rules = data.rules;
    } else {
      if (data.agentId) throw new Error('A automação deste grupo utiliza SalesBots e gatilhos.');
      if (data.botId) {
        const bot = await slimGroupCatalogQuery(db.from('salesbots').select('id').eq('workspace_id', data.workspaceId).eq('id', data.botId).eq('scope', 'grupo').maybeSingle(), signal);
        if (bot.error || !bot.data) throw new Error('SalesBot de grupo não encontrado nesta empresa.');
      }
      patch.active_bot_id = data.botId ?? null;
      patch.active_ai_agent_id = null;
    }
    const saved = await slimGroupCatalogQuery(db.from('whatsapp_groups').update(patch).eq('workspace_id', data.workspaceId).eq('id', data.groupId).select('id').maybeSingle(), signal);
    if (saved.error || saved.data?.id !== data.groupId) throw new Error('Não foi possível confirmar o salvamento do grupo. Seu rascunho foi preservado; confira a lista antes de repetir.');
    return { ok: true };
  });
}
