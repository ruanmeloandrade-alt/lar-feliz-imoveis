/**
 * Pending edits stay in memory. Only an explicit flush or the two-minute
 * deadline sends them to the database. The server is the source of truth.
 */
export type SalesbotSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type Task<T = unknown> = () => Promise<T>;
export const SALESBOT_AUTOSAVE_MS = 120_000;
const TASK_TIMEOUT_MS = 45_000;
const TIMEOUT_MESSAGE = "O servidor ainda não confirmou o salvamento. Aguarde antes de tentar novamente.";
const pendingSyncs = new Map<string, Promise<unknown>>();
// A timeout cannot cancel a server write. Keep its lock until it really settles.
const unresolvedRequests = new Map<string, Promise<unknown>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const latestTask = new Map<string, Task>();
const failedTasks = new Map<string, Task>();
const errors = new Map<string, string>();
const listeners = new Set<(s: SalesbotSaveStatus, err: string | null) => void>();
let status: SalesbotSaveStatus = "idle";
let lastError: string | null = null;
let confirmedSave = false;

function publish(): void {
  lastError = errors.values().next().value ?? null;
  status = errors.size ? "error" : pendingSyncs.size ? "saving"
    : latestTask.size || timers.size ? "dirty" : confirmedSave ? "saved" : "idle";
  for (const listener of listeners) listener(status, lastError);
}
export function getSalesbotSaveStatus() { return { status, error: lastError }; }
export function subscribeSalesbotSaveStatus(listener: (s: SalesbotSaveStatus, err: string | null) => void): () => void {
  listeners.add(listener);
  listener(status, lastError);
  return () => { listeners.delete(listener); };
}
function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}
async function runWithTimeout<T>(id: string, task: Task<T>): Promise<T> {
  if (unresolvedRequests.has(id)) throw new Error(TIMEOUT_MESSAGE);
  const actual = Promise.resolve().then(task);
  unresolvedRequests.set(id, actual);
  const release = () => { if (unresolvedRequests.get(id) === actual) unresolvedRequests.delete(id); };
  void actual.then(release, release);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), TASK_TIMEOUT_MS);
  });
  try { return await Promise.race([actual, timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
function serial<T>(id: string, task: Task<T>): Promise<T> {
  const previous = pendingSyncs.get(id) ?? Promise.resolve();
  const job = previous.catch(() => undefined).then(task);
  pendingSyncs.set(id, job);
  publish();
  const done = () => {
    if (pendingSyncs.get(id) === job) pendingSyncs.delete(id);
    publish();
  };
  void job.then(done, done);
  return job;
}
/** One requested save, not an endless drain: edits made during it wait again. */
function runQueued(id: string): Promise<void> {
  return serial(id, async () => {
    const task = latestTask.get(id);
    if (!task) return;
    clearTimer(id);
    latestTask.delete(id);
    errors.delete(id);
    publish();
    try {
      await runWithTimeout(id, task);
      confirmedSave = true;
      failedTasks.delete(id);
      errors.delete(id);
    } catch (error) {
      if (!latestTask.has(id)) failedTasks.set(id, task);
      errors.set(id, error instanceof Error ? error.message : "Falha ao salvar no servidor.");
      throw error;
    }
  });
}
/** First pending edit starts the deadline. Further typing does not restart it. */
export function scheduleSalesbotSave(id: string, task: Task): void {
  latestTask.set(id, task);
  failedTasks.delete(id);
  errors.delete(id);
  if (!timers.has(id)) {
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      void runQueued(id).catch(() => undefined);
    }, SALESBOT_AUTOSAVE_MS));
  }
  publish();
}
/** Manual Save / retry, or an explicit operation that requires persisted data. */
export async function flushSalesbotSave(id: string): Promise<void> {
  clearTimer(id);
  const failed = failedTasks.get(id);
  if (failed && !latestTask.has(id)) latestTask.set(id, failed);
  if (latestTask.has(id)) await runQueued(id);
  else {
    const pending = pendingSyncs.get(id);
    if (pending) await pending;
  }
  if (unresolvedRequests.has(id) || errors.has(id)) throw new Error(errors.get(id) ?? TIMEOUT_MESSAGE);
}
export async function flushAllSalesbotSaves(): Promise<void> {
  const ids = new Set([...latestTask.keys(), ...failedTasks.keys(), ...timers.keys(), ...pendingSyncs.keys()]);
  const outcomes = await Promise.allSettled([...ids].map(flushSalesbotSave));
  publish();
  const failure = outcomes.find((r) => r.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  if (errors.size) throw new Error(lastError ?? "Falha ao salvar no servidor.");
}
export function retrySalesbotSave(id?: string): void {
  for (const key of id ? [id] : [...failedTasks.keys()]) {
    void flushSalesbotSave(key).catch(() => undefined);
  }
}
/** Failed edits are also unsaved: closing/reloading must warn about them. */
export function hasPendingSalesbotSaves(): boolean {
  return latestTask.size > 0 || failedTasks.size > 0 || timers.size > 0
    || pendingSyncs.size > 0 || unresolvedRequests.size > 0;
}
export function hasFailedSalesbotSaves(): boolean { return errors.size > 0 || failedTasks.size > 0; }
export async function waitForSalesbotSync(id: string): Promise<void> { await flushSalesbotSave(id); }
export function clearSalesbotSync(id: string): void {
  clearTimer(id);
  latestTask.delete(id);
  failedTasks.delete(id);
  errors.delete(id);
  // Never unlock an actual request that is still running.
  publish();
}
export function enqueueSalesbotSync<T>(id: string, task: Task<T>): Promise<T> {
  return serial(id, async () => {
    try {
      const result = await runWithTimeout(id, task);
      confirmedSave = true;
      errors.delete(id);
      return result;
    } catch (error) {
      errors.set(id, error instanceof Error ? error.message : "Falha na operação do SalesBot.");
      throw error;
    }
  });
}
