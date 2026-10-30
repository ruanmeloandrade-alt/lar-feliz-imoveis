type EmployeeWorkspaceDb = { from(table: string): any };
type EmployeeWorkspaceTarget = { workspaceId: string; userId: string; reusedExistingUser: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unconfirmed = 'Não foi possível confirmar a empresa inicial do funcionário. Confira o cadastro antes de repetir.';

/** Called only after the owner's authenticated provisioning flow creates/confirms the membership. */
export async function selectSlimEmployeeWorkspace(db: EmployeeWorkspaceDb, target: EmployeeWorkspaceTarget, options: { timeoutMs?: number } = {}) {
 if (!UUID.test(target.workspaceId) || !UUID.test(target.userId) || typeof target.reusedExistingUser !== 'boolean') throw new Error('Funcionário ou empresa inválidos.');
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 const read = async (query: any) => {
  if (controller.signal.aborted) throw new Error(unconfirmed);
  const response = await query.retry(false).abortSignal(controller.signal);
  if (controller.signal.aborted) throw new Error(unconfirmed);
  return response;
 };
 const work = async () => {
  const membership = await read(db.from('workspace_members').select('workspace_id,user_id,access_expires_at').eq('workspace_id', target.workspaceId).eq('user_id', target.userId).maybeSingle());
  const member = membership.data;
  const active = member?.access_expires_at == null || (typeof member.access_expires_at === 'string' && Date.parse(member.access_expires_at) > Date.now());
  if (membership.error || member?.workspace_id !== target.workspaceId || member?.user_id !== target.userId || !active) throw new Error('O vínculo do funcionário com esta empresa não foi confirmado.');
  const profile = await read(db.from('profiles').select('id,current_workspace_id').eq('id', target.userId).maybeSingle());
  if (profile.error || profile.data?.id !== target.userId || (profile.data.current_workspace_id !== null && !UUID.test(String(profile.data.current_workspace_id)))) throw new Error(unconfirmed);
  const current = profile.data.current_workspace_id as string | null;
  // A reused identity keeps its own choice. New identities must leave the trigger-created workspace.
  if (target.reusedExistingUser && current !== null) return { currentWorkspaceId: current, changed: false };
  let update = db.from('profiles').update({ current_workspace_id: target.workspaceId }).eq('id', target.userId);
  // Preserve a selection made concurrently while provisioning was finishing.
  update = current === null ? update.is('current_workspace_id', null) : update.eq('current_workspace_id', current);
  const saved = await read(update.select('id,current_workspace_id').maybeSingle());
  if (saved.error || saved.data?.id !== target.userId || saved.data?.current_workspace_id !== target.workspaceId) throw new Error(unconfirmed);
  return { currentWorkspaceId: target.workspaceId, changed: current !== target.workspaceId };
 };
 const timeout = new Promise<never>((_, reject) => {
  timer = setTimeout(() => { controller.abort(); reject(new Error(unconfirmed)); }, options.timeoutMs ?? 10_000);
 });
 try { return await Promise.race([work(), timeout]); }
 finally { if (timer) clearTimeout(timer); controller.abort(); }
}
