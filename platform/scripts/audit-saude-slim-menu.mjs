import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Read-only, reproducible source audit. No credentials, database writes, or HTTP.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'docs/audits/slim-schema-snapshot.json'), 'utf8'));
const tables = new Set(snapshot.tables);
const rpcs = new Set(snapshot.rpcs);
const excluded = new Set(['src/lib/billing/cora.server.ts', 'supabase/functions/cora-proxy/index.ts']);
const cache = new Map();
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const sourceExt = /\.(?:ts|tsx|js|jsx|mjs|mts)$/;
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : sourceExt.test(e.name) ? [full] : [];
  });
}
function resolveImport(file, spec) {
  if (!spec.startsWith('@/') && !spec.startsWith('.')) return null;
  const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
  for (const suffix of ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '/index.ts', '/index.tsx', '/index.js']) {
    const p = base + suffix;
    if (sourceExt.test(p) && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
function inspect(file) {
  if (cache.has(file)) return cache.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result = { imports: [], tables: new Set(), rpcs: new Set(), routes: [], dynamicCalls: 0 };
  cache.set(file, result);
  function local(spec) {
    const p = resolveImport(file, spec);
    if (p && !excluded.has(rel(p)) && !/\.(?:test|spec)\./.test(p)) result.imports.push(p);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const c = node.importClause;
      const bindings = c?.namedBindings;
      const onlyTypes = c?.isTypeOnly || (c && !c.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly));
      if (!onlyTypes && ts.isStringLiteral(node.moduleSpecifier)) local(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) local(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      let arg = node.arguments[0];
      while (arg && (ts.isAsExpression(arg) || ts.isTypeAssertionExpression(arg) || ts.isParenthesizedExpression(arg))) arg = arg.expression;
      const literal = arg && ts.isStringLiteralLike(arg) ? arg.text : null;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && literal) local(literal);
      if (ts.isIdentifier(node.expression) && node.expression.text === 'createFileRoute' && literal) result.routes.push(literal.replace(/\/_([^/]+)/g, ''));
      if (ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text;
        if ((name === 'from' || name === 'rpc') && !node.expression.expression.getText(sf).includes('.storage')) {
          if (literal && /^[A-Za-z_][A-Za-z0-9_]*$/.test(literal)) result[name === 'from' ? 'tables' : 'rpcs'].add(literal);
          else result.dynamicCalls++;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return result;
}
const routes = walk(path.join(root, 'src/routes'));
const modules = [
  ['Agentes IA', null, ['src/lib/conversation-agents.functions.ts', 'src/routes/api/agent-test-chat.ts', 'src/routes/api/ai-agent/chat.ts', 'src/lib/inbox-automation-controls.functions.ts']],
  ['Home: Histórico de Vendas', '/saude-slim'], ['Home: Dashboard detalhada', '/painel'],
  ['Vendas: Pedidos', '/pedidos'], ['Vendas: Fornecedores', '/crm/empresas'],
  ['Vendas: Estoque', '/crm/estoque'], ['Vendas: Produtos', '/crm/produtos'],
  ['CRM: Públicos — URL anterior de disparos', '/disparo-em-massa'], ['CRM: Funil', '/crm/funis-de-venda'],
  ['CRM: Clientes', '/crm/leads'], ['CRM: Inbox', '/inbox/leads'],
  ['CRM: Automações', '/crm/automacoes'], ['CRM: Cérebro IA', '/crm/agente-ia'],
  ['CRM: Públicos', '/crm/publicos'], ['Configurações: Geral', '/configuracoes'], ['Configurações: Integrações', '/integracoes'],
];
const report = [];
for (const [name, route, explicit] of modules) {
  const seeds = explicit ? explicit.map((p) => path.join(root, p)) : routes.filter((f) => inspect(f).routes.some((r) => r === route || r.startsWith(route + '/')));
  const visited = new Set(), missingTables = new Set(), missingRpcs = new Set();
  const directMissing = new Set();
  let dynamicCalls = 0;
  const pending = [...seeds];
  for (const seed of seeds) for (const t of inspect(seed).tables) if (!tables.has(t)) directMissing.add(t);
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const info = inspect(file);
    for (const t of info.tables) if (!tables.has(t)) missingTables.add(t);
    for (const r of info.rpcs) if (!rpcs.has(r)) missingRpcs.add(r);
    dynamicCalls += info.dynamicCalls;
    pending.push(...info.imports);
  }
  const row = { module: name, roots: seeds.map(rel), files: visited.size, directMissing: [...directMissing].sort(), missingTables: [...missingTables].sort(), missingRpcs: [...missingRpcs].sort(), dynamicCalls, status: seeds.length ? 'STRUCTURAL_REVIEW_REQUIRED' : 'ROUTE_NOT_FOUND' };
  report.push(row);
  console.log('[SLIM-MENU-AUDIT] ' + JSON.stringify(row));
}
const contractText = fs.readFileSync(path.join(root, 'src/integrations/supabase/types.ts'), 'utf8');
for (const name of ['crm_lead_audiences', 'crm_automation_jobs', 'lead_custom_fields', 'lead_custom_field_values', 'tasks', 'notifications', 'workspace_security_settings', 'trusted_devices', 'security_events', 'device_approval_challenges']) {
  const marker = '      ' + name + ': {';
  const start = contractText.indexOf(marker);
  const end = contractText.indexOf('        Insert:', start);
  if (start >= 0 && end > start) console.log('[SLIM-SCHEMA-CONTRACT] ' + JSON.stringify({ table: name, row: contractText.slice(start, end).trim() }));
}
console.log('[SLIM-MENU-AUDIT-SUMMARY] ' + JSON.stringify({ modules: report.length, routesMissing: report.filter((r) => !r.roots.length).map((r) => r.module), filesInspected: cache.size, schemaSnapshot: snapshot.version, note: 'Static source reachability, including optional imports; not authenticated browser/API/WhatsApp acceptance. Missing references require call-site review. No data or secrets accessed.' }));
