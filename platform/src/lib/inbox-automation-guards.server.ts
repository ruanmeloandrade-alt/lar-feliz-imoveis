import { AsyncLocalStorage } from "node:async_hooks";

type Db = { from: (table: string) => any };
type AgentFence = { leadId: string; version: number; assignedId: string | null; expectedAgentId?: string };
type Scope = { db: Db; workspaceId?: string; runId?: string; agent?: AgentFence };
const scopes = new AsyncLocalStorage<Scope>();

export class AutomationStoppedError extends Error {
  constructor() { super("Automação encerrada nesta conversa."); this.name = "AutomationStoppedError"; }
}

/** Recheck persisted ownership, including after delays and AI generation. */
export async function assertAutomationMayContinue(): Promise<void> {
  const scope = scopes.getStore();
  if (!scope) return;
  if (scope.runId) {
    let query = scope.db.from("salesbot_runs").select("status,stopped_at,workspace_id").eq("id", scope.runId);
    if (scope.workspaceId) query = query.eq("workspace_id", scope.workspaceId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error("Não foi possível confirmar o estado da execução.");
    if (!data || data.stopped_at || data.status !== "running") throw new AutomationStoppedError();
  }
  if (scope.agent) {
    const { data, error } = await scope.db.from("leads")
      .select("ai_paused,active_conversation_agent_id,active_conversation_agent_version")
      .eq("id", scope.agent.leadId).eq("workspace_id", scope.workspaceId).maybeSingle();
    if (error) throw new Error("Não foi possível confirmar o estado do Agente IA.");
    if (!data || data.ai_paused || Number(data.active_conversation_agent_version) !== scope.agent.version
      || (data.active_conversation_agent_id ?? null) !== scope.agent.assignedId) throw new AutomationStoppedError();
    if (scope.agent.expectedAgentId) {
      const current = await scope.db.from("conversation_ai_agents").select("id,enabled")
        .eq("workspace_id", scope.workspaceId).eq("id", scope.agent.expectedAgentId).maybeSingle();
      if (current.error) throw new Error("Não foi possível confirmar se o Agente IA está habilitado.");
      if (!current.data || current.data.enabled !== true) throw new AutomationStoppedError();
    }
  }
}

export async function withSalesbotGuard<T>(db: Db, input: string | { id: string; workspace_id?: string }, task: () => Promise<T>): Promise<T | undefined> {
  const scope: Scope = { db, runId: typeof input === "string" ? input : input.id,
    workspaceId: typeof input === "string" ? undefined : input.workspace_id };
  return scopes.run(scope, async () => {
    try { await assertAutomationMayContinue(); return await task(); }
    catch (error) { if (error instanceof AutomationStoppedError) return undefined; throw error; }
  });
}

export async function withAgentGuard<T>(db: Db, workspaceId: string, leadId: string, task: () => Promise<T>, expectedAgentId?: string, expectedVersion?: number): Promise<T> {
  const { data, error } = await db.from("leads")
    .select("ai_paused,active_conversation_agent_id,active_conversation_agent_version")
    .eq("id", leadId).eq("workspace_id", workspaceId).maybeSingle();
  if (error || !data) throw new Error("Conversa do Agente IA não encontrada.");
  if (data.ai_paused) throw new AutomationStoppedError();
  const version = Number(data.active_conversation_agent_version);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("Versão do Agente IA inválida.");
  if (expectedAgentId !== undefined && data.active_conversation_agent_id !== expectedAgentId) throw new AutomationStoppedError();
  if (expectedVersion !== undefined && version !== expectedVersion) throw new AutomationStoppedError();
  return scopes.run({ ...scopes.getStore(), db, workspaceId,
    agent: { leadId, version, assignedId: data.active_conversation_agent_id ?? null, expectedAgentId } },
    async () => { await assertAutomationMayContinue(); return task(); });
}

/** A request already accepted by the provider cannot be retracted. */
export async function guardedAutomationFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await assertAutomationMayContinue();
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(45_000) });
}
