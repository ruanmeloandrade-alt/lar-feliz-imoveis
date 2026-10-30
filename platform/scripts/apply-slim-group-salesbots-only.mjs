import fs from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const marker = '// SLIM_GROUP_SALESBOTS_ONLY_V1';

export function patchSlimGroupSalesbotsOnly(input) {
  if (input.includes(marker)) return input;
  if (!input.includes('// SLIM_GROUP_PROMPT_V1')) {
    throw new Error('[Group SalesBots] Apply after apply-slim-group-prompt.mjs.');
  }
  let code = input;
  const once = (from, to) => {
    if (code.split(from).length !== 2) throw new Error('[Group SalesBots] Nonunique anchor: ' + from.slice(0, 100));
    code = code.replace(from, () => to);
  };
  const section = (start, end, update) => {
    const a = code.indexOf(start), b = code.indexOf(end, a + start.length);
    if (a < 0 || b < 0 || code.split(start).length !== 2) throw new Error('[Group SalesBots] Missing section: ' + start);
    code = code.slice(0, a) + update(code.slice(a, b)) + code.slice(b);
  };
  const removeOnce = (part, from) => {
    if (part.split(from).length !== 2) throw new Error('[Group SalesBots] Missing scoped anchor: ' + from.slice(0, 80));
    return part.replace(from, '');
  };

  once('  listGroupAiAgents,\n', '');
  once('type Tab = "grupos" | "regras" | "bots" | "agentes";', 'type Tab = "grupos" | "regras" | "bots";');
  once('  const listAgentsFn = useServerFn(listGroupAiAgents);\n', '');
  once(`  const agentsQ = useQuery({
    queryKey: ["group-agents", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await listAgentsFn({ data: { workspaceId: workspaceId! } })) as Agent[],
  });`, '');
  once(`            Gerencie todos os grupos das suas sessões de WhatsApp. Configure regras, associe Salesbots ou Agentes IA
            específicos para grupos, sempre isolados dos fluxos 1-a-1.`,
    '            Gerencie seus grupos de WhatsApp. Configure regras, gatilhos e SalesBots de grupo.');
  once('        <TabButton active={tab === "agentes"} onClick={() => setTab("agentes")} icon={Sparkles} label="Agentes IA" />\n', '');
  section("        {tab==='agentes'&&(", '        {tab === "bots" && (', () => '');
  section('export function CentralDeGrupos()', '/* ---------- helpers ---------- */', part => {
    if (part.split('            agents={agentsQ.data ?? []}\n').length !== 3) {
      throw new Error('[Group SalesBots] Expected exactly two retired agent props.');
    }
    return part.split('            agents={agentsQ.data ?? []}\n').join('');
  });
  section('function GruposTab({', 'function AutomationSelector({', part => {
    part = removeOnce(part, '  agents,\n');
    part = removeOnce(part, '  agents: Agent[];\n');
    return removeOnce(part, '                  : g.active_ai_agent_id\n                  ? `IA: ${agents.find((a) => a.id === g.active_ai_agent_id)?.name ?? "removida"}`\n');
  });
  section('function AutomationSelector({', '/* ---------- Create / Join dialogs ---------- */', part => {
    part = removeOnce(part, '  agents,\n');
    part = removeOnce(part, '  agents: Agent[];\n');
    part = part.replace(' : group.active_ai_agent_id ? `agent:${group.active_ai_agent_id}` : "none"', ' : "none"');
    part = removeOnce(part, '        else if (v.startsWith("agent:")) onSet({ botId: null, agentId: v.slice(6) });\n');
    const a = part.indexOf('      {agents.length > 0 && ('), b = part.indexOf('    </select>', a);
    if (a < 0 || b < 0) throw new Error('[Group SalesBots] Retired agent choices missing.');
    return part.slice(0, a) + part.slice(b);
  });
  section('function RegrasTab({', '/* ---------- Agentes IA tab ---------- */', part => {
    part = removeOnce(part, '  agents,\n');
    return removeOnce(part, '  agents: any[];\n');
  });
  // The archived editor and APIs remain stored; no tab, query or selector mounts
  // them. User data and SalesBot trigger configuration are not modified.
  code += '\n' + marker + '\n';
  const parsed = ts.createSourceFile('CentralDeGrupos.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) throw new Error('[Group SalesBots] Invalid TSX: ' + parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
  return code;
}

const file = new URL('src/components/automations/CentralDeGrupos.tsx', root);
const before = fs.readFileSync(file, 'utf8');
const after = patchSlimGroupSalesbotsOnly(before);
if (patchSlimGroupSalesbotsOnly(after) !== after) throw new Error('[Group SalesBots] Non-idempotent transform.');

// The previous release required a reachable agent tab. The owner withdrew it
// on 17/10; keep these gates aligned with that explicit product requirement.
const legacyTest = new URL('scripts/test-slim-group-prompt-source.mjs', root);
let testCode = fs.readFileSync(legacyTest, 'utf8');
const replacements = [
  [
    `test('group-agent tab is reachable',()=>{assert(ui.includes('label="Agentes IA"'));assert(ui.includes('<AgentesGrupoTab key={workspaceId'));});`,
    `test('group-agent tab is withdrawn by the owner',()=>{assert(!ui.includes('label="Agentes IA"'));assert(!ui.includes('<AgentesGrupoTab key={workspaceId'));assert(ui.includes('// SLIM_GROUP_SALESBOTS_ONLY_V1'));});`,
  ],
  [
    `test('failed list does not appear as zero agents',()=>{assert(ui.includes("tab==='agentes'&&(agentsQ.isError?"));assert(ui.includes('Tentar novamente'));});`,
    `test('retired group agents are not queried by the mounted Central',()=>{const mounted=ui.split('export function CentralDeGrupos()')[1].split('/* ---------- helpers ---------- */')[0];assert(!mounted.includes('agentsQ'));assert(!mounted.includes('listAgentsFn'));assert(mounted.includes('<BotsGrupoTab'));});`,
  ],
];
for (const [from, to] of replacements) {
  if (testCode.includes(to)) continue;
  if (testCode.split(from).length !== 2) throw new Error('[Group SalesBots] Previous product gate changed.');
  testCode = testCode.replace(from, () => to);
}
if (before !== after) fs.writeFileSync(file, after);
fs.writeFileSync(legacyTest, testCode);
console.log('[Group SalesBots] IA group entry points removed; SalesBots, rules and triggers retained. No production data changed.');
