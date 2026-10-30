import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { resolveSlimInboxGroupTarget } from '../src/lib/slim-inbox-group-target.core.ts';
import { resolveOrCreateGroupTechnicalLead } from '../src/lib/whatsapp-group-context.server.ts';
import { assertSlimOperator } from '../src/lib/slim-workspace-operator.server.ts';
import { whatsappIdentityFromJid } from '../src/lib/whatsapp-identity.ts';

const W = '11111111-1111-4111-8111-111111111111';
const W2 = '99999999-9999-4999-8999-999999999999';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const G = '44444444-4444-4444-8444-444444444444';
const L = '55555555-5555-4555-8555-555555555555';
const BOT = '66666666-6666-4666-8666-666666666666';
const JID = '120363000000000000@g.us';
const key = session => session + '|' + JID;
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
let passed = 0;
async function check(name, run) { await run(); passed++; console.log('PASS Inbox group target: ' + name); }

function fakeDb(overrides = {}, failures = {}) {
  const tables = {
    profiles: [{ id: 'actor', current_workspace_id: W }],
    workspaces: [{ id: W, owner_id: 'actor' }],
    workspace_members: [],
    whatsapp_web_sessions: [
      { id: A, workspace_id: W, provider: 'evolution', status: 'conectado' },
      { id: B, workspace_id: W, provider: 'evolution', status: 'conectado' },
    ],
    whatsapp_groups: [],
    whatsapp_web_messages: [
      { id: 'old-a', workspace_id: W, session_id: A, remote_jid: JID, received_at: '2026-10-16T10:00:00Z' },
      { id: 'new-b', workspace_id: W, session_id: B, remote_jid: JID, received_at: '2026-10-17T10:00:00Z' },
    ],
    leads: [], salesbot_runs: [],
    salesbots: [{ id: BOT, workspace_id: W, name: 'Grupo', scope: 'grupo', is_active: true }],
    crm_sources: [{ id: 'source', workspace_id: W, provider: 'whatsapp', external_account_id: A, is_default: true }],
    ...structuredClone(overrides),
  };
  const calls = [], writes = [];
  function value(row, column) {
    const [parent, child] = column.split('->>');
    if (child) { const v = row[parent]?.[child]; return v == null ? null : String(v); }
    return row[column];
  }
  const db = { tables, calls, writes, from(table) {
    const filters = []; let count = Infinity, order, pending;
    const execute = single => {
      if (failures[table]) return { data: null, error: { message: 'synthetic database failure' } };
      if (pending) {
        const row = { id: 'created-' + (writes.length + 1), ...structuredClone(pending) };
        (tables[table] ??= []).push(row); writes.push({ table, row }); pending = null;
        return { data: single ? row : [row], error: null };
      }
      let rows = (tables[table] ?? []).filter(row => filters.every(fn => fn(row)));
      if (order) rows = rows.slice().sort((a, b) => String(value(a, order.column) ?? '').localeCompare(String(value(b, order.column) ?? '')) * (order.ascending ? 1 : -1));
      rows = rows.slice(0, count);
      if (single && rows.length > 1) return { data: null, error: { message: 'multiple rows' } };
      return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const q = {
      select() { return q; },
      eq(column, wanted) { calls.push({ table, column, wanted }); filters.push(row => value(row, column) === wanted); return q; },
      in(column, wanted) { filters.push(row => wanted.includes(value(row, column))); return q; },
      order(column, options = {}) { order = { column, ascending: options.ascending !== false }; return q; },
      limit(n) { count = n; return q; },
      insert(row) { pending = row; return q; },
      maybeSingle() { return Promise.resolve(execute(true)); },
      single() { return Promise.resolve(execute(true)); },
      then(ok, bad) { return Promise.resolve(execute(false)).then(ok, bad); },
    };
    return q;
  } };
  return db;
}

function evaluate(code, bindings) {
  const parsed = ts.createSourceFile('isolated.ts', code, ts.ScriptTarget.Latest, true);
  assert.equal(parsed.parseDiagnostics.length, 0, 'extracted source syntax');
  const context = vm.createContext(bindings);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

function handlers(db) {
  let code = read('src/lib/inbox-group-salesbot.functions.ts').split('async function loadActiveWorkspace(')[1];
  code = 'async function loadActiveWorkspace(' + code;
  code = code.replaceAll('export const ', 'globalThis.');
  code = code.replace('await import("./slim-workspace-operator.server")', 'testIntegrations');
  const imports = code.indexOf('    const [{ supabaseAdmin }, { resolveOrCreateGroupTechnicalLead }, { startSalesbotRun }]');
  const next = code.indexOf('    const admin = supabaseAdmin', imports);
  assert(imports >= 0 && next > imports);
  code = code.slice(0, imports) + '    const {supabaseAdmin,resolveOrCreateGroupTechnicalLead,startSalesbotRun}=testIntegrations;\n' + code.slice(next);
  const starts = [];
  const result = evaluate(code, {
    ACTIVE_RUN_STATUSES: ['running', 'waiting_message', 'waiting_timer'],
    resolveSlimInboxGroupTarget,
    requireSupabaseAuth: {},
    createServerFn: () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn) { return fn; } }),
    testIntegrations: { supabaseAdmin: db, resolveOrCreateGroupTechnicalLead, assertSlimOperator,
      startSalesbotRun: async (_db, params) => { starts.push(params); return 'synthetic-run'; } },
  });
  return { starts, read: conversationId => result.resolveInboxSalesbotTarget({ data: { conversationId }, context: { supabase: db, userId: 'actor' } }),
    start: conversationId => result.startGroupSalesbotFromInbox({ data: { conversationId, salesbotId: BOT }, context: { supabase: db, userId: 'actor' } }) };
}

await check('historical groups resolve without creating metadata', async () => {
  const db = fakeDb();
  const target = await resolveSlimInboxGroupTarget(db, W, key(A));
  assert.equal(target.id, null); assert.equal(target.group_jid, JID); assert.equal(target.session_id, A);
  assert.equal(target.conversation_key, key(A)); assert.equal(db.writes.length, 0);
});
await check('the same group on two sessions keeps two exact targets', async () => {
  const db = fakeDb();
  const [one, two] = await Promise.all([resolveSlimInboxGroupTarget(db, W, key(A)), resolveSlimInboxGroupTarget(db, W, key(B))]);
  assert.equal(one.session_id, A); assert.equal(two.session_id, B);
  assert.notEqual(one.conversation_key, two.conversation_key);
});
await check('metadata UUID resolves and checks its owning session', async () => {
  const db = fakeDb({ whatsapp_groups: [{ id: G, workspace_id: W, session_id: A, group_jid: JID, name: 'Grupo A', subject: null }] });
  const target = await resolveSlimInboxGroupTarget(db, W, G);
  assert.equal(target.id, G); assert.equal(target.name, 'Grupo A'); assert.equal(target.session_id, A);
});
await check('other workspace or absent group fails closed', async () => {
  await assert.rejects(resolveSlimInboxGroupTarget(fakeDb(), W2, key(A)), /sessão do grupo/);
  await assert.rejects(resolveSlimInboxGroupTarget(fakeDb(), W, A + '|120363999999999999@g.us'), /Grupo não encontrado/);
});
await check('malformed and sessionless group references never become leads', async () => {
  const h = handlers(fakeDb());
  for (const id of ['broken|' + JID, '|' + JID, JID, A + '|contact@s.whatsapp.net']) await assert.rejects(h.read(id));
});
await check('group lookup failure is explicit and has no writes', async () => {
  const db = fakeDb({}, { whatsapp_groups: true });
  await assert.rejects(handlers(db).read(key(A)), /identificar o grupo/); assert.equal(db.writes.length, 0);
});
await check('individual conversation does not query group tables', async () => {
  const db = fakeDb({ leads: [{ id: L, workspace_id: W }] }, { whatsapp_groups: true });
  const target = await handlers(db).read(L);
  assert.equal(target.kind, 'lead'); assert.equal(target.workspaceId, W);
  assert(!db.calls.some(call => call.table === 'whatsapp_groups'));
});
await check('recovered group returns group controls with workspace and session', async () => {
  const result = await handlers(fakeDb()).read(key(A));
  assert.equal(result.kind, 'group'); assert.equal(result.workspaceId, W); assert.equal(result.sessionId, A);
});
await check('active bot lookup cannot pick another session technical lead', async () => {
  const leads = [A, B].map((session, i) => ({ id: 'technical-' + i, workspace_id: W, phone: JID,
    custom_data: { technical_group_context: true, whatsapp_session_id: session } }));
  const runs = leads.map((lead, i) => ({ id: 'run-' + i, workspace_id: W, lead_id: lead.id, status: 'running', started_at: String(i) }));
  const h = handlers(fakeDb({ leads, salesbot_runs: runs }));
  assert.equal((await h.read(key(A))).activeRunId, 'run-0');
  assert.equal((await h.read(key(B))).activeRunId, 'run-1');
});
await check('offline group remains readable but cannot start a bot', async () => {
  const db = fakeDb({ whatsapp_web_sessions: [{ id: A, workspace_id: W, provider: 'evolution', status: 'desconectado' }] });
  const h = handlers(db); assert.equal((await h.read(key(A))).kind, 'group');
  await assert.rejects(h.start(key(A)), /Conecte a sessão de origem/);
  assert.equal(h.starts.length, 0); assert.equal(db.writes.length, 0);
});
await check('viewer cannot start even when the group exists', async () => {
  const db = fakeDb({ workspaces: [{ id: W, owner_id: 'someone-else' }],
    workspace_members: [{ workspace_id: W, user_id: 'actor', role_type: 'visualizador' }] });
  const h = handlers(db); await assert.rejects(h.start(key(A)), /Sem permissão/);
  assert.equal(h.starts.length, 0); assert.equal(db.writes.length, 0);
});
await check('a bot from another workspace cannot be started', async () => {
  const db = fakeDb({ salesbots: [{ id: BOT, workspace_id: W2, scope: 'grupo', is_active: true }] });
  const h = handlers(db); await assert.rejects(h.start(key(A)), /SalesBot de grupo não encontrado/);
  assert.equal(h.starts.length, 0); assert.equal(db.writes.length, 0);
});
await check('manual start supplies exact group context and does not create group metadata', async () => {
  const db = fakeDb(); const h = handlers(db);
  await h.start(key(A)); await h.start(key(B));
  const groupLeads = db.tables.leads;
  assert.equal(groupLeads.length, 2); assert.notEqual(h.starts[0].leadId, h.starts[1].leadId);
  for (let i = 0; i < 2; i++) {
    const session = [A, B][i];
    assert.equal(groupLeads[i].custom_data.whatsapp_session_id, session);
    assert.equal(groupLeads[i].custom_data.whatsapp_group_jid, JID);
    assert.equal(groupLeads[i].source, 'whatsapp_group'); assert.equal(groupLeads[i].phone_normalized, null);
    assert.equal(h.starts[i].initialVariables.group_inbox_conversation_key, key(session));
  }
  assert.equal(db.tables.whatsapp_groups.length, 0); assert.equal(db.tables.whatsapp_web_messages.length, 2);
});

const sessionSource = read('src/lib/whatsapp-session-routing.server.ts');
const sessionCode = sessionSource.slice(sessionSource.indexOf('export async function resolveLeadEvolutionSession('), sessionSource.indexOf('export type LeadWhatsappConversationIdentity'))
  .replace('export async function resolveLeadEvolutionSession(', 'globalThis.resolveLeadEvolutionSession=async function(');
const { resolveLeadEvolutionSession } = evaluate(sessionCode, {});
const runtimeSource = read('src/lib/salesbot-runtime.server.ts');
const routeCode = runtimeSource.slice(runtimeSource.indexOf('async function resolveRuntimeWhatsappTarget('), runtimeSource.indexOf('async function sendLeadWhatsappText('))
  .replace('async function resolveRuntimeWhatsappTarget(', 'globalThis.route=async function(');
const router = evaluate(routeCode, { whatsappIdentityFromJid, resolveLeadEvolutionSession,
  findLatestLeadWhatsappIdentity: async () => { throw new Error('must not read another session history'); } });
await check('group runtime keeps the explicit session before inspecting newer history', async () => {
  const db = fakeDb({ leads: [{ id: L, workspace_id: W, phone: JID,
    custom_data: { technical_group_context: true, whatsapp_group_jid: JID, whatsapp_session_id: A } }] });
  const result = await router.route(db, W, L, JID);
  assert.equal(result.sessionId, A); assert.equal(result.remoteJid, JID);
  assert(!db.calls.some(call => call.table === 'whatsapp_web_messages'));
});
await check('group runtime rejects mismatched group or disconnected origin', async () => {
  const leads = [{ id: L, workspace_id: W,
    custom_data: { technical_group_context: true, whatsapp_group_jid: JID, whatsapp_session_id: A } }];
  await assert.rejects(router.route(fakeDb({ leads }), W, L, '120363999999999999@g.us'), /não corresponde/);
  await assert.rejects(router.route(fakeDb({ leads, whatsapp_web_sessions: [
    { id: B, workspace_id: W, provider: 'evolution', status: 'conectado' },
  ] }), W, L, JID), /sessão correta/);
});
await check('pending target UI does not mount individual agent controls', () => {
  const ui = read('src/components/inbox/InboxLeadRouteEnhancements.tsx');
  assert(ui.indexOf('if (!resolved) return <AutomationTargetFeedback') < ui.indexOf('return <ClientAutomationControls'));
  assert(ui.includes('if (resolved?.kind === "group") return <LegacyGroupControls'));
});

function groupRules(db) {
  const source = read('src/lib/whatsapp-group-rules.server.ts');
  const code = source.slice(source.indexOf('export async function dispatchGroupEvent('))
    .replace('export async function dispatchGroupEvent(', 'globalThis.dispatch=async function(')
    .replaceAll('await import("./salesbot-runtime.server")', 'testRuntime');
  const messages = [], starts = [];
  const result = evaluate(code, {
    adminClient: () => db, resolveOrCreateGroupTechnicalLead,
    testRuntime: {
      sendWhatsappText: async (...args) => { messages.push(args); },
      startSalesbotRun: async (_db, params) => { starts.push(params); return 'synthetic-rule-run'; },
    },
  });
  return { messages, starts, dispatch: result.dispatch };
}
function groupWithRule(session, config, workspace = W) {
  return { id: 'metadata-' + session + workspace, workspace_id: workspace, session_id: session, group_jid: JID,
    rules: { triggers: [{ id: 'rule-' + session, type: 'all_messages', enabled: true, config }] }, is_admin: false };
}
await check('group rules select the exact workspace and originating session', async () => {
  const db = fakeDb({ whatsapp_groups: [
    groupWithRule(A, { type: 'send_message', message: 'A only' }),
    groupWithRule(B, { type: 'send_message', message: 'B only' }),
    groupWithRule(B, { type: 'send_message', message: 'other workspace' }, W2),
  ] });
  const rules = groupRules(db);
  await rules.dispatch({ workspaceId: W, sessionId: B, groupJid: JID, type: 'message', text: 'test' });
  assert.equal(rules.messages.length, 1);
  assert.equal(rules.messages[0][1], W); assert.equal(rules.messages[0][2], JID);
  assert.equal(rules.messages[0][3], 'B only'); assert.equal(rules.messages[0][4], B);
  await rules.dispatch({ workspaceId: W, sessionId: A, groupJid: JID, type: 'message' });
  assert.equal(rules.messages.length, 2); assert.equal(rules.messages[1][3], 'A only');
  assert.equal(rules.messages[1][4], A);
  const absent = await rules.dispatch({ workspaceId: W, sessionId: G, groupJid: JID, type: 'message' });
  assert.equal(absent.status, 'no_rules'); assert.equal(rules.messages.length, 2);
});
await check('group rule direct message keeps the participant and originating session', async () => {
  const rules = groupRules(fakeDb({ whatsapp_groups: [groupWithRule(B, { type: 'send_dm', message: 'synthetic DM' })] }));
  await rules.dispatch({ workspaceId: W, sessionId: B, groupJid: JID, type: 'message', senderPhone: '5511999999999' });
  assert.equal(rules.messages.length, 1); assert.equal(rules.messages[0][2], '5511999999999');
  assert.equal(rules.messages[0][4], B);
});
await check('first rule-triggered bot creates the context for its own session', async () => {
  const db = fakeDb({ whatsapp_groups: [groupWithRule(B, { type: 'start_bot', botId: BOT })], leads: [
    { id: L, workspace_id: W, phone: JID, custom_data: { technical_group_context: true, whatsapp_session_id: A } },
  ] });
  const rules = groupRules(db);
  await rules.dispatch({ workspaceId: W, sessionId: B, groupJid: JID, type: 'message', senderName: 'Synthetic' });
  assert.equal(rules.starts.length, 1); assert.notEqual(rules.starts[0].leadId, L);
  const lead = db.tables.leads.find(row => row.id === rules.starts[0].leadId);
  assert.equal(lead.custom_data.whatsapp_session_id, B); assert.equal(lead.phone, JID);
  assert.equal(rules.starts[0].initialVariables.participante_nome, 'Synthetic');
  assert.equal(rules.messages.length, 0);
});

await check('PostgreSQL contact indexes allow distinct session contexts for the same group', async () => {
  const pg = new PGlite();
  try {
    // Use the real leads DDL and both versioned uniqueness indexes; only parent tables are minimal fixtures.
    const baseline = read('supabase/migrations/20261012184640_saude_slim_core_baseline.sql');
    const leadDdl = baseline.match(/create table if not exists public\.leads \([\s\S]*?\n\);/i)?.[0];
    const externalIndex = baseline.match(/create unique index if not exists leads_external_uniq[^;]+;/i)?.[0];
    const phoneFunction = read('supabase/migrations/20261016130000_slim_contact_identity.sql')
      .match(/CREATE FUNCTION public\.slim_contact_phone_key[\s\S]*?\$f\$;/)?.[0];
    const phoneIndex = read('supabase/migrations/20261016130100_slim_contact_identity_unique.sql')
      .match(/CREATE UNIQUE INDEX slim_active_contact_phone_identity[\s\S]*?;/)?.[0];
    assert(leadDdl && externalIndex && phoneFunction && phoneIndex, 'versioned leads DDL and unique indexes are present');
    for (const table of ['workspaces', 'crm_sources', 'pipelines', 'pipeline_stages', 'companies', 'profiles']) {
      await pg.exec('CREATE TABLE public.' + table + '(id uuid PRIMARY KEY)');
    }
    await pg.exec([leadDdl, externalIndex, phoneFunction, phoneIndex].join('\n'));
    // Additional live index observed in read-only production inspection, 2026-10-17.
    await pg.exec("CREATE UNIQUE INDEX leads_wa_workspace_phone_active_unique ON public.leads(workspace_id,phone_normalized) WHERE source='whatsapp' AND merged_into_id IS NULL AND phone_normalized IS NOT NULL");
    await pg.query('INSERT INTO public.workspaces(id) VALUES ($1)', [W]);
    for (const session of [A, B]) {
      await pg.query('INSERT INTO public.leads(workspace_id,name,phone,custom_data,source) VALUES($1,$2,$3,$4,$5)',
        [W, 'Synthetic group', JID, JSON.stringify({ technical_group_context: true, whatsapp_session_id: session }), 'whatsapp_group']);
    }
    const groups = await pg.query('SELECT custom_data->>\'whatsapp_session_id\' AS session_id FROM public.leads WHERE workspace_id=$1 AND phone=$2 ORDER BY session_id', [W, JID]);
    assert.deepEqual(groups.rows.map(row => row.session_id), [A, B]);
    assert.equal((await pg.query('SELECT public.slim_contact_phone_key($1) AS key', [JID])).rows[0].key, null);
    // Even a legacy trigger filling normalized digits cannot collide while the explicit group source is preserved.
    await pg.query('UPDATE public.leads SET phone_normalized=$1 WHERE workspace_id=$2 AND phone=$3', ['120363000000000000', W, JID]);
    await pg.query('INSERT INTO public.leads(workspace_id,name,phone) VALUES($1,$2,$3)', [W, 'Synthetic contact', '5511888888888']);
    await assert.rejects(pg.query('INSERT INTO public.leads(workspace_id,name,phone) VALUES($1,$2,$3)', [W, 'Duplicate contact', '5511888888888']),
      error => error.code === '23505' && error.message.includes('slim_active_contact_phone_identity'));
    await pg.query("INSERT INTO public.leads(workspace_id,name,phone,phone_normalized,source) VALUES($1,$2,$3,$4,'whatsapp')", [W, 'Synthetic WhatsApp contact', '5511777777777', '5511777777777']);
    await assert.rejects(pg.query("INSERT INTO public.leads(workspace_id,name,phone,phone_normalized,source) VALUES($1,$2,$3,$4,'whatsapp')", [W, 'Duplicate normalized contact', '5511666666666', '5511777777777']),
      error => error.code === '23505' && error.message.includes('leads_wa_workspace_phone_active_unique'));
  } finally { await pg.close(); }
});
console.log(`${passed}/${passed} Inbox group target checks. Synthetic database only; no real bot or WhatsApp call.`);
