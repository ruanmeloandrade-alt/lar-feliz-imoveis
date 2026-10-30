import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const path = 'src/components/automations/CentralDeGrupos.tsx';
const ui = read(path);
const mounted = ui.split('export function CentralDeGrupos()')[1].split('/* ---------- helpers ---------- */')[0];
assert(ui.includes('// SLIM_GROUP_SALESBOTS_ONLY_V1'), 'owner withdrawal transform applied');
assert(!mounted.includes('AgentesGrupoTab'), 'agent editor is not mounted');
assert(!mounted.includes('Agentes IA'), 'agent tab and description are removed');
assert(!mounted.includes('agentsQ') && !mounted.includes('listAgentsFn'), 'no group-agent request from Central');
for (const expected of ['<GruposTab', '<RegrasTab', '<BotsGrupoTab', 'label="Salesbots de grupo"']) {
  assert(mounted.includes(expected), 'existing group operation preserved: ' + expected);
}
const selector = ui.split('function AutomationSelector({')[1].split('/* ---------- Create / Join dialogs ---------- */')[0];
assert(selector.includes('value={`bot:${b.id}`}'), 'SalesBot selection preserved');
assert(!selector.includes('`agent:') && !selector.includes('Agentes IA') && !selector.includes('agents.length'), 'retired agent choices absent');
const rules = ui.split('function RegrasTab({')[1].split('/* ---------- Agentes IA tab ---------- */')[0];
for (const expected of ['Gatilhos e Automações', 'saveGroupRules', 'Nova regra']) assert(rules.includes(expected), 'trigger behavior preserved: ' + expected);
assert.equal(ts.createSourceFile(path, ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0, 'valid TSX');
const oldGate = read('scripts/test-slim-group-prompt-source.mjs');
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/apply-slim-group-salesbots-only.mjs', root))], { stdio: 'inherit' });
assert.equal(read(path), ui, 'transform idempotent');
assert.equal(read('scripts/test-slim-group-prompt-source.mjs'), oldGate, 'product gates idempotent');
console.log('PASS group SalesBots only: retired IA entry points, retained rules/triggers, syntax and idempotence. No business data changed.');
