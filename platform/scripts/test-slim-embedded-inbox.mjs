import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { assertInboxAudio, chooseRecordingMime, recordingExtension } from '../src/lib/slim-inbox-ui.core.ts';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ui = read('src/components/inbox/InboxPage.legacy.tsx');
const voice = read('src/components/inbox/SlimInboxVoiceControls.tsx');
const transform = read('scripts/apply-slim-inbox-resumption.mjs');
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const uiAst = parse('Inbox.tsx', ui), voiceAst = parse('Voice.tsx', voice);
let passed = 0;
async function check(name, run) { await run(); passed++; console.log('PASS embedded Inbox: ' + name); }
function find(ast, predicate) {
  let found;
  const walk = node => { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, walk); };
  walk(ast); assert(found, 'Expected source node'); return found;
}
const functionNode = (ast, name) => find(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
function compile(source, env, name) {
  const js = ts.transpileModule(source.replace(/^export\s+/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: 'h', jsxFragmentFactory: 'Fragment' },
  }).outputText;
  return new Function(...Object.keys(env), js + '\nreturn ' + name + ';')(...Object.values(env));
}
const h = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== false && v != null) });
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)]; }
function button(tree, label) {
  const result = nodes(tree).find(n => n.type === 'button' && (n.props['aria-label'] === label || n.children.includes(label)));
  assert(result, 'Button missing: ' + label); return result;
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// A small hook runner executes the actual voice component and its handlers.
// Network, microphone and timers are synthetic, with no real Supabase/provider calls.
function hookRunner() {
  const slots = []; let cursor = 0, dirty = false, effects = [], component, props, tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useEffect(run, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = run(); });
      }
    },
  };
  const render = () => {
    let turns = 0;
    do { assert(++turns < 20, 'Unexpected render loop'); dirty = false; cursor = 0; effects = []; tree = component(props); for (const effect of effects) effect(); } while (dirty);
    return tree;
  };
  return { hooks, mount(fn, input) { component = fn; props = input; return render(); }, render, unmount() { for (const slot of slots) slot?.cleanup?.(); }, get tree() { return tree; } };
}
function fixture(options = {}) {
  const hook = hookRunner(), events = [], sent = [], texts = [], requests = [], recorders = [], urls = [];
  let stopped = 0;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  const permission = options.permission ?? { promise: Promise.resolve(stream) };
  const audio = options.audio ?? { promise: Promise.resolve({ ok: true }) };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(s, config) { this.stream = s; this.mimeType = config?.mimeType ?? 'audio/webm'; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic recording'.repeat(32)], { type: this.mimeType }) }); this.onstop?.(); }
  }
  const env = {
    ...hook.hooks, h, Fragment: 'fragment', Mic: 'Mic', FileText: 'FileText', Square: 'Square', X: 'X', Send: 'Send', Loader2: 'Loader2',
    assertInboxAudio, chooseRecordingMime, recordingExtension,
    window: { isSecureContext: true }, navigator: { mediaDevices: { getUserMedia: () => permission.promise } }, MediaRecorder: Recorder,
    URL: { createObjectURL() { urls.push('create'); return 'blob:synthetic'; }, revokeObjectURL() { urls.push('revoke'); } },
    setInterval: () => 1, clearInterval: () => {},
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' }, access_token: 'synthetic' } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_workspace_id: 'workspace' }, error: null }) }) }) }) },
    fetch: async (_url, input) => { requests.push(input); return options.response ? options.response.promise : { ok: true, json: async () => ({ text: 'Texto ditado' }) }; },
  };
  const fn = compile(functionNode(voiceAst, 'SlimInboxVoiceControls').getText(voiceAst), env, 'SlimInboxVoiceControls');
  hook.mount(fn, { workspaceId: 'workspace', actorId: 'actor', onAudio: file => { sent.push(file); return audio.promise; }, onText: text => texts.push(text), onInteractionStateChange: state => events.push(state) });
  return { hook, events, sent, texts, requests, recorders, urls, stream, get stopped() { return stopped; }, get state() { return events.at(-1); } };
}
async function settle(f) { for (let i = 0; i < 8; i++) await Promise.resolve(); return f.hook.render(); }
async function record(f, mode = 'audio') { button(f.hook.tree, mode === 'audio' ? 'Gravar áudio' : 'Transcrever minha fala').props.onClick(); f.hook.render(); await settle(f); }

await check('shared component exports an optional embedded interface and valid TSX', () => {
  assert.equal(uiAst.parseDiagnostics.length, 0); assert.equal(voiceAst.parseDiagnostics.length, 0);
  assert(ui.includes('export { ChatThread as SlimEmbeddedChatThread }'));
  assert(ui.includes('embedded = false')); assert(ui.includes('embedded?: boolean'));
  assert(transform.includes('onInteractionStateChange={setVoiceInteraction}'));
  if (ui.includes('// SLIM_INBOX_RESUMPTION_V1')) assert(ui.includes('onInteractionStateChange={setVoiceInteraction}'));
});

const chat = functionNode(uiAst, 'ChatThread');
const header = find(chat, n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(uiAst) === 'data-chat-thread-header'));
const renderHeader = compile(`function renderHeader(embedded=false){
 const channel='leads',isLead=true,conversation={isGroup:false},leadName='Contato de teste',leadSubtitle='Etapa',whatsappUrl='https://web.whatsapp.com/send?phone=5511900000000';
 const navigate=()=>{},wallpaper='dots',setWallpaper=()=>{},onOpenProfile=()=>{},profileOpen=false,cacheScope=null;
 return ${header.getText(uiAst)};
}`, { h, Fragment: 'fragment', ...Object.fromEntries(['Avatar','ArrowLeft','StatusDot','StatusLabel','MessageCircle','CheckCircle2','Phone','Search','ThreadMoreMenu','IconBtn'].map(name => [name,name])) }, 'renderHeader');
await check('actual header preserves standalone navigation and delegates embedded exits to the drawer', () => {
  const standalone = nodes(renderHeader()), embedded = nodes(renderHeader(true));
  assert(standalone.some(n => n.props['aria-label'] === 'Voltar')); assert(standalone.some(n => n.type === 'a' && n.props.href));
  assert(!embedded.some(n => n.props['aria-label'] === 'Voltar')); assert(!embedded.some(n => n.type === 'a' && n.props.href));
});
await check('header grows around WhatsApp origin and wraps actions without shrinking into history', () => {
  const tree = renderHeader(), classes = tree.props.className.split(/\s+/);
  assert(classes.includes('min-h-16'));
  assert(classes.includes('py-3'));
  assert(classes.includes('shrink-0'));
  assert(classes.includes('flex-wrap'));
  assert(!classes.some(value => /^h-/.test(value)));
  const actions = nodes(tree).find(n => n.props.className?.includes('ml-auto'));
  assert(actions?.props.className.includes('flex-wrap'));
});
const interactionStatements = chat.body.statements.filter(n => /^(const interactionDirty|const interactionPending|useEffect\(\(\) => \{\s*onInteractionStateChange)/.test(n.getText(uiAst))).map(n => n.getText(uiAst)).join('\n');
assert(interactionStatements.includes('interactionDirty') && interactionStatements.includes('interactionPending'));
const evaluate = compile('function evaluate(draft,voiceInteraction,sendMut,mediaMut,reactionMut,deleteMut,transcribeMut){let result;const onInteractionStateChange=s=>{result=s;};' + interactionStatements + ';return result;}', { useEffect: fn => fn() }, 'evaluate');
const idle = () => ({ isPending: false, isError: false });
await check('typed text and voice drafts survive independently', () => {
  assert.deepEqual(evaluate('', { dirty: false, pending: false }, ...Array.from({ length: 5 }, idle)), { dirty: false, pending: false });
  assert.deepEqual(evaluate('próxima mensagem', { dirty: false, pending: false }, ...Array.from({ length: 5 }, idle)), { dirty: true, pending: false });
  assert.deepEqual(evaluate('', { dirty: true, pending: false }, ...Array.from({ length: 5 }, idle)), { dirty: true, pending: false });
});
await check('each real mutation blocks closing while pending', () => {
  for (let index = 0; index < 5; index++) { const mutations = Array.from({ length: 5 }, idle); mutations[index].isPending = true; assert.equal(evaluate('next', { dirty: false, pending: false }, ...mutations).pending, true); }
  assert.equal(evaluate('', { dirty: false, pending: true }, ...Array.from({ length: 5 }, idle)).pending, true);
});
await check('failed text and file attempts require an explicit discard before leaving', () => {
  for (const index of [0, 1]) { const mutations = Array.from({ length: 5 }, idle); mutations[index] = { isPending: false, isError: true, variables: index ? { file: new File(['test'], 'test.pdf') } : 'Mensagem preservada' }; assert.deepEqual(evaluate('', { dirty: false, pending: false }, ...mutations), { dirty: true, pending: false }); }
});
await check('recording and preview are dirty but never send automatically', async () => {
  const f = fixture(); assert.deepEqual(f.state, { dirty: false, pending: false });
  await record(f); assert.deepEqual(f.state, { dirty: true, pending: false });
  button(f.hook.tree, 'Parar e revisar áudio').props.onClick(); f.hook.render();
  assert.deepEqual(f.state, { dirty: true, pending: false }); assert.equal(f.sent.length, 0); assert.equal(f.stopped, 1);
  button(f.hook.tree, 'Descartar gravação').props.onClick(); f.hook.render();
  assert.deepEqual(f.state, { dirty: false, pending: false }); assert(f.urls.includes('revoke')); f.hook.unmount();
});
await check('explicit audio send stays pending, cannot duplicate, and clears only after confirmation', async () => {
  const audio = deferred(), f = fixture({ audio }); await record(f);
  button(f.hook.tree, 'Parar e revisar áudio').props.onClick(); f.hook.render();
  const send = button(f.hook.tree, 'Enviar áudio').props.onClick; send(); send(); f.hook.render();
  assert.equal(f.sent.length, 1); assert.deepEqual(f.state, { dirty: true, pending: true });
  audio.resolve({ ok: true }); await settle(f); assert.deepEqual(f.state, { dirty: false, pending: false }); f.hook.unmount();
});
await check('failed audio keeps its preview available instead of silently losing the recording', async () => {
  const audio = deferred(), f = fixture({ audio }); await record(f); button(f.hook.tree, 'Parar e revisar áudio').props.onClick(); f.hook.render();
  button(f.hook.tree, 'Enviar áudio').props.onClick(); audio.reject(new Error('Resultado não confirmado')); await settle(f);
  assert.deepEqual(f.state, { dirty: true, pending: false }); assert(button(f.hook.tree, 'Enviar áudio')); assert.equal(f.sent.length, 1); f.hook.unmount();
});
await check('discarding the mounted recorder stops its stream and never creates an outbound attempt', async () => {
  const f = fixture(); await record(f); f.hook.unmount(); assert.equal(f.recorders[0].state, 'inactive'); assert(f.stopped > 0); assert.equal(f.sent.length, 0); assert.equal(f.texts.length, 0);
});
await check('microphone permission arriving after unmount is immediately released', async () => {
  const permission = deferred(), f = fixture({ permission }); button(f.hook.tree, 'Gravar áudio').props.onClick(); f.hook.render();
  assert.deepEqual(f.state, { dirty: true, pending: false }); f.hook.unmount(); permission.resolve(f.stream);
  for (let i = 0; i < 8; i++) await Promise.resolve(); assert.equal(f.stopped, 1); assert.equal(f.recorders.length, 0); assert.equal(f.sent.length, 0);
});
await check('dictation is pending until completion and only returns text to the composer', async () => {
  const response = deferred(), f = fixture({ response }); await record(f, 'text'); button(f.hook.tree, 'Parar e transcrever').props.onClick(); await settle(f);
  assert.deepEqual(f.state, { dirty: false, pending: true }); assert.equal(f.requests.length, 1); assert.equal(f.sent.length, 0);
  response.resolve({ ok: true, json: async () => ({ text: 'Texto ditado' }) }); await settle(f);
  assert.deepEqual(f.texts, ['Texto ditado']); assert.deepEqual(f.state, { dirty: false, pending: false }); f.hook.unmount();
});
await check('scope unmount aborts dictation and ignores a late result', async () => {
  const response = deferred(), f = fixture({ response }); await record(f, 'text'); button(f.hook.tree, 'Parar e transcrever').props.onClick(); await settle(f); f.hook.unmount();
  assert.equal(f.requests[0].signal.aborted, true); response.resolve({ ok: true, json: async () => ({ text: 'Não deve entrar na próxima conversa' }) });
  for (let i = 0; i < 8; i++) await Promise.resolve(); assert.deepEqual(f.texts, []); assert.equal(f.sent.length, 0);
});
console.log(`${passed}/${passed} embedded Inbox checks passed. Actual component handlers ran with synthetic microphone, transport and hooks. No real messages or production writes.`);
