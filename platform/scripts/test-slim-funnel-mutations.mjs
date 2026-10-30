import assert from 'node:assert/strict';
import {
  createSlimFunnelLead, bulkMoveSlimFunnelLeads,
  slimCreateFunnelLeadSchema, slimBulkFunnelMoveSchema,
  SLIM_FUNNEL_WRITE_TIMEOUT_MS,
  SLIM_EXISTING_CONTACT_MESSAGE,
} from '../src/lib/slim-funnel-mutations.core.ts';

const id = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ws = id(1), lead = id(2), event = id(3);
const create = { crmSourceId: id(4), pipelineId: id(5), stageId: id(6), name: ' Cliente teste ', requestId: id(7) };
const move = { leadIds: [id(9), lead], toStageId: id(6), requestId: id(8) };
const created = { ok: true, id: lead, leadId: lead, eventId: event };
const moved = { ok: true, count: 2, movedCount: 1, unchangedCount: 1, eventIds: [event] };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS funnel write: ' + name); }
function database(result, options = {}) {
  const calls = [];
  return { calls, rpc(name, args) {
    calls.push({ name, args });
    return { async abortSignal(signal) {
      assert(signal instanceof AbortSignal);
      assert.equal(signal.aborted, false);
      if (options.throws) throw new Error('Transport unavailable');
      return { data: result, error: options.error ?? null };
    } };
  } };
}

await test('manual creation uses one scoped RPC with a stable request', async () => {
  const db = database(created);
  const result = await createSlimFunnelLead(db, ws, create);
  assert.deepEqual(result, { id: lead, leadId: lead, eventId: event, automationQueued: true });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0], { name: 'slim_create_lead_and_emit', args: {
    _workspace_id: ws, _crm_source_id: create.crmSourceId, _pipeline_id: create.pipelineId,
    _stage_id: create.stageId, _name: 'Cliente teste', _email: null, _phone: null, _value: 0,
    _request_id: create.requestId,
  } });
});
await test('creation preserves optional input without emitting an inline bot', async () => {
  const db = database(created);
  await createSlimFunnelLead(db, ws, { ...create, email: ' example@example.test ', phone: ' +5511999990000 ', value: 99.5 });
  assert.equal(db.calls[0].args._email, 'example@example.test');
  assert.equal(db.calls[0].args._phone, '+5511999990000');
  assert.equal(db.calls[0].args._value, 99.5);
});
await test('an existing phone reports the preserved contact without retrying', async () => {
  const db = database(null, { error: { code: '23505', message: SLIM_EXISTING_CONTACT_MESSAGE } });
  await assert.rejects(createSlimFunnelLead(db, ws, create), { message: SLIM_EXISTING_CONTACT_MESSAGE });
  assert.equal(db.calls.length, 1);
});
for (const [name, receipt, options] of [
  ['DB error', created, { error: { message: 'private failure' } }],
  ['missing receipt', null, {}],
  ['mismatched identity', { ...created, leadId: id(99) }, {}],
  ['missing event', { ...created, eventId: null }, {}],
  ['transport exception', created, { throws: true }],
]) await test('creation rejects ' + name + ' and does not retry', async () => {
  const db = database(receipt, options);
  await assert.rejects(createSlimFunnelLead(db, ws, create), /cadastro não foi confirmado/);
  assert.equal(db.calls.length, 1);
});
await test('bulk submits only the selected IDs and retains its request', async () => {
  const db = database(moved);
  assert.deepEqual(await bulkMoveSlimFunnelLeads(db, ws, move), moved);
  assert.deepEqual(db.calls, [{ name: 'slim_bulk_move_leads_and_emit', args: {
    _workspace_id: ws, _lead_ids: [lead, id(9)], _stage_id: move.toStageId, _request_id: move.requestId,
  } }]);
  assert.deepEqual(move.leadIds, [id(9), lead], 'Do not mutate the UI selection');
});
await test('a wholly unchanged selection needs no events', async () => {
  const result = { ...moved, movedCount: 0, unchangedCount: 2, eventIds: [] };
  assert.deepEqual(await bulkMoveSlimFunnelLeads(database(result), ws, move), result);
});
for (const [name, receipt, options] of [
  ['DB error', moved, { error: { code: '42501' } }],
  ['transport exception', moved, { throws: true }],
  ['wrong selection count', { ...moved, count: 3 }, {}],
  ['inconsistent totals', { ...moved, unchangedCount: 0 }, {}],
  ['missing event', { ...moved, eventIds: [] }, {}],
  ['duplicated events', { ...moved, movedCount: 2, unchangedCount: 0, eventIds: [event, event] }, {}],
]) await test('bulk rejects ' + name + ' without issuing another call', async () => {
  const db = database(receipt, options);
  await assert.rejects(bulkMoveSlimFunnelLeads(db, ws, move), /não foi confirmada/);
  assert.equal(db.calls.length, 1);
});
await test('malformed workspace never reaches the RPC', async () => {
  const db = database(created);
  await assert.rejects(createSlimFunnelLead(db, '', create));
  assert.equal(db.calls.length, 0);
});
await test('empty, duplicate and oversized selections fail before any write', async () => {
  for (const leadIds of [[], [lead, lead], Array.from({ length: 101 }, (_, i) => id(i + 200))]) {
    const db = database(moved);
    await assert.rejects(bulkMoveSlimFunnelLeads(db, ws, { ...move, leadIds }));
    assert.equal(db.calls.length, 0);
  }
});
await test('finite value and request identity are required at the API boundary', async () => {
  assert.equal(slimCreateFunnelLeadSchema.safeParse({ ...create, value: Infinity }).success, false);
  assert.equal(slimCreateFunnelLeadSchema.safeParse({ ...create, value: -1 }).success, false);
  assert.equal(slimCreateFunnelLeadSchema.safeParse({ ...create, requestId: undefined }).success, false);
  assert.equal(slimBulkFunnelMoveSchema.safeParse({ ...move, requestId: undefined }).success, false);
  assert.equal(SLIM_FUNNEL_WRITE_TIMEOUT_MS, 15_000);
});
console.log(passed + '/' + passed + ' funnel mutation checks passed. No database, provider or real customer was called.');
