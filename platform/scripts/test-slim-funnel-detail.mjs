import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { SLIM_LEAD_ACTIVITY_META_SELECT, slimProjectedActivity } from '../src/lib/slim-inbox-lazy-media.core.ts';

const file = new URL('../src/lib/leads.functions.legacy.ts', import.meta.url);
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const wanted = new Set(['loadActiveWorkspace', 'displayCustomValue', 'getLeadDetail']);
const selected = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) ? wanted.has(node.name?.text) :
  ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => wanted.has(decl.name.getText(ast))));
assert.equal(selected.length, 3, 'the real getter and its unchanged helpers must be executed');
const compiled = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const exports = {};
let middleware;
vm.runInNewContext(compiled.outputText, {
  exports, z, Date, Promise, SLIM_LEAD_ACTIVITY_META_SELECT, slimProjectedActivity,
  attachSupabaseAuth: 'attach', requireSupabaseAuth: 'required',
  createServerFn: () => ({
    middleware(value) { middleware = value; return this; },
    inputValidator(value) { this.validate = value; return this; },
    handler(fn) { const validate = this.validate; return input => fn({ ...input, data: validate(input.data) }); },
  }),
});
assert.deepEqual(Array.from(middleware), ['attach', 'required']);

const WS = 'c49945db-1960-461a-9339-a43b8403bdd9';
const OTHER_WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-222222222222';
const RESPONSIBLE = '33333333-3333-4333-8333-333333333333';
const base = {
  id: LEAD, workspace_id: WS, name: 'Contato de teste', email: null, phone: '+5511999999999', value: 59.97,
  stage_id: null, pipeline_id: null, crm_source_id: null, external_id: null, tags: ['Teste'],
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-17T00:00:00Z', keep_files: false,
  responsible_id: RESPONSIBLE, status: 'active', source: 'whatsapp',
  conversation_status: 'fechada', last_message_from: 'us',
  public_address: ' Rua de teste, 10 ', public_notes: ' Observação pública ',
  public_address_fallback: null, public_notes_fallback: null,
  custom_data: { integration_token: 'must-not-leak', media: 'base64-must-not-leak' },
};
function db(options = {}) {
  const calls = [];
  const tables = {
    profiles: [{ id: ACTOR, current_workspace_id: WS }, { id: RESPONSIBLE, display_name: 'Responsável de teste', full_name: 'Nome completo', email: 'must-not-leak' }],
    leads: [{ ...base, ...options.lead }],
    workspaces: [{ id: WS, owner_id: options.owner ?? ACTOR }],
    workspace_members: options.member === false ? [] : [{ workspace_id: WS, user_id: RESPONSIBLE }],
    lead_custom_field_values: [{ workspace_id: WS, lead_id: LEAD, value: { display: 'Valor público' }, lead_custom_fields: { id: 'f1', name: 'Campo de teste', field_type: 'text' } }],
    lead_activities: [],
  };
  return { calls, from(table) {
    let fields, filters = [];
    const result = () => {
      calls.push({ table, fields, filters: [...filters] });
      if (options.fail === table) return { data: null, error: { message: 'Synthetic read failure' } };
      const rows = (tables[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value));
      return { data: rows, error: null };
    };
    return {
      select(value) { fields = value; return this; }, eq(key, value) { filters.push([key, value]); return this; },
      order() { return this; }, limit() { return this; },
      maybeSingle() { const r = result(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
  } };
}
const get = (database, input = {}) => exports.getLeadDetail({ data: { leadId: LEAD, includeActivities: false, ...input }, context: { supabase: database, userId: ACTOR } });
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

await test('real getter preserves identity, pipeline data, custom fields and public additions', async () => {
  const database = db(), result = await get(database);
  assert.equal(result.workspaceId, WS); assert.equal(result.actorId, ACTOR); assert.equal(result.lead.id, LEAD);
  assert.equal(result.lead.name, base.name); assert.equal(result.lead.value, 59.97); assert.equal(result.lead.customFields[0].displayValue, 'Valor público');
  assert.equal(result.lead.status, 'active'); assert.equal(result.lead.source, 'whatsapp');
  assert.equal(result.lead.conversationStatus, 'fechada'); assert.equal(result.lead.lastMessageFrom, 'us');
  assert.equal(result.lead.address, 'Rua de teste, 10'); assert.equal(result.lead.notes, 'Observação pública');
  assert.equal(result.lead.responsibleId, RESPONSIBLE); assert.equal(result.lead.responsibleName, 'Responsável de teste');
});
await test('no complete custom_data or private profile fields are selected or returned', async () => {
  const database = db(), result = await get(database), serialized = JSON.stringify(result);
  assert(!serialized.includes('must-not-leak')); assert(!serialized.includes('integration_token')); assert(!('custom_data' in result.lead));
  const select = database.calls.find(call => call.table === 'leads').fields;
  assert(!select.split(',').some(field => field.trim() === 'custom_data'));
  assert(select.includes('public_address:custom_data->endereco'));
  const profile = database.calls.find(call => call.table === 'profiles' && call.fields !== 'current_workspace_id');
  assert.equal(profile.fields, 'display_name,full_name');
});
await test('the workspace comes from the authenticated actor, not extra input', async () => {
  const result = await get(db(), { workspaceId: OTHER_WS, actorId: RESPONSIBLE });
  assert.equal(result.workspaceId, WS); assert.equal(result.actorId, ACTOR);
});
await test('cross-workspace lead is rejected before related data or profile names', async () => {
  const database = db({ lead: { workspace_id: OTHER_WS } });
  await assert.rejects(get(database), /Lead não encontrado/);
  assert(database.calls.every(call => ['profiles', 'leads'].includes(call.table)));
});
await test('invalid UUID is rejected by the real validator before reads', async () => {
  const database = db(); await assert.rejects(async () => get(database, { leadId: 'not-a-uuid' })); assert.equal(database.calls.length, 0);
});
await test('includeActivities false never fetches the conversation again', async () => {
  const database = db(), result = await get(database);
  assert.equal(result.activities.length, 0); assert(!database.calls.some(call => call.table === 'lead_activities'));
});
await test('explicit history request keeps its previous response contract', async () => {
  const database = db(), result = await get(database, { includeActivities: true });
  assert.equal(result.activities.length, 0); assert(database.calls.some(call => call.table === 'lead_activities'));
});
await test('the responsible profile must belong to this workspace', async () => {
  const database = db({ member: false }), result = await get(database);
  assert.equal(result.lead.responsibleName, null);
  assert(!database.calls.some(call => call.table === 'profiles' && call.fields !== 'current_workspace_id'));
});
await test('the owner label works even without a membership row', async () => {
  assert.equal((await get(db({ member: false, owner: RESPONSIBLE }))).lead.responsibleName, 'Responsável de teste');
});
await test('an unassigned lead does not read workspace or team profiles', async () => {
  const database = db({ lead: { responsible_id: null } }), result = await get(database);
  assert.equal(result.lead.responsibleId, null); assert.equal(result.lead.responsibleName, null);
  assert(!database.calls.some(call => ['workspace_members', 'workspaces'].includes(call.table)));
});
await test('responsible membership failures do not produce a fabricated label', async () => {
  await assert.rejects(get(db({ fail: 'workspace_members' })), /conferir o responsável/);
});
await test('only text leaves are exposed, with public legacy fallbacks', async () => {
  const result = await get(db({ lead: { public_address: { secret: 'must-not-leak' }, public_notes: ['must-not-leak'], public_address_fallback: 'Endereço público', public_notes_fallback: 'Nota pública' } }));
  assert.equal(result.lead.address, 'Endereço público'); assert.equal(result.lead.notes, 'Nota pública');
  assert(!JSON.stringify(result).includes('must-not-leak'));
});
await test('empty optional fields remain empty and long public notes are bounded', async () => {
  const result = await get(db({ lead: { public_address: ' ', public_notes: 'a'.repeat(5000) } }));
  assert.equal(result.lead.address, null); assert.equal(result.lead.notes.length, 4000);
});
await test('source and status stay explicit for group and closed-contact UI', async () => {
  const result = await get(db({ lead: { source: 'whatsapp_group', status: 'won' } }));
  assert.equal(result.lead.source, 'whatsapp_group'); assert.equal(result.lead.status, 'won');
});
await test('all business reads remain bound to the requested workspace and lead', async () => {
  const database = db(); await get(database);
  for (const call of database.calls.filter(call => ['leads', 'lead_custom_field_values', 'workspace_members'].includes(call.table))) {
    assert(call.filters.some(([key, value]) => key === 'workspace_id' && value === WS));
  }
  assert(database.calls.find(call => call.table === 'lead_custom_field_values').filters.some(([key, value]) => key === 'lead_id' && value === LEAD));
});
console.log(`${count}/${count} funnel detail checks passed`);
