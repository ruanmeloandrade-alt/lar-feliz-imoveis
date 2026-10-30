// One-time, workspace-scoped operational cleanup. No secrets are embedded or logged.
// Run only from the existing Saúde Slim server environment after reviewing this file.
import { pathToFileURL } from 'node:url';

export const MANIFEST = Object.freeze({
  project: 'vyzvfcgpjjzvcjegzzza',
  workspace: 'c49945db-1960-461a-9339-a43b8403bdd9',
  admins: Object.freeze([
    'ef744fda-72b1-4cc5-b06e-76f9610a01c6',
    'e8f2252b-c0bc-4336-9912-2e62e73ddd2e',
  ]),
  evolution: Object.freeze([
    'ws_c49945db_hgg_mv8lfidc',
    'ws_c49945db_whatsapp_mv8lmcik',
    'ws_c49945db_whatsapp_mv8lmo5d',
    'ws_c49945db_teste-01_mv8n4c04',
    'ws_c49945db_whatsapp_mv8n931u',
  ]),
  bucket: 'inbox-outgoing',
  objectIds: Object.freeze([
    'ff16ac58-9104-4ec7-907c-af7c48f74048',
    '1140bb46-2cdb-45a4-9691-65e191a4f1fb',
    '0be950d4-e740-49f8-a770-63cd86cdb199',
    '07baad93-6c73-4110-b74f-016559f69d5e',
    '2521c1dd-e3b4-497e-9fec-cc0512f6593d',
    '82e070bd-7a6a-41e4-823a-cf123d2ace30',
  ]),
});

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REQUESTS = 96;
const MAX_DIRECTORIES = 24;
const MAX_DEPTH = 12;
const LIST_LIMIT = 1000;
const RUN_BUDGET_MS = 180_000;
const VALID_UNTIL = Date.parse('2026-10-19T00:00:00Z');
const EXECUTE_ARGUMENT = 'execute-20261018';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export class CleanupFailure extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'CleanupFailure';
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}
function assert(ok, code) { if (!ok) throw new CleanupFailure(code); }

function configuration(env) {
  const values = {};
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EVOLUTION_BASE_URL', 'EVOLUTION_GLOBAL_API_KEY']) {
    const value = env[key];
    assert(typeof value === 'string' && value.trim().length > 0 && !/[\r\n\x00]/.test(value), 'ENVIRONMENT_INCOMPLETE');
    values[key] = value.trim();
  }
  let sb, evo;
  try { sb = new URL(values.SUPABASE_URL); evo = new URL(values.EVOLUTION_BASE_URL); }
  catch { throw new CleanupFailure('INVALID_SERVICE_URL'); }
  assert(sb.origin === `https://${MANIFEST.project}.supabase.co` && sb.pathname === '/' && !sb.username && !sb.password && !sb.search && !sb.hash, 'WRONG_SUPABASE_PROJECT');
  assert(['https:', 'http:'].includes(evo.protocol) && !evo.username && !evo.password && !evo.search && !evo.hash, 'INVALID_EVOLUTION_URL');
  // HTTP is permitted only on Railway private networking or loopback.
  assert(evo.protocol === 'https:' || evo.hostname.endsWith('.railway.internal') || ['localhost', '127.0.0.1', '[::1]'].includes(evo.hostname), 'UNSAFE_EVOLUTION_TRANSPORT');
  const key = values.SUPABASE_SERVICE_ROLE_KEY;
  const sbHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!key.startsWith('sb_secret_')) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new CleanupFailure('INVALID_ADMIN_KEY_TYPE'); }
    assert(record(payload) && payload.role === 'service_role' && (!payload.ref || payload.ref === MANIFEST.project), 'INVALID_ADMIN_KEY_TYPE');
    sbHeaders.Authorization = `Bearer ${key}`;
  }
  return {
    supabase: sb.origin,
    evolution: evo.toString().replace(/\/+$/, ''),
    sbHeaders,
    evoHeaders: { apikey: values.EVOLUTION_GLOBAL_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
  };
}

export function parseEvolutionInventory(data) {
  assert(Array.isArray(data) && data.length < 1000, 'EVOLUTION_INVENTORY_SHAPE');
  const found = new Map();
  for (const item of data) {
    assert(record(item), 'EVOLUTION_INVENTORY_SHAPE');
    const nested = record(item.instance) ? item.instance : {};
    const names = [item.name, item.instanceName, nested.instanceName].filter(v => v !== undefined);
    assert(names.length > 0 && names.every(v => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\x00-\x1f]/.test(v)), 'EVOLUTION_INVENTORY_SHAPE');
    assert(new Set(names).size === 1 && !found.has(names[0]), 'EVOLUTION_INVENTORY_DUPLICATE');
    const name = names[0];
    assert(!name.startsWith('ws_c49945db_') || MANIFEST.evolution.includes(name), 'UNEXPECTED_WORKSPACE_INSTANCE');
    const state = item.connectionStatus ?? nested.status ?? item.status ?? null;
    assert(state === null || typeof state === 'string', 'EVOLUTION_INVENTORY_SHAPE');
    const instanceId = item.id ?? nested.instanceId ?? item.instanceId ?? null;
    assert(typeof instanceId === 'string' && UUID.test(instanceId), 'EVOLUTION_INSTANCE_ID_INVALID');
    found.set(name, { state, instanceId });
  }
  return found;
}

export async function runCleanup({ env = process.env, fetchImpl = globalThis.fetch, emit = item => console.log(JSON.stringify(item)), requestTimeoutMs = 15_000, execute = false } = {}) {
  assert(typeof fetchImpl === 'function' && Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 15_000, 'INVALID_RUNTIME');
  assert(typeof execute === 'boolean', 'INVALID_EXECUTION_MODE');
  assert(Date.now() < VALID_UNTIL, 'OPERATION_EXPIRED');
  const config = configuration(env);
  const deadline = Date.now() + RUN_BUDGET_MS;
  let requests = 0;
  const progress = { event: 'SLIM_HANDOFF_CLEANUP', phase: 'preflight', deletedInstances: 0, deletedObjects: 0 };

  async function request(url, method, headers, body, code, allowedStatuses = []) {
    if (method === 'DELETE') assert(execute === true && Date.now() < VALID_UNTIL, 'DELETION_NOT_AUTHORIZED_OR_EXPIRED');
    assert(++requests <= MAX_REQUESTS, 'REQUEST_LIMIT');
    const remaining = deadline - Date.now();
    assert(remaining > 0, 'RUN_DEADLINE');
    const controller = new AbortController();
    let timer;
    const work = async () => {
      let response;
      try {
        response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: controller.signal });
      } catch { throw new CleanupFailure(`${code}_NETWORK`); }
      assert(response && Number.isInteger(response.status), `${code}_RESPONSE`);
      if (response.status >= 300 && response.status < 400) throw new CleanupFailure(`${code}_REDIRECT`, response.status);
      if (!(response.status >= 200 && response.status < 300) && !allowedStatuses.includes(response.status)) throw new CleanupFailure(`${code}_HTTP`, response.status);
      const declared = response.headers.get('content-length');
      assert(declared === null || (/^\d+$/.test(declared) && Number(declared) <= MAX_BYTES), `${code}_RESPONSE_SIZE`);
      const chunks = [];
      let count = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            count += value.byteLength;
            assert(count <= MAX_BYTES, `${code}_RESPONSE_SIZE`);
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      const raw = Buffer.concat(chunks, count).toString('utf8');
      if (!raw.trim()) {
        assert(response.status === 204, `${code}_EMPTY_RESPONSE`);
        return { status: response.status, data: null };
      }
      let data;
      try { data = JSON.parse(raw); } catch { throw new CleanupFailure(`${code}_INVALID_JSON`); }
      return { status: response.status, data };
    };
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new CleanupFailure(`${code}_DEADLINE`)); }, Math.min(requestTimeoutMs, remaining));
    });
    try { return await Promise.race([work(), timeout]); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  const sbGet = async (table, query, code) => (await request(`${config.supabase}/rest/v1/${table}?${new URLSearchParams(query)}`, 'GET', config.sbHeaders, undefined, code)).data;
  const evoGet = async () => parseEvolutionInventory((await request(`${config.evolution}/instance/fetchInstances`, 'GET', config.evoHeaders, undefined, 'EVOLUTION_LIST')).data);

  async function validateAdminAccess() {
    const workspaces = await sbGet('workspaces', { select: 'id', id: `eq.${MANIFEST.workspace}`, limit: '2' }, 'WORKSPACE_READ');
    assert(Array.isArray(workspaces) && workspaces.length === 1 && workspaces[0]?.id === MANIFEST.workspace, 'WORKSPACE_NOT_CONFIRMED');
    const users = `in.(${MANIFEST.admins.join(',')})`;
    const members = await sbGet('workspace_members', { select: 'workspace_id,user_id,role,role_type,access_expires_at', workspace_id: `eq.${MANIFEST.workspace}`, user_id: users, limit: '3' }, 'ADMIN_READ');
    assert(Array.isArray(members) && members.length === 2 && new Set(members.map(v => v?.user_id)).size === 2, 'ADMINS_NOT_CONFIRMED');
    for (const m of members) {
      assert(record(m) && m.workspace_id === MANIFEST.workspace && MANIFEST.admins.includes(m.user_id) && m.role === 'admin' && m.role_type === 'admin' && (m.access_expires_at === null || (typeof m.access_expires_at === 'string' && Date.parse(m.access_expires_at) > Date.now())), 'ADMINS_NOT_CONFIRMED');
    }
    const profiles = await sbGet('profiles', { select: 'id,current_workspace_id', id: users, limit: '3' }, 'PROFILE_READ');
    assert(Array.isArray(profiles) && profiles.length === 2 && new Set(profiles.map(v => v?.id)).size === 2 && profiles.every(v => record(v) && MANIFEST.admins.includes(v.id) && v.current_workspace_id === MANIFEST.workspace), 'ADMIN_WORKSPACE_NOT_CONFIRMED');
  }

  async function scanStorage() {
    const objects = new Map();
    const pending = [{ prefix: MANIFEST.workspace, depth: 0 }];
    const visited = new Set();
    while (pending.length) {
      const { prefix, depth } = pending.shift();
      assert(!visited.has(prefix) && visited.size < MAX_DIRECTORIES && depth <= MAX_DEPTH, 'STORAGE_DIRECTORY_LIMIT');
      visited.add(prefix);
      const { data } = await request(`${config.supabase}/storage/v1/object/list/${MANIFEST.bucket}`, 'POST', config.sbHeaders, { prefix, limit: LIST_LIMIT, offset: 0, sortBy: { column: 'name', order: 'asc' } }, 'STORAGE_LIST');
      assert(Array.isArray(data) && data.length < LIST_LIMIT, 'STORAGE_LIST_SHAPE_OR_LIMIT');
      const names = new Set();
      for (const item of data) {
        assert(record(item) && typeof item.name === 'string' && item.name.length > 0 && !/[\/\\\x00-\x1f]/.test(item.name) && !['.', '..'].includes(item.name) && !names.has(item.name), 'STORAGE_PATH_INVALID');
        names.add(item.name);
        const path = `${prefix}/${item.name}`;
        assert(path.startsWith(`${MANIFEST.workspace}/`) && path.length <= 1024, 'STORAGE_SCOPE_INVALID');
        if (item.id === null && item.metadata === null) {
          pending.push({ prefix: path, depth: depth + 1 });
          continue;
        }
        assert(typeof item.id === 'string' && UUID.test(item.id) && MANIFEST.objectIds.includes(item.id) && !objects.has(item.id), 'UNEXPECTED_STORAGE_OBJECT');
        objects.set(item.id, path);
      }
    }
    return objects;
  }

  function validateEvolutionMutation(result, code) {
    if (result.status === 204) return;
    assert(record(result.data), `${code}_RESPONSE_SHAPE`);
    // A 404 is only absence for an exact requested name; the final full inventory is authoritative.
    if (result.status === 404) {
      assert(result.data.status === 404 || result.data.statusCode === 404, `${code}_NOT_FOUND_SHAPE`);
      return;
    }
    assert(result.data.error !== true && (result.data.error === undefined || result.data.error === null || result.data.error === false), `${code}_PROVIDER_ERROR`);
    assert(result.data.status === 'SUCCESS' || result.data.success === true || (record(result.data.response) && typeof result.data.response.message === 'string'), `${code}_RESPONSE_SHAPE`);
  }

  try {
    // Finish all read-only scope checks before the first DELETE.
    await validateAdminAccess();
    const beforeEvolution = await evoGet();
    const beforeStorage = await scanStorage();
    const activeTargets = MANIFEST.evolution.filter(name => beforeEvolution.has(name));
    emit({ ...progress, phase: 'preflight_passed', targetInstancesPresent: activeTargets.length, targetInstancesAlreadyAbsent: MANIFEST.evolution.length - activeTargets.length, targetObjectsPresent: beforeStorage.size, targetObjectsAlreadyAbsent: MANIFEST.objectIds.length - beforeStorage.size, adminsConfirmed: 2 });
    if (!execute) {
      const summary = { ...progress, phase: 'dry_run', targetInstancesPresent: activeTargets.length, targetObjectsPresent: beforeStorage.size, adminsConfirmed: 2, requests };
      emit(summary);
      return summary;
    }

    progress.phase = 'evolution_delete';
    for (const name of activeTargets) {
      const encoded = encodeURIComponent(name);
      const current = (await evoGet()).get(name);
      if (!current) continue;
      assert(current.instanceId === beforeEvolution.get(name).instanceId, 'EVOLUTION_INSTANCE_REPLACED');
      const state = current.state;
      // Already closed instances have no active WhatsApp login to revoke.
      if (!['close', 'closed', 'disconnected'].includes(String(state).toLowerCase())) {
        validateEvolutionMutation(await request(`${config.evolution}/instance/logout/${encoded}`, 'DELETE', config.evoHeaders, undefined, 'EVOLUTION_LOGOUT', [404]), 'EVOLUTION_LOGOUT');
      }
      validateEvolutionMutation(await request(`${config.evolution}/instance/delete/${encoded}`, 'DELETE', config.evoHeaders, undefined, 'EVOLUTION_DELETE', [404]), 'EVOLUTION_DELETE');
      progress.deletedInstances += 1;
    }
    const afterEvolution = await evoGet();
    assert(MANIFEST.evolution.every(name => !afterEvolution.has(name)), 'EVOLUTION_TARGET_STILL_PRESENT');
    for (const name of beforeEvolution.keys()) {
      if (!MANIFEST.evolution.includes(name)) assert(afterEvolution.has(name), 'EVOLUTION_UNRELATED_INSTANCE_CHANGED');
    }
    emit({ ...progress, phase: 'evolution_verified', remainingTargetInstances: 0 });

    progress.phase = 'storage_delete';
    // Reconcile names/IDs again immediately before deleting by path.
    const currentStorage = await scanStorage();
    for (const [id, path] of currentStorage) assert(beforeStorage.get(id) === path, 'STORAGE_INVENTORY_CHANGED');
    if (currentStorage.size > 0) {
      const { data, status } = await request(`${config.supabase}/storage/v1/object/${MANIFEST.bucket}`, 'DELETE', config.sbHeaders, { prefixes: [...currentStorage.values()] }, 'STORAGE_DELETE');
      assert(status !== 204 && Array.isArray(data), 'STORAGE_DELETE_RECEIPT_SHAPE');
      const returned = new Set();
      for (const item of data) {
        assert(record(item) && currentStorage.has(item.id) && item.name === currentStorage.get(item.id) && (!own(item, 'bucket_id') || item.bucket_id === MANIFEST.bucket) && !returned.has(item.id), 'STORAGE_DELETE_RECEIPT_SCOPE');
        returned.add(item.id);
      }
      // Concurrent prior deletion can yield fewer receipts; the fresh final listing decides success.
      progress.deletedObjects = returned.size;
    }
    const afterStorage = await scanStorage();
    assert(afterStorage.size === 0, 'STORAGE_TARGET_STILL_PRESENT');
    await validateAdminAccess();
    const finalEvolution = await evoGet();
    assert(MANIFEST.evolution.every(name => !finalEvolution.has(name)), 'EVOLUTION_TARGET_REAPPEARED');
    for (const name of beforeEvolution.keys()) {
      if (!MANIFEST.evolution.includes(name)) assert(finalEvolution.has(name), 'EVOLUTION_UNRELATED_INSTANCE_CHANGED');
    }
    const summary = { ...progress, phase: 'complete', remainingTargetInstances: 0, remainingTargetObjects: 0, adminsConfirmed: 2, requests };
    emit(summary);
    return summary;
  } catch (error) {
    emit({ ...progress, phase: 'failed', failedPhase: progress.phase, code: error instanceof CleanupFailure ? error.code : 'UNEXPECTED_FAILURE', ...(error instanceof CleanupFailure && Number.isInteger(error.status) ? { httpStatus: error.status } : {}), requests });
    throw error instanceof CleanupFailure ? error : new CleanupFailure('UNEXPECTED_FAILURE');
  }
}

// Compatible with direct .mjs execution and the exact same source passed to node --input-type=module -e.
// Importing this file from a separate local mock test does not execute the cleanup.
if (!process.argv[1] || [EXECUTE_ARGUMENT, 'dry-run'].includes(process.argv[1]) || import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runCleanup({ execute: process.argv.slice(1).includes(EXECUTE_ARGUMENT) }); }
  catch (error) {
    console.error(JSON.stringify({ event: 'SLIM_HANDOFF_CLEANUP_EXIT', ok: false, code: error instanceof CleanupFailure ? error.code : 'UNEXPECTED_FAILURE' }));
    process.exitCode = 1;
  }
}
