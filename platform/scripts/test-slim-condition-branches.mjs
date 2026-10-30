import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const builder = readFileSync(new URL('../src/components/automations/SalesbotBuilder.tsx', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/lib/salesbot-runtime.server.ts', import.meta.url), 'utf8');
function parse(source, kind = ts.ScriptKind.TS) { return ts.createSourceFile('test.tsx', source, ts.ScriptTarget.Latest, true, kind); }
function find(root, predicate) { if (predicate(root)) return root; let result; root.forEachChild(child => { if (!result) result = find(child, predicate); }); return result; }
function compile(source, env, result) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return Function(...Object.keys(env), js + ';return ' + result)(...Object.values(env));
}
const ast = parse(builder, ts.ScriptKind.TSX);
const declaration = name => find(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);
const flow = compile(declaration('computeFlow'), { BLOCK_W: 320 }, 'computeFlow');
let bot;
const updateActive = change => { bot = change(bot); };
const disconnect = compile(declaration('disconnectSource'), { updateActive }, 'disconnectSource');
const connect = compile(declaration('connectExisting'), { updateActive }, 'connectExisting');
const condition = { id: 'condition', kind: 'condicao', condicaoModo: 'ou', nextBlockId: 'pause-a', falseNextBlockId: 'else', condicoes: [
  { id: 'a', sujeito: 'cliente', operador: 'igual', valor: 'A' },
  { id: 'b', sujeito: 'cliente', operador: 'igual', valor: 'B' },
  { id: 'c', sujeito: 'cliente', operador: 'igual', valor: 'C', nextBlockId: 'pause-c' },
] };
const targets = ['pause-a', 'pause-b', 'pause-c', 'else'].map((id, index) => ({ id, kind: 'pausar', x: 600, y: index * 100 }));
bot = { blocks: [condition, ...targets] };
disconnect('condition', 'a');
let block = bot.blocks[0];
assert.equal(block.nextBlockId, undefined);
assert.equal(block.condicoes[0].nextBlockId, undefined);
assert.equal(block.condicoes[1].nextBlockId, 'pause-a', 'preserve legacy inherited path of other rule');
assert.equal(block.condicoes[2].nextBlockId, 'pause-c');
assert.equal(block.falseNextBlockId, 'else');
assert(flow(bot.blocks).openEnds.some(end => end.sourceId === 'condition' && end.optionId === 'a'));
connect({ sourceId: 'condition', optionId: 'a' }, 'pause-b');
block = bot.blocks[0];
assert.equal(block.condicoes[0].nextBlockId, 'pause-b');
assert(!flow(bot.blocks).openEnds.some(end => end.sourceId === 'condition' && end.optionId === 'a'));
bot = JSON.parse(JSON.stringify(bot));
assert.equal(bot.blocks[0].condicoes[0].nextBlockId, 'pause-b');
disconnect('condition', 'b');
assert(flow(bot.blocks).openEnds.some(end => end.optionId === 'b'));
assert.equal(bot.blocks[0].condicoes[0].nextBlockId, 'pause-b');

const rt = parse(runtime);
const evaluator = find(rt, node => ts.isFunctionDeclaration(node) && node.name?.text === 'evalCondition');
const clause = find(rt, node => ts.isCaseClause(node) && node.expression.getText(rt) === '"condicao"');
assert(evaluator && clause);
const execute = compile(evaluator.getText(rt) + '\nasync function execute(b, text) { const supabaseAdmin = {}, lead = {}, run = {variables:{last_message:text}}; let nextId = b.next_block_id; switch(b.type) {' + clause.getText(rt) + '} return nextId; }', { log: async () => {} }, 'execute');
const row = value => ({ type: 'condicao', next_block_id: value.nextBlockId ?? null, config: value });
assert.equal(await execute(row(bot.blocks[0]), 'A'), 'pause-b');
assert.equal(await execute(row(bot.blocks[0]), 'B'), null, 'disconnected branch must not return to shared path');
assert.equal(await execute(row(bot.blocks[0]), 'C'), 'pause-c');
assert.equal(await execute(row(bot.blocks[0]), 'unknown'), 'else');
const single = { ...bot.blocks[0], condicoes: [bot.blocks[0].condicoes[0]] };
assert(flow([single, ...targets]).connectedEnds.some(end => end.optionId === 'a'));
assert.equal(await execute(row(single), 'A'), 'pause-b', 'OU with one remaining rule retains its own destination');
const and = { ...condition, condicaoModo: 'e', condicoes: [{ ...condition.condicoes[0] }, { ...condition.condicoes[0], id: 'same' }] };
assert(flow([and, ...targets]).connectedEnds.some(end => end.sourceId === 'condition' && !end.optionId));
assert.equal(await execute(row(and), 'A'), 'pause-a');
assert.equal(await execute(row(and), 'B'), 'else');
console.log('PASS: actual editor disconnect/reconnect, independent OU paths, legacy paths preserved, save/reload shape, one-rule OU, actual executor destinations and E/else unchanged.');
