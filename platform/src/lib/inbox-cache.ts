const DB_NAME = "mkton-inbox-cache";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const COLD_STORE = "coldBlocks";

export const INBOX_CACHE_SCHEMA_VERSION = 2;
export const INBOX_HOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const INBOX_COLD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const INBOX_CACHE_DELTA_OVERLAP_MS = 5 * 60 * 1000;

const DEFAULT_COLD_BUDGET_BYTES = 32 * 1024 * 1024;
const MIN_COLD_BUDGET_BYTES = 8 * 1024 * 1024;
const MAX_COLD_BUDGET_BYTES = 64 * 1024 * 1024;

export interface InboxCacheScope {
  userId: string;
  workspaceId: string;
}

export interface InboxHotItem {
  id: string;
  occurredAt: string;
}

export interface InboxHotSnapshot<T extends InboxHotItem> {
  items: T[];
  hasMore: boolean;
  earliestAt: string | null;
  checkpoint: string | null;
  updatedAt: string;
}

type SnapshotRecord =
  | {
      key: string;
      scopeKey: string;
      schemaVersion: number;
      kind: "conversations";
      namespace: string;
      items: unknown[];
      updatedAt: string;
    }
  | {
      key: string;
      scopeKey: string;
      schemaVersion: number;
      kind: "hot-thread";
      threadKey: string;
      items: unknown[];
      hasMore: boolean;
      earliestAt: string | null;
      checkpoint: string | null;
      updatedAt: string;
    };

interface ColdBlockRecord {
  key: string;
  scopeKey: string;
  threadScopeKey: string;
  threadKey: string;
  anchorBefore: string;
  schemaVersion: number;
  encoding: "gzip" | "plain";
  payload: ArrayBuffer;
  bytes: number;
  originalBytes: number;
  createdAt: string;
  lastAccessedAt: string;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

async function openInboxCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;
        if (oldVersion > 0) {
          if (db.objectStoreNames.contains(SNAPSHOT_STORE)) db.deleteObjectStore(SNAPSHOT_STORE);
          if (db.objectStoreNames.contains(COLD_STORE)) db.deleteObjectStore(COLD_STORE);
        }

        const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
        snapshots.createIndex("scopeKey", "scopeKey", { unique: false });

        const cold = db.createObjectStore(COLD_STORE, { keyPath: "key" });
        cold.createIndex("scopeKey", "scopeKey", { unique: false });
        cold.createIndex("threadScopeKey", "threadScopeKey", { unique: false });
        cold.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      request.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

export function makeInboxCacheScopeKey(scope: InboxCacheScope): string {
  return `${scope.userId}::${scope.workspaceId}`;
}

function conversationKey(scope: InboxCacheScope, namespace: string): string {
  return `${makeInboxCacheScopeKey(scope)}::conversations::${namespace}`;
}

function hotThreadKey(scope: InboxCacheScope, threadKey: string): string {
  return `${makeInboxCacheScopeKey(scope)}::hot::${threadKey}`;
}

function coldBlockKey(scope: InboxCacheScope, threadKey: string, anchorBefore: string): string {
  return `${makeInboxCacheScopeKey(scope)}::cold::${threadKey}::${anchorBefore}`;
}

function threadScopeKey(scope: InboxCacheScope, threadKey: string): string {
  return `${makeInboxCacheScopeKey(scope)}::${threadKey}`;
}

function isBinaryLike(value: unknown): boolean {
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (value instanceof ArrayBuffer) return true;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) return true;
  return false;
}

export function sanitizeInboxCacheValue<T>(value: T): T {
  const json = JSON.stringify(value, (_key, nested) => {
    if (isBinaryLike(nested)) return undefined;
    if (typeof nested === "function" || typeof nested === "symbol") return undefined;
    return nested;
  });
  return JSON.parse(json) as T;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function mergeInboxHotItems<T extends InboxHotItem>(
  current: readonly T[],
  incoming: readonly T[],
  now = Date.now(),
): T[] {
  const cutoff = now - INBOX_HOT_RETENTION_MS;
  const byId = new Map<string, T>();

  for (const item of current) {
    if (!item?.id || !validTimestamp(item.occurredAt)) continue;
    if (Date.parse(item.occurredAt) < cutoff) continue;
    byId.set(item.id, sanitizeInboxCacheValue(item));
  }

  for (const item of incoming) {
    if (!item?.id || !validTimestamp(item.occurredAt)) continue;
    if (Date.parse(item.occurredAt) < cutoff) continue;
    byId.set(item.id, sanitizeInboxCacheValue(item));
  }

  return [...byId.values()].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

export function latestInboxCheckpoint<T extends InboxHotItem>(items: readonly T[]): string | null {
  let latest: string | null = null;
  for (const item of items) {
    if (!validTimestamp(item.occurredAt)) continue;
    if (!latest || Date.parse(item.occurredAt) > Date.parse(latest)) latest = item.occurredAt;
  }
  return latest;
}

export function deltaCursorWithOverlap(
  checkpoint: string | null | undefined,
  overlapMs = INBOX_CACHE_DELTA_OVERLAP_MS,
): string | null {
  if (!checkpoint || !validTimestamp(checkpoint)) return null;
  return new Date(Math.max(0, Date.parse(checkpoint) - overlapMs)).toISOString();
}

async function getSnapshotRecord(key: string): Promise<SnapshotRecord | null> {
  const db = await openInboxCacheDb();
  if (!db) return null;
  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const result = await requestToPromise(
      tx.objectStore(SNAPSHOT_STORE).get(key) as IDBRequest<SnapshotRecord | undefined>,
    );
    await transactionDone(tx);
    return result ?? null;
  } catch {
    return null;
  }
}

async function putSnapshotRecord(record: SnapshotRecord): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).put(record);
    await transactionDone(tx);
  } catch {
    // Cache failure must never take down the Inbox.
  }
}

async function deleteSnapshotRecord(key: string): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).delete(key);
    await transactionDone(tx);
  } catch {
    // Best-effort invalidation.
  }
}

export async function readInboxConversationSnapshot<T>(
  scope: InboxCacheScope,
  namespace: string,
): Promise<T[] | null> {
  const key = conversationKey(scope, namespace);
  const record = await getSnapshotRecord(key);
  if (!record) return null;
  if (
    record.schemaVersion !== INBOX_CACHE_SCHEMA_VERSION ||
    record.kind !== "conversations" ||
    !Array.isArray(record.items)
  ) {
    await deleteSnapshotRecord(key);
    return null;
  }
  try {
    return sanitizeInboxCacheValue(record.items) as T[];
  } catch {
    await deleteSnapshotRecord(key);
    return null;
  }
}

export async function writeInboxConversationSnapshot<T>(
  scope: InboxCacheScope,
  namespace: string,
  items: readonly T[],
): Promise<void> {
  const scopeKey = makeInboxCacheScopeKey(scope);
  await putSnapshotRecord({
    key: conversationKey(scope, namespace),
    scopeKey,
    schemaVersion: INBOX_CACHE_SCHEMA_VERSION,
    kind: "conversations",
    namespace,
    items: sanitizeInboxCacheValue([...items]),
    updatedAt: new Date().toISOString(),
  });
}

export async function readInboxHotSnapshot<T extends InboxHotItem>(
  scope: InboxCacheScope,
  threadKey: string,
): Promise<InboxHotSnapshot<T> | null> {
  const key = hotThreadKey(scope, threadKey);
  const record = await getSnapshotRecord(key);
  if (!record) return null;
  if (
    record.schemaVersion !== INBOX_CACHE_SCHEMA_VERSION ||
    record.kind !== "hot-thread" ||
    !Array.isArray(record.items)
  ) {
    await deleteSnapshotRecord(key);
    return null;
  }

  try {
    const items = mergeInboxHotItems([], record.items as T[]);
    if (items.length === 0 && record.items.length > 0) {
      await deleteSnapshotRecord(key);
      return null;
    }
    const checkpoint = latestInboxCheckpoint(items);
    if (items.length !== record.items.length || checkpoint !== record.checkpoint) {
      await writeInboxHotSnapshot(scope, threadKey, {
        items,
        hasMore: record.hasMore,
        earliestAt: items[0]?.occurredAt ?? null,
        checkpoint,
        updatedAt: new Date().toISOString(),
      });
    }
    return {
      items,
      hasMore: Boolean(record.hasMore),
      earliestAt: items[0]?.occurredAt ?? record.earliestAt ?? null,
      checkpoint,
      updatedAt: record.updatedAt,
    };
  } catch {
    await deleteSnapshotRecord(key);
    return null;
  }
}

export async function writeInboxHotSnapshot<T extends InboxHotItem>(
  scope: InboxCacheScope,
  threadKey: string,
  snapshot: Omit<InboxHotSnapshot<T>, "updatedAt"> & { updatedAt?: string },
): Promise<void> {
  const items = mergeInboxHotItems([], snapshot.items);
  const checkpoint = latestInboxCheckpoint(items) ?? snapshot.checkpoint ?? null;
  await putSnapshotRecord({
    key: hotThreadKey(scope, threadKey),
    scopeKey: makeInboxCacheScopeKey(scope),
    schemaVersion: INBOX_CACHE_SCHEMA_VERSION,
    kind: "hot-thread",
    threadKey,
    items,
    hasMore: Boolean(snapshot.hasMore),
    earliestAt: items[0]?.occurredAt ?? snapshot.earliestAt ?? null,
    checkpoint,
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
  });
}

export function computeInboxColdBudgetBytes(
  estimate?: {
    quota?: number;
    usage?: number;
  } | null,
): number {
  const quota = estimate?.quota;
  const usage = estimate?.usage;
  let budget =
    typeof quota === "number" && Number.isFinite(quota) && quota > 0
      ? Math.floor(quota * 0.05)
      : DEFAULT_COLD_BUDGET_BYTES;

  budget = Math.max(MIN_COLD_BUDGET_BYTES, Math.min(MAX_COLD_BUDGET_BYTES, budget));

  if (
    typeof quota === "number" &&
    quota > 0 &&
    typeof usage === "number" &&
    usage / quota >= 0.85
  ) {
    budget = Math.max(MIN_COLD_BUDGET_BYTES, Math.floor(budget * 0.5));
  }

  return budget;
}

export interface InboxColdEncoding {
  encoding: "gzip" | "plain";
  payload: ArrayBuffer;
  originalBytes: number;
}

export async function encodeInboxColdValue(value: unknown): Promise<InboxColdEncoding> {
  const raw = new TextEncoder().encode(JSON.stringify(sanitizeInboxCacheValue(value)));
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new CompressionStream("gzip");
      const writer = stream.writable.getWriter();
      await writer.write(raw);
      await writer.close();
      const payload = await new Response(stream.readable).arrayBuffer();
      return { encoding: "gzip", payload, originalBytes: raw.byteLength };
    } catch {
      // Safe fallback below.
    }
  }
  return {
    encoding: "plain",
    payload: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    originalBytes: raw.byteLength,
  };
}

export async function decodeInboxColdValue<T>(
  encoded: Pick<InboxColdEncoding, "encoding" | "payload">,
): Promise<T> {
  let bytes: Uint8Array;
  if (encoded.encoding === "gzip") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("gzip cache unsupported in this browser");
    }
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    await writer.write(new Uint8Array(encoded.payload));
    await writer.close();
    bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  } else {
    bytes = new Uint8Array(encoded.payload);
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function decodeColdPayload<T>(record: ColdBlockRecord): Promise<T> {
  return decodeInboxColdValue<T>(record);
}

async function getColdBlock(key: string): Promise<ColdBlockRecord | null> {
  const db = await openInboxCacheDb();
  if (!db) return null;
  try {
    const tx = db.transaction(COLD_STORE, "readonly");
    const result = await requestToPromise(
      tx.objectStore(COLD_STORE).get(key) as IDBRequest<ColdBlockRecord | undefined>,
    );
    await transactionDone(tx);
    return result ?? null;
  } catch {
    return null;
  }
}

async function putColdBlock(record: ColdBlockRecord): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(COLD_STORE, "readwrite");
    tx.objectStore(COLD_STORE).put(record);
    await transactionDone(tx);
  } catch {
    // Best-effort cache only.
  }
}

async function deleteColdBlock(key: string): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(COLD_STORE, "readwrite");
    tx.objectStore(COLD_STORE).delete(key);
    await transactionDone(tx);
  } catch {
    // Best-effort invalidation.
  }
}

async function listColdBlocksForScope(scope: InboxCacheScope): Promise<ColdBlockRecord[]> {
  const db = await openInboxCacheDb();
  if (!db) return [];
  try {
    const tx = db.transaction(COLD_STORE, "readonly");
    const index = tx.objectStore(COLD_STORE).index("scopeKey");
    const rows = await requestToPromise(
      index.getAll(makeInboxCacheScopeKey(scope)) as IDBRequest<ColdBlockRecord[]>,
    );
    await transactionDone(tx);
    return rows ?? [];
  } catch {
    return [];
  }
}

export interface InboxColdBlockMeta {
  key: string;
  bytes: number;
  lastAccessedAt: string;
}

export function planInboxColdEvictions(
  rows: readonly InboxColdBlockMeta[],
  budgetBytes: number,
  now = Date.now(),
): string[] {
  const expiredKeys = new Set(
    rows
      .filter(
        (row) =>
          !validTimestamp(row.lastAccessedAt) ||
          now - Date.parse(row.lastAccessedAt) > INBOX_COLD_MAX_AGE_MS,
      )
      .map((row) => row.key),
  );

  const active = rows.filter((row) => !expiredKeys.has(row.key));
  let total = active.reduce((sum, row) => sum + Math.max(0, row.bytes || 0), 0);
  const evictions = [...expiredKeys];

  if (total <= budgetBytes) return evictions;

  const oldestFirst = active
    .slice()
    .sort((a, b) => Date.parse(a.lastAccessedAt) - Date.parse(b.lastAccessedAt));

  for (const row of oldestFirst) {
    if (total <= budgetBytes) break;
    evictions.push(row.key);
    total -= Math.max(0, row.bytes || 0);
  }

  return evictions;
}

export async function evictInboxColdBlocks(
  scope: InboxCacheScope,
  now = Date.now(),
): Promise<void> {
  const rows = await listColdBlocksForScope(scope);
  if (rows.length === 0) return;

  let estimate: { quota?: number; usage?: number } | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      estimate = await navigator.storage.estimate();
    }
  } catch {
    estimate = null;
  }

  const budget = computeInboxColdBudgetBytes(estimate);
  const evictions = planInboxColdEvictions(rows, budget, now);
  for (const key of evictions) await deleteColdBlock(key);
}

export async function deleteInboxColdPage(
  scope: InboxCacheScope,
  threadKey: string,
  anchorBefore: string,
): Promise<void> {
  if (!anchorBefore) return;
  await deleteColdBlock(coldBlockKey(scope, threadKey, anchorBefore));
}

export async function writeInboxColdPage<T>(
  scope: InboxCacheScope,
  threadKey: string,
  anchorBefore: string,
  value: T,
): Promise<void> {
  if (!anchorBefore) return;
  try {
    const encoded = await encodeInboxColdValue(value);
    const now = new Date().toISOString();
    await putColdBlock({
      key: coldBlockKey(scope, threadKey, anchorBefore),
      scopeKey: makeInboxCacheScopeKey(scope),
      threadScopeKey: threadScopeKey(scope, threadKey),
      threadKey,
      anchorBefore,
      schemaVersion: INBOX_CACHE_SCHEMA_VERSION,
      encoding: encoded.encoding,
      payload: encoded.payload,
      bytes: encoded.payload.byteLength,
      originalBytes: encoded.originalBytes,
      createdAt: now,
      lastAccessedAt: now,
    });
    await evictInboxColdBlocks(scope);
  } catch {
    // A failed compression/write falls back to network on the next request.
  }
}

export async function readInboxColdPage<T>(
  scope: InboxCacheScope,
  threadKey: string,
  anchorBefore: string,
): Promise<T | null> {
  const key = coldBlockKey(scope, threadKey, anchorBefore);
  const record = await getColdBlock(key);
  if (!record) return null;

  if (
    record.schemaVersion !== INBOX_CACHE_SCHEMA_VERSION ||
    record.threadKey !== threadKey ||
    record.scopeKey !== makeInboxCacheScopeKey(scope) ||
    !(record.payload instanceof ArrayBuffer)
  ) {
    await deleteColdBlock(key);
    return null;
  }

  try {
    const value = await decodeColdPayload<T>(record);
    record.lastAccessedAt = new Date().toISOString();
    await putColdBlock(record);
    return sanitizeInboxCacheValue(value);
  } catch {
    // Corruption is isolated to this block. Do not wipe unrelated cache data.
    await deleteColdBlock(key);
    return null;
  }
}

async function deleteStoreRowsByScope(
  db: IDBDatabase,
  storeName: string,
  scopeKey: string,
): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  const index = tx.objectStore(storeName).index("scopeKey");
  await new Promise<void>((resolve, reject) => {
    const cursor = index.openCursor(IDBKeyRange.only(scopeKey));
    cursor.onerror = () => reject(cursor.error ?? new Error("IndexedDB cursor failed"));
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) {
        resolve();
        return;
      }
      current.delete();
      current.continue();
    };
  });
  await transactionDone(tx);
}

export async function clearInboxCacheScope(scope: InboxCacheScope): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db) return;
  const scopeKey = makeInboxCacheScopeKey(scope);
  try {
    await deleteStoreRowsByScope(db, SNAPSHOT_STORE, scopeKey);
    await deleteStoreRowsByScope(db, COLD_STORE, scopeKey);
  } catch {
    // Logout/workspace changes must keep working even if browser cache cleanup fails.
  }
}

async function deleteStoreRowsByUser(
  db: IDBDatabase,
  storeName: string,
  userId: string,
): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  await new Promise<void>((resolve, reject) => {
    const cursor = store.openCursor();
    cursor.onerror = () => reject(cursor.error ?? new Error("IndexedDB cursor failed"));
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) {
        resolve();
        return;
      }
      const value = current.value as { scopeKey?: unknown };
      if (typeof value.scopeKey === "string" && value.scopeKey.startsWith(`${userId}::`)) {
        current.delete();
      }
      current.continue();
    };
  });
  await transactionDone(tx);
}

export async function clearInboxCacheUser(userId: string): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db || !userId) return;
  try {
    await deleteStoreRowsByUser(db, SNAPSHOT_STORE, userId);
    await deleteStoreRowsByUser(db, COLD_STORE, userId);
  } catch {
    // Logout must continue even if local storage is unavailable.
  }
}

export async function cleanupInboxCacheScope(scope: InboxCacheScope): Promise<void> {
  const db = await openInboxCacheDb();
  if (!db) return;
  try {
    const scopeKey = makeInboxCacheScopeKey(scope);
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const rows = await requestToPromise(
      tx.objectStore(SNAPSHOT_STORE).index("scopeKey").getAll(scopeKey) as IDBRequest<
        SnapshotRecord[]
      >,
    );
    await transactionDone(tx);

    const now = Date.now();
    for (const row of rows ?? []) {
      if (row.schemaVersion !== INBOX_CACHE_SCHEMA_VERSION) {
        await deleteSnapshotRecord(row.key);
        continue;
      }
      if (row.kind === "hot-thread") {
        const items = mergeInboxHotItems([], row.items as InboxHotItem[], now);
        if (items.length === 0) {
          await deleteSnapshotRecord(row.key);
          continue;
        }
        if (items.length !== row.items.length) {
          await writeInboxHotSnapshot(scope, row.threadKey, {
            items,
            hasMore: row.hasMore,
            earliestAt: items[0]?.occurredAt ?? null,
            checkpoint: latestInboxCheckpoint(items),
          });
        }
      } else if (
        validTimestamp(row.updatedAt) &&
        now - Date.parse(row.updatedAt) > INBOX_COLD_MAX_AGE_MS
      ) {
        await deleteSnapshotRecord(row.key);
      }
    }

    await evictInboxColdBlocks(scope, now);
  } catch {
    // Maintenance is opportunistic.
  }
}

// SLIM_CONTACT_IDENTITY_V1
