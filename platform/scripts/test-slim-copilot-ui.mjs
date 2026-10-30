import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React},
}).outputText;
function moduleFrom(path, imports = {}) {
  const module = {exports: {}};
  new Function('require', 'module', 'exports', transpile(read(path)))(
    name => { assert(name in imports, 'Unexpected dependency ' + name); return imports[name]; },
    module, module.exports,
  );
  return module.exports;
}
const contract = moduleFrom('src/lib/slim-copilot-contract.core.ts');
const ui = moduleFrom('src/lib/slim-copilot-ui.core.ts', {'./slim-copilot-contract.core': contract});
const workspaceId = 'aaaaaaaa-1111-4111-8111-111111111111';
const actorId = 'bbbbbbbb-2222-4222-8222-222222222222';
const secondActor = 'cccccccc-3333-4333-8333-333333333333';
const scope = {workspaceId, actorId};
const now = Date.parse('2026-10-17T22:00:00Z');
const proposal = (patch = {}) => ({
  id: 'dddddddd-4444-4444-8444-444444444444',
  workspaceId, actorId, version: 'eeeeeeee-5555-4555-8555-555555555555',
  kind: 'move_lead_stage', status: 'pending',
  createdAt: '2026-10-17T21:00:00Z', expiresAt: '2099-10-17T23:00:00Z',
  preview: {
    title: 'Mover etapa do lead',
    targetLabel: 'Contato de teste isolado',
    changes: [{label: 'Etapa', before: 'Entrada', after: 'Atendimento'}],
    effects: ['O SalesBot configurado pode iniciar e enviar mensagens.'],
  },
  ...patch,
});
const response = rows => ({...scope, proposals: rows});
const result = (status = 'succeeded', patch = {}) => proposal({
  status, result: {summary: status === 'rejected' ? 'Proposta rejeitada sem executar a ação.' : 'Resultado confirmado.', receiptId: 'isolated-receipt'},
  ...patch,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, no) => {resolve = ok; reject = no;});
  return {promise, resolve, reject};
}
function harness({list, decide} = {}) {
  const calls = {reads: [], decisions: []};
  let listHandler = list ?? (async () => response([proposal()]));
  let decideHandler = decide ?? (async () => ({proposal: result()}));
  const controller = ui.createSlimCopilotUi(scope, {
    now: () => now,
    list: async input => {calls.reads.push(input); return listHandler(input);},
    decide: async input => {calls.decisions.push(input); return decideHandler(input);},
  });
  controller.activate();
  return {controller, calls, list: value => {listHandler = value;}, decide: value => {decideHandler = value;}};
}
const approve = controller => controller.decide(proposal().id, proposal().version, 'approve');
const canDecide = controller => ui.slimCopilotCanDecide(controller.getSnapshot().proposals[0], controller.getSnapshot(), now);
let checks = 0;
async function test(name, run) {
  await run();
  checks++;
  console.log('PASS copilot UI: ' + name);
}

await test('loading a proposal never executes it', async () => {
  const h = harness();
  await h.controller.refresh();
  assert.equal(h.calls.decisions.length, 0);
  assert(canDecide(h.controller));
  assert.deepEqual(h.calls.reads, [scope]);
});
await test('approval sends only the immutable identity and keeps its receipt visible', async () => {
  const h = harness();
  await h.controller.refresh();
  assert.equal(await approve(h.controller), true);
  assert.deepEqual(h.calls.decisions, [{
    ...scope, proposalId: proposal().id, expectedVersion: proposal().version, decision: 'approve',
  }]);
  const state = h.controller.getSnapshot();
  assert.equal(state.proposals[0].status, 'succeeded');
  assert(ui.slimCopilotNeedsAttention(state.proposals[0], state));
  assert.equal(await approve(h.controller), false);
  assert.equal(h.calls.decisions.length, 1);
});
await test('rapid repeated approval issues exactly one request', async () => {
  const gate = deferred(), h = harness({decide: () => gate.promise});
  await h.controller.refresh();
  const first = approve(h.controller);
  assert.equal(await approve(h.controller), false);
  assert.equal(h.calls.decisions.length, 1);
  gate.resolve({proposal: result()});
  await first;
});
await test('rejection uses the explicit decision and displays its confirmation', async () => {
  const h = harness({decide: async () => ({proposal: result('rejected')})});
  await h.controller.refresh();
  await h.controller.decide(proposal().id, proposal().version, 'reject');
  assert.equal(h.calls.decisions[0].decision, 'reject');
  const state = h.controller.getSnapshot();
  assert.equal(state.proposals[0].status, 'rejected');
  assert(ui.slimCopilotNeedsAttention(state.proposals[0], state));
});
await test('a lost decision reply permits only a read until the same proposal is confirmed', async () => {
  const h = harness({decide: async () => {throw new Error('network lost');}});
  await h.controller.refresh();
  await approve(h.controller);
  assert.equal(h.controller.getSnapshot().unconfirmed[proposal().id], true);
  assert.equal(await approve(h.controller), false);
  h.list(async () => {throw new Error('read unavailable');});
  await h.controller.refresh();
  assert.equal(await approve(h.controller), false);
  assert.equal(h.calls.decisions.length, 1);
  h.list(async () => response([proposal()]));
  await h.controller.refresh();
  assert.equal(h.calls.decisions.length, 1, 'read cannot automatically approve');
  assert(canDecide(h.controller));
  h.decide(async () => ({proposal: result()}));
  await approve(h.controller);
  assert.equal(h.calls.decisions.length, 2);
  assert.deepEqual(h.calls.decisions[0], h.calls.decisions[1]);
});
await test('reading a confirmed receipt after lost reply prevents another execution', async () => {
  const h = harness({decide: async () => {throw new Error('lost reply');}});
  await h.controller.refresh();
  await approve(h.controller);
  h.list(async () => response([result()]));
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().proposals[0].status, 'succeeded');
  assert.equal(await approve(h.controller), false);
  assert.equal(h.calls.decisions.length, 1);
});
await test('a missing proposal in a later page does not unlock an uncertain decision', async () => {
  const h = harness({decide: async () => {throw new Error('lost reply');}});
  await h.controller.refresh();
  await approve(h.controller);
  h.list(async () => response([]));
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().proposals[0].id, proposal().id);
  assert.equal(h.controller.getSnapshot().unconfirmed[proposal().id], true);
  assert.equal(await approve(h.controller), false);
});
for (const mismatch of ['actor', 'workspace']) {
  await test('rejects a list for another ' + mismatch, async () => {
    const invalid = mismatch === 'actor'
      ? {...response([proposal()]), actorId: secondActor}
      : {...response([proposal()]), workspaceId: secondActor};
    const h = harness({list: async () => invalid});
    await h.controller.refresh();
    assert.equal(h.controller.getSnapshot().loaded, false);
    assert.deepEqual(h.controller.getSnapshot().proposals, []);
    assert(h.controller.getSnapshot().readError);
    assert.equal(await approve(h.controller), false);
  });
}
await test('a changed proposal version on read fails closed and preserves the reviewed card', async () => {
  const h = harness();
  await h.controller.refresh();
  h.list(async () => response([proposal({version: secondActor})]));
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().proposals[0].version, proposal().version);
  assert.equal(await approve(h.controller), false);
});
for (const patch of [{id: secondActor}, {version: secondActor}, {actorId: secondActor}, {status: 'pending'}]) {
  await test('refuses a decision receipt with mismatched ' + Object.keys(patch)[0], async () => {
    const h = harness({decide: async () => ({proposal: result('succeeded', patch)})});
    await h.controller.refresh();
    await approve(h.controller);
    assert.equal(h.controller.getSnapshot().unconfirmed[proposal().id], true);
    assert.equal(h.controller.getSnapshot().proposals[0].status, 'pending');
    assert.equal(await approve(h.controller), false);
  });
}
await test('terminal and executing states cannot be approved again', async () => {
  for (const status of ['executing', 'succeeded', 'rejected', 'stale', 'expired', 'uncertain', 'failed']) {
    const h = harness({list: async () => response([proposal({status})])});
    await h.controller.refresh();
    assert.equal(await approve(h.controller), false, status);
    assert.equal(h.calls.decisions.length, 0);
  }
});
await test('locally expired proposals are not submitted', async () => {
  const h = harness({list: async () => response([proposal({expiresAt: '2000-01-01T00:00:00Z'})])});
  await h.controller.refresh();
  assert.equal(await approve(h.controller), false);
  assert.equal(await h.controller.decide(proposal().id, proposal().version, 'reject'), false);
  assert.equal(h.calls.decisions.length, 0);
});
await test('a decision using a different displayed version is never sent', async () => {
  const h = harness();
  await h.controller.refresh();
  assert.equal(await h.controller.decide(proposal().id, secondActor, 'approve'), false);
  assert.equal(h.calls.decisions.length, 0);
});
await test('read failure after a successful action preserves the confirmed result', async () => {
  const h = harness();
  await h.controller.refresh();
  await approve(h.controller);
  h.list(async () => {throw new Error('refresh failed');});
  await h.controller.refresh();
  const state = h.controller.getSnapshot();
  assert(state.readError);
  assert.equal(state.proposals[0].status, 'succeeded');
  assert.equal(state.proposals[0].result.receiptId, 'isolated-receipt');
  assert(ui.slimCopilotNeedsAttention(state.proposals[0], state));
});
await test('leaving the identity ignores a late decision response', async () => {
  const gate = deferred(), h = harness({decide: () => gate.promise});
  await h.controller.refresh();
  const first = approve(h.controller);
  h.controller.deactivate();
  gate.resolve({proposal: result()});
  await first;
  assert.equal(h.controller.getSnapshot().proposals[0].status, 'pending');
  assert.equal(await approve(h.controller), false);
});
await test('a reactivated controller requires a read and ignores its earlier lifecycle request', async () => {
  const gate = deferred(), h = harness({list: () => gate.promise});
  const oldRead = h.controller.refresh();
  await Promise.resolve();
  h.controller.deactivate();
  h.controller.activate();
  h.list(async () => response([result('rejected')]));
  await h.controller.refresh();
  gate.resolve(response([proposal()]));
  await oldRead;
  assert.equal(h.controller.getSnapshot().proposals[0].status, 'rejected');
  assert.equal(h.calls.decisions.length, 0);
});
await test('concurrent result checks share one read and never call decide', async () => {
  const gate = deferred(), h = harness({list: () => gate.promise});
  const first = h.controller.refresh(), second = h.controller.refresh();
  await Promise.resolve();
  assert.equal(h.calls.reads.length, 1);
  gate.resolve(response([proposal()]));
  await Promise.all([first, second]);
  assert.equal(h.calls.decisions.length, 0);
});
await test('a failed action remains visible as failed, with no automatic retry', async () => {
  const h = harness({decide: async () => ({proposal: result('failed')})});
  await h.controller.refresh();
  await approve(h.controller);
  const state = h.controller.getSnapshot();
  assert.equal(state.proposals[0].status, 'failed');
  assert(ui.slimCopilotNeedsAttention(state.proposals[0], state));
  assert.equal(await approve(h.controller), false);
});
await test('chat history keys distinguish operators in the same workspace', () => {
  assert.notDeepEqual(ui.slimCopilotConversationKey(workspaceId, actorId), ui.slimCopilotConversationKey(workspaceId, secondActor));
});

function functionSource(path, name) {
  const source = read(path);
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const node = parsed.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert(node, 'Callable source missing: ' + name);
  return node.getText(parsed).replace(/^export\s+/, '');
}
const card = new Function('React', 'slimCopilotCanDecide', 'slimCopilotStatusLabels',
  transpile(functionSource('src/components/ai-agent/SlimCopilotProposals.tsx', 'SlimCopilotProposalCard')) + '\nreturn SlimCopilotProposalCard;'
)(React, ui.slimCopilotCanDecide, ui.slimCopilotStatusLabels);
const stateFor = row => ({
  proposals: [row], loaded: true, reading: false, readError: null, busy: {}, unconfirmed: {}, lastResultId: null,
});
function render(row = proposal(), state = stateFor(row)) {
  return renderToStaticMarkup(React.createElement(card, {proposal: row, state, onDecision() {}, onCheck() {}}));
}
await test('card displays the exact target, before/after values, content, effects and costs', () => {
  const row = proposal({kind: 'send_text', preview: {
    ...proposal().preview, title: 'Enviar mensagem', channel: 'WhatsApp · sessão isolada',
    content: 'Olá!\nTexto revisado pelo operador.', cost: 'Custo conforme a integração da empresa.',
  }});
  const html = render(row);
  for (const text of ['Contato de teste isolado', 'Entrada', 'Atendimento', 'Texto revisado pelo operador.',
    'sessão isolada', 'O SalesBot configurado', 'Custo conforme', 'Aprovar e executar', 'Rejeitar']) assert(html.includes(text), text);
});
await test('card approval callback sends the displayed proposal identity, never its content', () => {
  const row = proposal(), sent = [];
  const tree = card({proposal: row, state: stateFor(row), onDecision: (...args) => sent.push(args), onCheck() {}});
  const buttons = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (node.type === 'button') buttons.push(node);
    visit(node.props.children);
  };
  visit(tree);
  buttons.find(button => button.props.children === 'Aprovar e executar').props.onClick();
  assert.deepEqual(sent, [[row.id, row.version, 'approve']]);
});
await test('unconfirmed decision card offers only result checking', () => {
  const row = proposal(), state = stateFor(row);
  state.unconfirmed[row.id] = true;
  const html = render(row, state);
  assert(!html.includes('Aprovar e executar'));
  assert(!html.includes('>Rejeitar<'));
  assert(html.includes('Conferir resultado'));
  assert(html.includes('Decisão ainda não confirmada'));
});
await test('uncertain and executing cards cannot approve an action', () => {
  for (const status of ['uncertain', 'executing']) {
    const html = render(proposal({status}));
    assert(!html.includes('Aprovar e executar'));
    assert(html.includes('Conferir resultado'));
  }
});
await test('confirmation distinguishes a provider receipt from pending history', () => {
  const row = result('succeeded', {result: {summary: 'WhatsApp confirmou a mensagem.', receiptId: 'WA-ISOLATED', historyPending: true}});
  const html = render(row);
  assert(html.includes('Execução confirmada'));
  assert(html.includes('WA-ISOLATED'));
  assert(html.includes('histórico ainda está pendente'));
  assert(!html.includes('Aprovar e executar'));
});
await test('untrusted preview content is rendered as text', () => {
  const html = render(proposal({preview: {...proposal().preview, content: '<script>alert(1)</script>'}}));
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
});
await test('expired card requests a new review and has no approve button', () => {
  const html = render(proposal({expiresAt: '2000-01-01T00:00:00Z'}));
  assert(html.includes('Proposta expirada'));
  assert(html.includes('uma nova proposta'));
  assert(!html.includes('Aprovar e executar'));
});

await test('auth change wins over a delayed session lookup', async () => {
  const initial = deferred();
  let actor = null, effect, authEvent, cleanup, unsubscribed = false;
  const hook = new Function('useState', 'useEffect', 'supabase',
    transpile(functionSource('src/components/ai-agent/useSlimCopilotUser.ts', 'useSlimCopilotUser')) + '\nreturn useSlimCopilotUser;'
  )(
    () => [actor, value => {actor = value;}],
    fn => {effect = fn;},
    {auth: {
      onAuthStateChange: fn => {authEvent = fn; return {data: {subscription: {unsubscribe() {unsubscribed = true;}}}};},
      getSession: () => initial.promise,
    }},
  );
  hook();
  cleanup = effect();
  authEvent('SIGNED_IN', {user: {id: secondActor}});
  initial.resolve({data: {session: {user: {id: actorId}}}, error: null});
  await initial.promise;
  await Promise.resolve();
  assert.equal(actor, secondActor);
  authEvent('SIGNED_OUT', null);
  assert.equal(actor, null);
  cleanup();
  authEvent('SIGNED_IN', {user: {id: actorId}});
  assert.equal(actor, null);
  assert(unsubscribed);
});
await test('effective chat integration binds actor and shows the ledger despite hidden header actions', () => {
  const chat = read('src/components/ai-agent/AiAgentChat.tsx');
  assert(chat.includes('slimCopilotConversationKey(workspaceId, actorId)'));
  assert(chat.includes('sess.session?.user?.id !== actorId'));
  assert(chat.includes('queryFn: () => loadFn({ data: conversationIdentity })'));
  assert(chat.includes('mutationFn: () => resetFn({ data: conversationIdentity })'));
  assert(chat.includes('...(agentModule === "support_robot" ? { actorId } : {})'));
  assert(chat.includes('{agentModule === "support_robot" && actorId && ('));
  assert(chat.includes('<SlimCopilotProposals key={workspaceId + ":" + actorId}'));
});
await test('widget requires fresh identity for the current auth user and preserves internal navigation', () => {
  const robot = read('src/components/SupportRobot.tsx');
  assert(robot.includes('queryKey: ["slim-copilot-identity", authenticatedActorId]'));
  assert(robot.includes('identity.isFetchedAfterMount'));
  assert(robot.includes('identity.data.actorId !== authenticatedActorId'));
  assert(robot.includes('actorId={actorId}'));
  assert(!robot.includes('}, [location.href]);'));
  assert(read('scripts/apply-slim-global-history.mjs').includes("includes('// SLIM_COPILOT_APPROVAL_UI_V1')"));
});
await test('actual UI and hook sources parse without transforming the checkout', () => {
  for (const path of ['src/components/SupportRobot.tsx', 'src/components/ai-agent/AiAgentChat.tsx',
    'src/components/ai-agent/SlimCopilotProposals.tsx', 'src/components/ai-agent/useSlimCopilotUser.ts',
    'src/lib/slim-copilot-ui.core.ts']) {
    const parsed = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(parsed.parseDiagnostics.length, 0, path);
  }
});
console.log(checks + '/' + checks + ' Copilot UI checks passed. No provider, production mutation or authenticated E2E executed.');
