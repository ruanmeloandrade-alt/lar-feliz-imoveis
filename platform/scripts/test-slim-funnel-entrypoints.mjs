import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const client = read('src/lib/saude-slim-funnel-client.ts');
const ui = read('src/legacy/crm.funis-de-venda.legacy.tsx');
const parse = (name, source, kind) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kind);
const clientAst = parse('client.ts', client, ts.ScriptKind.TS);
const uiAst = parse('funnel.tsx', ui, ts.ScriptKind.TSX);
let checks = 0;
async function test(name, run) {
  await run();
  checks++;
  console.log('PASS funnel entrypoints: ' + name);
}
function findNode(ast, predicate) {
  let found;
  const visit = node => {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(ast);
  assert(found, 'Required callable source was not found');
  return found;
}
function functionSource(ast, name) {
  return findNode(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name)
    .getText(ast).replace(/^export\s+/, '');
}
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}
function wrappers(server) {
  const source = ['createSlimLead', 'bulkMoveSlimLeads'].map(name => functionSource(clientAst, name)).join('\n')
    .replaceAll('await import("./slim-funnel-mutations.functions")', 'await loadMutations()');
  return new Function('loadMutations', compile(source) + '\nreturn {createSlimLead,bulkMoveSlimLeads};')(
    async () => server,
  );
}
const created = () => ({ id: 'created-lead', leadId: 'created-lead', eventId: 'created-event', automationQueued: true });
const moved = (count = 2, movedCount = count) => ({
  ok: true, count, movedCount, unchangedCount: count - movedCount,
  eventIds: Array.from({ length: movedCount }, (_, i) => 'event-' + i),
});
const form = () => ({ name: 'Cliente de teste isolado', phone: '11900000000', email: 'qa@example.invalid', value: '12,50', stageId: 'stage' });
const newLeadSource = ['openNewLead', 'submitNewLead'].map(name => functionSource(uiAst, name)).join('\n');

function newLeadHarness({ create = async () => created(), reload = async () => {} } = {}) {
  const state = { form: form(), open: true, saving: false, error: null, request: { current: null }, notices: [] };
  const render = () => new Function(
    'crmSourceId', 'funnel', 'newLeadForm', 'newLeadRequestId', 'createLeadServer',
    'setNewLeadForm', 'setNewLeadOpen', 'setNewLeadSaving', 'setNewLeadError', 'reloadFunnels', 'toast', 'crypto',
    compile(newLeadSource) + '\nreturn {openNewLead,submitNewLead};',
  )(
    'source', { id: 'pipeline', stages: [{ id: 'stage' }] }, state.form, state.request, create,
    value => { state.form = value; }, value => { state.open = value; }, value => { state.saving = value; },
    value => { state.error = value; }, reload,
    { success: value => state.notices.push(['success', value]), info: value => state.notices.push(['info', value]) },
    { randomUUID },
  );
  return { state, render };
}

const bulkElement = findNode(uiAst, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(uiAst) === 'BulkMoveDialog');
const bulkAttribute = bulkElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === 'onConfirm');
assert(bulkAttribute?.initializer && ts.isJsxExpression(bulkAttribute.initializer));
const bulkSource = 'const confirm = ' + bulkAttribute.initializer.expression.getText(uiAst) + ';';

function bulkHarness({ move = async () => moved(), reload = async () => {} } = {}) {
  const state = { selected: new Set(['lead-b', 'lead-a']), open: true, moving: false, request: { current: null }, notices: [] };
  const render = () => new Function(
    'selectedLeadIds', 'bulkMoveRequest', 'bulkMoveLeadsFn', 'setBulkMoving', 'setSelectedLeadIds',
    'setBulkMoveDialogOpen', 'reloadFunnels', 'crmSourceId', 'toast', 'crypto', 'console',
    compile(bulkSource) + '\nreturn confirm;',
  )(
    state.selected, state.request, move, value => { state.moving = value; }, value => { state.selected = value; },
    value => { state.open = value; }, reload, 'source',
    { success: value => state.notices.push(['success', value]), info: value => state.notices.push(['info', value]), error: value => state.notices.push(['error', value]) },
    { randomUUID }, { error() {} },
  );
  return { state, render };
}

const quickElement = findNode(uiAst, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(uiAst) === 'QuickEditDialog');
const quickAttribute = quickElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === 'onSave');
assert(quickAttribute?.initializer && ts.isJsxExpression(quickAttribute.initializer));
const quickSource = functionSource(uiAst, 'quickEditBasicValues') + '\nconst save = '
  + quickAttribute.initializer.expression.getText(uiAst).replaceAll('await import("@/lib/leads.functions")', 'await loadLeadFunctions()') + ';';

function quickHarness({
  update = async () => ({ ok: true }),
  custom = async ({ data }) => ({ ok: true, fieldId: data.fieldId, value: data.value }),
  move = async () => ({ ok: true }),
  reload = async () => {},
  baseline = {},
  changes = {},
} = {}) {
  const initial = {
    name: 'Cliente carregado', email: '', phone: '', value: 0, responsibleId: '',
    pipelineId: 'pipeline', stageId: 'old-stage', customFields: { field: 'antes' }, ...baseline,
  };
  const state = {
    baseline: structuredClone(initial), form: { ...structuredClone(initial), ...changes },
    lead: { id: 'lead', name: 'Nome desatualizado do cartão', pipeline_id: 'pipeline', stage_id: 'old-stage' },
    checkpoints: { current: new Map() }, updates: [], customs: [], moves: [], notices: [], closed: false,
  };
  const render = () => new Function(
    'quickEditingLead', 'quickEditCheckpoints', 'loadLeadFunctions', 'moveSlimLead',
    'queryClient', 'reloadFunnels', 'crmSourceId', 'setFunnelId', 'navigate', 'setQuickEditingLead', 'toast', 'console',
    compile(quickSource) + '\nreturn save;',
  )(
    state.lead, state.checkpoints,
    async () => ({
      updateLead: async input => { state.updates.push(structuredClone(input.data)); return update(input); },
      setLeadCustomFieldValue: async input => { state.customs.push(structuredClone(input.data)); return custom(input); },
    }),
    async input => { state.moves.push(structuredClone(input.data)); return move(input); },
    { invalidateQueries: async () => {} }, reload, 'source', () => {}, async () => {},
    value => { state.lead = value; state.closed = value === null; },
    { success: value => state.notices.push(['success', value]), info: value => state.notices.push(['info', value]), error: value => state.notices.push(['error', value]) },
    { error() {} },
  );
  return { state, save: () => render()(state.form, state.baseline) };
}

await test('client and UI parse without executing build transforms', () => {
  assert.equal(clientAst.parseDiagnostics.length, 0);
  assert.equal(uiAst.parseDiagnostics.length, 0);
});

await test('creation delegates normalized fields and its request ID to the server', async () => {
  let sent;
  const api = wrappers({ createSlimLeadWithAutomations: async input => { sent = input.data; return created(); } });
  const result = await api.createSlimLead({ data: {
    crmSourceId: 'source', pipelineId: 'pipe', stageId: 'stage', name: ' Cliente ',
    email: ' qa@example.invalid ', phone: ' 11900000000 ', requestId: 'stable-create',
  } });
  assert.equal(result.leadId, 'created-lead');
  assert.deepEqual(sent, {
    crmSourceId: 'source', pipelineId: 'pipe', stageId: 'stage', name: 'Cliente',
    email: 'qa@example.invalid', phone: '11900000000', requestId: 'stable-create', value: 0,
  });
});

await test('creation rejects missing confirmation or request identity', async () => {
  let calls = 0;
  const api = wrappers({ createSlimLeadWithAutomations: async () => { calls++; return { ...created(), leadId: 'another-lead' }; } });
  await assert.rejects(() => api.createSlimLead({ data: { name: 'Cliente', requestId: 'request' } }), /não foi confirmado/);
  await assert.rejects(() => api.createSlimLead({ data: { name: 'Cliente' } }), /tentativa de cadastro/);
  assert.equal(calls, 1);
});

await test('bulk adapter addresses only selected IDs in a deterministic order', async () => {
  let sent;
  const api = wrappers({ bulkMoveSlimLeadsWithAutomations: async input => { sent = input.data; return moved(2, 1); } });
  const ids = ['lead-b', 'lead-a'];
  const result = await api.bulkMoveSlimLeads({ data: {
    leadIds: ids, targetPipelineId: 'pipeline', targetStageId: 'stage', requestId: 'stable-bulk',
  } });
  assert.deepEqual(sent, { leadIds: ['lead-a', 'lead-b'], toStageId: 'stage', requestId: 'stable-bulk' });
  assert.deepEqual(ids, ['lead-b', 'lead-a']);
  assert.equal(result.unchangedCount, 1);
});

await test('invalid selections never reach a server mutation', async () => {
  let calls = 0;
  const api = wrappers({ bulkMoveSlimLeadsWithAutomations: async () => { calls++; return moved(); } });
  for (const ids of [[], ['repeat', 'repeat'], Array.from({ length: 101 }, (_, i) => 'lead-' + i)]) {
    await assert.rejects(() => api.bulkMoveSlimLeads({ data: { leadIds: ids, targetStageId: 'stage', requestId: 'request' } }));
  }
  assert.equal(calls, 0);
});

await test('bulk rejects an inconsistent or partial confirmation', async () => {
  for (const result of [{ ...moved(), count: 1 }, { ...moved(), movedCount: -1 }, { ...moved(), unchangedCount: 1 }, { ...moved(), ok: false }]) {
    const api = wrappers({ bulkMoveSlimLeadsWithAutomations: async () => result });
    await assert.rejects(() => api.bulkMoveSlimLeads({ data: { leadIds: ['a', 'b'], targetStageId: 'stage', requestId: 'request' } }), /não foi confirmada/);
  }
});

await test('creation failure preserves the form, open dialog and request reference', async () => {
  const harness = newLeadHarness({ create: async () => { throw new Error('Resposta indisponível'); } });
  const before = { ...harness.state.form };
  await harness.render().submitNewLead();
  assert.deepEqual(harness.state.form, before);
  assert.equal(harness.state.open, true);
  assert.equal(harness.state.saving, false);
  assert.equal(harness.state.error, 'Resposta indisponível');
  assert(harness.state.request.current);
  assert.equal(harness.state.notices.length, 0);
});

await test('retry of the same creation reuses the reference and clears it only on success', async () => {
  const requests = [];
  const harness = newLeadHarness({ create: async ({ data }) => {
    requests.push(data.requestId);
    if (requests.length === 1) throw new Error('Resposta perdida');
    return created();
  } });
  await harness.render().submitNewLead();
  await harness.render().submitNewLead();
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.equal(harness.state.request.current, null);
  assert.equal(harness.state.open, false);
  assert.equal(harness.state.error, null);
});

await test('opening a new creation starts a separate request', () => {
  const harness = newLeadHarness();
  harness.render().openNewLead();
  const first = harness.state.request.current;
  harness.render().openNewLead();
  assert.notEqual(harness.state.request.current, first);
  assert.equal(harness.state.form.name, '');
});

await test('refresh failure after confirmed creation does not become a creation error', async () => {
  let creates = 0;
  const harness = newLeadHarness({
    create: async () => { creates++; return created(); },
    reload: async () => { throw new Error('Refresh indisponível'); },
  });
  await harness.render().submitNewLead();
  assert.equal(creates, 1);
  assert.equal(harness.state.open, false);
  assert.equal(harness.state.error, null);
  assert.equal(harness.state.request.current, null);
  assert(harness.state.notices.some(([kind, message]) => kind === 'info' && message.includes('Cliente criado')));
});

await test('bulk failure preserves selection, destination attempt and open dialog', async () => {
  const harness = bulkHarness({ move: async () => { throw new Error('Resposta indisponível'); } });
  await harness.render()('pipeline', 'stage');
  assert.deepEqual([...harness.state.selected], ['lead-b', 'lead-a']);
  assert.equal(harness.state.open, true);
  assert.equal(harness.state.moving, false);
  assert(harness.state.request.current?.requestId);
  assert.deepEqual(harness.state.notices, [['error', 'Resposta indisponível']]);
});

await test('retry of the same selection ignores selection order and reuses its reference', async () => {
  const requests = [];
  const harness = bulkHarness({ move: async ({ data }) => {
    requests.push(data.requestId);
    if (requests.length === 1) throw new Error('Resposta perdida');
    return moved(2, 1);
  } });
  await harness.render()('pipeline', 'stage');
  harness.state.selected = new Set(['lead-a', 'lead-b']);
  await harness.render()('pipeline', 'stage');
  assert.equal(requests[0], requests[1]);
  assert.equal(harness.state.request.current, null);
  assert.equal(harness.state.selected.size, 0);
  assert.equal(harness.state.open, false);
  assert(harness.state.notices.some(([kind, message]) => kind === 'success' && message.includes('já estava')));
});

await test('changing the bulk destination starts a different operation', async () => {
  const requests = [];
  const harness = bulkHarness({ move: async ({ data }) => { requests.push(data.requestId); throw new Error('Resposta perdida'); } });
  await harness.render()('pipeline', 'stage');
  await harness.render()('pipeline', 'different-stage');
  assert.notEqual(requests[0], requests[1]);
});

await test('bulk refresh failure retains the confirmed result and clears the old selection', async () => {
  let moves = 0;
  const harness = bulkHarness({
    move: async () => { moves++; return moved(2, 0); },
    reload: async () => { throw new Error('Refresh indisponível'); },
  });
  await harness.render()('pipeline', 'stage');
  assert.equal(moves, 1);
  assert.equal(harness.state.open, false);
  assert.equal(harness.state.selected.size, 0);
  assert.equal(harness.state.request.current, null);
  assert(harness.state.notices.some(([kind, message]) => kind === 'success' && message.includes('já estão')));
  assert(harness.state.notices.some(([kind, message]) => kind === 'info' && message.includes('Movimentação confirmada')));
  assert(!harness.state.notices.some(([kind]) => kind === 'error'));
});

await test('quick edit and bulk use the same scoped movement family as Kanban', () => {
  const quickEdit = ui.slice(ui.indexOf('// 3. Mover de etapa se necessário'), ui.indexOf('await queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });', ui.indexOf('// 3. Mover de etapa se necessário')));
  assert(quickEdit.includes('await moveSlimLead({'));
  assert(!quickEdit.includes('import("@/lib/crm.functions")'));
  assert(!quickEdit.includes('await moveLead({'));
  assert(ui.includes('const bulkMoveLeadsFn = bulkMoveSlimLeads;'));
  assert(!ui.includes('useServerFn(bulkMoveLeads)'));
  assert(ui.includes('const moveLeadServer = moveSlimLead;'));
});

await test('stage-only quick edit does not emit basic or custom field updates', async () => {
  const harness = quickHarness({
    baseline: { email: null, phone: null, responsibleId: null },
    changes: { email: '', phone: '', responsibleId: '', stageId: 'new-stage' },
  });
  await harness.save();
  assert.equal(harness.state.updates.length, 0);
  assert.equal(harness.state.customs.length, 0);
  assert.deepEqual(harness.state.moves, [{ leadId: 'lead', toStageId: 'new-stage' }]);
  assert.equal(harness.state.closed, true);
});

await test('stage retry does not resubmit confirmed basic or custom values', async () => {
  let attempts = 0;
  const harness = quickHarness({
    changes: { name: 'Nome novo', stageId: 'new-stage', customFields: { field: 'depois' } },
    move: async () => { if (++attempts === 1) throw new Error('Resposta da etapa indisponível'); return { ok: true }; },
  });
  const draft = structuredClone(harness.state.form);
  await harness.save();
  assert.equal(harness.state.closed, false);
  assert.deepEqual(harness.state.form, draft);
  assert.equal(harness.state.lead.name, 'Nome desatualizado do cartão');
  assert(harness.state.notices.some(([kind, message]) => kind === 'error' && message.startsWith('Dados salvos. A mudança de etapa não foi confirmada.')));
  await harness.save();
  assert.deepEqual(harness.state.updates, [{ leadId: 'lead', patch: { name: 'Nome novo' } }]);
  assert.deepEqual(harness.state.customs, [{ leadId: 'lead', fieldId: 'field', value: 'depois' }]);
  assert.equal(harness.state.moves.length, 2);
  assert.equal(harness.state.closed, true);
  assert.equal(harness.state.checkpoints.current.has('lead'), false);
});

await test('uncertain basic-field response is not marked as confirmed and preserves the draft', async () => {
  const harness = quickHarness({
    changes: { name: 'Nome incerto', stageId: 'new-stage' },
    update: async () => { throw new Error('Resposta perdida'); },
  });
  const draft = structuredClone(harness.state.form);
  await harness.save();
  assert.deepEqual(harness.state.form, draft);
  assert.equal(harness.state.closed, false);
  assert.equal(harness.state.moves.length, 0);
  assert.equal(harness.state.checkpoints.current.get('lead').basic.name, 'Cliente carregado');
  assert.equal(harness.state.checkpoints.current.get('lead').hasConfirmedData, false);
  assert(harness.state.notices.every(([kind, message]) => kind === 'error' && message.startsWith('Os dados não foram confirmados.')));
});

await test('partial custom-field confirmation retries only the unconfirmed field', async () => {
  let secondAttempts = 0;
  const harness = quickHarness({
    baseline: { customFields: { first: 'antes', second: 'antes' } },
    changes: { customFields: { first: 'depois', second: 'depois' }, stageId: 'new-stage' },
    custom: async ({ data }) => {
      if (data.fieldId === 'second' && ++secondAttempts === 1) throw new Error('Resposta do segundo campo perdida');
      return { ok: true, fieldId: data.fieldId, value: data.value };
    },
  });
  await harness.save();
  assert.equal(harness.state.closed, false);
  assert.equal(harness.state.moves.length, 0);
  assert(harness.state.notices.some(([kind, message]) => kind === 'error' && message.startsWith('Há dados já salvos; os demais dados não foram confirmados.')));
  await harness.save();
  assert.deepEqual(harness.state.customs.map(call => call.fieldId), ['first', 'second', 'second']);
  assert.equal(harness.state.moves.length, 1);
  assert.equal(harness.state.closed, true);
});

await test('a custom-field receipt with a different value is not checkpointed', async () => {
  const harness = quickHarness({
    changes: { customFields: { field: 'depois' }, stageId: 'new-stage' },
    custom: async ({ data }) => ({ ok: true, fieldId: data.fieldId, value: 'outro valor' }),
  });
  await harness.save();
  assert.equal(harness.state.checkpoints.current.get('lead').customFields.field, 'antes');
  assert.equal(harness.state.checkpoints.current.get('lead').hasConfirmedData, false);
  assert.equal(harness.state.moves.length, 0);
  assert.equal(harness.state.closed, false);
});

await test('an intentional change after a partial save is compared to the confirmed value', async () => {
  let attempts = 0;
  const harness = quickHarness({
    changes: { name: 'Nome novo', stageId: 'new-stage' },
    move: async () => { if (++attempts === 1) throw new Error('Falha da etapa'); return { ok: true }; },
  });
  await harness.save();
  harness.state.form.name = 'Cliente carregado';
  await harness.save();
  assert.deepEqual(harness.state.updates.map(call => call.patch), [{ name: 'Nome novo' }, { name: 'Cliente carregado' }]);
  assert.equal(harness.state.moves.length, 2);
  assert.equal(harness.state.closed, true);
});

await test('quick-edit refresh failure keeps the save confirmed and closes the dialog', async () => {
  const harness = quickHarness({
    changes: { name: 'Nome novo', stageId: 'new-stage' },
    reload: async () => { throw new Error('Refresh indisponível'); },
  });
  await harness.save();
  assert.equal(harness.state.updates.length, 1);
  assert.equal(harness.state.moves.length, 1);
  assert.equal(harness.state.closed, true);
  assert.equal(harness.state.checkpoints.current.has('lead'), false);
  assert(!harness.state.notices.some(([kind]) => kind === 'error'));
  assert(harness.state.notices.some(([kind, message]) => kind === 'info' && message.startsWith('Alterações confirmadas.')));
});

await test('quick-edit baseline stays separate from the draft and is passed to its save handler', () => {
  assert(ui.includes('initialValues.current = {leadId:lead.id,values:loadedValues};'));
  assert(ui.includes('await onSave(form, initialValues.current.values)'));
  const save = quickAttribute.initializer.expression.getText(uiAst);
  assert(!save.includes('setForm('));
  assert(!save.includes('setQuickEditingLead({'));
  assert(save.includes('quickEditCheckpoints.current.get(leadId)'));
});

console.log(`${checks}/${checks} isolated funnel entrypoint checks. No database access, lead mutation, bot start or WhatsApp send.`);
